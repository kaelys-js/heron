import { describe, it, expect } from 'vitest';
import { resolveDevServerUrl, buildCsp, isInternalNavigation } from './dev-server';
import { BRAND } from './brand';

// Brand scheme from the generated constant -- never hardcode `heron`.
const scheme = BRAND.urlScheme;

describe('resolveDevServerUrl', () => {
  it('returns null in production (so packaged app uses electron-serve)', () => {
    expect(resolveDevServerUrl(false, {})).toBeNull();
    expect(resolveDevServerUrl(false, { ELECTRON_DEV_SERVER_URL: 'http://x:1' })).toBeNull();
  });
  it('defaults to vite :5173 in dev', () => {
    expect(resolveDevServerUrl(true, {})).toBe('http://localhost:5173');
  });
  it('honors ELECTRON_DEV_SERVER_URL / CAPACITOR_SERVER_URL overrides in dev', () => {
    expect(resolveDevServerUrl(true, { ELECTRON_DEV_SERVER_URL: 'http://1.2.3.4:5173' })).toBe(
      'http://1.2.3.4:5173',
    );
    expect(resolveDevServerUrl(true, { CAPACITOR_SERVER_URL: 'http://lan:5173' })).toBe(
      'http://lan:5173',
    );
    // blank/whitespace override falls back to the default
    expect(resolveDevServerUrl(true, { ELECTRON_DEV_SERVER_URL: '  ' })).toBe(
      'http://localhost:5173',
    );
  });
});

describe('buildCsp', () => {
  it('prod CSP locks to the app scheme only (no http/ws/devtools)', () => {
    const csp = buildCsp(scheme, false);
    expect(csp).toContain(`default-src ${scheme}://*`);
    expect(csp).not.toContain('http://localhost');
    expect(csp).not.toContain('ws://localhost');
    expect(csp).not.toContain('devtools');
  });
  it('dev CSP additionally allows the vite dev server + HMR websocket', () => {
    const csp = buildCsp(scheme, true);
    expect(csp).toContain(`default-src ${scheme}://*`);
    expect(csp).toContain('http://localhost:*'); // module scripts
    expect(csp).toContain('ws://localhost:*'); // HMR socket
  });
  it('dev CSP allows a non-localhost dev-server override (http + ws origin)', () => {
    const csp = buildCsp(scheme, true, 'http://1.2.3.4:5173');
    expect(csp).toContain('http://1.2.3.4:5173');
    expect(csp).toContain('ws://1.2.3.4:5173');
  });
  it('dev CSP keeps the localhost defaults when the override URL is malformed', () => {
    const csp = buildCsp(scheme, true, '::not a url::');
    expect(csp).toContain('http://localhost:*');
    expect(csp).toContain('ws://localhost:*');
  });
});

describe('isInternalNavigation', () => {
  it('allows the app scheme in both dev and prod', () => {
    expect(isInternalNavigation(`${scheme}://localhost/inbox`, scheme, null)).toBe(true);
    expect(isInternalNavigation(`${scheme}://localhost/x`, scheme, 'http://localhost:5173')).toBe(
      true,
    );
  });
  it('allows the dev-server origin only when a dev URL is set', () => {
    expect(
      isInternalNavigation('http://localhost:5173/inbox', scheme, 'http://localhost:5173'),
    ).toBe(true);
    // prod (no dev url) → the same http URL is external
    expect(isInternalNavigation('http://localhost:5173/inbox', scheme, null)).toBe(false);
  });
  it('compares origins, not raw prefixes (no port/userinfo spoofing)', () => {
    // The old startsWith() check wrongly allowed these: ':51730' starts with
    // ':5173', and a userinfo segment can hide a foreign host.
    expect(isInternalNavigation('http://localhost:51730/x', scheme, 'http://localhost:5173')).toBe(
      false,
    );
    expect(
      isInternalNavigation('http://localhost:5173@evil.com/x', scheme, 'http://localhost:5173'),
    ).toBe(false);
    // malformed URL -> the origin parse throws -> treated as external
    expect(isInternalNavigation('http://', scheme, 'http://localhost:5173')).toBe(false);
  });
  it('treats external URLs as not-internal (deny / open externally)', () => {
    expect(isInternalNavigation('https://evil.example.com', scheme, 'http://localhost:5173')).toBe(
      false,
    );
    expect(isInternalNavigation('https://github.com', scheme, null)).toBe(false);
    expect(isInternalNavigation('', scheme, 'http://localhost:5173')).toBe(false);
  });
});
