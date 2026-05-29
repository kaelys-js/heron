/**
 * lib/server/email-reactor -- inbound-email classifier + action planner.
 *
 * Tests focus on the pure classifyEmail + matchEmailToJob branches --
 * the orchestration in reactToEmail() is exercised end-to-end by the
 * /api/email/react endpoint test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock everything email-reactor imports for side effects so we can
// load the module in isolation without touching disk.
vi.mock('./parsers', () => ({
  loadAllJobs: () => [
    {
      id: 'j1',
      company: 'Acme',
      role: 'Eng',
      status: 'Applied',
      url: 'https://acme.com/jobs/1',
    },
    {
      id: 'j2',
      company: 'Beta Corp',
      role: 'PM',
      status: 'Interview',
      url: 'https://beta.com/jobs/2',
    },
  ],
}));

vi.mock('./applications', () => ({
  markRowStatus: vi.fn(),
  markApplied: vi.fn(),
}));

vi.mock('./interview-schedule', () => ({
  setSchedule: vi.fn(),
  getSchedule: () => null,
}));

vi.mock('./events', () => ({
  logEvent: vi.fn(),
  reportServerError: vi.fn(),
}));

vi.mock('./files', () => ({ ROOT: '/tmp/repo', DATA_ROOT: '/tmp/repo/data' }));

const files: Record<string, string> = {};
const fsMock = {
  existsSync: vi.fn((p: string) => p in files),
  readFileSync: vi.fn((p: string) => files[p] ?? ''),
  writeFileSync: vi.fn((p: string, body: string) => {
    files[p] = body;
  }),
  appendFileSync: vi.fn((p: string, body: string) => {
    files[p] = (files[p] ?? '') + body;
  }),
  mkdirSync: vi.fn(),
};
vi.mock('node:fs', () => ({ default: fsMock, ...fsMock }));

// Per-profile resolver -- the test sets `activeProfileId` and the
// mock returns a unique path per profile so multi-user isolation can
// be asserted with the in-memory fsMock.
let activeProfileId = 'default';
vi.mock('./profile-paths', () => ({
  profilePath: (id: string, key: string) => {
    if (key === 'inbound-leads-jsonl') {
      return `/tmp/profile/${id}/inbound-leads.jsonl`;
    }
    return `/tmp/profile/${id}/${key}`;
  },
  activePath: (key: string) => `/tmp/${key}`,
}));

vi.mock('./profiles', () => ({
  getActiveProfileId: () => activeProfileId,
}));

const { classifyEmail, matchEmailToJob, listLeads } = await import('./email-reactor');

const baseEmail = {
  ts: Date.now(),
  from: 'recruiter@acme.com',
  subject: '',
  body: '',
};

beforeEach(() => {
  Object.keys(files).forEach((k) => delete files[k]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('classifyEmail — offer', () => {
  it('"pleased to offer you" → offer with high confidence', () => {
    const r = classifyEmail({
      ...baseEmail,
      subject: 'Offer for Senior Engineer',
      body: 'We are pleased to offer you a position with base salary $200,000.',
    });
    expect(r.kind).toBe('offer');
    expect(r.confidence).toBe('high');
  });

  it('offer beats take-home when both present in long email', () => {
    const r = classifyEmail({
      ...baseEmail,
      subject: 'Offer letter',
      body: 'Pleased to offer you the role. The take-home assignment is now complete.',
    });
    expect(r.kind).toBe('offer');
  });
});

describe('classifyEmail — rejection', () => {
  it('"after careful consideration" → rejection with high confidence', () => {
    const r = classifyEmail({
      ...baseEmail,
      subject: 'Update on your application',
      body: 'After careful consideration we have decided to move forward with other candidates.',
    });
    expect(r.kind).toBe('rejection');
    expect(r.confidence).toBe('high');
  });

  it('"regret to inform" → rejection with high confidence', () => {
    const r = classifyEmail({
      ...baseEmail,
      subject: 'x',
      body: 'We regret to inform you that we will not be moving forward.',
    });
    expect(r.kind).toBe('rejection');
    expect(r.confidence).toBe('high');
  });
});

describe('classifyEmail — take-home', () => {
  it('"take-home assignment" → take-home stage', () => {
    const r = classifyEmail({
      ...baseEmail,
      subject: 'Next step',
      body: 'Please complete this take-home assignment by Friday.',
    });
    expect(r.kind).toBe('take-home');
    expect(r.stage).toBe('TakeHome');
  });
});

describe('classifyEmail — interview-scheduling', () => {
  it('"schedule a call" → interview-scheduling default PhoneScreen', () => {
    const r = classifyEmail({
      ...baseEmail,
      subject: "Let's schedule a call",
      body: "I'd love to hop on a call to discuss the role.",
    });
    expect(r.kind).toBe('interview-scheduling');
    expect(r.stage).toBe('PhoneScreen');
  });

  it('calendly link → high confidence', () => {
    const r = classifyEmail({
      ...baseEmail,
      subject: 'schedule',
      body: 'pick a time https://calendly.com/jane/intro',
    });
    expect(r.kind).toBe('interview-scheduling');
    expect(r.confidence).toBe('high');
  });
});

describe('classifyEmail — recruiter reach-out', () => {
  it('"reaching out about an opportunity" → recruiter-reach-out', () => {
    const r = classifyEmail({
      ...baseEmail,
      subject: 'Opportunity at our company',
      body: 'I came across your profile and wanted to reach out about an opportunity.',
    });
    expect(r.kind).toBe('recruiter-reach-out');
  });
});

describe('classifyEmail — other', () => {
  it('unrelated email returns "other" with low confidence', () => {
    const r = classifyEmail({
      ...baseEmail,
      subject: 'Quarterly update',
      body: "Here are this quarter's metrics for our open-source contributions.",
    });
    expect(r.kind).toBe('other');
    expect(r.confidence).toBe('low');
  });
});

describe('classifyEmail — sender domain extraction', () => {
  it('extracts domain from "Name <email@domain.com>" form', () => {
    const r = classifyEmail({
      ...baseEmail,
      from: 'Jane Smith <jane@bigco.com>',
      subject: 'x',
      body: '',
    });
    expect(r.senderDomain).toBe('bigco.com');
  });

  it('extracts domain from bare email form', () => {
    const r = classifyEmail({
      ...baseEmail,
      from: 'jane@bigco.com',
      subject: 'x',
      body: '',
    });
    expect(r.senderDomain).toBe('bigco.com');
  });
});

describe('matchEmailToJob', () => {
  it('matches by sender domain to a tracked company', () => {
    const r = matchEmailToJob(
      { ...baseEmail, from: 'recruiter@acme.com', subject: 'x', body: 'x' },
      { kind: 'rejection', confidence: 'high', senderDomain: 'acme.com' },
    );
    expect(r?.jobId).toBe('j1');
  });

  it('matches both company-name + sender-domain signal', () => {
    const r = matchEmailToJob(
      {
        ...baseEmail,
        from: 'recruiter@beta.com',
        subject: 'Update on your Beta Corp application',
        body: 'x',
      },
      { kind: 'rejection', confidence: 'high', senderDomain: 'beta.com' },
    );
    // Beta scores higher because subject mentions "Beta Corp" (+5) AND status
    // Interview (+3) AND beta.com sender matches "betacorp" via the
    // companyLower-no-spaces vs senderHost prefix rule (+2). Total 10.
    expect(r?.jobId).toBe('j2');
  });
});

describe('listLeads — per-profile per-user isolation', () => {
  it('returns empty array when no leads recorded', () => {
    activeProfileId = 'default';
    expect(listLeads()).toEqual([]);
  });

  it("reads from profilePath(active, 'inbound-leads-jsonl'), not a shared repo-root file", () => {
    activeProfileId = 'alice';
    files['/tmp/profile/alice/inbound-leads.jsonl'] =
      `${JSON.stringify({ sender: 'recruiter@a.com', subject: 'Alice lead', ts: 100 })}\n`;
    const got = listLeads();
    expect(got).toHaveLength(1);
    expect(got[0].subject).toBe('Alice lead');
  });

  it("does NOT leak one profile's leads into another profile's reads", () => {
    files['/tmp/profile/work/inbound-leads.jsonl'] =
      `${JSON.stringify({ sender: 'wr@x.com', subject: 'WORK_LEAD', ts: 200 })}\n`;
    files['/tmp/profile/teach/inbound-leads.jsonl'] =
      `${JSON.stringify({ sender: 'tr@y.com', subject: 'TEACH_LEAD', ts: 300 })}\n`;

    activeProfileId = 'work';
    expect(listLeads().map((l) => l.subject)).toEqual(['WORK_LEAD']);

    activeProfileId = 'teach';
    expect(listLeads().map((l) => l.subject)).toEqual(['TEACH_LEAD']);
  });

  it('skips structured Lead objects written by inbound-leads.ts (different schema)', () => {
    activeProfileId = 'default';
    // The inbound-leads.ts module writes structured Lead objects with
    // different keys (leadId, fingerprint, classification, ...). When
    // email-reactor's listLeads() reads the same per-profile file, it
    // should skip those rows rather than render half-parsed leads.
    files['/tmp/profile/default/inbound-leads.jsonl'] = `${JSON.stringify({
      sender: 'r@x.com',
      subject: 'simple',
      ts: 100,
    })}\n${JSON.stringify({
      leadId: 'abc',
      fingerprint: 'xyz',
      classification: { kind: 'recruiter-reach-out' },
    })}\n`;

    const got = listLeads();
    expect(got).toHaveLength(1);
    expect(got[0].subject).toBe('simple');
  });

  it('returns leads sorted newest-first', () => {
    activeProfileId = 'default';
    files['/tmp/profile/default/inbound-leads.jsonl'] = `${JSON.stringify({
      sender: 'a',
      subject: 'OLD',
      ts: 100,
    })}\n${JSON.stringify({ sender: 'b', subject: 'NEW', ts: 200 })}\n`;

    const got = listLeads();
    expect(got.map((l) => l.subject)).toEqual(['NEW', 'OLD']);
  });
});
