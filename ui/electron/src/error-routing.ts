/** Main-process error routing. Catches uncaught exceptions + unhandled
 *  promise rejections in the Electron main process and forwards them
 *  to the renderer's error-reporter via IPC. The renderer then funnels
 *  them into the same Issues store the rest of the UI uses.
 *
 *  Extracted from index.ts so the routing logic is unit-testable
 *  without spinning up Electron. */

export type WebContentsLike = {
  send: (channel: string, payload: unknown) => void;
};
export type BrowserWindowLike = {
  isDestroyed: () => boolean;
  webContents: WebContentsLike;
};

export type ErrorRouterOptions = {
  /** Brand name (used as IPC channel prefix). */
  brandName: string;
  /** Returns the current main window, or undefined if not yet open. */
  getMainWindow: () => BrowserWindowLike | undefined;
  /** Optional logger (defaults to console.error). */
  logger?: (...args: unknown[]) => void;
};

export type SerializedError = {
  message: string;
  stack?: string;
  source: 'electron-main' | 'electron-main-rejection';
};

/**
 * Build the unhandled-error handler. Caller installs the returned
 * function into electron-unhandled's `logger` option.
 */
export function buildUnhandledErrorHandler(opts: ErrorRouterOptions): (e: Error) => void {
  const log = opts.logger ?? console.error;
  return (e: Error) => {
    log('[main:unhandled]', e);
    routeErrorToRenderer(
      {
        message: e?.message ?? String(e),
        stack: e?.stack,
        source: 'electron-main',
      },
      opts,
    );
  };
}

/**
 * Build the unhandledRejection handler. Caller installs the returned
 * function via `process.on('unhandledRejection', ...)`.
 */
export function buildUnhandledRejectionHandler(
  opts: ErrorRouterOptions,
): (reason: unknown) => void {
  const log = opts.logger ?? console.error;
  return (reason: unknown) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    log('[main:unhandledRejection]', err);
    routeErrorToRenderer(
      {
        message: err.message,
        stack: err.stack,
        source: 'electron-main-rejection',
      },
      opts,
    );
  };
}

/**
 * Send a serialized error to the renderer via webContents.send. Safe
 * to call when the main window is missing or destroyed (no-ops).
 *
 * Exported for direct use; the build* helpers above wrap this.
 */
export function routeErrorToRenderer(err: SerializedError, opts: ErrorRouterOptions): void {
  try {
    const win = opts.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(`${opts.brandName}:main-error`, err);
    }
  } catch {
    /* swallow secondary errors */
  }
}
