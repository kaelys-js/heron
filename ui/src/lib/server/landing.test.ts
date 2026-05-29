import { describe, expect, it } from 'vitest';
import { resolveLandingRedirect } from './landing';

const base = { pathname: '/', search: '', hasUser: false, isFresh: false, devUnlocked: false };

describe('resolveLandingRedirect', () => {
  it('sends an UNAUTHENTICATED visitor on / to /login (not onboarding)', () => {
    expect(resolveLandingRedirect({ ...base, pathname: '/' })).toBe('/login?redirectTo=%2F');
  });

  it('sends an unauthenticated FRESH install to /login, NOT the onboarding wizard', () => {
    // THE regression: a fresh, user-less install used to be diverted to
    // /onboarding/account. Auth precedence means it must reach /login first
    // (which routes the first owner onward to /signup) — matching iOS +
    // docs/SETUP.md. Onboarding is a POST-authentication concern.
    expect(resolveLandingRedirect({ ...base, pathname: '/', isFresh: true, hasUser: false })).toBe(
      '/login?redirectTo=%2F',
    );
  });

  it('preserves the original path in redirectTo so post-login lands back', () => {
    expect(resolveLandingRedirect({ ...base, pathname: '/pipeline', search: '?x=1' })).toBe(
      '/login?redirectTo=%2Fpipeline%3Fx%3D1',
    );
  });

  it('does NOT redirect the public auth pages (no /login -> /login loop)', () => {
    expect(resolveLandingRedirect({ ...base, pathname: '/login', isFresh: true })).toBeNull();
    expect(resolveLandingRedirect({ ...base, pathname: '/signup', isFresh: true })).toBeNull();
  });

  it('does NOT redirect onboarding routes (the wizard renders its own steps)', () => {
    expect(
      resolveLandingRedirect({ ...base, pathname: '/onboarding/account', isFresh: true }),
    ).toBeNull();
    expect(
      resolveLandingRedirect({ ...base, pathname: '/onboarding/cv', hasUser: true, isFresh: true }),
    ).toBeNull();
  });

  it('exempts /api and /help', () => {
    expect(resolveLandingRedirect({ ...base, pathname: '/api/health', isFresh: true })).toBeNull();
    expect(resolveLandingRedirect({ ...base, pathname: '/help', isFresh: true })).toBeNull();
  });

  it('exempts /dev ONLY when developer tools are unlocked', () => {
    expect(
      resolveLandingRedirect({ ...base, pathname: '/dev/views', devUnlocked: true }),
    ).toBeNull();
    // Locked: /dev is not exempt -> unauthenticated -> /login.
    expect(resolveLandingRedirect({ ...base, pathname: '/dev/views', devUnlocked: false })).toBe(
      '/login?redirectTo=%2Fdev%2Fviews',
    );
  });

  it('sends an AUTHENTICATED user with an incomplete profile to the onboarding wizard', () => {
    expect(resolveLandingRedirect({ ...base, pathname: '/', hasUser: true, isFresh: true })).toBe(
      '/onboarding',
    );
  });

  it('renders the dashboard for an authenticated, fully set-up user (no redirect)', () => {
    expect(
      resolveLandingRedirect({ ...base, pathname: '/', hasUser: true, isFresh: false }),
    ).toBeNull();
  });
});
