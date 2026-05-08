/**
 * Single source of truth for the app's user-facing brand strings.
 *
 * Change `APP_NAME` here and the breadcrumb, sidebar workspace label, doc title
 * suffix, error pages, OG metadata, and inline copy update everywhere.
 *
 * NOT branded (kept as literal "career-ops"):
 *  - localStorage keys (changing would wipe user state)
 *  - custom DOM event names (internal coupling, not user-visible)
 *  - GitHub repo path (the upstream open-source project name)
 *  - the `/career-ops` slash-command namespace can be overridden via `CLI_NAMESPACE`
 *    if a fork wants its own command prefix.
 */

export const APP_NAME = 'career-ops';
export const APP_TAGLINE = 'job-search ops';
export const APP_DESCRIPTION =
  'Local-first job search dashboard — pipeline, scoring, tailored CVs, and an AI agent for interviews and negotiation.';

/** Slash-command namespace surfaced in help, dialogs, agent chat. */
export const CLI_NAMESPACE = 'career-ops';

/** Upstream repo for "Report an issue" / "Star on GitHub". */
export const REPO_URL = 'https://github.com/santifer/career-ops';

/** Compose `<page> — <APP_NAME>` for document titles. */
export function docTitle(parts: (string | undefined | null)[]): string {
  const parts2 = parts.filter((p): p is string => !!p && p.trim().length > 0);
  return [...parts2, APP_NAME].join(' — ');
}

/** Format a slash-command invocation, e.g. cmd('oferta') → '/career-ops oferta'. */
export function cmd(verb?: string): string {
  return verb ? '/' + CLI_NAMESPACE + ' ' + verb : '/' + CLI_NAMESPACE;
}
