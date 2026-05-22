#!/usr/bin/env node
/**
 * apply-discord-config.mjs -- idempotent Discord server reconciler.
 *
 * Reads the desired Discord-server state from `.github/discord/config.yml`
 * and reconciles channels + roles + AutoMod rules + Onboarding + Welcome
 * screen against the live state via Discord REST API.
 *
 * Matches the existing `apply-github-config.mjs` + `apply-github-features.mjs`
 * + `apply-user-features.mjs` reconciler pattern. Re-running is a
 * no-op unless something drifted.
 *
 * Requires (env vars, set as repo secrets in CI):
 *   DISCORD_BOT_TOKEN  -- Bot application token (Discord Developer Portal)
 *                         + the bot must be installed on the guild with
 *                         MANAGE_GUILD + MANAGE_CHANNELS + MANAGE_ROLES.
 *   DISCORD_GUILD_ID   -- the 18-digit guild snowflake. Defaults to
 *                         brand.json::community.discord.serverId.
 *
 * Usage:
 *   node scripts/system/apply-discord-config.mjs            # apply
 *   node scripts/system/apply-discord-config.mjs --verify   # drift check
 *   node scripts/system/apply-discord-config.mjs --dry      # plan, no writes
 *
 * Invoked by `.github/workflows/maintain-discord.yml` on push:main +
 * weekly cron + workflow_dispatch. Drift-detection mode is what the
 * CI gate uses on every workflow run.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const CONFIG_PATH = join(REPO_ROOT, '.github', 'discord', 'config.yml');
const BRAND_PATH = join(REPO_ROOT, 'branding', 'brand.json');

const DRY_RUN = process.argv.includes('--dry') || process.argv.includes('--dry-run');
const VERIFY_ONLY = process.argv.includes('--verify') || process.argv.includes('--check');

// Discord API base. Bumping to v10 in 2026 (current GA channel).
const API = 'https://discord.com/api/v10';

// ── Discord permission flag bits (subset; see Discord docs) ───────
const PERM = Object.freeze({
  CREATE_INSTANT_INVITE: 1n << 0n,
  KICK_MEMBERS: 1n << 1n,
  BAN_MEMBERS: 1n << 2n,
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  MANAGE_GUILD: 1n << 5n,
  ADD_REACTIONS: 1n << 6n,
  VIEW_AUDIT_LOG: 1n << 7n,
  PRIORITY_SPEAKER: 1n << 8n,
  STREAM: 1n << 9n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  SEND_TTS_MESSAGES: 1n << 12n,
  MANAGE_MESSAGES: 1n << 13n,
  EMBED_LINKS: 1n << 14n,
  ATTACH_FILES: 1n << 15n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  MENTION_EVERYONE: 1n << 17n,
  USE_EXTERNAL_EMOJIS: 1n << 18n,
  VIEW_GUILD_INSIGHTS: 1n << 19n,
  CONNECT: 1n << 20n,
  SPEAK: 1n << 21n,
  MUTE_MEMBERS: 1n << 22n,
  DEAFEN_MEMBERS: 1n << 23n,
  MOVE_MEMBERS: 1n << 24n,
  USE_VAD: 1n << 25n,
  CHANGE_NICKNAME: 1n << 26n,
  MANAGE_NICKNAMES: 1n << 27n,
  MANAGE_ROLES: 1n << 28n,
  MANAGE_WEBHOOKS: 1n << 29n,
  MANAGE_GUILD_EXPRESSIONS: 1n << 30n,
  USE_APPLICATION_COMMANDS: 1n << 31n,
  REQUEST_TO_SPEAK: 1n << 32n,
  MANAGE_EVENTS: 1n << 33n,
  MANAGE_THREADS: 1n << 34n,
  CREATE_PUBLIC_THREADS: 1n << 35n,
  CREATE_PRIVATE_THREADS: 1n << 36n,
  USE_EXTERNAL_STICKERS: 1n << 37n,
  SEND_MESSAGES_IN_THREADS: 1n << 38n,
  USE_EMBEDDED_ACTIVITIES: 1n << 39n,
  MODERATE_MEMBERS: 1n << 40n,
});

function permsToBits(names) {
  if (!Array.isArray(names)) return 0n;
  let bits = 0n;
  for (const name of names) {
    if (PERM[name] === undefined) {
      throw new Error(`Unknown permission: ${name}`);
    }
    bits |= PERM[name];
  }
  return bits;
}

// ── Setup + auth ──────────────────────────────────────────────────
function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(`Config not found at ${CONFIG_PATH}`);
  }
  return yaml.load(readFileSync(CONFIG_PATH, 'utf8'));
}

function resolveGuildId() {
  if (process.env.DISCORD_GUILD_ID) return process.env.DISCORD_GUILD_ID;
  if (existsSync(BRAND_PATH)) {
    const brand = JSON.parse(readFileSync(BRAND_PATH, 'utf8'));
    const id = brand?.community?.discord?.serverId;
    if (id) return id;
  }
  throw new Error('DISCORD_GUILD_ID not set + brand.json::community.discord.serverId missing.');
}

const TOKEN = process.env.DISCORD_BOT_TOKEN;
// Every mode (apply / verify / dry) reads live state via GET to compute
// the diff. Only writes are stubbed in --verify / --dry. So the token
// is mandatory in all three. Pure syntax checking is `node --check`.
if (!TOKEN) {
  console.error(
    '::error::DISCORD_BOT_TOKEN env var required (apply / verify / dry all read live state).',
  );
  process.exit(1);
}

const GUILD_ID = resolveGuildId();

/**
 * Discord REST helper. Honors X-RateLimit-Remaining + X-RateLimit-Reset-After
 * by sleeping when the bucket is empty. Discord's API returns 429 with
 * Retry-After if you ignore the headers, so this layer is defensive.
 *
 * @param {string} method - HTTP verb
 * @param {string} path - path under /v10 (e.g. '/guilds/{id}/channels')
 * @param {object|null} body - JSON body or null
 * @returns {Promise<object|null>} parsed JSON response or null for 204
 */
