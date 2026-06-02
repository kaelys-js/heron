/** The desktop "What's New" / auto-update window.
 *
 *  A small, frameless, brand-themed BrowserWindow -- a TestFlight-style release
 *  card. Three modes drive the footer buttons:
 *    - 'available'  an update was found        -> [Download] [Later]
 *    - 'downloaded' the update is staged        -> [Restart & Update] [Later]
 *    - 'current'    just showing this version's notes -> [Close]
 *  The HTML builder + the release-notes renderer are PURE (no electron import)
 *  so they're unit-testable; openChangelogWindow owns the BrowserWindow
 *  lifecycle, single-instance behaviour (per mode), and the IPC bridge the
 *  page's buttons use.
 *
 *  Mirrors about-window.ts exactly (same palette, same esc() idiom, same
 *  deny-popups / block-nav / Esc-Cmd-W / ready-to-show lifecycle). The window
 *  stays DECOUPLED from electron-updater: the Download / Restart actions are
 *  caller-supplied callbacks (opts.onDownload / opts.onInstall), so this module
 *  never imports autoUpdater and the wiring is testable.
 *
 *  Security: release notes can come from electron-updater (UpdateInfo.releaseNotes
 *  -- a remote string or {version,note}[] off the network) so they're UNTRUSTED.
 *  renderReleaseNotes() esc()s the WHOLE input first, then re-introduces a tiny
 *  markdown whitelist (### / - / ** / ` / bare https:// link). No raw
 *  <script>/<img>/<a href> ever reaches the page; links are bridge-routed
 *  <button>s handed to shell.openExternal (https only) in the main process. */
