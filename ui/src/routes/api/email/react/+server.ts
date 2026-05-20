/** /api/email/react -- accept an inbound email + react to it.
 *  POST body: { ts, from, subject, body, messageId? }
 *  Returns: { classification, match, actions, execution }.
 *  Since F14/F19 the IMAP poller calls reactToEmail() IN-PROCESS under
 *  the OWNER's ALS context, so this HTTP endpoint is only hit from the
 *  dashboard's "Replay last email" debug tool -- never from IMAP.
 *  Side-effects (status flips, tech-prep generation) run synchronously;
 *  ~1 fs scan + ~10 regexes per email, sub-100ms typical.
 *  Auth: requireUserId() runs first so reactor's loadAllJobs() and
 *  markStatus() land in the REQUESTER's tree (F21 defense in depth). */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { requireUserId } from '$lib/server/auth-helpers';
import { reactToEmail, type EmailInput, listLeads } from '$lib/server/email-reactor';

export const POST = wrap(
  'email-react',
  async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    requireUserId(locals);
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
  },
);

export const GET = wrap('email-react', async ({ locals }: { locals: App.Locals }) => {
  requireUserId(locals);
  // Surface the inbound-leads ledger for the UI.
  return { leads: listLeads().slice(0, 50) };
});
