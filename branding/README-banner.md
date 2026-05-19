# README banner — Heron

> Last revised 2026-05-15. The top-of-`README.md` section for Heron.
> Companion docs: [`BRAND.md`](./BRAND.md) (voice principles, taglines,
> origin story), [`VOICE.md`](./VOICE.md) (anti-patterns, micro-rules),
> [`WORDMARK.md`](./WORDMARK.md) + [`MASCOT.md`](./MASCOT.md) (visual
> assets). The actual `README.md` swap happens at Task 9 — this file is
> the spec.

## Purpose

The banner is the first 30 seconds of someone landing on the repo. It
must answer four questions before the reader scrolls:

1. **What is this?** (a job-search assistant for career transitions)
2. **Who is it for?** (anyone changing or accelerating a career)
3. **What's different?** (local-first, AI-agnostic, patient by design)
4. **How do I try it?** (a quickstart that works)

Anything that doesn't serve those four questions belongs deeper in the
README, not in the banner.

## The banner markdown (ready to paste)

This block replaces the current top section of `README.md`, down to and
including the "Quick start" code block. Everything below "Quick start"
in the existing README stays as-is for Task 9 to brand-sweep
separately.

````markdown
<div align="center">

<img src="branding/assets/wordmark-slate.svg" alt="Heron" width="180" />

# Heron

**Stand still. Strike well.**

A thinking partner for career transitions. Patient, precise, local-first.

