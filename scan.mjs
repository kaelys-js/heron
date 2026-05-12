#!/usr/bin/env node

/**
 * scan.mjs — Zero-token portal scanner
 *
 * Fetches public ATS APIs directly, applies title filters from
 * portals.yml, deduplicates against existing history, and appends new
 * offers to pipeline.md + scan-history.tsv. Zero Claude API tokens —
 * pure HTTP + JSON.
 *
 * Supported ATS providers (detected from careers_url):
 *   • Greenhouse           job-boards.greenhouse.io/{tenant}
 *   • Greenhouse EU        job-boards.eu.greenhouse.io/{tenant}
 *   • Ashby                jobs.ashbyhq.com/{tenant}
 *   • Lever                jobs.lever.co/{tenant}
 *   • Workday              {tenant}.wd{N}.myworkdayjobs.com/{site}
 *   • SmartRecruiters      careers.smartrecruiters.com/{company}/* OR explicit `ats: smartrecruiters` field
 *   • Workable             apply.workable.com/{slug}/
 *   • Personio             {tenant}.jobs.personio.{com|de|eu}
 *   • Recruitee            {tenant}.recruitee.com or careers.{co}.com hosted by Recruitee
 *   • Teamtailor           {tenant}.teamtailor.com
 *
 * Usage:
 *   node scan.mjs                  # scan all enabled companies
 *   node scan.mjs --dry-run        # preview without writing files
 *   node scan.mjs --company Cohere # scan a single company
 *   node scan.mjs --source workday # only scan companies on a given ATS
 *   node scan.mjs --probe URL      # probe one URL and print detected ATS + sample
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import yaml from 'js-yaml';
import { profilePath, ensureProfileDirs, profileFromArgv } from './lib-profiles.mjs';
const parseYaml = yaml.load;

// ── Config — per-profile paths ─────────────────────────────────────
// Resolve --profile <slug> from argv (defaults to active profile in
// data/profiles.json). All scanner output goes to that profile's dir.
const PROFILE_ID = profileFromArgv();
ensureProfileDirs(PROFILE_ID);

const PORTALS_PATH = profilePath(PROFILE_ID, 'portals-yml');
const SCAN_HISTORY_PATH = profilePath(PROFILE_ID, 'scan-history');
const PIPELINE_PATH = profilePath(PROFILE_ID, 'pipeline');
const APPLICATIONS_PATH = profilePath(PROFILE_ID, 'applications');

const CONCURRENCY = 10;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

/** Retry on transient network/5xx errors. Hard-fails on 4xx (bad request,
 *  not-found, unauthorized) since those won't fix themselves on retry.
 *  Used by both the per-page and full-pagination paths. */
async function withRetry(label, fn) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err?.message || '';
      // Don't retry on 4xx — they're permanent (404, 401, 403, 422 etc).
      if (/HTTP 4\d\d/.test(msg)) throw err;
      // Last attempt: rethrow.
      if (attempt === MAX_RETRIES) throw err;
      // Backoff (1.5s, 3s) — easy on the upstream.
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
    }
  }
  throw lastErr;
}

// ── API detection ───────────────────────────────────────────────────
//
// Each detector inspects company.careers_url + optional explicit overrides
// (company.api, company.ats) and returns one of:
//   { type: 'greenhouse'|'ashby'|..., url, fetch?, parse? }   — match
//   null                                                      — no match
//
// The `fetch` field, when present, is the request descriptor the runner
// uses (method, body, headers). Default is GET with Accept: application/json.

