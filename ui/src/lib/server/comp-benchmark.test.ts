/**
 * lib/server/comp-benchmark -- spawn AGENT_CLI for comp band research,
 * plus manualBenchmark shape helper.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

type FakeProc = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: (sig?: string) => void;
};

let nextOutcome: { stdout: string; stderr?: string; errors?: Error; hangs?: boolean } = {
  stdout: '',
};
const spawnCalls: { bin: string; args: string[] }[] = [];

vi.mock('node:child_process', () => ({
  spawn: vi.fn((bin: string, args: string[]) => {
    const p = new EventEmitter() as FakeProc;
    p.stdout = new EventEmitter();
    p.stderr = new EventEmitter();
    p.kill = vi.fn();
    spawnCalls.push({ bin, args });
    queueMicrotask(() => {
      if (nextOutcome.errors) {
        p.emit('error', nextOutcome.errors);
        return;
      }
      if (nextOutcome.hangs) {
        return;
      }
      if (nextOutcome.stdout) {
        p.stdout.emit('data', Buffer.from(nextOutcome.stdout));
      }
      if (nextOutcome.stderr) {
        p.stderr.emit('data', Buffer.from(nextOutcome.stderr));
      }
      p.emit('close', 0);
    });
    return p;
  }),
}));

vi.mock('$lib/config/branding', () => ({
  CLI_NAMESPACE: 'heron',
}));

vi.mock('$lib/config/cli', () => ({
  AGENT_CLI: 'claude',
}));

vi.mock('./files', () => ({ ROOT: '/tmp/repo', DATA_ROOT: '/tmp/repo/data' }));

const reportedErrors: { source: string; msg: string }[] = [];
const loggedEvents: { source: string; msg: string }[] = [];
vi.mock('./events', () => ({
  reportServerError: (source: string, msg: string) => {
    reportedErrors.push({ source, msg });
  },
  logEvent: (source: string, msg: string) => {
    loggedEvents.push({ source, msg });
  },
}));

const { fetchBenchmark, manualBenchmark } = await import('./comp-benchmark');

beforeEach(() => {
  spawnCalls.length = 0;
  reportedErrors.length = 0;
  loggedEvents.length = 0;
  nextOutcome = { stdout: '' };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('fetchBenchmark — happy path', () => {
  it('spawns AGENT_CLI with the deep --benchmark-comp prompt prefix', async () => {
    nextOutcome.stdout = JSON.stringify({ medianTc: 250000, source: 'levels.fyi' });
    await fetchBenchmark({ company: 'Acme', role: 'Eng', location: 'SF' });
    expect(spawnCalls[0].bin).toBe('claude');
    expect(spawnCalls[0].args[0]).toBe('-p');
    expect(spawnCalls[0].args[1]).toContain('/heron deep --benchmark-comp');
    expect(spawnCalls[0].args).toContain('--dangerously-skip-permissions');
  });

  it('parses the medianTc JSON + stamps refreshedAt', async () => {
    nextOutcome.stdout = JSON.stringify({
      medianTc: 250000,
      p25Tc: 220000,
      p75Tc: 290000,
      source: 'levels.fyi',
    });
    const before = Date.now();
    const r = await fetchBenchmark({ company: 'Acme', role: 'Eng', location: 'SF' });
    expect(r?.medianTc).toBe(250000);
    expect(r?.p25Tc).toBe(220000);
    expect(r?.p75Tc).toBe(290000);
    expect(r?.refreshedAt).toBeGreaterThanOrEqual(before);
  });

  it('defaults currency to USD when not specified', async () => {
    nextOutcome.stdout = JSON.stringify({ medianTc: 100000 });
    const r = await fetchBenchmark({ company: 'Acme', role: 'Eng', location: 'SF' });
    expect(r?.currency).toBe('USD');
  });

  it('honours explicit currency', async () => {
    nextOutcome.stdout = JSON.stringify({ medianTc: 100000 });
    const r = await fetchBenchmark({
      company: 'Acme',
      role: 'Eng',
      location: 'Berlin',
      currency: 'EUR',
    });
    expect(r?.currency).toBe('EUR');
  });

  it('source defaults to "levels.fyi" when JSON omits it', async () => {
    nextOutcome.stdout = JSON.stringify({ medianTc: 100000 });
    const r = await fetchBenchmark({ company: 'Acme', role: 'Eng', location: 'SF' });
    expect(r?.source).toBe('levels.fyi');
  });

  it('emits a logEvent with the median + currency for audit', async () => {
    nextOutcome.stdout = JSON.stringify({ medianTc: 200000 });
    await fetchBenchmark({ company: 'Acme', role: 'Eng', location: 'SF' });
    expect(loggedEvents.find((e) => e.source === 'comp-benchmark')).toBeTruthy();
  });
});

describe('fetchBenchmark — failure modes', () => {
  it('returns null when stdout has no JSON', async () => {
    nextOutcome.stdout = 'sorry, can not fetch';
    const r = await fetchBenchmark({ company: 'Acme', role: 'Eng', location: 'SF' });
    expect(r).toBeNull();
  });

  it('returns null when JSON lacks medianTc', async () => {
    nextOutcome.stdout = JSON.stringify({ p25Tc: 100, p75Tc: 200 });
    expect(await fetchBenchmark({ company: 'Acme', role: 'Eng', location: 'SF' })).toBeNull();
  });

  it('returns null on spawn error', async () => {
    nextOutcome.errors = new Error('ENOENT: claude');
    expect(await fetchBenchmark({ company: 'Acme', role: 'Eng', location: 'SF' })).toBeNull();
  });

  it('reports a server error when stderr is non-empty + no JSON', async () => {
    nextOutcome.stdout = '';
    nextOutcome.stderr = 'rate-limited';
    await fetchBenchmark({ company: 'Acme', role: 'Eng', location: 'SF' });
    expect(reportedErrors.some((e) => e.source === 'comp-benchmark')).toBe(true);
  });
});

describe('manualBenchmark — pure helper', () => {
  it('builds an OfferBenchmark with source="manual"', () => {
    const r = manualBenchmark(
      { company: 'Acme', role: 'Eng', location: 'SF' },
      { medianTc: 200000, p25Tc: 180000, p75Tc: 230000, sourceUrl: 'https://levels.fyi/x' },
    );
    expect(r.source).toBe('manual');
    expect(r.medianTc).toBe(200000);
    expect(r.p25Tc).toBe(180000);
    expect(r.p75Tc).toBe(230000);
    expect(r.sourceUrl).toBe('https://levels.fyi/x');
  });

  it('defaults currency to USD when not provided', () => {
    const r = manualBenchmark({ company: 'A', role: 'B', location: 'C' }, { medianTc: 100 });
    expect(r.currency).toBe('USD');
  });

  it('honours explicit currency', () => {
    const r = manualBenchmark(
      { company: 'A', role: 'B', location: 'C', currency: 'GBP' },
      { medianTc: 100 },
    );
    expect(r.currency).toBe('GBP');
  });

  it('stamps refreshedAt to now', () => {
    const before = Date.now();
    const r = manualBenchmark({ company: 'A', role: 'B', location: 'C' }, { medianTc: 100 });
    expect(r.refreshedAt).toBeGreaterThanOrEqual(before);
  });
});