import { BrowserWindow, ipcMain, shell, app } from 'electron';
import { join } from 'node:path';
import { readFileSync, watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';

export type ChangelogColors = {
  accent: string;
  primary: string;
  darkBg: string;
  darkSurface: string;
  textOnDark: string;
};

export type ChangelogMode = 'available' | 'downloaded' | 'current';

/** electron-updater's UpdateInfo.releaseNotes shape, plus the raw-markdown form
 *  the About "What's New" passes (build-info's CHANGELOG section). */
export type ReleaseNotes = string | { version: string; note: string }[] | null;

export type ChangelogInfo = {
  displayName: string;
  /** Version being announced (the available/downloaded update, or the current one). */
  version: string;
  mode: ChangelogMode;
  /** SAFE html produced by renderReleaseNotes(). */
  notesHtml: string;
  colors: ChangelogColors;
  /** data: URI for the logo, or undefined to render the wordmark only. */
  logoDataUri?: string;
  /** Global the preload exposes; the page wires its buttons to it. */
  bridge?: string;
  /** Put the close button on the LEFT (macOS window-control convention).
   *  Defaults to the right (Windows/Linux). */
  closeOnLeft?: boolean;
  /** Offer a "Skip this version" affordance. Only meaningful in mode
   *  'downloaded' (an auto-downloaded update the user may want to suppress until
   *  the next one); ignored in 'available' / 'current'. Wired to opts.onSkip. */
  showSkip?: boolean;
};

const DEFAULT_BRIDGE = '__changelogBridge__';

/** Escape a string for safe interpolation into HTML text or a double-quoted
 *  attribute. Identical to about-window.ts's esc() -- the single choke point
 *  every untrusted release-note character passes through before any whitelist
 *  markup is re-introduced. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Re-introduce a tiny inline-markup whitelist into an ALREADY-escaped line:
 *  `**x**` -> <strong>, `` `x` `` -> <code>, and bare https:// URLs -> a
 *  bridge-routed <button data-href> (never a raw <a href>). Operates on escaped
 *  text, so a `<` in the source is already `&lt;` and can't form a real tag. */
function inlineMarkup(escaped: string): string {
  let out = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Inline `code` spans. The backtick delimiter is built from its char code so
  // no literal backtick sits in a /.../ regex here -- keeps the inline markup
  // self-contained and avoids any backtick/template lexing ambiguity.
  const bt = String.fromCharCode(96);
  out = out.replace(new RegExp(`${bt}([^${bt}]+)${bt}`, 'g'), '<code>$1</code>');
  // Bare URL -> bridge button. The URL is already esc()'d; we re-decode only
  // the entities esc() introduced so shell.openExternal gets the real href,
  // and re-esc() it into the data-href attribute defensively.
  out = out.replace(/https:\/\/[^\s<]+/g, (m) => {
    // Reverse esc() in the inverse order it escaped: decode the `&`-prefixed
    // entities (&#39;, &quot;) FIRST and `&amp;` LAST. Decoding &amp; first
    // would turn `&amp;#39;` into `&#39;` and then into `'` -- a double-unescape.
    const raw = m
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&');
    return `<button class="cl-link" type="button" data-href="${esc(raw)}">${m}</button>`;
  });
  return out;
}

/** Render ONE markdown block (a string of release notes) to SAFE html. esc()
 *  the whole input FIRST, then walk lines re-introducing the block whitelist:
 *  "### " -> h3, "- " -> grouped li in a ul, blank line -> paragraph break,
 *  everything else -> a paragraph. Inline markup (bold, code, url) runs per line. */
function renderMarkdownBlock(notes: string): string {
  const escaped = esc(String(notes ?? ''));
  const lines = escaped.split('\n');
  const out: string[] = [];
  let listItems: string[] = [];
  let paragraph: string[] = [];

  const flushList = () => {
    if (listItems.length) {
      const ul = `<ul>${listItems.join('')}</ul>`;
      out.push(ul);
      listItems = [];
    }
  };
  const flushParagraph = () => {
    if (paragraph.length) {
      const p = `<p>${paragraph.join(' ')}</p>`;
      out.push(p);
      paragraph = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      // Blank line -> paragraph break (end the current paragraph + list).
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^###\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      out.push(`<h3>${inlineMarkup(heading[1])}</h3>`);
      continue;
    }
    const item = /^[-*]\s+(.*)$/.exec(trimmed);
    if (item) {
      flushParagraph();
      listItems.push(`<li>${inlineMarkup(item[1])}</li>`);
      continue;
    }
    // A plain text line accumulates into the current paragraph.
    flushList();
    paragraph.push(inlineMarkup(trimmed));
  }
  flushParagraph();
  flushList();
  return out.join('\n');
}

/** PURE. Render electron-updater release notes (string | {version,note}[] |
 *  null) OR a raw markdown string into SAFE html. The array form renders each
 *  entry as its own "Version X" section. Always escapes first (see esc()), so
 *  no raw <script>/<img onerror>/<a href>/javascript: survives. */
export function renderReleaseNotes(notes: ReleaseNotes): string {
  if (notes == null) {
    return '';
  }
  if (Array.isArray(notes)) {
    return notes
      .map((entry) => {
        const version = esc(String(entry?.version ?? ''));
        const body = renderMarkdownBlock(String(entry?.note ?? ''));
        return `<section class="cl-version"><h3 class="cl-version-h">Version ${version}</h3>${body}</section>`;
      })
      .join('\n');
  }
  return renderMarkdownBlock(String(notes));
}

/** The footer buttons for each mode. The PRIMARY button fires its bridge action
 *  (download / install); the SECONDARY just closes. 'current' has a single
 *  Close. data-action is read by the inline IIFE and routed to the bridge. A
 *  "Skip this version" text button (data-action="skip") is added on the left in
 *  mode 'downloaded' when showSkip is set -- it tells the main process never to
 *  re-surface this version, then closes. */
function footerButtons(mode: ChangelogMode, showSkip = false): string {
  if (mode === 'available') {
    return [
      `<button class="cl-btn cl-btn--secondary" type="button" data-action="close">Later</button>`,
      `<button class="cl-btn cl-btn--primary" type="button" data-action="download">Download</button>`,
    ].join('');
  }
  if (mode === 'downloaded') {
    const skip = showSkip
      ? `<button class="cl-btn cl-btn--skip" type="button" data-action="skip">Skip this version</button>`
      : '';
    return [
      skip,
      `<button class="cl-btn cl-btn--secondary" type="button" data-action="close">Later</button>`,
      `<button class="cl-btn cl-btn--primary" type="button" data-action="install">Restart &amp; Update</button>`,
    ].join('');
  }
  return `<button class="cl-btn cl-btn--primary" type="button" data-action="close">Close</button>`;
}

/** Render the full self-contained "What's New" document (loaded as a data: URL). */
export function buildChangelogHtml(info: ChangelogInfo): string {
  const c = info.colors;
  const bridge = info.bridge ?? DEFAULT_BRIDGE;
  const closeSide = info.closeOnLeft ? 'left: 14px' : 'right: 14px';
  const dragSides = info.closeOnLeft ? 'left: 54px; right: 0' : 'left: 0; right: 54px';

  const logo = info.logoDataUri
    ? `<img class="cl-logo cl-logo--img" src="${esc(info.logoDataUri)}" alt="${esc(info.displayName)} logo" draggable="false" />`
    : `<div class="cl-logo cl-logo--text" aria-hidden="true">${esc(info.displayName.slice(0, 1))}</div>`;

  // notesHtml is already SAFE (renderReleaseNotes). A friendly empty state keeps
  // the card from looking broken when a release ships no notes.
  const notes = info.notesHtml.trim()
    ? info.notesHtml
    : `<p class="cl-empty">No release notes for this version.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<!-- In-document CSP for this data: URL. Self-contained: inline <style> + an
     inline IIFE (script-src 'unsafe-inline'), a data: logo, no network/plugins/
     framing. Release notes are pre-sanitised by renderReleaseNotes(); this CSP
     is the belt to that suspenders -- even if a raw <script src> slipped the
     whitelist it could not load. -->
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" />
<title>What's New in ${esc(info.displayName)}</title>
<style>
  :root {
    --accent: ${esc(c.accent)};
    --primary: ${esc(c.primary)};
    --bg: ${esc(c.darkBg)};
    --surface: ${esc(c.darkSurface)};
    --text: ${esc(c.textOnDark)};
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--text);
    background:
      radial-gradient(120% 80% at 50% -10%, color-mix(in srgb, var(--primary) 26%, transparent), transparent 60%),
      linear-gradient(180deg, var(--surface), var(--bg));
    -webkit-user-select: none;
    user-select: none;
    overflow: hidden;
  }
  .drag { position: absolute; top: 0; ${dragSides}; height: 44px; -webkit-app-region: drag; }
  .close {
    position: absolute; top: 12px; ${closeSide}; width: 26px; height: 26px;
    /* z-index above the scrolling card so the click always lands (mirrors the
       about-window close-button fix). */
    z-index: 20;
    border: none; border-radius: 50%; cursor: pointer;
    background: color-mix(in srgb, var(--text) 8%, transparent);
    color: var(--text); font-size: 15px; line-height: 26px;
    -webkit-app-region: no-drag; transition: background .15s ease;
  }
  .close:hover { background: color-mix(in srgb, var(--text) 18%, transparent); }
  main {
    height: 100%;
    display: flex; flex-direction: column; align-items: center;
    padding: 38px 30px 0; gap: 4px;
    animation: rise .35s ease both;
  }
  @keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .cl-logo { width: 60px; height: 60px; margin-bottom: 10px; flex: none; }
  .cl-logo--img {
    object-fit: contain;
    filter: drop-shadow(0 8px 22px rgba(0,0,0,.5))
      drop-shadow(0 0 16px color-mix(in srgb, var(--accent) 28%, transparent));
  }
  .cl-logo--text {
    border-radius: 15px;
    box-shadow: 0 10px 30px rgba(0,0,0,.45), 0 0 0 1px color-mix(in srgb, var(--text) 8%, transparent);
    display: grid; place-items: center; font-size: 30px; font-weight: 700;
    color: var(--bg); background: linear-gradient(145deg, var(--accent), var(--primary));
  }
  h1 { font-size: 21px; font-weight: 650; letter-spacing: -.01em; text-align: center; }
  .cl-version-pill {
    display: inline-block; margin-top: 10px; padding: 4px 11px; border-radius: 999px;
    font: 600 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 32%, transparent);
  }
  .cl-notes {
    margin-top: 18px; width: 100%; flex: 1 1 auto; overflow-y: auto;
    font-size: 13px; line-height: 1.6;
    color: color-mix(in srgb, var(--text) 82%, transparent);
    -webkit-user-select: text; user-select: text;
  }
  .cl-notes h3 { font-size: 13.5px; font-weight: 650; margin: 14px 0 6px; color: var(--text); }
  .cl-notes h3:first-child { margin-top: 0; }
  .cl-notes p { margin: 8px 0; }
  .cl-notes ul { margin: 6px 0 6px 2px; list-style: none; }
  .cl-notes li { position: relative; padding-left: 18px; margin: 4px 0; }
  .cl-notes li::before {
    content: ""; position: absolute; left: 4px; top: 8px; width: 5px; height: 5px;
    border-radius: 50%; background: var(--accent);
  }
  .cl-notes code {
    font: 11.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    padding: 1px 5px; border-radius: 5px;
    background: color-mix(in srgb, var(--text) 9%, transparent);
  }
  .cl-version { padding-bottom: 8px; }
  .cl-version-h { color: var(--accent); }
  .cl-empty { color: color-mix(in srgb, var(--text) 52%, transparent); font-style: italic; }
  .cl-link {
    -webkit-app-region: no-drag; cursor: pointer;
    font: inherit; color: var(--accent); background: none; border: none;
    padding: 0; text-decoration: underline; text-underline-offset: 2px;
  }
  .cl-link:hover { color: var(--text); }
  .footer {
    flex: none; width: 100%;
    display: flex; gap: 10px; justify-content: flex-end;
    padding: 16px 0 22px;
    border-top: 1px solid color-mix(in srgb, var(--text) 8%, transparent);
    margin-top: 10px;
    background: linear-gradient(180deg, transparent, var(--bg) 70%);
  }
  .cl-btn {
    -webkit-app-region: no-drag; cursor: pointer;
    padding: 9px 18px; border-radius: 9px; font-size: 13px; font-weight: 600;
    border: 1px solid transparent;
    transition: background .15s ease, border-color .15s ease, transform .1s ease;
  }
  .cl-btn:active { transform: translateY(1px); }
  .cl-btn--primary {
    color: var(--bg);
    background: linear-gradient(145deg, var(--accent), color-mix(in srgb, var(--accent) 72%, var(--primary)));
  }
  .cl-btn--primary:hover { filter: brightness(1.07); }
  .cl-btn--secondary {
    color: var(--text);
    background: color-mix(in srgb, var(--text) 7%, transparent);
    border-color: color-mix(in srgb, var(--text) 12%, transparent);
  }
  .cl-btn--secondary:hover { background: color-mix(in srgb, var(--text) 12%, transparent); }
  /* "Skip this version" -- a quiet text button pushed to the LEFT edge of the
     footer (margin-right:auto), visually distinct from the [Later][Restart]
     pair so it reads as a separate, less-prominent choice. */
  .cl-btn--skip {
    margin-right: auto; background: none; border-color: transparent;
    color: color-mix(in srgb, var(--text) 55%, transparent); font-weight: 500;
  }
  .cl-btn--skip:hover { color: var(--text); background: color-mix(in srgb, var(--text) 7%, transparent); }
</style>
</head>
<body>
  <div class="drag"></div>
  <button class="close" id="closeBtn" type="button" aria-label="Close">&times;</button>
  <main>
    ${logo}
    <h1>What's New</h1>
    <span class="cl-version-pill">${esc(info.version)}</span>
    <div class="cl-notes">${notes}</div>
    <div class="footer">${footerButtons(info.mode, info.showSkip)}</div>
  </main>
<script>
(function () {
  var b = window[${JSON.stringify(bridge)}] || {};
  document.querySelectorAll('[data-href]').forEach(function (el) {
    el.addEventListener('click', function () { if (b.openExternal) b.openExternal(el.getAttribute('data-href')); });
  });
  document.querySelectorAll('[data-action]').forEach(function (el) {
    el.addEventListener('click', function () {
      var a = el.getAttribute('data-action');
      if (a === 'download' && b.download) b.download();
      else if (a === 'install' && b.install) b.install();
      else if (a === 'skip' && b.skip) b.skip();
      else if (b.close) b.close();
    });
  });
  var closeBtn = document.getElementById('closeBtn');
  if (closeBtn) closeBtn.addEventListener('click', function () { if (b.close) b.close(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'w')) {
      if (b.close) b.close();
    }
  });
})();
</script>
</body>
</html>`;
}

export type OpenChangelogOptions = {
  info: ChangelogInfo;
  /** Brand name -> IPC channel namespace (matches changelog-preload.ts). */
  brandName: string;
  /** Absolute path to the built changelog-preload.js. */
  preloadPath: string;
  /** Parent window (the card centers over it and stays on top of it). */
  parent?: BrowserWindow;
  /** app.getAppPath(): used in dev to re-read the logo + HMR-reload the open
   *  window when build/mascot.png is regenerated. */
  appPath?: string;
  /** Called when the user clicks Download (mode 'available'). Wire to
   *  autoUpdater.downloadUpdate() at the call site so this stays decoupled. */
  onDownload?: () => void;
  /** Called when the user clicks Restart & Update (mode 'downloaded'). Wire to
   *  autoUpdater.quitAndInstall() at the call site. */
  onInstall?: () => void;
  /** Called when the user clicks "Skip this version" (mode 'downloaded' +
   *  info.showSkip). Persist the skipped version at the call site so this stays
   *  decoupled from the prefs store. The window closes itself after firing. */
  onSkip?: () => void;
};

let changelogWindow: BrowserWindow | null = null;
let changelogWatcher: FSWatcher | null = null;
let ipcWired = false;
// The action callbacks live on a module-level handle so the IPC handlers (wired
// once) always reach the CURRENT open window's callbacks, even across reopens
// with a different mode.
let actions: { onDownload?: () => void; onInstall?: () => void; onSkip?: () => void } = {};

/** (Re)render the changelog HTML into the window, re-reading the logo so a
 *  regenerated mascot is picked up on dev HMR. */
function renderChangelog(win: BrowserWindow, opts: OpenChangelogOptions): void {
  const logoDataUri = opts.appPath ? readLogoDataUri(opts.appPath) : opts.info.logoDataUri;
  const html = buildChangelogHtml({ ...opts.info, logoDataUri });
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

/** Open (or focus, if already open) the "What's New" window. */
export function openChangelogWindow(opts: OpenChangelogOptions): BrowserWindow {
  // Keep the current window's action callbacks reachable by the wired-once IPC.
  actions = { onDownload: opts.onDownload, onInstall: opts.onInstall, onSkip: opts.onSkip };

  if (changelogWindow && !changelogWindow.isDestroyed()) {
    changelogWindow.show();
    changelogWindow.focus();
    return changelogWindow;
  }

  wireChangelogIpc(opts.brandName);

  const win = new BrowserWindow({
    width: 460,
    height: 600,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    show: false,
    title: `What's New in ${opts.info.displayName}`,
    backgroundColor: opts.info.colors.darkBg,
    parent: opts.parent,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // sandbox MUST be false: changelog-preload.js does `require('./brand')`
      // to namespace its IPC channels, and a sandboxed preload can only require
      // 'electron' -- so under sandbox:true the preload throws on load, the
      // contextBridge never runs, and the bridge global is undefined, silently
      // breaking the buttons, Esc and the links. The renderer is still locked
      // down by contextIsolation + nodeIntegration:false.
      sandbox: false,
      preload: opts.preloadPath,
    },
  });
  changelogWindow = win;

  // The page is trusted-shell/untrusted-notes, but defence-in-depth: never let
  // it navigate or spawn windows. External links go through the bridge -> shell.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  // Close on Esc / Cmd-W / Ctrl-W from the MAIN process, independent of the
  // renderer bridge -- so the window always closes even if the page script
  // didn't wire up (the bridge button is the in-page path).
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') {
      return;
    }
    const isClose =
      input.key === 'Escape' || ((input.meta || input.control) && input.key.toLowerCase() === 'w');
    if (isClose) {
      event.preventDefault();
      if (!win.isDestroyed()) {
        win.close();
      }
    }
  });

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });
  win.on('closed', () => {
    if (changelogWindow === win) {
      changelogWindow = null;
    }
    changelogWatcher?.close();
    changelogWatcher = null;
  });

  renderChangelog(win, opts);

  // Dev-only HMR: reload the open window when build/mascot.png is regenerated.
  // No-op when packaged or when appPath wasn't supplied.
  if (!app.isPackaged && opts.appPath) {
    try {
      changelogWatcher = watch(join(opts.appPath, 'build'), (_event, file) => {
        if (file === 'mascot.png' && changelogWindow && !changelogWindow.isDestroyed()) {
          renderChangelog(changelogWindow, opts);
        }
      });
    } catch {
      /* dev convenience; ignore */
    }
  }
  return win;
}

