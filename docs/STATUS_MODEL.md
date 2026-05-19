# Status Model — pipeline vs application status

<!-- AUTO-GENERATED:doc-meta -->
*Part of the [Heron](../README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

This document captures a decision that's easy to miss when reading the
codebase: **heron tracks two different state values per job, not one**.
They look similar, the field names overlap, and several earlier audits
flagged them as "the same thing in two vocabularies" — but they're not.
They're orthogonal.

## The two axes

### 1. Pipeline stage (UI internal)

Where the job lives in the **job-search funnel**. Defined in
`ui/src/lib/types.ts:Status` (11 values):

`New | Scoring | Scored | Ready | Queued | Applied | Screened | Interview | Offer | Rejected | Closed`

This is dashboard-owned. It exists to drive board columns, filter
counts, urgency badges, and the kanban-style flow on `/pipeline`. A
job's pipeline stage moves forward roughly monotonically as the user
works through it.

Used by:
- `parseApplications()` and `mapStatus()` in `parsers.ts` to fold the
  applications.md row's status cell into one of these 11 stages.
- `STATUS_ORDER` / `STATUS_TINTS` for board rendering.
- Every `+page.server.ts` job-list loader for filtering and grouping.

### 2. Application status (states.yml canonical)

The **outcome status** as recorded on the applications.md row by the
Claude CLI's `oferta` / `apply` modes. Defined in
`data/states.yml` (8 values):

`evaluated | applied | responded | interview | offer | rejected | discarded | skip`

This is CLI-owned. The states.yml file is the contract for any
external tool (multi-profile sync, off-platform tracking, batch
import/export) that needs to interpret an applications.md row.

Used by:
- `pipeline.integration.test.ts` validates canonical-state-only rows on every push (replaced the legacy `verify-pipeline.mjs` script).
- `scripts/tracker/normalize-statuses.mjs` to clean up legacy Spanish / mixed-case writes.
- `scripts/tracker/merge-tracker.mjs` and `scripts/tracker/dedup-tracker.mjs` for CLI-side state semantics.

## Why they're not the same

A single job can validly be in any cross-product of the two:

| Pipeline | Application status | Meaning |
|---|---|---|
| Scored | evaluated | Deep eval done, no action taken yet |
| Scored | discarded | Deep eval done, decided not to apply (CLI POV) |
| Closed | discarded | Same as above but dashboard sees it as Closed |
| Applied | applied | Just submitted |
| Screened | responded | Recruiter wrote back, no interview yet |
| Interview | interview | In the loop |
| Rejected | rejected | They said no |

The dashboard's pipeline stage is the **user's mental model**: "where
am I with this job?" The CLI's application status is the **record's
mental model**: "what did the AI determine / did I report?"

## How the dashboard reconciles them

`parsers.ts:mapStatus()` reads the status cell from applications.md
and returns a Pipeline `Status`. Currently it folds states.yml values
into the most natural pipeline stage:

| states.yml | Pipeline stage |
|---|---|
| evaluated | Scored |
| applied | Applied |
| responded | Screened |
| interview | Interview |
| offer | Offer |
| rejected | Rejected |
| discarded | Closed |
| skip | Closed |

In addition, `Job` objects
carry a separate `applicationStatus?: 'evaluated' | ...` field parsed
straight from the row. The `JobCard.svelte` and job detail page render
this as a **secondary chip** alongside the primary Pipeline badge so
nuance like "discarded" vs "skip" isn't lost in the fold.

## Where the contract lives

- **Pipeline `Status`**: `ui/src/lib/types.ts`. The 11 stages. Dashboard-internal.
- **Application status canonical IDs**: `data/states.yml`. The 8 states. CLI-side.
- **Mapping function**: `ui/src/lib/server/parsers.ts:mapStatus()`. Reads applications.md cells, folds into pipeline `Status`.
- **Display chip**: `ui/src/lib/components/JobCard.svelte` and `ui/src/routes/job/[id]/+page.svelte` render the secondary chip.

## Related docs

- `DATA_CONTRACT.md` for which files the two systems write.
- `AGENTS.md` "Canonical States" section for CLI behavior rules.
- The audit that surfaced this: B+D+F+P cleanup plan, item B8.
