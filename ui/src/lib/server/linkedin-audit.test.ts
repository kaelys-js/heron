/**
 * lib/server/linkedin-audit -- classifies a LinkedIn profile snapshot
 * into Findings + persists the report. Tests focus on the pure
 * classifier + the read/write/mark cycle.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const files: Record<string, string> = {};
const fsMock = {
  existsSync: vi.fn((p: string) => p in files),
  readFileSync: vi.fn((p: string) => files[p] ?? ''),
  writeFileSync: vi.fn((p: string, body: string) => {
    files[p] = body;
  }),
  mkdirSync: vi.fn(),
};
vi.mock('node:fs', () => ({ default: fsMock, ...fsMock }));

vi.mock('./profile-paths', () => ({
  profilePath: (_id: string, _key: string) => '/tmp/audit.json',
}));
vi.mock('./profiles', () => ({
  getActiveProfileId: () => 'default',
}));

let mockProfile: Record<string, unknown> = {};
vi.mock('./profile', () => ({
  readProfile: () => mockProfile,
}));

const { classifySnapshot, readAuditReport, writeAuditReport, markFindingResolved } = await import(
  './linkedin-audit'
);

beforeEach(() => {
  Object.keys(files).forEach((k) => delete files[k]);
  fsMock.existsSync.mockReset().mockImplementation((p: string) => p in files);
  fsMock.readFileSync.mockReset().mockImplementation((p: string) => files[p] ?? '');
  fsMock.writeFileSync.mockReset().mockImplementation((p: string, body: string) => {
    files[p] = body;
  });
  fsMock.mkdirSync.mockReset();
  mockProfile = {};
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('classifySnapshot — profile findings', () => {
  it('flags no-photo as error', () => {
    const findings = classifySnapshot({ profile: { hasPhoto: false } });
    expect(findings.some((f) => f.kind === 'no-photo' && f.severity === 'error')).toBe(true);
  });

  it('does NOT flag no-photo when photo present', () => {
    const findings = classifySnapshot({ profile: { hasPhoto: true } });
    expect(findings.some((f) => f.kind === 'no-photo')).toBe(false);
  });

  it('flags no-banner as warn', () => {
    const findings = classifySnapshot({ profile: { hasPhoto: true, hasBanner: false } });
    expect(findings.some((f) => f.kind === 'no-banner' && f.severity === 'warn')).toBe(true);
  });

  it('flags no-headline as error when headline is empty', () => {
    const findings = classifySnapshot({ profile: { hasPhoto: true, headline: '' } });
    expect(findings.some((f) => f.kind === 'no-headline' && f.severity === 'error')).toBe(true);
  });

  it('flags thin-headline when headline is < 30 chars', () => {
    const findings = classifySnapshot({
      profile: { hasPhoto: true, headline: 'Engineer @ X' },
    });
    expect(findings.some((f) => f.kind === 'thin-headline' && f.severity === 'warn')).toBe(true);
  });

  it('does NOT flag thin-headline for headlines ≥ 30 chars', () => {
    const findings = classifySnapshot({
      profile: {
        hasPhoto: true,
        hasBanner: true,
        headline:
          'Staff Engineer · AI / Distributed Systems · Building data platforms at scale · ex-Google',
      },
    });
    expect(findings.some((f) => f.kind === 'thin-headline')).toBe(false);
  });
});

describe('classifySnapshot — defensive defaults', () => {
  it('tolerates entirely empty snapshot (no profile key)', () => {
    const findings = classifySnapshot({});
    // Empty profile = no photo, no banner, no headline → at minimum errors
    expect(findings.length).toBeGreaterThan(0);
  });

  it('tolerates a snapshot with explicit null fields', () => {
    expect(() =>
      classifySnapshot({ profile: null as unknown as Record<string, unknown> }),
    ).not.toThrow();
  });

  it('reads archetypes from profile.targeting safely', () => {
    mockProfile = { targeting: { archetypes: ['Staff Engineer'] } };
    expect(() => classifySnapshot({ profile: { hasPhoto: true } })).not.toThrow();
  });

  it('does not throw when profile.targeting is malformed', () => {
    mockProfile = { targeting: 'not-an-object' };
    expect(() => classifySnapshot({ profile: { hasPhoto: true } })).not.toThrow();
  });
});

describe('readAuditReport / writeAuditReport', () => {
  const sampleReport = {
    auditedAt: 100,
    snapshot: {},
    findings: [
      {
        kind: 'no-photo',
        severity: 'error' as const,
        category: 'profile' as const,
        title: 'no photo',
        detail: '',
      },
    ],
    grade: 0,
  };

  it('readAuditReport returns null when no report file exists', () => {
    expect(readAuditReport()).toBeNull();
  });

  it('readAuditReport returns null when file is corrupt JSON', () => {
    files['/tmp/audit.json'] = '!@#$ not json';
    expect(readAuditReport()).toBeNull();
  });

  it('writeAuditReport → readAuditReport round-trips', () => {
    writeAuditReport(sampleReport);
    const r = readAuditReport();
    expect(r?.findings[0].kind).toBe('no-photo');
    expect(r?.grade).toBe(0);
  });

  it('writeAuditReport creates the parent dir if missing', () => {
    writeAuditReport(sampleReport);
    expect(fsMock.mkdirSync).toHaveBeenCalled();
  });
});

describe('markFindingResolved', () => {
  it('returns null when no report exists', () => {
    expect(markFindingResolved('no-photo')).toBeNull();
  });

  it('flips resolvedAt on the matching finding', () => {
    writeAuditReport({
      auditedAt: 1,
      snapshot: {},
      findings: [
        {
          kind: 'no-photo',
          severity: 'error',
          category: 'profile',
          title: 't',
          detail: '',
        },
        {
          kind: 'no-banner',
          severity: 'warn',
          category: 'profile',
          title: 't',
          detail: '',
        },
      ],
      grade: 0,
    });
    const before = Date.now();
    const r = markFindingResolved('no-photo');
    const photo = r?.findings.find((f) => f.kind === 'no-photo');
    expect(photo?.resolvedAt).toBeGreaterThanOrEqual(before);
    expect(r?.findings.find((f) => f.kind === 'no-banner')?.resolvedAt).toBeUndefined();
  });

  it('recomputes grade after resolution', () => {
    writeAuditReport({
      auditedAt: 1,
      snapshot: {},
      findings: [
        { kind: 'no-photo', severity: 'error', category: 'profile', title: 't', detail: '' },
        { kind: 'no-banner', severity: 'warn', category: 'profile', title: 't', detail: '' },
      ],
      grade: 0,
    });
    const r = markFindingResolved('no-photo');
    // 1 of 2 resolved → 50%
    expect(r?.grade).toBe(50);
  });
});