/** Register the changelog IPC channels once. Idempotent across repeated opens.
 *  The download / install handlers call into the module-level `actions` so the
 *  current window's caller-supplied callbacks fire (autoUpdater stays at the
 *  call site). */
function wireChangelogIpc(brandName: string): void {
  if (ipcWired) {
    return;
  }
  ipcWired = true;
  ipcMain.on(`${brandName}:changelog:open-external`, (e, url: unknown) => {
    if (!isFromChangelogWindow(e.sender)) {
      return;
    }
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
    }
  });
  ipcMain.on(`${brandName}:changelog:download`, (e) => {
    if (!isFromChangelogWindow(e.sender)) {
      return;
    }
    actions.onDownload?.();
  });
  ipcMain.on(`${brandName}:changelog:install`, (e) => {
    if (!isFromChangelogWindow(e.sender)) {
      return;
    }
    actions.onInstall?.();
  });
  // "Skip this version": persist the skip at the call site (onSkip) then close
  // the window -- the page only fires skip(), so main owns the close here.
  ipcMain.on(`${brandName}:changelog:skip`, (e) => {
    if (!isFromChangelogWindow(e.sender)) {
      return;
    }
    actions.onSkip?.();
    BrowserWindow.fromWebContents(e.sender)?.close();
  });
  ipcMain.on(`${brandName}:changelog:close`, (e) => {
    if (!isFromChangelogWindow(e.sender)) {
      return;
    }
    BrowserWindow.fromWebContents(e.sender)?.close();
  });
}

/** True only when `sender` is the changelog window's own webContents. The card
 *  loads a data: URL (opaque/null origin), so an origin-based check would reject
 *  it -- the correct validation for this trusted, main-controlled data: doc is
 *  identity: the message must come from the window WE created. Exported for
 *  unit testing. */
export function isFromChangelogWindow(sender: Electron.WebContents | undefined): boolean {
  return (
    !!sender &&
    !!changelogWindow &&
    !changelogWindow.isDestroyed() &&
    changelogWindow.webContents === sender
  );
}

/** Read the BARE mascot (build/mascot.png, no squircle) as a data: URI for the
 *  card logo, or undefined if absent. Mirrors about-window.ts. */
export function readLogoDataUri(appPath: string): string | undefined {
  try {
    const png = readFileSync(join(appPath, 'build', 'mascot.png'));
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return undefined;
  }
}
