# FAQ

<!-- AUTO-GENERATED:doc-meta -->
*Part of the [Heron](../README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

## How much does this cost to run?

$0/month if you use a Claude Max plan (`AGENT_CLI=claude` routes through `claude -p`). Otherwise: only the AI tokens for evaluations + CV generations, billed by your chosen provider.

Heron is MIT-licensed and free. There is no hosted tier today. The math: Heron saves a week of job-search time per role — that's worth far more than the AI tokens it costs.

## Does this auto-apply to jobs?

Only if you opt in. Autopilot mode is **off by default**, score-gated (≥4.0/5 minimum), capped at a daily limit you set, and gracefully falls back to "manual apply needed" the moment anything looks off. See [`AGENTS.md` § Ethical Use](../AGENTS.md) for the full posture. Heron is a decision-support tool, not a spam bot.

## Does my data leave my machine?

No — except for the AI API calls **you initiate** to your chosen provider (Anthropic / Gemini / OpenAI). Even those carry only the JD + prompt + your CV/profile that the AI needs to answer. No telemetry, no aggregator, no third-party uploads. Your `data/` directory is local-only and gitignored.

## Can I use Claude Max instead of API tokens?

Yes. Set `AGENT_CLI=claude` (the default) and Heron uses `claude -p` for every AI call. Your Max plan covers it. No API key required.

## Do I need a Mac for iOS builds?

Yes — code-signing requires macOS + Xcode. Linux / Windows still work for the web dashboard + Electron desktop + Android. The CI pipeline `native-release.yml` runs the iOS leg on `macos-15`; local iOS dev needs Xcode 16+.

## Why not just use LinkedIn Easy Apply?

Easy Apply maximizes volume. Heron maximizes signal. Easy Apply submits a generic CV to 50 roles; Heron sends a tailored CV to 5 roles that actually fit. See [`docs/COMPARISON.md`](COMPARISON.md).

## What ATSes are supported?

11 directly: Greenhouse, Ashby, Lever, LinkedIn, Indeed, Workday, Recruitee, SmartRecruiters, Workable, Personio, Teamtailor. Custom ATSes via the generic apply-portal stub (~50 LOC per new portal).

## Is this a job board?

No. Heron is a workflow + decision-support layer. It consumes from job boards (LinkedIn / Indeed / The Muse / HN / RemoteOK / WWR / WelcomeToTheJungle) + ATS APIs you're already using. It doesn't host listings.

## Can I run Heron without an AI subscription?

Most evaluations need an AI call (the A–F report, comp research, CV tailoring). The portal scanner is zero-AI — it hits ATS APIs directly. So you can curate the pipeline by hand and only spend AI tokens on the roles you choose to evaluate.

## How do I switch AI providers?

Set `AGENT_CLI=` to the CLI binary on your PATH: `claude`, `gemini`, `codex`, `opencode`, `qwen`, or `copilot`. See [`AGENTS.md` § Switching the AI CLI](../AGENTS.md) for per-CLI caveats.
