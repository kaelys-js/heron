/**
 * lib/server/interview-schedule -- JSONL-backed per-job schedule + reminder
 * windows. Append-only with last-write-wins on jobId.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockFile: string | null = null;
const fsMock = {
  existsSync: vi.fn(() => mockFile !== null),
  readFileSync: vi.fn(() => mockFile ?? ''),
  appendFileSync: vi.fn((_p: string, body: string) => {
    mockFile = (mockFile ?? '') + body;
  }),
  mkdirSync: vi.fn(),
};
vi.mock('node:fs', () => ({ default: fsMock, ...fsMock }));

vi.mock('./profile-paths', () => ({
  profilePath: (_id: string, _key: string) => '/tmp',
}));

const { listSchedule, getSchedule, setSchedule, markReminderFired, dueReminders } = await import(
  './interview-schedule'
);

beforeEach(() => {
  mockFile = null;
  fsMock.existsSync.mockReset().mockImplementation(() => mockFile !== null);
  fsMock.readFileSync.mockReset().mockImplementation(() => mockFile ?? '');
  fsMock.appendFileSync.mockReset().mockImplementation((_p: string, body: string) => {
    mockFile = (mockFile ?? '') + body;
  });
  fsMock.mkdirSync.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('interview-schedule — listSchedule', () => {
  it('empty when no file', () => {
    expect(listSchedule('default')).toEqual([]);
  });

  it('parses well-formed JSONL', () => {
    mockFile =
      JSON.stringify({ jobId: 'j1', scheduledAt: 1000, setAt: 100 }) +
      '\n' +
      JSON.stringify({ jobId: 'j2', scheduledAt: 2000, setAt: 200 }) +
      '\n';
    expect(listSchedule('default').map((e) => e.jobId)).toEqual(['j1', 'j2']);
  });

  it('skips corrupted lines but keeps valid ones', () => {
    mockFile =
      JSON.stringify({ jobId: 'j1', scheduledAt: 1000, setAt: 100 }) +
      '\nNOT-JSON\n' +
      JSON.stringify({ jobId: 'j2', scheduledAt: 2000, setAt: 200 }) +
      '\n';
    expect(listSchedule('default').map((e) => e.jobId)).toEqual(['j1', 'j2']);
  });

  it('last-write-wins on jobId (append-log semantics)', () => {
    mockFile =
      JSON.stringify({ jobId: 'j1', scheduledAt: 1000, setAt: 100 }) +
      '\n' +
      JSON.stringify({ jobId: 'j1', scheduledAt: 3000, setAt: 300 }) +
      '\n';
    const list = listSchedule('default');
    expect(list.length).toBe(1);
    expect(list[0].scheduledAt).toBe(3000);
  });

  it('sorts ascending by scheduledAt', () => {
    mockFile =
      JSON.stringify({ jobId: 'j2', scheduledAt: 2000, setAt: 200 }) +
      '\n' +
      JSON.stringify({ jobId: 'j1', scheduledAt: 1000, setAt: 100 }) +
      '\n';
    expect(listSchedule('default').map((e) => e.jobId)).toEqual(['j1', 'j2']);
  });
});

describe('interview-schedule — getSchedule / setSchedule', () => {
  it('returns null for unknown jobId', () => {
    expect(getSchedule('default', 'missing')).toBeNull();
  });

  it('setSchedule writes + appears in subsequent reads', () => {
    setSchedule('default', { jobId: 'j1', scheduledAt: 5000, stage: 'PhoneScreen' });
    const r = getSchedule('default', 'j1');
    expect(r?.stage).toBe('PhoneScreen');
    expect(r?.scheduledAt).toBe(5000);
  });

  it('setSchedule preserves fired flags when scheduledAt unchanged', () => {
    mockFile =
      JSON.stringify({
        jobId: 'j1',
        scheduledAt: 5000,
        setAt: 1,
        reminders: { fired24h: true, fired30min: false },
      }) + '\n';
    setSchedule('default', { jobId: 'j1', scheduledAt: 5000, stage: 'Updated' });
    const r = getSchedule('default', 'j1');
    expect(r?.reminders?.fired24h).toBe(true);
  });

  it('setSchedule RESETS fired flags when scheduledAt changes (rescheduled)', () => {
    mockFile =
      JSON.stringify({
        jobId: 'j1',
        scheduledAt: 5000,
        setAt: 1,
        reminders: { fired24h: true, fired30min: true },
      }) + '\n';
    setSchedule('default', { jobId: 'j1', scheduledAt: 9999 });
    const r = getSchedule('default', 'j1');
    expect(r?.reminders?.fired24h).toBeUndefined();
    expect(r?.reminders?.fired30min).toBeUndefined();
  });
});

describe('interview-schedule — markReminderFired', () => {
  it('flips the fired30min flag', () => {
    setSchedule('default', { jobId: 'j1', scheduledAt: 1000 });
    markReminderFired('default', 'j1', '30min');
    expect(getSchedule('default', 'j1')?.reminders?.fired30min).toBe(true);
  });

  it('flips the fired24h flag', () => {
    setSchedule('default', { jobId: 'j1', scheduledAt: 1000 });
    markReminderFired('default', 'j1', '24h');
    expect(getSchedule('default', 'j1')?.reminders?.fired24h).toBe(true);
  });

  it('no-op when jobId does not exist', () => {
    markReminderFired('default', 'ghost', '24h');
    expect(getSchedule('default', 'ghost')).toBeNull();
  });
});

describe('interview-schedule — dueReminders', () => {
  it('finds an entry inside the T-30min window', () => {
    const now = 1_000_000;
    setSchedule('default', { jobId: 'j-soon', scheduledAt: now + 20 * 60 * 1000 });
    const r = dueReminders('default', now);
    expect(r.thirtyMin.map((e) => e.jobId)).toContain('j-soon');
  });

  it('finds an entry inside the T-24h window', () => {
    const now = 1_000_000;
    setSchedule('default', { jobId: 'j-tomorrow', scheduledAt: now + 24 * 60 * 60 * 1000 });
    const r = dueReminders('default', now);
    expect(r.twentyFourHour.map((e) => e.jobId)).toContain('j-tomorrow');
  });

  it('does NOT fire 30min reminder if already fired', () => {
    const now = 1_000_000;
    mockFile =
      JSON.stringify({
        jobId: 'j',
        scheduledAt: now + 20 * 60 * 1000,
        setAt: 0,
        reminders: { fired30min: true },
      }) + '\n';
    expect(dueReminders('default', now).thirtyMin.length).toBe(0);
  });

  it('does NOT fire 24h reminder if already fired', () => {
    const now = 1_000_000;
    mockFile =
      JSON.stringify({
        jobId: 'j',
        scheduledAt: now + 24 * 60 * 60 * 1000,
        setAt: 0,
        reminders: { fired24h: true },
      }) + '\n';
    expect(dueReminders('default', now).twentyFourHour.length).toBe(0);
  });

  it('does NOT fire 30min for events in the past', () => {
    const now = 1_000_000;
    setSchedule('default', { jobId: 'j-past', scheduledAt: now - 60 * 1000 });
    expect(dueReminders('default', now).thirtyMin.length).toBe(0);
  });

  it('does NOT fire 30min for events more than 35min away', () => {
    const now = 1_000_000;
    setSchedule('default', { jobId: 'j-far', scheduledAt: now + 60 * 60 * 1000 });
    expect(dueReminders('default', now).thirtyMin.length).toBe(0);
  });
});
