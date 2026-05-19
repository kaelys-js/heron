# Mode: first-90-days -- the document that turns offers into "yes"

You're drafting a 30/60/90 day plan for the new role. Two modes:

- `phase: closing` -- the document the user sends to the hiring manager
  as part of the final round to demonstrate seriousness. Strongest when
  it cites specific challenges from the JD or company blog. Often
  decides between two finalists.
- `phase: onboarding` -- written AFTER signing, used to align with the
  manager on what the first quarter looks like. More concrete (specific
  meetings, deliverables, owners).

## Inputs ($args, parsed from `FIRST_90_DAYS_INPUT` env JSON)

- `profileId`, `jobId`, `company`, `role`
- `phase` -- `closing` | `onboarding` (default `closing`)
- `focusAreas` -- string[] (optional) of priority areas the user wants emphasised
- `firstWeekGoals` -- string[] (only used when `phase: onboarding`)

Read: `__CV__`, the job's deep-eval report (especially Block A -- what
they're hiring for + Block B -- pain points the JD names), and the
company's interview-prep file if it exists.

## Output

ONE markdown file at:

```text
__OUTPUT__/{company-slug}-first-90-days-{phase}.md
```

Format:

```markdown
# First 90 Days · {role} at {company}

_(Lead with a 90-word summary: what success looks like end-of-Q1, the 3
priority areas, and the user's commitment style.)_

## My read of the situation

_(2-3 sentences citing the specific challenges from the JD or company
material. Sources MUST be cited. This is the section that signals
"I read closely". Skip if no specific signal is available — pad with
guesswork looks worse than skipping.)_

## Day 1-30 — Listen, learn, map

### What I'll be doing

- _(3-4 specific actions. "1:1 with every team member in the first 10 days." "Map the system from request to render." "Shadow on-call." Be concrete.)_

### What success looks like

- _(One observable outcome. E.g. "By end of week 4: a 1-pager with the team's top 3 risks, ranked, with my recommendation on which to fix first.")_

## Day 31-60 — Ship a visible, small win

### What I'll be doing

- _(2-3 specific actions tied to the role's core scope. E.g. for a Senior Eng: "Ship a small improvement to the deploy pipeline that cuts CI time. Document what I learn about the codebase along the way.")_

### What success looks like

- _(One measurable outcome. "Production has my code, and at least 2 teammates have reviewed it.")_

## Day 61-90 — Lead a measurable improvement

### What I'll be doing

- _(2-3 specific actions tied to the priority areas you supplied. Each one should be testable. E.g. "Lead a proposal for {X} backed by {evidence}." "Own the on-call rotation for at least 1 week.")_

### What success looks like

- _(Quantitative when possible. "Improve {metric} by {%}". "Run an architecture review that produces a writable decision.")_

## How I'll work

- _(2-3 sentences on collaboration cadence the user prefers + what they need from the manager.)_

## Risks I'm watching for

- _(2-3 honest things that could slow me down. Cultural questions, missing context, ambiguity in scope. This section signals maturity.)_

## What I need from you

- _(2-3 specific asks of the manager. "A standing 30 min weekly 1:1." "Intros to the 3 people most affected by my work." "Access to {system / doc / repo} on day 1.")_
```

After writing the file, emit a final stdout line:

```yaml
PLAN_PATH: {relative-path-to-file}
```

## Phase tuning

- `closing` phase: keep total at 1-1.5 pages. The hiring manager will skim. Front-load the 90-word summary. Cite ONE specific challenge from their material. Don't over-promise -- strong candidates show calibrated ambition, not infinite enthusiasm.
- `onboarding` phase: 2-3 pages. Concrete people + meetings + deliverables. This becomes a working document with the manager -- the structure should support edits and check-ins.

## Anti-patterns

- DON'T write "hit the ground running" -- banned phrase, sounds aspirational without specifics.
- DON'T promise to "drive culture change" in the first 90 days -- overconfident, often a red flag.
- DON'T fabricate company-specific details -- if you don't have the source, ask better questions in the interview and skip the section.
- DON'T pad with corporate-speak. Every sentence should be testable.
