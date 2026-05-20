#!/usr/bin/env node
/** Seed a deterministic demo profile for screenshot capture + visual
 *  regression. Writes to a target data root chosen via:
 *
 *    HERON_SEED_DATA_ROOT   -- explicit FS root (capture-screenshots
 *                              passes the same path the app reads from)
 *    HERON_DATA_DIR         -- back-compat fallback (tmpdir-scoped)
 *
 *  Refuses to run unless the resolved root is either a tmpdir path OR
 *  the repo-relative `data/` dir AND the per-user subdir resolves to
 *  the reserved `demo-screenshots` ID. Defence against accidental
 *  corruption of a real install (a real user can't pick the reserved
 *  ID, and writes are scoped to that one subtree).
 *
 *  Output layout (per the multi-user data contract):
 *    {ROOT}/users/demo-screenshots/profiles/default/
 *      ├── cv.md
 *      ├── profile.yml
 *      ├── applications.md   (8 rows, status diversity)
 *      ├── pipeline.md       (3 pending URLs)
 *      ├── reports/001-acme-2026-05-19.md
 *      ├── interview-prep/acme-staff-eng.md
 *      └── (empty: output/ jds/ writing-samples/ batch/)
 *
 *  Used by: capture-screenshots.mjs + visual-regression workflow. */
import fs from 'node:fs';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const REPO_DATA_DIR = path.join(REPO_ROOT, 'data');

const DATA_DIR = process.env.HERON_SEED_DATA_ROOT || process.env.HERON_DATA_DIR;
if (!DATA_DIR) {
  console.error('::error::HERON_DATA_DIR must be set (and inside tmpdir).');
  process.exit(2);
}

// Safety gate -- the resolved data root must be either a tmpdir-scoped
// path OR the repo's data/ dir. Anywhere else (a user's home, a
// production /var/lib/...) fails closed.
function isSafeSeedTarget(target) {
  try {
    fs.mkdirSync(target, { recursive: true });
    const targetReal = realpathSync(target);
    const tmpReal = realpathSync(tmpdir());
    if (targetReal === tmpReal || targetReal.startsWith(tmpReal + path.sep)) return true;
    if (fs.existsSync(REPO_DATA_DIR)) {
      const repoDataReal = realpathSync(REPO_DATA_DIR);
      if (targetReal === repoDataReal || targetReal.startsWith(repoDataReal + path.sep))
        return true;
    }
    return false;
  } catch {
    return false;
  }
}

if (!isSafeSeedTarget(DATA_DIR)) {
  console.error(
    '::error::seed-demo-data refuses to write outside a tmpdir-scoped data root.\n' +
      '  Target=' +
      DATA_DIR +
      '\n  Expected: a path under os.tmpdir() or the repo-local data/ dir.',
  );
  process.exit(3);
}

const USER_ID = 'demo-screenshots';
const PROFILE_ID = 'default';
const PROFILE_ROOT = path.join(DATA_DIR, 'users', USER_ID, 'profiles', PROFILE_ID);
const SHARED_ROOT = path.join(DATA_DIR, 'users', USER_ID, 'profiles', '_shared');

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function write(rel, body) {
  const abs = path.join(PROFILE_ROOT, rel);
  mkdirp(path.dirname(abs));
  fs.writeFileSync(abs, body);
}

// ── Fixture content (deterministic; no Date.now / no randomness). ───

const PROFILE_YML = `# Heron Profile Configuration -- demo for screenshot capture.
candidate:
  full_name: "Alex Demo"
  email: "alex@demo.example"
  phone: "+1-555-0100"
  location: "Berlin, Germany"
  linkedin: "linkedin.com/in/alexdemo"
  portfolio_url: "https://alexdemo.example"
  github: "github.com/alexdemo"

target_roles:
  primary:
    - "Senior AI Engineer"
    - "Staff Backend Engineer"
  archetypes:
    - name: "AI/ML Engineer"
      level: "Senior/Staff"
      fit: "primary"
    - name: "Platform Engineer"
      level: "Senior"
      fit: "secondary"

comp:
  target_base_eur: 110000
  target_total_eur: 140000
  minimum_acceptable_eur: 95000

location_policy:
  remote_ok: true
  hybrid_ok: true
  onsite_ok: false
  preferred_timezone: "CET ±2h"
`;

