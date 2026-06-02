/**
 * build-info -- the shared compile-time build identity reader + the pure
 * build-meta line builder the About surface renders.
 *
 * These cases pin the CONTRACT that makes the About surface trustworthy:
 *   • buildMetaLine drops any missing part (mirrors the Electron About's
 *     buildMetaParts filter) so a shallow / non-git build never shows an
 *     "v1.0 ·  · " line with empty segments;
 *   • the date is rendered as the calendar day only (the full ISO goes in the
 *     copy-diagnostics payload, asserted in the About component test) so a
 *     malformed value can't leak a timestamp into the visible chrome;
 *   • a line with only the version present is still returned (the version is
 *     always known from the Vite define) so the surface never renders blank.
 */
import { describe, expect, it } from 'vitest';
import { buildInfo, buildMetaLine } from './build-info';

describe('buildMetaLine', () => {
  it('joins version · commit · day, dropping the time portion of the date', () => {
    expect(
      buildMetaLine({ version: '1.2.3', commit: 'abc1234', buildDate: '2024-05-06T07:08:09.000Z' }),
    ).toBe('v1.2.3 · abc1234 · 2024-05-06');
  });

  it('omits the commit when it is empty', () => {
    expect(
      buildMetaLine({ version: '1.2.3', commit: '', buildDate: '2024-05-06T07:08:09.000Z' }),
    ).toBe('v1.2.3 · 2024-05-06');
  });

  it('omits the date when it is empty', () => {
    expect(buildMetaLine({ version: '1.2.3', commit: 'abc1234', buildDate: '' })).toBe(
      'v1.2.3 · abc1234',
    );
  });

  it('returns just the version when commit + date are both absent', () => {
    // The version is always known (the Vite define), so the line is never
    // blank even on a shallow / non-git checkout that drops SHA + date.
    expect(buildMetaLine({ version: '1.2.3', commit: '', buildDate: '' })).toBe('v1.2.3');
  });

  it('returns an empty string when even the version is missing', () => {
    // No define applied at all (an unusual test runner). The caller hides the
    // line rather than rendering a bare "v".
    expect(buildMetaLine({ version: '', commit: '', buildDate: '' })).toBe('');
  });

  it('tolerates a malformed (non-ISO) date by slicing to 10 chars, never a full timestamp', () => {
    // Defence-in-depth: even if a future build stamps a non-ISO value, the
    // visible chrome must never carry a time component.
    expect(buildMetaLine({ version: '1.2.3', commit: '', buildDate: '2024-05-06 07:08:09' })).toBe(
      'v1.2.3 · 2024-05-06',
    );
  });
});

describe('buildInfo', () => {
  it('reads the Vite defines mirrored into the vitest config', () => {
    // vitest.base.ts mirrors the three defines to fixed literals so this
    // resolves deterministically (version = root package.json, commit =
    // 'testsha', buildDate = a fixed ISO).
    const info = buildInfo();
    expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(info.commit).toBe('testsha');
    expect(info.buildDate).toBe('2024-01-02T03:04:05.000Z');
  });
});
