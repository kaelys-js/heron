# Security Policy

<!-- AUTO-GENERATED:doc-meta -->
*Part of the [Heron](../README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

## Reporting a Vulnerability

**Do NOT open a public issue for security vulnerabilities.**

Use one of:

1. **Preferred -- GitHub Private Vulnerability Reporting:**
   [github.com/kaelys-js/heron/security/advisories/new](https://github.com/kaelys-js/heron/security/advisories/new)
   Encrypted in transit, reviewed by the maintainer only, and gives you a private
   advisory you can collaborate on without leaking details.

2. **Email** -- **<hello@resist.js>** with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)
   PGP key available on request.

You will receive an initial response within **72 hours**. We will work
with you to understand and address the issue before any public disclosure.

## Scope

Security issues in the following are in scope:

- **Scripts** (`*.mjs`, `*.py`) -- command injection, path traversal, SSRF
- **Dashboard** (`ui/`) -- SvelteKit + Better Auth (XSS, CSRF, auth bypass,
  session fixation, open redirect, IDOR, multi-user data leakage)
- **Native** (`ui/ios/`, `ui/electron/`, `ui/android/`) -- privilege
  escalation, deep-link hijacking, IPC abuse, code-signing bypass
- **Templates** (`templates/`) -- XSS in generated HTML/PDF
- **Configuration** -- secrets exposure, unsafe defaults

## Out of Scope

- Issues in third-party dependencies (report upstream; we'll update as
  patches land via Dependabot)
- Issues requiring physical access to the user's machine
- Social engineering attacks
- Heron is a **local** tool -- there is no hosted service to attack
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
unilaterally -- that's the deal.

## Supply chain

- **Renovate** monitors npm / RubyGems / Swift Packages / GitHub Actions
  / Go modules weekly. Patch + minor dev-deps auto-merge on green CI.
  Major bumps require dashboard approval.
- **CodeQL** runs on every PR and weekly on `main` covering
  javascript-typescript, python, and swift.
- **OSSF Scorecard** publishes a public posture score weekly.
- **zizmor** static-analyses workflows for injection / cache-poisoning /
  excessive-permission issues.
- **SBOM** (Software Bill of Materials) generated on every release via
  `anchore/sbom-action` and attached to the GitHub Release.
- **SLSA Level 2 build provenance** is attested for every release
  artifact (DMG / exe / AppImage / IPA). Users verify with:
  ```sh
  gh attestation verify <file> --owner heron
  ```
- **TruffleHog** runs on every PR + weekly to catch verified credential
  patterns (130+ detectors).
- **Lockfile-lint** enforces pnpm-lock uses only `https://npmjs.org`
  sources with integrity hashes.
- **License compliance** scan blocks GPL/AGPL/LGPL transitives in prod
  deps (Heron ships under MIT + bundles Electron).
- **All GitHub Actions are SHA-pinned**, not tag-pinned. Renovate keeps
  the pins current via weekly digest-update PRs.
- **StepSecurity harden-runner** enforces egress-policy on every
  privileged runner (release, signing, secrets).
- **Branch protection** on `main` (per `.github/rulesets/main.json`) requires:
    - CI green across 11 required status checks (Tests, CodeQL × 3 languages,
      Dependency Review, Scorecard, zizmor, PR-title-Conventional-Commits)
    - 1 reviewer + CODEOWNERS approval
    - Signed commits
    - Conventional Commits message pattern
    - No force-push to main
    - No bypass actors (admins included)

## GitHub Advanced Security settings

The following toggles are **active** as of 2026-05-19 (free for public
repositories, verified via `gh api repos/kaelys-js/heron`):

- [x] **Secret scanning** -- surfaces committed credentials in the
      Security tab
- [x] **Push protection** -- REJECTS pushes containing detected
      secrets at git-receive time, before they ever land on the
      remote. Complements the lefthook `no-secrets` regex
      (pre-commit) and the TruffleHog workflow (server-side).
- [x] **Dependabot security updates** -- auto-PRs for known
      vulnerabilities
- [x] **Private vulnerability reporting** -- enables the GHSA flow
      documented above
- [x] **Web commit signoff required** -- UI commits get the DCO
      trailer

Two toggles need a paid GHAS plan and are NOT enabled (acceptable for
free-tier OSS):

- [ ] `secret_scanning_validity_checks` -- confirms detected secrets
      are still live against the issuing service
- [ ] `secret_scanning_non_provider_patterns` -- non-vendor regex
      patterns (custom keys, JWT secrets, etc.)

A drift-detection workflow (`secret-expiry-check.yml`) already runs
monthly for signing-cert expiry. Extend later to verify these
GHAS toggles stay on.
