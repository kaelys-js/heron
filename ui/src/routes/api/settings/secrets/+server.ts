/** /api/settings/secrets -- per-user encrypted credential store.
 *  Unlike /api/settings (owner-only, install-wide .env), this is scoped
 *  to the authenticated user: members manage their own Anthropic / Gemini /
 *  Adzuna / Gmail-IMAP / OpenAI keys without owner perms.
 *    GET    → list keys (masked)   POST → upsert    DELETE ?key=NAME
 *  Stored at data/users/{uid}/profiles/_shared/secrets.json, AES-256-GCM,
 *  HKDF per-user key -- see lib/server/user-secrets.ts. _KNOWN_KEYS
 *  allowlist blocks the store from being used as a generic kv cache. */
import { wrap, badRequest } from '$lib/server/api-helpers';
import { requireUserId } from '$lib/server/auth-helpers';
import { deleteSecret, getSecret, listSecretKeys, setSecret } from '$lib/server/user-secrets';
import { logEvent } from '$lib/server/events';

/** The credential keys that the codebase actually reads. Any POST/DELETE
 *  with a key outside this set returns 400 -- prevents abuse of the
 *  encrypted-blob store as a generic per-user key/value cache.
 *
 *  When a new credential needs per-user scoping, ADD IT HERE first,
 *  then wire the consumer (ai.ts pattern: `getCredential(userId, KEY)`). */
// Prefixed with `_` so SvelteKit's `+server.ts` exports allowlist
// (GET/POST/etc + anything starting with `_`) accepts it. The constant
// is internal to this endpoint -- no other module imports it.
const _KNOWN_KEYS = [
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

type SecretKey = (typeof _KNOWN_KEYS)[number];

/** Mask a stored value the same way readEnvMasked does, so the UI
 *  shows '****abcd' / blank consistently between .env-fallback and
 *  per-user paths. */
function mask(value: string | null): string {
  if (!value) return '';
  if (value.length < 8) return '****';
  return '****' + value.slice(-4);
}

export const GET = wrap('settings.secrets', async ({ locals }: { locals: App.Locals }) => {
  const userId = requireUserId(locals);
  const present = new Set(listSecretKeys(userId));
  // Build a stable object listing every KNOWN_KEY -- present keys show
  // their masked value, absent keys show empty string. Lets the UI
  // render a fixed-shape form with consistent placeholders.
  const out: Record<string, string> = {};
  for (const k of _KNOWN_KEYS) {
    if (present.has(k)) {
      const v = getSecret(userId, k);
      out[k] = mask(v);
    } else {
      out[k] = '';
    }
  }
  return out;
});

export const POST = wrap(
  'settings.secrets',
  async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const userId = requireUserId(locals);
    const updates = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!updates || typeof updates !== 'object') {
      badRequest('expected JSON object of secret updates');
    }
    const allowed = new Set<string>(_KNOWN_KEYS);
    const changed: string[] = [];
    for (const [k, v] of Object.entries(updates)) {
      if (!allowed.has(k)) {
        badRequest(`unknown key: ${k}. Allowed: ${_KNOWN_KEYS.join(', ')}`);
      }
      // Empty string → delete. Strings starting with '****' are the
      // masked round-trip from the UI when the user didn't edit that
      // field -- silently skip.
      if (typeof v !== 'string') {
        badRequest(`value for ${k} must be a string`);
      }
      const val = (v as string).trim();
      if (val === '') {
        deleteSecret(userId, k);
        changed.push(k + ' (deleted)');
      } else if (val.startsWith('****')) {
        /* unchanged masked round-trip -- skip */
      } else {
        setSecret(userId, k, val);
        changed.push(k);
      }
    }
    logEvent('settings.secrets', 'Per-user credentials updated', {
      level: 'success',
      category: 'user',
      message: changed.length ? changed.join(', ') : 'no changes',
    });
    return { current: await readMaskedForUser(userId) };
  },
);

export const DELETE = wrap(
  'settings.secrets',
  async ({ url, locals }: { url: URL; locals: App.Locals }) => {
    const userId = requireUserId(locals);
    const key = url.searchParams.get('key');
    if (!key) badRequest('missing ?key query param');
    if (!(_KNOWN_KEYS as readonly string[]).includes(key)) {
      badRequest(`unknown key: ${key}`);
    }
    deleteSecret(userId, key);
    logEvent('settings.secrets', 'Per-user credential deleted', {
      level: 'success',
      category: 'user',
      message: key,
    });
    return { current: await readMaskedForUser(userId) };
  },
);

async function readMaskedForUser(userId: string): Promise<Record<string, string>> {
  const present = new Set(listSecretKeys(userId));
  const out: Record<string, string> = {};
  for (const k of _KNOWN_KEYS) {
    out[k] = present.has(k) ? mask(getSecret(userId, k)) : '';
  }
  return out;
}
