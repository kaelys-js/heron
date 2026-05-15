/**
 * lib/server/apply-counter — daily LinkedIn Easy Apply rate-limit accounting.
 *
 * Mocks the filesystem layer; tests todayCount + bumpApplyCounter.
 * Node env.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

// Mock the ROOT export so all paths land in a tmpdir.
const TMP = path.join(tmpdir(), 'heron-apply-counter-' + Date.now());
vi.mock('./files', () => ({ ROOT: TMP }));

const { todayCount, bumpApplyCounter, applyCounterPath } = await import('./apply-counter');

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return yyyy + '-' + mm + '-' + dd;
}

describe('apply-counter', () => {
  beforeEach(() => {
    if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
  });

  afterEach(() => {
    if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('todayCount returns 0 when file does not exist', () => {
    expect(todayCount()).toBe(0);
  });

  it('bumpApplyCounter returns 1 on first call', () => {
    expect(bumpApplyCounter()).toBe(1);
    expect(todayCount()).toBe(1);
  });

  it('bumpApplyCounter increments on subsequent calls', () => {
    bumpApplyCounter();
    bumpApplyCounter();
    expect(bumpApplyCounter()).toBe(3);
    expect(todayCount()).toBe(3);
  });

  it('persists today count to disk', () => {
    bumpApplyCounter();
    const raw = fs.readFileSync(applyCounterPath(), 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed[todayKey()]).toBe(1);
  });

  it('preserves entries for other dates', () => {
    // Seed the file with a prior date
    fs.mkdirSync(path.dirname(applyCounterPath()), { recursive: true });
    const prior: Record<string, number> = {};
    prior['2023-01-01'] = 5;
    fs.writeFileSync(applyCounterPath(), JSON.stringify(prior));
    bumpApplyCounter();
    const after = JSON.parse(fs.readFileSync(applyCounterPath(), 'utf8'));
    expect(after['2023-01-01']).toBe(5);
    expect(after[todayKey()]).toBe(1);
  });

  it('handles corrupt JSON gracefully (returns 0, overwrites)', () => {
    fs.mkdirSync(path.dirname(applyCounterPath()), { recursive: true });
    fs.writeFileSync(applyCounterPath(), '{not valid json');
    expect(todayCount()).toBe(0);
    expect(bumpApplyCounter()).toBe(1);
  });

  it('handles array-shape JSON gracefully (treats as empty)', () => {
    fs.mkdirSync(path.dirname(applyCounterPath()), { recursive: true });
    fs.writeFileSync(applyCounterPath(), '[1, 2, 3]');
    // Array is technically `typeof 'object'`, so it doesn't return {} from
    // readState's filter. But array indexing by yyyy-mm-dd key returns
    // undefined → ??.0 → still works.
    expect(todayCount()).toBe(0);
  });

  it('applyCounterPath() resolves under ROOT/data/', () => {
    const p = applyCounterPath();
    expect(p).toContain('data');
    expect(p).toContain('apply-counter.json');
  });
});
