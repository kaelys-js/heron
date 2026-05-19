#!/usr/bin/env node
/**
 * apply-brand -- propagate branding/brand.json into every config file.
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
 * Run after editing brand.json -- verifier checks consistency.
 *
 * Each consumer is its own function below. Adding a new consumer:
 *   1. Add a function `applyXxx(brand)`
 *   2. Call it from the main `apply()` at the bottom
 *   3. Add a check in ui/src/lib/integration/capacitor.integration.test.ts
 *
 * Safe to re-run -- idempotent. No-ops if the file already matches.
 */
import {
  readFileSync,
  writeFileSync as _fsWriteFileSync,
  existsSync,
  copyFileSync as _fsCopyFileSync,
  statSync,
  mkdirSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

// ROOT is the repo root by default -- the script lives at
// scripts/native/apply-brand.mjs so two `..` jumps land at /<repo>.
// HERON_BRAND_ROOT env override is the test-isolation hook: integration
// tests in ui/src/lib/integration/capacitor.integration.test.ts copy
// `branding/` into a tmpdir + invoke apply-brand with HERON_BRAND_ROOT
// pointing at that tmpdir, so the destructive-rebrand assertions never
// mutate real source. Production never sets this.
const ROOT =
  process.env.HERON_BRAND_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const UI = join(ROOT, 'ui');
const CACHE_FILE = join(ROOT, 'scripts', 'native', 'icons', '_build', '.apply-brand-cache');
const BRAND_JSON = join(ROOT, 'branding', 'brand.json');
const BRAND_LOGO = join(ROOT, 'branding', 'logo.svg');
const SNAPSHOT_FILE = join(ROOT, 'branding', '.brand-snapshot.json');

/**
 * Destructive fields -- changes here cannot be reverted at the App
 * Store / installed-user level. apply-brand refuses to proceed when
 * any drifts without REBRAND_CONFIRMED=1.
 */
const DESTRUCTIVE_FIELDS = [
  { path: 'name', label: 'Brand slug (package name + git remote inference)' },
  { path: 'identifiers.bundleId', label: 'Bundle ID (App Store + Play Store identifier)' },
  { path: 'identifiers.appGroup', label: 'App Group (shared container for widgets / watch)' },
  { path: 'identifiers.urlScheme', label: 'URL scheme (external deep links)' },
  { path: 'identifiers.serviceType', label: 'Bonjour service type (LAN autodiscovery)' },
  { path: 'identifiers.keychainService', label: 'Keychain service (passkey credential storage)' },
  { path: 'identifiers.capacitorPluginName', label: 'Capacitor plugin JS identifier' },
];

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

const log = {
  step: (n) => console.log(`\n${CYAN}▸${RESET} ${n}`),
  ok: (m) => console.log(`  ${GREEN}✓${RESET} ${m}`),
  skip: (m) => console.log(`  ${DIM}· ${m}${RESET}`),
  warn: (m) => console.log(`  ${YELLOW}!${RESET} ${m}`),
};

// ── Output tracking ──────────────────────────────────────────────────
// Every file apply-brand mutates lands in MODIFIED_FILES. The --stage
// flag uses this set to drive `git add` so pre-commit hooks can pick up
// apply-brand's output WITHOUT maintaining a parallel list of paths
// (the old approach drifted whenever apply-brand started touching a
// new file -- easy bug to miss, hard to detect).
//
// Every writeFileSync + copyFileSync call site routes through the
// wrappers below, so additions are zero-effort: write to a new path,
// staging happens automatically.
const MODIFIED_FILES = new Set();

function writeFileSync(path, content) {
  // Idempotent: skip when content is byte-identical to what's on disk.
  // Many apply-brand call sites already gate on a `changed` boolean
  // from patchJson(), but the few unconditional writes (snapshot,
  // migration log) would dirty mtime unnecessarily without this.
  if (existsSync(path)) {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
    try {
      if (readFileSync(path).equals(buf)) return;
    } catch {
      // Unreadable (permission / lock) -- fall through and rewrite
    }
  }
  // Ensure parent dir exists. Production trees always have these dirs,
  // but the integration suite scaffolds a partial tree under tmpdir and
  // expects apply-brand to write anyway (the test rig only copies
  // `branding/` + `templates/`, not the whole repo).
  mkdirSync(dirname(path), { recursive: true });
  _fsWriteFileSync(path, content);
  MODIFIED_FILES.add(path);
}

function copyFileSync(src, dest) {
  if (existsSync(dest)) {
    try {
      if (readFileSync(src).equals(readFileSync(dest))) return;
    } catch {
      // Either side unreadable -- fall through and re-copy
    }
  }
  // Same parent-dir-exists guarantee as writeFileSync above.
  mkdirSync(dirname(dest), { recursive: true });
  _fsCopyFileSync(src, dest);
  MODIFIED_FILES.add(dest);
}

/** Read a dotted path off a nested object: getPath(obj, 'a.b.c') === obj?.a?.b?.c. */
function getPath(obj, path) {
  return path.split('.').reduce((acc, k) => acc?.[k], obj);
}

/** Load the previous brand snapshot. Returns null on first-ever run. */
function loadSnapshot() {
  if (!existsSync(SNAPSHOT_FILE)) return null;
  try {
    return JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/** Persist the post-apply state. Called from main after successful apply. */
function writeSnapshot(brand) {
  // Store the entire brand object -- full snapshot makes future drift
  // checks on any field cheap, and a human can diff snapshots to see
  // what changed across rebrands.
  //
  // CRITICAL: run biome over the output, same as patchJson. Without
  // this step, JSON.stringify produces compact single-line arrays
  // (`"chart": ["#a", "#b", "#c"]`) but biome's JSON formatter prefers
  // multi-line arrays once an array exceeds the line-width budget. Net
  // effect of skipping biome: every `pnpm format` flags the snapshot
  // as drifted, the dev runs `pnpm format`, the next apply-brand run
  // re-writes the compact form, drift returns. Endless cycle.
  writeFileSync(SNAPSHOT_FILE, JSON.stringify(brand, null, 2) + '\n');
  try {
    execSync(`pnpm exec biome format --write "${SNAPSHOT_FILE}"`, {
      stdio: 'pipe',
      cwd: ROOT,
    });
  } catch {
    // biome unavailable in this environment -- fall through. The dev
    // will catch the drift at the next `pnpm format:check`; not a
    // hard failure.
  }
}

/** Compute drift across DESTRUCTIVE_FIELDS. Returns an array of
 *  { field, label, before, after } or [] when nothing changed. */
function computeDrift(prev, current) {
  if (!prev) return [];
  const drift = [];
  for (const { path, label } of DESTRUCTIVE_FIELDS) {
    const before = getPath(prev, path);
    const after = getPath(current, path);
    if (before !== after) drift.push({ field: path, label, before, after });
  }
  return drift;
}

/** Print the destructive-change report to stderr. */
function printDriftReport(drift) {
  console.error('');
  console.error(`${RED}${BOLD}🚨 DESTRUCTIVE rebrand detected${RESET}`);
  console.error('');
  console.error(`The following fields have changed since the last \`pnpm brand:apply\`.`);
  console.error(`These changes have ${BOLD}non-reversible consequences${RESET}:`);
  console.error('');
  for (const d of drift) {
    console.error(`  ${YELLOW}${d.field}${RESET}  (${d.label})`);
    console.error(`    ${RED}old${RESET}: ${d.before}`);
    console.error(`    ${GREEN}new${RESET}: ${d.after}`);
  }
  console.error('');
  console.error(`${BOLD}Consequences${RESET}:`);
  console.error('  • App Store Connect: bundle ID changes are NOT reversible. New bundle ID');
  console.error('    = new App Store entry. Reviews / ratings / TestFlight tester history');
  console.error('    stay with the old app.');
  console.error('  • Existing user installs: treated as a new app — users must redownload.');
  console.error('  • Deep links: every external link using the old URL scheme stops resolving.');
  console.error('  • Keychain entries (passkey credentials): orphaned under the old');
  console.error('    keychainService; users must re-create passkeys on next login.');
  console.error('  • localStorage + IndexedDB: scoped to the old brand prefix; existing user');
  console.error('    state (theme preference, cached jobs, etc.) is orphaned.');
  console.error('  • Bonjour: connected mobile / watch clients lose autodiscovery until they');
  console.error('    rediscover the new service type.');
  console.error('  • Git remote: the inferred GitHub URL changes; CI badges, external links,');
  console.error('    SEO indexing all need a manual sweep.');
  console.error('');
  console.error(`${BOLD}If you intend to proceed:${RESET}`);
  console.error(`  ${CYAN}REBRAND_CONFIRMED=1 pnpm brand:apply${RESET}`);
  console.error('');
  console.error('apply-brand will:');
  console.error(
    `  1. Generate ${YELLOW}branding/MIGRATION-<today>.md${RESET} documenting the change`,
  );
  console.error(`     + the manual external steps you still have to do.`);
  console.error('  2. Apply the rebrand to every consumer (Capacitor configs, Info.plist,');
  console.error('     Brand.swift × 5, Brand.kt, app.css tokens, etc.).');
  console.error(
    `  3. Update ${YELLOW}branding/.brand-snapshot.json${RESET} so the next non-destructive`,
  );
  console.error('     edit no longer trips this gate.');
  console.error('');
  console.error('See `branding/REBRAND-PROCESS.md` for the full ceremony.');
  console.error('');
}

/** Generate a MIGRATION-<date>.md when a destructive rebrand lands. */
function generateMigrationDoc(drift, brand) {
  const today = new Date().toISOString().split('T')[0];
  const path = join(ROOT, 'branding', `MIGRATION-${today}.md`);
  const find = (field) => drift.find((d) => d.field === field);
  const bundleDrift = find('identifiers.bundleId');
  const urlDrift = find('identifiers.urlScheme');
  const keychainDrift = find('identifiers.keychainService');
  const serviceDrift = find('identifiers.serviceType');
  const pluginDrift = find('identifiers.capacitorPluginName');
  const nameDrift = find('name');
  const lines = [
    `# Brand migration — ${today}`,
    '',
    `> AUTO-GENERATED by \`scripts/native/apply-brand.mjs\` because a`,
    `> destructive field in \`branding/brand.json\` changed.`,
    `>`,
    `> This file is part of the brand-change audit trail. Commit it`,
    `> alongside the brand.json change so the lineage is searchable.`,
    '',
    '## Changes detected',
    '',
    '| Field | Before | After | Reversible? |',
    '|---|---|---|---|',
    ...drift.map(
      (d) =>
        `| \`${d.field}\` | \`${d.before}\` | \`${d.after}\` | ${reversibilityNote(d.field)} |`,
    ),
    '',
    '## Manual steps that apply-brand CANNOT do for you',
    '',
  ];
  if (bundleDrift) {
    lines.push(
      '### App Store Connect (iOS)',
      '',
      `- Bundle ID \`${bundleDrift.before}\` → \`${bundleDrift.after}\``,
      `- App Store does **not** allow changing the bundle ID on a published app.`,
      `- If \`${bundleDrift.before}\` was published: it stays at that bundle ID, retaining`,
      `  reviews, ratings, TestFlight tester history, and review queue position.`,
      `- For the new bundle ID, create a new App Store Connect entry from scratch.`,
      `- TestFlight: invite testers again with the new bundle ID.`,
      `- App Store Connect API key (if used by fastlane): may need a fresh issuer scope.`,
      '',
      '### Google Play Console (Android)',
      '',
      `- Application ID \`${bundleDrift.before}\` → \`${bundleDrift.after}\``,
      `- Same as iOS: Play Console does not allow changing applicationId on a published app.`,
      `- New applicationId = new app entry. Old entry stays.`,
      '',
    );
  }
  if (urlDrift) {
    lines.push(
      '### Deep links',
      '',
      `- URL scheme \`${urlDrift.before}://\` → \`${urlDrift.after}://\``,
      `- Every external link using the old scheme stops resolving:`,
      `  - Social posts, email signatures, prior share extension sends`,
      `  - Press kit / documentation links`,
      `  - Universal links / app-site-association → re-publish for the new bundle ID`,
      `- Recommend: sweep external surfaces (Twitter / LinkedIn / Discord / blog) and`,
      `  regenerate links pointing at the new scheme.`,
      '',
    );
  }
  if (keychainDrift) {
    lines.push(
      '### Keychain (passkey credentials)',
      '',
      `- Service \`${keychainDrift.before}\` → \`${keychainDrift.after}\``,
      `- Passkey credentials stored under the old service are orphaned.`,
      `- Users will need to re-create their passkey on next login.`,
      `- One-time annoyance, but unavoidable — Keychain entries are scoped to the service identifier.`,
      '',
    );
  }
  if (serviceDrift) {
    lines.push(
      '### Bonjour (LAN autodiscovery)',
      '',
      `- Service type \`${serviceDrift.before}\` → \`${serviceDrift.after}\``,
      `- Desktop instance must be restarted to re-advertise under the new service type.`,
      `- Mobile / watch clients lose autodiscovery for one cycle; they'll find the desktop`,
      `  again after it re-advertises.`,
      '',
    );
  }
  if (pluginDrift) {
    lines.push(
      '### Capacitor plugin bridge',
      '',
      `- JS plugin name \`${pluginDrift.before}\` → \`${pluginDrift.after}\``,
      `- The TS / Swift / Kotlin sides all read from \`BRAND.capacitorPluginName\`, so a`,
      `  fresh build picks up the new name automatically.`,
      `- Cached webview builds (\`ui/{ios,android}/.../public/\`) must be refreshed`,
      `  via \`pnpm exec cap sync ios && pnpm exec cap sync android\`.`,
      '',
    );
  }
  if (nameDrift) {
    lines.push(
      '### Git repository',
      '',
      `- Package name \`${nameDrift.before}\` → \`${nameDrift.after}\``,
      `- The git remote URL stays whatever it is until \`git remote set-url\` runs.`,
      `- GitHub repo rename: from the GitHub UI → Settings → Repository name.`,
      `  GitHub auto-redirects old URLs for some time, but external references should`,
      `  be updated.`,
      `- Local working tree directory: optional \`mv ~/${nameDrift.before} ~/${nameDrift.after}\``,
      `  (this conversation's cwd does not auto-rename).`,
      '',
      '### Existing user state (localStorage / IndexedDB)',
      '',
      `- Keys / dbs scoped to \`${nameDrift.before}:*\` are orphaned on rebrand to`,
      `  \`${nameDrift.after}:*\`. Theme preference, cached tokens, etc. reset to defaults.`,
      '',
    );
  }
  lines.push(
    '## What apply-brand handles automatically',
    '',
    '- All Capacitor / Electron-builder / Info.plist / Brand.swift × 5 / Brand.kt /',
    '  AndroidManifest.xml / web manifest / app.html updates.',
    '- ui/src/app.css color + font token blocks (AUTO-GENERATED).',
    '- 4 wordmark SVG variants (regenerated from brand.displayName).',
    '- 8 .md docs with AUTO-GENERATED:<section> markers fill from brand.json.',
    '- GitHub-side state (description, homepage, topics, GHAS, rulesets) via the',
    '  auto-chained `pnpm gh:apply` call — see branding/REBRAND-PROCESS.md.',
    '- branding/.brand-snapshot.json updates to record the new applied state.',
    '',
    '## Rollback',
    '',
    'Edit `branding/brand.json` to restore the previous values, run',
    '`REBRAND_CONFIRMED=1 pnpm brand:apply` again. apply-brand treats the rollback',
    'as another destructive change (because it is — same App Store consequences),',
    'so the gate runs in both directions.',
    '',
    '## Confirmation provenance',
    '',
    `This migration was applied because \`REBRAND_CONFIRMED=1\` was set in the`,
    `environment when apply-brand ran. There is no other way to reach this code path.`,
    '',
  );
  writeFileSync(path, lines.join('\n'));
  log.ok(`MIGRATION-${today}.md written`);
}

function reversibilityNote(field) {
  if (field === 'identifiers.bundleId' || field === 'identifiers.appGroup')
    return '**NO** (App Store)';
  if (field === 'identifiers.urlScheme') return 'NO (external deep links broken)';
  if (field === 'identifiers.keychainService') return 'NO (user data orphaned)';
  if (field === 'identifiers.serviceType') return 'Partial (autodiscovery resumes)';
  if (field === 'identifiers.capacitorPluginName') return 'Yes (TS/Swift/Kotlin re-sync)';
  if (field === 'name') return 'Partial (git remote + local dir manual)';
  return '—';
}

/** Run the drift check at the start of apply(). Exits non-zero on
 *  destructive drift without REBRAND_CONFIRMED. */
function checkBrandDrift(brand) {
  const prev = loadSnapshot();
  const drift = computeDrift(prev, brand);
  if (!drift.length) return drift; // safe (no drift OR first-ever run)
  if (process.env.REBRAND_CONFIRMED === '1') {
    log.warn(
      `destructive rebrand confirmed via REBRAND_CONFIRMED=1 — proceeding + writing MIGRATION doc`,
    );
    generateMigrationDoc(drift, brand);
    return drift;
  }
  printDriftReport(drift);
  process.exit(1);
}

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
  // Auto-format the output so apply-brand's writes match what the
  // pre-push `format-check` gate expects. Skipping this is the root
  // cause of "every apply-brand run dirties the working tree because
  // <formatter> wants to reformat" drift cycles -- and the user has
  // (correctly) complained about it more than once.
  //
  // Dispatch by extension to the formatter that OWNS that file type.
  // The formatter binaries (biome, swiftformat) are silent no-ops
  // when unavailable so contributors without the full toolchain don't
  // hard-fail mid-apply.
  if (/\.(ts|tsx|js|mjs|cjs|json|jsonc|css|webmanifest)$/i.test(path)) {
    try {
      execSync(`pnpm exec biome format --write "${path}"`, {
        stdio: 'pipe',
        cwd: ROOT,
      });
    } catch {
      // biome unavailable / parse failure -- fall through.
    }
  } else if (/\.swift$/i.test(path)) {
    try {
      // swiftformat owns Swift layout (blank-line conventions, brace
      // placement, trailing commas). HEAD's Brand.swift had a blank
      // line between two static funcs; apply-brand's template doesn't.
      // Without this call, every apply-brand re-touched the file with
      // the template form, and the next pre-commit's swiftformat hook
      // re-inserted the blank line -- endless drift.
      execSync(`swiftformat --quiet "${path}"`, { stdio: 'pipe', cwd: ROOT });
    } catch {
      // swiftformat unavailable -- fall through. The pre-commit Swift
      // hook will catch any residual drift on the next commit.
    }
  }
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
    /* biome may not be installed yet -- best effort */
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
    // CRITICAL: must NOT match the root package's `name`. Two workspaces
    // with the same npm name collide in turbo's task graph -- turbo treats
    // them as one package and aliases the root's `test` script to whatever
    // it ran for the inner one. Symptoms: `pnpm test` invokes electron's
    // `vitest run` from /Users/.../ui/electron and emits "No Svelte config
    // file found", "tsconfig.json should extend ./.svelte-kit/tsconfig.json",
    // "src/app.html does not exist" -- all under a misleading "heron:test"
    // prefix. Suffix with `-electron` so the names are workspace-distinct.
    p.name = `${brand.name}-electron`;
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
  // The config is TypeScript with comments and types -- surgically edit
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
    // appendUserAgent: '<brand>/native' -- the marker used by the
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
  // resolves at build time, but the `android:scheme="heron"` literal
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
  // app/build.gradle has the applicationId -- capacitor.config.json's appId
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
    // Scaffold may not have created it yet -- best effort
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
    `        const val lanUrl = "\$name:lan-url"`,
    `        const val backendResolvedUrl = "\$name:backend-resolved-url"`,
    `        const val tailscaleUrl = "\$name:tailscale-url"`,
    `        const val productionUrl = "\$name:production-url"`,
    `        const val lastSeenIssue = "\$name:last-seen-issue"`,
    `        const val errorQueue = "\$name:error-queue-native"`,
    `        const val online = "\$name:online"`,
    `    }`,
    ``,
    `    /** Build a custom-scheme deep link. */`,
    `    fun deepLink(route: String): String {`,
    `        val trimmed = if (route.startsWith("/")) route.substring(1) else route`,
    `        return "\$urlScheme://\$trimmed"`,
    `    }`,
    ``,
    `    fun jobDeepLink(jobId: String): String = "\$urlScheme://job/\$jobId"`,
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
    // NSHumanReadableCopyright -- Apple's per-app copyright string shown
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
  // NSUserActivityTypes array -- rebuild from brand.identifiers.userActivityTypes
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

function applyExtensionFolders(brand) {
  // iOS extension folder names (AppWidget, AppLiveActivity,
  // AppShareExtension, WatchApp) appear as path segments
  // in lefthook.yml's apply-brand `git add` step and in turbo.json's
  // brand-task inputs. A rebrand that renames any extension folder
  // would leave those paths broken; patch them from brand.extensions.*.name
  // so the dependency tracking stays in sync.
  //
  // The path segments matched here are deliberately suffix-anchored
  // (Widget|LiveActivity|ShareExtension|Watch) so the regex doesn't
  // accidentally rewrite an unrelated brand-prefixed string in
  // either file.
  const ext = brand.extensions ?? {};
  const subs = [
    { suffix: 'Widget', name: ext.widget?.name },
    { suffix: 'LiveActivity', name: ext.liveActivity?.name },
    { suffix: 'ShareExtension', name: ext.shareExtension?.name },
    { suffix: 'Watch', name: ext.watch?.name ?? 'WatchApp' },
  ].filter((x) => x.name);

  for (const file of [join(ROOT, 'lefthook.yml'), join(ROOT, 'turbo.json')]) {
    if (!existsSync(file)) {
      log.skip(`${file.replace(ROOT, '.')} — missing`);
      continue;
    }
    let body = readFileSync(file, 'utf8');
    const before = body;
    for (const { suffix, name } of subs) {
      // Match "ui/ios/App/<oldname><Suffix>/" path segments only.
      const re = new RegExp(`ui/ios/App/[A-Za-z0-9]+${suffix}/`, 'g');
      body = body.replace(re, `ui/ios/App/${name}/`);
    }
    if (body !== before) {
      writeFileSync(file, body);
      log.ok(file.replace(ROOT, '.'));
    } else {
      log.skip(`${file.replace(ROOT, '.')} — already current`);
    }
  }
}

function applyGitHubIssueTemplates(brand) {
  // GitHub issue templates carry the brand name in their `description`
  // and inside markdown prose ("A bug in <brand>", "How did <brand>
  // help?"). config.yml has https URLs that point to the brand's repo.
  // Patch all of them so a rebrand updates the user-facing templates
  // in one pass.
  const dir = join(ROOT, '.github', 'ISSUE_TEMPLATE');
  if (!existsSync(dir)) {
    log.skip(`.github/ISSUE_TEMPLATE — missing`);
    return;
  }
  // Match the brand name as a whole word (no preceding letter/digit/hyphen).
  // We don't replace owner/<oldname> URLs -- those go through the repo.url
  // replacement below which catches the full owner/name path.
  const repoMatch = String(brand.repo?.url ?? '').match(/github\.com\/([^/]+)\/([^/.]+)/);
  const newOwner = repoMatch?.[1];
  const newName = repoMatch?.[2];

  let touched = 0;
  for (const f of ['bug_report.yml', 'feature_request.yml', 'config.yml', 'i-got-hired.yml']) {
    const file = join(dir, f);
    if (!existsSync(file)) continue;
    let body = readFileSync(file, 'utf8');
    const before = body;
    // 1. Owner/name in URLs: github.com/<oldOwner>/<oldName>...
    if (newOwner && newName) {
      body = body.replace(
        /github\.com\/[a-z0-9-]+\/[a-z0-9-]+/g,
        `github.com/${newOwner}/${newName}`,
      );
    }
    // 2. Standalone <oldname> tokens in prose. Bounded by non-letter
    //    on both sides so we don't munge unrelated identifiers.
    body = body.replace(/(^|[^A-Za-z0-9_/-])heron($|[^A-Za-z0-9_/-])/g, `$1${brand.name}$2`);
    if (body !== before) {
      writeFileSync(file, body);
      touched += 1;
    }
  }
  if (touched > 0) {
    log.ok(`.github/ISSUE_TEMPLATE/ (${touched} file${touched === 1 ? '' : 's'})`);
  } else {
    log.skip(`.github/ISSUE_TEMPLATE/ — already current`);
  }
}

function applyGitHubWorkflows(brand) {
  // Patch artifact names in GitHub workflow YAMLs that include the
  // brand name. We do NOT touch prose comments, doc files, or the
  // upstream-pin references (sync-upstream used the upstream URL on
  // purpose). Only the upload-artifact name + SBOM filenames.
  const subs = [
    {
      // sbom.yml -- three references to <brand>-sbom.spdx.json
      file: join(ROOT, '.github', 'workflows', 'sbom.yml'),
      re: /([a-z0-9-]+)-sbom\.spdx\.json/g,
      val: () => `${brand.name}-sbom.spdx.json`,
    },
    {
      // native-release.yml -- upload-artifact name <brand>-${{ matrix.os }}
      file: join(ROOT, '.github', 'workflows', 'native-release.yml'),
      re: /name:\s*[a-z0-9-]+(-\$\{\{\s*matrix\.os\s*\}\})/,
      val: `name: ${brand.name}$1`,
    },
  ];
  for (const { file, re, val } of subs) {
    if (!existsSync(file)) {
      log.skip(`${file.replace(ROOT, '.')} — missing`);
      continue;
    }
    let body = readFileSync(file, 'utf8');
    const next = typeof val === 'function' ? body.replace(re, val) : body.replace(re, val);
    if (next === body) {
      log.skip(`${file.replace(ROOT, '.')} — already current`);
    } else {
      writeFileSync(file, next);
      log.ok(file.replace(ROOT, '.'));
    }
  }
}

function applyReleasePleaseConfig(brand) {
  // release-please-config.json -- Release Please tracks the package name
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
  // ui/static/bookmarklet.js -- form-fill bookmarklet served from the
  // dashboard. The toast prefix and the runtime-doc comment carry the
  // brand name, so a rebrand needs to retarget both.
  //
  // Note: window.__HERON_HOST__ is INTENTIONALLY kept stable
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

/**
 * Generate brand-derived data sections inside markdown docs.
 *
 * Each .md under branding/ can declare AUTO-GENERATED:<section>
 * markers; apply-brand fills those regions from brand.json. Narrative
 * prose around the markers stays human-authored. Example:
 *
 *   <!-- AUTO-GENERATED:tagline -->
 *   > Stand still. Strike well.
 *   <!-- /AUTO-GENERATED:tagline -->
 *
 * Edit brand.json → run apply-brand → every marker across every .md
 * updates atomically. Drift is impossible: the integration test
 * asserts each marked region matches what apply-brand would emit.
 */
function applyMarkdownSections(brand) {
  // Every doc that should derive its data from brand.json. AUTO-GENERATED:*
  // markers inside any of these files get filled by the generators below.
  // doc-meta is applied to ALL of them; the per-doc data sections only
  // fire if the marker exists in that specific file.
  const targets = [
    // Branding spec docs
    join(ROOT, 'branding', 'BRAND.md'),
    join(ROOT, 'branding', 'COLORS.md'),
    join(ROOT, 'branding', 'TYPOGRAPHY.md'),
    join(ROOT, 'branding', 'VOICE.md'),
    join(ROOT, 'branding', 'MASCOT.md'),
    join(ROOT, 'branding', 'SOCIAL-CARD.md'),
    join(ROOT, 'branding', 'PRESS.md'),
    join(ROOT, 'branding', 'REBRAND-PROCESS.md'),
    // Root + community
    join(ROOT, 'README.md'),
    join(ROOT, 'AGENTS.md'),
    join(ROOT, 'GEMINI.md'),
    join(ROOT, 'CLAUDE.md'),
    join(ROOT, '.github', 'CODE_OF_CONDUCT.md'),
    join(ROOT, '.github', 'CONTRIBUTING.md'),
    join(ROOT, '.github', 'SECURITY.md'),
    // docs/
    join(ROOT, 'docs', 'ARCHITECTURE.md'),
    join(ROOT, 'docs', 'COMPARISON.md'),
    join(ROOT, 'docs', 'CUSTOMIZATION.md'),
    join(ROOT, 'docs', 'DATA_CONTRACT.md'),
    join(ROOT, 'docs', 'FAQ.md'),
    join(ROOT, 'docs', 'GOVERNANCE.md'),
    join(ROOT, 'docs', 'LEGAL_DISCLAIMER.md'),
    join(ROOT, 'docs', 'NATIVE.md'),
    join(ROOT, 'docs', 'PHILOSOPHY.md'),
    join(ROOT, 'docs', 'SETUP.md'),
    join(ROOT, 'docs', 'STATUS_MODEL.md'),
    join(ROOT, 'docs', 'TESTING.md'),
    join(ROOT, 'docs', 'TRADEMARK.md'),
    join(ROOT, 'docs', 'WATCH.md'),
    // Workspaces
    join(ROOT, 'templates', 'README.md'),
    join(ROOT, 'ui', 'README.md'),
  ];
  const generators = mdSectionGenerators();
  let touched = 0;
  for (const path of targets) {
    if (!existsSync(path)) continue;
    const before = readFileSync(path, 'utf8');
    let body = before;
    for (const [sectionName, gen] of Object.entries(generators)) {
      const startMarker = `<!-- AUTO-GENERATED:${sectionName} -->`;
      const endMarker = `<!-- /AUTO-GENERATED:${sectionName} -->`;
      const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escape(startMarker) + '[\\s\\S]*?' + escape(endMarker), 'm');
      if (re.test(body)) {
        const content = gen(brand, path);
        body = body.replace(re, `${startMarker}\n${content}\n${endMarker}`);
      }
    }
    if (body !== before) {
      writeFileSync(path, body);
      touched++;
    }
  }
  touched > 0
    ? log.ok(`${touched} .md file${touched === 1 ? '' : 's'} (regenerated marked sections)`)
    : log.skip(`.md markers — no drift`);
}

function mdSectionGenerators() {
  return {
    // doc-meta: standardized one-line header. Brand name + last-revised
    // date pulled from git log. Filled into every .md in scope.
    'doc-meta': (b, filePath) => generateDocMeta(b, filePath),
    'display-name': (b) => b.displayName,
    tagline: (b) => `> **${b.voice.tagline}**`,
    subline: (b) => b.voice.subline,
    origin: (b) => `> ${b.voice.origin}`,
    mission: (b) => b.voice.mission ?? '',
    philosophy: (b) => b.voice.philosophy ?? '',
    'boilerplate-short': (b) => `> ${b.voice.boilerplate.short}`,
    'boilerplate-medium': (b) => `> ${b.voice.boilerplate.medium}`,
    'boilerplate-long': (b) => `> ${b.voice.boilerplate.long}`,
    'personality-list': (b) => b.voice.personality.map((p) => `- ${p}`).join('\n'),
    'anti-brands-list': (b) => b.voice.antiBrands.map((p) => `- ${p}`).join('\n'),
    'principles-list': (b) =>
      b.voice.principles.map((p) => `- **${p.name}** -- ${p.description}`).join('\n'),
    'anti-patterns-list': (b) =>
      b.voice.antiPatterns.map((p) => `- **${p.name}** -- ${p.example}`).join('\n'),
    'quotes-list': (b) => b.voice.quotes.map((q) => `- *"${q}"*`).join('\n'),
    'keywords-list': (b) => b.keywords.map((k) => `\`${k}\``).join(', '),
    'color-base-table': (b) => mdColorBaseTable(b),
    'color-tokens-light-table': (b) => mdColorTokensTable(b, 'light'),
    'color-tokens-dark-table': (b) => mdColorTokensTable(b, 'dark'),
    'font-table': (b) => mdFontTable(b),
    'mascot-summary-table': (b) => mdMascotTable(b),
    'quick-facts-table': (b) => mdQuickFactsTable(b),
    'identifiers-list': (b) =>
      [
        `- **Bundle ID** -- \`${b.identifiers.bundleId}\``,
        `- **URL scheme** -- \`${b.identifiers.urlScheme}://\``,
        `- **App Group** -- \`${b.identifiers.appGroup}\``,
        `- **Bonjour service** -- \`${b.identifiers.serviceType}\``,
        `- **Capacitor plugin** -- \`${b.identifiers.capacitorPluginName}\``,
        `- **Keychain service** -- \`${b.identifiers.keychainService}\``,
      ].join('\n'),
  };
}

/** Build the doc-meta one-liner: brand displayName link.
 *  The link is relative to the file's own path (so README.md in branding/
 *  links up to ../README.md, etc.). No date stamp -- the previous
 *  "Last revised YYYY-MM-DD" produced commit churn every time apply-brand
 *  ran against a file with a different latest-commit date. */
function generateDocMeta(brand, filePath) {
  const rel = filePath.replace(ROOT + '/', '');
  const depth = (rel.match(/\//g) || []).length;
  // README.md at root IS the brand entry point -- no self-link needed.
  if (rel === 'README.md') {
    return `*[${brand.displayName}](${brand.homepageUrl ?? brand.repo.url}) · ${brand.tagline}*`;
  }
  // Every other doc gets a relative link up to README.md.
  const linkToReadme = depth === 0 ? 'README.md' : '../'.repeat(depth) + 'README.md';
  return `*Part of the [${brand.displayName}](${linkToReadme}) docs.*`;
}

function mdColorBaseTable(b) {
  const c = b.colors;
  const rows = [
    `| Key | Hex | Name |`,
    `|---|---|---|`,
    `| \`primary\` | \`${c.primary}\` | ${c.primaryName ?? ''} |`,
    `| \`accent\` | \`${c.accent}\` | ${c.accentName ?? ''} |`,
    `| \`accentSecondary\` | \`${c.accentSecondary}\` | ${c.accentSecondaryName ?? ''} |`,
    `| \`darkBg\` | \`${c.darkBg}\` | Dark mode background |`,
    `| \`darkSurface\` | \`${c.darkSurface}\` | Dark mode card surface |`,
    `| \`lightBg\` | \`${c.lightBg}\` | Light mode background (warm paper) |`,
    `| \`lightSurface\` | \`${c.lightSurface}\` | Light mode card surface |`,
    `| \`textOnDark\` | \`${c.textOnDark}\` | Text on dark surfaces |`,
    `| \`textOnLight\` | \`${c.textOnLight}\` | Text on light surfaces |`,
  ];
  return rows.join('\n');
}

function mdColorTokensTable(b, mode) {
  const tokens = b.colors.tokens[mode];
  const rows = [`| Token | Hex |`, `|---|---|`];
  for (const [key, value] of Object.entries(tokens)) {
    if (key.startsWith('$')) continue;
    if (key === 'chart') {
      for (let i = 0; i < value.length; i++)
        rows.push(`| \`--chart-${i + 1}\` | \`${value[i]}\` |`);
      continue;
    }
    const cssVar = '--' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
    rows.push(`| \`${cssVar}\` | \`${value}\` |`);
  }
  return rows.join('\n');
}

function mdFontTable(b) {
  const rows = [`| Role | Family | Fallback | Weights | Axes |`, `|---|---|---|---|---|`];
  for (const role of ['display', 'body', 'mono']) {
    const f = b.fonts[role];
    if (!f) continue;
    const fallback = f.fallback.length > 60 ? f.fallback.slice(0, 57) + '…' : f.fallback;
    const weights = Array.isArray(f.weights) ? f.weights.join(', ') : f.weights;
    const axes = (f.axes ?? []).join(', ') || '--';
    rows.push(`| ${role} | \`${f.family}\` | \`${fallback}\` | ${weights} | ${axes} |`);
  }
  return rows.join('\n');
}

function mdMascotTable(b) {
  const m = b.mascot;
  return [
    `| Property | Value |`,
    `|---|---|`,
    `| Subject | ${m.subject} |`,
    `| Pose | ${m.pose} |`,
    `| Style refs | ${m.styleReferences.join(', ')} |`,
    `| Anti-styles | ${m.antiStyles.join(', ')} |`,
    `| Mark tier | ${m.tiers.mark.use} -- ${m.tiers.mark.treatment} |`,
    `| Illustration tier | ${m.tiers.illustration.use} -- ${m.tiers.illustration.treatment} |`,
  ].join('\n');
}

function mdQuickFactsTable(b) {
  return [
    `| | |`,
    `|---|---|`,
    `| **Name** | ${b.displayName} |`,
    `| **Tagline** | ${b.voice.tagline} |`,
    `| **License** | ${b.license} |`,
    `| **Source** | <${b.repo.url}> |`,
    `| **Website** | <${b.homepageUrl}> |`,
    `| **Discord** | <https://discord.gg/8pRpHETxa4> |`,
    `| **Bundle ID** | \`${b.identifiers.bundleId}\` |`,
    `| **URL scheme** | \`${b.identifiers.urlScheme}://\` |`,
    `| **Support email** | <${b.supportEmail}> |`,
  ].join('\n');
}

/**
 * Regenerate the 4 wordmark SVG variants from a single template.
 *
 * brand.displayName drives the text content; the color variants
 * (slate / light / dawn / currentColor) drive the `fill` value. A
 * rebrand updates all 4 SVGs by editing brand.json::displayName +
 * the relevant `colors.*` keys and re-running apply-brand.
 *
 * Files written:
 *   branding/assets/wordmark.svg            (fill="currentColor")
 *   branding/assets/wordmark-slate.svg      (fill=brand.colors.primary)
 *   branding/assets/wordmark-light.svg      (fill=brand.colors.textOnDark)
 *   branding/assets/wordmark-dawn.svg       (fill=brand.colors.accent)
 *
 * The text-mode placeholder relies on the Fraunces font being loaded
 * by the renderer. For press / external embeds, run the outputs
 * through a vector editor to outline the letterforms to paths.
 */
function applyWordmarks(brand) {
  const variants = [
    { suffix: '', fill: 'currentColor', label: 'inherits parent color' },
    {
      suffix: '-slate',
      fill: brand.colors.primary,
      label: `${brand.colors.primaryName ?? 'primary'} variant (${brand.colors.primary})`,
    },
    {
      suffix: '-light',
      fill: brand.colors.textOnDark,
      label: `warm-white variant for dark surfaces (${brand.colors.textOnDark})`,
    },
    {
      suffix: '-dawn',
      fill: brand.colors.accent,
      label: `${brand.colors.accentName ?? 'accent'} variant (${brand.colors.accent})`,
    },
  ];
  let any = false;
  for (const v of variants) {
    const path = join(ROOT, 'branding', 'assets', `wordmark${v.suffix}.svg`);
    const svg = buildWordmarkSvg(brand, v);
    if (writeIfChanged(path, svg)) any = true;
  }
  any
    ? log.ok(`wordmark SVGs × 4 (regenerated from brand.displayName)`)
    : log.skip(`wordmark SVGs — already current`);
}

function buildWordmarkSvg(brand, v) {
  const family = `${brand.fonts.display.family}, ${brand.fonts.display.fallback}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  ${brand.displayName} wordmark — ${v.label}.

  AUTO-GENERATED by scripts/native/apply-brand.mjs from
  brand.json::displayName + brand.fonts.display. Do not edit; edit
  branding/brand.json and run \`pnpm brand:apply\`.

  PLACEHOLDER until letterforms are outlined to vector paths. The
  text-mode rendering depends on ${brand.fonts.display.family} being
  loaded — the web UI loads it self-hosted under ui/static/fonts/
  so this works in-product. For press kits or external embeds, run
  through a vector editor to outline the letterforms to <path>.
-->
<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 280 120"
  role="img"
  aria-label="${brand.displayName}"
>
  <title>${brand.displayName}</title>
  <text
    x="50%"
    y="92"
    text-anchor="middle"
    fill="${v.fill}"
    font-family="${family}"
    font-size="96"
    font-weight="700"
    font-optical-sizing="auto"
    font-variation-settings="'opsz' 96, 'SOFT' 0, 'wght' 700"
    letter-spacing="-0.02em"
  >${brand.displayName}</text>
</svg>
`;
}

/**
 * Regenerate the AUTO-GENERATED brand-tokens block in ui/src/app.css.
 *
 * Sources:
 *   • brand.fonts.{display,body,mono} → @font-face declarations +
 *     @theme inline --font-{sans,serif,mono} tokens + body / h1-h4 /
 *     code cascade defaults + :lang(ja) Japanese fallback.
 *   • brand.colors.tokens.{light,dark} → :root + .dark CSS variable
 *     blocks, mapped onto the shadcn token graph (--background,
 *     --foreground, --primary, --accent, --sidebar-*, --chart-*).
 *   • brand.colors.primary/accent/accentSecondary → "Brand essentials"
 *     comment header explaining the palette to a reader of app.css.
 *
 * Generated block is wrapped in `/* AUTO-GENERATED:brand-tokens *\/`
 * markers so the rest of app.css (cascade defaults, view transitions,
 * media queries) stays human-authored.
 */
function applyAppCss(brand) {
  const path = join(UI, 'src', 'app.css');
  if (!existsSync(path)) {
    log.skip(`app.css — missing`);
    return;
  }
  const body = readFileSync(path, 'utf8');
  const block = buildAppCssBlock(brand);
  const markerStart =
    '/* AUTO-GENERATED:brand-tokens — Do not edit. Edit branding/brand.json + run `pnpm brand:apply`. */';
  const markerEnd = '/* /AUTO-GENERATED:brand-tokens */';
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escape(markerStart) + '[\\s\\S]*?' + escape(markerEnd), 'm');
  let next;
  if (re.test(body)) {
    next = body.replace(re, `${markerStart}\n${block}\n${markerEnd}`);
  } else {
    const anchor = '@custom-variant dark (&:is(.dark *));';
    const idx = body.indexOf(anchor);
    if (idx < 0) {
      log.warn(`app.css — anchor "${anchor}" missing; cannot insert AUTO-GENERATED block`);
      return;
    }
    const lineEnd = body.indexOf('\n', idx) + 1;
    next =
      body.slice(0, lineEnd) + `\n${markerStart}\n${block}\n${markerEnd}\n` + body.slice(lineEnd);
  }
  const changed = writeIfChanged(path, next);
  changed ? log.ok(`ui/src/app.css`) : log.skip(`ui/src/app.css — already current`);
}

/** Build the inside of the AUTO-GENERATED block: @font-face + @theme + :root + .dark. */
function buildAppCssBlock(brand) {
  return [
    appCssFontFaces(brand),
    appCssThemeInline(brand),
    appCssLightTokens(brand),
    appCssDarkTokens(brand),
  ].join('\n\n');
}

function appCssFontFaces(brand) {
  const out = [];
  out.push(
    '/* Self-hosted fonts — woff2 under ui/static/fonts/. font-display: swap so',
    ' * system fallback paints first, the woff2 swap in seamlessly. */',
    '',
  );
  for (const role of ['display', 'body', 'mono']) {
    const f = brand.fonts[role];
    if (!f) continue;
    const weightList = Array.isArray(f.weights) ? f.weights : [f.weights];
    for (const file of f.files) {
      const weight = file.weight ?? f.weights;
      const range = brand.fonts.subsetUnicodeRanges?.[file.subset];
      out.push(
        '@font-face {',
        `  font-family: '${f.family}';`,
        `  font-style: normal;`,
        `  font-weight: ${weight};`,
        `  font-display: swap;`,
        `  src: url('${file.path}') format('woff2');`,
        ...(range ? [`  unicode-range: ${range};`] : []),
        '}',
      );
    }
  }
  return out.join('\n');
}

function appCssThemeInline(brand) {
  const sans = `'${brand.fonts.body.family}', ${brand.fonts.body.fallback}`;
  const serif = `'${brand.fonts.display.family}', ${brand.fonts.display.fallback}`;
  const mono = `'${brand.fonts.mono.family}', ${brand.fonts.mono.fallback}`;
  return [
    '@theme inline {',
    '  --radius-sm: calc(var(--radius) - 4px);',
    '  --radius-md: calc(var(--radius) - 2px);',
    '  --radius-lg: var(--radius);',
    '  --radius-xl: calc(var(--radius) + 4px);',
    '  --color-background: var(--background);',
    '  --color-foreground: var(--foreground);',
    '  --color-card: var(--card);',
    '  --color-card-foreground: var(--card-foreground);',
    '  --color-popover: var(--popover);',
    '  --color-popover-foreground: var(--popover-foreground);',
    '  --color-primary: var(--primary);',
    '  --color-primary-foreground: var(--primary-foreground);',
    '  --color-secondary: var(--secondary);',
    '  --color-secondary-foreground: var(--secondary-foreground);',
    '  --color-muted: var(--muted);',
    '  --color-muted-foreground: var(--muted-foreground);',
    '  --color-accent: var(--accent);',
    '  --color-accent-foreground: var(--accent-foreground);',
    '  --color-accent-secondary: var(--accent-secondary);',
    '  --color-destructive: var(--destructive);',
    '  --color-destructive-foreground: var(--destructive-foreground);',
    '  --color-border: var(--border);',
    '  --color-input: var(--input);',
    '  --color-ring: var(--ring);',
    '  --color-chart-1: var(--chart-1);',
    '  --color-chart-2: var(--chart-2);',
    '  --color-chart-3: var(--chart-3);',
    '  --color-chart-4: var(--chart-4);',
    '  --color-chart-5: var(--chart-5);',
    '  --color-sidebar: var(--sidebar);',
    '  --color-sidebar-foreground: var(--sidebar-foreground);',
    '  --color-sidebar-primary: var(--sidebar-primary);',
    '  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);',
    '  --color-sidebar-accent: var(--sidebar-accent);',
    '  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);',
    '  --color-sidebar-border: var(--sidebar-border);',
    '  --color-sidebar-ring: var(--sidebar-ring);',
    '',
    "  /* Font stacks — Tailwind's font-sans / font-serif / font-mono resolve to these. */",
    `  --font-sans: ${sans};`,
    `  --font-serif: ${serif};`,
    `  --font-mono: ${mono};`,
    '}',
  ].join('\n');
}

function appCssTokenBlock(selector, tokens) {
  const out = [`${selector} {`];
  if (selector === ':root') out.push('  --radius: 0.625rem;');
  for (const [key, value] of Object.entries(tokens)) {
    if (key === 'chart') {
      for (let i = 0; i < value.length; i++) out.push(`  --chart-${i + 1}: ${value[i]};`);
      continue;
    }
    if (key.startsWith('$')) continue;
    const cssVar = '--' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
    out.push(`  ${cssVar}: ${value};`);
  }
  out.push('}');
  return out.join('\n');
}

function appCssLightTokens(brand) {
  return appCssTokenBlock(':root', brand.colors.tokens.light);
}

function appCssDarkTokens(brand) {
  return appCssTokenBlock('.dark', brand.colors.tokens.dark);
}

function applyAppHtml(brand) {
  // app.html runs an INLINE script before SvelteKit hydrates (theme
  // bootstrap to avoid light-mode flash). That script can't import TS
  // modules, so the brand-derived values are baked in at build time
  // here. Brand changes → re-run apply-brand → app.html updates.
  //
  // Every brand-derived literal in app.html lives in the `subs` table
  // below -- adding a new value means adding a row here, NOT editing
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
    // localStorage:<brand>:theme key -- must match what theme.svelte.ts writes
    [/'[^']*:theme'/, `'${brand.name}:theme'`],
    // Mask icon color (Safari pinned-tab) -- use the brand accent.
    // Reads `colors.accent` (new schema) with legacy `accentEmeraldDark`
    // fallback for any unmigrated forks. Falls through to `primary` if
    // neither accent is defined.
    [
      /(rel="mask-icon"[^>]*color=")[^"]*(")/,
      `$1${brand.colors.accent ?? brand.colors.accentEmeraldDark ?? brand.colors.primary}$2`,
    ],
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
    // General description meta -- search snippet, browser bookmarks
    [/(name="description"\s+content=")[^"]*(")/, `$1${brand.description ?? brand.tagline}$2`],
    // Keywords -- browser auto-suggest, SEO (Bing still indexes this)
    [/(name="keywords"\s+content=")[^"]*(")/, `$1${(brand.keywords ?? []).join(', ')}$2`],
    // msapplication-TileColor + msapplication-TileImage filename
    [/(msapplication-TileColor"\s+content=")[^"]*(")/, `$1${brand.colors.primary}$2`],
    [
      /(msapplication-TileImage"[^>]*content="[^"]*\/icons\/)[^"]+(\.png")/,
      `$1${brand.name}-256$2`,
    ],
    // Icon paths -- every <link rel="icon"> or apple-touch-icon path that
    // references the brand-named PNG generated by scripts/native/icons/generate-icons.mjs.
    // Match any sizes/icons/<oldname>-<size>.png and rewrite to ${brand.name}-<size>.png.
    [/(icons\/)[a-z0-9_-]+(-\d+\.png)/g, (_m, pre, post) => `${pre}${brand.name}${post}`],
    // Theme colors -- dark + light from brand.colors. iOS / Android use
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
    // Reload button -- "Reload {displayName}"
    [/(>Reload\s+)[^<]+(<\/a>)/, `$1${brand.displayName}$2`],
    // Inline SVG gradient stops match logo.svg -- pulled from brand.colors
    // in case the brand-gradient colors get swapped via brand.json. We
    // match the THREE gradient stops in order.
    [/(<stop offset="0%" stop-color=")[^"]+(")/, `$1${brand.colors.gradientStart ?? '#4a5b6d'}$2`],
    [/(<stop offset="55%" stop-color=")[^"]+(")/, `$1${brand.colors.gradientMid ?? '#7a8c6d'}$2`],
    [/(<stop offset="100%" stop-color=")[^"]+(")/, `$1${brand.colors.gradientEnd ?? '#c89b4a'}$2`],
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
    // Stable identity -- Chrome PWA install treats this as the app's ID.
    // Changing it later prompts a reinstall, so derive from brand id.
    m.id = `/?source=pwa&app=${brand.name}`;
    // display_override -- 'window-controls-overlay' lets Chrome PWAs draw
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
    // Categories -- Chrome surfaces these in PWA discovery.
    m.categories = ['productivity', 'utilities', 'business'];
    // Protocol handler -- lets `heron://` register at PWA install time
    // on Chrome/Edge so links open the PWA instead of the browser.
    m.protocol_handlers = [
      {
        protocol: `web+${brand.identifiers.urlScheme}`,
        url: '/?url=%s',
      },
    ];
    // Rebuild icon list -- keep SVG (resolution-independent) + every
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
  // where the URL scheme / service type / app group live -- change in
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
    `  capacitorPluginName: ${JSON.stringify(brand.identifiers.capacitorPluginName ?? 'NativePlugin')},`,
    `  colors: ${JSON.stringify(brand.colors, null, 2).replace(/\n/g, '\n  ')},`,
    `  fonts: ${JSON.stringify(brand.fonts, null, 2).replace(/\n/g, '\n  ')},`,
    `  voice: ${JSON.stringify(brand.voice, null, 2).replace(/\n/g, '\n  ')},`,
    `  mascot: ${JSON.stringify(brand.mascot, null, 2).replace(/\n/g, '\n  ')},`,
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
    `  /** Native iOS NetworkMonitor.swift dispatches this when path changes`,
    `   *  (wifi ↔ cellular ↔ offline). Payload: { online: boolean }. The`,
    `   *  online-status store + every SSE client listens for it to react to`,
    `   *  true-offline before navigator.onLine catches up. */`,
    `  netStatus: \`\${BRAND.name}:net-status\`,`,
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
    ` * where one site reads 'heron:authed' and another writes`,
    ` * 'heron:authed' or similar. */`,
    `export const BRAND_STORAGE_KEYS = {`,
    `  /** '1' iff the user has a live local-auth marker — used by the`,
    `   * layout boot path for the sync-bounce-to-/login race. */`,
    `  authed: \`\${BRAND.name}:authed\`,`,
    `  /** Bearer token captured from better-auth's Set-Auth-Token`,
    `   * header. Required for the Capacitor WebView (cookies don't`,
    `   * cross from heron:// to http://) and mirrored into App`,
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
  // ErrorReporter.swift is the canonical example -- same source, 4 copies.
  const sharedFiles = ['ErrorReporter.swift'];
  const targets = ['AppWidget', 'AppLiveActivity', 'AppShareExtension'];
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
  // Every Xcode target that compiles Swift needs its own Brand.swift --
  // Xcode app-extension AND watchOS-app targets can't import constants
  // from the host (Swift module system limitation). One source-of-truth
  // template, N copies, one place to edit (branding/brand.json).
  const paths = [
    join(UI, 'ios', 'App', 'App', 'Brand.swift'),
    join(UI, 'ios', 'App', 'AppWidget', 'Brand.swift'),
    join(UI, 'ios', 'App', 'AppLiveActivity', 'Brand.swift'),
    join(UI, 'ios', 'App', 'AppShareExtension', 'Brand.swift'),
    // WatchApp is a separate watchOS target. Without this copy
    // the Watch had to hardcode "group.com.heron.app" and
    // "heron://queue" everywhere -- a rebrand drift waiting to
    // happen. The Watch's Brand.swift mirrors the host's verbatim.
    join(UI, 'ios', 'App', 'WatchApp', 'Brand.swift'),
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
    `    /// Capacitor JS↔Swift bridge name. Must match TS registerPlugin('...') call.`,
    `    static let capacitorPluginName = "${brand.identifiers.capacitorPluginName ?? 'NativePlugin'}"`,
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
    `        /// NativePlugin.setSharedBearerToken; cleared on`,
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
    ``,
    `    /// NSUserActivity type for Handoff between Watch / Widget /`,
    `    /// Live Activity → iPhone. Pattern: "<bundleId>.handoff.<kind>".`,
    `    /// E.g. handoffActivityType("interview-prep") →`,
    `    /// "com.heron.app.handoff.interview-prep". iPhone's AppDelegate`,
    `    /// gates incoming activities on the bundleId prefix so any rogue`,
    `    /// app can't push us into a foreign view.`,
    `    static func handoffActivityType(_ kind: String) -> String {`,
    `        return "\\(bundleId).handoff.\\(kind)"`,
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
  // No-op for now -- most AGENTS.md content is project guidance, not brand.
  // The brand-derived strings inside it (com.heron.app, heron://)
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
    // Cache says "no work to do" -- but verify the canonical generated outputs
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
  const brand = loadBrand();
  // Capture the previous snapshot BEFORE writeSnapshot overwrites it.
  // maybeApplyGitHubConfig (called at the end) needs the pre-apply
  // repo block to decide whether to auto-chain into `gh:apply`.
  const prevSnapshot = loadSnapshot();
  // Drift check runs BEFORE shouldSkip -- a destructive rebrand should
  // never be hidden by a stale cache hit. If REBRAND_CONFIRMED=1 isn't
  // set when destructive fields drift, this exits 1.
  checkBrandDrift(brand);
  if (shouldSkip()) {
    console.log('✓ brand inputs unchanged — apply-brand short-circuited');
    return;
  }
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
  applyAppCss(brand);

  log.step('Branding assets');
  applyWordmarks(brand);

  log.step('Branding markdown sections');
  applyMarkdownSections(brand);

  log.step('Fastlane');
  applyFastlaneAppfile(brand);
  applyFastfile(brand);

  log.step('Build scripts');
  applyAddXcodeTargets(brand);

  log.step('Release tooling');
  applyReleasePleaseConfig(brand);
  applyGitHubWorkflows(brand);
  applyGitHubIssueTemplates(brand);
  applyExtensionFolders(brand);

  log.step('Docs');
  applyAGENTSMd(brand);

  regenerateIcons();

  recordApplied();
  writeSnapshot(brand);

  // Auto-chain into gh:apply if brand.json::repo changed AND `gh` is
  // authed. Best-effort: silent skip on no-auth, warn-only on error.
  maybeApplyGitHubConfig(brand, prevSnapshot);

  // Auto-stage the mutated files when invoked from a git hook (or any
  // caller that passes --stage). Avoids the brittle hard-coded `git
  // add` list the pre-commit hook used to carry (which silently drifted
  // every time apply-brand learned to touch a new file).
  //
  // The MODIFIED_FILES set is populated by the writeFileSync /
  // copyFileSync wrappers near the top of this file -- ANY new write
  // site is captured automatically with no maintenance.
  if (process.argv.includes('--stage') && MODIFIED_FILES.size > 0) {
    const allPaths = Array.from(MODIFIED_FILES);

    // Filter out paths that .gitignore matches -- apply-brand writes a
    // few derived artifacts under gitignored dirs (the apply-brand
    // cache under scripts/native/icons/_build/ is the canonical case),
    // and `git add` aborts the ENTIRE batch if any one path is ignored.
    // `git check-ignore -v <paths…>` returns the ignored subset; we
    // subtract that to get the stageable set.
    //
    // Exit codes:
    //   0  = at least one path is ignored (stdout lists them)
    //   1  = no paths are ignored (stdout empty)
    //   ≥2 = real error (e.g. not in a git work tree) -- fall through
    let ignored = new Set();
    try {
      const result = execSync(
        `git check-ignore --no-index -v -- ${allPaths.map((p) => `"${p}"`).join(' ')}`,
        { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' },
      );
      // Each line: "<source>\t<file>" (when -v is set)
      for (const line of result.split('\n')) {
        const file = line.split('\t').pop()?.trim();
        if (file) ignored.add(file);
      }
    } catch (err) {
      // status 1 = no matches (normal); anything else = real error.
      if (err.status === 1) {
        // No ignored paths -- nothing to subtract.
      } else if (err.stdout) {
        // status 0 came as throw because check-ignore exits 0 ONLY
        // when ≥1 path is ignored, which Node may flag if combined
        // with non-empty stderr. Parse stdout anyway.
        for (const line of err.stdout.toString().split('\n')) {
          const file = line.split('\t').pop()?.trim();
          if (file) ignored.add(file);
        }
      } else {
        log.warn(`--stage: check-ignore failed (${err.message.split('\n')[0]})`);
      }
    }

    const stageable = allPaths.filter((p) => !ignored.has(p));

    if (stageable.length === 0) {
      log.skip(`--stage: nothing to stage (all ${allPaths.length} write(s) gitignored)`);
    } else {
      try {
        execSync(`git add -- ${stageable.map((p) => `"${p}"`).join(' ')}`, {
          cwd: ROOT,
          stdio: 'pipe',
        });
        const skipped = allPaths.length - stageable.length;
        const note = skipped > 0 ? ` (${skipped} gitignored, skipped)` : '';
        log.ok(`auto-staged ${stageable.length} file(s) for commit${note}`);
      } catch (e) {
        // Hook-level failures (e.g. running outside a git work tree)
        // shouldn't abort apply-brand -- surface as a warning so the
        // developer notices but the brand apply itself still
        // succeeded.
        log.warn(`--stage: git add failed (${e.message.split('\n')[0]})`);
      }
    }
  }

  console.log(`\n${GREEN}✓${RESET} brand applied — every consumer reads from branding/brand.json`);
}

/**
 * Auto-invoke `pnpm gh:apply` when the `brand.json::repo` block changed
 * since the last snapshot AND `gh` is authed on the local machine.
 *
 * Rationale: apply-brand owns local-file propagation; gh:apply owns
 * GitHub-side state (description, homepage, topics, GHAS, rulesets).
 * Chaining them makes "edit brand.json → commit" the single workflow,
 * matching the SSOT contract documented in branding/REBRAND-PROCESS.md.
 *
 * Skip conditions (each a deliberate design choice):
 *
 *   • No prior snapshot -- first-ever run, user hasn't yet demonstrated
 *     intent to manage GitHub state via this repo. They may not even
 *     own the repo yet (fresh fork).
 *   • repo block unchanged -- gh:apply is idempotent but a network
 *     round-trip with no expected work is wasted time.
 *   • `gh auth status` fails -- CI without GH_TOKEN, dev container
 *     without gh installed, etc. Print one line + continue; the next
 *     authed run catches up.
 *
 * Errors during the gh:apply child process are warn-only -- apply-brand's
 * own file changes are already on disk, and gh:apply can be re-invoked
 * manually any time via `pnpm gh:apply`.
 */
function maybeApplyGitHubConfig(brand, prevSnapshot) {
  if (!prevSnapshot) return;
  if (!brand.repo) return;

  // Fields that map onto gh:apply's reconciliation surface. Other
  // brand.json::repo keys (url, issues, docs) are informational --
  // they don't drive any `gh api` call.
  const REPO_FIELDS = ['description', 'homepage', 'topics', 'owner', 'name'];
  const repoChanged = REPO_FIELDS.some((f) => {
    const before = prevSnapshot.repo?.[f];
    const after = brand.repo?.[f];
    return JSON.stringify(before) !== JSON.stringify(after);
  });
  if (!repoChanged) return;

  log.step('GitHub-side state (auto-chained from brand.json::repo)');

  try {
    execSync('gh auth status', { stdio: 'pipe' });
  } catch {
    log.skip('gh:apply — `gh` not authed (run `gh auth login` then `pnpm gh:apply`)');
    return;
  }

  try {
    execSync('node scripts/system/apply-github-config.mjs', {
      cwd: ROOT,
      stdio: 'inherit',
    });
  } catch {
    log.warn('gh:apply failed — run `pnpm gh:verify` to diagnose, then `pnpm gh:apply` manually.');
  }
}

// CommonJS require shim for the version-display in apply()
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

apply();
