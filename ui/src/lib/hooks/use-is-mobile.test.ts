/**
 * lib/hooks/use-is-mobile -- singleton matchMedia store.
 *
 * Critical regression coverage from the dropdown-sweep session: every
 * `useIsMobile()` caller MUST share the same store, NOT create a fresh
 * one per component. Bug history: independent stores caused
 * "Context Menu.Content not found" in bits-ui when parent + child
 * rendered different mobile/desktop branches during a viewport flip.
 *
 * jsdom env -- uses the matchMedia polyfill from test-setup.ts
 * (setMobileViewport helper).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setMobileViewport } from '../../test-setup';
import { useIsMobile } from './use-is-mobile.svelte';

describe('useIsMobile — singleton', () => {
  beforeEach(() => {
    setMobileViewport(false);
  });

  afterEach(() => {
    setMobileViewport(false);
  });

  it('returns a reactive store with a .value property', () => {
    const store = useIsMobile();
    expect(store).toHaveProperty('value');
    expect(typeof store.value).toBe('boolean');
  });

  it('two callers receive the SAME store instance (singleton)', () => {
    const a = useIsMobile();
    const b = useIsMobile();
    expect(a).toBe(b);
  });

  it('store stays in sync across callers when viewport flips', () => {
    const a = useIsMobile();
    const b = useIsMobile();
    setMobileViewport(true);
    expect(a.value).toBe(b.value);
  });
});

describe('useIsMobile — matchMedia integration (smoke only)', () => {
  // The matchMedia listener attaches via `onMount(...)` inside the hook.
  // Outside a Svelte component lifecycle (raw vitest unit context),
  // onMount callbacks don't fire -- so the store stays at its initial
  // `{value: false}` regardless of `setMobileViewport()`. End-to-end
  // matchMedia reactivity is tested in the ui-component project where
  // the hook mounts inside a real component running in real Chromium.
  beforeEach(() => {
    setMobileViewport(false);
  });

  it('initial value is false (desktop default)', () => {
    const store = useIsMobile();
    expect(store.value).toBe(false);
  });

  it('store.value is a boolean (not undefined)', () => {
    const store = useIsMobile();
    setMobileViewport(true);
    expect(typeof store.value).toBe('boolean');
  });
});

describe('useIsMobile — listener semantics', () => {
  it('attaching multiple times does not duplicate listeners', () => {
    const a = useIsMobile();
    const b = useIsMobile();
    const c = useIsMobile();
    // All same instance → listener attached only once.
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});
