#!/usr/bin/env node
/**
 * extract-openapi.mjs -- generate a minimal OpenAPI 3.1 fragment from
 * the SvelteKit API routes under `ui/src/routes/api/**`.
 *
 * The fragment is the input to oasdiff -- we run extract on both BASE
 * and HEAD, diff the two specs, and emit the breaking-changes report
 * the heron-pr-api sticky consumes.
 *
 * Scope: this extractor is intentionally lean. It captures the route
 * surface (path + methods + whether each method exists) so oasdiff can
 * flag added / removed endpoints. Deeper inference (parameter shapes,
 * response schemas) would need Zod schema mining or runtime
 * inspection; we don't attempt that here. Adding new endpoints +
 * removing existing ones IS the primary "breaking change" signal we
 * want flagged.
 *
 * Usage:
 *   node extract-openapi.mjs [--root <repo-root>] [--out openapi.json]
 *
 * Output shape (OpenAPI 3.1 subset):
 *   {
 *     "openapi": "3.1.0",
 *     "info": { "title": "Heron API", "version": "1.0.0" },
 *     "paths": {
 *       "/api/foo": { "get": { ... }, "post": { ... } },
 *       "/api/foo/{id}": { "get": { ... } }
 *     }
 *   }
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: opts } = parseArgs({
  options: {
    root: { type: 'string', default: process.cwd() },
    out: { type: 'string' },
  },
});

const ROOT = path.resolve(opts.root);
const ROUTES_DIR = path.join(ROOT, 'ui', 'src', 'routes', 'api');

/** Walk a directory recursively, yielding +server.{ts,mjs,js} files. */
function* walkRoutes(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      yield* walkRoutes(full);
    } else if (/^\+server\.(ts|mjs|js)$/.test(ent.name)) {
      yield full;
    }
  }
}

/** Convert a SvelteKit route file path to an OpenAPI path expression.
 *  Examples:
 *    ui/src/routes/api/foo/+server.ts            -> /api/foo
 *    ui/src/routes/api/foo/[id]/+server.ts       -> /api/foo/{id}
 *    ui/src/routes/api/job/[id]/cv/+server.ts    -> /api/job/{id}/cv
 *    ui/src/routes/api/[...rest]/+server.ts      -> /api/{rest}
 */
function pathFromFile(absFile) {
  const rel = path.relative(path.join(ROOT, 'ui', 'src', 'routes'), absFile);
  const dir = path.dirname(rel); // drop the +server filename
  return (
    '/' +
    dir
      .split(path.sep)
      .map((seg) => {
        // [id] -> {id}; [...rest] -> {rest}
        const m = seg.match(/^\[(\.\.\.)?(.+)\]$/);
        if (m) return `{${m[2]}}`;
        return seg;
      })
      .join('/')
  );
}

/** Extract HTTP methods + brief description from a +server file's source. */
function extractMethods(src) {
  const out = {};
  // SvelteKit handlers: `export const GET = ...`, `export async function POST(...)`, etc.
  const methodRe =
    /export\s+(?:async\s+)?(?:const|function)\s+(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\b/g;
  const found = new Set();
  let m;
  while ((m = methodRe.exec(src))) {
    found.add(m[1].toUpperCase());
  }
  // Top-of-file JSDoc/comment as description (first /** ... */ block).
  const docMatch = src.match(/\/\*\*([\s\S]*?)\*\//);
  const description = docMatch
    ? docMatch[1]
        .split('\n')
        .map((l) => l.replace(/^[\s*]+/, '').trim())
        .filter(Boolean)
        .join(' ')
        .slice(0, 200)
    : undefined;
  for (const verb of found) {
    out[verb.toLowerCase()] = {
      summary: `${verb} ${'route'}`,
      ...(description ? { description } : {}),
      responses: { 200: { description: 'OK' } },
    };
  }
  return out;
}

function main() {
  const paths = {};
  for (const file of walkRoutes(ROUTES_DIR)) {
    const url = pathFromFile(file);
    const src = fs.readFileSync(file, 'utf8');
    const methods = extractMethods(src);
    if (Object.keys(methods).length === 0) continue;
    // Merge if multiple files contribute (rare but possible for index
    // routes vs nested catch-alls).
    paths[url] = { ...(paths[url] || {}), ...methods };
  }

  const spec = {
    openapi: '3.1.0',
    info: { title: 'Heron API', version: '1.0.0' },
    paths,
  };
  const out = JSON.stringify(spec, null, 2);
  if (opts.out) {
    fs.writeFileSync(opts.out, out);
    console.error(`Wrote ${Object.keys(paths).length} path(s) to ${opts.out}`);
  } else {
    process.stdout.write(out);
    process.stdout.write('\n');
  }
}

main();
