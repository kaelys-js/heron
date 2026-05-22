/** Legacy import surface for brand strings. Re-exports from
 *  `$lib/client/brand` (which is generated from branding/brand.json).
 *  New code should import from `$lib/client/brand` directly. */
import { BRAND } from '$lib/client/brand';

export const APP_NAME = BRAND.displayName;
export const APP_TAGLINE = BRAND.tagline;
export const APP_DESCRIPTION = BRAND.tagline;

/** Slash-command namespace surfaced in help, dialogs, agent chat.
 *  Keeps the literal `heron` because that's the CLI mode prefix
 *  used by all AI agents (claude, gemini, codex, ...). Renaming this
 *  would break every slash-command invocation. */
export const CLI_NAMESPACE = 'heron';

/** Upstream repo for "Report an issue" / "Star on GitHub". */
export const REPO_URL = BRAND.repo.url;

/** Community Discord invite URL. Sourced from brand.json::community.discord.url
 *  via the generated brand.ts -- never hardcode the URL in runtime code. */
export { DISCORD_URL } from '$lib/client/brand';

/** Compose `<page> -- <APP_NAME>` for document titles. */
export function docTitle(parts: (string | undefined | null)[]): string {
  const parts2 = parts.filter((p): p is string => !!p && p.trim().length > 0);
  return [...parts2, APP_NAME].join(' — ');
}

/** Format a slash-command invocation, e.g. cmd('evaluate') → '/heron evaluate'. */
export function cmd(verb?: string): string {
  return verb ? '/' + CLI_NAMESPACE + ' ' + verb : '/' + CLI_NAMESPACE;
}
