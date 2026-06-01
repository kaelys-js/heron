/** logging-config -- HERON_LOG_LEVEL / HERON_LOG_MUTE durable-sink gating.
 *
 *  WHY: prod log volume must be tunable without a code change, but quieting the
 *  DISK must never quiet the live in-app feed (that's the bus, asserted always-on
 *  in events.test). These cases pin the threshold math + the mute list + the
 *  safe defaults (unset env => everything at info+ persists).
 */
import { describe, expect, it } from 'vitest';
import { shouldPersist } from './logging-config';

const env = (o: Record<string, string> = {}) => o as unknown as NodeJS.ProcessEnv;

describe('shouldPersist', () => {
  it('defaults to persisting everything at info+ when unset', () => {
    expect(shouldPersist('info', 's', env())).toBe(true);
    expect(shouldPersist('success', 's', env())).toBe(true);
    expect(shouldPersist('warn', 's', env())).toBe(true);
    expect(shouldPersist('error', 's', env())).toBe(true);
  });

  it('HERON_LOG_LEVEL=warn drops info/success from disk but keeps warn/error', () => {
    const e = env({ HERON_LOG_LEVEL: 'warn' });
    expect(shouldPersist('info', 's', e)).toBe(false);
    expect(shouldPersist('success', 's', e)).toBe(false);
    expect(shouldPersist('warn', 's', e)).toBe(true);
    expect(shouldPersist('error', 's', e)).toBe(true);
  });

  it('HERON_LOG_LEVEL=error keeps only errors', () => {
    const e = env({ HERON_LOG_LEVEL: 'error' });
    expect(shouldPersist('warn', 's', e)).toBe(false);
    expect(shouldPersist('error', 's', e)).toBe(true);
  });

  it('an unknown level value falls back to the info default (never silently drops all)', () => {
    expect(shouldPersist('error', 's', env({ HERON_LOG_LEVEL: 'bogus' }))).toBe(true);
    expect(shouldPersist('info', 's', env({ HERON_LOG_LEVEL: 'bogus' }))).toBe(true);
  });

  it('HERON_LOG_MUTE drops named sources from disk even at error level', () => {
    const e = env({ HERON_LOG_MUTE: 'web-vitals, csp' });
    expect(shouldPersist('error', 'web-vitals', e)).toBe(false);
    expect(shouldPersist('error', 'csp', e)).toBe(false);
    expect(shouldPersist('error', 'server', e)).toBe(true);
  });
});
