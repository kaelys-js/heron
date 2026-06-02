/**
 * tray-menu-builder.test -- buildTrayMenuTemplate + computeTrayTitle +
 * computeDockBadge unit tests. Pure-function tests; no electron mocks
 * required (we inspect the returned template array shape).
 *
 * The menu is intentionally minimal -- a menu-bar utility, not a second nav
 * surface: [macOS: Hide Dock Icon] · Show/Hide Window · Version · Quit.
 */
import { describe, it, expect, vi } from 'vitest';
import { buildTrayMenuTemplate, computeTrayTitle, computeDockBadge } from './tray-menu-builder';
import type { MenuBuilderHandlers, MenuBuilderContext } from './tray-menu-builder';

function makeHandlers(): MenuBuilderHandlers & { spies: Record<string, ReturnType<typeof vi.fn>> } {
  const spies = {
    onToggleWindow: vi.fn(),
    onToggleMenuBarOnly: vi.fn(),
    onQuit: vi.fn(),
  };
  return { ...spies, spies };
}

function makeContext(overrides: Partial<MenuBuilderContext> = {}): MenuBuilderContext {
  return {
    platform: 'linux',
    menuBarOnly: false,
    windowVisible: false,
    appVersion: '1.0.0',
    displayName: 'Heron',
    ...overrides,
  };
}

function labels(items: ReturnType<typeof buildTrayMenuTemplate>): string[] {
  return items.filter((i) => i.type !== 'separator').map((i) => String(i.label));
}

describe('buildTrayMenuTemplate -- minimal item set', () => {
  it('on non-darwin is exactly: Show Window, Version, Quit', () => {
    const items = buildTrayMenuTemplate(makeContext({ platform: 'linux' }), makeHandlers());
    expect(labels(items)).toEqual(['Show Window', 'Version 1.0.0', 'Quit Heron']);
  });

  it('on darwin prepends the Hide Dock Icon toggle', () => {
    const items = buildTrayMenuTemplate(makeContext({ platform: 'darwin' }), makeHandlers());
    expect(labels(items)).toEqual(['Hide Dock Icon', 'Show Window', 'Version 1.0.0', 'Quit Heron']);
  });

  it('drops the removed items (quick-jumps, scan, autopilot, stats header)', () => {
    const items = buildTrayMenuTemplate(makeContext({ platform: 'darwin' }), makeHandlers());
    const ls = labels(items);
    for (const gone of ['Pipeline', 'Inbox', 'Queue', 'Stats', 'Scan now', 'Show dashboard']) {
      expect(ls).not.toContain(gone);
    }
    expect(
      ls.some((l) => /autopilot/i.test(l) || /backend offline/i.test(l) || /^Today:/.test(l)),
    ).toBe(false);
  });
});

describe('buildTrayMenuTemplate -- window toggle label tracks visibility', () => {
  it('reads "Show Window" when no window is visible', () => {
    const items = buildTrayMenuTemplate(makeContext({ windowVisible: false }), makeHandlers());
    expect(labels(items)).toContain('Show Window');
    expect(labels(items)).not.toContain('Hide Window');
  });

  it('reads "Hide Window" when a window is visible', () => {
    const items = buildTrayMenuTemplate(makeContext({ windowVisible: true }), makeHandlers());
    expect(labels(items)).toContain('Hide Window');
    expect(labels(items)).not.toContain('Show Window');
  });

  it('click triggers onToggleWindow regardless of label', () => {
    const h = makeHandlers();
    const items = buildTrayMenuTemplate(makeContext({ windowVisible: true }), h);
    (items.find((i) => i.label === 'Hide Window')!.click as () => void)();
    expect(h.spies.onToggleWindow).toHaveBeenCalled();
  });
});

