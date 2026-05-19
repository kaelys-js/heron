/**
 * /settings/api-keys -- page loader.
 *
 * Per-user API key management. Open to every authenticated user (not
 * owner-only like /settings) because each user manages THEIR OWN
 * Anthropic / Gemini / Adzuna / OpenAI / Gmail-IMAP credentials.
 *
 * The masked seed makes the form render without a separate XHR on
 * first paint. Subsequent edits / saves / probes go through
 * /api/settings/secrets and /api/settings/test.
 */
import { requireUserId } from '$lib/server/auth-helpers';
import { getSecret, listSecretKeys } from '$lib/server/user-secrets';

/** Same allowlist as /api/settings/secrets -- keep these in sync.
 *  Anything in this list renders a form row on the page. */
const KNOWN_KEYS = [
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

function mask(value: string | null): string {
  if (!value) return '';
  if (value.length < 8) return '****';
  return '****' + value.slice(-4);
}

export async function load({ locals }: { locals: App.Locals }) {
  const userId = requireUserId(locals);
  const present = new Set(listSecretKeys(userId));
  const secrets: Record<string, string> = {};
  for (const k of KNOWN_KEYS) {
    secrets[k] = present.has(k) ? mask(getSecret(userId, k)) : '';
  }
  return { secrets };
}
