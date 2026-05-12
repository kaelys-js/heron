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
 */
const config = {
  appId: 'com.resistjs.careerops',
  appName: 'career-ops',
  webDir: 'build/static',
  ios: {
    scheme: 'careerops',
    contentInset: 'always',
    limitsNavigationsToAppBoundDomains: false,
  },
  electron: {
    customUrlScheme: 'careerops',
    trayIconAndMenuEnabled: true,
    deepLinkingEnabled: true,
    splashScreenEnabled: true,
  },
  server: {
    cleartext: true,
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
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
  },
} satisfies CapacitorConfig & Record<string, unknown>;

export default config;
