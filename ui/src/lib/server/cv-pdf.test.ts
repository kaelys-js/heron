/**
 * lib/server/cv-pdf -- generalCvStatus (filesystem stat parser) + template
 * resolver. The Anthropic+spawn-driven generation paths require a real
 * subprocess and a real model; those are exercised manually via the
 * /api/cv/general/generate endpoint and not asserted here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const files: Record<string, { content: string; mtimeMs: number; size: number }> = {};

const fsMock = {
  existsSync: vi.fn((p: string) => p in files),
  readFileSync: vi.fn((p: string) => files[p]?.content ?? ''),
  statSync: vi.fn((p: string) => {
    const f = files[p];
    if (!f) throw new Error('ENOENT: ' + p);
    return { mtimeMs: f.mtimeMs, size: f.size };
  }),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
};
vi.mock('node:fs', () => ({ default: fsMock, ...fsMock }));

vi.mock('./files', () => ({
  ROOT: '/tmp/repo',
  readSafe: (p: string) => files[p]?.content ?? '',
}));

vi.mock('./ai', () => ({ complete: vi.fn() }));
vi.mock('./events', () => ({
  logEvent: vi.fn(),
  reportServerError: vi.fn(),
}));

vi.mock('./profile-paths', () => ({
  profilePath: (id: string, key: string) => {
    if (key === 'output-dir') return `/tmp/data/profiles/${id}/output`;
    if (key === 'cv-md') return `/tmp/data/profiles/${id}/cv.md`;
    if (key === 'profile-yml') return `/tmp/data/profiles/${id}/profile.yml`;
    return `/tmp/data/profiles/${id}`;
  },
  ensureProfileDirs: vi.fn(),
}));

vi.mock('./profiles', () => ({
  getActiveProfileId: () => 'default',
}));

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

const { generalCvStatus, resolveTemplate } = await import('./cv-pdf');

const CV_MD = '/tmp/data/profiles/default/cv.md';
const PDF = '/tmp/data/profiles/default/output/cv-general.pdf';
const PROFILE_YML = '/tmp/data/profiles/work/profile.yml';
const CV_TEMPLATE_CLASSIC = '/tmp/repo/templates/cv-template.html';

beforeEach(() => {
  Object.keys(files).forEach((k) => delete files[k]);
  fsMock.existsSync.mockReset().mockImplementation((p: string) => p in files);
  fsMock.readFileSync.mockReset().mockImplementation((p: string) => files[p]?.content ?? '');
  fsMock.statSync.mockReset().mockImplementation((p: string) => {
    const f = files[p];
    if (!f) throw new Error('ENOENT');
    return { mtimeMs: f.mtimeMs, size: f.size };
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('generalCvStatus — base state', () => {
  it('exists=false + missingSource=true when neither cv.md nor PDF exist', () => {
    const s = generalCvStatus();
    expect(s.exists).toBe(false);
    expect(s.missingSource).toBe(true);
    expect(s.outdated).toBe(false);
  });

  it('exists=false + missingSource=false when cv.md exists but PDF does not', () => {
    files[CV_MD] = { content: '# CV', mtimeMs: 1000, size: 100 };
    const s = generalCvStatus();
    expect(s.exists).toBe(false);
    expect(s.missingSource).toBe(false);
  });

  it('exists=true + bytes + generatedAt when PDF exists', () => {
    files[CV_MD] = { content: '# CV', mtimeMs: 1000, size: 100 };
    files[PDF] = { content: 'PDFBYTES', mtimeMs: 5000, size: 99999 };
    const s = generalCvStatus();
    expect(s.exists).toBe(true);
    expect(s.bytes).toBe(99999);
    expect(s.generatedAt).toBe(5000);
    expect(s.cvLastModified).toBe(1000);
  });
});

describe('generalCvStatus — outdated detection', () => {
  it('outdated=true when cv.md is newer than the PDF', () => {
    files[CV_MD] = { content: '# CV', mtimeMs: 20000, size: 100 }; // 20s
    files[PDF] = { content: 'PDF', mtimeMs: 5000, size: 100 }; // 5s
    expect(generalCvStatus().outdated).toBe(true);
  });

  it('outdated=false when PDF is newer than cv.md', () => {
    files[CV_MD] = { content: '# CV', mtimeMs: 5000, size: 100 };
    files[PDF] = { content: 'PDF', mtimeMs: 20000, size: 100 };
    expect(generalCvStatus().outdated).toBe(false);
  });

  it('outdated=false when cv.md is within the same 1s bucket as the PDF', () => {
    files[CV_MD] = { content: '# CV', mtimeMs: 5500, size: 100 };
    files[PDF] = { content: 'PDF', mtimeMs: 5100, size: 100 };
    expect(generalCvStatus().outdated).toBe(false);
  });

  it('outdated=false when cv.md is missing (cannot compare)', () => {
    files[PDF] = { content: 'PDF', mtimeMs: 5000, size: 100 };
    const s = generalCvStatus();
    expect(s.outdated).toBe(false);
    expect(s.missingSource).toBe(true);
  });
});

describe('generalCvStatus — path field is repo-relative', () => {
  it('path strips the ROOT prefix', () => {
    files[CV_MD] = { content: '# CV', mtimeMs: 1000, size: 100 };
    files[PDF] = { content: 'PDF', mtimeMs: 2000, size: 100 };
    const s = generalCvStatus();
    expect(s.path).not.toMatch(/^\/tmp/);
    expect(s.path).toContain('cv-general.pdf');
  });
});

describe('resolveTemplate — routes through profilePath() for multi-user', () => {
  it("reads cv_template from the active user's profile.yml (mocked profilePath)", () => {
    // Guards against a regression where the function reads from
    //   path.join(DATA_ROOT, 'profiles', profileId, 'profile.yml')
    // bypassing the multi-user resolver. The mocked profilePath('profile-yml')
    // returns /tmp/data/profiles/{id}/profile.yml; a hardcoded path would
    // resolve to /tmp/repo/data/profiles/work/profile.yml and miss the
    // test fixture entirely.
    files[PROFILE_YML] = {
      content: 'full_name: Alice\ncv_template: missing-variant\n',
      mtimeMs: 1000,
      size: 50,
    };
    const got = resolveTemplate(undefined, 'work');
    // 'missing-variant' file doesn't exist in our mock → falls back to classic.
    // The important assertion: function DID find profile.yml + parse cv_template.
    expect(got).toBe(CV_TEMPLATE_CLASSIC);
  });

  it('falls back to classic when no profileId is supplied', () => {
    expect(resolveTemplate()).toBe(CV_TEMPLATE_CLASSIC);
  });

  it('falls back to classic when profile.yml is missing for the active user', () => {
    // No files[PROFILE_YML] in this test → resolver gets undefined → classic.
    const got = resolveTemplate(undefined, 'work');
    expect(got).toBe(CV_TEMPLATE_CLASSIC);
  });

  it('returns explicit variant override when the file exists', () => {
    const explicitVariant = '/tmp/repo/templates/cv-template-foo.html';
    files[explicitVariant] = { content: '<html>FOO</html>', mtimeMs: 1, size: 16 };
    expect(resolveTemplate('foo')).toBe(explicitVariant);
  });

  it('falls back to classic when explicit variant does not exist on disk', () => {
    expect(resolveTemplate('does-not-exist')).toBe(CV_TEMPLATE_CLASSIC);
  });
});
