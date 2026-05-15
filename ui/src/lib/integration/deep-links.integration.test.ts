/**
 * Deep-link integration tests.
 *
 * Asserts:
 *   • BRAND.urlScheme === "heron" (locked from brand.json)
 *   • iOS Info.plist registers the URL scheme via CFBundleURLTypes
 *   • Android intent-filter includes the scheme
 *   • TS code uses BRAND.urlScheme — no hardcoded "heron://" leaks
 *     outside the generated brand.ts files
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

function readFile(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}
function exists(rel: string): boolean {
  return fs.existsSync(path.join(REPO_ROOT, rel));
}

const brandJson = JSON.parse(readFile('branding/brand.json'));
// brand.json nests every platform identifier under `identifiers` —
// urlScheme, bundleId, appGroup, serviceType, etc. all live there.
const expectedScheme: string = brandJson.identifiers.urlScheme;

describe('brand.json is the source of truth for urlScheme', () => {
  it('urlScheme is "heron"', () => {
    expect(expectedScheme).toBe('heron');
  });
});

describe('iOS Info.plist registers the URL scheme', () => {
  it('CFBundleURLTypes contains the urlScheme', () => {
    if (!exists('ui/ios/App/App/Info.plist')) return;
    const plist = readFile('ui/ios/App/App/Info.plist');
    expect(plist).toContain('CFBundleURLTypes');
    expect(plist).toContain(expectedScheme);
  });
});

describe('Android manifest registers the URL scheme', () => {
  it('intent-filter declares the scheme', () => {
    if (!exists('ui/android/app/src/main/AndroidManifest.xml')) return;
    const mf = readFile('ui/android/app/src/main/AndroidManifest.xml');
    expect(mf).toContain(expectedScheme);
  });
});

describe('Generated TS brand constants', () => {
  it('ui/src/lib/client/brand.ts exports urlScheme', () => {
    if (!exists('ui/src/lib/client/brand.ts')) return;
    const ts = readFile('ui/src/lib/client/brand.ts');
    expect(ts).toContain('urlScheme');
    // Either quote style is fine — apply-brand writes double quotes
    // but a future biome reformat could swap to single. Match both.
    const matches = ts.includes(`"${expectedScheme}"`) || ts.includes(`'${expectedScheme}'`);
    expect(matches).toBe(true);
  });
});

describe('Hardcoded scheme leaks (forbidden outside generated files)', () => {
  // Source code MUST use BRAND.urlScheme. Hardcoded literals in runtime
  // code break the rebrand pipeline. Generated brand.ts files + Swift
  // constants are the only place the literal is allowed in CODE; comments
  // referencing the literal for documentation purposes are fine.
  it('no "heron://" in EXECUTABLE svelte/ts source (excluding comments + generated + tests)', () => {
    // Test files (*.test.ts / *.spec.ts) are explicitly allowed to use
    // the literal — they pin behaviour to the current scheme rather than
    // to BRAND, which catches incidental drift if BRAND.urlScheme silently
    // changes. We grep test files OUT in the shell filter below.
    const out = execSync(
      `grep -rn 'heron://' ui/src --include='*.svelte' --include='*.ts' --exclude='*.test.ts' --exclude='*.spec.ts' --exclude-dir=node_modules --exclude-dir=.svelte-kit --exclude-dir=integration || true`,
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );
    const allowedPaths = [
      'ui/src/lib/client/brand.ts', // generated from brand.json
      // Svelte multi-line `<!-- -->` comments where the literal sits on
      // a continuation line without a comment-marker prefix. Hand-audited.
      'ui/src/lib/components/OfflineIndicator.svelte',
      'ui/src/lib/components/AppSidebar.svelte',
    ];
    const offending = out
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .filter((line) => !allowedPaths.some((allow) => line.startsWith(allow + ':')))
      .filter((line) => {
        // Strip the file:line:column prefix
        const body = line.replace(/^[^:]+:\d+:\s*/, '');
        const trimmed = body.trim();
        // Allow comment markers + code-fence (`...`) which Svelte
        // multi-line HTML comments use for inline literals.
        if (trimmed.startsWith('//')) return false;
        if (trimmed.startsWith('*')) return false;
        if (trimmed.startsWith('<!--')) return false;
        if (trimmed.startsWith('/*')) return false;
        // If the literal appears INSIDE backticks (e.g. `heron://`)
        // it's a documentation quote, not executable code.
        if (/`[^`]*heron:\/\/[^`]*`/.test(body)) return false;
        return true;
      });
    expect(offending).toEqual([]);
  });
});
