#!/usr/bin/env node

/**
 * scan-curated.mjs — Niche / curated job-board scrapers
 *
 * scan.mjs covers ATS providers (Greenhouse / Ashby / Lever / Workday /
 * SmartRecruiters / Workable / Personio / Recruitee / Teamtailor).
 * scan-broad.py covers JobSpy + free aggregators (LinkedIn, Indeed, etc).
 * This file fills the gap: curated boards that don't expose a public JSON
 * API and don't fit JobSpy's targets, so each one needs a small bespoke
 * HTML extractor.
 *
 * Currently shipping:
 *   • AI Jobs (aijobs.net)        — HTML scrape, 50 listings/page, paginated
 *
 * Skipped + reasoning (see Sources Assessment in docs/):
 *   • Wellfound (AngelList)       — captcha-delivery wall on every page;
 *                                    needs Playwright + manual captcha solve.
 *   • Honeypot                    — host unreachable from this network at
 *                                    write time; revisit when it's responding.
 *   • Welcome to the Jungle       — Algolia-backed search, requires sniffing
 *                                    rotating public app-id + read-only key
 *                                    from page source. Brittle. Use the
 *                                    AddJobDialog paste flow for individual
 *                                    listings instead.
 *
 * Output: same shape as scan.mjs — appends to data/pipeline.md and records
 * URLs in data/scan-history.tsv with `source: aijobs-net` etc.
 *
 * Usage:
 *   node scan-curated.mjs                  # all enabled curated sources
 *   node scan-curated.mjs --source aijobs  # one source only
 *   node scan-curated.mjs --dry-run        # no writes
 *   node scan-curated.mjs --pages 3        # max pages per source (default 2)
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import yaml from 'js-yaml';
import { profilePath, ensureProfileDirs, profileFromArgv } from './lib-profiles.mjs';
const parseYaml = yaml.load;

const PROFILE_ID = profileFromArgv();
ensureProfileDirs(PROFILE_ID);

const PORTALS_PATH = profilePath(PROFILE_ID, 'portals-yml');
const SCAN_HISTORY_PATH = profilePath(PROFILE_ID, 'scan-history');
const PIPELINE_PATH = profilePath(PROFILE_ID, 'pipeline');
const APPLICATIONS_PATH = profilePath(PROFILE_ID, 'applications');

const FETCH_TIMEOUT_MS = 12_000;
// 50 pages × 50 jobs = 2500 jobs ceiling. Loop short-circuits as soon as
// a page returns 0 listings, so this is a safety cap not a fixed cost.
// Override via `--pages N` for one-off bigger pulls.
const DEFAULT_MAX_PAGES = 50;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

/** Retry on transient network/5xx; hard-fail on 4xx. Same semantics as
 *  scan.mjs's withRetry — kept duplicated here to avoid a shared-utility
 *  module that has to be installed via a build step. */
async function withRetry(label, fn) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err?.message || '';
      if (/HTTP 4\d\d/.test(msg)) throw err;
      if (attempt === MAX_RETRIES) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
    }
  }
  throw lastErr;
}

// ── HTTP helper ─────────────────────────────────────────────────────

async function fetchText(url, opts = {}) {
  return withRetry(url, async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (career-ops-scanner; +https://github.com/kaelys-js/career-ops)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9',
          ...(opts.headers || {}),
        },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  });
}

// ── Source: aijobs.net ──────────────────────────────────────────────
//
// Structure observed (verified against live site):
//   <a class="font-monospace fw-bold stretched-link" href="/job/{slug}-{id}/">
//     {title}
//   </a>
// Pagination is /?page=2 etc. Each page returns ~50 listings.
// Job slug already includes a trailing numeric id so dedup is naturally
// stable across pages.

