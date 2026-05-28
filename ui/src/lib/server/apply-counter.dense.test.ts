/**
 * lib/server/apply-counter -- dense increment scenarios.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

const TMP = path.join(tmpdir(), `heron-apply-counter-dense-${Date.now()}`);
vi.mock('./files', () => ({ ROOT: TMP, DATA_ROOT: path.join(TMP, 'data') }));

const { todayCount, bumpApplyCounter, applyCounterPath } = await import('./apply-counter');

describe('bumpApplyCounter — increments across N calls', () => {
  beforeEach(() => {
    if (fs.existsSync(TMP)) {
      fs.rmSync(TMP, { recursive: true, force: true });
    }
  });
  afterEach(() => {
    if (fs.existsSync(TMP)) {
      fs.rmSync(TMP, { recursive: true, force: true });
    }
  });

  it.each([1, 2, 5, 10, 25, 50, 100])('%i calls → todayCount = %i', (n) => {
    for (let i = 0; i < n; i++) {
      bumpApplyCounter();
    }
    expect(todayCount()).toBe(n);
  });
});

describe('bumpApplyCounter — return value is post-bump count', () => {
  beforeEach(() => {
    if (fs.existsSync(TMP)) {
      fs.rmSync(TMP, { recursive: true, force: true });
    }
  });

  it.each([1, 2, 3, 4, 5, 10])('after %i bumps, returned value === %i', (n) => {
    let last = 0;
    for (let i = 0; i < n; i++) {
      last = bumpApplyCounter();
    }
    expect(last).toBe(n);
  });
});

describe('todayCount — file lifecycle', () => {
  beforeEach(() => {
    if (fs.existsSync(TMP)) {
      fs.rmSync(TMP, { recursive: true, force: true });
    }
  });

  it.each([0, 1, 5, 10])('starts at 0 even on fresh dir, increments to %i', (n) => {
    expect(todayCount()).toBe(0);
    for (let i = 0; i < n; i++) {
      bumpApplyCounter();
    }
    expect(todayCount()).toBe(n);
  });
});

describe('apply-counter — preserves historical dates', () => {
  beforeEach(() => {
    if (fs.existsSync(TMP)) {
      fs.rmSync(TMP, { recursive: true, force: true });
    }
  });
  afterEach(() => {
    if (fs.existsSync(TMP)) {
      fs.rmSync(TMP, { recursive: true, force: true });
    }
  });

  it.each([
    [['2024-01-01', '2024-01-02']],
    [['2023-12-31', '2024-01-01', '2024-01-02']],
    [['2020-01-01', '2022-06-15', '2024-12-31']],
  ])('preserves %o', (dates) => {
    fs.mkdirSync(path.dirname(applyCounterPath()), { recursive: true });
    const seed: Record<string, number> = {};
    for (const d of dates) {
      seed[d] = 5;
    }
    fs.writeFileSync(applyCounterPath(), JSON.stringify(seed));
    bumpApplyCounter();
    const after = JSON.parse(fs.readFileSync(applyCounterPath(), 'utf8'));
    for (const d of dates) {
      expect(after[d]).toBe(5);
    }
  });
});
