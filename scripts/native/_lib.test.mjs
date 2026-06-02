#!/usr/bin/env node
// Smoke test for _lib.mjs runParallelExitAction -- the parallel-session exit
// precedence. Hand-rolled (not vitest) so it runs without the vitest workspace,
// matching the other scripts/*.test.mjs.
//
// The invariant under test: the LEADER (Electron) exiting cleanly tears the
// whole session down ('done' -> kill siblings), so quitting the desktop window
// no longer leaves vite/:5173 running.
import assert from 'node:assert/strict';
import { runParallelExitAction } from './_lib.mjs';

let pass = 0;
let fail = 0;
function t(name, fn) {
  try {
    fn();
    pass++;
  } catch (e) {
    fail++;
    console.error(`FAIL: ${name}\n  ${e.message}`);
  }
}

t('leader clean exit -> done (kills siblings) -- THE dock-quit fix', () => {
  assert.equal(runParallelExitAction({ code: 0, leader: true, remaining: 1 }), 'done');
});

t('any non-zero exit -> fail (kills siblings + rejects)', () => {
  assert.equal(runParallelExitAction({ code: 1, leader: false, remaining: 1 }), 'fail');
  assert.equal(runParallelExitAction({ code: 1, leader: true, remaining: 0 }), 'fail');
  assert.equal(runParallelExitAction({ code: 137, leader: false, remaining: 0 }), 'fail');
});

t('non-leader clean exit with siblings still running -> wait', () => {
  assert.equal(runParallelExitAction({ code: 0, leader: false, remaining: 1 }), 'wait');
});

t('last child clean exit -> quiet (resolve, nothing to kill)', () => {
  assert.equal(runParallelExitAction({ code: 0, leader: false, remaining: 0 }), 'quiet');
});

console.log(`_lib runParallelExitAction: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
