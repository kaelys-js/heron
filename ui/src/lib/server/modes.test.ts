/**
 * modes.test -- profile-language mode-file resolution.
 *
 * Pure function modulo `readProfile` + `fs.existsSync`. Mocks both so
 * each test pins one branch of the language-fallback logic.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let __profile: unknown = {};
vi.mock('./profile', () => ({
  readProfile: () => __profile,
}));

// Mock node:fs at module level. modes.ts's `fs.existsSync()` will see
// this mock instead of the real fs.
let __existsResult = false; // default
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    default: { ...actual, existsSync: (_p: string) => __existsResult },
    existsSync: (_p: string) => __existsResult,
  };
});

const modes = await import('./modes');

beforeEach(() => {
  __profile = {};
  __existsResult = false; // default
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('modesDirFor', () => {
  it('returns "modes" (English) when profile has no language config', () => {
    __profile = {};
    expect(modes.modesDirFor()).toBe('modes');
  });

  it('returns "modes" when language.modes_dir is empty string', () => {
    __profile = { language: { modes_dir: '' } };
    expect(modes.modesDirFor()).toBe('modes');
  });

  it('returns "modes" when language.modes_dir is just "modes"', () => {
    __profile = { language: { modes_dir: 'modes' } };
    expect(modes.modesDirFor()).toBe('modes');
  });

  it('returns "modes/de" for valid lang code', () => {
    __profile = { language: { modes_dir: 'modes/de' } };
    expect(modes.modesDirFor()).toBe('modes/de');
  });

  it('accepts unprefixed lang code', () => {
    __profile = { language: { modes_dir: 'fr' } };
    expect(modes.modesDirFor()).toBe('modes/fr');
  });

  it('falls back to "modes" when lang code is unknown', () => {
    __profile = { language: { modes_dir: 'zz' } };
    expect(modes.modesDirFor()).toBe('modes');
  });

  it('falls back to "modes" when profile read throws (defensive)', () => {
    vi.mocked(modes.modesDirFor); // just to silence warnings; readProfile mock will throw
    __profile = new Proxy(
      {},
      {
        get: () => {
          throw new Error('yaml parse');
        },
      },
    );
    expect(modes.modesDirFor()).toBe('modes');
  });

  it('trims whitespace before validation', () => {
    __profile = { language: { modes_dir: '  modes/ja  ' } };
    expect(modes.modesDirFor()).toBe('modes/ja');
  });

  it('accepts each of the valid lang codes (de/fr/ja/pt/ru/es)', () => {
    for (const lang of ['de', 'fr', 'ja', 'pt', 'ru', 'es']) {
      __profile = { language: { modes_dir: lang } };
      expect(modes.modesDirFor()).toBe(`modes/${lang}`);
    }
  });
});

describe('modesPathFor', () => {
  it('returns the localized path when it exists', () => {
    __profile = { language: { modes_dir: 'modes/de' } };
    __existsResult = true;
    const p = modes.modesPathFor('evaluate.md');
    expect(p).toMatch(/modes\/de\/evaluate\.md$/);
  });

  it('falls back to English when localized file is missing', () => {
    __profile = { language: { modes_dir: 'modes/de' } };
    __existsResult = false;
    const p = modes.modesPathFor('evaluate.md');
    expect(p).toMatch(/\/modes\/evaluate\.md$/);
    expect(p).not.toMatch(/modes\/de/);
  });

  it('returns English path directly when profile has no language', () => {
    __profile = {};
    __existsResult = true; // shouldn't matter; English is the default
    const p = modes.modesPathFor('evaluate.md');
    expect(p).toMatch(/\/modes\/evaluate\.md$/);
  });
});

describe('languageTag', () => {
  it('returns "en" for the English root', () => {
    expect(modes.languageTag('modes')).toBe('en');
  });

  it('extracts the 2-letter tag from "modes/<lang>"', () => {
    expect(modes.languageTag('modes/de')).toBe('de');
    expect(modes.languageTag('modes/fr')).toBe('fr');
    expect(modes.languageTag('modes/ja')).toBe('ja');
  });

  it('returns "en" for malformed input', () => {
    expect(modes.languageTag('not-a-modes-dir')).toBe('en');
    expect(modes.languageTag('')).toBe('en');
    expect(modes.languageTag('modes/long-name')).toBe('en');
  });
});
