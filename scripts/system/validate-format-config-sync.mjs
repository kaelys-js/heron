#!/usr/bin/env node
/**
 * validate-format-config-sync.mjs -- assert .editorconfig + biome.jsonc
 * + .prettierrc.json agree on every overlapping setting.
 *
 * Why: three configs control formatting in this repo. Drift between them
 * causes the most common "the editor formats one way, the pre-commit
 * hook reformats another" surprise. A header comment in .editorconfig
 * (Pass-6 F2) asks contributors to keep them in sync; this script
 * enforces it.
 *
 * Matrix (∅ = setting doesn't exist in that config):
 *
 *   ┌────────────────────┬─────────────────┬──────────────────────────────┬───────────────┐
 *   │ Concept            │ .editorconfig   │ biome.jsonc                  │ .prettierrc   │
 *   ├────────────────────┼─────────────────┼──────────────────────────────┼───────────────┤
 *   │ indent_width       │ indent_size     │ formatter.indentWidth        │ tabWidth      │
 *   │ indent_style       │ indent_style    │ formatter.indentStyle        │ useTabs       │
 *   │                    │ (space|tab)     │ (space|tab)                  │ (boolean)     │
 *   │ line_ending        │ end_of_line     │ formatter.lineEnding         │ endOfLine     │
 *   │                    │ (lf|crlf|cr)    │ (lf|crlf|cr)                 │ (lf|crlf|cr|auto)
 *   │ line_width         │ max_line_length │ formatter.lineWidth          │ printWidth    │
 *   │ quote_style        │ ∅               │ javascript.formatter         │ singleQuote   │
 *   │                    │                 │   .quoteStyle (single|double)│ (boolean)     │
 *   │ trailing_commas    │ ∅               │ javascript.formatter         │ trailingComma │
 *   │                    │                 │   .trailingCommas            │               │
 *   │ semicolons         │ ∅               │ javascript.formatter         │ semi          │
 *   │                    │                 │   .semicolons (always|never) │ (boolean)     │
 *   │ arrow_parens       │ ∅               │ javascript.formatter         │ arrowParens   │
 *   │                    │                 │   .arrowParentheses          │               │
 *   │ bracket_spacing    │ ∅               │ javascript.formatter         │ bracketSpacing│
 *   │                    │                 │   .bracketSpacing (boolean)  │ (boolean)     │
 *   │ bracket_same_line  │ ∅               │ javascript.formatter         │ bracketSameLine
 *   │                    │                 │   .bracketSameLine (boolean) │ (boolean)     │
 *   └────────────────────┴─────────────────┴──────────────────────────────┴───────────────┘
 *
 * Exit 0 if every overlapping setting agrees; exit 1 with a table of
 * mismatches if any drift detected.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

// .editorconfig uses ['[*]' indent_size = 2] etc. Use the editorconfig
// npm package to resolve "what would the editor apply to <file>". We
// ask for a generic .ts file so the [*] block is what we get back.
async function loadEditorConfig() {
  const editorconfig = await import('editorconfig');
  const sample = resolve(REPO_ROOT, 'sample.ts'); // virtual — only used to drive resolution
  const props = await editorconfig.parse(sample);
  return props;
}

function loadJsonc(absPath) {
  // jsonc-parser handles both .json and .jsonc cleanly.
  // Pulled in lazily to keep this script's startup fast when not used.
  return import('jsonc-parser').then(({ parse }) => {
    const raw = readFileSync(absPath, 'utf8');
    const errors = [];
    const data = parse(raw, errors, { allowTrailingComma: true, disallowComments: false });
    if (errors.length > 0) {
      throw new Error(
        `${absPath}: ${errors.length} parse error(s) (first: ${JSON.stringify(errors[0])})`,
      );
    }
    return data;
  });
}

// Define each cross-config concept + how to read it from each source.
// `expected` runs after collection -- picks the "winning" value (or null
// if missing) and validates the others against it.
function buildChecks(editor, biome, prettier) {
  const editorIndentStyle = editor.indent_style; // 'space' | 'tab'
  const editorIndentSize = Number(editor.indent_size); // 2
  const editorEol = editor.end_of_line; // 'lf' | 'crlf' | 'cr'
  const editorMaxLen = Number(editor.max_line_length); // 100

  const biomeFmt = biome.formatter || {};
  const biomeJs = (biome.javascript && biome.javascript.formatter) || {};
  const prettierUseTabs = prettier.useTabs === true;
  return [
    {
      name: 'indent width',
      editorconfig: editorIndentSize,
      biome: biomeFmt.indentWidth,
      prettier: prettier.tabWidth,
    },
    {
      name: 'indent style',
      editorconfig: editorIndentStyle, // 'space' / 'tab'
      biome: biomeFmt.indentStyle, // 'space' / 'tab'
      prettier: prettierUseTabs ? 'tab' : 'space',
    },
    {
      name: 'line ending',
      editorconfig: editorEol, // 'lf'
      biome: biomeFmt.lineEnding, // 'lf'
      prettier: prettier.endOfLine, // 'lf'
    },
    {
      name: 'line width',
      editorconfig: editorMaxLen,
      biome: biomeFmt.lineWidth,
      prettier: prettier.printWidth,
    },
    {
      name: 'quote style',
      editorconfig: null,
      biome: biomeJs.quoteStyle, // 'single' / 'double'
      prettier: prettier.singleQuote === true ? 'single' : 'double',
    },
    {
      name: 'trailing commas',
      editorconfig: null,
      biome: biomeJs.trailingCommas, // 'all' / 'es5' / 'none'
      prettier: prettier.trailingComma, // 'all' / 'es5' / 'none'
    },
    {
      name: 'semicolons',
      editorconfig: null,
      biome: biomeJs.semicolons, // 'always' / 'asNeeded'
      prettier: prettier.semi === true ? 'always' : 'asNeeded',
    },
    {
      name: 'arrow parens',
      editorconfig: null,
      biome: biomeJs.arrowParentheses, // 'always' / 'asNeeded'
      prettier: prettier.arrowParens, // 'always' / 'avoid'
    },
    {
      name: 'bracket spacing',
      editorconfig: null,
      biome: biomeJs.bracketSpacing,
      prettier: prettier.bracketSpacing,
    },
    {
      name: 'bracket same line',
      editorconfig: null,
      biome: biomeJs.bracketSameLine,
      prettier: prettier.bracketSameLine,
    },
  ];
}

// Normalise differing vocabularies so 'asNeeded' (biome) == 'avoid' (prettier).
function normalise(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    if (value === 'asNeeded') return 'avoid';
    if (value === 'avoid') return 'avoid';
  }
  return value;
}

async function main() {
  let editor, biome, prettier;
  try {
    editor = await loadEditorConfig();
  } catch (e) {
    console.error('× failed to load .editorconfig:', e.message);
    process.exit(2);
  }
  try {
    biome = await loadJsonc(resolve(REPO_ROOT, 'biome.jsonc'));
  } catch (e) {
    console.error('× failed to load biome.jsonc:', e.message);
    process.exit(2);
  }
  try {
    prettier = await loadJsonc(resolve(REPO_ROOT, '.prettierrc.json'));
  } catch (e) {
    console.error('× failed to load .prettierrc.json:', e.message);
    process.exit(2);
  }

  const checks = buildChecks(editor, biome, prettier);
  const mismatches = [];

  for (const c of checks) {
    const ec = normalise(c.editorconfig);
    const bi = normalise(c.biome);
    const pr = normalise(c.prettier);

    // Collect the non-null values; if 2+ differ, that's drift.
    const seen = new Map();
    if (ec != null) seen.set('editorconfig', ec);
    if (bi != null) seen.set('biome', bi);
    if (pr != null) seen.set('prettier', pr);

    const values = [...new Set(seen.values())];
    if (values.length > 1) {
      mismatches.push({ name: c.name, seen });
    }
  }

  if (mismatches.length === 0) {
    console.log('✓ format configs in sync — .editorconfig + biome.jsonc + .prettierrc.json');
    process.exit(0);
  }

  console.error('× format-config drift detected:\n');
  for (const m of mismatches) {
    console.error(`  ${m.name}:`);
    for (const [src, v] of m.seen) {
      console.error(`      ${src.padEnd(14)} = ${JSON.stringify(v)}`);
    }
    console.error();
  }
  console.error(
    'Fix: pick one canonical value and mirror it across the three files.\n' +
      'Reminder: .editorconfig comment block + docs/SETUP.md "Formatters" doc the\n' +
      'invariant — every change must update all three.',
  );
  process.exit(1);
}

main().catch((err) => {
  console.error('× validator crashed:', err.stack || err.message);
  process.exit(2);
});
