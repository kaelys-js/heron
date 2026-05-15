/**
 * Shared helpers for native/ scripts.
 *
 * All native scripts source the same `step()` for atomic-task banners,
 * `run()` for command execution with structured output, `ask()` for
 * interactive prompts, and `which()` for tool detection.
 */
import { spawn, spawnSync, execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, '..', '..');
export const UI = join(ROOT, 'ui');
export const NATIVE = join(ROOT, 'native');

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';

export const c = {
  bold: (s) => BOLD + s + RESET,
  dim: (s) => DIM + s + RESET,
  green: (s) => GREEN + s + RESET,
  red: (s) => RED + s + RESET,
  yellow: (s) => YELLOW + s + RESET,
  cyan: (s) => CYAN + s + RESET,
  magenta: (s) => MAGENTA + s + RESET,
};

/** Print a step banner. */
export function step(n, label) {
  console.log(`\n${c.cyan('▸')} ${c.bold(`[${n}]`)} ${label}`);
}
export function ok(msg) {
  console.log(`  ${c.green('✓')} ${msg}`);
}
export function warn(msg) {
  console.log(`  ${c.yellow('!')} ${msg}`);
}
export function fail(msg) {
  console.log(`  ${c.red('✗')} ${msg}`);
}
export function info(msg) {
  console.log(`  ${c.dim(msg)}`);
}

/** Run a command, throwing on non-zero. Use for blocking subprocesses. */
export function run(cmd, args, opts = {}) {
  const cwd = opts.cwd ?? ROOT;
  info(`$ ${cmd} ${args.join(' ')}  ${c.dim('in ' + cwd.replace(ROOT, '.'))}`);
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: opts.silent ? 'pipe' : 'inherit',
    env: { ...process.env, ...(opts.env ?? {}) },
    shell: opts.shell ?? false,
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    if (opts.allowFail) {
      warn(`(exit ${res.status}, continuing — allowFail)`);
      return res;
    }
    fail(`exit ${res.status} — ${cmd} ${args.join(' ')}`);
    if (opts.silent && res.stderr) console.error(res.stderr);
    process.exit(res.status ?? 1);
  }
  return res;
}

/** Run two commands in parallel, both stdio inherited. */
export function runParallel(cmds) {
  return new Promise((resolve, reject) => {
    let remaining = cmds.length;
    let failed = false;
    const children = cmds.map(({ cmd, args, cwd, label }) => {
      info(`$ ${label ?? cmd + ' ' + args.join(' ')}`);
      const child = spawn(cmd, args, {
        cwd: cwd ?? ROOT,
        stdio: 'inherit',
        env: process.env,
      });
      child.on('exit', (code) => {
        remaining--;
        if (code !== 0 && !failed) {
          failed = true;
          children.forEach((c) => {
            try {
              c.kill('SIGTERM');
            } catch {}
          });
          reject(new Error(`${label ?? cmd} exited ${code}`));
        }
        if (remaining === 0 && !failed) resolve();
      });
      return child;
    });
    // Ctrl+C: relay to all children.
    process.on('SIGINT', () => {
      children.forEach((c) => {
        try {
          c.kill('SIGTERM');
        } catch {}
      });
    });
  });
}

/** Run command and capture stdout. Returns string. Errors throw. */
export function capture(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...(opts.env ?? {}) },
  });
  if (res.status !== 0 && !opts.allowFail) {
    throw new Error(`${cmd} ${args.join(' ')} failed: ${res.stderr}`);
  }
  return (res.stdout ?? '').trim();
}

/** Test if a binary is on PATH. */
export function which(bin) {
  try {
    execSync(`command -v ${bin}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** Prompt the user for a value. Optionally hidden (for passwords). */
export async function ask(prompt, { hidden = false, default: def } = {}) {
  const rl = readline.createInterface({ input, output, terminal: true });
  const promptText = def ? `${prompt} ${c.dim('(' + def + ')')}: ` : `${prompt}: `;
  if (hidden) {
    // Simple hidden read: write prompt, mute echo, read line, restore.
    process.stdout.write(promptText);
    process.stdin.setRawMode?.(true);
    const buf = [];
    return await new Promise((resolve) => {
      const onData = (ch) => {
        const s = ch.toString();
        if (s === '\r' || s === '\n' || s === '') {
          process.stdout.write('\n');
          process.stdin.setRawMode?.(false);
          process.stdin.removeListener('data', onData);
          process.stdin.pause();
          rl.close();
          resolve(buf.join('') || def || '');
        } else if (s === '') {
          // Ctrl+C
          process.stdout.write('\n');
          process.stdin.setRawMode?.(false);
          process.exit(130);
        } else if (s === '' || s === '\b') {
          if (buf.length > 0) {
            buf.pop();
            process.stdout.write('\b \b');
          }
        } else {
          buf.push(s);
          process.stdout.write('*');
        }
      };
      process.stdin.on('data', onData);
      process.stdin.resume();
    });
  }
  const v = await rl.question(promptText);
  rl.close();
  return v || def || '';
}

/** y/n prompt. Defaults to provided default if empty. */
export async function confirm(prompt, defaultYes = true) {
  const opt = defaultYes ? '[Y/n]' : '[y/N]';
  const a = await ask(`${prompt} ${opt}`);
  if (!a) return defaultYes;
  return /^y(es)?$/i.test(a.trim());
}

/** Read the brand name from branding/brand.json. Used to derive
 *  user-facing names (state dirs, banners) so a rebrand doesn't
 *  leave stale "heron" strings scattered through native scripts. */
function brandName() {
  try {
    const brand = JSON.parse(
      readFileSync(join(__dirname, '..', '..', 'branding', 'brand.json'), 'utf8'),
    );
    return brand.name || 'heron';
  } catch {
    return 'heron';
  }
}

/** Per-user state dir for native build secrets (Apple cert env, etc.).
 *  Lives at ~/.{brand.name}/ so a rebrand redirects cleanly. */
export const NATIVE_STATE_DIR = join(process.env.HOME || '', '.' + brandName());
export const NATIVE_ENV_FILE = join(NATIVE_STATE_DIR, 'native-env');

/** Stash a small bit of state across script invocations (avoid re-prompting
 *  for things the user just typed). Stored at ~/.{brand.name}/native-state.json. */
const STATE_DIR = NATIVE_STATE_DIR;
const STATE_FILE = join(STATE_DIR, 'native-state.json');
export function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}
export function writeState(state) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch {}
}

/** Open a URL in the default browser (for "go to appleid.apple.com" prompts). */
export function openUrl(url) {
  try {
    execSync(`open "${url}"`, { stdio: 'ignore' });
  } catch {
    info(`(couldn't open browser — visit ${url} manually)`);
  }
}
