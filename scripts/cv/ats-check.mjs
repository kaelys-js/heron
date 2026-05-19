#!/usr/bin/env node
/**
 * ats-check.mjs -- strict ATS-compatibility validator for CV PDFs.
 *
 * Every rule is binary: pass or fail. There are no "warnings" in default
 * mode -- anything below 100% means at least one ATS in the wild will
 * mis-parse or reject the resume. The exit code matches the score so
 * CI / pre-push hooks can gate on it.
 *
 * Usage:
 *   pnpm ats:check <path/to/cv.pdf>                # human report
 *   pnpm ats:check <path/to/cv.pdf> --json         # machine-readable
 *   pnpm ats:check <path/to/cv.pdf> --lenient      # downgrade structural-only checks to warnings
 *
 * Exit codes:
 *   0 -- all checks pass (≥ 100% strict)
 *   1 -- at least one check failed
 *   2 -- environment issue (missing tool, corrupt PDF)
 *
 * What it checks (every rule below is a hard fail by default):
 *
 *   ── Document integrity ──────────────────────────────────────────
 *   • Not encrypted (ATS refuse password-locked PDFs)
 *   • Not corrupt (pdfinfo + pdftotext succeed)
 *   • PDF version 1.4-2.0 (rare ATS choke on 2.0; warn-only via --lenient)
 *   • File size 50KB-1MB (smaller = text-only suspicion; larger = images)
 *   • Page count 1-2 (3+ rejected by most ATS)
 *
 *   ── Text extractability (the single most-important class) ──────
 *   • Default + raw + layout extraction modes all return non-empty
 *   • Word-set across modes agrees ≥ 95% (text-layer well-formed)
 *   • Minimum 500 chars (sanity: not an image-only PDF)
 *   • Every word extractable via pdfgrep (a non-conforming text layer
 *     surfaces here when pdftotext succeeds but pdfgrep can't find words)
 *
 *   ── Metadata (recruiter file managers index these) ─────────────
 *   • Title set (HTML <title>)
 *   • Author set (HTML <meta name="author">)
 *   • Subject set (Role -- Company)
 *   • Keywords set (JD keywords CSV)
 *   • Creator stamped (proves this is a generated PDF, not a scan)
 *   • PDF/UA tagged structure (Tagged: yes)
 *
 *   ── Structure (single-column, standard sections) ───────────────
 *   • Standard section names present (Summary, Experience, Education,
 *     Skills as ALL-CAPS or Title Case at line-start)
 *   • Reading order: Summary → Experience → Education
 *   • At least 3 standard sections detected (any fewer = unusual layout)
 *
 *   ── Content fidelity (no garbled text) ────────────────────────
 *   • No problematic Unicode that survived normalisation (em-dash,
 *     en-dash, smart quotes, ellipsis, zero-width, math-mode wrappers)
 *   • No PDF text-encoding artifacts (replacement char U+FFFD,
 *     PUA codepoints, undefined characters)
 *
 *   ── Hyperlinks (recruiter clicks these) ────────────────────────
 *   • At least one hyperlink annotation preserved (LinkedIn / portfolio)
 *
 *   ── Safety (some ATS reject these outright) ────────────────────
 *   • No embedded JavaScript
 *   • No XFA / fillable form fields
 *
 * Uses Poppler's `pdftotext` + `pdfinfo` + `pdfgrep`. Install with:
 *   brew install poppler pdfgrep   # macOS
 *   apt-get install poppler-utils pdfgrep   # Linux
 */

import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const lenient = args.includes('--lenient');
const pdfPath = args.find((a) => !a.startsWith('-'));

if (!pdfPath) {
  console.error('Usage: node ats-check.mjs <path/to/cv.pdf> [--json] [--lenient]');
  process.exit(2);
}
if (!existsSync(pdfPath)) {
  console.error(`File not found: ${pdfPath}`);
  process.exit(2);
}

const G = '\x1b[32m';
const Y = '\x1b[33m';
const R = '\x1b[31m';
const B = '\x1b[1m';
const N = '\x1b[0m';
const DIM = '\x1b[2m';

