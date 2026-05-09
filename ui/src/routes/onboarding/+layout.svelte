<script lang="ts">
  import OnboardingShell from '$lib/components/OnboardingShell.svelte';
  import { page } from '$app/state';
  import { Toaster } from '$lib/components/ui/sonner';

  let { data, children }: {
    data: {
      state: import('$lib/server/onboarding').OnboardingState;
      progress: { step: string; status: 'complete' | 'skipped' | 'current' | 'pending' }[];
    };
    children: import('svelte').Snippet;
  } = $props();

  // Map URL path → step id.
  const STEP_FROM_PATH: Record<string, string> = {
    '/onboarding':              'welcome',
    '/onboarding/':             'welcome',
    '/onboarding/api-keys':     'api-keys',
    '/onboarding/identity':     'identity',
    '/onboarding/cv':           'cv',
    '/onboarding/targeting':    'targeting',
    '/onboarding/sources':      'sources',
    '/onboarding/first-scan':   'first-scan',
    '/onboarding/done':         'done',
  };

  let currentStep = $derived(
    STEP_FROM_PATH[page.url.pathname.replace(/\/$/, '')] ?? 'welcome',
  );
</script>

<OnboardingShell progress={data.progress} current={currentStep}>
  {@render children()}
</OnboardingShell>

<Toaster />
