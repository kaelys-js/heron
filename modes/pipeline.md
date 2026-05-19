# Mode: pipeline -- URL Inbox (Second Brain)

Processes offer URLs accumulated in `data/__PIPELINE__`. The user adds URLs whenever, then runs `/heron pipeline` to process them all.

## Workflow

1. **Read** `data/__PIPELINE__` → find `- [ ]` items under the "Pending" section
2. **For each pending URL**:
   a. Compute the next sequential `REPORT_NUM` (read `__REPORTS__/`, take the highest number + 1)
   b. **Extract the JD** using Playwright (browser_navigate + browser_snapshot) → WebFetch → WebSearch
   c. If the URL isn't reachable → mark it `- [!]` with a note and continue
   d. **Run the full auto-pipeline**: A-F evaluation → Report .md → PDF (if score >= 3.0) → Tracker
   e. **Move from "Pending" to "Processed"**: `- [x] #NNN | URL | Company | Role | Score/5 | PDF ✅/❌`
3. **If there are 3+ pending URLs**, launch agents in parallel (Agent tool with `run_in_background`) to maximize throughput.
4. **When finished**, show a summary table:

```text
| # | Company | Role | Score | PDF | Recommended action |
```

## __PIPELINE__ format

```markdown
## Pending
- [ ] https://jobs.example.com/posting/123
- [ ] https://boards.greenhouse.io/company/jobs/456 | Company Inc | Senior PM
- [!] https://private.url/job — Error: login required

## Processed
- [x] #143 | https://jobs.example.com/posting/789 | Acme Corp | AI PM | 4.2/5 | PDF ✅
- [x] #144 | https://boards.greenhouse.io/xyz/jobs/012 | BigCo | SA | 2.1/5 | PDF ❌
```

## Smart JD detection from URL

1. **Playwright (preferred):** `browser_navigate` + `browser_snapshot`. Works with every SPA.
2. **WebFetch (fallback):** for static pages or when Playwright isn't available.
3. **WebSearch (last resort):** search secondary portals that index the JD.

**Special cases:**
- **LinkedIn**: may require login → mark `[!]` and ask the user to paste the text
- **PDF**: if the URL points to a PDF, read it directly with the Read tool
- **`local:` prefix**: read the local file. Example: `local:__JDS__/linkedin-pm-ai.md` → read `__JDS__/linkedin-pm-ai.md`

## Automatic numbering

1. List every file in `__REPORTS__/`
2. Extract the number from the prefix (e.g. `142-medispend...` → 142)
3. New number = highest found + 1

## Source synchronization

Before processing any URL, verify sync:
```bash
node cv-sync-check.mjs
```
If there's drift, warn the user before continuing.
