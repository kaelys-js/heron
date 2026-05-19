/**
 * user-secrets.ts — per-user encrypted credential store.
 *
 * Each user holds their own personal credentials (Anthropic / Gemini /
 * Adzuna / Gmail-IMAP / OpenAI keys + tokens) under
 * `data/users/{userId}/profiles/_shared/secrets.json`. This module is
 * the ONLY surface that reads/writes that file.
 *
 * Why per-user (not in `.env`):
 *   The previous model shared every credential install-wide via .env.
 *   That broke the multi-user contract — user A's Anthropic key would
 *   bill user B's evaluations, and only the OWNER could configure
 *   Gmail IMAP (see scan-email-imap.job.ts F14/F19/F27 deferred note).
 *   This module's existence retires that limitation.
 *
 * File format (single JSON blob, written atomically):
 *
 *   {
 *     "version": 1,
 *     "salt": "<base64 32-byte random — per-user, generated once>",
 *     "entries": {
 *       "ANTHROPIC_API_KEY": {
 *         "iv": "<base64 12-byte random — per-write>",
 *         "ciphertext": "<base64 AES-256-GCM>",
 *         "tag": "<base64 16-byte GCM auth tag>"
 *       },
 *       "GEMINI_API_KEY": { ... }
 *     }
 *   }
 *
 * Why per-entry IV instead of one envelope:
 *   - Lets listSecretKeys() return key names without decrypting the
 *     entire file (the keys aren't secret; their values are).
 *   - Lets setSecret() update a single entry without re-randomizing
 *     every other entry's IV (smaller diff, simpler atomicity story).
 *
 * Key derivation:
 *   ikm  = sha256(BETTER_AUTH_SECRET)        // 32 bytes
 *   key  = HKDF-SHA256(ikm, salt, "heron-user-secrets-v1", 32)
 *
 * Salt is per-user (stored in the file), so even with the same
 * BETTER_AUTH_SECRET two users encrypt under different keys.
 *
 * Threat model:
 *   ✓ Protects values from accidental backup tarballing / git
 *     commit of the data tree.
 *   ✓ Protects against `grep -r sk-ant data/` on a shared machine.
 *   ✗ Does NOT protect against an attacker who has BOTH the data
 *     directory AND the BETTER_AUTH_SECRET. For OS-keychain-level
 *     isolation see branding/REBRAND-PROCESS.md (rejected as
 *     out-of-scope for single-machine local-first deployments).
 *
 * Concurrency:
 *   Writes are atomic (write-to-tmp + rename). Concurrent writers
 *   from the SAME process serialize through Node's event loop — no
 *   in-process race possible. Across-process concurrency (CLI
 *   scripts + dashboard) is mitigated by the rename being atomic
 *   on POSIX; last-writer-wins is acceptable because credentials
 *   change rarely + manually.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { userSharedPathForUser } from './profile-paths';

/** On-disk schema version. Bump when format changes; old files require
 *  an explicit migration (we don't auto-rotate to avoid silently losing
 *  data on schema mistakes). */
const SCHEMA_VERSION = 1;

/** HKDF "info" string. Versioned so a future migration to v2 can
 *  derive a fresh key without re-running KDF over v1's salt. */
const HKDF_INFO = 'heron-user-secrets-v1';

/** GCM IV size in bytes. 12 is the NIST-recommended size for AES-GCM. */
const IV_BYTES = 12;

/** Per-user salt size in bytes. 32 bytes = 256 bits — overkill for HKDF
 *  but matches the underlying AES-256 key strength. */
const SALT_BYTES = 32;

type Entry = {
  iv: string; // base64
  ciphertext: string; // base64
  tag: string; // base64
};

type SecretsFile = {
  version: number;
  salt: string; // base64
  entries: Record<string, Entry>;
};

/** Throw a clear error when BETTER_AUTH_SECRET is missing rather than
 *  silently producing a bad-key. The auth subsystem auto-generates this
 *  on first boot (see auth.ts::getOrCreateSecret), so the only way to
 *  hit this branch is to explicitly `delete process.env.BETTER_AUTH_SECRET`
 *  — which the test suite does to verify the error path. */
function requireBetterAuthSecret(): string {
  const s = process.env.BETTER_AUTH_SECRET;
  if (!s) {
    throw new Error(
      'user-secrets: BETTER_AUTH_SECRET missing. ' +
        'It is auto-generated on first dashboard boot; if you see this in ' +
        'a CLI script, ensure your `.env` is loaded before importing user-secrets.',
    );
  }
  return s;
}

