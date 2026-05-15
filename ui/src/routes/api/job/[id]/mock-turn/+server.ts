/**
 * /api/job/[id]/mock-turn — one turn of the voice mock interview.
 *
 * The browser captures the user's spoken answer (via Web Speech STT),
 * POSTs it here along with the running conversation history. We spawn
 * the mock-interview-turn Claude mode with the structured input, parse
 * the four-line output (TURN_SCORE / TURN_FEEDBACK / NEXT_QUESTION /
 * QUESTION_RATIONALE), and return JSON for the browser to TTS-speak
 * the next question.
 *
 * Stateless: history is in the request body. The client maintains the
 * transcript; the server doesn't persist anything until the session
 * ends (via the `endSession` flag).
 */

import fs from 'node:fs';
import path from 'node:path';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { ROOT } from '$lib/server/files';
import { profilePath } from '$lib/server/profile-paths';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { logEvent, reportServerError } from '$lib/server/events';

import { spawnAgentWithMode } from '$lib/server/spawn-agent';
type Turn = { question: string; answer: string; score?: number | null };
type Stage = 'PhoneScreen' | 'Technical' | 'TakeHome' | 'Onsite' | 'Final';

function slugify(s: string): string {
  return (
    (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'job'
  );
}

function spawnMockTurn(args: {
  company: string;
  role: string;
  stage: Stage;
  history: Turn[];
  latestAnswer: string;
  endSession: boolean;
  profileId: string;
  /** Panel-mode (#10): rotate personas (EM → peer eng → cross-fn → bar-raiser).
   *  Useful for Onsite simulation; otherwise leave false. */
  panelMode?: boolean;
}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    // The mode receives its input as JSON in a `$args` env var to keep
    // the prompt itself constant. The mode file already documents the
    // four-line output shape.
    const promptInput = {
      company: args.company,
      role: args.role,
      stage: args.stage,
      historyCount: args.history.length,
      history: args.history.slice(-10), // cap history sent to LLM to avoid huge prompts
      latestAnswer: args.latestAnswer,
      endOfSession: args.endSession,
      panelMode: !!args.panelMode,
    };

    const { child: p } = spawnAgentWithMode('mock-interview-turn', JSON.stringify(promptInput), {
      profileId: args.profileId,
      env: { MOCK_TURN_INPUT: JSON.stringify(promptInput) },
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

function parseTurnOutput(stdout: string): {
  score: number | null;
  feedback?: string;
  nextQuestion?: string;
  questionRationale?: string;
  sessionSummary?: string;
} {
  const grabStr = (re: RegExp): string | undefined => {
    const m = re.exec(stdout);
    return m ? m[1].trim() : undefined;
  };
  const scoreRaw = grabStr(/TURN_SCORE:\s*(\S+)/);
  let score: number | null = null;
  if (scoreRaw && scoreRaw !== 'NULL' && scoreRaw !== 'null') {
    const n = parseInt(scoreRaw, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 5) score = n;
  }
  // Session-summary is multi-line; capture everything after the marker.
  const sessionMatch = /SESSION_SUMMARY:([\s\S]+)$/i.exec(stdout);
  return {
    score,
    feedback: grabStr(/TURN_FEEDBACK:\s*(.+)/),
    nextQuestion: grabStr(/NEXT_QUESTION:\s*(.+)/),
    questionRationale: grabStr(/QUESTION_RATIONALE:\s*(.+)/),
    sessionSummary: sessionMatch ? sessionMatch[1].trim() : undefined,
  };
}

function saveTranscript(
  profileId: string,
  company: string,
  role: string,
  payload: {
    stage: Stage;
    history: Turn[];
    summary?: string;
    startedAt: number;
  },
): string {
  const ts = new Date(payload.startedAt)
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace(/-\d{3}Z$/, 'Z');
  const filename =
    slugify(company) +
    '-' +
    slugify(role) +
    '-mock-' +
    payload.stage.toLowerCase() +
    '-' +
    ts +
    '.md';
  const dest = path.join(profilePath(profileId, 'interview-prep-dir'), filename);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  let md = '# Mock Interview · ' + company + ' · ' + role + ' · ' + payload.stage + '\n\n';
  md += '_Recorded ' + new Date(payload.startedAt).toISOString() + '_\n\n';
  for (let i = 0; i < payload.history.length; i++) {
    const t = payload.history[i];
    md += '## Q' + (i + 1) + ': ' + t.question + '\n\n';
    md += '**Your answer:** ' + (t.answer || '(skipped)') + '\n\n';
    if (t.score != null) md += '**Score:** ' + t.score + '/5\n\n';
  }
  if (payload.summary) {
    md += '\n## Session summary\n\n' + payload.summary + '\n';
  }
  fs.writeFileSync(dest, md);
  return path.relative(ROOT, dest);
}

export const POST = wrap(
  'mock-turn',
  async ({ params, url, request }: { params: { id: string }; url: URL; request: Request }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;

    const body = await request.json().catch(() => ({}));
    const stage = (body?.stage as Stage) || 'PhoneScreen';
    const history = Array.isArray(body?.history) ? (body.history as Turn[]) : [];
    const latestAnswer = typeof body?.latestAnswer === 'string' ? body.latestAnswer : '';
    const endSession = !!body?.endSession;
    const startedAt = typeof body?.startedAt === 'number' ? body.startedAt : Date.now();
    const panelMode = !!body?.panelMode;

    try {
      const { stdout } = await spawnMockTurn({
        company: job.company || '?',
        role: job.role || '?',
        stage,
        history,
        latestAnswer,
        endSession,
        panelMode,
        profileId,
      });
      const parsed = parseTurnOutput(stdout);

      if (endSession) {
        // Persist the full transcript on session end.
        const savedPath = saveTranscript(profileId, job.company ?? '', job.role ?? '', {
          stage,
          history,
          summary: parsed.sessionSummary,
          startedAt,
        });
        logEvent('mock-interview', 'Session ended · transcript saved', {
          level: 'success',
          category: 'application',
          message: savedPath,
        });
        return {
          ok: true,
          endSession: true,
          transcriptPath: savedPath,
          summary: parsed.sessionSummary,
        };
      }

      return {
        ok: true,
        score: parsed.score,
        feedback: parsed.feedback,
        nextQuestion: parsed.nextQuestion,
        questionRationale: parsed.questionRationale,
      };
    } catch (err) {
      reportServerError('mock-turn', 'Mock-turn spawn failed', err, { category: 'application' });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
);
