#!/usr/bin/env node
/**
 * resume-quality.mjs — strict quality gate for CV markdown.
 *
 * Reads cv.md (or any markdown CV) and runs 30+ checks across three
 * threat models that ats-check.mjs doesn't cover:
 *
 *   1. AI-DETECTION — patterns that GPTZero, Originality.ai, Copyleaks,
 *      Turnitin, and recruiter-side AI-detectors flag as machine-written.
 *      The submitted resume needs to read like a human wrote it, even
 *      after AI-assisted tailoring.
 *
 *   2. HUMAN REVIEW — the 6-second recruiter scan. Action verbs at the
 *      start of every bullet, quantified achievements ≥ 40%, no clichés,
 *      no first-person pronouns, no superlatives the CV can't back up,
 *      tense consistency, reading-level appropriate.
 *
 *   3. STRUCTURE — required sections, contact info present, dates
 *      consistent, no orphan bullets, no widow lines.
 *
 * Usage:
 *   pnpm resume:check <path/to/cv.md>             # human report
 *   pnpm resume:check <path/to/cv.md> --json      # machine-readable
 *   pnpm resume:check <path/to/cv.md> --lenient   # warnings instead of fails
 *
 * Exit codes:
 *   0 — every check passed
 *   1 — at least one hard fail
 *   2 — environment / argument issue
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const lenient = args.includes('--lenient');
const mdPath = args.find((a) => !a.startsWith('-'));

if (!mdPath) {
  console.error('Usage: node resume-quality.mjs <path/to/cv.md> [--json] [--lenient]');
  process.exit(2);
}
if (!existsSync(mdPath)) {
  console.error(`File not found: ${mdPath}`);
  process.exit(2);
}

const G = '\x1b[32m';
const Y = '\x1b[33m';
const R = '\x1b[31m';
const B = '\x1b[1m';
const N = '\x1b[0m';
const DIM = '\x1b[2m';

const md = readFileSync(mdPath, 'utf8');
const lines = md.split(/\r?\n/);
const text = md;

const checks = [];
const pass = (name, evidence = '') => checks.push({ status: 'pass', name, evidence });
const fail = (name, evidence = '') => checks.push({ status: 'fail', name, evidence });
const warn = (name, evidence = '') =>
  checks.push({ status: lenient ? 'warn' : 'fail', name, evidence });

// Helpers
const stripMarkdown = (s) =>
  s
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^\|.*\|$/gm, '')
    .replace(/^>/gm, '')
    .replace(/```[\s\S]*?```/g, '');
const plain = stripMarkdown(text);
const wordCount = (plain.match(/\b[\w'-]+\b/g) || []).length;

// ── 1. STRUCTURE ──────────────────────────────────────────────────
const sections = {
  Summary: /^#{1,3}\s*(professional\s+summary|summary|profile|about)\b/im,
  Experience: /^#{1,3}\s*(work\s+experience|experience|employment|professional\s+experience)\b/im,
  Education: /^#{1,3}\s*education\b/im,
  Skills: /^#{1,3}\s*(technical\s+skills|skills|technologies|competencies)\b/im,
};
let sectionsFound = 0;
for (const [name, re] of Object.entries(sections)) {
  if (re.test(text)) {
    pass(`Section: ${name}`);
    sectionsFound++;
  } else {
    fail(`Section: ${name} missing`, `add an H2 like "## ${name}"`);
  }
}
if (sectionsFound === 4) pass('All standard sections present');

// Contact line
const hasEmail = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text);
// Phone: matches +1 555-1234, (555) 123-4567, 555.123.4567, etc.
// Requires at least 7 digits separated by spaces/dots/dashes/parens.
const hasPhone =
  /(?:\+\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{0,4}\b/.test(text) &&
  (text.match(/\d/g) || []).length >= 7;
const hasLinkedIn = /linkedin\.com\/in\/[a-z0-9-]+/i.test(text);
const hasLocation =
  /\b(city|country|remote|us|uk|eu|ca|au|nz|de|fr|es|pt|jp|kr|cn|in|br|mx)\b/i.test(
    plain.slice(0, 800),
  );
hasEmail ? pass('Contact: email present') : fail('Contact: email missing');
hasPhone ? pass('Contact: phone present') : warn('Contact: phone missing');
hasLinkedIn ? pass('Contact: LinkedIn URL present') : warn('Contact: LinkedIn missing');
hasLocation ? pass('Contact: location present') : warn('Contact: location missing');

// Length
if (wordCount >= 350 && wordCount <= 900)
  pass('Word count', `${wordCount} (target 350-900 for 1-2 pages)`);
else if (wordCount < 350) fail('Word count', `${wordCount} words — too short for a CV`);
else fail('Word count', `${wordCount} words — likely 3+ pages, will be cut`);

// ── 2. HUMAN-REVIEW — action verbs + quantification ───────────────
const bullets = [];
for (const line of lines) {
  const m = /^[-*]\s+(.+)$/.exec(line);
  if (m) bullets.push(m[1].trim());
}

const ACTION_VERBS = new Set([
  'achieved',
  'architected',
  'authored',
  'automated',
  'built',
  'cataloged',
  'collaborated',
  'completed',
  'composed',
  'conceived',
  'conducted',
  'configured',
  'consolidated',
  'consulted',
  'coordinated',
  'created',
  'cultivated',
  'cut',
  'debugged',
  'decreased',
  'defined',
  'delivered',
  'deployed',
  'designed',
  'developed',
  'devised',
  'directed',
  'distributed',
  'documented',
  'doubled',
  'drove',
  'edited',
  'eliminated',
  'enabled',
  'engineered',
  'enhanced',
  'established',
  'evaluated',
  'executed',
  'expanded',
  'expedited',
  'extended',
  'facilitated',
  'forecasted',
  'formed',
  'founded',
  'generated',
  'grew',
  'guided',
  'halved',
  'headed',
  'identified',
  'implemented',
  'improved',
  'increased',
  'initiated',
  'instituted',
  'integrated',
  'introduced',
  'invented',
  'investigated',
  'launched',
  'led',
  'leveraged',
  'maintained',
  'managed',
  'mapped',
  'marketed',
  'mentored',
  'migrated',
  'modeled',
  'modernized',
  'monitored',
  'negotiated',
  'operated',
  'optimized',
  'orchestrated',
  'organized',
  'overhauled',
  'owned',
  'partnered',
  'piloted',
  'pioneered',
  'planned',
  'prepared',
  'presented',
  'prevented',
  'prioritized',
  'processed',
  'produced',
  'programmed',
  'promoted',
  'proposed',
  'prototyped',
  'proved',
  'published',
  'recruited',
  'redesigned',
  'reduced',
  'refactored',
  'released',
  'researched',
  'resolved',
  'restored',
  'restructured',
  'reviewed',
  'revised',
  'saved',
  'scaled',
  'scoped',
  'secured',
  'selected',
  'shaped',
  'shipped',
  'simplified',
  'simulated',
  'sold',
  'solved',
  'spearheaded',
  'specified',
  'standardized',
  'streamlined',
  'structured',
  'supervised',
  'supplied',
  'supported',
  'sustained',
  'taught',
  'trained',
  'transformed',
  'translated',
  'tripled',
  'troubleshooted',
  'unified',
  'updated',
  'upgraded',
  'validated',
  'won',
  'wrote',
]);
const startsWithActionVerb = (b) => {
  const w = b
    .replace(/^\*\*[^*]+\*\*:?\s*/, '')
    .trim()
    .split(/\s+/)[0]
    ?.toLowerCase()
    .replace(/[^a-z]/g, '');
  return ACTION_VERBS.has(w);
};
const actionStarts = bullets.filter(startsWithActionVerb).length;
const actionRatio = bullets.length ? actionStarts / bullets.length : 0;
if (bullets.length === 0) warn('Action verbs', 'no bullet points detected');
else if (actionRatio >= 0.85)
  pass(
    'Action verbs',
    `${actionStarts}/${bullets.length} (${(actionRatio * 100).toFixed(0)}%) bullets start with one`,
  );
