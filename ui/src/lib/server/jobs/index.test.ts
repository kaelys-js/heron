/**
 * jobs/index.test -- the job-registry barrel + installAllJobs entry point.
 * Mocks every collaborator so the module-load side effects + the
 * installAllJobs flow can run without real timers, HTTP, or DB.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const __register = vi.fn();
const __installAfterListener = vi.fn();
const __runScan = vi.fn();
const __runGemini = vi.fn();
const __runLinkedInApply = vi.fn();
const __startBatchWatcher = vi.fn();
const __migrateToMultiProfile = vi.fn();
const __installInterviewReminderDaemon = vi.fn();
const __reportServerError = vi.fn();

vi.mock('./registry', () => ({
  register: __register,
  installAfterListener: __installAfterListener,
  get: vi.fn(),
  has: vi.fn(),
  list: vi.fn(),
  listSummaries: vi.fn(),
  runById: vi.fn(),
  isRunning: vi.fn(),
}));

vi.mock('../orchestrator', () => ({
  runScan: __runScan,
  runGemini: __runGemini,
  runLinkedInApply: __runLinkedInApply,
}));

vi.mock('./auto-merge-batch', () => ({ startBatchWatcher: __startBatchWatcher }));
vi.mock('../profile-migrate', () => ({ migrateToMultiProfile: __migrateToMultiProfile }));
vi.mock('../events', () => ({
  reportServerError: __reportServerError,
  logEvent: vi.fn(),
  installBusListener: vi.fn(),
  bus: { on: vi.fn(), emit: vi.fn() },
}));
vi.mock('./interview-reminder.job', () => ({
  installInterviewReminderDaemon: __installInterviewReminderDaemon,
}));

// Every other .job import auto-registers via side effects -- mock them
// as empty modules so the import chain doesn't require real timers.
// vi.mock hoists each call so they can't be looped -- list explicitly.
vi.mock('./normalize.job', () => ({}));
vi.mock('./dedup.job', () => ({}));
vi.mock('./verify-pipeline.job', () => ({}));
vi.mock('./liveness.job', () => ({}));
vi.mock('./auto-triage.job', () => ({}));
vi.mock('./scan-portals.job', () => ({}));
vi.mock('./scan-curated.job', () => ({}));
vi.mock('./scan-vc.job', () => ({}));
vi.mock('./scan-email.job', () => ({}));
vi.mock('./scan-email-imap.job', () => ({}));
vi.mock('./scan-linkedin-auth.job', () => ({}));
vi.mock('./scan-indeed-auth.job', () => ({}));
vi.mock('./scan-all.job', () => ({}));
vi.mock('./followup-cadence.job', () => ({}));
vi.mock('./auto-interview-prep', () => ({}));
vi.mock('./auto-queue', () => ({}));
vi.mock('./daily-digest.job', () => ({}));
vi.mock('./apply-linkedin-login.job', () => ({}));
vi.mock('./compile-latex.job', () => ({}));
vi.mock('../autopilot-circuit-breaker', () => ({}));
vi.mock('./apply-queue.job', () => ({}));
vi.mock('./backup.job', () => ({}));
vi.mock('./auto-ghost.job', () => ({}));
vi.mock('./linkedin-audit.job', () => ({}));
vi.mock('./linkedin-dm.job', () => ({}));
vi.mock('./lifecycle-reap.job', () => ({}));

beforeEach(() => {
  __register.mockReset();
  __installAfterListener.mockReset();
  __runScan.mockReset();
  __runGemini.mockReset();
  __runLinkedInApply.mockReset();
  __startBatchWatcher.mockReset();
  __migrateToMultiProfile.mockReset();
  __installInterviewReminderDaemon.mockReset();
  __reportServerError.mockReset();
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('jobs/index -- installAllJobs', () => {
  it('calls migrateToMultiProfile first', async () => {
    const { installAllJobs } = await import('./index');
    installAllJobs();
    expect(__migrateToMultiProfile).toHaveBeenCalledTimes(1);
  });

  it('registers the scan / gemini / apply-linkedin legacy jobs', async () => {
    const { installAllJobs } = await import('./index');
    installAllJobs();
    const ids = __register.mock.calls.map((c) => c[0].id);
    expect(ids).toContain('scan');
    expect(ids).toContain('gemini');
    expect(ids).toContain('apply-linkedin');
  });

  it('installs the after-listener for trigger:after jobs', async () => {
    const { installAllJobs } = await import('./index');
    installAllJobs();
    expect(__installAfterListener).toHaveBeenCalledTimes(1);
  });

  it('starts the batch-tracker fs watcher', async () => {
    const { installAllJobs } = await import('./index');
    installAllJobs();
    expect(__startBatchWatcher).toHaveBeenCalledTimes(1);
  });

  it('installs the interview-reminder daemon', async () => {
    const { installAllJobs } = await import('./index');
    installAllJobs();
    expect(__installInterviewReminderDaemon).toHaveBeenCalledTimes(1);
  });

  it('is idempotent -- second call is a no-op', async () => {
    const { installAllJobs } = await import('./index');
    installAllJobs();
    __register.mockReset();
    __installAfterListener.mockReset();
    installAllJobs();
    expect(__register).not.toHaveBeenCalled();
    expect(__installAfterListener).not.toHaveBeenCalled();
  });

  it('reports the migration failure when migrateToMultiProfile throws', async () => {
    __migrateToMultiProfile.mockImplementation(() => {
      throw new Error('boom');
    });
    const { installAllJobs } = await import('./index');
    installAllJobs();
    // Dynamic import resolves on next microtask -- await one round.
    await new Promise((r) => setTimeout(r, 0));
    expect(__reportServerError).toHaveBeenCalled();
    const call = __reportServerError.mock.calls[0];
    expect(call[0]).toBe('migrate');
    expect(call[1]).toContain('Multi-profile migration failed');
  });
});

describe('jobs/index -- legacy job run() handlers', () => {
  it('scan run() invokes runScan + returns ok', async () => {
    const { installAllJobs } = await import('./index');
    installAllJobs();
    const scanCall = __register.mock.calls.find((c) => c[0].id === 'scan');
    const result = scanCall![0].run();
    expect(__runScan).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it('gemini run() defaults top=30 when no args', async () => {
    const { installAllJobs } = await import('./index');
    installAllJobs();
    const geminiCall = __register.mock.calls.find((c) => c[0].id === 'gemini');
    geminiCall![0].run();
    expect(__runGemini).toHaveBeenCalledWith(30);
  });

  it('gemini run() honours explicit args.top', async () => {
    const { installAllJobs } = await import('./index');
    installAllJobs();
    const geminiCall = __register.mock.calls.find((c) => c[0].id === 'gemini');
    geminiCall![0].run({ top: 50 });
    expect(__runGemini).toHaveBeenCalledWith(50);
  });

  it('apply-linkedin run() passes through autoSubmit + url', async () => {
    const { installAllJobs } = await import('./index');
    installAllJobs();
    const applyCall = __register.mock.calls.find((c) => c[0].id === 'apply-linkedin');
    applyCall![0].run({ autoSubmit: true, url: 'https://linkedin.com/jobs/123' });
    expect(__runLinkedInApply).toHaveBeenCalledWith(true, 'https://linkedin.com/jobs/123');
  });

  it('apply-linkedin run() defaults autoSubmit=false when omitted', async () => {
    const { installAllJobs } = await import('./index');
    installAllJobs();
    const applyCall = __register.mock.calls.find((c) => c[0].id === 'apply-linkedin');
    applyCall![0].run({});
    expect(__runLinkedInApply).toHaveBeenCalledWith(false, undefined);
  });
});

describe('jobs/index -- registered job metadata', () => {
  it('every registered job has id + label + description + category + run', async () => {
    const { installAllJobs } = await import('./index');
    installAllJobs();
    for (const call of __register.mock.calls) {
      const job = call[0];
      expect(job.id).toBeTruthy();
      expect(job.label).toBeTruthy();
      expect(job.description).toBeTruthy();
      expect(job.category).toBeTruthy();
      expect(typeof job.run).toBe('function');
    }
  });

  it('legacy jobs are flagged perUser:true (multi-user fan-out)', async () => {
    const { installAllJobs } = await import('./index');
    installAllJobs();
    for (const id of ['scan', 'gemini', 'apply-linkedin']) {
      const call = __register.mock.calls.find((c) => c[0].id === id);
      expect(call![0].perUser).toBe(true);
    }
  });
});
