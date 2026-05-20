/**
 * mode-substitution.test.ts -- unit tests for the token substitution
 * engine. Covers every per-profile + user-shared token, word-boundary
 * edge cases, idempotency, and the "leave unknown tokens as literal"
 * guarantee.
 *
 * Why no fixture mode file? The orchestrator integration test
 * (mode-substitution.integration.test.ts) runs against every real
 * modes/*.md. These unit tests target the SUBSTITUTION semantics
 * in isolation, with controlled input strings.
 */
import { describe, it, expect } from 'vitest';
import { substituteModeTokensForUser, isKnownToken, listKnownTokens } from './mode-substitution';
import { SYSTEM_USER_ID } from './user-context';

const USER = SYSTEM_USER_ID;
const PROFILE = 'default';

describe('substituteModeTokensForUser', () => {
  describe('per-profile tokens', () => {
    it.each([
      ['__CV__', 'cv.md'],
      ['__PROFILE_MD__', '_profile.md'],
      ['__PORTALS__', 'portals.yml'],
      ['__ARTICLE_DIGEST__', 'article-digest.md'],
      ['__PIPELINE__', 'pipeline.md'],
      ['__APPLICATIONS__', 'applications.md'],
      ['__SCAN_HISTORY__', 'scan-history.tsv'],
      ['__GEMINI_SCORES__', 'gemini-scores.tsv'],
      ['__FOLLOW_UPS__', 'follow-ups.md'],
      ['__PROJECTS_JSON__', 'projects.json'],
    ])('resolves %s → <profile>/%s (absolute)', (token, basename) => {
      const out = substituteModeTokensForUser(USER, PROFILE, token);
      expect(out.startsWith('/')).toBe(true);
      expect(out.endsWith(`/${basename}`)).toBe(true);
      expect(out).toContain('/profiles/default/');
    });

    it.each([
      ['__REPORTS__', 'reports'],
      ['__OUTPUT__', 'output'],
      ['__JDS__', 'jds'],
      ['__WRITING_SAMPLES__', 'writing-samples'],
      ['__INTERVIEW_PREP__', 'interview-prep'],
    ])('resolves %s (dir) → <profile>/%s', (token, dirname) => {
      const out = substituteModeTokensForUser(USER, PROFILE, token);
      expect(out.endsWith(`/${dirname}`)).toBe(true);
    });

    it('resolves __PROFILE__ → the profile dir itself', () => {
      const out = substituteModeTokensForUser(USER, PROFILE, '__PROFILE__');
      // ends with /default (the profile slug), absolute path
      expect(out.startsWith('/')).toBe(true);
      expect(out.endsWith('/profiles/default')).toBe(true);
    });
  });

  describe('user-shared tokens', () => {
    it('resolves __STORY_BANK__ → <user-shared>/story-bank.md', () => {
      const out = substituteModeTokensForUser(USER, PROFILE, '__STORY_BANK__');
      expect(out.endsWith('/_shared/story-bank.md')).toBe(true);
    });

    it('__STORY_BANK__ path does NOT live inside the profile dir', () => {
      const out = substituteModeTokensForUser(USER, PROFILE, '__STORY_BANK__');
      // _shared/ sits SIBLING to each profile dir under profiles/, so
      // the path must NOT contain a real profile slug between profiles/
      // and the filename.
      expect(out).not.toMatch(/profiles\/default\/.*story-bank/);
    });
  });

  describe('word-boundary semantics', () => {
    it('replaces a token wrapped in whitespace', () => {
      const out = substituteModeTokensForUser(USER, PROFILE, 'Read __CV__ now.');
      expect(out).toContain('cv.md');
      expect(out).not.toContain('__CV__');
    });

    it('replaces a token preceded by punctuation', () => {
      const out = substituteModeTokensForUser(USER, PROFILE, '`__CV__`');
      expect(out).toContain('cv.md');
    });

    it('replaces a token followed by slash + path tail', () => {
      const out = substituteModeTokensForUser(USER, PROFILE, '__REPORTS__/{n}-{slug}-{date}.md');
      expect(out).toMatch(/\/reports\/\{n\}-\{slug\}-\{date\}\.md$/);
    });

    it('LEAVES unknown __UPPERCASE__ tokens as literal text', () => {
      const out = substituteModeTokensForUser(USER, PROFILE, '__NOT_A_REAL_TOKEN__');
      expect(out).toBe('__NOT_A_REAL_TOKEN__');
    });

    it('LEAVES lowercase __cv__ alone (case-sensitive)', () => {
      const out = substituteModeTokensForUser(USER, PROFILE, '__cv__');
      expect(out).toBe('__cv__');
    });

    it('does NOT replace inside a longer identifier (no word boundary)', () => {
      // `prefix__CV__suffix` has no `\b` between letters and `_`, so
      // the regex doesn't fire.
      const out = substituteModeTokensForUser(USER, PROFILE, 'prefix__CV__suffix');
      // Underscores are word chars in JS regex, so `\b` requires a
      // transition between word/non-word. Inside `prefix__CV__suffix`
      // every character is a word char -- no boundary anywhere.
      expect(out).toBe('prefix__CV__suffix');
    });
  });

  describe('idempotency', () => {
    it('running substitution twice returns the same string', () => {
      const input = 'Save the CV at __CV__ then report at __REPORTS__/foo.md';
      const once = substituteModeTokensForUser(USER, PROFILE, input);
      const twice = substituteModeTokensForUser(USER, PROFILE, once);
      expect(twice).toBe(once);
    });
  });

  describe('multiple tokens in one string', () => {
    it('substitutes every token independently', () => {
      const input = 'Read __CV__, then __PROFILE_MD__, then write __REPORTS__/x.md.';
      const out = substituteModeTokensForUser(USER, PROFILE, input);
      expect(out).toContain('cv.md');
      expect(out).toContain('_profile.md');
      expect(out).toContain('reports/x.md');
      expect(out).not.toContain('__CV__');
      expect(out).not.toContain('__PROFILE_MD__');
      expect(out).not.toContain('__REPORTS__');
    });
  });

  describe('multi-user isolation', () => {
    it('different users get different absolute paths for the same token', () => {
      const alice = substituteModeTokensForUser('alice-uuid', PROFILE, '__CV__');
      const bob = substituteModeTokensForUser('bob-uuid', PROFILE, '__CV__');
      expect(alice).not.toBe(bob);
      expect(alice).toContain('alice-uuid');
      expect(bob).toContain('bob-uuid');
    });

    it('SYSTEM_USER_ID resolves to the legacy data/profiles/ layout', () => {
      const out = substituteModeTokensForUser(SYSTEM_USER_ID, PROFILE, '__CV__');
      expect(out).toMatch(/profiles\/default\/cv\.md$/);
      expect(out).not.toContain('/users/');
    });
  });
});

describe('isKnownToken / listKnownTokens', () => {
  it('listKnownTokens returns the full closed set', () => {
    const tokens = listKnownTokens();
    expect(tokens).toContain('__CV__');
    expect(tokens).toContain('__STORY_BANK__');
    expect(tokens).toContain('__PROFILE__');
    // Sanity: at least 15 tokens (16 per-profile + 1 user-shared)
    expect(tokens.length).toBeGreaterThanOrEqual(15);
  });

  it('isKnownToken returns true for known tokens', () => {
    expect(isKnownToken('__CV__')).toBe(true);
    expect(isKnownToken('__STORY_BANK__')).toBe(true);
    expect(isKnownToken('__PROFILE__')).toBe(true);
  });

  it('isKnownToken returns false for unknown tokens', () => {
    expect(isKnownToken('__FOO__')).toBe(false);
    expect(isKnownToken('cv.md')).toBe(false);
    expect(isKnownToken('')).toBe(false);
  });
});
