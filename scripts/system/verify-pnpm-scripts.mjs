#!/usr/bin/env node
// verify-pnpm-scripts.mjs -- enforce that every `pnpm <name>` reference
// in workflows / docs / shell scripts resolves to a real script in the
// relevant package.json::scripts block.
//
// Catches:
//   1. Renamed scripts that left stale references behind (e.g. someone
//      renamed `validate:json-schemas` -> `validate:schemas` but didn't
//      update the workflow that calls it)
//   2. Typos in workflow `run:` blocks (`pnpm test:cverage` instead of
//      `pnpm test:coverage`)
//   3. Scripts that were never added (someone documented `pnpm new-thing`
//      in README before the package.json entry landed)
//
// Scope:
//   - .github/workflows/*.yml  (only inside `run:` blocks)
//   - **/*.md, **/*.mdx       (only inside code fences + inline backticks)
//   - **/*.sh, **/*.bash       (only as command lines)
//   - lefthook.yml             (only inside `run:` blocks)
//   - turbo.json               (not relevant; pnpm references would be in
//                               value strings, but turbo invokes pnpm
//                               internally, not via run: lines)
//
// Three pnpm invocation shapes are recognised:
//   - `pnpm <script>`                  -> root package.json
//   - `pnpm --filter <pkg> <script>`   -> workspace package.json
//   - `pnpm -C <dir> <script>`         -> workspace at <dir>'s package.json
//   - `pnpm --filter=<pkg> <script>`   -> same as --filter <pkg>
//
// Detection strategy:
//   - We ONLY match `pnpm` in command contexts (code fences in MD,
//     inline backticks ``...``, `run:` YAML scalars, shell-script
//     lines). Prose mentions like "pnpm workspace + turborepo" or
//     "pnpm 11.1.0" are skipped.
//   - The lookahead `pnpm(?![\w-])` rules out `pnpm-store-...` cache
//     keys, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, etc.
//
// Exit codes:
//   0 = clean
//   1 = at least one offender
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ── Tunables ──────────────────────────────────────────────────────

// pnpm built-in subcommands as of pnpm 11 (May 2026). Anything matching
// here after `pnpm ` is a built-in, not a script reference.
export const PNPM_BUILTINS = new Set([
  'add',
  'audit',
  'bin',
  'completion',
  'config',
  'create',
  'dedupe',
  'deploy',
  'dlx',
  'doctor',
  'env',
  'exec',
  'fetch',
  'find-hash',
  'help',
  'import',
  'init',
  'install',
  'install-test',
  'licenses',
  'link',
  'list',
  'ls',
  'outdated',
  'pack',
  'patch',
  'patch-commit',
  'patch-remove',
  'prune',
  'publish',
  'rebuild',
  'recursive',
  'remove',
  'root',
  'run',
  'self-update',
  'server',
  'setup',
  'start',
  'store',
  'test', // built-in alias for `npm test` -- pnpm runs `test` from scripts. Skip.
  'unlink',
  'update',
  'why',
]);

// Pnpm flags that may appear before the script name.
export const PNPM_FLAGS = [
  '--silent',
  '--frozen-lockfile',
  '--ignore-workspace-root-check',
  '--prefer-offline',
  '--recursive',
  '-r',
  '--workspace-root',
  '-w',
];

// ── Workspace map loader ──────────────────────────────────────────

export function loadWorkspaceMap() {
  const map = new Map();
  const rootPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  map.set(null, rootPkg.scripts ?? {});
  try {
    const uiPkg = JSON.parse(readFileSync(join(ROOT, 'ui', 'package.json'), 'utf8'));
    map.set('ui', uiPkg.scripts ?? {});
    if (uiPkg.name) map.set(uiPkg.name, uiPkg.scripts ?? {});
  } catch {
    /* workspace not present */
  }
  try {
    const electronPkg = JSON.parse(
      readFileSync(join(ROOT, 'ui', 'electron', 'package.json'), 'utf8'),
    );
    map.set('ui/electron', electronPkg.scripts ?? {});
    if (electronPkg.name) map.set(electronPkg.name, electronPkg.scripts ?? {});
  } catch {
    /* workspace not present */
  }
  return map;
}

// ── Extractors ────────────────────────────────────────────────────

const SKIP_PATHS = new Set([
  'scripts/system/verify-pnpm-scripts.mjs',
  'scripts/system/verify-pnpm-scripts.test.mjs',
  'CHANGELOG.md',
  'pnpm-lock.yaml',
]);

