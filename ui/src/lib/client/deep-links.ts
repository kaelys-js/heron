/**
 * Deep-link handler — turn `careerops://job/abc123` into an in-app
 * navigation.
 *
 * Capacitor's @capacitor/app plugin emits `appUrlOpen` events whenever
 * the OS hands us a custom-scheme URL. We parse the URL, resolve the
 * target route, and call goto() with it.
 *
 * Supported forms:
 *   careerops://job/{id}                  → /job/{id}
 *   careerops://pipeline                  → /pipeline
 *   careerops://inbox                     → /inbox
 *   careerops://settings                  → /settings
 *   careerops://queue                     → /queue
 *
 * Anything else falls through to /.
 */
import { App } from '@capacitor/app';
import { goto } from '$app/navigation';
import { BRAND } from './brand';

let installed = false;

export function installDeepLinkHandler(): void {
  if (installed) return;
  installed = true;

  App.addListener('appUrlOpen', (event) => {
    const target = parseDeepLink(event.url);
    if (target) {
      void goto(target);
    }
  });
}

/**
 * Pure parser, exported for unit tests.
 */
export function parseDeepLink(url: string): string | null {
  try {
    // The custom scheme strips through Capacitor's app plugin as a
    // full URL. Parsing `${BRAND.urlScheme}://job/abc` with new URL()
    // requires we normalize to a parseable form.
    const schemePrefix = `${BRAND.urlScheme}://`;
    const normalized = url.startsWith(schemePrefix)
      ? 'https://career-ops.local/' + url.slice(schemePrefix.length)
      : url;
    const u = new URL(normalized);
    const segments = u.pathname.split('/').filter(Boolean);
    if (segments.length === 0) return '/';
    const [first, ...rest] = segments;
    switch (first) {
      case 'job':
        return rest[0] ? `/job/${rest[0]}` : '/pipeline';
      case 'pipeline':
        return '/pipeline';
      case 'inbox':
        return '/inbox';
      case 'queue':
        return '/queue';
      case 'settings':
        return '/settings';
      case 'applied':
        return '/applied';
      case 'autopilot':
        return '/autopilot';
      default:
        return '/';
    }
  } catch {
    return null;
  }
}
