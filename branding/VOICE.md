# Voice & tone — Heron

<!-- AUTO-GENERATED:doc-meta -->
*Part of the [Heron](../README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

> The Heron voice in worked examples — UI
> microcopy, marketing copy, error messages, empty states. The six
> high-level voice principles live in [`BRAND.md`](./BRAND.md); this
> document operationalizes them. Read this before writing any
> user-facing string.

## Voice principles

<!-- AUTO-GENERATED:principles-list -->
- **Specific over abstract** — Concrete numbers, named tools, real workflows. Not 'AI-powered' or 'next-generation'.
- **Quiet over loud** — No exclamation marks. No urgency-by-typography. Calm carries weight.
- **Earned over claimed** — Don't say 'easy' — show the four-line quickstart. Don't say 'powerful' — show the feature.
- **Patient over urgent** — Heron is for considered decisions. Manufactured urgency contradicts the brand at every layer.
- **Local-first over cloud-default** — Data on disk. AI bring-your-own-key. No cloud aggregator.
- **Filter over cannon** — The autonomous-apply gate is below 4/5 by default. The brand promise made operational.
<!-- /AUTO-GENERATED:principles-list -->

## Anti-patterns

<!-- AUTO-GENERATED:anti-patterns-list -->
- **Hustle-bro tone** — "Crush your job search! 🚀" → no. "A thinking partner for career transitions." → yes.
- **Empty futurism** — "Welcome to the future of work!" → no. (just describe what the thing does)
- **Decorative emojis** — 🚀 💡 🎯 📈 🔥 — none of these. Punctuation only.
- **Manufactured urgency** — "Get started in seconds!" / "Limited time!" → no. Time is the user's.
- **AI-slop adjectives** — "Powerful AI" / "Next-generation" / "Revolutionary" → no. Specifics or nothing.
- **Wellness coddling** — "You've got this! 💪" → no. The user is an adult.
- **Easy claims** — "It's easy!" → never. Show the four lines, let them judge.
- **Welcoming language** — "Welcome to Heron!" / "Let's get started!" — no. Open with what the page is for.
- **Just-doing** — "Just paste the URL" — no. "Paste the URL." The word 'just' minimizes.
- **We-language** — "We think you'll love it!" → no. The brand is the brand, not the maintainer.
<!-- /AUTO-GENERATED:anti-patterns-list -->

## 20 example phrases — by context

### Empty states

| ✓ Heron | ✗ Not Heron |
|---|---|
| Add a job URL or paste a JD to start evaluating. | You don't have any jobs yet. Let's add your first one! |
| Pipeline clear. Add new opportunities as they come. | Great job! Your pipeline is all clear! 🎉 |
| No interviews scheduled. Heron will surface them as they're confirmed. | Looks like there are no interviews to display yet. |

### Errors

| ✓ Heron | ✗ Not Heron |
|---|---|
| Can't reach the server. Check your connection and try again. | Oh no! Something went wrong 😬 |
| Score must be 0–5. Got: "7.2". | Please enter a valid score. |
| Greenhouse rejected the application. Heron flagged the response — open the job to review. | Application failed. Please try again later. |

### Success / confirmations

| ✓ Heron | ✗ Not Heron |
|---|---|
| Saved. | Great work! Your changes have been saved successfully! |
| Submitted to Stripe. Tracking under Applied. | Boom! You've just applied to Stripe! 🚀 |
| Evaluated. 4.2 / 5 — see the report. | We've finished evaluating this exciting opportunity for you! |

### Onboarding microcopy

| ✓ Heron | ✗ Not Heron |
|---|---|
| Welcome. Let's get your CV in so Heron can start evaluating roles. | Welcome to Heron! 👋 Let's get you set up for success! |
| Paste your CV in markdown, paste a LinkedIn URL, or tell Heron about your experience and it'll draft one. | Don't have a CV yet? No problem! We can help you build one. |
| Heron will look quiet for the first few days. That's the point — it's reading the market for you. | Welcome aboard! Let's get you exploring all the amazing features. |

### Activity feed entries

| ✓ Heron | ✗ Not Heron |
|---|---|
| Acme · Senior Engineer · evaluated, 4.2 / 5 | Great news! We just finished evaluating Acme's Senior Engineer role! |
| Interview confirmed · Anthropic · Tuesday 14:00 PT · technical screen | Awesome — you've got an interview! 💪 |
| Recruiter inbound · Stripe · view in Heron | 🎯 A recruiter is interested in you! |

### Marketing surfaces

| Surface | ✓ Heron |
|---|---|
| Landing-page hero | **Stand still. Strike well.** *Heron is a thinking partner for career transitions. Patient, precise, local-first.* |
| Feature card — Pipeline | Track every opportunity in one place. Your data stays on your machine. |
| Feature card — Interview prep | Generate STAR+R stories from your real work. Practice the answers you'll actually give. |
| Feature card — Autonomous apply | Opt-in. Score-gated. Off by default. Heron defers to you on the moves that matter. |

## 10 things never to say

| # | Anti-pattern | Why |
|---|---|---|
| 1 | "Boom!" / "Crush it" / "Land your dream job" | Hustle-bro lexicon |
| 2 | Exclamation points outside genuine alerts | Reads overcaffeinated |
| 3 | Emojis in product UI strings (except dedicated icon badges) | Wellness-coddling register |
| 4 | "As an AI" / "I'm just an AI" anywhere | AI-slop tell |
| 5 | "Don't worry" / "No problem!" reassurance | Coddling — treats the user as fragile |
| 6 | "Let's …" (pseudo-collaborative) | Coddling — Heron isn't the user's pal |
| 7 | "Just click here" / "Just give it a try" | Minimizes the user's task |
| 8 | "Supercharge / 10x / unlock / elevate / amplify" | VC-pitch tonality |
| 9 | "In just N minutes" / countdown timers / urgency-manufacturing | Heron never pressures |
| 10 | Anthropomorphizing ("I'm thinking…" / "Heron is excited to…") | Coddling + uncanny |

## Micro-rules

### Brand-name capitalization

- Always sentence case in prose: **Heron**, never HERON.
- Never qualified with "the" in subject position:
  *"Heron will surface them"* not *"The Heron will surface them"*.
- Possessives in long prose: *"Heron's evaluation"* — acceptable.
  In microcopy, prefer *"the evaluation"* — reads cleaner.

### Pronoun discipline

- Default second person: **you / your**.
- "We" reserved for the maintainer team in marketing / About /
  changelog contexts ("we're shipping…"). Not for the product itself.
- "I" / "we" referring to the app itself: **forbidden**. The app is
  "Heron" or unmentioned.
- "Your data" — never "the user's data" or "users' data". Direct
  address always.

### Numbers + data

- Spell out one through nine in prose; digits for 10+.
- Scores: `4.2 / 5` (with spaces) in microcopy; `4.2/5` (no spaces) in
  dense lists.
- Money: `$180K–220K` (en-dash, K-shorthand). Never
  `$180,000.00 - $220,000.00` in UI.
- Dates: `Tuesday 14:00 PT` (day + 24-hour + timezone). Never
  `2:00 PM Tuesday`.
- Percentages: `87%` (no space). Deltas: `+12%` / `–3%` (en-dash, not
  hyphen, for negative deltas).

### Punctuation

- Em-dash for asides. Choose with-spaces or without-spaces consistently
  per document.
- Oxford comma: yes.
- Single space after periods.
- Ellipses are real ellipses (`…`), not three periods (`...`).

### Capitalization in UI

- Sentence case for **headings, buttons, menu items, table headers**.
- Title Case forbidden in UI ("Save Application" → "Save application").
- ALL CAPS reserved to caption-size labels with `letter-spacing: 0.05em`,
  per `TYPOGRAPHY.md`.

### When to mention "Heron" vs not

- Mention by name when the user is at a *Heron moment* of evaluation
  or insight (e.g. "Heron's evaluation" in a report header).
- Don't mention when the user is doing their job (button labels, form
  fields, table cells, etc.).
