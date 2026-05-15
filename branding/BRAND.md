# Brand — Heron

> Last revised 2026-05-15. This document is the canonical source for Heron's
> name, positioning, audience, voice, and taglines. Visual specs live in
> [`COLORS.md`](./COLORS.md), [`TYPOGRAPHY.md`](./TYPOGRAPHY.md), and
> [`MASCOT.md`](./MASCOT.md). The runtime/build source of truth for
> identifiers is [`brand.json`](./brand.json); a brand rename happens by
> editing `brand.json` + running `pnpm brand:apply`.

## Identity

| Field | Value |
|---|---|
| Brand name | **Heron** |
| Capitalization | Sentence case. Never ALL CAPS. Never hyphenated. |
| Package identifier | `heron` (lowercase) |
| Display name (UI / App Store / dock / Electron menu) | Heron |
| Repository slug | `heron` (lowercase) |
| Bundle ID | `com.heron.app` (clean) — TBD per Task 9 |
| URL scheme | `heron://` |
| Local mDNS service | `_heron._tcp` |

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

1. **Direct without being curt.** Tell users what to do; give enough context to understand why. Skip hype.
2. **Confident without being absolute.** "We'd recommend." "Consider." Never "you MUST" or "the only way."
3. **Specific over abstract.** *"This role pays $180–220K base in SF, 0.05–0.12% equity at this stage."* Not *"competitive comp."*
4. **Patient tone.** No urgency manufacturing. No "limited time." No countdown timers. Heron does not pressure.
5. **Respect the user's time and intelligence.** No "as an AI language model." No onboarding tours for obvious UI. Insights are unlocked by relevance, not by friction gates.
6. **Quiet about itself.** Heron isn't the protagonist of the user's career. The user is. The brand stamp is light.

## Taglines

**Primary** — *Stand still. Strike well.*

Two short clauses. Parallel rhythm. Carries the entire philosophy:
patient observation, then decisive precise action. Works at every scale
— landing-page hero, tweet bio, About page first line, README banner.

**Secondary** (longer-form contexts, About page, press kit) —
*A thinking partner for the moves that matter.*

**Twitter-bio length** (≤160 chars, App Store subtitle) —
*Heron — a thinking partner for career transitions. Patient. Precise. Local-first. Open source.*

**Reserves** (use only if the primary stops landing):

- *Patience makes precision.* — more aphoristic, less distinctive
- *Wait for the right move.* — gentler, more directive
- *Quiet hunter.* — terse, most distinctive, may read cryptic standalone

## Origin story (one paragraph for README / About page)

> The heron stands motionless in shallow water. It waits. It watches. It
> evaluates every passing form. Then, when the moment is exactly right,
> it strikes — once, precisely, and the work is done. This is the wrong
> era for spray-and-pray job searches. Recruiters' attention is finite.
> So is yours. Heron is a thinking partner for people in career
> transition who'd rather make one excellent move than fifty mediocre
> ones. It runs entirely on your machine. Your data is yours.

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
