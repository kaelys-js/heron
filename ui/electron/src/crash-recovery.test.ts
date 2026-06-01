/**
 * crash-recovery.test -- the pure recovery helpers (shouldRecover /
 * withinCrashLoop / buildRecoveryHtml) PLUS wireCrashRecovery, which attaches
 * the render-process-gone + unresponsive handlers to a live window. electron's
 * app.quit + dialog.showMessageBox are mocked; a fake BrowserWindow captures
 * its webContents handlers so the crash / crash-loop / unresponsive flows can
 * be driven and asserted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appQuit: vi.fn(),
  showMessageBox: vi.fn(() => Promise.resolve({ response: 0 })),
}));
const __appQuit = mocks.appQuit;
const __showMessageBox = mocks.showMessageBox;

vi.mock('electron', () => ({
  app: { quit: mocks.appQuit },
  dialog: { showMessageBox: mocks.showMessageBox },
}));

import {
  shouldRecover,
  withinCrashLoop,
  buildRecoveryHtml,
  wireCrashRecovery,
} from './crash-recovery';

const colors = {
  accent: '#c89b4a',
  primary: '#4a5b6d',
  darkBg: '#0e1014',
  darkSurface: '#14181f',
  textOnDark: '#e8eaed',
};

describe('shouldRecover', () => {
  it('recovers on crash / oom / killed / launch-failure', () => {
    for (const r of [
      'crashed',
      'oom',
      'killed',
      'launch-failed',
      'integrity-failure',
      'abnormal-exit',
    ]) {
      expect(shouldRecover(r)).toBe(true);
    }
  });
  it('does NOT recover on a clean exit (normal window close)', () => {
    expect(shouldRecover('clean-exit')).toBe(false);
  });
});

describe('withinCrashLoop', () => {
  it('is false below the threshold', () => {
    const now = 10_000;
    expect(withinCrashLoop([now], now)).toBe(false);
    expect(withinCrashLoop([now, now - 1000], now)).toBe(false);
  });
  it('is true once enough crashes land inside the window (escalate to dialog)', () => {
    const now = 10_000;
    expect(withinCrashLoop([now, now - 1000, now - 2000], now)).toBe(true);
  });
  it('ignores crashes older than the window (auto-reload resumes)', () => {
    const now = 100_000;
    // three crashes but all > 30s ago -> not a loop.
    expect(withinCrashLoop([0, 1000, 2000], now)).toBe(false);
  });
});

describe('buildRecoveryHtml', () => {
  it('renders the recovering state with a spinner, no manual instructions', () => {
    const html = buildRecoveryHtml({ displayName: 'Heron', colors, looping: false });
    expect(html).toContain('Heron stopped unexpectedly');
    expect(html).toContain('Recovering');
    expect(html).toContain('class="spinner"');
  });
  it('renders the crash-loop state without a spinner', () => {
    const html = buildRecoveryHtml({ displayName: 'Heron', colors, looping: true });
    expect(html).toContain('Heron keeps closing');
    expect(html).not.toContain('class="spinner"');
  });
  it('applies the brand palette', () => {
    const html = buildRecoveryHtml({ displayName: 'Heron', colors, looping: false });
    expect(html).toContain('--accent:#c89b4a');
    expect(html).toContain('--bg:#0e1014');
  });
  it('embeds a strict in-document CSP meta (static page, no script)', () => {
    const html = buildRecoveryHtml({ displayName: 'Heron', colors, looping: false });
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('img-src data:');
    expect(html).toContain("object-src 'none'");
    // No inline script in the recovery page -- it must NOT need script-src.
    expect(html).not.toContain('<script');
  });
  it('escapes the display name', () => {
    const html = buildRecoveryHtml({ displayName: '<b>x</b>', colors, looping: false });
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
  it('embeds a provided logo, else a monogram fallback', () => {
    expect(
      buildRecoveryHtml({
        displayName: 'Heron',
        colors,
        looping: false,
        logoDataUri: 'data:image/png;base64,AA',
      }),
    ).toContain('<img class="logo" src="data:image/png;base64,AA"');
    expect(buildRecoveryHtml({ displayName: 'Heron', colors, looping: false })).toContain(
      'logo--text',
    );
  });
});

/** A BrowserWindow stand-in: captures the webContents handlers wireCrashRecovery
 *  registers so tests can fire them. `destroyed` flips the isDestroyed guard. */
