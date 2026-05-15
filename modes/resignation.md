# Resignation letter — leave on good terms, keep the door open

You're drafting the letter the user will send to their CURRENT employer
to resign. Not for the new employer.

Goal: professional, gracious, short, no burning bridges. The letter
goes to the manager + cc HR. It becomes part of the user's permanent
employment record at that company.

## Inputs ($args, parsed from `RESIGNATION_INPUT` env JSON)

- `profileId`
- `newCompany`, `newRole` — context only, NOT mentioned in the letter
- `currentEmployer` — required
- `currentManager` — name of the manager (used in the greeting)
- `lastDay` — ISO date (YYYY-MM-DD). If absent, computed from `noticeWeeks`.
- `noticeWeeks` — default 2 (US), 4 (UK / NL / DE common minimum)
- `tone` — `formal` | `warm` | `concise`
- `reason` — user-supplied summary; you rewrite cleanly (no specifics about new job)

## Output

ONE markdown file at:

```text
{output-dir}/resignation-{YYYY-MM-DD}.md
```

Format:

```markdown
# Resignation · {currentEmployer} · {today's date}

**To:** {currentManager}
**Cc:** People Operations / HR
**Subject:** Resignation — {user's name}

Dear {currentManager},

_(Sentence 1: state the resignation + last day clearly.)_

_(Sentence 2: short, generous reason — never say "because of {new company}".
The right framing is "to take on a {role-type} opportunity that aligns
with where I want to take my career next.")_

_(Paragraph 2 — 2-3 sentences: thank them for SPECIFIC growth /
opportunity / mentorship. Pull one detail you actually remember. Generic
"thanks for everything" reads cold.)_

_(Paragraph 3 — 2 sentences: commit to a clean transition. Offer to
document open work, hand off project owners, and be available for
questions in the first {30-60} days after departure where appropriate.)_

_(Closing: best wishes for the team's continued success.)_

Sincerely,
{user-name}
```

After writing the file, emit a final stdout line:

```yaml
RESIGNATION_PATH: {relative-path-to-file}
```

## Tone rules

| Tone      | Style                                                                              |
| --------- | ---------------------------------------------------------------------------------- |
| `formal`  | "Dear {name}", "Sincerely", no contractions, classic 4-paragraph structure         |
| `warm`    | "Hi {name}", contractions OK, 1 personal moment of gratitude, "Thanks again" close |
| `concise` | 3 short paragraphs total, no flourishes, action-oriented                           |

## DO NOT

- Mention the new company by name.
- List grievances. (If you're leaving for a bad reason, this letter is NOT the place to say so. The exit interview is.)
- Promise more than you can deliver. Offering 4 weeks transition support and then ghosting damages the relationship.
- Say "everything happens for a reason" or other clichés.
- Pre-emptively negotiate counter-offer protections — they will or won't make one; that's a different conversation.

## DO

- Be specific about WHEN. Calendar-clear dates ("last day is November 12, 2025").
- Offer concrete transition help. Be honest about what you can and can't take on.
- Thank a SPECIFIC person, project, or moment. "Thanks for X" beats "Thanks for everything".
- Keep it under 350 words.

## Last-day math

If `lastDay` not supplied:

- `lastDay = today + (noticeWeeks ?? 2) * 7 days`
- Round to a Friday so the user has a clean week.
- If notice period straddles a public holiday, push lastDay one business day later.
