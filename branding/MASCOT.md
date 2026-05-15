# Mascot — Heron

> Last revised 2026-05-15. Production brief for the Heron mascot.
> Detailed enough that a human illustrator can execute in 1–2 days, or
> Claude Design can produce a usable first draft in 5 minutes.
> Companion docs: [`BRAND.md`](./BRAND.md) (personality, voice),
> [`COLORS.md`](./COLORS.md) (palette), [`WORDMARK.md`](./WORDMARK.md)
> (lockup with the wordmark), [`TYPOGRAPHY.md`](./TYPOGRAPHY.md) (face
> used in lockups).

## Concept

The heron is the patient hunter. It stands motionless in shallow water
at dawn — neck folded in a soft S-curve, body compact, legs planted,
head turned slightly to one side, eye fixed on the water. Its character
is *attention without urgency*.

The mascot embodies this: a heron at rest, *poised but not striking*.
The strike is implied. Showing the strike itself would be aggressive
and miss the brand. The mascot is NOT cartoon-cute. NOT anthropomorphized.
NOT photo-real. NOT 3D-rendered. It's editorial illustration —
somewhere between a 1920s field guide and a modern Field Notes notebook
cover. The mascot serves like a museum's silhouette icon, not like a
Disney character.

## Subject specification

| Attribute | Choice |
|---|---|
| Species reference | Great Blue Heron (*Ardea herodias*) OR Grey Heron (*Ardea cinerea*, the European equivalent). Both give the same slate-blue plumage + long S-neck silhouette. |
| Pose | Standing tall, neck in resting S-curve (not stretched, not coiled). Head turned to viewer's right at ~25–30° (the wordmark sits to the right in horizontal lockup; the heron "regards" the brand name). Legs planted, body weight balanced. |
| Body proportion | Compact teardrop; head + body together ≈ ⅔ the height of the legs |
| Neck S-curve | Soft, never angular. The curve evokes the calligraphic ʃ glyph more than a sharp Z. |
| Beak | Sharp, angular, slightly forward — implies precision without showing aggression. Length ≈ 1× head diameter. |
| Eye | Single small dot. Light color on dark plumage. Gives the heron a *focal point of attention* without anthropomorphizing it. |
| Legs | Long, thin, mostly straight, slightly bent at the knee. Suggest planted stillness — not a stride. |
| Feet | Suggest with small horizontal terminators; don't render toes explicitly. |
| Plumage | Slate-blue mass at body, suggestion of a few darker flight feathers on the wings (illustration variant only — mark variant is solid silhouette). |

## Style direction

Editorial illustration. Specifically:

- Crisp edges, no soft airbrush, no gradient mesh
- Limited palette — 3 colors max from the brand token set
- Some flat areas + some line detail. Not pure silhouette; not heavily-rendered
- Hand-feel without sloppiness — like a high-end notebook illustration, not a Sharpie sketch
- Asymmetric balance — the heron leans slightly into the wordmark in lockup

### Reference pile

| Reference | Why |
|---|---|
| John James Audubon, *Great Blue Heron* (1827, *Birds of America*) | Quiet authority of natural-history engraving; standing pose, neck-S, sharp beak. Pull the *posture* without the photo-realism. |
| Charley Harper, mid-century bird prints (*Cool Cardinal*, *Mystery of the Missing Migrants*) | Geometric abstraction; bold flat shapes; instantly recognizable. Pull the *abstraction discipline* without going as graphic. |
| Field Notes notebook cover illustrations | Editorial-illustration style, restrained palette, mid-century feel. The exact style register we want. |
| Japanese sumi-e ink heron paintings (Hasegawa Tōhaku and contemporaries) | Economical brushwork. A few strokes carry the whole bird. Pull *minimum-marks-to-make-a-heron* discipline. |
| Anthropic's typographic A (claude.ai) | The restraint principle — let small details carry the brand, don't over-illustrate. Copy the philosophy, not the A. |

### What to dodge

| Anti-reference | Why |
|---|---|
| Linux Penguin, Mailchimp Freddie, GitHub Octocat | Anthropomorphic cartoon mascots — wrong personality register. |
| Stock-photo herons | Realism kills the editorial gravitas. |
| Origami crane templates | Cliché; would land Heron in the wellness-coddling lane. |
| 3D-rendered animals (Pixar / Apple memoji style) | Too playful, too production-heavy, won't scale to favicon size. |

## Color usage

Three colors max per mascot. From [`COLORS.md`](./COLORS.md):

| Element | Color | Note |
|---|---|---|
| Body, neck, head, legs | Heron Slate `#4a5b6d` | The defining color |
| Eye (single dot) | warm white `#fffefa` or Heron Dawn `#c89b4a` | Dawn variant signals "the moment of attention" |
| Beak tip (optional accent) | Heron Dawn `#c89b4a` | Reserved — use only in the marketing illustration variant, never in the small-size mark |

## Two-tier variant system

Two distinct styles for different contexts. Don't conflate them.

### Tier 1 — Mark (silhouette)

For favicon, app icon, watch face, dock badge, web nav, anywhere it
renders ≤ 64px.

| Property | Value |
|---|---|
| Style | Solid silhouette, single color (+ minimal eye dot) |
| Detail level | Geometric abstraction — beak / neck / body / legs as a single readable shape |
| Files | `assets/mark-slate.svg`, `assets/mark-light.svg`, `assets/mark-dawn.svg` |
| viewBox | `0 0 120 160` (5:7 ratio — vertical-leaning to match heron proportion) |
| Minimum size | 16×16 (favicon); silhouette must remain legible at this size |
| Maximum size | unbounded (vector) |