function makeWin() {
  const handlers: Record<string, (...a: unknown[]) => void> = {};
  const win = {
    destroyed: false,
    isDestroyed: vi.fn(() => win.destroyed),
    webContents: {
      on: vi.fn((ev: string, cb: (...a: unknown[]) => void) => {
        handlers[ev] = cb;
      }),
      loadURL: vi.fn(() => Promise.resolve()),
    },
    fire: (ev: string, ...args: unknown[]) => handlers[ev]?.(...args),
  };
  return win;
}

const flush = () => new Promise<void>((r) => setImmediate(r));

describe('wireCrashRecovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __showMessageBox.mockResolvedValue({ response: 0 });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function wire(
    win: ReturnType<typeof makeWin>,
    over: Partial<Parameters<typeof wireCrashRecovery>[1]> = {},
  ) {
    const reload = vi.fn();
    wireCrashRecovery(win as never, { displayName: 'Heron', colors, reload, ...over });
    return reload;
  }

  it('registers render-process-gone + unresponsive listeners', () => {
    const win = makeWin();
    wire(win);
    const events = win.webContents.on.mock.calls.map((c) => c[0]);
    expect(events).toContain('render-process-gone');
    expect(events).toContain('unresponsive');
  });

  it('ignores a clean exit (no recovery screen, no reload)', () => {
    const win = makeWin();
    const reload = wire(win);
    win.fire('render-process-gone', {}, { reason: 'clean-exit' });
    expect(win.webContents.loadURL).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('on a single crash: paints recovery then auto-reloads after the pause', () => {
    vi.useFakeTimers();
    const win = makeWin();
    const reload = wire(win);
    win.fire('render-process-gone', {}, { reason: 'crashed' });
    expect(win.webContents.loadURL).toHaveBeenCalledWith(expect.stringContaining('data:text/html'));
    expect(__showMessageBox).not.toHaveBeenCalled(); // not looping yet
    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1200);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not auto-reload a window destroyed during the pause', () => {
    vi.useFakeTimers();
    const win = makeWin();
    const reload = wire(win);
    win.destroyed = true; // showRecovery early-returns; reload guard also trips
    win.fire('render-process-gone', {}, { reason: 'crashed' });
    expect(win.webContents.loadURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1200);
    expect(reload).not.toHaveBeenCalled();
  });

  it('after repeated crashes it escalates to a dialog and reloads on choice 0', async () => {
    const win = makeWin();
    __showMessageBox.mockResolvedValue({ response: 0 });
    const reload = wire(win);
    for (let i = 0; i < 3; i++) {
      win.fire('render-process-gone', {}, { reason: 'crashed' });
    }
    expect(__showMessageBox).toHaveBeenCalled();
    await flush();
    expect(reload).toHaveBeenCalled();
  });

  it('crash-loop dialog quits (default app.quit) on choice 1', async () => {
    const win = makeWin();
    __showMessageBox.mockResolvedValue({ response: 1 });
    wire(win); // no injected quit -> falls back to app.quit
    for (let i = 0; i < 3; i++) {
      win.fire('render-process-gone', {}, { reason: 'crashed' });
    }
    await flush();
    expect(__appQuit).toHaveBeenCalled();
  });

  it('crash-loop dialog uses the injected quit when provided', async () => {
    const win = makeWin();
    __showMessageBox.mockResolvedValue({ response: 1 });
    const quit = vi.fn();
    wire(win, { quit });
    for (let i = 0; i < 3; i++) {
      win.fire('render-process-gone', {}, { reason: 'crashed' });
    }
    await flush();
    expect(quit).toHaveBeenCalled();
    expect(__appQuit).not.toHaveBeenCalled();
  });

  it('unresponsive shows a dialog and reloads when the user chooses Reload', async () => {
    const win = makeWin();
    __showMessageBox.mockResolvedValue({ response: 1 });
    const reload = wire(win);
    win.fire('unresponsive');
    expect(__showMessageBox).toHaveBeenCalled();
    await flush();
    expect(reload).toHaveBeenCalled();
  });

  it('unresponsive does not reload when the user chooses Wait', async () => {
    const win = makeWin();
    __showMessageBox.mockResolvedValue({ response: 0 });
    const reload = wire(win);
    win.fire('unresponsive');
    await flush();
    expect(reload).not.toHaveBeenCalled();
  });

  it('unresponsive on a destroyed window is a no-op', () => {
    const win = makeWin();
    win.destroyed = true;
    wire(win);
    win.fire('unresponsive');
    expect(__showMessageBox).not.toHaveBeenCalled();
  });
});
