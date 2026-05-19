/**
 * lib/server/apply-failures -- dense matrix per failure mode + portal.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const issues: any[] = [];
const events: any[] = [];
const statusCalls: any[] = [];

vi.mock('./issues', () => ({
  reportIssue: (input: any) => issues.push(input),
}));
vi.mock('./events', () => ({
  logEvent: (input: any) => events.push(input),
}));
vi.mock('./applications', () => ({
  markStatus: (...args: any[]) => statusCalls.push(args),
}));
vi.mock('./profiles', () => ({
  getActiveProfileId: () => 'p',
}));

const { reportApplyFailure } = await import('./apply-failures');

const MODES = [
  'stub',
  'captcha',
  'anti-bot',
  'unknown-field',
  'upload-failed',
  'validation',
  'error',
] as const;
const PORTALS = ['linkedin', 'greenhouse', 'ashby', 'lever', 'workday', 'unknown'];

describe('reportApplyFailure — every (mode, portal) pair', () => {
  beforeEach(() => {
    issues.length = 0;
    statusCalls.length = 0;
  });

  for (const mode of MODES) {
    for (const portal of PORTALS) {
      it(`mode=${mode} portal=${portal}`, () => {
        reportApplyFailure({
          jobId: `j-${mode}-${portal}`,
          url: 'https://example.com',
          portal,
          mode,
          company: 'Acme',
        });
        expect(issues.length).toBe(1);
        expect(issues[0].dedupeKey).toBe(`apply:j-${mode}-${portal}`);
        expect(statusCalls.length).toBe(1);
        expect(statusCalls[0][2]).toBe('ManualApplyNeeded');
      });
    }
  }
});

describe('reportApplyFailure — severity per mode', () => {
  beforeEach(() => {
    issues.length = 0;
  });

  it.each(MODES.filter((m) => m !== 'error'))('mode %s → warn', (mode) => {
    reportApplyFailure({ jobId: 'j', portal: 'p', mode });
    expect(issues[0].severity).toBe('warn');
  });

  it('mode error → error severity', () => {
    reportApplyFailure({ jobId: 'j', portal: 'p', mode: 'error' });
    expect(issues[0].severity).toBe('error');
  });
});

describe('reportApplyFailure — without url skips markStatus', () => {
  beforeEach(() => {
    issues.length = 0;
    statusCalls.length = 0;
  });

  it.each(MODES)('mode %s without url → no status flip', (mode) => {
    reportApplyFailure({ jobId: 'j', portal: 'p', mode });
    expect(statusCalls.length).toBe(0);
  });
});

describe('reportApplyFailure — with url DOES flip status', () => {
  beforeEach(() => {
    issues.length = 0;
    statusCalls.length = 0;
  });

  it.each(MODES)('mode %s with url → status=ManualApplyNeeded', (mode) => {
    reportApplyFailure({ jobId: 'j', url: 'https://x', portal: 'p', mode });
    expect(statusCalls.length).toBe(1);
    expect(statusCalls[0][2]).toBe('ManualApplyNeeded');
  });
});