const CV_MD = `# Alex Demo

Senior AI/Platform Engineer · Berlin · alex@demo.example

## Summary

Eight years of backend + ML systems work. Built two production
recommendation engines (one with 12M MAU), shipped three internal
ML platforms, and led the on-call rotation for a payments tier-1.
Currently looking for senior IC or staff roles where the work is
half platform, half model.

## Experience

### Senior Engineer -- Coral (2023-present)

- Owned the recommendations stack end-to-end: ingestion → features
  → serving. p99 latency 18ms.
- Migrated training off Spark onto Ray, cut weekly training cost
  72% and time-to-fresh-model from 8h to 90 min.

### Engineer -- Marlin (2020-2023)

- Shipped the v2 search pipeline (Elasticsearch → Vespa). 4× recall
  at half the infra spend.
- Built the ML platform team's feature store from scratch (Python
  + DuckDB + S3). 40+ models in production at handoff.

### Engineer -- Salmon (2018-2020)

- First ML engineer. Built fraud-detection v1 from raw logs.
  Reduced manual review queue 81%.

## Education

MSc Computer Science, TU Berlin (2018)
BSc Mathematics, Uni Hamburg (2016)

## Skills

Python · Go · Rust · Vespa · Elasticsearch · Ray · DuckDB · PostgreSQL
· Kafka · gRPC · Kubernetes · Terraform · system design · MLOps
`;

// URLs are the join key between pipeline.md and applications.md. parsers.ts
// uses urlId = md5(url).slice(0, 12). pipeline.md is the canonical source
// of "all jobs"; applications.md only enriches them with status/score.
const JOB_ROWS = [
  {
    url: 'https://boards.greenhouse.io/acme/jobs/4099991',
    company: 'Acme',
    role: 'Staff Engineer',
    score: '4.6/5',
    status: 'Evaluated',
    date: '2026-05-19',
    report: '[001](reports/001-acme-2026-05-19.md)',
    notes: 'Strong fit -- AI platform team',
  },
  {
    url: 'https://jobs.ashbyhq.com/cortex-labs/0011-2233-4455',
    company: 'Cortex Labs',
    role: 'Senior ML Engineer',
    score: '4.2/5',
    status: 'Applied',
    date: '2026-05-18',
    report: '[002](reports/002-cortex-2026-05-18.md)',
    notes: 'Ray + feature store overlap',
  },
  {
    url: 'https://jobs.lever.co/helix/aa-bb-cc-dd',
    company: 'Helix',
    role: 'Backend Engineer',
    score: '4.0/5',
    status: 'Interview',
    date: '2026-05-17',
    report: '[003](reports/003-helix-2026-05-17.md)',
    notes: 'Tech screen Mon',
  },
  {
    url: 'https://boards.greenhouse.io/vector-ai/jobs/501012',
    company: 'Vector AI',
    role: 'Senior Engineer',
    score: '3.8/5',
    status: 'Responded',
    date: '2026-05-15',
    report: '[004](reports/004-vector-2026-05-15.md)',
    notes: 'Recruiter call scheduled',
  },
  {
    url: 'https://jobs.ashbyhq.com/plumb/3344-5566-7788',
    company: 'Plumb',
    role: 'Staff Backend',
    score: '4.4/5',
    status: 'Applied',
    date: '2026-05-12',
    report: '[005](reports/005-plumb-2026-05-12.md)',
    notes: 'Vespa stack -- direct overlap',
  },
  {
    url: 'https://boards.greenhouse.io/reflex/jobs/610010',
    company: 'Reflex',
    role: 'ML Platform Lead',
    score: '3.5/5',
    status: 'SKIP',
    date: '2026-05-10',
    report: '',
    notes: 'Location mismatch -- onsite NYC',
  },
  {
    url: 'https://jobs.lever.co/slate/zz-yy-xx',
    company: 'Slate',
    role: 'Senior Engineer',
    score: '4.1/5',
    status: 'Rejected',
    date: '2026-05-08',
    report: '[007](reports/007-slate-2026-05-08.md)',
    notes: 'Comp band 30% below target',
  },
  {
    url: 'https://jobs.ashbyhq.com/forge/9911-2233-4455',
    company: 'Forge',
    role: 'Staff AI Engineer',
    score: '4.7/5',
    status: 'Offer',
    date: '2026-05-05',
    report: '[008](reports/008-forge-2026-05-05.md)',
    notes: 'Verbal offer -- 142k base',
  },
];

