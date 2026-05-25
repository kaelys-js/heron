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
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const CONFIG_PATH = join(REPO_ROOT, '.github', 'discord', 'config.yml');
const BRAND_PATH = join(REPO_ROOT, 'branding', 'brand.json');
// Per-image apply state (source sha + last-applied Discord hash) so we
// re-push only when the brand asset changes or the live image is altered.
const IMAGE_STATE_PATH = join(REPO_ROOT, '.github', 'discord', '.image-state.json');

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

/** Frozen list of valid permission names -- used by the config verifier
 *  to flag typos without throwing. */
export const PERMISSION_NAMES = Object.freeze(Object.keys(PERM));

export function permsToBits(names) {
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

// ── Least-privilege permission handling ───────────────────────────
// The bot can only grant permissions it itself holds (Discord error
// 50013 otherwise). It also can only manage roles below its own in the
// hierarchy. These helpers let the reconciler apply what it can and
// surface -- never silently drop -- what it can't.

// Hard requirement: without these the reconciler can do nothing.
export const REQUIRED_BOT_PERMS = ['MANAGE_ROLES', 'MANAGE_CHANNELS', 'MANAGE_GUILD'];
// Fuller set printed in the invite URL so a fresh install is complete
// (equals the integer a maintainer sees in the dev portal: 1100316934320).
export const RECOMMENDED_BOT_PERMS = [
  'MANAGE_ROLES',
  'MANAGE_CHANNELS',
  'MANAGE_GUILD',
  'MANAGE_WEBHOOKS',
  'VIEW_AUDIT_LOG',
  'MODERATE_MEMBERS',
];

/** Names of every permission whose bit is set in `bits`. */
export function bitsToPermNames(bits) {
  const b = typeof bits === 'bigint' ? bits : BigInt(bits || 0);
  const out = [];
  for (const [name, bit] of Object.entries(PERM)) {
    if ((b & bit) === bit) out.push(name);
  }
  return out;
}

/** Split desired bits into what `botBits` can grant vs not. A bot with
 *  ADMINISTRATOR can grant everything. */
export function filterGrantable(desiredBits, botBits) {
  const desired = BigInt(desiredBits || 0);
  const bot = BigInt(botBits || 0);
  if ((bot & PERM.ADMINISTRATOR) === PERM.ADMINISTRATOR) return { granted: desired, dropped: 0n };
  return { granted: desired & bot, dropped: desired & ~bot };
}

/** Target bits to PATCH a role/overwrite to: match config for bits the
 *  bot can manage, preserve existing for bits it can't (so a manually
 *  granted ADMINISTRATOR is never clobbered). */
export function reconcileGrantedBits(existingBits, desiredBits, botBits) {
  const existing = BigInt(existingBits || 0);
  const desired = BigInt(desiredBits || 0);
  const bot = BigInt(botBits || 0);
  if ((bot & PERM.ADMINISTRATOR) === PERM.ADMINISTRATOR) return desired;
  return (existing & ~bot) | (desired & bot);
}

/** Desired-but-ungrantable bits not already present -- the perms a human
 *  must set by hand. 0n once they're set (so the warning self-clears). */
export function manualPerms(existingBits, desiredBits, botBits) {
  const existing = BigInt(existingBits || 0);
  const desired = BigInt(desiredBits || 0);
  const bot = BigInt(botBits || 0);
  if ((bot & PERM.ADMINISTRATOR) === PERM.ADMINISTRATOR) return 0n;
  return desired & ~bot & ~existing;
}

/** Management bits the bot is missing; 0n if it has them (or is admin). */
export function missingRequiredPerms(botBits) {
  const bot = BigInt(botBits || 0);
  if ((bot & PERM.ADMINISTRATOR) === PERM.ADMINISTRATOR) return 0n;
  return permsToBits(REQUIRED_BOT_PERMS) & ~bot;
}

/** OAuth2 bot-invite URL carrying a permissions integer. */
export function buildInviteUrl(appId, permsBits) {
  const p = (typeof permsBits === 'bigint' ? permsBits : BigInt(permsBits || 0)).toString();
  return `https://discord.com/oauth2/authorize?client_id=${appId}&scope=bot%20applications.commands&permissions=${p}`;
}

// ── system_channel_flags + guild features ─────────────────────────
// A SET bit SUPPRESSES that notification. SUPPRESS_GUILD_REMINDER_
// NOTIFICATIONS (4) is the "send helpful tips for server setup" toggle.
export const SYSTEM_CHANNEL_FLAGS = Object.freeze({
  SUPPRESS_JOIN_NOTIFICATIONS: 1 << 0,
  SUPPRESS_PREMIUM_SUBSCRIPTIONS: 1 << 1,
  SUPPRESS_GUILD_REMINDER_NOTIFICATIONS: 1 << 2,
  SUPPRESS_JOIN_NOTIFICATION_REPLIES: 1 << 3,
  SUPPRESS_ROLE_SUBSCRIPTION_PURCHASE_NOTIFICATIONS: 1 << 4,
  SUPPRESS_ROLE_SUBSCRIPTION_PURCHASE_NOTIFICATION_REPLIES: 1 << 5,
});

export function systemChannelFlagsToBits(names) {
  if (!Array.isArray(names)) return 0;
  let bits = 0;
  for (const name of names) {
    if (SYSTEM_CHANNEL_FLAGS[name] === undefined) {
      throw new Error(`Unknown system_channel_flag: ${name}`);
    }
    bits |= SYSTEM_CHANNEL_FLAGS[name];
  }
  return bits;
}

/** True if the live guild object advertises a feature (BANNER etc.). */
export function hasFeature(liveGuild, feature) {
  return Array.isArray(liveGuild?.features) && liveGuild.features.includes(feature);
}

// Channel types Discord only permits on a COMMUNITY guild. Creating them on
// a guild without the feature 400s -- GUILD_ANNOUNCEMENT (5) with 50035, and
// GUILD_STAGE_VOICE (13) with 50024. (Forum/media work without COMMUNITY.)
const COMMUNITY_ONLY_CHANNEL_TYPES = new Set([5, 13]);

/** A channel that can't be created yet because COMMUNITY isn't on. The
 *  reconciler enables COMMUNITY (see ensureCommunity) once the rules +
 *  updates channels exist, then a second channel pass creates these. So this
 *  holds them for pass 2 within the same run -- it is not a give-up skip. */
export function channelGatedOut(channel, liveGuild) {
  return COMMUNITY_ONLY_CHANNEL_TYPES.has(channel?.type) && !hasFeature(liveGuild, 'COMMUNITY');
}

/** PATCH body that turns on COMMUNITY: the feature flag plus a rules + a
 *  public-updates text channel (both required by Discord). verification_level
 *  + explicit_content_filter must already meet Community minimums -- applyServer
 *  sets them from config (Heron uses MEDIUM + ALL_MEMBERS), so they're not
 *  re-sent here. */
export function buildCommunityPatch(liveGuild, rulesChannelId, updatesChannelId) {
  return {
    features: Array.from(new Set([...(liveGuild?.features ?? []), 'COMMUNITY'])),
    rules_channel_id: rulesChannelId,
    public_updates_channel_id: updatesChannelId,
  };
}

/** Channel names an AutoMod rule alerts to (SEND_ALERT_MESSAGE = action type
 *  2). The bot needs View + Send on each or Discord rejects the rule with
 *  INVALID_AUTO_MODERATION_CHANNEL_FLAG_ACTION_ACCESS. */
export function alertChannelNames(cfg) {
  const names = new Set();
  for (const rule of cfg?.automod ?? []) {
    for (const action of rule.actions ?? []) {
      if (action.type === 2 && action.metadata?.channel) names.add(action.metadata.channel);
    }
  }
  return [...names];
}

// ── Image data + apply state ──────────────────────────────────────
// Guild image slots and the guild feature each one needs (icon needs
// none). banner/splash/discovery_splash silently skip if the guild
// hasn't earned the feature (boost tier / discoverability).
export const GUILD_IMAGE_SLOTS = Object.freeze([
  { cfgKey: 'icon', field: 'icon', feature: null },
  { cfgKey: 'banner', field: 'banner', feature: 'BANNER' },
  { cfgKey: 'splash', field: 'splash', feature: 'INVITE_SPLASH' },
  { cfgKey: 'discovery_splash', field: 'discovery_splash', feature: 'DISCOVERABLE' },
]);

const MIME_BY_EXT = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
});

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/** Resolve a repo-relative path and confirm it stays inside the repo root.
 *  Returns the absolute path, or null if it's absolute, escapes via `..`,
 *  symlinks out of the root, or isn't a regular file. The config is
 *  trusted, but this stops a crafted path (or a stray dir/symlink) from
 *  reading outside the repo or crashing readFileSync with EISDIR. */