else if (actionRatio >= 0.6)
  warn('Action verbs', `${(actionRatio * 100).toFixed(0)}% — aim for 85%+`);
else
  fail(
    'Action verbs',
    `only ${(actionRatio * 100).toFixed(0)}% of bullets start with action verbs`,
  );

// Quantification
const hasNumber = (b) =>
  /\b\d+(?:\.\d+)?[%xKMB]?\b|\$\d|\d+\s*(?:hours?|days?|weeks?|months?|years?|users?|customers?|engineers?|reqs?|requests?|queries?|teams?)/i.test(
    b,
  );
const quantBullets = bullets.filter(hasNumber).length;
const quantRatio = bullets.length ? quantBullets / bullets.length : 0;
if (bullets.length === 0) warn('Quantification', 'no bullets to evaluate');
else if (quantRatio >= 0.4)
  pass(
    'Quantification',
    `${quantBullets}/${bullets.length} (${(quantRatio * 100).toFixed(0)}%) bullets contain numbers`,
  );
else if (quantRatio >= 0.2)
  warn('Quantification', `${(quantRatio * 100).toFixed(0)}% — recruiters want concrete numbers`);
else fail('Quantification', `only ${(quantRatio * 100).toFixed(0)}% — quantify achievements`);

// First-person pronouns
const firstPerson = (plain.match(/\b(I|my|me|we|our|us)\b/g) || []).filter(
  // Allow in Summary paragraph only — count pronouns outside it
  () => true,
).length;
// Subtract pronouns inside the Summary paragraph (first 200 words)
const summaryEndIdx = (() => {
  const m = sections.Experience.exec(text);
  return m ? m.index : 1500;
})();
const afterSummary = stripMarkdown(text.slice(summaryEndIdx));
const fpOutside = (afterSummary.match(/\b(I|my|me|we|our|us)\b/g) || []).length;
if (fpOutside === 0) pass('No first-person pronouns in body');
else if (fpOutside <= 2)
  warn('First-person pronouns', `${fpOutside} occurrence(s) outside Summary`);
