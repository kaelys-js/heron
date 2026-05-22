/** Tray HTTP client -- pure functions for fetching stats and firing
 *  empty POSTs against the embedded backend. Extracted from tray.ts so
 *  the network surface is unit-testable in isolation; tray.ts retains
 *  the electron-bound concerns (Tray, Menu, app.dock).
 *
 *  No business logic lives here. fetchStats returns null on any failure
 *  (network, timeout, parse) and postEmpty resolves silently. The tray
 *  treats null as "backend offline" + degrades the menu gracefully. */
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

export type Stats = {
  queued: number;
  appliedToday: number;
  upcomingInterviews: number;
  openIssues?: number;
  autopilotPaused?: boolean;
};

const FETCH_TIMEOUT_MS = 2000;

/**
 * GET {baseUrl}/api/stats and parse the JSON body. Returns null on any
 * failure path: invalid URL, network error, timeout, non-JSON body.
 *
 * Why "null on failure" rather than throw: the tray's poll loop is best-
 * effort. A transient backend hiccup shouldn't crash the main process
 * or surface as an error toast -- the menu just shows "(backend offline)"
 * until the next poll succeeds.
 *
 * @param baseUrl - the embedded server URL (e.g. http://127.0.0.1:54321)
 */
export function fetchStats(baseUrl: string): Promise<Stats | null> {
  return new Promise((resolve) => {
    try {
      const u = new URL('/api/stats', baseUrl);
      const isHttps = u.protocol === 'https:';
      const fn = isHttps ? httpsRequest : httpRequest;
      const req = fn(
        {
          hostname: u.hostname,
          port: u.port || (isHttps ? 443 : 80),
          path: u.pathname,
          timeout: FETCH_TIMEOUT_MS,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            try {
              const body = Buffer.concat(chunks).toString('utf8');
              const parsed = JSON.parse(body) as Stats;
              resolve(parsed);
            } catch {
              resolve(null);
            }
          });
          res.on('error', () => resolve(null));
        },
      );
      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
      req.end();
    } catch {
      resolve(null);
    }
  });
}

/**
 * POST {baseUrl}{pathname} with empty body. Resolves on success OR
 * any failure (timeout, network error, invalid URL). Used by tray
 * action items like "Scan now" + "Pause autopilot" where we want
 * fire-and-forget semantics -- the menu reflects the state on the
 * next /api/stats poll, no synchronous result needed.
 *
 * @param baseUrl - the embedded server URL
 * @param pathname - the endpoint path (e.g. /api/autopilot/toggle)
 */
export function postEmpty(baseUrl: string, pathname: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const u = new URL(pathname, baseUrl);
      const isHttps = u.protocol === 'https:';
      const fn = isHttps ? httpsRequest : httpRequest;
      const req = fn(
        {
          hostname: u.hostname,
          port: u.port || (isHttps ? 443 : 80),
          path: u.pathname,
          method: 'POST',
          timeout: FETCH_TIMEOUT_MS,
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve());
        },
      );
      req.on('error', () => resolve());
      req.on('timeout', () => {
        req.destroy();
        resolve();
      });
      req.end();
    } catch {
      resolve();
    }
  });
}
