/** keyword-match -- deterministic JD ⇄ CV keyword-overlap score (pre-LLM
 *  ATS-readiness check). pdf mode tells Claude to inject the JD's keywords
 *  into the tailored CV; this module verifies it happened.
 *  Algorithm: tokenize → lowercase → drop stopwords; take 1/2/3-grams from
 *  the JD (3-grams catch "machine learning engineer"); weight matched
 *  n-grams 3x/2x/1x; score = sum(matched)/sum(all) × 100.
 *  Returns score + matched + missing for the UI chip cloud. Pure string
 *  ops, no LLM, sub-millisecond per pair. */

// Common stopwords we drop before scoring -- these are noise for ATS matching.
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'been',
  'being',
  'but',
  'by',
  'do',
  'does',
  'doing',
  'done',
  'for',
  'from',
  'had',
  'has',
  'have',
  'he',
  'her',
  'here',
  'his',
  'how',
  'i',
  'in',
  'into',
  'is',
  'it',
  'its',
  'just',
  'me',
  'more',
  'most',
  'my',
  'no',
  'nor',
  'not',
  'of',
  'on',
  'once',
  'one',
  'only',
  'or',
  'other',
  'our',
  'out',
  'over',
  'own',
  'same',
  'she',
  'should',
  'so',
  'some',
  'such',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'to',
  'too',
  'up',
  'us',
  'very',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'will',
  'with',
  'you',
  'your',
  'about',
  'after',
  'again',
  'against',
  'all',
  'also',
  'any',
  'because',
  'before',
  'below',
  'between',
  'both',
  'can',
  'could',
  'down',
  'during',
  'each',
  'few',
  'further',
  'if',
  'off',
  'or',
  'so',
  'such',
  'until',
  'upon',
  'while',
  // Job-board boilerplate noise.
  'role',
  'job',
  'position',
  'opportunity',
  'team',
  'company',
  'work',
  'working',
  'experience',
  'years',
  'year',
  'plus',
  'including',
  'include',
  'preferred',
  'required',
  'requirement',
  'requirements',
  'must',
  'looking',
  'seeking',
]);

/** Tokenize text to a lower-case set of non-stopword tokens. */
function tokenize(text: string): string[] {
  return (
    (text || '')
      .toLowerCase()
      // Keep letters, digits, and a small set of in-word chars (+/./# for c++, c#, .NET).
      .replace(/[^a-z0-9+#./\-\s]/g, ' ')
      .split(/\s+/)
      .map((t) => t.replace(/^[-./]+|[-./]+$/g, ''))
      .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
  );
}

/** N-grams over a token array. n=2 returns "machine learning" style phrases. */
function ngrams(tokens: string[], n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i + n <= tokens.length; i++) {
    out.push(tokens.slice(i, i + n).join(' '));
  }
  return out;
}

export type KeywordMatchResult = {
  /** 0-100, weighted across n-gram sizes. */
  score: number;
  /** JD keywords that DO appear in the CV. Sorted by weight (3-grams first). */
  matched: string[];
  /** JD keywords that are MISSING from the CV. Sorted by weight. */
  missing: string[];
  /** Counts of considered keywords by n-gram size. */
  considered: { unigrams: number; bigrams: number; trigrams: number };
};

/**
 * Score how well the CV covers the JD's vocabulary. Stable across runs --
 * the same (jd, cv) pair always returns the same numbers.
 */
export function keywordMatch(jd: string, cv: string): KeywordMatchResult {
  const jdTokens = tokenize(jd);
  const cvTokenSet = new Set(tokenize(cv));

  if (jdTokens.length === 0) {
    return {
      score: 0,
      matched: [],
      missing: [],
      considered: { unigrams: 0, bigrams: 0, trigrams: 0 },
    };
  }

  // Dedup each n-gram set so a JD that says "Python" 15 times doesn't
  // dominate the score.
  const uni = Array.from(new Set(jdTokens));
  const bi = Array.from(new Set(ngrams(jdTokens, 2)));
  const tri = Array.from(new Set(ngrams(jdTokens, 3)));

  // For matching: 1-grams must appear as a token in the CV set; 2/3-grams
  // must appear as a substring of the TOKENIZED CV string (NOT the raw
  // CV lowercase). Using the tokenized join means commas/dashes/punctuation
  // in either the JD or CV don't break phrase detection -- "react, node.js"
  // tokenizes to "react node.js" which matches the JD bigram "react node.js".
  const cvNormalized = tokenize(cv).join(' ');
  const matchUnigram = (t: string) => cvTokenSet.has(t);
  const matchPhrase = (p: string) => cvNormalized.includes(p);

  const w1 = 1,
    w2 = 2,
    w3 = 3;
  let totalWeight = 0;
  let matchedWeight = 0;
  const matched: { term: string; weight: number }[] = [];
  const missing: { term: string; weight: number }[] = [];

  for (const t of uni) {
    totalWeight += w1;
    if (matchUnigram(t)) {
      matchedWeight += w1;
      matched.push({ term: t, weight: w1 });
    } else {
      missing.push({ term: t, weight: w1 });
    }
  }
  for (const p of bi) {
    totalWeight += w2;
    if (matchPhrase(p)) {
      matchedWeight += w2;
      matched.push({ term: p, weight: w2 });
    } else {
      missing.push({ term: p, weight: w2 });
    }
  }
  for (const p of tri) {
    totalWeight += w3;
    if (matchPhrase(p)) {
      matchedWeight += w3;
      matched.push({ term: p, weight: w3 });
    } else {
      missing.push({ term: p, weight: w3 });
    }
  }

  const score = totalWeight === 0 ? 0 : Math.round((matchedWeight / totalWeight) * 100);

  // Sort by weight desc (multi-word terms first -- more meaningful for UI).
  matched.sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term));
  missing.sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term));

  return {
    score,
    matched: matched.map((m) => m.term),
    missing: missing.map((m) => m.term),
    considered: { unigrams: uni.length, bigrams: bi.length, trigrams: tri.length },
  };
}

/**
 * Heuristic to extract the JD text from a report markdown file. The
 * evaluate mode embeds the original JD inside "## JD" or as the first
 * block. Falls back to the full report if no marker is found.
 */
export function extractJdFromReport(reportMd: string): string {
  // Try "## JD" or "## Job Description" sections.
  const sections = reportMd.split(/^## /m);
  for (const sec of sections) {
    const first = sec.split('\n')[0] ?? '';
    if (/^(jd|job description|posting)\b/i.test(first.trim())) {
      // Take this section's body up to the next major header.
      return sec.slice(first.length).trim();
    }
  }
  return reportMd;
}
