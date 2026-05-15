# Career-Ops — Gemini CLI context

> Auto-loaded by Gemini CLI as persistent context — the Gemini equivalent of CLAUDE.md.
> **The canonical brief lives in [AGENTS.md](AGENTS.md).** Read it first; this
> file only covers what's different about running on Gemini CLI.

## Gemini-specific slash commands

Defined in `.gemini/commands/`. Each maps 1:1 to a Claude Code mode:

| Gemini command | Claude Code equivalent | Description |
|---|---|---|
| `/career-ops` | `/career-ops` | Show menu or evaluate JD |
| `/career-ops-pipeline` | `/career-ops pipeline` | Process pending URLs from inbox |
| `/career-ops-evaluate` | `/career-ops oferta` | Evaluate job offer (A-G scoring) |
| `/career-ops-compare` | `/career-ops ofertas` | Compare and rank multiple offers |
| `/career-ops-contact` | `/career-ops contacto` | LinkedIn outreach |
| `/career-ops-deep` | `/career-ops deep` | Deep company research |
| `/career-ops-pdf` | `/career-ops pdf` | Generate ATS-optimized CV |
| `/career-ops-training` | `/career-ops training` | Evaluate course/cert |
| `/career-ops-project` | `/career-ops project` | Evaluate portfolio project |
| `/career-ops-tracker` | `/career-ops tracker` | Application status overview |
| `/career-ops-apply` | `/career-ops apply` | Live application assistant |
| `/career-ops-scan` | `/career-ops scan` | Scan portals for new offers |
| `/career-ops-batch` | `/career-ops batch` | Batch processing |
| `/career-ops-patterns` | `/career-ops patterns` | Analyze rejection patterns |
| `/career-ops-followup` | `/career-ops followup` | Follow-up cadence tracker |

**All commands share the same evaluation logic** in `modes/*.md`. The `modes/`
files are shared between Claude Code, OpenCode, and Gemini CLI — there is no
Gemini-specific fork of any mode.

## Gemini-specific helper

- `gemini-eval.mjs` — standalone Gemini API evaluator that does NOT require the
  Gemini CLI. Useful in CI or as a one-off scoring pass without launching an
  interactive session.

## Everything else

For data contract, update-check protocol, onboarding flow, ethical use, pipeline
integrity rules, and the full mode-routing table — **read [AGENTS.md](AGENTS.md)**.
The rules apply identically across Claude Code, Gemini CLI, OpenCode, Codex, and
every other agent-skill-standard CLI.
