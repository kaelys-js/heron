/** AI CLI binary the dashboard spawns. Defaults to `claude`; override
 *  via `AGENT_CLI=<binary>` env var (gemini / codex / opencode / etc.).
 *  Per-CLI flag differences may require adapter shims -- see
 *  AGENTS.md "Switching the AI CLI" for the support matrix. */
export const AGENT_CLI: string = process.env.AGENT_CLI ?? 'claude';
