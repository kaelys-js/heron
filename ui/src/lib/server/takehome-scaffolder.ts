/** takehome-scaffolder -- when a job hits TakeHome status, build the
 *  working directory + README + submission-etiquette checklist. Most
 *  candidates over-spend on take-homes by 2-3× the stated cap; the
 *  scaffolder enforces structure (budget commit, README template,
 *  checklist). Timer lives client-side in localStorage -- survives
 *  reloads without a server daemon.
 *  Layout: interview-prep/{company}-{role}-take-home/ contains README.md,
 *  CHECKLIST.md, state.json {startedAt, budgetMinutes, status}.
 *  Idempotent: re-scaffolding updates state.json, never clobbers README. */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './files';
import { profilePath } from './profile-paths';
import { loadAllJobs } from './parsers';

export type TakeHomeState = {
  jobId: string;
  company: string;
  role: string;
  startedAt: number;
  /** User-chosen time budget in minutes. Default 240 (4h) -- most take-homes
   *  say 4h but candidates spend 8-12h. We anchor LOW deliberately. */
  budgetMinutes: number;
  /** Optional brief snippet extracted from the email (first 800 chars). */
  briefExcerpt?: string;
  status: 'active' | 'submitted' | 'abandoned';
  /** ISO timestamps of milestone commits, for retrospective. */
  milestones?: { ts: number; label: string }[];
};

function slugify(s: string): string {
  return (
    (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'job'
  );
}

function workingDir(profileId: string, company: string, role: string): string {
  return path.join(
    profilePath(profileId, 'interview-prep-dir'),
    `${slugify(company)}-${slugify(role)}-take-home`,
  );
}

const README_TEMPLATE = (
  company: string,
  role: string,
  brief: string,
) => `# Take-home · ${company} · ${role}

## Brief (paste in full)

${brief || '_(paste the take-home brief here verbatim)_'}

## My time budget (commit to this BEFORE starting)

- **Hard cap: __ hours.** Hit STOP at this number even if "almost done."
- The stated cap is what they want; YOUR target is **75% of stated cap.**
  Most candidates over-spend; finishing 25% early lets you polish the
  submission and beats most submissions.

## Decisions

_(Track every design decision + why. Reviewers WILL ask "why did you
pick X over Y?" — having this list ready is the difference between
"thoughtful" and "winging it.")_

- **Decision 1:** _what_ — _why_
- **Decision 2:** _what_ — _why_
- ...

## Trade-offs I deliberately did NOT make

_(The strongest signal in a take-home review: showing you knew about
something better but consciously punted in service of the time budget.
Reviewers love this; it tells them you'd be calibrated in production.)_

- _Did NOT add X — because time. With more time I'd ..._
- ...

## What I'd do with another 4 hours

- ...

## How to run

\`\`\`
git clone <repo>
cd <repo>
<install + run commands>
\`\`\`

## Tests

\`\`\`
<test command + sample output>
\`\`\`

## Time spent

_(Actual hours by phase. Honesty here builds trust — reviewers can
detect over-spend from code/commit timestamps anyway.)_

- Reading + planning: __ min
- Core implementation: __ min
- Tests: __ min
- README + cleanup: __ min
- **Total: __ min** (budget was ___ min)
`;

const CHECKLIST_TEMPLATE = (
  company: string,
  role: string,
) => `# Submission checklist · ${company} · ${role}

## Before you submit

- [ ] README documents how to run + test in <5 lines
- [ ] At least one test for the core happy path
- [ ] No commented-out code, no debug \`console.log\`s
- [ ] Commit history is clean (squashed if useful, not 47 "wip" commits)
- [ ] Decisions doc covers 2-3 real trade-offs
- [ ] "What I'd do next" section honest + concrete (not "polish UI")
- [ ] Time-spent line filled in honestly
- [ ] Tested the actual git-clone path works on a fresh machine
- [ ] If demo video required: re-recorded for clarity, < 3 minutes

## Submission etiquette

- **Submit when you say you will.** Late = signals can't manage time.
  Way-early can signal you sandbagged. On-time is best.
- **One email, all artifacts.** Repo link + README highlights + demo if
  applicable. Don't make the reviewer chase you for clarifications.
- **Acknowledge constraints.** "Stayed within 4h cap; with more time I'd
  ___" earns respect; "had to cut corners" sounds like an excuse.

## What reviewers actually score on

Most rubrics secretly weight (in this order):

1. **Did you finish?** A working partial > a broken full.
2. **Did you make defensible decisions?** Read your README.
3. **Did you test?** Even one happy-path test moves you up a tier.
4. **Is it readable?** They'll scan in 10 minutes. Optimize for skim.
5. **Did you stick to the spec?** Scope creep is a red flag.

Polish, performance, and UI matter MUCH LESS than candidates think.
`;

/** Scaffold the take-home dir for a job. Idempotent -- re-running won't
 *  overwrite a hand-edited README. */
export function scaffoldTakeHome(input: {
  jobId: string;
  profileId: string;
  company: string;
  role: string;
  briefExcerpt?: string;
  budgetMinutes?: number;
}): { dir: string; state: TakeHomeState; createdFiles: string[] } {
  const dir = workingDir(input.profileId, input.company, input.role);
  fs.mkdirSync(dir, { recursive: true });

  const createdFiles: string[] = [];
  const readmePath = path.join(dir, 'README.md');
  // CodeQL js/file-system-race: write with 'wx' (exclusive create) so
  // we only create the file when it doesn't exist and never overwrite
  // a hand-edited version. EEXIST is treated as "already there, skip".
  try {
    fs.writeFileSync(
      readmePath,
      README_TEMPLATE(input.company, input.role, input.briefExcerpt ?? ''),
      { flag: 'wx' },
    );
    createdFiles.push(path.relative(ROOT, readmePath));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw e;
    }
  }
  const checklistPath = path.join(dir, 'CHECKLIST.md');
  // CodeQL js/file-system-race: same exclusive-create pattern.
  try {
    fs.writeFileSync(checklistPath, CHECKLIST_TEMPLATE(input.company, input.role), { flag: 'wx' });
    createdFiles.push(path.relative(ROOT, checklistPath));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw e;
    }
  }

  const statePath = path.join(dir, 'state.json');
  let state: TakeHomeState;
  // CodeQL js/file-system-race: read directly; ENOENT means we need to
  // seed a fresh state. Exclusive-create on the write so two concurrent
  // scaffolds can't clobber each other.
  let existingState: string | null = null;
  try {
    existingState = fs.readFileSync(statePath, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw e;
    }
  }
  if (existingState !== null) {
    state = JSON.parse(existingState) as TakeHomeState;
  } else {
    state = {
      jobId: input.jobId,
      company: input.company,
      role: input.role,
      startedAt: Date.now(),
      budgetMinutes: input.budgetMinutes ?? 240,
      briefExcerpt: input.briefExcerpt,
      status: 'active',
      milestones: [],
    };
    try {
      fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { flag: 'wx' });
      createdFiles.push(path.relative(ROOT, statePath));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw e;
      }
      // Someone else seeded it between our read and write -- adopt theirs.
      state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as TakeHomeState;
    }
  }
  return { dir: path.relative(ROOT, dir), state, createdFiles };
}

