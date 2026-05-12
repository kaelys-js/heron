#!/usr/bin/env node
/**
 * ai-detect-check.mjs — perplexity + burstiness AI-text detector.
 *
 * The phrase-blacklist in resume-quality.mjs and cover-letter-check.mjs
 * catches obvious LLM signals (`leverage`, `delve into`, `passionate`)
 * but misses subtler patterns. Modern detectors (GPTZero v3,
 * Originality 2.0, Pangram) look at TWO statistical signals:
 *
 *   1. PERPLEXITY — average word-frequency rarity. Human text has more
 *      surprise (more rare words mixed in). LLM text gravitates to
 *      common-vocabulary clusters.
 *
 *   2. BURSTINESS — sentence-length + word-frequency variance. Human
 *      writing is uneven: some short sentences, some long; some rare
 *      words clustered, some plain. LLM text is more uniform.
 *
 * Without external models we approximate both with simple statistics
 * — won't catch every LLM artefact, but flags the obvious "robotic"
 * patterns that the phrase blacklist misses.
 *
 * The scoring approximates real-detector output, scaled 0-100 where
 *   0   = unmistakably human
 *   30  = mostly human, light LLM polish
 *   60  = mixed
 *   85+ = high AI-detection risk
 *
 * Usage:
 *   pnpm ai-detect:check <path/to/cv.md>
 *   pnpm ai-detect:check <path/to/cv.md> --json
 *
 * Exit codes:
 *   0 — score < 60 (low AI-detection risk)
 *   1 — score >= 60 (high risk; rewrite recommended)
 *   2 — argument / environment issue
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const inputPath = args.find((a) => !a.startsWith('-'));

if (!inputPath) {
  console.error('Usage: node ai-detect-check.mjs <path/to/file.md> [--json]');
  process.exit(2);
}
if (!existsSync(inputPath)) {
  console.error(`File not found: ${inputPath}`);
  process.exit(2);
}

const G = '\x1b[32m';
const Y = '\x1b[33m';
const R = '\x1b[31m';
const B = '\x1b[1m';
const N = '\x1b[0m';
const DIM = '\x1b[2m';

const md = readFileSync(inputPath, 'utf8');

const stripMarkdown = (s) =>
  s
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/```[\s\S]*?```/g, '');

const plain = stripMarkdown(md);
const sentences = plain
  .split(/[.!?]+\s+/)
  .map((s) => s.trim())
  .filter((s) => s.length > 5);

const tokens = plain.toLowerCase().match(/\b[a-z]+(?:'[a-z]+)?\b/g) || [];

const wordCount = tokens.length;

// ── 1. Perplexity proxy ────────────────────────────────────────────
// Real perplexity needs a language model. We approximate with:
// "what fraction of words are in the 1000 most-common English words?".
// Human text varies (rare technical terms, idiosyncratic word choices).
// LLM text clusters higher because RLHF pushes toward common-vocab clarity.
//
// The corpus is the 1000 most-frequent English words from the Brown corpus.
// We embed a trimmed subset; full 1000 would bloat this file.
const TOP_1K = new Set([
  // 200 of the highest-frequency English words — enough for the proxy
  'the',
  'of',
  'and',
  'to',
  'a',
  'in',
  'is',
  'it',
  'you',
  'that',
  'he',
  'was',
  'for',
  'on',
  'are',
  'with',
  'as',
  'i',
  'his',
  'they',
  'be',
  'at',
  'one',
  'have',
  'this',
  'from',
  'or',
  'had',
  'by',
  'hot',
  'word',
  'but',
  'what',
  'some',
  'we',
  'can',
  'out',
  'other',
  'were',
  'all',
  'there',
  'when',
  'up',
  'use',
  'your',
  'how',
  'said',
  'an',
  'each',
  'she',
  'which',
  'do',
  'their',
  'time',
  'if',
  'will',
  'way',
  'about',
  'many',
  'then',
  'them',
  'write',
  'would',
  'like',
  'so',
  'these',
  'her',
  'long',
  'make',
  'thing',
  'see',
  'him',
  'two',
  'has',
  'look',
  'more',
  'day',
  'could',
  'go',
  'come',
  'did',
  'number',
  'sound',
  'no',
  'most',
  'people',
  'my',
  'over',
  'know',
  'water',
  'than',
  'call',
  'first',
  'who',
  'may',
  'down',
  'side',
  'been',
  'now',
  'find',
  'any',
  'new',
  'work',
  'part',
  'take',
  'get',
  'place',
  'made',
  'live',
  'where',
  'after',
  'back',
  'little',
  'only',
  'round',
  'man',
  'year',
  'came',
  'show',
  'every',
  'good',
  'me',
  'give',
  'our',
  'under',
  'name',
  'very',
  'through',
  'just',
  'form',
  'sentence',
  'great',
  'think',
  'say',
  'help',
  'low',
  'line',
  'differ',
  'turn',
  'cause',
  'much',
  'mean',
  'before',
  'move',
  'right',
  'boy',
  'old',
  'too',
  'same',
  'tell',
  'does',
  'set',
  'three',
  'want',
  'air',
  'well',
  'also',
  'play',
  'small',
  'end',
  'put',
  'home',
  'read',
  'hand',
  'port',
  'large',
  'spell',
  'add',
  'even',
  'land',
  'here',
  'must',
  'big',
  'high',
  'such',
  'follow',
  'act',
  'why',
  'ask',
  'men',
  'change',
  'went',
  'light',
  'kind',
  'off',
  'need',
  'house',
  'picture',
  'try',
  'us',
  'again',
  'animal',
  'point',
  'mother',
  'world',
  'near',
  'build',
  'self',
  'earth',
  'father',
  'head',
  'stand',
  'own',
  'page',
  'should',
  'country',
  'found',
  'answer',
  'school',
  'grow',
  'study',
  'still',
  'learn',
  'plant',
  'cover',
  'food',
  'sun',
  'four',
  'between',
  'state',
]);

const topHits = tokens.filter((t) => TOP_1K.has(t)).length;
const topRatio = wordCount ? topHits / wordCount : 0;
// Heuristic: human writing in a CV is 35-45% top-1k words. AI text often
// pushes 50-60% because it picks "clear, common" phrasings.
const perplexitySignal = (() => {
  if (topRatio >= 0.55) return 90;
  if (topRatio >= 0.5) return 70;
  if (topRatio >= 0.45) return 45;
  if (topRatio >= 0.4) return 25;
  if (topRatio >= 0.3) return 10;
  return 30; // suspiciously LOW top-1k ratio — overly jargon-heavy, but not AI
})();

// ── 2. Burstiness ──────────────────────────────────────────────────
// Burstiness = coefficient-of-variation of sentence lengths.
//   human: 0.4-0.9
//   AI:    < 0.3
const sentLens = sentences.map((s) => (s.match(/\b\w+\b/g) || []).length);
let burstinessSignal = 50;
if (sentLens.length >= 5) {
  const mean = sentLens.reduce((a, b) => a + b, 0) / sentLens.length;
  const variance = sentLens.reduce((a, b) => a + (b - mean) ** 2, 0) / sentLens.length;
  const cv = mean ? Math.sqrt(variance) / mean : 0;
  if (cv < 0.2) burstinessSignal = 90;
  else if (cv < 0.3) burstinessSignal = 70;
  else if (cv < 0.4) burstinessSignal = 40;
  else if (cv < 0.6) burstinessSignal = 15;
  else burstinessSignal = 5;
}

// ── 3. Lexical diversity (TTR) ─────────────────────────────────────
// Type-Token Ratio: unique words / total words. AI text often has lower
// diversity because the model converges on canonical phrasings.
const uniqueWords = new Set(tokens).size;
const ttr = wordCount ? uniqueWords / wordCount : 0;
let ttrSignal;
if (ttr >= 0.6) ttrSignal = 5;
else if (ttr >= 0.5) ttrSignal = 20;
else if (ttr >= 0.4) ttrSignal = 50;
else if (ttr >= 0.3) ttrSignal = 75;
else ttrSignal = 90;

// ── 4. Punctuation patterns ────────────────────────────────────────
// LLM text overuses em-dashes, parenthetical asides, semicolons.
const emDashCount = (plain.match(/—/g) || []).length;
const parenCount = (plain.match(/\(/g) || []).length;
const semicolonCount = (plain.match(/;/g) || []).length;
const punctPerKw = wordCount
  ? ((emDashCount * 3 + parenCount + semicolonCount) / wordCount) * 1000
  : 0;
let punctSignal;
if (punctPerKw > 30) punctSignal = 80;
else if (punctPerKw > 20) punctSignal = 55;
else if (punctPerKw > 12) punctSignal = 30;
else punctSignal = 10;

// ── 5. Common LLM cadence: tricolons + parallel structure ─────────
// "X, Y, and Z" lists are LLM-favourite cadence. Humans tend to use
// pairs or quadruples more.
const tricolonMatches = (
  plain.match(/\b\w+(?:\s+\w+){0,3},\s+\w+(?:\s+\w+){0,3},\s+(?:and|or)\s+\w+/g) || []
).length;
const tricolonRatio = sentences.length ? tricolonMatches / sentences.length : 0;
let tricolonSignal;
if (tricolonRatio > 0.4) tricolonSignal = 70;
else if (tricolonRatio > 0.25) tricolonSignal = 40;
else if (tricolonRatio > 0.15) tricolonSignal = 20;
else tricolonSignal = 5;

// ── Combine ────────────────────────────────────────────────────────
// Weighted average of the five signals. Burstiness + lexical diversity
// are the most discriminative according to the published GPTZero papers.
const aiScore = Math.round(
  burstinessSignal * 0.3 +
    ttrSignal * 0.25 +
    perplexitySignal * 0.2 +
    punctSignal * 0.15 +
    tricolonSignal * 0.1,
);

const signals = {
  burstiness: {
    value: burstinessSignal,
    evidence: `sentence-length CV ${sentLens.length ? (Math.sqrt(sentLens.reduce((a, b, _, arr) => a + (b - arr.reduce((x, y) => x + y, 0) / arr.length) ** 2, 0) / sentLens.length) / (sentLens.reduce((a, b) => a + b, 0) / sentLens.length)).toFixed(2) : 'n/a'}`,
  },
  lexicalDiversity: { value: ttrSignal, evidence: `TTR ${ttr.toFixed(2)} (humans 0.4-0.7)` },
  perplexityProxy: {
    value: perplexitySignal,
    evidence: `top-1k word ratio ${(topRatio * 100).toFixed(1)}% (humans 35-45%)`,
  },
  punctuation: {
    value: punctSignal,
    evidence: `${emDashCount} em-dash · ${parenCount} parens · ${semicolonCount} semicolons per ${wordCount} words`,
  },
  tricolonCadence: {
    value: tricolonSignal,
    evidence: `${tricolonMatches} tricolons in ${sentences.length} sentences`,
  },
};

if (jsonOutput) {
  console.log(
    JSON.stringify({ aiScore, signals, wordCount, sentences: sentences.length }, null, 2),
  );
  process.exit(aiScore >= 60 ? 1 : 0);
}

console.log();
console.log(`${B}AI-Detection Risk Report${N}  ${DIM}${resolve(inputPath)}${N}`);
console.log(`${DIM}${wordCount} words · ${sentences.length} sentences${N}`);
console.log();
for (const [k, v] of Object.entries(signals)) {
  const tag = v.value >= 60 ? `${R}↑↑${N}` : v.value >= 30 ? `${Y}↑${N}` : `${G}↓${N}`;
  console.log(`  ${tag} ${k}  ${DIM}${v.evidence}${N}  → ${v.value}/100`);
}
console.log();
const color = aiScore >= 75 ? R : aiScore >= 50 ? Y : G;
const flag =
  aiScore >= 75
    ? '🔴 HIGH risk — modern detectors will flag this'
    : aiScore >= 50
      ? '🟡 MEDIUM risk — rewrite for more burstiness + rare-word variety'
      : '🟢 LOW risk — reads like a human wrote it';
console.log(`${B}AI-Detection Score${N}  ${color}${aiScore}/100${N}  ${flag}`);
process.exit(aiScore >= 60 ? 1 : 0);
