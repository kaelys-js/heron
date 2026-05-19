/**
 * inbound-leads -- unified storage + state machine for recruiter inbound
 * across BOTH channels (email + LinkedIn DM).
 *
 * Storage:
 *   - `inbound-leads.jsonl` (append-only log of raw + classified leads)
 *   - `inbound-threads.json` (per-lead state: awaiting-reply / engaged /
 *     went-silent / closed / replied)
 *
 * Lead lifecycle:
 *   1. Lead arrives (from email-reactor OR linkedin-dm scrape)
 *   2. Classified: real-role / mass-blast / scam / referral-ask /
 *      status-update / unknown
 *   3. If real-role + has JD URL → JD enrichment kicks off (fetch + score)
 *   4. Surfaces as Inbox card
 *   5. User generates a reply draft (or system pre-drafts)
 *   6. User reviews + clicks send (NEVER auto-sent)
 *   7. Reply marked; thread enters 'awaiting-reply'
 *   8. If no reply in 7 days → 'went-silent' card surfaces
 */

import fs from 'node:fs';
import path from 'node:path';
import { profilePath } from './profile-paths';
import { getActiveProfileId } from './profiles';

export type InboundChannel = 'email' | 'linkedin-dm';

export type InboundKind =
  | 'real-role'
  | 'mass-blast'
  | 'scam'
  | 'referral-ask'
  | 'status-update'
  | 'unknown';

export type InboundThreadState =
  | 'new' // never read by user
  | 'reviewed' // user opened the lead
  | 'drafted' // a draft reply exists
  | 'sent' // user marked the draft as sent
  | 'awaiting-reply' // sent + waiting for recruiter
  | 'engaged' // ongoing back-and-forth
  | 'went-silent' // recruiter hasn't replied >= 7d after last user message
  | 'closed'; // either side wound it down

export type InboundLead = {
  id: string;
  channel: InboundChannel;
  /** Cross-channel-stable id derived from sender + ts + first 64 chars of body. */
  messageId: string;
  arrivedAt: number;
  senderName: string;
  senderEmail?: string;
  senderDomain?: string;
  senderProfileUrl?: string;
  senderTitle?: string;
  subject: string;
  body: string;
  kind: InboundKind;
  /** Classifier confidence 0-1. */
  classifyConfidence: number;
  /** When the message contains a JD URL we auto-fetch + score, the
   *  resulting jobId is recorded here so the dashboard can deep-link. */
  enrichedJobId?: string;
  /** Most-recent draft (path on disk). */
  draftPath?: string;
};

export type InboundThread = {
  leadId: string;
  state: InboundThreadState;
  lastUserAction?: number;
  lastRecruiterMessage?: number;
  /** Replies the user has sent (count). */
  userReplies: number;
  /** Free-form notes the user attached. */
  notes?: string;
};

function leadsPath(profileId?: string): string {
  return profilePath(profileId ?? getActiveProfileId(), 'inbound-leads-jsonl');
}

function threadsPath(profileId?: string): string {
  return profilePath(profileId ?? getActiveProfileId(), 'inbound-threads-json');
}

function readThreadsMap(profileId?: string): Record<string, InboundThread> {
  const p = threadsPath(profileId);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, InboundThread>;
  } catch {
    return {};
  }
}

function writeThreadsMap(map: Record<string, InboundThread>, profileId?: string): void {
  const p = threadsPath(profileId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(map, null, 2));
}

/** Append a lead to the jsonl log. Deduped by messageId -- if the same
 *  message is scraped twice (overlapping windows), the first wins. */
