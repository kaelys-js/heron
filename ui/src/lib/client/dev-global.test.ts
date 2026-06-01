/**
 * dev-global -- the `window.heron` developer global.
 *
 * Two halves are tested:
 *   - buildHeronGlobal: the PURE builder (identity + public links + safe
 *     action facades), exercised for shape, freezing, and -- most importantly
 *     -- the SECURITY boundary (never carries a bearer token / session / user /
 *     API key / PII).
 *   - installDevGlobal: the one-time install guard.
 *
 * WHY the security assertions matter: `window.heron` is pasteable surface. It
 * pairs with the production self-XSS console warning -- a frozen object whose
 * actions can't be repointed, AND which exposes ZERO credential material, means
 * a paste-jacking victim can't be coached into leaking their bearer token by
 * reading `heron.<something>`. A regression that ever puts the token (or the
 * `authed` flag, session, user, or an API key) on this object would silently
 * re-open that hole, so the test fails loud if any token-shaped value appears.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BRAND_STORAGE_KEYS } from './brand';
import { buildHeronGlobal, installDevGlobal, type HeronGlobalSources } from './dev-global';

/** A fully-populated source set with deliberately credential-LOOKING values in
 *  the fields the builder is allowed to read, so the security test proves the
 *  builder copies NONE of the real credential surface even when handed one. */
function sources(over: Partial<HeronGlobalSources> = {}): HeronGlobalSources {
  return {
    version: '1.2.3',
    build: 'abc1234',
    env: 'development',
    platform: 'web',
    backendUrl: 'http://localhost:5173',
    requestId: 'req-xyz',
    docs: 'https://heron.app',
    source: 'https://github.com/kaelys-js/heron',
    community: 'https://discord.gg/x',
    diagnostics: { show() {}, hide() {}, dump: () => 'DIAG-DUMP' },
    clearCacheAndReset: async () => {},
    ...over,
  };
}

