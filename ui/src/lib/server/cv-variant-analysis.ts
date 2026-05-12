/**
 * cv-variant-analysis — what's making some applications convert + others
 * ghost? Correlate CV variants with outcomes.
 *
 * The system already generates per-job tailored CVs. After 50+
 * applications, the question is: which TAILORING moves correlate with
 * positive outcomes (response, screen, advance) vs which don't?
 *
 * Approach (intentionally simple, explainable):
 *   1. For every job, identify its CV variant by:
 *      - Top 10 keywords in the tailored CV's content (vs. cv-general's
 *        baseline) — these are what got injected per JD
 *      - Length delta vs cv-general
 *      - Score range bracket the job fell in
 *   2. Tag each application with its outcome bucket (positive: applied →
 *      screened+, negative: rejected/ghosted, pending)
 *   3. Surface: keywords that appear MORE in positive-outcome CVs than
 *      negative-outcome ones, AND the inverse
 *
 * Output a small structured report the user can read in 2 minutes,
 * and a one-line summary surfaced on /patterns.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './files';
import { loadAllJobs } from './parsers';
import { profilePath } from './profile-paths';

export type CvVariantReport = {
  totalAnalyzed: number;
  positiveCount: number;
  negativeCount: number;
  pendingCount: number;
  /** Keywords that appear more in positive-outcome CVs (signal: this
   *  tailoring move is working). */
  winningKeywords: { keyword: string; positiveCount: number; negativeCount: number }[];
  /** Keywords that appear more in negative-outcome CVs (signal: this
   *  move may be hurting OR is just noise — investigate). */
  underperformingKeywords: { keyword: string; positiveCount: number; negativeCount: number }[];
  /** Length-delta correlation: are longer or shorter tailored CVs
   *  converting more? */
  lengthCorrelation: {
    avgLengthPositive: number;
    avgLengthNegative: number;
    finding: string;
  };
  /** Score-bracket correlation: at what Gemini-score bucket does
   *  conversion drop off? */
  scoreCorrelation: { bucket: string; positive: number; negative: number; rate: number }[];
};

