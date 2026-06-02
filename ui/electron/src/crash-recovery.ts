/** Global renderer-crash recovery for the desktop app -- the Electron analogue
 *  of the iOS BootFailureView.
 *
 *  Gap this closes: if the Chromium RENDERER process dies (crash / OOM /
 *  killed), the BrowserWindow is left showing a blank white void with no way
 *  back -- the in-page boot-fallback (app.html) is gone with the process. iOS
 *  recovers via a native BootFailureView + reload; this gives the desktop the
 *  same: a branded recovery screen, automatic reload, and a crash-loop guard
 *  that escalates to a native Reload/Quit dialog instead of looping forever.
 *
 *  Pure helpers (shouldRecover / withinCrashLoop / buildRecoveryHtml) are
 *  unit-tested; wireCrashRecovery wires them onto a live BrowserWindow. */
import { app, dialog } from 'electron';
import type { BrowserWindow } from 'electron';

export type RecoveryColors = {
  accent: string;
  primary: string;
  darkBg: string;
  darkSurface: string;
  textOnDark: string;
};

/** Render-process-gone reasons that warrant a recovery UI. A clean exit
 *  (e.g. the window closing normally) must NOT trigger recovery. */
export function shouldRecover(reason: string): boolean {
  return reason !== 'clean-exit';
}

/** Crash-loop guard: true when too many crashes happened inside the window,
 *  so the caller escalates to a manual Reload/Quit choice instead of
 *  auto-reloading into the same crash again. */
export function withinCrashLoop(
  timestamps: number[],
  now: number,
  windowMs = 30_000,
  max = 3,
): boolean {
  return timestamps.filter((t) => now - t < windowMs).length >= max;
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Branded recovery page shown in the main window after a renderer crash. */
export function buildRecoveryHtml(opts: {
  displayName: string;
  colors: RecoveryColors;
  looping: boolean;
  logoDataUri?: string;
}): string {
  const { displayName, colors: c, looping } = opts;
  const heading = looping ? `${displayName} keeps closing` : `${displayName} stopped unexpectedly`;
  const detail = looping
    ? 'A reload didn’t stick. Choose Reload to try again, or Quit and relaunch.'
    : 'Recovering your session…';
  const logo = opts.logoDataUri
    ? `<img class="logo" src="${esc(opts.logoDataUri)}" alt="" draggable="false" />`
    : `<div class="logo logo--text" aria-hidden="true">${esc(displayName.slice(0, 1))}</div>`;
  const spinner = looping ? '' : '<div class="spinner" aria-hidden="true"></div>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<!-- In-document CSP for this data: URL. The recovery page is static: inline
     <style> + a data: logo, no script, no network, no plugins, no framing. -->
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" />
<title>${esc(displayName)}</title>
<style>
  :root { --accent:${esc(c.accent)}; --primary:${esc(c.primary)}; --bg:${esc(c.darkBg)}; --surface:${esc(c.darkSurface)}; --text:${esc(c.textOnDark)}; }
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { height:100%; }
  body {
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    color:var(--text); -webkit-user-select:none; user-select:none;
    background:radial-gradient(120% 80% at 50% -10%, color-mix(in srgb, var(--primary) 24%, transparent), transparent 60%), linear-gradient(180deg, var(--surface), var(--bg));
    display:flex; align-items:center; justify-content:center; height:100%;
  }
  main { text-align:center; padding:40px; max-width:420px; animation:rise .35s ease both; }
  @keyframes rise { from { opacity:0; transform:translateY(6px);} to { opacity:1; transform:none;} }
  .logo { width:64px; height:64px; border-radius:16px; margin:0 auto 18px; box-shadow:0 10px 30px rgba(0,0,0,.45); }
  .logo--text { display:grid; place-items:center; font-size:30px; font-weight:700; color:var(--bg); background:linear-gradient(145deg,var(--accent),var(--primary)); }
  h1 { font-size:20px; font-weight:650; letter-spacing:-.01em; }
  p { margin-top:10px; font-size:13px; line-height:1.55; color:color-mix(in srgb, var(--text) 72%, transparent); }
  .spinner { width:22px; height:22px; margin:20px auto 0; border-radius:50%; border:2px solid color-mix(in srgb, var(--text) 18%, transparent); border-top-color:var(--accent); animation:spin .8s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg);} }
  .hint { margin-top:18px; font-size:11px; color:color-mix(in srgb, var(--text) 44%, transparent); }
