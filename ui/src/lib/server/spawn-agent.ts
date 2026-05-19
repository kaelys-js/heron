/** spawn-agent -- central helper for spawning the AI CLI with a
 *  substituted mode prompt. Reads modes/<mode>.md, substitutes __TOKEN__
 *  placeholders against the active profile + user (mode-substitution.ts),
 *  writes the realized prompt to a temp file, spawns Claude with
 *  --append-system-prompt-file + user message via -p, then unlinks the
 *  temp file when the child exits (closeOnExit).
 *  Temp file (not inline -p) because realized prompts can exceed 10 KB
 *  and argv length + shell escaping (newlines, backticks, $) make inline
 *  passing fragile. */
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT } from './files';
import { AGENT_CLI } from '$lib/config/cli';
import { BRAND } from '$lib/client/brand';
import { realizeModePromptForUser } from './mode-substitution';
import { currentUserIdOrDefault } from './user-context';
import { logEvent } from './events';

export interface SpawnAgentOptions {
  /** profile slug to substitute against. Required. */
  profileId: string;
  /** Override the userId. Defaults to AsyncLocalStorage current user. */
  userId?: string;
  /** Extra env vars to merge onto the child. Userid + HERON_* envs
   *  are set automatically. */
  env?: NodeJS.ProcessEnv;
  /** Extra CLI args to insert AFTER -p but BEFORE --append-system-prompt-file. */
  extraArgs?: readonly string[];
  /** Override `cwd`. Defaults to repo ROOT. */
  cwd?: string;
}

export interface SpawnAgentResult {
  /** The spawned child process. */
  child: ChildProcess;
  /** Absolute path of the temp prompt file. Caller may inspect for
   *  debugging but doesn't need to delete -- cleanup is automatic. */
  tempPromptPath: string;
}

/**
 * Spawn the AI CLI with the realized contents of `modes/<modeName>.md`
 * loaded as the system prompt, and `userMessage` as the user prompt.
 *
 * @param modeName e.g. 'evaluate', 'cover-letter', 'pre-call-dossier'.
 *                 Maps to `<repo>/modes/<modeName>.md`.
 * @param userMessage The text passed to Claude as the user prompt
 *                    (usually the job URL or a JSON payload).
 * @param opts See {@link SpawnAgentOptions}.
 */
export function spawnAgentWithMode(
  modeName: string,
  userMessage: string,
  opts: SpawnAgentOptions,
): SpawnAgentResult {
  if (!modeName || !/^[a-z][a-z0-9-]*$/.test(modeName)) {
    throw new Error(`spawnAgentWithMode: invalid modeName ${JSON.stringify(modeName)}`);
  }
  const modePath = path.join(ROOT, 'modes', `${modeName}.md`);
  if (!fs.existsSync(modePath)) {
    throw new Error(`spawnAgentWithMode: mode file not found at ${modePath}`);
  }

  const userId = opts.userId ?? currentUserIdOrDefault();
  const realizedPrompt = realizeModePromptForUser(userId, opts.profileId, modePath);

  // Write to a fresh temp file. UUID prevents collisions when two
  // spawns fire simultaneously.
  const tempPromptPath = path.join(os.tmpdir(), `${BRAND.name}-${modeName}-${randomUUID()}.md`);
  fs.writeFileSync(tempPromptPath, realizedPrompt, 'utf8');

  const env: NodeJS.ProcessEnv = { ...process.env, ...(opts.env ?? {}) };
  // Pass acting userId through so child scripts (generate-pdf.mjs etc.)
  // resolve per-user paths correctly without re-reading AsyncLocalStorage.
  if (userId) env.HERON_USER_ID = userId;

  const args = [
    '-p',
    userMessage,
    '--append-system-prompt-file',
    tempPromptPath,
    ...(opts.extraArgs ?? []),
    '--dangerously-skip-permissions',
  ];

  const spawnOpts: SpawnOptions = {
    cwd: opts.cwd ?? ROOT,
    env,
  };

  let child: ChildProcess;
  try {
    child = spawn(AGENT_CLI, args, spawnOpts);
  } catch (e) {
    // Best-effort cleanup if spawn throws synchronously (rare).
    try {
      fs.unlinkSync(tempPromptPath);
    } catch {
      /* already gone */
    }
    throw e;
  }

  // Cleanup contract: unlink the temp file when the child exits.
  // Listen on both 'exit' AND 'error' so we don't leak temp files
  // if Claude crashes before producing an exit event.
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      fs.unlinkSync(tempPromptPath);
    } catch (e) {
      // The temp dir is typically purged by the OS; we still log so
      // a persistent leak shows up in the activity log.
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        logEvent('spawn-agent', 'temp prompt cleanup failed', {
          level: 'warn',
          category: 'system',
          message: tempPromptPath + ': ' + (e instanceof Error ? e.message : String(e)),
        });
      }
    }
  };
  child.on('exit', cleanup);
  child.on('error', cleanup);

  return { child, tempPromptPath };
}
