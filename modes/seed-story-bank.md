# Seed Story Bank -- Extract STAR+R stories from CV

You're seeding the master interview story bank. Walk through the user's
`__CV__` and pull out 5-10 high-impact stories using the STAR+R format
(Situation, Task, Action, Result, Reflection).

## Inputs

1. `__CV__` -- canonical CV with experience, projects, achievements
2. `data/profiles/{slug}/__PROFILE_MD__` (if exists) -- narrative context,
   superpowers, proof points
3. `config/profile.yml` → `narrative.proof_points` if present
4. The existing `__STORY_BANK__` -- DON'T overwrite stories
   that are already there; APPEND new ones below them

## Output: `__STORY_BANK__`

Edit the file IN PLACE, keeping the existing top-of-file header. Append
each new story under `## Stories` using the format below. Number the
new stories starting from the next available number.

```markdown
### [Theme] Story Title
**Source:** Seeded from __CV__ on YYYY-MM-DD
**S (Situation):** 2-3 sentences setting the scene — when, where, what was at stake
**T (Task):** 1-2 sentences on what you specifically owned
**A (Action):** 3-5 sentences on what YOU (not the team) did — concrete, technical
**R (Result):** Specific numbers (revenue, latency, time saved, users, %) when possible
**Reflection:** What you learned, what you'd do differently
**Best for questions about:** [list of question types this story answers]
```

## Theme tags to assign

Pick 1-2 tags per story from this list (or add new ones that fit):

- **[ownership]** -- owned a project end-to-end through ambiguity
- **[scale]** -- built or operated something at significant scale
- **[migration]** -- moved a system from legacy to modern stack
- **[performance]** -- fixed a measurable performance / latency / cost problem
- **[cross-functional]** -- worked across teams, departments, geographies
- **[mentorship]** -- coached, hired, leveled up a peer or report
- **[conflict]** -- resolved a meaningful disagreement (technical or interpersonal)
- **[failure]** -- shipped something that didn't work AND what you learned
- **[customer-impact]** -- feature or fix that customers felt directly
- **[reliability]** -- improved uptime, alerting, incident response
- **[architecture]** -- made a load-bearing design decision
- **[data]** -- data-driven decision-making, instrumentation, analytics

## Quality bar

EVERY story must have:

- A specific Result with a number (revenue / latency / users / %)
- A Reflection that isn't generic ("I learned communication is important")
- Enough technical detail that a senior engineer interviewer can probe deeper

If the CV's bullet doesn't have enough material to fill a real story,
DON'T fabricate. Skip it. Better to seed 5 strong stories than 10 weak ones.

## Coverage check

After writing stories, audit the file: do the themes cover at least these
classic behavioral questions?

- "Tell me about a time you owned something end-to-end"
- "Tell me about a difficult technical decision"
- "Tell me about a conflict with a teammate"
- "Tell me about a project that failed"
- "Tell me about your biggest impact"

If any of these is uncovered, add a note at the bottom:

```markdown
## Coverage gaps

- [ ] No conflict story yet — ask the user during onboarding follow-up
- [ ] No failure story — same
```

## Output

When done, print a one-line summary to stdout:

```text
SEEDED N stories · M themes covered · K coverage gaps
```

Then exit cleanly. The dashboard parses this line to update the UI.
