#!/usr/bin/env node
/**
 * verify-no-personal-identity.mjs -- block a personal email / legal name
 * from landing in a commit's author, committer, or sign-off identity.
 *
 * Why this exists: a personal email leaked into `Signed-off-by:` trailers
 * via `git commit -s` (local user.email was the personal address). A prior
 * history scrub regressed because nothing STRUCTURALLY stopped the next
 * commit from re-introducing it. This is that structural gate.
 *
 * Denylist privacy: the denied identities are stored as SHA-256 HASHES,
 * never plaintext -- otherwise scrubbing the email from history while
 * hardcoding it here would re-leak it into a tracked file on a public
 * repo. Detection extracts candidate email / sign-off-name tokens from a
 * commit and compares their hashes against the denylist. Failure output
 * is MASKED for the same reason (no PII echoed into CI logs).
 *
 * Modes:
 *   --identity         pre-commit: hash the author + committer ident
 *                      (`git var GIT_{AUTHOR,COMMITTER}_IDENT`).
 *   --message <path>   commit-msg: scan the message body -- a denied email
 *                      anywhere, OR a denied name inside a Signed-off-by /
 *                      Co-authored-by trailer.
 *   --audit [<range>]  scan author/committer/message across a commit range
 *                      (default HEAD; pass `origin/main..HEAD`, `--all`,
 *                      etc.). Used by CI over the PR range + final sweeps.
 *
 * Exit codes: 0 clean, 1 denied identity found, 2 usage / git error.
 *
 * Fixtures: scripts/system/verify-no-personal-identity.test.mjs.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { error } from '../lib/logger.mjs';

/**
 * SHA-256 of the normalized denied identities (personal email, work
 * email, full legal name). Plaintext is deliberately absent. Regenerate
 * a hash with:
 *   node -e 'console.log(require("crypto").createHash("sha256").update(process.argv[1].trim().toLowerCase()).digest("hex"))' "<value>"
 */
export const DENIED_HASHES = new Set([
  '73ccb697a440b2fc652f632841c8510ea5b88c3d9d48fee212c2643878187fdf', // personal email
  '02c00fc42b75389ac67765f53e0c9a7718f73451b5f3bf48fb6379ebb169ce02', // work email
  '59ef678d6a70dd82798530fc4282c3e402b215fc464067bdad7b30be486d0753', // full legal name
]);

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const TRAILER_RE = /^\s*(?:Signed-off-by|Co-authored-by)\s*:\s*(.+?)\s*<([^>]+)>\s*$/i;
const IDENT_RE = /^(.*) <([^>]*)> \d+ [-+]\d{4}$/;

export function normalizeToken(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase();
}

export function hashToken(s) {
  return createHash('sha256').update(normalizeToken(s)).digest('hex');
}

export function isDeniedToken(token, denied = DENIED_HASHES) {
  if (!token) return false;
  return denied.has(hashToken(token));
}

/** Mask a token so failures never echo the real PII into a CI log. */
function maskToken(v) {
  const s = String(v ?? '');
  if (!s) return '(empty)';
  return s.includes('@') ? `${s[0]}***@***` : `${s[0]}***`;
}

/** Every email-like substring in `text`. */
export function extractEmails(text) {
  return String(text ?? '').match(EMAIL_RE) ?? [];
}

/** `{ name, email }` for each Signed-off-by / Co-authored-by trailer line. */
export function extractTrailerIdentities(text) {
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    const m = line.match(TRAILER_RE);
    if (m) out.push({ name: m[1].trim(), email: m[2].trim() });
  }
  return out;
}

/** Check a single name + email pair. Returns [{ field, hint }]. */
export function scanIdentity(name, email, denied = DENIED_HASHES) {
  const hits = [];
  if (isDeniedToken(email, denied)) hits.push({ field: 'email', hint: maskToken(email) });
  if (isDeniedToken(name, denied)) hits.push({ field: 'name', hint: maskToken(name) });
  return hits;
}

/**
 * Scan a commit message: a denied email ANYWHERE, plus a denied name
 * inside a sign-off / co-author trailer (names are not checked in free
 * prose, to avoid false positives).
 */
export function scanMessage(message, denied = DENIED_HASHES) {
  const hits = [];
  for (const email of extractEmails(message)) {
    if (isDeniedToken(email, denied)) hits.push({ field: 'message-email', hint: maskToken(email) });
  }
  for (const { name } of extractTrailerIdentities(message)) {
    if (isDeniedToken(name, denied)) hits.push({ field: 'signoff-name', hint: maskToken(name) });
  }
  return hits;
}

