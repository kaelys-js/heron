#!/usr/bin/env node

/**
 * scan-email-imap.mjs — Real-time Gmail IMAP polling for job-alert emails.
 *
 * Companion to scan-email.mjs (which parses local .mbox files): this
 * version connects to Gmail directly via IMAP+app-password, fetches new
 * unread messages from a configured label, hands them to the same
 * parser registry (LinkedIn alerts / Indeed alerts / generic digest),
 * and marks them \Seen on success.
 *
 * Why IMAP (not OAuth): user explicitly chose simplest auth. App
 * passwords need 2FA enabled but require zero OAuth setup, no Google
 * Cloud project, no consent screen. Stored in .env, never sent
 * anywhere except the user's own Gmail server over TLS.
 *
 * Triggered every 30 min by the new `interval` autopilot trigger
 * (see ui/src/lib/server/autopilot.ts). Idempotent: messages are only
 * processed once because we mark them as Seen.
 *
 * USAGE
 * -----
 *   node scan-email-imap.mjs                # poll & process
 *   node scan-email-imap.mjs --dry-run      # find but don't write or mark Seen
 *   node scan-email-imap.mjs --keep-unread  # process but don't mark Seen
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { ImapFlow } from 'imapflow';
import { profilePath, ensureProfileDirs, profileFromArgv } from '../lib/lib-profiles.mjs';

const ROOT = path.resolve(process.cwd());
const ENV_FILE = path.join(ROOT, '.env');

// Resolve profile from argv (--profile <slug>). Output lands in that
// profile's pipeline / applications / scan-history.
const PROFILE_ID = profileFromArgv();
ensureProfileDirs(PROFILE_ID);
const PIPELINE = profilePath(PROFILE_ID, 'pipeline');
const APPLICATIONS = profilePath(PROFILE_ID, 'applications');
const SCAN_HISTORY = profilePath(PROFILE_ID, 'scan-history');

// Load .env so creds populate process.env
if (existsSync(ENV_FILE)) {
  dotenv.config({ path: ENV_FILE, override: false });
}

const HOST = process.env.GMAIL_IMAP_HOST || 'imap.gmail.com';
const USER = process.env.GMAIL_IMAP_USER;
const PASS = process.env.GMAIL_IMAP_PASSWORD;
const LABEL = process.env.GMAIL_IMAP_LABEL || 'INBOX';

if (!USER || !PASS) {
  console.error('ERROR: GMAIL_IMAP_USER + GMAIL_IMAP_PASSWORD must be set in .env.');
  console.error('       Connect Gmail from /sources first.');
  process.exit(2);
}

// ── URL parsers (mirror scan-email.mjs) ────────────────────────────────
//
// Each parser inspects the From header + body, returns array of
// { url, source } when it matches. If From doesn't match the expected
// sender, returns null so the next parser gets a turn. Same shape as
// scan-email.mjs to keep the dedup pipeline + source attribution
// consistent across both.

function decodeQuotedPrintable(s) {
  if (!s) return s;
  return s
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/** Extract URLs from a body, decoding quoted-printable ONLY when the
 *  encoding header explicitly says so (otherwise plain `?jk=ab` would
 *  get its `=ab` interpreted as a hex escape and corrupt the URL —
 *  same bug fixed in scan-email.mjs). */
