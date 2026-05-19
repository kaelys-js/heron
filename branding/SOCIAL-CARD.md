# Social card -- Heron

<!-- AUTO-GENERATED:doc-meta -->
*Part of the [Heron](../README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

> Spec for the Heron Open Graph (OG) social
> card. The rendered PNG is what ships at `ui/static/social-card.png`
> after Task 9 wiring. The HTML source lives at
> [`assets/social-card.html`](./assets/social-card.html). Companion
> docs: [`BRAND.md`](./BRAND.md), [`COLORS.md`](./COLORS.md),
> [`TYPOGRAPHY.md`](./TYPOGRAPHY.md), [`BRAND.md#wordmark`](./BRAND.md#wordmark),
> [`MASCOT.md`](./MASCOT.md).

## Purpose

The social card is the visual that appears whenever someone shares a
Heron URL on Twitter / X, LinkedIn, Mastodon, Bluesky, Discord, Slack,
iMessage, or anywhere else that respects OG meta tags. It's the
brand's first impression for everyone who hasn't yet seen the site.

A bad social card sinks otherwise-good content. A *quiet, considered*
social card raises the perceived credibility of whatever it accompanies.

## Specs

| Property | Value |
|---|---|
| Canvas dimensions | **1200×630 pixels** (1.91:1 aspect ratio) |
| Format | PNG (preferred over JPG for sharp edges + brand color fidelity) |
| Color profile | sRGB |
| File size target | < 200 KB after PNG optimization |
| Retina variant | optional 2400×1260 (same source HTML, screenshot at 2× device-pixel-ratio) |
| Output path | `ui/static/social-card.png` (and `social-card@2x.png` if retina) |

## Design

### Composition -- tagline-first hero

```text
+--------------------------------------------------------------+
|  ▬ accent stripe                                             |
|                                                              |
|                                                              |
|   Stand still.                                               |
|   Strike well.                                               |
|                                              [heron          |
|   Heron                                       silhouette]    |
|   A thinking partner for                                     |
|   career transitions.                                        |
|                                                              |
|                                                              |
|   heron.app                                                  |
+--------------------------------------------------------------+
```

- **Tagline as hero** -- the primary tagline (`Stand still. / Strike well.`) is the dominant element, set in Fraunces 700 at 104px display size. It carries the whole brand.
- **Wordmark as subordinate** -- `Heron` set in Fraunces 700 at 56px, colored Heron Dawn `#c89b4a`. The wordmark is the brand identifier; the dawn-gold is the one accent moment on the card.
- **Subline as orientation** -- the one-sentence positioning (`A thinking partner for career transitions. Patient, precise, local-first.`) in Inter 400 at 28px, colored text-secondary `#a8b0bb`.
- **Mascot as quiet presence** -- heron silhouette on the right at ~240px tall, slate color, 92% opacity to recede slightly. Inline SVG to keep the file self-contained.
- **URL strip at footer-left** -- `heron.app` in small caps Inter 500 at 18px, colored text-tertiary `#6b7585`. Quiet brand identifier; not a CTA.
- **Accent stripe at top-left** -- 64px × 4px in Heron Dawn `#c89b4a`. The single chromatic punctuation mark.

### Color usage on the card

| Element | Color | Contrast vs `#0e1014` background |
|---|---|---|
| Tagline | `#e8eaed` (text.primary) | 15.6:1 -- AAA |
| Wordmark | `#c89b4a` (Heron Dawn) | 7.5:1 -- AAA |
| Subline | `#a8b0bb` (text.secondary) | 9.1:1 -- AAA |
| Mascot silhouette | `#4a5b6d` (Heron Slate) at 92% opacity | decorative, no text contrast requirement |
| URL strip | `#6b7585` (text.tertiary) | 4.6:1 -- AA for normal text |
| Accent stripe | `#c89b4a` (Heron Dawn) | decorative |

All text elements pass WCAG AA at the size they're rendered. The
tagline + wordmark pass AAA.

### Typography on the card

- **Tagline**: Fraunces, weight 700, opsz 104, SOFT 0, letter-spacing -0.025em
- **Wordmark**: Fraunces, weight 700, opsz 56, SOFT 0, letter-spacing -0.02em
- **Subline**: Inter, weight 400, size 28px, line-height 1.45
- **URL strip**: Inter, weight 500, size 18px, letter-spacing 0.02em

All per [`TYPOGRAPHY.md`](./TYPOGRAPHY.md). Fonts pull from Google Fonts
CDN in the source HTML -- acceptable because this is a one-time render
producing a self-contained PNG; the PNG is what ships, the HTML is
just the source.

## Render pipeline

The HTML source at `assets/social-card.html` is renderable by any of:

| Tool | Command / workflow |
|---|---|
| **Chrome DevTools** (manual) | Open the HTML, DevTools → Device Mode → Custom 1200×630 → "Capture screenshot" (DPR 1 for exact; DPR 2 for retina) |
| **Puppeteer** (automated) | `puppeteer.launch().newPage().setViewport({width:1200, height:630}).goto(file://...).screenshot({path:'social-card.png'})` |
| **Playwright** (automated) | same approach as Puppeteer |
| **Vercel OG / Satori** | The HTML can be partially adapted to JSX; the layout principles port cleanly |
| **Claude Design** | Paste the HTML, request: "Render this at exactly 1200×630, output as PNG." |

The user / maintainer renders once per brand update, commits the PNG
to `ui/static/social-card.png`, and the meta tags reference that path.

## OG meta-tag wiring (Task 9)

When Task 9 wires this into the SvelteKit app, `ui/src/app.html`'s
`<head>` gets:

```html
<!-- Open Graph (Facebook, LinkedIn, iMessage, Discord, Slack, etc.) -->
<meta property="og:type" content="website">
<meta property="og:title" content="Heron — Stand still. Strike well.">
<meta property="og:description" content="A thinking partner for career transitions. Patient, precise, local-first.">
<meta property="og:image" content="https://heron.app/social-card.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Heron — Stand still. Strike well. A thinking partner for career transitions.">
<meta property="og:url" content="https://heron.app">
<meta property="og:site_name" content="Heron">
<meta property="og:locale" content="en_US">

<!-- Twitter / X large-image card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Heron — Stand still. Strike well.">
<meta name="twitter:description" content="A thinking partner for career transitions. Patient, precise, local-first.">
<meta name="twitter:image" content="https://heron.app/social-card.png">
<meta name="twitter:image:alt" content="Heron — Stand still. Strike well. A thinking partner for career transitions.">
```

Tasks for `apply-brand` to consider during the Task 9 sweep:

1. Replace `https://heron.app/...` with the real production domain once
   it's registered (or with a relative `/social-card.png` if hosting
   isn't ready).
2. Generate the alt-text from `brand.json::displayName` + tagline.
3. Sync title/description/image meta values from `brand.json` so a
   rebrand re-flows automatically.

## Per-page variant strategy

Per-page OG card variants ship as committed static PNGs under
`ui/static/og/{slug}.png`. The single shared card is still served at
`ui/static/social-card.png` (the homepage default); per-page Svelte
routes override via their `<svelte:head>` block:

```svelte
<svelte:head>
  <meta property="og:image" content="/og/autopilot.png" />
  <meta property="og:title" content="Apply on autopilot." />
  <meta property="og:description" content="Score-gated, opt-in, off by default." />
</svelte:head>
```

### Authoring a new variant

1. Add an entry to `branding/og-variants.json` with `slug`, `title`,
   `subtitle`.
2. Run `pnpm og:generate` -- Playwright renders
   `branding/assets/social-card.html` at 1200×630 (DPR 2 = 2400×1260
   retina) with the title + subtitle substituted into the
   `<h1 class="tagline">` and `<p class="subline">` slots.
3. Commit the PNG under `ui/static/og/{slug}.png` + the regenerated
   `ui/src/lib/data/og-map.json`.

The generator skips up-to-date outputs by mtime; force a full rebuild
with `pnpm og:generate:force` after editing the HTML template.

### Why static (not a SvelteKit endpoint)

Vercel OG / Satori at request time work great when the host already
runs Node. Heron ships as a local-first Capacitor app; a per-request
Playwright spawn would be ~2s of latency for a card that never
changes between deploys. Static generation keeps the canonical-render
path identical between dev + prod + Capacitor.

## Forbidden modifications

| Don't | Why |
|---|---|
| Add a CTA button on the card | This is a share image, not a landing page. The URL strip is the only call-to-action. |
| Add screenshots of the app to the card | Reduces visual focus, ages quickly, fails at small thumbnail sizes |
| Animate any element (even if your render tool supports it) | OG meta consumers (Twitter, LinkedIn, Slack) render PNG only -- animation is wasted; also contradicts the calm register |
| Use any color outside the brand token set | Token discipline applies to every brand surface, the social card most of all |
| Add multiple typefaces beyond Fraunces + Inter | One serif + one sans is the system. Stick to it. |
| Place the wordmark larger than the tagline | The tagline is the hero. The wordmark is the source. Hierarchy is non-negotiable. |
| Add decorative rocket / lightbulb / target / chart / fire emojis | Anti-pattern #3 from VOICE.md |
| Add a "Get started" / "Sign up" button | Not a landing page |
| Add timestamps or version numbers | Stale 30 minutes after the card renders |

## Implementation notes (Task 9)

1. **Render the PNG once.** Open `branding/assets/social-card.html` in
   Chrome at 1200×630 (DevTools device mode), capture screenshot at
   DPR 2 for retina-ready output. Save as `ui/static/social-card.png`.
2. **Optimize the PNG.** `pnpm exec pngquant --quality=70-95
   ui/static/social-card.png --output ui/static/social-card.png` to
   land under 200 KB.
3. **Add OG + Twitter meta tags** to `ui/src/app.html`'s `<head>` per
   the markup block above.
4. **Wire the meta values** through `apply-brand` so they regenerate
   from `brand.json` on every rebrand pass.
5. **Update the production domain** in `og:url` + `og:image` + the
   URL strip in the HTML source -- once `heron.app` (or whatever the
   real domain is) is registered.
6. **Replace the placeholder mascot** in the inline SVG when the real
   mascot ships. The viewBox stays the same, so the swap is a
   drop-in replacement.
7. **Re-render** the PNG after any brand update (mascot change, color
   change, tagline change). One screenshot, ~30 seconds of work.

The render-update cadence: anytime the wordmark / mascot / tagline /
color tokens change, re-render. Otherwise the rendered PNG is
durable -- no per-deploy regeneration needed.
