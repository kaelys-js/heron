# Security Policy

<!-- AUTO-GENERATED:doc-meta -->
*Last revised 2026-05-18 · part of the [Heron](../README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

## Reporting a Vulnerability

**Do NOT open a public issue for security vulnerabilities.**

Use one of:

1. **Preferred — GitHub Private Vulnerability Reporting:**
   [github.com/heron/heron/security/advisories/new](https://github.com/heron/heron/security/advisories/new)
   Encrypted in transit, reviewed by the maintainer only, and gives you a private
   advisory you can collaborate on without leaking details.

2. **Email** — **<hello@resist.js>** with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)
   PGP key available on request.

You will receive an initial response within **72 hours**. We will work
with you to understand and address the issue before any public disclosure.

## Scope

Security issues in the following are in scope:

- **Scripts** (`*.mjs`, `*.py`) — command injection, path traversal, SSRF
- **Dashboard** (`ui/`) — SvelteKit + Better Auth (XSS, CSRF, auth bypass,
  session fixation, open redirect, IDOR, multi-user data leakage)
- **Native** (`ui/ios/`, `ui/electron/`, `ui/android/`) — privilege
  escalation, deep-link hijacking, IPC abuse, code-signing bypass
- **Templates** (`templates/`) — XSS in generated HTML/PDF
- **Configuration** — secrets exposure, unsafe defaults

## Out of Scope

- Issues in third-party dependencies (report upstream; we'll update as
  patches land via Dependabot)
- Issues requiring physical access to the user's machine
- Social engineering attacks
- Heron is a **local** tool — there is no hosted service to attack
- Self-XSS / clickjacking on locally-running dev servers

## Disclosure Policy

We follow **coordinated disclosure**:

1. You report privately (channels above).
2. We acknowledge within 72 hours and triage within 7 days.
3. We work with you on a fix and a CVE (if eligible).
4. We publish the advisory + a patched release **on the same day**.
5. We credit you in the release notes and the GHSA advisory (or keep
   you anonymous if you prefer).

We aim for fixes within **30 days** for critical/high severity, **90 days**
for medium/low. If we miss those windows, you're free to publicly disclose
unilaterally — that's the deal.

## Supply chain

- **Dependabot** monitors npm / RubyGems / Swift Packages / GitHub Actions
  / Go modules weekly. Security-only updates are auto-approved on green CI.
- **CodeQL** runs on every PR and weekly on `main`.
- **SBOM** (Software Bill of Materials) is generated on every release via
  `anchore/sbom-action` and attached to the GitHub Release.
- **Branch protection** on `main` requires CI green + 1 reviewer + signed
  commits before merge.
