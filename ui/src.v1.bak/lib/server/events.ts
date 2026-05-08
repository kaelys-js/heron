import { EventEmitter } from 'node:events';

export type ActivityEvent = {
  ts: number;
  level: 'info' | 'warn' | 'error' | 'success';
  source: string;
  msg: string;
};

class Bus extends EventEmitter {
  private buf: ActivityEvent[] = [];
  private MAX = 500;

  emitEvent(ev: ActivityEvent) {
    this.buf.push(ev);
    if (this.buf.length > this.MAX) this.buf.shift();
    this.emit('event', ev);
  }

  recent(): ActivityEvent[] {
    return [...this.buf];
  }
}

export const bus = new Bus();

export function logEvent(source: string, msg: string, level: ActivityEvent['level'] = 'info') {
  bus.emitEvent({ ts: Date.now(), level, source, msg });
  // also stdout for the dev terminal
  console.log(`[${source}] ${msg}`);
}