export function safeRepoPath(src, repoRoot = REPO_ROOT) {
  if (typeof src !== 'string' || src.length === 0) return null;
  const abs = resolve(repoRoot, src);
  if (abs !== repoRoot && !abs.startsWith(repoRoot + sep)) return null;
  // When the target exists, follow symlinks + require a regular file so a
  // committed symlink can't escape and a directory can't slip through. All
  // fs calls stay in the try so a TOCTOU removal returns null, not a throw.
  if (existsSync(abs)) {
    try {
      const real = realpathSync(abs);
      const realRoot = realpathSync(repoRoot);
      if (real !== realRoot && !real.startsWith(realRoot + sep)) return null;
      if (!statSync(real).isFile()) return null;
    } catch {
      return null;
    }
  }
  return abs;
}

/** Discord accepts only png/jpeg/gif image data. */
export function mimeForPath(p) {
  const ext = p.slice(p.lastIndexOf('.')).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) throw new Error(`Unsupported image type for Discord: ${p} (use png/jpeg/gif)`);
  return mime;
}

/** Read an image file -> { dataUri (Discord image-data), sourceSha }. */
export function imageToDataUri(absPath) {
  const buf = readFileSync(absPath);
  return {
    dataUri: `data:${mimeForPath(absPath)};base64,${buf.toString('base64')}`,
    sourceSha: sha256(buf),
  };
}

