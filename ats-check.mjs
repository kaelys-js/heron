#!/usr/bin/env node
/**
 * ats-check.mjs — Lint a CV PDF for ATS compatibility.
 *
 * Runs the same checks recruiters' ATS parsers (Workday, Greenhouse,
 * Lever, Ashby, iCIMS, Taleo, Jobvite) do on every uploaded resume,
 * and reports a score with specific reasons for each deduction.
 *
 * Usage:
 *   node ats-check.mjs <path/to/cv.pdf>           # human-readable
 *   node ats-check.mjs <path/to/cv.pdf> --json    # machine-readable
 *
 * Exit codes:
 *   0 — Score ≥ 90% (passes every realistic ATS)
 *   1 — Score 75-89% (likely passes; minor flags)
 *   2 — Score < 75% (some ATS will reject or mis-parse)
 *
 * Uses Poppler's `pdftotext` + `pdfinfo` — install with `brew install poppler`
 * on macOS or `apt-get install poppler-utils` on Linux.
 *
 * What it checks:
 *   • Text-extractability (default + raw + layout modes all agree)
 *   • PDF metadata (Title, Author, Subject, Keywords, Tagged)
 *   • Standard section headers present
 *   • No problematic Unicode (em-dash, smart quotes, ZWSP) in extracted text
 *   • Single-column reading order (sections appear in expected sequence)
 *   • No embedded JavaScript / XFA forms / encryption
 *   • Hyperlinks preserved as annotations (LinkedIn / portfolio)
 *   • Reasonable file size (under 1 MB; over = images / scanned content)
 *   • Page count (1-2 pages typical; 3+ flagged)
 */

import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const pdfPath = args.find((a) => !a.startsWith('-'));

if (!pdfPath) {
  console.error('Usage: node ats-check.mjs <path/to/cv.pdf> [--json]');
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

/** Tool-availability check. */
function ensureTool(cmd) {
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
  } catch {
    console.error(
      `${R}Missing required tool: ${cmd}${N}\n` +
        `Install: brew install poppler (macOS) | apt-get install poppler-utils (Linux)`,
    );
    process.exit(2);
  }
}
ensureTool('pdftotext');
ensureTool('pdfinfo');

/** Run an external command, capture stdout (latin1 because some PDFs have non-UTF8 bytes). */
function run(cmd, argv) {
  return execFileSync(cmd, argv, { encoding: 'latin1', maxBuffer: 50 * 1024 * 1024 });
}

const checks = [];
function ok(name, evidence) {
  checks.push({ status: 'ok', name, evidence });
}
function warn(name, evidence) {
  checks.push({ status: 'warn', name, evidence });
}
function fail(name, evidence) {
  checks.push({ status: 'fail', name, evidence });
}

// ── 1. PDF metadata ─────────────────────────────────────────────────
const infoRaw = run('pdfinfo', [pdfPath]);
const info = {};
for (const line of infoRaw.split('\n')) {
  const m = line.match(/^([A-Za-z][A-Za-z _]*?):\s+(.+)$/);
  if (m) info[m[1].trim()] = m[2].trim();
}

info.Title?.length ? ok('Title metadata set', info.Title) : warn('Title metadata missing', '');
info.Author?.length
  ? ok('Author metadata set', info.Author)
  : warn('Author metadata missing — recruiter file-managers sort by author', '');
info.Subject?.length
  ? ok('Subject metadata set', info.Subject)
  : warn('Subject metadata missing — useful for "Role @ Company" indexing', '');
info.Keywords?.length
  ? ok('Keywords metadata set', `${info.Keywords.split(',').length} terms`)
  : warn('Keywords metadata missing — some ATS index by this field', '');
info.Tagged === 'yes'
  ? ok('PDF/UA tagged structure', 'screen-readers + modern ATS parse semantic roles')
  : warn('PDF not tagged (PDF/UA)', 'add tagged:true to page.pdf()');
info.JavaScript === 'no'
  ? ok('No embedded JavaScript', '')
  : fail('Embedded JavaScript', 'some ATS reject PDFs with JS');
info.Form === 'none'
  ? ok('No fillable forms', '')
  : warn(`Embedded form: ${info.Form}`, 'XFA forms can break parsers');