/** Combine author + committer identity checks with a message scan. */
export function scanCommit(commit, denied = DENIED_HASHES) {
  const hits = [];
  for (const h of scanIdentity(commit.authorName, commit.authorEmail, denied)) {
    hits.push({ field: `author-${h.field}`, hint: h.hint });
  }
  for (const h of scanIdentity(commit.committerName, commit.committerEmail, denied)) {
    hits.push({ field: `committer-${h.field}`, hint: h.hint });
  }
  hits.push(...scanMessage(commit.message, denied));
  return hits;
}

function gitIdent(which) {
  try {
    const raw = execFileSync('git', ['var', which], { encoding: 'utf8' }).trim();
    const m = raw.match(IDENT_RE);
    return m ? { name: m[1], email: m[2] } : { name: '', email: '' };
  } catch {
    return { name: '', email: '' };
  }
}

function fail(header, hits) {
  error(header);
  console.error('');
  for (const h of hits) console.error(`  ${h.field}: ${h.hint}`);
  console.error('');
  console.error('A blocked personal email / legal name is in this commit identity.');
  console.error('Fix it (it must never reach a public repo):');
  console.error(
    '  • author/committer:  git config user.email 41795364+kaelys-js@users.noreply.github.com',
  );
  console.error('  • sign-off trailer:  amend the commit so -s uses that identity');
  console.error('Hard override (use only if you are certain): git commit --no-verify');
  return 1;
}

function runIdentity() {
  const author = gitIdent('GIT_AUTHOR_IDENT');
  const committer = gitIdent('GIT_COMMITTER_IDENT');
  const hits = [];
  for (const h of scanIdentity(author.name, author.email))
    hits.push({ field: `author-${h.field}`, hint: h.hint });
  for (const h of scanIdentity(committer.name, committer.email))
    hits.push({ field: `committer-${h.field}`, hint: h.hint });
  if (hits.length === 0) return 0;
  return fail('Blocked personal identity in author/committer.', hits);
}

function runMessage(path) {
  if (!existsSync(path)) {
    error(`verify-no-personal-identity: message file not found: ${path}`);
    return 2;
  }
  const hits = scanMessage(readFileSync(path, 'utf8'));
  if (hits.length === 0) return 0;
  return fail('Blocked personal identity in commit message.', hits);
}

function runAudit(range) {
  let raw;
  try {
    raw = execFileSync('git', ['log', range, '--format=%H%x00%an%x00%ae%x00%cn%x00%ce%x00%B%x1e'], {
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024,
    });
  } catch (e) {
    error(`verify-no-personal-identity: git log ${range} failed: ${e.message}`);
    return 2;
  }
  const offenders = [];
  for (const record of raw.split('\x1e')) {
    const rec = record.replace(/^\n/, '');
    if (!rec.trim()) continue;
    const [sha, authorName, authorEmail, committerName, committerEmail, message = ''] =
      rec.split('\x00');
    const hits = scanCommit({
      sha,
      authorName,
      authorEmail,
      committerName,
      committerEmail,
      message,
    });
    if (hits.length) offenders.push({ sha, hits });
  }
  if (offenders.length === 0) {
    console.log(`✓ no personal identity in ${range}`);
    return 0;
  }
  error(`Blocked personal identity in ${offenders.length} commit(s) of ${range}.`);
  for (const o of offenders) {
    console.error(
      `  ${o.sha.slice(0, 12)}: ${o.hits.map((h) => `${h.field}=${h.hint}`).join(', ')}`,
    );
  }
  return 1;
}

function usage() {
  console.error('Usage:');
  console.error('  verify-no-personal-identity.mjs --identity');
  console.error('  verify-no-personal-identity.mjs --message <path>');
  console.error('  verify-no-personal-identity.mjs --audit [<range>]');
  return 2;
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--identity') return runIdentity();
  if (args[0] === '--message' && args[1]) return runMessage(args[1]);
  if (args[0] === '--audit') return runAudit(args[1] || 'HEAD');
  return usage();
}

// Run main() only when executed directly (not when imported by the test).
// Compare REALPATHs so symlinked /tmp + relative argv paths round-trip.
const scriptPath = realpathSync(fileURLToPath(import.meta.url));
const argvPath = process.argv[1] ? realpathSync(process.argv[1]) : '';
if (scriptPath === argvPath) {
  process.exit(main());
}
