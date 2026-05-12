# LinkedIn rewrite — paste-ready text for every section that needs work

This mode runs AFTER the audit. The user has the raw LinkedIn snapshot
+ a list of findings; this mode produces the actual rewritten text so
they can paste it into LinkedIn directly.

## Inputs ($args, parsed from `LINKEDIN_REWRITE_INPUT` env JSON)

- `profileId`
- `findings` — array of finding `kind` values to rewrite for
  (e.g. ['thin-headline', 'thin-about', 'archetype-skill-gap'])
- `snapshot` — the raw scrape (contains current headline, about, etc.)

Also read: `cv.md`, `config/profile.yml` (target archetypes + role title),
`modes/_profile.md`, `article-digest.md`.

## Output

ONE markdown file at:

```
{output-dir}/linkedin-rewrite-{YYYY-MM-DD}.md
```

Format:

```markdown
# LinkedIn rewrite · {today's date}

_Paste each block into the corresponding LinkedIn section. Order is the
recommended order to fix._

## 1. Headline

**Current:** {current headline}

**Paste this:**

```
{New 100-180 char headline. Format:
  {Specific role / title} | {Top skill area} + {Top skill area} | {What you actually do that matters}

Example: "Senior Backend Engineer | Distributed Systems + Kubernetes | Building reliable infra for high-throughput APIs"

Calibrated to: target role title + archetype + cv.md proof points.
NO em-dashes. NO "passionate". NO "results-driven". Use specific
domain terms recruiters search for.}
```

**Why this works:** _(1-2 sentences explaining the specific levers
this rewrite pulls — keyword density, scope signalling, recruiter
search ranking.)_

## 2. About

**Current:** {first 200 chars of current about}

**Paste this:**

```
{1500-2000 char rewrite. Structure:
  Paragraph 1 (3-4 sentences) — opening hook + what you specifically do
  Paragraph 2 (3-4 sentences) — 3 concrete proof points, with numbers
  Paragraph 3 (3-4 sentences) — what you're looking for next + clear CTA
  Signoff with email/contact if not already public.

Use first person. No clichés. Each sentence testable.}
```

**Why this works:** _(...)_

## 3. Featured section

_(IF the finding includes 'empty-featured': suggest 3-5 items pulled
from cv.md / article-digest.md. Each item has a title + URL + 1-line
caption.)_

- **[Title]** · {URL} · _One-line caption_
- ...

## 4. Skills to add

_(IF 'archetype-skill-gap' or 'sparse-skills': list the specific skills
to add, in priority order. LinkedIn supports up to 50.)_

Paste these into Profile → Skills → Add skill:
```
- {Skill 1}
- {Skill 2}
- ...
```

## 5. Custom URL

_(IF 'random-slug': the slug we'd suggest.)_

```
linkedin.com/in/{first-last}
```

Path: Profile → Edit public profile & URL → Edit URL.

## 6. Recommendations to request

_(IF 'no-recommendations': name 3 people from the user's CV + draft
the ask each one. Be specific about what they're best positioned to
vouch for.)_

### Ask 1 — {person, role at company}

```
Hi {firstName},

I'm refreshing my LinkedIn for {target role}. Of everyone I've worked
with, you saw {specific work they witnessed} most directly — would you
be willing to write 3-5 sentences about it?

A few things you might mention:
- _{specific 1}_
- _{specific 2}_

No pressure if it's bad timing — just thought I'd ask.

Thanks,
{candidate first name}
```

### Ask 2 — ...

## 7. Activity prompt

_(IF 'stale-activity': suggest 3 post topics aligned to archetype + cv.md.)_

- _{Post topic 1}_ — why this'd land: ...
- _{Post topic 2}_ — ...
- _{Post topic 3}_ — ...
```

After writing the file, emit:

```
REWRITE_PATH: {relative-path}
```

## Quality bar

- Every rewrite is specific, never generic.
- Every paste-ready block is COPY-AND-PASTE READY — no `{placeholder}`
  left for the user to fill in.
- Calibrated to the user's actual CV + archetype + target role — read
  them carefully before drafting.
- Banned words (career-ops standard list applies): passionate,
  results-driven, team player, leveraging, synergy, robust, scalable
  (as a single adjective without numbers), seasoned, hard-working.
- Each section's "Why this works" is one sentence — not an essay.
- Total document under 1500 words (excluding the paste-ready text
  blocks).
