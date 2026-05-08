# Mode: post-rejection — Pattern analysis after rejections

Triggered weekly OR after every 5 rejections. Run `/career-ops post-rejection` or auto-trigger from the UI.

## Goal

Find what's failing in the candidate's funnel and recommend specific changes to the system (cv.md, profile.yml, modes/_profile.md, portals.yml).

## Inputs

1. `data/applications.md` — all application records, status column
2. `reports/<id>-*.md` — A-G evaluations (Block B has CV-vs-JD match analysis with gaps)
3. `config/profile.yml` — current profile
4. `cv.md` — current CV

## Analysis steps

1. **Filter to rejected applications** (Status = Rejected or "no response 4+ weeks")
2. **Extract patterns**:
   - Companies (size / industry / location / age)
   - Roles (archetype / level / specific keywords in title)
   - JD requirements with gap markers in Block B
   - Recurring "missing skills" or "weak match" notes
3. **Compare** to non-rejected (Interview / Offer) applications:
   - What are accepted apps' archetypes?
   - What are rejected apps' archetypes?
   - Is there an archetype mismatch driving rejections?
4. **Look at scoring**:
   - Average score of rejected applications
   - Distribution by BG risk
   - Distribution by company size

## Output

A structured report:

### Summary
- Total apps in window: N
- Rejected: R
- No response 4+ weeks: NR
- Interview / Offer: I
- Rejection rate: R/(R+I) %

### Patterns in rejection
1. **Top 3 failing archetypes** (with counts)
2. **Top 5 missing skills** flagged in Block B gaps
3. **Top 3 BG-related concerns** (HIGH risk + rejected combinations)
4. **Recurring company traits** (size, industry, geo)

### Recommendations
For each pattern, propose a SPECIFIC fix:
- "Drop archetype X from primary; market signal is weak"
- "Add skill Y to cv.md skills section — appears in 7 of 10 rejected JDs"
- "Disable companies in industry Z in portals.yml — 0 callbacks from 12 apps"
- "Adjust profile.yml comp target — current $X may be priced out for stage of companies you're hitting"

### Open questions for the candidate
- "Are you comfortable with the geographic discount that comes with these roles?"
- "Would you consider Y archetype despite previously deprioritizing it?"

## Important

This mode is INSIGHT, not action. It produces a recommendation report — the candidate (and you, the agent) review it together and decide which changes to actually apply.