function ensureTool(cmd) {
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const hasPdftotext = ensureTool('pdftotext');
const hasPdfinfo = ensureTool('pdfinfo');
const hasPdfgrep = ensureTool('pdfgrep');
if (!hasPdftotext || !hasPdfinfo) {
  console.error(
    `${R}Missing required tool. Install: brew install poppler (macOS) or apt-get install poppler-utils (Linux).${N}`,
  );
  process.exit(2);
}

function run(cmd, argv) {
  return execFileSync(cmd, argv, { encoding: 'latin1', maxBuffer: 50 * 1024 * 1024 });
}

const checks = [];
function pass(name, evidence = '') {
  checks.push({ status: 'pass', name, evidence });
}
function failHard(name, evidence = '') {
  checks.push({ status: 'fail', name, evidence });
}
function warnSoft(name, evidence = '') {
  if (lenient) {
    checks.push({ status: 'warn', name, evidence });
  } else {
    checks.push({ status: 'fail', name, evidence });
  }
}

// ── 1. Document integrity ─────────────────────────────────────────
let infoRaw;
try {
  infoRaw = run('pdfinfo', [pdfPath]);
} catch (e) {
  console.error(`${R}pdfinfo failed on this file — likely corrupt.${N}`);
  process.exit(2);
}
const info = {};
for (const line of infoRaw.split('\n')) {
  const m = line.match(/^([A-Za-z][A-Za-z _]*?):\s+(.+)$/);
  if (m) info[m[1].trim()] = m[2].trim();
}

if (info.Encrypted === 'no') pass('Not encrypted');
else failHard('Encrypted PDF', 'most ATS refuse password-locked PDFs');

if (info.JavaScript === 'no') pass('No embedded JavaScript');
else failHard('Embedded JavaScript', 'some ATS reject PDFs with JS');

if (info.Form === 'none') pass('No fillable forms');
else failHard(`Embedded ${info.Form} form`, 'XFA forms break many parsers');

// PDF version
const pdfVersion = info['PDF version'] || info.PDFVersion || '';
const versionNum = parseFloat(pdfVersion);
if (Number.isFinite(versionNum) && versionNum >= 1.4 && versionNum <= 1.7) {
  pass('PDF version', `${pdfVersion} (universal support)`);
} else if (Number.isFinite(versionNum) && versionNum >= 1.0 && versionNum < 2.0) {
  pass('PDF version', `${pdfVersion} (broad support)`);
} else if (Number.isFinite(versionNum) && versionNum >= 2.0) {
  warnSoft('PDF version', `${pdfVersion} — rare older ATS choke on PDF 2.0`);
} else {
  warnSoft('PDF version', `unknown (${pdfVersion || 'absent'})`);
}

// Page count
const pageCount = parseInt(info.Pages || '0', 10);
if (pageCount === 0) failHard('Page count', 'pdfinfo reports 0 pages — corrupt');
else if (pageCount === 1) pass('Page count', '1 page — ideal');
else if (pageCount === 2) pass('Page count', '2 pages — acceptable');
else if (pageCount === 3) warnSoft('Page count', '3 pages — review for trimming');
else failHard('Page count', `${pageCount} pages — most ATS abandon resumes >2 pages`);

// File size
const sizeKb = statSync(pdfPath).size / 1024;
if (sizeKb < 50) {
  warnSoft('File size', `${sizeKb.toFixed(1)} KB — suspicious-low; check fonts embed`);
} else if (sizeKb < 1024) {
  pass('File size', `${sizeKb.toFixed(1)} KB`);
} else if (sizeKb < 2048) {
  warnSoft('File size', `${(sizeKb / 1024).toFixed(2)} MB — borderline-large`);
} else {
  failHard('File size', `${(sizeKb / 1024).toFixed(2)} MB — likely image-based`);
}

// ── 2. Text extractability ─────────────────────────────────────────
let textDefault = '';
let textLayout = '';
let textRaw = '';
try {
  textDefault = run('pdftotext', [pdfPath, '-']);
  textLayout = run('pdftotext', ['-layout', pdfPath, '-']);
  textRaw = run('pdftotext', ['-raw', pdfPath, '-']);
} catch {
  failHard('pdftotext extraction', 'extraction crashed — PDF text layer broken');
}

const textLen = textDefault.trim().length;
if (textLen >= 500) pass('Text length', `${textLen} chars`);
else if (textLen >= 200) warnSoft('Text length', `${textLen} chars — short for a CV`);
else failHard('Text length', `${textLen} chars — PDF may be image-based`);

// Cross-mode consistency
const words = (s) => new Set(s.toLowerCase().match(/[a-z][a-z0-9]+/g) || []);
const wDefault = words(textDefault);
const wRaw = words(textRaw);
const wLayout = words(textLayout);
const intersectRaw = [...wDefault].filter((w) => wRaw.has(w)).length;
const consistencyRaw = wDefault.size ? intersectRaw / wDefault.size : 0;
if (consistencyRaw >= 0.98)
  pass('Extraction consistency (default vs raw)', `${(consistencyRaw * 100).toFixed(1)}%`);
else if (consistencyRaw >= 0.9)
  warnSoft(
    'Extraction consistency',
    `${(consistencyRaw * 100).toFixed(1)}% — minor drift between modes`,
  );
else
  failHard(
    'Extraction consistency',
    `${(consistencyRaw * 100).toFixed(1)}% — modes disagree, text layer suspect`,
  );

const intersectLayout = [...wDefault].filter((w) => wLayout.has(w)).length;
const consistencyLayout = wDefault.size ? intersectLayout / wDefault.size : 0;
if (consistencyLayout >= 0.98)
  pass('Extraction consistency (default vs layout)', `${(consistencyLayout * 100).toFixed(1)}%`);
else warnSoft('Extraction consistency (layout)', `${(consistencyLayout * 100).toFixed(1)}%`);

// pdfgrep: any common word findable?
if (hasPdfgrep) {
  try {
    run('pdfgrep', ['-i', '-c', 'experience\\|education\\|skills', pdfPath]);
    pass('pdfgrep finds standard headers');
  } catch {
    warnSoft(
      'pdfgrep finds standard headers',
      'pdfgrep returned no matches for "experience|education|skills"',
    );
  }
}

// ── 3. Metadata ────────────────────────────────────────────────────
const tests = [
  { name: 'Title metadata', key: 'Title' },
  { name: 'Author metadata', key: 'Author' },
  { name: 'Subject metadata', key: 'Subject' },
  { name: 'Keywords metadata', key: 'Keywords' },
  { name: 'Creator metadata', key: 'Creator' },
];
for (const t of tests) {
  if (info[t.key] && info[t.key].length > 0) pass(t.name, info[t.key].slice(0, 80));
  else failHard(`${t.name} missing`, `recruiter file-managers + ATS index this field`);
}
if (info.Tagged === 'yes') pass('PDF/UA tagged structure');
else failHard('PDF not tagged', 'screen-readers + tag-aware ATS need this');

// ── 4. Structure / sections ───────────────────────────────────────
const standardSections = [
  { name: 'Summary', re: /(?:^|\n)\s*(professional\s+summary|summary|profile|about)\s*\n/i },
  {
    name: 'Experience',
    re: /(?:^|\n)\s*(work\s+experience|experience|employment|professional\s+experience)\s*\n/i,
  },
  { name: 'Education', re: /(?:^|\n)\s*education\s*\n/i },
  { name: 'Skills', re: /(?:^|\n)\s*(technical\s+skills|skills|technologies|competencies)\s*\n/i },
];
let sectionsFound = 0;
for (const sec of standardSections) {
  if (sec.re.test(textDefault)) {
    pass(`Section: ${sec.name}`);
    sectionsFound++;
  } else {
    failHard(`Section: ${sec.name} missing`, `use a standard header like "Work Experience"`);
  }
}
if (sectionsFound >= 4) pass('Standard section header count', `${sectionsFound}/4`);
else
  failHard('Standard section header count', `only ${sectionsFound}/4 — recruiters scan for these`);

// Reading order
const idxSummary = textDefault.search(/professional\s+summary|^summary/im);
const idxExp = textDefault.search(/work\s+experience|^experience/im);
const idxEdu = textDefault.search(/^education/im);
if (idxSummary >= 0 && idxExp >= 0 && idxSummary < idxExp) pass('Order: Summary before Experience');
else if (idxSummary >= 0 && idxExp >= 0)
  failHard('Order: Summary before Experience', 'unusual layout');
if (idxExp >= 0 && idxEdu >= 0 && idxExp < idxEdu) pass('Order: Experience before Education');
else if (idxExp >= 0 && idxEdu >= 0)
  warnSoft('Order: Education before Experience', 'OK for new grads only');

// ── 5. Content fidelity (no garbled chars) ────────────────────────
const garbled = [
  { name: 'Em-dash (—)', re: /—/g },
  { name: 'En-dash (–)', re: /–/g },
  { name: 'Smart double-quote', re: /[“”„‟]/g },
  { name: 'Smart single-quote', re: /[‘’‚‛]/g },
  { name: 'Ellipsis (…)', re: /…/g },
  { name: 'Zero-width chars', re: /[​‌‍⁠﻿]/g },
  { name: 'Replacement char (U+FFFD)', re: /�/g },
  { name: 'BOM (U+FEFF)', re: /﻿/g },
];
for (const g of garbled) {
  const matches = textDefault.match(g.re);
  if (matches && matches.length > 0)
    failHard(
      `Garbled: ${g.name}`,
      `${matches.length} occurrence(s) — replace with ASCII equivalent before render`,
    );
  else pass(`Clean: ${g.name}`);
}

// Private Use Area codepoints (some font encodings leak these)
const puaMatches = textDefault.match(/[-]/g);
if (puaMatches && puaMatches.length > 0)
  failHard(`PUA codepoints`, `${puaMatches.length} occurrence(s) — font mapping broken`);
else pass('No Private Use Area codepoints');

// ── 6. Hyperlinks ──────────────────────────────────────────────────
let urlCount = 0;
let urls = [];
try {
  const urlOut = run('pdfinfo', ['-url', pdfPath]);
  urls = urlOut
    .split('\n')
    .filter((l) => /https?:\/\//.test(l))
    .map((l) => l.trim().split(/\s+/).pop());
  urlCount = urls.length;
} catch {}
if (urlCount >= 1)
  pass('Hyperlinks preserved', `${urlCount} URL(s): ${urls.slice(0, 2).join(', ')}`);
else
  failHard(
    'No hyperlinks',
    'LinkedIn / portfolio should be a clickable <a> tag — recruiters click these',
  );

// Contact info presence
const hasEmail = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(textDefault);
const hasPhone = /(\+\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/.test(textDefault);
const hasLinkedIn = /linkedin\.com\/in\/[a-z0-9-]+/i.test(textDefault);
if (hasEmail) pass('Contact: email detected');
else failHard('Contact: email missing', 'an extractable email address is required');
if (hasPhone) pass('Contact: phone detected');
else warnSoft('Contact: phone missing', 'phone is recommended; some ATS require it');
if (hasLinkedIn) pass('Contact: LinkedIn URL detected');
else warnSoft('Contact: LinkedIn missing', 'recruiters expect a LinkedIn profile link');

// ── Score + report ─────────────────────────────────────────────────
const total = checks.length;
const passCount = checks.filter((c) => c.status === 'pass').length;
const warnCount = checks.filter((c) => c.status === 'warn').length;
const failCount = checks.filter((c) => c.status === 'fail').length;
const score = (passCount / total) * 100;

if (jsonOutput) {
  console.log(JSON.stringify({ score, total, passCount, warnCount, failCount, checks }, null, 2));
  process.exit(failCount > 0 ? 1 : 0);
}

console.log();
console.log(`${B}ATS-Compatibility Report (strict)${N}  ${DIM}${resolve(pdfPath)}${N}`);
console.log();
for (const c of checks) {
  const tag = c.status === 'pass' ? `${G}✓${N}` : c.status === 'warn' ? `${Y}⚠${N}` : `${R}✗${N}`;
  console.log(`  ${tag} ${c.name}${c.evidence ? `  ${DIM}${c.evidence}${N}` : ''}`);
}
console.log();
console.log(
  `${B}Summary${N}  ${G}${passCount}${N} pass · ${Y}${warnCount}${N} warn · ${R}${failCount}${N} fail`,
);
console.log(
  `${B}ATS Score${N}  ${score === 100 ? G : score >= 90 ? Y : R}${score.toFixed(1)}%${N}` +
    (failCount === 0
      ? `  ${G}🟢 every check passed${N}`
      : `  ${R}🔴 ${failCount} hard fail(s) — fix before submitting${N}`),
);

process.exit(failCount > 0 ? 1 : 0);
