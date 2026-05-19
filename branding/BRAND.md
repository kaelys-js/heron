# Brand — Heron

<!-- AUTO-GENERATED:doc-meta -->
*Last revised 2026-05-18 · part of the [Heron](../README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

> Last revised 2026-05-15. This document is the canonical source for Heron's
> name, positioning, audience, voice, and taglines. Visual specs live in
> [`COLORS.md`](./COLORS.md), [`TYPOGRAPHY.md`](./TYPOGRAPHY.md), and
> [`MASCOT.md`](./MASCOT.md). The runtime/build source of truth for
> identifiers is [`brand.json`](./brand.json); a brand rename happens by
> editing `brand.json` + running `pnpm brand:apply`.

## Identity

<!-- AUTO-GENERATED:identifiers-list -->
- **Bundle ID** — `com.heron.app`
- **URL scheme** — `heron://`
- **App Group** — `group.com.heron.app`
- **Bonjour service** — `_heron._tcp`
- **Capacitor plugin** — `HeronNative`
- **Keychain service** — `com.heron.app`
<!-- /AUTO-GENERATED:identifiers-list -->

## Mission

> Heron helps anyone changing or accelerating their career make the right
> next move — patiently, precisely, and on their own machine.

"Right next move" carries weight: implies decision-quality, plural moves
over a career, and the next-move framing of someone in transition. "On
their own machine" carries the local-first stance without saying
"local-first" as jargon.

## Positioning

> Heron is a thinking partner for career transitions. Unlike job boards
> optimized for volume and AI apply-bots optimized for spam, Heron is
> patient by design. It scans the market with you, evaluates opportunities
> with rigor, and prepares you for the moments that matter — interviews,
> offers, hard conversations about scope and compensation. Your data never
> leaves your machine. The AI works for you, not for an aggregator.

## Audience — five personas, one thread

| Persona | What they need from Heron |
|---|---|
| **Strategic changer** | Pivot evaluation — does my background actually map to this new track? (engineer → PM, IC → manager, agency → in-house) |
| **Accelerator** | Within-track level-up — staff role, senior comp negotiation, the next-rung interview prep |
| **Re-entrant** | Re-build credibility narrative after a break (parental leave, sabbatical, layoff gap) |
| **Cross-border mover** | Market-fit + comp + visa research for a new country |
| **Dual-track** | Two real careers, one human (the engineer + instructor case Heron supports natively) |

**Common thread**: deliberate transition, not casual browsing. Heron is
the wrong tool for someone refreshing a job board out of habit; it's the
right tool for someone whose next 12 months will be defined by the move
they're about to make.

## Voice principles

<!-- AUTO-GENERATED:principles-list -->
- **Specific over abstract** — Concrete numbers, named tools, real workflows. Not 'AI-powered' or 'next-generation'.
- **Quiet over loud** — No exclamation marks. No urgency-by-typography. Calm carries weight.
- **Earned over claimed** — Don't say 'easy' — show the four-line quickstart. Don't say 'powerful' — show the feature.
- **Patient over urgent** — Heron is for considered decisions. Manufactured urgency contradicts the brand at every layer.
- **Local-first over cloud-default** — Data on disk. AI bring-your-own-key. No cloud aggregator.
- **Filter over cannon** — The autonomous-apply gate is below 4/5 by default. The brand promise made operational.
<!-- /AUTO-GENERATED:principles-list -->

## Personality

<!-- AUTO-GENERATED:personality-list -->
- calm
- sophisticated
- patient
- precise
- local-first
<!-- /AUTO-GENERATED:personality-list -->

## Anti-brands

<!-- AUTO-GENERATED:anti-brands-list -->
- LinkedIn
- AI-slop
- hustle-bro
- wellness-coddling
<!-- /AUTO-GENERATED:anti-brands-list -->

## Taglines

**Primary** —

<!-- AUTO-GENERATED:tagline -->
> **Stand still. Strike well.**
<!-- /AUTO-GENERATED:tagline -->

Two short clauses. Parallel rhythm. Carries the entire philosophy:
patient observation, then decisive precise action. Works at every scale
— landing-page hero, tweet bio, About page first line, README banner.

**Twitter-bio length** (≤160 chars, App Store subtitle) —

<!-- AUTO-GENERATED:boilerplate-short -->
> Heron — a thinking partner for career transitions. Patient. Precise. Local-first. Open source.
<!-- /AUTO-GENERATED:boilerplate-short -->

**Reserves** (use only if the primary stops landing):

- *Patience makes precision.* — more aphoristic, less distinctive
- *Wait for the right move.* — gentler, more directive
- *Quiet hunter.* — terse, most distinctive, may read cryptic standalone

## Origin story (one paragraph for README / About page)

<!-- AUTO-GENERATED:origin -->
> The heron stands motionless in shallow water. It waits. It watches. It evaluates every passing form. Then, when the moment is exactly right, it strikes — once, precisely, and the work is done.
<!-- /AUTO-GENERATED:origin -->

## What this brand deliberately does NOT say

- "AI-powered" — every tool is AI-powered now; the phrase is dead.
- "Land your dream job" — hustle-bro / coaching cliché.
- "10x your job search" — VC-pitch tonality.
- "Designed by ex-FAANG engineers" — credential-flexing; Heron's value is in the philosophy, not the founder résumé.
- "The future of work" / "the next generation of [thing]" — empty futurism.
- Anything with "supercharge," "unlock," "crush," "blast," "amplify," "elevate."
- Anything that frames the user as broken / lost / struggling. They're in transition; they're not patients.

## Open-source posture

Heron is open source. Today the brand is the project (community-flavored).
The brand is designed to scale into a commercial entity (`Heron`,
`Heron Labs`, `Heron Cloud`, `Heron for Teams`) without forking a new
identity — single-brand strategy, not Next.js/Vercel-split. If/when a
commercial entity emerges, the open-source project keeps the same name,
the same mark, the same voice.

## Wordmark

The wordmark is just **Heron** — no accent, no underline, no inline icon.
Restraint reads as confidence; distinction is earned through *consistency*
(same face, same weight, same tracking, same token-defined color) rather
than logo trickery. The mascot ships separately so each component is
composable: wordmark alone (most contexts), mascot alone (favicon, watch
face), or locked-up together (marketing, press kit).

| Property | Value |
|---|---|
| Family | Fraunces (variable serif) — see [`TYPOGRAPHY.md`](./TYPOGRAPHY.md) |
| Weight (`wght`) | 700 |
| Optical size (`opsz`) | 96 (display) |
| Soft axis (`SOFT`) | 0 (sharp — full editorial gravitas) |
| Letter-spacing | -0.02em |
| Minimum render size | 24px height — below this, use the mascot alone |
| Clearspace | 1× cap-height on every side |

Four SVG variants ship under `assets/`. `apply-brand` regenerates all
four from `brand.json::displayName` + the relevant color hex; edit
brand.json + run `pnpm brand:apply` to retarget every variant.

| File | Fill source | Use |
|---|---|---|
| `assets/wordmark.svg` | `currentColor` | Inline use where parent sets `color` |
| `assets/wordmark-slate.svg` | `brand.colors.primary` | Light surfaces (default) |
| `assets/wordmark-light.svg` | `brand.colors.textOnDark` | Dark surfaces |
| `assets/wordmark-dawn.svg` | `brand.colors.accent` | Special-occasion only — gold-strike moment, press-kit cover. Not for everyday UI. |

**Forbidden**: stretching either axis, drop shadows, re-coloring outside
the token set, outlining the letterforms, setting below 24px, or placing
a tagline directly underneath without the cap-height clearspace.

**Honest limitation — text mode placeholder.** The shipped SVGs depend
on Fraunces being loaded by the renderer. The web UI self-hosts Fraunces
(`brand.fonts.display`); the dashboard, Capacitor wrappers, and any
context that loads `ui/src/app.css` render correctly. Contexts where
Fraunces *isn't* loaded — press kit PDFs, server-rasterized social
cards, third-party embeds, email signatures — need the letterforms
**outlined to vector `<path>` elements** as a one-time production prep
step (Claude Design, Figma "Outline Stroke", Glyphs / FontForge, or
any vector editor). Replace the placeholder `<text>` element in each
variant with the resulting `<path>`; the viewBox stays the same so
consumers don't have to change.
