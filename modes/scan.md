# Mode: scan -- Portal Scanner (Offer Discovery)

Scans configured job portals, filters by title relevance, and adds new offers to the pipeline for later evaluation.

> **Note (v1.5+):** The default scanner (`scan.mjs` / `npm run scan`) is **zero-token** and queries Greenhouse, Ashby, and Lever's public APIs directly. The Playwright/WebSearch tiers described below are the **agent** flow (run by Claude/Codex), not what `scan.mjs` does. If a company doesn't have a Greenhouse/Ashby/Lever API, `scan.mjs` will ignore it; for those cases, the agent should manually run Tier 1 (Playwright) or Tier 3 (WebSearch).

## Recommended execution

Run as a subagent so it doesn't burn main-thread context:

```text
Agent(
    subagent_type="general-purpose",
    prompt="[contents of this file + specific data]",
    run_in_background=True
)
```

## Configuration

Read `__PORTALS__`, which contains:
- `search_queries`: list of WebSearch queries with `site:` filters per portal (wide discovery)
- `tracked_companies`: specific companies with a `careers_url` for direct navigation
- `title_filter`: positive/negative/seniority_boost keywords for title filtering

## Discovery strategy (3 tiers)

### Tier 1 -- Playwright direct (PRIMARY)

**For each company in `tracked_companies`:** Navigate to its `careers_url` with Playwright (`browser_navigate` + `browser_snapshot`), read EVERY visible job listing, and extract title + URL for each one. This is the most reliable method because:
- It sees the page in real time (no cached Google results)
- It works with SPAs (Ashby, Lever, Workday)
- It detects new offers instantly
- It doesn't depend on Google's indexing

**Every company MUST have a `careers_url` in __PORTALS__.** If it doesn't, look it up once, save it, and reuse it on future scans.

### Tier 2 -- ATS APIs / Feeds (COMPLEMENTARY)

For companies with a public API or structured feed, use the JSON/XML response as a quick complement to Tier 1. It's faster than Playwright and reduces visual-scraping errors.

**Current support (variables between `{}`):**
- **Greenhouse**: `https://boards-api.greenhouse.io/v1/boards/{company}/jobs`
- **Ashby**: `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`
- **BambooHR**: list `https://{company}.bamboohr.com/careers/list`; one-offer detail `https://{company}.bamboohr.com/careers/{id}/detail`
- **Lever**: `https://api.lever.co/v0/postings/{company}?mode=json`
- **Teamtailor**: `https://{company}.teamtailor.com/jobs.rss`
- **Workday**: `https://{company}.{shard}.myworkdayjobs.com/wday/cxs/{company}/{site}/jobs`