export function appendLead(lead: InboundLead, profileId?: string): boolean {
  const p = leadsPath(profileId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  // Dedup by messageId -- read existing
  if (fs.existsSync(p)) {
    const text = fs.readFileSync(p, 'utf8');
    if (text.includes('"messageId":"' + lead.messageId + '"')) return false;
  }
  fs.appendFileSync(p, JSON.stringify(lead) + '\n');
  // Initialise thread state
  const threads = readThreadsMap(profileId);
  if (!threads[lead.id]) {
    threads[lead.id] = { leadId: lead.id, state: 'new', userReplies: 0 };
    writeThreadsMap(threads, profileId);
  }
  return true;
}

export function listLeads(profileId?: string): InboundLead[] {
  const p = leadsPath(profileId);
  if (!fs.existsSync(p)) return [];
  const out: InboundLead[] = [];
  try {
    const text = fs.readFileSync(p, 'utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as InboundLead);
      } catch {
        // Corrupt line from a partial write -- skip and keep loading.
      }
    }
  } catch {
    // File read failure -- degrade to empty list rather than crash.
    // The /api/inbound endpoint surfaces this as an empty inbox.
  }
  return out.sort((a, b) => b.arrivedAt - a.arrivedAt);
}

export function getLead(id: string, profileId?: string): InboundLead | undefined {
  return listLeads(profileId).find((l) => l.id === id);
}

export function getThread(id: string, profileId?: string): InboundThread | undefined {
  return readThreadsMap(profileId)[id];
}

export function setThreadState(
  leadId: string,
  state: InboundThreadState,
  profileId?: string,
): InboundThread | undefined {
  const map = readThreadsMap(profileId);
  if (!map[leadId]) return undefined;
  map[leadId].state = state;
  map[leadId].lastUserAction = Date.now();
  writeThreadsMap(map, profileId);
  return map[leadId];
}

export function recordUserReply(leadId: string, profileId?: string): InboundThread | undefined {
  const map = readThreadsMap(profileId);
  if (!map[leadId]) return undefined;
  map[leadId].userReplies = (map[leadId].userReplies ?? 0) + 1;
  map[leadId].lastUserAction = Date.now();
  map[leadId].state = 'awaiting-reply';
  writeThreadsMap(map, profileId);
  return map[leadId];
}

export function attachDraftPath(leadId: string, draftPath: string, profileId?: string): void {
  // We don't rewrite the jsonl -- we add a side-channel record.
  const draftMapPath = path.join(path.dirname(threadsPath(profileId)), 'inbound-drafts.json');
  let map: Record<string, string> = {};
  if (fs.existsSync(draftMapPath)) {
    try {
      map = JSON.parse(fs.readFileSync(draftMapPath, 'utf8'));
    } catch {
      // Corrupt JSON -- start with an empty map; the new entry will
      // overwrite the bad file on the writeFileSync below.
    }
  }
  map[leadId] = draftPath;
  fs.writeFileSync(draftMapPath, JSON.stringify(map, null, 2));
}

export function getDraftPath(leadId: string, profileId?: string): string | undefined {
  const draftMapPath = path.join(path.dirname(threadsPath(profileId)), 'inbound-drafts.json');
  if (!fs.existsSync(draftMapPath)) return undefined;
  try {
    const map = JSON.parse(fs.readFileSync(draftMapPath, 'utf8')) as Record<string, string>;
    return map[leadId];
  } catch {
    return undefined;
  }
}

/** Walk every thread and mark 'awaiting-reply' threads that haven't
 *  heard back in 7+ days as 'went-silent'. Returns the leadIds that
 *  flipped state. */
const SILENT_DAYS = 7;
const SILENT_MS = SILENT_DAYS * 24 * 60 * 60 * 1000;
export function detectSilentRecruiters(profileId?: string): string[] {
  const map = readThreadsMap(profileId);
  const now = Date.now();
  const flipped: string[] = [];
  for (const [leadId, thread] of Object.entries(map)) {
    if (thread.state !== 'awaiting-reply') continue;
    if (!thread.lastUserAction) continue;
    if (now - thread.lastUserAction >= SILENT_MS) {
      thread.state = 'went-silent';
      flipped.push(leadId);
    }
  }
  if (flipped.length > 0) writeThreadsMap(map, profileId);
  return flipped;
}

// ── Classifier ─────────────────────────────────────────────────────
// Lightweight heuristic classifier. Real classifier could use an LLM
// pass -- left as a follow-up; the heuristic is good enough to filter
// out the obvious mass-blasts + spam.

