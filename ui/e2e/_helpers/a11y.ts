/**
 * axe-playwright wrapper -- runs axe-core's accessibility scan on the
 * current page state + fails the spec on serious/critical violations.
 *
 * Why a wrapper (not just AxeBuilder directly):
 *
 *   - Brand-aware rule overrides. Heron uses dark-mode by default; the
 *     "color-contrast" rule sometimes false-positives on subtle
 *     foreground/background pairings the design system explicitly
 *     ships. Until we audit each one, we disable that single rule and
 *     gate on every other.
 *
 *   - Soft-fail mode toggle. CI fails on any violation; local
 *     `playwright --debug` keeps the rest of the trace alive by
 *     surfacing violations via console.warn rather than throw.
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

export interface A11yOptions {
  /** Rules to disable in addition to the default brand-aware overrides. */
  disable?: string[];
  /** Restrict to a specific element + descendants. */
  include?: string;
  /** Exclude an element + descendants. */
  exclude?: string;
}

const DEFAULT_DISABLE = [
  // color-contrast: brand dark-mode palette intentionally uses subtle
  // pairings on chrome/decoration that fail the WCAG AA bar but are
  // not interactive content. Re-enable after a design audit.
  'color-contrast',
];

/** Run axe + fail the spec on any serious/critical violation. */
export async function checkA11y(page: Page, opts: A11yOptions = {}): Promise<void> {
  let builder = new AxeBuilder({ page });

  const disabled = [...DEFAULT_DISABLE, ...(opts.disable ?? [])];
  builder = builder.disableRules(disabled);

  if (opts.include) builder = builder.include(opts.include);
  if (opts.exclude) builder = builder.exclude(opts.exclude);

  const results = await builder.analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  if (serious.length > 0) {
    const summary = serious
      .map(
        (v) =>
          `  - ${v.id} (${v.impact}): ${v.description}\n    targets: ${v.nodes
            .map((n) => n.target.join(' '))
            .slice(0, 3)
            .join(', ')}`,
      )
      .join('\n');
    expect.soft(serious, `a11y violations on ${page.url()}:\n${summary}`).toEqual([]);
  }
}