function extractUrls(body, encoding) {
  let text = body;
  if (/quoted-printable/i.test(encoding)) text = decodeQuotedPrintable(body);
  const out = new Set();
  for (const m of text.matchAll(/https?:\/\/[^\s"<>'\)]+/g)) {
    out.add(m[0]);
  }
  return [...out];
}

function parseLinkedIn(from, body, encoding) {
  if (!from.toLowerCase().includes('linkedin')) return null;
  const urls = extractUrls(body, encoding);
  const out = [];
  const seen = new Set();
  for (const u of urls) {
    const m = u.match(/linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/);
    if (!m) continue;
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({
      url: `https://www.linkedin.com/jobs/view/${m[1]}/`,
      source: 'linkedin-alert-email',
    });
  }
  return out;
}

function parseIndeed(from, body, encoding) {
  if (!from.toLowerCase().includes('indeed')) return null;
  const urls = extractUrls(body, encoding);
  const out = [];
  const seen = new Set();
  for (const u of urls) {
    const m = u.match(/indeed\.com\/(?:rc\/clk|viewjob)\?[^"]*\bjk=([a-f0-9]+)/i);
    if (!m) continue;
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({
      url: `https://www.indeed.com/viewjob?jk=${m[1]}`,
      source: 'indeed-alert-email',
    });
  }
  return out;
}

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

function parseGeneric(from, body, encoding) {
  const urls = extractUrls(body, encoding);
  const out = [];
  const seen = new Set();
  for (const u of urls) {
    if (!KNOWN_JOB_HOSTS.some((h) => u.includes(h))) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push({ url: u, source: 'email-digest' });
  }
  return out;
}

const PARSERS = [parseLinkedIn, parseIndeed, parseGeneric];

// ── Dedup + writers (mirror scan-email.mjs / scan.mjs) ────────────────

function loadSeenUrls() {
  const seen = new Set();
  if (existsSync(SCAN_HISTORY)) {
    for (const line of readFileSync(SCAN_HISTORY, 'utf8').split('\n').slice(1)) {
      const url = line.split('\t')[0];
      if (url) seen.add(url);
    }
  }
  if (existsSync(PIPELINE)) {
    for (const m of readFileSync(PIPELINE, 'utf8').matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) {
      seen.add(m[1]);
    }
  }
  if (existsSync(APPLICATIONS)) {
    for (const m of readFileSync(APPLICATIONS, 'utf8').matchAll(/https?:\/\/[^\s|)]+/g)) {
      seen.add(m[0]);
    }
  }
  return seen;
}

function appendToPipeline(offers) {
  if (offers.length === 0) return;
  let text = existsSync(PIPELINE) ? readFileSync(PIPELINE, 'utf8') : '';
  const block = offers
    .map((o) => `- [ ] ${o.url} | ${o.company || '(unknown)'} | ${o.title || '(see email)'}`)
    .join('\n');
  if (text.includes('## Pendientes')) {
    const idx = text.indexOf('## Pendientes') + '## Pendientes'.length;
    const next = text.indexOf('\n## ', idx);
    const insertAt = next === -1 ? text.length : next;
    text = text.slice(0, insertAt) + '\n' + block + '\n' + text.slice(insertAt);
  } else {
    text += `\n## Pendientes\n\n${block}\n\n`;
  }
  writeFileSync(PIPELINE, text);
}

function appendToScanHistory(offers, date) {
  if (!existsSync(SCAN_HISTORY)) {
    writeFileSync(SCAN_HISTORY, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n');
  }
  const lines =
    offers
      .map((o) => `${o.url}\t${date}\t${o.source}\t${o.title || ''}\t${o.company || ''}\tadded`)
      .join('\n') + '\n';
  appendFileSync(SCAN_HISTORY, lines);
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const keepUnread = args.includes('--keep-unread');

  const client = new ImapFlow({
    host: HOST,
    port: 993,
    secure: true,
    auth: { user: USER, pass: PASS },
    logger: false,
  });

  const seen = loadSeenUrls();
  const newOffers = [];
  const processedUids = [];
  let processedMessages = 0;
  let dupeCount = 0;
  // Reactor counters — emails that weren't job alerts went through
  // /api/email/react. classified = the dashboard accepted + classified,
  // acted = the classification was actionable (not 'other'),
  // errors = the POST failed (dashboard not running, etc).
  let reactorClassified = 0;
  let reactorActed = 0;
  let reactorErrors = 0;
  const startedAt = Date.now();

  console.log(`Connecting to ${HOST} as ${USER}…`);
  await client.connect();

  try {
    const lock = await client.getMailboxLock(LABEL);
    try {
      // Search for unseen messages from the last 14 days. Most providers
      // honour `since:` server-side; for Gmail it's evaluated against the
      // INTERNALDATE.
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const uids = await client.search({ seen: false, since });
      if (!uids || uids.length === 0) {
        console.log(`No unseen messages in ${LABEL} since ${since.toISOString().slice(0, 10)}`);
      } else {
        console.log(`Found ${uids.length} unseen message(s)`);
      }

      // Process oldest-first so failed runs can be re-run idempotently.
      for await (const msg of client.fetch(uids ?? [], { source: true, envelope: true })) {
        processedMessages++;
        const raw = msg.source?.toString('utf8') || '';
        const from = msg.envelope?.from?.[0]?.address || '';
        const subject = msg.envelope?.subject || '';
        const messageId = msg.envelope?.messageId || '';
        const dateRaw = msg.envelope?.date;
        const ts = dateRaw ? new Date(dateRaw).getTime() : Date.now();
        // Pull Content-Transfer-Encoding from headers section.
        const cteMatch = raw.match(/^Content-Transfer-Encoding:\s*([^\r\n]+)/im);
        const encoding = (cteMatch?.[1] || '').trim();

        // Pick the body — split off headers at the first blank line.
        const blank = raw.indexOf('\n\n');
        const body = blank === -1 ? '' : raw.slice(blank + 2);
        // Decode the body once for the reactor path. The reactor classifier
        // pattern-matches against plain text; quoted-printable digests
        // would otherwise carry =\n line wraps that break phrase matches.
        const decodedBody = /quoted-printable/i.test(encoding) ? decodeQuotedPrintable(body) : body;

        let extracted = null;
        for (const parser of PARSERS) {
          extracted = parser(from, body, encoding);
          if (extracted && extracted.length > 0) break;
        }

        if (extracted && extracted.length > 0) {
          // Job-alert digest path — same as before.
          for (const offer of extracted) {
            if (seen.has(offer.url)) {
              dupeCount++;
              continue;
            }
            seen.add(offer.url);
            newOffers.push(offer);
          }
          processedUids.push(msg.uid);
        } else if (!dryRun) {
          // NOT a job-alert. Route to the email-reactor endpoint, which
          // classifies (rejection / interview-scheduling / offer /
          // take-home / recruiter-reach-out) and auto-applies status
          // transitions + tech-prep + lead-logging side-effects.
          //
          // Best-effort: a failed POST shouldn't block the rest of the
          // batch. We mark the message Seen even when the reactor fails
          // because retrying the classification won't help (it's
          // deterministic on the same body) and re-trying triggers the
          // reactor's auto-fire side-effects again, which is worse than
          // missing one.
          try {
            const reactorUrl = process.env.CAREER_OPS_DASHBOARD_URL || 'http://127.0.0.1:5174';
            const res = await fetch(reactorUrl + '/api/email/react', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                ts,
                from,
                subject,
                body: decodedBody.slice(0, 8000),
                messageId,
              }),
            });
            if (res.ok) {
              const json = await res.json().catch(() => ({}));
              reactorClassified++;
              if (json?.classification?.kind && json.classification.kind !== 'other') {
                reactorActed++;
              }
            } else {
              reactorErrors++;
            }
          } catch {
            // Dashboard not running, or network blip. Don't crash — the
            // user can re-run with the dashboard up. We still mark
            // Seen below so we don't loop on the same unparseable mail.
            reactorErrors++;
          }
          processedUids.push(msg.uid);
        }
      }

      // Mark processed messages as \Seen (unless --keep-unread or --dry-run).
      if (!dryRun && !keepUnread && processedUids.length > 0) {
        await client.messageFlagsAdd(processedUids, ['\\Seen']);
      }
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {}
  }

  if (!dryRun && newOffers.length > 0) {
    const date = new Date().toISOString().slice(0, 10);
    appendToPipeline(newOffers);
    appendToScanHistory(newOffers, date);
  }

  // ── Summary (parsed by JobDef wrapper) ──
  console.log('');
  console.log('━'.repeat(45));
  console.log(
    `Gmail IMAP — ${new Date().toISOString().slice(0, 10)} (${Math.round((Date.now() - startedAt) / 1000)}s)`,
  );
  console.log('━'.repeat(45));
  console.log(`Messages processed: ${processedMessages}`);
  console.log(`Duplicates:         ${dupeCount}`);
  console.log(`New offers:         ${newOffers.length}`);
  console.log(
    `Reactor classified: ${reactorClassified} (${reactorActed} actionable, ${reactorErrors} errors)`,
  );
  // Stable summary line for the orchestrator's regex.
  console.log(`Total jobs found: ${newOffers.length}`);

  const bySource = {};
  for (const o of newOffers) bySource[o.source] = (bySource[o.source] || 0) + 1;
  if (Object.keys(bySource).length > 0) {
    console.log('\nBy source:');
    for (const [s, n] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${s.padEnd(28)} ${n}`);
    }
  }

  if (dryRun && newOffers.length > 0) {
    console.log(`\n(dry run — first 10:)`);
    for (const o of newOffers.slice(0, 10)) console.log(`  + [${o.source}] ${o.url}`);
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message || err);
  process.exit(1);
});
