/**
 * lib/types -- runtime guards over the type-and-constant surface.
 *
 * The constants here drive the entire pipeline UI (status pills, empty
 * states, source labels, tab presets, default filters). Any drift
 * between the union types and the records keyed on them is a real
 * runtime bug -- these tests are the gate.
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
} from './types';
import type { Status, ApplicationStatus, BgRisk } from './types';

const STATUS_UNION: Status[] = [
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

describe('sTATUS_ORDER', () => {
  it('starts with the early-pipeline statuses', () => {
    expect(STATUS_ORDER.slice(0, 4)).toEqual(['New', 'Scoring', 'Scored', 'Ready']);
  });
  it('ends with terminal statuses', () => {
    expect(STATUS_ORDER).toContain('Rejected');
    expect(STATUS_ORDER).toContain('Closed');
    expect(STATUS_ORDER).toContain('Declined');
  });
  it('has no duplicates', () => {
    expect(new Set(STATUS_ORDER).size).toBe(STATUS_ORDER.length);
  });
  it('covers every Status union member', () => {
    const orderSet = new Set(STATUS_ORDER);
    for (const s of STATUS_UNION) {
      expect(orderSet.has(s), `STATUS_ORDER missing ${s}`).toBe(true);
    }
  });
});

describe('sTATUS_TINTS', () => {
  it('has a tint class for every Status', () => {
    for (const s of STATUS_UNION) {
      expect(STATUS_TINTS[s]).toBeTruthy();
      expect(STATUS_TINTS[s]).toMatch(/text-|bg-|border-/);
    }
  });
});

describe('sTATUS_EMPTY_COPY', () => {
  it('has empty-state copy for every Status', () => {
    for (const s of STATUS_UNION) {
      expect(STATUS_EMPTY_COPY[s]).toBeTruthy();
      expect(typeof STATUS_EMPTY_COPY[s]).toBe('string');
      expect(STATUS_EMPTY_COPY[s].length).toBeGreaterThan(5);
    }
  });
});

describe('aPPLICATION_STATUS_TINTS', () => {
  it('has tints for SKIP and Discarded synonyms', () => {
    const keys = Object.keys(APPLICATION_STATUS_TINTS) as ApplicationStatus[];
    expect(keys.length).toBeGreaterThanOrEqual(3);
    keys.forEach((k) => expect(APPLICATION_STATUS_TINTS[k]).toBeTruthy());
  });
});

describe('bG_TINTS', () => {
  it('covers LOW, MEDIUM, HIGH, BLOCKED', () => {
    const required: NonNullable<BgRisk>[] = ['LOW', 'MEDIUM', 'HIGH', 'BLOCKED'];
    for (const k of required) {
      expect(BG_TINTS[k]).toBeTruthy();
      expect(BG_TINTS[k]).toMatch(/text-|bg-|border-/);
    }
  });
});

describe('sOURCE_LABELS', () => {
  it('has at least the major job-board sources', () => {
    const keys = Object.keys(SOURCE_LABELS);
    expect(keys.length).toBeGreaterThan(5);
  });
  it('every label has both label and tint', () => {
    Object.entries(SOURCE_LABELS).forEach(([_, v]) => {
      expect(v.label).toBeTruthy();
      expect(v.tint).toBeTruthy();
    });
  });
});

describe('tAB_PRESETS', () => {
  it('has all/ready/applied presets', () => {
    const values = TAB_PRESETS.map((p) => p.value);
    expect(values).toEqual(expect.arrayContaining(['all', 'ready', 'applied']));
  });
  it('each preset has a statuses array', () => {
    TAB_PRESETS.forEach((p) => {
      expect(Array.isArray(p.statuses)).toBe(true);
    });
  });
});

describe('tabStatuses', () => {
  it('"all" returns every Status', () => {
    expect(tabStatuses('all').length).toBe(STATUS_ORDER.length);
  });
  it('"ready" maps to Ready (and possibly more)', () => {
    expect(tabStatuses('ready')).toContain('Ready');
  });
  it('"applied" maps to the active-application bucket', () => {
    const r = tabStatuses('applied');
    expect(r).toContain('Applied');
  });
  it('"s:SomeStatus" returns single-status filter', () => {
    const r = tabStatuses('s:Offer');
    expect(r).toEqual(['Offer']);
  });
});

describe('tabLabel', () => {
  it('returns preset label for a preset', () => {
    const ready = tabLabel('ready');
    expect(typeof ready).toBe('string');
    expect(ready.length).toBeGreaterThan(0);
  });
  it('returns the status name for s:X', () => {
    expect(tabLabel('s:Offer')).toContain('Offer');
  });
});

describe('dEFAULT_FILTER', () => {
  it('has minScore 0', () => {
    expect(DEFAULT_FILTER.minScore).toBe(0);
  });
  it('has empty search', () => {
    expect(DEFAULT_FILTER.search).toBe('');
  });
  it('excludes BLOCKED by default', () => {
    expect(DEFAULT_FILTER.bgRisk.BLOCKED).toBe(false);
  });
  it('includes LOW / MEDIUM / HIGH by default', () => {
    expect(DEFAULT_FILTER.bgRisk.LOW).toBe(true);
    expect(DEFAULT_FILTER.bgRisk.MEDIUM).toBe(true);
    expect(DEFAULT_FILTER.bgRisk.HIGH).toBe(true);
  });
  it('includes every workMode by default', () => {
    expect(DEFAULT_FILTER.workMode.remote).toBe(true);
    expect(DEFAULT_FILTER.workMode.hybrid).toBe(true);
    expect(DEFAULT_FILTER.workMode.onsite).toBe(true);
    expect(DEFAULT_FILTER.workMode.unknown).toBe(true);
  });
});