describe('buildTrayMenuTemplate -- Hide Dock Icon (macOS)', () => {
  it('renders a checkbox on darwin, omitted elsewhere', () => {
    const mac = buildTrayMenuTemplate(makeContext({ platform: 'darwin' }), makeHandlers());
    expect(mac.find((i) => i.label === 'Hide Dock Icon')?.type).toBe('checkbox');
    for (const p of ['linux', 'win32'] as const) {
      const items = buildTrayMenuTemplate(makeContext({ platform: p }), makeHandlers());
      expect(items.find((i) => i.label === 'Hide Dock Icon')).toBeUndefined();
    }
  });

  it('reflects the current menuBarOnly state', () => {
    const on = buildTrayMenuTemplate(
      makeContext({ platform: 'darwin', menuBarOnly: true }),
      makeHandlers(),
    );
    expect(on.find((i) => i.label === 'Hide Dock Icon')?.checked).toBe(true);
  });

  it('click triggers onToggleMenuBarOnly', () => {
    const h = makeHandlers();
    const items = buildTrayMenuTemplate(makeContext({ platform: 'darwin' }), h);
    (items.find((i) => i.label === 'Hide Dock Icon')!.click as () => void)();
    expect(h.spies.onToggleMenuBarOnly).toHaveBeenCalled();
  });
});

describe('buildTrayMenuTemplate -- footer', () => {
  it('renders the version label as disabled', () => {
    const items = buildTrayMenuTemplate(makeContext({ appVersion: '2.3.4' }), makeHandlers());
    expect(items.find((i) => i.label === 'Version 2.3.4')?.enabled).toBe(false);
  });

  it('renders Quit with the brand name + accelerator, wired to onQuit', () => {
    const h = makeHandlers();
    const items = buildTrayMenuTemplate(makeContext({ displayName: 'CustomBrand' }), h);
    const quit = items.find((i) => i.label === 'Quit CustomBrand')!;
    expect(quit.accelerator).toBe('CmdOrCtrl+Q');
    (quit.click as () => void)();
    expect(h.spies.onQuit).toHaveBeenCalled();
  });
});

describe('computeTrayTitle', () => {
  it('returns empty string on linux', () => {
    expect(computeTrayTitle({ queued: 5, appliedToday: 0, upcomingInterviews: 0 }, 'linux')).toBe(
      '',
    );
  });

  it('returns empty string on win32', () => {
    expect(computeTrayTitle({ queued: 5, appliedToday: 0, upcomingInterviews: 0 }, 'win32')).toBe(
      '',
    );
  });

  it('returns queued count on darwin when > 0', () => {
    expect(computeTrayTitle({ queued: 3, appliedToday: 0, upcomingInterviews: 0 }, 'darwin')).toBe(
      '3',
    );
  });

  it('returns empty string on darwin when queued === 0', () => {
    expect(computeTrayTitle({ queued: 0, appliedToday: 0, upcomingInterviews: 0 }, 'darwin')).toBe(
      '',
    );
  });

  it('returns empty string on darwin when stats null', () => {
    expect(computeTrayTitle(null, 'darwin')).toBe('');
  });
});

describe('computeDockBadge', () => {
  it('returns empty string on non-darwin platforms', () => {
    expect(computeDockBadge({ queued: 0, appliedToday: 0, upcomingInterviews: 5 }, 'linux')).toBe(
      '',
    );
    expect(computeDockBadge({ queued: 0, appliedToday: 0, upcomingInterviews: 5 }, 'win32')).toBe(
      '',
    );
  });

  it('returns upcomingInterviews count on darwin when > 0', () => {
    expect(computeDockBadge({ queued: 0, appliedToday: 0, upcomingInterviews: 7 }, 'darwin')).toBe(
      '7',
    );
  });

  it('returns empty string on darwin when count === 0', () => {
    expect(computeDockBadge({ queued: 0, appliedToday: 0, upcomingInterviews: 0 }, 'darwin')).toBe(
      '',
    );
  });

  it('returns empty string on darwin when stats null', () => {
    expect(computeDockBadge(null, 'darwin')).toBe('');
  });
});
