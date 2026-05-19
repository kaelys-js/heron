#!/usr/bin/env node
/**
 * cover-letter-check.mjs -- strict quality gate for cover-letter markdown.
 *
 * Cover letters live or die on three signals recruiters scan for in <30s:
 *   1. Personalisation (do they know who I am / what we do?)
 *   2. Specificity (a concrete reference vs generic platitudes)
 *   3. Voice (human, not LLM-flavoured boilerplate)
 *
 * This script enforces all three. Every check is binary; --lenient
 * downgrades the structural-only ones to warnings.
 *
 * Usage:
 *   pnpm cover:check <path/to/cover.md>                     # auto-detects company/role
 *   pnpm cover:check <path/to/cover.md> --company=Acme --role="Senior SWE"
 *   pnpm cover:check <path/to/cover.md> --json
 *   pnpm cover:check <path/to/cover.md> --lenient
 *
 * Exit codes:
 *   0 -- every check passed
 *   1 -- at least one hard fail
 *   2 -- environment / argument issue
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const lenient = args.includes('--lenient');
const mdPath = args.find((a) => !a.startsWith('-'));
const company = args.find((a) => a.startsWith('--company='))?.slice('--company='.length);
const role = args.find((a) => a.startsWith('--role='))?.slice('--role='.length);

if (!mdPath) {
  console.error(
    'Usage: node cover-letter-check.mjs <path/to/cover.md> [--company=X] [--role=Y] [--json] [--lenient]',
  );
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

const stripMarkdown = (s) =>
  s
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
const plain = stripMarkdown(md);
const wordCount = (plain.match(/\b[\w'-]+\b/g) || []).length;
const paragraphs = plain
  .split(/\n\s*\n/)
  .map((p) => p.trim())
  .filter((p) => p.length > 40);
const sentences = plain
  .split(/[.!?]+\s+/)
  .map((s) => s.trim())
  .filter((s) => s.length > 5);

const checks = [];
const pass = (name, evidence = '') => checks.push({ status: 'pass', name, evidence });
const fail = (name, evidence = '') => checks.push({ status: 'fail', name, evidence });
const warn = (name, evidence = '') =>
  checks.push({ status: lenient ? 'warn' : 'fail', name, evidence });

// ── Try to auto-detect company + role from filename ────────────────
// Filename convention from cover-letter mode: {n}-{slug}-{date}-cover.md
const fname = basename(mdPath, '.md').replace(/-cover$/, '');
let detectedCompany = company;
let detectedRole = role;
if (!detectedCompany) {
  const m = /^\d+-(.+?)-\d{4}/.exec(fname);
  if (m) detectedCompany = m[1].replace(/-/g, ' ');
}

// ── 1. LENGTH ─────────────────────────────────────────────────────
if (wordCount >= 200 && wordCount <= 400) pass('Word count', `${wordCount} (target 200-400)`);
else if (wordCount >= 150 && wordCount < 200)
  warn('Word count', `${wordCount} — slightly short; aim for 200+`);
else if (wordCount > 400 && wordCount <= 500)
  warn('Word count', `${wordCount} — slightly long; aim for ≤400`);
else if (wordCount < 150) fail('Word count', `${wordCount} — way too short`);
else fail('Word count', `${wordCount} — too long; recruiters won't read past 1 page`);

if (paragraphs.length >= 3 && paragraphs.length <= 5)
  pass('Paragraph count', `${paragraphs.length} (target 3-5)`);
else if (paragraphs.length < 3)
  fail('Paragraph count', `${paragraphs.length} — needs Hook + Body + Close minimum`);
else warn('Paragraph count', `${paragraphs.length} — split-up risk; recruiters skim`);

// ── 2. SALUTATION ─────────────────────────────────────────────────
const firstChunk = plain.slice(0, 600).toLowerCase();
const lazySalutations = [
  /to whom it may concern/i,
  /dear sir(?:\s+or\s+madam)?/i,
  /dear hiring manager/i,
  /dear recruiter/i,
];
const hasLazy = lazySalutations.some((re) => re.test(firstChunk));
if (hasLazy)
  fail('Salutation', '"To whom it may concern" / "Dear Hiring Manager" — lazy boilerplate');
else if (
  /dear\s+[a-z]+/i.test(firstChunk) ||
  /hi\s+[a-z]+/i.test(firstChunk) ||
  /hello\s+[a-z]+/i.test(firstChunk)
)
  pass('Salutation', 'personalised greeting detected');
else warn('Salutation', 'no clear greeting — add "Dear {Name}" or "Hi {Team}"');

// ── 3. OPENING HOOK ───────────────────────────────────────────────
const firstSentence = sentences[0] || '';
const lazyOpenings = [
  /^i am (?:writing|applying|excited)/i,
  /^please find (?:enclosed|attached)/i,
  /^my name is/i,
  /^i would like to (?:apply|express)/i,
  /^this (?:letter|cover\s+letter) is/i,
];
if (lazyOpenings.some((re) => re.test(firstSentence)))
  fail('Opening hook', `lazy opener: "${firstSentence.slice(0, 80)}…"`);
else pass('Opening hook', `"${firstSentence.slice(0, 80)}${firstSentence.length > 80 ? '…' : ''}"`);

// ── 4. PERSONALISATION ────────────────────────────────────────────
if (detectedCompany) {
  // Company name (or its slug-words) should appear in the body -- at least once.
  const compRe = new RegExp(
    `\\b${detectedCompany.replace(/[^\w\s]/g, '').replace(/\s+/g, '\\s+')}\\b`,
    'i',
  );
  if (compRe.test(plain)) pass('Company mentioned', `"${detectedCompany}" referenced in body`);
  else fail('Company mentioned', `"${detectedCompany}" never appears — generic letter`);
} else {
  warn('Company mentioned', 'no --company flag and filename-detection failed; pass --company=X');
}

if (detectedRole) {
  const roleRe = new RegExp(
    `\\b${detectedRole.replace(/[^\w\s]/g, '').replace(/\s+/g, '\\s+')}\\b`,
    'i',
  );
  if (roleRe.test(plain)) pass('Role mentioned', `"${detectedRole}" referenced in body`);
  else warn('Role mentioned', `"${detectedRole}" never appears`);
}

// Specificity signal: at least one concrete reference (product, team, mission, technology).
// We look for proper-noun phrases NOT in the standard CV-glossary -- anything capitalised
// in the middle of a sentence that's not common job vocabulary.
const properNouns = plain.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) || [];
const COMMON = new Set([
  'United States',
  'New York',
  'San Francisco',
  'Los Angeles',
  'Senior Engineer',
  'Software Engineer',
  'Product Manager',
  'Cover Letter',
  'Best Regards',
  'Best,'.replace(',', ''),
]);
const distinctProperNouns = [...new Set(properNouns)].filter((n) => !COMMON.has(n));
if (distinctProperNouns.length >= 2)
  pass(
    'Specificity signal',
    `${distinctProperNouns.length} proper-noun refs (products/people/places)`,
  );
else if (distinctProperNouns.length === 1)
  warn('Specificity signal', `only 1 specific reference — add a product/team/mission detail`);
else fail('Specificity signal', 'no concrete refs — reads like a template');

// ── 5. CLOSING ────────────────────────────────────────────────────
const lastChunk = plain.slice(-500).toLowerCase();
const SIGN_OFFS = [
  /\bsincerely[,.]/i,
  /\bbest(?:\s+regards)?[,.]/i,
  /\bkind\s+regards[,.]/i,
  /\bregards[,.]/i,
  /\bthank you[,.]/i,
  /\bcheers[,.]/i,
];
if (SIGN_OFFS.some((re) => re.test(lastChunk))) pass('Sign-off');
else warn('Sign-off', 'add "Best,", "Sincerely,", "Thank you,", or similar before the name');

// Call-to-action (last paragraph should propose next step or close warmly)
const lastPara = paragraphs[paragraphs.length - 1] || '';
const ctaPhrases = [
  /happy to (?:walk through|share|discuss|chat|set up|talk)/i,
  /would love to (?:discuss|chat|explore|connect)/i,
  /look forward to/i,
  /available (?:to|for)/i,
  /reach (?:out|me)/i,
  /\bcall\b/i,
];
if (ctaPhrases.some((re) => re.test(lastPara))) pass('Call-to-action in closing');
else warn('Call-to-action', 'closing paragraph should propose next step (chat/call/walk-through)');

// ── 6. NO BULLET POINTS (cover letters are prose) ──────────────────
const bulletLines = lines.filter((l) => /^[-*]\s+\w/.test(l));
if (bulletLines.length === 0) pass('No bullet points', 'prose-only as expected');
else fail('Bullet points present', `${bulletLines.length} — cover letters are prose, not lists`);

// ── 7. AI-DETECTION ───────────────────────────────────────────────
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
  // Cover-letter-specific:
  'i am excited to apply',
  'i am writing to express my interest',
  'i believe i would be a great fit',
  'i am confident that',
  'this opportunity aligns with',
  'my background aligns',
  'a unique opportunity',
];
const aiHits = AI_PHRASES.filter((p) =>
  new RegExp(`\\b${p.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i').test(plain),
);
if (aiHits.length === 0) pass('AI-detector phrases', 'none of the 50+ flagged phrases');
else if (aiHits.length === 1) warn('AI-detector phrases', `1 flagged: ${aiHits[0]}`);
else fail('AI-detector phrases', `${aiHits.length} flagged: ${aiHits.slice(0, 5).join(', ')}`);

// Em-dash overuse
const emDashCount = (plain.match(/—/g) || []).length;
if (emDashCount <= 2) pass('Em-dash usage', `${emDashCount}`);
else if (emDashCount <= 4) warn('Em-dash usage', `${emDashCount} — replace some`);
else fail('Em-dash usage', `${emDashCount} — strong AI signal`);

// Clichés
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
  'wear many hats',
  'jack of all trades',
  'guru',
  'ninja',
  'rockstar',
];
const clicheHits = CLICHES.filter((c) =>
  new RegExp(`\\b${c.replace(/-/g, '[ -]')}\\b`, 'i').test(plain),
);
if (clicheHits.length === 0) pass('Clichés', 'none');
else fail('Clichés', `remove: ${clicheHits.join(', ')}`);

// Sentence-length variance (anti-AI signal)
const sentLens = sentences.map((s) => (s.match(/\b\w+\b/g) || []).length);
if (sentLens.length >= 4) {
  const mean = sentLens.reduce((a, b) => a + b, 0) / sentLens.length;
  const variance = sentLens.reduce((a, b) => a + (b - mean) ** 2, 0) / sentLens.length;
  const cv = mean ? Math.sqrt(variance) / mean : 0;
  if (cv >= 0.35)
    pass('Sentence-length variance', `CV ${cv.toFixed(2)} (humans typically 0.4-0.9)`);
  else warn('Sentence-length variance', `CV ${cv.toFixed(2)} — too uniform`);
}

// First-person check: SOME first-person is fine in a cover letter (it's a letter!),
// but more than 30% of sentences starting with "I" reads self-centred.
const iStarters = sentences.filter((s) => /^I\b/i.test(s)).length;
const iRatio = sentences.length ? iStarters / sentences.length : 0;
if (iRatio <= 0.35)
  pass(
    '"I"-starters',
    `${iStarters}/${sentences.length} sentences (${(iRatio * 100).toFixed(0)}%)`,
  );
else if (iRatio <= 0.5)
  warn('"I"-starters', `${(iRatio * 100).toFixed(0)}% — vary sentence subjects`);
else
  fail(
    '"I"-starters',
    `${(iRatio * 100).toFixed(0)}% — too self-centred; mix in company-perspective sentences`,
  );

// Reading level (cover letters target slightly lower grade than CVs)
const syllableCount = (w) => {
  w = w.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  let count = w.match(/[aeiouy]+/g)?.length || 1;
  if (w.endsWith('e') && count > 1) count--;
  return Math.max(1, count);
};
const wordsForFK = plain.match(/\b[A-Za-z]+\b/g) || [];
const totalSyllables = wordsForFK.reduce((a, w) => a + syllableCount(w), 0);
const fkSentences = Math.max(1, sentences.length);
const fkGrade =
  0.39 * (wordsForFK.length / fkSentences) +
  11.8 * (totalSyllables / Math.max(1, wordsForFK.length)) -
  15.59;
if (fkGrade >= 8 && fkGrade <= 13)
  pass('Flesch-Kincaid grade', `${fkGrade.toFixed(1)} (target 8-13)`);
else if (fkGrade < 8) warn('Flesch-Kincaid grade', `${fkGrade.toFixed(1)} — too simple`);
else fail('Flesch-Kincaid grade', `${fkGrade.toFixed(1)} — too academic for a cover letter`);

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
  `${B}Cover-Letter Quality Report${N}  ${DIM}${resolve(mdPath)}${N}` +
    `${DIM}\n${wordCount} words · ${paragraphs.length} paragraphs · ${sentences.length} sentences${N}`,
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
      ? `  ${G}🟢 personalised, human-voiced, ready to send${N}`
      : `  ${R}🔴 ${failCount} hard fail(s) — revise before sending${N}`),
);
process.exit(failCount > 0 ? 1 : 0);
