import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { ActivityEvent, EventLevel, EventCategory } from '$lib/types';
import { ROOT } from './files';

const LOG_FILE = path.join(ROOT, 'data', 'activity.jsonl');
const MAX_BUFFER = 500;

class Bus extends EventEmitter {
  private buf: ActivityEvent[] = [];

  constructor() {
    super();
    this.loadFromDisk();
  }

  private loadFromDisk() {
    try {
      if (!fs.existsSync(LOG_FILE)) return;
      const txt = fs.readFileSync(LOG_FILE, 'utf8');
      const lines = txt.trim().split('\n').slice(-MAX_BUFFER);
      for (const line of lines) {
        if (!line) continue;
        try {
          const ev = JSON.parse(line);
          if (ev.id && ev.ts) this.buf.push(ev);
        } catch {}
      }
    } catch (e) {
      console.error('[events] failed to load', e);
    }
  }

  private appendToDisk(ev: ActivityEvent) {
    try {
      fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
      fs.appendFileSync(LOG_FILE, JSON.stringify(ev) + '\n');
    } catch (e) {
      console.error('[events] failed to persist', e);
    }
  }

  emitEvent(ev: ActivityEvent) {
    this.buf.push(ev);
    if (this.buf.length > MAX_BUFFER) this.buf.shift();
    this.appendToDisk(ev);
    this.emit('event', ev);
  }

  recent(): ActivityEvent[] {
    return [...this.buf];
  }

  clear() {
    this.buf = [];
    try {
      fs.writeFileSync(LOG_FILE, '');
    } catch {}
  }
}

export const bus = new Bus();

export function logEvent(
  source: string,
  title: string,
  opts: {
    level?: EventLevel;
    category?: EventCategory;
    message?: string;
    link?: string;
    stack?: string;
  } = {}
): ActivityEvent {
  const ev: ActivityEvent = {
    id: crypto.randomBytes(6).toString('hex'),
    ts: Date.now(),
    level: opts.level ?? 'info',
    category: opts.category ?? 'system',
    source,
    title,
    message: opts.message,
    link: opts.link,
    stack: opts.stack,
  };
  bus.emitEvent(ev);
  const prefix = ev.level === 'error' ? '✗' : ev.level === 'warn' ? '⚠' : ev.level === 'success' ? '✓' : 'ℹ';
  const head = prefix + ' [' + source + '] ' + title + (opts.message ? ' — ' + opts.message : '');
  if (ev.level === 'error') {
    // For errors: log via console.error so they hit stderr + show as red in node
    console.error(head);
    if (opts.stack) console.error(opts.stack);
  } else {
    console.log(head);
  }
  return ev;
}

/**
 * Single shared server-side error reporter. Always logs the full error to stdout/stderr
 * with stack trace, AND emits an event so the client UI (toast + activity feed) sees it.
 * Use from hooks.server.ts, api wrap(), spawned-process handlers, etc.
 */
export function reportServerError(
  source: string,
  title: string,
  err: unknown,
  opts: { category?: EventCategory; link?: string } = {},
): ActivityEvent {
  const isError = err instanceof Error;
  const message = isError ? err.message : typeof err === 'string' ? err : (() => {
    try { return JSON.stringify(err); } catch { return String(err); }
  })();
  const stack = isError && err.stack ? err.stack.slice(0, 2000) : undefined;
  return logEvent(source, title, {
    level: 'error',
    category: opts.category ?? 'system',
    message,
    link: opts.link,
    stack,
  });
}
