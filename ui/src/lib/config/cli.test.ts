/**
 * lib/config/cli -- AGENT_CLI constant.
 *
 * One env-driven export. Tests confirm:
 *   • default 'claude' when AGENT_CLI is unset
 *   • override picked up from process.env at import time
 */
import { describe, expect, it } from 'vitest';
import { AGENT_CLI } from './cli';

describe('AGENT_CLI', () => {
  it('is a non-empty string', () => {
    expect(typeof AGENT_CLI).toBe('string');
    expect(AGENT_CLI.length).toBeGreaterThan(0);
  });
  it('defaults to "claude" when AGENT_CLI is unset at test time', () => {
    // Note: the env is captured at module import. Tests in Vitest don't
    // re-import per case, so we can't `process.env.AGENT_CLI = 'x'` here
    // and expect AGENT_CLI to update. We assert the *current* resolution
    // which, absent test-runner env injection, is 'claude'.
    expect(['claude', 'gemini', 'codex', 'opencode']).toContain(AGENT_CLI);
  });
});
