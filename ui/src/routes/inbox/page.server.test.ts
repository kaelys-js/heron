/**
 * Inbox load -- R6 product/technical separation.
 *
 * WHY (Rule 9): the Inbox is the user's PRODUCT alert surface. Before R6 the
 * load derived a "Recent error" alert from the most recent error-LEVEL
 * activity event -- but the activity bus carries TECHNICAL diagnostics
 * (5xx, uncaught JS errors, render crashes) right alongside product events.
 * That merged technical noise into the product alert list: a render crash
 * would surface as an Inbox alert next to a failed apply. The routing matrix
 * (see report-routing.ts) says technical is always quiet -- it belongs in the
 * diagnostics sink / Runtimes, never as a product alert.
 *
 * These tests pin that boundary: a technical activity error must NOT become an
 * Inbox alert (and the load no longer exposes recentErrorsCount), while a
 * genuine PRODUCT issue (autopilot circuit-breaker, from listOpenIssues) MUST
 * still appear. If a future refactor re-merges activity errors into alerts,
 * the first test fails loudly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityEvent, Issue } from '$lib/types';

// Mutable fixtures the mocks read from, reset per-test.
let recentEvents: ActivityEvent[] = [];
let openIssues: Issue[] = [];

vi.mock('$lib/server/events', () => ({
  bus: {
    recentForUser: () => recentEvents,
  },
}));
vi.mock('$lib/server/issues', () => ({
  listOpenIssues: () => openIssues,
}));

// Everything else the load touches is irrelevant to the alert-routing
// assertions -- stub to empty so the load runs without a real data dir.
vi.mock('$lib/server/parsers', () => ({ loadAllJobs: () => [] }));
vi.mock('$lib/server/orchestrator', () => ({ listRunning: () => [] }));
vi.mock('$lib/server/env', () => ({
  loadEnv: () => {},
  // Keys present so the load doesn't add the "key not set" info alerts,
  // keeping the alert list clean for the assertions below.
  readEnv: () => ({ ANTHROPIC_API_KEY: 'x', GEMINI_API_KEY: 'y' }),
}));
vi.mock('$lib/server/files', () => ({ readSafe: () => '' }));
vi.mock('$lib/server/profile-paths', () => ({
  activePath: () => '/tmp/none',
  profilePath: () => '/tmp/none',
}));
vi.mock('$lib/server/profiles', () => ({ getActiveProfileId: () => 'default' }));
vi.mock('$lib/server/profile', () => ({ readProfile: () => ({ candidate: { full_name: '' } }) }));
vi.mock('$lib/server/followup-cadence', () => ({
  getFollowupCadence: async () => ({ metadata: { actionable: 0 }, entries: [] }),
  findEntryByCompanyRole: () => null,
}));
vi.mock('$lib/server/email-reactor', () => ({ listLeads: () => [] }));
vi.mock('$lib/server/interviewers', () => ({
  findThankYousOwed: () => [],
  findUpcomingInterviews: () => [],
}));
vi.mock('$lib/server/stage-state', () => ({
  listAllStageState: () => ({}),
  listStaleJobs: () => [],
}));
vi.mock('$lib/server/offers', () => ({ listActiveOffers: () => [] }));
vi.mock('$lib/server/user-context', () => ({ currentUserIdOrDefault: () => 'u1' }));
// node:fs statSync is only used for pipeline freshness -- throw so pipelineMtime
// stays null and no stale-pipeline alert fires.
vi.mock('node:fs', () => ({
  default: {
    statSync: () => {
      throw new Error('no pipeline');
    },
  },
}));

const { load } = await import('./+page.server');

function makeEvent(over: Partial<ActivityEvent>): ActivityEvent {
  return {
    id: over.id ?? 'ev1',
    ts: over.ts ?? Date.now(),
    level: over.level ?? 'info',
    category: over.category ?? 'system',
    source: over.source ?? 'test',
    title: over.title ?? 'event',
    ...over,
  };
}

function makeIssue(over: Partial<Issue>): Issue {
  return {
    id: over.id ?? 'iss1',
    ts: over.ts ?? Date.now(),
    severity: over.severity ?? 'error',
    source: over.source ?? 'test',
    summary: over.summary ?? 'issue',
    ...over,
  };
}

const fakeUrl = { searchParams: new URLSearchParams() } as unknown as URL;

beforeEach(() => {
  recentEvents = [];
  openIssues = [];
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('inbox load -- technical events do not leak into product alerts', () => {
  it('does NOT surface a technical activity error as an Inbox alert', async () => {
    // A 5xx / render-crash style diagnostic on the activity bus.
    recentEvents = [
      makeEvent({
        id: 'tech-err',
        level: 'error',
        category: 'system',
        source: 'sveltekit',
        title: 'Internal Error 500',
        message: 'render boundary crashed',
      }),
    ];

    const data = await load({ url: fakeUrl });

    // No alert derived from the activity error.
    expect(data.alerts.find((a) => a.id === 'recent-error')).toBeUndefined();
    expect(data.alerts).toHaveLength(0);
    // The retired recentErrorsCount field is gone -- the activity-feed badge
    // it powered counted technical errors and must not exist.
    expect((data as Record<string, unknown>).recentErrorsCount).toBeUndefined();
    // The raw event log still carries the technical event verbatim (it's a
    // visibility log, not an alert), proving we removed the ALERT derivation
    // and not the activity feed itself.
    expect(data.activity.some((e) => e.id === 'tech-err')).toBe(true);
  });

  it('DOES surface a product issue (autopilot circuit-breaker) as an alert', async () => {
    openIssues = [
      makeIssue({
        id: 'cb1',
        severity: 'error',
        source: 'autopilot',
        summary: 'Autopilot paused',
        detail: 'Three consecutive apply failures tripped the breaker.',
        dedupeKey: 'autopilot-circuit-breaker',
      }),
    ];

    const data = await load({ url: fakeUrl });

    const breaker = data.alerts.find((a) => a.id === 'circuit-breaker');
    expect(breaker).toBeDefined();
    expect(breaker?.title).toBe('Autopilot paused');
    expect(breaker?.actionPostUrl).toBe('/api/autopilot/resume');
  });

  it('a technical error alongside a product issue yields ONLY the product alert', async () => {
    // The discriminating case: both signals present at once. The product
    // issue is the only thing that should reach the alert list.
    recentEvents = [
      makeEvent({ id: 'tech-err', level: 'error', category: 'api', title: 'fetch failed' }),
    ];
    openIssues = [
      makeIssue({ id: 'cb1', summary: 'Autopilot paused', dedupeKey: 'autopilot-circuit-breaker' }),
    ];

    const data = await load({ url: fakeUrl });

    expect(data.alerts).toHaveLength(1);
    expect(data.alerts[0].id).toBe('circuit-breaker');
  });
});