function detectApi(company) {
  // Explicit overrides win over URL pattern matching — useful for companies
  // whose branded careers page hides the underlying ATS, or for dual-listed
  // companies where you want to force a specific source.
  if (company.api && company.api.includes('greenhouse')) {
    return { type: 'greenhouse', url: company.api };
  }
  if (company.ats === 'smartrecruiters' && company.smartrecruiters_company) {
    return {
      type: 'smartrecruiters',
      url: `https://api.smartrecruiters.com/v1/companies/${company.smartrecruiters_company}/postings?limit=100&offset=0`,
      fetch: { paginate: 'smartrecruiters', maxPages: 50 },
      meta: { company_slug: company.smartrecruiters_company },
    };
  }
  if (company.ats === 'workday' && company.workday) {
    const w = company.workday; // { tenant, pod, site }
    return {
      type: 'workday',
      url: `https://${w.tenant}.${w.pod}.myworkdayjobs.com/wday/cxs/${w.tenant}/${w.site}/jobs`,
      fetch: { method: 'POST', body: { appliedFacets: {}, limit: 100, offset: 0, searchText: '' } },
      meta: { tenant: w.tenant, pod: w.pod, site: w.site },
    };
  }

  const url = company.careers_url || '';

  // -- Ashby --
  const ashbyMatch = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
  if (ashbyMatch) {
    return {
      type: 'ashby',
      url: `https://api.ashbyhq.com/posting-api/job-board/${ashbyMatch[1]}?includeCompensation=true`,
    };
  }

  // -- Lever --
  const leverMatch = url.match(/jobs\.lever\.co\/([^/?#]+)/);
  if (leverMatch) {
    return {
      type: 'lever',
      url: `https://api.lever.co/v0/postings/${leverMatch[1]}`,
    };
  }

  // -- Greenhouse (US + EU subdomains) --
  const ghMatch = url.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/);
  if (ghMatch && !company.api) {
    return {
      type: 'greenhouse',
      url: `https://boards-api.greenhouse.io/v1/boards/${ghMatch[1]}/jobs`,
    };
  }

  // -- Workday — extract { tenant, pod (wd1/wd3/wd5/...), site } from the
  //    `*.myworkdayjobs.com/...` URL. The site segment may be preceded by a
  //    locale prefix like `/en-US/`. Workday caps `limit` at 20 per request,
  //    so we paginate; the runner sees a marker `paginate: 'workday'` and
  //    walks pages until it has enough or the upstream `total` is exhausted. --
  const wdayMatch = url.match(
    /https?:\/\/([a-zA-Z0-9_-]+)\.(wd\d+)\.myworkdayjobs\.com(?:\/[a-z]{2}-[A-Z]{2})?\/([^/?#]+)/,
  );
  if (wdayMatch) {
    const [, tenant, pod, site] = wdayMatch;
    // Per-tenant pagination cap — `workday_max_pages` in portals.yml lets the
    // user override (each page is 20 jobs). Default 100 pages = 2000 jobs,
    // which covers >99% of real Workday tenants. The pagination loop also
    // short-circuits as soon as `total` is exhausted, so this is a safety
    // ceiling not a fixed cost.
    const maxPages = Number.isFinite(company.workday_max_pages)
      ? Math.max(1, Math.min(500, company.workday_max_pages))
      : 100;
    return {
      type: 'workday',
      url: `https://${tenant}.${pod}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`,
      fetch: {
        method: 'POST',
        body: { appliedFacets: {}, limit: 20, offset: 0, searchText: '' },
        paginate: 'workday',
        maxPages,
      },
      meta: { tenant, pod, site, maxPages },
    };
  }

  // -- SmartRecruiters: careers.smartrecruiters.com/{company} or
  //    jobs.smartrecruiters.com/{company} --
  const srMatch = url.match(/https?:\/\/(?:careers|jobs)\.smartrecruiters\.com\/([^/?#]+)/);
  if (srMatch) {
    return {
      type: 'smartrecruiters',
      url: `https://api.smartrecruiters.com/v1/companies/${srMatch[1]}/postings?limit=100&offset=0`,
      fetch: { paginate: 'smartrecruiters', maxPages: 50 },
      meta: { company_slug: srMatch[1] },
    };
  }

  // -- Workable: apply.workable.com/{slug}/ --
  const wkMatch = url.match(/apply\.workable\.com\/([a-zA-Z0-9_-]+)/);
  if (wkMatch) {
    return {
      type: 'workable',
      url: `https://apply.workable.com/api/v1/widget/accounts/${wkMatch[1]}`,
      meta: { slug: wkMatch[1] },
    };
  }

  // -- Personio: {tenant}.jobs.personio.{com|de|eu} — XML feed --
  const personioMatch = url.match(/https?:\/\/([a-zA-Z0-9_-]+)\.jobs\.personio\.(com|de|eu)/);
  if (personioMatch) {
    const [, tenant, tld] = personioMatch;
    return {
      type: 'personio',
      url: `https://${tenant}.jobs.personio.${tld}/xml`,
      fetch: { headers: { Accept: 'application/xml,text/xml' } },
      meta: { tenant, tld },
    };
  }

  // -- Recruitee: {tenant}.recruitee.com --
  const recMatch = url.match(/https?:\/\/([a-zA-Z0-9_-]+)\.recruitee\.com/);
  if (recMatch) {
    return {
      type: 'recruitee',
      url: `https://${recMatch[1]}.recruitee.com/api/offers/`,
      meta: { tenant: recMatch[1] },
    };
  }

  // -- Teamtailor: {tenant}.teamtailor.com or career.{tenant}.com (hosted) --
  const ttMatch = url.match(/https?:\/\/([a-zA-Z0-9_-]+)\.teamtailor\.com/);
  if (ttMatch) {
    return {
      type: 'teamtailor',
      url: `https://${ttMatch[1]}.teamtailor.com/jobs.json`,
      meta: { tenant: ttMatch[1] },
    };
  }

  return null;
}

// ── API parsers ─────────────────────────────────────────────────────
//
// Every parser receives the raw response (JSON object, JSON array, or string
// for XML providers like Personio) and the company name from portals.yml.
// Returns an array of { title, url, company, location } — the canonical
// shape consumed by the title filter + dedup pipeline.

function parseGreenhouse(json, companyName) {
  const jobs = json.jobs || [];
  return jobs.map((j) => ({
    title: j.title || '',
    url: j.absolute_url || '',
    company: companyName,
    location: j.location?.name || '',
  }));
}

function parseAshby(json, companyName) {
  const jobs = json.jobs || [];
  return jobs.map((j) => ({
    title: j.title || '',
    url: j.jobUrl || '',
    company: companyName,
    location: j.location || '',
  }));
}

function parseLever(json, companyName) {
  if (!Array.isArray(json)) return [];
  return json.map((j) => ({
    title: j.text || '',
    url: j.hostedUrl || '',
    company: companyName,
    location: j.categories?.location || '',
  }));
}

/** Workday: response shape is { jobPostings: [{ title, externalPath, locationsText }], total }
 *  Job URL is constructed from `externalPath` + the tenant/pod/site triple. */
function parseWorkday(json, companyName, meta) {
  const postings = json?.jobPostings || [];
  const { tenant, pod, site } = meta || {};
  return postings
    .filter((p) => p.title && p.externalPath)
    .map((p) => ({
      title: p.title,
      url: `https://${tenant}.${pod}.myworkdayjobs.com/${site}${p.externalPath}`,
      company: companyName,
      location: p.locationsText || '',
    }));
}

/** SmartRecruiters: response shape is { content: [{ id, name, location }], totalFound }
 *  Public job URL: https://jobs.smartrecruiters.com/{company}/{id} (verified 200). */
function parseSmartRecruiters(json, companyName, meta) {
  const postings = json?.content || [];
  const slug = meta?.company_slug || companyName;
  return postings
    .filter((p) => p.name && p.id)
    .map((p) => {
      const loc = p.location || {};
      const locStr = [loc.city, loc.region, loc.country?.toUpperCase()].filter(Boolean).join(', ');
      return {
        title: p.name,
        url: `https://jobs.smartrecruiters.com/${slug}/${p.id}`,
        company: companyName,
        location: locStr,
      };
    });
}

/** Workable: response shape is { name, jobs: [{ title, url, country, city, state }] }
 *  job.url is already a usable apply URL (https://apply.workable.com/j/{shortcode}). */
function parseWorkable(json, companyName) {
  const jobs = Array.isArray(json?.jobs) ? json.jobs : [];
  return jobs
    .filter((j) => j.title && j.url)
    .map((j) => {
      const loc = [j.city, j.state, j.country].filter(Boolean).join(', ');
      return {
        title: j.title,
        url: j.url,
        company: companyName,
        location: j.telecommuting ? `Remote · ${loc || 'anywhere'}` : loc,
      };
    });
}

/** Personio: XML feed with <position><id/><name/><office/><additionalOffices><office/>...</additionalOffices></position>
 *  Job URL: https://{tenant}.jobs.personio.{tld}/job/{id}
 *  Lightweight regex parse — avoids pulling in an XML lib. */
function parsePersonio(xml, companyName, meta) {
  if (typeof xml !== 'string') return [];
  const { tenant, tld } = meta || {};
  const positions = xml.match(/<position\b[\s\S]*?<\/position>/g) || [];
  const out = [];
  for (const pos of positions) {
    const id = pos.match(/<id>(\d+)<\/id>/)?.[1];
    const name = pos.match(/<name>([\s\S]*?)<\/name>/)?.[1]?.trim();
    if (!id || !name) continue;
    // Decode the most common HTML entities Personio emits in <name>
    const title = name
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'");
    // Primary <office> appears OUTSIDE <additionalOffices>. Strip the
    // additionalOffices block first so the primary-office regex doesn't
    // accidentally grab the first nested <office>.
    const additionalBlock =
      pos.match(/<additionalOffices>([\s\S]*?)<\/additionalOffices>/)?.[1] || '';
    const trunk = pos.replace(/<additionalOffices>[\s\S]*?<\/additionalOffices>/, '');
    const primary = trunk.match(/<office>([\s\S]*?)<\/office>/)?.[1]?.trim();
    const additional = [...additionalBlock.matchAll(/<office>([^<]+)<\/office>/g)].map((m) =>
      m[1].trim(),
    );
    const offices = [primary, ...additional].filter(Boolean);
    const location = [...new Set(offices)].join(' · ');
    out.push({
      title,
      url: `https://${tenant}.jobs.personio.${tld}/job/${id}`,
      company: companyName,
      location,
    });
  }
  return out;
}

/** Recruitee: response shape is { offers: [{ title, careers_url, country, city }] }
 *  careers_url is a usable apply URL. */
function parseRecruitee(json, companyName) {
  const offers = Array.isArray(json?.offers) ? json.offers : [];
  return offers
    .filter((o) => o.title && o.careers_url)
    .map((o) => {
      const loc = [o.city, o.country].filter(Boolean).join(', ');
      return {
        title: o.title,
        url: o.careers_url,
        company: companyName,
        location: o.remote ? `Remote · ${loc || 'anywhere'}` : loc,
      };
    });
}

/** Teamtailor: response shape varies by version. Modern: { data: [{ attributes: { title, ... }, links: { 'careersite-job-url' }}] }
 *  Older direct boards: array of { title, hostedUrl, location } at root.
 *  We try both shapes. */
function parseTeamtailor(json, companyName, meta) {
  const slug = meta?.tenant;
  let raw = [];
  if (Array.isArray(json)) raw = json;
  else if (Array.isArray(json?.data)) raw = json.data;
  else if (Array.isArray(json?.jobs)) raw = json.jobs;

  return raw
    .map((j) => {
      // Modern JSON:API shape
      if (j.attributes) {
        return {
          title: j.attributes.title || '',
          url:
            j.links?.['careersite-job-url'] ||
            (slug && j.id ? `https://${slug}.teamtailor.com/jobs/${j.id}` : ''),
          company: companyName,
          location: j.attributes.location || '',
        };
      }
      // Older flat shape
      return {
        title: j.title || j.text || '',
        url: j.hostedUrl || j.ad_url || j.careers_url || '',
        company: companyName,
        location: typeof j.location === 'string' ? j.location : j.region || '',
      };
    })
    .filter((o) => o.title && o.url);
}

const PARSERS = {
  greenhouse: parseGreenhouse,
  ashby: parseAshby,
  lever: parseLever,
  workday: parseWorkday,
  smartrecruiters: parseSmartRecruiters,
  workable: parseWorkable,
  personio: parsePersonio,
  recruitee: parseRecruitee,
  teamtailor: parseTeamtailor,
};

// ── Fetch with timeout ──────────────────────────────────────────────
//
// fetchOne handles GET-or-POST + JSON-or-text response shapes uniformly so
// each ATS parser doesn't have to re-derive its own request logic. The
// `apiSpec` shape is what `detectApi()` returns: { type, url, fetch?, meta? }.
//   - fetch.method   default 'GET'
//   - fetch.body     auto-JSON-stringified when method !== 'GET'
//   - fetch.headers  merged onto sane defaults
// Returns { json } for application/json responses, { text } for XML/anything
// else. The parser decides which it expects.

async function fetchOne(apiSpec) {
  const { url, fetch: spec = {}, type } = apiSpec;
  const method = spec.method || 'GET';
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'career-ops-scanner/1.0 (+https://github.com/santifer/career-ops)',
    ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
    ...(spec.headers || {}),
  };

  // Helper: one HTTP round-trip with timeout + body-shape negotiation.
  // Wrapped in withRetry so transient network errors / 5xx don't drop a
  // whole company's worth of jobs from the run. 4xx (auth, not-found,
  // bad-request) bypass retry — they won't fix themselves.
  async function once(reqUrl, reqInit) {
    return withRetry(reqUrl, async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(reqUrl, { ...reqInit, signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (type === 'personio') return { text: await res.text() };
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('json')) return { json: await res.json() };
        const txt = await res.text();
        try {
          return { json: JSON.parse(txt) };
        } catch {
          return { text: txt };
        }
      } finally {
        clearTimeout(timer);
      }
    });
  }

  // SmartRecruiters pagination: GET-style offset/limit (default limit=100,
  // server returns `totalFound`). Loop until totalFound is reached or
  // maxPages is hit. Combined `content` array goes back to the parser.
  if (spec.paginate === 'smartrecruiters') {
    const pageSize = 100;
    const maxPages = spec.maxPages ?? 50;
    let combined = null;
    let totalFromFirst = Infinity;
    for (let page = 0; page < maxPages; page++) {
      const offset = page * pageSize;
      // Replace the offset query param on each iteration; URL already has
      // limit=100&offset=0 from detectApi().
      const pagedUrl = url.replace(/(\bo)ffset=\d+/, `$1ffset=${offset}`);
      const r = await once(pagedUrl, { method, headers });
      const json = r.json;
      if (!json) break;
      if (!combined) {
        combined = { ...json, content: [] };
        if (Number.isFinite(json.totalFound) && json.totalFound > 0)
          totalFromFirst = json.totalFound;
      }
      const pageContent = json.content || [];
      combined.content.push(...pageContent);
      if (combined.content.length >= totalFromFirst) break;
      if (pageContent.length < pageSize) break;
    }
    return { json: combined };
  }

  // Workday pagination: server caps `limit` at 20. We loop until `total` is
  // satisfied OR maxPages is reached. Each page response is { total, jobPostings }
  // and we accumulate jobPostings into a single combined response so the
  // parser sees one logical payload.
  if (spec.paginate === 'workday') {
    const pageSize = spec.body?.limit ?? 20;
    const maxPages = spec.maxPages ?? 5;
    // Workday quirk: only the first page returns the correct `total`; later
    // pages return `total: 0`. Capture the cap on the first page and ignore
    // it thereafter — paginate until either the cap or maxPages, OR a
    // server-shortened page (signalling no more results) ends the loop.
    let combined = null;
    let totalFromFirst = Infinity;
    for (let page = 0; page < maxPages; page++) {
      const body = JSON.stringify({ ...spec.body, offset: page * pageSize });
      const r = await once(url, { method, headers, body });
      const json = r.json;
      if (!json) break;
      if (!combined) {
        combined = { ...json, jobPostings: [] };
        if (Number.isFinite(json.total) && json.total > 0) totalFromFirst = json.total;
      }
      const pagePostings = json.jobPostings || [];
      combined.jobPostings.push(...pagePostings);
      if (combined.jobPostings.length >= totalFromFirst) break;
      if (pagePostings.length < pageSize) break; // server returned a short page
    }
    return { json: combined };
  }

  // Default single-shot path
  const init = { method, headers };
  if (method !== 'GET' && spec.body !== undefined) {
    init.body = typeof spec.body === 'string' ? spec.body : JSON.stringify(spec.body);
  }
  return once(url, init);
}

/** Back-compat shim: old call sites used fetchJson(url) for plain GET-JSON. */
async function fetchJson(url) {
  const r = await fetchOne({ url });
  return r.json ?? null;
}

// ── Title filter ────────────────────────────────────────────────────

function buildTitleFilter(titleFilter) {
  const positive = (titleFilter?.positive || []).map((k) => k.toLowerCase());
  const negative = (titleFilter?.negative || []).map((k) => k.toLowerCase());

  return (title) => {
    const lower = title.toLowerCase();
    const hasPositive = positive.length === 0 || positive.some((k) => lower.includes(k));
    const hasNegative = negative.some((k) => lower.includes(k));
    return hasPositive && !hasNegative;
  };
}

// ── Dedup ───────────────────────────────────────────────────────────

function loadSeenUrls() {
  const seen = new Set();

  // scan-history.tsv
  if (existsSync(SCAN_HISTORY_PATH)) {
    const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n');
    for (const line of lines.slice(1)) {
      // skip header
      const url = line.split('\t')[0];
      if (url) seen.add(url);
    }
  }

  // pipeline.md — extract URLs from checkbox lines
  if (existsSync(PIPELINE_PATH)) {
    const text = readFileSync(PIPELINE_PATH, 'utf-8');
    for (const match of text.matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) {
      seen.add(match[1]);
    }
  }

  // applications.md — extract URLs from report links and any inline URLs
  if (existsSync(APPLICATIONS_PATH)) {
    const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
    for (const match of text.matchAll(/https?:\/\/[^\s|)]+/g)) {
      seen.add(match[0]);
    }
  }

  return seen;
}

function loadSeenCompanyRoles() {
  const seen = new Set();
  if (existsSync(APPLICATIONS_PATH)) {
    const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
    // Parse markdown table rows: | # | Date | Company | Role | ...
    for (const match of text.matchAll(/\|[^|]+\|[^|]+\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/g)) {
      const company = match[1].trim().toLowerCase();
      const role = match[2].trim().toLowerCase();
      if (company && role && company !== 'company') {
        seen.add(`${company}::${role}`);
      }
    }
  }
  return seen;
}

// ── Pipeline writer ─────────────────────────────────────────────────

function appendToPipeline(offers) {
  if (offers.length === 0) return;

  let text = readFileSync(PIPELINE_PATH, 'utf-8');

  // Find "## Pendientes" section and append after it
  const marker = '## Pendientes';
  const idx = text.indexOf(marker);
  if (idx === -1) {
    // No Pendientes section — append at end before Procesadas
    const procIdx = text.indexOf('## Procesadas');
    const insertAt = procIdx === -1 ? text.length : procIdx;
    const block =
      `\n${marker}\n\n` +
      offers.map((o) => `- [ ] ${o.url} | ${o.company} | ${o.title}`).join('\n') +
      '\n\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  } else {
    // Find the end of existing Pendientes content (next ## or end)
    const afterMarker = idx + marker.length;
    const nextSection = text.indexOf('\n## ', afterMarker);
    const insertAt = nextSection === -1 ? text.length : nextSection;

    const block =
      '\n' + offers.map((o) => `- [ ] ${o.url} | ${o.company} | ${o.title}`).join('\n') + '\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  }

  writeFileSync(PIPELINE_PATH, text, 'utf-8');
}

function appendToScanHistory(offers, date) {
  // Ensure file + header exist
  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(SCAN_HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n', 'utf-8');
  }

  const lines =
    offers
      .map((o) => `${o.url}\t${date}\t${o.source}\t${o.title}\t${o.company}\tadded`)
      .join('\n') + '\n';

  appendFileSync(SCAN_HISTORY_PATH, lines, 'utf-8');
}

// ── Parallel fetch with concurrency limit ───────────────────────────

async function parallelFetch(tasks, limit) {
  const results = [];
  let i = 0;

  async function next() {
    while (i < tasks.length) {
      const task = tasks[i++];
      results.push(await task());
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => next());
  await Promise.all(workers);
  return results;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const companyFlag = args.indexOf('--company');
  const filterCompany = companyFlag !== -1 ? args[companyFlag + 1]?.toLowerCase() : null;
  const sourceFlag = args.indexOf('--source');
  const filterSource = sourceFlag !== -1 ? args[sourceFlag + 1]?.toLowerCase() : null;
  const probeFlag = args.indexOf('--probe');
  const probeArgRaw = probeFlag !== -1 ? args[probeFlag + 1] : null;
  // Distinguish `--probe https://...` (URL probe) from bare `--probe` /
  // `--probe --dry-run` (connectivity probe). The bare form is used by the
  // /sources Test button (B12) to confirm the scanner can hit a stable
  // provider without writing pipeline rows.
  const probeUrl = probeArgRaw && !probeArgRaw.startsWith('--') ? probeArgRaw : null;
  const probeOnly = probeFlag !== -1 && !probeUrl;

  // --probe (no URL): connectivity sanity check. Hits a stable Greenhouse
  // public listing and confirms it returns valid JSON. Exits 0 if so.
  if (probeOnly) {
    const PROBE_URL = 'https://boards-api.greenhouse.io/v1/boards/vercel/jobs';
    try {
      const r = await fetch(PROBE_URL, { headers: { 'User-Agent': 'career-ops-probe/1.0' } });
      if (!r.ok) {
        console.error('✗ probe HTTP ' + r.status);
        process.exit(3);
      }
      const json = await r.json();
      const count = Array.isArray(json?.jobs) ? json.jobs.length : 0;
      console.log('probe OK · Greenhouse · ' + count + ' jobs visible');
      process.exit(0);
    } catch (err) {
      console.error('✗ probe failed: ' + (err?.message || String(err)));
      process.exit(3);
    }
  }

  // --probe URL: ad-hoc detection + sample fetch for a single careers URL.
  // Useful when adding a company to portals.yml — confirms the URL maps to
  // a known ATS before you commit to it.
  if (probeUrl) {
    const fakeCompany = { careers_url: probeUrl, name: '(probe)' };
    const api = detectApi(fakeCompany);
    if (!api) {
      console.error(`✗ No ATS detected for ${probeUrl}`);
      console.error(
        '  Supported: Greenhouse, Ashby, Lever, Workday, SmartRecruiters, Workable, Personio, Recruitee, Teamtailor',
      );
      process.exit(2);
    }
    console.log(`Detected ATS: ${api.type}`);
    console.log(`Endpoint: ${api.url}`);
    if (api.meta) console.log(`Meta: ${JSON.stringify(api.meta)}`);
    try {
      const r = await fetchOne(api);
      const payload = r.json ?? r.text ?? null;
      const jobs = PARSERS[api.type](payload, '(probe)', api.meta);
      console.log(`Sample: ${jobs.length} job(s) in response`);
      for (const j of jobs.slice(0, 5)) {
        console.log(`  - ${j.title} · ${j.location || 'no location'}\n    ${j.url}`);
      }
      if (jobs.length > 5) console.log(`  ... and ${jobs.length - 5} more`);
    } catch (err) {
      console.error(`✗ Fetch failed: ${err.message}`);
      process.exit(3);
    }
    return;
  }

  // 1. Read portals.yml
  if (!existsSync(PORTALS_PATH)) {
    console.error('Error: portals.yml not found. Run onboarding first.');
    process.exit(1);
  }

  const config = parseYaml(readFileSync(PORTALS_PATH, 'utf-8'));
  const companies = config.tracked_companies || [];
  const titleFilter = buildTitleFilter(config.title_filter);

  // Per-source toggles — `sources` block in portals.yml lets the user
  // disable a whole ATS without removing each company manually:
  //
  //   sources:
  //     workday:    false       # skip every Workday tenant
  //     teamtailor: false
  //
  // Anything not listed defaults to enabled. The CLI --source flag still
  // works as before for one-off runs.
  const sourceToggles = config.sources && typeof config.sources === 'object' ? config.sources : {};
  const isSourceEnabled = (type) => sourceToggles[type] !== false;

  // 2. Filter to enabled companies with detectable APIs (+ optional --source filter
  //    and per-source portals.yml toggles)
  const targets = companies
    .filter((c) => c.enabled !== false)
    .filter((c) => !filterCompany || c.name.toLowerCase().includes(filterCompany))
    .map((c) => ({ ...c, _api: detectApi(c) }))
    .filter((c) => c._api !== null)
    .filter((c) => !filterSource || c._api.type === filterSource)
    .filter((c) => isSourceEnabled(c._api.type));

  const skippedCount = companies.filter((c) => c.enabled !== false).length - targets.length;
  const sourcesSkipped = Object.entries(sourceToggles)
    .filter(([, v]) => v === false)
    .map(([k]) => k);

  console.log(
    `Scanning ${targets.length} companies via API (${skippedCount} skipped — no API detected${sourcesSkipped.length ? ` or source disabled: ${sourcesSkipped.join(', ')}` : ''})`,
  );
  if (dryRun) console.log('(dry run — no files will be written)\n');

  // 3. Load dedup sets
  const seenUrls = loadSeenUrls();
  const seenCompanyRoles = loadSeenCompanyRoles();

  // 4. Fetch all APIs
  const date = new Date().toISOString().slice(0, 10);
  let totalFound = 0;
  let totalFiltered = 0;
  let totalDupes = 0;
  const newOffers = [];
  const errors = [];

  const tasks = targets.map((company) => async () => {
    const apiSpec = company._api;
    const { type, meta } = apiSpec;
    try {
      const r = await fetchOne(apiSpec);
      // XML-flavoured providers (Personio) get the raw text; JSON providers
      // get the parsed object. Parsers know which kind they want.
      const payload = r.json ?? r.text ?? null;
      const jobs = PARSERS[type](payload, company.name, meta);
      totalFound += jobs.length;

      for (const job of jobs) {
        if (!titleFilter(job.title)) {
          totalFiltered++;
          continue;
        }
        if (seenUrls.has(job.url)) {
          totalDupes++;
          continue;
        }
        const key = `${job.company.toLowerCase()}::${job.title.toLowerCase()}`;
        if (seenCompanyRoles.has(key)) {
          totalDupes++;
          continue;
        }
        // Mark as seen to avoid intra-scan dupes
        seenUrls.add(job.url);
        seenCompanyRoles.add(key);
        newOffers.push({ ...job, source: `${type}-api` });
      }
    } catch (err) {
      errors.push({ company: company.name, error: err.message });
    }
  });

  await parallelFetch(tasks, CONCURRENCY);

  // 5. Write results
  if (!dryRun && newOffers.length > 0) {
    appendToPipeline(newOffers);
    appendToScanHistory(newOffers, date);
  }

  // 6. Print summary
  console.log(`\n${'━'.repeat(45)}`);
  console.log(`Portal Scan — ${date}`);
  console.log(`${'━'.repeat(45)}`);
  console.log(`Companies scanned:     ${targets.length}`);
  console.log(`Total jobs found:      ${totalFound}`);
  console.log(`Filtered by title:     ${totalFiltered} removed`);
  console.log(`Duplicates:            ${totalDupes} skipped`);
  console.log(`New offers added:      ${newOffers.length}`);

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) {
      console.log(`  ✗ ${e.company}: ${e.error}`);
    }
  }

  if (newOffers.length > 0) {
    console.log('\nNew offers:');
    for (const o of newOffers) {
      console.log(`  + ${o.company} | ${o.title} | ${o.location || 'N/A'}`);
    }
    if (dryRun) {
      console.log('\n(dry run — run without --dry-run to save results)');
    } else {
      console.log(`\nResults saved to ${PIPELINE_PATH} and ${SCAN_HISTORY_PATH}`);
    }
  }

  console.log(`\n→ Run /career-ops pipeline to evaluate new offers.`);
  console.log('→ Share results and get help: https://discord.gg/8pRpHETxa4');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
