/**
 * cli -- single source of truth for the AI CLI binary the dashboard spawns.
 *
 * Defaults to `claude` for backward compatibility. Override with the
 * `AGENT_CLI` environment variable, e.g.:
 *
 *   AGENT_CLI=gemini   pnpm dev
 *   AGENT_CLI=codex    pnpm dev
 *   AGENT_CLI=opencode pnpm dev
 *
 * Every server-side spawn site that runs a slash-command (evaluate, outreach,
 * cover-letter, post-rejection, form-answers, followup-draft,
 * answer-form) reads from this constant. Each CLI's `-p` syntax differs
 * slightly; adapter shims may be needed for non-default values. See
 * AGENTS.md "Switching the AI CLI" for the support matrix.
 */
export const AGENT_CLI: string = process.env.AGENT_CLI ?? 'claude';
