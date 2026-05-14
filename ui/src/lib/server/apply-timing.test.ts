/**
 * lib/server/apply-timing — banding of a job's first-seen date.
 *
 * Mocks the scan-history file lookup so we can exercise every band
 * (fresh, good, fading, late) deterministically.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

const TMP = path.join(tmpdir(), 'career-ops-apply-timing-' + Date.now());

vi.mock('./profile-paths', () => ({
  profilePath: (_p: string, kind: string) => {
    if (kind === 'scan-history') return path.join(TMP, 'scan-history.tsv');
    return path.join(TMP, kind);
  },
}));
vi.mock('./scan-history', () => ({
  readScanHistorySummary: () => ({ days: [], summary: {} }),
}));

const { applyTimingFor } = await import('./apply-timing');

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function writeHistory(rows: Array<{ url: string; firstSeen: string }>): void {
  fs.mkdirSync(TMP, { recursive: true });
  const header = 'url\tfirstSeen\tlastSeen\tsource\n';
  const body = rows.map((r) => `${r.url}\t${r.firstSeen}\t${r.firstSeen}\tlinkedin`).join('\n');
  fs.writeFileSync(path.join(TMP, 'scan-history.tsv'), header + body + '\n');
}

describe('applyTimingFor', () => {
  beforeEach(() => {
    if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
  });
  afterEach(() => {
    if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('"fresh" band for 0-3 days old', () => {
    writeHistory([{ url: 'https://x', firstSeen: isoDaysAgo(0) }]);
    expect(applyTimingFor('p', 'https://x').band).toBe('fresh');
    writeHistory([{ url: 'https://x', firstSeen: isoDaysAgo(3) }]);
    expect(applyTimingFor('p', 'https://x').band).toBe('fresh');
  });

  it('"good" band for 4-7 days old', () => {
    writeHistory([{ url: 'https://x', firstSeen: isoDaysAgo(5) }]);
    expect(applyTimingFor('p', 'https://x').band).toBe('good');
    writeHistory([{ url: 'https://x', firstSeen: isoDaysAgo(7) }]);
    expect(applyTimingFor('p', 'https://x').band).toBe('good');
  });

  it('"fading" band for 8-14 days old', () => {
    writeHistory([{ url: 'https://x', firstSeen: isoDaysAgo(10) }]);
    expect(applyTimingFor('p', 'https://x').band).toBe('fading');
    writeHistory([{ url: 'https://x', firstSeen: isoDaysAgo(14) }]);
    expect(applyTimingFor('p', 'https://x').band).toBe('fading');
  });

  it('"late" band for 15+ days old', () => {
    writeHistory([{ url: 'https://x', firstSeen: isoDaysAgo(20) }]);
    expect(applyTimingFor('p', 'https://x').band).toBe('late');
  });

  it('"late" band when URL not in scan-history', () => {
    expect(applyTimingFor('p', 'https://unknown').band).toBe('late');
  });

  it('firstSeen is preserved in the result', () => {
    const date = isoDaysAgo(2);
    writeHistory([{ url: 'https://x', firstSeen: date }]);
    expect(applyTimingFor('p', 'https://x').firstSeen).toBe(date);
  });

  it('null firstSeen when URL not found', () => {
    expect(applyTimingFor('p', 'https://unknown').firstSeen).toBeNull();
  });

  it('label + advice are populated', () => {
    writeHistory([{ url: 'https://x', firstSeen: isoDaysAgo(1) }]);
    const r = applyTimingFor('p', 'https://x');
    expect(r.label).toBe('Apply NOW');
    expect(r.advice).toMatch(/Day 1-3/);
  });

  it('every band has a distinct label', () => {
    const labels: string[] = [];
    for (const days of [1, 5, 10, 20]) {
      writeHistory([{ url: 'https://x', firstSeen: isoDaysAgo(days) }]);
      labels.push(applyTimingFor('p', 'https://x').label);
    }
    expect(new Set(labels).size).toBe(4);
  });

  it('daysSinceFirstSeen is a non-negative integer', () => {
    writeHistory([{ url: 'https://x', firstSeen: isoDaysAgo(5) }]);
    const r = applyTimingFor('p', 'https://x');
    expect(r.daysSinceFirstSeen).toBeGreaterThanOrEqual(5);
    expect(Number.isInteger(r.daysSinceFirstSeen)).toBe(true);
  });
});