/** Derive the AES-256 key for a given user.
 *
 *  HKDF-SHA256(ikm = sha256(BETTER_AUTH_SECRET), salt, info, 32 bytes).
 *
 *  The double-hashing of BETTER_AUTH_SECRET (sha256 first, then HKDF) is
 *  defense-in-depth: BETTER_AUTH_SECRET is hex-encoded user input (32+
 *  chars from `openssl rand -hex 32`), so it has 128 bits of entropy max
 *  in 64 chars. sha256 of it gives a clean 256-bit IKM the HKDF can
 *  spread evenly with the per-user salt. */
function deriveKey(saltB64: string): Buffer {
  const ikm = createHash('sha256').update(requireBetterAuthSecret()).digest();
  const salt = Buffer.from(saltB64, 'base64');
  // hkdfSync returns ArrayBuffer; wrap as Buffer for the crypto API.
  return Buffer.from(hkdfSync('sha256', ikm, salt, HKDF_INFO, 32));
}

function emptyFile(): SecretsFile {
  return {
    version: SCHEMA_VERSION,
    salt: randomBytes(SALT_BYTES).toString('base64'),
    entries: {},
  };
}

/** Read + parse the secrets file for a user. Returns a fresh empty
 *  in-memory record if the file doesn't exist. Doesn't write. */
function readFile(userId: string): SecretsFile {
  const p = userSharedPathForUser(userId, 'secrets');
  if (!fs.existsSync(p)) return emptyFile();
  const raw = fs.readFileSync(p, 'utf8');
  let parsed: SecretsFile;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `user-secrets: ${p} is not valid JSON. Restore from backup or delete to reset.`,
    );
  }
  if (parsed.version !== SCHEMA_VERSION) {
    throw new Error(
      `user-secrets: ${p} version=${parsed.version}, expected ${SCHEMA_VERSION}. ` +
        'No automatic migration — see user-secrets.ts SCHEMA_VERSION comment.',
    );
  }
  if (typeof parsed.salt !== 'string' || typeof parsed.entries !== 'object') {
    throw new Error(`user-secrets: ${p} malformed (missing salt or entries).`);
  }
  return parsed;
}

/** Atomic write — same write-to-tmp + rename pattern as sources.ts. */
function writeFile(userId: string, data: SecretsFile): void {
  const p = userSharedPathForUser(userId, 'secrets');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  // Open with explicit mode so the FILE itself is created 0600 from
  // the start — not 0644-then-chmod, which races against any reader
  // hitting the file in the window between rename and chmod.
  const fd = fs.openSync(tmp, 'w', 0o600);
  try {
    fs.writeSync(fd, JSON.stringify(data, null, 2) + '\n');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, p);
  // Belt-and-braces: ensure mode is 0600 even if umask widened it.
  // Skip on Windows where chmod semantics differ.
  if (process.platform !== 'win32') {
    fs.chmodSync(p, 0o600);
  }
}

/** Get the cleartext value for a single key. Returns null if the file
 *  doesn't exist or the key isn't in it. */
