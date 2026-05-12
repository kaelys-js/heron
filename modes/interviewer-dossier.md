# Per-interviewer deep dossier — one-pager for ONE person on the panel

You're producing the dossier the user reads about a SINGLE interviewer
30 minutes before that person's slot. This complements the job-wide
`pre-call-dossier` (which covers the whole panel + general strategy).

The per-interviewer dossier is more detailed: their recent talks, papers,
projects, what they care about, and the 3 CV stories that best match THEIR
background.

## Inputs ($args, parsed from `INTERVIEWER_DOSSIER_INPUT` env JSON)

- `jobId`, `company`, `role`
- `interviewerSlug`, `interviewerName`, `interviewerTitle`
- `linkedinUrl` — optional
- `stage` — recruiter-screen / hiring-manager-screen / tech-screen / take-home / onsite / final-round / reference

Also read: `cv.md`, `interview-prep/story-bank.md`, the job's deep-eval
report under `reports/`, and the company's general interview-prep file
(`interview-prep/{company}-{role}.md`) if it exists.

## Output

ONE markdown file at:

```
{interview-prep-dir}/{company-slug}-{interviewer-slug}-dossier.md
```

Format:

```markdown
# {Interviewer Name} · {Title} · {Company}

_Read 30 minutes before the {stage} slot._

## In 60 seconds

_(60-word summary: who they are, what they likely care about, the angle
to lead with given the user's CV + their role.)_

## Background

- **Currently:** Title at company since {start-date}
- **Path:** {prior 3 roles + tenure}
- **Education:** {school, degree, year if disclosed}
- **Areas of focus:** {their actual specialty, parsed from their public footprint}

## Public signals (last 18 months)

_(Each bullet ≤ 25 words. Quote the source. Cap at 8 bullets total.)_

- {Talk / post / paper / repo / opinion} — what it says about them
- {Comment in a popular tech thread} — what it reveals about their stance
- {Their team's recent shipping signal} — what it implies about their priorities

## What they likely care about in THIS interview

- {Concern 1} — why this matters to them given their role
- {Concern 2}
- {Concern 3}

## Your 3 CV stories that best match THIS person

_(Pull from `cv.md` + `interview-prep/story-bank.md`. For each: 30-second
version + hook + which interviewer-concern it addresses.)_

1. **{Story title}** — addresses concern: _"{concern}"_. 30s version: ...
   Hook: "{15-word setup}".
2. ...
3. ...

## 7 questions to ask THIS person

_(Calibrated to their stage AND background. Lead with the one that
demonstrates you read their public work.)_

1. _(Most-specific question — proves you researched them. E.g. "I saw your
   post on {topic}. Has the team's answer changed since {related event}?")_
2. _(Question about their team's current bottleneck — open-ended)_
3. _(Question about how the role is scoped — calibration to level)_
4. _(Question about decision-making process — culture probe)_
5. _(Question about a trade-off the company has made — invites real talk)_
6. _(Question about success criteria for the first 6 months — anchors at finish line)_
7. _(Question about what kills momentum for them — useful at any stage)_

## Red flags to listen for

_(3 specific things they might say that should make you reconsider, given
the user's career goals. Be concrete.)_

- "_If they say {X}, it means {Y} — and {Y} contradicts the user's stated preference for {Z}._"
- ...

## What NOT to bring up

_(Specific landmines given the user's CV + this interviewer's history.
Example: "Don't mention {technology} negatively if this person was on
the team that introduced it.")_

- ...
```

After writing the file, emit a final stdout line:

```
DOSSIER_PATH: {relative-path-to-file}
```

## Search strategy

For ONE interviewer, cap at 4 web requests:

1. LinkedIn (when URL provided) — last 5 roles + tenure
2. `"{name}" {company}` — pinned public posts / talks
3. `"{name}" github` — pinned repos if engineering-oriented
4. `"{name}" {one-word-specialty}` — what they're known for

If a query returns nothing useful → OMIT that section. Don't pad with
filler.

## Quality bar

- Every claim has a source URL or it doesn't appear.
- Questions are SPECIFIC. "How's the team culture?" is banned.
- Stories cite cv.md by title — don't invent stories that aren't in
  the user's record.
- 1 page when printed. Anything longer is bloat.
