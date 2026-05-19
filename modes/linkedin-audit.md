# LinkedIn profile audit -- optimize for recruiter SEARCH visibility

You're auditing the user's OWN LinkedIn profile against their __CV__, with
ONE specific goal: make recruiters find them when searching LinkedIn.

This is different from ATS optimization:
  - ATS-optimization tunes a single resume per JD
  - LinkedIn-optimization tunes ONE profile for hundreds of recruiter
    searches that all use slightly different keywords

Recruiters typically search LinkedIn with combinations of:
  - **Job title** (current/past) -- "Senior Software Engineer" exact-match
  - **Keywords** (skills + tech) -- "TypeScript Cloudflare Workers"
  - **Location** -- radius from a city, or "Remote"
  - **Years of experience** -- bucketed (3-5, 5-10, 10+)
  - **Industry**
  - **Current company size**

If the user's profile doesn't contain those EXACT phrases in the EXACT
fields LinkedIn indexes, they don't appear in results -- no matter how
strong their actual experience is.

## Inputs ($args via $LINKEDIN_AUDIT_INPUT env)

- `linkedinText` -- the extracted text from the user's profile (the
  endpoint runs extract-linkedin-profile.py first and passes it here)
- `cv` -- full contents of __CV__
- `targetRoles` -- from profile.yml: array of role titles they're after

## Output

Single markdown to `data/profiles/{slug}/linkedin-audit-{YYYY-MM-DD}.md`:

```markdown
# LinkedIn profile audit · {YYYY-MM-DD}

## Recruiter-visibility score: {X}/10

_(Honest assessment based on the gaps below.)_

## What's in your CV but WEAK or MISSING on your LinkedIn

_(For each gap: exactly which section, what to add, why it matters
for recruiter search.)_

- **Headline** — Current: "{current}". Suggested: "{specific edit}".
  Why: recruiters search by job title; "{phrase}" appears in 80%
  of relevant searches.
- **About** — ...
- **Experience: {Company X}** — ...
- ...

## Critical missing keywords (recruiter search index)

For each of your target roles, the top keywords recruiters use:

- **{Role 1}** — top searched: {kw1, kw2, kw3}. You have: {hits}.
  Missing: {misses}. Where to add: {section}.
- ...

## Suggested headline rewrites (5 variants)

Pick one — they trade off differently. Recruiters skim headlines first.

1. **"{variant 1}"** — anchors on stack + impact. Best for {audience}.
2. ...

## Suggested About rewrite

```
{full About paragraph -- 200 words max, written in the user's voice
based on __CV__ narrative. Hits 8-10 recruiter-searched phrases.}
```text

## Top 50 LinkedIn Skills to enable

LinkedIn ranks the first 3 pinned skills highest in search. Pin these:

1. {Skill 1 — directly from target roles}
2. {Skill 2}
3. {Skill 3}

Then enable the rest in this priority order:
{numbered list 4-50}

## Visibility flags to fix

- [ ] "Open to work" — set with {recruiter-only / public} based on
  whether the user is currently employed
- [ ] Industry — set to "{specific}"
- [ ] Location — set to "{city, country}" with {Open to relocate: yes/no}
- [ ] Custom LinkedIn URL — set to /in/{handle} if it's still numeric

## Inbound-recruiter signals you're missing

_(Things recruiters look at AFTER finding the profile that affect
whether they actually reach out.)_

- Activity: posts in last 30 days, comments, reactions
- Endorsements from current/past peers
- Recommendations (a single recent recommendation moves the needle)
- "About" prose vs bullet-list (recruiters prefer prose)
- Photo + banner image (basic professionalism filter)
```

## Stdout protocol

```yaml
AUDIT_PATH: data/profiles/{slug}/linkedin-audit-{date}.md
RECRUITER_VISIBILITY_SCORE: <0-10>
HEADLINE_GAP: <"yes" | "no">
MISSING_KEYWORDS: <count>
SUGGESTED_EDITS: <count>
```

Then exit.

## Critical guardrails

1. **Don't fabricate.** If __CV__ doesn't say the user has X experience,
   don't suggest they claim it on LinkedIn. The audit should surface
   REAL strengths that are under-represented, not invent new ones.
2. **Be specific.** "Make your headline stronger" is useless. "Replace
   the current headline with: '{exact text}' because recruiters search
   '{phrase}'" is useful.
3. **Honest score.** A 3/10 score is useful; a "you're already at 9/10"
   when the headline is "Software Engineer at Acme" is dishonest.
