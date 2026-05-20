import fs from 'node:fs';
import dotenv from 'dotenv';
import { ENV_FILE } from './files';

export function loadEnv() {
  if (fs.existsSync(ENV_FILE)) {
    dotenv.config({ path: ENV_FILE, override: false });
  }
}

export type EnvVars = {
  GEMINI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  ADZUNA_APP_ID?: string;
  ADZUNA_APP_KEY?: string;
  // Gmail IMAP -- populated by the /sources page's Gmail Connect form,
  // consumed by scan-email-imap.mjs. Plain-text in .env (per user choice
  // for simplest auth). Removed by the Disconnect endpoint.
  GMAIL_IMAP_HOST?: string;
  GMAIL_IMAP_USER?: string;
  GMAIL_IMAP_PASSWORD?: string;
  GMAIL_IMAP_LABEL?: string;
};

const KEYS: (keyof EnvVars)[] = [
  'GEMINI_API_KEY',
  'ANTHROPIC_API_KEY',
  'ADZUNA_APP_ID',
  'ADZUNA_APP_KEY',
  'GMAIL_IMAP_HOST',
  'GMAIL_IMAP_USER',
  'GMAIL_IMAP_PASSWORD',
  'GMAIL_IMAP_LABEL',
];

export function readEnv(): EnvVars {
  const out: EnvVars = {};
  for (const k of KEYS) {
    const v = process.env[k];
    if (v) out[k] = v;
  }
  return out;
}

export function readEnvMasked(): Record<string, string> {
  const out: Record<string, string> = {};
  const e = readEnv();
  for (const k of KEYS) {
    const v = e[k];
    if (!v) out[k] = '';
    else if (v.length < 8) out[k] = '****';
    else out[k] = '****' + v.slice(-4);
  }
  return out;
}

export function writeEnv(updates: Partial<EnvVars>) {
  let existing: Record<string, string> = {};
  // CodeQL js/file-system-race: read directly and treat ENOENT as empty
  // rather than racing existsSync against the subsequent read.
  let txt: string | null = null;
  try {
    txt = fs.readFileSync(ENV_FILE, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  if (txt !== null) {
    for (const line of txt.split('\n')) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
      if (m) existing[m[1]] = m[2];
    }
  }
  for (const [k, v] of Object.entries(updates)) {
    if (v && v.trim() && !v.startsWith('****')) {
      existing[k] = v.trim();
      process.env[k] = v.trim();
    } else if (v === '') {
      delete existing[k];
      delete process.env[k];
    }
  }
  const out =
    Object.entries(existing)
      .map(([k, v]) => k + '=' + v)
      .join('\n') + '\n';
  fs.writeFileSync(ENV_FILE, out);
}
