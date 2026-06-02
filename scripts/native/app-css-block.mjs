/**
 * app-css-block -- pure string transform that writes the single
 * AUTO-GENERATED:brand-tokens block into ui/src/app.css.
 *
 * Extracted from apply-brand.mjs so it is unit-testable (the script itself
 * runs apply() at import time). The OLD logic matched only the `--`-dashed
 * marker, so a stale em-dash-marked block (a hand-edited copy) survived
 * regeneration, sat LATER in the cascade, and silently overrode brand.json.
 * This replacer strips EVERY marked region (any dash variant, any count)
 * before inserting one fresh block, so the duplication can never recur.
 */

export const BRAND_TOKEN_MARKER_START =
  '/* AUTO-GENERATED:brand-tokens -- Do not edit. Edit branding/brand.json + run `pnpm brand:apply`. */';
export const BRAND_TOKEN_MARKER_END = '/* /AUTO-GENERATED:brand-tokens */';

export const DEFAULT_ANCHOR = '@custom-variant dark (&:is(.dark *));';

// Matches a full block from ANY brand-tokens start comment (regardless of
// whether its header uses an ASCII `--` or a unicode em-dash) through the next
// end marker. Non-greedy + global so multiple blocks are each removed.
const BLOCK_RE = /\/\* AUTO-GENERATED:brand-tokens[\s\S]*?\/\* \/AUTO-GENERATED:brand-tokens \*\//g;

/**
 * Return `css` with every existing brand-token block removed and exactly one
 * fresh block (markerStart + `block` + markerEnd) inserted right after the
 * anchor line. Returns null if the anchor is absent (caller should warn + skip).
 *
 * @param {string} css   current app.css contents
 * @param {string} block the inner block body (font-faces + @theme + :root + .dark)
 * @param {string} [anchor]
 * @returns {string|null}
 */
export function replaceBrandTokenBlocks(css, block, anchor = DEFAULT_ANCHOR) {
  // 1. Strip EVERY marked region, then collapse the blank lines left behind.
  const stripped = css.replace(BLOCK_RE, '').replace(/\n{3,}/g, '\n\n');
  // 2. Insert one fresh block immediately after the anchor line.
  const idx = stripped.indexOf(anchor);
  if (idx < 0) return null;
  const lineEnd = stripped.indexOf('\n', idx) + 1;
  const fresh = `${BRAND_TOKEN_MARKER_START}\n${block}\n${BRAND_TOKEN_MARKER_END}`;
  return `${stripped.slice(0, lineEnd)}\n${fresh}\n${stripped.slice(lineEnd)}`;
}