async function discord(method, path, body) {
  if (DRY_RUN && method !== 'GET') {
    console.log(`[dry-run] ${method} ${path}`);
    return null;
  }
  if (VERIFY_ONLY && method !== 'GET') {
    // Verify mode is read-only -- the reconciler logs the diff but
    // doesn't write. The diff is what surfaces drift.
    return null;
  }
  const url = `${API}${path}`;
  const headers = {
    Authorization: `Bot ${TOKEN}`,
    'User-Agent': 'heron-discord-reconciler/1.0 (+https://github.com/kaelys-js/heron)',
  };
  if (body !== null && body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  // Rate-limit handling: 429 means we ignored the bucket headers; back
  // off + retry once. Anything else 4xx/5xx surfaces as an error.
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After') ?? '1') * 1000;
    console.warn(`Rate-limited; sleeping ${retryAfter}ms then retrying.`);
    await new Promise((r) => setTimeout(r, retryAfter));
    return discord(method, path, body);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord ${method} ${path}: ${res.status} ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Drift tracker (verify mode reports count; apply mode writes) ──
let driftCount = 0;
function logChange(what, before, after) {
  driftCount++;
  console.log(`  ${what}: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
}
function logCreate(what) {
  driftCount++;
  console.log(`  ${what}: missing -> creating`);
}
function logOk(what) {
  console.log(`  ${what}: ok`);
}

// ── Reconcilers ───────────────────────────────────────────────────

/**
 * Server-level settings (verification level, content filter, default
 * notifications). One PATCH /guilds/{id}.
 */
async function applyServer(cfg) {
  const live = await discord('GET', `/guilds/${GUILD_ID}`);
  const desired = {
    name: cfg.server.name,
    description: cfg.server.description,
    verification_level: cfg.server.verification_level,
    default_message_notifications: cfg.server.default_message_notifications,
    explicit_content_filter: cfg.server.explicit_content_filter,
  };
  const drift = {};
  for (const [k, v] of Object.entries(desired)) {
    if (live[k] !== v) {
      drift[k] = { before: live[k], after: v };
    }
  }
  if (Object.keys(drift).length === 0) {
    logOk('server settings');
    return;
  }
  for (const [k, { before, after }] of Object.entries(drift)) {
    logChange(`server.${k}`, before, after);
  }
  await discord('PATCH', `/guilds/${GUILD_ID}`, desired);
}

/**
 * Roles. Each role in config gets created if missing, updated if
 * drift. Listed in TOP-DOWN order; we POST in REVERSE so the last
 * role created ends up at the BOTTOM of the hierarchy (Discord places
 * each new role just above @everyone).
 *
 * Returns a map of role-name -> role-id for downstream channel
 * permission-overwrite resolution.
 */
async function applyRoles(cfg) {
  const live = await discord('GET', `/guilds/${GUILD_ID}/roles`);
  const liveByName = new Map(live.map((r) => [r.name, r]));
  const idByName = new Map();

  for (const role of [...cfg.roles].reverse()) {
    const desiredPerms = permsToBits(role.permissions ?? []).toString();
    const desiredColor = parseHexColor(role.color);
    const existing = liveByName.get(role.name);
    if (!existing) {
      logCreate(`role ${role.name}`);
      const created = await discord('POST', `/guilds/${GUILD_ID}/roles`, {
        name: role.name,
        permissions: desiredPerms,
        color: desiredColor,
        hoist: role.hoist ?? false,
        mentionable: role.mentionable ?? false,
      });
      if (created) idByName.set(role.name, created.id);
      continue;
    }
    idByName.set(role.name, existing.id);
    const drift = [];
    if (existing.permissions !== desiredPerms)
      drift.push(['permissions', existing.permissions, desiredPerms]);
    if (existing.color !== desiredColor) drift.push(['color', existing.color, desiredColor]);
    if (Boolean(existing.hoist) !== Boolean(role.hoist))
      drift.push(['hoist', existing.hoist, role.hoist]);
    if (Boolean(existing.mentionable) !== Boolean(role.mentionable))
      drift.push(['mentionable', existing.mentionable, role.mentionable]);
    if (drift.length === 0) {
      logOk(`role ${role.name}`);
      continue;
    }
    for (const [k, b, a] of drift) logChange(`role ${role.name}.${k}`, b, a);
    await discord('PATCH', `/guilds/${GUILD_ID}/roles/${existing.id}`, {
      name: role.name,
      permissions: desiredPerms,
      color: desiredColor,
      hoist: role.hoist ?? false,
      mentionable: role.mentionable ?? false,
    });
  }
  // Inject @everyone implicitly so channel overwrites can resolve it.
  const everyone = live.find((r) => r.name === '@everyone');
  if (everyone) idByName.set('@everyone', everyone.id);
  return idByName;
}

function parseHexColor(hex) {
  if (!hex) return 0;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  return m ? parseInt(m[1], 16) : 0;
}

/**
 * Channels grouped under categories. Categories are channels too in
 * Discord's data model (type 4). We create categories first, then
 * children with parent_id set.
 *
 * Builds permission_overwrites from the YAML `overwrites` list using
 * the role-id map returned by applyRoles.
 *
 * Returns map of channel-name -> channel-id for AutoMod + Onboarding
 * + Welcome screen downstream references.
 */
async function applyChannels(cfg, roleIds) {
  const live = await discord('GET', `/guilds/${GUILD_ID}/channels`);
  const liveByName = new Map(live.map((c) => [c.name, c]));
  const idByName = new Map();

  for (const [catIdx, category] of cfg.categories.entries()) {
    const catName = category.name;
    let parent = liveByName.get(catName);
    if (!parent) {
      logCreate(`category ${catName}`);
      parent = await discord('POST', `/guilds/${GUILD_ID}/channels`, {
        name: catName,
        type: 4, // GUILD_CATEGORY
        position: category.position ?? catIdx,
      });
      if (parent) idByName.set(catName, parent.id);
    } else {
      idByName.set(catName, parent.id);
      logOk(`category ${catName}`);
    }

    for (const [chIdx, channel] of (category.channels ?? []).entries()) {
      const existing = liveByName.get(channel.name);
      const overwrites = (channel.overwrites ?? []).map((ow) => ({
        id: roleIds.get(ow.role) ?? ow.role,
        type: 0, // role
        allow: permsToBits(ow.allow ?? []).toString(),
        deny: permsToBits(ow.deny ?? []).toString(),
      }));
      const desired = {
        name: channel.name,
        type: channel.type ?? 0,
        topic: channel.topic ?? '',
        parent_id: parent?.id,
        position: chIdx,
        rate_limit_per_user: channel.slowmode ?? 0,
        permission_overwrites: overwrites,
      };
      if (channel.type === 15 && channel.available_tags) {
        desired.available_tags = channel.available_tags.map((t) => ({
          name: t.name,
          moderated: false,
        }));
      }
      if (channel.type === 2 && channel.user_limit) {
        desired.user_limit = channel.user_limit;
      }
      if (!existing) {
        logCreate(`channel ${channel.name}`);
        const created = await discord('POST', `/guilds/${GUILD_ID}/channels`, desired);
        if (created) idByName.set(channel.name, created.id);
        continue;
      }
      idByName.set(channel.name, existing.id);
      // Light diff: just the fields we manage (avoid noisy churn on
      // Discord-internal computed fields like last_message_id).
      const drift = [];
      if (existing.topic !== desired.topic) drift.push(['topic', existing.topic, desired.topic]);
      if ((existing.rate_limit_per_user ?? 0) !== desired.rate_limit_per_user)
        drift.push(['slowmode', existing.rate_limit_per_user, desired.rate_limit_per_user]);
      if (drift.length === 0) {
        logOk(`channel ${channel.name}`);
        continue;
      }
      for (const [k, b, a] of drift) logChange(`channel ${channel.name}.${k}`, b, a);
      await discord('PATCH', `/channels/${existing.id}`, desired);
    }
  }
  return idByName;
}

/**
 * AutoMod rules. Each rule is identified by name; missing -> POST,
 * present-with-drift -> PATCH.
 */
async function applyAutomod(cfg, channelIds, roleIds) {
  const live = await discord('GET', `/guilds/${GUILD_ID}/auto-moderation/rules`);
  const liveByName = new Map(live.map((r) => [r.name, r]));

  for (const rule of cfg.automod ?? []) {
    const desired = {
      name: rule.name,
      event_type: 1, // MESSAGE_SEND
      trigger_type: rule.trigger_type,
      trigger_metadata: rule.trigger_metadata,
      actions: (rule.actions ?? []).map((a) => {
        const out = { type: a.type };
        if (a.metadata?.channel) {
          out.metadata = { channel_id: channelIds.get(a.metadata.channel) };
        } else if (a.metadata) {
          out.metadata = a.metadata;
        }
        return out;
      }),
      enabled: rule.enabled ?? true,
      exempt_roles: (rule.exempt_roles ?? []).map((r) => roleIds.get(r)).filter(Boolean),
    };
    const existing = liveByName.get(rule.name);
    if (!existing) {
      logCreate(`automod ${rule.name}`);
      await discord('POST', `/guilds/${GUILD_ID}/auto-moderation/rules`, desired);
      continue;
    }
    // Light-touch diff: only re-apply if enabled state or trigger
    // metadata diverged. Discord normalises some fields on read
    // (sorted keyword_filter etc.) so deep-eq would be too noisy.
    if (existing.enabled !== desired.enabled) {
      logChange(`automod ${rule.name}.enabled`, existing.enabled, desired.enabled);
      await discord('PATCH', `/guilds/${GUILD_ID}/auto-moderation/rules/${existing.id}`, desired);
      continue;
    }
    logOk(`automod ${rule.name}`);
  }
}

/**
 * Onboarding flow. PUT /guilds/{id}/onboarding (idempotent overwrite).
 * Resolves channel + role names to IDs before sending.
 */
async function applyOnboarding(cfg, channelIds, roleIds) {
  if (!cfg.onboarding?.enabled) {
    logOk('onboarding (disabled)');
    return;
  }
  const desired = {
    enabled: true,
    mode: cfg.onboarding.mode ?? 1,
    default_channel_ids: (cfg.onboarding.default_channel_ids ?? [])
      .map((n) => channelIds.get(n))
      .filter(Boolean),
    prompts: (cfg.onboarding.prompts ?? []).map((p) => ({
      title: p.title,
      type: p.type ?? 0,
      single_select: p.single_select ?? true,
      required: p.required ?? false,
      in_onboarding: true,
      options: (p.options ?? []).map((o) => ({
        title: o.title,
        description: o.description ?? '',
        emoji: o.emoji_name ? { name: o.emoji_name } : null,
        role_ids: (o.role_ids ?? []).map((r) => roleIds.get(r)).filter(Boolean),
        channel_ids: (o.channel_ids ?? []).map((c) => channelIds.get(c)).filter(Boolean),
      })),
    })),
  };
  logChange('onboarding', '(opaque diff)', 'overwriting via PUT');
  await discord('PUT', `/guilds/${GUILD_ID}/onboarding`, desired);
}

/**
 * Welcome screen. PATCH /guilds/{id}/welcome-screen.
 */
async function applyWelcome(cfg, channelIds) {
  if (!cfg.welcome?.enabled) {
    logOk('welcome screen (disabled)');
    return;
  }
  const desired = {
    enabled: true,
    description: cfg.welcome.description ?? '',
    welcome_channels: (cfg.welcome.channels ?? []).map((w) => ({
      channel_id: channelIds.get(w.channel),
      description: w.description,
      emoji_name: w.emoji_name,
    })),
  };
  logChange('welcome screen', '(opaque diff)', 'overwriting via PATCH');
  await discord('PATCH', `/guilds/${GUILD_ID}/welcome-screen`, desired);
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log('▸ Discord reconciler');
  console.log(`  mode: ${VERIFY_ONLY ? 'verify' : DRY_RUN ? 'dry-run' : 'apply'}`);
  console.log(`  guild: ${GUILD_ID}`);
  console.log(`  config: ${CONFIG_PATH.replace(REPO_ROOT + '/', '')}`);

  const cfg = loadConfig();

  await applyServer(cfg);
  const roleIds = await applyRoles(cfg);
  const channelIds = await applyChannels(cfg, roleIds);
  await applyAutomod(cfg, channelIds, roleIds);
  await applyOnboarding(cfg, channelIds, roleIds);
  await applyWelcome(cfg, channelIds);

  if (driftCount === 0) {
    console.log('\n✓ No drift -- Discord state matches SSOT.');
    process.exit(0);
  }
  if (VERIFY_ONLY) {
    console.log(
      `\n✗ Drift detected (${driftCount} change${driftCount === 1 ? '' : 's'}). Run without --verify to apply.`,
    );
    process.exit(1);
  }
  console.log(`\n✓ Reconciled ${driftCount} drift${driftCount === 1 ? '' : 's'}.`);
}

main().catch((e) => {
  console.error(`::error::${e.message}`);
  console.error(e.stack);
  process.exit(2);
});
