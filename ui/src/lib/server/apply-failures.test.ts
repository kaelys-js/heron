/**
 * lib/server/apply-failures — single entry-point for autonomous-apply
 * failure reporting (Issue + status flip + activity event).
 *
 * Mocks all four dependencies (reportIssue, logEvent, markStatus,
 * getActiveProfileId) so the call sequence + payloads can be asserted
 * deterministically.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const reportIssueCalls: any[] = [];
const logEventCalls: any[] = [];
const markStatusCalls: any[] = [];

vi.mock('./issues', () => ({
  reportIssue: (input: any) => {
    reportIssueCalls.push(input);
  },
}));
vi.mock('./events', () => ({
  logEvent: (input: any) => {
    logEventCalls.push(input);
  },
}));
vi.mock('./applications', () => ({
  markStatus: (profileId: string, url: string, newStatus: string, notes?: string) => {
    markStatusCalls.push({ profileId, url, newStatus, notes });
  },
}));
vi.mock('./profiles', () => ({
  getActiveProfileId: () => 'test-profile',
}));

const { reportApplyFailure } = await import('./apply-failures');

describe('reportApplyFailure', () => {
  beforeEach(() => {
    reportIssueCalls.length = 0;
    logEventCalls.length = 0;
    markStatusCalls.length = 0;
  });

  it('reports an Issue with apply:{jobId} dedupeKey', () => {
    reportApplyFailure({
      jobId: 'j-1',
      portal: 'linkedin',
      mode: 'captcha',
      company: 'Acme',
    });
    expect(reportIssueCalls.length).toBe(1);
    expect(reportIssueCalls[0].dedupeKey).toBe('apply:j-1');
  });

  it('summary includes mode prefix + company + portal', () => {
    reportApplyFailure({
      jobId: 'j-2',
      portal: 'greenhouse',
      mode: 'captcha',
      company: 'Acme',
      role: 'Engineer',
    });
    const s = reportIssueCalls[0].summary;
    expect(s).toContain('CAPTCHA');
    expect(s).toContain('Acme');
    expect(s).toContain('Engineer');
    expect(s).toContain('greenhouse');
  });

  it('error mode reports as severity=error', () => {
    reportApplyFailure({
      jobId: 'j-3',
      portal: 'lever',
      mode: 'error',
    });
    expect(reportIssueCalls[0].severity).toBe('error');
  });

  it('non-error modes report as severity=warn', () => {
    reportApplyFailure({
      jobId: 'j-4',
      portal: 'lever',
      mode: 'captcha',
    });
    expect(reportIssueCalls[0].severity).toBe('warn');
  });

  it('flips applications.md status to ManualApplyNeeded when url present', () => {
    reportApplyFailure({
      jobId: 'j-5',
      url: 'https://example.com/job',
      portal: 'linkedin',
      mode: 'captcha',
    });
    expect(markStatusCalls.length).toBe(1);
    expect(markStatusCalls[0].newStatus).toBe('ManualApplyNeeded');
    expect(markStatusCalls[0].url).toBe('https://example.com/job');
  });

  it('does NOT flip status when url missing', () => {
    reportApplyFailure({
      jobId: 'j-6',
      portal: 'linkedin',
      mode: 'captcha',
    });
    expect(markStatusCalls.length).toBe(0);
  });

  it('uses provided profileId over active fallback', () => {
    reportApplyFailure({
      jobId: 'j-7',
      url: 'https://x',
      portal: 'linkedin',
      mode: 'captcha',
      profileId: 'custom-profile',
    });
    expect(markStatusCalls[0].profileId).toBe('custom-profile');
  });

  it('falls back to getActiveProfileId when profileId omitted', () => {
    reportApplyFailure({
      jobId: 'j-8',
      url: 'https://x',
      portal: 'linkedin',
      mode: 'captcha',
    });
    expect(markStatusCalls[0].profileId).toBe('test-profile');
  });

  it('includes detail + url + screenshotPath in detailBody', () => {
    reportApplyFailure({
      jobId: 'j-9',
      url: 'https://x',
      portal: 'linkedin',
      mode: 'upload-failed',
      detail: 'PDF too large',
      screenshotPath: 'output/shot.png',
    });
    const d = reportIssueCalls[0].detail;
    expect(d).toContain('PDF too large');
    expect(d).toContain('https://x');
    expect(d).toContain('output/shot.png');
    expect(d).toContain('j-9');
  });

  it('every mode has a distinct summary prefix', () => {
    const modes = [
      'stub',
      'captcha',
      'anti-bot',
      'unknown-field',
      'upload-failed',
      'validation',
      'error',
    ] as const;
    const summaries = new Set<string>();
    for (const mode of modes) {
      reportIssueCalls.length = 0;
      reportApplyFailure({ jobId: 'j', portal: 'p', mode, company: 'X' });
      const prefix = reportIssueCalls[0].summary.split(' · ')[0];
      summaries.add(prefix);
    }
    expect(summaries.size).toBe(modes.length);
  });

  it('every mode has a fix label (when url given)', () => {
    const modes = [
      'stub',
      'captcha',
      'anti-bot',
      'unknown-field',
      'upload-failed',
      'validation',
      'error',
    ] as const;
    for (const mode of modes) {
      reportIssueCalls.length = 0;
      reportApplyFailure({ jobId: 'j', url: 'https://x', portal: 'p', mode });
      expect(reportIssueCalls[0].fix?.label).toBeTruthy();
    }
  });

  it('omits fix CTA when url is absent', () => {
    reportApplyFailure({
      jobId: 'j',
      portal: 'p',
      mode: 'captcha',
    });
    expect(reportIssueCalls[0].fix).toBeUndefined();
  });
});
