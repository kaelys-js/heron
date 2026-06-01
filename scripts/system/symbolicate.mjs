#!/usr/bin/env node
/**
 * symbolicate.mjs -- offline support tool that turns a minified client stack
 * into a legible one using the build's `.js.map` files. Maps NEVER ship to
 * browsers; a persisted client error carries the build id (the telemetry
 * handler folds `<version>+<build>` into the stack), so support recovers the
 * matching build's maps locally and runs this.
 *
 *   node scripts/system/symbolicate.mjs --maps ui/build/client < stack.txt
 *   node scripts/system/symbolicate.mjs --file stack.txt --maps ui/build/client
 *
 * Reads the stack from --file or stdin. Each `…/file.js:LINE:COL` frame is
 * rewritten to `originalSource:functionName:LINE:COL`; a frame whose map is
 * missing / unmappable is passed through unchanged so the output is never worse
 * than the input. A leading `build: <id>` marker (prepended by the telemetry
 * handler) is recognised + echoed.
 *
 * Exit codes follow scripts/README.md: 0 = produced output; 2 = setup error
 * (maps dir missing, no input).
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { SourceMapConsumer } from 'source-map';
import { error } from '../lib/logger.mjs';

// ── Frame parsing ─────────────────────────────────────────────────

/** Pull the file basename + 1-based line + 0-based-ish column out of one stack
 *  frame. Handles both `at fn (https://h/_app/x.abcd.js:1:50)` and the bare
 *  `https://h/_app/x.abcd.js:1:50` form. Returns null when the line carries no
 *  recognisable position (e.g. a `build:` marker or a blank line). */
export function parseFrame(line) {
  // `…/<name>.js:<line>:<col>` -- the trailing position is what V8/JSC emit.
  const m = line.match(/((?:[\w.-]+\/)*([\w.-]+\.js)):(\d+):(\d+)/);
  if (!m) {
    return null;
  }
  return {
    url: m[1],
    file: m[2],
    line: Number(m[3]),
    // Browser columns are 1-based; source-map expects 0-based. Clamp at 0 so a
    // column of 0 (some engines) doesn't underflow to -1.
    column: Math.max(0, Number(m[4]) - 1),
    raw: m[0],
  };
}

// ── Map lookup ────────────────────────────────────────────────────

/** Index every `*.js.map` under `dir` (recursively) by the `.js` basename it
 *  maps -- e.g. `42.xhTmv6LA.js -> /abs/.../42.xhTmv6LA.js.map`. SvelteKit's
 *  hashed chunk names are unique, so the basename is a safe key. */
export function indexMaps(dir) {
  const byJs = new Map();
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.js.map')) {
        byJs.set(entry.name.slice(0, -'.map'.length), full);
      }
    }
  };
  walk(dir);
  return byJs;
}

// ── Symbolication ─────────────────────────────────────────────────

/** Rewrite one minified frame to `original:function:line:col` using the map
 *  consumer. Returns the original `raw` text on any miss so output never
 *  regresses. `consumerFor(file)` returns a loaded SourceMapConsumer or null. */
export async function symbolicateFrame(frame, consumerFor) {
  const consumer = await consumerFor(frame.file);
  if (!consumer) {
    return frame.raw;
  }
  const pos = consumer.originalPositionFor({ line: frame.line, column: frame.column });
  if (!pos || pos.line == null) {
    return frame.raw;
  }
  const name = pos.name ?? '<anonymous>';
  // Re-emit columns 1-based to match how browsers print them.
  return `${pos.source}:${name}:${pos.line}:${(pos.column ?? 0) + 1}`;
}

/** Symbolicate a whole stack. `mapsDir` holds the build's `.js.map` files.
 *  Frames without a position (the `build:` marker, the `Error: msg` head) pass
 *  through verbatim. Consumers are cached + destroyed after the run. */
export async function symbolicateStack(stack, mapsDir) {
  const index = indexMaps(mapsDir);
  const consumers = new Map();
  const consumerFor = async (file) => {
    if (consumers.has(file)) {
      return consumers.get(file);
    }
    const mapPath = index.get(file);
    if (!mapPath) {
      consumers.set(file, null);
      return null;
    }
    const raw = readFileSync(mapPath, 'utf8');
    // SourceMapConsumer.with destroys the consumer when its callback resolves;
    // we want to keep it for the whole stack, so build a long-lived one and
    // destroy them all at the end.
    const consumer = await new SourceMapConsumer(raw);
    consumers.set(file, consumer);
    return consumer;
  };

  const out = [];
  for (const rawLine of stack.split('\n')) {
    const frame = parseFrame(rawLine);
    if (!frame) {
      out.push(rawLine);
      continue;
    }
    const mapped = await symbolicateFrame(frame, consumerFor);
    // Preserve the surrounding `    at … (` decoration -- only swap the position
    // token so the call-site prefix the engine printed survives.
    out.push(rawLine.replace(frame.raw, mapped));
  }

  for (const c of consumers.values()) {
    if (c) {
      c.destroy();
    }
  }
  return out.join('\n');
}

// ── CLI ───────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { maps: 'ui/build/client', file: null, build: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--maps') {
      args.maps = argv[++i];
    } else if (a === '--file') {
      args.file = argv[++i];
    } else if (a === '--build') {
      args.build = argv[++i];
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(args.maps) || !statSync(args.maps).isDirectory()) {
    error(`maps directory not found: ${args.maps}`, { file: 'scripts/system/symbolicate.mjs' });
    process.exit(2);
  }
  let stack;
  if (args.file) {
    stack = readFileSync(args.file, 'utf8');
  } else {
    stack = readFileSync(0, 'utf8'); // stdin
  }
  if (!stack.trim()) {
    error('no stack provided (pass --file or pipe via stdin)');
    process.exit(2);
  }
  const out = await symbolicateStack(stack, args.maps);
  process.stdout.write(out.endsWith('\n') ? out : `${out}\n`);
}

// Only run the CLI when invoked directly, so the test file can import the pure
// helpers without triggering stdin reads.
if (basename(process.argv[1] ?? '') === 'symbolicate.mjs') {
  await main();
}
