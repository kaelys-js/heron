# Contributing to Heron

<!-- AUTO-GENERATED:doc-meta -->
*Last revised 2026-05-18 · part of the [Heron](../README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

Thanks for your interest in contributing! Heron is built with Claude Code, and you can use it for development too.

## Before Submitting a PR

**Please open an issue first to discuss the change you'd like to make.** This helps us align on direction before you invest time coding.

PRs without a corresponding issue may be closed if they don't align with the project's architecture or goals.

### What makes a good PR
- Fixes a bug listed in Issues
- Addresses a feature request that was discussed and approved
- Includes a clear description of what changed and why
- Follows the existing code style and project philosophy (simple, minimal, quality over quantity)

## Quick Start

1. Open an issue to discuss your idea
2. Fork the repo
3. Create a branch (`git checkout -b feature/my-feature`)
4. Make your changes
5. Test with a fresh clone (see [docs/SETUP.md](docs/SETUP.md))
6. Commit and push
7. Open a Pull Request referencing the issue

## What to Contribute

**Good first contributions:**
- Add companies to `templates/portals.example.yml`
- Translate modes to other languages
- Improve documentation
- Add example CVs for different roles (in `docs/examples/`)
- Report bugs via [Issues](https://github.com/heron/heron/issues)

**Bigger contributions:**
- New evaluation dimensions or scoring logic
- Dashboard features (in `ui/` — SvelteKit)
- New skill modes (in `modes/`)
- Script improvements (`.mjs` utilities)

## Guidelines

- Keep modes language-agnostic when possible (Claude handles both EN and ES)
- Scripts should handle missing files gracefully (check `existsSync` before `readFileSync`)
- Dashboard changes require `go build` — test with real data before submitting
- Don't commit personal data (cv.md, profile.yml, applications.md, reports/)

## What we do NOT accept

- **PRs that scrape platforms prohibiting automated access** (LinkedIn, etc.). We actively reject these to respect third-party ToS.
- **PRs that enable auto-submitting applications** without human review. Heron is a decision-support tool, not a spam bot.
- **PRs that add external API dependencies** without prior discussion in an issue.
- **PRs containing personal data** (real CVs, emails, phone numbers). Use `docs/examples/` with fictional data instead.

## Development

```bash
# Scripts
pnpm run doctor               # Setup validation
pnpm test                     # Full Vitest matrix (unit + server + component + routes + integration)
pnpm test:coverage            # Coverage report (≥70% TS / ≥60% iOS gates)
pnpm test:ios                 # iOS XCTest + XCUITest (needs Mac + Xcode)
node cv-sync-check.mjs        # Config check

# Dashboard
cd dashboard && go build -o career-dashboard .
./career-dashboard --path ..
```

## Brand and Trademark

Contributions to the codebase are governed by the MIT [LICENSE](../LICENSE).
The "heron" name itself is governed by [TRADEMARK.md](../docs/TRADEMARK.md).
If you fork the project for commercial use, you're welcome to do so
under MIT — please give it your own product name and follow the
trademark policy regarding commercial naming and endorsement claims.

## Getting help

Heron is an open source project maintained in limited time. Here's
how to get help efficiently.

### Where to ask

| Question type | Where |
|---|---|
| **Bug** (something is broken) | [GitHub Issues](https://github.com/heron/heron/issues) — use the Bug Report template |
| **Feature idea** | [GitHub Issues](https://github.com/heron/heron/issues) — use the Feature Request template |
| **How do I…?** | [GitHub Discussions](https://github.com/heron/heron/discussions) or [Discord](https://discord.gg/8pRpHETxa4) |
| **Setup help** | Check [`docs/SETUP.md`](../docs/SETUP.md) first, then ask in [Discord](https://discord.gg/8pRpHETxa4) |
| **Security vulnerability** | Email <hello@heron.app> — see [`SECURITY.md`](SECURITY.md) |

### Before opening an issue

1. Search existing issues — someone may have reported it already.
2. Run `pnpm run doctor` — it catches most setup problems.
3. Include your OS, Node.js version, and the CLI you're using
   (Claude Code, Gemini, Codex, OpenCode, etc.).

### What NOT to use GitHub Issues for

- General questions about job searching
- Requests for personal career advice
- Support for modified forks or unofficial distributions
- Asking the maintainer to review your CV

These will be closed and redirected to the appropriate channel.

### Reference links

- [Architecture docs](../docs/ARCHITECTURE.md)
- [Setup guide](../docs/SETUP.md)
- [Discord community](https://discord.gg/8pRpHETxa4)
