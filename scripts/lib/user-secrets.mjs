/**
 * user-secrets.mjs -- JS twin of ui/src/lib/server/user-secrets.ts.
 *
 * CLI scripts (gemini-eval.mjs, scan-email-imap.mjs, etc.) can't easily
 * import from the TypeScript dashboard codebase, so this file mirrors
 * the encryption format byte-for-byte. The on-disk schema is identical;
 * a file written by either side decrypts correctly with the other.
 *
 * Round-trip parity is enforced by a vitest case (search for
 * `mjs-ts parity`). Touch either side and re-run that test.
 *
 * Resolution order for a CLI script that wants a credential:
 *   1. per-user value (this module) -- keyed by `HERON_USER_ID` env
 *   2. process.env fallback (legacy single-user install)
 *
 * If HERON_USER_ID isn't set, scripts fall straight through to
 * process.env -- that's the pre-multi-user path and stays supported.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, createDecipheriv, hkdfSync } from 'node:crypto';

const SCHEMA_VERSION = 1;
const HKDF_INFO = 'heron-user-secrets-v1';
const SYSTEM_USER_ID = 'system-user';

/** Repo root. Mirrors scripts/native/_lib.mjs's REPO_ROOT semantics. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Data directory. Same precedence as ui/src/lib/server/db/index.ts:
 *  HERON_DATA_DIR > HERON_DATA_DIR > <repo>/data. The override
 *  variants let the vitest parity case and any future migration scripts
 *  point at a tmpdir without touching the developer's real `data/`. */
function dataDir() {
  return process.env.HERON_DATA_DIR || process.env.HERON_DATA_DIR || join(REPO_ROOT, 'data');
}

/** Resolve the on-disk secrets path for a user. Mirrors
 *  ui/src/lib/server/profile-paths.ts::userSharedPathForUser('secrets').
 *  @param {string} userId
 *  @returns {string}
 */
function secretsFileFor(userId) {
  const data = dataDir();
  if (userId === SYSTEM_USER_ID) {
    return join(data, 'profiles', '_shared', 'secrets.json');
  }
  return join(data, 'users', userId, 'profiles', '_shared', 'secrets.json');
}

/**
 * @param {string} saltB64
 * @returns {Buffer}
 */
function deriveKey(saltB64) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      'user-secrets.mjs: BETTER_AUTH_SECRET missing — load .env before resolving credentials.',
    );
  }
  const ikm = createHash('sha256').update(secret).digest();
  const salt = Buffer.from(saltB64, 'base64');
  return Buffer.from(hkdfSync('sha256', ikm, salt, HKDF_INFO, 32));
}

/** Decrypt a single key from the user's secrets file. Returns null if
 *  the file doesn't exist or the key isn't in it. Throws if the file
 *  is present but corrupt or the auth tag doesn't verify (rotated
 *  BETTER_AUTH_SECRET, tampered file, etc.) -- the caller gets a loud
 *  signal rather than a silent fallback.
 *  @param {string} userId
 *  @param {string} key
 *  @returns {string | null}
 */
export function getSecret(userId, key) {
  const p = secretsFileFor(userId);
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, 'utf8');
  const parsed = JSON.parse(raw);
  if (parsed.version !== SCHEMA_VERSION) {
    throw new Error(
      `user-secrets.mjs: ${p} version=${parsed.version}, expected ${SCHEMA_VERSION}.`,
    );
  }
  const entry = parsed.entries?.[key];
  if (!entry) return null;
  const aesKey = deriveKey(parsed.salt);
  const iv = Buffer.from(entry.iv, 'base64');
  const tag = Buffer.from(entry.tag, 'base64');
  const ciphertext = Buffer.from(entry.ciphertext, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

/** Two-tier resolver: per-user store first, process.env fallback.
 *
 *  CLI usage:
 *    import { getCredential } from '../lib/user-secrets.mjs';
 *    const apiKey = getCredential('GEMINI_API_KEY');
 *
 *  Resolves the userId from HERON_USER_ID. When unset, the function
 *  skips the per-user lookup and goes straight to process.env -- that's
 *  the pre-multi-user path and stays supported.
 *  @param {string} key
 *  @returns {string | null}
 */
export function getCredential(key) {
  const userId = process.env.HERON_USER_ID;
  if (userId) {
    try {
      const fromStore = getSecret(userId, key);
      if (fromStore !== null) return fromStore;
    } catch (err) {
      // Don't bail the script over a decrypt failure -- surface a
      // warning + fall through to process.env. The dashboard's
      // health-check will flag the corrupt secrets.json separately.
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[user-secrets.mjs]', msg);
    }
  }
  const fromEnv = process.env[key];
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;
  return null;
}
