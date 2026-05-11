# Reference prep — brief each reference before the company calls them

Most candidates send references cold without context. Reviewers asking
references "tell me about working with $name" get rambling answers that
don't address what the hiring team actually cares about. A 5-minute
prep brief makes the difference between "they confirmed they worked
with them" and "they painted a picture of the impact."

## Inputs ($args)

- `company`, `role` — context
- `references` — array of `{ name, relationship, lastWorkedTogether,
  themes? }`. `themes` is optional — if provided, surface those when
  picking the angle. Otherwise infer from cv.md.
- `cv.md` — to pull proof points + project context
- `interview-prep/{company-slug}-{role-slug}-tech-prep.md` — if it
  exists, the company's stated values + the role's stated competencies

## Output

For EACH reference, write a separate brief markdown file:

```
interview-prep/{company-slug}-{role-slug}-reference-{ref-slug}.md
```

Each file is a 1-pager:

```markdown
# Reference brief · ${reference.name} → ${company}

_Send this to your reference 24-48 hours BEFORE the company is likely
to call. ~5-minute read for them._

## TL;DR

You're being asked about me for a ${role} role at ${company}. They
particularly care about ${top-3 themes from company values + role}.
I'd love it if you can speak to ${3 specific things you saw me do that
match}.

## The role + why I want it (90 seconds for context)

_(60-word version of why this role + this company. Same as the "tell
me about yourself" but shorter — your reference needs context to
calibrate.)_

## The 3 things they're most likely to ask

1. **"How did $candidate handle ambiguity / setbacks?"**
   - The specific situation: ${reference} saw me ${describe a real moment
     from our time together — let me drop in if helpful}
   - The outcome / impact: ${if you can: a specific result}

2. **"What's $candidate's working style / collaboration style?"**
   - ${ref-specific angle}

3. **"Why did $candidate leave $previous-role?"**
   - ${honest version — refs that hedge here lose credibility. Pre-aligning
     reduces the chance of an awkward gap.}

## What to AVOID (be careful)

- ${specific landmine — e.g. "they may ask about $X conflict; I'd rather
  you didn't go deep on that because $reason"}
- Salary specifics — recruiters sometimes fish. "I don't know the exact
  number" is fine.

## Logistics

- Likely caller: ${recruiter or hiring manager based on stage}
- Likely timing: ${week range}
- Format: usually 15-30 min phone call
- You don't owe them a callback if it's not convenient — "I can do
  Tuesday between 2-4" is a complete answer

Thanks again for doing this — I'll let you know the outcome either way.
```

## Critical guardrails

1. **Never fabricate.** If you don't know whether the reference saw the
   candidate handle X, leave a placeholder like "(if you saw me do this)"
   rather than invent a scene. The reference WILL catch a wrong memory
   on the call.
2. **Never put words in the reference's mouth.** Frame as "if you can"
   not "here's what to say."
3. **Be honest about gaps.** If the candidate left a role under bad
   circumstances, align the reference on the honest narrative rather
   than asking them to spin it.

## Stdout protocol

```
REFERENCE_FILES_WRITTEN: <count>
REFERENCE_PATHS:
  - path/to/file1
  - path/to/file2
```

Then exit.
