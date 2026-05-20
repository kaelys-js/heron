# Comment style

<!-- AUTO-GENERATED:doc-meta -->
*Part of the [Heron](../README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

Heron is open-source code with thousands of readers. Comments are a
contract: a line stays in the tree only if a human reader would read it.

Two patterns the verifier (`scripts/system/verify-comment-style.mjs`)
blocks:

## 1. Verbose top-of-file headers

Top-of-file `/** ... */` doc-comments are capped at 12 lines including
the opening + closing markers. That fits a "what + why + non-obvious
caveat" docblock without bloat.

LLM-generated headers love to enumerate every consideration that touched
the file. Most of those belong inside the function they describe -- or
not in the source at all (commit message, design doc, issue).

Bad (23 lines, real example from `apply-brand.mjs` history):

```js
/**
 * apply-brand -- propagate branding/brand.json into every config file.
 *
 * branding/brand.json is the single source of truth for:
 *   - App name, displayName, bundle ID, URL scheme, App Group
 *   - Color palette
 *   - Author + repo metadata
 *   - Permission usage descriptions
 *   - iOS extensions' bundle suffixes + deployment minimums
 *
 * This script reads brand.json and overwrites every consumer config
 * (Capacitor configs, electron-builder, Info.plist, entitlements, web
 * manifest, root + electron package.json, ios Appfile, Swift constants).
 *
 * Each consumer is its own function below. Adding a new consumer:
 *   1. Add a function `applyXxx(brand)`
 *   2. Call it from the main `apply()` at the bottom
 *   3. Add a check in ui/src/lib/integration/capacitor.integration.test.ts
 *
 * Safe to re-run -- idempotent. No-ops if the file already matches.
 */
```

Good (3 lines, same information density):

```js
/** Propagates branding/brand.json into every consumer config.
 *  Idempotent. Adding a consumer: write applyXxx(brand), call from
 *  apply(), add a check in capacitor.integration.test.ts. */
```

## 2. AI-slop adjectives in comments

Marketing adjectives leak from LLM training data. They tell the reader
nothing concrete and make the code feel sales-pitched.

Banned in comments (verifier flags + blocks):

- comprehensive
- robust
- elegant
- seamless
- leverage / leverages / leveraging
- powerful
- cutting-edge
- state-of-the-art
- world-class
- next-generation
- delightful
- lightning-fast

If a property genuinely needs one of these words, say what makes it so
concretely. "Robust against connection drops" -> "retries 3x with
exponential backoff on ECONNRESET".

## 3. "Pre-fix" / "Post-fix" historical framing

Comments that explain how the code USED to behave belong in the commit
message, not in the source. The reader of the live tree only needs to
know what the code does now.

Bad:

```js
// Pre-fix: this used to read from process.env.X directly. The new
// version uses the per-user secret store. We kept the env-var fallback
// for legacy users running pre-2026-04 installs.
```

Good:

```js
// Per-user secret store with .env fallback for legacy single-user.
```

If the historical context matters, link to a commit SHA or issue:

```js
// Per-user secret store (was: process.env.X, see #347).
```

## Other patterns the verifier does NOT enforce

- TODO/FIXME -- allowed; reviewer judgment
- Inline-comment length -- soft 80 chars, not gated
- "Why over X" rhetorical sub-headings -- discouraged in code review
  but not a build break

The verifier is conservative on purpose -- the goal is to block the
worst LLM tells (header bloat, marketing adjectives, historical framing)
without false-positive-spamming legitimate human-authored prose.
