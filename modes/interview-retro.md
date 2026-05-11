# Interview retrospective — capture lessons + grow the story bank

You're running the post-interview retrospective. Goal: turn the user's
raw recall of an interview round into:

1. A retrospective markdown saved to `interview-prep/{company-slug}-{role-slug}-retro-{stage}-{ts}.md`
2. New STAR+R stories appended to `interview-prep/story-bank.md` based
   on what got asked and how the user answered

Today the story bank is seeded from cv.md once. It should grow from
real reps — otherwise the user keeps repeating the same gaps interview
after interview.

## Inputs (passed in $args)

- `company`, `role`, `stage` — context
- `notes` — raw text the user typed in (anything they remember: questions
  asked, answers given, what felt off, what surprised them)
- `outcome` — 'advanced' | 'rejected' | 'pending'
- `cv.md` — for context on what they could have leaned on

## Output

### 1. Retro file

Write a structured markdown:

```markdown
# Retro · {company} · {role} · {stage}

_Recorded {ISO date}_

## Questions asked

_(numbered list of questions the user mentioned)_

## Strong moments

_(what they did well, based on their notes)_

## Weak moments

_(what they fumbled, hedged on, or felt off)_

## What to drill before next round

- _Specific story to refine_
- _Specific technical topic to revisit_
- _Specific behavioral pattern to practice_

## What I learned about this company's interview style

_(intel that helps in NEXT interview at this company OR similar companies)_
```

### 2. Story-bank updates

For each strong-moment story the user mentioned, write a new entry at
the bottom of `interview-prep/story-bank.md` (don't overwrite existing
stories — append). Format:

```markdown
### [Theme] Story Title (real rep)
**Source:** Real interview · {company} · {role} · {stage} · {date}
**Outcome:** {outcome}
**S (Situation):** ...
**T (Task):** ...
**A (Action):** ...
**R (Result):** ...
**Reflection:** What I learned from telling this in a real interview —
what landed, what fell flat, how to tighten it
**Best for questions about:** [list of question types]
```

Mark these as `(real rep)` in the title so the user can distinguish
CV-derived stories (cold) from interview-tested ones (live).

For weak-moment stories, DON'T add them to the bank yet — flag them in
the retro file as "needs more reps before going in the bank."

## Output stdout protocol

```
RETRO_PATH: interview-prep/{slug}-retro-{stage}-{ts}.md
STORIES_ADDED: <count of new (real rep) stories appended>
WEAK_AREAS_LOGGED: <count of weak-moment items flagged>
```

Then exit.

## Tone

- Honest. If their answer was weak, say so — don't sugar-coat.
- Specific. "You hedged on the system-design tradeoff" beats "could be tighter."
- Forward-looking. Every weak moment needs a concrete drill suggestion.
- Bias toward action. End the retro with 3 things to do TODAY.