export function getSecret(userId: string, key: string): string | null {
  const data = readFile(userId);
  const entry = data.entries[key];
  if (!entry) return null;
  const aesKey = deriveKey(data.salt);
  const iv = Buffer.from(entry.iv, 'base64');
  const tag = Buffer.from(entry.tag, 'base64');
  const ciphertext = Buffer.from(entry.ciphertext, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(tag);
  // decipher.update + .final both throw on auth-tag mismatch (rotated
  // BETTER_AUTH_SECRET, tampered file, etc.) — surface that loudly
  // rather than returning a corrupt plaintext.
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

/** Set (or overwrite) the value for a key. Creates the file + parent
 *  directories if needed. */
export function setSecret(userId: string, key: string, value: string): void {
  const data = readFile(userId);
  const aesKey = deriveKey(data.salt);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', aesKey, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  data.entries[key] = {
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: tag.toString('base64'),
  };
  writeFile(userId, data);
}

/** Remove a key. No-op if the key (or the file) doesn't exist. */
export function deleteSecret(userId: string, key: string): void {
  const p = userSharedPathForUser(userId, 'secrets');
  if (!fs.existsSync(p)) return;
  const data = readFile(userId);
  if (!(key in data.entries)) return;
  delete data.entries[key];
  writeFile(userId, data);
}

/** List the keys (NOT the values) that have a per-user secret stored.
 *  Useful for the Settings UI to show which credentials a user has
 *  configured without exposing the underlying values. */
export function listSecretKeys(userId: string): string[] {
  const p = userSharedPathForUser(userId, 'secrets');
  if (!fs.existsSync(p)) return [];
  const data = readFile(userId);
  return Object.keys(data.entries);
}

/**
 * Two-tier credential resolver: per-user store wins, .env is the
 * fallback. This is the shape every consumer should use — `ai.ts`,
 * `gemini-eval.mjs`, IMAP, etc. all read through here so the
 * per-user override is honored without changing their call shape
 * beyond passing the userId in.
 *
 * Returns null when neither source has a value. Callers translate
 * null into "feature disabled" / "configure in Settings".
 */
export function getCredential(userId: string, key: string): string | null {
  // Per-user store wins. The lookup is cheap (one file read + one
  // AES-GCM decrypt) — small enough to do per call. If a consumer
  // becomes hot enough to need memoization, cache the result at the
  // call site (e.g. an Anthropic client singleton keyed by userId).
  const fromStore = getSecret(userId, key);
  if (fromStore !== null) return fromStore;
  const fromEnv = process.env[key];
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;
  return null;
}

/**
 * The credential keys that conceptually belong per-user (rather than
 * install-wide). Used by:
 *
 *   - /api/settings/secrets endpoint (allowlist of writable keys)
 *   - migrateEnvToUserSecrets() (which keys to copy from .env into the
 *     OWNER's per-user store on first boot post-upgrade)
 *
 * NOT exhaustive of every env var the app reads — only the personal
 * credentials. Infrastructure config (BETTER_AUTH_SECRET, GITHUB_CLIENT_*,
 * CAREER_OPS_DATA_DIR, HERON_UPDATE_*) stays in `.env` because it's
 * shared across all users by design.
 */
export const MIGRATABLE_KEYS = [
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'OPENAI_API_KEY',
  'ADZUNA_APP_ID',
  'ADZUNA_APP_KEY',
  'GMAIL_IMAP_HOST',
  'GMAIL_IMAP_USER',
  'GMAIL_IMAP_PASSWORD',
  'GMAIL_IMAP_LABEL',
] as const;

/**
 * One-shot migration helper: copy install-wide `.env` credentials into
 * the OWNER's per-user store. Called once per dashboard boot by
 * orchestrator.ts::bootOnce() AFTER loadEnv() has populated process.env.
 *
 * Idempotent on every axis:
 *
 *   - If the owner already has a value for KEY: skip (don't clobber).
 *   - If .env doesn't have KEY: skip.
 *   - If no owner exists yet (pre-onboarding fresh install): skip.
 *   - If BETTER_AUTH_SECRET isn't loaded yet: skip (the migration
 *     would fail to encrypt; the next boot retries).
 *
 * Best-effort: any error is swallowed + logged so it can't crash boot.
 * The user still has their .env-fallback path working, so this is purely
 * an opportunistic upgrade — not a blocking gate.
 *
 * Behavioural contract for the user:
 *
 *   First boot post-upgrade with .env containing ANTHROPIC_API_KEY=sk-x:
 *     → silently copies sk-x into encrypted per-user store
 *     → owner sees one activity-feed event listing migrated keys
 *     → subsequent boots are no-ops because the keys are already in store
 *     → .env still works as fallback (we don't delete from .env)
 *
 * The user can manually remove keys from .env once they've verified the
 * per-user copies work; documented in AGENTS.md.
 */
export async function migrateEnvToUserSecrets(): Promise<void> {
  if (!process.env.BETTER_AUTH_SECRET) return;

  let ownerId: string;
  try {
    const { getOwnerUserId } = await import('./user-context');
    ownerId = await getOwnerUserId();
  } catch {
    return; // DB not ready
  }
  // user-context returns SYSTEM_USER_ID when no real owner exists yet.
  // We don't want to silently populate SYSTEM's secrets — wait for a
  // real owner to register first.
  const { SYSTEM_USER_ID } = await import('./user-context');
  if (ownerId === SYSTEM_USER_ID) return;

  const migrated: string[] = [];
  for (const key of MIGRATABLE_KEYS) {
    const envVal = process.env[key];
    if (typeof envVal !== 'string' || envVal.length === 0) continue;
    // Don't clobber an existing per-user value — once the user has
    // configured a key in Settings, .env never wins over it (the
    // resolver's per-user-first contract).
    if (getSecret(ownerId, key) !== null) continue;
    try {
      setSecret(ownerId, key, envVal);
      migrated.push(key);
    } catch {
      // Encryption failed (e.g., disk full). Log via events when we
      // emit the summary below.
    }
  }

  if (migrated.length > 0) {
    try {
      const { logEvent } = await import('./events');
      logEvent('settings.secrets', 'Auto-migrated .env credentials to per-user store', {
        level: 'info',
        category: 'system',
        message:
          migrated.join(', ') +
          ' moved into encrypted per-user store. .env values still work as fallback.',
      });
    } catch {
      // Events unavailable — fine. The migration itself succeeded.
    }
  }
}
