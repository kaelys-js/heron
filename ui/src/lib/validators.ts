/** Shared input validators. Each returns { ok:true } or
 *  { ok:false, message }. Lenient by default -- a blank string is OK;
 *  the form layer marks required-ness separately. One job: "is this
 *  value sane?".
 *  URL validators normalise host-only inputs ("github.com/jane") to
 *  https:// before checking so users don't have to type the protocol;
 *  the original value is preserved, we only synthesise for the URL
 *  constructor. */

export type ValidationResult = { ok: true } | { ok: false; message: string };

const OK: ValidationResult = { ok: true };

function fail(message: string): ValidationResult {
  return { ok: false, message };
}

// ---- Generic helpers ---------------------------------------------------

/** Empty / undefined / whitespace counts as "not provided" (always OK). */
export function validateOptional(v: string | undefined | null): boolean {
  return !v || !v.trim();
}

/** Strict required -- empty is a failure. */
export function validateRequired(v: string | undefined | null): ValidationResult {
  if (validateOptional(v)) return fail('Required');
  return OK;
}

// ---- Email -------------------------------------------------------------

/**
 * Lenient RFC-ish email check. Will accept anything an email server would
 * accept in practice -- does NOT enforce TLDs, IDN punycode, or quoted local
 * parts. Catches obvious typos (no @, no domain, trailing space) without
 * being a regex theology project.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function validateEmail(v: string): ValidationResult {
  if (validateOptional(v)) return OK;
  const t = v.trim();
  if (t.length > 254) return fail('Email is too long (max 254 chars)');
  if (!EMAIL_RE.test(t)) return fail("Doesn't look like a valid email — check for typos");
  return OK;
}

// ---- Phone -------------------------------------------------------------

/**
 * Phone validation is HARD because formats vary wildly by country. We
 * accept anything that's plausibly a phone number: digits + common separators,
 * 7-15 digits total (E.164 max), optional leading +.
 */
export function validatePhone(v: string): ValidationResult {
  if (validateOptional(v)) return OK;
  const t = v.trim();
  // Strip everything that's not a digit or '+' to count digits
  const digits = t.replace(/[^\d]/g, '');
  if (digits.length < 7) return fail('Too short — phone numbers are at least 7 digits');
  if (digits.length > 15) return fail('Too long — E.164 max is 15 digits');
  if (!/^\+?[\d\s\-().]+$/.test(t))
    return fail('Use only digits, spaces, dashes, dots, parens, and an optional leading +');
  return OK;
}

// ---- URL helpers -------------------------------------------------------

/**
 * Normalise host-style inputs into a valid URL string. Returns null if the
 * input is so malformed that no protocol can be inferred.
 */
function normaliseUrl(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  // Already has a protocol -- use as-is
  if (/^https?:\/\//i.test(t)) return t;
  // Looks like a host (contains a dot, no spaces) -- assume https
  if (/\./.test(t) && !/\s/.test(t)) return 'https://' + t;
  return null;
}

function tryParseUrl(v: string): URL | null {
  const norm = normaliseUrl(v);
  if (!norm) return null;
  try {
    return new URL(norm);
  } catch {
    return null;
  }
}

// ---- Generic URL ------------------------------------------------------

export function validateUrl(v: string): ValidationResult {
  if (validateOptional(v)) return OK;
  const u = tryParseUrl(v);
  if (!u) return fail("Doesn't look like a URL — try https://example.com");
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return fail('URL must use http or https');
  }
  return OK;
}

// ---- Provider-specific URL validators ---------------------------------

/**
 * Build a host-allowlist validator. Accepts the bare host (without /path)
 * OR any URL whose hostname matches one of the allowed suffixes.
 *
 * Example: validateLinkedIn("linkedin.com/in/jane") → OK
 *          validateLinkedIn("https://www.linkedin.com/in/jane") → OK
 *          validateLinkedIn("https://twitter.com/jane") → fail
 */
function makeHostValidator(allowedSuffixes: string[], displayName: string, exampleHint: string) {
  return (v: string): ValidationResult => {
    if (validateOptional(v)) return OK;
    const u = tryParseUrl(v);
    if (!u) return fail("Doesn't look like a URL — try " + exampleHint);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const matched = allowedSuffixes.some(
      (suffix) => host === suffix || host.endsWith('.' + suffix),
    );
    if (!matched) {
      return fail(
        'Expected a ' + displayName + ' URL — host should be ' + allowedSuffixes.join(' or '),
      );
    }
    return OK;
  };
}

export const validateLinkedIn = makeHostValidator(
  ['linkedin.com'],
  'LinkedIn',
  'linkedin.com/in/your-handle',
);
export const validateGitHub = makeHostValidator(['github.com'], 'GitHub', 'github.com/your-handle');
/** Twitter accepts both X and Twitter domains since the rebrand stuck weirdly. */
export const validateTwitter = makeHostValidator(
  ['twitter.com', 'x.com'],
  'Twitter / X',
  'x.com/your-handle',
);

/**
 * Portfolio is permissive -- any valid URL is fine since people host on
 * Vercel, Netlify, GitHub Pages, custom domains, etc. We just check it's
 * a real URL and not a host typo like "yousite.dev " (trailing space).
 */
export function validatePortfolio(v: string): ValidationResult {
  if (validateOptional(v)) return OK;
  const u = tryParseUrl(v);
  if (!u) return fail("Doesn't look like a URL — try https://your-site.dev");
  if (u.hostname.length < 4) return fail('Hostname looks too short — double-check');
  return OK;
}
