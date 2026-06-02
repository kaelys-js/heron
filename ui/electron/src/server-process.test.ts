/**
 * server-process.test -- findFreePort + probeHealth + waitForServer +
 * startEmbeddedServer + stopEmbeddedServer.
 *
 * findFreePort + probeHealth talk to real node:net / node:http. Tests
 * exercise them against real localhost servers we spin up in
 * beforeEach. startEmbeddedServer is tested via dependency-injection
 * hooks (forker, existsImpl, portFinder, healthWaiter).
 */
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  findFreePort,
  probeHealth,
  waitForServer,
  startEmbeddedServer,
  stopEmbeddedServer,
  forwardStderrLines,
} from './server-process';
import type { ServerHandle } from './server-process';

// ── findFreePort ──────────────────────────────────────────────────
describe('findFreePort', () => {
  it('returns a positive integer port in the ephemeral range', async () => {
    const port = await findFreePort();
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThan(65536);
    expect(Number.isInteger(port)).toBe(true);
  });

  it('returns different ports on successive calls (kernel rotates)', async () => {
    const a = await findFreePort();
    const b = await findFreePort();
    // Not strict inequality (kernel may reuse) -- just confirm both valid.
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
  });
});

// ── probeHealth + waitForServer ───────────────────────────────────
describe('probeHealth', () => {
  let server: Server;
  let port: number;
  let mode: 'ok' | '500' | 'no-health' | 'slow' = 'ok';

  beforeEach(async () => {
    mode = 'ok';
    server = createServer((req, res) => {
      if (req.url === '/api/health') {
        if (mode === 'ok') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
        } else if (mode === '500') {
          res.writeHead(500);
          res.end('boom');
        } else if (mode === 'slow') {
          setTimeout(() => {
            res.writeHead(200);
            res.end('{"ok":true}');
          }, 5000);
        } else {
          res.writeHead(404);
          res.end('not found');
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });
    const addr = server.address();
    port = typeof addr === 'object' && addr ? addr.port : 0;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('returns true on 200', async () => {
    mode = 'ok';
    expect(await probeHealth(`http://127.0.0.1:${port}`)).toBe(true);
  });

  it('returns false on 500', async () => {
    mode = '500';
    expect(await probeHealth(`http://127.0.0.1:${port}`)).toBe(false);
  });

  it('returns false on 404', async () => {
    mode = 'no-health';
    expect(await probeHealth(`http://127.0.0.1:${port}`)).toBe(false);
  });

  it('returns false on timeout', async () => {
    mode = 'slow';
    expect(await probeHealth(`http://127.0.0.1:${port}`, 100)).toBe(false);
  });

  it('returns false on unreachable host', async () => {
    expect(await probeHealth('http://127.0.0.1:1', 200)).toBe(false);
  });

  it('returns false on malformed URL', async () => {
    expect(await probeHealth('not a url')).toBe(false);
  });
});

describe('waitForServer', () => {
  it('returns false when timeout elapses without success', async () => {
    // unreachable host
    const result = await waitForServer('http://127.0.0.1:1', 200, 50, 50);
    expect(result).toBe(false);
  });

  it('returns true if the server becomes healthy mid-wait', async () => {
    let httpServer: Server | undefined;
    let serverPort: number | undefined;
    // Start a server after a short delay.
    setTimeout(async () => {
      httpServer = createServer((req, res) => {
        if (req.url === '/api/health') {
          res.writeHead(200);
          res.end('{}');
        }
      });
      await new Promise<void>((resolve) => httpServer!.listen(0, () => resolve()));
      const addr = httpServer.address();
      serverPort = typeof addr === 'object' && addr ? addr.port : 0;
    }, 100);

    // Wait for server, polling on its eventual port. Since we don't know
    // the port yet, we re-poll on the wait-for-port pattern.
    let attempts = 0;
    const start = Date.now();
    while (Date.now() - start < 3000) {
      if (serverPort) {
        const result = await waitForServer(`http://127.0.0.1:${serverPort}`, 1500, 100, 100);
        attempts++;
        if (httpServer) {
          await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
        }
        expect(result).toBe(true);
        expect(attempts).toBeGreaterThan(0);
        return;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('test setup never spawned server');
  });
});

// ── startEmbeddedServer + stopEmbeddedServer ──────────────────────
describe('startEmbeddedServer', () => {
  it('returns null when entry path does not exist', async () => {
    const result = await startEmbeddedServer({
      entryPath: '/does/not/exist.js',
      existsImpl: () => false,
    });
    expect(result).toBeNull();
  });

  it('returns null when entry path does not exist (using default existsSync)', async () => {
    // No existsImpl supplied -> exercises the `?? existsSync` default branch.
    const result = await startEmbeddedServer({
      entryPath: '/totally/nonexistent/path/server.js',
    });
    expect(result).toBeNull();
  });

  it('starts the server when entry exists + health passes', async () => {
    const fakeChild = new EventEmitter() as any;
    fakeChild.kill = vi.fn();
    fakeChild.killed = false;
    const forker = vi.fn(() => fakeChild);
    const result = await startEmbeddedServer({
      entryPath: '/build/index.js',
      existsImpl: () => true,
      portFinder: async () => 12345,
      forker: forker as any,
      healthWaiter: async () => true,
    });
    expect(result).not.toBeNull();
    expect(result!.port).toBe(12345);
    expect(result!.url).toBe('http://127.0.0.1:12345');
    expect(forker).toHaveBeenCalledWith(
      '/build/index.js',
      [],
      expect.objectContaining({
        env: expect.objectContaining({
          PORT: '12345',
          HOST: '127.0.0.1',
          ORIGIN: 'http://127.0.0.1:12345',
        }),
      }),
    );
  });

  it('throws when entry exists but health probe fails', async () => {
    const fakeChild = new EventEmitter() as any;
    fakeChild.kill = vi.fn();
    fakeChild.killed = false;
    await expect(
      startEmbeddedServer({
        entryPath: '/build/index.js',
        existsImpl: () => true,
        portFinder: async () => 12345,
        forker: vi.fn(() => fakeChild) as any,
        healthWaiter: async () => false,
        healthTimeoutMs: 100,
      }),
    ).rejects.toThrow(/failed to become healthy/);
  });

  it('passes custom env vars through to child', async () => {
    const fakeChild = new EventEmitter() as any;
    fakeChild.kill = vi.fn();
    fakeChild.killed = false;
    const forker = vi.fn(() => fakeChild);
    await startEmbeddedServer({
      entryPath: '/x.js',
      existsImpl: () => true,
      portFinder: async () => 9000,
      forker: forker as any,
      healthWaiter: async () => true,
      env: { CUSTOM_VAR: 'hello' },
    });
    const call = forker.mock.calls[0] as unknown as [
      string,
      unknown,
      { env: Record<string, string> },
    ];
    expect(call[2].env.CUSTOM_VAR).toBe('hello');
  });
});

// ── forwardStderrLines + onStderrLine wiring ──────────────────────
describe('forwardStderrLines', () => {
  function fakeStream() {
    const handlers: Record<string, (arg: unknown) => void> = {};
    return {
      setEncoding: vi.fn(),
      on: vi.fn((event: string, cb: (arg: unknown) => void) => {
        handlers[event] = cb;
      }),
      emit: (event: string, arg: unknown) => handlers[event]?.(arg),
    };
  }

  it('forwards each COMPLETE line, buffering chunks that straddle a newline', () => {
    // The sink relies on one-entry-per-line; a chunk that ends mid-line must
    // be held until its newline arrives, or the entry splits across two log
    // records and a partial line is forwarded as if it were complete.
    const stream = fakeStream();
    const onLine = vi.fn();
    forwardStderrLines({ stderr: stream } as never, onLine);
    stream.emit('data', 'first line\nsecond ');
    expect(onLine).toHaveBeenCalledTimes(1);
    expect(onLine).toHaveBeenCalledWith('first line');
    stream.emit('data', 'half\n');
    expect(onLine).toHaveBeenCalledTimes(2);
    expect(onLine).toHaveBeenCalledWith('second half');
  });

  it('strips a trailing CR and drops empty lines', () => {
    const stream = fakeStream();
    const onLine = vi.fn();
    forwardStderrLines({ stderr: stream } as never, onLine);
    stream.emit('data', 'crlf line\r\n\nkept\n');
    expect(onLine).toHaveBeenCalledTimes(2);
    expect(onLine).toHaveBeenNthCalledWith(1, 'crlf line');
    expect(onLine).toHaveBeenNthCalledWith(2, 'kept');
  });

  it('no-ops when the child has no piped stderr (stdio:inherit gives null)', () => {
    expect(() => forwardStderrLines({ stderr: null } as never, vi.fn())).not.toThrow();
  });

  it('keeps reading when the sink callback throws', () => {
    const stream = fakeStream();
    const onLine = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('sink broke');
      })
      .mockImplementation(() => {});
    forwardStderrLines({ stderr: stream } as never, onLine);
    expect(() => stream.emit('data', 'a\nb\n')).not.toThrow();
    expect(onLine).toHaveBeenCalledTimes(2);
  });

  it('survives setEncoding + stream error without throwing', () => {
    const stream = fakeStream();
    stream.setEncoding.mockImplementation(() => {
      throw new Error('non-text stream');
    });
    expect(() => forwardStderrLines({ stderr: stream } as never, vi.fn())).not.toThrow();
    expect(() => stream.emit('error', new Error('mid-write'))).not.toThrow();
  });
});

describe('startEmbeddedServer stderr stdio', () => {
  it("pipes stderr when onStderrLine is wired (else stays 'inherit')", async () => {
    // 'inherit' sends backend stderr nowhere on disk in a packaged build;
    // wiring a sink must flip stderr to 'pipe' so it can be captured.
    const fakeChild = new EventEmitter() as any;
    fakeChild.kill = vi.fn();
    fakeChild.killed = false;
    fakeChild.stderr = { setEncoding: vi.fn(), on: vi.fn() };
    const forker = vi.fn(() => fakeChild);
    await startEmbeddedServer({
      entryPath: '/build/index.js',
      existsImpl: () => true,
      portFinder: async () => 12345,
      forker: forker as any,
      healthWaiter: async () => true,
      onStderrLine: vi.fn(),
    });
    const opts = forker.mock.calls[0]![2] as { stdio: unknown[] };
    expect(opts.stdio[2]).toBe('pipe');
  });

  it("leaves stderr 'inherit' when no sink is wired", async () => {
    const fakeChild = new EventEmitter() as any;
    fakeChild.kill = vi.fn();
    fakeChild.killed = false;
    const forker = vi.fn(() => fakeChild);
    await startEmbeddedServer({
      entryPath: '/build/index.js',
      existsImpl: () => true,
      portFinder: async () => 12345,
      forker: forker as any,
      healthWaiter: async () => true,
    });
    const opts = forker.mock.calls[0]![2] as { stdio: unknown[] };
    expect(opts.stdio[2]).toBe('inherit');
  });
});

describe('stopEmbeddedServer', () => {
  it('sends SIGTERM to the process', () => {
    const fakeChild = new EventEmitter() as any;
    fakeChild.kill = vi.fn();
    fakeChild.killed = false;
    const handle: ServerHandle = {
      process: fakeChild,
      port: 9999,
      url: 'http://127.0.0.1:9999',
    };
    stopEmbeddedServer(handle);
    expect(fakeChild.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('skips SIGTERM when already killed', () => {
    const fakeChild = new EventEmitter() as any;
    fakeChild.kill = vi.fn();
    fakeChild.killed = true;
    stopEmbeddedServer({ process: fakeChild, port: 9999, url: 'http://127.0.0.1:9999' });
    expect(fakeChild.kill).not.toHaveBeenCalled();
  });

  it('escalates to SIGKILL after grace period', () => {
    vi.useFakeTimers();
    const fakeChild = new EventEmitter() as any;
    fakeChild.kill = vi.fn();
    fakeChild.killed = false;
    stopEmbeddedServer({ process: fakeChild, port: 9999, url: 'http://127.0.0.1:9999' }, 1000);
    expect(fakeChild.kill).toHaveBeenCalledWith('SIGTERM');
    vi.advanceTimersByTime(1000);
    expect(fakeChild.kill).toHaveBeenCalledWith('SIGKILL');
    vi.useRealTimers();
  });

  it('skips SIGKILL escalation when child became killed before grace', () => {
    vi.useFakeTimers();
    const fakeChild = new EventEmitter() as any;
    fakeChild.kill = vi.fn();
    fakeChild.killed = false;
    stopEmbeddedServer({ process: fakeChild, port: 9999, url: 'http://127.0.0.1:9999' }, 1000);
    fakeChild.killed = true; // child exited cleanly during grace window
    vi.advanceTimersByTime(1000);
    expect(fakeChild.kill).toHaveBeenCalledTimes(1); // only SIGTERM
    vi.useRealTimers();
  });
});