// Embed each row's URL in the Notes column so parseApplications can join
// to pipeline.md without requiring N report files (the parser uses a
// liberal `/https?:\/\/\S+/` match anywhere on the row).
const APPLICATIONS_MD =
  '# Applications Tracker\n\n' +
  '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n' +
  '|---|------|---------|------|-------|--------|-----|--------|-------|\n' +
  JOB_ROWS.map(
    (j, i) =>
      `| ${i + 1} | ${j.date} | ${j.company} | ${j.role} | ${j.score} | ${j.status} | ${j.report ? '✅' : '❌'} | ${j.report} | ${j.notes} (${j.url}) |`,
  ).join('\n') +
  '\n';

// pipeline.md is what loadAllJobs() iterates -- one line per URL.
// Format per parsers.ts:parsePipeline RX: `- [ ] {url} | {company} | {title}`.
// Plus 4 fresh pending URLs at the bottom so the inbox shows "Up next".
const PIPELINE_MD =
  '# Pipeline\n\n' +
  JOB_ROWS.map((j) => `- [ ] ${j.url} | ${j.company} | ${j.role}`).join('\n') +
  '\n' +
  '- [ ] https://boards.greenhouse.io/aurora/jobs/7012001 | Aurora | Senior AI Engineer\n' +
  '- [ ] https://jobs.lever.co/cobalt/dd-ee-ff | Cobalt | Staff Platform Engineer\n' +
  '- [ ] https://jobs.ashbyhq.com/quartz/8822-9933-aabb | Quartz | Senior Backend Engineer\n' +
  '- [ ] https://boards.greenhouse.io/loom/jobs/8001110 | Loom | ML Engineer\n';

const REPORT_001 = `# 001 -- Acme · Staff Engineer (2026-05-19)

**URL:** https://boards.greenhouse.io/acme/jobs/4099991
**Score:** 4.6/5
**PDF:** \`output/cv-acme-staff-engineer.pdf\`
**Legitimacy:** verified · posted 6 days ago · 24 active applicants

## A. Role fit

Direct overlap with Coral recommendations work + Marlin feature-store
experience. JD calls for Ray, Vespa, p99 latency tuning -- all in
the last 18 months of CV. Level matches (Staff IC, no people-mgmt).

## B. CV match

Keyword density 87% (target ≥ 70%). Strong matches on: Ray, feature
store, online serving, p99 latency. Soft matches on: Vespa (CV says
Vespa migration; JD says "search infra a plus").

## C. Level strategy

JD says Staff. CV currently positions as Senior. Recommendation:
keep current Senior framing but emphasize the platform-leadership
scope on Marlin (40+ models, team handoff) -- that's the Staff
signal recruiters expect.

## D. Comp research

Levels.fyi band for Acme Staff Engineer (Berlin): €130-180k base,
€20-40k bonus, €60-120k equity. Target this role at €165k base +
ask for refresh on signing.

## E. Personalization plan

Acme's engineering blog Aug 2025 covered "Why we moved from Spark
to Ray for offline jobs" -- directly mirrors Marlin migration story.
Lead the cover letter with that parallel.

## F. Interview prep

Likely loops: system design (recommendations serving at scale),
coding (DS-heavy -- expect a graph or top-k problem), behavioural
(staff scope, conflict). STAR+R stories ready in story-bank.

## G. Posting Legitimacy

Verified · listed on Acme's careers site + Greenhouse · LinkedIn
shows 3 employees who joined in this team in last 90 days.
`;

