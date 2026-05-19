#!/usr/bin/env node

/**
 * scan-email.mjs — Email-based job-alert ingestion
 *
 * Why this exists: LinkedIn / Indeed Job Alerts surface jobs that JobSpy
 * can't always reach (especially LinkedIn's "Easy Apply" private listings).
 * Each email has the URLs we want; we just need to read them.
 *
 * Implementation: parses Gmail .mbox exports (no IMAP, no OAuth, no Google
 * API quotas to fight). The user's flow:
 *
 *   1. Set up a Gmail filter: subject:"Your job alert" → label:"job-alerts"
 *      (or whatever label name they prefer)
 *   2. Once a week / month, run a Google Takeout for that label only:
 *      https://takeout.google.com → Gmail → Include only labels → job-alerts
 *   3. Drop the resulting `.mbox` file into `data/inbox-mbox/`
 *   4. Run `node scan-email.mjs` — it consumes every .mbox, extracts URLs,
 *      moves the consumed file to `data/inbox-mbox/processed/{date}.mbox`,
 *      and appends new URLs to pipeline.md.
 *
 * No new npm deps — uses Node's built-in `fs` + plain regex on the mbox
 * format. The mbox format is just `From ` separators between RFC-2822
 * messages, which is more than parseable for what we need.
 *
 * Supported parsers (each a `(rawMessage) => Array<{title, url, source}>`):
 *   • LinkedIn — extracts /jobs/view/{id} URLs + nearby title/company text
 *   • Indeed   — extracts indeed.com/viewjob URLs + title/company
 *   • generic  — fallback: any URL on a recognised job-board host (last
 *     resort if a more specific parser doesn't fire)
 *
 * Usage:
 *   node scan-email.mjs                # process every .mbox in data/inbox-mbox/
 *   node scan-email.mjs --dry-run      # preview without writing/moving files
 *   node scan-email.mjs --file PATH    # process one file directly
 *   node scan-email.mjs --keep         # don't move processed files
 */

import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
} from 'fs';
import path from 'path';
import {
  profilePath,
  ensureProfileDirs,
  profileFromArgv,
  userFromArgv,
} from '../lib/lib-profiles.mjs';

// Mbox inbox is shared (drop emails here from any client) — output is
// per-user per-profile.
const INBOX_DIR = 'data/inbox-mbox';
const PROCESSED_DIR = path.join(INBOX_DIR, 'processed');

const USER_ID = userFromArgv();
const PROFILE_ID = profileFromArgv();
ensureProfileDirs(PROFILE_ID, USER_ID);
const SCAN_HISTORY_PATH = profilePath(PROFILE_ID, 'scan-history', USER_ID);
const PIPELINE_PATH = profilePath(PROFILE_ID, 'pipeline', USER_ID);
const APPLICATIONS_PATH = profilePath(PROFILE_ID, 'applications', USER_ID);

mkdirSync(INBOX_DIR, { recursive: true });
mkdirSync(PROCESSED_DIR, { recursive: true });

// ── mbox split ──────────────────────────────────────────────────────
//
// mbox separates messages with lines beginning `From ` (note the trailing
// space — distinguishes it from the From: header). The separator may be
// at the very start of the file or preceded by a blank line. We split
// on `\n\nFrom ` (most reliable) plus the file-start case.

function splitMbox(text) {
  if (!text) return [];
  const messages = [];
  // Normalize line endings
  const norm = text.replace(/\r\n/g, '\n');
  // The first message starts at byte 0 if the file begins with `From `;
  // otherwise it starts at the first `\n\nFrom ` boundary.
  let cursor = norm.startsWith('From ') ? 0 : norm.indexOf('\n\nFrom ');
  if (cursor === -1) return [];
  if (cursor > 0) cursor += 2; // skip the `\n\n`

  while (cursor < norm.length) {
    const next = norm.indexOf('\n\nFrom ', cursor + 1);
    const end = next === -1 ? norm.length : next;
    messages.push(norm.slice(cursor, end));
    if (next === -1) break;
    cursor = next + 2; // skip `\n\n` to land on `From `
  }
  return messages;
}

// ── header parsing ──────────────────────────────────────────────────

function parseHeaders(rawMessage) {
  // Headers end at the first blank line.
  const blank = rawMessage.indexOf('\n\n');
  const head = blank === -1 ? rawMessage : rawMessage.slice(0, blank);
  const headers = {};
  let lastKey = null;
  for (const line of head.split('\n')) {
    if (line.startsWith('From ')) continue; // mbox separator
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (lastKey) headers[lastKey] += ' ' + line.trim();
      continue;
    }
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).toLowerCase();
    const value = line.slice(colon + 1).trim();
    headers[key] = value;
    lastKey = key;
  }
  const body = blank === -1 ? '' : rawMessage.slice(blank + 2);
  return { headers, body };
}

// ── body decoding ───────────────────────────────────────────────────
//
// Real-world mbox bodies are quoted-printable or base64 encoded, often as
// multipart/alternative. For our needs (URL extraction) we just decode
// quoted-printable inline since LinkedIn/Indeed alerts are almost always
// quoted-printable HTML. We don't need the full HTML — just the URLs.

