/**
 * files.smoke.test -- pure helpers for path resolution + safe reads.
 * readSafe + listModes have one-line happy paths and a missing-path
 * branch each.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: (p: string) => p.includes('exists'),
      readFileSync: (p: string) => {
        if (p.includes('exists')) return 'file contents';
        throw new Error('ENOENT');
      },
      readdirSync: (_p: string) => ['evaluate.md', 'apply.md', 'README.md', '_shared.md'],
    },
    existsSync: (p: string) => p.includes('exists'),
    readFileSync: (p: string) => {
      if (p.includes('exists')) return 'file contents';
      throw new Error('ENOENT');
    },
    readdirSync: (_p: string) => ['evaluate.md', 'apply.md', 'README.md', '_shared.md'],
  };
});

const { ROOT, MODES_DIR, ENV_FILE, readSafe, listModes } = await import('./files');

describe('files exports -- path constants', () => {
  it('ROOT is an absolute path', () => {
    expect(ROOT.startsWith('/')).toBe(true);
  });

  it('MODES_DIR is under ROOT', () => {
    expect(MODES_DIR.startsWith(ROOT)).toBe(true);
    expect(MODES_DIR.endsWith('modes')).toBe(true);
  });

  it('ENV_FILE is named .env under ROOT', () => {
    expect(ENV_FILE.endsWith('.env')).toBe(true);
  });
});

describe('readSafe', () => {
  it('returns file contents when file exists', () => {
    expect(readSafe('/some/exists/file.txt')).toBe('file contents');
  });

  it('returns empty string when file missing', () => {
    expect(readSafe('/some/missing/file.txt')).toBe('');
  });
});

describe('listModes', () => {
  it('returns .md files', () => {
    const modes = listModes();
    expect(modes.length).toBeGreaterThan(0);
    for (const m of modes) {
      expect(m.endsWith('.md')).toBe(true);
    }
  });

  it('includes all .md files (no filtering beyond extension)', () => {
    const modes = listModes();
    expect(modes).toContain('evaluate.md');
    expect(modes).toContain('apply.md');
  });
});
