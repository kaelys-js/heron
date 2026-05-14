/**
 * lib/server/job-resolver — find a job by UI-facing id, scoped to the
 * right profile. Three precedence rules:
 *   1. explicit ?profile=<slug> URL param wins
 *   2. id suffix `urlId:profileSlug` is honoured if profile exists
 *   3. otherwise active profile, then fall back to scanning every other
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type FakeJob = { id: string; title: string; companyName: string };

const profileJobs: Record<string, FakeJob[]> = {};
const profilesList: { id: string; name: string }[] = [];
let activeProfileId = 'default';

vi.mock('./parsers', () => ({
  loadAllJobs: (profileId: string) => profileJobs[profileId] ?? [],
}));

vi.mock('./profiles', () => ({
  getActiveProfileId: () => activeProfileId,
  getProfile: (id: string) => profilesList.find((p) => p.id === id),
  listProfiles: () => profilesList,
}));

const { resolveJobAndProfile } = await import('./job-resolver');

beforeEach(() => {
  Object.keys(profileJobs).forEach((k) => delete profileJobs[k]);
  profilesList.length = 0;
  activeProfileId = 'default';
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('job-resolver — bare urlId', () => {
  it('finds a job in the active profile when no suffix + no query', () => {
    profilesList.push({ id: 'default', name: 'Default' });
    profileJobs.default = [{ id: 'abc', title: 'Eng', companyName: 'Acme' }];
    const r = resolveJobAndProfile('abc');
    expect(r?.profileId).toBe('default');
    expect(r?.job.id).toBe('abc');
  });

  it('falls back to other profiles if not in active', () => {
    profilesList.push({ id: 'default', name: 'A' }, { id: 'other', name: 'B' });
    profileJobs.default = [];
    profileJobs.other = [{ id: 'xyz', title: 'PM', companyName: 'Foo' }];
    const r = resolveJobAndProfile('xyz');
    expect(r?.profileId).toBe('other');
    expect(r?.job.id).toBe('xyz');
  });

  it('returns null when the job is in no profile', () => {
    profilesList.push({ id: 'default', name: 'A' });
    profileJobs.default = [];
    expect(resolveJobAndProfile('missing')).toBeNull();
  });
});

describe('job-resolver — suffix form `urlId:profileSlug`', () => {
  it('uses the suffix-named profile when it exists', () => {
    profilesList.push({ id: 'work', name: 'W' }, { id: 'default', name: 'D' });
    profileJobs.work = [{ id: 'abc', title: 'X', companyName: 'Y' }];
    const r = resolveJobAndProfile('abc:work');
    expect(r?.profileId).toBe('work');
  });

  it('falls back to active profile lookup when the suffix-named profile does not exist', () => {
    profilesList.push({ id: 'default', name: 'D' });
    profileJobs.default = [{ id: 'abc', title: 'X', companyName: 'Y' }];
    const r = resolveJobAndProfile('abc:nonexistent');
    expect(r?.profileId).toBe('default');
  });

  it('matches a job whose id literally contains the colon (full id matches first)', () => {
    profilesList.push({ id: 'work', name: 'W' });
    profileJobs.work = [{ id: 'abc:work', title: 'X', companyName: 'Y' }];
    const r = resolveJobAndProfile('abc:work');
    // The resolver checks `j.id === urlId || j.id === rawId` so the
    // full "abc:work" id matches via the rawId path.
    expect(r?.job.id).toBe('abc:work');
  });
});

describe('job-resolver — explicit ?profile= query param wins', () => {
  it('query param overrides suffix', () => {
    profilesList.push({ id: 'work', name: 'W' }, { id: 'home', name: 'H' });
    profileJobs.work = [];
    profileJobs.home = [{ id: 'abc', title: 'X', companyName: 'Y' }];
    const url = new URL('http://localhost/job/abc?profile=home');
    const r = resolveJobAndProfile('abc:work', url);
    expect(r?.profileId).toBe('home');
  });

  it('query param overrides active profile', () => {
    activeProfileId = 'default';
    profilesList.push({ id: 'default', name: 'D' }, { id: 'work', name: 'W' });
    profileJobs.default = [];
    profileJobs.work = [{ id: 'abc', title: 'X', companyName: 'Y' }];
    const url = new URL('http://localhost/job/abc?profile=work');
    const r = resolveJobAndProfile('abc', url);
    expect(r?.profileId).toBe('work');
  });

  it('query param pointing at non-existent profile falls through to suffix/active', () => {
    activeProfileId = 'default';
    profilesList.push({ id: 'default', name: 'D' });
    profileJobs.default = [{ id: 'abc', title: 'X', companyName: 'Y' }];
    const url = new URL('http://localhost/job/abc?profile=ghost');
    const r = resolveJobAndProfile('abc', url);
    expect(r?.profileId).toBe('default');
  });
});

describe('job-resolver — edge cases', () => {
  it('returns null on empty id', () => {
    profilesList.push({ id: 'default', name: 'D' });
    profileJobs.default = [{ id: 'abc', title: 'X', companyName: 'Y' }];
    expect(resolveJobAndProfile('')).toBeNull();
  });

  it('returns null when active profile is empty + no other profiles', () => {
    profilesList.push({ id: 'default', name: 'D' });
    profileJobs.default = [];
    expect(resolveJobAndProfile('abc')).toBeNull();
  });
});
