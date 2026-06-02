#!/usr/bin/env node
// verify-discord-config.mjs -- validate .github/discord/config.yml.
//
// Two checks, both token-free (so CI runs them before touching Discord):
//   1. JSON-Schema validation against .github/discord/config.schema.json
//      (Ajv2020) -- catches typos + wrong types + stray keys.
//   2. Referential integrity (findConfigIssues) -- every overwrite role,
//      webhook env, onboarding/welcome channel, automod alert channel,
//      system/widget channel, rules field, and image source resolves.
//
// Exit 0 = clean, 1 = at least one problem. See the .test.mjs sibling.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import yaml from 'js-yaml';
import { error } from '../lib/logger.mjs';
import {
  PERMISSION_NAMES,
  SYSTEM_CHANNEL_FLAGS,
  safeRepoPath,
  validateFormFields,
} from './apply-discord-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONFIG_PATH = join(ROOT, '.github', 'discord', 'config.yml');
const SCHEMA_PATH = join(ROOT, '.github', 'discord', 'config.schema.json');

/**
 * Referential-integrity checks the JSON Schema can't express. Returns a
 * list of problem strings (empty = clean). `fileExists` is injected so
 * tests can exercise image-source checks without touching disk.
 */
export function findConfigIssues(cfg, opts = {}) {
  const fileExists =
    opts.fileExists ??
    ((p) => {
      const abs = safeRepoPath(p, ROOT);
      return abs != null && existsSync(abs);
    });
  const perms = new Set(PERMISSION_NAMES);
  const issues = [];

  const roleNames = new Set((cfg.roles ?? []).map((r) => r.name));
  roleNames.add('@everyone');
  const channelNames = new Set();
  for (const cat of cfg.categories ?? [])
    for (const ch of cat.channels ?? []) channelNames.add(ch.name);

  const checkPerm = (p, where) => {
    if (!perms.has(p)) issues.push(`${where}: unknown permission "${p}"`);
  };

  for (const role of cfg.roles ?? [])
    for (const p of role.permissions ?? []) checkPerm(p, `role ${role.name}`);

  for (const cat of cfg.categories ?? []) {
    for (const ch of cat.channels ?? []) {
      for (const ow of ch.overwrites ?? []) {
        if (!roleNames.has(ow.role))
          issues.push(`channel #${ch.name}: overwrite role "${ow.role}" is not defined`);
        for (const p of ow.allow ?? []) checkPerm(p, `channel #${ch.name} overwrite`);
        for (const p of ow.deny ?? []) checkPerm(p, `channel #${ch.name} overwrite`);
      }
      if (ch.webhook && !/^DISCORD_WEBHOOK_[A-Z0-9_]+$/.test(ch.webhook))
        issues.push(
          `channel #${ch.name}: webhook "${ch.webhook}" should be an env-var name like DISCORD_WEBHOOK_X`,
        );
    }
  }

  if (cfg.server?.system_channel && !channelNames.has(cfg.server.system_channel))
    issues.push(`server.system_channel "${cfg.server.system_channel}" is not a defined channel`);
  if (cfg.server?.widget?.invite_channel && !channelNames.has(cfg.server.widget.invite_channel))
    issues.push(
      `server.widget.invite_channel "${cfg.server.widget.invite_channel}" is not a defined channel`,
    );
  for (const f of cfg.server?.system_channel_flags ?? [])
    if (SYSTEM_CHANNEL_FLAGS[f] === undefined)
      issues.push(`server.system_channel_flags: unknown flag "${f}"`);

  for (const rule of cfg.automod ?? []) {
    for (const a of rule.actions ?? [])
      if (a.metadata?.channel && !channelNames.has(a.metadata.channel))
        issues.push(`automod "${rule.name}": alert channel "${a.metadata.channel}" is not defined`);
    for (const r of rule.exempt_roles ?? [])
      if (!roleNames.has(r))
        issues.push(`automod "${rule.name}": exempt role "${r}" is not defined`);
  }

  for (const c of cfg.onboarding?.default_channel_ids ?? [])
    if (!channelNames.has(c))
      issues.push(`onboarding.default_channel_ids: "${c}" is not a defined channel`);
  for (const p of cfg.onboarding?.prompts ?? [])
    for (const o of p.options ?? []) {
      for (const c of o.channel_ids ?? [])
        if (!channelNames.has(c))
          issues.push(`onboarding option "${o.title}": channel "${c}" is not defined`);
      for (const r of o.role_ids ?? [])
        if (!roleNames.has(r))
          issues.push(`onboarding option "${o.title}": role "${r}" is not defined`);
    }

  for (const w of cfg.welcome?.channels ?? [])
    if (!channelNames.has(w.channel)) issues.push(`welcome: channel "${w.channel}" is not defined`);

  for (const e of validateFormFields(cfg.rules?.form_fields ?? [])) issues.push(`rules: ${e}`);

  const imageRefs = [];
  for (const k of ['icon', 'banner', 'splash', 'discovery_splash'])
    if (cfg.server?.images?.[k]) imageRefs.push([`server.images.${k}`, cfg.server.images[k]]);
  if (cfg.webhooks?.avatar) imageRefs.push(['webhooks.avatar', cfg.webhooks.avatar]);
  if (cfg.bot?.avatar) imageRefs.push(['bot.avatar', cfg.bot.avatar]);
  if (cfg.bot?.banner) imageRefs.push(['bot.banner', cfg.bot.banner]);
  for (const [label, p] of imageRefs) {
    if (safeRepoPath(p, ROOT) == null) issues.push(`${label}: path "${p}" escapes the repo root`);
    else if (!fileExists(p)) issues.push(`${label}: source image not found at ${p}`);
  }

  return issues;
}

async function main() {
  const cfg = yaml.load(readFileSync(CONFIG_PATH, 'utf8'));
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));

  const Ajv2020 = (await import('ajv/dist/2020.js')).default;
  const addFormats = (await import('ajv-formats')).default;
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);

  const issues = [];
  const validate = ajv.compile(schema);
  if (!validate(cfg)) {
    for (const e of validate.errors ?? [])
      issues.push(`schema: ${e.instancePath || '/'} ${e.message}`);
  }
  issues.push(...findConfigIssues(cfg));

  if (issues.length === 0) {
    console.log('OK verify-discord-config -- config.yml valid + references resolve.');
    process.exit(0);
  }
  error(`Discord config has ${issues.length} problem(s):`);
  for (const i of issues) console.error(`  - ${i}`);
  process.exit(1);
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  main().catch((e) => {
    error(e.message);
    process.exit(2);
  });
}
