#!/usr/bin/env node
/**
 * apply-brand — propagate branding/brand.json into every config file.
 *
 * branding/brand.json is the single source of truth for:
 *   • App name, displayName, bundle ID, URL scheme, App Group
 *   • Color palette
 *   • Author + repo metadata
 *   • Permission usage descriptions
 *   • iOS extensions' bundle suffixes + deployment minimums
 *
 * This script reads brand.json and overwrites every consumer config
 * (Capacitor configs, electron-builder, Info.plist, entitlements, web
 * manifest, root + electron package.json, ios Appfile, Swift constants).
 * Run after editing brand.json — verifier checks consistency.
 *
 * Each consumer is its own function below. Adding a new consumer:
 *   1. Add a function `applyXxx(brand)`
 *   2. Call it from the main `apply()` at the bottom
 *   3. Add a check in verify-capacitor.mjs Phase 9
 *
 * Safe to re-run — idempotent. No-ops if the file already matches.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const UI = join(ROOT, 'ui');
const BRAND_JSON = join(ROOT, 'branding', 'brand.json');
const BRAND_LOGO = join(ROOT, 'branding', 'logo.svg');

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';

const log = {
  step: (n) => console.log(`\n${CYAN}▸${RESET} ${n}`),
  ok: (m) => console.log(`  ${GREEN}✓${RESET} ${m}`),
  skip: (m) => console.log(`  ${DIM}· ${m}${RESET}`),
  warn: (m) => console.log(`  ${YELLOW}!${RESET} ${m}`),
};

/** Load + validate brand.json. Throws if required fields are missing. */
function loadBrand() {
  if (!existsSync(BRAND_JSON)) throw new Error(`brand.json missing at ${BRAND_JSON}`);
  const brand = JSON.parse(readFileSync(BRAND_JSON, 'utf8'));
  const required = ['name', 'displayName', 'description', 'identifiers.bundleId', 'identifiers.urlScheme', 'identifiers.serviceType', 'colors.primary', 'author.email', 'repo.url'];
  for (const key of required) {
    const val = key.split('.').reduce((acc, k) => acc?.[k], brand);
    if (!val) throw new Error(`brand.json missing required field: ${key}`);
  }
  return brand;
}

/** Write file with a check: if content is identical, skip and return false. */
function writeIfChanged(path, content) {
  if (existsSync(path)) {
    const current = readFileSync(path, 'utf8');
    if (current === content) return false;
  }
  writeFileSync(path, content);
  return true;
}

/** Read JSON, apply patch, write back. Returns true if file changed. */
function patchJson(path, patcher) {
  const before = readFileSync(path, 'utf8');
  const json = JSON.parse(before);
  patcher(json);
  const after = JSON.stringify(json, null, 2) + '\n';
  if (before === after) return false;
  writeFileSync(path, after);
  return true;
}

// ───────────────────────────────────────────────────────────────────
// Per-consumer functions
// ───────────────────────────────────────────────────────────────────

function applyRootPackageJson(brand) {
  const path = join(ROOT, 'package.json');
  const changed = patchJson(path, (p) => {
    p.name = brand.name;
    p.description = brand.tagline;
    p.author = `${brand.author.name} <${brand.author.email}> (${brand.author.url})`;
    p.homepage = brand.homepageUrl ?? brand.repo.url;
    p.repository = { type: 'git', url: brand.repo.url };
    p.license = brand.license;
    p.keywords = brand.keywords;
  });
  changed ? log.ok(`package.json (root)`) : log.skip(`package.json (root) — already current`);
}

function applyElectronPackageJson(brand) {
  const path = join(UI, 'electron', 'package.json');
  if (!existsSync(path)) { log.skip(`electron/package.json — missing (run cap add electron first)`); return; }
  const changed = patchJson(path, (p) => {
    p.name = brand.name;
    p.description = `${brand.displayName} desktop — ${brand.tagline}`;
    p.author = { name: brand.author.name, email: brand.author.email };
    p.repository = { type: 'git', url: brand.repo.url };
    p.license = brand.license;
  });
  changed ? log.ok(`electron/package.json`) : log.skip(`electron/package.json — already current`);
}

