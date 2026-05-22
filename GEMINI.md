# Gemini CLI context -- Heron

<!-- AUTO-GENERATED:doc-meta -->
*Part of the [Heron](README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

> Auto-loaded by Gemini CLI as persistent context. The canonical
> briefs live in [AGENTS.md](AGENTS.md) (engineering rules + Heron
> orientation) and [AGENTS-PRODUCT.md](AGENTS-PRODUCT.md) (product-
> mode domain context) and are shared by every supported AI CLI
> (Claude Code, Gemini, Codex, OpenCode, Qwen, Copilot).

## How Heron runs on Gemini

The mode prompts in [`modes/*.md`](modes/) are CLI-agnostic plain
markdown that any agent-skill-standard CLI loads as a system prompt.
The dashboard's spawn flow reads `AGENT_CLI=gemini` from the
environment and invokes `gemini -p "<prompt>"` for headless runs:

```sh
AGENT_CLI=gemini pnpm dev
```

## Gemini-specific helper

[`scripts/system/gemini-eval.mjs`](scripts/system/gemini-eval.mjs) is
a standalone Gemini-API evaluator that doesn't need the Gemini CLI
installed. Useful in CI or for one-off scoring passes without
launching an interactive session.

## Everything else

Engineering rules (the 12 + tooling stack + release flow) live in
[AGENTS.md](AGENTS.md). Product-mode rules (data contract, update-
check protocol, onboarding flow, ethical use, pipeline integrity,
mode routing, canonical states) live in [AGENTS-PRODUCT.md](AGENTS-PRODUCT.md).
Both apply identically across every supported AI CLI; there is no
Gemini-specific fork of any mode prompt.
