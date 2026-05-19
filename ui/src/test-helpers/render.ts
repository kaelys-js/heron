/**
 * render -- thin wrapper around @testing-library/svelte's render that
 *
 *   1. Flips the matchMedia polyfill BEFORE mount (so components that
 *      branch on `useIsMobile()` get the right value during their first
 *      render -- not after a reactive update)
 *   2. Returns a typed `{ component, container, queries, …userEvent }`
 *      bundle so tests don't have to import `userEvent` themselves
 *   3. Auto-cleans the singleton state stores via `resetAll()` from
 *      state-helpers (Svelte 5 module-singletons leak across renders
 *      without this).
 *
 * Use `renderMobile(...)` and `renderDesktop(...)` for the responsive
 * primitive sweep; both call this same `render()` under the hood.
 */
import { render as tlRender } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { setMobileViewport } from '../test-setup';
import { resetAll } from './state-helpers';

// @testing-library/svelte v5 exposes a generic-heavy render signature
// that doesn't play well with explicit Component generics. Lean on
// inference instead by typing the wrapper parameters as the same
// types testing-library expects internally.
type AnyComponent = Parameters<typeof tlRender>[0];
type AnyProps = Parameters<typeof tlRender>[1];
type AnyOpts = Parameters<typeof tlRender>[2];

export type RenderResult = ReturnType<typeof tlRender> & {
  user: ReturnType<typeof userEvent.setup>;
};

export function render(component: AnyComponent, props?: AnyProps, options?: AnyOpts): RenderResult {
  // Drain singleton state from any prior render in this file.
  resetAll();
  const result = tlRender(component, props, options);
  const user = userEvent.setup();
  return { ...result, user } as RenderResult;
}

export function renderMobile(
  component: AnyComponent,
  props?: AnyProps,
  options?: AnyOpts,
): RenderResult {
  setMobileViewport(true);
  return render(component, props, options);
}

export function renderDesktop(
  component: AnyComponent,
  props?: AnyProps,
  options?: AnyOpts,
): RenderResult {
  setMobileViewport(false);
  return render(component, props, options);
}

// Re-export the useful bits so tests have one import.
export { screen, waitFor, fireEvent, within } from '@testing-library/svelte';
export { userEvent };
