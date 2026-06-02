/** Embedded SvelteKit server lifecycle. Extracted from index.ts so the
 *  process-spawn + health-probe logic is unit-testable without
 *  requiring an actual Electron app.
 *
 *  The Electron main process spawns SvelteKit's adapter-node output on
 *  a random free port, advertises it via mDNS, and waits for
 *  /api/health before showing the BrowserWindow. */
import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { existsSync } from 'node:fs';

export type ServerHandle = {
  process: ChildProcess;
  port: number;
  url: string;
};

/**
 * Find a free TCP port the kernel will let us bind to. Asks the OS
 * for port 0 (any), reads back what was assigned, then closes.
 */
export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, () => {
      // .listen(0) always assigns a port on success. address() returns
      // the AddressInfo object (typeof 'object') with .port set. The
      // null / string branches only arise before listen completes or
      // for unix-socket servers -- neither applies here.
      const addr = srv.address() as { port: number };
      srv.close(() => resolve(addr.port));
    });
  });
}

/**
 * Probe a URL -- returns true if /api/health returns 2xx within timeoutMs.
 *
 * @param url - the base URL (e.g. http://127.0.0.1:54321)
 * @param timeoutMs - how long to wait for the response
 */
export function probeHealth(url: string, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    let u: URL;
    try {
      u = new URL('/api/health', url);
    } catch {
      resolve(false);
      return;
    }
    const req = httpRequest(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: 'GET',
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        resolve(status >= 200 && status < 300);
        res.resume();
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

/**
 * Poll /api/health until it answers OR we hit the timeout. Used by the
 * Electron bootstrap to gate BrowserWindow creation behind a healthy
 * backend.
 */
export async function waitForServer(
  url: string,
  timeoutMs = 15_000,
  pollIntervalMs = 250,
  probeTimeoutMs = 500,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probeHealth(url, probeTimeoutMs)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  return false;
}

export type ServerStartOptions = {
  /** Path to the SvelteKit adapter-node build entry (build/index.js). */
  entryPath: string;
  /** Optional env vars to pass to the child process (merged on top of process.env). */
  env?: Record<string, string>;
  /** How long to wait for /api/health (default 15s). */
  healthTimeoutMs?: number;
  /** Optional override for the child-process forker (test hook). */
  forker?: typeof fork;
  /** Optional override for fs.existsSync (test hook). */
  existsImpl?: typeof existsSync;
  /** Optional override for findFreePort (test hook). */
  portFinder?: () => Promise<number>;
  /** Optional override for waitForServer (test hook). */
  healthWaiter?: (url: string, timeoutMs?: number) => Promise<boolean>;
  /** Sink for the child's stderr. Each complete line is forwarded here.
   *  The caller (index.ts) wires this to the main-process log sink so the
   *  embedded server's stderr survives in a packaged build (where there's
   *  no terminal). Omit to drop stderr (the prior stdio:'inherit' default,
   *  used by tests that don't assert on backend output). */
  onStderrLine?: (line: string) => void;
};

/**
 * Buffer a child's piped stderr and forward each COMPLETE line to onLine.
 * Splitting on newlines keeps the sink's one-entry-per-line invariant even
 * when a chunk straddles a line boundary. Fully guarded -- a stream error
 * (child died mid-write) must not throw out of the spawn path.
 */
export function forwardStderrLines(child: ChildProcess, onLine: (line: string) => void): void {
  const stream = child.stderr;
  if (!stream) {
    return;
  }
  let buffer = '';
  try {
    stream.setEncoding('utf8');
  } catch {
    /* non-text stream -- skip capture rather than throw */
  }
  stream.on('data', (chunk: string) => {
    buffer += chunk;
    let nl = buffer.indexOf('\n');
    while (nl !== -1) {
      const line = buffer.slice(0, nl).replace(/\r$/, '');
      buffer = buffer.slice(nl + 1);
      if (line.length > 0) {
        try {
          onLine(line);
        } catch {
          /* a misbehaving sink must not kill the stderr reader */
        }
      }
      nl = buffer.indexOf('\n');
    }
  });
  stream.on('error', () => {
    /* the process 'exit' handler reports the failure code separately */
  });
}

/**
 * Spawn the embedded Node server. Returns a ServerHandle on success.
 * Returns null when the entry doesn't exist (caller may fall back to
 * resolver-based discovery).
 *
 * Throws if the server starts but fails to become healthy.
 */
export async function startEmbeddedServer(opts: ServerStartOptions): Promise<ServerHandle | null> {
  const exists = opts.existsImpl ?? existsSync;
  if (!exists(opts.entryPath)) {
    return null;
  }

  const portFinder = opts.portFinder ?? findFreePort;
  const forker = opts.forker ?? fork;
  const waiter = opts.healthWaiter ?? waitForServer;
  const port = await portFinder();
  const url = `http://127.0.0.1:${port}`;

  // stderr: 'pipe' (not 'inherit') ONLY when a sink is wired, so the child's
  // stderr can be captured into the main-process log file -- a packaged build
  // has no terminal, so an inherited stderr goes nowhere on disk and a backend
  // crash leaves no trace. Without a sink, fall back to 'inherit' (the prior
  // behaviour the tests rely on).
  const captureStderr = !!opts.onStderrLine;
  const child = forker(opts.entryPath, [], {
    env: {
      ...process.env,
      ...(opts.env ?? {}),
      PORT: String(port),
      HOST: '127.0.0.1',
      ORIGIN: url,
    },
    silent: false,
    stdio: ['ignore', 'inherit', captureStderr ? 'pipe' : 'inherit', 'ipc'],
  });

  if (captureStderr) {
    forwardStderrLines(child, opts.onStderrLine!);
  }

  const healthy = await waiter(url, opts.healthTimeoutMs ?? 15_000);
  if (!healthy) {
    throw new Error(`Embedded server failed to become healthy at ${url} within timeout`);
  }
  return { process: child, port, url };
}

/**
 * Terminate a server process. Sends SIGTERM, then SIGKILL after
 * killGraceMs if still running.
 */
export function stopEmbeddedServer(handle: ServerHandle, killGraceMs = 2_000): void {
  if (handle.process.killed) {
    return;
  }
  handle.process.kill('SIGTERM');
  setTimeout(() => {
    if (!handle.process.killed) {
      handle.process.kill('SIGKILL');
    }
  }, killGraceMs);
}
