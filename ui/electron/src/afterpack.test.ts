// Regression guard for the Electron Fuses hardening.
//
// WHY: build/afterPack.js had correct fuse-flip logic AND passed its own logic
// checks, but it was NOT wired into electron-builder.config.json -- so the
// PACKAGED binary shipped with every fuse at its insecure DEFAULT (RunAsNode
// enabled, OnlyLoadAppFromAsar disabled, ...). A green unit test of the hook is
// worthless if electron-builder never invokes it. This test pins BOTH:
//   1. the config actually references build/afterPack.js (the wiring), and
//   2. the hook flips the six fuses to their hardened values.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ELECTRON_DIR = join(__dirname, '..');

describe('Electron Fuses afterPack wiring', () => {
  it('electron-builder.config.json wires afterPack to an existing hook file', () => {
    const cfg = JSON.parse(
      readFileSync(join(ELECTRON_DIR, 'electron-builder.config.json'), 'utf8'),
    );
    expect(cfg.afterPack, 'afterPack hook must be wired or fuses never flip').toBeTruthy();
    expect(existsSync(join(ELECTRON_DIR, cfg.afterPack))).toBe(true);
  });
});

describe('afterPack sets the hardening fuses to their secure values', () => {
  // afterPack.js is a CommonJS build hook that `require('@electron/fuses')`;
  // vitest's module mock can't intercept that native require, so assert the
  // flip values at the SOURCE level (the actual flipped values were also
  // validated live off the packaged binary during end-to-end verification).
  const src = readFileSync(join(ELECTRON_DIR, 'build', 'afterPack.js'), 'utf8');
  const flagged = (opt: string, value: 'true' | 'false') =>
    new RegExp(`FuseV1Options\\.${opt}\\]\\s*:\\s*${value}`).test(src);

  it('disables RunAsNode / NodeOptions env / CLI inspect (no Node-reinvoke vectors)', () => {
    expect(flagged('RunAsNode', 'false')).toBe(true);
    expect(flagged('EnableNodeOptionsEnvironmentVariable', 'false')).toBe(true);
    expect(flagged('EnableNodeCliInspectArguments', 'false')).toBe(true);
  });

  it('enables cookie encryption + ASAR integrity + only-load-from-asar', () => {
    expect(flagged('EnableCookieEncryption', 'true')).toBe(true);
    expect(flagged('EnableEmbeddedAsarIntegrityValidation', 'true')).toBe(true);
    expect(flagged('OnlyLoadAppFromAsar', 'true')).toBe(true);
  });
});