- Never brand-stamp every interaction. The user is the protagonist.

## Worked rewrites — before / after

| Surface | Before (generic SaaS) | After (Heron) |
|---|---|---|
| Login-fail toast | "Login failed. Please try again." | "Wrong email or password." |
| Logout confirmation | "Are you sure you want to log out?" | "Log out of Heron?" *(buttons: Log out / Cancel)* |
| Subscription paywall | "Unlock unlimited evaluations with Heron Pro!" | *Heron is open-source. No subscription. If a hosted tier emerges, this paywall doesn't exist on the OSS side.* |
| Empty pipeline | "No jobs to display." | "Pipeline clear. Add new opportunities as they come." |
| Loading state | "Loading…" | "Reading the JD…" *(JD parse)* / "Evaluating…" *(A–F run)* — specific to what's happening |
| Update available | "🎉 Heron v0.2.0 is now available! Click here to update!" | "Update available: v0.2.0. See the changelog." *(button: Update / Later)* |
| Reset-account confirmation | "Are you sure? This action cannot be undone!" | "Reset Heron to a clean slate? Your data backs up to `.bak/` first. The reset takes about 10 seconds." |
| About page intro | *(generic SaaS pitch)* | The heron stands motionless in shallow water… *(use the BRAND.md origin story verbatim)* |

## Implementation notes (Task 9)

When the rebrand propagates:

1. Sweep `ui/src/lib/components/**` for strings that violate the
   anti-pattern list — emojis in non-icon roles, "Let's", "Just",
   "Boom", exclamation overload. Migrate to the Heron voice.
2. Sweep `modes/*.md` for hustle-bro lexicon that may have crept in.
3. Sweep `messages.ts` / error-message constants for AI-slop tells.
4. Update README intro to match the origin story from `BRAND.md`.
5. Update App Store description to the bio-length tagline + a
   three-paragraph feature summary using these voice principles.

This guide is for *humans* writing copy and for *AI assistants*
generating copy. Both should read this before writing any user-facing
string.
