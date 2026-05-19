# Mode: pre-call-dossier -- one-pager you read 30 minutes before the interview

You're assembling the 1-page dossier the user reads before any scheduled
interview. The goal: walk in with specific knowledge of WHO they're
talking to + WHAT to ask + WHICH stories to lead with.

## Inputs ($args)

- `company` -- company name
- `role` -- role title
- `stage` -- PhoneScreen / Technical / Onsite / Final
- `interviewers` -- array of `{ name, role?, linkedinUrl? }` (some empty
  is fine -- the user might only know the recruiter's name at PhoneScreen)
- `__CV__` + the deep-eval report (Blocks A-G) + `__STORY_BANK__`
  + the company's `__INTERVIEW_PREP__/{company}-{role}.md` if it exists

## Output

Single markdown at `__INTERVIEW_PREP__/{company-slug}-{role-slug}-dossier-{stage}-{ts}.md`:

```markdown
# Dossier · {company} · {role} · {stage}

_Read this 30 minutes before the call._

## In one paragraph

_(60-word summary of why you're a fit + the angle you'll lead with,
specifically tuned for this stage)_

## The interviewers

### {Interviewer 1 name} ({role})

- **Background:** (from LinkedIn — N years at company, prior roles, school)
- **Recent signals:** (any posts, talks, OSS — last 12 months)
- **Probable focus:** What this persona likely cares about given their role

### {Interviewer 2 name} ({role})
...

## What this company writes about (eng blog highlights)

_(3-5 bullet topics from the company's engineering blog over the last
12 months. These are what they ask system-design about. Cite source.)_

## Your 3 lead-with stories

_(Pulled from the user's story-bank. Match the company's stated values
+ this stage's typical question types. For each: which story + which
question type it answers + the 30-second version + a memorable hook.)_

1. **{Story title}** — for questions about {category}. Hook: "{15-word
   version that sets up the story tightly}"
2. ...
3. ...

## 5 questions YOU'll ask THEM

_(The "Do you have any questions for us?" close. These are MASSIVELY
under-coached. Pick 5 specific to:)_
- {Interviewer 1}: "_(1 question tuned to their role)_"
- {Interviewer 2}: "_(...)_"
- About the team: "_(1 question that probes culture without sounding
  like you're interrogating)_"
- About scope: "_(1 question that signals you're calibrated for the level)_"
- About the company's direction: "_(1 question that proves you've read
  the eng blog)_"

## Red flags to listen for

_(3-4 specific things that would downgrade your interest if they say
them. Listen for these vs nodding along.)_

## What NOT to say

_(2-3 specific landmines you, given your CV, should avoid. E.g. "don't
mention X tech in a negative way if interviewer Y was responsible for
bringing it in")_

## Day-of logistics

- Time: ___ (with TZ + buffer)
- Where: Zoom / Google Meet / phone
- What to install: ___
- What to have ready: notebook + your story-bank tab open + headphones
- The 90-second "tell me about yourself" calibrated for THIS stage:

_(Write the 90-second answer here verbatim, customized for this stage.
Different from your default — phone-screen version is logistics-heavy,
final version is impact-heavy.)_
```

## Search strategy (use WebSearch + WebFetch sparingly)

For each interviewer with a LinkedIn URL: 1 WebFetch to extract their
last 5 jobs + tenure. For each without a URL, 1 WebSearch on
`"{name}" {company} engineer` and take the first credible result. Cap
total web requests at 6 per dossier (interviewers + eng-blog + recent
news). If a query returns nothing useful, OMIT that section -- don't
fabricate.

## Stdout protocol

```yaml
DOSSIER_PATH: __INTERVIEW_PREP__/{slug}-dossier-{stage}-{ts}.md
INTERVIEWERS_RESEARCHED: <count>
QUESTIONS_GENERATED: <count, should be 5>
STORIES_MATCHED: <count from story-bank>
```

Then exit.
