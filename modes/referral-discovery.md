# Referral discovery — find people who can vouch for you at the target company

You're producing a ranked list of people the user could ask for a
referral at a specific company, along with a pre-drafted ask per person.

This is a NETWORK-ANALYSIS mode. It does NOT send messages. It writes
a JSON file the dashboard surfaces; the user reviews + sends each ask
manually (or copies into LinkedIn).

## Inputs ($args, parsed from `REFERRAL_INPUT` env JSON)

- `profileId`, `jobId`, `company`, `role`
- `maxResults` — int, default 10
- `locationFilter` — optional location string ("San Francisco", "Berlin")

Read: `__CV__` (employment history → past colleagues), the user's
LinkedIn export if it exists (`data/users/.../profiles/.../linkedin-export.csv`
when present), and `__PROFILE_MD__` for shared-organisation hints.

## Output

ONE JSON file at:

```text
__PROFILE__/referrals/{jobId}.json
```

Schema:

```json
{
  "company": "...",
  "role": "...",
  "generatedAt": 1700000000000,
  "candidates": [
    {
      "name": "...",
      "title": "...",
      "team": "...",
      "linkedinUrl": "https://...",
      "closeness": 87,
      "rationale": "Ex-colleague at AcmeCo (2018-2021) — same team in payments.",
      "draft": "Hi {firstName},\n\n..."
    }
  ]
}
```

`closeness` is a 0-100 score. Heuristics:

- 90-100: worked together at the same employer for ≥ 1 year, same team
- 75-89: worked together at the same employer (different teams)
- 60-74: same school within ±2 years, OR met at a known conference
- 45-59: 2nd-degree LinkedIn connection (mutual contact named)
- 30-44: published or open-sourced work the user contributed to
- < 30: weak — public profile only, no shared history. Probably skip.

Each `draft` field is a complete LinkedIn-style message, 4-6 sentences:

1. Greeting using their first name
2. ONE sentence explaining how you know them (or how you found them)
3. ONE sentence about the role you're applying for + WHY THIS COMPANY
4. ONE sentence about WHY YOU'RE A FIT — pull a specific CV proof point
5. Soft ask: "Would you be open to passing my CV to {team}? Happy to share more context."
6. Sign-off using the user's first name.

## After writing the file

Emit a final stdout line:

```yaml
REFERRALS_PATH: {relative-path-to-file}
```

## Search strategy

Cap total web requests at 8. Order:

1. Mine `__CV__` for past-employer overlap with the target company.
2. Mine `linkedin-export.csv` (if present) for direct connections currently at the target company.
3. LinkedIn public search via WebFetch for "{company} employees" — top 5 results, filter by `locationFilter`.
4. For each candidate without a clear connection, search `{name} {company} {role-keyword}` to infer team alignment.

When you can't find any candidates with closeness ≥ 30, return an
EMPTY candidates array + a top-level field:

```json
{
  ...,
  "candidates": [],
  "note": "No referral candidates with high-enough signal. Consider applying via career site + sending a thoughtful cold outreach."
}
```

## Quality bar

- Every `draft` is candidate-specific — references their team / specialty / a public signal.
- No "spray and pray" template asks.
- `closeness` reflects ACTUAL signal — don't pad it because the user wants matches.
- `rationale` is SHORT — one sentence the user can scan in 3 seconds.
