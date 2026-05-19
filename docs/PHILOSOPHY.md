# Philosophy

<!-- AUTO-GENERATED:doc-meta -->
*Part of the [Heron](../README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

## Local-first

Your CV, application history, scoring data, recruiter emails, interview prep — all of it stays on your disk. No cloud aggregator. The AI runs locally or against an API key you own; the data never leaves your machine.

If a hosted tier emerges in the future, the open-source local-first version stays maintained and supported. That's the whole posture.

## Quality over volume

The Heron stands motionless in shallow water. It waits. It watches. It evaluates every passing form. Then, when the moment is exactly right, it strikes — once, precisely, and the work is done.

Spray-and-pray job applications waste two finite resources: recruiters' attention and your own. Heron is built around the opposite stance: fewer, better applications. Score-gated automation. Tailored CVs. Real interview prep. The math is simple — saving a week of job-search time per role pays for the AI tokens many times over.

## Why these choices matter

- **Local-first** means your career data is yours. You can audit it, delete it, fork it, walk away with it. Hosted tools own the lock-in.
- **Open source** means the scoring isn't a black box. Read `modes/*.md`, read `lib/server/*.ts`, change anything you want.
- **AI-agnostic** (`AGENT_CLI=`) means you're not pinned to one vendor. Switch CLIs the day a better model lands.
- **Score-gated automation** means Heron refuses to apply to roles below your threshold. The default is 4.0/5 — high enough that a "yes" means something.
- **Multi-profile** means parallel career tracks don't bleed into each other. Engineer + instructor + product runs on the same install with isolated CVs, portals, and pipelines.

## What Heron is not

- Not a job board (it consumes them).
- Not an auto-apply bot (autonomous mode is opt-in, score-gated, daily-capped, and explicitly refuses any role flagged as a content farm or scraper-prohibited target).
- Not a SaaS pretending to be open source — there is no hosted tier today, and the local-first version stays first-class if one ever ships.
- Not a substitute for thinking — it's a decision-support tool. The "apply" button is still yours to press.

## Further reading

- The [`santifer/career-ops`](https://github.com/santifer/career-ops) original — the upstream CLI Heron forks from.
- The [`santifer/career-ops` case study](https://santifer.io/career-ops-system) on using the system to evaluate 740+ offers.
- [`AGENTS.md` § Ethical Use](../AGENTS.md) for the autonomous-apply posture.
- [`docs/COMPARISON.md`](COMPARISON.md) for how Heron differs from JobScan / Teal / AIHawk and similar.
