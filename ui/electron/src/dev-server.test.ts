import { describe, it, expect } from 'vitest';
import { resolveDevServerUrl, buildCsp, isInternalNavigation } from './dev-server';

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
    const csp = buildCsp('heron', false);
    expect(csp).toContain('default-src heron://*');
    expect(csp).not.toContain('http://localhost');
    expect(csp).not.toContain('ws://localhost');
    expect(csp).not.toContain('devtools');
  });
  it('dev CSP additionally allows the vite dev server + HMR websocket', () => {
    const csp = buildCsp('heron', true);
    expect(csp).toContain('default-src heron://*');
    expect(csp).toContain('http://localhost:*'); // module scripts
    expect(csp).toContain('ws://localhost:*'); // HMR socket
  });
});

describe('isInternalNavigation', () => {
  it('allows the app scheme in both dev and prod', () => {
    expect(isInternalNavigation('heron://localhost/inbox', 'heron', null)).toBe(true);
    expect(isInternalNavigation('heron://localhost/x', 'heron', 'http://localhost:5173')).toBe(
      true,
    );
  });
  it('allows the dev-server origin only when a dev URL is set', () => {
    expect(
      isInternalNavigation('http://localhost:5173/inbox', 'heron', 'http://localhost:5173'),
    ).toBe(true);
    // prod (no dev url) → the same http URL is external
    expect(isInternalNavigation('http://localhost:5173/inbox', 'heron', null)).toBe(false);
  });
  it('treats external URLs as not-internal (deny / open externally)', () => {
    expect(isInternalNavigation('https://evil.example.com', 'heron', 'http://localhost:5173')).toBe(
      false,
    );
    expect(isInternalNavigation('https://github.com', 'heron', null)).toBe(false);
    expect(isInternalNavigation('', 'heron', 'http://localhost:5173')).toBe(false);
  });
});
