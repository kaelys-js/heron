/**
 * POST /api/inbound/leads/[id]/reply
 *
 * Spawns the `recruiter-reply` mode to draft a personalised response.
 * NEVER auto-sends — the draft is saved to disk + path returned. The
 * dashboard renders the draft + a "I sent this" button the user clicks
 * AFTER pasting into LinkedIn / their email client.
 *
 * Body:
 *   {
 *     tone?: 'formal' | 'friendly' | 'concise',
 *     intent?: 'interested-want-more' | 'interested-with-concern' | 'polite-decline' | 'comp-first',
 *     userConcern?: string,
 *     userQuestion?: string
 *   }
 */

import { spawn } from 'node:child_process';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { ROOT } from '$lib/server/files';
import { swapProfileSymlinks } from '$lib/server/profile-symlinks';
import { logEvent, reportServerError } from '$lib/server/events';
import { CLI_NAMESPACE } from '$lib/config/branding';
import { AGENT_CLI } from '$lib/config/cli';
import { getLead, attachDraftPath, setThreadState } from '$lib/server/inbound-leads';
import { getActiveProfileId } from '$lib/server/profiles';

const TIMEOUT_MS = 90_000;

type Body = {
  tone?: 'formal' | 'friendly' | 'concise';
  intent?: 'interested-want-more' | 'interested-with-concern' | 'polite-decline' | 'comp-first';
  userConcern?: string;
  userQuestion?: string;
};

function spawnRecruiterReply(
  args: {
    profileId: string;
    leadId: string;
    lead: Record<string, unknown>;
  } & Body,
): Promise<{ stdout: string }> {
  return new Promise((resolveP, reject) => {
    let stdout = '';
    let stderr = '';
    const payload = { ...args };
    const prompt =
      '/' +
      CLI_NAMESPACE +
      ' recruiter-reply ' +
      JSON.stringify({
        leadId: args.leadId,
        profileId: args.profileId,
        tone: args.tone,
        intent: args.intent,
      });
    try {
      swapProfileSymlinks(args.profileId);
    } catch {}
    const p = spawn(AGENT_CLI, ['-p', prompt, '--dangerously-skip-permissions'], {
      cwd: ROOT,
      env: { ...process.env, RECRUITER_REPLY_INPUT: JSON.stringify(payload) },
    });
    p.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    p.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    const timer = setTimeout(() => {
      try {
        p.kill('SIGTERM');
      } catch {}
      reject(new Error('recruiter-reply timeout after ' + TIMEOUT_MS + 'ms'));
    }, TIMEOUT_MS);
    p.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error('claude -p exited ' + code + ': ' + stderr.slice(0, 300)));
      else resolveP({ stdout });
    });
  });
}

function parseReplyPath(stdout: string): string | undefined {
  const m = /REPLY_PATH:\s*(\S+)/.exec(stdout);
  return m ? m[1].trim() : undefined;
}

export const POST = wrap(
  'recruiter-reply',
  async ({ params, request }: { params: { id: string }; request: Request }) => {
    const body = (await request.json().catch(() => ({}))) as Body;
    const lead = getLead(params.id);
    if (!lead) badRequest('Lead not found: ' + params.id);
    const profileId = getActiveProfileId();
    // Refuse to draft for scam / mass-blast — return a stub message.
    if (lead!.kind === 'scam' || lead!.kind === 'mass-blast') {
      return {
        ok: true,
        skipped: lead!.kind,
        message: 'Lead classified as ' + lead!.kind + ' — drafting refused',
      };
    }
    try {
      const { stdout } = await spawnRecruiterReply({
        profileId,
        leadId: lead!.id,
        lead: lead as unknown as Record<string, unknown>,
        tone: body.tone,
        intent: body.intent,
        userConcern: body.userConcern,
        userQuestion: body.userQuestion,
      });
      const replyPath = parseReplyPath(stdout);
      if (replyPath) {
        attachDraftPath(lead!.id, replyPath);
        setThreadState(lead!.id, 'drafted');
      }
      logEvent('recruiter-reply', 'Draft ready for ' + lead!.senderName, {
        level: 'success',
        category: 'application',
        message: replyPath ?? '(no path emitted)',
      });
      return { ok: true, replyPath };
    } catch (err) {
      reportServerError('recruiter-reply', 'Draft failed', err, { category: 'application' });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
);
