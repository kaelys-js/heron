#!/usr/bin/env node
// validate-allow-builds.mjs -- replicate pnpm's ignored-builds check locally so
// a missing or placeholder allowBuilds entry fails at `git push` (the pre-push
// verify) instead of only on a fresh CI install (ERR_PNPM_IGNORED_BUILDS).
//
// pnpm 11 requires every dependency that ships a preinstall/install/postinstall
// script to be classified in pnpm-workspace.yaml::allowBuilds as a STRICT
// boolean (true = run it, false = block it). An unlisted build-script package OR
// a non-boolean value (e.g. a leftover "set this to true or false" TODO) is a
// FATAL ERR_PNPM_IGNORED_BUILDS on a fresh install -- but it passes locally,
// where node_modules is already populated and pnpm skips the scan, so pre-push
// never caught it. This validator reads allowBuilds + scans the installed tree
// and fails on:
//   ERROR  a build-script package missing from allowBuilds
//   ERROR  an allowBuilds value that is not a strict boolean (the placeholder)
//   WARN   an allowBuilds entry no installed package needs (stale clutter)
//
// The boolean check (1) needs no node_modules, so it catches the placeholder
// even on a fresh clone. The completeness check (2) runs against node_modules
// when present (pre-push always has it installed).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Read the `allowBuilds` map from pnpm-workspace.yaml verbatim (values stay as
 *  parsed, so a non-boolean placeholder is visible to the checker). */
export function parseAllowBuilds(yamlText) {
  const doc = yaml.load(yamlText);
  const ab = doc?.allowBuilds;
  return ab && typeof ab === 'object' ? ab : {};
}

/** Set of installed package names that ship a build script (pre/post/install) --
 *  the exact set pnpm evaluates against allowBuilds on a fresh install. */
export function findBuildScriptPackages(pnpmDir) {
  const hits = new Set();
  if (!existsSync(pnpmDir)) return hits;
  for (const entry of readdirSync(pnpmDir)) {
    const inner = join(pnpmDir, entry, 'node_modules');
    if (existsSync(inner)) scanDir(inner, null, hits);
  }
  return hits;
}

function scanDir(dir, scope, hits) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const n of names) {
    if (n.startsWith('@') && !scope) {
      scanDir(join(dir, n), n, hits);
      continue;
    }
    const name = scope ? `${scope}/${n}` : n;
    const pj = join(dir, n, 'package.json');
    if (!existsSync(pj)) continue;
    try {
      const s = JSON.parse(readFileSync(pj, 'utf8')).scripts || {};
      if (s.preinstall || s.install || s.postinstall) hits.add(name);
    } catch {
      /* unreadable package.json -- skip */
    }
  }
}

/** Pure checker -- the testable core. Returns {errors, warnings}. */
export function checkAllowBuilds({ allowBuilds, buildScriptPkgs }) {
  const errors = [];
  const warnings = [];

  // 1. Every value must be a strict boolean (catches the placeholder). Needs no
  //    node_modules, so it fires even on a fresh clone.
  for (const [name, value] of Object.entries(allowBuilds)) {
    if (typeof value !== 'boolean') {
      errors.push(
        `allowBuilds["${name}"] must be true or false, got ${JSON.stringify(value)} -- ` +
          'a non-boolean is a fatal ERR_PNPM_IGNORED_BUILDS on a fresh install',
      );
    }
  }

  // 2. Every installed build-script package must be classified (true or false).
  for (const name of buildScriptPkgs) {
    if (!(name in allowBuilds)) {
      errors.push(
        `${name} ships an install script but is not in allowBuilds -- ` +
          'add it as true (run the script) or false (block it)',
      );
    }
  }

  // 3. Stale entries: listed but no installed package needs them (clutter only).
  for (const name of Object.keys(allowBuilds)) {
    if (!buildScriptPkgs.has(name)) {
      warnings.push(`allowBuilds["${name}"] matches no installed build-script package (stale?)`);
    }
  }

  return { errors, warnings };
}

function main() {
  const yamlText = readFileSync(join(ROOT, 'pnpm-workspace.yaml'), 'utf8');
  const allowBuilds = parseAllowBuilds(yamlText);
  const pnpmDir = join(ROOT, 'node_modules', '.pnpm');
  const installed = existsSync(pnpmDir);
  const buildScriptPkgs = findBuildScriptPackages(pnpmDir);
  // Completeness (check 2) + stale (check 3) need the installed tree; skip them
  // when node_modules is absent (the boolean check still guards the placeholder).
  const { errors, warnings } = checkAllowBuilds({
    allowBuilds,
    buildScriptPkgs: installed ? buildScriptPkgs : new Set(),
  });

  for (const w of warnings) console.warn(`WARN  ${w}`);

  if (errors.length > 0) {
    console.error(`FAIL validate-allow-builds -- ${errors.length} issue(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const scope = installed
    ? `${buildScriptPkgs.size} build-script package(s)`
    : 'node_modules absent';
  console.log(
    `OK validate-allow-builds -- ${Object.keys(allowBuilds).length} entries, ${scope}, all classified.`,
  );
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
