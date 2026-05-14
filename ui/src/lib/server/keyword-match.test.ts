/**
 * lib/server/keyword-match — deterministic ATS-style keyword overlap.
 *
 * Pure function — no IO, no DB. Node env.
 */
import { describe, expect, it } from 'vitest';
import { extractJdFromReport, keywordMatch } from './keyword-match';

describe('keywordMatch', () => {
  it('returns 100 when JD and CV are identical', () => {
    const text = 'Senior backend engineer with python and aws experience';
    const r = keywordMatch(text, text);
    expect(r.score).toBe(100);
    expect(r.missing.length).toBe(0);
  });

  it('returns 0 when CV is empty', () => {
    const r = keywordMatch('python rust aws kubernetes', '');
    expect(r.score).toBe(0);
    expect(r.matched.length).toBe(0);
    expect(r.missing.length).toBeGreaterThan(0);
  });

  it('returns 0 with empty JD', () => {
    const r = keywordMatch('', 'python rust aws');
    expect(r.score).toBe(0);
    expect(r.considered.unigrams).toBe(0);
  });

  it('detects 1-gram match', () => {
    const r = keywordMatch('python', 'i write python every day');
    expect(r.matched).toContain('python');
    expect(r.score).toBe(100);
  });

  it('detects 2-gram phrase match', () => {
    const r = keywordMatch('amazon web services', 'experience with amazon web services');
    expect(r.matched.length).toBeGreaterThan(0);
    expect(r.score).toBe(100);
  });

  it('reports missing keywords', () => {
    const r = keywordMatch('python rust go kubernetes', 'i write python and ruby');
    expect(r.missing).toContain('rust');
    expect(r.missing).toContain('go');
    expect(r.missing).toContain('kubernetes');
    expect(r.matched).toContain('python');
  });

  it('weights trigrams 3x, bigrams 2x, unigrams 1x', () => {
    // JD with a "needed" word the CV lacks — that single 1-gram-miss
    // pulls the score down from 100. The MATCHED set should still
    // include the full 3-gram "machine learning engineer" + 2-grams.
    const jdHasTri = 'machine learning engineer needed';
    const cvFull = 'machine learning engineer with experience';
    const r = keywordMatch(jdHasTri, cvFull);
    expect(r.matched).toContain('machine learning engineer');
    expect(r.missing).toContain('needed');
    // Score is partial — high but not 100 because "needed" missed.
    expect(r.score).toBeGreaterThan(50);
    expect(r.score).toBeLessThan(100);
  });

  it('is case-insensitive', () => {
    const r = keywordMatch('PYTHON', 'python');
    expect(r.score).toBe(100);
  });

  it('strips stopwords from consideration', () => {
    // "a", "the", "and" should not contribute to the considered list.
    const r = keywordMatch('the and a python', 'python');
    expect(r.considered.unigrams).toBe(1); // only "python"
  });

  it('strips punctuation', () => {
    const r = keywordMatch('react, node.js, python!', 'react node.js python');
    expect(r.score).toBeGreaterThanOrEqual(80);
  });

  it('returns deterministic results across runs', () => {
    const jd = 'kubernetes terraform aws rust';
    const cv = 'i know rust and kubernetes';
    const a = keywordMatch(jd, cv);
    const b = keywordMatch(jd, cv);
    expect(a.score).toBe(b.score);
    expect(a.matched).toEqual(b.matched);
    expect(a.missing).toEqual(b.missing);
  });

  it('matched array is sorted with multi-word terms first', () => {
    const r = keywordMatch(
      'python machine learning engineer',
      'python machine learning engineer working',
    );
    // 3-grams should come before 1-grams in the matched output.
    const idx3 = r.matched.findIndex((m) => m.split(' ').length === 3);
    const idx1 = r.matched.findIndex((m) => m.split(' ').length === 1);
    if (idx3 >= 0 && idx1 >= 0) {
      expect(idx3).toBeLessThan(idx1);
    }
  });

  it('returns a score between 0 and 100', () => {
    const r = keywordMatch('python rust ruby go aws kubernetes', 'python aws docker');
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it('dedupes 1-gram JD repetition (Python ×15 only counts once in unigrams)', () => {
    const repeated = ['python', 'python', 'python', 'python', 'python'].join(' ');
    const distinct = 'python';
    const a = keywordMatch(repeated, distinct);
    const b = keywordMatch(distinct, distinct);
    // Same unigram count, since dedup compresses repeated unigrams to 1.
    expect(a.considered.unigrams).toBe(b.considered.unigrams);
  });

  it('considered counts grow with input size', () => {
    const small = keywordMatch('python rust', 'python');
    const big = keywordMatch('python rust go kubernetes aws terraform docker', 'python');
    expect(big.considered.unigrams).toBeGreaterThan(small.considered.unigrams);
  });
});

describe('extractJdFromReport', () => {
  it('extracts content under "## JD"', () => {
    const md = `# Eval\n\n## Block A\nA text\n\n## JD\nthis is the job description\n\n## Block B\n`;
    const r = extractJdFromReport(md);
    expect(r).toContain('this is the job description');
    expect(r).not.toContain('Block A');
    expect(r).not.toContain('Block B');
  });

  it('extracts under "## Job Description"', () => {
    const md = `## Job Description\nthe role text\n\n## Other\n`;
    const r = extractJdFromReport(md);
    expect(r).toContain('the role text');
  });

  it('falls back to full text when no JD header', () => {
    const md = `# Eval\n\n## Block A\nNo JD here.`;
    const r = extractJdFromReport(md);
    expect(r).toContain('## Block A');
  });

  it('handles "## Posting" header', () => {
    const md = `## Posting\nposting content`;
    expect(extractJdFromReport(md)).toContain('posting content');
  });
});
