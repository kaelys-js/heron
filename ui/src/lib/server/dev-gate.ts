import { DEVTOOLS_COOKIE } from '$lib/devtools-keys';

/**
 * Should the /dev view gallery be EXEMPT from the fresh-install onboarding
 * redirect for this request? True under the live dev server (`dev`), OR when the
 * owner has opted into developer tools -- the `heron-devtools` cookie set by the
 * Settings version-tap gesture.
 *
 * SECURITY: this is NOT an auth gate. A client can set the cookie, so it must
 * never grant session-less access. The auth gate (hooks.server.ts) keeps the
 * /dev public-bypass on `dev` only; in a built app the owner reaches the gallery
 * via their REAL session, and this exemption merely stops the onboarding bounce.
 *
 * Pure + cookie-source-agnostic so it's unit-testable (see +layout.server.ts).
 */
export function devGalleryUnlocked(
  dev: boolean,
  cookies: { get(name: string): string | undefined },
): boolean {
  return dev || cookies.get(DEVTOOLS_COOKIE) === '1';
}
