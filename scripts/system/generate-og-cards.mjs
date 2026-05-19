#!/usr/bin/env node
/**
 * generate-og-cards.mjs -- render per-page Open Graph cards.
 *
 * Closes SOCIAL-CARD.md "Per-page variant strategy" by:
 *
 *   1. Reading the variant list from branding/og-variants.json
 *   2. For each variant, loading branding/assets/social-card.html
 *      and substituting `{{TITLE}}` + `{{SUBTITLE}}` placeholders with
 *      the variant's text
 *   3. Headless-Chromium screenshotting at 1200×630 (DPR 2 → 2400×1260
 *      retina-ready) and saving to ui/static/og/{slug}.png
 *
 * Why static generation (not a SvelteKit endpoint):
 *
 *   • Playwright at request time is too heavy (~2s cold start)
 *   • The variant set is small + stable; regenerating on every brand
 *     change is fine
 *   • Production serves the PNGs as static files -- zero runtime cost
 *
 * Workflow:
 *
 *   pnpm og:generate          # render all variants to ui/static/og/
 *   git add ui/static/og/     # commit so production has them
 *
 * The script will SKIP a variant whose output PNG is newer than its
 * source (HTML + brand.json + this script + variants.json) so re-runs
 * are cheap. Force a full rebuild with --force.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HTML_SOURCE = join(ROOT, 'branding', 'assets', 'social-card.html');
const VARIANTS_FILE = join(ROOT, 'branding', 'og-variants.json');
const BRAND_JSON = join(ROOT, 'branding', 'brand.json');
const OUTPUT_DIR = join(ROOT, 'ui', 'static', 'og');

const FORCE = process.argv.includes('--force');

if (!existsSync(HTML_SOURCE)) {
  console.error('::error::social-card.html missing at', HTML_SOURCE);
  process.exit(2);
}
if (!existsSync(VARIANTS_FILE)) {
  console.error('::error::og-variants.json missing at', VARIANTS_FILE);
  process.exit(2);
}

const variants = JSON.parse(readFileSync(VARIANTS_FILE, 'utf8')).variants || [];
if (!Array.isArray(variants) || variants.length === 0) {
  console.error('::error::og-variants.json has no variants');
  process.exit(2);
}

mkdirSync(OUTPUT_DIR, { recursive: true });

/** Latest mtime across inputs. Used to skip up-to-date outputs. */
function inputsMtime() {
  return Math.max(
    statSync(HTML_SOURCE).mtimeMs,
    statSync(VARIANTS_FILE).mtimeMs,
    statSync(BRAND_JSON).mtimeMs,
    statSync(fileURLToPath(import.meta.url)).mtimeMs,
  );
}

const inputsTs = inputsMtime();
const htmlTemplate = readFileSync(HTML_SOURCE, 'utf8');

/** Inject TITLE / SUBTITLE into the template. The template uses the
 *  default values as the visible content; we replace the .tagline and
 *  .subline text nodes with the variant text via regex on the source
 *  before rendering. This keeps the template authoring-friendly (open
 *  in a browser, see the default card) while letting variants override
 *  at render time. */
function substituteTemplate(html, title, subtitle) {
  // Replace the contents of the first <h1 class="tagline"> and
  // <p class="subline"> elements. Inner content may contain <br>,
  // &nbsp;, and other inline markup -- capture lazily up to the
  // closing tag. The template is hand-curated so these selectors are
  // stable; if they change, the generator explodes loudly (better
  // than silently rendering defaults).
  let out = html;
  const taglineMatch = /<h1 class="tagline">[\s\S]*?<\/h1>/.exec(out);
  const sublineMatch = /<p class="subline">[\s\S]*?<\/p>/.exec(out);
  if (!taglineMatch) throw new Error('social-card.html: <h1 class="tagline"> not found');
  if (!sublineMatch) throw new Error('social-card.html: <p class="subline"> not found');
  // Variant titles often contain `.` mid-phrase; we wrap the first
  // sentence-end in a soft <br> so the rendered card uses the same
  // two-line shape the default ("Stand still. Strike well.") has.
  const titleHtml = title.includes('. ') ? title.replace(/\.\s+/, '.<br>') : title;
  out = out.replace(taglineMatch[0], `<h1 class="tagline">${titleHtml}</h1>`);
  out = out.replace(sublineMatch[0], `<p class="subline">${subtitle}</p>`);
  return out;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 2,
});

let rendered = 0;
let skipped = 0;
for (const v of variants) {
  const slug = v.slug;
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    console.error(`::warn::skipping invalid slug: ${slug}`);
    continue;
  }
  const outPath = join(OUTPUT_DIR, `${slug}.png`);
  if (!FORCE && existsSync(outPath) && statSync(outPath).mtimeMs >= inputsTs) {
    skipped += 1;
    continue;
  }
  const html = substituteTemplate(htmlTemplate, v.title, v.subtitle);
  const page = await ctx.newPage();
  // Serve the substituted HTML via setContent so Playwright doesn't
  // need a real http server. The template's `link rel="preconnect"`
  // to Google Fonts works fine from the headless context.
  await page.setContent(html, { waitUntil: 'networkidle' });
  // Small additional settle for the variable-font load to settle into
  // its hinted state before screenshot. Without this, the first PNG
  // sometimes catches the fallback face mid-swap.
  await page.waitForTimeout(300);
  await page.screenshot({
    path: outPath,
    type: 'png',
    fullPage: false,
    clip: { x: 0, y: 0, width: 1200, height: 630 },
  });
  await page.close();
  rendered += 1;
  console.log(`  ✓ ${slug}.png`);
}

await ctx.close();
await browser.close();

console.log(`\n✓ OG cards: ${rendered} rendered, ${skipped} up-to-date (${variants.length} total)`);
if (rendered > 0) {
  console.log(`  Output dir: ${OUTPUT_DIR}`);
  console.log(`  Commit the regenerated PNGs so production serves them.`);
}

// Update OG meta tag mapping for the dashboard. We write a small JSON
// the dashboard can import to map current route → og image. The Svelte
// layout reads this via $env-style import.
const META_OUT = join(ROOT, 'ui', 'src', 'lib', 'data', 'og-map.json');
const META_BODY = {
  $comment:
    'AUTO-GENERATED by scripts/system/generate-og-cards.mjs from branding/og-variants.json. Do not edit by hand.',
  variants: variants.map((v) => ({ slug: v.slug, title: v.title, subtitle: v.subtitle })),
};
mkdirSync(dirname(META_OUT), { recursive: true });
writeFileSync(META_OUT, JSON.stringify(META_BODY, null, 2) + '\n');
console.log(`  Wrote map: ${META_OUT}`);
