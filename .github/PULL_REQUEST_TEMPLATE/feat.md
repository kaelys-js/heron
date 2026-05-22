<!--
  Feature PR template. Use ?template=feat.md in the PR URL to get
  this prompt instead of the kitchen-sink default. Use this for
  user-facing new capability (`feat:` Conventional Commit prefix).

  PR title: `feat(scope): one-line summary`
  Example:  `feat(scan): support Workable adapter`
-->

## Summary

<!-- 1-3 sentences. What new capability is this adding + why? -->

## Related issue

<!-- REQUIRED for features. -->
<!-- Fixes #123 / Closes #123 / Refs #123 -->

## Design notes

<!-- Anything reviewers should understand BEFORE reading the diff:
     - chosen approach + alternatives ruled out
     - cross-cutting touchpoints (which modules / files)
     - dependencies introduced / version bumps
     - if a new public API, what's the contract -->

## Demo

<!-- Screenshots / recordings for UI features. Drag into the PR body. -->
<!-- For CLI / API features, paste sample input + output here in fenced code blocks. -->

## Test plan

- [ ] Vitest unit / integration tests added for the new code path
- [ ] `pnpm check` (svelte-check + tsgo) passes -- 0 errors / 0 warnings
- [ ] `pnpm test` passes (Vitest matrix)
- [ ] `pnpm test:coverage` ≥ 70% lines on the new code (Codecov PR comment)
- [ ] Manual smoke walked: <describe end-to-end happy path>
- [ ] Manual smoke walked: <describe one edge / failure mode>

## Migration notes

<!-- If this changes a config schema / API contract / persisted data shape,
     list the steps existing users / forks need to take. Skip if none. -->

## Checklist

- [ ] PR title follows [Conventional Commits](https://www.conventionalcommits.org/) (`feat(scope): …`)
- [ ] Linked a related issue above
- [ ] No personal data in the diff (real CV / email / names / API keys)
- [ ] Respects the [Data Contract](../../docs/DATA_CONTRACT.md) (no writes to user-layer files)
- [ ] Any new dependency is pinned exactly (no `^` / `~`)
- [ ] If native (iOS / Android / Electron) touched, platform build verified locally

## Notes for reviewers

<!-- Anything else: gotchas, follow-ups, alternatives considered. -->

---
<sub>Questions? [Discussions](../../discussions) or [Discord](https://discord.gg/MyFbztUK5U).</sub>