const INTERVIEW_PREP_ACME = `# Interview Prep -- Acme · Staff Engineer

## Format expected
- 60 min behavioural + system design (round 1)
- 90 min coding + architecture deep-dive (round 2)
- 45 min hiring manager + comp talk (round 3)

## STAR+R stories (priority order)

### S1: Migration leadership (Spark → Ray at Coral)
- **Situation:** Coral's training pipeline was 8h cold + £40k/month.
- **Task:** Cut time + cost without freezing model launches.
- **Action:** Designed Ray-on-K8s deploy, proved on staging in 2wk
  sprint, ran A/B for 3 weeks (zero quality regression), cut over.
- **Result:** 90min training, £11k/month, zero downtime.
- **Reflection:** Should have invested earlier in the metric harness
  that proved no-regression -- it was the slowest step.

### S2: Cross-team rollout (Feature store at Marlin)
- (...full STAR+R structure here...)

### S3: Difficult engineering tradeoff (Vespa migration)
- (...full STAR+R structure here...)

## Questions to ask

- How is the platform/model split organized? Who owns what?
- What's the on-call story? Is the model serving tier on the
  platform rotation or the team's own?
- Where did the last Staff hire come from + what surprised them
  in the first 90 days?
`;

// ── Write everything ──────────────────────────────────────────────

mkdirp(PROFILE_ROOT);
mkdirp(SHARED_ROOT);
mkdirp(path.join(PROFILE_ROOT, 'reports'));
mkdirp(path.join(PROFILE_ROOT, 'output'));
mkdirp(path.join(PROFILE_ROOT, 'interview-prep'));
mkdirp(path.join(PROFILE_ROOT, 'jds'));
mkdirp(path.join(PROFILE_ROOT, 'writing-samples'));
mkdirp(path.join(PROFILE_ROOT, 'batch'));

write('profile.yml', PROFILE_YML);
write('cv.md', CV_MD);
write('applications.md', APPLICATIONS_MD);
write('pipeline.md', PIPELINE_MD);
write('reports/001-acme-2026-05-19.md', REPORT_001);
write('interview-prep/acme-staff-eng.md', INTERVIEW_PREP_ACME);

// portals.yml + _profile.md are required by isFreshInstall(). Stub
// content is enough -- the screenshot capture never spawns the agent.
write(
  'portals.yml',
  '# Demo portals.yml -- shape only, no real queries fire during screenshot capture.\n' +
    'queries:\n  - name: "AI Engineer · Berlin"\n    keywords: ["ai engineer", "ml engineer"]\n    portals: [greenhouse, ashby, lever]\n' +
    'companies:\n  - greenhouse:\n      - acme\n      - cortex-labs\n',
);
write(
  '_profile.md',
  '# Demo profile mode fragment\n\n' +
    'This file is loaded by the orchestrator into mode prompts as `__PROFILE_MD__`.\n' +
    'The screenshot capture pipeline never invokes the orchestrator, so this is shape-only.\n',
);

// data/profiles.json (per-install registry, active profile = default)
const profilesJson = path.join(DATA_DIR, 'users', USER_ID, 'profiles.json');
fs.writeFileSync(
  profilesJson,
  JSON.stringify(
    {
      activeId: PROFILE_ID,
      profiles: [
        {
          id: PROFILE_ID,
          name: 'AI/Backend track',
          createdAt: 1747612800000, // 2026-05-19T00:00:00Z fixed
        },
      ],
    },
    null,
    2,
  ),
);

