import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor config — career-ops native apps.
 *
 * Single SvelteKit codebase wraps as macOS/Win/Linux desktop via
 * @capacitor-community/electron AND iOS via @capacitor/ios. Backend is
 * resolved at runtime (not at build) by lib/client/backend-discovery.ts:
 * embedded → dev server → mDNS LAN → Tailscale → remote.
 *
 * The webDir is the SvelteKit *static* build output (adapter-static),
 * which Capacitor copies into platform-specific public dirs at sync time.
 * The actual API server runs separately (embedded on desktop, remote on
 * iOS) — Capacitor never serves the API itself.
 *
 * Hostname / scheme:
 *   • iOS WebView: `capacitor://localhost` (default). Same-origin for
 *     auth cookies — Better Auth's secure-cookie path works.
 *   • Android WebView: `https://localhost` so cookies + service workers
 *     follow the same security model as iOS.
 *   • External nav: blocked by `limitsNavigationsToAppBoundDomains` on
 *     iOS (Capacitor 8+ honors Apple's WK_APP_BOUND_DOMAINS Info.plist
 *     when this flag is true). External links go through the Browser
 *     plugin → SFSafariViewController.
 */
const config = {
  appId: 'com.heron.app',
  appName: 'Heron',
  webDir: 'build/static',
  /** Append a marker so the dashboard server can tell native vs web
   *  hits apart in logs. {VERSION} is replaced at build time by
   *  apply-brand. */
  appendUserAgent: 'heron/native',
  /** Backgrounds the WebView shows before the first paint. Matches the
   *  dark-mode theme so users don't see a white flash. */
  backgroundColor: '#0a0a0b',
  ios: {
    // Custom URL scheme — matches CFBundleURLTypes in Info.plist so the
    // WebView origin and deep-link scheme are the same. Default of
    // `capacitor` would split origins and require the deep-link handler
    // to bounce through `capacitor://localhost?deep=...`, adding latency.
    scheme: 'heron',
    contentInset: 'always',
    /** When true (Capacitor 8 default), the WebView refuses to navigate
     *  to domains not listed in Info.plist's WKAppBoundDomains.
     *  WE EXPLICITLY DISABLE THIS: setting it true without a populated
     *  WKAppBoundDomains array causes WebKit on iOS 26.4 to retry-loop
     *  every blocked navigation, producing a constant white/dark flash
     *  in the WebView (~12 reloads/sec, never paints the SvelteKit UI).
     *  If we want to re-enable defence-in-depth XSS-exfil protection
     *  later, we need to add WKAppBoundDomains to ui/ios/App/App/Info.plist
     *  via apply-brand.mjs first. */
    limitsNavigationsToAppBoundDomains: false,
    /** Allow the WebView's keyboard to behave like a native UITextField
     *  (auto-scroll on focus, predictive text bar). */
    preferredContentMode: 'mobile',
    /** Debug Inspector only in development builds — disable in CI. */
    webContentsDebuggingEnabled: true,
    /** Hide the legacy iOS swipe-back from the WebView since we have
     *  our own router-driven back button. */
    backgroundColor: '#0a0a0b',
  },
  android: {
    /** Match iOS: WebView lives at https://localhost. Cookies share the
     *  same SameSite + Secure semantics. Capacitor 5+ default. */
    allowMixedContent: false,
    captureInput: true,
    /** Disable webContentsDebuggingEnabled by default — only set true
     *  in debug builds. The CI build override toggles this. */
    webContentsDebuggingEnabled: false,
    /** Backgrounds the WebView shows before the first paint. */
    backgroundColor: '#0a0a0b',
  },
  electron: {
    customUrlScheme: 'heron',
    trayIconAndMenuEnabled: true,
    deepLinkingEnabled: true,
    splashScreenEnabled: true,
  },
  server: {
    /**
     * Live-reload mode — when scripts/native/dev-ios.mjs is run with
     * `--live`, CAPACITOR_SERVER_URL is set to `http://<lan-ip>:5173` and
     * passed through to `cap sync`. Capacitor writes it into the synced
     * `capacitor.config.json`, so the WebView loads from Vite directly
     * (true HMR on simulator + real device).
     *
     * PRODUCTION BUILDS MUST NEVER SET THIS. `pnpm build:ios` runs without
     * the env var, the `url` key is absent, and the WebView falls back to
     * the bundled static `App.app/public/index.html` as Capacitor intends.
     */
    ...(process.env.CAPACITOR_SERVER_URL ? { url: process.env.CAPACITOR_SERVER_URL } : {}),
    /** http://localhost is allowed for the LAN-discovery and embedded
     *  server case. Production deployments behind Tailscale magic-DNS
     *  use https:// automatically. */
    cleartext: true,
    /** Android WebView scheme: `https` matches iOS's `capacitor://`
     *  same-origin behaviour for cookies + service workers.
     *  Default in Capacitor 5+ is already `https`; explicit so future
     *  defaults can't surprise us. */
    androidScheme: 'https',
    /** iOS WebView scheme — `careerops` so WebView origin matches the
     *  custom URL scheme used by deep links (CFBundleURLTypes in
     *  Info.plist). Keeps everything same-origin.
     *
     * IMPORTANT — In live-reload mode the WebView origin becomes the
     * server.url's scheme (http://lan-ip), so we drop iosScheme here. If
     * we kept `careerops`, Capacitor's URLSchemeHandler intercepts navigation
     * requests for that scheme and the WebView never paints anything from
     * the dev server. Production builds (no env var) keep careerops:// so
     * deep-link return-paths work same-origin. */
    ...(process.env.CAPACITOR_SERVER_URL ? {} : { iosScheme: 'careerops' }),
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_career_ops',
      iconColor: '#5b6cff',
      sound: 'default',
    },
    SplashScreen: {
      // 3500ms gives slow first-paint hydration (cold launch on iOS, large
      // app bundle) time to render before the splash auto-hides. Fast
      // paths still trigger SplashScreen.hide() from +layout.svelte's
      // onMount as soon as the SvelteKit shell is on screen; whichever
      // fires first wins.
      launchShowDuration: 3500,
      backgroundColor: '#0a0a0b',
      showSpinner: false,
      /** Capacitor 5+ uses `androidScaleType` instead of the deprecated
       *  `androidSplashResourceName`. CENTER fills the view but
       *  preserves aspect ratio. */
      androidScaleType: 'CENTER',
      androidSpinnerStyle: 'large',
      iosSpinnerStyle: 'small',
      splashFullScreen: true,
      splashImmersive: true,
      /** Auto-hide after `launchShowDuration` ms so the splash never
       *  outlives the WebView's first paint, even if the
       *  @capacitor/splash-screen native plugin isn't bridged (SPM-built
       *  Capacitor 7+ projects sometimes miss the Embed Frameworks step
       *  so plugin calls like SplashScreen.hide() silently no-op). The
       *  SvelteKit root layout still calls SplashScreen.hide() on
       *  hydration as a belt-and-braces — whichever fires first wins. */
      launchAutoHide: true,
    },
    StatusBar: {
      /** Match the WebView's status-bar tint to the theme so the
       *  notch / cutout area never looks "off". `default` lets iOS pick
       *  contents based on the underlying view. */
      style: 'DEFAULT',
      backgroundColor: '#0a0a0b',
      overlaysWebView: true,
    },
    Keyboard: {
      /** Resize the WebView when the keyboard appears so input fields
       *  scroll into view without our JS having to compute heights. */
      resize: 'ionic',
      style: 'DARK',
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
} satisfies CapacitorConfig & Record<string, unknown>;

export default config;