// Parse one pnpm command tail into { workspace, script } or null.
// `tail` is the substring AFTER the literal `pnpm ` token, with leading
// whitespace already trimmed. Returns null if the line isn't a script
// invocation (e.g. it's `install`, `exec`, or has no script token).
export function parseCommandTail(tail) {
  // Strip enclosing quotes / backticks if the caller didn't already.
  const tokens = tail.trim().replace(/[`'"]/g, '').split(/\s+/).filter(Boolean);
  let workspace = null;
  let idx = 0;
  while (idx < tokens.length) {
    const tok = tokens[idx];
    if (tok === '--filter' && idx + 1 < tokens.length) {
      workspace = tokens[idx + 1];
      idx += 2;
      continue;
    }
    if (tok.startsWith('--filter=')) {
      workspace = tok.slice('--filter='.length);
      idx += 1;
      continue;
    }
    if (tok === '-C' && idx + 1 < tokens.length) {
      workspace = tokens[idx + 1];
      idx += 2;
      continue;
    }
    if (PNPM_FLAGS.includes(tok)) {
      idx += 1;
      continue;
    }
    // Any other leading `-` token = unrecognised flag; stop scanning.
    if (tok.startsWith('-')) {
      idx += 1;
      continue;
    }
    break;
  }
  if (idx >= tokens.length) return null;
  // Strip trailing prose punctuation so `brand:apply.` -> `brand:apply`
  // (the period belonged to the sentence, not the script name).
  let script = tokens[idx].replace(/[.,;:!?)\]'"`]+$/, '');
  // Built-ins are not script references.
  if (PNPM_BUILTINS.has(script)) return null;
  // Script name must look like a real identifier:
  //   - Start with a letter (rules out "11", ".mjs", "_internal" etc)
  //   - End with a letter or digit (rules out trailing dot/dash)
  //   - Middle may contain letters/digits/colon/underscore/hyphen/dot
  //   - At least 2 chars
  if (!/^[a-z][a-z0-9:_.-]*[a-z0-9]$/i.test(script) || script.length < 2) return null;
  return { workspace, script };
}

// Scan one file body, returning [{ line, raw, workspace, script }]. Uses
// per-filetype command-context detection so prose mentions of "pnpm"
// don't generate false positives.
export function extractReferences(filePath, body) {
  const isMd = /\.(md|mdx)$/i.test(filePath);
  const isYml = /(\.yml|\.yaml)$/i.test(filePath) || /lefthook\.yml$/.test(filePath);
  const isShell = /\.(sh|bash)$/i.test(filePath);

  const refs = [];
  const lines = body.split('\n');

  if (isMd) {
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      // Inside fence -- scan for pnpm-as-command anywhere on the line.
      if (inFence) {
        collectInLine(line, i + 1, refs);
        continue;
      }
      // Outside fence -- only scan inline backtick regions.
      const matches = line.matchAll(/`([^`]+)`/g);
      for (const m of matches) {
        collectInLine(m[1], i + 1, refs);
      }
    }
  } else if (isYml) {
    // Two-pass YAML scan:
    //   Pass 1: js-yaml parse to walk jobs.<job>.steps[] and, for each
    //           step with a `run:` block, scan the run text under the
    //           step's `working-directory:` context (so `pnpm size`
    //           in a `working-directory: ui` step is resolved against
    //           the ui workspace, not root).
    //   Pass 2: line-by-line scan of inline backticks ``...`` outside
    //           run blocks (catches stale references in workflow
    //           header comments and value strings).
    let parsed;
    try {
      parsed = yaml.load(body);
    } catch {
      parsed = null;
    }
    const runStepLines = new Set(); // line numbers covered by pass 1
    if (parsed && typeof parsed === 'object' && parsed.jobs) {
      // Walk every job's steps[]. For each step with `run:`, find the
      // text's line number(s) in the source (so we report file:line
      // accurately) and scan the run text under the workspace context.
      const lines2 = lines; // alias
      for (const job of Object.values(parsed.jobs)) {
        if (!job || typeof job !== 'object' || !Array.isArray(job.steps)) continue;
        for (const step of job.steps) {
          if (!step || typeof step.run !== 'string') continue;
          const workspace = resolveWorkspaceFromPath(step['working-directory']);
          // Find the source line(s) where this step's run appears.
          // We don't need exact alignment -- just enough context to
          // report a useful line number. Use the first non-trivial
          // run-text line as the anchor.
          const anchor = step.run.split('\n').find((l) => l.trim().length > 0) ?? '';
          let anchorLine = 0;
          if (anchor) {
            for (let i = 0; i < lines2.length; i++) {
              if (lines2[i].includes(anchor.trim().slice(0, 40))) {
                anchorLine = i + 1;
                break;
              }
            }
          }
          // Scan every non-empty line of the run text with workspace context.
          const runLines = step.run.split('\n');
          for (let j = 0; j < runLines.length; j++) {
            collectInLine(runLines[j], anchorLine + j, refs, workspace);
          }
          // Mark the anchor neighbourhood as covered so pass 2 doesn't
          // re-scan inline backticks inside the run block.
          if (anchorLine > 0) {
            for (let k = anchorLine - 2; k < anchorLine + runLines.length + 1; k++) {
              runStepLines.add(k);
            }
          }
        }
      }
    }
    // Pass 2: inline backticks in non-run-block context.
    for (let i = 0; i < lines.length; i++) {
      if (runStepLines.has(i + 1)) continue;
      const matches = lines[i].matchAll(/`([^`]+)`/g);
      for (const m of matches) {
        collectInLine(m[1], i + 1, refs);
      }
    }
  } else if (isShell) {
    for (let i = 0; i < lines.length; i++) {
      collectInLine(lines[i], i + 1, refs);
    }
  } else {
    // turbo.json -- scan strings only (JSON values). Same as MD inline backticks
    // would scan, but JSON has no backticks; instead look for "pnpm X" inside
    // any double-quoted string.
    for (let i = 0; i < lines.length; i++) {
      const matches = lines[i].matchAll(/"([^"]+)"/g);
      for (const m of matches) {
        collectInLine(m[1], i + 1, refs);
      }
    }
  }
  return refs;
}

