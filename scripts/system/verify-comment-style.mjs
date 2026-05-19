#!/usr/bin/env node
// verify-comment-style.mjs - enforce comment-style rules from docs/COMMENT-STYLE.md.
//
// Three gates:
//   1. Top-of-file `/** ... */` docblocks > 12 lines (header bloat)
//   2. AI-slop adjectives inside comments (marketing leak)
//   3. "Pre-fix" / "Post-fix" historical framing in comments
//
// String literals + JSX/template content + UI text are exempt -- the
// verifier only inspects comment context (whole-line // + multi-line
// /* */ + JSDoc * continuation + trailing //).
//
// Scope: .ts / .tsx / .svelte / .mjs / .js / .cjs across scripts/,
// ui/src/, ui/electron/src/, root-level configs.
//
// Exit codes:
//   0 = clean
//   1 = at least one offender
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ── Tunables ──────────────────────────────────────────────────────

export const HEADER_MAX_LINES = 12;

// LLM-prose tells (case-insensitive, whole-word). Each is bare-minimum
// pattern; the verifier walks comment lines and tests `\bword\b` /i.
export const SLOP_ADJECTIVES = [
  'comprehensive',
  'robust',
  'elegant',
  'seamless',
  'leverage',
  'leverages',
  'leveraging',
  'powerful',
  'cutting-edge',
  'state-of-the-art',
  'world-class',
  'next-generation',
  'delightful',
  'lightning-fast',
];

// Historical framing prose. Bare substring match (case-insensitive).
export const HISTORICAL_FRAMING = ['pre-fix', 'post-fix', 'pre-fix bug', 'historical context'];

// ── Scope ─────────────────────────────────────────────────────────

const SCAN_RX = [
  /^scripts\/.*\.(mjs|js|cjs|ts)$/,
  /^ui\/src\/.*\.(ts|tsx|svelte|mjs|js|cjs)$/,
  /^ui\/electron\/src\/.*\.(ts|js|mjs|cjs)$/,
  /^ui\/(vite|svelte|vitest)\.config\.(ts|mjs)$/,
];

const SKIP = new Set([
  // Self -- contains the strings it bans
  'scripts/system/verify-comment-style.mjs',
  'scripts/system/verify-comment-style.test.mjs',
]);

// ── Scanners (exported for tests) ─────────────────────────────────

/** Report header bloat: open `/**` at line 1, closing `*\/` after
 *  HEADER_MAX_LINES. Returns [] or [{line:1, lines:N}]. */
export function findHeaderBloat(body) {
  const lines = body.split('\n');
  if (lines.length === 0) return [];
  if (!/^\/\*+/.test(lines[0])) return [];
  // Scan for closing */
  for (let i = 0; i < lines.length; i++) {
    if (/\*\//.test(lines[i])) {
      const headerLines = i + 1;
      if (headerLines > HEADER_MAX_LINES) {
        return [{ line: 1, count: headerLines, max: HEADER_MAX_LINES }];
      }
      return [];
    }
  }
  return []; // unterminated -- not our problem
}

/** Scan ALL comment lines for AI-slop adjectives + historical
 *  framing prose. Returns array of `{line, kind, match, text}`. */
export function findCommentSlop(body) {
  const lines = body.split('\n');
  const offenders = [];
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const opens = (line.match(/\/\*/g) || []).length;
    const closes = (line.match(/\*\//g) || []).length;

    const isPureComment =
      /^\s*\/\//.test(line) || /^\s*\*(?:\s|$|\/)/.test(line) || /^\s*\/\*+/.test(line);

    let commentText = null;
    if (inBlock || isPureComment) {
      commentText = line;
    } else if (line.includes('//')) {
      const m = line.match(/^(.*?)(\s+\/\/(?!\/).*)$/);
      if (m) {
        const before = m[1];
        const isUrl = before.length > 0 && before[before.length - 1] === ':';
        const stripped = before.replace(/\\./g, '');
        const insideString =
          (stripped.match(/"/g) || []).length % 2 === 1 ||
          (stripped.match(/'/g) || []).length % 2 === 1 ||
          (stripped.match(/`/g) || []).length % 2 === 1;
        if (!isUrl && !insideString) commentText = m[2];
      }
    }

    if (commentText) {
      // Backtick-quoted runs are citations -- "the literal word
      // `leverage`" should not flag `leverage` itself. Strip them
      // before checking.
      const stripped = commentText.replace(/`[^`]*`/g, ' ');
      const lower = stripped.toLowerCase();
      for (const word of SLOP_ADJECTIVES) {
        const rx = new RegExp(`\\b${word.replace(/[-]/g, '\\-')}\\b`, 'i');
        if (rx.test(stripped)) {
          offenders.push({
            line: i + 1,
            kind: 'slop-adjective',
            match: word,
            text: commentText.trim(),
          });
        }
      }
      for (const phrase of HISTORICAL_FRAMING) {
        if (lower.includes(phrase)) {
          offenders.push({
            line: i + 1,
            kind: 'historical-framing',
            match: phrase,
            text: commentText.trim(),
          });
        }
      }
    }

    if (opens > closes) inBlock = true;
    if (closes >= opens && inBlock && closes > 0) inBlock = false;
  }
  return offenders;
}

// ── Entrypoint ────────────────────────────────────────────────────

function listTrackedFiles() {
  return execSync('git ls-files -z', { cwd: ROOT, encoding: 'buffer' })
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
}

function shouldScan(rel) {
  if (SKIP.has(rel)) return false;
  return SCAN_RX.some((re) => re.test(rel));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tracked = listTrackedFiles();
  const targets = tracked.filter(shouldScan);

  let total = 0;
  const reports = [];
  for (const rel of targets) {
    let body;
    try {
      body = readFileSync(join(ROOT, rel), 'utf8');
    } catch {
      continue;
    }
    const offenders = [...findHeaderBloat(body), ...findCommentSlop(body)];
    if (offenders.length) {
      total += offenders.length;
      reports.push({ rel, offenders });
    }
  }

  if (total === 0) {
    console.log(`OK verify-comment-style - ${targets.length} file(s) scanned, 0 offenders.`);
    process.exit(0);
  }

  console.error('');
  console.error(`FAIL verify-comment-style - ${total} offense(s) in ${reports.length} file(s):`);
  console.error('');
  for (const { rel, offenders } of reports.slice(0, 30)) {
    for (const o of offenders.slice(0, 3)) {
      const tag =
        o.kind === undefined
          ? `[header-bloat ${o.count}/${o.max} lines]`
          : `[${o.kind}: "${o.match}"]`;
      const txt = o.text ? '  ' + o.text.slice(0, 80) : '';
      console.error(`  ${rel}:${o.line}  ${tag}${txt}`);
    }
    if (offenders.length > 3) console.error(`    ... and ${offenders.length - 3} more`);
  }
  if (reports.length > 30) console.error(`  ... and ${reports.length - 30} more file(s)`);
  console.error('');
  console.error('See docs/COMMENT-STYLE.md for the rules + good/bad examples.');
  process.exit(1);
}
