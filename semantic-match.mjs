#!/usr/bin/env node
/**
 * semantic-match.mjs — semantic similarity scorer for CV ↔ JD pairs.
 *
 * Modern ATS-on-top-of-AI tools (Eightfold AI, Phenom, HireVue, Beamery,
 * Pymetrics, Harver, Plum) score "fit" against the JD using semantic
 * embeddings — NOT keyword regex. A CV that lexically matches the JD
 * may STILL underperform a CV with deeper conceptual match.
 *
 * Real embedding APIs (OpenAI, Cohere, Voyage) would give the truest
 * signal but cost money + latency per call. This script approximates
 * cosine similarity via:
 *
 *   1. TF-IDF over the union of CV + JD vocabulary (so rare terms in
 *      the JD that ALSO appear in CV score high — that's where
 *      semantic match actually lives).
 *   2. Bag-of-bigrams to capture short phrasal context ("kubernetes
 *      operator", "growth equity", "design systems") that single-word
 *      TF-IDF misses.
 *   3. Concept buckets — pre-defined synonym groups (e.g.
 *      "leadership"={lead, manage, mentor, coached, owned, drove}) so
 *      that "drove revenue" on the CV matches "lead growth" on the JD
 *      even though no token overlaps.
 *
 * The composite score is 0-100. Per-section breakdown shows which
 * parts of the JD the CV does + doesn't engage with, so the user can
 * see what to surface.
 *
 * Usage:
 *   pnpm semantic:match <cv.md> <jd.txt-or-md>
 *   pnpm semantic:match <cv.md> <jd.txt> --json
 *
 * Exit codes:
 *   0  — match score ≥ 60 (looks tailored)
 *   1  — score 40-59 (acceptable but rewrite specific sections)
 *   2  — score < 40 (looks generic; tailor the CV before applying)
 *   3  — env / argument issue
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const positional = args.filter((a) => !a.startsWith('-'));
const [cvPath, jdPath] = positional;

if (!cvPath || !jdPath) {
  console.error('Usage: node semantic-match.mjs <cv.md> <jd.txt> [--json]');
  process.exit(3);
}
if (!existsSync(cvPath) || !existsSync(jdPath)) {
  console.error(`File not found: ${!existsSync(cvPath) ? cvPath : jdPath}`);
  process.exit(3);
}

const G = '\x1b[32m';
const Y = '\x1b[33m';
const R = '\x1b[31m';
const B = '\x1b[1m';
const DIM = '\x1b[2m';
const N = '\x1b[0m';

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'of',
  'to',
  'in',
  'on',
  'for',
  'with',
  'at',
  'by',
  'from',
  'as',
  'is',
  'was',
  'are',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'can',
  'this',
  'that',
  'these',
  'those',
  'i',
  'you',
  'he',
  'she',
  'it',
  'we',
  'they',
  'them',
  'their',
  'our',
  'my',
  'your',
  'his',
  'her',
  'its',
  'what',
  'which',
  'who',
  'whom',
  'whose',
  'when',
  'where',
  'why',
  'how',
  'about',
  'than',
  'then',
  'so',
  'if',
  'because',
  'while',
  'during',
  'through',
  'over',
  'under',
  'into',
  'onto',
  'than',
  'too',
  'very',
  'just',
  'very',
  'also',
  'more',
  'most',
  'some',
  'such',
  'no',
  'not',
  'only',
  'same',
  'than',
  'too',
  'can',
  'will',
  'our',
  'one',
  'two',
  'three',
  'many',
  'any',
  'all',
  'both',
  'each',
  'few',
  'other',
  'own',
  'same',
  'new',
  'old',
  'first',
  'last',
  'years',
  'year',
]);

function tokenize(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function bigrams(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length - 1; i++) out.push(tokens[i] + ' ' + tokens[i + 1]);
  return out;
}

/** Pre-built concept buckets. When a term in one bucket appears, every
 *  other term in that bucket gets a partial-credit hit. This is the
 *  cheapest possible "semantic match" without embeddings. */
