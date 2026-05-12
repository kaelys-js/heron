/**
 * User-facing brand strings — re-exported from the generated brand.ts so
 * everything ultimately resolves to branding/brand.json.
 *
 * This file is the LEGACY entry point. New code should import directly
 * from `$lib/client/brand`. Keeping these re-exports for back-compat with
 * the dozens of components/pages already importing APP_NAME / docTitle /
 * cmd / etc. — they keep working without rewrites.
 *
 * NOT branded (kept as literal "career-ops"):
 *   - localStorage keys (changing would wipe user state) — these now use
 *     BRAND.name prefix so a rename namespaces them correctly going forward
 *   - custom DOM event names (internal coupling, not user-visible)
 *   - the `/career-ops` slash-command namespace can be overridden via
 *     `CLI_NAMESPACE` from brand.json's `ai.cliNamespace` if set.
 */
import { BRAND } from '$lib/client/brand';

export const APP_NAME = BRAND.displayName;
export const APP_TAGLINE = BRAND.tagline;
export const APP_DESCRIPTION = BRAND.tagline;

/** Slash-command namespace surfaced in help, dialogs, agent chat.
 *  Keeps the literal `career-ops` because that's the CLI mode prefix
 *  used by all AI agents (claude, gemini, codex, ...). Renaming this
 *  would break every slash-command invocation. */
export const CLI_NAMESPACE = 'career-ops';

/** Upstream repo for "Report an issue" / "Star on GitHub". */
export const REPO_URL = BRAND.repo.url;

/** Compose `<page> — <APP_NAME>` for document titles. */
export function docTitle(parts: (string | undefined | null)[]): string {
  const parts2 = parts.filter((p): p is string => !!p && p.trim().length > 0);
  return [...parts2, APP_NAME].join(' — ');
}

/** Format a slash-command invocation, e.g. cmd('oferta') → '/career-ops oferta'. */
export function cmd(verb?: string): string {
  return verb ? '/' + CLI_NAMESPACE + ' ' + verb : '/' + CLI_NAMESPACE;
}
