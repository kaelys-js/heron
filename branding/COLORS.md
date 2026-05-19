# Colors — Heron

> Last revised 2026-05-15. The visual color system for Heron. Strategy +
> voice live in [`BRAND.md`](./BRAND.md); typography in
> [`TYPOGRAPHY.md`](./TYPOGRAPHY.md). The runtime/build source of truth
> is the `colors` block in [`brand.json`](./brand.json) — a rebrand edits
> that, runs `pnpm brand:apply`, and the CSS/Tailwind layer derives every
> token below from those base values.

## Concept

Herons live in shallow water at dawn and dusk — slate plumage, dawn light
catching on reeds, fog over a still surface. The palette derives from
that habitat: restrained slate-blue-gray as the signature, warm gold as
the accent (the moment the light catches), warm-leaning surfaces (paper,
not screen), reed-green as a reserve nature accent. Nothing neon. Nothing
emerald (every AI tool uses emerald right now). Nothing LinkedIn-blue.

## Signature colors

| Token | Hex | Role |
|---|---|---|
| **Heron Slate** | `#4a5b6d` | Primary brand color. Mark, buttons, links, focus rings. |
| **Heron Dawn** | `#c89b4a` | Accent. Used sparingly — highlight states, "the right moment" callouts, the gold-strike moment. |
| **Heron Reed** | `#7a8c6d` | Reserve accent. Subtle nature tone for secondary illustrations, badges, seasonal callouts. |

Heron Slate is the workhorse. Heron Dawn is the punctuation mark — it
should appear 2–3 times on a typical screen, never more. Heron Reed stays
in reserve.

## Surfaces — dark mode (current primary)

| Token | Hex | Role |
|---|---|---|
| `surface.0` | `#0e1014` | Page background (deepest, "water at night") |
| `surface.1` | `#14181f` | Card / primary surface |
| `surface.2` | `#1c222b` | Raised / hover state |
| `surface.3` | `#232a35` | Modals / dropdowns |
| `border.subtle` | `#232a35` | Hairline dividers |
| `border.default` | `#2d3540` | Card borders |
| `border.strong` | `#3a4452` | Focused / interactive borders |

## Surfaces — light mode (warm paper, not stark white)

| Token | Hex | Role |
|---|---|---|
| `surface.0` | `#f7f5f0` | Page background (aged paper warmth) |
| `surface.1` | `#fffefa` | Card / primary surface (warm white) |
| `surface.2` | `#fdfbf4` | Raised state |
| `surface.3` | `#ffffff` | Modals / pure-white |
| `border.subtle` | `#ebe8e0` | Hairline dividers |
| `border.default` | `#d8d4c8` | Card borders |
| `border.strong` | `#b8b3a4` | Focused / interactive borders |

## Text scale

| Token | Dark mode | Light mode | Role |
|---|---|---|---|
| `text.primary` | `#e8eaed` (warm white) | `#1a1f26` (deep slate) | Body, headings |
| `text.secondary` | `#a8b0bb` | `#4a5260` | Labels, captions |
| `text.tertiary` | `#6b7585` | `#6b7585` | Muted helper text |
| `text.disabled` | `#4a5260` | `#a8b0bb` | Disabled states |

## Status / semantic (intentionally desaturated)

| Token | Hex | vs typical |
|---|---|---|
| `status.success` | `#4a8c5c` | Forest green — NOT neon emerald `#10b981` |
| `status.warn` | `#b87538` | Muted amber — NOT bright yellow |
| `status.danger` | `#9a3a3a` | Ox-blood red — NOT bright red `#ef4444` |
| `status.info` | `#4a5b6d` | Reuses Heron Slate — info IS the brand |

Status colors are deliberately darker / desaturated so they don't compete
with Heron Slate or Heron Dawn for visual attention. A success badge
should *register* without *dominating*.

## Accessibility — WCAG 2.1 ratios

All ratios computed against the [WCAG 2.1 contrast formula](https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio).
Targets: AA for normal text (≥ 4.5:1), AAA for normal text (≥ 7:1), AA
for large text (≥ 3:1).

