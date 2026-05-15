# Wordmark — Heron

> Last revised 2026-05-15. Specification for the Heron typographic
> wordmark. Mascot/symbol is a separate file ([`MASCOT.md`](./MASCOT.md))
> committed in Task 5. Color tokens used here are defined in
> [`COLORS.md`](./COLORS.md); the typeface comes from
> [`TYPOGRAPHY.md`](./TYPOGRAPHY.md).

## Design decision

The wordmark is just "Heron." No accent dot. No underline. No inline
icon. The mascot ships separately so each component is composable —
wordmark alone (most contexts), mascot alone (favicon, watch face), or
locked-up together (marketing, press kit).

Restraint reads as confidence. The brand earns distinction through
*consistency* — always the same face, the same weight, the same
tracking, the same color from the token set — not through logo
trickery.

## Typographic specification

| Property | Value |
|---|---|
| Family | Fraunces (variable serif) |
| Weight (`wght`) | 700 Bold |
| Optical size (`opsz`) | 96 (display) |
| Soft axis (`SOFT`) | 0 (sharp — full editorial gravitas) |
| Letter-spacing | -0.02em (tightened for display sizes) |
| Capitalization | Sentence case — **Heron** |
| Default color | Heron Slate `#4a5b6d` on light; warm white `#e8eaed` on dark |
| Minimum render size | 24px height (web), 12pt (print) |
| Maximum render size | unbounded (vector) |
| Padding / clearspace | 1× the cap-height of the H on every side |

## Color variants

Four files ship in `assets/`. Pick the variant that matches the rendering
context — never re-color in the consumer.

| File | Color | Use |
|---|---|---|
| `assets/wordmark.svg` | `currentColor` (inherits) | Universal, for HTML embeds where the container sets text color |
| `assets/wordmark-slate.svg` | Heron Slate `#4a5b6d` | Default for light surfaces (most everyday use) |
| `assets/wordmark-light.svg` | warm white `#e8eaed` | For dark surfaces |
| `assets/wordmark-dawn.svg` | Heron Dawn `#c89b4a` | Special-occasion only — landing-hero "gold-strike" moment, year-in-review, press-kit cover. Not for everyday UI. |

## Forbidden modifications

| Don't | Why |
|---|---|
| Stretch horizontally or vertically | Distorts the letterforms; reads as careless |
| Add a drop shadow | Calm + sophisticated has no skeuomorphic shadows |
| Re-color outside the token set | Any color not in the brand palette breaks the system |
| Use on a background that fails WCAG contrast | See `COLORS.md` for the cleared combinations |
| Set below 24px tall | Below 24px the Fraunces serifs collapse; use the mascot alone instead |
| Outline / stroke the letters | The letterforms are filled, never outlined |
| Place tagline directly under without clearspace | Always 1× cap-height between wordmark and any other element |

## Honest limitation — placeholder SVG

The four SVG files in `assets/` are **functional placeholders**. They
render correctly anywhere Fraunces is loaded:

- The web UI (Task 9 wires `@font-face` for Fraunces self-hosted)
- The dashboard
- Capacitor wrappers (iOS / Android / Electron) once the fonts are bundled
- Any browser that loads the font stack from `ui/src/app.css`

They do **not** render correctly in contexts where Fraunces isn't
loaded — most notably:

- Press kit PDFs (PDF viewer doesn't pull web fonts)
- Social cards rasterized server-side (depending on rasterizer config)
- External embeds in third-party sites that don't load our stylesheet
- Email signatures, slide decks, anywhere the SVG is opened standalone

For those contexts, the wordmark needs the letterforms **outlined to
vector `<path>` elements** so it's font-independent. That's a one-time
production-prep step. Tools that can do it:

1. **Claude Design** with the prompt: "Outline this Fraunces 'Heron'
   wordmark to vector `<path>` elements, preserving the bold weight
   (wght=700), sharp soft axis (SOFT=0), and display optical size
   (opsz=96). Output as a single-path SVG with the same viewBox
   (0 0 280 120)."
2. **Figma**: paste the wordmark text → set Fraunces 700 Bold 96px →
   right-click → "Outline Stroke" → export SVG.
3. **Glyphs / FontForge**: open the variable Fraunces, set "Heron" at
   the spec axes, export glyphs to paths.
4. **Vector editors** (Illustrator, Affinity Designer, Inkscape): same
   workflow — type, convert to paths, export SVG.

Once outlined, replace the placeholder `<text>` element in each variant
with the resulting `<path>` and remove the placeholder comment.

## Lockup with the mascot (preview — Task 5 ships the spec)

The mascot — to be designed in Task 5 — locks up with the wordmark in
two configurations:

```text
[mascot]  Heron       <- horizontal lockup, mascot leads
                         (header navs, README banner)

  [mascot]             <- stacked lockup, mascot above
   Heron                 (hero panels, App Store icon background,
                         marketing pages)
```

Clearspace between mascot and wordmark = 0.5× cap-height (slightly
tighter than the wordmark's own clearspace rule).

Task 5 will define the mascot file paths, then this section gets the
final lockup SVGs.

## Implementation notes (Task 9)

1. Copy `assets/wordmark-slate.svg` and `assets/wordmark-light.svg` into
   `ui/static/assets/` so the SvelteKit app can serve them.
2. Replace existing brand references in `Topbar`, `AppSidebar`, README
   banner with `<img src="/assets/wordmark-{slate|light}.svg" alt="Heron" />`.
3. Update `ui/src/app.html` favicon link to use a separate
   mascot-only-favicon (defined Task 5) — the wordmark is too wide for
   16×16.
4. Once the path-outlined production wordmark exists, replace each
   placeholder file in-place. The viewBox stays the same so consumers
   don't have to change.
