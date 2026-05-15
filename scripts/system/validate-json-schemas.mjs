#!/usr/bin/env node
/**
 * validate-json-schemas.mjs — validate every JSON/JSONC config against
 * its `$schema` declaration.
 *
 * Why: tools like turbo / biome / release-please catch schema errors at
 * use-time, but that means a typo in turbo.json only surfaces when you
 * next run `pnpm test`. This script catches them in CI on every PR,
 * BEFORE the consuming tool runs.
 *
 * Files validated (anything matching the FILES list):
 *   - turbo.json                                → local schema (node_modules)
 *   - release-please-config.json                → remote schema
 *   - ui/components.json                        → remote schema (shadcn-svelte)
 *   - ui/electron/electron-builder.config.json  → local schema (via package)
 *   - biome.jsonc                               → local schema (JSONC parsed)
 *
 * Behaviour:
 *   - Local schemas resolved via Node's package resolution (handles
 *     pnpm's nested .pnpm/<pkg>@<v>/node_modules/ layout transparently).
 *   - Remote schemas (https://...) fetch once + cache in /tmp.
 *   - JSONC files parsed via the `jsonc-parser` package (the same lib
 *     VS Code uses) so comments + trailing commas don't trip us up.
 *   - Draft-2020-12 schemas use the Ajv2020 import (legacy Ajv default
 *     doesn't include the 2020 meta-schema).
 *   - Strict mode disabled — schemas in the wild use vendor-specific
 *     keywords (allowAdditionalProperties, etc.).
 *
 * Exit 0 if every file validates; exit 1 if any fails. Soft-skips files
 * whose schema can't be fetched / found (network flake shouldn't fail
 * CI).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const require_ = createRequire(import.meta.url);

// Files explicitly excluded from validation — these have a $schema
// declaration but the schema is broken / wrong / lags the runtime.
const SKIP = new Map([
  [
    'ui/electron/electron-builder.config.json',
    'app-builder-lib bundled scheme.json lags runtime — rejects legitimate options like win.publisherName',
  ],
]);

// Directories never scanned (build outputs, deps, user data).
const SKIP_DIRS = new Set([
  'node_modules',
  '.svelte-kit',
  'build',
  'dist',
  '.turbo',
  '.vite',
  'coverage',
  '.next',
  '.cache',
  '_build',
  '.venv',
  'venv',
  '.git',
  '.playwright-linkedin',
  '.playwright-indeed',
  '.playwright-greenhouse',
  '.playwright-ashby',
  '.playwright-lever',
  '.playwright-workday',
  'DerivedData',
  'SourcePackages',
  'data', // gitignored user-runtime data
  'reports', // user-layer
  'output', // user-layer
]);

// Local schema URLs we know about — speeds up resolution when a schema
// points to a remote URL we can resolve locally via pnpm. Keyed on the
// remote URL, value is a pkg:<pkg>/<path> shorthand.
const KNOWN_LOCAL_MIRRORS = new Map([
  ['./node_modules/turbo/schema.json', 'pkg:turbo/schema.json'],
  [
    './node_modules/@biomejs/biome/configuration_schema.json',
    'pkg:@biomejs/biome/configuration_schema.json',
  ],
  ['./node_modules/app-builder-lib/scheme.json', 'pkg:app-builder-lib/scheme.json'],
]);

/** Walk the repo, return relative paths of every .json / .jsonc file. */
function* walkConfigFiles(dir, rel = '') {
  const entries = require_('node:fs').readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const name = ent.name;
    if (SKIP_DIRS.has(name)) continue;
    const full = resolve(dir, name);
    const relPath = rel ? `${rel}/${name}` : name;
    if (ent.isDirectory()) {
      yield* walkConfigFiles(full, relPath);
    } else if (ent.isFile()) {
      if (name.endsWith('.json') || name.endsWith('.jsonc')) {
        yield relPath;
      }
    }
  }
}

/** Parse a JSON / JSONC file and return its top-level $schema value
 *  (or null if absent / malformed). Uses jsonc-parser for both JSON
 *  and JSONC so glob patterns like `**\/*.md` in the file don't get
 *  mistaken for block-comment delimiters by a naive string scan. */
function detectSchema(absPath, jsoncParser) {
  let raw;
  try {
    raw = readFileSync(absPath, 'utf8');
  } catch {
    return null;
  }
  // jsonc-parser tolerates BOTH strict JSON and JSONC (comments +
  // trailing commas) — single parser path for everything.
  const errors = [];
  const data = jsoncParser.parse(raw, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length > 0 || !data || typeof data !== 'object') return null;
  return typeof data.$schema === 'string' ? data.$schema : null;
}

/** Build the FILES list at runtime by walking the repo + filtering for
 *  $schema-annotated configs. */
