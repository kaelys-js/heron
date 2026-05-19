# Team-reputation deep research -- what's the inside word on this company?

You're producing a structured snapshot of company reputation across
public sources. Used to surface team-quality risk BEFORE the user
invests time interviewing.

Same legal posture as `comp-benchmark`: we hit public pages once each,
extract data, and write a citation. We do NOT scrape, mass-pull, or
violate ToS.

## Inputs ($args, parsed from `TEAM_REP_INPUT` env JSON)

- `company` -- name to research
- `jobId`, `profileId` -- context only

## Output

ONE JSON blob printed to stdout (the dashboard caches it under
`__PROFILE__/team-rep/{slug}.json`). Schema:

```json
{
  "glassdoorRating": 4.1,
  "glassdoorRecommend": 78,
  "glassdoorCeoApproval": 84,
  "glassdoorInterviewDifficulty": 3.2,
  "glassdoorPros": ["_(one short string per source review surfacing a real pattern, max 5)_"],
  "glassdoorCons": ["_(same, max 5)_"],
  "blindSentiment": "mixed",
  "blindSnippets": ["_(short Blind quote with attribution, max 3, never name individuals)_"],
  "recentLayoffs": [
    {
      "date": "2024-11-12",
      "headcount": 80,
      "note": "Engineering org cut — payments + infra teams affected"
    }
  ],
  "headcountTrend": "growing",
  "sources": ["glassdoor.com/...", "blind.com/...", "layoffs.fyi/..."]
}
```

Numeric fields are OPTIONAL -- if a source returns nothing usable, omit
the field rather than making one up.

## Sources to hit

| Source                                      | What to extract                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Glassdoor reviews page                      | Overall rating, % recommend, CEO approval, interview-difficulty score, 3-5 most-common pros + cons                        |
| Blind (teamblind.com) public threads search | Sentiment about company over last 6 months. NEVER reproduce full posts -- short pithy quotes (≤ 20 words each, attributed) |
| Layoffs.fyi                                 | Last 24 months of layoff events at this company                                                                           |
| LinkedIn (via WebFetch on the company page) | Headcount trend (growth/flat/shrink) -- order of magnitude only                                                            |
| Public press (Bloomberg, FT, TechCrunch)    | Recent funding rounds, acquisitions, restructuring                                                                        |

Cap total web requests at 6.

## Sentiment scoring

- `positive` -- overall rating ≥ 4.0 AND no major layoff in 12 months AND Blind sentiment leans positive
- `negative` -- overall rating < 3.5 OR layoff in last 6 months OR Blind sentiment clearly negative
- `mixed` -- otherwise
- `neutral` -- when there's very little signal

## Quality bar

- Every claim cites a source URL.
- NEVER reproduce more than 20 words of any Blind / Glassdoor post (copyright + ToS).
- If you can't find Glassdoor data, OMIT the Glassdoor fields. Don't infer them from press.
- The summary should be terse -- the dashboard renders this as a card.

## After writing

Print the JSON blob (just the JSON, no prose, no markdown fence). The
endpoint regex-matches `{ ... "sources" ... }` so write valid JSON.
