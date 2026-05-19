# Typography -- Heron

<!-- AUTO-GENERATED:doc-meta -->
*Part of the [Heron](../README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

> The typographic system for Heron. Strategy + voice live in
> [`BRAND.md`](./BRAND.md); colors in
> [`COLORS.md`](./COLORS.md). Implementation deferred to Task 9 of the
> rebrand sequence -- this document specifies the *what*; the *how* lands
> in `ui/src/app.css` + `ui/static/fonts/` when we wire it.

## Concept

Calm + sophisticated = editorial gravitas at the headline level,
screen-grade legibility at the body level, with optional monospace
accent for data (comp numbers, dates, scores). The risk to avoid:
"modern startup tech" -- every product uses Inter for everything. Heron
earns its register by *pairing*, not by font choice in isolation.

Constraint set:

- **All faces free + open-source.** Heron is open-source; paid fonts
  add friction for self-hosters and forks.
- **Self-hosted.** Privacy (no Google Fonts CDN tracking), offline
  support (Capacitor iOS runs offline; CDN fonts fail), speed,
  matches the local-first philosophy.
- **Multi-language.** Latin coverage for EN/ES/DE/FR/PT/RU + matched
  CJK fallback for JA.
- **Variable-axis where possible.** One file per family, all weights
  derived -- smaller bundle, more nuance.

## Primary pairing

| Role | Family | Why |
|---|---|---|
| Display / headlines | **Fraunces** (Google Fonts, variable serif) | Editorial serif with `wght` + `SOFT` + `opsz` axes -- calm by default, dial-able to sharp for impact. Reads as considered, not stuffy. Designed by Phaedra Charles + Diego Mariscal. Excellent Latin coverage. |
| UI / body | **Inter** (Google Fonts, variable sans) | Default screen-product face; mature, very legible at small sizes; the unofficial standard for serious tools. Distinctiveness comes from the *pairing*, not from Inter alone. |
| Data / numerics | **IBM Plex Mono** (Google Fonts, free) | Salary ranges, scores, dates, percentages. Less code-coded than JetBrains Mono. Optional -- use sparingly. |

Three faces total. All free. All variable (Fraunces + Inter) or
static-with-multiple-weights (Plex Mono). Total ~260 KB self-hosted.

## Type scale -- 1.250 modular, 16px base

| Token | Size | Line-height | Letter-spacing | Family | Weight |
|---|---|---|---|---|---|
| `display` | 64px (4rem) | 1.1 | -0.02em | Fraunces | 700 Bold |
| `h1` | 48px (3rem) | 1.1 | -0.015em | Fraunces | 700 Bold |
| `h2` | 36px (2.25rem) | 1.2 | -0.01em | Fraunces | 600 SemiBold |
| `h3` | 28px (1.75rem) | 1.2 | 0 | Fraunces | 600 SemiBold |
| `h4` | 22px (1.375rem) | 1.3 | 0 | Fraunces | 500 Medium |
| `h5` | 18px (1.125rem) | 1.3 | 0 | Inter | 600 SemiBold |
| `body` | 16px (1rem) | 1.6 | 0 | Inter | 400 Regular |
| `body-sm` | 14px (0.875rem) | 1.5 | 0 | Inter | 400 Regular |
| `caption` | 12px (0.75rem) | 1.4 | 0.01em | Inter | 500 Medium |
| `mono` | 14px (0.875rem) | 1.4 | 0 | IBM Plex Mono | 500 Medium |

H1-H4 use Fraunces (serif gravitas at the structural level). H5
switches to Inter at semibold -- small sizes look cleaner sans. Body and
below are Inter throughout.

## Fraunces axis usage

Fraunces has three variable axes. These are the brand-default values:

| Axis | Default value | Effect |
|---|---|---|
| `wght` (weight) | 400 / 500 / 600 / 700 per token | Standard weight scale. |
| `SOFT` (softness) | `0` (sharp) | Sharp terminals -- reads editorial / refined. Dial to `50` *only* for warm marketing moments (landing-page hero) where you want a touch of humanity. |
| `opsz` (optical size) | auto | Larger sizes get more contrast; smaller sizes get more uniform stroke weight. CSS: `font-optical-sizing: auto;`. |

## Weight + style discipline

- **Italics only on Fraunces.** Inter italics read off; if you need
  emphasis in body, use `font-weight: 600` rather than italic.
- **Never use weight 900 on Fraunces.** The extreme weight reads
  circus-poster and breaks the calm register.
- **Never use weight ≤ 300 on Inter.** Thin sans at small sizes is
  unreadable; thin sans at large sizes reads as "wellness app."
- **All-caps is reserved.** Only labels at `caption` size, with
  `letter-spacing: 0.05em`. Never on body. Never on Fraunces.
- **Underlines reserved for links.** Don't underline for emphasis.

## Fallback stacks

```css
:root {
  --font-display: "Fraunces", "Iowan Old Style", "Apple Garamond",
                  "Baskerville", "Times New Roman", Times, Georgia, serif;

  --font-body: "Inter", -apple-system, BlinkMacSystemFont, "Helvetica Neue",
               Helvetica, Arial, "Segoe UI", Roboto, system-ui, sans-serif;

  --font-mono: "IBM Plex Mono", ui-monospace, "SF Mono", "Cascadia Mono",
               "Fira Code", Menlo, Monaco, Consolas, monospace;
}

/* Japanese — serif headline pairs with Noto Serif JP; sans body with Noto Sans JP. */
:root:lang(ja) {
  --font-display: "Fraunces", "Noto Serif JP", "Hiragino Mincho ProN",
                  "Yu Mincho", serif;
  --font-body: "Inter", "Noto Sans JP", "Hiragino Sans", "Yu Gothic",
               sans-serif;
}
```

The Latin face always comes first -- for mixed content (an English UI
string with a single Japanese word) the browser falls through to the
JA face only for the characters Fraunces/Inter can't render. Clean
visual mix.

## Font assignments

<!-- AUTO-GENERATED:font-table -->
| Role | Family | Fallback | Weights | Axes |
|---|---|---|---|---|
| display | `Fraunces` | `'Iowan Old Style', 'Apple Garamond', Baskerville, 'Times …` | 400 700 | opsz, wght, SOFT |
| body | `Inter` | `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI',…` | 400 700 | wght |
| mono | `IBM Plex Mono` | `ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, C…` | 400, 500 | -- |
<!-- /AUTO-GENERATED:font-table -->

## CV template -- separate decision

The CV template's typography is a *user-deliverable* concern, not a
brand-self-presentation concern. ATS parsers can be quirky with serif
fonts in headings.

**Decision: keep the CV template on Inter for every role.** Pure sans
maximizes ATS parseability. The brand identity applies to *Heron*
(the product) -- not to the user's CV (the artifact they hand to a
recruiter). The Fraunces serif lives in the web/native UI; the CV
template ships clean Inter end-to-end.