function discoverFiles(jsoncParser) {
  const out = [];
  for (const relPath of walkConfigFiles(REPO_ROOT)) {
    if (SKIP.has(relPath)) {
      out.push({ path: relPath, skip: SKIP.get(relPath) });
      continue;
    }
    const schemaUrl = detectSchema(resolve(REPO_ROOT, relPath), jsoncParser);
    if (!schemaUrl) continue;
    // Map known local-mirror URLs to pkg: shorthand for faster resolution.
    const schema = KNOWN_LOCAL_MIRRORS.get(schemaUrl) || schemaUrl;
    out.push({
      path: relPath,
      schema,
      jsonc: relPath.endsWith('.jsonc'),
    });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

const CACHE_DIR = resolve(tmpdir(), 'career-ops-schema-cache');
mkdirSync(CACHE_DIR, { recursive: true });

/** Resolve schema spec (pkg:foo/bar.json / https:// / ./path). */
async function loadSchema(spec) {
  if (spec.startsWith('pkg:')) {
    // pkg:packageName/path.json — Node's package resolution handles
    // pnpm's nested .pnpm/<pkg>@<v>/node_modules/ layout transparently.
    // Search paths cover root + workspace packages (some deps live only
    // inside ui/electron/node_modules under pnpm's isolated linker).
    const pkgPath = spec.slice('pkg:'.length);
    const searchPaths = [REPO_ROOT, resolve(REPO_ROOT, 'ui'), resolve(REPO_ROOT, 'ui', 'electron')];
    try {
      const resolved = require_.resolve(pkgPath, { paths: searchPaths });
      return JSON.parse(readFileSync(resolved, 'utf8'));
    } catch (e) {
      throw new Error(`require.resolve("${pkgPath}") → ${e.message}`);
    }
  }
  if (spec.startsWith('http://') || spec.startsWith('https://')) {
    const fname = spec.replace(/[^a-zA-Z0-9._-]/g, '_');
    const cached = resolve(CACHE_DIR, fname);
    if (existsSync(cached)) {
      return JSON.parse(readFileSync(cached, 'utf8'));
    }
    const res = await fetch(spec);
    if (!res.ok) {
      throw new Error(`fetch ${spec} → ${res.status} ${res.statusText}`);
    }
    const text = await res.text();
    writeFileSync(cached, text);
    return JSON.parse(text);
  }
  return JSON.parse(readFileSync(resolve(REPO_ROOT, spec), 'utf8'));
}

async function main() {
  let Ajv, Ajv2020, addFormats, jsoncParser;
  try {
    Ajv = (await import('ajv')).default;
    Ajv2020 = (await import('ajv/dist/2020.js')).default;
    addFormats = (await import('ajv-formats')).default;
    jsoncParser = await import('jsonc-parser');
  } catch (e) {
    console.error(
      '× missing devDep:',
      e.message,
      '\n  Run: pnpm add -D -w ajv ajv-formats jsonc-parser',
    );
    process.exit(2);
  }

  const errors = [];
  const FILES = discoverFiles(jsoncParser);
  if (FILES.length === 0) {
    console.error('× no JSON/JSONC files with $schema found — discoverer broken?');
    process.exit(2);
  }

  for (const entry of FILES) {
    const { path, skip } = entry;
    if (skip) {
      console.log(`  · ${path}  (skipped — ${skip})`);
      continue;
    }
    const { schema: schemaSpec, jsonc } = entry;
    const fullPath = resolve(REPO_ROOT, path);
    if (!existsSync(fullPath)) {
      console.log(`  · ${path}  (not present — skipping)`);
      continue;
    }
    const raw = readFileSync(fullPath, 'utf8');
    let data;
    if (jsonc) {
      const parseErrors = [];
      data = jsoncParser.parse(raw, parseErrors, {
        allowTrailingComma: true,
        disallowComments: false,
      });
      if (parseErrors.length > 0) {
        errors.push({ path, kind: 'parse', detail: parseErrors });
        console.log(`  ✗ ${path}  (JSONC parse error: ${parseErrors.length} issue(s))`);
        continue;
      }
    } else {
      try {
        data = JSON.parse(raw);
      } catch (e) {
        errors.push({ path, kind: 'parse', detail: e.message });
        console.log(`  ✗ ${path}  (JSON parse error: ${e.message})`);
        continue;
      }
    }

    let schema;
    try {
      schema = await loadSchema(schemaSpec);
    } catch (e) {
      console.log(`  · ${path}  (schema unavailable: ${e.message}) — skipping`);
      continue;
    }

    // Pick the right Ajv based on schema's $schema declaration.
    // Draft-2020-12 schemas need Ajv2020.
    const draft = schema.$schema || '';
    const isDraft2020 = draft.includes('2020-12');
    // Silence the "unknown format" warnings ajv-formats prints for
    // vendor types like uint8 / uint16 / uint64 in the biome schema —
    // they're harmless (ajv ignores unknown formats by default) but
    // make the CI log noisy.
    const silentLogger = { log: () => {}, warn: () => {}, error: console.error };
    const ajv = new (isDraft2020 ? Ajv2020 : Ajv)({
      strict: false,
      allErrors: true,
      validateFormats: true,
      logger: silentLogger,
    });
    addFormats(ajv);

    let validate;
    try {
      validate = ajv.compile(schema);
    } catch (e) {
      console.log(`  · ${path}  (schema compile failed: ${e.message}) — skipping`);
      continue;
    }
    const ok = validate(data);
    if (ok) {
      console.log(`  ✓ ${path}`);
    } else {
      errors.push({ path, kind: 'validate', detail: validate.errors });
      console.log(`  ✗ ${path}`);
      for (const err of validate.errors.slice(0, 5)) {
        console.log(
          `      ${err.instancePath || '/'}  ${err.message}` +
            (err.params ? '  ' + JSON.stringify(err.params) : ''),
        );
      }
      if (validate.errors.length > 5) {
        console.log(`      ... ${validate.errors.length - 5} more`);
      }
    }
  }

  if (errors.length > 0) {
    console.error(`\n× ${errors.length} file(s) failed schema validation.`);
    process.exit(1);
  }
  console.log('\n✓ all JSON-schema validations passed');
}

main().catch((err) => {
  console.error('× validator crashed:', err.stack || err.message);
  process.exit(2);
});
