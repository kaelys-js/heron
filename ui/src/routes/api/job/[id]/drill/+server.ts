/**
 * /api/job/[id]/drill -- live drill feedback for code or design.
 *
 * POST body: { mode: 'code' | 'design', problem, userInput, previousFeedback }
 *
 * Spawns the drill-feedback Claude mode with the user's current snapshot.
 * Returns 4 structured fields: WORKING / WATCH / SUGGEST / QUESTION.
 * Browser-side this lights up coach commentary inline next to the editor.
 *
 * Cost: 1 short Claude pass (~5-15s). The user calls this on-demand
 * (button press), NOT on every keystroke -- would be wasteful.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { logEvent, reportServerError } from '$lib/server/events';

import { spawnAgentWithMode } from '$lib/server/spawn-agent';
type DrillInput = {
  mode: 'code' | 'design';
  problem: string;
  userInput: string;
  previousFeedback?: string[];
};

function spawnDrill(
  args: DrillInput & { profileId: string },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const promptInput = {
      mode: args.mode,
      problem: args.problem,
      userInput: args.userInput.slice(0, 12_000), // cap input to keep prompt small
      previousFeedback: (args.previousFeedback ?? []).slice(-5),
    };

    const { child: p } = spawnAgentWithMode('drill-feedback', JSON.stringify(promptInput), {
      profileId: args.profileId,
      env: { DRILL_INPUT: JSON.stringify(promptInput) },
    });
    p.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    p.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    p.on('error', (err) => reject(err));
    p.on('close', (code) => {
      if (code !== 0) reject(new Error('claude -p exited ' + code + ': ' + stderr.slice(0, 300)));
      else resolve({ stdout, stderr });
    });
  });
}

function parseDrillOutput(stdout: string): {
  working?: string;
  watch?: string;
  suggest?: string;
  question?: string;
} {
  const grab = (re: RegExp): string | undefined => {
    const m = re.exec(stdout);
    return m ? m[1].trim() : undefined;
  };
  return {
    working: grab(/WORKING:\s*(.+)/i),
    watch: grab(/WATCH:\s*(.+)/i),
    suggest: grab(/SUGGEST:\s*(.+)/i),
    question: grab(/QUESTION:\s*(.+)/i),
  };
}

export const POST = wrap(
  'drill',
  async ({ params, url, request }: { params: { id: string }; url: URL; request: Request }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { profileId } = resolved!;
    const body = (await request.json().catch(() => ({}))) as Partial<DrillInput>;
    if (!body.mode || (body.mode !== 'code' && body.mode !== 'design'))
      badRequest('mode must be code|design');
    if (!body.problem) badRequest('problem required');
    if (typeof body.userInput !== 'string') badRequest('userInput required');

    logEvent('drill', 'Drill feedback request · ' + body.mode, {
      level: 'info',
      category: 'application',
    });

    try {
      const { stdout } = await spawnDrill({
        mode: body.mode,
        problem: body.problem,
        userInput: body.userInput,
        previousFeedback: body.previousFeedback ?? [],
        profileId,
      });
      return { ok: true, ...parseDrillOutput(stdout) };
    } catch (err) {
      reportServerError('drill', 'Drill spawn failed', err, { category: 'application' });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
);
