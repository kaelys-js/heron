/** Process-wide webContents hardening.
 *
 *  The per-window handlers in setup.ts (setWindowOpenHandler + will-navigate /
 *  will-redirect) only cover the MAIN window. This installs the same policy on
 *  EVERY webContents the app ever creates -- about/changelog child windows, any
 *  future <webview>, a popup a compromised renderer tries to spawn -- via the
 *  single app-level `web-contents-created` event, so there's no webContents that
 *  can escape the navigation policy by being created later.
 *
 *  The decision logic is the same pure helpers used by the main window
 *  (decideWindowOpen / isInternalNavigation in dev-server.ts), so internal nav
 *  is allowed, external http(s) is routed to the OS browser, and everything else
 *  is denied -- one source of truth.
 *
 *  installWebContentsGuard() touches electron, so the testable decision is
 *  extracted into the pure helpers below + reused from dev-server.ts. */
import { app, shell } from 'electron';
import type { WebContents } from 'electron';
import { decideWindowOpen, isInternalNavigation } from './dev-server';

export type WebContentsGuardOptions = {
  /** The app's custom scheme (electron-serve scheme). */
  customScheme: string;
  /** Dev-server URL in development, null in production. */
  devServerUrl: string | null;
  /** Hand an external URL to the OS browser. Injectable for tests. */
  openExternal?: (url: string) => void;
};

/** Apply the navigation + window-open + webview policy to a single webContents.
 *  Exported so a test can drive it against a fake emitter without app-level
 *  plumbing. */
export function guardWebContents(
  contents: Pick<WebContents, 'setWindowOpenHandler' | 'on'>,
  opts: WebContentsGuardOptions,
): void {
  const openExternal = opts.openExternal ?? ((url: string) => void shell.openExternal(url));

  contents.setWindowOpenHandler((details) => {
    const decision = decideWindowOpen(details.url, opts.customScheme, opts.devServerUrl);
    if (decision === 'external') {
      openExternal(details.url);
    }
    return decision === 'allow' ? { action: 'allow' } : { action: 'deny' };
  });

  // Block top-level navigation OUT of the app on BOTH the user path
  // (will-navigate) and the server-driven path (will-redirect -- a 30x to an
  // external origin bypasses will-navigate). Internal nav is allowed; external
  // links reach the system browser via the window-open handler above.
  const blockExternalNav = (event: Electron.Event, url: string): void => {
    if (!isInternalNavigation(url, opts.customScheme, opts.devServerUrl)) {
      event.preventDefault();
    }
  };
  contents.on('will-navigate', blockExternalNav);
  contents.on('will-redirect', blockExternalNav);

  // No part of the app uses <webview>. Refuse to attach one outright -- a
  // <webview> is a fresh, separately-configured renderer that could opt back
  // into nodeIntegration, so denying attachment removes that whole surface.
  contents.on('will-attach-webview', (event: Electron.Event) => {
    event.preventDefault();
  });
}

/** Install the guard on EVERY webContents the app creates, for the lifetime of
 *  the app. Call once, early (before any window is created). */
export function installWebContentsGuard(opts: WebContentsGuardOptions): void {
  app.on('web-contents-created', (_event, contents) => {
    guardWebContents(contents, opts);
  });
}
