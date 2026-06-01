/**
 * Allowlist for the channels the renderer may LISTEN on via the preload's
 * `electronAPI.on()`. Suffix-matched so it's brand-agnostic (channels are baked
 * as `<brand>:...` at build time by apply-brand). Listen-only -- these are
 * main→renderer events, never invoke:
 *
 *  - `:main-error` / `:net-status`      -- error + connectivity events
 *  - `:menu:navigate` / `:menu:passkey` -- File-menu auth actions. The native
 *    File menu (index.ts) sends these; without them here the renderer bridge in
 *    `$lib/client/auth-menu.ts` gets a no-op listener and the menu items do
 *    nothing.
 *
 * Kept in a standalone module (no `electron` import) so it's unit-testable.
 */
export const ALLOWED_CHANNEL_SUFFIXES = [
  ':main-error',
  ':net-status',
  ':menu:navigate',
  ':menu:passkey',
] as const;

export function isAllowedChannel(channel: string): boolean {
  return ALLOWED_CHANNEL_SUFFIXES.some((suffix) => channel.endsWith(suffix));
}
