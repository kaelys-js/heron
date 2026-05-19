/**
 * lib/server/apply-timing -- dense band coverage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

const TMP = path.join(tmpdir(), 'heron-apply-timing-dense-' + Date.now());

vi.mock('./profile-paths', () => ({
  profilePath: (_p: string, _kind: string) => path.join(TMP, 'scan-history.tsv'),
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

describe('applyTimingFor — fresh band (0-3 days)', () => {
  beforeEach(() => fs.existsSync(TMP) && fs.rmSync(TMP, { recursive: true, force: true }));
  afterEach(() => fs.existsSync(TMP) && fs.rmSync(TMP, { recursive: true, force: true }));

  it.each([0, 1, 2, 3])('%i days ago → fresh', (days) => {
    writeHistory([{ url: 'https://x', firstSeen: isoDaysAgo(days) }]);
    expect(applyTimingFor('p', 'https://x').band).toBe('fresh');
  });
});

describe('applyTimingFor — good band (4-7 days)', () => {
  beforeEach(() => fs.existsSync(TMP) && fs.rmSync(TMP, { recursive: true, force: true }));
  afterEach(() => fs.existsSync(TMP) && fs.rmSync(TMP, { recursive: true, force: true }));

  it.each([4, 5, 6, 7])('%i days ago → good', (days) => {
    writeHistory([{ url: 'https://x', firstSeen: isoDaysAgo(days) }]);
    expect(applyTimingFor('p', 'https://x').band).toBe('good');
  });
});

describe('applyTimingFor — fading band (8-14 days)', () => {
  beforeEach(() => fs.existsSync(TMP) && fs.rmSync(TMP, { recursive: true, force: true }));
  afterEach(() => fs.existsSync(TMP) && fs.rmSync(TMP, { recursive: true, force: true }));

  it.each([8, 9, 10, 11, 12, 13, 14])('%i days ago → fading', (days) => {
    writeHistory([{ url: 'https://x', firstSeen: isoDaysAgo(days) }]);
    expect(applyTimingFor('p', 'https://x').band).toBe('fading');
  });
});

describe('applyTimingFor — late band (15+ days)', () => {
  beforeEach(() => fs.existsSync(TMP) && fs.rmSync(TMP, { recursive: true, force: true }));
  afterEach(() => fs.existsSync(TMP) && fs.rmSync(TMP, { recursive: true, force: true }));

  it.each([15, 17, 21, 30, 60, 90])('%i days ago → late', (days) => {
    writeHistory([{ url: 'https://x', firstSeen: isoDaysAgo(days) }]);
    expect(applyTimingFor('p', 'https://x').band).toBe('late');
  });
});

describe('applyTimingFor — label correctness per band', () => {
  beforeEach(() => fs.existsSync(TMP) && fs.rmSync(TMP, { recursive: true, force: true }));
  afterEach(() => fs.existsSync(TMP) && fs.rmSync(TMP, { recursive: true, force: true }));

  it.each([
    [1, 'Apply NOW'],
    [5, 'Still early'],
    [10, 'Getting late'],
    [20, 'Already late'],
  ] as const)('days=%i → label "%s"', (days, expected) => {
    writeHistory([{ url: 'https://x', firstSeen: isoDaysAgo(days) }]);
    expect(applyTimingFor('p', 'https://x').label).toBe(expected);
  });
});

describe('applyTimingFor — unknown URL → late', () => {
  beforeEach(() => fs.existsSync(TMP) && fs.rmSync(TMP, { recursive: true, force: true }));

  it.each([
    'https://unknown-1',
    'https://unknown-2',
    'https://still-unknown',
    'https://no-history',
  ])('url %s → late + null firstSeen', (url) => {
    expect(applyTimingFor('p', url).band).toBe('late');
    expect(applyTimingFor('p', url).firstSeen).toBeNull();
  });
});

describe('applyTimingFor — daysSinceFirstSeen accuracy', () => {
  beforeEach(() => fs.existsSync(TMP) && fs.rmSync(TMP, { recursive: true, force: true }));
  afterEach(() => fs.existsSync(TMP) && fs.rmSync(TMP, { recursive: true, force: true }));

  it.each([0, 1, 3, 7, 14, 30])('%i days ago → daysSinceFirstSeen ≥ %i', (days) => {
    writeHistory([{ url: 'https://x', firstSeen: isoDaysAgo(days) }]);
    const r = applyTimingFor('p', 'https://x');
    expect(r.daysSinceFirstSeen).toBeGreaterThanOrEqual(days);
  });
});
