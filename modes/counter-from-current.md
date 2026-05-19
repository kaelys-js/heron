# Mode: counter-from-current -- should you take it?

Your current employer just made a counter-offer to keep you. This mode
runs an EV-of-staying calculation + drafts a response.

The conventional wisdom is "never accept a counter -- 80% leave within
12 months anyway". That's directionally true but wrong when applied
blindly. Real factors that matter:

- Why did you start looking in the first place? (comp / role / culture / manager)
- Does the counter address the ROOT cause or just the surface (more $)?
- Has anything structural changed (new manager, new team, new scope)?
- What's the new-job EV without the counter?
- What's the cost of staying (delayed network growth, frozen at this level)?

## Inputs ($args, parsed from `COUNTER_FROM_CURRENT_INPUT` env JSON)

- `profileId`, `jobId` (the new-employer job in question), `newCompany`, `newRole`
- `currentEmployer` -- current company name
- `currentTitle`, `currentTC`, `currentTenureYears`
- `newOfferTC`, `newOfferLevel`
- `counterOffer` -- what current employer is offering: `{ newTitle?, newTC, otherChanges?: string[] }`
- `whyLooking` -- string the user wrote: 2-4 sentences on why they started
  job-searching in the first place
- `whatChangedSinceTalking` -- string the user wrote: what (if anything)
  changed at current employer between starting the search and the counter
  arriving

Also read: `__CV__`, `__PROFILE_YML__`, `__PROFILE_MD__`.

## Output

ONE markdown file at:

```text
__OUTPUT__/{currentEmployer-slug}-counter-evaluation.md
```

Format:

```markdown
# Counter-offer evaluation · {currentEmployer} vs {newCompany}

## TLDR

_(2-3 sentence verdict. "Take the counter" / "Take the new offer" /
"Negotiate the new offer harder before deciding". Honest, not flattering.)_

## What you said you were looking for

_(Quote the user's `whyLooking` summary back to them. The most important
signal in this decision is whether the counter addresses what you
originally said you wanted.)_

## What the counter addresses

_(For each root cause from whyLooking, mark: ✅ Addressed / ❌ Not addressed.
Comp without role/scope changes is usually surface-only.)_

| Original concern | Counter addresses? | How? |
|---|---|---|
| _{concern 1}_ | ✅ / ❌ | _{evidence}_ |

## What the new offer addresses

_(Same matrix, for the new offer.)_

## EV math

_(Side-by-side 3-year EV calc. Inputs: current TC + tenure + raise
trajectory vs new offer TC + ramp risk + level. State assumptions
explicitly. Include the "80% leave within 12 months" prior weighted
against the specific counter.)_

| Scenario | 1-year value | 3-year value | Career velocity |
|---|---|---|---|
| Stay with counter | ... | ... | ... |
| Take new offer | ... | ... | ... |

## Risks if you stay

- _(Likely-to-be-resented signal — manager now knows you almost left)_
- _(Reduced trust on next promotion / scope conversation)_
- _(Counter often runs out in 18 months — comp re-anchors at prior cycle)_

## Risks if you go

- _(Ramp risk at new company — 6 months of lower productivity)_
- _(Cultural fit unknown until you're there)_
- _(Network reset)_

## Draft responses

### If you stay:

```
Hi {current manager},

Thank you for the counter-offer and the conversation today. I've
thought about it carefully, and I want to stay -- [specific reason that
maps to whyLooking]. I'd like to formalise the changes we discussed in
writing this week.
```text

### If you go:

```
Hi {current manager},

Thank you again for the counter and the trust it represents. I've
made my decision and will be moving forward with the other opportunity.
[Specific reason that's honest but not burning bridges.] I'd like to
make this transition as smooth as possible -- happy to discuss handoff
priorities tomorrow.
```text

### If you're negotiating:

```
Hi {newCompany recruiter},

I want to be transparent with you: my current employer counter-offered
at {amount}. I'm still strongly inclined toward your role -- for [reason
that matters to them: mission/team/scope]. But I want to make sure my
move is the right call financially too. Can we revisit {comp / equity /
signing} in light of this?
```text
```

After writing the file, emit:

```yaml
COUNTER_PATH: {relative-path}
```

## Quality bar

- Be honest. If the counter genuinely addresses the root cause + the
  new offer has real ramp risk, RECOMMEND STAYING. Don't default to
  "always take the new offer" -- that's lazy.
- Make the EV math visible. The user should be able to argue with your
  numbers, not just accept them.
- The draft responses are STARTING points -- the user adapts them.
- Never tell the user what to do; surface trade-offs.
