# Mode: seed-form-answers -- Pre-populate the per-question cache from CV + profile

You're seeding the user's persistent form-answers cache (the JSONL at
`data/profiles/{slug}/form-answers-cache.jsonl`) so that the autonomous-
apply pipeline doesn't hit `unknown-field` ManualApplyNeeded on the first
20 applications. Read the user's CV + profile + narrative, and write
realistic, ready-to-use answers to every common ATS form question.

## Inputs

- `__CV__` -- work history, skills, projects, education
- `__PROFILE_YML__` -- candidate (name, email, phone, location, links),
  compensation (target_range, minimum, walkaway), location (country,
  city, visa_status, onsite_availability), preferences (must_have,
  strong_plus, hard_no), target_roles (primary, archetypes), narrative
  (headline, exit_story, superpowers, proof_points)
- `__PROFILE_MD__` (if exists) -- additional narrative

## Output

For each of the questions below, produce a JSONL row to
**append** to `data/profiles/{slug}/form-answers-cache.jsonl`. One row
per line. Format (must match the existing cache schema exactly):

```json
{"key":"<normalized>","label":"<original question>","answer":"<answer text>","updatedAt":<ms-epoch>,"useCount":0}
```

`<normalized>` follows these rules (mirror `lib_apply.normalize_question`):
- lowercase
- strip every char that isn't `[a-z0-9 ]`
- collapse whitespace
- drop noise words: `a`, `an`, `the`, `please`, `kindly`, `do`, `you`
- re-collapse whitespace + trim

`<ms-epoch>` is the current epoch in milliseconds.

## The questions to seed (~25 entries -- write ALL of them if you can answer)

Skip a question only if the data genuinely isn't in __CV__ / `__PROFILE_YML__`.
Never fabricate -- for any answer where the source is missing or
ambiguous, omit the row (the dispatcher will surface a `ManualApplyNeeded`
once and the user fills it then).

### Identity + logistics (most-asked)
- "First name" → from `candidate.full_name`, first token
- "Last name" → from `candidate.full_name`, last token
- "Full name" / "Legal name" → `candidate.full_name`
- "Email" → `candidate.email`
- "Phone" → `candidate.phone`
- "Location" / "Current city" → `candidate.location` (e.g. "Vancouver, BC, Canada")
- "LinkedIn URL" → `candidate.linkedin`
- "GitHub URL" → `candidate.github`
- "Portfolio URL" → `candidate.portfolio_url` (if present + non-empty)

### Work authorization (visa / sponsorship)
- "Are you legally authorized to work in [the country]?" → derive from
  `location.country` + `location.visa_status`. If the user is a citizen
  / PR of the country they're targeting: "Yes -- I am a citizen/permanent
  resident of {country}." Otherwise: "Yes -- I am authorized to work in
  {target-country}." If unsure, omit.
- "Will you now or in the future require sponsorship to work in [country]?"
  → derive from `location.visa_status`. If citizen / PR of target
  country: "No -- I do not require visa sponsorship." If on a work visa
  that converts: "No -- I have a work permit that does not require
  employer sponsorship." Don't write "Yes" without explicit ground truth.
- "Visa status" / "Work authorization status" → `location.visa_status`
  verbatim if present.

### Compensation
- "Salary expectations" / "Desired salary" / "Target compensation" →
  `compensation.target_range` if present, else `compensation.minimum`.
- "Minimum salary" / "Walkaway" → `compensation.minimum` if present.

### Logistics
- "When can you start?" / "Notice period" → if __CV__ or `__PROFILE_YML__` has
  this, use it. Otherwise pick a sensible default of "2 weeks" and tag
  it with a note that the user should confirm.
- "Are you willing to relocate?" → derive from `location.onsite_availability`.
- "Remote / hybrid / on-site preference?" → derive from
  `preferences.must_have` and `compensation.location_flexibility`.

### Behavioral (the universal ones)
- "Why are you interested in this role?" → write a TEMPLATE answer with
  `{COMPANY}` and `{ROLE}` placeholder tokens, drawing on
  `narrative.exit_story` + `narrative.superpowers`. The user (or a
  later per-job step) substitutes. Keep it under 80 words. Label as
  "Why this role? (TEMPLATE)" so it's clearly placeholder.
- "Why are you interested in this company?" → same template approach
  with `{COMPANY}` placeholder.
- "Tell us about yourself" → `narrative.exit_story` shortened to ~60 words.
- "What's your greatest strength?" → pick the top item from
  `narrative.superpowers`.
- "What's a weakness you're working on?" → DO NOT fabricate. Skip
  unless __CV__ or __PROFILE_MD__ mentions an honest one.

### Per-archetype years-of-experience
For each primary archetype in `target_roles.archetypes` (fit: primary),
write a "Years of experience with {tech}" answer using the __CV__ years
where present. Examples:
- "Years of TypeScript experience" → count years from __CV__ work history
- "Years of React experience" → same
- "Years of Node.js experience" → same
- "Years of AWS experience" → same

Aim for 5-10 of the most-asked tech stack questions based on the user's
archetypes. Don't write rows for techs the user doesn't have years on.

### How did you hear about us?
- "How did you hear about us?" → safe default like "Through your job
  posting on LinkedIn" or "Through your careers page." Pick one and
  use it consistently. The user can override per-job in the inbox.

## Critical rules

1. **Never fabricate.** If the answer requires speculation, omit the row.
   Better to surface `ManualApplyNeeded` once than to send a wrong
   answer that gets cached forever.

2. **Use the SAME normalization the cache uses.** If "Why this role?" and
   "Why this role" normalize to different keys, the user gets duplicate
   rows. Test mentally: both should normalize to `why this role`.

3. **Don't overwrite existing answers.** If the cache file already
   exists, read it first. Only append NEW keys. If a key already exists
   in the cache, skip -- the user's hand-edited answer is more
   trustworthy than your re-derived one.

4. **Be conservative on count.** 15-25 high-confidence rows beats 40
   speculative ones. Quality > coverage. Better to leave the long tail
   to manual seeding via the inbox flow.

## After writing

Print to stdout, one line each (the dashboard's endpoint parses these
for the toast + activity feed):

```yaml
SEED_ROWS_WRITTEN: <count>
SEED_ROWS_SKIPPED_EXISTING: <count>
SEED_ROWS_SKIPPED_UNSURE: <count>
SEED_FILE_PATH: data/profiles/<slug>/form-answers-cache.jsonl
```

Then exit cleanly.
