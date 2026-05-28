/**
 * interview.dense.test -- profile-aware interview-prep helpers, complementing
 * the existing interview.test.ts which focuses on multi-user safety.
 *
 * Covers: loadModeFile / loadStoryBank / loadWritingSamples /
 * readPersistedInterviewPrep (both signatures). Mocks `./files` for
 * readSafe and `node:fs` for direct fs reads.
 *
 * generateInterviewPrep / generateNegotiationBrief aren't covered here
 * (they call `complete()` from `./ai` -- a fuller integration test).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const __files = new Map<string, string>();
const __dirs = new Set<string>();

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  const existsSync = (p: string) => __files.has(p) || __dirs.has(p);
  const readFileSync = (p: string) => {
    if (__files.has(p)) {
      return __files.get(p)!;
    }
    throw new Error(`ENOENT: ${p}`);
  };
  const readdirSync = (p: string) => {
    const prefix = p.endsWith('/') ? p : `${p}/`;
    const out = new Set<string>();
    for (const f of __files.keys()) {
      if (f.startsWith(prefix)) {
        const rest = f.slice(prefix.length);
        const first = rest.split('/')[0];
        if (first) {
          out.add(first);
        }
      }
    }
    return Array.from(out);
  };
  const writeFileSync = (p: string, body: string | Buffer) => {
    __files.set(p, typeof body === 'string' ? body : body.toString());
  };
  return {
    ...actual,
    default: { ...actual, existsSync, readFileSync, readdirSync, writeFileSync },
    existsSync,
    readFileSync,
    readdirSync,
    writeFileSync,
  };
});

vi.mock('./files', () => ({
  readSafe: (p: string) => __files.get(p) ?? '',
  ROOT: '/test-root',
}));

vi.mock('./profiles', () => ({
  getActiveProfileId: () => 'default',
}));

vi.mock('./profile-paths', () => ({
  profilePath: (profileId: string, kind: string) => {
    const map: Record<string, string> = {
      'cv-md': `/test-root/profiles/${profileId}/cv.md`,
      'profile-yml': `/test-root/profiles/${profileId}/profile.yml`,
      'reports-dir': `/test-root/profiles/${profileId}/reports`,
      'article-digest': `/test-root/profiles/${profileId}/article-digest.md`,
      'writing-samples-dir': `/test-root/profiles/${profileId}/writing-samples`,
      'interview-prep-dir': `/test-root/profiles/${profileId}/interview-prep`,
    };
    return map[kind] ?? `/test-root/profiles/${profileId}/${kind}`;
  },
  ensureProfileDirs: () => {},
  userSharedPath: (kind: string) =>
    `/test-root/shared/${kind === 'story-bank' ? 'story-bank.md' : kind}`,
}));

vi.mock('./modes', () => ({
  modesPathFor: (name: string, _profileId?: string) => `/test-root/modes/${name}`,
}));

vi.mock('./ai', () => ({
  complete: vi.fn(),
}));

const interview = await import('./interview');

beforeEach(() => {
  __files.clear();
  __dirs.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('loadModeFile', () => {
  it('reads from the resolved modes path', () => {
    __files.set('/test-root/modes/evaluate.md', '# Evaluate mode');
    expect(interview.loadModeFile('evaluate.md')).toBe('# Evaluate mode');
  });

  it('returns empty string when the file does not exist', () => {
    expect(interview.loadModeFile('missing.md')).toBe('');
  });

  it('honours an explicit profileId arg', () => {
    __files.set('/test-root/modes/evaluate.md', '# Per profile');
    expect(interview.loadModeFile('evaluate.md', 'engineer')).toBe('# Per profile');
  });
});

describe('loadStoryBank', () => {
  it('returns story-bank contents for the current user', () => {
    __files.set('/test-root/shared/story-bank.md', '## Story 1\n...');
    expect(interview.loadStoryBank()).toBe('## Story 1\n...');
  });

  it('returns empty string when no bank exists', () => {
    expect(interview.loadStoryBank()).toBe('');
  });

  it('accepts (and ignores) a profileId arg for legacy callers', () => {
    __files.set('/test-root/shared/story-bank.md', '## Cross-profile');
    expect(interview.loadStoryBank('engineer')).toBe('## Cross-profile');
  });
});

describe('loadWritingSamples', () => {
  it('returns empty string when the directory does not exist', () => {
    expect(interview.loadWritingSamples()).toBe('');
  });

  it('concatenates *.md files with ## filename headers', () => {
    __dirs.add('/test-root/profiles/default/writing-samples');
    __files.set('/test-root/profiles/default/writing-samples/blog.md', 'My blog content');
    __files.set('/test-root/profiles/default/writing-samples/email.md', 'My email content');
    const out = interview.loadWritingSamples();
    expect(out).toContain('## blog');
    expect(out).toContain('My blog content');
    expect(out).toContain('## email');
  });

  it('caps total output at 3000 chars', () => {
    __dirs.add('/test-root/profiles/default/writing-samples');
    __files.set('/test-root/profiles/default/writing-samples/long.md', 'x'.repeat(5000));
    expect(interview.loadWritingSamples().length).toBeLessThanOrEqual(3000);
  });

  it('skips non-.md files', () => {
    __dirs.add('/test-root/profiles/default/writing-samples');
    __files.set('/test-root/profiles/default/writing-samples/notes.txt', 'not markdown');
    __files.set('/test-root/profiles/default/writing-samples/blog.md', 'blog content');
    const out = interview.loadWritingSamples();
    expect(out).toContain('blog content');
    expect(out).not.toContain('not markdown');
  });

  it('returns empty when directory exists but has no .md files', () => {
    __dirs.add('/test-root/profiles/default/writing-samples');
    __files.set('/test-root/profiles/default/writing-samples/notes.txt', 'not md');
    expect(interview.loadWritingSamples()).toBe('');
  });
});

describe('readPersistedInterviewPrep', () => {
  it('returns null when the persisted file does not exist (1-arg)', () => {
    expect(interview.readPersistedInterviewPrep('some-job-id')).toBeNull();
  });

  it('returns persisted content when present (1-arg)', () => {
    __files.set('/test-root/profiles/default/interview-prep/some-job-id.md', '# Prep');
    expect(interview.readPersistedInterviewPrep('some-job-id')).toBe('# Prep');
  });

  it('returns null when missing (2-arg variant: profileId, jobId)', () => {
    expect(interview.readPersistedInterviewPrep('engineer', 'job-1')).toBeNull();
  });

  it('returns content when present (2-arg variant)', () => {
    __files.set('/test-root/profiles/engineer/interview-prep/job-1.md', '# Engineer prep');
    expect(interview.readPersistedInterviewPrep('engineer', 'job-1')).toBe('# Engineer prep');
  });

  it('slugifies the jobId for the on-disk filename', () => {
    __files.set('/test-root/profiles/default/interview-prep/abc-123.md', '# slugged');
    expect(interview.readPersistedInterviewPrep('ABC/123')).toBe('# slugged');
  });

  it('uses "job" fallback when slug would be empty', () => {
    __files.set('/test-root/profiles/default/interview-prep/job.md', '# fallback');
    expect(interview.readPersistedInterviewPrep('!!!')).toBe('# fallback');
  });
});
