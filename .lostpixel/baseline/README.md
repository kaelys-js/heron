# Lost Pixel baselines

Baseline images for visual regression testing. See
`/lostpixel.config.ts` for the route + breakpoint matrix.

## When to update

- **Legitimate UI change** (design refresh, component update): open the
  PR, then add the `accept-snapshots` label. The
  `.github/workflows/visual-regression.yml` workflow regenerates the
  baselines + commits them to your PR branch.
- **Out-of-band cleanup**: never. Always go through a PR.

Files in this directory are checked into git deliberately -- they're
the source of truth for what the UI should look like.
