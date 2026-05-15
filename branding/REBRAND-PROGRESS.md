# Rebrand progress — survives conversation compaction

> **Purpose.** Long-running rebrand work. If the Claude Code conversation
> compacts (auto-summarizes the chat history) much of the locked detail
> below would otherwise be lost. This file is the durable record. Always
> read it BEFORE resuming work on the rebrand. Always update it AFTER
> completing each atomic task.
>
> When the full rebrand is shipped and Task 11 is done, delete this file.

## Critical user constraints (do not violate)

These are non-negotiable. Compaction MUST NOT lose these.

1. **NEVER touch `ui/TODO.md`.** That file is the user's personal
   planning doc. They have been explicit and angry about this. Never
   `git add` it, never `Edit` it, never `Read` it. When committing,
   always use `git add -A -- ':!ui/TODO.md'` to exclude it.
2. **Atomic tasks. Verify after each.** The user wants one atomic task
   per round, with explicit verification before moving on. Don't batch.
3. **No AI-slop / hustle-bro / LinkedIn-corporate / wellness-coddling
   tone.** All four are explicitly anti-brand.
4. **The mise/node-version warning.** The user's shell PATH resolves
   `/Users/home/.local/share/mise/installs/node/25/bin/node` (v25.9.0)
   ahead of the mise-pinned 26.1.0. We've already added a hard-fail
   `engines.node` gate to `scripts/system/ensure-pnpm.mjs` so any future
   `pnpm install` blocks with a fix-it message. The user must run
   `mise uninstall node@25.9.0` (or `mise reshim`) locally to clear the
   stale entry — that's a one-time user-side action, not something I
   can do (auto-mode classifier blocks it).
5. **Single-brand strategy** for OSS + commercial. Not the Vercel /
   Next.js split. The name "Heron" carries both project and future
   commercial entity.

## The 11-task plan + status

| # | Task | Status | Commit | Notes |
|---|---|---|---|---|
| 1 | Strategy doc (mission, audience, voice, positioning, tagline) | ✓ done | `be3aa8c` | `branding/BRAND.md` |
| 2 | Color system (palette + WCAG ratios + token map) | ✓ done | `be3aa8c` | `branding/COLORS.md` |
| 3 | Typography (Fraunces + Inter + IBM Plex Mono) | ✓ done | `e6f6dfc` | `branding/TYPOGRAPHY.md` |
| 4 | Wordmark SVG (4 variants) | ✓ done | `e1ead03` | `branding/WORDMARK.md` + `branding/assets/wordmark-*.svg` |
| 5 | Mascot brief + placeholder SVG | ✓ done | `fb8edc0` | `branding/MASCOT.md` + `branding/assets/mark-placeholder.svg` |
| 6 | Voice & tone guide (20 phrases + 10 anti-patterns) | ✓ done | `9af2e73` | `branding/VOICE.md` |
| 7 | README banner copy | ✓ done | `<this commit>` | `branding/README-banner.md` (the actual `README.md` swap happens at Task 9) |
| 8 | Social card spec (HTML/CSS 1200×630 OG) | **next** | — | `branding/assets/social-card.html` + spec section |
| 9 | brand.json update + apply-brand dry-run | **DESTRUCTIVE GATE** | — | Renames career-ops → heron across ~30 files. Explicit user approval required before run. |
| 10 | apply-brand commit + SvelteKit UI wiring | pending | — | Color tokens into `ui/src/app.css`; font files self-hosted; component sweep for hardcoded colors |
| 11 | Press kit structure + draft copy | pending | — | `branding/PRESS-KIT.md`; optionally render to PDF via `anthropic-skills:pdf` |

## Locked decisions (do not re-litigate without explicit user pushback)

### Identity

- **Name**: Heron
- **Capitalization**: Sentence case. Never ALL CAPS. Never hyphenated.
- **Package id**: `heron` (lowercase)
- **Display name**: Heron
- **Repo slug**: `heron`
- **Bundle ID** (TBD per Task 9): `com.heron.app` candidate
- **URL scheme**: `heron://`
- **mDNS service**: `_heron._tcp`

### Strategic

- **Audience**: anyone changing or accelerating a career (broad)
- **Personality**: calm + sophisticated (Linear / Anthropic / Notion register)
- **OSS posture**: single-brand strategy — same name scales project → company
- **Anti-brands**: LinkedIn, AI-slop, hustle-bro, wellness-coddling (all four)

