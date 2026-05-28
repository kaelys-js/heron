/**
 * lib/server/apply-dispatcher -- URL → portal detection.
 *
 * Pure function over the URL. The portal table changes as ATSes get
 * onboarded; this test locks the contract for every portal currently
 * supported in production.
 */
import { describe, expect, it } from 'vitest';
import { detectPortal, isPortalAutomated, PRODUCTION_PORTALS } from './apply-dispatcher';

describe('detectPortal — LinkedIn', () => {
  it('detects /jobs/view/{id}', () => {
    const r = detectPortal('https://www.linkedin.com/jobs/view/1234567890');
    expect(r.portal).toBe('linkedin');
    expect(r.meta?.jobId).toBe('1234567890');
  });

  it('detects ?currentJobId=N (collection view)', () => {
    const r = detectPortal(
      'https://www.linkedin.com/jobs/collections/recommended/?currentJobId=999',
    );
    expect(r.portal).toBe('linkedin');
    expect(r.meta?.jobId).toBe('999');
  });

  it('subdomains of linkedin.com still match', () => {
    expect(detectPortal('https://uk.linkedin.com/jobs/view/1').portal).toBe('linkedin');
  });
});

describe('detectPortal — Greenhouse', () => {
  it('boards.greenhouse.io/{company}/jobs/{id}', () => {
    const r = detectPortal('https://boards.greenhouse.io/acme/jobs/4321');
    expect(r.portal).toBe('greenhouse');
    expect(r.meta?.company).toBe('acme');
    expect(r.meta?.jobId).toBe('4321');
  });

  it('job-boards.greenhouse.io variant', () => {
    const r = detectPortal('https://job-boards.greenhouse.io/acme/jobs/4321');
    expect(r.portal).toBe('greenhouse');
    expect(r.meta?.jobId).toBe('4321');
  });

  it('eU regional shard job-boards.eu.greenhouse.io', () => {
    const r = detectPortal('https://job-boards.eu.greenhouse.io/acme/jobs/4321');
    expect(r.portal).toBe('greenhouse');
    expect(r.meta?.company).toBe('acme');
  });
});

describe('detectPortal — Ashby', () => {
  it('jobs.ashbyhq.com/{company}/{uuid}', () => {
    const r = detectPortal('https://jobs.ashbyhq.com/acme/uuid-1234');
    expect(r.portal).toBe('ashby');
    expect(r.meta?.company).toBe('acme');
    expect(r.meta?.jobId).toBe('uuid-1234');
  });
});

describe('detectPortal — Lever', () => {
  it('jobs.lever.co/{company}/{uuid}', () => {
    const r = detectPortal('https://jobs.lever.co/acme/uuid-abc');
    expect(r.portal).toBe('lever');
    expect(r.meta?.company).toBe('acme');
  });

  it('apply page suffix still detects lever', () => {
    const r = detectPortal('https://jobs.lever.co/acme/uuid-abc/apply');
    expect(r.portal).toBe('lever');
  });
});

describe('detectPortal — Workable', () => {
  it('apply.workable.com/{company}/j/{id}', () => {
    const r = detectPortal('https://apply.workable.com/acme/j/12ABC34/');
    expect(r.portal).toBe('workable');
    expect(r.meta?.company).toBe('acme');
    // jobId is the LAST path segment
    expect(r.meta?.jobId).toBe('12ABC34');
  });
});

describe('detectPortal — Personio', () => {
  it('jobs.personio.com', () => {
    expect(detectPortal('https://acme.jobs.personio.com/job/1').portal).toBe('personio');
  });

  it('jobs.personio.de', () => {
    expect(detectPortal('https://acme.jobs.personio.de/job/1').portal).toBe('personio');
  });

  it('jobs.personio.eu', () => {
    expect(detectPortal('https://acme.jobs.personio.eu/job/1').portal).toBe('personio');
  });
});

describe('detectPortal — SmartRecruiters', () => {
  it('jobs.smartrecruiters.com/{company}', () => {
    const r = detectPortal('https://jobs.smartrecruiters.com/acme');
    expect(r.portal).toBe('smartrecruiters');
    expect(r.meta?.company).toBe('acme');
  });
});

describe('detectPortal — Recruitee', () => {
  it('{company}.recruitee.com', () => {
    const r = detectPortal('https://acme.recruitee.com/o/role-1');
    expect(r.portal).toBe('recruitee');
    expect(r.meta?.company).toBe('acme');
  });
});

describe('detectPortal — Teamtailor', () => {
  it('{company}.teamtailor.com', () => {
    const r = detectPortal('https://acme.teamtailor.com/jobs/1');
    expect(r.portal).toBe('teamtailor');
    expect(r.meta?.company).toBe('acme');
  });
});

describe('detectPortal — Workday', () => {
  it('*.myworkdayjobs.com', () => {
    expect(detectPortal('https://acme.wd5.myworkdayjobs.com/External/job/123').portal).toBe(
      'workday',
    );
  });
});

describe('detectPortal — Indeed', () => {
  it('matches both listing + apply subdomains', () => {
    expect(detectPortal('https://www.indeed.com/viewjob?jk=1').portal).toBe('indeed');
    expect(detectPortal('https://apply.indeed.com/something').portal).toBe('indeed');
    expect(detectPortal('https://uk.indeed.com/viewjob?jk=1').portal).toBe('indeed');
  });
});

describe('detectPortal — error / fallback cases', () => {
  it('empty string → unknown', () => {
    expect(detectPortal('').portal).toBe('unknown');
  });

  it('malformed URL → unknown', () => {
    expect(detectPortal('not-a-url').portal).toBe('unknown');
  });

  it('unrelated domain → unknown', () => {
    expect(detectPortal('https://example.com/jobs/1').portal).toBe('unknown');
  });

  it('greenhouse-look-alike but wrong TLD → unknown', () => {
    expect(detectPortal('https://boards.greenhouse.net/acme/jobs/1').portal).toBe('unknown');
  });

  it('linkedin-look-alike subdomain on a different domain → unknown', () => {
    expect(detectPortal('https://linkedin.example.com/jobs/view/1').portal).toBe('unknown');
  });
});

describe('isPortalAutomated', () => {
  it('every PRODUCTION_PORTALS entry returns true', () => {
    for (const p of PRODUCTION_PORTALS) {
      expect(isPortalAutomated(p)).toBe(true);
    }
  });

  it('unknown returns false', () => {
    expect(isPortalAutomated('unknown')).toBe(false);
  });

  it('pRODUCTION_PORTALS includes the big 5 + the second-round graduates', () => {
    for (const p of ['linkedin', 'greenhouse', 'ashby', 'lever', 'workday']) {
      expect(PRODUCTION_PORTALS.has(p as 'linkedin')).toBe(true);
    }
    for (const p of [
      'workable',
      'personio',
      'smartrecruiters',
      'recruitee',
      'teamtailor',
      'indeed',
    ]) {
      expect(PRODUCTION_PORTALS.has(p as 'workable')).toBe(true);
    }
  });
});