const REAL_ROLE_SIGNALS = [
  /\b(senior|staff|principal|head of|director|vp|cto|engineer|developer|designer|manager|architect|lead)\b/i,
  /\b(opportunity|role|position|opening|opening up|hiring|search)\b/i,
  /\bcomp(ensation)?\b|\bsalary\b|\bequity\b|\b\$\d/i,
];
const MASS_BLAST_SIGNALS = [
  /\bdear (candidate|professional|sir\/madam)\b/i,
  /\b(reach out|reaching out) to (you|professionals|candidates)\b.{0,40}(profile|background)/i,
  /\bmultiple (similar )?(roles|opportunities) (available|open)\b/i,
];
const SCAM_SIGNALS = [
  /\b(wire|western union|bitcoin|gift card|crypto)\b/i,
  /\b(start (immediately|asap)|same day|today)\b.{0,40}\b(pay|salary|comp)/i,
  /\b(no experience required|earn from home)\b/i,
  /(\$\d{3,4}\s*\/\s*(day|hour))/i,
];
const REFERRAL_ASK_SIGNALS = [
  /\b(do you know|any)\b.{0,40}\b(referral|introduction|intro)\b/i,
  /\b(passing along|forwarding) (this|the role|the position)\b/i,
];
const STATUS_UPDATE_SIGNALS = [
  /\b(we (have decided|won't be|won't proceed)|moving forward|next steps)\b/i,
  /\b(unfortunately|sadly)\b.{0,40}\b(other candidate|moving forward without)/i,
];

export function classifyInbound(input: { subject: string; body: string; senderDomain?: string }): {
  kind: InboundKind;
  confidence: number;
} {
  const hay = (input.subject + ' ' + input.body).slice(0, 4000);

  let scamHits = 0;
  for (const re of SCAM_SIGNALS) if (re.test(hay)) scamHits++;
  if (scamHits >= 1) return { kind: 'scam', confidence: scamHits >= 2 ? 0.95 : 0.7 };

  let statusHits = 0;
  for (const re of STATUS_UPDATE_SIGNALS) if (re.test(hay)) statusHits++;
  if (statusHits >= 1) return { kind: 'status-update', confidence: 0.8 };

  let referralHits = 0;
  for (const re of REFERRAL_ASK_SIGNALS) if (re.test(hay)) referralHits++;
  if (referralHits >= 1) return { kind: 'referral-ask', confidence: 0.8 };

  let blastHits = 0;
  for (const re of MASS_BLAST_SIGNALS) if (re.test(hay)) blastHits++;

  let realHits = 0;
  for (const re of REAL_ROLE_SIGNALS) if (re.test(hay)) realHits++;

  if (realHits >= 2 && blastHits === 0) return { kind: 'real-role', confidence: 0.85 };
  if (realHits >= 1 && blastHits === 0) return { kind: 'real-role', confidence: 0.6 };
  if (blastHits >= 1 && realHits === 0) return { kind: 'mass-blast', confidence: 0.7 };
  if (blastHits >= 1 && realHits >= 1) return { kind: 'mass-blast', confidence: 0.55 };
  return { kind: 'unknown', confidence: 0.3 };
}

/** Extract the first https URL that looks like a JD posting (so we
 *  can auto-enrich). */
export function extractJdUrl(text: string): string | undefined {
  const matches = text.match(/https?:\/\/[^\s<>"]+/g) ?? [];
  for (const url of matches) {
    if (
      /lever\.co\/|greenhouse\.io\/|ashbyhq\.com\/|workable\.com\/|jobs\.|careers\.|linkedin\.com\/jobs\//i.test(
        url,
      )
    ) {
      return url.replace(/[)\].,>]+$/, '');
    }
  }
  // Fallback: first https URL if it's not clearly a profile link
  for (const url of matches) {
    if (!/linkedin\.com\/(in|company)\//i.test(url)) return url.replace(/[)\].,>]+$/, '');
  }
  return undefined;
}