### Taglines

- **Primary**: *Stand still. Strike well.*
- **Secondary**: *A thinking partner for the moves that matter.*
- **Bio-length** (≤160 chars): *Heron — a thinking partner for career transitions. Patient. Precise. Local-first. Open source.*

### Colors (9 base tokens for `brand.json::colors`)

| Token | Hex |
|---|---|
| `primary` (Heron Slate) | `#4a5b6d` |
| `accent` (Heron Dawn) | `#c89b4a` |
| `accentSecondary` (Heron Reed) | `#7a8c6d` |
| `darkBg` | `#0e1014` |
| `darkSurface` | `#14181f` |
| `lightBg` | `#f7f5f0` (warm paper) |
| `lightSurface` | `#fffefa` |
| `textOnDark` | `#e8eaed` |
| `textOnLight` | `#1a1f26` |

The full 22-token CSS system (status colors, text scale, borders, raised
surfaces) is documented in `branding/COLORS.md` and gets implemented in
`ui/src/app.css` during Task 9/10.

### Typography

- **Display**: Fraunces (variable serif, Google Fonts) — `wght 700`, `opsz 96`, `SOFT 0`
- **Body**: Inter (variable sans, Google Fonts)
- **Mono**: IBM Plex Mono (Regular + Medium)
- **Self-hosted** in `ui/static/fonts/` (no Google Fonts CDN — matches local-first philosophy)
- **CV template**: separate decision — pure Inter throughout (ATS-safe), drop Space Grotesk + DM Sans

### Mascot

- **Subject**: Great Blue Heron / Grey Heron, side profile, standing pose, neck S-curve, head turned ~25-30° right
- **Style**: editorial illustration (Audubon / Charley Harper / Field Notes / sumi-e — NOT cartoon, NOT photo-real, NOT 3D, NOT anthropomorphized)
- **Two-tier**: Mark (silhouette, ≤64px) + Illustration (editorial, ≥200px)
- **Placeholder**: hand-built SVG at `branding/assets/mark-placeholder.svg` — to be replaced by Claude Design or human illustrator output

## Files committed in this rebrand sequence

```text
branding/BRAND.md              ← Task 1 (be3aa8c)
branding/COLORS.md             ← Task 2 (be3aa8c)
branding/TYPOGRAPHY.md         ← Task 3 (e6f6dfc)
branding/WORDMARK.md           ← Task 4 (e1ead03)
branding/MASCOT.md             ← Task 5 (fb8edc0)
branding/assets/wordmark.svg          ← Task 4 (currentColor)
branding/assets/wordmark-slate.svg    ← Task 4
branding/assets/wordmark-light.svg    ← Task 4
branding/assets/wordmark-dawn.svg     ← Task 4
branding/assets/mark-placeholder.svg  ← Task 5
```

## Files that WILL change at Task 9 (destructive)

`apply-brand` propagates from `branding/brand.json` into every consumer.
When the user approves the Task 9 gate:

| Consumer | What changes |
|---|---|
| `package.json` × 3 (root + ui + ui/electron) | name `career-ops` → `heron`, description, repo URLs |
| `ui/capacitor.config.ts` + `ui/electron/capacitor.config.ts` | appId, appName, URL scheme, splash colors, appendUserAgent |
| `ui/electron/electron-builder.config.json` | appId, productName, copyright, URL types, Bonjour |
| `ui/ios/App/App/Info.plist` | display name, URL scheme, Bonjour, permissions |
| `ui/ios/App/App/Brand.swift` + 4 extension copies | every Swift constant |
| `ui/src/lib/client/brand.ts` | regenerated BRAND object |
| `ui/electron/src/brand.ts` | Electron-side brand object |
| `ui/static/favicon.svg` + manifest + app.html | favicon + og tags + theme color |
| `ui/static/icons/*.png` | all platform icon sizes regenerated from new mascot |
| `ui/ios/App/fastlane/{Appfile,Fastfile}` | app_identifier |
| `release-please-config.json` | package-name |
| `.github/ISSUE_TEMPLATE/*.yml` + workflows | brand name in prose + artifact names |
| `lefthook.yml` + `turbo.json` | iOS extension folder names if renamed |
| `scripts/native/add-xcode-targets.rb` | bundle_root + app_group constants |
| `ui/src/app.css` (or Tailwind theme) | 22-token color system wired from new `brand.json::colors` |
| `templates/cv-template.html` | Switch to Inter-only (drop Space Grotesk + DM Sans) |
| `templates/fonts/` | Replace Space Grotesk + DM Sans woff2 with Inter variable |
| `ui/static/fonts/` (NEW) | Add Fraunces + Inter + IBM Plex Mono woff2 |
| Any component using hardcoded color literals | Grep + migrate to token references |

