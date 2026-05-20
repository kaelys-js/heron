# Mode: form-answers -- Pre-Filled Application Q&A

Generate concise, candidate-voiced answers to the most common application-form questions for a specific role. Used for non-LinkedIn portals (Greenhouse, Ashby, Lever, Workday, custom ATS) where the user copies answers manually into the form.

## Inputs

- URL or pasted JD (the job offer)
- `__CV__` (canonical CV)
- `__PROFILE_YML__` (location, comp targets, work auth, notice period)
- `__PROFILE_MD__` (archetype mapping, narrative)
- `__ARTICLE_DIGEST__` (proof points, optional)
- The matching report file in `__REPORTS__/{n}-{slug}-{date}.md` (if it exists -- use Bloque B match table)

## Output

Write to: `__INTERVIEW_PREP__/{slug}-form-answers.md`

Where `{slug}` is the slugified company-role pair used elsewhere in the system.

## Question set

Generate answers to ALL of the following. If something is unknown (notice period, salary range), pull the value from `__PROFILE_YML__`. If still unknown, write the answer with a TODO marker so the user fills it in:

1. **Why this role?** (1-4 sentences)
   - One concrete thing about the team's mandate or the product that resonates
   - One proof point from the CV that maps to the role's headline requirement
   - Avoid generic enthusiasm

2. **Why this company?** (1-4 sentences)
   - Reference one piece of public material: a product launch, an engineering blog post, a public roadmap, a company value
   - Tie it back to something the candidate has done or believes
   - NO "I love your mission"

3. **Years of experience with [the top 1-3 technical requirements]** (one line per skill)
   - Concrete numbers from __CV__ (e.g. "Python -- 8 years, primary language since 2017")
   - If a skill is adjacent rather than direct, frame the adjacency honestly

4. **Salary expectations** (1 sentence)
   - Read from `__PROFILE_YML__` (`compensation.target` etc.)
   - State a range if available, with a note that it's flexible based on total comp + scope
   - If `__PROFILE_YML__` has no comp target, write `_TODO_: Set comp target in profile.yml_`

5. **When can you start?** (1 sentence)
   - Read from `__PROFILE_YML__` (`availability.notice_period` if present)
   - Default to "Available with 2 weeks notice" if not specified

6. **Authorized to work in [country]?** (1 sentence)
   - Read from `__PROFILE_YML__` (`candidate.work_auth` etc.)
   - Be explicit about visa status, work permits, or citizenship for the role's country

7. **Anything else we should know?** (2-4 sentences)
   - One distinctive proof point that didn't fit in the resume but is highly relevant
   - Optional pointer to a portfolio piece or open-source project
   - Close with availability / time-zone notes if relevant

## Format

Output as a single markdown file with the structure:

```markdown
# Form answers — {Company} · {Role}

> Pre-filled answers for common application form questions. Copy each block into the matching field on the portal. Tone matches your CV; numbers are from __CV__.

## 1. Why this role?

{answer}

## 2. Why this company?

{answer}

## 3. Years of experience

- **{skill 1}**: {answer}
- **{skill 2}**: {answer}
- **{skill 3}**: {answer}

## 4. Salary expectations

{answer}

## 5. Availability / start date

{answer}

## 6. Work authorization

{answer}

## 7. Anything else we should know?

{answer}

---

_Generated from `__CV__` and the matching evaluation report. Tweak any answer that doesn't sound like you._
```

## Voice rules

- First-person, active voice, present tense.
- 1-4 sentences per answer (≤80 words).
- Numbers from `__CV__` only -- never invent.
- NO superlatives without evidence.
- Match the language of the JD.
- One short JD quote allowed if pivotal -- wrap in quotes, ≤12 words.

## Validation before writing

1. Check that the strongest claim in each answer maps to a line in `__CV__`.
2. Check `__PROFILE_YML__` for comp/notice/work-auth fields. If missing, write `_TODO_:` markers.
3. Print the path written and a 1-line summary.