async function scanAiJobs({ pages = DEFAULT_MAX_PAGES } = {}) {
  const out = [];
  // aijobs.net's slug pattern is `{role}-id{employerJobId}-{location}-{listingId}/`.
  // The same role gets re-listed once per supported location, so we'd see the
  // exact same title 5–10× otherwise. Dedup intra-source by `id{N}` (the
  // employer-side job template id) plus normalised title — different titles
  // sharing an employer id are still treated as distinct.
  const seen = new Set();

  for (let page = 1; page <= pages; page++) {
    const url = page === 1 ? 'https://aijobs.net/' : `https://aijobs.net/?page=${page}`;
    let html;
    try {
      html = await fetchText(url);
    } catch (e) {
      console.error(`  aijobs page ${page}: ${e.message}`);
      break;
    }
    const anchorRe =
      /<a\s+class="[^"]*stretched-link[^"]*"\s+href="(\/job\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    let onPage = 0;
    while ((m = anchorRe.exec(html)) !== null) {
      const href = m[1];
      const inner = m[2]
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^(Featured|New)\s+/i, '')
        .trim();
      if (!inner) continue;
      // Employer's job-template id (`id63542`) collapses the
      // multi-location dupes onto one canonical entry.
      const employerIdMatch = href.match(/-id(\d+)-/i);
      const employerId = employerIdMatch?.[1];
      const dedupeKey =
        (employerId ? 'eid:' + employerId + ':' : 'href:' + href + ':') + inner.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      out.push({
        title: inner,
        url: 'https://aijobs.net' + href,
        company: extractCompanyFromAijobsSlug(href) || 'aijobs.net',
        location: extractLocationFromAijobsSlug(href) || '',
      });
      onPage++;
    }
    if (onPage === 0) break;
    await new Promise((r) => setTimeout(r, 800)); // be polite
  }
  return out;
}

/** aijobs.net slugs are `{role}-{company-name}-{location}-{id}/`. The
 *  id at the end is a 5-6 digit number. We can't reliably split on '-'
 *  alone (companies/locations contain dashes), but the raw HTML text
 *  is consistent enough to be useful. Returns '' when nothing extracted. */
function extractCompanyFromAijobsSlug(href) {
  // Best-effort: companies are listed in a `<span class="company">` inside
  // the same row. Without a full DOM parse this is hard, so we leave
  // company as `aijobs.net` and let the user re-attribute downstream.
  return '';
}
function extractLocationFromAijobsSlug(href) {
  // The slug often ends with `remote` or a city; without a DOM we can
  // sniff `-remote-` as a strong signal.
  if (/-remote(-|\/)/i.test(href)) return 'Remote';
  return '';
}

const SOURCES = {
  aijobs: { name: 'AI Jobs', run: scanAiJobs },
};

// ── Title filter (mirror scan.mjs) ──────────────────────────────────

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

// ── Dedup (mirror scan.mjs) ─────────────────────────────────────────

function loadSeenUrls() {
  const seen = new Set();
  if (existsSync(SCAN_HISTORY_PATH)) {
    const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n');
    for (const line of lines.slice(1)) {
      const url = line.split('\t')[0];
      if (url) seen.add(url);
    }
  }
  if (existsSync(PIPELINE_PATH)) {
    const text = readFileSync(PIPELINE_PATH, 'utf-8');
    for (const match of text.matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) {
      seen.add(match[1]);
    }
  }
  if (existsSync(APPLICATIONS_PATH)) {
    const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
    for (const match of text.matchAll(/https?:\/\/[^\s|)]+/g)) {
      seen.add(match[0]);
    }
  }
  return seen;
}

// ── Pipeline writer (mirror scan.mjs) ───────────────────────────────