// Insert the demo profile row into the app.db so readProfiles() returns a
// non-empty profiles list. Uses better-sqlite3 via dynamic import; the
// DDL mirrors ui/src/lib/server/db/migrate.ts:APP_DDL. Path:
// HERON_DATA_DIR/app.db.
try {
  const appDbPath = path.join(process.env.HERON_DATA_DIR || DATA_DIR, 'app.db');
  // pnpm's nested store layout means bare `better-sqlite3` doesn't resolve
  // from a script at scripts/system/. Walk the .pnpm/ store, pick the
  // first match. Pinning the version would couple the seeder to lockfile
  // updates; the glob keeps it self-healing.
  const pnpmStore = path.join(REPO_ROOT, 'node_modules', '.pnpm');
  const candidates = fs.existsSync(pnpmStore)
    ? fs
        .readdirSync(pnpmStore)
        .filter((n) => /^better-sqlite3@/.test(n))
        .map((n) => path.join(pnpmStore, n, 'node_modules', 'better-sqlite3', 'lib', 'index.js'))
        .filter((p) => fs.existsSync(p))
    : [];
  if (candidates.length === 0) {
    throw new Error('better-sqlite3 not found in node_modules/.pnpm/');
  }
  const { default: Database } = await import(candidates[0]);
  fs.mkdirSync(path.dirname(appDbPath), { recursive: true });
  const db = new Database(appDbPath);
  db.exec(`CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'blue',
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_slug_uniq ON profiles(user_id, slug);`);
  const ts = 1747612800000;
  db.prepare(
    `INSERT INTO profiles (id, user_id, slug, name, color, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, slug) DO UPDATE SET
       name=excluded.name, color=excluded.color, is_active=excluded.is_active,
       updated_at=excluded.updated_at`,
  ).run('demo-screenshots__default', USER_ID, PROFILE_ID, 'AI/Backend track', 'blue', 1, ts, ts);
  db.close();
} catch (err) {
  console.error('::warning::failed to seed profile DB row:', err?.message ?? err);
}

// onboarding-state.json -- mark as completed so +layout.server.ts doesn't
// redirect to /onboarding. Lives at userSharedPath('onboarding-state') =
// data/users/{uid}/profiles/_shared/onboarding-state.json.
fs.writeFileSync(
  path.join(SHARED_ROOT, 'onboarding-state.json'),
  JSON.stringify(
    {
      completed: true,
      completedAt: 1747612800000,
      steps: {
        'profile-basics': { complete: true, skipped: false },
        cv: { complete: true, skipped: false },
        'cv-quality': { complete: true, skipped: false },
        portals: { complete: true, skipped: false },
        'api-keys': { complete: true, skipped: false },
        'auto-apply': { complete: true, skipped: true },
      },
    },
    null,
    2,
  ),
);

// shared autopilot.json -- shows the autopilot screen has data.
fs.writeFileSync(
  path.join(SHARED_ROOT, 'autopilot.json'),
  JSON.stringify(
    {
      enabled: false,
      minScoreToApply: 4.0,
      dailyCap: 5,
      warmupDays: 3,
      circuitBreakerTrippedAt: null,
      schedules: [
        { id: 'scan-portals', kind: 'daily', hour: 9, minute: 0 },
        { id: 'auto-merge-batch', kind: 'continuous' },
        { id: 'daily-digest', kind: 'daily', hour: 7, minute: 0 },
      ],
    },
    null,
    2,
  ),
);

console.log('✓ seed-demo-data complete');
console.log('  user: ' + USER_ID);
console.log('  profile: ' + PROFILE_ID);
console.log('  root: ' + PROFILE_ROOT);