function decodeQuotedPrintable(s) {
  if (!s) return s;
  // Decode `=XX` hex sequences and `=\n` soft breaks.
  return s
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function decodeBase64(s) {
  try {
    return Buffer.from(s.replace(/\s+/g, ''), 'base64').toString('utf8');
  } catch {
    return s;
  }
}

/** Pull URLs from a (potentially encoded) body. We don't need to fully
 *  decode multipart — just find every URL we care about.
 *
 *  CRITICAL: only decode quoted-printable when the header explicitly says
 *  so. Decoding plain-text URLs that happen to contain `=ab` (e.g.
 *  `?jk=abc123`) would interpret `=ab` as a hex escape and corrupt the
 *  URL. This bit me on the first verification run. */
function extractUrls(body, encoding) {
  let text = body;
  if (/quoted-printable/i.test(encoding)) text = decodeQuotedPrintable(body);
  else if (/base64/i.test(encoding)) text = decodeBase64(body);
  // (No fall-through to decodeQuotedPrintable — see comment above.)
  const out = new Set();
  for (const m of text.matchAll(/https?:\/\/[^\s"<>'\)]+/g)) {
    out.add(m[0]);
  }
  return [...out];
}

// ── LinkedIn parser ─────────────────────────────────────────────────
//
// LinkedIn job-alert URLs look like:
//   https://www.linkedin.com/comm/jobs/view/{jobId}/?...tracking-params...
// We strip the tracking params and convert to the canonical /jobs/view/{id}
// URL so dedup works across different alert emails for the same job.

function parseLinkedInAlert(rawMessage) {
  const { headers, body } = parseHeaders(rawMessage);
  const from = (headers['from'] || '').toLowerCase();
  if (!from.includes('linkedin')) return null;

  const cte = headers['content-transfer-encoding'] || '';
  const urls = extractUrls(body, cte);
  const out = [];
  const seen = new Set();
  for (const u of urls) {
    const m = u.match(/linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/);
    if (!m) continue;
    const jobId = m[1];
    if (seen.has(jobId)) continue;
    seen.add(jobId);
    out.push({
      url: `https://www.linkedin.com/jobs/view/${jobId}/`,
      title: '', // LinkedIn alerts often inline the title near the URL but
      // robust HTML→title extraction is brittle without a parser. Leave
      // blank — the downstream evaluator (evaluate) reads the JD anyway.
      company: '',
      source: 'linkedin-alert-email',
    });
  }
  return out;
}

// ── Indeed parser ───────────────────────────────────────────────────

function parseIndeedAlert(rawMessage) {
  const { headers, body } = parseHeaders(rawMessage);
  const from = (headers['from'] || '').toLowerCase();
  if (!from.includes('indeed')) return null;

  const urls = extractUrls(body, headers['content-transfer-encoding'] || '');
  const out = [];
  const seen = new Set();
  for (const u of urls) {
    // Indeed redirect-tracker URL pattern:
    //   https://www.indeed.com/rc/clk?jk={jobKey}&...
    // OR the canonical:
    //   https://www.indeed.com/viewjob?jk={jobKey}
    const m = u.match(/indeed\.com\/(?:rc\/clk|viewjob)\?[^"]*\bjk=([a-f0-9]+)/i);
    if (!m) continue;
    const jk = m[1];
    if (seen.has(jk)) continue;
    seen.add(jk);
    out.push({
      url: `https://www.indeed.com/viewjob?jk=${jk}`,
      title: '',
      company: '',
      source: 'indeed-alert-email',
    });
  }
  return out;
}

// ── Generic URL fallback ────────────────────────────────────────────
//
// Catches HN Who's Hiring email digests, weekly-digest types, etc that
// list job URLs at recognised ATS hosts. We're conservative — only
// hosts we already know how to score downstream.

const KNOWN_JOB_HOSTS = [
  'job-boards.greenhouse.io',
  'job-boards.eu.greenhouse.io',
  'boards.greenhouse.io',
  'jobs.ashbyhq.com',
  'jobs.lever.co',
  'apply.workable.com',
  'careers.smartrecruiters.com',
  'jobs.smartrecruiters.com',
  'myworkdayjobs.com',
  'jobs.personio.com',
  'jobs.personio.de',
  'recruitee.com',
  'teamtailor.com',
  'hnrss.org',
];

function parseGenericDigest(rawMessage) {
  const { headers, body } = parseHeaders(rawMessage);
  const urls = extractUrls(body, headers['content-transfer-encoding'] || '');
  const out = [];
  const seen = new Set();
  for (const u of urls) {
    if (!KNOWN_JOB_HOSTS.some((h) => u.includes(h))) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push({
      url: u,
      title: '',
      company: '',
      source: 'email-digest',
    });
  }
  return out;
}

// Try parsers in order — first one that returns a non-null result wins.
const PARSERS = [parseLinkedInAlert, parseIndeedAlert, parseGenericDigest];

// ── Dedup + writers (mirror scan.mjs) ───────────────────────────────

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
    for (const m of text.matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) seen.add(m[1]);
  }
  if (existsSync(APPLICATIONS_PATH)) {
    const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
    for (const m of text.matchAll(/https?:\/\/[^\s|)]+/g)) seen.add(m[0]);
  }
  return seen;
}

function appendToPipeline(offers) {
  if (offers.length === 0) return;
  let text = existsSync(PIPELINE_PATH) ? readFileSync(PIPELINE_PATH, 'utf-8') : '';
  const marker = '## Pendientes';
  const idx = text.indexOf(marker);
  const block = offers
    .map((o) => `- [ ] ${o.url} | ${o.company || '(unknown)'} | ${o.title || '(see email)'}`)
    .join('\n');
  if (idx === -1) {
    const procIdx = text.indexOf('## Procesadas');
    const insertAt = procIdx === -1 ? text.length : procIdx;
    text = text.slice(0, insertAt) + `\n${marker}\n\n${block}\n\n` + text.slice(insertAt);
  } else {
    const after = idx + marker.length;
    const next = text.indexOf('\n## ', after);
    const insertAt = next === -1 ? text.length : next;
    text = text.slice(0, insertAt) + '\n' + block + '\n' + text.slice(insertAt);
  }
  writeFileSync(PIPELINE_PATH, text, 'utf-8');
}

function appendToScanHistory(offers, date) {
  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(SCAN_HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n', 'utf-8');
  }
  const lines =
    offers
      .map((o) => `${o.url}\t${date}\t${o.source}\t${o.title || ''}\t${o.company || ''}\tadded`)
      .join('\n') + '\n';
  appendFileSync(SCAN_HISTORY_PATH, lines, 'utf-8');
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const keep = args.includes('--keep');
  const fileFlag = args.indexOf('--file');
  const explicitFile = fileFlag !== -1 ? args[fileFlag + 1] : null;

  let mboxFiles = [];
  if (explicitFile) {
    if (!existsSync(explicitFile)) {
      console.error(`File not found: ${explicitFile}`);
      process.exit(1);
    }
    mboxFiles = [explicitFile];
  } else {
    if (!existsSync(INBOX_DIR)) {
      console.log(`No mbox inbox at ${INBOX_DIR} — nothing to do.`);
      console.log(`Drop a Google Takeout .mbox file there to ingest job-alert emails.`);
      return;
    }
    mboxFiles = readdirSync(INBOX_DIR)
      .filter((n) => n.toLowerCase().endsWith('.mbox'))
      .map((n) => path.join(INBOX_DIR, n))
      .filter((p) => statSync(p).isFile());
  }

  if (mboxFiles.length === 0) {
    console.log('No .mbox files found. Drop one in data/inbox-mbox/ first.');
    return;
  }

  const seenUrls = loadSeenUrls();
  const date = new Date().toISOString().slice(0, 10);
  const newOffers = [];
  let totalMessages = 0;
  let totalDupes = 0;

  for (const file of mboxFiles) {
    console.log(`Reading ${file}…`);
    const raw = readFileSync(file, 'utf8');
    const messages = splitMbox(raw);
    totalMessages += messages.length;
    console.log(`  ${messages.length} message(s) parsed`);
    for (const msg of messages) {
      let extracted = null;
      for (const parser of PARSERS) {
        extracted = parser(msg);
        if (extracted && extracted.length > 0) break;
      }
      if (!extracted) continue;
      for (const offer of extracted) {
        if (seenUrls.has(offer.url)) {
          totalDupes++;
          continue;
        }
        seenUrls.add(offer.url);
        newOffers.push(offer);
      }
    }
    if (!dryRun && !keep && newOffers.length >= 0) {
      const dest = path.join(PROCESSED_DIR, path.basename(file, '.mbox') + '-' + date + '.mbox');
      try {
        renameSync(file, dest);
      } catch (e) {
        console.error(`  ✗ Could not move processed file: ${e.message}`);
      }
    }
  }

  if (!dryRun && newOffers.length > 0) {
    appendToPipeline(newOffers);
    appendToScanHistory(newOffers, date);
  }

  // Summary
  console.log(`\n${'━'.repeat(45)}`);
  console.log(`Email Ingestion — ${date}`);
  console.log(`${'━'.repeat(45)}`);
  console.log(`Files processed:   ${mboxFiles.length}`);
  console.log(`Messages parsed:   ${totalMessages}`);
  console.log(`Duplicates:        ${totalDupes}`);
  console.log(`New offers:        ${newOffers.length}`);

  // Source-by-source breakdown
  const bySource = {};
  for (const o of newOffers) bySource[o.source] = (bySource[o.source] || 0) + 1;
  if (Object.keys(bySource).length > 0) {
    console.log('\nBy source:');
    for (const [src, n] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${src.padEnd(28)} ${n}`);
    }
  }

  if (dryRun && newOffers.length > 0) {
    console.log(`\n(dry run — first 10:)`);
    for (const o of newOffers.slice(0, 10)) console.log(`  + [${o.source}] ${o.url}`);
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