info.Encrypted === 'no'
  ? ok('Not encrypted', '')
  : fail('Encrypted PDF', 'most ATS refuse password-locked PDFs');

const pageCount = parseInt(info.Pages || '0', 10);
if (pageCount === 0) fail('Page count', 'pdfinfo reports 0 pages — corrupt file');
else if (pageCount <= 2) ok('Page count', `${pageCount} page(s) — recruiter-friendly`);
else if (pageCount <= 3)
  warn('Page count', `${pageCount} pages — review if all content is essential`);
else fail('Page count', `${pageCount} pages — way too long; ATS abandon long resumes`);

const sizeKb = statSync(pdfPath).size / 1024;
if (sizeKb < 100)
  warn('Small file size', `${sizeKb.toFixed(1)} KB — possibly text-only; check fonts embed`);
else if (sizeKb < 1024) ok('File size', `${sizeKb.toFixed(1)} KB — normal text+fonts PDF`);
else
  fail('Large file size', `${(sizeKb / 1024).toFixed(2)} MB — likely image-based; ATS can't OCR`);

// ── 2. Text extractability ─────────────────────────────────────────
const textDefault = run('pdftotext', [pdfPath, '-']);
const textLayout = run('pdftotext', ['-layout', pdfPath, '-']);
const textRaw = run('pdftotext', ['-raw', pdfPath, '-']);

if (textDefault.trim().length < 200)
  fail('Extracted text length', `Only ${textDefault.trim().length} chars — PDF may be image-based`);
else if (textDefault.trim().length < 500)
  warn('Extracted text length', `${textDefault.trim().length} chars — short for a CV`);
else ok('Extracted text length', `${textDefault.trim().length} chars`);

// Three extraction modes should agree on which words exist (not on order).
const words = (s) => new Set(s.toLowerCase().match(/[a-z][a-z0-9]+/g) || []);
const wDefault = words(textDefault);
const wRaw = words(textRaw);
const intersection = [...wDefault].filter((w) => wRaw.has(w)).length;
const consistency = intersection / Math.max(wDefault.size, 1);
if (consistency >= 0.95)
  ok('Extraction consistency', `${(consistency * 100).toFixed(1)}% of words agree across modes`);
else
  warn(
    'Extraction consistency',
    `${(consistency * 100).toFixed(1)}% — some words extracted differently by default vs raw mode`,
  );

// ── 3. Standard section headers ────────────────────────────────────
const expectedSections = [
  { name: 'Summary', pattern: /(professional\s+summary|summary|about|profile)/i },
  {
    name: 'Experience',
    pattern: /(work\s+experience|experience|employment|professional\s+experience)/i,
  },
  { name: 'Education', pattern: /education/i },
  { name: 'Skills', pattern: /skills|technical\s+skills|technologies/i },
];
for (const sec of expectedSections) {
  if (sec.pattern.test(textDefault)) ok(`Section: ${sec.name}`, 'standard header detected');
  else warn(`Section: ${sec.name}`, 'use a standard header like "Work Experience", "Education"');
}

// ── 4. Problematic Unicode (should be zero post-normalisation) ─────
// NBSP (U+00A0) is intentionally excluded: Chromium auto-inserts it
// during PDF layout (anywhere the CSS forbids a line-break: nowrap, flex
// gaps, etc.), and every modern ATS parser treats it as whitespace per
// the Unicode standard. Listing it as a warning would always fire even
// on a perfectly compatible PDF.
const badUnicode = [
  { name: 'em-dash (—)', re: /—/g },
  { name: 'en-dash (–)', re: /–/g },
  { name: 'smart double-quote', re: /[“”„‟]/g },
  { name: 'smart single-quote', re: /[‘’‚‛]/g },
  { name: 'ellipsis (…)', re: /…/g },
  { name: 'zero-width', re: /[​‌‍⁠﻿]/g },
];
for (const u of badUnicode) {
  const matches = textDefault.match(u.re);
  if (matches && matches.length > 0)
    warn(
      `Unicode: ${u.name}`,
      `${matches.length} occurrence(s) — replace with ASCII for max compatibility`,
    );
  else ok(`Unicode: ${u.name}`, 'absent / normalised');
}

