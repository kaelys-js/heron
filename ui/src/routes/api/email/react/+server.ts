/**
 * /api/email/react — accept an inbound email + react to it.
 *
 * POST body: { ts, from, subject, body, messageId? }
 * Returns: { classification, match, actions, execution }
 *
 * The IMAP poller (scan-email-imap.mjs) calls this for every NON-
 * job-alert email it encounters. The poller hands us the parsed text
 * via HTTP rather than trying to import TS modules from a Node script.
 *
 * Side-effects (status flips, tech-prep generation, etc.) happen
 * synchronously inside the request. Per-email cost is one fs scan
 * (loadAllJobs) + ~10 regexes. Sub-100ms for typical emails.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { reactToEmail, type EmailInput, listLeads } from '$lib/server/email-reactor';

export const POST = wrap('email-react', async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => ({}))) as Partial<EmailInput>;
  if (!body?.from || !body?.subject) {
    badRequest('from + subject required');
  }
  const email: EmailInput = {
    ts: body.ts ?? Date.now(),
    from: body.from!,
    subject: body.subject!,
    body: body.body ?? '',
    messageId: body.messageId,
  };
  return reactToEmail(email);
});

export const GET = wrap('email-react', async () => {
  // Surface the inbound-leads ledger for the UI.
  return { leads: listLeads().slice(0, 50) };
});