function applyCapacitorConfig(brand, path) {
  if (!existsSync(path)) { log.skip(`${path} — missing`); return; }
  // The config is TypeScript with comments and types — surgically edit
  // the appId / appName / scheme / customUrlScheme via regex rather
  // than parse-and-reserialize.
  let body = readFileSync(path, 'utf8');
  const replacements = [
    [/appId:\s*['"][^'"]*['"]/, `appId: '${brand.identifiers.bundleId}'`],
    [/appName:\s*['"][^'"]*['"]/, `appName: '${brand.displayName}'`],
    [/scheme:\s*['"][^'"]*['"]/, `scheme: '${brand.identifiers.urlScheme}'`],
    [/customUrlScheme:\s*['"][^'"]*['"]/, `customUrlScheme: '${brand.identifiers.urlScheme}'`],
    [/iconColor:\s*['"][^'"]*['"]/, `iconColor: '${brand.colors.primary}'`],
    [/backgroundColor:\s*['"][^'"]*['"]/, `backgroundColor: '${brand.colors.darkBg}'`],
  ];
  let changed = false;
  for (const [re, val] of replacements) {
    const next = body.replace(re, val);
    if (next !== body) { body = next; changed = true; }
  }
  if (changed) writeFileSync(path, body);
  changed ? log.ok(path.replace(ROOT, '.')) : log.skip(`${path.replace(ROOT, '.')} — already current`);
}

function applyElectronBuilderConfig(brand) {
  const path = join(UI, 'electron', 'electron-builder.config.json');
  if (!existsSync(path)) { log.skip(`electron-builder.config.json — missing`); return; }
  const changed = patchJson(path, (cfg) => {
    cfg.appId = brand.identifiers.bundleId;
    cfg.productName = brand.displayName;
    cfg.copyright = brand.copyright;
    // Mac URL scheme registration
    if (cfg.mac?.extendInfo) {
      cfg.mac.extendInfo.CFBundleURLTypes = [{
        CFBundleURLName: brand.identifiers.urlScheme,
        CFBundleURLSchemes: [brand.identifiers.urlScheme],
      }];
      cfg.mac.extendInfo.NSLocalNetworkUsageDescription = brand.permissions.localNetworkUsage;
      cfg.mac.extendInfo.NSBonjourServices = [brand.identifiers.serviceType];
    }
    cfg.protocols = [{ name: brand.identifiers.urlScheme, schemes: [brand.identifiers.urlScheme] }];
    // Publish target
    if (Array.isArray(cfg.publish)) {
      for (const p of cfg.publish) {
        if (p.provider === 'github') {
          p.owner = brand.repo.owner;
          p.repo = brand.repo.name;
        }
      }
    }
  });
  changed ? log.ok(`electron-builder.config.json`) : log.skip(`electron-builder.config.json — already current`);
}

function applyIosInfoPlist(brand) {
  const path = join(UI, 'ios', 'App', 'App', 'Info.plist');
  if (!existsSync(path)) { log.skip(`Info.plist — missing (run cap add ios first)`); return; }
  let body = readFileSync(path, 'utf8');
  const subs = [
    // CFBundleDisplayName
    [
      /(<key>CFBundleDisplayName<\/key>\s*\n\s*<string>)[^<]*(<\/string>)/,
      `$1${brand.displayName}$2`,
    ],
    // CFBundleURLName under CFBundleURLTypes
    [
      /(<key>CFBundleURLName<\/key>\s*\n\s*<string>)[^<]*(<\/string>)/,
      `$1${brand.identifiers.bundleId}$2`,
    ],
    // CFBundleURLSchemes value (first item in array)
    [
      /(<key>CFBundleURLSchemes<\/key>\s*\n\s*<array>\s*\n\s*<string>)[^<]*(<\/string>)/,
      `$1${brand.identifiers.urlScheme}$2`,
    ],
    // NSLocalNetworkUsageDescription
    [
      /(<key>NSLocalNetworkUsageDescription<\/key>\s*\n\s*<string>)[^<]*(<\/string>)/,
      `$1${brand.permissions.localNetworkUsage}$2`,
    ],
    // NSFaceIDUsageDescription
    [
      /(<key>NSFaceIDUsageDescription<\/key>\s*\n\s*<string>)[^<]*(<\/string>)/,
      `$1${brand.permissions.faceIdUsage}$2`,
    ],
    // NSBonjourServices first item
    [
      /(<key>NSBonjourServices<\/key>\s*\n\s*<array>\s*\n\s*<string>)[^<]*(<\/string>)/,
      `$1${brand.identifiers.serviceType}$2`,
    ],
  ];
  let changed = false;
  for (const [re, val] of subs) {
    const next = body.replace(re, val);
    if (next !== body) { body = next; changed = true; }
  }
  // NSUserActivityTypes array — rebuild from brand.identifiers.userActivityTypes
  const uatPattern = /(<key>NSUserActivityTypes<\/key>\s*\n\s*<array>)([\s\S]*?)(<\/array>)/;
  if (uatPattern.test(body)) {
    const items = brand.identifiers.userActivityTypes
      .map((t) => `\n\t\t<string>${t}</string>`)
      .join('') + '\n\t';
    const next = body.replace(uatPattern, `$1${items}$3`);
    if (next !== body) { body = next; changed = true; }
  }
  if (changed) writeFileSync(path, body);
  changed ? log.ok(`Info.plist`) : log.skip(`Info.plist — already current`);
}