**Parsing convention per provider:**
- `greenhouse`: `jobs[]` → `title`, `absolute_url`
- `ashby`: GraphQL `ApiJobBoardWithTeams` with `organizationHostedJobsPageName={company}` → `jobBoard.jobPostings[]` (`title`, `id`; build the public URL if it isn't in the payload)
- `bamboohr`: list `result[]` → `jobOpeningName`, `id`; build the detail URL `https://{company}.bamboohr.com/careers/{id}/detail`; to read the full JD, GET the detail and use `result.jobOpening` (`jobOpeningName`, `description`, `datePosted`, `minimumExperience`, `compensation`, `jobOpeningShareUrl`)
- `lever`: root array `[]` → `text`, `hostedUrl` (fallback: `applyUrl`)
- `teamtailor`: RSS items → `title`, `link`
- `workday`: `jobPostings[]`/`jobPostings` (per tenant) → `title`, `externalPath` or URL built from the host

### Tier 3 -- WebSearch queries (WIDE DISCOVERY)

The `search_queries` with `site:` filters cover portals horizontally (every Ashby, every Greenhouse, etc.). Useful for discovering NEW companies not yet in `tracked_companies`, but the results may be stale.

**Execution priority:**
1. Tier 1: Playwright → every `tracked_company` with a `careers_url`
2. Tier 2: API → every `tracked_company` with `api:`
3. Tier 3: WebSearch → every `search_query` with `enabled: true`

The tiers are additive -- run all, merge results, deduplicate.

## Workflow

1. **Read configuration**: `__PORTALS__`
2. **Read history**: `data/__SCAN_HISTORY__` → URLs already seen
3. **Read dedup sources**: `data/__APPLICATIONS__` + `data/__PIPELINE__`

4. **Tier 1 -- Playwright scan** (parallel in batches of 3-5):
   For each company in `tracked_companies` with `enabled: true` and a defined `careers_url`:
   a. `browser_navigate` to the `careers_url`
   b. `browser_snapshot` to read every job listing
   c. If the page has filters/departments, navigate the relevant sections
   d. For each job listing extract: `{title, url, company}`
   e. If the page paginates results, navigate the additional pages
   f. Accumulate into the candidate list
   g. If `careers_url` fails (404, redirect), try `scan_query` as a fallback and note the URL for updating

5. **Tier 2 -- ATS APIs / feeds** (parallel):
   For each company in `tracked_companies` with `api:` set and `enabled: true`:
   a. WebFetch the API/feed URL
   b. If `api_provider` is set, use its parser; if not, infer from the domain (`boards-api.greenhouse.io`, `jobs.ashbyhq.com`, `api.lever.co`, `*.bamboohr.com`, `*.teamtailor.com`, `*.myworkdayjobs.com`)
   c. For **Ashby**, send a POST with:
      - `operationName: ApiJobBoardWithTeams`
      - `variables.organizationHostedJobsPageName: {company}`
      - GraphQL query of `jobBoardWithTeams` + `jobPostings { id title locationName employmentType compensationTierSummary }`
   d. For **BambooHR**, the list only carries basic metadata. For each relevant item, read the `id`, GET `https://{company}.bamboohr.com/careers/{id}/detail`, and extract the full JD from `result.jobOpening`. Use `jobOpeningShareUrl` as the public URL if present; otherwise use the detail URL.
   e. For **Workday**, send a JSON POST with at least `{"appliedFacets":{},"limit":20,"offset":0,"searchText":""}` and paginate by `offset` until results are exhausted
   f. For each job extract and normalize: `{title, url, company}`
   g. Accumulate into the candidate list (dedup against Tier 1)

6. **Tier 3 -- WebSearch queries** (parallel where possible):
   For each query in `search_queries` with `enabled: true`:
   a. Run WebSearch with the defined `query`
   b. For each result extract: `{title, url, company}`
      - **title**: from the result title (before " @ " or " | ")
      - **url**: result URL
      - **company**: after " @ " in the title, or extract from the domain/path
   c. Accumulate into the candidate list (dedup against Tier 1+2)

6. **Filter by title** using `title_filter` from `__PORTALS__`:
   - At least 1 `positive` keyword must appear in the title (case-insensitive)
   - 0 `negative` keywords may appear
   - `seniority_boost` keywords give priority but are not required

7. **Deduplicate** against 3 sources:
   - `__SCAN_HISTORY__` → exact URL already seen
   - `__APPLICATIONS__` → company + normalized role already evaluated
   - `__PIPELINE__` → exact URL already pending or processed

7.5. **Verify liveness of Tier 3 (WebSearch) results** -- BEFORE adding to pipeline:

   WebSearch results can be stale (Google caches for weeks or months). To avoid evaluating expired offers, verify each new Tier-3 URL with Playwright. Tiers 1 and 2 are inherently real-time and don't need this verification.

   For each new Tier-3 URL (sequential -- NEVER Playwright in parallel):
   a. `browser_navigate` to the URL
   b. `browser_snapshot` to read the content
   c. Classify:
      - **Active**: visible job title + role description + visible Apply/Submit control inside the main content. Do not count generic header/navbar/footer text.
      - **Expired** (any of these signals):
        - Final URL contains `?error=true` (Greenhouse redirects this way when an offer is closed)
        - Page contains: "job no longer available" / "no longer open" / "position has been filled" / "this job has expired" / "page not found"
        - Only navbar and footer visible, no JD content (content < ~300 chars)
   d. If expired: record in `__SCAN_HISTORY__` with status `skipped_expired` and discard
   e. If active: continue to step 8

   **Do not interrupt the whole scan if one URL fails.** If `browser_navigate` errors (timeout, 403, etc.), mark as `skipped_expired` and move on.

8. **For each new verified offer that passes filters**:
   a. Add to `__PIPELINE__` under the "Pending" section: `- [ ] {url} | {company} | {title}`
   b. Record in `__SCAN_HISTORY__`: `{url}\t{date}\t{query_name}\t{title}\t{company}\tadded`

9. **Offers filtered out by title**: record in `__SCAN_HISTORY__` with status `skipped_title`
10. **Duplicate offers**: record with status `skipped_dup`
11. **Expired offers (Tier 3)**: record with status `skipped_expired`

## Extracting title + company from WebSearch results

WebSearch results come in formats: `"Job Title @ Company"` or `"Job Title | Company"` or `"Job Title -- Company"`.

Extraction patterns per portal:
- **Ashby**: `"Senior AI PM (Remote) @ EverAI"` → title: `Senior AI PM`, company: `EverAI`
- **Greenhouse**: `"AI Engineer at Anthropic"` → title: `AI Engineer`, company: `Anthropic`
- **Lever**: `"Product Manager - AI @ Temporal"` → title: `Product Manager - AI`, company: `Temporal`

Generic regex: `(.+?)(?:\s*[@|----]\s*|\s+at\s+)(.+?)$`

## Private URLs

If a non-publicly-accessible URL is found:
1. Save the JD to `__JDS__/{company}-{role-slug}.md`
2. Add to __PIPELINE__ as: `- [ ] local:__JDS__/{company}-{role-slug}.md | {company} | {title}`

## Scan History

`data/__SCAN_HISTORY__` tracks EVERY URL seen:

```text
url	first_seen	portal	title	company	status
https://...	2026-02-10	Ashby — AI PM	PM AI	Acme	added
https://...	2026-02-10	Greenhouse — SA	Junior Dev	BigCo	skipped_title
https://...	2026-02-10	Ashby — AI PM	SA AI	OldCo	skipped_dup
https://...	2026-02-10	WebSearch — AI PM	PM AI	ClosedCo	skipped_expired
```

## Output summary

```text
Portal Scan — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━━━━━━━━━
Queries run: N
Offers found: N total
Filtered by title: N relevant
Duplicates: N (already evaluated or in pipeline)
Expired discarded: N (dead links, Tier 3)
New additions to __PIPELINE__: N

  + {company} | {title} | {query_name}
  ...

→ Run /heron pipeline to evaluate the new offers.
```

## Managing careers_url

Each company in `tracked_companies` must have a `careers_url` -- the direct URL to its careers page. This avoids re-discovering it every time.

**RULE: Always prefer the company's own corporate URL; fall back to the ATS endpoint only when the company has no corporate page.**

The `careers_url` should point to the company's own jobs page whenever one is available. Many companies use Workday, Greenhouse, or Lever under the hood but only expose role IDs through their corporate domain. Using the direct ATS URL when a corporate page exists can cause false 410 errors because the role IDs don't line up.

| ✅ Correct (corporate) | ❌ Wrong as first choice (direct ATS) |
|---|---|
| `https://careers.mastercard.com` | `https://mastercard.wd1.myworkdayjobs.com` |
| `https://openai.com/careers` | `https://job-boards.greenhouse.io/openai` |
| `https://stripe.com/jobs` | `https://jobs.lever.co/stripe` |

Fallback: if you only have the direct ATS URL, first navigate to the company's website and locate its corporate careers page. Use the direct ATS URL only if the company has no corporate page.

**Known platform patterns:**
- **Ashby:** `https://jobs.ashbyhq.com/{slug}`
- **Greenhouse:** `https://job-boards.greenhouse.io/{slug}` or `https://job-boards.eu.greenhouse.io/{slug}`
- **Lever:** `https://jobs.lever.co/{slug}`
- **BambooHR:** list `https://{company}.bamboohr.com/careers/list`; detail `https://{company}.bamboohr.com/careers/{id}/detail`
- **Teamtailor:** `https://{company}.teamtailor.com/jobs`
- **Workday:** `https://{company}.{shard}.myworkdayjobs.com/{site}`
- **Custom:** the company's own URL (e.g. `https://openai.com/careers`)

**API/feed patterns per platform:**
- **Ashby API:** `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`
- **BambooHR API:** list `https://{company}.bamboohr.com/careers/list`; detail `https://{company}.bamboohr.com/careers/{id}/detail` (`result.jobOpening`)
- **Lever API:** `https://api.lever.co/v0/postings/{company}?mode=json`
- **Teamtailor RSS:** `https://{company}.teamtailor.com/jobs.rss`
- **Workday API:** `https://{company}.{shard}.myworkdayjobs.com/wday/cxs/{company}/{site}/jobs`

**If `careers_url` doesn't exist** for a company:
1. Try the known platform pattern
2. If that fails, run a quick WebSearch: `"{company}" careers jobs`
3. Navigate with Playwright to confirm it works
4. **Save the discovered URL in __PORTALS__** for future scans

**If `careers_url` returns 404 or redirects:**
1. Note it in the output summary
2. Try `scan_query` as a fallback
3. Flag for manual update

## Maintaining __PORTALS__

- **ALWAYS save `careers_url`** when adding a new company
- Add new queries as you discover interesting portals or roles
- Disable queries with `enabled: false` if they generate too much noise
- Adjust filter keywords as target roles evolve
- Add companies to `tracked_companies` when you want to track them closely
- Verify `careers_url` periodically -- companies change ATS platforms
