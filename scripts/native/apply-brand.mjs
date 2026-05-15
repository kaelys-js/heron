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
 *   3. Add a check in ui/src/lib/integration/capacitor.integration.test.ts
 *
 * Safe to re-run — idempotent. No-ops if the file already matches.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const UI = join(ROOT, 'ui');
const CACHE_FILE = join(ROOT, 'scripts', 'native', 'icons', '_build', '.apply-brand-cache');
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
  const required = [
    'name',
    'displayName',
    'description',
    'identifiers.bundleId',
    'identifiers.urlScheme',
    'identifiers.serviceType',
    'colors.primary',
    'author.email',
    'repo.url',
  ];
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

/** Read JSON, apply patch, write back. Returns true if file changed.
 *  Runs biome format on the result so downstream `pnpm format:check`
 *  doesn't flag apply-brand's output. */
function patchJson(path, patcher) {
  const before = readFileSync(path, 'utf8');
  const json = JSON.parse(before);
  patcher(json);
  const after = JSON.stringify(json, null, 2) + '\n';
  if (before === after) return false;
  writeFileSync(path, after);
  try {
    execSync(`pnpm exec biome format --write "${path}"`, { stdio: 'pipe', cwd: ROOT });
  } catch {
    /* biome may not be installed yet — best effort */
  }
  return true;
}

// ───────────────────────────────────────────────────────────────────
// Per-consumer functions
// ───────────────────────────────────────────────────────────────────

function applyRootPackageJson(brand) {
  const path = join(ROOT, 'package.json');
  const changed = patchJson(path, (p) => {
    p.name = brand.name;
    // npm/pnpm convention: description is the long-form technical summary
    // shown on the package detail page. The shorter `tagline` is reserved
    // for marketing copy (Open Graph, Twitter cards, App Store subtitle).
    p.description = brand.description;
    p.author = `${brand.author.name} <${brand.author.email}> (${brand.author.url})`;
    p.homepage = brand.homepageUrl ?? brand.repo.url;
    p.repository = { type: 'git', url: brand.repo.url };
    p.bugs = { url: brand.repo.issues };
    p.funding = `https://github.com/sponsors/${brand.author.githubHandle}`;
    p.license = brand.license;
    p.keywords = brand.keywords;
  });
  changed ? log.ok(`package.json (root)`) : log.skip(`package.json (root) — already current`);
}

function applyUiPackageJson(brand) {
  const path = join(UI, 'package.json');
  if (!existsSync(path)) {
    log.skip(`ui/package.json — missing`);
    return;
  }
  const changed = patchJson(path, (p) => {
    // ui/package.json's name stays 'ui' (workspace internal identifier
    // used by `turbo run --filter=ui` and `pnpm -F ui …`). We only
    // touch the metadata fields here so a brand rename doesn't leave
    // stale upstream-era URLs lying around.
    p.description = `${brand.displayName} SvelteKit dashboard — multi-user, multi-platform (web + iOS + Android + Electron).`;
    p.homepage = brand.homepageUrl ?? brand.repo.url;
    p.repository = { type: 'git', url: brand.repo.url, directory: 'ui' };
    p.bugs = { url: brand.repo.issues };
    p.license = brand.license;
  });
  changed ? log.ok(`ui/package.json`) : log.skip(`ui/package.json — already current`);
}

function applyElectronPackageJson(brand) {
  const path = join(UI, 'electron', 'package.json');
  if (!existsSync(path)) {
    log.skip(`electron/package.json — missing (run cap add electron first)`);
    return;
  }
  const changed = patchJson(path, (p) => {
    p.name = brand.name;
    p.description = `${brand.displayName} desktop — Electron shell embedding the SvelteKit dashboard.`;
    p.author = {
      name: brand.author.name,
      email: brand.author.email,
      url: brand.author.url,
    };
    p.homepage = brand.homepageUrl ?? brand.repo.url;
    p.repository = { type: 'git', url: brand.repo.url, directory: 'ui/electron' };
    p.bugs = { url: brand.repo.issues };
    p.license = brand.license;
  });
  changed ? log.ok(`electron/package.json`) : log.skip(`electron/package.json — already current`);
}

function applyCapacitorConfig(brand, path) {
  if (!existsSync(path)) {
    log.skip(`${path} — missing`);
    return;
  }
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
    // appendUserAgent: '<brand>/native' — the marker used by the
    // dashboard server to tell native vs web hits apart in logs.
    [/appendUserAgent:\s*['"][^'"]*['"]/, `appendUserAgent: '${brand.name}/native'`],
  ];
  let changed = false;
  for (const [re, val] of replacements) {
    const next = body.replace(re, val);
    if (next !== body) {
      body = next;
      changed = true;
    }
  }
  if (changed) writeFileSync(path, body);
  changed
    ? log.ok(path.replace(ROOT, '.'))
    : log.skip(`${path.replace(ROOT, '.')} — already current`);
}