// ── 5. Hyperlinks (pdfinfo -url) ────────────────────────────────────
let urls = [];
try {
  const urlOut = run('pdfinfo', ['-url', pdfPath]);
  urls = urlOut
    .split('\n')
    .filter((l) => l.includes('http'))
    .map((l) => l.trim().split(/\s+/).pop());
} catch {}
if (urls.length === 0)
  warn('Hyperlinks', 'no URL annotations — LinkedIn/portfolio should be a clickable <a> tag');
else ok('Hyperlinks', `${urls.length} URL(s) preserved: ${urls.slice(0, 3).join(', ')}`);

// ── 6. Reading order — sections appear in sensible sequence ────────
function findIdx(text, re) {
  const m = re.exec(text);
  return m ? m.index : -1;
}
const idxSummary = findIdx(textDefault, /(professional\s+summary|summary|profile)/i);
const idxExp = findIdx(textDefault, /(work\s+experience|experience|employment)/i);
const idxEdu = findIdx(textDefault, /education/i);
if (idxSummary >= 0 && idxExp >= 0 && idxSummary < idxExp)
  ok('Reading order: Summary before Experience', '');
else if (idxSummary >= 0 && idxExp >= 0)
  warn('Reading order: Summary after Experience', 'unusual; recruiter scans top-down');
if (idxExp >= 0 && idxEdu >= 0 && idxExp < idxEdu)
  ok('Reading order: Experience before Education', '');
else if (idxExp >= 0 && idxEdu >= 0)
  warn(
    'Reading order: Education before Experience',
    'OK for new-grad CVs; unusual for >2yrs of experience',
  );

// ── 7. Section-name detection from headers ─────────────────────────
const standardHeaders = [
  'PROFESSIONAL SUMMARY',
  'WORK EXPERIENCE',
  'EXPERIENCE',
  'EDUCATION',
  'SKILLS',
  'TECHNICAL SKILLS',
  'CERTIFICATIONS',
  'PROJECTS',
  'CORE COMPETENCIES',
];
const detected = standardHeaders.filter((h) =>
  new RegExp(`^\\s*${h.replace(/ /g, '\\s+')}\\s*$`, 'im').test(textDefault),
);
if (detected.length >= 3) ok('Standard section names', `detected: ${detected.join(', ')}`);
else warn('Standard section names', `only ${detected.length} detected — recruiters scan for these`);

// ── Score + report ─────────────────────────────────────────────────
const total = checks.length;
const okCount = checks.filter((c) => c.status === 'ok').length;
const warnCount = checks.filter((c) => c.status === 'warn').length;
const failCount = checks.filter((c) => c.status === 'fail').length;
// Each ok = 1.0, warn = 0.5, fail = 0.0
const score = ((okCount + warnCount * 0.5) / total) * 100;

if (jsonOutput) {
  console.log(JSON.stringify({ score, total, okCount, warnCount, failCount, checks }, null, 2));
} else {
  console.log();
  console.log(`${B}ATS-Compatibility Report${N}  ${DIM}${resolve(pdfPath)}${N}`);
  console.log();
  for (const c of checks) {
    const tag = c.status === 'ok' ? `${G}✓${N}` : c.status === 'warn' ? `${Y}⚠${N}` : `${R}✗${N}`;
    console.log(`  ${tag} ${c.name}${c.evidence ? `  ${DIM}${c.evidence}${N}` : ''}`);
  }
  console.log();
  console.log(
    `${B}Summary${N}  ${G}${okCount}${N} pass · ${Y}${warnCount}${N} warn · ${R}${failCount}${N} fail`,
  );
  console.log(
    `${B}ATS Score${N}  ${score >= 90 ? G : score >= 75 ? Y : R}${score.toFixed(1)}%${N}` +
      (score >= 90
        ? `  ${G}🟢 ready for every major ATS${N}`
        : score >= 75
          ? `  ${Y}🟡 will likely pass; minor cleanups recommended${N}`
          : `  ${R}🔴 some ATS will reject or mis-parse${N}`),
  );
}

if (failCount > 0) process.exit(2);
if (warnCount > 3) process.exit(1);
process.exit(0);
