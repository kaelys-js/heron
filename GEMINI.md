# Heron — Gemini CLI context

> Auto-loaded by Gemini CLI as persistent context — the Gemini equivalent of CLAUDE.md.
> **The canonical brief lives in [AGENTS.md](AGENTS.md).** Read it first; this
> file only covers what's different about running on Gemini CLI.

## Gemini-specific slash commands

Defined in `.gemini/commands/`. Each maps 1:1 to a Claude Code mode:

| Gemini command | Claude Code equivalent | Description |
|---|---|---|
| `/heron` | `/heron` | Show menu or evaluate JD |
| `/heron-pipeline` | `/heron pipeline` | Process pending URLs from inbox |
| `/heron-evaluate` | `/heron oferta` | Evaluate job offer (A-G scoring) |
| `/heron-compare` | `/heron ofertas` | Compare and rank multiple offers |
| `/heron-contact` | `/heron contacto` | LinkedIn outreach |
| `/heron-deep` | `/heron deep` | Deep company research |
| `/heron-pdf` | `/heron pdf` | Generate ATS-optimized CV |
| `/heron-training` | `/heron training` | Evaluate course/cert |
| `/heron-project` | `/heron project` | Evaluate portfolio project |
| `/heron-tracker` | `/heron tracker` | Application status overview |
| `/heron-apply` | `/heron apply` | Live application assistant |
| `/heron-scan` | `/heron scan` | Scan portals for new offers |
| `/heron-batch` | `/heron batch` | Batch processing |
| `/heron-patterns` | `/heron patterns` | Analyze rejection patterns |
| `/heron-followup` | `/heron followup` | Follow-up cadence tracker |

**All commands share the same evaluation logic** in `modes/*.md`. The `modes/`
files are shared between Claude Code, OpenCode, and Gemini CLI — there is no
Gemini-specific fork of any mode.

## Gemini-specific helper

- `scripts/system/gemini-eval.mjs` — standalone Gemini API evaluator that does NOT require the
  Gemini CLI. Useful in CI or as a one-off scoring pass without launching an
  interactive session.

## Everything else

For data contract, update-check protocol, onboarding flow, ethical use, pipeline
integrity rules, and the full mode-routing table — **read [AGENTS.md](AGENTS.md)**.
The rules apply identically across Claude Code, Gemini CLI, OpenCode, Codex, and
every other agent-skill-standard CLI.
