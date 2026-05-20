/**
 * mode-substitution.integration.test.ts -- assert every modes/*.md
 * file substitutes cleanly + leaves no token literals + leaves no
 * legacy repo-root literal paths.
 *
 * Runs at the integration level (not unit) because it touches the
 * real `modes/` tree on disk. Spawns no processes -- purely textual.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { substituteModeTokensForUser, listKnownTokens } from '$lib/server/mode-substitution';
import { ROOT } from '$lib/server/files';
import { SYSTEM_USER_ID } from '$lib/server/user-context';

const MODES_DIR = join(ROOT, 'modes');
const TEST_PROFILE = 'default';
const TEST_USER = SYSTEM_USER_ID;

// Files the migration intentionally SKIPPED -- they reference legacy
// paths AS DATA, not as instructions.
const SKIP_FILES = new Set<string>([
  '_TOKENS.md', // documents what the tokens replace
  '_profile.template.md', // user-facing template seed
]);

function* walkMd(dir: string): Generator<string> {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      yield* walkMd(full);
    } else if (ent.isFile() && ent.name.endsWith('.md')) {
      yield full;
    }
  }
}

function modeFiles(): string[] {
  return [...walkMd(MODES_DIR)].filter((p) => {
    const rel = p.slice(MODES_DIR.length + 1);
    return !SKIP_FILES.has(rel) && !rel.startsWith('archive/');
  });
}

describe('mode-substitution end-to-end', () => {
  describe('every mode file', () => {
    const files = modeFiles();
    expect(files.length).toBeGreaterThan(20); // sanity -- at least 20 mode files exist

    it.each(
      files.map((f) => [f.slice(ROOT.length + 1)] as const),
    )('substitutes %s without leftover tokens', (rel) => {
      const abs = join(ROOT, rel);
      if (!statSync(abs).isFile()) return; // belt-and-braces
      // CodeQL js/file-system-race: read directly and treat ENOENT as a
      // skip rather than re-checking existence between statSync and read.
      let source: string;
      try {
        source = readFileSync(abs, 'utf8');
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw e;
      }
      const substituted = substituteModeTokensForUser(TEST_USER, TEST_PROFILE, source);

      // No __KNOWN_TOKEN__ literals should remain after substitution.
      // Unknown __FOO__ tokens DO remain (intentional -- typos visible),
      // so this asserts only the closed set is fully resolved.
      for (const tok of listKnownTokens()) {
        expect(substituted, `${rel} still contains ${tok}`).not.toContain(tok);
      }
    });
  });

  describe('no legacy literal paths remain', () => {
    const LEGACY_PATTERNS: { name: string; re: RegExp }[] = [
      // Word-boundary aware so we don't match cv-example.md, _profile.template.md, etc.
      { name: 'cv.md', re: /\bcv\.md\b/ },
      { name: 'portals.yml', re: /\bportals\.yml\b/ },
      { name: 'article-digest.md', re: /\barticle-digest\.md\b/ },
      { name: '_profile.md', re: /\b_profile\.md\b/ },
      { name: 'pipeline.md', re: /\bpipeline\.md\b/ },
      { name: 'applications.md', re: /\bapplications\.md\b/ },
      { name: 'scan-history.tsv', re: /\bscan-history\.tsv\b/ },
      // Dir prefixes -- these only show as `<dir>/<file>` references
      { name: 'jds/', re: /\bjds\// },
      { name: 'reports/', re: /\breports\// },
      { name: 'output/', re: /\boutput\// },
      { name: 'writing-samples/', re: /\bwriting-samples\// },
      { name: 'interview-prep/', re: /\binterview-prep\// },
    ];

    it.each(
      LEGACY_PATTERNS.map((p) => [p.name, p.re] as const),
    )('no mode file contains literal "%s" (would indicate missed migration)', (name, re) => {
      const offenders: string[] = [];
      for (const abs of modeFiles()) {
        const rel = abs.slice(ROOT.length + 1);
        const src = readFileSync(abs, 'utf8');
        if (re.test(src)) offenders.push(rel);
      }
      expect(
        offenders,
        `Files still using legacy literal "${name}": ${offenders.join(', ')}`,
      ).toEqual([]);
    });
  });

  describe('every token in the closed set has a resolver', () => {
    it.each(listKnownTokens())('substitutes %s to an absolute path', (token) => {
      const out = substituteModeTokensForUser(TEST_USER, TEST_PROFILE, token);
      expect(out).not.toBe(token); // changed
      expect(out.startsWith('/')).toBe(true); // absolute
    });
  });
});
