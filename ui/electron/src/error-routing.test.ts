/**
 * error-routing.test -- buildUnhandledErrorHandler +
 * buildUnhandledRejectionHandler + routeErrorToRenderer.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  buildUnhandledErrorHandler,
  buildUnhandledRejectionHandler,
  routeErrorToRenderer,
  type BrowserWindowLike,
  type ErrorRouterOptions,
} from './error-routing';

function makeWindow(
  opts: { destroyed?: boolean; throwOnSend?: boolean } = {},
): BrowserWindowLike & {
  __sendSpy: ReturnType<typeof vi.fn>;
} {
  const sendSpy = vi.fn();
  if (opts.throwOnSend) {
    sendSpy.mockImplementation(() => {
      throw new Error('webContents gone');
    });
  }
  return {
    isDestroyed: () => opts.destroyed ?? false,
    webContents: { send: sendSpy },
    __sendSpy: sendSpy,
  };
}

describe('routeErrorToRenderer', () => {
  it('sends serialized error to main window', () => {
    const win = makeWindow();
    const log = vi.fn();
    const opts: ErrorRouterOptions = {
      brandName: 'heron',
      getMainWindow: () => win,
      logger: log,
    };
    routeErrorToRenderer({ message: 'oops', stack: 'a\nb', source: 'electron-main' }, opts);
    expect(win.__sendSpy).toHaveBeenCalledWith('heron:main-error', {
      message: 'oops',
      stack: 'a\nb',
      source: 'electron-main',
    });
  });

  it('no-ops when window is undefined', () => {
    const opts: ErrorRouterOptions = {
      brandName: 'heron',
      getMainWindow: () => undefined,
    };
    expect(() =>
      routeErrorToRenderer({ message: 'x', source: 'electron-main' }, opts),
    ).not.toThrow();
  });

  it('no-ops when window is destroyed', () => {
    const win = makeWindow({ destroyed: true });
    const opts: ErrorRouterOptions = {
      brandName: 'heron',
      getMainWindow: () => win,
    };
    routeErrorToRenderer({ message: 'x', source: 'electron-main' }, opts);
    expect(win.__sendSpy).not.toHaveBeenCalled();
  });

  it('swallows secondary errors from webContents.send', () => {
    const win = makeWindow({ throwOnSend: true });
    const opts: ErrorRouterOptions = {
      brandName: 'heron',
      getMainWindow: () => win,
    };
    expect(() =>
      routeErrorToRenderer({ message: 'x', source: 'electron-main' }, opts),
    ).not.toThrow();
  });

  it('uses custom brand name in channel', () => {
    const win = makeWindow();
    const opts: ErrorRouterOptions = {
      brandName: 'custombrand',
      getMainWindow: () => win,
    };
    routeErrorToRenderer({ message: 'x', source: 'electron-main' }, opts);
    expect(win.__sendSpy).toHaveBeenCalledWith('custombrand:main-error', expect.any(Object));
  });
});

describe('buildUnhandledErrorHandler', () => {
  it('logs the error', () => {
    const log = vi.fn();
    const win = makeWindow();
    const handler = buildUnhandledErrorHandler({
      brandName: 'heron',
      getMainWindow: () => win,
      logger: log,
    });
    const err = new Error('boom');
    handler(err);
    expect(log).toHaveBeenCalledWith('[main:unhandled]', err);
  });

  it('sends error to renderer with electron-main source', () => {
    const win = makeWindow();
    const handler = buildUnhandledErrorHandler({
      brandName: 'heron',
      getMainWindow: () => win,
      logger: vi.fn(),
    });
    handler(new Error('boom'));
    expect(win.__sendSpy).toHaveBeenCalledWith(
      'heron:main-error',
      expect.objectContaining({ message: 'boom', source: 'electron-main' }),
    );
  });

  it('uses console.error as default logger', () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const win = makeWindow();
    const handler = buildUnhandledErrorHandler({
      brandName: 'heron',
      getMainWindow: () => win,
    });
    handler(new Error('boom'));
    expect(consoleErr).toHaveBeenCalled();
    consoleErr.mockRestore();
  });

  it('handles undefined error message gracefully', () => {
    const log = vi.fn();
    const win = makeWindow();
    const handler = buildUnhandledErrorHandler({
      brandName: 'heron',
      getMainWindow: () => win,
      logger: log,
    });
    // Pass an Error-shaped object without message.
    const weird = { message: undefined } as unknown as Error;
    handler(weird);
    // The message field should be a non-undefined string -- coerced via String(e).
    const payload = win.__sendSpy.mock.calls[0]?.[1] as { message: string };
    expect(typeof payload.message).toBe('string');
  });
});

describe('buildUnhandledRejectionHandler', () => {
  it('wraps non-Error rejection reasons in Error', () => {
    const log = vi.fn();
    const win = makeWindow();
    const handler = buildUnhandledRejectionHandler({
      brandName: 'heron',
      getMainWindow: () => win,
      logger: log,
    });
    handler('string reason');
    const payload = win.__sendSpy.mock.calls[0]?.[1] as { message: string; source: string };
    expect(payload.message).toBe('string reason');
    expect(payload.source).toBe('electron-main-rejection');
  });

  it('preserves Error instances as-is', () => {
    const win = makeWindow();
    const handler = buildUnhandledRejectionHandler({
      brandName: 'heron',
      getMainWindow: () => win,
      logger: vi.fn(),
    });
    const err = new Error('rejection');
    err.stack = 'fake stack';
    handler(err);
    const payload = win.__sendSpy.mock.calls[0]?.[1] as { message: string; stack: string };
    expect(payload.message).toBe('rejection');
    expect(payload.stack).toBe('fake stack');
  });

  it('logs the rejection', () => {
    const log = vi.fn();
    const win = makeWindow();
    const handler = buildUnhandledRejectionHandler({
      brandName: 'heron',
      getMainWindow: () => win,
      logger: log,
    });
    handler('reason');
    expect(log.mock.calls[0]?.[0]).toBe('[main:unhandledRejection]');
  });

  it('handles undefined/null rejection reasons', () => {
    const win = makeWindow();
    const handler = buildUnhandledRejectionHandler({
      brandName: 'heron',
      getMainWindow: () => win,
      logger: vi.fn(),
    });
    expect(() => handler(undefined)).not.toThrow();
    expect(() => handler(null)).not.toThrow();
  });
});
