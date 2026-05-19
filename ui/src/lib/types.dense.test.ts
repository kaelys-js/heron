/**
 * lib/types -- dense table-driven cases for every Status / tab / source.
 */
import { describe, expect, it } from 'vitest';
import {
  APPLICATION_STATUS_TINTS,
  BG_TINTS,
  DEFAULT_FILTER,
  SOURCE_LABELS,
  STATUS_EMPTY_COPY,
  STATUS_ORDER,
  STATUS_TINTS,
  TAB_PRESETS,
  tabLabel,
  tabStatuses,
  type Status,
  type BgRisk,
} from './types';

const ALL_STATUSES: Status[] = [
  'New',
  'Scoring',
  'Scored',
  'Ready',
  'Queued',
  'Applying',
  'Applied',
  'Screened',
  'PhoneScreen',
  'Technical',
  'TakeHome',
  'Onsite',
  'Final',
  'Interview',
  'Offer',
  'Negotiating',
  'Accepted',
  'Declined',
  'Ghosted',
  'Rejected',
  'Closed',
  'ManualApplyNeeded',
];

describe('Status surface — completeness per status', () => {
  it.each(ALL_STATUSES)('STATUS_ORDER includes %s', (s) => {
    expect(STATUS_ORDER).toContain(s);
  });

  it.each(ALL_STATUSES)('STATUS_TINTS has tint class for %s', (s) => {
    expect(STATUS_TINTS[s]).toBeTruthy();
  });

  it.each(ALL_STATUSES)('STATUS_TINTS[%s] is a tailwind utility chain', (s) => {
    expect(STATUS_TINTS[s]).toMatch(/text-|bg-|border-|ring-/);
  });

  it.each(ALL_STATUSES)('STATUS_EMPTY_COPY[%s] is non-empty', (s) => {
    expect(STATUS_EMPTY_COPY[s]).toBeTruthy();
    expect(STATUS_EMPTY_COPY[s].length).toBeGreaterThan(5);
  });

  it.each(ALL_STATUSES)('STATUS_EMPTY_COPY[%s] is a plain string', (s) => {
    expect(typeof STATUS_EMPTY_COPY[s]).toBe('string');
  });

  it.each(ALL_STATUSES)('tabStatuses("s:%s") returns single-status array', (s) => {
    const r = tabStatuses(`s:${s}` as any);
    expect(r).toEqual([s]);
  });

  it.each(ALL_STATUSES)('tabLabel("s:%s") contains the status name', (s) => {
    expect(tabLabel(`s:${s}` as any)).toContain(s);
  });
});

describe('BgRisk — completeness', () => {
  const BG_KEYS: NonNullable<BgRisk>[] = ['LOW', 'MEDIUM', 'HIGH', 'BLOCKED'];

  it.each(BG_KEYS)('BG_TINTS[%s] exists', (k) => {
    expect(BG_TINTS[k]).toBeTruthy();
  });

  it.each(BG_KEYS)('BG_TINTS[%s] is a tailwind utility chain', (k) => {
    expect(BG_TINTS[k]).toMatch(/text-|bg-|border-/);
  });
});

describe('Source labels — completeness', () => {
  const SOURCE_KEYS = Object.keys(SOURCE_LABELS);

  it.each(SOURCE_KEYS)('SOURCE_LABELS[%s].label is non-empty', (k) => {
    expect(SOURCE_LABELS[k].label.length).toBeGreaterThan(0);
  });

  it.each(SOURCE_KEYS)('SOURCE_LABELS[%s].tint is a tailwind class chain', (k) => {
    expect(SOURCE_LABELS[k].tint).toMatch(/text-|bg-|border-|ring-/);
  });
});

describe('Tab presets — properties', () => {
  it.each(['all', 'ready', 'applied'])('preset value %s is in TAB_PRESETS', (v) => {
    expect(TAB_PRESETS.map((p) => p.value)).toContain(v);
  });

  it.each(TAB_PRESETS.map((p) => p.value))('preset %s has non-empty statuses array', (v) => {
    const preset = TAB_PRESETS.find((p) => p.value === v);
    expect(preset).toBeTruthy();
    expect(Array.isArray(preset!.statuses)).toBe(true);
  });

  it.each(TAB_PRESETS)('preset $value has non-empty label', (p) => {
    expect(p.label.length).toBeGreaterThan(0);
  });
});

describe('Application status tints — completeness', () => {
  const APP_STATUS_KEYS = Object.keys(APPLICATION_STATUS_TINTS);

  it.each(APP_STATUS_KEYS)('APPLICATION_STATUS_TINTS[%s] is non-empty', (k) => {
    const tints = APPLICATION_STATUS_TINTS as Record<string, string>;
    expect(tints[k]).toBeTruthy();
  });
});

describe('DEFAULT_FILTER — shape', () => {
  it('every BgRisk key present in bgRisk', () => {
    expect(DEFAULT_FILTER.bgRisk).toHaveProperty('LOW');
    expect(DEFAULT_FILTER.bgRisk).toHaveProperty('MEDIUM');
    expect(DEFAULT_FILTER.bgRisk).toHaveProperty('HIGH');
    expect(DEFAULT_FILTER.bgRisk).toHaveProperty('BLOCKED');
  });

  it('every WorkMode key present in workMode', () => {
    expect(DEFAULT_FILTER.workMode).toHaveProperty('remote');
    expect(DEFAULT_FILTER.workMode).toHaveProperty('hybrid');
    expect(DEFAULT_FILTER.workMode).toHaveProperty('onsite');
    expect(DEFAULT_FILTER.workMode).toHaveProperty('unknown');
  });

  it('hasReport / hasPdf / hasSalary are all false by default', () => {
    expect(DEFAULT_FILTER.hasReport).toBe(false);
    expect(DEFAULT_FILTER.hasPdf).toBe(false);
    expect(DEFAULT_FILTER.hasSalary).toBe(false);
  });

  it('minScore is 0', () => {
    expect(DEFAULT_FILTER.minScore).toBe(0);
  });

  it('search is empty string', () => {
    expect(DEFAULT_FILTER.search).toBe('');
  });

  it('source is empty string', () => {
    expect(DEFAULT_FILTER.source).toBe('');
  });
});
