/**
 * JobStageBadge -- browser-mode tests for the stage-state badge.
 *
 * Cases focus on:
 *   • Null stage renders nothing
 *   • days-quiet pill + tint banding (emerald/cyan/amber/zinc by age)
 *   • ghosted state overrides days pill
 *   • next-action pill (compact prop hides it)
 *   • due-hours formatting (overdue / in Nh / in Nd)
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import JobStageBadge from './JobStageBadge.svelte';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

function stage(over: Partial<any> = {}) {
  return {
    stageHistory: [],
    lastTouchAt: Date.now() - 2 * DAY,
    ...over,
  };
}

describe('JobStageBadge — null / empty', () => {
  it('renders nothing when stage is null', () => {
    const { container } = render(JobStageBadge, { props: { stage: null } });
    expect(container.innerHTML.trim()).toBe('<!---->');
  });
});

describe('JobStageBadge — days-quiet banding', () => {
  it('< 7 days → emerald tint', () => {
    const { container } = render(JobStageBadge, {
      props: { stage: stage({ lastTouchAt: Date.now() - 2 * DAY }) },
    });
    expect(container.innerHTML).toContain('emerald');
  });

  it('7-13 days → cyan tint', () => {
    const { container } = render(JobStageBadge, {
      props: { stage: stage({ lastTouchAt: Date.now() - 10 * DAY }) },
    });
    expect(container.innerHTML).toContain('cyan');
  });

  it('14-20 days → amber tint', () => {
    const { container } = render(JobStageBadge, {
      props: { stage: stage({ lastTouchAt: Date.now() - 15 * DAY }) },
    });
    expect(container.innerHTML).toContain('amber');
  });

  it('≥ 21 days → zinc + dashed', () => {
    const { container } = render(JobStageBadge, {
      props: { stage: stage({ lastTouchAt: Date.now() - 25 * DAY }) },
    });
    expect(container.innerHTML).toContain('zinc');
    expect(container.innerHTML).toContain('dashed');
  });

  it('displays "Nd quiet" text', () => {
    const { container } = render(JobStageBadge, {
      props: { stage: stage({ lastTouchAt: Date.now() - 5 * DAY }) },
    });
    expect(container.textContent).toMatch(/5d quiet/);
  });
});

describe('JobStageBadge — ghosted', () => {
  it('shows "ghosted" pill when ghostedAt is set', () => {
    const { container } = render(JobStageBadge, {
      props: { stage: stage({ ghostedAt: Date.now() - DAY }) },
    });
    expect(container.textContent).toContain('ghosted');
  });

  it('does NOT show days-quiet pill when ghosted', () => {
    const { container } = render(JobStageBadge, {
      props: { stage: stage({ ghostedAt: Date.now() - DAY }) },
    });
    expect(container.textContent).not.toMatch(/quiet/);
  });
});

describe('JobStageBadge — next action', () => {
  it('renders next-action pill when nextActionDue + not compact', () => {
    const { container } = render(JobStageBadge, {
      props: {
        stage: stage({
          nextActionDue: { dueAt: Date.now() + 2 * HOUR, kind: 'follow-up' },
        }),
      },
    });
    expect(container.textContent).toContain('follow');
  });

  it('compact=true hides next-action pill', () => {
    const { container } = render(JobStageBadge, {
      props: {
        compact: true,
        stage: stage({
          nextActionDue: { dueAt: Date.now() + 2 * HOUR, kind: 'follow-up' },
        }),
      },
    });
    expect(container.textContent).not.toContain('follow');
  });

  it('overdue action → red tint + "Nh overdue"', () => {
    const { container } = render(JobStageBadge, {
      props: {
        stage: stage({
          nextActionDue: { dueAt: Date.now() - 3 * HOUR, kind: 'reply' },
        }),
      },
    });
    expect(container.innerHTML).toContain('red');
    expect(container.textContent).toMatch(/overdue/i);
  });

  it('< 24h → amber tint + "in Nh"', () => {
    const { container } = render(JobStageBadge, {
      props: {
        stage: stage({
          nextActionDue: { dueAt: Date.now() + 5 * HOUR, kind: 'reply' },
        }),
      },
    });
    expect(container.innerHTML).toContain('amber');
    expect(container.textContent).toMatch(/in \d+h/);
  });

  it('> 48h → "in Nd"', () => {
    const { container } = render(JobStageBadge, {
      props: {
        stage: stage({
          nextActionDue: { dueAt: Date.now() + 4 * DAY, kind: 'reply' },
        }),
      },
    });
    expect(container.textContent).toMatch(/in \d+d/);
  });

  it('action kind dashes → spaces', () => {
    const { container } = render(JobStageBadge, {
      props: {
        stage: stage({
          nextActionDue: { dueAt: Date.now() + DAY, kind: 'thank-you' },
        }),
      },
    });
    expect(container.textContent).toContain('thank you');
  });

  it('tooltip note is set as title', () => {
    const { container } = render(JobStageBadge, {
      props: {
        stage: stage({
          nextActionDue: { dueAt: Date.now() + DAY, kind: 'reply', note: 'send link' },
        }),
      },
    });
    const span = container.querySelector('[title]') as HTMLElement;
    expect(span?.title).toBe('send link');
  });
});
