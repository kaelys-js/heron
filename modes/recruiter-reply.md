# Recruiter-reply — drafts the personalised response to an inbound recruiter message

NEVER auto-sends. Drafts only. The user reviews + clicks send.

The default recruiter response ("Thanks for reaching out, happy to chat!")
gets ignored or auto-shelved. A good response in 5 sentences:
1. Acknowledges the specific role / company (not generic)
2. States ONE specific reason it's interesting OR ONE specific concern
3. Confirms basic logistics (current location, comp band, timeline)
4. Asks ONE sharp question that filters in/out fast
5. Soft close with availability

## Inputs ($args, parsed from `RECRUITER_REPLY_INPUT` env JSON)

- `profileId`, `leadId`
- `lead` — the full lead record (senderName, subject, body, kind, channel)
- `tone` — `formal` | `friendly` | `concise` (default `friendly`)
- `intent` — `interested-want-more` | `interested-with-concern` | `polite-decline` | `comp-first`
- `userConcern` — optional free-form text the user wants addressed
- `userQuestion` — optional free-form question to weave in

Also read: `cv.md`, `config/profile.yml` (target archetypes, comp range,
locations, work mode), `modes/_profile.md`.

## Output

ONE markdown file at:

```text
{output-dir}/inbound-reply-{leadId}-{YYYY-MM-DD}.md
```

Format:

```markdown
# Reply draft · {senderName} · {kind}

**Subject:** Re: {subject or generic if blank}

Hi {sender first name},

_(5-sentence body following the rules below.)_

Best,
{user first name}

---

## Why this draft works

_(2-3 bullet points: which specific levers this response pulls.)_

## What to edit before sending

_(2-3 specific things the user should adapt — comp number, dates, etc.)_

## Alternative tones available

_(If tone was formal: show the "friendly" alternative in 2 sentences.)_
```

After writing the file, emit:

```yaml
REPLY_PATH: {relative-path}
```

## Intent-specific behaviour

### `interested-want-more`
- Lead with what's interesting about the role
- Ask the 1 sharpest filter question (team stage, scope, comp band)
- Soft close: "Happy to chat — what works for a 20 min call?"

### `interested-with-concern`
- Acknowledge briefly
- State the concern clearly (e.g. "I'm based in Berlin and the role
  reads as US-only — is remote outside the US an option?")
- Make it a one-question close. They reply or they don't.

### `polite-decline`
- Thank them with one specific signal (so they remember you)
- Say no clearly: "Not the right fit for me right now — I'm focused on
  {specific area} roles."
- Door-open: "Happy to stay in touch for the future."
- Optionally: "If you have anyone in your network looking at {area},
  glad to chat — referrals work both ways."

### `comp-first`
- Acknowledge the role exists
- State your comp band UPFRONT: "Before we go further: I'm targeting
  {range} TC for senior roles. If that's in scope we can move forward;
  if not, I appreciate the heads-up."
- Single sentence close.

## Tone rules

| Tone | Style |
|---|---|
| `formal` | "Dear {name}", "Sincerely", no contractions |
| `friendly` | "Hi {name}", contractions OK, ONE exclamation max |
| `concise` | 3 sentences total, no flourishes, no signoff flourish |

## Anti-patterns (DO NOT)

- "I'm passionate about [domain]" — banned
- "I'm always open to opportunities" — sounds desperate
- "Could you send me the JD?" — they expect you to engage; this puts work on them
- "Let me know when you're free" — passive; suggest a window instead
- Emoji 🚀 / 💡 / ✨ — banned in professional outreach
- More than ONE exclamation point in the whole draft

## DO

- Use the recruiter's first name
- Reference SOMETHING specific from their message (proves you read it)
- State your concrete situation (location, work mode, comp band)
- Make the next step crisp (a call, a specific question)
- Sign off with first name only (matching their casual register)

## Quality bar

- Reply body MUST be under 120 words
- No more than 1 question (multiple questions = the recruiter cherry-
  picks the easy one)
- "Why this draft works" must be specific to the lead, not generic
- If lead.kind === 'scam' OR 'mass-blast' — refuse to draft. Emit
  REPLY_PATH: SKIPPED-{kind} and exit.