function applyFavicon(brand) {
  const dest = join(UI, 'static', 'favicon.svg');
  const src = BRAND_LOGO;
  if (!existsSync(src)) { log.warn(`logo.svg missing — skipping favicon copy`); return; }
  const srcContent = readFileSync(src, 'utf8');
  if (existsSync(dest) && readFileSync(dest, 'utf8') === srcContent) {
    log.skip(`static/favicon.svg — already current`);
    return;
  }
  copyFileSync(src, dest);
  log.ok(`static/favicon.svg ← branding/logo.svg`);
}

function applyAppHtml(brand) {
  // app.html runs an INLINE script before SvelteKit hydrates (theme
  // bootstrap to avoid light-mode flash). That script can't import TS
  // modules, so the brand-derived values are baked in at build time
  // here. Brand changes → re-run apply-brand → app.html updates.
  const path = join(UI, 'src', 'app.html');
  if (!existsSync(path)) { log.skip(`app.html — missing`); return; }
  let body = readFileSync(path, 'utf8');
  let changed = false;
  const subs = [
    // localStorage:<brand>:theme key — must match what theme.svelte.ts writes
    [/'[^']*:theme'/, `'${brand.name}:theme'`],
    // Mask icon color (Safari pinned-tab) — use the brand accent
    [/(rel="mask-icon"[^>]*color=")[^"]*(")/, `$1${brand.colors.accentEmeraldDark}$2`],
    // og:description
    [/(og:description"\s+content=")[^"]*(")/, `$1${brand.tagline}$2`],
  ];
  for (const [re, val] of subs) {
    const next = body.replace(re, val);
    if (next !== body) { body = next; changed = true; }
  }
  if (changed) writeFileSync(path, body);
  changed ? log.ok(`app.html`) : log.skip(`app.html — already current`);
}

function applyManifest(brand) {
  const path = join(UI, 'static', 'manifest.webmanifest');
  if (!existsSync(path)) { log.skip(`manifest.webmanifest — missing`); return; }
  const changed = patchJson(path, (m) => {
    m.name = brand.displayName;
    m.short_name = brand.shortName;
    m.description = brand.tagline;
    m.theme_color = brand.colors.primary;
    m.background_color = brand.colors.darkBg;
  });
  changed ? log.ok(`static/manifest.webmanifest`) : log.skip(`manifest.webmanifest — already current`);
}

function applyFastlaneAppfile(brand) {
  const path = join(UI, 'ios', 'App', 'fastlane', 'Appfile');
  if (!existsSync(path)) { log.skip(`Appfile — missing`); return; }
  let body = readFileSync(path, 'utf8');
  const next = body.replace(
    /app_identifier\("[^"]*"\)/,
    `app_identifier("${brand.identifiers.bundleId}")`
  );
  if (next !== body) { writeFileSync(path, next); log.ok(`Appfile`); }
  else log.skip(`Appfile — already current`);
}

function applyFastfile(brand) {
  const path = join(UI, 'ios', 'App', 'fastlane', 'Fastfile');
  if (!existsSync(path)) { log.skip(`Fastfile — missing`); return; }
  let body = readFileSync(path, 'utf8');
  const next = body.replace(
    /APP_IDENTIFIER\s*=\s*"[^"]*"/,
    `APP_IDENTIFIER = "${brand.identifiers.bundleId}"`
  );
  if (next !== body) { writeFileSync(path, next); log.ok(`Fastfile`); }
  else log.skip(`Fastfile — already current`);
}

function applyAddXcodeTargets(brand) {
  // Bake the bundle root + app group into the ruby script.
  const path = join(ROOT, 'scripts', 'native', 'add-xcode-targets.rb');
  if (!existsSync(path)) { log.skip(`add-xcode-targets.rb — missing`); return; }
  let body = readFileSync(path, 'utf8');
  let changed = false;
  const subs = [
    [/app_group\s*=\s*'[^']*'/, `app_group = '${brand.identifiers.appGroup}'`],
    [/bundle_root\s*=\s*'[^']*'/, `bundle_root = '${brand.identifiers.bundleId}'`],
  ];
  for (const [re, val] of subs) {
    const next = body.replace(re, val);
    if (next !== body) { body = next; changed = true; }
  }
  if (changed) writeFileSync(path, body);
  changed ? log.ok(`add-xcode-targets.rb`) : log.skip(`add-xcode-targets.rb — already current`);
}

function applyClientBrandTs(brand) {
  // Generated TS file that lib/client/* sources import. Single point
  // where the URL scheme / service type / app group live — change in
  // brand.json, run apply-brand, every consumer re-links at build time.
  const path = join(UI, 'src', 'lib', 'client', 'brand.ts');
  const body = [
    `// AUTO-GENERATED by scripts/native/apply-brand.mjs — do not edit.`,
    `// Edit branding/brand.json and run \`pnpm brand:apply\`.`,
    ``,
    `/**`,
    ` * Single source of truth for brand identifiers — read at runtime/build.`,
    ` * Web client, Capacitor iOS bundle, and Electron WebView all import`,
    ` * from this file so a brand rename touches one JSON file.`,
    ` */`,
    `export const BRAND = {`,
    `  name: ${JSON.stringify(brand.name)},`,
    `  displayName: ${JSON.stringify(brand.displayName)},`,
    `  tagline: ${JSON.stringify(brand.tagline)},`,
    `  bundleId: ${JSON.stringify(brand.identifiers.bundleId)},`,
    `  appGroup: ${JSON.stringify(brand.identifiers.appGroup)},`,
    `  urlScheme: ${JSON.stringify(brand.identifiers.urlScheme)},`,
    `  serviceType: ${JSON.stringify(brand.identifiers.serviceType)},`,
    `  mdnsType: ${JSON.stringify(brand.identifiers.mdnsType)},`,
    `  spotlightDomain: ${JSON.stringify(brand.identifiers.spotlightDomain)},`,
    `  keychainService: ${JSON.stringify(brand.identifiers.keychainService)},`,
    `  colors: ${JSON.stringify(brand.colors, null, 2).replace(/\n/g, '\n  ')},`,
    `  repo: ${JSON.stringify(brand.repo, null, 2).replace(/\n/g, '\n  ')},`,
    `} as const;`,
    ``,
    `/** Build a custom-scheme deep link for a job. */`,
    `export function jobDeepLink(jobId: string): string {`,
    `  return \`\${BRAND.urlScheme}://job/\${jobId}\`;`,
    `}`,
    ``,
    `/** Build a custom-scheme deep link for any in-app route. */`,
    `export function deepLink(route: string): string {`,
    `  return \`\${BRAND.urlScheme}://\${route.replace(/^\\//, '')}\`;`,
    `}`,
    ``,
    `/** Brand-namespaced DOM event names. Use these on both sides of`,
    ` * window.dispatchEvent + window.addEventListener — same source of`,
    ` * truth means a rename can never split the listener from the`,
    ` * dispatcher. */`,
    `export const BRAND_EVENTS = {`,
    `  openNotifications: \`\${BRAND.name}:open-notifications\`,`,
    `  notify: \`\${BRAND.name}:notify\`,`,
    `} as const;`,
    ``,
    `/** Brand-namespaced localStorage key prefix. Use as`,
    ` * \`\${BRAND_STORAGE_PREFIX}:my-key\` so user state for one`,
    ` * brand can't collide with another fork on the same machine. */`,
    `export const BRAND_STORAGE_PREFIX = BRAND.name;`,
    ``,
  ].join('\n');
  const changed = writeIfChanged(path, body);
  changed ? log.ok(`lib/client/brand.ts (generated)`) : log.skip(`lib/client/brand.ts — already current`);
}

function applyElectronBrandTs(brand) {
  // Same for the Electron main process. Imported by electron/src/index.ts,
  // mdns.ts, etc.
  const path = join(UI, 'electron', 'src', 'brand.ts');
  const body = [
    `// AUTO-GENERATED by scripts/native/apply-brand.mjs — do not edit.`,
    `// Edit branding/brand.json and run \`pnpm brand:apply\`.`,
    ``,
    `/** Brand constants for the Electron main process. */`,
    `export const BRAND = {`,
    `  name: ${JSON.stringify(brand.name)},`,
    `  displayName: ${JSON.stringify(brand.displayName)},`,
    `  bundleId: ${JSON.stringify(brand.identifiers.bundleId)},`,
    `  urlScheme: ${JSON.stringify(brand.identifiers.urlScheme)},`,
    `  serviceType: ${JSON.stringify(brand.identifiers.serviceType)},`,
    `  mdnsType: ${JSON.stringify(brand.identifiers.mdnsType)},`,
    `  repoUrl: ${JSON.stringify(brand.repo.url)},`,
    `  issuesUrl: ${JSON.stringify(brand.repo.issues)},`,
    `} as const;`,
    ``,
  ].join('\n');
  const changed = writeIfChanged(path, body);
  changed ? log.ok(`electron/src/brand.ts (generated)`) : log.skip(`electron/src/brand.ts — already current`);
}

function syncSharedSwift(brand) {
  // Files in ui/ios/App/App/ that need to exist in every extension target
  // too (because Xcode app-extension targets can't import from the host).
  // ErrorReporter.swift is the canonical example — same source, 4 copies.
  const sharedFiles = ['ErrorReporter.swift'];
  const targets = ['CareerOpsWidget', 'CareerOpsLiveActivity', 'CareerOpsShareExtension'];
  for (const f of sharedFiles) {
    const src = join(UI, 'ios', 'App', 'App', f);
    if (!existsSync(src)) continue;
    const srcContent = readFileSync(src, 'utf8');
    let copied = 0;
    for (const tgt of targets) {
      const tgtDir = join(UI, 'ios', 'App', tgt);
      if (!existsSync(tgtDir)) continue;
      const dst = join(tgtDir, f);
      if (writeIfChanged(dst, srcContent)) copied++;
    }
    if (copied > 0) log.ok(`synced ${f} → ${copied} extension target(s)`);
    else log.skip(`${f} — all extension copies current`);
  }
}

function applySwiftConstants(brand) {
  // Inject brand constants into a generated Swift file the other Swift
  // sources can reference. Keychain service + Spotlight domain etc.
  // Same content is emitted into every extension dir so each Xcode
  // target's source pool includes Brand without cross-target imports
  // (Swift module-system limitation in Xcode app-extension targets).
  const paths = [
    join(UI, 'ios', 'App', 'App', 'Brand.swift'),
    join(UI, 'ios', 'App', 'CareerOpsWidget', 'Brand.swift'),
    join(UI, 'ios', 'App', 'CareerOpsLiveActivity', 'Brand.swift'),
    join(UI, 'ios', 'App', 'CareerOpsShareExtension', 'Brand.swift'),
  ];
  const openJobActivity = brand.identifiers.userActivityTypes.find((t) => t.endsWith('.openJob'))
    ?? `${brand.identifiers.bundleId}.openJob`;
  const body = [
    `// AUTO-GENERATED by scripts/native/apply-brand.mjs — do not edit.`,
    `// Edit branding/brand.json and run \`pnpm brand:apply\`.`,
    ``,
    `import Foundation`,
    ``,
    `enum Brand {`,
    `    static let name = "${brand.name}"`,
    `    static let displayName = "${brand.displayName}"`,
    `    static let bundleId = "${brand.identifiers.bundleId}"`,
    `    static let appGroup = "${brand.identifiers.appGroup}"`,
    `    static let urlScheme = "${brand.identifiers.urlScheme}"`,
    `    static let serviceType = "${brand.identifiers.serviceType}"`,
    `    static let spotlightDomain = "${brand.identifiers.spotlightDomain}"`,
    `    static let keychainService = "${brand.identifiers.keychainService}"`,
    `    static let openJobActivityType = "${openJobActivity}"`,
    ``,
    `    /// UserDefaults keys — all prefixed with brand name so they're`,
    `    /// namespaced and a brand rename moves them cleanly.`,
    `    enum DefaultsKey {`,
    `        static let lanUrl = "\\(Brand.name):lan-url"`,
    `        static let backendResolvedUrl = "\\(Brand.name):backend-resolved-url"`,
    `        static let tailscaleUrl = "\\(Brand.name):tailscale-url"`,
    `        static let productionUrl = "\\(Brand.name):production-url"`,
    `        static let lastSeenIssue = "\\(Brand.name):last-seen-issue"`,
    `    }`,
    ``,
    `    /// Build a custom-scheme deep link.`,
    `    static func deepLink(_ route: String) -> String {`,
    `        let trimmed = route.hasPrefix("/") ? String(route.dropFirst()) : route`,
    `        return "\\(urlScheme)://\\(trimmed)"`,
    `    }`,
    `    static func jobDeepLink(_ jobId: String) -> String {`,
    `        return "\\(urlScheme)://job/\\(jobId)"`,
    `    }`,
    `}`,
    ``,
  ].join('\n');
  let anyChanged = false;
  for (const p of paths) {
    if (!existsSync(dirname(p))) continue; // extension dirs may not exist on fresh installs
    if (writeIfChanged(p, body)) anyChanged = true;
  }
  anyChanged ? log.ok(`Brand.swift × ${paths.filter((p) => existsSync(p)).length} (app + extensions)`) : log.skip(`Brand.swift — already current`);
}

function applyAGENTSMd(brand) {
  // Only the "Discord" link and a couple author-email-style references
  // are brand-derived; rest is task content. We update only the explicit
  // brand strings using narrow patterns.
  const path = join(ROOT, 'AGENTS.md');
  if (!existsSync(path)) { log.skip(`AGENTS.md — missing`); return; }
  // No-op for now — most AGENTS.md content is project guidance, not brand.
  // The brand-derived strings inside it (com.resistjs.careerops, careerops://)
  // are inline references in prose, not template fields. Verifier will
  // flag any that drift.
  log.skip(`AGENTS.md — prose, not regenerated (verifier checks consistency)`);
}

function regenerateIcons() {
  // Final step: call the existing icon-generation script. It reads
  // ui/static/favicon.svg (which we just refreshed from branding/logo.svg)
  // and renders all platform sizes.
  log.step('Regenerating platform icons');
  try {
    execSync(`node ${join(ROOT, 'native', 'icons', 'generate-icons.mjs')}`, { stdio: 'inherit' });
    log.ok('icons regenerated');
  } catch (e) {
    log.warn(`icon regen failed: ${e.message}`);
  }
}

// ───────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────

function apply() {
  const brand = loadBrand();
  console.log(`Applying brand "${brand.name}" v${require('node:fs').existsSync(join(ROOT, 'package.json')) ? JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version : '?'}\n`);

  log.step('package.json files');
  applyRootPackageJson(brand);
  applyElectronPackageJson(brand);

  log.step('Capacitor configs');
  applyCapacitorConfig(brand, join(UI, 'capacitor.config.ts'));
  applyCapacitorConfig(brand, join(UI, 'electron', 'capacitor.config.ts'));

  log.step('Electron builder');
  applyElectronBuilderConfig(brand);

  log.step('Brand-as-code (TS + Swift)');
  applyClientBrandTs(brand);
  applyElectronBrandTs(brand);

  log.step('iOS');
  applyIosInfoPlist(brand);
  applySwiftConstants(brand);
  syncSharedSwift(brand);

  log.step('Web manifest + favicon + app.html');
  applyFavicon(brand);
  applyManifest(brand);
  applyAppHtml(brand);

  log.step('Fastlane');
  applyFastlaneAppfile(brand);
  applyFastfile(brand);

  log.step('Build scripts');
  applyAddXcodeTargets(brand);

  log.step('Docs');
  applyAGENTSMd(brand);

  regenerateIcons();

  console.log(`\n${GREEN}✓${RESET} brand applied — every consumer reads from branding/brand.json`);
}

// CommonJS require shim for the version-display in apply()
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

apply();
