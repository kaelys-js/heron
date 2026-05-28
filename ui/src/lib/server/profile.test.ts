/**
 * profile.test -- readProfile snapshot building. The function does ~150
 * lines of YAML field parsing with ?? default fallbacks per field, so
 * exercising readProfile with various YAML inputs closes a large chunk
 * of branch coverage.
 *
 * Mocks node:fs + yaml + profile-paths to feed deterministic YAML
 * content into readProfile and assert the snapshot shape. Each test
 * pins one default-vs-explicit branch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let __yamlContent: string | null = null;
let __profileExists = true;
let __exampleYaml = 'candidate:\n  full_name: Example User\n';

vi.mock('./profile-paths', () => ({
  profilePath: (_profileId: string, kind: string) => `/test/profile-paths/${kind}.yml`,
  ensureProfileDirs: vi.fn(),
  userSharedPath: (kind: string) => `/test/shared/${kind}`,
}));

vi.mock('./profiles', () => ({
  getActiveProfileId: () => 'default',
}));

vi.mock('./events', () => ({
  logEvent: vi.fn(),
}));

vi.mock('./files', async () => {
  const actual = await vi.importActual<typeof import('./files')>('./files');
  return {
    ...actual,
    ROOT: '/test-root',
    readSafe: (p: string) => {
      if (p.includes('profile.example.yml')) {
        return __exampleYaml;
      }
      if (p.includes('_profile.template.md')) {
        return '# template';
      }
      if (__yamlContent !== null) {
        return __yamlContent;
      }
      return '';
    },
  };
});

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: (p: string) => {
        if (p.includes('profile.yml') || p.includes('profile-yml')) {
          return __profileExists;
        }
        return false;
      },
      statSync: () => ({ size: 100 }) as ReturnType<typeof actual.statSync>,
    },
    existsSync: (p: string) => {
      if (p.includes('profile.yml') || p.includes('profile-yml')) {
        return __profileExists;
      }
      return false;
    },
    statSync: () => ({ size: 100 }) as ReturnType<typeof actual.statSync>,
  };
});

const { readProfile } = await import('./profile');

beforeEach(() => {
  __yamlContent = null;
  __profileExists = true;
  __exampleYaml = 'candidate:\n  full_name: Example User\n';
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('readProfile -- defaults when file is missing', () => {
  it('returns snapshot with empty defaults when profile.yml is absent (no example either)', () => {
    __profileExists = false;
    __exampleYaml = '';
    const snap = readProfile();
    expect(snap.exists).toBe(false);
    expect(snap.candidate?.full_name).toBe('');
    expect(snap.candidate?.email).toBe('');
    expect(snap.archetypes).toEqual([]);
    expect(snap.target_roles?.primary).toEqual([]);
    expect(snap.narrative?.headline).toBe('');
    expect(snap.narrative?.superpowers).toEqual([]);
    expect(snap.narrative?.proof_points).toEqual([]);
    expect(snap.compensation?.target_range).toBe('');
    expect(snap.location?.city).toBe('');
    expect(snap.preferences?.must_have).toEqual([]);
    expect(snap.preferences?.strong_plus).toEqual([]);
    expect(snap.preferences?.hard_no).toEqual([]);
    expect(snap.language?.modes_dir).toBe('');
    expect(snap.automation?.autonomous_apply).toBe(false);
    expect(snap.automation?.warmup_days).toBe(7);
    expect(snap.automation?.min_score_to_apply).toBe(4.0);
    expect(snap.automation?.enabled_portals).toEqual(['linkedin', 'greenhouse', 'ashby']);
    expect(snap.automation?.enabled_at).toBeUndefined();
  });

  it('falls back to the example file when profile.yml is absent', () => {
    __profileExists = false;
    __exampleYaml = 'candidate:\n  full_name: Templated User\n  email: t@example.com\n';
    const snap = readProfile();
    expect(snap.candidate?.full_name).toBe('Templated User');
    expect(snap.candidate?.email).toBe('t@example.com');
  });
});

describe('readProfile -- candidate fields', () => {
  it('reads every candidate.* string default to empty when missing', () => {
    __yamlContent = '';
    const snap = readProfile();
    expect(snap.candidate?.full_name).toBe('');
    expect(snap.candidate?.email).toBe('');
    expect(snap.candidate?.phone).toBe('');
    expect(snap.candidate?.location).toBe('');
    expect(snap.candidate?.linkedin).toBe('');
    expect(snap.candidate?.github).toBe('');
    expect(snap.candidate?.portfolio_url).toBe('');
    expect(snap.candidate?.twitter).toBe('');
  });

  it('reads explicit candidate values', () => {
    __yamlContent = `candidate:
  full_name: Alex Q
  email: alex@example.com
  phone: 555-1234
  location: SF
  linkedin: https://linkedin.com/in/alex
  github: https://github.com/alex
  portfolio_url: https://alex.dev
  twitter: https://twitter.com/alex
`;
    const snap = readProfile();
    expect(snap.candidate?.full_name).toBe('Alex Q');
    expect(snap.candidate?.email).toBe('alex@example.com');
    expect(snap.candidate?.linkedin).toBe('https://linkedin.com/in/alex');
    expect(snap.candidate?.twitter).toBe('https://twitter.com/alex');
  });
});

describe('readProfile -- target_roles + archetypes', () => {
  it('parses target_roles.primary as array', () => {
    __yamlContent = 'target_roles:\n  primary:\n    - Senior Engineer\n    - Staff Engineer\n';
    const snap = readProfile();
    expect(snap.target_roles?.primary).toEqual(['Senior Engineer', 'Staff Engineer']);
  });

  it('returns empty primary array when not an array', () => {
    __yamlContent = 'target_roles:\n  primary: not-an-array\n';
    const snap = readProfile();
    expect(snap.target_roles?.primary).toEqual([]);
  });

  it('parses archetypes array with name/level/fit fields', () => {
    __yamlContent = `target_roles:
  archetypes:
    - name: Backend Engineer
      level: Senior
      fit: high
    - name: Platform Engineer
      level: Staff
`;
    const snap = readProfile();
    expect(snap.archetypes).toHaveLength(2);
    expect(snap.archetypes[0]).toEqual({ name: 'Backend Engineer', level: 'Senior', fit: 'high' });
    expect(snap.archetypes[1]).toEqual({
      name: 'Platform Engineer',
      level: 'Staff',
      fit: undefined,
    });
  });

  it('defaults missing archetype names to empty string', () => {
    __yamlContent = 'target_roles:\n  archetypes:\n    - level: Staff\n';
    const snap = readProfile();
    expect(snap.archetypes[0].name).toBe('');
  });

  it('returns empty archetypes when not array', () => {
    __yamlContent = 'target_roles:\n  archetypes: not-array\n';
    const snap = readProfile();
    expect(snap.archetypes).toEqual([]);
  });
});

describe('readProfile -- narrative + proof_points', () => {
  it('reads narrative defaults', () => {
    __yamlContent = '';
    const snap = readProfile();
    expect(snap.narrative?.headline).toBe('');
    expect(snap.narrative?.exit_story).toBe('');
    expect(snap.narrative?.superpowers).toEqual([]);
    expect(snap.narrative?.proof_points).toEqual([]);
  });

  it('reads explicit narrative values', () => {
    __yamlContent = `narrative:
  headline: Builds fast
  exit_story: Tired of legacy code
  superpowers:
    - Distributed systems
    - DX
  proof_points:
    - name: Refactor X
      hero_metric: 50% latency drop
      url: https://blog.example.com/x
      description: Big rewrite
`;
    const snap = readProfile();
    expect(snap.narrative?.headline).toBe('Builds fast');
    expect(snap.narrative?.exit_story).toBe('Tired of legacy code');
    expect(snap.narrative?.superpowers).toEqual(['Distributed systems', 'DX']);
    expect(snap.narrative?.proof_points).toHaveLength(1);
    expect(snap.narrative?.proof_points?.[0].name).toBe('Refactor X');
    expect(snap.narrative?.proof_points?.[0].hero_metric).toBe('50% latency drop');
  });

  it('defaults missing proof_point name to empty', () => {
    __yamlContent = 'narrative:\n  proof_points:\n    - hero_metric: 50%\n';
    const snap = readProfile();
    expect(snap.narrative?.proof_points?.[0].name).toBe('');
  });
});

describe('readProfile -- compensation + location', () => {
  it('reads compensation defaults to empty strings', () => {
    __yamlContent = '';
    const snap = readProfile();
    expect(snap.compensation?.target_range).toBe('');
    expect(snap.compensation?.currency).toBe('');
    expect(snap.compensation?.minimum).toBe('');
    expect(snap.compensation?.location_flexibility).toBe('');
    expect(snap.compensation?.notes).toBe('');
  });

  it('reads location defaults to empty strings', () => {
    __yamlContent = '';
    const snap = readProfile();
    expect(snap.location?.city).toBe('');
    expect(snap.location?.country).toBe('');
    expect(snap.location?.timezone).toBe('');
    expect(snap.location?.visa_status).toBe('');
  });
});

describe('readProfile -- preferences', () => {
  it('reads preferences defaults to empty arrays', () => {
    __yamlContent = '';
    const snap = readProfile();
    expect(snap.preferences?.must_have).toEqual([]);
    expect(snap.preferences?.strong_plus).toEqual([]);
    expect(snap.preferences?.hard_no).toEqual([]);
  });

  it('parses preferences arrays', () => {
    __yamlContent = `preferences:
  must_have: [remote, equity]
  strong_plus: [TypeScript]
  hard_no: [on-call]
`;
    const snap = readProfile();
    expect(snap.preferences?.must_have).toEqual(['remote', 'equity']);
    expect(snap.preferences?.strong_plus).toEqual(['TypeScript']);
    expect(snap.preferences?.hard_no).toEqual(['on-call']);
  });

  it('coerces non-array preferences to empty array', () => {
    __yamlContent = 'preferences:\n  must_have: not-an-array\n';
    const snap = readProfile();
    expect(snap.preferences?.must_have).toEqual([]);
  });
});

describe('readProfile -- language', () => {
  it('defaults language.modes_dir to empty string', () => {
    __yamlContent = '';
    expect(readProfile().language?.modes_dir).toBe('');
  });

  it('reads explicit modes_dir', () => {
    __yamlContent = 'language:\n  modes_dir: modes/de\n';
    expect(readProfile().language?.modes_dir).toBe('modes/de');
  });

  it('falls back to "" if modes_dir is not a string', () => {
    __yamlContent = 'language:\n  modes_dir: 42\n';
    expect(readProfile().language?.modes_dir).toBe('');
  });
});

describe('readProfile -- automation', () => {
  it('autonomous_apply defaults to false when missing', () => {
    __yamlContent = '';
    expect(readProfile().automation?.autonomous_apply).toBe(false);
  });

  it('autonomous_apply: true sets to true', () => {
    __yamlContent = 'automation:\n  autonomous_apply: true\n';
    expect(readProfile().automation?.autonomous_apply).toBe(true);
  });

  it('autonomous_apply: anything-but-true coerces to false', () => {
    __yamlContent = 'automation:\n  autonomous_apply: "yes"\n';
    expect(readProfile().automation?.autonomous_apply).toBe(false);
  });

  it('warmup_days defaults to 7 when missing', () => {
    __yamlContent = '';
    expect(readProfile().automation?.warmup_days).toBe(7);
  });

  it('warmup_days reads explicit numeric value', () => {
    __yamlContent = 'automation:\n  warmup_days: 14\n';
    expect(readProfile().automation?.warmup_days).toBe(14);
  });

  it('warmup_days defaults to 7 when non-numeric', () => {
    __yamlContent = 'automation:\n  warmup_days: forever\n';
    expect(readProfile().automation?.warmup_days).toBe(7);
  });

  it('min_score_to_apply defaults to 4.0', () => {
    __yamlContent = '';
    expect(readProfile().automation?.min_score_to_apply).toBe(4.0);
  });

  it('min_score_to_apply reads explicit value', () => {
    __yamlContent = 'automation:\n  min_score_to_apply: 4.5\n';
    expect(readProfile().automation?.min_score_to_apply).toBe(4.5);
  });

  it('enabled_portals defaults to [linkedin, greenhouse, ashby]', () => {
    __yamlContent = '';
    expect(readProfile().automation?.enabled_portals).toEqual(['linkedin', 'greenhouse', 'ashby']);
  });

  it('enabled_portals reads explicit array', () => {
    __yamlContent = 'automation:\n  enabled_portals: [lever]\n';
    expect(readProfile().automation?.enabled_portals).toEqual(['lever']);
  });

  it('enabled_portals defaults when not array', () => {
    __yamlContent = 'automation:\n  enabled_portals: lever\n';
    expect(readProfile().automation?.enabled_portals).toEqual(['linkedin', 'greenhouse', 'ashby']);
  });

  it('enabled_at undefined when missing', () => {
    __yamlContent = '';
    expect(readProfile().automation?.enabled_at).toBeUndefined();
  });

  it('enabled_at reads numeric value', () => {
    __yamlContent = 'automation:\n  enabled_at: 1700000000000\n';
    expect(readProfile().automation?.enabled_at).toBe(1700000000000);
  });
});

describe('readProfile -- file paths in snapshot', () => {
  it('emits files.profile / files.profileMd / files.cv shape', () => {
    __yamlContent = '';
    const snap = readProfile();
    expect(snap.files.profile).toBeTruthy();
    expect(snap.files.profileMd).toBeTruthy();
    expect(snap.files.cv).toBeTruthy();
  });

  it('exists=true when profile-yml exists', () => {
    __profileExists = true;
    expect(readProfile().exists).toBe(true);
  });

  it('exists=false when profile-yml is absent', () => {
    __profileExists = false;
    __exampleYaml = '';
    expect(readProfile().exists).toBe(false);
  });
});
