/**
 * lib/server/quality-checks -- spawn wrappers for ats-check / resume-
 * quality / cover-letter-check / ai-detect.
 *
 * Mocks child_process.spawn so we can drive every branch (good JSON,
 * malformed JSON, timeout, non-zero exit) without actually shelling
 * out.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

type FakeProc = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: (sig?: string) => void;
};

let nextOutcome: {
  stdout: string;
  stderr?: string;
  exitCode?: number;
  hangs?: boolean;
  errors?: Error;
} = {
  stdout: '',
};
const spawnCalls: { script: string; args: string[] }[] = [];

function makeFakeProc(): FakeProc {
  const proc = new EventEmitter() as FakeProc;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();
  return proc;
}

vi.mock('node:child_process', () => ({
  spawn: vi.fn((_node: string, allArgs: string[]) => {
    const proc = makeFakeProc();
    // script is the second arg after 'node' (the joined ROOT + scriptName)
    spawnCalls.push({ script: allArgs[0], args: allArgs.slice(1) });
    queueMicrotask(() => {
      if (nextOutcome.errors) {
        proc.emit('error', nextOutcome.errors);
        return;
      }
      if (nextOutcome.hangs) return; // never closes — timer in code will fire
      if (nextOutcome.stdout) proc.stdout.emit('data', Buffer.from(nextOutcome.stdout));
      if (nextOutcome.stderr) proc.stderr.emit('data', Buffer.from(nextOutcome.stderr));
      proc.emit('close', nextOutcome.exitCode ?? 0);
    });
    return proc;
  }),
}));

vi.mock('./files', () => ({ ROOT: '/tmp/repo' }));

const reportedErrors: { source: string; msg: string }[] = [];
vi.mock('./events', () => ({
  reportServerError: (source: string, msg: string) => {
    reportedErrors.push({ source, msg });
  },
}));

const { checkAts, checkResumeQuality, checkCoverLetter, checkAiDetect } = await import(
  './quality-checks'
);

beforeEach(() => {
  spawnCalls.length = 0;
  reportedErrors.length = 0;
  nextOutcome = { stdout: '' };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('checkAts', () => {
  it('spawns ats-check.mjs with the PDF path + --json', async () => {
    nextOutcome.stdout = JSON.stringify({ score: 90, total: 10, checks: [] });
    await checkAts('/tmp/cv.pdf');
    expect(spawnCalls[0].script).toContain('ats-check.mjs');
    expect(spawnCalls[0].args).toContain('/tmp/cv.pdf');
    expect(spawnCalls[0].args).toContain('--json');
  });

  it('parses checks + passes through score/total/counters', async () => {
    nextOutcome.stdout = JSON.stringify({
      score: 85,
      total: 12,
      passCount: 9,
      warnCount: 1,
      failCount: 2,
      checks: [{ status: 'pass', name: 'C1', evidence: '' }],
    });
    const r = await checkAts('/tmp/cv.pdf');
    expect(r.score).toBe(85);
    expect(r.total).toBe(12);
    expect(r.passCount).toBe(9);
    expect(r.warnCount).toBe(1);
    expect(r.failCount).toBe(2);
    expect(r.checks.length).toBe(1);
  });

  it('builds a markdown failSummary from failed checks', async () => {
    nextOutcome.stdout = JSON.stringify({
      score: 60,
      checks: [
        { status: 'fail', name: 'No experience', evidence: 'CV lacks bullets' },
        { status: 'pass', name: 'PDF readable', evidence: '' },
      ],
    });
    const r = await checkAts('/tmp/cv.pdf');
    expect(r.failSummary).toContain('No experience');
    expect(r.failSummary).toContain('CV lacks bullets');
    expect(r.failSummary).not.toContain('PDF readable');
  });

  it('passes --lenient when opts.lenient = true', async () => {
    nextOutcome.stdout = JSON.stringify({ score: 0, checks: [] });
    await checkAts('/tmp/cv.pdf', { lenient: true });
    expect(spawnCalls[0].args).toContain('--lenient');
  });

  it('returns empty result + reports server error when JSON is malformed', async () => {
    nextOutcome.stdout = 'not-json';
    const r = await checkAts('/tmp/cv.pdf');
    expect(r.failCount).toBe(1);
    expect(r.checks[0].name).toBe('Checker crashed');
    expect(reportedErrors.length).toBe(1);
  });

  it('returns empty result + reports server error on spawn failure', async () => {
    nextOutcome.errors = new Error('ENOENT: node');
    const r = await checkAts('/tmp/cv.pdf');
    expect(r.failCount).toBe(1);
    expect(reportedErrors.length).toBe(1);
  });
});

describe('checkResumeQuality', () => {
  it('spawns resume-quality.mjs', async () => {
    nextOutcome.stdout = JSON.stringify({ score: 80, checks: [] });
    await checkResumeQuality('/tmp/cv.md');
    expect(spawnCalls[0].script).toContain('resume-quality.mjs');
  });

  it('passes --lenient when requested', async () => {
    nextOutcome.stdout = JSON.stringify({ score: 0, checks: [] });
    await checkResumeQuality('/tmp/cv.md', { lenient: true });
    expect(spawnCalls[0].args).toContain('--lenient');
  });
});

describe('checkCoverLetter', () => {
  it('spawns cover-letter-check.mjs with --company + --role', async () => {
    nextOutcome.stdout = JSON.stringify({ score: 90, checks: [] });
    await checkCoverLetter('/tmp/cover.md', { company: 'Acme', role: 'Eng' });
    expect(spawnCalls[0].args).toContain('--company=Acme');
    expect(spawnCalls[0].args).toContain('--role=Eng');
  });

  it('omits --company when not provided', async () => {
    nextOutcome.stdout = JSON.stringify({ score: 0, checks: [] });
    await checkCoverLetter('/tmp/cover.md');
    expect(spawnCalls[0].args.some((a) => a.startsWith('--company='))).toBe(false);
  });

  it('passes --lenient when requested', async () => {
    nextOutcome.stdout = JSON.stringify({ score: 0, checks: [] });
    await checkCoverLetter('/tmp/cover.md', { lenient: true });
    expect(spawnCalls[0].args).toContain('--lenient');
  });
});

describe('checkAiDetect', () => {
  it('spawns ai-detect-check.mjs with --json', async () => {
    nextOutcome.stdout = JSON.stringify({
      aiScore: 30,
      wordCount: 500,
      sentences: 20,
      signals: { perplexity: { value: 0.5, evidence: 'normal' } },
    });
    const r = await checkAiDetect('/tmp/cv.md');
    expect(spawnCalls[0].script).toContain('ai-detect-check.mjs');
    expect(r.aiScore).toBe(30);
    expect(r.wordCount).toBe(500);
    expect(r.signals.perplexity.value).toBe(0.5);
  });
});

describe('result shape — null-object on failure', () => {
  it('failSummary is empty string when no fails', async () => {
    nextOutcome.stdout = JSON.stringify({
      score: 100,
      checks: [
        { status: 'pass', name: 'A', evidence: '' },
        { status: 'warn', name: 'B', evidence: '' },
      ],
    });
    const r = await checkAts('/tmp/cv.pdf');
    expect(r.failSummary).toBe('');
  });

  it('checks default to [] when JSON omits them', async () => {
    nextOutcome.stdout = JSON.stringify({ score: 50 });
    const r = await checkAts('/tmp/cv.pdf');
    expect(r.checks).toEqual([]);
  });

  it('counters default to 0 when JSON omits them', async () => {
    nextOutcome.stdout = JSON.stringify({});
    const r = await checkAts('/tmp/cv.pdf');
    expect(r.score).toBe(0);
    expect(r.passCount).toBe(0);
    expect(r.warnCount).toBe(0);
    expect(r.failCount).toBe(0);
  });
});