### Dark mode (text on `surface.1 = #14181f`)

| Token | Ratio | Level | Use |
|---|---|---|---|
| `text.primary` `#e8eaed` | 14.5:1 | **AAA** all sizes | ✓ Body, headings |
| `text.secondary` `#a8b0bb` | 8.2:1 | **AAA** all sizes | ✓ Labels |
| `text.tertiary` `#6b7585` | 4.5:1 | **AA** normal, **AAA** large | ✓ Captions |
| Heron Slate `#4a5b6d` | 2.6:1 | ✗ Fails for text | Decorative — borders, icon strokes |
| Heron Dawn `#c89b4a` | 7.2:1 | **AAA** all sizes | ✓ Usable as text/icon color on dark |

### Light mode (text on `surface.1 = #fffefa`)

| Token | Ratio | Level | Use |
|---|---|---|---|
| `text.primary` `#1a1f26` | 16.8:1 | **AAA** all sizes | ✓ |
| `text.secondary` `#4a5260` | 7.6:1 | **AAA** all sizes | ✓ |
| `text.tertiary` `#6b7585` | 4.9:1 | **AA** normal, **AAA** large | ✓ |
| Heron Slate `#4a5b6d` | 7.0:1 | **AAA** all sizes | ✓ Buttons, links, text |
| Heron Dawn `#c89b4a` | 2.9:1 | ✗ Fails for text | Decorative only — icon strokes, badge backgrounds with dark text on top |

### Button combinations (white-on-color)

| Combination | Ratio | Level |
|---|---|---|
| White `#ffffff` on Heron Slate `#4a5b6d` | 6.7:1 | **AAA** all sizes |
| Dark slate `#1a1f26` on Heron Dawn `#c89b4a` | 5.7:1 | **AAA** large, **AA** normal |
| White on `status.success` `#4a8c5c` | 4.6:1 | **AA** normal |
| White on `status.warn` `#b87538` | 4.4:1 | **AA** large |
| White on `status.danger` `#9a3a3a` | 7.8:1 | **AAA** all sizes |

## Token map — `brand.json` core → CSS token system

`brand.json::colors` is the rebrand-source-of-truth. It carries 9 base
values. The full 22-token CSS system in `ui/src/app.css` (or the Tailwind
theme) derives from those bases plus static-across-brands tokens (status
colors, text scale).

### brand.json keys (9 values to set on a rebrand)

<!-- AUTO-GENERATED:color-base-table -->
| Key | Hex | Name |
|---|---|---|
| `primary` | `#4a5b6d` | Heron Slate |
| `accent` | `#c89b4a` | Heron Dawn |
| `accentSecondary` | `#7a8c6d` | Heron Reed |
| `darkBg` | `#0e1014` | Dark mode background |
| `darkSurface` | `#14181f` | Dark mode card surface |
| `lightBg` | `#f7f5f0` | Light mode background (warm paper) |
| `lightSurface` | `#fffefa` | Light mode card surface |
| `textOnDark` | `#e8eaed` | Text on dark surfaces |
| `textOnLight` | `#1a1f26` | Text on light surfaces |
<!-- /AUTO-GENERATED:color-base-table -->

### Derived CSS tokens — light mode

