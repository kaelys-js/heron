/** Pure URL -> route resolver. Split from deep-links.ts so it tests
 *  in plain Node (no Capacitor / SvelteKit imports). Contract: only
 *  imports allowed are `./brand` (itself a generated constants module). */
import { BRAND, BRAND_EVENTS } from './brand';

/**
 * Resolve a `heron://...` URL to a SvelteKit route, or to a route +
 * BRAND_EVENT side-effect (encoded as `#event=<event-name>`).
 *
 * Returns null only when the input doesn't parse as a URL at all.
 * Unknown routes fall through to '/' so a typo'd link still opens the
 * dashboard rather than silently doing nothing.
 *
 * Contract verified by `ui/src/lib/integration/deep-links.integration.test.ts`.
 */
export function parseDeepLink(url: string): string | null {
  try {
    // The custom scheme strips through Capacitor's app plugin as a full
    // URL. `new URL('heron://job/abc')` rejects the scheme, so we
    // rewrite to a parseable https form first.
    const schemePrefix = `${BRAND.urlScheme}://`;
    const normalized = url.startsWith(schemePrefix)
      ? 'https://heron.local/' + url.slice(schemePrefix.length)
      : url;
    const u = new URL(normalized);
    const segments = u.pathname.split('/').filter(Boolean);
    if (segments.length === 0) return '/';
    const [first, ...rest] = segments;
    switch (first) {
      case 'job':
        return rest[0] ? `/job/${rest[0]}` : '/pipeline';
      case 'interview-prep':
        // Live Activity + Next-Interview widget target. We send the user
        // to the job's prep tab rather than the bare job page so they
        // land on the relevant view immediately.
        return rest[0] ? `/job/${rest[0]}/interview-prep` : '/pipeline';
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
      case 'profile':
        return '/profile';
      case 'login':
        // Widget signed-out gate target -- `redirectTo=/` so the
        // post-login path lands on the dashboard rather than nothing.
        return '/login?redirectTo=/';
      case 'notifications':
        // Open the notifications panel via the brand event. The route
        // stays at / (dashboard) so the panel opens over the regular UI.
        return `/#event=${BRAND_EVENTS.openNotifications}`;
      default:
        return '/';
    }
  } catch {
    return null;
  }
}
