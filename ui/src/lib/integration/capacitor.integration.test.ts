/**
 * Capacitor / native-brand integration tests.
 *
 * Brand-consistency assertions across every Capacitor consumer:
 *   iOS Info.plist, AndroidManifest, Brand.swift, brand.ts,
 *   manifest.webmanifest, electron-builder, fastlane Appfile, favicon.
 *
 * Any drift between branding/brand.json and a downstream consumer fails
 * here -- keeps every rebrand atomic.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { withScaffoldedTmpRepo } from '../../test-helpers/fs-fixtures';

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

describe('capacitor brand consistency — iOS', () => {
  it('info.plist contains bundleId', () => {
    if (!exists('ui/ios/App/App/Info.plist')) {
      return;
    }
    const plist = readFile('ui/ios/App/App/Info.plist');
    expect(plist).toContain(bundleId);
  });

  it('info.plist contains urlScheme', () => {
    if (!exists('ui/ios/App/App/Info.plist')) {
      return;
    }
    expect(readFile('ui/ios/App/App/Info.plist')).toContain(urlScheme);
  });

  it('brand.swift exposes bundleId', () => {
    if (!exists('ui/ios/App/App/Brand.swift')) {
      return;
    }
    expect(readFile('ui/ios/App/App/Brand.swift')).toContain(bundleId);
  });

  it('brand.swift exposes urlScheme', () => {
    if (!exists('ui/ios/App/App/Brand.swift')) {
      return;
    }
    expect(readFile('ui/ios/App/App/Brand.swift')).toContain(urlScheme);
  });

  it('every extension target has its own Brand.swift', () => {
    const targets = ['AppWidget', 'AppLiveActivity', 'AppShareExtension', 'WatchApp'];
    for (const t of targets) {
      const p = `ui/ios/App/${t}/Brand.swift`;
      if (exists(`ui/ios/App/${t}/`)) {
        expect(exists(p), `missing ${p}`).toBe(true);
      }
    }
  });

  it('watchApp/Info.plist companion identifier matches bundleId', () => {
    // WKCompanionAppBundleIdentifier must equal the iOS app's bundleId or
    // the watch app won't install. apply-brand derives it from brand.json.
    const p = 'ui/ios/App/WatchApp/Info.plist';
    if (!exists(p)) {
      return;
    }
    expect(readFile(p)).toContain(bundleId);
  });

  it('app.entitlements app-group + keychain group derive from brand.json', () => {
    const p = 'ui/ios/App/App/App.entitlements';
    if (!exists(p)) {
      return;
    }
    const ent = readFile(p);
    expect(ent).toContain(appGroup);
    expect(ent).toContain(bundleId);
  });

  it('project.pbxproj bundle identifiers all derive from bundleId', () => {
    // Every PRODUCT_BUNDLE_IDENTIFIER is bundleId + a target suffix; a
    // stale base here means a target ships under the wrong App ID.
    const p = 'ui/ios/App/App.xcodeproj/project.pbxproj';
    if (!exists(p)) {
      return;
    }
    const ids = [...readFile(p).matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([A-Za-z0-9_.]+);/g)].map(
      (m) => m[1],
    );
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(id.startsWith(bundleId), `${id} should start with ${bundleId}`).toBe(true);
    }
  });
});

describe('capacitor brand consistency — Android', () => {
  it('build.gradle contains bundleId (AndroidManifest uses ${applicationId})', () => {
    // AndroidManifest references the bundle via `${applicationId}`
    // placeholder substituted by Gradle. The literal lives in build.gradle.
    const bg = 'ui/android/app/build.gradle';
    if (!exists(bg)) {
      return;
    }
    expect(readFile(bg)).toContain(bundleId);
  });

  it('strings.xml contains displayName', () => {
    const xml = 'ui/android/app/src/main/res/values/strings.xml';
    if (!exists(xml)) {
      return;
    }
    expect(readFile(xml)).toContain(displayName);
  });
});

describe('capacitor brand consistency — Web manifest + favicon', () => {
  it('manifest.webmanifest contains displayName', () => {
    const mf = 'ui/static/manifest.webmanifest';
    if (!exists(mf)) {
      return;
    }
    expect(readFile(mf)).toContain(displayName);
  });

  it('favicon.svg exists', () => {
    expect(exists('ui/static/favicon.svg')).toBe(true);
  });
});

describe('capacitor brand consistency — Electron + Fastlane', () => {
  it('electron-builder config references bundleId', () => {
    const cfg = 'ui/electron/electron-builder.config.json';
    if (!exists(cfg)) {
      return;
    }
    expect(readFile(cfg)).toContain(bundleId);
  });

  it('fastlane Appfile references bundleId', () => {
    const af = 'ui/ios/App/fastlane/Appfile';
    if (!exists(af)) {
      return;
    }
    expect(readFile(af)).toContain(bundleId);
  });

  it('mAS entitlements app-group matches appGroup', () => {
    // entitlements.mas.plist declares the App Group shared with a
    // sideloaded iOS app under Catalyst; apply-brand keeps it in lock-step.
    const p = 'ui/electron/build/entitlements.mas.plist';
    if (!exists(p)) {
      return;
    }
    expect(readFile(p)).toContain(appGroup);
  });
});

describe('brand TS exports', () => {
  it('ui/src/lib/client/brand.ts exists + exports BRAND', () => {
    const ts = 'ui/src/lib/client/brand.ts';
    expect(exists(ts)).toBe(true);
    expect(readFile(ts)).toContain('BRAND');
  });

  it('ui/electron/src/brand.ts exists', () => {
    expect(exists('ui/electron/src/brand.ts')).toBe(true);
  });
});

describe('capacitor — replaces obsolete verify-capacitor.mjs checks', () => {
  // The legacy verifier had 3 stale needles pointing at the pre-split
  // deep-links.ts. After deep-links.ts → {deep-links.ts +
  // deep-links-parser.ts}, those needles moved. Below: the same intent
  // expressed against the current layout, no spawn needed.

  it('deep-link parser imports BRAND from generated brand.ts', () => {
    const parser = 'ui/src/lib/client/deep-links-parser.ts';
    if (!exists(parser)) {
      return;
    }
    expect(readFile(parser)).toMatch(/from\s+['"]\.\/brand['"]/);
  });

  it('theme store uses BRAND prefix in storage key', () => {
    const ts = 'ui/src/lib/theme.svelte.ts';
    if (!exists(ts)) {
      return;
    }
    expect(readFile(ts)).toMatch(/BRAND_STORAGE_KEYS|BRAND\.name/);
  });

  it('deep-link parser handles every documented route branch', () => {
    const parser = 'ui/src/lib/client/deep-links-parser.ts';
    if (!exists(parser)) {
      return;
    }
    const src = readFile(parser);
    for (const route of ['job', 'inbox', 'pipeline', 'queue', 'applied']) {
      expect(src, `parser missing branch for "${route}"`).toContain(route);
    }
  });
});

describe('apply-brand drift gate — protects against accidental destructive rebrand', () => {
  // These tests run apply-brand against a SCAFFOLDED TMPDIR via the
  // HERON_BRAND_ROOT env override defined in scripts/native/apply-brand.mjs.
  // The previous incarnation mutated `branding/brand.json` + `.brand-snapshot.json`
  // in the real working tree and relied on `restoreBackups()` in a `finally`
  // block -- which silently leaked dirt onto disk whenever the worker was
  // SIGKILLed (OOM, ctrl-c, lefthook timeout). The tmpdir pattern is fail-
  // safe: `withScaffoldedTmpRepo` removes the dir on every exit path.
  const APPLY_BRAND = path.join(REPO_ROOT, 'scripts', 'native', 'apply-brand.mjs');

  /** Run apply-brand against a tmpdir. Returns { exitCode, stdout, stderr }. */
  function runApplyBrand(
    root: string,
    extraEnv: Record<string, string> = {},
  ): { exitCode: number; stdout: string; stderr: string } {
    try {
      // execFileSync avoids the shell (no `js/shell-command-injection-
      // from-environment` flag on APPLY_BRAND). Argv-passing is the safe
      // pattern when any argument originates outside a literal.
      const stdout = execFileSync(process.execPath, [APPLY_BRAND], {
        cwd: root,
        env: {
          ...process.env,
          HERON_BRAND_ROOT: root,
          ALLOW_NODE_VERSION_MISMATCH: '1',
          ...extraEnv,
        },
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

  /** Seed `<root>/branding/.brand-snapshot.json` from the current brand.json so
   *  the next apply-brand run has a baseline to diff against. Mimics what
   *  apply-brand itself writes after a successful run. */
  function seedSnapshot(root: string): void {
    const brandSrc = fs.readFileSync(path.join(root, 'branding', 'brand.json'), 'utf8');
    fs.writeFileSync(path.join(root, 'branding', '.brand-snapshot.json'), brandSrc);
  }

  /** Mutate `<root>/branding/brand.json` via a patcher and write back. */
  function patchBrandJson(root: string, patcher: (brand: any) => void): void {
    const p = path.join(root, 'branding', 'brand.json');
    const b = JSON.parse(fs.readFileSync(p, 'utf8'));
    patcher(b);
    fs.writeFileSync(p, `${JSON.stringify(b, null, 2)}\n`);
  }

  it('non-destructive change (tagline edit) runs cleanly', async () => {
    await withScaffoldedTmpRepo(async (root) => {
      seedSnapshot(root);
      patchBrandJson(root, (b) => {
        b.tagline = 'Test tagline.';
      });
      const result = runApplyBrand(root);
      expect(result.exitCode).toBe(0);
    });
  }, 120_000);

  it('destructive change (bundleId) WITHOUT REBRAND_CONFIRMED exits non-zero', async () => {
    await withScaffoldedTmpRepo(async (root) => {
      seedSnapshot(root);
      patchBrandJson(root, (b) => {
        b.identifiers.bundleId = 'com.heron.testfork';
      });
      const result = runApplyBrand(root);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/DESTRUCTIVE rebrand detected/);
      expect(result.stderr).toMatch(/identifiers\.bundleId/);
      expect(result.stderr).toMatch(/REBRAND_CONFIRMED=1/);
    });
  }, 120_000);

  it('destructive change WITH REBRAND_CONFIRMED=1 succeeds + emits MIGRATION', async () => {
    await withScaffoldedTmpRepo(async (root) => {
      seedSnapshot(root);
      patchBrandJson(root, (b) => {
        b.identifiers.bundleId = 'com.heron.testfork';
        b.identifiers.urlScheme = 'heronfork';
      });
      const result = runApplyBrand(root, { REBRAND_CONFIRMED: '1' });
      expect(result.exitCode).toBe(0);
      const migrations = fs
        .readdirSync(path.join(root, 'branding'))
        .filter((f) => /^MIGRATION-\d{4}-\d{2}-\d{2}\.md$/.test(f));
      expect(migrations.length).toBeGreaterThan(0);
      const migrationBody = fs.readFileSync(path.join(root, 'branding', migrations[0]), 'utf8');
      expect(migrationBody).toMatch(/identifiers\.bundleId/);
      expect(migrationBody).toMatch(/identifiers\.urlScheme/);
      expect(migrationBody).toMatch(/com\.heron\.testfork/);
    });
  }, 120_000);

  it('dESTRUCTIVE_FIELDS list covers every App-Store-locked identifier', () => {
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
    'AGENTS-PRODUCT.md',
    'GEMINI.md',
    '.github/CODE_OF_CONDUCT.md',
    '.github/CONTRIBUTING.md',
    '.github/SECURITY.md',
    'docs/ARCHITECTURE.md',
    'docs/CI.md',
    'docs/COMMENT-STYLE.md',
    'docs/COMPARISON.md',
    'docs/CUSTOMIZATION.md',
    'docs/DATA_CONTRACT.md',
    'docs/DISCORD.md',
    'docs/FAQ.md',
    'docs/GOVERNANCE.md',
    'docs/INCIDENT.md',
    'docs/LEGAL_DISCLAIMER.md',
    'docs/NATIVE.md',
    'docs/PHILOSOPHY.md',
    'docs/RELEASING.md',
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
    // Shape: italicized one-liner with the brand displayName. Date
    // stamps were removed (apply-brand idempotence) -- only the brand
    // displayName is required.
    expect(content, `${rel}: doc-meta missing italic wrapper`).toMatch(/^\*.+\*$/);
    expect(content, `${rel}: doc-meta missing brand displayName`).toContain(displayName);
  });

  it('apply-brand.mjs target list matches the test-side SCOPED_DOCS list', () => {
    const applyBrandSrc = readFile('scripts/native/apply-brand.mjs');
    for (const rel of SCOPED_DOCS) {
      // The source uses join(ROOT, 'a', 'b.md') -- match on 'b.md' as a
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
        // CI/test artifact dirs -- gitignored but a local Playwright /
        // Lost Pixel run may have populated them; .md files inside (e.g.
        // Playwright's error-context.md) are not doc-meta candidates.
        'test-results',
        'playwright-report',
        'lost-pixel',
        // Agent-local state incl. gitignored worktree copies
        // (.claude/worktrees/<id>/ is a full repo checkout, not our docs).
        '.claude',
      ]);
      const fullDir = path.join(REPO_ROOT, dir);
      if (!fs.existsSync(fullDir)) {
        return acc;
      }
      for (const e of fs.readdirSync(fullDir)) {
        if (SKIP_DIRS.has(e)) {
          continue;
        }
        const full = path.join(dir, e);
        const stat = fs.statSync(path.join(REPO_ROOT, full));
        if (stat.isDirectory()) {
          walk(full, acc);
        } else if (e.endsWith('.md')) {
          acc.push(full);
        }
      }
      return acc;
    }
    const EXEMPT = new Set([
      'CHANGELOG.md', // auto-generated by Release Please
      'CLAUDE.md', // intentional 2-line pointer
      'ui/TODO.md', // user-personal
      'TODO.md', // user-personal (gitignored)
      'TODO2.md', // maintainer-personal external-setup checklist (gitignored)
      'STATE.md', // Claude per-session scratchpad (gitignored, see .gitignore)
      'TODO-INSTRUCTIONS.md', // gitignored
      'ui/ios/App/CapApp-SPM/README.md', // vendor (Capacitor SPM)
      'ui/ios/App/fastlane/README.md', // auto-generated by `bundle exec fastlane` first-run
      '.github/PULL_REQUEST_TEMPLATE.md', // GitHub-loaded PR scaffold, not a doc
      // PR template variants per .github/PULL_REQUEST_TEMPLATE/ -- GitHub
      // routes a PR to the right template via ?template= query param.
      '.github/PULL_REQUEST_TEMPLATE/breaking.md',
      '.github/PULL_REQUEST_TEMPLATE/default.md',
      '.github/PULL_REQUEST_TEMPLATE/feat.md',
      '.github/PULL_REQUEST_TEMPLATE/fix.md',
      // Community-health files -- short, GitHub-surfaces them via the
      // Community profile. Not a doc-meta candidate.
      '.github/SUPPORT.md',
      '.github/rulesets/README.md',
      // Subsystem READMEs -- short, locally-scoped, not part of the
      // brand-propagated doc set.
      '.lostpixel/baseline/README.md',
      'docs/screenshots/README.md',
      'ui/e2e/README.md',
      'scripts/README.md', // dev-facing scripts conventions (exit codes + logger), not brand-propagated
      'branding/screenshots/README.md', // per-store screenshot specs
      // all-contributors auto-generates the contributors list block.
      'CONTRIBUTORS.md',
      // Reference examples -- read-only sample content, no doc-meta needed
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

describe('app.css brand-token block — single source, no drift', () => {
  // Regression guard for the duplicate-block bug: app.css once carried the
  // AUTO-GENERATED:brand-tokens block TWICE (a script-managed `--` copy + a
  // frozen em-dash copy that won by cascade and silently overrode brand.json).
  // These assertions fail if (a) the block is duplicated again, or (b) any
  // :root/.dark token value drifts from branding/brand.json.
  const css = readFile('ui/src/app.css');
  const START = '/* AUTO-GENERATED:brand-tokens';
  const END = '/* /AUTO-GENERATED:brand-tokens */';

  it('contains EXACTLY ONE brand-tokens block', () => {
    expect(css.split(START).length - 1, 'brand-tokens start markers').toBe(1);
    expect(css.split(END).length - 1, 'brand-tokens end markers').toBe(1);
  });

  // camelCase brand key -> the --kebab-case CSS var apply-brand emits.
  const kebab = (k: string) => '--' + k.replace(/([A-Z])/g, '-$1').toLowerCase();
  const block = css.slice(css.indexOf(START), css.indexOf(END));
  const selectorBody = (sel: string) => {
    const open = block.indexOf(`${sel} {`);
    return open < 0 ? '' : block.slice(open, block.indexOf('}', open));
  };

  for (const [mode, sel] of [
    ['light', ':root'],
    ['dark', '.dark'],
  ] as const) {
    it(`${mode} :root/.dark token values match brand.json (no drift)`, () => {
      const tokens = brand.colors.tokens[mode] as Record<string, unknown>;
      const body = selectorBody(sel);
      expect(body, `${sel} block present`).not.toBe('');
      for (const [key, value] of Object.entries(tokens)) {
        if (key.startsWith('$')) continue;
        if (key === 'chart') {
          (value as string[]).forEach((c, i) =>
            expect(body, `--chart-${i + 1}`).toContain(`--chart-${i + 1}: ${c};`),
          );
          continue;
        }
        expect(body, `${kebab(key)} in ${mode}`).toContain(`${kebab(key)}: ${value};`);
      }
    });
  }
});
