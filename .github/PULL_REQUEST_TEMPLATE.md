<!--
  PR title — write a Conventional Commit subject (feat:, fix:, chore:, etc.)
  Examples:
    feat(scan): support Workable adapter
    fix(auth): reject same-site=none in CapacitorWebView
    chore(deps): bump electron 39 → 39.8.10
-->

## Summary

<!-- 1-3 sentences. What changed and why. Skip the "how" — the diff shows that. -->

## Related issue

<!-- Required for features + architecture changes. Bug fixes can skip if obvious. -->
<!-- Fixes #123 / Closes #123 / Refs #123 -->

## Type of change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation / translation
- [ ] Refactor (no functional change)
- [ ] Performance
- [ ] Security
- [ ] CI / build
- [ ] Dependency bump

## Screenshots / recordings

<!-- For UI changes. Drag-drop into the PR body — GitHub uploads to its CDN. -->

## Test plan

<!-- Bulleted checklist of how YOU verified this works. Reviewers run the same. -->
- [ ] `pnpm install` clean
- [ ] `pnpm check` (svelte-check + tsgo) passes — 0 errors / 0 warnings
- [ ] `pnpm build` succeeds
- [ ] `pnpm test` passes (Vitest matrix — unit + server + component + routes + integration)
- [ ] `pnpm test:coverage` ≥ 70% lines / 65% branches (TS) — see Codecov PR comment
- [ ] `pnpm test:ios` passes (if iOS native code touched; CI macos-15 runner)
- [ ] Manual smoke: <describe your manual test path>

## Checklist

- [ ] I have read [CONTRIBUTING.md](CONTRIBUTING.md)
- [ ] I linked a related issue above (required for features + arch changes)
- [ ] My PR title follows [Conventional Commits](https://www.conventionalcommits.org/)
- [ ] My PR does not include personal data (real CV / email / names / API keys)
- [ ] My changes respect the [Data Contract](../DATA_CONTRACT.md) (no modifications to user-layer files)
- [ ] If I added a dependency, it's pinned exactly (no `^` / `~`)
- [ ] If I touched native (iOS / Android / Electron), I ran the platform build locally

## Notes for reviewers

<!-- Anything reviewers should know before reading the diff: gotchas, follow-ups, alternatives considered. -->

---
<sub>Questions? [Open a Discussion](../../discussions) or [join Discord](https://discord.gg/8pRpHETxa4).</sub>
