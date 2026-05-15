# Cross-link audit — does your CV, LinkedIn, GitHub, and portfolio tell the same story?

You're checking that the user's CV (cv.md) matches what a recruiter
will see when they Google the user. Inconsistencies between CV and
LinkedIn are one of the most common silent-rejection causes.

## Inputs ($args, parsed from `CROSS_LINK_INPUT` env JSON)

- `profileId`

Read: `cv.md`, `config/profile.yml` (resolves to the active profile's
`profile.yml`), and any URLs the user has linked in profile.yml under
`linkedin`, `github`, `portfolio`, `twitter` keys.

## Output

ONE JSON file at:

```text
{profile-dir}/cross-link-audit.json
```

Schema:

```json
{
  "auditedAt": 1700000000000,
  "findings": [
    {
      "level": "mismatch",
      "field": "currentRole",
      "cv": "Senior Software Engineer",
      "linkedin": "Lead Software Engineer",
      "advice": "Pick one and update the other. Recruiters compare directly — different titles read as inflated CV or stale LinkedIn."
    }
  ],
  "mismatches": 1,
  "gaps": 0,
  "ok": 5
}
```

`level` values:

- `mismatch` — the surfaces disagree on a fact (different title, different company, different year)
- `gap` — one surface mentions something the other doesn't (e.g. a key project visible on GitHub but absent from CV)
- `ok` — surfaces agree

`field` values: `name`, `currentRole`, `currentEmployer`, `yearsExperience`,
`projects`, `skills`. Add new fields when the audit surfaces something
specific (e.g. `school`, `certifications`).

## What to check

1. **Name match** — do all surfaces use the same full name?
2. **Current role + title** — CV's most-recent role matches LinkedIn's most-recent?
3. **Most-recent employer** — same company name? Same start date (year + month tolerance)?
4. **Years of experience** — implied total experience adds up within ±1 year across surfaces?
5. **Projects** — CV's named projects are visible on GitHub pinned repos OR portfolio?
6. **Skills** — top 5 CV skills appear on LinkedIn's skills section?
7. **School / Education** — CV's degree + year match LinkedIn?

Cap web requests at 4 (one per linked surface). If a URL isn't reachable,
add a `level: 'gap', field: 'profile-url-broken'` finding.

## Advice rules

Each finding has an `advice` string. Make it SPECIFIC:

- Don't say "fix this" → say "Pick {value-A} or {value-B}, update the other".
- Don't say "you should add X" → say "Add the {X} project to your CV's Projects section — it's pinned on GitHub but absent from the CV."

## After writing the file

The endpoint reads the file directly — no stdout sentinel required.
Optionally emit:

```yaml
AUDIT_PATH: {relative-path-to-file}
```

## Quality bar

- A `mismatch` should be REAL. Don't flag whitespace or capitalisation differences.
- A `gap` should be ACTIONABLE. If the user's portfolio has 50 projects, surfacing "CV has 5, portfolio has 50" isn't useful.
- Be charitable. "Lead Engineer" vs "Senior Engineer" might be a promotion the user didn't update. Mark it but advise gently.
