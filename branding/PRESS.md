# Heron — press kit

<!-- AUTO-GENERATED:doc-meta -->
*Last revised 2026-05-18 · part of the [Heron](../README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

> Last revised 2026-05-18. The single document a journalist, blogger,
> podcaster, partner, or community organizer needs to write about Heron
> accurately. Copy the relevant block, attach the relevant asset, file
> the piece.
>
> Companion docs: [`BRAND.md`](./BRAND.md) (strategy + voice),
> [`VOICE.md`](./VOICE.md) (anti-patterns), [`BRAND.md#wordmark`](./BRAND.md#wordmark)
> + [`MASCOT.md`](./MASCOT.md) (visual assets),
> [`SOCIAL-CARD.md`](./SOCIAL-CARD.md) (OG image),
> [`COLORS.md`](./COLORS.md) + [`TYPOGRAPHY.md`](./TYPOGRAPHY.md)
> (visual system).

## One-liner

> Heron is a thinking partner for career transitions — patient, precise, and local-first.

Use it as the tagline under a headline, the App Store subtitle, or the
opening paragraph of an article. Don't pad it.

## Boilerplate

Three lengths. Pick the one that fits the format. Don't paraphrase —
the language is deliberate.

### Short (140 chars — Twitter / X bio, podcast description)

<!-- AUTO-GENERATED:boilerplate-short -->
> Heron — a thinking partner for career transitions. Patient. Precise. Local-first. Open source.
<!-- /AUTO-GENERATED:boilerplate-short -->

### Medium (≤ 280 chars — article lede, App Store description, conference bio)

<!-- AUTO-GENERATED:boilerplate-medium -->
> Heron is an open-source job-search assistant for the wrong era of spray-and-pray. It tracks your pipeline, scores every role A-F, generates ATS-optimized CVs, scans 11 ATSes, and triages recruiter email — all locally. Your data never leaves your machine.
<!-- /AUTO-GENERATED:boilerplate-medium -->

### Long (≤ 600 chars — press release, blog intro, About page)

<!-- AUTO-GENERATED:boilerplate-long -->
> The heron stands motionless in shallow water. It waits. It watches. It evaluates every passing form. Then, when the moment is exactly right, it strikes — once, precisely, and the work is done. Heron is a thinking partner for people in career transition who'd rather make one excellent move than fifty mediocre ones. It runs entirely on your machine: pipeline tracking, A-F role evaluation, ATS-optimized CVs, 11-portal scanning, recruiter email triage, interview prep, and opt-in autonomous apply. Open source. AI-agnostic. Your data stays yours.
<!-- /AUTO-GENERATED:boilerplate-long -->

## Quick facts

<!-- AUTO-GENERATED:quick-facts-table -->
| | |
|---|---|
| **Name** | Heron |
| **Tagline** | Stand still. Strike well. |
| **License** | MIT |
| **Source** | <https://github.com/heron/heron> |
| **Website** | <https://heron.app> |
| **Discord** | <https://discord.gg/8pRpHETxa4> |
| **Bundle ID** | `com.heron.app` |
| **URL scheme** | `heron://` |
| **Support email** | <hello@heron.app> |
| **Heritage** | Hard fork of [`santifer/heron`](https://github.com/santifer/heron) |
<!-- /AUTO-GENERATED:quick-facts-table -->

## Identifiers

<!-- AUTO-GENERATED:identifiers-list -->
- **Bundle ID** — `com.heron.app`
- **URL scheme** — `heron://`
- **App Group** — `group.com.heron.app`
- **Bonjour service** — `_heron._tcp`
- **Capacitor plugin** — `HeronNative`
- **Keychain service** — `com.heron.app`
<!-- /AUTO-GENERATED:identifiers-list -->

## What Heron does (feature list — for technical articles)

- **Pipeline tracking** — every opportunity in one place; status, score, comp, notes
- **A–F evaluation** — six-block analysis per role: role fit, CV match, level strategy, comp research, CV personalization plan, interview prep
- **CV generation** — ATS-optimized PDFs (HTML + LaTeX templates), tailored per role
- **Portal scanning** — 11 ATSes (Greenhouse / Ashby / Lever / LinkedIn / Indeed / Workday / Recruitee / SmartRecruiters / Workable / Personio / Teamtailor)
- **Recruiter inbound** — email classifier that flags offers, confirms interviews, reacts to rejections
- **Interview prep** — STAR+R stories generated from real work; mock interviews; comp negotiation
- **Autonomous apply** *(opt-in, score-gated, off by default)* — Heron defers to the user on the moves that matter
- **Multi-user, multi-profile** — two humans share one install with full data segregation; one human runs engineer + instructor profiles with full segregation
- **AI-agnostic** — swappable CLI; no vendor lock-in

## What Heron is NOT

When the article needs to draw the distinction:

- **Not a LinkedIn replacement.** Heron doesn't host job postings. It reads from the ATSes where companies actually publish.
- **Not a spray-and-pray application bot.** The default policy blocks autonomous applies below a score of 4/5. Quality over quantity is built into the gate.
- **Not a SaaS.** Local-first by design. No cloud account required. No telemetry phoning home.
- **Not a recruiter tool.** Heron is for the candidate. Recruiters have plenty of software.
- **Not an "AI résumé builder."** It generates tailored CVs from the user's real CV and the specific JD — not from generic templates.

## Origin paragraph (the heart of the brand)

The single strongest sentence in the brand. Use verbatim when you can.

<!-- AUTO-GENERATED:origin -->
> The heron stands motionless in shallow water. It waits. It watches. It evaluates every passing form. Then, when the moment is exactly right, it strikes — once, precisely, and the work is done.
<!-- /AUTO-GENERATED:origin -->

## Visual assets

All assets live in [`branding/assets/`](./assets/) in the repo.

| Asset | Path | Use |
|---|---|---|
| Wordmark — slate (default) | `branding/assets/wordmark-slate.svg` | Most contexts (light or dark surface) |
| Wordmark — light (warm white) | `branding/assets/wordmark-light.svg` | Dark surfaces only |
| Wordmark — Dawn (gold) | `branding/assets/wordmark-dawn.svg` | Accent contexts; never on warm-paper backgrounds (low contrast) |
| Wordmark — currentColor (inherits) | `branding/assets/wordmark.svg` | Inline use where the parent sets `color` |
| Mascot — placeholder silhouette | `branding/assets/mark-placeholder.svg` | Hand-built approximation; real mascot ships once illustrator output lands |
| Social card render source (1200×630) | `branding/assets/social-card.html` | Open in Chrome → screenshot at 1200×630 for the OG image |
| Brand colors (9 base + 22 derived) | `branding/COLORS.md` | Hex values + WCAG ratios |

**For external press use**: the wordmark is the safest asset right
now. The mascot placeholder is intentionally crude and should be
flagged as PLACEHOLDER if rendered in print. When the illustrator
output lands, swap to `mark-slate.svg` / `mark-light.svg` /
`mark-dawn.svg`.

## Color palette (for design systems referencing the brand)

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

Full WCAG contrast ratios + the 22-token CSS system are documented
in [`COLORS.md`](./COLORS.md).

## Typography

<!-- AUTO-GENERATED:font-table -->
| Role | Family | Fallback | Weights | Axes |
|---|---|---|---|---|
| display | `Fraunces` | `'Iowan Old Style', 'Apple Garamond', Baskerville, 'Times …` | 400 700 | opsz, wght, SOFT |
| body | `Inter` | `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI',…` | 400 700 | wght |
| mono | `IBM Plex Mono` | `ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, C…` | 400, 500 | — |
<!-- /AUTO-GENERATED:font-table -->

Self-hosted under `ui/static/fonts/`. No CDN dependency at runtime.

## Quotes available for attribution

Use these as drop-in pull quotes in articles. All attributed to the
maintainer team (`resist.js`).

<!-- AUTO-GENERATED:quotes-list -->
- *"Recruiters' attention is finite. So is yours. The wrong era for spray-and-pray is the era we're in. Heron is the alternative."*
- *"Local-first isn't a feature, it's a posture. Your career data is the most concentrated personal data you'll ever generate. Treating it like analytics fodder for a SaaS isn't a tradeoff we made."*
- *"We score every role before applying. Below four out of five, the system actively discourages you. The recruiter's time is worth as much as yours."*
- *"The heron stands still. Then it strikes. That's the whole product, in two sentences."*
<!-- /AUTO-GENERATED:quotes-list -->

Custom quotes for specific contexts can be requested at <hello@heron.app>.

## Story angles (for journalists looking for the hook)

If the writer is pitching an editor, here are the four cleanest framings:

1. **The anti-spray-and-pray pitch.** The job market is drowning in AI-generated applications. Heron is the opposite design — score everything, send less, send better. Refers to the existential question of whether "AI for job search" should mean "send 500 applications a day" or "make one excellent move."

2. **The local-first pitch.** Most career-data tools ship cloud-first by default. Heron is local-first by design — every artifact stays on disk, the AI is bring-your-own-key, no cloud aggregator. Frames against the "your data is the product" pattern.

3. **The AI-agnostic pitch.** Most AI tools lock you into one vendor's API. Heron treats the LLM as a swappable component — Claude, Gemini, Codex, OpenCode, Qwen, Copilot all work via one env var. Frames against vendor lock-in.

4. **The open-source-now-commercial pitch.** The single-brand strategy (open-source first, commercial entity later under the same name) is increasingly common in dev tools (Linear started this way, Notion didn't). Frames as a sustainable open-source model that doesn't rug-pull the community.

## Story angles we'd rather you NOT write

- "🚀 The future of AI job search is here!" — falls into every anti-pattern from [`VOICE.md`](./VOICE.md). We will not give a quote that supports this framing.
- "Heron uses AI to..." with no specificity — every product uses AI in 2026; the angle is what it does WITH AI, not that it uses it.
- "Heron is for everyone." — it isn't. It's for people in career transition who'd rather make one excellent move than fifty mediocre ones. Bringing the focus narrows the audience but sharpens the pitch.
- "Heron will fix unemployment." — it won't. It's a thinking partner for a personal job search. Magic-bullet framing burns credibility.

## Contact

- **General press** — <hello@heron.app>
- **Maintainer team** — `resist.js` (<hello@heron.app>)
- **Security disclosures** — see [`.github/SECURITY.md`](../.github/SECURITY.md) (private vulnerability reporting via GitHub)
- **Community questions** — Discord (`discord.gg/8pRpHETxa4`) or GitHub Discussions
- **Speaking + podcast appearances** — <hello@heron.app> with the format, audience size, and expected publish date

We respond to press queries within two business days. If a deadline
is tight, mark it in the subject line — we'll triage.

## Trademark

The Heron name and the heron-silhouette mark are unregistered
trademarks of the maintainer team. Permitted uses (forks, lineage
attribution, journalism, education, community contributions) are
enumerated in [`docs/TRADEMARK.md`](../docs/TRADEMARK.md). When in
doubt, ask <hello@heron.app> — we default to permissive.

## Heritage statement

For pieces that need to be precise about Heron's lineage:

> Heron is a hard fork of `santifer/career-ops`, the original CLI-driven job-search system [santifer](https://santifer.io) built and used to evaluate 740+ offers, generate 100+ tailored CVs, and land a Head of Applied AI role. His [case study](https://santifer.io/career-ops-system) is the philosophical foundation. The fork extends the original with multi-user RBAC, a SvelteKit dashboard, Capacitor native apps, an autonomous-apply pipeline, and the present brand identity. Credit to santifer is preserved in the README Acknowledgements section and in the upstream repository link from every issue page.

## What's been published already

For journalists checking precedent:

- This press kit (the document you're reading) lands at v1 with the
  Heron rebrand commit chain. Updates here, in `CHANGELOG.md`.
- The launch announcement (if/when one happens) will reference this
  document and add the launch-specific copy.
- Earlier articles about the pre-fork `career-ops` project remain
  attributed to santifer; Heron-era articles should attribute Heron.

## Versioning this press kit

This document is part of the Heron source tree. Changes ship through
the same Conventional Commits + Release Please pipeline as the code.
A material change here gets `docs(brand): update press kit` in the
commit log. Diffs are visible in the GitHub history.