const CONCEPT_BUCKETS = {
  leadership: [
    'lead',
    'led',
    'manage',
    'managed',
    'mentor',
    'mentored',
    'coached',
    'owned',
    'drove',
    'direct',
    'directed',
    'head',
    'headed',
    'spearheaded',
    'championed',
    'built team',
  ],
  shipping: [
    'shipped',
    'launched',
    'delivered',
    'released',
    'rolled out',
    'deployed',
    'put live',
    'launched',
    'went live',
  ],
  scale: [
    'scale',
    'scaled',
    'scaling',
    'high-volume',
    'million',
    'billion',
    'throughput',
    'qps',
    'tps',
    'rps',
    'high-traffic',
  ],
  growth: [
    'growth',
    'grew',
    'growing',
    'expanded',
    'acceleration',
    'revenue',
    'arr',
    'mrr',
    'retention',
    'activation',
    'conversion',
    'acquisition',
  ],
  efficiency: [
    'reduced',
    'cut',
    'optimised',
    'optimized',
    'improved',
    'faster',
    'latency',
    'performance',
    'throughput',
    'cost',
    'sla',
    'slo',
  ],
  collaboration: [
    'cross-functional',
    'stakeholder',
    'partnered',
    'aligned',
    'collaborated',
    'worked with',
    'liaised',
    'co-led',
  ],
  ml: [
    'machine learning',
    'ml',
    'llm',
    'rag',
    'transformer',
    'embedding',
    'vector',
    'semantic',
    'training',
    'fine-tune',
    'fine-tuned',
    'prompt',
    'model',
    'inference',
    'genai',
    'generative',
  ],
  data: [
    'data',
    'analytics',
    'sql',
    'warehouse',
    'etl',
    'elt',
    'dbt',
    'snowflake',
    'bigquery',
    'redshift',
    'pipeline',
    'dashboard',
    'metric',
    'kpi',
  ],
  infra: [
    'kubernetes',
    'k8s',
    'terraform',
    'aws',
    'gcp',
    'azure',
    'cloud',
    'docker',
    'helm',
    'ci',
    'cd',
    'platform',
    'infrastructure',
    'sre',
    'reliability',
    'observability',
  ],
  frontend: [
    'react',
    'vue',
    'svelte',
    'typescript',
    'frontend',
    'ui',
    'ux',
    'design system',
    'component',
    'accessibility',
    'a11y',
  ],
  backend: [
    'api',
    'microservice',
    'golang',
    'rust',
    'python',
    'node',
    'java',
    'spring',
    'postgres',
    'postgresql',
    'mysql',
    'redis',
    'queue',
    'kafka',
    'event-driven',
  ],
  security: [
    'security',
    'vulnerability',
    'threat model',
    'soc2',
    'iso27001',
    'pci',
    'gdpr',
    'hipaa',
    'penetration',
    'encryption',
    'identity',
    'iam',
    'sso',
    'oauth',
  ],
  product: [
    'product',
    'roadmap',
    'prioritisation',
    'prioritization',
    'user research',
    'discovery',
    'strategy',
    'vision',
    'okr',
    'okrs',
  ],
  testing: [
    'test',
    'testing',
    'tdd',
    'bdd',
    'unit test',
    'integration test',
    'e2e',
    'playwright',
    'cypress',
    'quality',
  ],
  ownership: [
    'ownership',
    'responsible',
    'accountable',
    'owned end-to-end',
    'full cycle',
    'autonomous',
    'self-directed',
  ],
};

function readDoc(path) {
  return readFileSync(path, 'utf8');
}

const cvRaw = readDoc(cvPath);
const jdRaw = readDoc(jdPath);

const cvTokens = tokenize(cvRaw);
const jdTokens = tokenize(jdRaw);
const cvBigrams = bigrams(cvTokens);
const jdBigrams = bigrams(jdTokens);

// ── 1. TF-IDF cosine ──────────────────────────────────────────────────
// Build vocabulary from JD (only JD-vocab matters for "does CV match JD")
function termFreq(tokens) {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  return tf;
}

const jdTf = termFreq(jdTokens);
const cvTf = termFreq(cvTokens);

// "IDF" approximation — terms that appear 1-2× in the JD are rarer than
// terms that appear 10× (which are stop-word-ish even after stopword removal).
function idf(t) {
  const f = jdTf.get(t) || 0;
  if (f >= 10) return 0.3;
  if (f >= 5) return 0.6;
  if (f >= 2) return 0.85;
  return 1.0;
}

let cosNum = 0;
let cvSq = 0;
let jdSq = 0;
for (const [t, jdFreq] of jdTf) {
  const cvFreq = cvTf.get(t) || 0;
  const w = idf(t);
  cosNum += cvFreq * jdFreq * w * w;
  cvSq += (cvFreq * w) ** 2;
  jdSq += (jdFreq * w) ** 2;
}
const tfIdfCos = cvSq && jdSq ? cosNum / Math.sqrt(cvSq * jdSq) : 0;
const tfIdfScore = Math.min(100, Math.round(tfIdfCos * 100));

