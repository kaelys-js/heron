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
  appId: 'com.resistjs.careerops',
  appName: 'career-ops',
  webDir: 'build/static',
  /** Append a marker so the dashboard server can tell native vs web
   *  hits apart in logs. {VERSION} is replaced at build time by
   *  apply-brand. */
  appendUserAgent: 'career-ops/native',
  /** Backgrounds the WebView shows before the first paint. Matches the
   *  dark-mode theme so users don't see a white flash. */
  backgroundColor: '#0a0a0b',
  ios: {
    // Custom URL scheme — matches CFBundleURLTypes in Info.plist so the
    // WebView origin and deep-link scheme are the same. Default of
    // `capacitor` would split origins and require the deep-link handler
    // to bounce through `capacitor://localhost?deep=...`, adding latency.
    scheme: 'careerops',
    contentInset: 'always',
    /** When true (Capacitor 8 default), the WebView refuses to navigate
     *  to domains not listed in Info.plist's WKAppBoundDomains. Our
     *  WebView only talks to localhost / Tailscale, so we keep this on
     *  for defence-in-depth against XSS-driven exfil to external sites. */
    limitsNavigationsToAppBoundDomains: true,
    /** Allow the WebView's keyboard to behave like a native UITextField
     *  (auto-scroll on focus, predictive text bar). */
    preferredContentMode: 'mobile',
    /** Debug Inspector only in development builds — disable in CI. */
    webContentsDebuggingEnabled: false,
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
    customUrlScheme: 'careerops',
    trayIconAndMenuEnabled: true,
    deepLinkingEnabled: true,
    splashScreenEnabled: true,
  },
  server: {
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
     *  Info.plist). Keeps everything same-origin. */
    iosScheme: 'careerops',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_career_ops',
      iconColor: '#5b6cff',
      sound: 'default',
    },
    SplashScreen: {
      launchShowDuration: 1500,
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
      /** Don't auto-hide; we call `SplashScreen.hide()` from the
       *  WebView once the dashboard finishes its first paint so users
       *  never see a blank state. */
      launchAutoHide: false,
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