/** Cheap-ish word frequency from a CV-style markdown file. */
function topWords(text: string, n = 100): Map<string, number> {
  const counts = new Map<string, number>();
  // Lowercase, strip markdown punctuation, collapse whitespace, split.
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9+#./\-\s]/g, ' ')
    .split(/\s+/);
  const STOP = new Set([
    'a',
    'an',
    'and',
    'are',
    'as',
    'at',
    'be',
    'by',
    'for',
    'from',
    'has',
    'have',
    'i',
    'in',
    'of',
    'on',
    'or',
    'that',
    'the',
    'this',
    'to',
    'was',
    'will',
    'with',
    'you',
    'your',
    'at',
    'my',
    'are',
    'we',
    'our',
    'team',
    'company',
    'engineer',
    'engineering',
    'software',
    'development',
    'work',
    'years',
  ]);
  for (const w of cleaned) {
    if (w.length < 3 || STOP.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return new Map([...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n));
}

function readGeneralCv(profileId: string): string {
  // The "general CV" baseline is cv.md.
  try {
    const p = profilePath(profileId, 'cv-md');
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  } catch {
    return '';
  }
}

function readTailoredPdfMarkdown(profileId: string, pdfFile: string): string {
  // The tailored CV is generated as markdown then rendered to PDF. As of
  // pdf-mode update, the markdown sibling lives next to the PDF. For PDFs
  // generated BEFORE that update, we fall back to: (a) the HTML in /tmp
  // (often deleted), (b) the cover-letter sibling (less precise but
  // still useful for keyword tracking).
  try {
    const p = path.join(ROOT, pdfFile);
    const mdPath = p.replace(/\.pdf$/, '.md');
    if (fs.existsSync(mdPath)) return fs.readFileSync(mdPath, 'utf8');
    // Fallback: the cover-letter sibling often has the same JD keywords.
    const coverPath = p.replace(/\.pdf$/, '-cover.md');
    if (fs.existsSync(coverPath)) return fs.readFileSync(coverPath, 'utf8');
  } catch {}
  return '';
}

/** Diagnostic: count how many PDFs in the profile's output dir DO have
 *  the .md sibling. The CV-variant analysis page surfaces this so users
 *  understand WHY they might be seeing "not enough data." */
export function preservationStats(profileId: string): {
  withMd: number;
  withoutMd: number;
  total: number;
} {
  let withMd = 0,
    withoutMd = 0;
  const out = { withMd: 0, withoutMd: 0, total: 0 };
  let outDir: string;
  try {
    outDir = profilePath(profileId, 'output-dir');
  } catch {
    return out;
  }
  if (!fs.existsSync(outDir)) return out;
  let entries: string[];
  try {
    entries = fs.readdirSync(outDir);
  } catch {
    return out;
  }
  for (const f of entries) {
    if (!f.endsWith('.pdf')) continue;
    if (f.startsWith('cv-general')) continue;
    out.total++;
    const mdPath = path.join(outDir, f.replace(/\.pdf$/, '.md'));
    if (fs.existsSync(mdPath)) withMd++;
    else withoutMd++;
  }
  out.withMd = withMd;
  out.withoutMd = withoutMd;
  return out;
}

function bucketScore(score: number | undefined): string {
  if (score == null) return 'unscored';
  if (score >= 4.5) return '4.5+';
  if (score >= 4.0) return '4.0-4.4';
  if (score >= 3.5) return '3.5-3.9';
  if (score >= 3.0) return '3.0-3.4';
  return '< 3.0';
}

const POSITIVE_STATUSES = new Set([
  'Applied',
  'Screened',
  'PhoneScreen',
  'Technical',
  'TakeHome',
  'Onsite',
  'Final',
  'Interview',
  'Offer',
]);
const NEGATIVE_STATUSES = new Set(['Rejected', 'Closed']);

/** Run the analysis for a profile. Pure-function, no LLM. */
export function analyzeCvVariants(profileId: string): CvVariantReport {
  const general = readGeneralCv(profileId);
  const generalWords = topWords(general, 200);
  const allJobs = loadAllJobs(profileId);

  // Track keyword counts split by outcome.
  type KeywordTally = { keyword: string; positive: number; negative: number };
  const keywordTallies = new Map<string, KeywordTally>();

  let totalAnalyzed = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  let pendingCount = 0;
  let lenSumPositive = 0;
  let lenSumNegative = 0;

  const scoreBuckets: Record<string, { positive: number; negative: number }> = {};

  for (const job of allJobs) {
    if (!job.pdfFile) continue;
    const tailored = readTailoredPdfMarkdown(profileId, job.pdfFile);
    if (!tailored) continue;
    totalAnalyzed++;

    const tailoredWords = topWords(tailored, 200);
    // The "injected" keywords are ones that appear MORE in tailored than general.
    const injected: string[] = [];
    for (const [w, cnt] of tailoredWords.entries()) {
      const baseCnt = generalWords.get(w) ?? 0;
      if (cnt - baseCnt >= 2) injected.push(w);
    }

    const outcome: 'positive' | 'negative' | 'pending' = POSITIVE_STATUSES.has(job.status)
      ? 'positive'
      : NEGATIVE_STATUSES.has(job.status)
        ? 'negative'
        : 'pending';
    if (outcome === 'positive') {
      positiveCount++;
      lenSumPositive += tailored.length;
    } else if (outcome === 'negative') {
      negativeCount++;
      lenSumNegative += tailored.length;
    } else pendingCount++;

    for (const k of injected) {
      if (!keywordTallies.has(k)) keywordTallies.set(k, { keyword: k, positive: 0, negative: 0 });
      const t = keywordTallies.get(k)!;
      if (outcome === 'positive') t.positive++;
      else if (outcome === 'negative') t.negative++;
    }

    const b = bucketScore(job.score ?? job.geminiScore);
    if (!scoreBuckets[b]) scoreBuckets[b] = { positive: 0, negative: 0 };
    if (outcome === 'positive') scoreBuckets[b].positive++;
    else if (outcome === 'negative') scoreBuckets[b].negative++;
  }

  // Winning keywords = positive > negative + minimum threshold.
  const winningKeywords = [...keywordTallies.values()]
    .filter((t) => t.positive >= 2 && t.positive > t.negative * 1.5)
    .sort((a, b) => b.positive - b.negative - (a.positive - a.negative))
    .slice(0, 10)
    .map((t) => ({ keyword: t.keyword, positiveCount: t.positive, negativeCount: t.negative }));

  // Underperforming = appears mostly in negative outcomes.
  const underperformingKeywords = [...keywordTallies.values()]
    .filter((t) => t.negative >= 2 && t.negative > t.positive * 1.5)
    .sort((a, b) => b.negative - b.positive - (a.negative - a.positive))
    .slice(0, 10)
    .map((t) => ({ keyword: t.keyword, positiveCount: t.positive, negativeCount: t.negative }));

  const avgLengthPositive = positiveCount > 0 ? Math.round(lenSumPositive / positiveCount) : 0;
  const avgLengthNegative = negativeCount > 0 ? Math.round(lenSumNegative / negativeCount) : 0;
  let lengthFinding = 'Not enough data yet.';
  if (positiveCount >= 3 && negativeCount >= 3) {
    if (avgLengthPositive > avgLengthNegative * 1.1) {
      lengthFinding =
        'Longer tailored CVs convert MORE. The injected keywords + framing are adding value.';
    } else if (avgLengthNegative > avgLengthPositive * 1.1) {
      lengthFinding = 'Shorter tailored CVs convert MORE. You may be over-padding; tighten.';
    } else {
      lengthFinding = 'Length not predictive of outcome. Optimize for keyword fit, not word count.';
    }
  }

  const scoreCorrelation = Object.entries(scoreBuckets)
    .map(([bucket, c]) => ({
      bucket,
      positive: c.positive,
      negative: c.negative,
      rate:
        c.positive + c.negative > 0
          ? Math.round((c.positive / (c.positive + c.negative)) * 100)
          : 0,
    }))
    .sort((a, b) => {
      const order: Record<string, number> = {
        '4.5+': 0,
        '4.0-4.4': 1,
        '3.5-3.9': 2,
        '3.0-3.4': 3,
        '< 3.0': 4,
        unscored: 5,
      };
      return (order[a.bucket] ?? 99) - (order[b.bucket] ?? 99);
    });

  return {
    totalAnalyzed,
    positiveCount,
    negativeCount,
    pendingCount,
    winningKeywords,
    underperformingKeywords,
    lengthCorrelation: { avgLengthPositive, avgLengthNegative, finding: lengthFinding },
    scoreCorrelation,
  };
}
