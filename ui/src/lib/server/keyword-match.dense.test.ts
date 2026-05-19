/**
 * lib/server/keyword-match -- dense table-driven coverage.
 */
import { describe, expect, it } from 'vitest';
import { keywordMatch } from './keyword-match';

describe('keywordMatch — identical input → 100', () => {
  it.each([
    'python',
    'python rust go',
    'python rust go kubernetes docker',
    'amazon web services',
    'machine learning engineer needed',
    'senior backend engineer with python and aws experience',
  ])('text "%s"', (text) => {
    expect(keywordMatch(text, text).score).toBe(100);
  });
});

describe('keywordMatch — empty cases', () => {
  it.each(['python', 'rust go', 'kubernetes aws'])('empty CV → 0 for JD "%s"', (jd) => {
    expect(keywordMatch(jd, '').score).toBe(0);
  });

  it.each([
    'cv text',
    'i know python',
    'experience here',
  ])('empty JD → 0 even with CV "%s"', (cv) => {
    expect(keywordMatch('', cv).score).toBe(0);
  });
});

describe('keywordMatch — stopword filtering', () => {
  it.each([
    ['the python', 'python'],
    ['a python', 'python'],
    ['and python', 'python'],
    ['the and a python', 'python'],
  ])('"%s" → only counts non-stopwords', (jd, cv) => {
    const r = keywordMatch(jd, cv);
    expect(r.considered.unigrams).toBe(1); // only "python" after stopword strip
  });
});

describe('keywordMatch — case sensitivity', () => {
  it.each([
    ['PYTHON', 'python'],
    ['Python', 'python'],
    ['python', 'PYTHON'],
    ['Python', 'PYTHON'],
    ['pYtHoN', 'PyThOn'],
  ])('case "%s" vs "%s" → 100', (jd, cv) => {
    expect(keywordMatch(jd, cv).score).toBe(100);
  });
});

describe('keywordMatch — punctuation handling', () => {
  it.each([
    ['python.', 'python'],
    ['python,', 'python'],
    ['python!', 'python'],
    ['python?', 'python'],
    ['python;', 'python'],
    ['(python)', 'python'],
    ['[python]', 'python'],
  ])('punctuation "%s" matches "%s"', (jd, cv) => {
    expect(keywordMatch(jd, cv).score).toBe(100);
  });
});

describe('keywordMatch — bounded score', () => {
  it.each([
    ['python rust go', 'python'],
    ['python rust go kubernetes', 'python rust'],
    ['python', 'python rust go'],
    ['unrelated words', 'python rust go'],
    ['a b c d e f', 'g h i j k l'],
  ])('score is 0-100 for "%s" vs "%s"', (jd, cv) => {
    const r = keywordMatch(jd, cv);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe('keywordMatch — n-gram counts', () => {
  it.each([
    ['python', { uni: 1, bi: 0, tri: 0 }],
    ['python rust', { uni: 2, bi: 1, tri: 0 }],
    ['python rust go', { uni: 3, bi: 2, tri: 1 }],
    ['python rust go kubernetes', { uni: 4, bi: 3, tri: 2 }],
  ] as const)('n-grams for "%s" → %o', (jd, expected) => {
    const r = keywordMatch(jd, 'whatever');
    expect(r.considered.unigrams).toBe(expected.uni);
    expect(r.considered.bigrams).toBe(expected.bi);
    expect(r.considered.trigrams).toBe(expected.tri);
  });
});

describe('keywordMatch — matched + missing partition', () => {
  it.each([
    ['python rust', 'python', { matched: ['python'], missing: ['rust'] }],
    ['python rust go', 'python go', { matched: ['python', 'go'], missing: ['rust'] }],
    ['python rust go', 'python', { matchedHas: 'python', missingHas: 'rust' }],
  ] as const)('JD "%s" CV "%s"', (jd, cv, spec) => {
    const r = keywordMatch(jd, cv);
    if ('matched' in spec) {
      for (const m of spec.matched) expect(r.matched).toContain(m);
      for (const m of spec.missing) expect(r.missing).toContain(m);
    } else {
      expect(r.matched).toContain(spec.matchedHas);
      expect(r.missing).toContain(spec.missingHas);
    }
  });
});

describe('keywordMatch — determinism', () => {
  it.each([
    'python rust go',
    'kubernetes aws terraform',
    'react typescript next.js',
    'machine learning engineer needed urgently',
  ])('repeated runs of "%s" give identical results', (jd) => {
    const cv = 'python aws react';
    const a = keywordMatch(jd, cv);
    const b = keywordMatch(jd, cv);
    expect(a.score).toBe(b.score);
    expect(a.matched).toEqual(b.matched);
    expect(a.missing).toEqual(b.missing);
  });
});
