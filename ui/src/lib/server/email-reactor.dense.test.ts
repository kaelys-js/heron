/**
 * email-reactor.dense.test -- exhaustive classifyEmail branch coverage.
 *
 * classifyEmail has 5 main branches (offer / rejection / take-home /
 * interview-scheduling / recruiter-reach-out / other) plus stage
 * sub-branches inside interview-scheduling, plus confidence sub-branches
 * inside rejection + scheduling. This test pins each branch + the
 * precedence order between branches.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('./parsers', () => ({
  loadAllJobs: () => [],
}));

vi.mock('./applications', () => ({
  markStatus: vi.fn(),
}));

vi.mock('./events', () => ({
  logEvent: vi.fn(),
}));

vi.mock('./profile-paths', () => ({
  profilePath: (_pid: string, _kind: string) => '/test/path',
}));

vi.mock('./profiles', () => ({
  getActiveProfileId: () => 'default',
}));

const { classifyEmail, planActions } = await import('./email-reactor');

const baseEmail = { ts: 1700000000000, from: 'jane@acme.com', subject: 's', body: 'b' };
const baseMatch = {
  jobId: 'j1',
  profileId: 'engineer',
  url: 'https://acme.com/jobs/1',
  company: 'Acme',
  status: 'Applied',
};

function email(subj: string, body: string, from = 'recruiter@acme.com') {
  return { ts: 1700000000000, from, subject: subj, body };
}

describe('classifyEmail -- offer branch', () => {
  it('matches "we are pleased to offer"', () => {
    const r = classifyEmail(email('Offer!', 'We are pleased to offer you the role.'));
    expect(r.kind).toBe('offer');
    expect(r.confidence).toBe('high');
  });

  it('matches "formal offer of employment"', () => {
    expect(classifyEmail(email('s', 'See the formal offer of employment.')).kind).toBe('offer');
  });

  it('matches "offer letter"', () => {
    expect(classifyEmail(email('Your offer letter', 'attached.')).kind).toBe('offer');
  });

  it('matches "base salary of"', () => {
    expect(classifyEmail(email('Offer', 'Base salary of $200k.')).kind).toBe('offer');
  });

  it('matches "compensation package"', () => {
    expect(classifyEmail(email('Offer', 'compensation package details follow.')).kind).toBe(
      'offer',
    );
  });

  it('matches "welcome to the team!"', () => {
    expect(classifyEmail(email('Offer', 'Welcome to the team!')).kind).toBe('offer');
  });
});

describe('classifyEmail -- rejection branch', () => {
  it('matches "after careful consideration" -> HIGH confidence', () => {
    const r = classifyEmail(email('Update', 'After careful consideration, no.'));
    expect(r.kind).toBe('rejection');
    expect(r.confidence).toBe('high');
  });

  it('matches "regret to inform" -> HIGH', () => {
    const r = classifyEmail(email('Update', 'We regret to inform you we chose someone else.'));
    expect(r.kind).toBe('rejection');
    expect(r.confidence).toBe('high');
  });

  it('matches "not the right fit" -> MEDIUM', () => {
    const r = classifyEmail(email('Update', "you're not the right fit for this role."));
    expect(r.kind).toBe('rejection');
    expect(r.confidence).toBe('medium');
  });

  it('matches "no longer considering"', () => {
    expect(classifyEmail(email('Update', 'no longer considering your app.')).kind).toBe(
      'rejection',
    );
  });

  it('matches "decided to move on"', () => {
    expect(classifyEmail(email('Update', 'We decided to move on with another.')).kind).toBe(
      'rejection',
    );
  });

  it('matches "won\'t be moving forward"', () => {
    expect(classifyEmail(email('Update', "We won't be moving forward.")).kind).toBe('rejection');
  });

  it('matches "moved forward with other"', () => {
    expect(classifyEmail(email('Update', 'moved forward with other candidates.')).kind).toBe(
      'rejection',
    );
  });
});

describe('classifyEmail -- take-home branch', () => {
  it('matches "take-home assignment"', () => {
    const r = classifyEmail(
      email('Take-home', 'Please complete the take-home assignment by Friday.'),
    );
    expect(r.kind).toBe('take-home');
    expect(r.stage).toBe('TakeHome');
  });

  it('matches "coding challenge"', () => {
    expect(classifyEmail(email('Coding challenge', 'attached.')).kind).toBe('take-home');
  });

  it('matches "take home exercise"', () => {
    expect(classifyEmail(email('Test', 'Please attempt the take home exercise.')).kind).toBe(
      'take-home',
    );
  });
});

describe('classifyEmail -- interview-scheduling stages', () => {
  it('onsite stage from "onsite"', () => {
    const r = classifyEmail(email('subj', "We'd like to invite you to an onsite interview."));
    expect(r.kind).toBe('interview-scheduling');
    expect(r.stage).toBe('Onsite');
  });

  it('onsite stage from "panel"', () => {
    const r = classifyEmail(email('subj', 'We would like to schedule a panel interview.'));
    expect(r.stage).toBe('Onsite');
  });

  it('final stage from "final round"', () => {
    const r = classifyEmail(email('subj', 'We would like to schedule the final round interview.'));
    expect(r.stage).toBe('Final');
  });

  it('technical stage from "technical interview"', () => {
    const r = classifyEmail(email('subj', 'We would like to schedule a technical interview.'));
    expect(r.stage).toBe('Technical');
  });

  it('technical stage from "system design"', () => {
    const r = classifyEmail(email('subj', 'We would like to schedule a system design interview.'));
    expect(r.stage).toBe('Technical');
  });

  it('phoneScreen stage from "phone screen"', () => {
    const r = classifyEmail(email('subj', 'We would like to schedule a phone screen.'));
    expect(r.stage).toBe('PhoneScreen');
  });

  it('phoneScreen stage from "intro call"', () => {
    const r = classifyEmail(email('subj', 'We would like to schedule an intro call.'));
    expect(r.stage).toBe('PhoneScreen');
  });

  it('defaults to PhoneScreen when stage ambiguous', () => {
    const r = classifyEmail(email('Chat', "Let's schedule a call when you're available."));
    expect(r.stage).toBe('PhoneScreen');
  });

  it('calendly link elevates confidence to HIGH', () => {
    const r = classifyEmail(email('Chat', "Here's my calendly.com/recruiter."));
    expect(r.confidence).toBe('high');
  });

  it('savvyCal link elevates confidence to HIGH', () => {
    const r = classifyEmail(email('Chat', 'savvycal link: https://savvycal.com/x'));
    expect(r.confidence).toBe('high');
  });

  it('no scheduling-tool link -> MEDIUM confidence', () => {
    const r = classifyEmail(email('Chat', "Let's schedule a call."));
    expect(r.confidence).toBe('medium');
  });
});

describe('classifyEmail -- recruiter-reach-out branch', () => {
  it('matches "came across your profile"', () => {
    expect(classifyEmail(email('Hello', 'I came across your LinkedIn profile.')).kind).toBe(
      'recruiter-reach-out',
    );
  });

  it('matches "open to hearing about"', () => {
    expect(
      classifyEmail(email('Hello', 'Are you open to hearing about new opportunities?')).kind,
    ).toBe('recruiter-reach-out');
  });

  it('matches "I am a recruiter at"', () => {
    expect(classifyEmail(email('Hello', "I'm a recruiter at FastGrowth Inc.")).kind).toBe(
      'recruiter-reach-out',
    );
  });
});

describe('classifyEmail -- other (fallthrough)', () => {
  it('returns other/low for unrecognized content', () => {
    const r = classifyEmail(email('Newsletter', 'This week in JavaScript: ...'));
    expect(r.kind).toBe('other');
    expect(r.confidence).toBe('low');
  });

  it('returns other for empty content', () => {
    expect(classifyEmail(email('', '')).kind).toBe('other');
  });
});

describe('classifyEmail -- sender domain extraction', () => {
  it('extracts domain from "Display Name <user@domain>" format', () => {
    expect(classifyEmail(email('s', 'b', 'Jane Doe <jane@acme.com>')).senderDomain).toBe(
      'acme.com',
    );
  });

  it('extracts domain from bare address', () => {
    expect(classifyEmail(email('s', 'b', 'jane@acme.com')).senderDomain).toBe('acme.com');
  });

  it('lowercases the domain', () => {
    expect(classifyEmail(email('s', 'b', 'jane@ACME.COM')).senderDomain).toBe('acme.com');
  });

  it('returns empty string when no @ present', () => {
    expect(classifyEmail(email('s', 'b', 'noreply')).senderDomain).toBe('');
  });
});

describe('classifyEmail -- precedence order', () => {
  it('offer pattern beats take-home (offer checked first)', () => {
    const r = classifyEmail(
      email('Subj', 'We are pleased to offer you the role. Take-home assignment attached.'),
    );
    expect(r.kind).toBe('offer');
  });

  it('rejection beats recruiter-reach-out (rejection checked first)', () => {
    const r = classifyEmail(
      email(
        'Subj',
        "After careful consideration, no. We'll keep your profile for new opportunities.",
      ),
    );
    expect(r.kind).toBe('rejection');
  });

  it('take-home beats interview-scheduling (take-home checked first)', () => {
    const r = classifyEmail(
      email('Subj', 'Please complete the take-home assignment. We will schedule a chat after.'),
    );
    expect(r.kind).toBe('take-home');
  });
});

describe('classifyEmail -- robustness', () => {
  it('handles emoji + unicode in body', () => {
    expect(classifyEmail(email('Test', '🎉 formal offer of employment attached.')).kind).toBe(
      'offer',
    );
  });

  it('handles missing body (empty string)', () => {
    const r = classifyEmail({ ts: 1, from: 'x@y.com', subject: '', body: '' });
    expect(r.kind).toBe('other');
  });
});

describe('planActions', () => {
  it('recruiter-reach-out emits a log-lead action (no match needed)', () => {
    const cls = {
      kind: 'recruiter-reach-out' as const,
      confidence: 'medium' as const,
      senderDomain: 'acme.com',
    };
    const actions = planActions(baseEmail, cls, null);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('log-lead');
    if (actions[0].type === 'log-lead') {
      expect(actions[0].sender).toBe('jane@acme.com');
      expect(actions[0].subject).toBe('s');
      expect(actions[0].ts).toBe(1700000000000);
    }
  });

  it('log-lead: parses string-typed ts to ms epoch', () => {
    const cls = {
      kind: 'recruiter-reach-out' as const,
      confidence: 'medium' as const,
      senderDomain: 'acme.com',
    };
    const actions = planActions({ ...baseEmail, ts: '2024-01-15T12:00:00Z' }, cls, null);
    if (actions[0].type === 'log-lead') {
      expect(actions[0].ts).toBeGreaterThan(0);
    }
  });

  it('returns empty when no match (non-recruiter-reach-out classifications)', () => {
    const cls = {
      kind: 'rejection' as const,
      confidence: 'high' as const,
      senderDomain: 'acme.com',
    };
    expect(planActions(baseEmail, cls, null)).toEqual([]);
  });

  it('rejection: mark-status Rejected + fire-post-rejection', () => {
    const cls = {
      kind: 'rejection' as const,
      confidence: 'high' as const,
      senderDomain: 'acme.com',
      evidence: 'after careful consideration',
    };
    const actions = planActions(baseEmail, cls, baseMatch);
    expect(actions).toHaveLength(2);
    expect(actions[0].type).toBe('mark-status');
    if (actions[0].type === 'mark-status') {
      expect(actions[0].status).toBe('Rejected');
      expect(actions[0].jobId).toBe('j1');
    }
    expect(actions[1].type).toBe('fire-post-rejection');
  });

  it('offer: mark-status Offer + flag-offer', () => {
    const cls = { kind: 'offer' as const, confidence: 'high' as const, senderDomain: 'acme.com' };
    const actions = planActions(baseEmail, cls, baseMatch);
    expect(actions).toHaveLength(2);
    if (actions[0].type === 'mark-status') {
      expect(actions[0].status).toBe('Offer');
    }
    expect(actions[1].type).toBe('flag-offer');
  });

  it('interview-scheduling: mark-status with stage value', () => {
    const cls = {
      kind: 'interview-scheduling' as const,
      confidence: 'medium' as const,
      senderDomain: 'acme.com',
      stage: 'PhoneScreen' as const,
    };
    const actions = planActions(baseEmail, cls, baseMatch);
    if (actions[0].type === 'mark-status') {
      expect(actions[0].status).toBe('PhoneScreen');
    }
  });

  it('interview-scheduling Technical: ALSO fires fire-tech-prep', () => {
    const cls = {
      kind: 'interview-scheduling' as const,
      confidence: 'medium' as const,
      senderDomain: 'acme.com',
      stage: 'Technical' as const,
    };
    const actions = planActions(baseEmail, cls, baseMatch);
    expect(actions.some((a) => a.type === 'fire-tech-prep')).toBe(true);
  });

  it('interview-scheduling Onsite: ALSO fires fire-tech-prep', () => {
    const cls = {
      kind: 'interview-scheduling' as const,
      confidence: 'medium' as const,
      senderDomain: 'acme.com',
      stage: 'Onsite' as const,
    };
    const actions = planActions(baseEmail, cls, baseMatch);
    expect(actions.some((a) => a.type === 'fire-tech-prep')).toBe(true);
  });

  it('interview-scheduling Final: ALSO fires fire-tech-prep', () => {
    const cls = {
      kind: 'interview-scheduling' as const,
      confidence: 'medium' as const,
      senderDomain: 'acme.com',
      stage: 'Final' as const,
    };
    const actions = planActions(baseEmail, cls, baseMatch);
    expect(actions.some((a) => a.type === 'fire-tech-prep')).toBe(true);
  });

  it('interview-scheduling PhoneScreen: does NOT fire-tech-prep (not technical)', () => {
    const cls = {
      kind: 'interview-scheduling' as const,
      confidence: 'medium' as const,
      senderDomain: 'acme.com',
      stage: 'PhoneScreen' as const,
    };
    const actions = planActions(baseEmail, cls, baseMatch);
    expect(actions.some((a) => a.type === 'fire-tech-prep')).toBe(false);
  });

  it('take-home: mark-status TakeHome + fire-tech-prep + fire-takehome-scaffold', () => {
    const cls = {
      kind: 'take-home' as const,
      confidence: 'medium' as const,
      senderDomain: 'acme.com',
      stage: 'TakeHome' as const,
    };
    const actions = planActions(baseEmail, cls, baseMatch);
    expect(actions).toHaveLength(3);
    expect(actions[0].type).toBe('mark-status');
    expect(actions.some((a) => a.type === 'fire-tech-prep')).toBe(true);
    expect(actions.some((a) => a.type === 'fire-takehome-scaffold')).toBe(true);
  });

  it('other kind: returns empty actions', () => {
    const cls = { kind: 'other' as const, confidence: 'low' as const, senderDomain: 'acme.com' };
    expect(planActions(baseEmail, cls, baseMatch)).toEqual([]);
  });

  it('mark-status note includes the evidence excerpt', () => {
    const cls = {
      kind: 'rejection' as const,
      confidence: 'high' as const,
      senderDomain: 'acme.com',
      evidence: 'after careful consideration we have decided to go with another candidate',
    };
    const actions = planActions(baseEmail, cls, baseMatch);
    if (actions[0].type === 'mark-status') {
      expect(actions[0].note).toContain('rejection');
      expect(actions[0].note).toContain('after careful');
    }
  });
});