[![Build](https://github.com/heron/heron/actions/workflows/test.yml/badge.svg)](https://github.com/heron/heron/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/github/v/release/heron/heron)](https://github.com/heron/heron/releases)

[Get started](docs/SETUP.md) · [Documentation](docs/) · [Architecture](docs/ARCHITECTURE.md) · [Discord](https://discord.gg/8pRpHETxa4)

</div>

---

## What is Heron?

The heron stands motionless in shallow water. It waits. It watches. It evaluates every passing form. Then, when the moment is exactly right, it strikes — once, precisely, and the work is done.

This is the wrong era for spray-and-pray job searches. Recruiters' attention is finite. So is yours. Heron is a thinking partner for people in career transition who'd rather make one excellent move than fifty mediocre ones.

It runs entirely on your machine. Your data is yours.

## What it does

- **Pipeline tracking** — every opportunity in one place; status, score, comp, notes
- **A–F evaluation** — six-block analysis per role: role fit, CV match, level strategy, comp research, CV personalization plan, interview prep
- **CV generation** — ATS-optimized PDFs (HTML + LaTeX templates), tailored per role
- **Portal scanning** — 11 ATSes (Greenhouse / Ashby / Lever / LinkedIn / Indeed / Workday / Recruitee / SmartRecruiters / Workable / Personio / Teamtailor)
- **Recruiter inbound** — email classifier that flags offers, confirms interviews, and reacts to rejections
- **Interview prep** — STAR+R stories generated from your real work; mock interviews; comp negotiation
- **Autonomous apply** *(opt-in, score-gated, off by default)* — Heron defers to you on the moves that matter
- **Multi-user, multi-profile** — two humans share one install, fully segregated; one human runs engineer + instructor profiles, fully segregated
- **AI-agnostic** — swappable CLI (Claude / Gemini / Codex / OpenCode / Qwen). No vendor lock-in.

## Why local-first

Your CV, application history, scoring data, recruiter emails, interview prep — all of it stays on your disk. No cloud aggregator. The AI runs locally or against an API key you own; the data never leaves your machine.

If a hosted tier emerges in the future, the open-source local-first version stays maintained and supported. That's the whole posture.

## Quick start

```bash
git clone https://github.com/heron/heron.git
cd heron
mise install              # auto-installs Node 26 + pnpm 11 + Ruby 3.3 + Python 3.13
pnpm install              # one-shot install across workspaces
pnpm setup:native         # generates Heron-branded native apps (optional)
pnpm dev                  # SvelteKit dashboard at localhost:5173
```

See [`docs/SETUP.md`](docs/SETUP.md) for the long form, including
Capacitor builds for iOS / Android and the Electron desktop wrapper.
````

## Rationale per element

### Wordmark image (lockup TBD)

Centered, ~180px wide. The shipped README currently uses
`branding/assets/wordmark-slate.svg` (the wordmark-only variant)
because the stacked lockup (mascot above wordmark) doesn't exist yet —
it lands when the real mascot does (Claude Design or illustrator
output). At that point swap the `<img>` line to
`branding/assets/lockup-stacked-slate.svg` and the banner gains the
mark visual without any other structural change.

Slate version because the GitHub README renders against a light-ish
surface in light mode and a darker surface in dark mode — slate sits
well against both.

### Tagline + sub-line

The primary tagline (`Stand still. Strike well.`) goes in bold, on its
own line, centered. Directly underneath: the one-sentence subtitle
from BRAND.md. Together they communicate: posture (calm + decisive)
+ positioning (thinking partner + local-first).

### Badges

Three badges, no more:

- **Build** — links to the GitHub Actions test workflow. Updates on
  every push. Signals "this is maintained and the CI is green."
- **License: MIT** — explicit, scannable, blue. Reduces "is this safe
  to fork?" friction at zero cost.
- **Version** — pulls latest tag from GitHub Releases. Signals
  cadence: a maintained project, not a stale GitHub graveyard.

Skip: badge inflation. "Built with TypeScript," "Made with ❤️," "PRs
welcome" — those add noise and trip the hustle-bro / coddling anti-
patterns from VOICE.md.

### Link row

Four links, separated by middle-dots:

- **Get started** → `docs/SETUP.md` (the runnable path)
- **Documentation** → `docs/` (the full docs tree)
- **Architecture** → `docs/ARCHITECTURE.md` (for the curious / contributors)
- **Discord** → the community link (existing one preserved)

Four is the sweet spot. Three feels sparse; five splits attention.

### "What is Heron?" section

Opens with the origin paragraph from BRAND.md, *verbatim*. The whole
banner pivots on this paragraph — it's the brand voice's single
strongest moment. Don't truncate it; don't summarize it; don't add
"sounds great? Try Heron today!" after it. Let it land.

### "What it does" bulleted feature list

Nine bullets, each one a single sentence. Format: `**Feature name** —
description`. The description is *specific* (per VOICE.md rule 3), not
abstract. Compare:

- ✓ "A–F evaluation — six-block analysis per role: role fit, CV match,
  level strategy, comp research, CV personalization plan, interview
  prep"
- ✗ "AI-powered evaluation — quickly analyze any job opportunity"

The autonomous-apply bullet wears its safety constraints visibly:
*opt-in, score-gated, off by default*. This is the brand promise made
explicit on the front door.

### "Why local-first" section

Two short paragraphs. The first paragraph states the technical
posture: data stays on disk, no cloud, the AI is yours. The second
paragraph acknowledges the future commercial entity (per BRAND.md's
single-brand strategy) without leaving the OSS audience worried about
abandonment.

This section is *the* differentiator. It earns its own h2.

### "Quick start" code block

Four lines + one optional line + one comment per line. The user can
literally paste these four lines and have a running dev server. That's
the bar.

We deliberately don't say "in just 5 minutes!" (per VOICE.md rule 9)
or "Easy setup!" (per the "easy" anti-claim). The cleanness of the
four-line block speaks for itself.

## Anti-patterns this banner avoids

| Avoided | Why |
|---|---|
| Emojis in headings or badges | Violates VOICE.md anti-pattern #3 |
| "Welcome to the future of [thing]" intro paragraph | Empty futurism (BRAND.md, "what this brand doesn't say") |
| "🚀 Get started in seconds!" CTA copy | Hustle-bro + urgency-manufacturing |
| "Powered by AI" subtitle | AI-slop tell |
| "Made with ❤️ by [name]" footer line | Wrong register; the brand is the brand, not the maintainer |
| Marketing-deck-style screenshot row | This is a README, not a landing page; visuals come from the screenshot section deeper in |
| Subscription / pricing teaser | Heron is OSS; no subscription page |
| Animated GIF demo at the top | Heavy bandwidth; flashing animation contradicts the calm register. A small static screenshot, deeper in the README, is fine. |

## Implementation notes (Task 9)

When Task 9 propagates the rebrand:

1. **Replace** the current top section of `README.md` (down to and
   including the existing "Quick start"-equivalent block) with the
   markdown block above, verbatim.
2. **Verify** the asset paths resolve:
   - `branding/assets/lockup-stacked-slate.svg` (will be produced by
     Claude Design or an illustrator)
   - If the lockup SVG isn't ready, fall back to
     `branding/assets/wordmark-slate.svg` for the top image
3. **Update** GitHub URL references in the README banner — currently
   `heron/heron`. When the actual GitHub org becomes available,
   `git remote set-url` accordingly.
4. **Keep** the rest of the README structure (Stack and Conventions,
   scripts/ directory tree, etc.) — those are functional reference
   docs and don't need brand-voice rewriting.

The Acknowledgements section deeper in the README (which credits the
upstream pre-fork project) stays as-is — that's heritage / credit and
shouldn't be rebranded.