function appendToPipeline(offers) {
  if (offers.length === 0) return;
  let text = existsSync(PIPELINE_PATH) ? readFileSync(PIPELINE_PATH, 'utf-8') : '';
  const marker = '## Pendientes';
  const idx = text.indexOf(marker);
  if (idx === -1) {
    const procIdx = text.indexOf('## Procesadas');
    const insertAt = procIdx === -1 ? text.length : procIdx;
    const block =
      `\n${marker}\n\n` +
      offers.map((o) => `- [ ] ${o.url} | ${o.company} | ${o.title}`).join('\n') +
      '\n\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  } else {
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
  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(SCAN_HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n', 'utf-8');
  }
  const lines =
    offers
      .map((o) => `${o.url}\t${date}\t${o.source}\t${o.title}\t${o.company}\tadded`)
      .join('\n') + '\n';
  appendFileSync(SCAN_HISTORY_PATH, lines, 'utf-8');
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const probeOnly = args.includes('--probe');
  const sourceFlag = args.indexOf('--source');
  const filterSource = sourceFlag !== -1 ? args[sourceFlag + 1]?.toLowerCase() : null;
  const pagesFlag = args.indexOf('--pages');
  const pages =
    pagesFlag !== -1
      ? Math.max(1, Math.min(20, parseInt(args[pagesFlag + 1], 10) || DEFAULT_MAX_PAGES))
      : DEFAULT_MAX_PAGES;

  // /sources Test button (B12) — connectivity probe. Hit aijobs.net's
  // search page and confirm a 200 response. Exits 0/non-zero.
  if (probeOnly) {
    try {
      const r = await fetch('https://aijobs.net/?page=1', {
        headers: { 'User-Agent': 'career-ops-probe/1.0' },
      });
      if (!r.ok) {
        console.error('probe failed: HTTP ' + r.status);
        process.exit(3);
      }
      console.log('probe OK · aijobs.net reachable');
      process.exit(0);
    } catch (err) {
      console.error('probe failed: ' + (err?.message || String(err)));
      process.exit(3);
    }
  }

  // Optional title filter from portals.yml — same as scan.mjs.
  let titleFilter = (_t) => true;
  if (existsSync(PORTALS_PATH)) {
    try {
      const config = parseYaml(readFileSync(PORTALS_PATH, 'utf-8'));
      titleFilter = buildTitleFilter(config.title_filter);
    } catch {
      /* missing/malformed — fall through with no-op filter */
    }
  }

  const seenUrls = loadSeenUrls();
  const date = new Date().toISOString().slice(0, 10);
  const newOffers = [];
  let totalFound = 0;
  let totalFiltered = 0;
  let totalDupes = 0;
  const errors = [];

  const sources = Object.entries(SOURCES).filter(([id]) => !filterSource || id === filterSource);

  for (const [id, def] of sources) {
    console.log(`Scanning ${def.name} (${id})…`);
    try {
      const jobs = await def.run({ pages });
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
        seenUrls.add(job.url);
        newOffers.push({ ...job, source: id });
      }
    } catch (err) {
      errors.push({ source: id, error: err.message });
    }
  }

  if (!dryRun && newOffers.length > 0) {
    appendToPipeline(newOffers);
    appendToScanHistory(newOffers, date);
  }

  console.log(`\n${'━'.repeat(45)}`);
  console.log(`Curated Scan — ${date}`);
  console.log(`${'━'.repeat(45)}`);
  console.log(`Sources scanned:   ${sources.length}`);
  console.log(`Jobs found:        ${totalFound}`);
  console.log(`Filtered by title: ${totalFiltered}`);
  console.log(`Duplicates:        ${totalDupes}`);
  console.log(`New offers:        ${newOffers.length}`);

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) console.log(`  ✗ ${e.source}: ${e.error}`);
  }

  if (newOffers.length > 0 && !dryRun) {
    console.log(`\nResults saved to ${PIPELINE_PATH} and ${SCAN_HISTORY_PATH}`);
  } else if (dryRun) {
    console.log(`\n(dry run — no files written)`);
    for (const o of newOffers.slice(0, 10)) {
      console.log(`  + ${o.title} · ${o.location || 'no location'}`);
    }
    if (newOffers.length > 10) console.log(`  ... and ${newOffers.length - 10} more`);
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
