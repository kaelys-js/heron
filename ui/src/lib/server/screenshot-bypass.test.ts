/** screenshot-bypass.test.ts -- TDD for the double-gated screenshot auth
 *  bypass. The bypass MUST be tightly scoped:
 *
 *    1. `process.env.HERON_SCREENSHOT_MODE === '1'`        (explicit opt-in)
 *    2. `process.env.HERON_DATA_DIR` resolves inside `os.tmpdir()`
 *
 *  Either gate failing returns `null` -- no synthetic user, no bypass. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tmpdir, platform } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { screenshotBypassUser } from './screenshot-bypass';

const ORIG_ENV = { ...process.env };

function reset(): void {
  delete process.env.HERON_SCREENSHOT_MODE;
  delete process.env.HERON_DATA_DIR;
}

describe('screenshotBypassUser', () => {
  let tmpRoot: string;

  beforeEach(() => {
    reset();
    tmpRoot = mkdtempSync(join(tmpdir(), 'heron-bypass-test-'));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    process.env = { ...ORIG_ENV };
  });

  it('returns null when no env vars are set', () => {
    expect(screenshotBypassUser()).toBeNull();
  });

  it('returns null when HERON_SCREENSHOT_MODE is set but HERON_DATA_DIR is not', () => {
    process.env.HERON_SCREENSHOT_MODE = '1';
    expect(screenshotBypassUser()).toBeNull();
  });

  it('returns null when HERON_DATA_DIR is set but HERON_SCREENSHOT_MODE is not', () => {
    process.env.HERON_DATA_DIR = tmpRoot;
    expect(screenshotBypassUser()).toBeNull();
  });

  it('returns null when HERON_SCREENSHOT_MODE is "0" / "false" / empty string', () => {
    process.env.HERON_DATA_DIR = tmpRoot;
    for (const v of ['0', 'false', '', 'no', 'off']) {
      process.env.HERON_SCREENSHOT_MODE = v;
      expect(screenshotBypassUser(), `HERON_SCREENSHOT_MODE=${JSON.stringify(v)}`).toBeNull();
    }
  });

  it('returns null when HERON_DATA_DIR is OUTSIDE os.tmpdir()', () => {
    process.env.HERON_SCREENSHOT_MODE = '1';
    // A user's home dir is canonically outside tmpdir on every OS we ship to.
    // Brand-neutral placeholder path; the screenshot-bypass guard only
    // checks that the path isn't under os.tmpdir().
    process.env.HERON_DATA_DIR = '/Users/whoever/some-app/data';
    expect(screenshotBypassUser()).toBeNull();
  });

  it('returns null when HERON_DATA_DIR is the literal string "tmp" (path injection guard)', () => {
    process.env.HERON_SCREENSHOT_MODE = '1';
    process.env.HERON_DATA_DIR = 'tmp';
    expect(screenshotBypassUser()).toBeNull();
  });

  it('returns the demo user when BOTH gates are tripped correctly', () => {
    process.env.HERON_SCREENSHOT_MODE = '1';
    process.env.HERON_DATA_DIR = tmpRoot;
    const u = screenshotBypassUser();
    expect(u).not.toBeNull();
    expect(u?.id).toBe('demo-screenshots');
    expect(u?.email).toBe('alex@demo.example');
    expect(u?.name).toBe('Alex Demo');
  });

  it('the synthetic user shape includes the fields Better Auth populates', () => {
    process.env.HERON_SCREENSHOT_MODE = '1';
    process.env.HERON_DATA_DIR = tmpRoot;
    const u = screenshotBypassUser();
    expect(u).toMatchObject({
      id: 'demo-screenshots',
      email: expect.any(String),
      name: expect.any(String),
      role: 'owner',
      emailVerified: true,
    });
  });

  // Guard regression: if the gate ever silently becomes single-gate, the
  // bypass would activate on any HERON_DATA_DIR=tmpdir invocation (which
  // happens in normal test runs). This test pins the double-gate contract.
  it('the gates are AND, never OR', () => {
    process.env.HERON_DATA_DIR = tmpRoot;
    expect(screenshotBypassUser()).toBeNull();
    delete process.env.HERON_DATA_DIR;
    process.env.HERON_SCREENSHOT_MODE = '1';
    expect(screenshotBypassUser()).toBeNull();
  });

  // Cross-platform sanity -- macOS tmpdir is /var/folders/..., Linux is /tmp,
  // Windows is C:\Users\...\AppData\Local\Temp. Realpath resolves all three.
  it(`honors realpath of tmpdir on ${platform()}`, () => {
    process.env.HERON_SCREENSHOT_MODE = '1';
    process.env.HERON_DATA_DIR = tmpRoot;
    expect(screenshotBypassUser()).not.toBeNull();
  });
});