function applyElectronBuilderConfig(brand) {
  const path = join(UI, 'electron', 'electron-builder.config.json');
  if (!existsSync(path)) {
    log.skip(`electron-builder.config.json — missing`);
    return;
  }
  const changed = patchJson(path, (cfg) => {
    cfg.appId = brand.identifiers.bundleId;
    cfg.productName = brand.displayName;
    cfg.copyright = brand.copyright;
    // Mac URL scheme + every templated extendInfo field
    if (cfg.mac?.extendInfo) {
      cfg.mac.extendInfo.CFBundleURLTypes = [
        {
          CFBundleURLName: brand.identifiers.urlScheme,
          CFBundleURLSchemes: [brand.identifiers.urlScheme],
        },
      ];
      cfg.mac.extendInfo.NSLocalNetworkUsageDescription = brand.permissions.localNetworkUsage;
      cfg.mac.extendInfo.NSBonjourServices = [brand.identifiers.serviceType];
      cfg.mac.extendInfo.NSHumanReadableCopyright = brand.copyright;
    }
    // Windows publisher + NSIS shortcut metadata
    if (cfg.win) {
      cfg.win.publisherName = brand.author.name;
    }
    if (cfg.nsis) {
      cfg.nsis.shortcutName = brand.displayName;
    }
    // Linux .desktop + deb metadata
    if (cfg.linux) {
      cfg.linux.synopsis = brand.tagline;
      cfg.linux.description = brand.description;
      cfg.linux.maintainer = `${brand.author.name} <${brand.author.email}>`;
      cfg.linux.vendor = brand.author.name;
      cfg.linux.executableName = brand.name;
      if (cfg.linux.desktop?.entry) {
        cfg.linux.desktop.entry.Name = brand.displayName;
        cfg.linux.desktop.entry.Comment = brand.tagline;
        cfg.linux.desktop.entry.MimeType = `x-scheme-handler/${brand.identifiers.urlScheme};`;
        cfg.linux.desktop.entry.StartupWMClass = brand.name;
      }
    }
    // AppX (Microsoft Store / sideload)
    if (cfg.appx) {
      cfg.appx.applicationId = brand.identifiers.urlScheme;
      cfg.appx.displayName = brand.displayName;
      cfg.appx.publisher = `CN=${brand.author.name}`;
      cfg.appx.publisherDisplayName = brand.author.name;
      cfg.appx.identityName = `${brand.author.name}.${brand.name}`.replace(/[^a-z0-9.]/gi, '');
      cfg.appx.backgroundColor = brand.colors.darkBg;
    }
    cfg.protocols = [
      { name: brand.identifiers.urlScheme, schemes: [brand.identifiers.urlScheme], role: 'Editor' },
    ];
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
  changed
    ? log.ok(`electron-builder.config.json`)
    : log.skip(`electron-builder.config.json — already current`);
}

function applyAndroidStrings(brand) {
  const path = join(UI, 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml');
  if (!existsSync(path)) {
    log.skip(`android/strings.xml — missing (run cap add android first)`);
    return;
  }
  const body = [
    `<?xml version='1.0' encoding='utf-8'?>`,
    `<resources>`,
    `    <string name="app_name">${brand.displayName}</string>`,
    `    <string name="title_activity_main">${brand.displayName}</string>`,
    `    <string name="package_name">${brand.identifiers.bundleId}</string>`,
    `    <string name="custom_url_scheme">${brand.identifiers.urlScheme}</string>`,
    `</resources>`,
    ``,
  ].join('\n');
  const changed = writeIfChanged(path, body);
  changed ? log.ok(`android/strings.xml`) : log.skip(`android/strings.xml — already current`);
}

function applyAndroidManifest(brand) {
  const path = join(UI, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  if (!existsSync(path)) {
    log.skip(`AndroidManifest.xml — missing`);
    return;
  }
  // The manifest itself uses ${applicationId} placeholders that Gradle
  // resolves at build time, but the `android:scheme="careerops"` literal
  // is what we patch when the brand renames.
  let body = readFileSync(path, 'utf8');
  const next = body.replace(/(android:scheme=")[^"]*(")/g, `$1${brand.identifiers.urlScheme}$2`);
  if (next !== body) {
    writeFileSync(path, next);
    log.ok(`AndroidManifest.xml`);
  } else {
    log.skip(`AndroidManifest.xml — already current`);
  }
}

function applyAndroidBuildGradle(brand) {
  // app/build.gradle has the applicationId — capacitor.config.json's appId
  // is also surfaced into Gradle via cap sync. We patch the applicationId
  // explicitly here for renames.
  const path = join(UI, 'android', 'app', 'build.gradle');
  if (!existsSync(path)) {
    log.skip(`android/app/build.gradle — missing`);
    return;
  }
  let body = readFileSync(path, 'utf8');
  const next = body.replace(
    /applicationId\s+"[^"]*"/,
    `applicationId "${brand.identifiers.bundleId}"`,
  );
  if (next !== body) {
    writeFileSync(path, next);
    log.ok(`android/app/build.gradle`);
  } else {
    log.skip(`android/app/build.gradle — already current`);
  }
}

function applyAndroidKotlinBrand(brand) {
  // Kotlin-side counterpart of Brand.swift / brand.ts. Lives at the
  // standard Android source root.
  const pkgDir = brand.identifiers.bundleId.split('.').join('/');
  const path = join(UI, 'android', 'app', 'src', 'main', 'java', pkgDir, 'Brand.kt');
  // The Capacitor scaffold uses the bundle id as the package path. Verify
  // it exists; if not, fall back to a generic location.
  const dir = dirname(path);
  if (!existsSync(dir)) {
    // Scaffold may not have created it yet — best effort
    log.skip(`Brand.kt — pkg dir missing (run cap sync android)`);
    return;
  }
  const body = [
    `// AUTO-GENERATED by scripts/native/apply-brand.mjs — do not edit.`,
    `// Edit branding/brand.json and run \`pnpm brand:apply\`.`,
    ``,
    `package ${brand.identifiers.bundleId}`,
    ``,
    `object Brand {`,
    `    const val name = "${brand.name}"`,
    `    const val displayName = "${brand.displayName}"`,
    `    const val bundleId = "${brand.identifiers.bundleId}"`,
    `    const val urlScheme = "${brand.identifiers.urlScheme}"`,
    `    const val serviceType = "${brand.identifiers.serviceType}"`,
    `    const val keychainService = "${brand.identifiers.keychainService}"`,
    ``,
    `    /** SharedPreferences keys — brand-namespaced for fork-safety. */`,
    `    object PrefsKey {`,
    `        const val lanUrl = "\${name}:lan-url"`,
    `        const val backendResolvedUrl = "\${name}:backend-resolved-url"`,
    `        const val tailscaleUrl = "\${name}:tailscale-url"`,
    `        const val productionUrl = "\${name}:production-url"`,
    `        const val lastSeenIssue = "\${name}:last-seen-issue"`,
    `        const val errorQueue = "\${name}:error-queue-native"`,
    `        const val online = "\${name}:online"`,
    `    }`,
    ``,
    `    /** Build a custom-scheme deep link. */`,
    `    fun deepLink(route: String): String {`,
    `        val trimmed = if (route.startsWith("/")) route.substring(1) else route`,
    `        return "\${urlScheme}://\${trimmed}"`,
    `    }`,
    `    fun jobDeepLink(jobId: String): String = "\${urlScheme}://job/\${jobId}"`,
    `}`,
    ``,
  ].join('\n');
  const changed = writeIfChanged(path, body);
  changed ? log.ok(`android Brand.kt`) : log.skip(`android Brand.kt — already current`);
}

function applyIosInfoPlist(brand) {
  const path = join(UI, 'ios', 'App', 'App', 'Info.plist');
  if (!existsSync(path)) {
    log.skip(`Info.plist — missing (run cap add ios first)`);
    return;
  }
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
    // NSCameraUsageDescription
    ...(brand.permissions.cameraUsage
      ? [
          [
            /(<key>NSCameraUsageDescription<\/key>\s*\n\s*<string>)[^<]*(<\/string>)/,
            `$1${brand.permissions.cameraUsage}$2`,
          ],
        ]
      : []),
    // NSMicrophoneUsageDescription
    ...(brand.permissions.microphoneUsage
      ? [
          [
            /(<key>NSMicrophoneUsageDescription<\/key>\s*\n\s*<string>)[^<]*(<\/string>)/,
            `$1${brand.permissions.microphoneUsage}$2`,
          ],
        ]
      : []),
    // NSPhotoLibraryUsageDescription
    ...(brand.permissions.photoLibraryUsage
      ? [
          [
            /(<key>NSPhotoLibraryUsageDescription<\/key>\s*\n\s*<string>)[^<]*(<\/string>)/,
            `$1${brand.permissions.photoLibraryUsage}$2`,
          ],
        ]
      : []),
    // NSCalendarsUsageDescription
    ...(brand.permissions.calendarsUsage
      ? [
          [
            /(<key>NSCalendarsUsageDescription<\/key>\s*\n\s*<string>)[^<]*(<\/string>)/,
            `$1${brand.permissions.calendarsUsage}$2`,
          ],
        ]
      : []),
    // NSRemindersUsageDescription
    ...(brand.permissions.remindersUsage
      ? [
          [
            /(<key>NSRemindersUsageDescription<\/key>\s*\n\s*<string>)[^<]*(<\/string>)/,
            `$1${brand.permissions.remindersUsage}$2`,
          ],
        ]
      : []),
    // NSContactsUsageDescription
    ...(brand.permissions.contactsUsage
      ? [
          [
            /(<key>NSContactsUsageDescription<\/key>\s*\n\s*<string>)[^<]*(<\/string>)/,
            `$1${brand.permissions.contactsUsage}$2`,
          ],
        ]
      : []),
    // NSUserTrackingUsageDescription
    ...(brand.permissions.userTrackingUsage
      ? [
          [
            /(<key>NSUserTrackingUsageDescription<\/key>\s*\n\s*<string>)[^<]*(<\/string>)/,
            `$1${brand.permissions.userTrackingUsage}$2`,
          ],
        ]
      : []),
    // NSBonjourServices first item
    [
      /(<key>NSBonjourServices<\/key>\s*\n\s*<array>\s*\n\s*<string>)[^<]*(<\/string>)/,
      `$1${brand.identifiers.serviceType}$2`,
    ],
    // NSHumanReadableCopyright — Apple's per-app copyright string shown
    // in About menus / TestFlight metadata. Sourced from brand.copyright
    // so the upstream-required MIT attribution propagates consistently
    // with electron-builder + app.html + brand.ts.
    [
      /(<key>NSHumanReadableCopyright<\/key>\s*\n\s*<string>)[^<]*(<\/string>)/,
      `$1${brand.copyright}$2`,
    ],
  ];
  let changed = false;
  for (const [re, val] of subs) {
    const next = body.replace(re, val);
    if (next !== body) {
      body = next;
      changed = true;
    }
  }
  // NSUserActivityTypes array — rebuild from brand.identifiers.userActivityTypes
  const uatPattern = /(<key>NSUserActivityTypes<\/key>\s*\n\s*<array>)([\s\S]*?)(<\/array>)/;
  if (uatPattern.test(body)) {
    const items =
      brand.identifiers.userActivityTypes.map((t) => `\n\t\t<string>${t}</string>`).join('') +
      '\n\t';
    const next = body.replace(uatPattern, `$1${items}$3`);
    if (next !== body) {
      body = next;
      changed = true;
    }
  }
  if (changed) writeFileSync(path, body);
  changed ? log.ok(`Info.plist`) : log.skip(`Info.plist — already current`);
}

function applyFavicon(brand) {
  const dest = join(UI, 'static', 'favicon.svg');
  const src = BRAND_LOGO;
  if (!existsSync(src)) {
    log.warn(`logo.svg missing — skipping favicon copy`);
    return;
  }
  const srcContent = readFileSync(src, 'utf8');
  if (existsSync(dest) && readFileSync(dest, 'utf8') === srcContent) {
    log.skip(`static/favicon.svg — already current`);
    return;
  }
  copyFileSync(src, dest);
  log.ok(`static/favicon.svg ← branding/logo.svg`);
}

function applyReleasePleaseConfig(brand) {
  // release-please-config.json — Release Please tracks the package name
  // here so a rebrand needs to retarget it (otherwise the auto-generated
  // CHANGELOG.md keeps the old brand name in every release header).
  const path = join(ROOT, 'release-please-config.json');
  if (!existsSync(path)) {
    log.skip(`release-please-config.json — missing`);
    return;
  }
  const changed = patchJson(path, (cfg) => {
    if (cfg.packages?.['.']) {
      cfg.packages['.']['package-name'] = brand.name;
    }
  });
  changed
    ? log.ok(`release-please-config.json`)
    : log.skip(`release-please-config.json — already current`);
}

function applyBookmarklet(brand) {
  // ui/static/bookmarklet.js — form-fill bookmarklet served from the
  // dashboard. The toast prefix and the runtime-doc comment carry the
  // brand name, so a rebrand needs to retarget both.
  //
  // Note: window.__CAREER_OPS_HOST__ is INTENTIONALLY kept stable
  // across rebrands because users have it pinned in their browser
  // bookmark bar; changing the global symbol would silently break
  // every existing bookmark. The user-visible toast prefix is what
  // gets rebranded.
  const path = join(UI, 'static', 'bookmarklet.js');
  if (!existsSync(path)) {
    log.skip(`static/bookmarklet.js — missing`);
    return;
  }
  let body = readFileSync(path, 'utf8');
  let changed = false;
  // Match the opening doc comment "<oldname> form-fill bookmarklet."
  // and every toast prefix "<oldname>: " in a quoted string.
  const subs = [
    [/^( \* )[a-z0-9-]+ (form-fill bookmarklet)/m, `$1${brand.name} $2`],
    [/'[a-z0-9-]+: /g, `'${brand.name}: `],
  ];
  for (const [re, val] of subs) {
    const next = body.replace(re, val);
    if (next !== body) {
      body = next;
      changed = true;
    }
  }
  if (changed) writeFileSync(path, body);
  changed ? log.ok(`static/bookmarklet.js`) : log.skip(`static/bookmarklet.js — already current`);
}

function applyAppHtml(brand) {
  // app.html runs an INLINE script before SvelteKit hydrates (theme
  // bootstrap to avoid light-mode flash). That script can't import TS
  // modules, so the brand-derived values are baked in at build time
  // here. Brand changes → re-run apply-brand → app.html updates.
  //
  // Every brand-derived literal in app.html lives in the `subs` table
  // below — adding a new value means adding a row here, NOT editing
  // app.html directly. The verifier (verify-capacitor) cross-checks
  // app.html against this table so drift can't slip through.
  const path = join(UI, 'src', 'app.html');
  if (!existsSync(path)) {
    log.skip(`app.html — missing`);
    return;
  }
  let body = readFileSync(path, 'utf8');
  let changed = false;
  const subs = [
    // localStorage:<brand>:theme key — must match what theme.svelte.ts writes
    [/'[^']*:theme'/, `'${brand.name}:theme'`],
    // Mask icon color (Safari pinned-tab) — use the brand accent
    [/(rel="mask-icon"[^>]*color=")[^"]*(")/, `$1${brand.colors.accentEmeraldDark}$2`],
    // og:description / og:title / og:site_name
    [/(og:description"\s+content=")[^"]*(")/, `$1${brand.tagline}$2`],
    [/(og:site_name"\s+content=")[^"]*(")/, `$1${brand.displayName}$2`],
    [/(og:title"\s+content=")[^"]*(")/, `$1${brand.displayName}$2`],
    [/(og:image:alt"\s+content=")[^"]*(")/, `$1${brand.displayName}$2`],
    // twitter:title / twitter:description
    [/(twitter:title"\s+content=")[^"]*(")/, `$1${brand.displayName}$2`],
    [/(twitter:description"\s+content=")[^"]*(")/, `$1${brand.tagline}$2`],
    // apple-mobile-web-app-title
    [/(apple-mobile-web-app-title"\s+content=")[^"]*(")/, `$1${brand.displayName}$2`],
    // application-name (Windows Start tile pinned PWA + general PWA name)
    [/(name="application-name"\s+content=")[^"]*(")/, `$1${brand.displayName}$2`],
    // General description meta — search snippet, browser bookmarks
    [/(name="description"\s+content=")[^"]*(")/, `$1${brand.description ?? brand.tagline}$2`],
    // Keywords — browser auto-suggest, SEO (Bing still indexes this)
    [/(name="keywords"\s+content=")[^"]*(")/, `$1${(brand.keywords ?? []).join(', ')}$2`],
    // msapplication-TileColor + msapplication-TileImage filename
    [/(msapplication-TileColor"\s+content=")[^"]*(")/, `$1${brand.colors.primary}$2`],
    [
      /(msapplication-TileImage"[^>]*content="[^"]*\/icons\/)[^"]+(\.png")/,
      `$1${brand.name}-256$2`,
    ],
    // Icon paths — every <link rel="icon"> or apple-touch-icon path that
    // references the brand-named PNG generated by scripts/native/icons/generate-icons.mjs.
    // Match any sizes/icons/<oldname>-<size>.png and rewrite to ${brand.name}-<size>.png.
    [/(icons\/)[a-z0-9_-]+(-\d+\.png)/g, (_m, pre, post) => `${pre}${brand.name}${post}`],
    // Theme colors — dark + light from brand.colors. iOS / Android use
    // these to tint the status bar AND Chrome's address bar.
    [
      /(theme-color"\s+content=")[^"]*("\s+media="\(prefers-color-scheme:\s*dark\)")/,
      `$1${brand.colors.darkBg}$2`,
    ],
    [
      /(theme-color"\s+content=")[^"]*("\s+media="\(prefers-color-scheme:\s*light\)")/,
      `$1${brand.colors.lightBg ?? '#fafaf9'}$2`,
    ],
    // author + copyright
    [/(name="author"\s+content=")[^"]*(")/, `$1${brand.author.name}$2`],
    [/(name="copyright"\s+content=")[^"]*(")/, `$1${brand.copyright}$2`],
  ];
  for (const [re, val] of subs) {
    const next = body.replace(re, val);
    if (next !== body) {
      body = next;
      changed = true;
    }
  }
  if (changed) writeFileSync(path, body);
  changed ? log.ok(`app.html`) : log.skip(`app.html — already current`);
}

function applyErrorHtml(brand) {
  // src/error.html is the SvelteKit fallback shown when +error.svelte
  // can't render (e.g. when a hook throws before routing settles). Same
  // brand-token treatment as app.html so a rebrand updates both in
  // lockstep. Specific tokens we substitute:
  //   • <title>%status% · <displayName></title>
  //   • Card title / footer copy
  //   • Reload button label
  const path = join(UI, 'src', 'error.html');
  if (!existsSync(path)) {
    log.skip(`error.html — missing`);
    return;
  }
  let body = readFileSync(path, 'utf8');
  let changed = false;
  const subs = [
    // <title>%status% · {displayName}</title>
    [/(<title>%status%\s*·\s*)[^<]+(<\/title>)/, `$1${brand.displayName}$2`],
    // Reload button — "Reload {displayName}"
    [/(>Reload\s+)[^<]+(<\/a>)/, `$1${brand.displayName}$2`],
    // Inline SVG gradient stops match logo.svg — pulled from brand.colors
    // in case the brand-gradient colors get swapped via brand.json. We
    // match the THREE gradient stops in order.
    [/(<stop offset="0%" stop-color=")[^"]+(")/, `$1${brand.colors.gradientStart ?? '#6366f1'}$2`],
    [/(<stop offset="55%" stop-color=")[^"]+(")/, `$1${brand.colors.gradientMid ?? '#8b5cf6'}$2`],
    [/(<stop offset="100%" stop-color=")[^"]+(")/, `$1${brand.colors.gradientEnd ?? '#a855f7'}$2`],
  ];
  for (const [re, val] of subs) {
    const next = body.replace(re, val);
    if (next !== body) {
      body = next;
      changed = true;
    }
  }
  if (changed) writeFileSync(path, body);
  changed ? log.ok(`error.html`) : log.skip(`error.html — already current`);
}

function applyManifest(brand) {
  const path = join(UI, 'static', 'manifest.webmanifest');
  if (!existsSync(path)) {
    log.skip(`manifest.webmanifest — missing`);
    return;
  }
  const changed = patchJson(path, (m) => {
    m.name = brand.displayName;
    m.short_name = brand.shortName;
    m.description = brand.tagline;
    m.theme_color = brand.colors.primary;
    m.background_color = brand.colors.darkBg;
    // Stable identity — Chrome PWA install treats this as the app's ID.
    // Changing it later prompts a reinstall, so derive from brand id.
    m.id = `/?source=pwa&app=${brand.name}`;
    // display_override — 'window-controls-overlay' lets Chrome PWAs draw
    // a custom titlebar; fall back to standalone if unsupported.
    m.display_override = ['window-controls-overlay', 'standalone'];
    // App shortcuts (right-click PWA icon in dock/start, or 3D-Touch on iOS).
    m.shortcuts = [
      {
        name: 'Pipeline',
        short_name: 'Pipeline',
        description: 'Open the job pipeline',
        url: '/pipeline',
        icons: [{ src: `/icons/${brand.name}-192.png`, sizes: '192x192' }],
      },
      {
        name: 'Inbox',
        short_name: 'Inbox',
        description: 'Open the issues inbox',
        url: '/inbox',
        icons: [{ src: `/icons/${brand.name}-192.png`, sizes: '192x192' }],
      },
      {
        name: 'Queue',
        short_name: 'Queue',
        description: 'Open the apply queue',
        url: '/queue',
        icons: [{ src: `/icons/${brand.name}-192.png`, sizes: '192x192' }],
      },
      {
        name: 'Settings',
        short_name: 'Settings',
        description: 'Open settings',
        url: '/settings',
        icons: [{ src: `/icons/${brand.name}-192.png`, sizes: '192x192' }],
      },
    ];
    // Categories — Chrome surfaces these in PWA discovery.
    m.categories = ['productivity', 'utilities', 'business'];
    // Protocol handler — lets `careerops://` register at PWA install time
    // on Chrome/Edge so links open the PWA instead of the browser.
    m.protocol_handlers = [
      {
        protocol: `web+${brand.identifiers.urlScheme}`,
        url: '/?url=%s',
      },
    ];
    // Rebuild icon list — keep SVG (resolution-independent) + every
    // PWA-required PNG size we generate via the icon pipeline. PWA
    // install on Chrome/Edge wants at least one 192×192 + one 512×512
    // PNG icon; we ship 192/256/384/512 for maximum compatibility.
    m.icons = [
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon-mask.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable monochrome',
      },
      {
        src: `/icons/${brand.name}-192.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `/icons/${brand.name}-256.png`,
        sizes: '256x256',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `/icons/${brand.name}-384.png`,
        sizes: '384x384',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `/icons/${brand.name}-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ];
  });
  // Post-process through biome so the formatter doesn't flag our output
  // on the next CI run. Best-effort; if biome isn't installed yet, the
  // pre-commit hook will catch it anyway.
  try {
    execSync(`pnpm exec biome format --write "${path}"`, { stdio: 'pipe', cwd: ROOT });
  } catch {}
  changed
    ? log.ok(`static/manifest.webmanifest`)
    : log.skip(`manifest.webmanifest — already current`);
}

function applyFastlaneAppfile(brand) {
  const path = join(UI, 'ios', 'App', 'fastlane', 'Appfile');
  if (!existsSync(path)) {
    log.skip(`Appfile — missing`);
    return;
  }
  let body = readFileSync(path, 'utf8');
  const next = body.replace(
    /app_identifier\("[^"]*"\)/,
    `app_identifier("${brand.identifiers.bundleId}")`,
  );
  if (next !== body) {
    writeFileSync(path, next);
    log.ok(`Appfile`);
  } else log.skip(`Appfile — already current`);
}

function applyFastfile(brand) {
  const path = join(UI, 'ios', 'App', 'fastlane', 'Fastfile');
  if (!existsSync(path)) {
    log.skip(`Fastfile — missing`);
    return;
  }
  let body = readFileSync(path, 'utf8');
  const next = body.replace(
    /APP_IDENTIFIER\s*=\s*"[^"]*"/,
    `APP_IDENTIFIER = "${brand.identifiers.bundleId}"`,
  );
  if (next !== body) {
    writeFileSync(path, next);
    log.ok(`Fastfile`);
  } else log.skip(`Fastfile — already current`);
}

function applyAddXcodeTargets(brand) {
  // Bake the bundle root + app group into the ruby script.
  const path = join(ROOT, 'scripts', 'native', 'add-xcode-targets.rb');
  if (!existsSync(path)) {
    log.skip(`add-xcode-targets.rb — missing`);
    return;
  }
  let body = readFileSync(path, 'utf8');
  let changed = false;
  const subs = [
    [/app_group\s*=\s*'[^']*'/, `app_group = '${brand.identifiers.appGroup}'`],
    [/bundle_root\s*=\s*'[^']*'/, `bundle_root = '${brand.identifiers.bundleId}'`],
  ];
  for (const [re, val] of subs) {
    const next = body.replace(re, val);
    if (next !== body) {
      body = next;
      changed = true;
    }
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
    `/** Named localStorage keys used across the app. Centralised so a`,
    ` * rebrand (BRAND.name change) automatically retargets every read`,
    ` * + write. Use these constants instead of typing literal`,
    ` * '\${BRAND.name}:authed' strings around the codebase — keeps the`,
    ` * key names in one searchable place AND eliminates the drift`,
    ` * where one site reads 'career-ops:authed' and another writes`,
    ` * 'careerops:authed' or similar. */`,
    `export const BRAND_STORAGE_KEYS = {`,
    `  /** '1' iff the user has a live local-auth marker — used by the`,
    `   * layout boot path for the sync-bounce-to-/login race. */`,
    `  authed: \`\${BRAND.name}:authed\`,`,
    `  /** Bearer token captured from better-auth's Set-Auth-Token`,
    `   * header. Required for the Capacitor WebView (cookies don't`,
    `   * cross from careerops:// to http://) and mirrored into App`,
    `   * Group for the Share Extension. */`,
    `  bearerToken: \`\${BRAND.name}:bearer-token\`,`,
    `  /** User-chosen theme ('light' | 'dark' | 'system'). Read by`,
    `   * app.html's inline bootstrap script for FOUC-free initial paint. */`,
    `  theme: \`\${BRAND.name}:theme\`,`,
    `  /** Quiet-hours preference JSON ({enabled, startHour, endHour}). */`,
    `  quietHours: \`\${BRAND.name}:quiet-hours\`,`,
    `  /** Per-component collapse/expand state — namespaced under the`,
    `   * brand prefix so CollapsibleCard / CollapsibleGroup / similar`,
    `   * never collide with unrelated apps on the same origin. */`,
    `  collapseCardPrefix: \`\${BRAND.name}:cc\`,`,
    `  collapseGroupPrefix: \`\${BRAND.name}:cg\`,`,
    `  /** Push-notifications opt-in level prefs (Notification API). */`,
    `  pushPrefs: \`\${BRAND.name}:push-prefs\`,`,
    `} as const;`,
    ``,
  ].join('\n');
  const changed = writeIfChanged(path, body);
  changed
    ? log.ok(`lib/client/brand.ts (generated)`)
    : log.skip(`lib/client/brand.ts — already current`);
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
  changed
    ? log.ok(`electron/src/brand.ts (generated)`)
    : log.skip(`electron/src/brand.ts — already current`);
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
  // Every Xcode target that compiles Swift needs its own Brand.swift —
  // Xcode app-extension AND watchOS-app targets can't import constants
  // from the host (Swift module system limitation). One source-of-truth
  // template, N copies, one place to edit (branding/brand.json).
  const paths = [
    join(UI, 'ios', 'App', 'App', 'Brand.swift'),
    join(UI, 'ios', 'App', 'CareerOpsWidget', 'Brand.swift'),
    join(UI, 'ios', 'App', 'CareerOpsLiveActivity', 'Brand.swift'),
    join(UI, 'ios', 'App', 'CareerOpsShareExtension', 'Brand.swift'),
    // CareerOpsWatch is a separate watchOS target. Without this copy
    // the Watch had to hardcode "group.com.resistjs.careerops" and
    // "careerops://queue" everywhere — a rebrand drift waiting to
    // happen. The Watch's Brand.swift mirrors the host's verbatim.
    join(UI, 'ios', 'App', 'CareerOpsWatch', 'Brand.swift'),
  ];
  const openJobActivity =
    brand.identifiers.userActivityTypes.find((t) => t.endsWith('.openJob')) ??
    `${brand.identifiers.bundleId}.openJob`;
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
    `        /// Bearer token mirrored from the WebView into App Group`,
    `        /// UserDefaults so the Share Extension can attach`,
    `        /// Authorization: Bearer <token> on its POSTs. Set by`,
    `        /// CareerOpsNativePlugin.setSharedBearerToken; cleared on`,
    `        /// sign-out.`,
    `        static let bearerToken = "\\(Brand.name):bearer-token"`,
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
  anyChanged
    ? log.ok(`Brand.swift × ${paths.filter((p) => existsSync(p)).length} (app + extensions)`)
    : log.skip(`Brand.swift — already current`);
}

function applyAGENTSMd(brand) {
  // Only the "Discord" link and a couple author-email-style references
  // are brand-derived; rest is task content. We update only the explicit
  // brand strings using narrow patterns.
  const path = join(ROOT, 'AGENTS.md');
  if (!existsSync(path)) {
    log.skip(`AGENTS.md — missing`);
    return;
  }
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
    execSync(`node ${join(ROOT, 'scripts', 'native', 'icons', 'generate-icons.mjs')}`, {
      stdio: 'inherit',
    });
    log.ok('icons regenerated');
  } catch (e) {
    log.warn(`icon regen failed: ${e.message}`);
  }
}

// ───────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────

/** Hash of every file the apply step reads, so a no-op re-run can short-
 *  circuit. Input set: brand.json + logo.svg + this script's own mtime
 *  (covers behaviour changes that would invalidate the cache even when
 *  the brand inputs are unchanged). */
function computeApplyHash() {
  const inputs = [
    join(ROOT, 'branding', 'brand.json'),
    join(ROOT, 'branding', 'logo.svg'),
    fileURLToPath(import.meta.url), // this script
    join(ROOT, 'scripts', 'native', 'icons', 'generate-icons.mjs'),
  ];
  const h = createHash('sha256');
  for (const p of inputs) {
    try {
      h.update(p);
      h.update('\0');
      h.update(readFileSync(p));
      h.update('\0');
      h.update(String(statSync(p).mtimeMs));
      h.update('\0');
    } catch {
      h.update('MISSING\0');
    }
  }
  return h.digest('hex').slice(0, 16);
}

function shouldSkip() {
  if (process.argv.includes('--force') || process.env.BRAND_APPLY_FORCE === '1') return false;
  try {
    const prev = readFileSync(CACHE_FILE, 'utf8').trim();
    if (prev !== computeApplyHash()) return false;
    // Cache says "no work to do" — but verify the canonical generated outputs
    // still exist on disk. CI starts from a fresh checkout with NO generated
    // files: if the cache file got committed (or restored from turbo cache)
    // the hash would match but the outputs would be missing. In that case,
    // re-run apply-brand to regenerate everything.
    const fs = require('node:fs');
    const canonicalOutputs = [
      join(UI, 'src', 'lib', 'client', 'brand.ts'),
      join(UI, 'electron', 'src', 'brand.ts'),
      join(UI, 'static', 'favicon.svg'),
      join(UI, 'static', 'manifest.webmanifest'),
      join(UI, 'electron', 'build', 'icon.png'),
      join(UI, 'electron', 'build', 'icon.icns'),
      join(UI, 'electron', 'build', 'icon.ico'),
    ];
    for (const p of canonicalOutputs) {
      if (!fs.existsSync(p)) {
        return false; // missing output → run again, ignore hash
      }
    }
    return true;
  } catch {
    return false;
  }
}

function recordApplied() {
  try {
    const fs = require('node:fs');
    fs.mkdirSync(dirname(CACHE_FILE), { recursive: true });
    writeFileSync(CACHE_FILE, computeApplyHash() + '\n');
  } catch {
    /* non-fatal */
  }
}

function apply() {
  if (shouldSkip()) {
    console.log('✓ brand inputs unchanged — apply-brand short-circuited');
    return;
  }
  const brand = loadBrand();
  console.log(
    `Applying brand "${brand.name}" v${require('node:fs').existsSync(join(ROOT, 'package.json')) ? JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version : '?'}\n`,
  );

  log.step('package.json files');
  applyRootPackageJson(brand);
  applyUiPackageJson(brand);
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

  log.step('Android');
  applyAndroidStrings(brand);
  applyAndroidManifest(brand);
  applyAndroidBuildGradle(brand);
  applyAndroidKotlinBrand(brand);

  log.step('Web manifest + favicon + app.html + error.html');
  applyFavicon(brand);
  applyManifest(brand);
  applyAppHtml(brand);
  applyErrorHtml(brand);
  applyBookmarklet(brand);

  log.step('Fastlane');
  applyFastlaneAppfile(brand);
  applyFastfile(brand);

  log.step('Build scripts');
  applyAddXcodeTargets(brand);

  log.step('Release tooling');
  applyReleasePleaseConfig(brand);

  log.step('Docs');
  applyAGENTSMd(brand);

  regenerateIcons();

  recordApplied();

  console.log(`\n${GREEN}✓${RESET} brand applied — every consumer reads from branding/brand.json`);
}

// CommonJS require shim for the version-display in apply()
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

apply();
