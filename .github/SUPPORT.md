# Getting help with Heron

This page documents the right channel for each kind of question so
you can get answered quickly + we can keep the issue tracker focused
on bugs + feature work.

## Quick reference

| What you need | Where to go |
|---|---|
| Setup / installation / "it won't start" | [Discord](https://discord.gg/MyFbztUK5U) or [GitHub Discussions Q&A](https://github.com/kaelys-js/heron/discussions/categories/q-a) |
| Customising prompts / archetypes / scoring | [Discussions → Show and Tell](https://github.com/kaelys-js/heron/discussions/categories/show-and-tell) |
| Roadmap + feature proposals | [Discussions → Ideas](https://github.com/kaelys-js/heron/discussions/categories/ideas) |
| **You found a bug** | [Open an issue with the bug template](https://github.com/kaelys-js/heron/issues/new?template=bug_report.yml) |
| **You have a feature request** | [Open an issue with the feature template](https://github.com/kaelys-js/heron/issues/new?template=feature_request.yml) |
| **You got hired using Heron** | [Start a Discussion with the "I got hired" template](https://github.com/kaelys-js/heron/discussions/new?category=show-and-tell&template=i-got-hired.yml) -- shared in the community |
| Security vulnerability | [SECURITY.md](./SECURITY.md) -- private email, NOT a public issue |
| Code of conduct concern | [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) -- private email |
| Help contributing to the codebase | [CONTRIBUTING.md](./CONTRIBUTING.md) |

## "Should this be an issue or a discussion?"

**Open an issue when:**

- Something is broken -- error message, crash, wrong output, silent
  data corruption, unexpected behaviour vs the docs.
- You have a specific actionable feature request (one well-scoped
  feature, not "wouldn't it be cool if…").
- You want to celebrate landing a job -- use the "I got hired"
  template.

**Open a discussion when:**

- You're asking a usage question ("how do I…", "is X supported",
  "should I do Y or Z").
- You want to share a customisation, archetype set, prompt tweak,
  or workflow tip.
- You have a broad idea you want feedback on before opening a
  formal issue.
- You're not sure whether it's a bug. (Open the discussion -- a
  maintainer can convert it into an issue later if needed.)

Discussions get faster eyeballs from the community for usage
questions; issues are read by maintainers triaging bugs + scoping
features. Putting a usage question in the issue tracker means it
sits behind release-blocking bug work + may not get answered
promptly.

## Response-time expectations

This is a small open-source project. Maintainers respond as they
can.

- **Discord** -- typically same-day during EU/US working hours
- **Discussions** -- community-driven; usually within a day or two
- **Issues** -- triaged at least once a week; bug fixes prioritised
  by severity
- **Security reports** -- under 48 hours for first response (see
  SECURITY.md)

If your issue has gone a week without any response, feel free to
@mention a maintainer politely in a follow-up comment.

## Before opening an issue

- Search existing issues + discussions first -- your question may
  already have an answer.
- Update to the latest version: `pnpm update:check` (the
  preflight in every issue template asks for this).
- For installation/setup bugs, attach the output of `pnpm doctor`
  and `mise current` so we can see your toolchain state.
- For data-corruption bugs, attach a redacted excerpt of the
  relevant `data/applications.md` row -- never paste anything that
  identifies a real recruiter or company unless you're comfortable
  doing so.

## Contributing back

If you fix something for yourself, please consider opening a PR
even if it's a one-line tweak -- small contributions are very
welcome and don't need elaborate justification. See
[CONTRIBUTING.md](./CONTRIBUTING.md) for the contributor ladder
(Participant → Contributor → Triager → Reviewer → Maintainer).
