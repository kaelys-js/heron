/**
 * projects.dense.test -- pure-function coverage for projects.ts to
 * complement the existing CRUD-focused projects.test.ts.
 *
 * Covers: matchesProject (filter rules), computeStats (roll-ups +
 * topCompanies), projectToPipelineQuery (URL serialization),
 * parseFilterFromUrl (URL deserialization), getStarterTemplates,
 * PROJECT_COLORS.
 */
import { describe, expect, it } from 'vitest';
import {
  getStarterTemplates,
  matchesProject,
  computeStats,
  projectToPipelineQuery,
  parseFilterFromUrl,
  PROJECT_COLORS,
  type Project,
} from './projects';
import { DEFAULT_FILTER, type Job } from '$lib/types';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p-test',
    name: 'Test project',
    description: 'A test project',
    color: 'emerald',
    filter: {
      ...DEFAULT_FILTER,
      bgRisk: { ...DEFAULT_FILTER.bgRisk },
      workMode: { ...DEFAULT_FILTER.workMode },
    },
    target: 5,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...overrides,
  };
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'j1',
    url: 'https://example.com/jobs/1',
    company: 'Acme',
    role: 'Engineer',
    location: 'Remote',
    status: 'New',
    score: 0,
    ...overrides,
  };
}

describe('PROJECT_COLORS', () => {
  it('exports 8 distinct colors', () => {
    expect(PROJECT_COLORS).toHaveLength(8);
    expect(new Set(PROJECT_COLORS).size).toBe(8);
  });

  it('starts with emerald (the default color)', () => {
    expect(PROJECT_COLORS[0]).toBe('emerald');
  });
});

describe('getStarterTemplates', () => {
  it('returns at least 2 starter templates', () => {
    expect(getStarterTemplates().length).toBeGreaterThanOrEqual(2);
  });

  it('each template has name + description + color + filter + target', () => {
    for (const t of getStarterTemplates()) {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.color).toBeTruthy();
      expect(t.filter).toBeTruthy();
      expect(typeof t.target).toBe('number');
    }
  });
});

describe('matchesProject', () => {
  it('matches when no filter is set (defaults)', () => {
    expect(matchesProject(makeJob({ score: 3 }), makeProject())).toBe(true);
  });

  it('drops jobs below minScore', () => {
    const p = makeProject();
    p.filter.minScore = 4.5;
    expect(matchesProject(makeJob({ score: 4.4 }), p)).toBe(false);
    expect(matchesProject(makeJob({ score: 4.5 }), p)).toBe(true);
  });

  it('uses geminiScore when score is missing', () => {
    const p = makeProject();
    p.filter.minScore = 4;
    expect(matchesProject(makeJob({ score: undefined, geminiScore: 4.2 }), p)).toBe(true);
  });

  it('drops jobs whose bgRisk is disabled', () => {
    const p = makeProject();
    p.filter.bgRisk.BLOCKED = false;
    expect(matchesProject(makeJob({ bgRisk: 'BLOCKED' }), p)).toBe(false);
  });

  it('drops jobs without PDF when hasPdf=true', () => {
    const p = makeProject();
    p.filter.hasPdf = true;
    expect(matchesProject(makeJob({ pdfFile: undefined }), p)).toBe(false);
    expect(matchesProject(makeJob({ pdfFile: 'cv.pdf' }), p)).toBe(true);
  });

  it('drops jobs without report when hasReport=true', () => {
    const p = makeProject();
    p.filter.hasReport = true;
    expect(matchesProject(makeJob({ reportFile: undefined }), p)).toBe(false);
    expect(matchesProject(makeJob({ reportFile: '001-acme.md' }), p)).toBe(true);
  });

  it('case-insensitive substring search matches company OR role', () => {
    const p = makeProject();
    p.filter.search = 'engineer';
    expect(matchesProject(makeJob({ company: 'Acme', role: 'Senior Engineer' }), p)).toBe(true);
    expect(matchesProject(makeJob({ company: 'Engineer Inc', role: 'Manager' }), p)).toBe(true);
    expect(matchesProject(makeJob({ company: 'Acme', role: 'Manager' }), p)).toBe(false);
  });

  it('whitespace-only search matches everything', () => {
    const p = makeProject();
    p.filter.search = '   ';
    expect(matchesProject(makeJob({ company: 'Acme', role: 'Lawyer' }), p)).toBe(true);
  });
});

