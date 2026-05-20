# Mode: questions-to-ask -- the "Do you have any questions?" close

You're producing the file the user opens during the last 5 minutes of
the call when the interviewer says "Do you have any questions for us?"

Most candidates blow this. Specific questions tuned to the interviewer's
role + the stage = the candidate is taken seriously.

## Inputs ($args, parsed from `QUESTIONS_INPUT` env JSON)

- `jobId`, `company`, `role`
- `interviewerSlug`, `interviewerName`, `interviewerTitle`
- `stage` -- recruiter-screen / hiring-manager-screen / tech-screen / take-home / onsite / final-round / reference

Also read: `__CV__`, the job's deep-eval report under `__REPORTS__/`,
the company's general interview-prep file under `__INTERVIEW_PREP__/`,
and the per-interviewer dossier if it exists.

## Output

ONE markdown file at:

```text
__INTERVIEW_PREP__/{company-slug}-{interviewer-slug}-questions.md
```

Format:

```markdown
# Questions to ask · {interviewer-name} · {stage}

_(Pick 3-4 to actually ask. Don't fire all 10. Save 1-2 for follow-ups.)_

## The opener (always lead with this one)

> _(One specific question that PROVES you researched them. Reference a
> talk / post / repo / something on their team's roadmap. If you have
> the per-interviewer dossier, pull from its top public signal.)_

## Calibration to the stage

_(2-3 questions specifically tuned to the interview stage. These signal
"I know what to ask at THIS stage" which separates the 70th from the
95th percentile candidate.)_

## Team + culture (1-2 questions)

_(Specific, not generic. "What's something the team is doing differently
this year compared to last?" beats "How's the team culture?")_

## Scope + success (1-2 questions)

_(Anchor the role at the finish line. "What would success look like 6
months in? Who would be telling me I'm crushing it?")_

## Risk + obstacles (1 question — only use at hiring-manager+ stage)

_(The "what could go wrong" angle. Senior candidates can ask this
without sounding negative. Junior candidates should skip.)_

## NEVER ask (anti-questions)

- "What's a typical day like?" → vague, can't be answered concretely
- "How's work-life balance?" → red flag to hiring managers (whether fair or not)
- "Will I be working with smart people?" → insulting to who's interviewing you
- Anything you could have answered yourself by reading the careers page
```

After writing the file, emit a final stdout line:

```yaml
QUESTIONS_PATH: {relative-path-to-file}
```

## Stage tuning

| Stage                 | What to weight                                                                         |
| --------------------- | -------------------------------------------------------------------------------------- |
| recruiter-screen      | Process, timeline, comp band, who the next conversation is with                        |
| hiring-manager-screen | Team mission, the current bottleneck, what the user would own in first 90 days         |
| tech-screen           | Day-to-day technical work, the team's most-painful tradeoff, their tooling/CI maturity |
| take-home             | What they look for in the writeup, how the discussion will go                          |
| onsite                | Cross-team dynamics, decision velocity, how they handle disagreement                   |
| final-round           | Strategic direction, how this role evolves, what the next 2 hires will be              |
| reference             | This mode usually isn't run for reference calls; skip                                  |

## Anti-pattern

NEVER write generic questions that the interviewer has heard 50 times.
Test: would your question be obviously different if the company were a
different size / industry / stage? If not, rewrite it until yes.
