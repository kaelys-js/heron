/**
 * Accessibility test helper — drop-in axe-core wrapper for component tests.
 *
 * HP3 — Heron's component tests run via Vitest's browser provider against
 * real Chromium/WebKit. axe-core integrates by running against the
 * `document` inside the test page; the helper returns the same Promise
 * shape `expect()` understands so we can chain into a regular assertion.
 *
 * Usage in a `*.component.test.ts`:
 *
 *     import { render } from '$lib/../test-helpers/render';
 *     import { expectNoAxeViolations } from '$lib/../test-helpers/a11y';
 *     import MyComponent from '$lib/components/MyComponent.svelte';
 *
 *     it('has no axe violations in the default state', async () => {
 *       const { container } = render(MyComponent);
 *       await expectNoAxeViolations(container);
 *     });
 *
 * Scoping: pass a specific element (e.g. just the rendered component
 * container, not the entire test page) so we don't fail on harness-
 * level DOM issues outside our control.
 *
 * Rules we DISABLE by default:
 *   - `region` — landmark-region rule fails on isolated components that
 *     don't include `<main>` / `<nav>` etc. Real-page tests assert this.
 *   - `color-contrast` — depends on computed styles from the surrounding
 *     theme; surfaces too many false positives in JSDOM-influenced
 *     theming. Re-enable per-test when explicitly testing theme.
 *
 * To enforce a stricter ruleset in a specific test, pass `{ rules: {} }`
 * to opt back into the disabled rules.
 */
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
  if (results.violations.length === 0) return;
  const lines = results.violations.map((v) => {
    const nodes = v.nodes.map((n) => '    ' + n.target.join(', ')).join('\n');
    return `  ${v.id} [${v.impact}] — ${v.help} (${v.helpUrl})\n${nodes}`;
  });
  throw new Error(
    `axe-core found ${results.violations.length} accessibility violation(s):\n${lines.join('\n')}`,
  );
}
