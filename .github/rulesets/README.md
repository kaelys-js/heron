# Branch protection rulesets

GitHub rulesets live in the web UI by default, which means they're invisible
to source control + lost if the org is restored from backup. We mirror them
here as JSON so PR reviewers can see proposed protection changes alongside
the workflow files they gate.

## Status

**Active.** The JSON is committed AND the ruleset is applied to the
repo. `gh api repos/kaelys-js/heron/rulesets` returns the live state;
the daily `verify-gh-config` workflow asserts the JSON in this folder
matches what's live.

Bypass actors: the `Repository admin` role is configured as a bypass
actor (mode `always`) to allow `gh pr merge --admin` overrides. Tracked
in `verify-gh-config` so any drift is caught the next morning.

Two paths to changes:

1. **Flip the repo public** (planned for the OSS launch milestone).
   Rulesets become free, then run the apply command below.
2. **Upgrade to GitHub Pro** ($4/mo per user) if the repo needs to stay
   private during the pre-launch window.

Until the ruleset is active, branch protection falls back to the legacy
"Branch protection rules" UI (Settings → Branches). The defaults from
GitHub's "Limit pushes" toggle cover the basics (no force-push to main,
no deletion) but DO NOT enforce signed commits, conventional-commit
messages, or required status checks.

## Applying

A maintainer applies these to a fresh clone of the repo with `gh`:

```sh
# Upload (create or update by `name`)
gh api \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  /repos/{OWNER}/{REPO}/rulesets \
  --input .github/rulesets/main.json

# Verify
gh api /repos/{OWNER}/{REPO}/rulesets | jq '.[] | {name, enforcement, conditions}'
```

The web-UI dashboard at Settings → Rules shows the result; the JSON is the
source of truth.

## Why ruleset (not classic branch protection)

- Rulesets are repo-OR-org-scoped; classic branch protection is per-rule.
  Moving the heron repo to a different owner (or restoring from backup)
  preserves the ruleset without manual reconfiguration.
- Rulesets support commit-message regex patterns natively (we enforce
  Conventional Commits without an extra workflow).
- Rulesets surface "would-fail" warnings in the UI without enforcing,
  useful for trialing new required checks.

## Currently configured

`main.json`:

- Branch deletion + force-push blocked
- Signed commits required
- Pull-request review (1 approver, CODEOWNERS required, stale reviews dismissed)
- Required CI checks: ts, ios, format, CodeQL × 2, Dependency Review, Scorecard, zizmor
- Conventional Commit message pattern enforced
- No bypass actors (admins still subject to the rules)

## Out of scope

- `tag` rulesets (we use semver tags from release-please; no integrity
  policy needed beyond signing)
- Per-folder protection (CODEOWNERS handles that)