describe('computeStats', () => {
  it('counts only jobs matching the filter', () => {
    const p = makeProject();
    p.filter.minScore = 4;
    const jobs = [
      makeJob({ score: 4.5, status: 'New' }),
      makeJob({ score: 3.0, status: 'New' }), // filtered out
      makeJob({ score: 4.1, status: 'Applied' }),
    ];
    const stats = computeStats(p, jobs);
    expect(stats.total).toBe(2);
  });

  it('rolls applied / active / interview / offer / rejected correctly', () => {
    const p = makeProject();
    const jobs = [
      makeJob({ status: 'Applied' }),
      makeJob({ status: 'Screened' }),
      makeJob({ status: 'Interview' }),
      makeJob({ status: 'Offer' }),
      makeJob({ status: 'Rejected' }),
    ];
    const stats = computeStats(p, jobs);
    expect(stats.applied).toBe(5);
    expect(stats.active).toBe(4);
    expect(stats.interview).toBe(2);
    expect(stats.offer).toBe(1);
    expect(stats.rejected).toBe(1);
  });

  it('counts evaluated (jobs with reportFile)', () => {
    const p = makeProject();
    const jobs = [
      makeJob({ reportFile: '001.md' }),
      makeJob({ reportFile: '002.md' }),
      makeJob({ reportFile: undefined }),
    ];
    expect(computeStats(p, jobs).evaluated).toBe(2);
  });

  it('returns topCompanies sorted by count desc, capped at 5', () => {
    const p = makeProject();
    const jobs = [
      makeJob({ company: 'A' }),
      makeJob({ company: 'A' }),
      makeJob({ company: 'B' }),
      makeJob({ company: 'C' }),
      makeJob({ company: 'D' }),
      makeJob({ company: 'E' }),
      makeJob({ company: 'F' }),
    ];
    const stats = computeStats(p, jobs);
    expect(stats.topCompanies.length).toBeLessThanOrEqual(5);
    expect(stats.topCompanies[0]).toEqual({ name: 'A', count: 2 });
  });

  it('emits zero counts when no jobs match', () => {
    const p = makeProject();
    p.filter.minScore = 5;
    const stats = computeStats(p, [makeJob({ score: 1 })]);
    expect(stats.total).toBe(0);
    expect(stats.applied).toBe(0);
  });
});

describe('projectToPipelineQuery', () => {
  it('always includes the from=project:<id> param (URL-encoded)', () => {
    const q = projectToPipelineQuery(makeProject({ id: 'p-123' }));
    expect(q).toMatch(/from=project[:%]/);
    expect(q).toContain('p-123');
  });

  it('includes score when minScore > 0', () => {
    const p = makeProject();
    p.filter.minScore = 4;
    expect(projectToPipelineQuery(p)).toContain('score=4');
  });

  it('omits score when minScore is 0', () => {
    const p = makeProject();
    p.filter.minScore = 0;
    expect(projectToPipelineQuery(p)).not.toContain('score=');
  });

  it('omits bg when it matches the default (LOW+MEDIUM+HIGH on, BLOCKED off)', () => {
    const p = makeProject();
    p.filter.bgRisk = { LOW: true, MEDIUM: true, HIGH: true, BLOCKED: false };
    expect(projectToPipelineQuery(p)).not.toContain('bg=');
  });

  it('includes bg when divergent from default', () => {
    const p = makeProject();
    p.filter.bgRisk = { LOW: true, MEDIUM: false, HIGH: false, BLOCKED: false };
    expect(projectToPipelineQuery(p)).toContain('bg=LOW');
  });

  it('includes pdf and report flags when set', () => {
    const p = makeProject();
    p.filter.hasPdf = true;
    p.filter.hasReport = true;
    const q = projectToPipelineQuery(p);
    expect(q).toContain('pdf=1');
    expect(q).toContain('report=1');
  });

  it('includes search when non-empty', () => {
    const p = makeProject();
    p.filter.search = 'engineer';
    expect(projectToPipelineQuery(p)).toContain('search=engineer');
  });
});

describe('parseFilterFromUrl', () => {
  it('parses score', () => {
    expect(parseFilterFromUrl(new URL('http://x?score=4.5')).minScore).toBe(4.5);
  });

  it('clamps score to [0, 5]', () => {
    expect(parseFilterFromUrl(new URL('http://x?score=99')).minScore).toBe(5);
    expect(parseFilterFromUrl(new URL('http://x?score=-3')).minScore).toBe(0);
  });

  it('ignores non-numeric score', () => {
    expect(parseFilterFromUrl(new URL('http://x?score=abc')).minScore).toBeUndefined();
  });

  it('parses bg as comma-separated set', () => {
    const f = parseFilterFromUrl(new URL('http://x?bg=LOW,HIGH'));
    expect(f.bgRisk?.LOW).toBe(true);
    expect(f.bgRisk?.HIGH).toBe(true);
    expect(f.bgRisk?.MEDIUM).toBe(false);
    expect(f.bgRisk?.BLOCKED).toBe(false);
  });

  it('skips unknown bg tokens', () => {
    const f = parseFilterFromUrl(new URL('http://x?bg=LOW,UNKNOWN'));
    expect(f.bgRisk?.LOW).toBe(true);
  });

  it('parses pdf + report flags', () => {
    const f = parseFilterFromUrl(new URL('http://x?pdf=1&report=1'));
    expect(f.hasPdf).toBe(true);
    expect(f.hasReport).toBe(true);
  });

  it('does NOT set flags when missing', () => {
    const f = parseFilterFromUrl(new URL('http://x'));
    expect(f.hasPdf).toBeUndefined();
    expect(f.hasReport).toBeUndefined();
  });

  it('parses search + source', () => {
    const f = parseFilterFromUrl(new URL('http://x?search=engineer&source=workday-api'));
    expect(f.search).toBe('engineer');
    expect(f.source).toBe('workday-api');
  });
});
