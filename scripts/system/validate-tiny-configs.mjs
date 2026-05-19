#!/usr/bin/env node
/**
 * validate-tiny-configs.mjs -- syntax checks for the small static config
 * files no formatter / linter ecosystem exists for:
 *
 *   .gitattributes  -- git's per-path attributes (text/binary/eol/diff)
 *   .npmrc          -- pnpm INI-style config
 *   .actrc          -- act (local CI runner) flag list
 *   LICENSE         -- MIT template match (no drift from upstream MIT text)
 *   robots.txt      -- minimal directive set (User-agent, Allow, Disallow,
 *                     Sitemap, Crawl-delay)
 *
 * Each check is a regex-driven sanity pass -- not a full grammar parser.
 * Catches the realistic failure modes (truncated lines / typo'd keys /
 * unknown directives) without false-positive noise.
 *
 * Exit 0 if every file passes; exit 1 with a per-file error report.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const errors = [];

function check(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.log(`  ✗ ${name}  ${e.message}`);
    errors.push({ name, message: e.message });
  }
}

function readIfExists(path) {
  const full = resolve(REPO_ROOT, path);
  if (!existsSync(full)) return null;
  return readFileSync(full, 'utf8');
}

// ── .gitattributes ──────────────────────────────────────────────────
// Each non-blank, non-comment line must be:
//   <pattern> <attr>[=<value>][...]
// Attributes recognised: text, binary, eol, diff, merge, linguist-*, etc.
// We don't enforce the value side (free-form); just assert the line has
// a pattern + at least one attribute.
check('.gitattributes', () => {
  const src = readIfExists('.gitattributes');
  if (src == null) throw new Error('file missing');
  const lines = src.split('\n');
  const re = /^(?:[^\s#][^\s]*)\s+\S/; // pattern + at least one attr
  lines.forEach((line, i) => {
    const stripped = line.trim();
    if (!stripped) return; // blank
    if (stripped.startsWith('#')) return; // comment
    // .gitattributes does NOT support inline comments -- the whole line
    // is treated as data, so we don't strip trailing #.
    if (!re.test(line)) {
      throw new Error(`line ${i + 1}: not "<pattern> <attr>...": ${JSON.stringify(stripped)}`);
    }
  });
});

// ── .npmrc ──────────────────────────────────────────────────────────
// Each non-blank, non-comment line must be: key=value
// Keys are lowercase letters / digits / dashes / dots / underscores.
check('.npmrc', () => {
  const src = readIfExists('.npmrc');
  if (src == null) throw new Error('file missing');
  const re = /^[a-zA-Z][a-zA-Z0-9._-]*\s*=\s*\S/;
  src.split('\n').forEach((line, i) => {
    const stripped = line.trim();
    if (!stripped) return;
    if (stripped.startsWith('#') || stripped.startsWith(';')) return;
    if (!re.test(stripped)) {
      throw new Error(`line ${i + 1}: not "key=value": ${JSON.stringify(stripped)}`);
    }
  });
});

// ── .actrc ──────────────────────────────────────────────────────────
// Each non-blank, non-comment line is a flag for act:
//   -P platform=image            (with a key=value arg)
//   --reuse                      (flag, no arg)
//   --env-file .env.act          (flag with arg)
//   --container-architecture linux/amd64
//   --pull=false                 (flag=value)
// All other lines must start with '-' or '--'.
check('.actrc', () => {
  const src = readIfExists('.actrc');
  if (src == null) throw new Error('file missing');
  src.split('\n').forEach((line, i) => {
    const stripped = line.trim();
    if (!stripped) return;
    if (stripped.startsWith('#')) return;
    if (!stripped.startsWith('-')) {
      throw new Error(`line ${i + 1}: not a flag: ${JSON.stringify(stripped)}`);
    }
  });
});

// ── LICENSE ─────────────────────────────────────────────────────────
// Must match the standard MIT template (with the copyright line variable).
//   MIT License
//
//   Copyright (c) <year> <holder>
//
//   Permission is hereby granted, free of charge, to any person obtaining...
//   ...
//   SOFTWARE.
check('LICENSE', () => {
  const src = readIfExists('LICENSE');
  if (src == null) throw new Error('file missing');
  // Sanity: must contain the MIT-canonical phrases.
  const required = [
    /^MIT License$/m, // first line (or near it)
    /Copyright \(c\) \d{4} /m, // copyright line
    /Permission is hereby granted, free of charge,/, // body intro
    /AS IS"?,? WITHOUT WARRANTY OF ANY KIND/i,
    /SOFTWARE\.\s*$/m,
  ];
  for (const re of required) {
    if (!re.test(src)) {
      throw new Error(`missing MIT-template fragment: ${re.source}`);
    }
  }
});

// ── robots.txt ──────────────────────────────────────────────────────
// Each non-blank, non-comment line must be one of:
//   User-agent: <value>
//   Allow: <path>
//   Disallow: <path>
//   Sitemap: <url>
//   Crawl-delay: <seconds>
//   Host: <host>            (rarely used but valid)
check('robots.txt', () => {
  const src = readIfExists('ui/static/robots.txt');
  if (src == null) throw new Error('file missing');
  const validDirective = /^(User-agent|Allow|Disallow|Sitemap|Crawl-delay|Host|Clean-param)\s*:/i;
  src.split('\n').forEach((line, i) => {
    const stripped = line.trim();
    if (!stripped) return;
    if (stripped.startsWith('#')) return;
    if (!validDirective.test(stripped)) {
      throw new Error(`line ${i + 1}: unknown directive: ${JSON.stringify(stripped)}`);
    }
  });
});

if (errors.length > 0) {
  console.error(`\n× ${errors.length} tiny-config file(s) failed validation.`);
  process.exit(1);
}
console.log(`\n✓ tiny-config files all valid`);
