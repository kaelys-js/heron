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
    title: 'Building locally',
    cmds: [
      ['pnpm build:desktop', 'Local DMG / .exe / .AppImage in ui/electron/dist/'],
      ['pnpm build:ios', 'Upload to TestFlight (one shot)'],
      ['pnpm icons', 'Regenerate all platform icons from ui/static/favicon.svg'],
    ],
  },
  {
    title: 'Release (CI takes over)',
    cmds: [
      ['pnpm release patch', '1.6.0 → 1.6.1 → tag → push → CI builds everything'],
      ['pnpm release minor', '1.6.0 → 1.7.0'],
      ['pnpm release major', '1.6.0 → 2.0.0'],
      ['pnpm release 1.7.3', 'Explicit version'],
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
console.log(`    ${haveEnv ? c.green('✓') : c.red('✗')}  Apple secrets configured  ${c.dim(envFile)}`);

console.log('');
