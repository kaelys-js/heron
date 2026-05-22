<!--
  Breaking-change PR template. Use ?template=breaking.md in the PR URL.
  Use this for any user-visible breaking change.

  PR title MUST use either form:
    feat(scope)!: one-line summary
    fix(scope)!: one-line summary
  The `!` is what makes Release Please cut a MAJOR version bump.
  Without it, the breaking change ships as a minor / patch and users
  won't notice until something breaks for them at runtime.

  Example:  `feat(brand)!: rename career-ops -> Heron`
-->

## Summary

<!-- 1-3 sentences. WHAT changed in a way that breaks user-visible
     contract. -->

## Related issue

<!-- REQUIRED for breaking changes. -->
<!-- Fixes #123 / Closes #123 / Refs #123 -->

## Why this is breaking

<!-- Be explicit about what existing usage breaks:
     - Config keys renamed / removed
     - API endpoint contract changed
     - Persisted data shape changed
     - File path / structure changed
     - Default behaviour reversed
     - Removed CLI flag / subcommand
     - Bundle ID / URL scheme / Brand identifiers changed
     Tag every affected surface. -->

## Migration guide

<!-- Step-by-step for downstream users / forks. This becomes part of
     the CHANGELOG entry on the release that ships this commit. Be
     specific enough that someone with no prior context can follow it.

     Example:
     1. Update `config/profile.yml`: rename key `apply_threshold` to
        `automation.min_score_to_apply`.
     2. Run the migration script (e.g. `node scripts/system/migrate-<X>.mjs`)
        once to apply the schema change to existing per-user data.
     3. Re-run `pnpm build` -- the new build expects the migrated
        config layout. -->

## Backwards-compatibility window

<!-- Will the old usage still work for one or more releases (deprecated
     warning path) or does it break in this release? Some breaking
     changes ship behind a feature flag + deprecation warning for
     1-2 releases before flipping the default; document the plan. -->

- [ ] Hard break (this release)
- [ ] Soft break (deprecated; removed in vN+1)
- [ ] Flag-gated (new behaviour opt-in via env / config until vN+1)

## Demo

<!-- Screenshots / recordings of the new behaviour. For CLI / API
     breaking changes, paste before / after fenced code blocks. -->

## Test plan

- [ ] All affected tests updated (paths / config schemas / fixtures)
- [ ] `pnpm check` (svelte-check + tsgo) passes -- 0 errors / 0 warnings
- [ ] `pnpm test` passes (Vitest matrix)
- [ ] `pnpm build` succeeds
- [ ] Migration steps tested on a fresh clone

## Checklist

- [ ] PR title includes `!` (`feat!:` / `fix!:` / `feat(scope)!:`) so Release Please cuts a MAJOR bump
- [ ] Commit body includes `BREAKING CHANGE: <description>` footer (Release Please reads either signal)
- [ ] Linked a related issue above
- [ ] Migration guide above is complete (someone with no context can follow it)
- [ ] Updated CHANGELOG.md or relied on Release Please to populate from the BREAKING CHANGE footer
- [ ] No personal data in the diff
- [ ] Respects the [Data Contract](../docs/DATA_CONTRACT.md)

## Notes for reviewers

<!-- Anything reviewers should pay extra attention to. Breaking changes
     warrant slower, more careful reviews. -->

---
<sub>Questions? [Discussions](../../discussions) or [Discord](https://discord.gg/MyFbztUK5U).</sub>
