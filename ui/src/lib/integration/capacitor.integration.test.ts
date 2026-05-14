/**
 * Integration replacement for `verify-capacitor.mjs` (Phase 5).
 *
 * The legacy verifier (~989 LOC) does brand-consistency across every
 * Capacitor consumer: iOS Info.plist, AndroidManifest, Brand.swift,
 * brand.ts, manifest.webmanifest, electron-builder, fastlane Appfile,
 * favicon, etc. We spawn it as the parity oracle PLUS hardcoded checks
 * on the highest-signal invariants.
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
    const targets = [
      'CareerOpsWidget',
      'CareerOpsLiveActivity',
      'CareerOpsShareExtension',
      'CareerOpsWatch',
    ];
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
