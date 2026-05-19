/**
 * Capacitor / native-brand integration tests.
 *
 * Brand-consistency assertions across every Capacitor consumer:
 *   iOS Info.plist, AndroidManifest, Brand.swift, brand.ts,
 *   manifest.webmanifest, electron-builder, fastlane Appfile, favicon.
 *
 * Any drift between branding/brand.json and a downstream consumer fails
 * here — keeps every rebrand atomic.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

function readFile(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}
function exists(rel: string): boolean {
  return fs.existsSync(path.join(REPO_ROOT, rel));
}

const brand = JSON.parse(readFile('branding/brand.json'));
const { bundleId, urlScheme, appGroup } = brand.identifiers;
const { name, displayName } = brand;

describe('Capacitor brand consistency — iOS', () => {
  it('Info.plist contains bundleId', () => {
    if (!exists('ui/ios/App/App/Info.plist')) return;
    const plist = readFile('ui/ios/App/App/Info.plist');
    expect(plist).toContain(bundleId);
  });

  it('Info.plist contains urlScheme', () => {
    if (!exists('ui/ios/App/App/Info.plist')) return;
    expect(readFile('ui/ios/App/App/Info.plist')).toContain(urlScheme);
  });

  it('Brand.swift exposes bundleId', () => {
    if (!exists('ui/ios/App/App/Brand.swift')) return;
    expect(readFile('ui/ios/App/App/Brand.swift')).toContain(bundleId);
  });

  it('Brand.swift exposes urlScheme', () => {
    if (!exists('ui/ios/App/App/Brand.swift')) return;
    expect(readFile('ui/ios/App/App/Brand.swift')).toContain(urlScheme);
  });

  it('Every extension target has its own Brand.swift', () => {
    const targets = ['AppWidget', 'AppLiveActivity', 'AppShareExtension', 'WatchApp'];
    for (const t of targets) {
      const p = `ui/ios/App/${t}/Brand.swift`;
      if (exists(`ui/ios/App/${t}/`)) {
        expect(exists(p), `missing ${p}`).toBe(true);
      }
    }
  });
});

describe('Capacitor brand consistency — Android', () => {
  it('build.gradle contains bundleId (AndroidManifest uses ${applicationId})', () => {
    // AndroidManifest references the bundle via `${applicationId}`
    // placeholder substituted by Gradle. The literal lives in build.gradle.
    const bg = 'ui/android/app/build.gradle';
    if (!exists(bg)) return;
    expect(readFile(bg)).toContain(bundleId);
  });

  it('strings.xml contains displayName', () => {
    const xml = 'ui/android/app/src/main/res/values/strings.xml';
    if (!exists(xml)) return;
    expect(readFile(xml)).toContain(displayName);
  });
});

describe('Capacitor brand consistency — Web manifest + favicon', () => {
  it('manifest.webmanifest contains displayName', () => {
    const mf = 'ui/static/manifest.webmanifest';
    if (!exists(mf)) return;
    expect(readFile(mf)).toContain(displayName);
  });

  it('favicon.svg exists', () => {
    expect(exists('ui/static/favicon.svg')).toBe(true);
  });
});

describe('Capacitor brand consistency — Electron + Fastlane', () => {
  it('electron-builder config references bundleId', () => {
    const cfg = 'ui/electron/electron-builder.config.json';
    if (!exists(cfg)) return;
    expect(readFile(cfg)).toContain(bundleId);
  });

  it('fastlane Appfile references bundleId', () => {
    const af = 'ui/ios/App/fastlane/Appfile';
    if (!exists(af)) return;
    expect(readFile(af)).toContain(bundleId);
  });
});

describe('Brand TS exports', () => {
  it('ui/src/lib/client/brand.ts exists + exports BRAND', () => {
    const ts = 'ui/src/lib/client/brand.ts';
    expect(exists(ts)).toBe(true);
    expect(readFile(ts)).toContain('BRAND');
  });

  it('ui/electron/src/brand.ts exists', () => {
    expect(exists('ui/electron/src/brand.ts')).toBe(true);
  });
});

describe('Capacitor — replaces obsolete verify-capacitor.mjs checks', () => {
  // The legacy verifier had 3 stale needles pointing at the pre-split
  // deep-links.ts. After deep-links.ts → {deep-links.ts +
  // deep-links-parser.ts}, those needles moved. Below: the same intent
  // expressed against the current layout, no spawn needed.

  it('deep-link parser imports BRAND from generated brand.ts', () => {
    const parser = 'ui/src/lib/client/deep-links-parser.ts';
    if (!exists(parser)) return;
    expect(readFile(parser)).toMatch(/from\s+['"]\.\/brand['"]/);
  });

  it('theme store uses BRAND prefix in storage key', () => {
    const ts = 'ui/src/lib/theme.svelte.ts';
    if (!exists(ts)) return;
    expect(readFile(ts)).toMatch(/BRAND_STORAGE_KEYS|BRAND\.name/);
  });

  it('deep-link parser handles every documented route branch', () => {
    const parser = 'ui/src/lib/client/deep-links-parser.ts';
    if (!exists(parser)) return;
    const src = readFile(parser);
    for (const route of ['job', 'inbox', 'pipeline', 'queue', 'applied']) {
      expect(src, `parser missing branch for "${route}"`).toContain(route);
    }
  });
});

describe('apply-brand drift gate — protects against accidental destructive rebrand', () => {
  const SNAPSHOT_REL = 'branding/.brand-snapshot.json';
  const BRAND_REL = 'branding/brand.json';
  const APPLY_BRAND = 'scripts/native/apply-brand.mjs';

  function stashBackups() {
    if (exists(SNAPSHOT_REL))
      fs.copyFileSync(
        path.join(REPO_ROOT, SNAPSHOT_REL),
        path.join(REPO_ROOT, SNAPSHOT_REL + '.test-bak'),
      );
    fs.copyFileSync(path.join(REPO_ROOT, BRAND_REL), path.join(REPO_ROOT, BRAND_REL + '.test-bak'));
  }

  function restoreBackups() {
    if (exists(SNAPSHOT_REL + '.test-bak')) {
      fs.copyFileSync(
        path.join(REPO_ROOT, SNAPSHOT_REL + '.test-bak'),
        path.join(REPO_ROOT, SNAPSHOT_REL),
      );
      fs.unlinkSync(path.join(REPO_ROOT, SNAPSHOT_REL + '.test-bak'));
    }
    fs.copyFileSync(path.join(REPO_ROOT, BRAND_REL + '.test-bak'), path.join(REPO_ROOT, BRAND_REL));
    fs.unlinkSync(path.join(REPO_ROOT, BRAND_REL + '.test-bak'));
    // Remove any test-generated MIGRATION files
    for (const f of fs.readdirSync(path.join(REPO_ROOT, 'branding'))) {
      if (/^MIGRATION-\d{4}-\d{2}-\d{2}\.md$/.test(f))
        fs.unlinkSync(path.join(REPO_ROOT, 'branding', f));
    }
    // Roll the snapshot forward to match restored brand.json so the next
    // real apply-brand run doesn't see drift.
    execSync(`node ${APPLY_BRAND}`, {
      cwd: REPO_ROOT,
      env: { ...process.env, REBRAND_CONFIRMED: '1', ALLOW_NODE_VERSION_MISMATCH: '1' },
      stdio: 'pipe',
    });
  }

  function runApplyBrand(env: Record<string, string> = {}): {
    exitCode: number;
    stdout: string;
    stderr: string;
  } {
    try {
      const stdout = execSync(`node ${APPLY_BRAND}`, {
        cwd: REPO_ROOT,
        env: { ...process.env, ALLOW_NODE_VERSION_MISMATCH: '1', ...env },
        stdio: 'pipe',
        encoding: 'utf8',
      });
      return { exitCode: 0, stdout, stderr: '' };
    } catch (e: any) {
      return {
        exitCode: e.status ?? 1,
        stdout: e.stdout?.toString() ?? '',
        stderr: e.stderr?.toString() ?? '',
      };
    }
  }

  function writeBrandJson(brand: any) {
    fs.writeFileSync(path.join(REPO_ROOT, BRAND_REL), JSON.stringify(brand, null, 2) + '\n');
  }

  it('non-destructive change (tagline edit) runs cleanly', () => {
    stashBackups();
    try {
      const b = JSON.parse(readFile(BRAND_REL));
      b.tagline = 'Test tagline.';
      writeBrandJson(b);
      const result = runApplyBrand();
      expect(result.exitCode).toBe(0);
    } finally {
      restoreBackups();
    }
  }, 120_000);

  it('destructive change (bundleId) WITHOUT REBRAND_CONFIRMED exits non-zero', () => {
    stashBackups();
    try {
      const b = JSON.parse(readFile(BRAND_REL));
      b.identifiers.bundleId = 'com.heron.testfork';
      writeBrandJson(b);
      const result = runApplyBrand();
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/DESTRUCTIVE rebrand detected/);
      expect(result.stderr).toMatch(/identifiers\.bundleId/);
      expect(result.stderr).toMatch(/REBRAND_CONFIRMED=1/);
    } finally {
      restoreBackups();
    }
  }, 120_000);

  it('destructive change WITH REBRAND_CONFIRMED=1 succeeds + emits MIGRATION', () => {
    stashBackups();
    try {
      const b = JSON.parse(readFile(BRAND_REL));
      b.identifiers.bundleId = 'com.heron.testfork';
      b.identifiers.urlScheme = 'heronfork';
      writeBrandJson(b);
      const result = runApplyBrand({ REBRAND_CONFIRMED: '1' });
      expect(result.exitCode).toBe(0);
      const migrations = fs
        .readdirSync(path.join(REPO_ROOT, 'branding'))
        .filter((f) => /^MIGRATION-\d{4}-\d{2}-\d{2}\.md$/.test(f));
      expect(migrations.length).toBeGreaterThan(0);
      const migrationBody = fs.readFileSync(
        path.join(REPO_ROOT, 'branding', migrations[0]),
        'utf8',
      );
      expect(migrationBody).toMatch(/identifiers\.bundleId/);
      expect(migrationBody).toMatch(/identifiers\.urlScheme/);
      expect(migrationBody).toMatch(/com\.heron\.testfork/);
    } finally {
      restoreBackups();
    }
  }, 120_000);

  it('DESTRUCTIVE_FIELDS list covers every App-Store-locked identifier', () => {
    const src = readFile('scripts/native/apply-brand.mjs');
    // The 7 identifiers that cannot be reverted at the App Store level.
    for (const field of [
      `'name'`,
      `'identifiers.bundleId'`,
      `'identifiers.appGroup'`,
      `'identifiers.urlScheme'`,
      `'identifiers.serviceType'`,
      `'identifiers.keychainService'`,
      `'identifiers.capacitorPluginName'`,
    ]) {
      expect(src, `DESTRUCTIVE_FIELDS missing ${field}`).toContain(field);
    }
  });
});

describe('doc-meta convention — every in-scope .md has AUTO-GENERATED:doc-meta', () => {
  // Single source of truth: this list mirrors the targets array in
  // scripts/native/apply-brand.mjs::applyMarkdownSections. Any addition
  // here must also be added there + vice versa. Drift between the two
  // breaks the standardization convention.
  const SCOPED_DOCS = [
    'branding/BRAND.md',
    'branding/COLORS.md',
    'branding/TYPOGRAPHY.md',
    'branding/VOICE.md',
    'branding/MASCOT.md',
    'branding/SOCIAL-CARD.md',
    'branding/PRESS.md',
    'branding/REBRAND-PROCESS.md',
    'README.md',
    'AGENTS.md',
    'GEMINI.md',
    '.github/CODE_OF_CONDUCT.md',
    '.github/CONTRIBUTING.md',
    '.github/SECURITY.md',
    'docs/ARCHITECTURE.md',
    'docs/CUSTOMIZATION.md',
    'docs/DATA_CONTRACT.md',
    'docs/GOVERNANCE.md',
    'docs/LEGAL_DISCLAIMER.md',
    'docs/NATIVE.md',
    'docs/SETUP.md',
    'docs/STATUS_MODEL.md',
    'docs/TESTING.md',
    'docs/TRADEMARK.md',
    'docs/WATCH.md',
    'templates/README.md',
    'ui/README.md',
  ];

  it.each(SCOPED_DOCS)('%s exists and has the doc-meta marker', (rel) => {
    expect(exists(rel), `${rel} missing`).toBe(true);
    const body = readFile(rel);
    expect(body, `${rel} missing AUTO-GENERATED:doc-meta`).toMatch(
      /<!-- AUTO-GENERATED:doc-meta -->/,
    );
    expect(body, `${rel} missing closing /AUTO-GENERATED:doc-meta`).toMatch(
      /<!-- \/AUTO-GENERATED:doc-meta -->/,
    );
  });

  it.each(SCOPED_DOCS)('%s doc-meta content matches the expected shape', (rel) => {
    const body = readFile(rel);
    const m = body.match(
      /<!-- AUTO-GENERATED:doc-meta -->\n([\s\S]*?)\n<!-- \/AUTO-GENERATED:doc-meta -->/,
    );
    expect(m, `${rel} doc-meta block malformed`).toBeTruthy();
    const content = m![1];
    // Shape: italicized one-liner with a YYYY-MM-DD date and the brand displayName.
    expect(content, `${rel}: doc-meta missing italic wrapper`).toMatch(/^\*.+\*$/);
    expect(content, `${rel}: doc-meta missing date`).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(content, `${rel}: doc-meta missing brand displayName`).toContain(displayName);
  });

  it('apply-brand.mjs target list matches the test-side SCOPED_DOCS list', () => {
    const applyBrandSrc = readFile('scripts/native/apply-brand.mjs');
    for (const rel of SCOPED_DOCS) {
      // The source uses join(ROOT, 'a', 'b.md') — match on 'b.md' as a
      // basename plus the parent dir(s). Cheap structural assertion;
      // catches "forgot to add the new doc to apply-brand's target list".
      const parts = rel.split('/');
      const basename = parts[parts.length - 1];
      expect(applyBrandSrc, `apply-brand.mjs missing target for ${rel}`).toContain(`'${basename}'`);
    }
  });

  it('every .md in the repo (outside modes/) is either in SCOPED_DOCS or exempt', () => {
    // Discover all .md files; assert each is either covered by the
    // doc-meta convention OR explicitly exempted (vendor / generated /
    // example reference / user-personal).
    function walk(dir: string, acc: string[] = []): string[] {
      const SKIP_DIRS = new Set([
        'node_modules',
        '.svelte-kit',
        'build',
        'dist',
        '_build',
        '.git',
        'Pods',
        'SourcePackages',
        'DerivedData',
        '.turbo',
        'coverage',
        '.venv',
        'data',
        'reports',
        'output',
        'writing-samples',
        '.gradle',
        'modes',
      ]);
      const fullDir = path.join(REPO_ROOT, dir);
      if (!fs.existsSync(fullDir)) return acc;
      for (const e of fs.readdirSync(fullDir)) {
        if (SKIP_DIRS.has(e)) continue;
        const full = path.join(dir, e);
        const stat = fs.statSync(path.join(REPO_ROOT, full));
        if (stat.isDirectory()) walk(full, acc);
        else if (e.endsWith('.md')) acc.push(full);
      }
      return acc;
    }
    const EXEMPT = new Set([
      'CHANGELOG.md', // auto-generated by Release Please
      'CLAUDE.md', // intentional 2-line pointer
      'ui/TODO.md', // user-personal
      'ui/ios/App/CapApp-SPM/README.md', // vendor (Capacitor SPM)
      '.github/PULL_REQUEST_TEMPLATE.md', // GitHub-loaded PR scaffold, not a doc
      // Community-health files — short, GitHub-surfaces them via the
      // Community profile. Not a doc-meta candidate.
      '.github/SUPPORT.md',
      '.github/rulesets/README.md',
      // Reference examples — read-only sample content, no doc-meta needed
      'docs/examples/README.md',
      'docs/examples/article-digest-example.md',
      'docs/examples/cv-example.md',
      'docs/examples/sample-report.md',
      'docs/examples/dual-track-engineer-instructor/README.md',
      'docs/examples/dual-track-engineer-instructor/cv.md',
    ]);
    const found = walk('.');
    const unaccounted = found.filter((f) => !SCOPED_DOCS.includes(f) && !EXEMPT.has(f));
    expect(
      unaccounted,
      `These .md files are neither in SCOPED_DOCS nor EXEMPT: ${unaccounted.join(', ')}`,
    ).toEqual([]);
  });
});
