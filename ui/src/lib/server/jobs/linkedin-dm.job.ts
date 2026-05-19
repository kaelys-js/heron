/**
 * linkedin-dm-job — periodic LinkedIn DM ingestion + classification.
 *
 * Runs every 6 hours by default. Each tick:
 *   1. Spawns `linkedin-dm-scraper.py --json`
 *   2. For each message, runs `classifyInbound` (heuristic)
 *   3. Persists to `inbound-leads.jsonl` (deduped by messageId)
 *   4. For 'real-role' messages with a JD URL → triggers auto-enrich
 *      (left as a separate enrich call so a slow JD fetch doesn't
 *      starve the rest of the queue)
 *   5. Files Inbox card "X new recruiter messages"
 *
 * Anti-detection: LinkedIn flags scrapers that hit too often. We cap at
 * 4 invocations/day + use the same humanized cadence as scan-linkedin-auth.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { register } from './registry';
import type { JobResult } from './types';
import { ROOT } from '../files';
import {
  appendLead,
  classifyInbound,
  extractJdUrl,
  detectSilentRecruiters,
  type InboundLead,
} from '../inbound-leads';
import { reportIssue } from '../issues';
import { logEvent } from '../events';

const TIMEOUT_MS = 240_000;

function pythonBin(): string {
  const candidate = path.join(ROOT, '.venv', 'bin', 'python');
  return fs.existsSync(candidate) ? candidate : 'python3';
}

function runScraper(): Promise<{ stdout: string; code: number }> {
  return new Promise((resolveP) => {
    let stdout = '';
    const p = spawn(
      pythonBin(),
      [path.join(ROOT, 'scripts/linkedin/linkedin-dm-scraper.py'), '--json'],
      {
        cwd: ROOT,
        env: { ...process.env },
      },
    );
    p.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    const timer = setTimeout(() => {
      try {
        p.kill('SIGTERM');
      } catch {
        /* process already exited — kill races with the close event */
      }
      resolveP({ stdout, code: 124 });
    }, TIMEOUT_MS);
    p.on('error', () => {
      clearTimeout(timer);
      resolveP({ stdout, code: 1 });
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      resolveP({ stdout, code: code ?? 0 });
    });
  });
}

type ScrapedDM = {
  messageId: string;
  ts: number;
  senderName: string;
  senderProfileUrl?: string;
  subject: string;
  body: string;
  kind: 'inmail' | 'direct';
};

async function runLinkedInDmIngest(): Promise<JobResult> {
  const { stdout, code } = await runScraper();
  if (code === 1) {
    reportIssue({
      severity: 'warn',
      source: 'linkedin-dm',
      summary: 'LinkedIn session expired — re-login to resume DM ingest',
      detail: 'Open /linkedin-audit and click "Log in to LinkedIn".',
      dedupeKey: 'linkedin-dm:session-expired',
      fix: { label: 'Re-login', href: '/linkedin-audit' },
    });
    return { ok: false, error: 'session-expired' };
  }
  if (code === 124) return { ok: false, error: 'timeout' };
  let messages: ScrapedDM[] = [];
  try {
    messages = JSON.parse(stdout) as ScrapedDM[];
  } catch {
    return { ok: false, error: 'non-JSON scraper output' };
  }
  let newCount = 0;
  let realCount = 0;
  for (const m of messages) {
    const { kind, confidence } = classifyInbound({ subject: m.subject, body: m.body });
    const jdUrl = extractJdUrl(m.subject + ' ' + m.body);
    const lead: InboundLead = {
      id: 'li-' + m.messageId,
      channel: 'linkedin-dm',
      messageId: m.messageId,
      arrivedAt: m.ts,
      senderName: m.senderName,
      senderProfileUrl: m.senderProfileUrl,
      subject: m.subject,
      body: m.body,
      kind,
      classifyConfidence: confidence,
    };
    const added = appendLead(lead);
    if (added) {
      newCount++;
      if (kind === 'real-role') realCount++;
    }
    void jdUrl; // auto-enrich is handled by a separate job (see below)
  }
  const silentlyFlipped = detectSilentRecruiters();
  logEvent('linkedin-dm', newCount + ' new DM(s) · ' + realCount + ' look real', {
    level: newCount === 0 ? 'info' : realCount > 0 ? 'success' : 'info',
    category: 'application',
    message: 'silent flips: ' + silentlyFlipped.length,
  });
  if (realCount > 0) {
    reportIssue({
      severity: 'info',
      source: 'linkedin-dm',
      summary: realCount + ' new recruiter DM(s) · review + reply',
      detail: 'Open /inbox or /linkedin-dm to triage.',
      dedupeKey: 'linkedin-dm:new-leads',
      fix: { label: 'Open Inbox', href: '/inbox' },
    });
  }
  return {
    ok: true,
    message:
      newCount + ' new · ' + realCount + ' real-role · ' + silentlyFlipped.length + ' silent',
    meta: { newCount, realCount, silentlyFlipped: silentlyFlipped.length },
  };
}

register({
  id: 'linkedin-dm',
  label: 'LinkedIn DM ingest',
  description: 'Scrape recent LinkedIn DMs every 6h. Classifies + dedupes + files real-role leads.',
  category: 'discovery',
  trigger: { type: 'daily', hour: 8, minute: 0 },
  allowManual: true,
  perUser: true,
  run: runLinkedInDmIngest,
});

// We also register a SECOND copy at a different hour for second daily run.
register({
  id: 'linkedin-dm-pm',
  label: 'LinkedIn DM ingest (afternoon)',
  description: 'Second daily LinkedIn DM scrape (afternoon).',
  category: 'discovery',
  trigger: { type: 'daily', hour: 16, minute: 0 },
  allowManual: false,
  perUser: true,
  run: runLinkedInDmIngest,
});
