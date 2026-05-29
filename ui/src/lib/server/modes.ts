/** modes -- resolve a mode file path against the profile's selected
 *  language. Centralised so every spawn site honours the user preference.
 *  Per-profile language at profile.yml.language.modes_dir:
 *    empty / 'modes'  → English (top-level modes/)
 *    'modes/<lang>'   → modes/<lang>/<name>.md, falling back to English
 *                       when the localised file is absent (de/fr/ja/pt/ru/es).
 *  Fallback is intentional -- _profile.md customisations live only in
 *  English and must still resolve under any locale. */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './files';
import { readProfile } from './profile';

const MODES_ROOT = path.join(ROOT, 'modes');

const VALID_LANG_DIRS = new Set(['de', 'fr', 'ja', 'pt', 'ru', 'es']);

/** Read `profile.yml.language.modes_dir` for a profile. Returns 'modes'
 *  (English) when not set. Defensive against malformed yaml. */
export function modesDirFor(profileId?: string): string {
  try {
    const p = readProfile(profileId) as unknown as { language?: { modes_dir?: string } };
    const v = p?.language?.modes_dir;
    if (typeof v === 'string' && v.trim()) {
      const trimmed = v.trim().replace(/^modes\/?/i, '');
      if (!trimmed) {
        return 'modes';
      }
      return VALID_LANG_DIRS.has(trimmed) ? `modes/${trimmed}` : 'modes';
    }
  } catch {
    /* fall through */
  }
  return 'modes';
}

/**
 * Resolve the absolute path of a mode file for a profile, with language
 * fallback. Returns the localized path if it exists, else the English path.
 */
export function modesPathFor(name: string, profileId?: string): string {
  const dir = modesDirFor(profileId);
  const localized = path.join(ROOT, dir, name);
  if (fs.existsSync(localized)) {
    return localized;
  }
  // Fall back to English (top-level modes/) for files that haven't been
  // translated yet.
  return path.join(MODES_ROOT, name);
}

/** Language tag (en/de/fr/ja/pt/ru/es) inferred from a modes_dir string. */
export function languageTag(modesDir: string): string {
  if (modesDir === 'modes') {
    return 'en';
  }
  const m = modesDir.match(/^modes\/([a-z]{2})$/);
  return m ? m[1] : 'en';
}
