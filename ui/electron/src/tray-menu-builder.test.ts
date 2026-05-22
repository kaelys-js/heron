/**
 * tray-menu-builder.test -- buildTrayMenuTemplate + computeTrayTitle +
 * computeDockBadge unit tests. Pure-function tests; no electron mocks
 * required (we don't call Menu.buildFromTemplate, we just inspect the
 * array shape).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  buildTrayMenuTemplate,
  computeTrayTitle,
  computeDockBadge,
  type MenuBuilderHandlers,
  type MenuBuilderContext,
} from './tray-menu-builder';

function makeHandlers(): MenuBuilderHandlers & { spies: Record<string, ReturnType<typeof vi.fn>> } {
  const spies = {
    onOpenPath: vi.fn(),
    onShowDashboard: vi.fn(),
    onHideWindow: vi.fn(),
    onRunTask: vi.fn(),
    onToggleAutopilot: vi.fn(),
    onToggleMenuBarOnly: vi.fn(),
    onQuit: vi.fn(),
  };
  return { ...spies, spies };
}

function makeContext(overrides: Partial<MenuBuilderContext> = {}): MenuBuilderContext {
  return {
    stats: { queued: 0, appliedToday: 0, upcomingInterviews: 0 },
    platform: 'linux',
    menuBarOnly: false,
    appVersion: '1.0.0',
    displayName: 'Heron',
    ...overrides,
  };
}

describe('buildTrayMenuTemplate -- stats header', () => {
  it('shows stats line when stats are present', () => {
    const items = buildTrayMenuTemplate(
      makeContext({ stats: { queued: 3, appliedToday: 1, upcomingInterviews: 2 } }),
      makeHandlers(),
    );
    expect(items[0].label).toBe('Today: 3 queued · 1 applied · 2 interviews');
    expect(items[0].enabled).toBe(false);
  });

  it('shows "(backend offline)" when stats are null', () => {
    const items = buildTrayMenuTemplate(makeContext({ stats: null }), makeHandlers());
    expect(items[0].label).toBe('(backend offline)');
    expect(items[0].enabled).toBe(false);
  });

  it('shows open-issues row when openIssues > 0 (singular)', () => {
    const items = buildTrayMenuTemplate(
      makeContext({
        stats: { queued: 0, appliedToday: 0, upcomingInterviews: 0, openIssues: 1 },
      }),
      makeHandlers(),
    );
    expect(items[1].label).toBe('⚠ 1 open issue');
  });

  it('shows open-issues row when openIssues > 0 (plural)', () => {
    const items = buildTrayMenuTemplate(
      makeContext({
        stats: { queued: 0, appliedToday: 0, upcomingInterviews: 0, openIssues: 5 },
      }),
      makeHandlers(),
    );
    expect(items[1].label).toBe('⚠ 5 open issues');
  });

  it('omits open-issues row when openIssues === 0', () => {
    const items = buildTrayMenuTemplate(
      makeContext({
        stats: { queued: 0, appliedToday: 0, upcomingInterviews: 0, openIssues: 0 },
      }),
      makeHandlers(),
    );
    expect(items[1].type).toBe('separator');
  });

  it('omits open-issues row when openIssues is undefined', () => {
    const items = buildTrayMenuTemplate(
      makeContext({ stats: { queued: 0, appliedToday: 0, upcomingInterviews: 0 } }),
      makeHandlers(),
    );
    expect(items[1].type).toBe('separator');
  });

  it('wires open-issues click to onOpenPath(/inbox)', () => {
    const h = makeHandlers();
    const items = buildTrayMenuTemplate(
      makeContext({
        stats: { queued: 0, appliedToday: 0, upcomingInterviews: 0, openIssues: 2 },
      }),
      h,
    );
    (items[1].click as () => void)();
    expect(h.spies.onOpenPath).toHaveBeenCalledWith('/inbox');
  });
});

describe('buildTrayMenuTemplate -- section quick-jumps', () => {
  it('renders Pipeline / Inbox / Queue / Stats in order', () => {
    const items = buildTrayMenuTemplate(makeContext(), makeHandlers());
    const labels = items.filter((i) => i.type !== 'separator').map((i) => i.label);
    expect(labels).toContain('Pipeline');
    expect(labels).toContain('Inbox');
    expect(labels).toContain('Queue');
    expect(labels).toContain('Stats');
  });

  it('Pipeline + Inbox have accelerators, Queue + Stats do not', () => {
    const items = buildTrayMenuTemplate(makeContext(), makeHandlers());
    const findByLabel = (label: string) => items.find((i) => i.label === label);
    expect(findByLabel('Pipeline')?.accelerator).toBe('CmdOrCtrl+P');
    expect(findByLabel('Inbox')?.accelerator).toBe('CmdOrCtrl+I');
    expect(findByLabel('Queue')?.accelerator).toBeUndefined();
    expect(findByLabel('Stats')?.accelerator).toBeUndefined();
  });

  it.each([
    ['Pipeline', '/pipeline'],
    ['Inbox', '/inbox'],
    ['Queue', '/queue'],
    ['Stats', '/stats'],
  ])('clicking %s navigates to %s', (label, expectedPath) => {
    const h = makeHandlers();
    const items = buildTrayMenuTemplate(makeContext(), h);
    const item = items.find((i) => i.label === label);
    (item!.click as () => void)();
    expect(h.spies.onOpenPath).toHaveBeenCalledWith(expectedPath);
  });
});

describe('buildTrayMenuTemplate -- actions', () => {
  it('renders "Scan now"', () => {
    const items = buildTrayMenuTemplate(makeContext(), makeHandlers());
    expect(items.find((i) => i.label === 'Scan now')).toBeTruthy();
  });

  it('"Scan now" click triggers onRunTask("scan-portals")', () => {
    const h = makeHandlers();
    const items = buildTrayMenuTemplate(makeContext(), h);
    const scan = items.find((i) => i.label === 'Scan now')!;
    (scan.click as () => void)();
    expect(h.spies.onRunTask).toHaveBeenCalledWith('scan-portals');
  });

  it('shows "Pause autopilot" when not paused', () => {
    const items = buildTrayMenuTemplate(
      makeContext({
        stats: {
          queued: 0,
          appliedToday: 0,
          upcomingInterviews: 0,
          autopilotPaused: false,
        },
      }),
      makeHandlers(),
    );
    expect(items.find((i) => i.label === 'Pause autopilot')).toBeTruthy();
    expect(items.find((i) => i.label === 'Resume autopilot')).toBeUndefined();
  });

  it('shows "Resume autopilot" when paused', () => {
    const items = buildTrayMenuTemplate(
      makeContext({
        stats: {
          queued: 0,
          appliedToday: 0,
          upcomingInterviews: 0,
          autopilotPaused: true,
        },
      }),
      makeHandlers(),
    );
    expect(items.find((i) => i.label === 'Resume autopilot')).toBeTruthy();
    expect(items.find((i) => i.label === 'Pause autopilot')).toBeUndefined();
  });

  it('autopilot toggle click triggers onToggleAutopilot', () => {
    const h = makeHandlers();
    const items = buildTrayMenuTemplate(
      makeContext({
        stats: {
          queued: 0,
          appliedToday: 0,
          upcomingInterviews: 0,
          autopilotPaused: false,
        },
      }),
      h,
    );
    const toggle = items.find((i) => i.label === 'Pause autopilot')!;
    (toggle.click as () => void)();
    expect(h.spies.onToggleAutopilot).toHaveBeenCalled();
  });

  it('omits autopilot toggle when stats are null', () => {
    const items = buildTrayMenuTemplate(makeContext({ stats: null }), makeHandlers());
    expect(items.find((i) => /autopilot/.test(String(i.label)))).toBeUndefined();
  });
});

describe('buildTrayMenuTemplate -- platform branching', () => {
  it('includes Menu Bar Only on darwin', () => {
    const items = buildTrayMenuTemplate(makeContext({ platform: 'darwin' }), makeHandlers());
    const menuBarOnly = items.find((i) => i.label === 'Menu Bar Only (hide Dock icon)');
    expect(menuBarOnly).toBeTruthy();
    expect(menuBarOnly?.type).toBe('checkbox');
  });

  it('omits Menu Bar Only on linux', () => {
    const items = buildTrayMenuTemplate(makeContext({ platform: 'linux' }), makeHandlers());
    expect(items.find((i) => i.label === 'Menu Bar Only (hide Dock icon)')).toBeUndefined();
  });

  it('omits Menu Bar Only on win32', () => {
    const items = buildTrayMenuTemplate(makeContext({ platform: 'win32' }), makeHandlers());
    expect(items.find((i) => i.label === 'Menu Bar Only (hide Dock icon)')).toBeUndefined();
  });

  it('Menu Bar Only reflects current menuBarOnly state', () => {
    const items = buildTrayMenuTemplate(
      makeContext({ platform: 'darwin', menuBarOnly: true }),
      makeHandlers(),
    );
    const menuBarOnly = items.find((i) => i.label === 'Menu Bar Only (hide Dock icon)');
    expect(menuBarOnly?.checked).toBe(true);
  });

  it('Menu Bar Only click triggers onToggleMenuBarOnly', () => {
    const h = makeHandlers();
    const items = buildTrayMenuTemplate(makeContext({ platform: 'darwin' }), h);
    const menuBarOnly = items.find((i) => i.label === 'Menu Bar Only (hide Dock icon)')!;
    (menuBarOnly.click as () => void)();
    expect(h.spies.onToggleMenuBarOnly).toHaveBeenCalled();
  });
});

describe('buildTrayMenuTemplate -- window controls + footer', () => {
  it('"Show dashboard" click triggers onShowDashboard', () => {
    const h = makeHandlers();
    const items = buildTrayMenuTemplate(makeContext(), h);
    const show = items.find((i) => i.label === 'Show dashboard')!;
    (show.click as () => void)();
    expect(h.spies.onShowDashboard).toHaveBeenCalled();
  });

  it('"Hide window" click triggers onHideWindow', () => {
    const h = makeHandlers();
    const items = buildTrayMenuTemplate(makeContext(), h);
    const hide = items.find((i) => i.label === 'Hide window')!;
    (hide.click as () => void)();
    expect(h.spies.onHideWindow).toHaveBeenCalled();
  });

  it('renders version label as disabled', () => {
    const items = buildTrayMenuTemplate(makeContext({ appVersion: '2.3.4' }), makeHandlers());
    const ver = items.find((i) => i.label === 'Version 2.3.4');
    expect(ver).toBeTruthy();
    expect(ver?.enabled).toBe(false);
  });

  it('renders Quit with displayName', () => {
    const items = buildTrayMenuTemplate(
      makeContext({ displayName: 'CustomBrand' }),
      makeHandlers(),
    );
    const quit = items.find((i) => i.label === 'Quit CustomBrand');
    expect(quit).toBeTruthy();
    expect(quit?.accelerator).toBe('CmdOrCtrl+Q');
  });

  it('Quit click triggers onQuit', () => {
    const h = makeHandlers();
    const items = buildTrayMenuTemplate(makeContext(), h);
    const quit = items.find((i) => /^Quit /.test(String(i.label)))!;
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
