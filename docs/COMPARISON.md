# Comparable tools

<!-- AUTO-GENERATED:doc-meta -->
*Part of the [Heron](../README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

How Heron differs from adjacent tools in the job-search tooling space.

| Tool | Type | What Heron is different about |
|---|---|---|
| **JobScan** | Hosted SaaS | Resume keyword matching only. Heron does role evaluation, comp research, interview prep, and is local-first. |
| **Teal** | Hosted SaaS | Pipeline tracking on their servers. Heron tracks on your disk. |
| **ResumeWorded** | Hosted SaaS | Generic resume score. Heron tailors per-role with a personalization plan (Block E of the evaluation). |
| **Otta / WelcomeToTheJungle** | Job board | Discovery, not workflow. Heron consumes their RSS / scrapes once you're past discovery. |
| **AIHawk / Apply.ninja / LazyApply** | Auto-submit bots | Volume over quality. Heron explicitly refuses this category — see [`.github/CONTRIBUTING.md` § "What we do NOT accept"](../.github/CONTRIBUTING.md). |
| **`santifer/career-ops` (upstream)** | OSS CLI | Original. Heron adds multi-user, native apps, dashboard, autonomous-apply, Watch. See README § Acknowledgements. |

## Stance summary

Heron sits in a deliberately narrow slice of the job-search-tooling space:

- **Local-first**, against every hosted aggregator (JobScan, Teal, ResumeWorded).
- **Workflow + decision-support**, against discovery-only job boards (Otta, WWR).
- **Quality + score-gated**, against volume-maximizing auto-submit bots (AIHawk and similar).
- **Dashboard + native + multi-user**, against the upstream CLI-only `santifer/career-ops`.

If you want bulk-apply, this is the wrong project. If you want a thinking partner that respects recruiters' time and protects your data, you're in the right place.
