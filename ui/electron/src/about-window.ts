/** The desktop "About <brand>" window.
 *
 *  A small, frameless, brand-themed BrowserWindow opened from the app menu's
 *  About item (replacing the bare dialog.showMessageBox). The HTML builder is
 *  pure (no electron import) so it's unit-testable; openAboutWindow owns the
 *  BrowserWindow lifecycle, single-instance behaviour, and the IPC bridge used
 *  by the page's buttons (open external links, copy version info, close).
 *
 *  Security: the About renderer is static, trusted, locally-generated HTML. It
 *  runs with nodeIntegration:false, contextIsolation:true and sandbox:true; the
 *  only capabilities it gets are the three namespaced channels exposed by
 *  about-preload.ts. External links never navigate the window -- they're handed
 *  to shell.openExternal (https only) in the main process. */
import { BrowserWindow, ipcMain, shell, clipboard, app } from 'electron';
import { join } from 'node:path';
import { readFileSync, watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';

export type AboutColors = {
  accent: string;
  primary: string;
  darkBg: string;
  darkSurface: string;
  textOnDark: string;
};

export type AboutLink = { label: string; url: string };

export type AboutInfo = {
  displayName: string;
  tagline: string;
  description: string;
  /** App version (app.getVersion()). */
  version: string;
  /** Runtime versions for the bug-report-friendly detail block. */
  versions: { electron: string; chromium: string; node: string };
  /** Short git SHA of the build (BUILD_INFO.commit). Omitted from the buildmeta
   *  line + the copy payload when absent. */
  commit?: string;
  /** ISO build timestamp (BUILD_INFO.buildDate). Rendered as the date portion. */
  buildDate?: string;
  /** The user's RUNTIME update channel ('stable' | 'beta' | 'dev') -- what updates
   *  they actually receive (from update-prefs). Shown in the buildmeta line + copy
   *  payload. This is NOT the build-origin stamp: every production build is promoted
   *  from a beta cut WITHOUT a rebuild, so its origin is 'beta' even on the stable
   *  channel -- that goes in `buildChannel`. */
  channel?: string;
  /** Build-origin channel (BUILD_INFO.channel: how the binary was cut). Surfaced in
   *  the copy diagnostics as "Built as ..." ONLY when it differs from the runtime
   *  `channel`, so support can tell a promoted-from-beta build apart. */
  buildChannel?: string;
  /** `${process.platform}/${process.arch}` -- shown as a Platform runtime cell
   *  and in the copy payload. */
  platformArch?: string;
  /** Current version's raw-markdown CHANGELOG section. When present a "What's New"
   *  button is rendered that posts the about:whats-new IPC. */
  releaseNotes?: string;
  copyright: string;
  /** Buttons rendered in the link row (Website / GitHub / Report a bug / License). */
  links: AboutLink[];
  colors: AboutColors;
  /** data: URI for the logo, or undefined to render the wordmark only. */
  logoDataUri?: string;
  /** Backend URL shown subtly in the footer (helps debugging in dev). */
  backendUrl?: string;
  /** Global the preload exposes; the page wires its buttons to it. */
  bridge?: string;
  /** Put the close button on the LEFT (macOS window-control convention).
   *  Defaults to the right (Windows/Linux). */
  closeOnLeft?: boolean;
};

const DEFAULT_BRIDGE = '__aboutBridge__';

/** Escape a string for safe interpolation into HTML text or a double-quoted
 *  attribute. Brand values are trusted, but escaping keeps the builder honest
 *  (and testable) and means a future user-supplied field can't break out. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Render the full self-contained About document (loaded as a data: URL). */
export function buildAboutHtml(info: AboutInfo): string {
  const c = info.colors;
  const bridge = info.bridge ?? DEFAULT_BRIDGE;
  // macOS puts window controls on the left; Windows/Linux on the right.
  const closeSide = info.closeOnLeft ? 'left: 14px' : 'right: 14px';
  // Inset the draggable title strip on the close-button side so it NEVER overlaps
  // the button. An overlapping `-webkit-app-region: drag` region eats clicks --
  // mousedown starts a window-drag instead of registering the click, which is the
  // "close button only works ~10% of the time" bug. Dragging the rest of the
  // strip still moves the window.
  const dragSides = info.closeOnLeft ? 'left: 54px; right: 0' : 'left: 0; right: 54px';
  // The build date in the meta line is the calendar day only (the full ISO
  // timestamp goes in the copy payload for support). Guard a malformed value.
  const buildDay = info.buildDate ? info.buildDate.slice(0, 10) : '';
  // Compact build-provenance line under the version pill:
  // "v{version} · {commit} · {date} · {channel}", omitting any missing part.
  const buildMetaParts = [
    `v${info.version}`,
    info.commit ? info.commit : '',
    buildDay,
    info.channel ? info.channel : '',
  ].filter(Boolean);
  const buildMetaLine =
    buildMetaParts.length > 1
      ? `<div class="buildmeta">${esc(buildMetaParts.join(' · '))}</div>`
      : '';

  const copyText = [
    `${info.displayName} ${info.version}`,
    info.commit ? `Commit ${info.commit}` : '',
    info.buildDate ? `Build ${info.buildDate}` : '',
    info.channel ? `Channel ${info.channel}` : '',
    info.buildChannel && info.buildChannel !== info.channel ? `Built as ${info.buildChannel}` : '',
    `Electron ${info.versions.electron}`,
    `Chromium ${info.versions.chromium}`,
    `Node ${info.versions.node}`,
    info.platformArch ? `Platform ${info.platformArch}` : '',
    info.backendUrl ? `Backend ${info.backendUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const logo = info.logoDataUri
    ? `<img class="logo logo--img" src="${esc(info.logoDataUri)}" alt="${esc(info.displayName)} logo" draggable="false" />`
    : `<div class="logo logo--text" aria-hidden="true">${esc(info.displayName.slice(0, 1))}</div>`;

  const linkButtons = info.links
    .map(
      (l) =>
        `<button class="link" type="button" data-href="${esc(l.url)}">${esc(l.label)}</button>`,
    )
    .join('');

  // "What's New" opens the changelog window with the current version's notes.
  // Rendered only when releaseNotes are present (a build without a CHANGELOG
  // section shouldn't show an empty card button). data-whatsnew is read by the
  // inline IIFE and routed to the bridge.
  const whatsNewButton = info.releaseNotes?.trim()
    ? `<button class="link" type="button" data-whatsnew="1">What's New</button>`
    : '';

  const backendLine = info.backendUrl
    ? `<div class="backend">Backend · ${esc(info.backendUrl)}</div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<!-- In-document CSP for this data: URL. The page is fully self-contained:
     inline <style> + an inline IIFE (needs script-src 'unsafe-inline'), a
     data: logo image, no network, no plugins, no framing. Locks the doc to
     exactly that so an injected <script src>/<object>/<iframe> can't load. -->
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" />
<title>About ${esc(info.displayName)}</title>
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
    /* z-index keeps the button above <main> (which is height:100% and runs a
       transform animation that would otherwise paint over it and swallow the
       click -- the "close works ~10% of the time" bug). */
    z-index: 20;
    border: none; border-radius: 50%; cursor: pointer;
    background: color-mix(in srgb, var(--text) 8%, transparent);
    color: var(--text); font-size: 15px; line-height: 26px;
    -webkit-app-region: no-drag; transition: background .15s ease;
  }
  .close:hover { background: color-mix(in srgb, var(--text) 18%, transparent); }
  main {
    height: 100%;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; padding: 40px 34px 26px; gap: 4px;
    animation: rise .35s ease both;
  }
  @keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .logo { width: 78px; height: 78px; margin-bottom: 14px; }
  /* The bare mascot has NO tile/border -- just a soft drop-shadow + accent glow
     to lift it off the dark background (mirrors the login / splash mascot). */
  .logo--img {
    object-fit: contain;
    filter: drop-shadow(0 8px 22px rgba(0,0,0,.5))
      drop-shadow(0 0 16px color-mix(in srgb, var(--accent) 28%, transparent));
  }
  /* The monogram fallback keeps the rounded gradient tile. */
  .logo--text {
    border-radius: 19px;
    box-shadow: 0 10px 30px rgba(0,0,0,.45), 0 0 0 1px color-mix(in srgb, var(--text) 8%, transparent);
    display: grid; place-items: center; font-size: 38px; font-weight: 700;
    color: var(--bg); background: linear-gradient(145deg, var(--accent), var(--primary));
  }
  h1 { font-size: 24px; font-weight: 650; letter-spacing: -.01em; }
  .tagline { color: var(--accent); font-size: 13.5px; font-style: italic; margin-top: 2px; }
  .version {
    display: inline-block; margin-top: 12px; padding: 4px 11px; border-radius: 999px;
    font: 600 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 32%, transparent);
  }
  .buildmeta {
    margin-top: 7px;
    font: 10.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
    color: color-mix(in srgb, var(--text) 46%, transparent);
  }
  .desc {
    margin-top: 16px; max-width: 360px; font-size: 12.5px; line-height: 1.55;
    color: color-mix(in srgb, var(--text) 72%, transparent);
  }
  .runtimes {
    margin-top: 16px; display: flex; gap: 18px; font-size: 11px;
    color: color-mix(in srgb, var(--text) 56%, transparent);
  }
  .runtimes b { display: block; font-size: 12px; font-weight: 600; color: color-mix(in srgb, var(--text) 84%, transparent); margin-top: 2px; }
  .links { margin-top: 22px; display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
  .link {
    -webkit-app-region: no-drag; cursor: pointer;
    padding: 7px 14px; border-radius: 9px; font-size: 12.5px; font-weight: 550;
    color: var(--text);
    background: color-mix(in srgb, var(--text) 7%, transparent);
    border: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
    transition: background .15s ease, border-color .15s ease, transform .1s ease;
  }
  .link:hover { background: color-mix(in srgb, var(--accent) 18%, transparent); border-color: color-mix(in srgb, var(--accent) 40%, transparent); }
  .link:active { transform: translateY(1px); }
  .footer { margin-top: auto; padding-top: 22px; display: flex; flex-direction: column; gap: 7px; align-items: center; }
  .copy {
    -webkit-app-region: no-drag; cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px; border-radius: 8px;
    font-size: 12px; font-weight: 550; line-height: 1;
    color: color-mix(in srgb, var(--text) 66%, transparent);
    background: color-mix(in srgb, var(--text) 6%, transparent);
    border: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
    transition: color .18s ease, background .18s ease, border-color .18s ease,
      transform .2s cubic-bezier(.16,1,.3,1);
  }
  .copy:hover { color: var(--text); background: color-mix(in srgb, var(--text) 11%, transparent); }
  .copy:active { transform: scale(.97); }
  .copy.copied {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    border-color: color-mix(in srgb, var(--accent) 36%, transparent);
    transform: scale(1.05);
  }
  .copy svg { width: 13px; height: 13px; }
  .copy .ic-check { display: none; }
  .copy.copied .ic-copy { display: none; }
  .copy.copied .ic-check { display: inline; animation: pop .25s cubic-bezier(.16,1,.3,1); }
  @keyframes pop { from { transform: scale(.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  .copyright { font-size: 10.5px; line-height: 1.5; max-width: 360px; color: color-mix(in srgb, var(--text) 44%, transparent); }
  .backend { font: 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; color: color-mix(in srgb, var(--text) 36%, transparent); }
</style>
</head>
<body>
  <div class="drag"></div>
  <button class="close" id="closeBtn" type="button" aria-label="Close">&times;</button>
  <main>
    ${logo}
    <h1>${esc(info.displayName)}</h1>
    <div class="tagline">${esc(info.tagline)}</div>
    <span class="version">${esc(info.version)}</span>
    ${buildMetaLine}
    <p class="desc">${esc(info.description)}</p>
    <div class="runtimes">
      <span>Electron<b>${esc(info.versions.electron)}</b></span>
      <span>Chromium<b>${esc(info.versions.chromium)}</b></span>
      <span>Node<b>${esc(info.versions.node)}</b></span>
      ${info.platformArch ? `<span>Platform<b>${esc(info.platformArch)}</b></span>` : ''}
    </div>
    <div class="links">${linkButtons}${whatsNewButton}</div>
    <div class="footer">
      <button class="copy" id="copyBtn" type="button" data-copy="${esc(copyText)}">
        <svg class="ic-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <svg class="ic-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
        <span id="copyLabel">Copy diagnostics</span>
      </button>
      ${backendLine}
      <div class="copyright">${esc(info.copyright)}</div>
    </div>
  </main>
<script>
(function () {
  var b = window[${JSON.stringify(bridge)}] || {};
  document.querySelectorAll('[data-href]').forEach(function (el) {
    el.addEventListener('click', function () { if (b.openExternal) b.openExternal(el.getAttribute('data-href')); });
  });
  document.querySelectorAll('[data-whatsnew]').forEach(function (el) {
    el.addEventListener('click', function () { if (b.whatsNew) b.whatsNew(); });
  });
  var copyBtn = document.getElementById('copyBtn');
  var copyLabel = document.getElementById('copyLabel');
  var copyTimer = null;
  if (copyBtn) copyBtn.addEventListener('click', function () {
    if (b.copy) b.copy(copyBtn.getAttribute('data-copy'));
    copyBtn.classList.add('copied');
    if (copyLabel) copyLabel.textContent = 'Copied';
    clearTimeout(copyTimer);
    copyTimer = setTimeout(function () {
      copyBtn.classList.remove('copied');
      if (copyLabel) copyLabel.textContent = 'Copy diagnostics';
    }, 1500);
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

export type OpenAboutOptions = {
  info: AboutInfo;
  /** Brand name -> IPC channel namespace (matches about-preload.ts). */
  brandName: string;
  /** Absolute path to the built about-preload.js. */
  preloadPath: string;
  /** Parent window (the About window centers over it and stays on top of it). */
  parent?: BrowserWindow;
  /** app.getAppPath(): used in dev to re-read the logo + HMR-reload the open
   *  window when build/mascot.png is regenerated. */
  appPath?: string;
  /** Called when the user clicks "What's New". Wire to openChangelogWindow({
   *  mode:'current', ... }) at the call site so this module stays decoupled from
   *  changelog-window + electron-updater. */
  onWhatsNew?: () => void;
};

let aboutWindow: BrowserWindow | null = null;
let aboutWatcher: FSWatcher | null = null;
let ipcWired = false;
// The action callback lives on a module-level handle so the IPC handler (wired
// once) always reaches the CURRENT open window's callback, even across reopens
// -- mirrors changelog-window.ts's `actions` pattern.
let actions: { onWhatsNew?: () => void } = {};

/** (Re)render the About HTML into the window, re-reading the logo so a
 *  regenerated mascot is picked up on dev HMR. */
function renderAbout(win: BrowserWindow, opts: OpenAboutOptions): void {
  const logoDataUri = opts.appPath ? readLogoDataUri(opts.appPath) : opts.info.logoDataUri;
  const html = buildAboutHtml({ ...opts.info, logoDataUri });
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

/** Open (or focus, if already open) the About window. */
export function openAboutWindow(opts: OpenAboutOptions): BrowserWindow {
  // Keep the current window's action callback reachable by the wired-once IPC.
  actions = { onWhatsNew: opts.onWhatsNew };

  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.show();
    aboutWindow.focus();
    return aboutWindow;
  }

  wireAboutIpc(opts.brandName);

  const win = new BrowserWindow({
    width: 460,
    height: 624,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    show: false,
    title: `About ${opts.info.displayName}`,
    backgroundColor: opts.info.colors.darkBg,
    parent: opts.parent,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // sandbox:true -- the strongest renderer lockdown Electron offers. The
      // preload no longer `require('./brand')` (a sandboxed preload can only
      // require 'electron'); it reads the brand name from the additionalArguments
      // below via process.argv instead, so the IPC namespace stays correct
      // without a relative require. The About page is static, locally-generated
      // HTML -- it never needs Node.
      sandbox: true,
      // The brand name is the IPC channel namespace; the sandboxed preload reads
      // it from process.argv (apply-brand remains the single source -- we just
      // forward BRAND.name through here rather than importing brand.ts).
      additionalArguments: [`--brand-name=${opts.brandName}`],
      // No <webview>, no insecure-content upgrades. Defence-in-depth on a window
      // that only ever shows trusted local HTML.
      webviewTag: false,
      allowRunningInsecureContent: false,
      preload: opts.preloadPath,
    },
  });
  aboutWindow = win;

  // The page is trusted/static, but defence-in-depth: never let it navigate or
  // spawn windows. All external links go through the bridge -> shell.
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
    if (aboutWindow === win) {
      aboutWindow = null;
    }
    aboutWatcher?.close();
    aboutWatcher = null;
  });

  renderAbout(win, opts);

  // Dev-only HMR: reload the open About window when build/mascot.png is
  // regenerated (vite HMR only reloads the WebView, never this main-process
  // window). No-op when packaged or when appPath wasn't supplied.
  if (!app.isPackaged && opts.appPath) {
    try {
      aboutWatcher = watch(join(opts.appPath, 'build'), (_event, file) => {
        if (file === 'mascot.png' && aboutWindow && !aboutWindow.isDestroyed()) {
          renderAbout(aboutWindow, opts);
        }
      });
    } catch {
      /* dev convenience; ignore */
    }
  }
  return win;
}

/** True only when `sender` is the About window's own webContents. The About
 *  page loads a data: URL (opaque/null origin), so an origin-based sender check
 *  would reject it -- the correct validation for this trusted, main-controlled
 *  data: doc is identity: the message must come from the window WE created. A
 *  message from any other frame (the main renderer, an injected one) is refused.
 *  Exported for unit testing. */
export function isFromAboutWindow(sender: Electron.WebContents | undefined): boolean {
  return (
    !!sender && !!aboutWindow && !aboutWindow.isDestroyed() && aboutWindow.webContents === sender
  );
}

/** Register the About IPC channels once. Idempotent across repeated opens. */
function wireAboutIpc(brandName: string): void {
  if (ipcWired) {
    return;
  }
  ipcWired = true;
  ipcMain.on(`${brandName}:about:open-external`, (e, url: unknown) => {
    if (!isFromAboutWindow(e.sender)) {
      return;
    }
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
    }
  });
  ipcMain.on(`${brandName}:about:copy`, (e, text: unknown) => {
    if (!isFromAboutWindow(e.sender)) {
      return;
    }
    if (typeof text === 'string') {
      clipboard.writeText(text);
    }
  });
  ipcMain.on(`${brandName}:about:close`, (e) => {
    if (!isFromAboutWindow(e.sender)) {
      return;
    }
    BrowserWindow.fromWebContents(e.sender)?.close();
  });
  ipcMain.on(`${brandName}:about:whats-new`, (e) => {
    if (!isFromAboutWindow(e.sender)) {
      return;
    }
    actions.onWhatsNew?.();
  });
}

/** Read the BARE mascot (build/mascot.png, no squircle) as a data: URI for the
 *  About logo, or undefined if absent. */
export function readLogoDataUri(appPath: string): string | undefined {
  try {
    const png = readFileSync(join(appPath, 'build', 'mascot.png'));
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return undefined;
  }
}
