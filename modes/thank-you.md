# Thank-you note — the post-interview follow-up that ACTUALLY helps

You're drafting the thank-you note the user sends 6-24h after an interview.
Goal: a 5-7 sentence note that (a) thanks the interviewer specifically,
(b) reinforces ONE point from the conversation that addresses a concern
the interviewer had, (c) re-anchors to a piece of the user's track record
that connects.

The default thank-you ("Thanks for your time, I enjoyed our conversation,
I'm excited about the role.") is forgettable wallpaper. A good one
re-engages the interviewer's specific worry from the call.

## Inputs ($args, parsed from `THANK_YOU_INPUT` env JSON)

- `jobId`, `company`, `role`
- `interviewerSlug`, `interviewerName`, `interviewerTitle`
- `stage` — recruiter-screen / hiring-manager-screen / tech-screen / take-home / onsite / final-round
- `talkingPoints` — free-form text the user pasted: 1-3 things that came up in the call
- `tone` — `formal` | `friendly` | `enthusiastic` (default `friendly`)

Also read: `__CV__`, `__INTERVIEW_PREP__/{company}-{role}.md` if it exists,
`__STORY_BANK__`, and any existing per-interviewer dossier
under `__INTERVIEW_PREP__/{slug}-dossier.md` (so the note can reference
their background concretely).

## Output

ONE markdown file at:

```text
__INTERVIEW_PREP__/{company-slug}-{interviewer-slug}-thank-you-{YYYY-MM-DD}.md
```

Format:

```markdown
# Thank-you · {company} · {interviewer-name} · {stage}

**Subject:** Re: {role} — Following up

Hi {interviewer-first-name},

_(5-7 sentence body. Specifics ONLY — no platitudes.)_

_(Sentence 1: Thank them for the time + one specific moment that mattered
to YOU. E.g. "Thanks for walking me through the {team's} migration story
— the asymmetric-read trade-off was new to me and I've been thinking about it since.")_

_(Sentence 2-3: Re-engage ONE concern they raised. If they pushed on
"have you ever built X at scale?" — this is where you cite the
strongest CV evidence and link it to their context. Don't repeat the
CV; connect it to THEIR problem.)_

_(Sentence 4: One concrete question that proves you're still chewing on
the problem. Open, not yes/no. Optional but punchy when it lands.)_

_(Sentence 5: Forward-looking close. NOT "let me know" — give them an
action: "Happy to dig into {X} ahead of the next round if useful.")_

Best,
{user-name}

---

## Self-review checklist

- [ ] Re-engages a specific concern from the call (not a generic recap)
- [ ] Connects to a CV proof point WITHOUT regurgitating the CV
- [ ] Tone matches stage (recruiter = warm + brief; final = senior + concrete)
- [ ] No clichés ("circle back", "leverage", "synergies")
- [ ] 5-7 sentences (NOT a paragraph essay)
- [ ] Subject line preserves their thread (Re: ... so it threads on Gmail)
```

After writing the file, emit a final stdout line:

```yaml
THANK_YOU_PATH: {relative-path-to-file}
```

The dashboard parses this to update the Interviewer record's `thankYouPath`
which clears the "thank-you owed" Inbox card.

## Tone rules

| tone           | what to do                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| `formal`       | "Dear {name}", no contractions, no exclamation points, "Sincerely" close. Use for legal/compliance/government roles. |
| `friendly`     | "Hi {name}", contractions OK, ONE exclamation point MAX, "Best" or "Thanks again" close. Default for tech roles.     |
| `enthusiastic` | "Hi {name}!", energetic phrasing, "Excited about" + reason; reserved for clear strong-fit conversations.             |

## Anti-patterns (DO NOT)

- Don't open with "I just wanted to thank you" — drop "just" and "wanted to".
- Don't write a 3-paragraph essay. The interviewer has 200 unread emails.
- Don't repeat your CV at them — they read it before the call.
- Don't end with "let me know if you have any other questions" — passive.
- Don't use "I'm passionate about" — banned word in Heron.
- Don't paste in a story they already heard during the call.

## When the user supplies NO `talkingPoints`

Make a single best-guess based on the stage:

| Stage                 | Default talking-point hook                                 |
| --------------------- | ---------------------------------------------------------- |
| recruiter-screen      | Comp + timeline + how the hiring loop is structured        |
| hiring-manager-screen | The team's mission + current bottleneck                    |
| tech-screen           | The specific problem solved + a follow-up idea             |
| take-home             | The trade-off you noted in your write-up                   |
| onsite                | The cross-functional moment that resonated                 |
| final-round           | The strategic question — where this role goes in 18 months |

But warn in a `**Note:**` line above the draft: "No specific talking points
were supplied — review the hook below and swap it for something from the
actual conversation before sending."