## Task 9 — DESTRUCTIVE GATE

Before any of the propagation above runs, the user must explicitly
approve. The Task 9 workflow:

1. I update `branding/brand.json` with new name + new color tokens
2. I run `node scripts/native/apply-brand.mjs --dry-run` (or equivalent)
   to show the user every file that would change
3. **User explicit approval gate** — they say go before any commit
4. Run `apply-brand` for real → commit
5. Verify gate (full test suite, oxlint, typecheck, format, etc.)
6. Sweep for hardcoded color/name literals not caught by apply-brand
7. Self-host font files (Fraunces, Inter, IBM Plex Mono)
8. Wire the full 22-token color system in `ui/src/app.css`
9. Replace placeholder mascot with the real one (from Claude Design or
   illustrator, IF available — otherwise ship with the placeholder
   clearly labeled)

## Open verification gates

Before Task 6 starts, the user should confirm Tasks 4 + 5 land well:

- **Wordmark composition**: plain "Heron." no accent? (alternative:
  subtle dot/dash)
- **Mascot species**: Great Blue Heron / Grey Heron side profile? (vs
  fully abstract heron-gesture)
- **Mascot tier system**: Mark + Illustration both wanted? (vs just one)
- **Placeholder mascot**: keep the hand-built one in place? (vs leave
  the file slot empty until Claude Design produces the real one)
- **Lockup directions**: Mascot leads in horizontal lockup, stacked
  hero-only?

If everything lands, the user says "go" and I move to Task 6.

## How to resume after compaction

If you're a future Claude instance reading this AFTER the chat
compacted, here's how to pick up cleanly:

1. **Read this entire file first.** It captures every locked decision.
2. **Read `branding/BRAND.md`** for the full strategy + voice principles.
3. **Read `branding/COLORS.md`** for the palette.
4. **Read `branding/TYPOGRAPHY.md`** for the type system.
5. **Read `branding/WORDMARK.md`** and `branding/MASCOT.md` for the
   visual identity briefs.
6. **DO NOT TOUCH `ui/TODO.md`.** The user is hostile about this.
7. **Check `git log --oneline -20`** to see what's been committed since
   this file was last updated.
8. **Identify the next task** from the table at the top of this file.
9. **Produce the task's deliverable** — write to `branding/<TASK>.md`
   AND commit AND ask user for verification.
10. **Update THIS FILE** to mark the task done + record the commit hash.

The atomic-task discipline: produce → write to file → commit → ask for
verification → move on. Never batch tasks.

## Hot-button context the user is sensitive about

- **ui/TODO.md** — off-limits. Always exclude from commits.
- **mise / node version** — already gated in ensure-pnpm.mjs; user-side
  cleanup needed for their local env (`mise uninstall node@25.9.0` or
  `mise reshim`).
- **Claude Design** — real Anthropic product (launched April 2026,
  powered by Claude Opus 4.7) but not accessible from THIS Claude Code
  session. User uses it separately for visual rendering.
- **Acknowledging mistakes** — be direct, no grovelling, no excessive
  hedging. The user wants competence + brevity.
- **Tone discipline** — calm + sophisticated, never hustle-bro,
  never AI-slop, never wellness-coddling.

## Latest update

- 2026-05-15 — Tasks 1–7 complete. Task 8 (social card spec) is next.
  Latest commit: `<this commit>` (README-banner.md). The README banner
  spec ships in `branding/README-banner.md` — the actual `README.md`
  swap is deferred to Task 9 (it's part of the brand-name sweep). The
  banner is built around the BRAND.md origin paragraph verbatim, a
  3-link badge row (Build / MIT / Version), a 4-item link row (Get
  started / Docs / Architecture / Discord), a 9-bullet feature
  summary, the "Why local-first" differentiator section, and a clean
  four-line quickstart code block. Anti-patterns enumerated.
