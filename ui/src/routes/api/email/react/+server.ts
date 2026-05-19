/**
 * /api/email/react -- accept an inbound email + react to it.
 *
 * POST body: { ts, from, subject, body, messageId? }
 * Returns: { classification, match, actions, execution }
 *
 * The IMAP poller used to call this from a child process, which crossed
 * an HTTP boundary that dropped the ALS user context -- the reactor then
 * resolved to SYSTEM_USER and either 401'd OR processed under the wrong
 * user (F14). After F14/F19 the IMAP poller calls `reactToEmail()`
 * IN-PROCESS under the OWNER's ALS context, so this HTTP endpoint is
 * now ONLY hit from the dashboard UI (the "Replay last email" debug
 * tool) -- never from the IMAP child.
 *
 * Side-effects (status flips, tech-prep generation, etc.) happen
 * synchronously inside the request. Per-email cost is one fs scan
 * (loadAllJobs) + ~10 regexes. Sub-100ms for typical emails.
 *
 * Auth: `requireUserId` runs first so the reactor's `loadAllJobs()` /
 * `markStatus()` calls land in THE REQUESTING user's tree. The global
 * hooks.server.ts guard 401s anonymous requests; this explicit call is
 * defense in depth (F21).
 */

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
