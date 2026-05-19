/**
 * lib/confirm -- dense ConfirmGate scenarios.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmGate } from './confirm.svelte';

describe('ConfirmGate — every common key shape', () => {
  let gate: ConfirmGate;
  beforeEach(() => {
    vi.useFakeTimers();
    gate = new ConfirmGate();
  });
  afterEach(() => {
    gate.destroy();
    vi.useRealTimers();
  });

  it.each([
    'delete',
    'clear',
    'unpin-all',
    'reset',
    'job:abc123',
    'profile:default',
    'extremely-long-key-' + 'x'.repeat(100),
    'unicode-🎉-key',
    'with spaces and dashes',
    'a',
    '0',
  ])('arms + confirms key "%s"', (key) => {
    expect(gate.trigger(key)).toBe(false);
    expect(gate.isArmed(key)).toBe(true);
    expect(gate.trigger(key)).toBe(true);
    expect(gate.isArmed(key)).toBe(false);
  });
});

describe('ConfirmGate — custom timeout values', () => {
  it.each([100, 250, 500, 1000, 2000, 5000])('timeoutMs=%i', (ms) => {
    vi.useFakeTimers();
    const g = new ConfirmGate(ms);
    g.trigger('k');
    vi.advanceTimersByTime(ms - 1);
    expect(g.isArmed('k')).toBe(true);
    vi.advanceTimersByTime(2);
    expect(g.isArmed('k')).toBe(false);
    g.destroy();
    vi.useRealTimers();
  });
});

describe('ConfirmGate — multi-gate isolation', () => {
  it.each([1, 2, 3, 5, 10])('%i independent gates', (n) => {
    vi.useFakeTimers();
    const gates = Array.from({ length: n }, () => new ConfirmGate());
    // Arm each with the same key
    for (const g of gates) g.trigger('shared-key');
    for (const g of gates) expect(g.isArmed('shared-key')).toBe(true);
    // Disarm only the first one
    gates[0].disarm();
    expect(gates[0].isArmed('shared-key')).toBe(false);
    for (let i = 1; i < n; i++) {
      expect(gates[i].isArmed('shared-key')).toBe(true);
    }
    for (const g of gates) g.destroy();
    vi.useRealTimers();
  });
});

describe('ConfirmGate — switching keys disarms previous', () => {
  it.each([
    ['a', 'b'],
    ['delete', 'clear'],
    ['job:1', 'job:2'],
    ['x', 'y'],
  ])('arm "%s" then trigger "%s" → only second is armed', (k1, k2) => {
    vi.useFakeTimers();
    const g = new ConfirmGate();
    g.trigger(k1);
    expect(g.isArmed(k1)).toBe(true);
    expect(g.trigger(k2)).toBe(false);
    expect(g.isArmed(k1)).toBe(false);
    expect(g.isArmed(k2)).toBe(true);
    g.destroy();
    vi.useRealTimers();
  });
});