// Map a workflow step's `working-directory: <path>` value to the
// workspace key our scripts map uses (null = root, "ui" = ui workspace,
// "ui/electron" = electron workspace). Anything else returns null and
// the reference is resolved as root.
export function resolveWorkspaceFromPath(workingDir) {
  if (!workingDir) return null;
  const dir = String(workingDir).replace(/^\.\//, '').replace(/\/$/, '');
  if (dir === 'ui') return 'ui';
  if (dir === 'ui/electron') return 'ui/electron';
  return null;
}

// Collect pnpm references in one already-extracted command-context substring.
// Lines that are shell-style comments (start with `#` after optional
// whitespace) are skipped -- prose discussing `pnpm whatever` in a
// `# ...` comment isn't an invocation we can validate.
// `contextWorkspace`, if non-null, is used as the default workspace
// for bare `pnpm <name>` references (no explicit --filter / -C). This
// is how `working-directory: ui` + `pnpm size` resolves to ui/size.
function collectInLine(text, lineNum, refs, contextWorkspace = null) {
  if (/^\s*#/.test(text)) return;
  const rx = /(?:^|[^a-zA-Z0-9_-])pnpm(?![\w-])\s+([^\n]+)/g;
  let m;
  while ((m = rx.exec(text)) !== null) {
    const tail = m[1];
    const parsed = parseCommandTail(tail);
    if (!parsed) continue;
    refs.push({
      line: lineNum,
      raw: tail.trim().slice(0, 80),
      // Explicit --filter / -C wins over the step's working-directory.
      workspace: parsed.workspace !== null ? parsed.workspace : contextWorkspace,
      script: parsed.script,
    });
  }
}

export function resolveReference(ref, workspaceMap) {
  if (ref.workspace !== null && ref.workspace !== undefined) {
    const scripts = workspaceMap.get(ref.workspace);
    if (!scripts) {
      return {
        ok: false,
        reason: `unknown workspace target \`${ref.workspace}\` (no matching --filter / -C path)`,
      };
    }
    if (!(ref.script in scripts)) {
      return {
        ok: false,
        reason: `workspace \`${ref.workspace}\` has no script \`${ref.script}\``,
      };
    }
    return { ok: true };
  }
  const rootScripts = workspaceMap.get(null);
  if (!(ref.script in rootScripts)) {
    return {
      ok: false,
      reason: `root package.json has no script \`${ref.script}\``,
    };
  }
  return { ok: true };
}

// ── File walker ────────────────────────────────────────────────────

function listFiles() {
  const all = new Set();
  const candidates = [
    '.github/workflows/*.yml',
    '*.md',
    '**/*.md',
    '*.mdx',
    '**/*.mdx',
    '*.sh',
    '**/*.sh',
    '*.bash',
    '**/*.bash',
    'lefthook.yml',
    'turbo.json',
  ];
  for (const pattern of candidates) {
    try {
      const out = execSync(`git ls-files -- '${pattern}'`, { cwd: ROOT, encoding: 'utf8' });
      for (const line of out.split('\n')) if (line) all.add(line);
    } catch {
      /* git ls-files exits non-zero if no match -- ignore */
    }
  }
  return [...all].filter((p) => !SKIP_PATHS.has(p)).sort();
}

// ── CLI entrypoint ─────────────────────────────────────────────────

function main() {
  const workspaceMap = loadWorkspaceMap();
  const files = listFiles();
  let totalOffenders = 0;
  const fileFails = [];
  for (const relPath of files) {
    const body = readFileSync(join(ROOT, relPath), 'utf8');
    const refs = extractReferences(relPath, body);
    const offenders = [];
    for (const ref of refs) {
      const r = resolveReference(ref, workspaceMap);
      if (!r.ok) offenders.push({ ref, reason: r.reason });
    }
    if (offenders.length > 0) {
      fileFails.push({ file: relPath, offenders });
      totalOffenders += offenders.length;
    }
  }
  if (totalOffenders === 0) {
    console.log(
      `OK verify-pnpm-scripts - ${files.length} file(s) scanned, 0 invalid pnpm references.`,
    );
    process.exit(0);
  }
  console.error(
    `FAIL verify-pnpm-scripts - ${totalOffenders} invalid reference(s) across ${fileFails.length} file(s):`,
  );
  console.error('');
  for (const { file, offenders } of fileFails) {
    console.error(`  ${file}:`);
    for (const o of offenders) {
      console.error(`    line ${o.ref.line}: \`pnpm ${o.ref.raw}\``);
      console.error(`      ${o.reason}`);
    }
    console.error('');
  }
  console.error(`Add the missing script to the correct package.json, fix the typo,`);
  console.error(`or remove the stale reference.`);
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