### Tier 2 — Illustration (editorial)

For hero panels, marketing pages, README banner, press kit cover, App
Store screenshots, blog post headers.

| Property | Value |
|---|---|
| Style | Editorial illustration; multi-color (3 max from palette); subtle linework |
| Detail level | Some plumage suggestion; eye with character; beak with subtle highlight |
| Files | `assets/illustration-hero.svg`, `assets/illustration-press.svg` |
| viewBox | `0 0 480 640` (same 3:4 ratio, larger canvas for detail) |
| Minimum size | 200×267 — below this the linework collapses; use the mark instead |
| Maximum size | unbounded (vector) |

## Lockup with the wordmark

Two configurations, defined here, also referenced in [`WORDMARK.md`](./WORDMARK.md).

### Horizontal lockup (header navs, README banner, footer)

```text
[mark]  Heron
```

- Mark on the left, wordmark right of it
- Mark height = cap-height of the H × 1.4 (slightly taller than the H, gives visual weight)
- Gap between mark and wordmark = 0.5× cap-height of the H
- Mark's eye-line aligns with the wordmark's x-height

### Stacked lockup (hero panels, app icon background, marketing covers)

```text
  [mark]
  Heron
```

- Mark on top, wordmark centered beneath it
- Mark width = wordmark width × 0.5 to 0.7 (mark is visually smaller than the wordmark, never larger)
- Gap between mark and wordmark baseline = 0.5× cap-height of the H

Lockup SVG files (`assets/lockup-horizontal-{slate|light}.svg`,
`assets/lockup-stacked-{slate|light}.svg`) get committed once the real
mascot exists. Placeholders sit alongside the placeholder mark SVG for
now.

## Forbidden modifications

| Don't | Why |
|---|---|
| Anthropomorphize (eyebrows, smile, human posture) | Breaks the editorial-illustration register |
| Show the heron striking / catching a fish | Aggressive imagery contradicts "patient" |
| Add water, reeds, or background scenery to the mark | Mark must scale to 16×16; only the silhouette matters |
| Make it cute / "kawaii" | Wrong audience register |
| Use additional colors beyond the token set | Breaks the visual system |
| Outline the silhouette with a contrasting stroke | Reads as sticker, not editorial |
| Add gradients, drop shadows, glow, or soft edges | Breaks the calm-sophisticated principle |
| Render in isometric / 3D / perspective | Brand is flat 2D editorial; depth implies game-design / Web3 aesthetic |
| Animate / make it "wave hello" / "blink" | Mascot is still. Always still. |

## Production prompts

### Prompt for Claude Design

> Generate a heron mascot for a brand called Heron, in two variants.
>
> Tier 1 — Mark (silhouette):
> Style: editorial illustration, geometric abstraction, single-color
> solid silhouette. Subject: Great Blue Heron, side profile, standing
> pose, neck in soft S-curve, head turned 25° toward viewer's right,
> sharp beak slightly forward. Long thin legs, planted. Color: #4a5b6d
> (Heron Slate). Eye: single white dot for focal character. Output:
> SVG, viewBox 0 0 120 160, minimum readable size 16x16. References:
> Charley Harper's geometric birds, John James Audubon's Great Blue
> Heron pose, Field Notes illustration style.
>
> Tier 2 — Illustration (editorial):
> Same subject and pose. Multi-color (3 max): #4a5b6d body, #fffefa
> eye, #c89b4a accent on beak tip. Some line-detail in plumage
> suggesting flight feathers; subtle texture without rendering.
> Output: SVG, viewBox 0 0 480 640. Style references: Field Notes
> notebook covers, Audubon engraving, Hasegawa Tōhaku sumi-e
> brushwork.
>
> Forbidden: anthropomorphism, cartoon cuteness, gradients, drop
> shadows, 3D perspective, animation hints, water/reed scenery in
> the mark, additional colors beyond the listed three.

### Prompt for human illustrator

Same content as the Claude Design prompt. Brief should also include:

1. Link to this `MASCOT.md` (full context)
2. Link to [`COLORS.md`](./COLORS.md) (palette)
3. Link to [`BRAND.md`](./BRAND.md) (personality, voice)
4. The five reference images cited above (illustrator pulls on their own)
5. Deliverable: 5 SVG files — 3 mark variants + 2 illustration variants — matching the viewBox + viewport specs above

## Placeholder

`assets/mark-placeholder.svg` ships in this commit as a hand-drawn rough
silhouette. It exists so the repo has *something* at the expected file
path during development, not because it's the final mascot. Two reasons
to replace it before press:

1. The proportions are approximate (hand-built SVG paths, not
   illustrator output)
2. It lacks the editorial-illustration refinement specified above

Replace it with the Claude Design / human illustrator output as soon as
those land. The placeholder is marked clearly in its file comment.

## Implementation notes (Task 9 wiring)

1. Real mascot SVGs replace the placeholder `branding/logo.svg` and
   land in `branding/assets/mark-{slate,light,dawn}.svg` +
   `branding/assets/illustration-{hero,press}.svg`.
2. `apply-brand` regenerates `ui/static/icons/*.png` from the mascot
   at all platform sizes (16×16 through 1024×1024).
3. The favicon link in `ui/src/app.html` switches from the current
   career-ops icon to `mark-slate.svg` (or a 32×32 rasterized variant).
4. Topbar / AppSidebar reference the horizontal lockup SVG.
5. README banner gets the horizontal lockup at the top.
