#!/usr/bin/env node
// TDD suite for symbolicate.mjs. Plain node (no vitest) so it runs in
// pre-commit + CI without the workspace toolchain, matching the other
// scripts/system/*.test.mjs files. Builds a tiny source map in a temp dir and
// asserts a known generated position maps back to the original
// file:function:line, then drives the whole-stack path end to end.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SourceMapGenerator } from 'source-map';
import { parseFrame, indexMaps, symbolicateStack } from './symbolicate.mjs';

let passed = 0;
function test(name, fn) {
  return fn()
    .then(() => {
      passed++;
      console.log(`  ok ${name}`);
    })
    .catch((e) => {
      console.error(`  FAIL ${name}`);
      console.error(e);
      process.exitCode = 1;
    });
}

/** Write a `<chunk>.js.map` to `dir` mapping generated (1,col) -> original
 *  src.ts (origLine, origCol) under function `fnName`. */
function writeFixtureMap(dir, chunk, { col, origLine, origCol, fnName, source }) {
  const g = new SourceMapGenerator({ file: `${chunk}.js` });
  g.addMapping({
    generated: { line: 1, column: col },
    original: { line: origLine, column: origCol },
    source,
    name: fnName,
  });
  g.setSourceContent(source, 'x\ny\nz\nq\nfunction handleClick(){ boom(); }');
  writeFileSync(join(dir, `${chunk}.js.map`), g.toString());
}

async function run() {
  const dir = mkdtempSync(join(tmpdir(), 'symb-'));
  try {
    // parseFrame -- a bare URL frame yields file + 1-based line + 0-based col.
    await test('parseFrame extracts file, line, 0-based column', async () => {
      const f = parseFrame('    at https://app/_app/immutable/nodes/42.AbCd.js:1:51');
      assert.equal(f.file, '42.AbCd.js');
      assert.equal(f.line, 1);
      assert.equal(f.column, 50); // 51 (1-based) -> 50 (0-based for source-map)
    });

    // parseFrame -- a non-position line (the build marker) is ignored.
    await test('parseFrame returns null for a non-frame line', async () => {
      assert.equal(parseFrame('build: 1.2.3+deadbee'), null);
      assert.equal(parseFrame('Error: boom'), null);
    });

    // The core contract: a known generated position maps back to the original
    // file:function:line via the consumer.
    await test('symbolicateStack maps a minified frame to original src', async () => {
      writeFixtureMap(dir, '42.AbCd', {
        col: 50,
        origLine: 5,
        origCol: 9,
        fnName: 'handleClick',
        source: 'src/Button.svelte',
      });
      const stack = ['Error: boom', '    at https://app/_app/immutable/nodes/42.AbCd.js:1:51'].join(
        '\n',
      );
      const out = await symbolicateStack(stack, dir);
      assert.match(out, /Error: boom/); // head preserved
      assert.match(out, /src\/Button\.svelte:handleClick:5/); // mapped frame
      assert.doesNotMatch(out, /42\.AbCd\.js:1:51/); // minified token replaced
    });

    // A frame whose map is absent must pass through verbatim -- output is never
    // worse than the input.
    await test('symbolicateStack passes through an unmapped frame unchanged', async () => {
      const stack = '    at https://app/_app/immutable/nodes/99.NoMap.js:1:5';
      const out = await symbolicateStack(stack, dir);
      assert.match(out, /99\.NoMap\.js:1:5/);
    });

    // indexMaps keys by the `.js` basename so SvelteKit's hashed chunk names
    // resolve.
    await test('indexMaps keys by the .js basename', async () => {
      const idx = indexMaps(dir);
      assert.ok(idx.has('42.AbCd.js'));
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log(`\nsymbolicate.test.mjs: ${passed} passed`);
}

await run();