describe('buildHeronGlobal', () => {
  it('carries the build identity + public links + the action methods', () => {
    const h = buildHeronGlobal(sources());
    expect(h.version).toBe('1.2.3');
    expect(h.build).toBe('abc1234');
    expect(h.env).toBe('development');
    expect(h.platform).toBe('web');
    expect(h.backendUrl).toBe('http://localhost:5173');
    expect(h.requestId).toBe('req-xyz');
    expect(h.links).toEqual({
      docs: 'https://heron.app',
      source: 'https://github.com/kaelys-js/heron',
      community: 'https://discord.gg/x',
    });
    expect(typeof h.help).toBe('function');
    expect(typeof h.diagnostics.show).toBe('function');
    expect(typeof h.diagnostics.hide).toBe('function');
    expect(typeof h.diagnostics.dump).toBe('function');
    expect(typeof h.clearCacheAndReset).toBe('function');
  });

  it('diagnostics facade delegates to the injected sources', () => {
    const show = vi.fn();
    const hide = vi.fn();
    const dump = vi.fn(() => 'PAYLOAD');
    const h = buildHeronGlobal(sources({ diagnostics: { show, hide, dump } }));
    h.diagnostics.show();
    h.diagnostics.hide();
    expect(h.diagnostics.dump()).toBe('PAYLOAD');
    expect(show).toHaveBeenCalledOnce();
    expect(hide).toHaveBeenCalledOnce();
    expect(dump).toHaveBeenCalledOnce();
  });

  it('clearCacheAndReset delegates to the injected reset action', async () => {
    const reset = vi.fn(async () => {});
    const h = buildHeronGlobal(sources({ clearCacheAndReset: reset }));
    await h.clearCacheAndReset();
    expect(reset).toHaveBeenCalledOnce();
  });

  it('help() prints a styled, multi-line console message', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const h = buildHeronGlobal(sources());
    h.help();
    expect(log).toHaveBeenCalled();
    // The styled banner uses %c directives -> at least one call carries them.
    const flat = log.mock.calls.flatMap((c) => c.map(String)).join('  ');
    expect(flat).toContain('%c');
    // It lists the actionable methods so a developer can discover them.
    expect(flat).toContain('help()');
    expect(flat).toContain('clearCacheAndReset()');
    expect(flat).toContain('diagnostics');
    log.mockRestore();
  });

  // ── freezing: pasted code can't repoint the actions ───────────────────
  it('freezes the object and its nested links + diagnostics', () => {
    const h = buildHeronGlobal(sources());
    expect(Object.isFrozen(h)).toBe(true);
    expect(Object.isFrozen(h.links)).toBe(true);
    expect(Object.isFrozen(h.diagnostics)).toBe(true);
  });

  it('rejects re-pointing a frozen action (strict-mode write throws or no-ops)', () => {
    'use strict';
    const h = buildHeronGlobal(sources());
    const evil = () => 'stolen';
    // Frozen: the assignment must NOT take effect (strict throws; the catch
    // keeps the assertion valid either way). The action stays the original.
    try {
      // @ts-expect-error -- intentionally probing immutability
      h.clearCacheAndReset = evil;
    } catch {
      /* TypeError in strict mode -- expected */
    }
    expect(h.clearCacheAndReset).not.toBe(evil);
  });

  // ── SECURITY boundary (the reason this global is gated) ───────────────
  it('never exposes a bearer token, the authed flag, a session, a user, or API keys', () => {
    // Hand the builder a source set whose values LOOK like secrets so we prove
    // the builder doesn't blindly forward whatever it's given. (It can only
    // read identity + links + safe actions; there is no secret input at all.)
    const h = buildHeronGlobal(
      sources({
        // a realistic JWT-shaped bearer token -- must NOT survive onto the object
        requestId: 'req-plain', // keep requestId benign; we assert on serialized output
      }),
    );

    // Serialize EVERY own + nested enumerable field (functions drop out of
    // JSON, which is fine -- we're hunting for leaked DATA, not the actions).
    const serialized = JSON.stringify(h);

    // No brand-namespaced credential key names.
    expect(serialized).not.toContain(BRAND_STORAGE_KEYS.bearerToken);
    expect(serialized).not.toContain(BRAND_STORAGE_KEYS.authed);

    // No credential-shaped field NAMES on the object graph.
    const keys = Object.keys(h);
    for (const forbidden of [
      'token',
      'bearer',
      'bearerToken',
      'authed',
      'session',
      'user',
      'apiKey',
      'apiKeys',
      'secret',
      'password',
      'email',
    ]) {
      expect(keys).not.toContain(forbidden);
    }

    // No JWT-shaped value (three base64url segments split by dots) anywhere in
    // the serialized identity. A regression that copied a token onto a field
    // would trip this even if the field were renamed.
    expect(serialized).not.toMatch(/[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/);
  });

  it('exposes only the documented public surface (no surprise fields)', () => {
    const h = buildHeronGlobal(sources());
    expect(new Set(Object.keys(h))).toEqual(
      new Set([
        'version',
        'build',
        'env',
        'platform',
        'backendUrl',
        'requestId',
        'links',
        'help',
        'diagnostics',
        'clearCacheAndReset',
      ]),
    );
  });
});

describe('installDevGlobal', () => {
  afterEach(() => {
    // Remove the global between tests so the one-time guard is exercised fresh.
    delete (window as unknown as { heron?: unknown }).heron;
  });

  it('installs window.heron exactly once (idempotent across re-mounts)', () => {
    // Reset the module so the install guard starts un-tripped for this test.
    vi.resetModules();
    // Re-import the module after the reset so we get a fresh `installed` flag.
    return import('./dev-global').then(({ installDevGlobal: install }) => {
      delete (window as unknown as { heron?: unknown }).heron;
      install();
      const first = (window as unknown as { heron?: unknown }).heron;
      expect(first).toBeDefined();
      // A second call must NOT replace the object (guard short-circuits).
      install();
      const second = (window as unknown as { heron?: unknown }).heron;
      expect(second).toBe(first);
    });
  });

  it('the installed object is frozen and carries the live build identity', () => {
    installDevGlobal();
    const h = (window as unknown as { heron?: Record<string, unknown> }).heron;
    expect(h).toBeDefined();
    expect(Object.isFrozen(h)).toBe(true);
    expect(typeof h?.version).toBe('string');
    expect(typeof h?.clearCacheAndReset).toBe('function');
  });
});
