/**
 * mode-substitution — orchestrator-side path-token substitution.
 *
 * Replaces the legacy "symlinks at repo root" mechanism. Mode files
 * (modes/*.md) contain `__TOKEN__` placeholders; this module resolves
 * each token to an absolute on-disk path against the active profile +
 * user context, and returns the realized prompt that gets handed to
 * the AI CLI via `--append-system-prompt-file` (or as the `-p` body).
 *
 * Why bake paths into the prompt instead of teaching the AI an env
 * var? Three reasons:
 *
 *   1. Provider-agnostic. Claude Code, Gemini, Codex, OpenCode, Qwen,
 *      Copilot all handle prompts as raw text. None of them
 *      uniformly honour env-var interpolation in instructional text.
 *   2. No silent fallback. If we wrote "read $CAREER_OPS_PROFILE_DIR/
 *      cv.md" and the AI ignored the variable, it would happily try
 *      "$CAREER_OPS_PROFILE_DIR/cv.md" as a literal path and fail
 *      cryptically. With pre-substituted absolute paths there's no
 *      env-var indirection to misinterpret.
 *   3. Per-spawn state. The substitution function takes a profileId
 *      argument; two concurrent spawns for different profiles each
 *      get their own realized prompt. No global state, no lock.
 *
 * Token vocabulary documented in modes/_TOKENS.md — keep this file
 * and that doc in sync.
 */

import { readFileSync } from 'node:fs';
import {
  profilePath,
  profilePathForUser,
  userSharedPath,
  userSharedPathForUser,
  type ProfileFileKind,
  type UserSharedFileKind,
} from './profile-paths';
import { currentUserIdOrDefault } from './user-context';

/** Map of token → ProfileFileKind. Per-profile resolution. */
const PROFILE_TOKEN_KINDS: Record<string, ProfileFileKind> = {
  __PROFILE__: 'profile-dir',
  __CV__: 'cv-md',
  __PROFILE_MD__: 'profile-md',
  __PORTALS__: 'portals-yml',
  __ARTICLE_DIGEST__: 'article-digest',
  __PIPELINE__: 'pipeline',
  __APPLICATIONS__: 'applications',
  __SCAN_HISTORY__: 'scan-history',
  __GEMINI_SCORES__: 'gemini-scores',
  __FOLLOW_UPS__: 'follow-ups',
  __PROJECTS_JSON__: 'projects-json',
  __REPORTS__: 'reports-dir',
  __OUTPUT__: 'output-dir',
  __JDS__: 'jds-dir',
  __WRITING_SAMPLES__: 'writing-samples-dir',
  __INTERVIEW_PREP__: 'interview-prep-dir',
};

/** Map of token → UserSharedFileKind. User-shared resolution. */
const USER_SHARED_TOKEN_KINDS: Record<string, UserSharedFileKind> = {
  __STORY_BANK__: 'story-bank',
};

/** Combined set of all valid token names. */
const ALL_TOKENS = new Set<string>([
  ...Object.keys(PROFILE_TOKEN_KINDS),
  ...Object.keys(USER_SHARED_TOKEN_KINDS),
]);

/**
 * Substitute every known `__TOKEN__` in `source` with its absolute
 * path against the given profile + the current user context.
 *
 * Word-boundary aware: `__CV___EXTRA` won't match. The regex
 * `\b__[A-Z_]+__\b` doesn't even fire if there's a word character
 * after the trailing `__`.
 *
 * Unknown tokens (`__FOO__`) are LEFT AS LITERAL TEXT — substitution
 * doesn't guess. A typo in a mode file shows up loud in the AI's
 * output.
 *
 * Idempotent: running twice on the same source produces the same
 * output (substituted paths don't contain `__` so a second pass is
 * a no-op).
 */
export function substituteModeTokens(profileId: string, source: string): string {
  return substituteModeTokensForUser(currentUserIdOrDefault(), profileId, source);
}

/** Like `substituteModeTokens` but takes an explicit userId — used
 *  by tests + background jobs that may operate on a different user
 *  than the request actor. */
export function substituteModeTokensForUser(
  userId: string,
  profileId: string,
  source: string,
): string {
  // Match any `__UPPERCASE_OR_UNDERSCORE__` token bounded by non-word
  // chars on both sides. `__CV__` matches, `__cv__` doesn't (case-
  // sensitive), `prefix__CV__suffix` doesn't (no boundary).
  return source.replace(/\b__([A-Z][A-Z_]*[A-Z])__\b/g, (match, _name) => {
    const token = match;
    const profileKind = PROFILE_TOKEN_KINDS[token];
    if (profileKind) {
      return profilePathForUser(userId, profileId, profileKind);
    }
    const sharedKind = USER_SHARED_TOKEN_KINDS[token];
    if (sharedKind) {
      return userSharedPathForUser(userId, sharedKind);
    }
    // Unknown token — leave as literal so the typo is visible.
    return match;
  });
}

/** Read a mode file from disk, substitute, return the realized
 *  prompt. Throws if the file doesn't exist. */
export function realizeModePrompt(profileId: string, modePath: string): string {
  const source = readFileSync(modePath, 'utf8');
  return substituteModeTokens(profileId, source);
}

/** Like `realizeModePrompt` but takes an explicit userId. */
export function realizeModePromptForUser(
  userId: string,
  profileId: string,
  modePath: string,
): string {
  const source = readFileSync(modePath, 'utf8');
  return substituteModeTokensForUser(userId, profileId, source);
}

/** Returns true iff `token` is a known token name (e.g. `__CV__`).
 *  Used by the integration test to assert no unknown tokens linger
 *  in any mode file. */
export function isKnownToken(token: string): boolean {
  return ALL_TOKENS.has(token);
}

/** Return the closed set of all valid token names. Used by tests. */
export function listKnownTokens(): readonly string[] {
  return Object.freeze([...ALL_TOKENS]);
}
