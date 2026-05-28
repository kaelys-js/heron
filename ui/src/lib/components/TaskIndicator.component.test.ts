/**
 * TaskIndicator -- pill showing background-task progress.
 *
 * Hidden when no tasks are running. When tasks are present, shows the
 * first label + "+N" count for additional tasks.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import TaskIndicator from './TaskIndicator.svelte';
import { notifications } from '$lib/notifications.svelte';

describe('taskIndicator', () => {
  beforeEach(() => {
    notifications.runningTasks = [];
  });

  afterEach(() => {
    notifications.runningTasks = [];
  });

  it('hidden when no tasks running', () => {
    const { container } = render(TaskIndicator);
    expect(container.innerHTML.trim()).toBe('<!---->');
  });

  it('shows pill when one task running', () => {
    notifications.runningTasks = ['scan'];
    const { container } = render(TaskIndicator);
    expect(container.textContent).toContain('Scanning jobs');
  });

  it('falls back to raw task name for unknown task IDs', () => {
    notifications.runningTasks = ['unknown-task-name'];
    const { container } = render(TaskIndicator);
    expect(container.textContent).toContain('unknown-task-name');
  });

  it('"+N" suffix when multiple tasks', () => {
    notifications.runningTasks = ['scan', 'gemini', 'evaluate'];
    const { container } = render(TaskIndicator);
    expect(container.textContent).toContain('Scanning jobs');
    expect(container.textContent).toContain('+2');
  });

  it('no "+" suffix when only one task', () => {
    notifications.runningTasks = ['scan'];
    const { container } = render(TaskIndicator);
    expect(container.textContent).not.toContain('+');
  });

  it('maps gemini task name to "Gemini scoring"', () => {
    notifications.runningTasks = ['gemini'];
    const { container } = render(TaskIndicator);
    expect(container.textContent).toContain('Gemini scoring');
  });

  it('maps apply-linkedin to "LinkedIn apply"', () => {
    notifications.runningTasks = ['apply-linkedin'];
    const { container } = render(TaskIndicator);
    expect(container.textContent).toContain('LinkedIn apply');
  });

  it('maps evaluate to "Deep eval"', () => {
    notifications.runningTasks = ['evaluate'];
    const { container } = render(TaskIndicator);
    expect(container.textContent).toContain('Deep eval');
  });

  it('maps pdf to "PDF tailoring"', () => {
    notifications.runningTasks = ['pdf'];
    const { container } = render(TaskIndicator);
    expect(container.textContent).toContain('PDF tailoring');
  });

  it('has emerald color tones (running = good)', () => {
    notifications.runningTasks = ['scan'];
    const { container } = render(TaskIndicator);
    expect(container.innerHTML).toContain('emerald');
  });
});
