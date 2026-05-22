<!--
  Bug-fix PR template. Use ?template=fix.md in the PR URL.
  Use this for bug fixes (`fix:` Conventional Commit prefix).

  PR title: `fix(scope): one-line summary`
  Example:  `fix(auth): reject same-site=none in CapacitorWebView`
-->

## Summary

<!-- 1-3 sentences. What bug is this fixing + the user impact. -->

## Related issue

<!-- Optional for obvious bugs; required if the fix has user-visible behaviour change.
     Fixes #123 / Closes #123 / Refs #123 -->

## Root cause

<!-- Why was this broken? One paragraph. Helps reviewers understand the
     fix shape + helps future-you find this when the bug regresses. -->

## The fix

<!-- What did you change + why this approach? If you considered an
     alternative + ruled it out, name it (saves a reviewer roundtrip). -->

## Regression test

<!-- Did you add a test that fails BEFORE the fix and passes AFTER?
     If no, justify (e.g. timing-sensitive race, hardware-specific). -->

- [ ] Added regression test
- [ ] Manual repro confirmed the fix (pre-fix branch → bug visible; post-fix → bug gone)

## Test plan

- [ ] `pnpm check` (svelte-check + tsgo) passes -- 0 errors / 0 warnings
- [ ] `pnpm test` passes (Vitest matrix)
- [ ] Manual smoke walked: <minimal repro path you tested>

## Checklist

- [ ] PR title follows [Conventional Commits](https://www.conventionalcommits.org/) (`fix(scope): …`)
- [ ] Linked a related issue above (or justified the skip)
- [ ] No personal data in the diff
- [ ] Respects the [Data Contract](../../docs/DATA_CONTRACT.md)

## Notes for reviewers

<!-- Surprises in the diff, follow-ups, related bugs you noticed but
     didn't touch. -->

---
<sub>Questions? [Discussions](../../discussions) or [Discord](https://discord.gg/MyFbztUK5U).</sub>
