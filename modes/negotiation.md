# Mode: negotiation — Offer negotiation playbook

Triggered when an offer arrives. Run `/heron negotiation <company>` or invoke from the UI's negotiation panel.

## Inputs needed from the candidate

Ask if not already in the offer message:
1. **Role/title** offered
2. **Base salary** (currency + amount)
3. **Equity** (shares, vesting schedule, valuation if known)
4. **Bonus** structure (signing, performance)
5. **Benefits highlights** (PTO, healthcare, retirement)
6. **Location** (remote / hybrid / on-site)
7. **Start date** flexibility
8. **Competing offers** if any
9. **Candidate's current comp** (only used for the "I'm coming from X" framing — optional)

## Research phase (do this BEFORE drafting any counter)

1. Read `__REPORTS__/<id>-<company>-*.md` Block D for comp research already done
2. Run a fresh WebSearch for current data:
   - "<company> Senior Software Engineer salary Levels.fyi"
   - "<company> equity refresh"
   - "<company> Glassdoor compensation"
   - "<role title> remote US senior salary 2026"
3. Build a comp table:
   - 25th / 50th / 75th / 90th percentile for the role at the company
   - Same percentiles for the broader market

## Negotiation strategy

Score the offer:
- Base: percentile vs market (e.g., 60th)
- Equity: percentile + risk-adjusted value
- Total: percentile

Pick a leverage stance:
- **Strong** (offer < 50th percentile or competing offer in hand): counter aggressively
- **Moderate** (offer at 50-70th): counter with modest ask + non-cash improvements
- **Weak** (offer > 75th, no competing offer): polish edges (start date, signing bonus) — don't push base

## Counter-offer template

Output a draft email with:

> Hi [recruiter],
>
> Thanks so much for the offer — really excited about [specific thing about the team/role from Block A].
>
> I'd like to talk through a few details before signing:
>
> 1. **Base salary**: Based on market data for [role] at companies of [company]'s stage and the level/scope of this role, I'm seeing [60-90th percentile range from research]. Could we look at [target ask, justified]?
>
> 2. **[Equity / signing bonus / PTO]**: [specific ask with brief reasoning]
>
> 3. **[Start date / remote flexibility]**: [if relevant]
>
> Happy to talk through any of this on a call. Excited to make this work.
>
> Cole

## Output for the candidate

1. The comp table (so they can see the data)
2. The leverage stance + reasoning
3. The draft counter email
4. **Two alternate stances** if they want to push harder or back off (give the candidate options)
5. **Likely recruiter responses** + how to handle each

## Important rules

- Never auto-send. The candidate sends the email themselves.
- Geographic discount pushback (if recruiter cites Vancouver vs SF): "The roles I'm competitive for are output-based, not location-based. My track record doesn't change based on postal code."
- If competing offer leverage exists, frame it as "I have another offer at [range]; how can we close the gap?"
- BG check note: do NOT mention any criminal record proactively. If the offer letter requires BG-check pass-through, surface that to the candidate as a manual checkpoint — the candidate decides disclosure timing.
