/** axe-core wrapper for component tests (HP3). Heron's component tests
 *  run in Vitest's browser provider against Chromium/WebKit; axe runs
 *  against `document` and we return an `expect()`-chainable Promise.
 *  Pass a scoped element so harness-level DOM doesn't fail us.
 *  Defaults disabled: `region` (isolated components lack <main>/<nav>;
 *  real-page tests assert this) and `color-contrast` (false positives
 *  from surrounding theme). Pass `{ rules: {} }` to opt them back in. */
import axe from 'axe-core';

export type AxeOptions = {
  /** Per-rule overrides, e.g. `{ 'color-contrast': { enabled: true } }`. */
  rules?: Record<string, { enabled: boolean }>;
  /** Tag filter (e.g. `['wcag2a', 'wcag2aa']`). Defaults to wcag2a+aa. */
  tags?: string[];
};

const DEFAULT_DISABLED_RULES: Record<string, { enabled: boolean }> = {
  region: { enabled: false },
  'color-contrast': { enabled: false },
};

/**
 * Run axe against the given root and throw if any violation is found.
 * Throws an Error whose message lists each violation's id + impact +
 * help URL so the test failure points directly at the WCAG rule.
 */
export async function expectNoAxeViolations(
  root: Element | Document = document,
  opts: AxeOptions = {},
): Promise<void> {
  const results = await axe.run(root, {
    rules: { ...DEFAULT_DISABLED_RULES, ...(opts.rules ?? {}) },
    runOnly: { type: 'tag', values: opts.tags ?? ['wcag2a', 'wcag2aa'] },
  });
  if (results.violations.length === 0) {
    return;
  }
  const lines = results.violations.map((v) => {
    const nodes = v.nodes.map((n) => `    ${n.target.join(', ')}`).join('\n');
    return `  ${v.id} [${v.impact}] — ${v.help} (${v.helpUrl})\n${nodes}`;
  });
  throw new Error(
    `axe-core found ${results.violations.length} accessibility violation(s):\n${lines.join('\n')}`,
  );
}
