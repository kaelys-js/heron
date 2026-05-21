#!/usr/bin/env node
// verify-csp-hashes.mjs -- assert that every inline <script> block in
// `ui/src/app.html` has its sha256+base64 hash present in the
// `script-src` directive of `ui/svelte.config.ts`'s CSP config.
//
// Why this exists:
//   SvelteKit's `csp: { mode: 'auto' }` hashes only the scripts SvelteKit
//   ITSELF injects via <svelte:head>. Custom inline scripts in app.html
//   (theme bootstrap, speculationrules, blank-screen guard) are NOT
//   auto-hashed -- the maintainer maintains those hashes by hand. The
//   recipe is documented in svelte.config.ts:
//
//     python3 -c "import hashlib,base64;
//       html=open('ui/src/app.html').read();
//       import re;
//       [print('sha256-'+base64.b64encode(hashlib.sha256(m.group(1).encode()).digest()).decode())
//        for m in re.finditer(r'<script[^>]*>(.*?)</script>', html, re.S)]"
//
//   If you edit one of the inline scripts and forget to bump the
//   corresponding hash, CSP silently blocks the script. The failure
//   surfaces as a console error + a Lighthouse `errors-in-console`
//   audit fail, not as a CI failure. This verifier closes that gap.
//
// Algorithm:
//   1. Read ui/src/app.html. Extract every <script ...>...</script>
//      block's body (with the JavaScript inside, exactly as the
//      browser would compute the CSP hash from).
//   2. For each body, compute sha256, base64-encode, format as
//      `sha256-<b64>`.
//   3. Read ui/svelte.config.ts. Parse the script-src array.
//   4. Assert each computed hash appears in script-src.
//
// Exit codes:
//   0 = clean (every inline script has a matching hash)
//   1 = at least one drift (missing or unused hash)
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP_HTML = join(ROOT, 'ui', 'src', 'app.html');
const SVELTE_CONFIG = join(ROOT, 'ui', 'svelte.config.ts');

// ── Extractors (exported for tests) ───────────────────────────────

/** Extract every <script>...</script> body from app.html. Returns
 *  [{ body, line }] where line is the 1-indexed source line of the
 *  opening <script> tag. Tags with src= attributes (external scripts)
 *  are skipped -- they don't need a CSP hash. */
export function extractInlineScripts(htmlBody) {
  const scripts = [];
  const rx = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = rx.exec(htmlBody)) !== null) {
    const attrs = m[1] ?? '';
    const body = m[2] ?? '';
    // Skip external scripts (have src=...).
    if (/\bsrc\s*=/.test(attrs)) continue;
    // Compute 1-indexed line where the <script> tag opened.
    const upTo = htmlBody.slice(0, m.index);
    const line = upTo.split('\n').length;
    scripts.push({ body, line, attrs: attrs.trim() });
  }
  return scripts;
}

/** Compute the SHA-256 hash in CSP-compatible `sha256-<b64>` format. */
export function computeHash(body) {
  const hash = createHash('sha256').update(body, 'utf8').digest('base64');
  return `sha256-${hash}`;
}

/** Extract the script-src array from svelte.config.ts. We use a regex
 *  over the source text instead of evaluating the TypeScript -- the
 *  config has imports + tree-shake metadata that make `tsc --noEmit`
 *  overkill for one array read. */
export function extractScriptSrcHashes(configBody) {
  // Match the script-src array up to its closing bracket.
  const m = /['"]script-src['"]\s*:\s*\[([^\]]+)\]/.exec(configBody);
  if (!m) {
    throw new Error(
      "Couldn't locate `'script-src': [...]` array in svelte.config.ts. " +
        'Has the config structure changed?',
    );
  }
  const arrayBody = m[1];
  // Pull every `'sha256-...'` or `"sha256-..."` entry.
  const hashes = [];
  const hashRx = /['"]sha256-[A-Za-z0-9+/=]+['"]/g;
  let h;
  while ((h = hashRx.exec(arrayBody)) !== null) {
    hashes.push(h[0].replace(/['"]/g, ''));
  }
  return hashes;
}

// ── CLI entrypoint ─────────────────────────────────────────────────

function main() {
  const html = readFileSync(APP_HTML, 'utf8');
  const config = readFileSync(SVELTE_CONFIG, 'utf8');

  const scripts = extractInlineScripts(html);
  const declared = extractScriptSrcHashes(config);
  const declaredSet = new Set(declared);

  const offenders = [];
  const computed = [];
  for (const s of scripts) {
    const hash = computeHash(s.body);
    computed.push({ hash, line: s.line });
    if (!declaredSet.has(hash)) {
      offenders.push({
        line: s.line,
        hash,
        bodyPreview: s.body.trim().split('\n')[0].slice(0, 60),
      });
    }
  }

  // Also report hashes declared but no longer present (dead hashes
  // that would expand CSP surface without protecting anything).
  const computedSet = new Set(computed.map((c) => c.hash));
  const unused = declared.filter((d) => !computedSet.has(d));

  if (offenders.length === 0 && unused.length === 0) {
    console.log(
      `OK verify-csp-hashes - ${scripts.length} inline script(s), ${declared.length} declared hash(es), 0 drift.`,
    );
    process.exit(0);
  }

  console.error(`FAIL verify-csp-hashes - drift between app.html + svelte.config.ts CSP.`);
  console.error('');
  if (offenders.length > 0) {
    console.error('Missing hashes (script in app.html with no matching CSP entry):');
    for (const o of offenders) {
      console.error(`  app.html:${o.line}: ${o.hash}`);
      console.error(`    body starts: ${o.bodyPreview}`);
    }
    console.error('');
  }
  if (unused.length > 0) {
    console.error('Unused hashes (declared in CSP but no matching app.html script):');
    for (const u of unused) console.error(`  ${u}`);
    console.error('');
  }
  console.error(`Update the 'script-src' array in ui/svelte.config.ts so it exactly`);
  console.error(`enumerates the hashes of the inline scripts in ui/src/app.html.`);
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
