/**
 * Deep-link handler — turn `careerops://job/abc123` into an in-app
 * navigation.
 *
 * Capacitor's @capacitor/app plugin emits `appUrlOpen` events whenever
 * the OS hands us a custom-scheme URL. We parse the URL, resolve the
 * target route, and call goto() with it.
 *
 * Supported forms (every iOS surface that emits a deep link must land
 * in one of these — widgets, notifications, Live Activity, Share
 * Extension callback, Spotlight tap):
 *
 *   careerops://                              → /
 *   careerops://job/{id}                      → /job/{id}
 *   careerops://interview-prep/{id}           → /job/{id}/interview-prep
 *     (Live Activity "Open prep" + Next-Interview widget tap)
 *   careerops://pipeline                      → /pipeline
 *   careerops://inbox                         → /inbox
 *   careerops://queue                         → /queue
 *   careerops://applied                       → /applied
 *   careerops://settings                      → /settings
 *   careerops://autopilot                     → /autopilot
 *   careerops://profile                       → /profile
 *   careerops://login                         → /login
 *     (widget signed-out gate target)
 *   careerops://notifications                 → /?notifications=open
 *     (notification-tap target → fires BRAND_EVENTS.openNotifications)
 *
 * Anything else falls through to /.
 */
import { App } from '@capacitor/app';
import { goto } from '$app/navigation';
import { parseDeepLink } from './deep-links-parser';

// Re-export so the existing API surface stays stable. Callers can import
// either `parseDeepLink` or `handleDeepLink` from `./deep-links` exactly
// as before — the parser just physically lives in a sibling module so
// `deep-links.integration.test.ts` can exercise it in plain Node.
export { parseDeepLink } from './deep-links-parser';

let installed = false;

export function installDeepLinkHandler(): void {
  if (installed) return;
  installed = true;

  App.addListener('appUrlOpen', (event) => {
    handleDeepLink(event.url);
  });
}

/**
 * Resolve a deep link to a route + side-effects, then navigate. Exposed
 * so other entry points (notification tap → notifications.ts'
 * onNotificationTap) can dispatch the same routing without duplicating
 * the parser.
 */
export function handleDeepLink(url: string): void {
  const target = parseDeepLink(url);
  if (!target) return;
  // Some deep links want to FIRE A SIDE EFFECT in addition to (or
  // instead of) a route change — e.g. `careerops://notifications`
  // opens the in-app notifications panel via a CustomEvent. The
  // parser annotates these with a `#event=...` fragment that we
  // pull out and dispatch here.
  const hashIdx = target.indexOf('#event=');
  if (hashIdx !== -1) {
    const eventName = target.slice(hashIdx + '#event='.length);
    const route = target.slice(0, hashIdx);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(eventName));
    }
    if (route) void goto(route);
    return;
  }
  void goto(target);
}

// parseDeepLink is exported above. See ./deep-links-parser.ts for the
// implementation + contract. Keep both modules in sync — adding a new
// route here means adding a case to deep-links.integration.test.ts in
// the same commit so regressions surface immediately in CI.
