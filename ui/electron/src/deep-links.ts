/** Deep-link URL resolution. Pure functions: turn a tray-menu subPath
 *  (e.g. /pipeline) plus a baseUrl into a fully-qualified URL that
 *  BrowserWindow.loadURL accepts. Returns null on malformed inputs;
 *  the tray treats null as "leave the window where it was". */

/**
 * Resolve a tray-menu subPath against the backend baseUrl. Returns the
 * resolved URL string, or null if either input is malformed.
 *
 * Examples:
 *   resolveDeepLink('/pipeline', 'http://127.0.0.1:5173')
 *     -> 'http://127.0.0.1:5173/pipeline'
 *   resolveDeepLink('https://example.com/x', 'http://127.0.0.1:5173')
 *     -> 'https://example.com/x'     (absolute wins)
 *   resolveDeepLink('not a url', 'not a base')
 *     -> null
 */
export function resolveDeepLink(subPath: string, baseUrl: string): string | null {
  try {
    const u = new URL(subPath, baseUrl);
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Resolve a custom-scheme deep link (e.g. `heron://job/123`) into the
 * web path the WebView should navigate to. Strips the brand scheme +
 * host and prefixes a `/`. Returns null on malformed input.
 *
 * Examples:
 *   resolveBrandedDeepLink('heron://job/123', 'heron')
 *     -> '/job/123'
 *   resolveBrandedDeepLink('heron://', 'heron')
 *     -> '/'
 *   resolveBrandedDeepLink('https://example.com/x', 'heron')
 *     -> null    (wrong scheme)
 */
export function resolveBrandedDeepLink(link: string, scheme: string): string | null {
  try {
    const u = new URL(link);
    // URL parsing lowercases the scheme + appends a trailing colon.
    if (u.protocol !== `${scheme}:`) return null;
    const host = u.hostname ? `/${u.hostname}` : '';
    const pathPart = u.pathname === '/' || u.pathname === '' ? '' : u.pathname;
    // URL guarantees `.search` and `.hash` are strings (`''` when missing).
    const out = `${host}${pathPart}${u.search}${u.hash}`;
    // `out` always begins with `/` (host adds one, pathPart starts with /,
    // or both are empty -- in which case fall back to root).
    return out || '/';
  } catch {
    return null;
  }
}
