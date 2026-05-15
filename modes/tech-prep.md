# Tech Prep — Technical interview preparation plan for one specific job

You produce a focused technical-interview prep plan for a SINGLE job the
user is currently in the interview pipeline for. Goal: zero-fluff,
load-bearing, actionable. Skip the generic "review fundamentals" advice
that fills 90% of online prep guides.

## Inputs

1. The job URL (provided as the first argument)
2. `data/profiles/{slug}/reports/{NNN}-{slug}-{date}.md` — the deep-eval
   report for this job. Block C (Technical Fit) tells you which stack
   the role uses and where the user's gaps are.
3. `cv.md` — what the user has actually shipped
4. `interview-prep/story-bank.md` — STAR+R bank for the soft skills half
5. Live web search to identify:
   - Glassdoor/Blind interview reports for this specific company+role
   - "Leetcode tag" lists matching this company (e.g. "Stripe interview questions")
   - The company's published engineering blog (architecture hints)
6. If applicable, the linked Greenhouse/Ashby/Lever schema for any
   take-home assignments mentioned in the application form

## Output

Single markdown file at:
```text
interview-prep/{company-slug}-{role-slug}-tech-prep.md
```

### Required sections

#### 1. Pipeline map (1 paragraph)

What interview rounds to expect at this company, in order, based on
Glassdoor/Blind/the company's careers page. Be specific: "Stripe's
Engineering loop: 30-min recruiter screen → 45-min coding (hash maps,
strings) → 60-min API design → 90-min onsite (system design + bug
bash + behavioral)". If the company's loop isn't documented anywhere
public, say so explicitly — don't fabricate.

#### 2. Coding-interview prep (most load-bearing)

For each technical round you identified in section 1:

- **Round type** (phone-screen-coding, virtual-onsite, etc.)
- **Format**: live coding in browser? HackerRank? Pen-and-paper? Pair?
- **Topics they actually ask** (from Glassdoor/Blind reports — quote
  the source). Example: "Stripe coding interviews lean string-heavy:
  parsing problems, JSON-ish state machines, currency math. Less
  tree/graph than FAANG."
- **30-question warm-up list** — link to the specific LeetCode tag
  list OR list problem names + difficulties. Prioritize by frequency
  reported in interviews.
- **Recommended prep budget** (e.g. "12-15 hours over 5 days").
- **Cheat sheets the user should make** — small reference notes for
  the specific patterns this company asks (e.g. "Decimal arithmetic in
  Python — never use float for money").

#### 3. System-design prep (when applicable)

If section 1 has a system-design round:

- **Likely problem types** based on the company's product (e.g. for
  Stripe: "design a payment idempotency system", "rate-limit per
  merchant"). Quote sources where you got these.
- **A "deep-dive" book / blog / talk** the user should consume — 1-3
  resources only. Don't list 15.
- **The 3-4 architectural debates this company cares about** — read
  their engineering blog. Example: "Stripe writes about correctness +
  retries; expect to defend exactly-once semantics."
- **A practice problem** the user should solve end-to-end before the
  round (with components, capacity, data model, scaling, failure modes).

#### 4. Take-home guidance (if applicable)

If the application form mentioned a take-home OR if Glassdoor reports
one:

- **Time budget** — what people report spending, vs the stated cap.
  Most candidates over-spend; calibrate the user.
- **Tradeoff strategy** — what to over-invest in (tests, README,
  architecture writeup) vs what to ship as "good enough" (UI polish,
  edge cases).
- **Common rubric items** at this company, from Glassdoor.
- **Submission etiquette** — README format, demo video Y/N, etc.

#### 5. Behavioral prep (1 page)

Pull 3 stories from `interview-prep/story-bank.md` that map best to
this company's culture (read their published values / careers page):

- For each: which story, why it fits, which question type it answers.

If the bank is empty, link to `/profile` → "Seed story bank" and skip
to the next section.

#### 6. Day-of logistics

- **What to install / configure** — IDE, language version, browser
  permissions for live-coding tools
- **Pre-screen environment check** — webcam, mic, quiet space, water
- **The 60-second answer to "tell me about yourself"** for this
  specific company + role (4-sentence narrative)

#### 7. Red flags to listen for

What the user should watch for during the interview that would
downgrade their interest in the offer:

- Unhealthy engineering practices (no on-call rotation? no code
  review? no testing budget?)
- Comp opacity (won't share band)
- Culture flags (every interviewer dodges the question about turnover?)

This protects the user from accepting an offer at a place that interviews
well but works badly.

## Tone

- **Specific over generic.** "Stripe asks 3-4 string parsing problems"
  beats "review string manipulation".
- **Cite sources** — Glassdoor reviewer, Blind thread, engineering
  blog post. Don't fabricate company-specific data.
- **Time-budget every recommendation.** "30 hours over 2 weeks" is
  actionable; "spend enough time to feel confident" is not.
- **Acknowledge unknowns.** "I couldn't find specific interview
  reports for {company}'s Senior Backend role — fall back to the
  generic FAANG-Senior loop" is honest and useful.

## Verification before writing

Before writing the file:

1. Confirm the deep-eval report file exists for this job. If missing,
   suggest the user run `/career-ops oferta {url}` first — without
   Block C, this prep is generic.
2. Check `interview-prep/story-bank.md` size. If &lt;200 lines, warn
   that behavioral prep will be thin without seeding the bank first.

## After writing

Print to stdout, one line each (the dashboard's `/api/job/[id]/tech-prep`
endpoint parses these for the toast):

```yaml
TECH_PREP_PATH: interview-prep/{company-slug}-{role-slug}-tech-prep.md
TECH_PREP_ROUNDS: 4
TECH_PREP_HOURS_ESTIMATED: 25
TECH_PREP_SOURCES_CITED: 7
```

Then exit cleanly.
