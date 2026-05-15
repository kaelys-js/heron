# Leadership lookup — who runs this company and should you care?

Before joining, candidates should know:

- **Founders** — are they still here? Track record? Reputation?
- **C-suite tenure** — long average tenure = stable; <18mo average = revolving door (red flag)
- **Hiring manager → CEO chain** — fewer hops = startup energy; many hops = corporate
- **Recent C-suite departures** — last 12 months. CFO leaving before IPO? Bad signal.
- **VP/SVP of Engineering** — for engineering candidates, who's the technical north star?
- **Recent board changes** — investor exits, new board seats = strategy shift

This mode pulls this from public sources (LinkedIn, company press releases,
Crunchbase, SEC filings if public).

## Inputs ($args, parsed from `LEADERSHIP_INPUT` env JSON)

- `profileId`, `jobId`, `company`
- `focusRole` — optional string, e.g. "Engineering" — emphasises that
  function's leadership chain

## Output

ONE JSON blob printed to stdout (the dashboard caches under
`__PROFILE__/leadership/{company-slug}.json`):

```json
{
  "founders": [
    {
      "name": "...",
      "stillActive": true,
      "currentRole": "CEO",
      "tenureYears": 8,
      "priorCompanies": ["..."],
      "publicProfile": "https://linkedin.com/..."
    }
  ],
  "cSuite": [
    {
      "name": "...",
      "title": "CFO",
      "startedAt": "2022-03",
      "tenureYears": 2.4,
      "priorCompanies": ["..."],
      "publicProfile": "https://linkedin.com/..."
    }
  ],
  "avgCSuiteTenureYears": 3.1,
  "departures12Months": [
    {
      "name": "...",
      "formerTitle": "VP Engineering",
      "departedAt": "2024-11",
      "notes": "Departed to start own company. Brief 8mo tenure."
    }
  ],
  "redFlags": [
    {
      "kind": "short-c-suite",
      "detail": "Average C-suite tenure 1.4yr — revolving door"
    }
  ],
  "greenFlags": [
    {
      "kind": "founder-led",
      "detail": "Both founders still active in operating roles after 8 years"
    }
  ],
  "sources": ["..."]
}
```

After printing the JSON, optionally emit:

```yaml
LEADERSHIP_PATH: {relative-path-to-file}
```

## Search strategy

Cap web requests at 6. Order:

1. Company "About / Leadership" page on their own site
2. LinkedIn "People" view for the company
3. Crunchbase entry (for funding + board history)
4. Public press: "{company} hires CFO" / "{company} departs"
5. SEC EDGAR if public — proxy statement has executive compensation + tenure
6. Glassdoor "Senior Leadership" page

## Red flag heuristics

- Average C-suite tenure < 18 months → "short-c-suite"
- More than 2 C-suite departures in 12 months → "exec-churn"
- Founder no longer on cap table (sold equity early) → "founder-exit"
- CTO/VP Engineering changed in last 6 months → "tech-leadership-volatility"
- Last quarter's earnings (if public) had executive transition language → "imminent-turmoil"

## Green flag heuristics

- Founders still active after 5+ years → "founder-led"
- C-suite average tenure 4+ years → "stable-leadership"
- Internal promotions to C-suite > external hires → "from-within"

## Quality bar

- Every claim cites a source URL.
- NEVER speculate. If you can't find when an exec started, say "unknown".
- Don't reproduce executive headshots or biographical detail beyond
  what's necessary to flag a signal.
- Keep the JSON compact — the dashboard renders a summary card, not
  a wall of text.
