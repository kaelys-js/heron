/**
 * POST /api/onboarding/step  { step: string, action: 'complete' | 'skipped' }
 *
 * Used by every wizard step page on submit. Idempotent — re-marking the
 * same step is a no-op.
 */
import { wrap, badRequest } from '$lib/server/api-helpers';
import {
  markStepComplete,
  markStepSkipped,
  STEPS,
  type OnboardingStep,
} from '$lib/server/onboarding';

export const POST = wrap('onboarding-step', async ({ request }: { request: Request }) => {
  const body = await request.json().catch(() => ({}));
  const step = body.step as string;
  const action = (body.action as string) ?? 'complete';
  if (!step) badRequest('step required');
  if (!(STEPS as readonly string[]).includes(step)) badRequest('Unknown step: ' + step);
  const state =
    action === 'skipped'
      ? markStepSkipped(step as OnboardingStep)
      : markStepComplete(step as OnboardingStep);
  return { state };
});