</style>
</head>
<body>
  <main>
    ${logo}
    <h1>${esc(heading)}</h1>
    <p>${esc(detail)}</p>
    ${spinner}
    ${looping ? '' : '<div class="hint">If this keeps happening, relaunch the app.</div>'}
  </main>
</body>
</html>`;
}

export type CrashRecoveryOptions = {
  displayName: string;
  colors: RecoveryColors;
  logoDataUri?: string;
  /** Reload the real app into the window (re-runs the dev/prod load path). */
  reload: () => void;
  /** Quit the app (defaults to app.quit). Injectable for tests. */
  quit?: () => void;
};

/** Attach renderer-crash + unresponsive recovery to a window. */
export function wireCrashRecovery(win: BrowserWindow, opts: CrashRecoveryOptions): void {
  const crashes: number[] = [];
  const quit = opts.quit ?? (() => app.quit());
  // Pending auto-reload from a non-looping crash. Tracked so crash-loop
  // escalation can cancel it -- otherwise a timer armed by an earlier crash
  // fires a reload while the Reload/Quit dialog is still up, contradicting the
  // user's choice.
  let reloadTimer: ReturnType<typeof setTimeout> | null = null;

  const showRecovery = (looping: boolean) => {
    if (win.isDestroyed()) {
      return;
    }
    const html = buildRecoveryHtml({
      displayName: opts.displayName,
      colors: opts.colors,
      looping,
      logoDataUri: opts.logoDataUri,
    });
    void win.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  };

  win.webContents.on('render-process-gone', (_event, details) => {
    if (!shouldRecover(details.reason)) {
      return;
    }
    const now = Date.now();
    crashes.push(now);
    const looping = withinCrashLoop(crashes, now);
    showRecovery(looping);

    if (looping) {
      // Stop auto-reloading into the same crash; let the user decide. Cancel any
      // reload armed by an earlier crash so it can't fire while the dialog is up.
      if (reloadTimer) {
        clearTimeout(reloadTimer);
        reloadTimer = null;
      }
      void dialog
        .showMessageBox(win, {
          type: 'error',
          title: opts.displayName,
          message: `${opts.displayName} keeps closing`,
          detail: 'A reload didn’t stick. Reload to try again, or Quit and relaunch.',
          buttons: ['Reload', 'Quit'],
          defaultId: 0,
          cancelId: 1,
        })
        .then(({ response }) => (response === 0 ? opts.reload() : quit()));
    } else {
      // Brief pause so the recovery screen paints, then reload the app. Replace
      // any prior pending reload so rapid crashes don't stack timers.
      if (reloadTimer) {
        clearTimeout(reloadTimer);
      }
      reloadTimer = setTimeout(() => {
        reloadTimer = null;
        if (!win.isDestroyed()) {
          opts.reload();
        }
      }, 1200);
    }
  });

  win.webContents.on('unresponsive', () => {
    if (win.isDestroyed()) {
      return;
    }
    void dialog
      .showMessageBox(win, {
        type: 'warning',
        title: opts.displayName,
        message: `${opts.displayName} isn’t responding`,
        detail: 'Wait for it to catch up, or reload the window.',
        buttons: ['Wait', 'Reload'],
        defaultId: 0,
        cancelId: 0,
      })
      .then(({ response }) => {
        if (response === 1) {
          opts.reload();
        }
      });
  });
}
