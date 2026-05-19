# PR-time visual regression + preview deploys

<!-- AUTO-GENERATED:doc-meta -->
*Last revised 2026-05-19 · part of the [Heron](../README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

Two PR-time features are wired but **require maintainer setup with an
external account** to fully activate.

## HP4 — Visual regression (Argos / Lost Pixel)

**Why:** Snapshot every dashboard route on each PR and surface a
sticky comment with side-by-side diffs of any pixel that changed.
Catches CSS regressions that unit tests miss.

### Option A — Argos (recommended for OSS)

[Argos CI](https://argos-ci.com) is free for public repos with unlimited
screenshots. Workflow:

1. Sign up at <https://app.argos-ci.com> with the GitHub account that
   owns the repo. Install the Argos GitHub App on the org.
2. Get the `ARGOS_TOKEN` from the project settings page. Add as a
   repo secret: `gh secret set ARGOS_TOKEN < /path/to/token`.
3. Land the `.github/workflows/visual-regression.yml` workflow (commit
   forthcoming — Argos provides a template).
4. The first PR after activation establishes the baseline. Subsequent
   PRs comment with diffs.

### Option B — Lost Pixel (self-hosted, no account)

[Lost Pixel](https://losspixel.dev) runs entirely on GitHub Actions
runners with no external service:

1. Add a `lostpixel.config.ts` listing the routes to snapshot.
2. The workflow stores baselines in a git branch (`lost-pixel-baselines`).
3. Diff comments are posted via a GitHub Action; baselines update
   when a PR is approved + labeled `accept-snapshots`.

Trade-off: Lost Pixel keeps everything in your repo (good for privacy),
but the baselines branch grows over time + can collide with squash
merges. Argos is the lower-friction path for an OSS project that's
already public.

### Status

**Not yet activated** — pending maintainer choice. The
`bundle-size.yml` workflow is the model: a separate workflow with
its own concurrency group, runs on PR, posts sticky comment via the
action's built-in mechanism.

## HP12 — Preview deploys (Cloudflare Pages / Netlify)

**Why:** Reviewers click a URL on the PR to see the UI change without
checking out + booting locally. Massive reviewer-cost reduction once
contributors arrive.

### Cloudflare Pages (recommended)

1. Connect the repo to a Cloudflare Pages project at <https://dash.cloudflare.com/?to=/:account/pages>.
2. Pages auto-detects `pnpm install && pnpm --filter ui build` + serves
   `ui/build/client/` (static output via `@sveltejs/adapter-static`).
3. For each PR, Pages assigns `https://heron-pr-{N}.pages.dev/`. Posted
   as a sticky comment via the Cloudflare GitHub integration.

**Trade-off:** Pages can serve only static assets. The dashboard's
server endpoints (`/api/**`) won't work in the preview. For UI-only
PRs this is fine; for backend changes the reviewer still needs to
boot locally.

### Status

**Not yet activated** — pending Cloudflare account + GitHub
integration. The Pages flow is zero-config once connected; no
workflow file needed in this repo.

## HP35 — Secret expiry check

**This IS activated.** See `.github/workflows/secret-expiry-check.yml`.
Runs monthly, decodes signing certs from secrets, opens an issue 30
days before expiry. Confidence builder; one-line maintenance.

## When to activate Argos / Cloudflare

Both are "wait until the repo has contributors" features. The cost
(account setup + secret rotation thinking) only pays off once 2+
maintainers are reviewing PRs. Pre-launch, the maintainer's local
`pnpm dev` is sufficient.

Estimated cutover: after the OSS public flip + 5+ active contributors.
