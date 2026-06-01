/** redact -- the single PII/secret masking pass applied inside logEvent() before
 *  an event is persisted (activity.jsonl / SQLite / live feed / optional remote
 *  sink). Heron ingests recruiter-email subjects, per-user API keys, and stack
 *  traces with absolute home-dir paths; without this gate they land verbatim in
 *  an on-disk log.
 *
 *  Design constraint -- SURGICAL, not greedy. The patterns are all SPECIFIC
 *  (provider key prefixes, named URL params, `Bearer`, `user@host`, home-dir
 *  prefixes). There is deliberately NO "mask any long alphanumeric token" rule,
 *  because that would destroy the correlation ids this whole infra exists to
 *  keep grep-able: X-Request-Id UUIDs, 12-char event ids, and 40-char commit
 *  SHAs all pass through untouched.
 *
 *  Escape hatch: HERON_LOG_REDACT=off returns the input unchanged (dev only).
 *  A no-op (`HERON_LOG_REDACT` unset) means redaction is ON by default. */

type Rule = { re: RegExp; to: string };

// Order matters: more-specific provider keys (sk-ant) run before the generic
// sk- rule, and named URL-param masking runs after so a `key=<provider-key>`
// still ends up redacted either way.
const RULES: Rule[] = [
  // Emails (job-search domain leaks recruiter + user addresses constantly).
  { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, to: '[email]' },
  // Authorization: Bearer <jwt|token>
  { re: /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, to: 'Bearer [redacted]' },
  // Provider API keys -- specific prefixes only.
  { re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, to: '[aws-key]' }, // AWS access key id
  { re: /\bsk-ant-[A-Za-z0-9_-]{10,}/g, to: '[anthropic-key]' }, // Anthropic (before sk-)
  { re: /\bsk-[A-Za-z0-9]{20,}/g, to: '[api-key]' }, // OpenAI + sk- family
  { re: /\bghp_[A-Za-z0-9]{20,}\b/g, to: '[github-token]' }, // GitHub PAT (classic)
  { re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, to: '[github-token]' }, // GitHub PAT (fine-grained)
  { re: /\bAIza[0-9A-Za-z_-]{20,}\b/g, to: '[google-key]' }, // Google API key
  // Sensitive URL query params -- mask the VALUE, keep the param name. Requires a
  // ?/& prefix so a bare `key=` log line isn't over-masked (provider rules handle
  // those). Value runs to the next & or whitespace.
  {
    re: /([?&](?:token|key|secret|password|api[_-]?key|authorization|access_token)=)[^&\s]+/gi,
    to: '$1[redacted]',
  },
  // Home-dir absolute paths -> ~ : drops the username (PII) + shortens stacks.
  { re: /\/Users\/[^/\s]+/g, to: '~' }, // macOS
  { re: /\/home\/[^/\s]+/g, to: '~' }, // Linux
  { re: /[A-Za-z]:\\Users\\[^\\/\s]+/g, to: '~' }, // Windows
];

/** Mask secrets + PII in a log string. Returns the input verbatim when
 *  HERON_LOG_REDACT=off or when given a non-string. */
export function redact(input: string): string {
  if (typeof input !== 'string' || input.length === 0) {
    return input;
  }
  if (process.env.HERON_LOG_REDACT === 'off') {
    return input;
  }
  let out = input;
  for (const { re, to } of RULES) {
    out = out.replace(re, to);
  }
  return out;
}
