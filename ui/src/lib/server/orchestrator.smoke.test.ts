/**
 * orchestrator.smoke.test -- smoke-test safe-to-call exported observers.
 *
 * Most of orchestrator.ts spawns child processes (`runScan`, `runGemini`,
 * `runLinkedInApply`, etc.); those are owned by integration tests. This
 * file pins the pure observer exports (`listRunning`) so the basic
 * surface is covered.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('./env', () => ({ loadEnv: vi.fn() }));
vi.mock('./events', () => ({ logEvent: vi.fn(), reportServerError: vi.fn() }));
vi.mock('./profile-paths', () => ({
  activePath: vi.fn(() => '/test/active'),
  profilePathForUser: vi.fn(() => '/test/user/path'),
}));
vi.mock('./user-secrets', () => ({
  getCredential: vi.fn(() => null),
  MIGRATABLE_KEYS: [],
}));
vi.mock('./profiles', () => ({ getActiveProfileId: () => 'default' }));
vi.mock('./mode-substitution', () => ({ realizeModePromptForUser: vi.fn() }));

const orchestrator = await import('./orchestrator');

describe('orchestrator -- listRunning', () => {
  it('returns an array of task names', () => {
    const running = orchestrator.listRunning();
    expect(Array.isArray(running)).toBe(true);
  });

  it('returns empty array when nothing is running', () => {
    expect(orchestrator.listRunning().length).toBe(0);
  });

  it('items are strings (TaskName union)', () => {
    for (const item of orchestrator.listRunning()) {
      expect(typeof item).toBe('string');
    }
  });
});