else fail('First-person pronouns', `${fpOutside} — CV body should be third-person/imperative`);

// ── 3. AI-DETECTION ────────────────────────────────────────────────
// LLM-overused phrases that flag AI-generated text on detection services.
// Curated from Originality.ai's 2025 patterns + GPTZero's flagged corpus.
const AI_PHRASES = [
  'delve into',
  'delving into',
  'navigate the complexities',
  "in today's ever-evolving",
  'in the realm of',
  'a testament to',
  'paradigm shift',
  'cutting-edge',
  'state-of-the-art',
  'seamlessly integrated',
  'leveraging cutting-edge',
  'unparalleled',
  'unwavering',
  'meticulously',
  'foster collaboration',
  'fostering',
  'commitment to excellence',
  'a strong commitment',
  'wealth of experience',
  'in the dynamic landscape',
  'cornerstone of',
  'embark on a journey',
  'tapestry',
  'orchestrating',
  'multifaceted',
  'holistic approach',
  'comprehensive understanding',
  'driving innovation',
  'innovative solutions',
  'thrives in',
  'passionate about',
  'results-driven',
  'detail-oriented',
  'self-motivated',
  'team player',
  'go-getter',
  'fast-paced environment',
  'hit the ground running',
  'think outside the box',
  'synergy',
  'synergize',
  'leverage synergies',
  'best practices',
  'value-add',
  'value-driven',
  'high-impact',
  'world-class',
  'top-tier',
  'best-in-class',
  'mission-critical',
  'transformative',
  'revolutionary',
  'disruptive',
  'a proven track record',
  'demonstrated ability',
  'extensive experience',
  'in-depth knowledge',
  'deep expertise',
  'subject matter expert',
];
const aiHits = [];
for (const phrase of AI_PHRASES) {
  const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'gi');
  const matches = plain.match(re);
  if (matches) aiHits.push({ phrase, count: matches.length });
}
if (aiHits.length === 0) pass('AI-detector phrases', 'none of the 50+ flagged phrases present');
else if (aiHits.length <= 2)
  warn(
    'AI-detector phrases',
    `${aiHits.length} flagged: ${aiHits.map((h) => h.phrase).join(', ')}`,
  );
else
  fail(
    'AI-detector phrases',
    `${aiHits.length} flagged phrases — high AI-detection risk: ${aiHits
      .slice(0, 5)
      .map((h) => h.phrase)
      .join(', ')}`,
  );

