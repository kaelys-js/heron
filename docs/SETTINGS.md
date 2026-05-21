# Repo settings runbook

<!-- AUTO-GENERATED:doc-meta -->
*Part of the [Heron](../README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

Every GitHub repo setting that isn't already encoded in
`.github/rulesets/`, `.github/workflows/`, or `branding/brand.json`,
listed here with current state + recommended state + how to apply.

## Quick application

Most of this is automated:

```sh
# Branch protection rulesets + repo topics + GHAS toggles
pnpm gh:apply

# Environments + standard labels + secret-scanning validity checks
pnpm gh:apply-features

# Both in dry-run / verify mode
pnpm gh:verify && pnpm gh:verify-features
```

The rest needs UI clicks (App installs, social-preview image upload, Sponsors onboarding). Each is documented below with the URL + the exact steps.

---

## Automated by `pnpm gh:apply-features`

| Setting | Value | Why |
|---|---|---|
| Environment `production-ios` | required reviewer = kaelys-js, custom branch policy | Move APP_STORE_CONNECT_*, NOTARIZATION_*, signing certs out of repo-scope secrets |
| Environment `production-electron` | required reviewer = kaelys-js, custom branch policy | Same for electron-builder publish secrets |
| Environment `npm-publish` | protected branches only | If we ever publish `@heron/sdk` |
| Environment `github-pages` | protected branches only | For Pages-built docs site |
| Standard labels | 16 labels (good first issue, oversize-ok, no-issue, breaking-change, ...) | Consistent triage vocabulary |
| `secret_scanning_validity_checks` | enabled | Free on public repos; calls vendor APIs to confirm a leaked token is still live (huge signal-to-noise win) |

---

## Manual settings (UI clicks)

### 1. Social preview image

Repo Settings → General → Social preview → "Upload an image".

- Size: 1280 × 640 px
- Format: PNG (JPG ok too)
- Source: derive from `branding/logo.svg` + tagline
- Why: shows on every external link share (Twitter / Discord / etc.)

Recommended content: Heron mascot from `branding/MASCOT.md` + tagline ("Job-search automation for AI coding CLIs").

### 2. Actions → "Require actions to be pinned to a full-length commit SHA"

Repo Settings → Actions → General → "Workflow permissions" → check "Require actions to be pinned to a full-length commit SHA".

This is defense-in-depth alongside our existing `.github/workflows/verify-workflow-pins.yml` gate. The toggle stops a bad-tag pin from being committed in the first place.

### 3. Actions log + artifact retention

Repo Settings → Actions → General → "Artifact and log retention" → 30 days.

Default is 90. We don't need 90.

### 4. GitHub Sponsors onboarding

Visit <https://github.com/sponsors/kaelys-js> and complete the signup form. The `FUNDING.yml` we already have stays dead until verification finishes; once verified, the Sponsor button appears on every repo + profile.

### 5. Install Harden-Runner GitHub App

Visit <https://github.com/marketplace/stepsecurity-harden-runner>, click Install.

- Adds runtime egress filtering to Actions runs (defense-in-depth alongside the in-workflow `step-security/harden-runner@v2.19.3` step we already use)
- Free for OSS
- After install: appears under Repo Settings → Integrations → GitHub Apps

### 6. Discord webhook for `release` + `discussion` events

Repo Settings → Webhooks → Add webhook.

- URL: get from Discord channel → Integrations → Webhooks → New webhook → Copy URL. Append `/github` to the URL.
- Content type: `application/json`
- Events: select individual events → check `Releases` + `Discussions`
- Secret: optional (Discord ignores it)

### 7. Pin Roadmap 2026 issue + Introduce yourself / Start here discussions

Once an issue / discussion exists with the right title:

- Issues: open the issue → Pin issue (top-right dropdown)
- Discussions: open the discussion → Pin discussion (top-right dropdown)

### 8. Custom Properties

Not available on personal-account repos. Once a repo lives under an organization, the built-in `deployable` / `deployed` custom properties auto-populate once environments + deployments exist (we have the environments in `gh:apply-features`).

### 9. Profile-level: `kaelys-js/kaelys-js` profile README

Create the special-purpose repo `kaelys-js/kaelys-js` with a single `README.md` that GitHub renders on the user profile page. Recommended: link Heron + pinned repos + status + sponsorship link.

### 10. Profile Achievements

Settings → Achievements → Profile achievements → opt in to: Pull Shark, YOLO, Galaxy Brain (if not already).

### 11. Project v2 "Heron Roadmap"

User-scope project, not repo-scope.

- Visit <https://github.com/users/kaelys-js/projects>
- New project → Roadmap template
- Add fields: Status, Priority, Area, Target (date)
- Workflow: auto-add issues + PRs with label `triaged`
- Surface from README via the Projects sidebar

### 12. Saved replies (PR triage)

Settings → Saved replies → New saved reply. Recommended:

| Title | Body |
|---|---|
| Thanks for the PR | Thanks for the contribution! CI is running -- I'll review once it's green. |
| Please add a test | Could you add a regression test for this? See `docs/TESTING.md` for the convention. |
| Reproduction needed | Could you share the exact command + a small repro? I want to make sure the fix targets the right behaviour. |
| Help wanted | This looks like a good candidate for `help wanted`. If you'd like to take it, please comment + I'll assign. |
| Closing as duplicate | Closing as a duplicate of #N. Continuing the conversation there. |

### 13. GitHub Pages (docs site)

The `.github/workflows/pages.yml` workflow ships docs to Pages on every push to main. After this workflow lands, enable Pages once via:

- Settings → Pages → Source → "GitHub Actions"

After that flip, the workflow auto-publishes on every push touching `docs/**` or `README.md`. The `pnpm gh:apply-features` script can also enable it programmatically.

- Custom domain optional (currently the app uses `heron.app` for the product, so a separate Pages domain isn't urgent)

---

## Verified by `verify-gh-config.yml` daily cron

These run automatically every day at 06:13 UTC and open an issue if they drift:

- `branding/brand.json` -> repo description / homepage / topics
- `.github/rulesets/main.json` -> live branch ruleset
- `.github/rulesets/tags.json` -> live tag ruleset
- Code-security toggles (secret scanning, dependency graph, dependabot)
- Private vulnerability reporting

If the daily check fails, run `pnpm gh:apply` to reconcile.

---

## Acceptance checklist

After running this runbook end-to-end, verify:

- [ ] `pnpm gh:verify` -- exits 0 (no drift on branding / rulesets / topics / GHAS)
- [ ] `pnpm gh:verify-features` -- exits 0 (no drift on environments / labels / secret-scanning validity)
- [ ] Repo Settings → General → Social preview shows an image
- [ ] Repo Settings → Actions → "Require SHA-pinning" is ON
- [ ] Repo Settings → Actions → "Retention" is 30 days
- [ ] github.com/sponsors/kaelys-js shows a verified profile
- [ ] Settings → Integrations shows Harden-Runner installed
- [ ] Settings → Webhooks shows a Discord webhook (release + discussion events)
- [ ] `gh api /repos/kaelys-js/heron/issues | jq '[.[] | select(.pinned)]'` shows the Roadmap issue
- [ ] Discussions UI shows pinned "Introduce yourself" + "Start here"
- [ ] github.com/users/kaelys-js/projects shows "Heron Roadmap"
- [ ] Settings → Saved replies lists at least 5 entries
- [ ] github.com/kaelys-js (user profile) shows a README + Heron pinned
