# Mode-Prompt Path Tokens

This file documents the path tokens used inside `modes/*.md`. The orchestrator substitutes every token below into an absolute path BEFORE passing the realized prompt to the AI CLI. Mode files at rest contain the tokens; the AI never sees them.

**Why tokens, not literal paths?** Multi-user installs store user content at `data/users/{userId}/profiles/{slug}/...` (or `data/profiles/{slug}/...` in legacy single-user mode). The actual path depends on who's running the dashboard and which profile is active. Tokens let mode prompts stay user-agnostic + profile-agnostic; the orchestrator resolves them per-spawn against the active profile + user context.

This replaces the older approach (repo-root symlinks like `cv.md` → `data/profiles/.../cv.md`). Symlinks worked for the single-user case but raced in multi-user mode + caused phantom-file confusion on fresh clones. Spawn-time substitution has no global state.

## Token vocabulary

| Token | Substitutes to |
|---|---|
| `__PROFILE__` | absolute path of the active profile dir |
| `__CV__` | absolute path of `<profile>/cv.md` |
| `__PROFILE_MD__` | absolute path of `<profile>/_profile.md` (per-profile customization) |
| `__PORTALS__` | absolute path of `<profile>/portals.yml` |
| `__ARTICLE_DIGEST__` | absolute path of `<profile>/article-digest.md` |
| `__PIPELINE__` | absolute path of `<profile>/pipeline.md` |
| `__APPLICATIONS__` | absolute path of `<profile>/applications.md` |
| `__SCAN_HISTORY__` | absolute path of `<profile>/scan-history.tsv` |
| `__GEMINI_SCORES__` | absolute path of `<profile>/gemini-scores.tsv` |
| `__FOLLOW_UPS__` | absolute path of `<profile>/follow-ups.md` |
| `__PROJECTS_JSON__` | absolute path of `<profile>/projects.json` |
| `__REPORTS__` | absolute path of `<profile>/reports/` (dir) |
| `__OUTPUT__` | absolute path of `<profile>/output/` (dir) |
| `__JDS__` | absolute path of `<profile>/jds/` (dir) |
| `__WRITING_SAMPLES__` | absolute path of `<profile>/writing-samples/` (dir) |
| `__INTERVIEW_PREP__` | absolute path of `<profile>/interview-prep/` (dir) |
| `__STORY_BANK__` | absolute path of `<user-shared>/story-bank.md` -- lives ABOVE the profile tree, shared across this user's profiles, isolated per-user |

## Substitution rules

- **Word-boundary aware.** `__CV__` substitutes whole-token; `__CV___EXTRA` doesn't match.
- **Idempotent.** Running substitution on an already-substituted prompt is a no-op (tokens are gone after first pass).
- **Closed set.** An unknown token like `__FOO__` is left as literal text -- substitution doesn't guess. This means a typo in a mode file shows up loud in the AI's output (literal `__FOO__` in the rendered prompt).
- **System paths NOT substituted.** `modes/_shared.md`, `templates/cv-template.html`, etc. are SYSTEM assets at repo root and stay as relative paths. Substitution only touches the user-content tokens above.

## Authoring rules for new modes

When writing a new `modes/<mode>.md`:

- **DO** reference user files via tokens: `Read __CV__ to extract...`
- **DO** reference user dirs via tokens: `Save the report at __REPORTS__/{number}-{slug}-{date}.md`
- **DON'T** use literal repo-root paths like `cv.md`, `portals.yml`, `jds/`, `reports/`, `output/`, `interview-prep/`, `writing-samples/` -- these only worked under the deprecated symlink scheme.
- **DON'T** invent new tokens without adding them to:
  1. The "Token vocabulary" table above
  2. The `TOKEN_RESOLVERS` map in `ui/src/lib/server/mode-substitution.ts`
  3. The corresponding `KINDS` entry in `lib-profiles.mjs` / `lib_profiles.py` / `profile-paths.ts`

## Verification

The CI integration test `ui/src/lib/integration/mode-substitution.integration.test.ts` runs `substituteModeTokens()` against every `modes/*.md` file and asserts:
- No `__UPPERCASE__` token literals remain after substitution (would indicate a token in the file that isn't in `TOKEN_RESOLVERS`).
- No legacy literal references (`cv.md`, `portals.yml`, etc.) remain -- would indicate a mode file that hasn't been migrated.

Run locally with: `pnpm --filter ui exec vitest run mode-substitution`.