/** Read the state of an existing take-home scaffold. */
export function readTakeHomeState(
  profileId: string,
  company: string,
  role: string,
): TakeHomeState | null {
  const dir = workingDir(profileId, company, role);
  const statePath = path.join(dir, 'state.json');
  if (!fs.existsSync(statePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8')) as TakeHomeState;
  } catch {
    return null;
  }
}

/** Update state (status, milestones, budget tweaks). */
export function updateTakeHomeState(
  profileId: string,
  company: string,
  role: string,
  patch: Partial<TakeHomeState>,
): TakeHomeState | null {
  const dir = workingDir(profileId, company, role);
  const statePath = path.join(dir, 'state.json');
  // CodeQL js/file-system-race: read directly and treat ENOENT as "no
  // scaffold to update". Any other parse/IO error also returns null.
  let raw: string;
  try {
    raw = fs.readFileSync(statePath, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    return null;
  }
  try {
    const cur = JSON.parse(raw) as TakeHomeState;
    const next: TakeHomeState = { ...cur, ...patch };
    fs.writeFileSync(statePath, `${JSON.stringify(next, null, 2)}\n`);
    return next;
  } catch {
    return null;
  }
}

/** Find the take-home scaffold for a given job-id (look up via job's
 *  company/role). */
export function findTakeHomeForJob(jobId: string): { state: TakeHomeState; dir: string } | null {
  const job = loadAllJobs('all').find((j) => j.id === jobId);
  if (!job || !job.profileId) {
    return null;
  }
  const dir = workingDir(job.profileId, job.company ?? '', job.role ?? '');
  const statePath = path.join(dir, 'state.json');
  if (!fs.existsSync(statePath)) {
    return null;
  }
  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as TakeHomeState;
    return { state, dir: path.relative(ROOT, dir) };
  } catch {
    return null;
  }
}