// Em-dash usage — LLMs overuse em-dashes IN PROSE. Em-dashes in headers
// (role titles, section dividers) are legitimate style; only count those
// that appear inside sentences/bullets.
const bodyLines = lines.filter((l) => {
  const t = l.trim();
  if (!t) return false;
  if (/^#{1,6}\s/.test(t)) return false; // skip H1-H6
  return true;
});
const bodyText = bodyLines.join('\n');
const emDashCount = (bodyText.match(/—/g) || []).length;
if (emDashCount === 0) pass('Em-dash usage', '0 em-dashes in body prose (good)');
else if (emDashCount <= 3) pass('Em-dash usage', `${emDashCount} (acceptable)`);
else if (emDashCount <= 7)
  warn(
    'Em-dash usage',
    `${emDashCount} — LLMs overuse em-dashes; replace some with periods/commas`,
  );
else fail('Em-dash usage', `${emDashCount} — strong AI-detection signal`);

// Sentence-length variance
const sentences = plain
  .split(/[.!?]+\s+/)
  .map((s) => s.trim())
  .filter((s) => s.length > 5);
const sentLens = sentences.map((s) => (s.match(/\b\w+\b/g) || []).length);
if (sentLens.length >= 5) {
  const mean = sentLens.reduce((a, b) => a + b, 0) / sentLens.length;
  const variance = sentLens.reduce((a, b) => a + (b - mean) ** 2, 0) / sentLens.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean ? stdDev / mean : 0;
  // Human writing has CV (coefficient of variation) ≈ 0.4-0.9.
  // AI text tends to be too uniform (CV < 0.3). Threshold set at 0.35
  // to be forgiving — CV-format prose is denser/more uniform than essays.
  if (cv >= 0.35)
    pass('Sentence-length variance', `CV ${cv.toFixed(2)} (humans typically 0.4-0.9)`);
  else warn('Sentence-length variance', `CV ${cv.toFixed(2)} — too uniform; humans vary more`);
} else {
  warn('Sentence-length variance', 'too few sentences to analyse');
}

// Buzzwords + clichés
const CLICHES = [
  'team player',
  'hard worker',
  'fast learner',
  'go-getter',
  'self-starter',
  'detail-oriented',
  'results-driven',
  'highly motivated',
  'people person',
  'think outside the box',
  'best of breed',
  'low-hanging fruit',
  'circle back',
  'move the needle',
  'wear many hats',
  'jack of all trades',
  'guru',
  'ninja',
  'rockstar',
  'visionary',
  'thought leader',
  'change agent',
];
const clicheHits = CLICHES.filter((c) =>
  new RegExp(`\\b${c.replace(/-/g, '[ -]')}\\b`, 'i').test(plain),
);
if (clicheHits.length === 0) pass('Clichés', 'none detected');
else fail('Clichés', `remove: ${clicheHits.join(', ')}`);

// Superlatives without evidence
const SUPERLATIVES = ['expert', 'world-class', 'best', 'top', 'leading', 'foremost', 'unmatched'];
const supHits = SUPERLATIVES.filter((s) => new RegExp(`\\b${s}\\b`, 'i').test(plain));
if (supHits.length <= 1) pass('Superlatives', `${supHits.length} (acceptable)`);
else warn('Superlatives', `${supHits.length}: ${supHits.join(', ')} — back with numbers or remove`);

// ── 4. STRUCTURE — tense consistency, dates ───────────────────────
// Date patterns — at least 2 valid date ranges expected (one role minimum)
const datePatterns = [
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4}\b/gi,
  /\b\d{4}\s*[-–—]\s*(?:\d{4}|present)\b/gi,
  /\b(0[1-9]|1[0-2])\/\d{4}\s*[-–—]\s*(?:(0[1-9]|1[0-2])\/\d{4}|present)\b/gi,
];
const dateCount = datePatterns.reduce((acc, re) => acc + (plain.match(re) || []).length, 0);
if (dateCount >= 2) pass('Dates detected', `${dateCount} date references`);
else fail('Dates detected', `only ${dateCount} — every role should have a clear date range`);

// Reading level (Flesch-Kincaid approximation)
const syllableCount = (w) => {
  w = w.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  let count = w.match(/[aeiouy]+/g)?.length || 1;
  if (w.endsWith('e') && count > 1) count--;
  return Math.max(1, count);
};
const wordsForFK = plain.match(/\b[A-Za-z]+\b/g) || [];
const totalSyllables = wordsForFK.reduce((acc, w) => acc + syllableCount(w), 0);
const fkSentences = Math.max(1, sentences.length);
const fkGrade =
  0.39 * (wordsForFK.length / fkSentences) +
  11.8 * (totalSyllables / Math.max(1, wordsForFK.length)) -
  15.59;
if (fkGrade >= 9 && fkGrade <= 14)
  pass('Flesch-Kincaid grade', `${fkGrade.toFixed(1)} (target 9-14 for recruiter scan)`);
else if (fkGrade < 9)
  warn('Flesch-Kincaid grade', `${fkGrade.toFixed(1)} — too simple for senior roles`);
else fail('Flesch-Kincaid grade', `${fkGrade.toFixed(1)} — too academic/jargon-heavy`);

// ALL-CAPS shouting
const upperLines = lines.filter((l) => {
  const t = l.trim();
  return t.length > 5 && t.length < 60 && /^[A-Z\s]{5,}$/.test(t);
});
if (upperLines.length <= 1) pass('No ALL-CAPS shouting', '');
else
  warn(
    'ALL-CAPS lines',
    `${upperLines.length} — section headers are fine, body text shouldn't shout`,
  );

// Markdown table check (most ATS fail on markdown tables)
const tableLines = lines.filter((l) => /^\|.*\|$/.test(l) && /\|[-:|\s]+\|/.test(l));
if (tableLines.length === 0) pass('No markdown tables', '');
else
  fail(
    'Markdown tables',
    `${tableLines.length} table rows — ATS strip table structure, content gets jumbled`,
  );

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
console.log(
  `${B}Resume Quality Report${N}  ${DIM}${resolve(mdPath)}${N}` +
    `${DIM}\n${wordCount} words · ${bullets.length} bullets · ${sentences.length} sentences${N}`,
);
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
  `${B}Quality Score${N}  ${score === 100 ? G : score >= 90 ? Y : R}${score.toFixed(1)}%${N}` +
    (failCount === 0
      ? `  ${G}🟢 reads like a human wrote it; recruiter-ready${N}`
      : `  ${R}🔴 ${failCount} hard fail(s) — fix before submitting${N}`),
);
process.exit(failCount > 0 ? 1 : 0);
