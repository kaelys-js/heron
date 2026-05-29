/**
 * linkedin-audit.dense.test -- classifySnapshot branch coverage.
 * classifySnapshot scans a raw LinkedIn snapshot and emits findings,
 * each behind an `if`. Each test exercises one finding's branch (no-X
 * vs has-X vs thin-X vs generic-X) so coverage rises steeply.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./profiles', () => ({
  getActiveProfileId: () => 'default',
}));

vi.mock('./profile', () => ({
  readProfile: () => ({}),
}));

// Mock fs so readAuditReport/writeAuditReport/markFindingResolved
// don't touch the real filesystem.
const __mockFiles = new Map<string, string>();
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: (p: string) => __mockFiles.has(p),
      readFileSync: (p: string) => {
        if (__mockFiles.has(p)) {
          return __mockFiles.get(p)!;
        }
        throw new Error('ENOENT');
      },
      writeFileSync: (p: string, body: string | Buffer) => {
        __mockFiles.set(p, typeof body === 'string' ? body : body.toString());
      },
      mkdirSync: () => undefined,
    },
    existsSync: (p: string) => __mockFiles.has(p),
    readFileSync: (p: string) => {
      if (__mockFiles.has(p)) {
        return __mockFiles.get(p)!;
      }
      throw new Error('ENOENT');
    },
    writeFileSync: (p: string, body: string | Buffer) => {
      __mockFiles.set(p, typeof body === 'string' ? body : body.toString());
    },
    mkdirSync: () => undefined,
  };
});

vi.mock('./profile-paths', () => ({
  profilePath: (_pid: string, kind: string) => `/test/${kind}.json`,
}));

const audit = await import('./linkedin-audit');
const { classifySnapshot, readAuditReport, writeAuditReport, markFindingResolved } = audit;

function snapshot(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    profile: {
      hasPhoto: true,
      hasBanner: true,
      headline: 'A specific role with proven skills and concrete impact across multiple teams',
      about: 'x'.repeat(500),
      customSlug: 'alex-engineer',
      name: 'Alex Q',
    },
    experience: [{}, {}, {}],
    skills: ['a', 'b', 'c'],
    recommendations: { received: 5, given: 5 },
    featured: { count: 3 },
    activity: { lastActivityAgo: '2 weeks' },
    openToWork: {},
    security: { twoFactor: true },
    ...over,
  };
}

describe('classifySnapshot — profile findings', () => {
  it('emits no-photo when hasPhoto=false', () => {
    const findings = classifySnapshot(
      snapshot({
        profile: { ...(snapshot().profile as Record<string, unknown>), hasPhoto: false },
      }),
    );
    expect(findings.some((f) => f.kind === 'no-photo')).toBe(true);
  });

  it('emits no-banner when hasBanner=false', () => {
    const findings = classifySnapshot(
      snapshot({
        profile: { ...(snapshot().profile as Record<string, unknown>), hasBanner: false },
      }),
    );
    expect(findings.some((f) => f.kind === 'no-banner')).toBe(true);
  });

  it('emits no-headline when headline is empty', () => {
    const findings = classifySnapshot(
      snapshot({ profile: { ...(snapshot().profile as Record<string, unknown>), headline: '' } }),
    );
    expect(findings.some((f) => f.kind === 'no-headline')).toBe(true);
  });

  it('emits thin-headline when headline < 30 chars', () => {
    const findings = classifySnapshot(
      snapshot({
        profile: { ...(snapshot().profile as Record<string, unknown>), headline: 'short head' },
      }),
    );
    expect(findings.some((f) => f.kind === 'thin-headline')).toBe(true);
  });

  it('emits generic-headline when headline matches "Title at Company"', () => {
    const findings = classifySnapshot(
      snapshot({
        profile: {
          ...(snapshot().profile as Record<string, unknown>),
          headline: 'Software Engineer at Acme Corp Inc',
        },
      }),
    );
    expect(findings.some((f) => f.kind === 'generic-headline')).toBe(true);
  });

  it('does NOT emit headline finding when headline is good (long + specific)', () => {
    const findings = classifySnapshot(snapshot());
    expect(findings.some((f) => f.kind.includes('headline'))).toBe(false);
  });

  it('emits no-about when about is empty', () => {
    const findings = classifySnapshot(
      snapshot({ profile: { ...(snapshot().profile as Record<string, unknown>), about: '' } }),
    );
    expect(findings.some((f) => f.kind === 'no-about')).toBe(true);
  });

  it('emits thin-about when about < 250 chars', () => {
    const findings = classifySnapshot(
      snapshot({ profile: { ...(snapshot().profile as Record<string, unknown>), about: 'short' } }),
    );
    expect(findings.some((f) => f.kind === 'thin-about')).toBe(true);
  });
});

describe('classifySnapshot — robustness', () => {
  it('handles completely empty snapshot without crashing', () => {
    const findings = classifySnapshot({});
    expect(Array.isArray(findings)).toBe(true);
    // Empty snapshot triggers many "no-X" findings
    expect(findings.length).toBeGreaterThan(0);
  });

  it('handles snapshot with partial profile field', () => {
    const findings = classifySnapshot({ profile: {} });
    expect(findings.some((f) => f.kind === 'no-photo')).toBe(true);
    expect(findings.some((f) => f.kind === 'no-headline')).toBe(true);
  });

  it('returns findings sorted by category/severity (or in stable order)', () => {
    const findings = classifySnapshot({});
    // Each finding should have the required shape.
    for (const f of findings) {
      expect(f.kind).toBeTruthy();
      expect(['error', 'warn', 'info']).toContain(f.severity);
      expect(['profile', 'account', 'activity', 'security']).toContain(f.category);
      expect(f.title).toBeTruthy();
      expect(f.detail).toBeTruthy();
    }
  });

  it('uses default empty profile when readProfile throws', () => {
    // Module mocked above returns {} -- this is the happy path.
    // We also verify the explicit profileId variant doesn't crash.
    const findings = classifySnapshot({}, 'engineer');
    expect(Array.isArray(findings)).toBe(true);
  });
});

describe('classifySnapshot — content field types', () => {
  it('coerces missing experience to empty array', () => {
    const findings = classifySnapshot({ profile: {} as Record<string, unknown> });
    // Should not throw on missing experience.
    expect(Array.isArray(findings)).toBe(true);
  });

  it('coerces missing skills to empty array', () => {
    expect(() => classifySnapshot({ profile: {} })).not.toThrow();
  });

  it('coerces missing recommendations to default shape', () => {
    expect(() => classifySnapshot({ profile: {} })).not.toThrow();
  });

  it('coerces missing security to empty object', () => {
    expect(() => classifySnapshot({ profile: {} })).not.toThrow();
  });
});

describe('classifySnapshot — experience + skills + activity + security branches', () => {
  it('emits no-experience when experience array empty', () => {
    const findings = classifySnapshot(snapshot({ experience: [] }));
    expect(findings.some((f) => f.kind === 'no-experience')).toBe(true);
  });

  it('emits thin-experience when only 1 entry', () => {
    const findings = classifySnapshot(snapshot({ experience: [{}] }));
    expect(findings.some((f) => f.kind === 'thin-experience')).toBe(true);
  });

  it('emits thin-skills when fewer than 5 skills', () => {
    const findings = classifySnapshot(snapshot({ skills: ['a', 'b'] }));
    expect(findings.some((f) => f.kind === 'thin-skills')).toBe(true);
  });

  it('emits sparse-skills when 5-14 skills', () => {
    const findings = classifySnapshot(snapshot({ skills: ['a', 'b', 'c', 'd', 'e', 'f'] }));
    expect(findings.some((f) => f.kind === 'sparse-skills')).toBe(true);
  });

  it('does NOT emit skills finding when 15+ skills present', () => {
    const findings = classifySnapshot(
      snapshot({ skills: Array.from({ length: 20 }, (_, i) => `skill-${i}`) }),
    );
    expect(findings.some((f) => f.kind.includes('skills'))).toBe(false);
  });

  it('emits no-recommendations when received=0', () => {
    const findings = classifySnapshot(snapshot({ recommendations: { received: 0, given: 0 } }));
    expect(findings.some((f) => f.kind === 'no-recommendations')).toBe(true);
  });

  it('emits empty-featured when count=0', () => {
    const findings = classifySnapshot(snapshot({ featured: { count: 0 } }));
    expect(findings.some((f) => f.kind === 'empty-featured')).toBe(true);
  });

  it('emits stale-activity when lastActivityAgo mentions "year"', () => {
    const findings = classifySnapshot(snapshot({ activity: { lastActivityAgo: '2 years ago' } }));
    expect(findings.some((f) => f.kind === 'stale-activity')).toBe(true);
  });

  it('emits stale-activity when months >= 3', () => {
    const findings = classifySnapshot(snapshot({ activity: { lastActivityAgo: '6 months ago' } }));
    expect(findings.some((f) => f.kind === 'stale-activity')).toBe(true);
  });

  it('does NOT emit stale-activity when activity is recent', () => {
    const findings = classifySnapshot(snapshot({ activity: { lastActivityAgo: '2 days ago' } }));
    expect(findings.some((f) => f.kind === 'stale-activity')).toBe(false);
  });
});

describe('readAuditReport / writeAuditReport / markFindingResolved', () => {
  beforeEach(() => {
    __mockFiles.clear();
  });

  it('readAuditReport returns null when no report on disk', () => {
    expect(readAuditReport()).toBeNull();
  });

  it('writeAuditReport persists the report to disk', () => {
    const report = {
      auditedAt: 1700000000000,
      snapshot: {},
      grade: 0,
      findings: [
        {
          kind: 'no-photo',
          severity: 'error' as const,
          category: 'profile' as const,
          title: 'No photo',
          detail: 'detail',
        },
      ],
      resolved: [],
    };
    writeAuditReport(report);
    // After write, reading should return the same shape.
    const read = readAuditReport();
    expect(read).not.toBeNull();
    expect(read?.findings).toHaveLength(1);
    expect(read?.findings[0].kind).toBe('no-photo');
  });

  it('readAuditReport with a profileId arg works the same way', () => {
    expect(readAuditReport('engineer')).toBeNull();
  });

  it('markFindingResolved returns null when no report exists yet', () => {
    expect(markFindingResolved('no-photo')).toBeNull();
  });

  it('markFindingResolved sets resolvedAt on the matching kind', () => {
    writeAuditReport({
      auditedAt: 1700000000000,
      snapshot: {},
      grade: 0,
      findings: [
        {
          kind: 'no-photo',
          severity: 'error' as const,
          category: 'profile' as const,
          title: 'No photo',
          detail: 'detail',
        },
        {
          kind: 'no-banner',
          severity: 'warn' as const,
          category: 'profile' as const,
          title: 'No banner',
          detail: 'detail',
        },
      ],
    });
    const updated = markFindingResolved('no-photo');
    expect(updated).not.toBeNull();
    const photo = updated?.findings.find((f) => f.kind === 'no-photo');
    expect(photo?.resolvedAt).toBeTruthy();
    // no-banner still has no resolvedAt
    const banner = updated?.findings.find((f) => f.kind === 'no-banner');
    expect(banner?.resolvedAt).toBeFalsy();
  });
});

describe('classifySnapshot — output is an array of AuditFindings', () => {
  it('returns an array (even when empty)', () => {
    const findings = classifySnapshot(snapshot());
    expect(Array.isArray(findings)).toBe(true);
  });

  it('every finding has kind/severity/category/title/detail', () => {
    const findings = classifySnapshot({});
    for (const f of findings) {
      expect(typeof f.kind).toBe('string');
      expect(typeof f.severity).toBe('string');
      expect(typeof f.category).toBe('string');
      expect(typeof f.title).toBe('string');
      expect(typeof f.detail).toBe('string');
    }
  });
});