Implementation: the CV template uses Inter only --
woff2 files live at templates/fonts/inter-{latin,latin-ext}.woff2,
and update `templates/cv-template.html` font-family declarations.

## Implementation notes (all wired)

1. **Self-hosted woff2 files** -- present under `ui/static/fonts/`:
   `fraunces-{latin,latin-ext}.woff2`, `inter-{latin,latin-ext}.woff2`,
   `ibm-plex-mono-{400,500}-{latin,latin-ext}.woff2`. The CV ships
   Inter-only under `templates/fonts/inter-{latin,latin-ext}.woff2`.
2. **`@font-face` declarations** are emitted into the AUTO-GENERATED
   block of `ui/src/app.css` by `scripts/native/apply-brand.mjs`
   (function `appCssFontFaces`). One source: `brand.json::fonts`.
3. **CV template** (`templates/cv-template.html`) uses Inter
   throughout -- ATS-safe, matches `brand.json::fonts.body`.
4. **Components** read the cascade defaults set in `app.css`
   (`body { font-family: var(--font-body); }`); no hardcoded
   `font-family` declarations outside the AUTO-GENERATED block.
5. **Pre-commit + CI verifier** --
   `scripts/system/verify-fonts.mjs` recomputes SHA256 of every
   `ui/static/fonts/*.woff2` and compares against
   `ui/static/fonts/CHECKSUMS.json`. Runs via lefthook's
   `verify-fonts` hook on every commit that touches a woff2.
   Regenerate the lockfile after a deliberate font swap with
   `pnpm fonts:lock`.
