import { describe, expect, it } from 'vitest';
import { devGalleryUnlocked } from './dev-gate';
import { DEVTOOLS_COOKIE } from '$lib/devtools-keys';

const cookies = (val?: string) => ({
  get: (name: string) => (name === DEVTOOLS_COOKIE ? val : undefined),
});

describe('devGalleryUnlocked', () => {
  it('is open under the live dev server regardless of cookie', () => {
    expect(devGalleryUnlocked(true, cookies(undefined))).toBe(true);
  });

  it('is closed in a built app with no opt-in cookie', () => {
    expect(devGalleryUnlocked(false, cookies(undefined))).toBe(false);
  });

  it('opens in a built app once the owner opted in (cookie="1")', () => {
    expect(devGalleryUnlocked(false, cookies('1'))).toBe(true);
  });

  it('stays closed for any non-"1" cookie value', () => {
    expect(devGalleryUnlocked(false, cookies('0'))).toBe(false);
    expect(devGalleryUnlocked(false, cookies(''))).toBe(false);
  });
});
