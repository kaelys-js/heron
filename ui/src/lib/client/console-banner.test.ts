import { describe, it, expect, vi } from 'vitest';
import { buildConsoleBanner, installConsoleBanner } from './console-banner';

const base = {
  displayName: 'Heron',
  tagline: 'Stand still. Strike well.',
  version: '1.2.3',
  build: 'abc1234',
  homepage: 'https://heron.app',
  repoUrl: 'https://github.com/kaelys-js/heron',
  discordUrl: 'https://discord.gg/x',
} as const;

/** Flatten every console-call's args into one searchable string. */
const text = (out: ReturnType<typeof buildConsoleBanner>) =>
  out.calls.flatMap((c) => c.args.map(String)).join('  ');

describe('buildConsoleBanner', () => {
  it('includes brand name, tagline, version, build, env, and links', () => {
    const t = text(buildConsoleBanner({ ...base, env: 'production' }));
    expect(t).toContain('Heron');
    expect(t).toContain('Stand still. Strike well.');
    expect(t).toContain('1.2.3');
    expect(t).toContain('abc1234');
    expect(t).toContain('production');
    expect(t).toContain('https://heron.app');
    expect(t).toContain('https://github.com/kaelys-js/heron');
    expect(t).toContain('https://discord.gg/x');
  });

  it('PRODUCTION shows a self-XSS / paste-jacking warning (warn level)', () => {
    // WHY: Heron stores API keys + can auto-apply on the user's behalf, so the
    // console is a self-XSS target. The warning is the GitHub/Discord pattern --
    // production only (devs need a clean console; end-users are the ones at risk).
    const out = buildConsoleBanner({ ...base, env: 'production' });
    const warns = out.calls.filter((c) => c.method === 'warn');
    expect(warns.length).toBeGreaterThan(0);
    const wt = warns
      .flatMap((c) => c.args.map(String))
      .join(' ')
      .toLowerCase();
    expect(wt).toContain('stop');
    expect(wt).toMatch(/scam|paste|developer/);
    expect(wt).toContain('account');
  });

  it('DEVELOPMENT shows no self-XSS warning but surfaces the request id', () => {
    const out = buildConsoleBanner({ ...base, env: 'development', requestId: 'req-xyz' });
    expect(out.calls.some((c) => c.method === 'warn')).toBe(false);
    expect(text(out)).toContain('req-xyz');
  });

  it('points at the window.heron developer global in every env', () => {
    // WHY: the banner is the one place every session prints to the console, so
    // it's where a developer or support contact discovers the debug global.
    // The hint must show in BOTH envs (the prod self-XSS warning sits AFTER it).
    for (const env of ['development', 'production'] as const) {
      expect(text(buildConsoleBanner({ ...base, env }))).toContain('heron.help()');
    }
  });

  it('omits the build segment cleanly when build is empty', () => {
    const t = text(buildConsoleBanner({ ...base, build: '', env: 'production' }));
    expect(t).toContain('1.2.3');
    expect(t).not.toContain('+'); // no dangling "version+" / "build " artefact
    expect(t).not.toContain('build undefined');
  });

  it('every call carries a balanced %c / style-arg count (valid console styling)', () => {
    for (const c of buildConsoleBanner({ ...base, env: 'production' }).calls) {
      const fmt = String(c.args[0] ?? '');
      const pct = (fmt.match(/%c/g) ?? []).length;
      // args = [format, ...styles]; one style string per %c.
      expect(c.args.length - 1).toBe(pct);
    }
  });
});

describe('installConsoleBanner (side effect)', () => {
  it('prints the banner to the console once and is idempotent across re-mounts', () => {
    // WHY: the banner must surface the build identity to the console, but exactly
    // ONCE -- HMR / layout re-mounts must not spam it (module-flag guarded).
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A request-id meta exercises the dev correlation line inside the install path.
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'x-request-id');
    meta.setAttribute('content', 'req-test');
    document.head.appendChild(meta);
    try {
      installConsoleBanner();
      const writes = () =>
        logSpy.mock.calls.length + infoSpy.mock.calls.length + warnSpy.mock.calls.length;
      const firstCount = writes();
      expect(firstCount).toBeGreaterThan(0); // it actually printed
      installConsoleBanner(); // second call is suppressed by the `installed` flag
      expect(writes()).toBe(firstCount);
    } finally {
      logSpy.mockRestore();
      infoSpy.mockRestore();
      warnSpy.mockRestore();
      meta.remove();
    }
  });
});