// ── 2. Bigram overlap ────────────────────────────────────────────────
const jdBigramSet = new Set(jdBigrams);
const cvBigramSet = new Set(cvBigrams);
let bgHits = 0;
for (const bg of jdBigramSet) if (cvBigramSet.has(bg)) bgHits++;
const bigramScore = jdBigramSet.size ? Math.round((bgHits / jdBigramSet.size) * 100) : 0;

// ── 3. Concept-bucket match ──────────────────────────────────────────
function bucketHits(text, bucket) {
  const lower = text.toLowerCase();
  return bucket.filter((b) => lower.includes(b)).length;
}

const conceptMatches = [];
let conceptHitTotal = 0;
let conceptPossibleTotal = 0;
for (const [name, terms] of Object.entries(CONCEPT_BUCKETS)) {
  const inJd = bucketHits(jdRaw, terms);
  if (inJd === 0) continue; // JD doesn't care about this concept
  const inCv = bucketHits(cvRaw, terms);
  conceptMatches.push({ concept: name, jdMatches: inJd, cvMatches: inCv });
  conceptHitTotal += Math.min(inJd, inCv);
  conceptPossibleTotal += inJd;
}
const conceptScore = conceptPossibleTotal
  ? Math.round((conceptHitTotal / conceptPossibleTotal) * 100)
  : 0;

// ── Composite ────────────────────────────────────────────────────────
const composite = Math.round(tfIdfScore * 0.4 + bigramScore * 0.25 + conceptScore * 0.35);

// Find concepts the JD CARES ABOUT that the CV is silent on — the
// most actionable feedback in the whole report.
const gaps = conceptMatches.filter((c) => c.cvMatches === 0 && c.jdMatches >= 2);

if (jsonOutput) {
  console.log(
    JSON.stringify(
      {
        composite,
        tfIdfScore,
        bigramScore,
        conceptScore,
        conceptMatches,
        gaps: gaps.map((g) => g.concept),
        cvWordCount: cvTokens.length,
        jdWordCount: jdTokens.length,
      },
      null,
      2,
    ),
  );
  process.exit(composite >= 60 ? 0 : composite >= 40 ? 1 : 2);
}

console.log();
console.log(`${B}Semantic Match Report${N}  ${DIM}${resolve(cvPath)} ↔ ${resolve(jdPath)}${N}`);
console.log(`${DIM}${cvTokens.length} CV words · ${jdTokens.length} JD words${N}`);
console.log();
console.log(
  `  ${B}TF-IDF cosine${N}     ${tfIdfScore >= 60 ? G : tfIdfScore >= 40 ? Y : R}${tfIdfScore}/100${N}  ${DIM}weighted unigram overlap${N}`,
);
console.log(
  `  ${B}Bigram match${N}      ${bigramScore >= 60 ? G : bigramScore >= 40 ? Y : R}${bigramScore}/100${N}  ${DIM}${bgHits}/${jdBigramSet.size} 2-word phrases${N}`,
);
console.log(
  `  ${B}Concept match${N}     ${conceptScore >= 60 ? G : conceptScore >= 40 ? Y : R}${conceptScore}/100${N}  ${DIM}${conceptHitTotal}/${conceptPossibleTotal} concept hits${N}`,
);

if (gaps.length) {
  console.log();
  console.log(`${B}Concepts the JD cares about that your CV is silent on:${N}`);
  for (const g of gaps) {
    console.log(`  ${R}↓${N} ${g.concept}  ${DIM}(JD mentions ${g.jdMatches}×, CV mentions 0)${N}`);
  }
  console.log();
  console.log(
    `${DIM}Surface these on your CV — even one sentence per concept moves the needle.${N}`,
  );
}

console.log();
const color = composite >= 60 ? G : composite >= 40 ? Y : R;
const flag =
  composite >= 60
    ? '🟢 Looks tailored — semantic match is solid'
    : composite >= 40
      ? '🟡 Acceptable — rewrite the gaps above'
      : '🔴 Looks generic — significant rewrite needed before applying';
console.log(`${B}Composite Semantic Score${N}  ${color}${composite}/100${N}  ${flag}`);
process.exit(composite >= 60 ? 0 : composite >= 40 ? 1 : 2);
