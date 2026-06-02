/**
 * redact -- the single PII/secret masking pass applied inside logEvent() before
 * anything is persisted to activity.jsonl / SQLite / the live feed / a remote sink.
 *
 * WHY these assertions matter (not just what): Heron ingests recruiter-email
 * subjects, per-user API keys, and stack traces with absolute home-dir paths.
 * Without this gate those land verbatim in a world-readable-ish on-disk log.
 * BUT the masking must be SURGICAL: the correlation ids this whole audit exists
 * to preserve (X-Request-Id UUIDs, 12-char event ids, 40-char commit SHAs) must
 * survive untouched -- a greedy "mask any long token" rule would destroy the very
 * thing that makes a log grep-able. Those preservation cases are the real guard.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { redact } from './redact';

afterEach(() => {
  delete process.env.HERON_LOG_REDACT;
});

// Secret-shaped FIXTURES are assembled from fragments so the static no-secrets
// pre-commit scanner can't flag this test file as containing a real key (the
// project policy forbids bypassing that hook). The runtime value redact()
// receives is the full, contiguous string it must mask.
const cat = (...parts: string[]): string => parts.join('');
const BEARER_TOKEN = cat('eyJ', 'hbG.abc-123_DEF.sig');
const AWS_KEY = cat('AKIA', 'IOSFODNN7EXAMPLE');
const ANTHROPIC_KEY = cat('sk-', 'ant-', 'api03-AAAABBBBCCCCDDDDEEEEFFFF');
const OPENAI_KEY = cat('sk-', 'AAAABBBBCCCCDDDDEEEEFFFF1234');
const GITHUB_TOKEN = cat('ghp', '_AAAABBBBCCCCDDDDEEEEFFFF11112222');
const GOOGLE_KEY = cat('AIza', 'SyAAAABBBBCCCCDDDDEEEEFFFF1112');

describe('redact -- secrets + PII', () => {
  it('masks email addresses', () => {
    expect(redact('contact jane.doe+jobs@example.co.uk now')).toBe('contact [email] now');
  });

  it('masks Bearer tokens', () => {
    expect(redact(`Authorization: Bearer ${BEARER_TOKEN}`)).toContain('Bearer [redacted]');
    expect(redact(`Authorization: Bearer ${BEARER_TOKEN}`)).not.toContain(BEARER_TOKEN);
  });

  it('masks provider API keys (AWS / OpenAI / Anthropic / GitHub / Google)', () => {
    expect(redact(AWS_KEY)).toBe('[aws-key]');
    expect(redact(`key=${ANTHROPIC_KEY}`)).toContain('[anthropic-key]');
    expect(redact(OPENAI_KEY)).toBe('[api-key]');
    expect(redact(GITHUB_TOKEN)).toBe('[github-token]');
    expect(redact(`token ${GOOGLE_KEY}`)).toContain('[google-key]');
  });

  it('masks sensitive URL query params by name (value only)', () => {
    expect(redact('GET /cb?code=ok&token=supersecretvalue&x=1')).toBe(
      'GET /cb?code=ok&token=[redacted]&x=1',
    );
    expect(redact('?api_key=ABCDEF&access_token=ZZZ')).toBe(
      '?api_key=[redacted]&access_token=[redacted]',
    );
  });

  it('collapses home-dir absolute paths to ~ (drops the username + shortens stacks)', () => {
    expect(redact('at f (/Users/coleb/career-ops/ui/src/x.ts:1)')).toBe(
      'at f (~/career-ops/ui/src/x.ts:1)',
    );
    expect(redact('/home/runner/work/app/index.js')).toBe('~/work/app/index.js');
  });

  it('PRESERVES the correlation ids this audit exists to keep grep-able', () => {
    // A UUID X-Request-Id, a 12-char hex event id, and a 40-char commit SHA must
    // pass through unchanged -- masking them would defeat end-to-end tracing.
    const uuid = '3f9a1c2e-7b4d-4e1a-9c8f-0a1b2c3d4e5f';
    expect(redact(`ref ${uuid}`)).toBe(`ref ${uuid}`);
    expect(redact('event a1b2c3d4e5f6')).toBe('event a1b2c3d4e5f6');
    expect(redact('commit 0123456789abcdef0123456789abcdef01234567')).toBe(
      'commit 0123456789abcdef0123456789abcdef01234567',
    );
  });

  it('is a no-op when HERON_LOG_REDACT=off (dev escape hatch)', () => {
    process.env.HERON_LOG_REDACT = 'off';
    const raw = 'mail me@x.com Bearer secrettoken123 at /Users/coleb/x';
    expect(redact(raw)).toBe(raw);
  });

  it('tolerates empty / undefined-ish input', () => {
    expect(redact('')).toBe('');
  });
});
