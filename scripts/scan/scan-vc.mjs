#!/usr/bin/env node

/**
 * scan-vc.mjs — VC / accelerator portfolio discovery
 *
 * Output is fundamentally different from scan.mjs / scan-curated.mjs:
 *
 *   - scan.mjs        → finds new JOBS at companies you've already added
 *   - scan-curated.mjs → finds new JOBS on niche boards
 *   - scan-vc.mjs     → finds new COMPANIES from VC portfolios that you
 *                        might want to add to portals.yml
 *
 * Why: large VC portfolios (a16z, Sequoia, Index, Underdog) act as
 * "curated short-lists of companies worth applying to." A founder-engineer
 * searching for a Series A startup won't have all of a16z's 800+ portfolio
 * companies in portals.yml manually. This scanner reads the portfolio
 * pages directly and writes a *candidates* TSV the user can review.
 *
 * Output: data/vc-candidates-{date}.tsv with columns:
 *   source, company, website, careers_url_guess, status
 *
 * The user reviews the TSV, picks companies they want to track, and
 * appends them (manually) to portals.yml. We don't auto-merge to avoid
 * polluting portals.yml with companies the user doesn't actually want.
 *
 * Sources:
 *   • a16z       — embedded JSON in /portfolio/ HTML; 800+ companies
 *   • Sequoia    — HTML table in /our-companies/; ~52 server-rendered
 *                  companies (the rest are FacetWP-lazy-loaded behind
 *                  an authenticated payload we can't easily replay).
 *
 * Skipped (with reasons):
 *   • Underdog.io   — Webflow-rendered, list isn't in the initial HTML
 *                     and their own job-list endpoint requires login
 *                     (Magic Link). Not worth the effort given user already
 *                     covers HN Who's Hiring + RemoteOK + JobSpy.
 *   • Index Ventures — Page is fully JS-rendered with no JSON visible in
 *                     the source. Would need Playwright. Skipped for MVP.
 *
 * Usage:
 *   node scan-vc.mjs                 # all sources
 *   node scan-vc.mjs --source a16z   # one source only
 *   node scan-vc.mjs --dry-run       # print to stdout, no TSV
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'node:path';
import {
  profilePath,
  ensureProfileDirs,
  profileFromArgv,
  userFromArgv,
} from '../lib/lib-profiles.mjs';

const FETCH_TIMEOUT_MS = 15_000;
const USER_ID = userFromArgv();
const PROFILE_ID = profileFromArgv();
ensureProfileDirs(PROFILE_ID, USER_ID);
const PROFILE_DIR = profilePath(PROFILE_ID, 'profile-dir', USER_ID);
const VC_DIR = PROFILE_DIR; // VC candidates land in the active profile's dir
const PORTALS_PATH = profilePath(PROFILE_ID, 'portals-yml', USER_ID);

async function fetchText(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (heron-scanner; +https://github.com/kaelys-js/heron)',
        ...(opts.headers || {}),
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ── Source: a16z ────────────────────────────────────────────────────
//
// /portfolio/ ships the full company list as a JSON array embedded in the
// page source (Vue/wr25 hydration data). We walk braces to extract it.

async function discoverA16z() {
  const html = await fetchText('https://a16z.com/portfolio/');
  // Find the start of the companies array. The JSON is anchored by either
  // `companies:` or `portfolio:` followed by `[`. We then walk brackets
  // to find the matching `]`.
  const m = html.match(/(?:companies|portfolio)\s*[:=]\s*\[/);
  if (!m) throw new Error('a16z portfolio: companies array not found in page source');

  const arrStart = m.index + m[0].length - 1; // points at the `[`
  let depth = 0;
  let arrEnd = arrStart;
  for (let i = arrStart; i < html.length; i++) {
    if (html[i] === '[') depth++;
    if (html[i] === ']') {
      depth--;
      if (depth === 0) {
        arrEnd = i;
        break;
      }
    }
  }
  if (depth !== 0) throw new Error('a16z portfolio: unbalanced brackets in companies array');

  const arr = JSON.parse(html.slice(arrStart, arrEnd + 1));
  const out = [];
  for (const c of arr) {
    const company = (c.title || '').trim();
    if (!company) continue;
    const website = (c.web || '').trim();
    out.push({
      source: 'a16z',
      company,
      website,
      // Common conventions for hosted careers pages — we flag a guess so
      // the user can verify quickly. Sometimes wrong; that's fine.
      careers_url_guess: website ? website.replace(/\/$/, '') + '/careers' : '',
      stage: Array.isArray(c.stages) ? c.stages.join(',') : '',
    });
  }
  return out;
}

// ── Source: Sequoia ─────────────────────────────────────────────────
//
// /our-companies/ has a server-rendered <table id="company_listing">
// with one <tr> per company. The company name lives in a <th> inside
// the row. The website isn't embedded in the row — we only get name +
// description + stage + partners.

async function discoverSequoia() {
  const html = await fetchText('https://www.sequoiacap.com/our-companies/');
  const rowRe =
    /<tr aria-expanded="false"[\s\S]*?<th scope="row"[^>]*class="company-listing__cell-wide company-listing__head">([^<]+)<\/th>\s*<td[^>]*class="company-listing__cell-wide company-listing__text[^"]*"[^>]*>([^<]*)<\/td>/g;
  const out = [];
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const company = m[1].trim();
    const description = m[2].trim();
    if (!company) continue;
    out.push({
      source: 'sequoia',
      company,
      website: '', // not in the row HTML; user adds it after lookup
      careers_url_guess: '',
      description,
    });
  }
  return out;
}

const SOURCES = {
  a16z: { name: 'a16z portfolio', run: discoverA16z },
  sequoia: { name: 'Sequoia portfolio', run: discoverSequoia },
};

function loadAlreadyTracked() {
  // Don't suggest companies the user already has in portals.yml.
  if (!existsSync(PORTALS_PATH)) return new Set();
  const text = readFileSync(PORTALS_PATH, 'utf-8');
  const names = new Set();
  for (const m of text.matchAll(/^\s*-\s*name:\s*(.+)$/gm)) {
    names.add(m[1].trim().toLowerCase().replace(/\s+/g, ''));
  }
  return names;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const sourceFlag = args.indexOf('--source');
  const filterSource = sourceFlag !== -1 ? args[sourceFlag + 1]?.toLowerCase() : null;

  const tracked = loadAlreadyTracked();
  const date = new Date().toISOString().slice(0, 10);
  const outPath = `${VC_DIR}/vc-candidates-${date}.tsv`;
  const allRows = [];
  const errors = [];

  const sources = Object.entries(SOURCES).filter(([id]) => !filterSource || id === filterSource);
  for (const [id, def] of sources) {
    console.log(`Pulling ${def.name} (${id})…`);
    try {
      const rows = await def.run();
      const fresh = rows.filter((r) => !tracked.has(r.company.toLowerCase().replace(/\s+/g, '')));
      console.log(`  → ${rows.length} companies; ${fresh.length} new (vs portals.yml)`);
      allRows.push(...fresh);
    } catch (err) {
      errors.push({ source: id, error: err.message });
      console.error(`  ✗ ${id}: ${err.message}`);
    }
  }

  // Dedup across sources by lower-cased company name.
  const seenNames = new Set();
  const deduped = [];
  for (const r of allRows) {
    const k = r.company.toLowerCase().replace(/\s+/g, '');
    if (seenNames.has(k)) continue;
    seenNames.add(k);
    deduped.push(r);
  }

  console.log(`\n${'━'.repeat(45)}`);
  console.log(`VC Discovery — ${date}`);
  console.log(`${'━'.repeat(45)}`);
  console.log(`Sources scanned:    ${sources.length - errors.length} of ${sources.length}`);
  console.log(`New candidates:     ${deduped.length}`);

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) console.log(`  ✗ ${e.source}: ${e.error}`);
  }

  if (deduped.length === 0) {
    console.log(
      '\n(No new candidates — portals.yml already covers your visible portfolio companies.)',
    );
    return;
  }

  if (dryRun) {
    console.log(`\nFirst 20 candidates (dry-run, no TSV written):`);
    for (const r of deduped.slice(0, 20)) {
      console.log(`  + [${r.source}] ${r.company}${r.website ? ' · ' + r.website : ''}`);
    }
    if (deduped.length > 20) console.log(`  … and ${deduped.length - 20} more`);
    return;
  }

  const header = 'source\tcompany\twebsite\tcareers_url_guess\tstage_or_description\tstatus\n';
  const body =
    deduped
      .map((r) =>
        [
          r.source,
          r.company,
          r.website || '',
          r.careers_url_guess || '',
          r.stage || r.description || '',
          'pending-review',
        ].join('\t'),
      )
      .join('\n') + '\n';
  writeFileSync(outPath, header + body, 'utf-8');
  console.log(`\nWrote ${outPath}`);
  console.log(
    `Review the TSV; companies you want to track go into portals.yml as new tracked_companies entries.`,
  );
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