export function loadImageState() {
  if (!existsSync(IMAGE_STATE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(IMAGE_STATE_PATH, 'utf8'));
  } catch {
    return {};
  }
}
export function saveImageState(state) {
  writeFileSync(IMAGE_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

/** Whether an image slot needs (re)applying: never applied, the source
 *  changed, or the live image diverged from what we last pushed. */
export function imageDrift(stateEntry, sourceSha, liveHash) {
  if (!stateEntry) return true;
  if (stateEntry.sourceSha !== sourceSha) return true;
  if (stateEntry.discordHash != null && liveHash !== stateEntry.discordHash) return true;
  return false;
}

/** Pull {id, token} out of a Discord webhook URL. The token IS the auth,
 *  so we can set the webhook's name + avatar without any bot permission. */
export function parseWebhookUrl(url) {
  if (typeof url !== 'string') return null;
  const m = /\/webhooks\/(\d+)\/([A-Za-z0-9._-]+)/.exec(url);
  return m ? { id: m[1], token: m[2] } : null;
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

// Resolved inside main() so importing this module (the test suite does)
// neither requires a token nor resolves a guild id. The reconciler reads
// live state via GET in every mode, so the token is mandatory at run time.
let TOKEN;
let GUILD_ID;

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
async function discord(method, path, body, attempt = 0) {
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
  // Rate-limit handling: honor Retry-After, but cap retries so sustained
  // 429s surface as an error instead of looping forever.
  if (res.status === 429) {
    if (attempt >= 5) {
      throw new Error(`Discord ${method} ${path}: rate-limited, exceeded retry limit (5)`);
    }
    const retryAfter = Number(res.headers.get('Retry-After') ?? '1') * 1000;
    console.warn(`Rate-limited; sleeping ${retryAfter}ms then retrying (attempt ${attempt + 1}).`);
    await new Promise((r) => setTimeout(r, retryAfter));
    return discord(method, path, body, attempt + 1);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord ${method} ${path}: ${res.status} ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

/**
 * Webhook REST via the token-in-URL endpoint (no bot auth header). Lets
 * us read + set a webhook's name/avatar from just its secret URL, even
 * if the bot lacks MANAGE_WEBHOOKS. Writes are stubbed in verify/dry.
 */
async function webhookRequest(method, id, token, body, attempt = 0) {
  if (DRY_RUN && method !== 'GET') {
    console.log(`[dry-run] ${method} /webhooks/${id}/****`);
    return null;
  }
  if (VERIFY_ONLY && method !== 'GET') return null;
  const res = await fetch(`${API}/webhooks/${id}/${token}`, {
    method,
    headers: body != null ? { 'Content-Type': 'application/json' } : {},
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429) {
    if (attempt >= 5) {
      throw new Error(`Webhook ${method} ${id}: rate-limited, exceeded retry limit (5)`);
    }
    const retryAfter = Number(res.headers.get('Retry-After') ?? '1') * 1000;
    await new Promise((r) => setTimeout(r, retryAfter));
    return webhookRequest(method, id, token, body, attempt + 1);
  }
  if (!res.ok) throw new Error(`Webhook ${method} ${id}: ${res.status} ${await res.text()}`);
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
// Tracks settings the bot can't apply itself (an elevated perm it
// doesn't hold, a feature the guild lacks). Surfaced, never silent.
let manualCount = 0;
function logManual(msg) {
  manualCount++;
  console.log(`::warning::${msg}`);
}
// Brand-image apply state shared by every writer (server, roles, webhooks,
// bot). Loaded once in main(), saved once at the end if a real apply
// changed it -- so concurrent writers never clobber each other's keys.
let imageState = {};
let imageStateDirty = false;

// ── Preflight: bot identity + permission check ────────────────────
async function getBotUser() {
  return discord('GET', '/users/@me');
}

/**
 * Verify the bot is in the guild with the management permissions the
 * reconciler needs. On a hard miss, print the OAuth invite URL + the
 * role-hierarchy reminder and exit 1 (instead of a mid-run 50013 stack).
 * Returns the bot's effective guild permission bits, used downstream for
 * the least-privilege grantable filter.
 */
async function preflight() {
  const bot = await getBotUser();
  const inviteUrl = buildInviteUrl(bot.id, permsToBits(RECOMMENDED_BOT_PERMS));
  const guilds = (await discord('GET', '/users/@me/guilds')) ?? [];
  const here = guilds.find((g) => g.id === GUILD_ID);
  if (!here) {
    console.error(`::error::Bot "${bot.username}" is not a member of guild ${GUILD_ID}.`);
    console.error(`  Invite it: ${inviteUrl}`);
    console.error('  Then drag its role to the TOP of Server Settings -> Roles.');
    process.exit(1);
  }
  const botPerms = BigInt(here.permissions ?? '0');
  const missing = missingRequiredPerms(botPerms);
  if (missing !== 0n) {
    console.error(
      `::error::Bot "${bot.username}" lacks required permissions: ${bitsToPermNames(missing).join(', ')}.`,
    );
    console.error(`  Re-invite with management perms: ${inviteUrl}`);
    console.error(
      '  And ensure its role sits ABOVE the roles it manages (Server Settings -> Roles).',
    );
    process.exit(1);
  }
  console.log(`  preflight: bot "${bot.username}" ok (perms ${botPerms})`);
  return { botUser: bot, botPerms };
}

// ── Reconcilers ───────────────────────────────────────────────────

/**
 * Server-level settings (name, description, verification, notifications,
 * content filter, system_channel_flags) plus brand images (icon always;
 * banner/splash/discovery_splash gated on the guild owning the feature).
 * Returns the live guild object so the system-channel + widget passes can
 * reuse it without a second GET.
 */
async function applyServer(cfg) {
  const live = await discord('GET', `/guilds/${GUILD_ID}`);
  const patch = {};

  // ── scalar settings ──
  const desired = {
    name: cfg.server.name,
    description: cfg.server.description,
    verification_level: cfg.server.verification_level,
    default_message_notifications: cfg.server.default_message_notifications,
    explicit_content_filter: cfg.server.explicit_content_filter,
  };
  if (cfg.server.system_channel_flags) {
    desired.system_channel_flags = systemChannelFlagsToBits(cfg.server.system_channel_flags);
  }
  for (const [k, v] of Object.entries(desired)) {
    if (live[k] !== v) {
      logChange(`server.${k}`, live[k], v);
      patch[k] = v;
    }
  }

  // ── brand images (hash-state tracked) ──
  const pendingImages = []; // { stateKey, field, sourceSha }
  const images = cfg.server.images ?? {};
  for (const slot of GUILD_IMAGE_SLOTS) {
    const src = images[slot.cfgKey];
    if (!src) continue;
    if (slot.feature && !hasFeature(live, slot.feature)) {
      console.log(`  server.${slot.field}: skipped (guild lacks ${slot.feature})`);
      continue;
    }
    const abs = safeRepoPath(src);
    if (!abs || !existsSync(abs)) {
      logManual(`server.${slot.field}: source image missing or outside the repo: ${src}`);
      continue;
    }
    const { dataUri, sourceSha } = imageToDataUri(abs);
    const stateKey = `guild.${slot.field}`;
    if (!imageDrift(imageState[stateKey], sourceSha, live[slot.field])) continue;
    logChange(`server.${slot.field}`, live[slot.field] ?? null, `${src}#${sourceSha.slice(0, 8)}`);
    patch[slot.field] = dataUri;
    pendingImages.push({ stateKey, field: slot.field, sourceSha });
  }

  if (Object.keys(patch).length === 0) {
    logOk('server settings');
    return live;
  }
  const updated = await discord('PATCH', `/guilds/${GUILD_ID}`, patch);
  // Record the new Discord image hashes so the next run is a no-op.
  // verify/dry stub the PATCH (updated === null) -> drift stays reported.
  if (updated && pendingImages.length) {
    for (const { stateKey, field, sourceSha } of pendingImages) {
      imageState[stateKey] = { sourceSha, discordHash: updated[field] ?? null };
    }
    imageStateDirty = true;
  }
  return live;
}

/**
 * System message channel (join / boost notices). Resolved after channels
 * so the name -> id lookup works. PATCH /guilds/{id}.
 */
async function applySystemChannel(cfg, guild, channelIds) {
  const name = cfg.server?.system_channel;
  if (!name) return;
  const id = channelIds.get(name);
  if (!id) {
    logManual(`server.system_channel: channel #${name} not found`);
    return;
  }
  if (guild.system_channel_id === id) {
    logOk('server.system_channel');
    return;
  }
  logChange('server.system_channel', guild.system_channel_id, id);
  await discord('PATCH', `/guilds/${GUILD_ID}`, { system_channel_id: id });
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
/**
 * Resolve a role's icon/emoji into a body fragment. unicode_emoji is free;
 * an image needs the ROLE_ICONS feature + is hash-state tracked. Returns
 * { extras, pending (image to record), changed }.
 */
function resolveRoleIcon(role, guild, existing) {
  if (!role.unicode_emoji && !role.icon) return { extras: {}, pending: null, changed: false };
  if (!hasFeature(guild, 'ROLE_ICONS')) {
    logManual(`role ${role.name}: icon/emoji needs the ROLE_ICONS feature (guild lacks it).`);
    return { extras: {}, pending: null, changed: false };
  }
  if (role.unicode_emoji) {
    const changed = !existing || existing.unicode_emoji !== role.unicode_emoji;
    return { extras: { unicode_emoji: role.unicode_emoji }, pending: null, changed };
  }
  const abs = safeRepoPath(role.icon);
  if (!abs || !existsSync(abs)) {
    logManual(`role ${role.name}: icon source missing or outside the repo: ${role.icon}`);
    return { extras: {}, pending: null, changed: false };
  }
  const { dataUri, sourceSha } = imageToDataUri(abs);
  const stateKey = `role.${role.name}.icon`;
  if (existing && !imageDrift(imageState[stateKey], sourceSha, existing.icon)) {
    return { extras: {}, pending: null, changed: false };
  }
  return { extras: { icon: dataUri }, pending: { stateKey, sourceSha }, changed: true };
}

async function applyRoles(cfg, botPerms, guild) {
  const live = await discord('GET', `/guilds/${GUILD_ID}/roles`);
  const liveByName = new Map(live.map((r) => [r.name, r]));
  const idByName = new Map();

  for (const role of [...cfg.roles].reverse()) {
    const desiredBits = permsToBits(role.permissions ?? []);
    const desiredColor = parseHexColor(role.color);
    const existing = liveByName.get(role.name);
    const existingBits = BigInt(existing?.permissions ?? '0');
    // Match config for the bits the bot can grant; preserve existing for
    // the rest (so a hand-set ADMINISTRATOR is never stripped).
    const targetPerms = reconcileGrantedBits(existingBits, desiredBits, botPerms).toString();
    const manual = manualPerms(existingBits, desiredBits, botPerms);
    if (manual !== 0n) {
      logManual(
        `role ${role.name}: cannot grant ${bitsToPermNames(manual).join(', ')} (bot lacks it). Set on this role by hand, or re-invite the bot holding it.`,
      );
    }
    const {
      extras: iconExtras,
      pending: iconPending,
      changed: iconChanged,
    } = resolveRoleIcon(role, guild, existing);
    const body = {
      name: role.name,
      permissions: targetPerms,
      color: desiredColor,
      hoist: role.hoist ?? false,
      mentionable: role.mentionable ?? false,
      ...iconExtras,
    };
    const recordIcon = (saved) => {
      if (saved && iconPending) {
        imageState[iconPending.stateKey] = {
          sourceSha: iconPending.sourceSha,
          discordHash: saved.icon ?? null,
        };
        imageStateDirty = true;
      }
    };
    if (!existing) {
      logCreate(`role ${role.name}`);
      const created = await discord('POST', `/guilds/${GUILD_ID}/roles`, body);
      if (created) idByName.set(role.name, created.id);
      recordIcon(created);
      continue;
    }
    idByName.set(role.name, existing.id);
    const drift = [];
    if (existing.permissions !== targetPerms)
      drift.push(['permissions', existing.permissions, targetPerms]);
    if (existing.color !== desiredColor) drift.push(['color', existing.color, desiredColor]);
    if (Boolean(existing.hoist) !== Boolean(role.hoist))
      drift.push(['hoist', existing.hoist, role.hoist]);
    if (Boolean(existing.mentionable) !== Boolean(role.mentionable))
      drift.push(['mentionable', existing.mentionable, role.mentionable]);
    if (iconChanged) drift.push(['icon', '(icon/emoji)', '(reconciled)']);
    if (drift.length === 0) {
      logOk(`role ${role.name}`);
      continue;
    }
    for (const [k, b, a] of drift) logChange(`role ${role.name}.${k}`, b, a);
    recordIcon(await discord('PATCH', `/guilds/${GUILD_ID}/roles/${existing.id}`, body));
  }
  // Inject @everyone implicitly so channel overwrites can resolve it.
  const everyone = live.find((r) => r.name === '@everyone');
  if (everyone) idByName.set('@everyone', everyone.id);

  // Hierarchy order: surface drift but don't auto-reorder -- a bulk
  // reorder can only touch roles below the bot's own role and risks
  // disturbing the maintainer's manual placement.
  if (
    rolesOutOfOrder(
      cfg.roles.map((r) => r.name),
      live,
    )
  ) {
    logManual(
      'role hierarchy order differs from config. Reorder in Server Settings -> Roles (auto-reorder is held back to avoid disturbing the bot + integration roles).',
    );
  }
  return idByName;
}

export function parseHexColor(hex) {
  if (!hex) return 0;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  return m ? parseInt(m[1], 16) : 0;
}

/** True if the config roles (top-down) aren't in descending live position
 *  order -- i.e. someone reordered the hierarchy away from the SSOT. Only
 *  considers config roles that already exist live. */
export function rolesOutOfOrder(configNames, liveRoles) {
  const posByName = new Map((liveRoles ?? []).map((r) => [r.name, r.position]));
  const present = (configNames ?? []).filter((n) => posByName.has(n));
  for (let i = 1; i < present.length; i++) {
    if (posByName.get(present[i - 1]) <= posByName.get(present[i])) return true;
  }
  return false;
}

// ── Channel permission-overwrite reconciliation ───────────────────
/** Normalize an overwrite list to id -> "allow/deny/type" for comparison. */
export function normalizeOverwrites(list) {
  const m = {};
  for (const ow of list ?? []) {
    m[String(ow.id)] = `${ow.allow ?? '0'}/${ow.deny ?? '0'}/${ow.type ?? 0}`;
  }
  return m;
}

/** Desired (managed) overwrites layered over live, preserving live entries
 *  for ids we don't manage (member overwrites, undeclared roles) -- a PATCH
 *  replaces the whole list, so those must be carried forward. */
export function mergeOverwrites(live, desired) {
  const desiredIds = new Set((desired ?? []).map((o) => String(o.id)));
  const preserved = (live ?? []).filter((o) => !desiredIds.has(String(o.id)));
  return [...(desired ?? []), ...preserved];
}

/** True if two overwrite lists differ (order-independent). */
export function overwritesDiffer(a, b) {
  const na = normalizeOverwrites(a);
  const nb = normalizeOverwrites(b);
  const keys = new Set([...Object.keys(na), ...Object.keys(nb)]);
  for (const k of keys) if (na[k] !== nb[k]) return true;
  return false;
}

// ── AutoMod rule reconciliation ────────────────────────────────────
/** Canonical comparable for an AutoMod rule. Sorts the array fields
 *  Discord reorders on read (keyword_filter, presets, ...) so a deep
 *  compare reconciles real drift without churning every run. */
export function normalizeAutomod(rule) {
  const tm = rule?.trigger_metadata ?? {};
  return JSON.stringify({
    trigger_type: rule?.trigger_type ?? null,
    enabled: rule?.enabled ?? true,
    keyword_filter: [...(tm.keyword_filter ?? [])].sort(),
    regex_patterns: [...(tm.regex_patterns ?? [])].sort(),
    presets: [...(tm.presets ?? [])].map(Number).sort((x, y) => x - y),
    allow_list: [...(tm.allow_list ?? [])].sort(),
    mention_total_limit: tm.mention_total_limit ?? null,
    mention_raid_protection_enabled: tm.mention_raid_protection_enabled ?? false,
    actions: (rule?.actions ?? [])
      .map((a) => ({
        type: a.type,
        channel_id: a.metadata?.channel_id ?? null,
        custom_message: a.metadata?.custom_message ?? null,
        duration_seconds: a.metadata?.duration_seconds ?? null,
      }))
      .sort((x, y) => x.type - y.type),
    exempt_roles: [...(rule?.exempt_roles ?? [])].sort(),
  });
}

export function automodDiffers(live, desired) {
  return normalizeAutomod(live) !== normalizeAutomod(desired);
}

// ── Membership screening (Server Rules) ────────────────────────────
/** Validate rules form_fields client-side -- the member-verification
 *  endpoint returns an opaque 500 on a malformed body. Returns a list of
 *  problem strings (empty = ok). */
export function validateFormFields(fields) {
  if (!Array.isArray(fields)) return ['form_fields must be an array'];
  const errors = [];
  fields.forEach((f, i) => {
    if (typeof f?.field_type !== 'string' || !f.field_type)
      errors.push(`form_fields[${i}].field_type must be a non-empty string`);
    if (typeof f?.label !== 'string' || !f.label)
      errors.push(`form_fields[${i}].label must be a non-empty string`);
    if (f?.field_type === 'TERMS' && !Array.isArray(f.values))
      errors.push(`form_fields[${i}].values must be an array for a TERMS field`);
  });
  return errors;
}

/** Canonical comparable for a member-verification object. `enabled` is a
 *  guild-feature concern, not part of the GET object, so it's excluded. */
export function normalizeMemberVerification(mv) {
  return JSON.stringify({
    description: mv?.description ?? '',
    form_fields: (mv?.form_fields ?? []).map((f) => ({
      field_type: f.field_type ?? null,
      label: f.label ?? '',
      required: f.required ?? false,
      values: [...(f.values ?? [])].sort(),
    })),
  });
}

// ── Onboarding + welcome screen ────────────────────────────────────
/** Canonical comparable for an onboarding flow. Ignores prompt/option ids
 *  (Discord assigns its own) so verify doesn't report drift every run. */
export function normalizeOnboarding(ob) {
  return JSON.stringify({
    enabled: ob?.enabled ?? false,
    mode: ob?.mode ?? null,
    default_channel_ids: [...(ob?.default_channel_ids ?? [])].map(String).sort(),
    prompts: (ob?.prompts ?? []).map((p) => ({
      title: p.title ?? '',
      type: p.type ?? 0,
      single_select: p.single_select ?? false,
      required: p.required ?? false,
      options: (p.options ?? []).map((o) => ({
        title: o.title ?? '',
        description: o.description ?? '',
        emoji: o.emoji?.name ?? o.emoji_name ?? null,
        role_ids: [...(o.role_ids ?? [])].map(String).sort(),
        channel_ids: [...(o.channel_ids ?? [])].map(String).sort(),
      })),
    })),
  });
}

/** Distinct channels onboarding would surface. Discord needs >= 7 to
 *  enable (ADVANCED mode counts default + prompt-referenced channels). */
export function onboardingChannelCount(desired) {
  const ids = new Set((desired?.default_channel_ids ?? []).map(String));
  if ((desired?.mode ?? 1) === 1) {
    for (const p of desired?.prompts ?? [])
      for (const o of p.options ?? []) for (const c of o.channel_ids ?? []) ids.add(String(c));
  }
  return ids.size;
}

/** Canonical comparable for the welcome screen. `enabled` isn't part of
 *  the GET object; channel order is meaningful so it isn't sorted. */
export function normalizeWelcome(ws) {
  return JSON.stringify({
    description: ws?.description ?? '',
    welcome_channels: (ws?.welcome_channels ?? []).map((w) => ({
      channel_id: w.channel_id != null ? String(w.channel_id) : null,
      description: w.description ?? '',
      emoji_name: w.emoji_name ?? null,
    })),
  });
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
async function applyChannels(cfg, roleIds, botPerms, guild) {
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
      // Community-only channel types (announcement, stage voice) wait for
      // pass 2; ensureCommunity turns COMMUNITY on, then the second pass
      // creates them. This holds within the run -- it does not give up.
      if (channelGatedOut(channel, guild)) {
        console.log(
          `  channel #${channel.name}: held for pass 2 (needs COMMUNITY, type ${channel.type})`,
        );
        continue;
      }
      const existing = liveByName.get(channel.name);
      const overwrites = (channel.overwrites ?? []).map((ow) => {
        // Allow only the bits the bot can grant; warn (don't fail) on the
        // rest. Deny is restrictive, not an elevation, so it passes through.
        const { granted, dropped } = filterGrantable(permsToBits(ow.allow ?? []), botPerms);
        if (dropped !== 0n) {
          logManual(
            `channel #${channel.name} (${ow.role}): cannot grant ${bitsToPermNames(dropped).join(', ')} via overwrite (bot lacks it). Set by hand.`,
          );
        }
        return {
          id: roleIds.get(ow.role) ?? ow.role,
          type: 0, // role
          allow: granted.toString(),
          deny: permsToBits(ow.deny ?? []).toString(),
        };
      });
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
      // Managed overwrites layered over live (preserve member overwrites +
      // any role we don't declare, since PATCH replaces the whole list).
      const merged = mergeOverwrites(existing.permission_overwrites, overwrites);
      // Diff only the fields we manage (skip Discord-computed ones like
      // last_message_id).
      const drift = [];
      if (existing.topic !== desired.topic) drift.push(['topic', existing.topic, desired.topic]);
      if ((existing.rate_limit_per_user ?? 0) !== desired.rate_limit_per_user)
        drift.push(['slowmode', existing.rate_limit_per_user, desired.rate_limit_per_user]);
      if (overwritesDiffer(existing.permission_overwrites, merged))
        drift.push(['permissions', '(overwrites)', '(reconciled)']);
      if (drift.length === 0) {
        logOk(`channel ${channel.name}`);
        continue;
      }
      desired.permission_overwrites = merged;
      // Don't re-send forum tags on update: PATCHing available_tags
      // without their ids recreates them and drops existing posts' tags.
      // Tags are set at create time only.
      delete desired.available_tags;
      for (const [k, b, a] of drift) logChange(`channel ${channel.name}.${k}`, b, a);
      await discord('PATCH', `/channels/${existing.id}`, desired);
    }
  }
  return idByName;
}

/**
 * Enable the COMMUNITY feature programmatically so announcement / stage
 * channels, onboarding, the welcome screen, and the rules gate can be
 * provisioned (not skipped). No-op if already on. Needs the rules +
 * public-updates text channels to exist (created in the first channel pass).
 * Returns { guild, justEnabled } -- justEnabled triggers a second channel
 * pass for the now-unlocked types.
 */
async function ensureCommunity(cfg, guild, channelIds) {
  if (hasFeature(guild, 'COMMUNITY')) return { guild, justEnabled: false };
  const rulesName = cfg.server?.rules_channel;
  const updatesName = cfg.server?.public_updates_channel;
  const rulesId = rulesName ? channelIds.get(rulesName) : null;
  const updatesId = updatesName ? channelIds.get(updatesName) : null;
  if (!rulesId || !updatesId) {
    logManual(
      `COMMUNITY not enabled: needs text channels server.rules_channel ("${rulesName}") + server.public_updates_channel ("${updatesName}") to exist first.`,
    );
    return { guild, justEnabled: false };
  }
  logChange('server.features', (guild.features ?? []).join(', ') || '(none)', 'COMMUNITY');
  const updated = await discord(
    'PATCH',
    `/guilds/${GUILD_ID}`,
    buildCommunityPatch(guild, rulesId, updatesId),
  );
  // verify/dry stub the PATCH (updated === null) -> report only, no 2nd pass.
  if (!updated) return { guild, justEnabled: false };
  return { guild: updated, justEnabled: true };
}

/** The bot's own managed (integration) role -- the one Discord auto-creates
 *  for the bot app. Needed to grant the bot channel access it lacks. */
async function getBotRoleId(botUserId) {
  const roles = await discord('GET', `/guilds/${GUILD_ID}/roles`);
  return (roles ?? []).find((r) => r.tags?.bot_id === botUserId)?.id ?? null;
}

/** Grant the bot View + Send on every AutoMod alert channel, so rule creation
 *  doesn't 400 with INVALID_AUTO_MODERATION_CHANNEL_FLAG_ACTION_ACCESS. PUT is
 *  idempotent -- it sets (creates or updates) the bot-role overwrite. */
async function ensureBotAlertAccess(cfg, channelIds, botRoleId) {
  const targets = alertChannelNames(cfg);
  if (targets.length === 0) return;
  if (!botRoleId) {
    logManual('Cannot grant bot access to AutoMod alert channels: bot role not found.');
    return;
  }
  const allow = (PERM.VIEW_CHANNEL | PERM.SEND_MESSAGES).toString();
  for (const name of targets) {
    const chId = channelIds.get(name);
    if (!chId) continue;
    await discord('PUT', `/channels/${chId}/permissions/${botRoleId}`, {
      type: 0, // role overwrite
      allow,
      deny: '0',
    });
    logOk(`bot access -> #${name} (AutoMod alert target)`);
  }
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
    // Deep diff -- normalized for Discord's read-time array reordering --
    // so keyword/regex/preset/threshold/action/exempt drift all reconcile.
    if (automodDiffers(existing, desired)) {
      logChange(`automod ${rule.name}`, '(rule drift)', '(reconciled)');
      await discord('PATCH', `/guilds/${GUILD_ID}/auto-moderation/rules/${existing.id}`, desired);
      continue;
    }
    logOk(`automod ${rule.name}`);
  }
}

/** Build the onboarding PUT body with client-supplied (monotonic) ids.
 *  Discord reassigns its own ids on save; ours just need to be unique. */
function buildOnboarding(cfg, channelIds, roleIds) {
  let counter = 1;
  const nextId = () => String(counter++);
  return {
    enabled: true,
    mode: cfg.onboarding.mode ?? 1,
    default_channel_ids: (cfg.onboarding.default_channel_ids ?? [])
      .map((n) => channelIds.get(n))
      .filter(Boolean),
    prompts: (cfg.onboarding.prompts ?? []).map((p) => ({
      id: nextId(),
      title: p.title,
      type: p.type ?? 0,
      single_select: p.single_select ?? true,
      required: p.required ?? false,
      in_onboarding: true,
      options: (p.options ?? []).map((o) => ({
        id: nextId(),
        title: o.title,
        description: o.description ?? '',
        emoji: o.emoji_name ? { name: o.emoji_name } : null,
        role_ids: (o.role_ids ?? []).map((r) => roleIds.get(r)).filter(Boolean),
        channel_ids: (o.channel_ids ?? []).map((c) => channelIds.get(c)).filter(Boolean),
      })),
    })),
  };
}

/**
 * Onboarding flow. PUT /guilds/{id}/onboarding. COMMUNITY-gated; diffed
 * against live (id-agnostic) so verify reports drift only on real change.
 */
async function applyOnboarding(cfg, guild, channelIds, roleIds) {
  if (!cfg.onboarding?.enabled) {
    logOk('onboarding (disabled)');
    return;
  }
  if (!hasFeature(guild, 'COMMUNITY')) {
    console.log('  onboarding: skipped (guild lacks COMMUNITY)');
    return;
  }
  const desired = buildOnboarding(cfg, channelIds, roleIds);
  const need = onboardingChannelCount(desired);
  if (need < 7) {
    logManual(
      `onboarding surfaces only ${need} channels; Discord needs >= 7 (default + prompt-referenced) to enable it.`,
    );
  }
  const live = await discord('GET', `/guilds/${GUILD_ID}/onboarding`);
  if (live && normalizeOnboarding(live) === normalizeOnboarding(desired)) {
    logOk('onboarding');
    return;
  }
  logChange('onboarding', '(flow)', '(reconciled)');
  await discord('PUT', `/guilds/${GUILD_ID}/onboarding`, desired);
}

/**
 * Welcome screen. PATCH /guilds/{id}/welcome-screen. COMMUNITY-gated;
 * diffed against live so verify is accurate.
 */
async function applyWelcome(cfg, guild, channelIds) {
  if (!cfg.welcome?.enabled) {
    logOk('welcome screen (disabled)');
    return;
  }
  if (!hasFeature(guild, 'COMMUNITY')) {
    console.log('  welcome screen: skipped (guild lacks COMMUNITY)');
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
  const live = await discord('GET', `/guilds/${GUILD_ID}/welcome-screen`);
  if (live && normalizeWelcome(live) === normalizeWelcome(desired)) {
    logOk('welcome screen');
    return;
  }
  logChange('welcome screen', '(screen)', '(reconciled)');
  await discord('PATCH', `/guilds/${GUILD_ID}/welcome-screen`, desired);
}

/**
 * Webhook name + avatar for each channel that declares `webhook: <ENV>`.
 * Uses the token-in-URL endpoint (no bot perms; the secret URL is the
 * auth), and never rotates the webhook -- only its name/avatar -- so the
 * stored secret stays valid. Skips cleanly when the secret isn't in env.
 */
async function applyWebhooks(cfg) {
  const declared = [];
  for (const cat of cfg.categories ?? []) {
    for (const ch of cat.channels ?? []) {
      if (ch.webhook) declared.push({ channel: ch.name, envName: ch.webhook });
    }
  }
  if (declared.length === 0) return;

  const wcfg = cfg.webhooks ?? {};
  const desiredName = wcfg.name ?? 'Heron';
  let avatar = null; // { dataUri, sourceSha }
  if (wcfg.avatar) {
    const abs = safeRepoPath(wcfg.avatar);
    if (abs && existsSync(abs)) avatar = imageToDataUri(abs);
    else logManual(`webhooks.avatar: source image missing or outside the repo: ${wcfg.avatar}`);
  }

  for (const { channel, envName } of declared) {
    const url = process.env[envName];
    if (!url) {
      console.log(`  webhook ${envName} (#${channel}): skipped (secret not in env)`);
      continue;
    }
    const parsed = parseWebhookUrl(url);
    if (!parsed) {
      logManual(`webhook ${envName}: malformed URL in secret`);
      continue;
    }
    const live = await webhookRequest('GET', parsed.id, parsed.token);
    const patch = {};
    if (live && live.name !== desiredName) patch.name = desiredName;
    const stateKey = `webhook.${envName}.avatar`;
    if (avatar && imageDrift(imageState[stateKey], avatar.sourceSha, live?.avatar)) {
      patch.avatar = avatar.dataUri;
    }
    if (Object.keys(patch).length === 0) {
      logOk(`webhook ${envName}`);
      continue;
    }
    logChange(`webhook ${envName}`, live?.name ?? null, Object.keys(patch).join('+'));
    const updated = await webhookRequest('PATCH', parsed.id, parsed.token, patch);
    if (updated && patch.avatar) {
      imageState[stateKey] = { sourceSha: avatar.sourceSha, discordHash: updated.avatar ?? null };
      imageStateDirty = true;
    }
  }
}

/**
 * Bot profile avatar + banner (PATCH /users/@me). Heavily rate-limited,
 * so hash-state gating means we only write on real drift. `botUser` is
 * the GET /users/@me object preflight already fetched.
 */
async function applyBotProfile(cfg, botUser) {
  const bcfg = cfg.bot ?? {};
  const patch = {};
  const pending = [];
  for (const field of ['avatar', 'banner']) {
    const src = bcfg[field];
    if (!src) continue;
    const abs = safeRepoPath(src);
    if (!abs || !existsSync(abs)) {
      logManual(`bot.${field}: source image missing or outside the repo: ${src}`);
      continue;
    }
    const { dataUri, sourceSha } = imageToDataUri(abs);
    const stateKey = `bot.${field}`;
    if (!imageDrift(imageState[stateKey], sourceSha, botUser?.[field])) continue;
    logChange(`bot.${field}`, botUser?.[field] ?? null, `${src}#${sourceSha.slice(0, 8)}`);
    patch[field] = dataUri;
    pending.push({ stateKey, field, sourceSha });
  }
  if (Object.keys(patch).length === 0) {
    logOk('bot profile');
    return;
  }
  const updated = await discord('PATCH', '/users/@me', patch);
  if (updated && pending.length) {
    for (const { stateKey, field, sourceSha } of pending) {
      imageState[stateKey] = { sourceSha, discordHash: updated[field] ?? null };
    }
    imageStateDirty = true;
  }
}

/**
 * Server widget: enable + the "invite channel" a widget invite points at.
 * PATCH /guilds/{id}/widget. Resolved after channels.
 */
async function applyWidget(cfg, channelIds) {
  const w = cfg.server?.widget;
  if (!w) return;
  const live = await discord('GET', `/guilds/${GUILD_ID}/widget`);
  const desiredEnabled = w.enabled ?? false;
  const desiredChannel = w.invite_channel ? (channelIds.get(w.invite_channel) ?? null) : null;
  if (
    live &&
    Boolean(live.enabled) === Boolean(desiredEnabled) &&
    (live.channel_id ?? null) === desiredChannel
  ) {
    logOk('server widget');
    return;
  }
  logChange(
    'server widget',
    { enabled: live?.enabled, channel_id: live?.channel_id },
    { enabled: desiredEnabled, channel_id: desiredChannel },
  );
  await discord('PATCH', `/guilds/${GUILD_ID}/widget`, {
    enabled: desiredEnabled,
    channel_id: desiredChannel,
  });
}

/**
 * Membership-screening "rules" gate. PATCH /guilds/{id}/member-verification.
 * Needs the COMMUNITY feature; form_fields are validated client-side to
 * dodge the endpoint's opaque 500 on a malformed body.
 */
async function applyMemberVerification(cfg, guild) {
  const r = cfg.rules;
  if (!r?.enabled) {
    logOk('member verification (disabled)');
    return;
  }
  if (!hasFeature(guild, 'COMMUNITY')) {
    console.log('  member verification: skipped (guild lacks COMMUNITY)');
    return;
  }
  const errors = validateFormFields(r.form_fields ?? []);
  if (errors.length) {
    for (const e of errors) logManual(`rules: ${e}`);
    return;
  }
  const live = await discord('GET', `/guilds/${GUILD_ID}/member-verification`);
  const desired = {
    enabled: true,
    description: r.description ?? '',
    form_fields: (r.form_fields ?? []).map((f) => ({
      field_type: f.field_type,
      label: f.label,
      required: f.required ?? true,
      values: f.values ?? [],
    })),
  };
  if (live && normalizeMemberVerification(live) === normalizeMemberVerification(desired)) {
    logOk('member verification');
    return;
  }
  logChange('member verification', '(rules)', '(reconciled)');
  await discord('PATCH', `/guilds/${GUILD_ID}/member-verification`, desired);
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  TOKEN = process.env.DISCORD_BOT_TOKEN;
  if (!TOKEN) {
    console.error(
      '::error::DISCORD_BOT_TOKEN env var required (apply / verify / dry all read live state).',
    );
    process.exit(1);
  }
  GUILD_ID = resolveGuildId();

  console.log('▸ Discord reconciler');
  console.log(`  mode: ${VERIFY_ONLY ? 'verify' : DRY_RUN ? 'dry-run' : 'apply'}`);
  console.log(`  guild: ${GUILD_ID}`);
  console.log(`  config: ${CONFIG_PATH.replace(REPO_ROOT + '/', '')}`);

  const cfg = loadConfig();
  imageState = loadImageState();
  const { botUser, botPerms } = await preflight();

  let guild = await applyServer(cfg);
  await applyBotProfile(cfg, botUser);
  const roleIds = await applyRoles(cfg, botPerms, guild);
  // First channel pass creates everything except the COMMUNITY-only types
  // (announcement / stage), which wait for pass 2. That guarantees the rules +
  // public-updates channels exist for the COMMUNITY enable below.
  let channelIds = await applyChannels(cfg, roleIds, botPerms, guild);
  const community = await ensureCommunity(cfg, guild, channelIds);
  guild = community.guild;
  // COMMUNITY just turned on -> a second pass now creates those held types
  // and the newly reachable phases (rules gate / onboarding / welcome) below
  // provision instead of skipping.
  if (community.justEnabled) {
    channelIds = await applyChannels(cfg, roleIds, botPerms, guild);
  }
  // Grant the bot access to AutoMod alert channels before creating the rules.
  await ensureBotAlertAccess(cfg, channelIds, await getBotRoleId(botUser.id));
  await applySystemChannel(cfg, guild, channelIds);
  await applyWidget(cfg, channelIds);
  await applyMemberVerification(cfg, guild);
  await applyAutomod(cfg, channelIds, roleIds);
  await applyOnboarding(cfg, guild, channelIds, roleIds);
  await applyWelcome(cfg, guild, channelIds);
  await applyWebhooks(cfg);

  if (imageStateDirty) saveImageState(imageState);

  if (manualCount > 0) {
    console.log(
      `\n⚠ ${manualCount} setting${manualCount === 1 ? '' : 's'} need a manual touch (see ::warning:: lines above).`,
    );
  }
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

// Only run when invoked directly (`node apply-discord-config.mjs`). Importing
// the module (the test suite) gets the exported helpers without side effects.
const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  main().catch((e) => {
    console.error(`::error::${e.message}`);
    console.error(e.stack);
    process.exit(2);
  });
}