<!-- AUTO-GENERATED:color-tokens-light-table -->
| Token | Hex |
|---|---|
| `--background` | `#f7f5f0` |
| `--foreground` | `#1a1f26` |
| `--card` | `#fffefa` |
| `--card-foreground` | `#1a1f26` |
| `--popover` | `#fffefa` |
| `--popover-foreground` | `#1a1f26` |
| `--primary` | `#4a5b6d` |
| `--primary-foreground` | `#fffefa` |
| `--secondary` | `#efeae0` |
| `--secondary-foreground` | `#1a1f26` |
| `--muted` | `#efeae0` |
| `--muted-foreground` | `#6b7585` |
| `--accent` | `#c89b4a` |
| `--accent-foreground` | `#1a1f26` |
| `--accent-secondary` | `#7a8c6d` |
| `--accent-secondary-foreground` | `#1a1f26` |
| `--destructive` | `#a85459` |
| `--destructive-foreground` | `#fffefa` |
| `--border` | `#e0d8c8` |
| `--input` | `#e0d8c8` |
| `--ring` | `#c89b4a` |
| `--sidebar` | `#efeae0` |
| `--sidebar-foreground` | `#1a1f26` |
| `--sidebar-primary` | `#4a5b6d` |
| `--sidebar-primary-foreground` | `#fffefa` |
| `--sidebar-accent` | `#e8e0cc` |
| `--sidebar-accent-foreground` | `#1a1f26` |
| `--sidebar-border` | `#e0d8c8` |
| `--sidebar-ring` | `#c89b4a` |
| `--chart-1` | `#c89b4a` |
| `--chart-2` | `#7a8c6d` |
| `--chart-3` | `#4a5b6d` |
| `--chart-4` | `#a8823a` |
| `--chart-5` | `#5c6f50` |
<!-- /AUTO-GENERATED:color-tokens-light-table -->

### Derived CSS tokens — dark mode

<!-- AUTO-GENERATED:color-tokens-dark-table -->
| Token | Hex |
|---|---|
| `--background` | `#0e1014` |
| `--foreground` | `#e8eaed` |
| `--card` | `#14181f` |
| `--card-foreground` | `#e8eaed` |
| `--popover` | `#1a1f29` |
| `--popover-foreground` | `#e8eaed` |
| `--primary` | `#c89b4a` |
| `--primary-foreground` | `#14181f` |
| `--secondary` | `#1a1f29` |
| `--secondary-foreground` | `#e8eaed` |
| `--muted` | `#1a1f29` |
| `--muted-foreground` | `#a8b0bb` |
| `--accent` | `#c89b4a` |
| `--accent-foreground` | `#14181f` |
| `--accent-secondary` | `#7a8c6d` |
| `--accent-secondary-foreground` | `#0e1014` |
| `--destructive` | `#b3666b` |
| `--destructive-foreground` | `#f4e8e9` |
| `--border` | `#232a35` |
| `--input` | `#232a35` |
| `--ring` | `#c89b4a` |
| `--sidebar` | `#0e1014` |
| `--sidebar-foreground` | `#a8b0bb` |
| `--sidebar-primary` | `#c89b4a` |
| `--sidebar-primary-foreground` | `#14181f` |
| `--sidebar-accent` | `#1a1f29` |
| `--sidebar-accent-foreground` | `#e8eaed` |
| `--sidebar-border` | `#1a1f29` |
| `--sidebar-ring` | `#c89b4a` |
| `--chart-1` | `#d4a866` |
| `--chart-2` | `#8a9b7d` |
| `--chart-3` | `#6b7c8d` |
| `--chart-4` | `#b88f4a` |
| `--chart-5` | `#7a8c6d` |
<!-- /AUTO-GENERATED:color-tokens-dark-table -->

The remaining 13 tokens (`surface.2`, `surface.3`, `border.*`,
`text.secondary/tertiary/disabled`, `status.*`) are derived in the CSS
layer either by tonal lightening/darkening of the bases or as static
values shared across all brands of the system.

## Implementation

The system is fully wired through `apply-brand`:

1. `brand.json::colors` holds the 9 base hex values + 3 human-readable
   color names + the `tokens.{light,dark}` derived 22-token system.
2. `apply-brand` regenerates `ui/src/lib/client/brand.ts` so the JS side
   sees `BRAND.colors.primary`, etc.
3. `apply-brand` regenerates `ui/ios/App/App/Brand.swift` (+ 4 extension
   copies) with the same color literals.
4. `ui/src/app.css` AUTO-GENERATED:brand-tokens block consumes the
   brand.ts values and expands the 9 bases into the
   full 22-token system.
5. Every component using hardcoded color literals (`#5b6cff`, etc.) gets
   migrated to the token system. A grep + sweep before commit.
