#!/usr/bin/env node
/**
 * help — print every native command at a glance.
 * Runs when you forget the names. `pnpm native` triggers this.
 */
import { c, capture, which } from './_lib.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

console.log(c.bold('\ncareer-ops native commands\n'));

const groups = [
  {
    title: 'First-time setup',
    cmds: [
      ['pnpm setup:native', 'Interactive wizard — Apple secrets, GitHub secrets, Xcode targets'],
    ],
  },
  {
    title: 'Daily dev',
    cmds: [
      ['pnpm dev', 'Web only (Vite dev server)'],
      ['pnpm dev:desktop', 'Electron window + HMR — UI changes hot-reload'],
      ['pnpm dev:ios', 'iOS sim + dev server + Xcode opens'],
    ],
  },
  {
    title: 'Branding',
    cmds: [
      ['pnpm brand:apply', 'Propagate branding/brand.json into every config (idempotent)'],
      ['edit branding/brand.json', 'Single source of truth for app name, bundle ID, colors, URLs'],
      ['edit branding/logo.svg', 'Single source of truth for the icon'],
    ],
  },
  {
    title: 'Building locally',
    cmds: [
      ['pnpm build:desktop', 'Local DMG / .exe / .AppImage in ui/electron/dist/'],
      ['pnpm build:ios', 'Upload to TestFlight (one shot)'],
      ['pnpm icons', 'Regenerate all platform icons (from branding/logo.svg)'],
    ],
  },
  {
    title: 'Release (mostly automatic)',
    cmds: [
      [
        '(auto)',
        'Conventional Commit (feat:/fix:/...) on main → Release Please opens release PR → merge → CI builds + publishes',
      ],
      [
        'pnpm release patch',
        'Manual override: 1.6.0 → 1.6.1 → tag → push (bypasses Release Please)',
      ],
      ['pnpm release minor', 'Manual override: 1.6.0 → 1.7.0'],
      ['pnpm release major', 'Manual override: 1.6.0 → 2.0.0'],
    ],
  },
  {
    title: 'Diagnostics',
    cmds: [
      ['node verify-capacitor.mjs', '90-check sanity verifier'],
      ['pnpm doctor', 'Existing project health check'],
    ],
  },
];

for (const g of groups) {
  console.log(c.cyan('  ' + g.title));
  for (const [cmd, desc] of g.cmds) {
    console.log(`    ${c.bold(cmd.padEnd(28))} ${c.dim(desc)}`);
  }
  console.log('');
}

// Quick status indicators
console.log(c.cyan('  Status'));
const have = (b) => (which(b) ? c.green('✓') : c.red('✗'));
console.log(`    ${have('gh')}  gh CLI`);
console.log(`    ${have('xcodebuild')}  Xcode`);
console.log(`    ${have('pod')}  CocoaPods`);
console.log(`    ${have('bundle')}  Bundler`);
console.log(`    ${have('brew')}  Homebrew`);

const envFile = join(process.env.HOME || '', '.career-ops', 'native-env');
const haveEnv = existsSync(envFile);
console.log(
  `    ${haveEnv ? c.green('✓') : c.red('✗')}  Apple secrets configured  ${c.dim(envFile)}`,
);

console.log('');
