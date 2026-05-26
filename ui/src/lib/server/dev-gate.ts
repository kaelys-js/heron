import { DEVTOOLS_COOKIE } from '$lib/devtools-keys';

/**
 * Is the /dev view gallery reachable for this request?
 *
 * True under the live dev server (`dev`), OR in a built / native app once the
 * owner has opted into developer tools -- the `heron-devtools` cookie set by
 * the Settings version-tap gesture. For everyone else `dev` is false and the
 * cookie is absent, so the gate stays closed.
 *
 * Pure + cookie-source-agnostic so it's unit-testable and shared by both SSR
 * gates (hooks.server.ts session bypass + +layout.server.ts onboarding redirect).
 */
export function devGalleryUnlocked(
  dev: boolean,
  cookies: { get(name: string): string | undefined },
): boolean {
  return dev || cookies.get(DEVTOOLS_COOKIE) === '1';
}
