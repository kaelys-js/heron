/**
 * lib/server/scan-history — parser for data/scan-history.tsv.
 *
 * Mocks fs + profiles so we can feed synthetic TSV content + assert
 * the aggregation behaviour without touching disk.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockFsContent: string | null = null;
const fsMock = {
  existsSync: vi.fn(() => mockFsContent !== null),
  readFileSync: vi.fn(() => mockFsContent ?? ''),
};
vi.mock('node:fs', () => ({ default: fsMock, ...fsMock }));

vi.mock('./profile-paths', () => ({
  profilePath: (_id: string, _key: string) => '/tmp/scan-history.tsv',
}));

const profilesList: { id: string; name: string }[] = [];
let activeId = 'default';
vi.mock('./profiles', () => ({
  getActiveProfileId: () => activeId,
  listProfiles: () => profilesList,
}));

const { readScanHistorySummary } = await import('./scan-history');

beforeEach(() => {
  mockFsContent = null;
  profilesList.length = 0;
  activeId = 'default';
  fsMock.existsSync.mockReset().mockImplementation(() => mockFsContent !== null);
  fsMock.readFileSync.mockReset().mockImplementation(() => mockFsContent ?? '');
});

afterEach(() => {
  vi.clearAllMocks();
});

function tsv(rows: string[][]): string {
  // header row + data rows joined with tabs
  const header = ['url', 'first_seen', 'portal', 'title', 'company', 'status'].join('\t');
  return [header, ...rows.map((r) => r.join('\t'))].join('\n');
}

describe('scan-history — empty / missing file', () => {
  it('no file → all zeros', () => {
    mockFsContent = null;
    const s = readScanHistorySummary();
    expect(s.totalRuns).toBe(0);
    expect(s.totalAdded).toBe(0);
    expect(s.totalDuplicates).toBe(0);
    expect(s.lastRunDate).toBeNull();
    expect(s.recent).toEqual([]);
  });

  it('header-only file → all zeros (header line is dropped)', () => {
    mockFsContent = tsv([]);
    const s = readScanHistorySummary();
    expect(s.totalRuns).toBe(0);
  });

  it('blank lines are skipped', () => {
    mockFsContent = ['url\tfirst_seen\tportal\ttitle\tcompany\tstatus', '', '   ', ''].join('\n');
    const s = readScanHistorySummary();
    expect(s.totalRuns).toBe(0);
  });

  it('rows with < 6 cells are skipped', () => {
    mockFsContent = ['url\tfirst_seen\tportal\ttitle\tcompany\tstatus', 'url1\t2026-01-01'].join(
      '\n',
    );
    const s = readScanHistorySummary();
    expect(s.totalAdded + s.totalDuplicates).toBe(0);
  });
});

describe('scan-history — aggregates', () => {
  it('counts added vs duplicate per day', () => {
    mockFsContent = tsv([
      ['u1', '2026-05-01', 'lin', 'Eng', 'Acme', 'added'],
      ['u2', '2026-05-01', 'lin', 'Eng', 'Acme', 'duplicate'],
      ['u3', '2026-05-02', 'gh', 'PM', 'Foo', 'added'],
    ]);
    const s = readScanHistorySummary();
    expect(s.totalAdded).toBe(2);
    expect(s.totalDuplicates).toBe(1);
    expect(s.totalRuns).toBe(2); // 2 distinct dates
  });

  it('lastRunDate is the most recent date seen', () => {
    mockFsContent = tsv([
      ['u1', '2026-05-01', 'lin', 'T', 'C', 'added'],
      ['u2', '2026-05-03', 'lin', 'T', 'C', 'added'],
      ['u3', '2026-05-02', 'lin', 'T', 'C', 'added'],
    ]);
    expect(readScanHistorySummary().lastRunDate).toBe('2026-05-03');
  });

  it('recent[] is sorted most-recent first', () => {
    mockFsContent = tsv([
      ['u1', '2026-05-01', 'lin', 'T', 'C', 'added'],
      ['u2', '2026-05-03', 'lin', 'T', 'C', 'added'],
      ['u3', '2026-05-02', 'lin', 'T', 'C', 'added'],
    ]);
    const s = readScanHistorySummary();
    expect(s.recent[0].date).toBe('2026-05-03');
    expect(s.recent[1].date).toBe('2026-05-02');
    expect(s.recent[2].date).toBe('2026-05-01');
  });

  it('recent[] is capped at 30 entries', () => {
    const rows: string[][] = [];
    for (let i = 1; i <= 40; i += 1) {
      const d = String(i).padStart(2, '0');
      rows.push([`u${i}`, `2026-05-${d}`, 'lin', 'T', 'C', 'added']);
    }
    mockFsContent = tsv(rows);
    expect(readScanHistorySummary().recent.length).toBe(30);
  });

  it('aggregates top portals by overall count', () => {
    mockFsContent = tsv([
      ['u1', '2026-05-01', 'linkedin', 'T', 'C', 'added'],
      ['u2', '2026-05-01', 'linkedin', 'T', 'C', 'added'],
      ['u3', '2026-05-01', 'greenhouse', 'T', 'C', 'added'],
      ['u4', '2026-05-02', 'ashby', 'T', 'C', 'added'],
    ]);
    const s = readScanHistorySummary();
    expect(s.topPortals[0]).toEqual({ portal: 'linkedin', count: 2 });
    expect(s.topPortals.find((p) => p.portal === 'greenhouse')?.count).toBe(1);
  });

  it('aggregates top companies by overall count (empty companies skipped)', () => {
    mockFsContent = tsv([
      ['u1', '2026-05-01', 'lin', 'T', 'Acme', 'added'],
      ['u2', '2026-05-01', 'lin', 'T', 'Acme', 'added'],
      ['u3', '2026-05-01', 'lin', 'T', '', 'added'],
      ['u4', '2026-05-02', 'lin', 'T', 'Beta', 'added'],
    ]);
    const s = readScanHistorySummary();
    expect(s.topCompanies[0]).toEqual({ company: 'Acme', count: 2 });
    expect(s.topCompanies.some((c) => c.company === '')).toBe(false);
  });
});

describe('scan-history — multi-profile (profileId="all")', () => {
  it('concatenates rows from every profile', () => {
    profilesList.push({ id: 'work', name: 'W' }, { id: 'home', name: 'H' });
    fsMock.existsSync.mockReturnValue(true);
    let callIdx = 0;
    fsMock.readFileSync.mockImplementation(() => {
      callIdx += 1;
      if (callIdx === 1) {
        return tsv([['u1', '2026-05-01', 'lin', 'T', 'A', 'added']]);
      }
      return tsv([['u2', '2026-05-02', 'gh', 'T', 'B', 'added']]);
    });
    const s = readScanHistorySummary('all');
    expect(s.totalAdded).toBe(2);
  });
});

describe('scan-history — read error tolerance', () => {
  it('returns empty summary if readFileSync throws', () => {
    mockFsContent = '';
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockImplementation(() => {
      throw new Error('EACCES');
    });
    const s = readScanHistorySummary();
    expect(s.totalRuns).toBe(0);
  });
});
