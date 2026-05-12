<script lang="ts">
import { page } from '$app/state';
import { goto, invalidateAll } from '$app/navigation';
import { dev } from '$app/environment';
import { Button } from '$lib/components/ui/button';
import * as Card from '$lib/components/ui/card';
import {
  ArrowLeft,
  Home,
  RotateCw,
  FileSearch,
  ServerCrash,
  WifiOff,
  Lock,
  ShieldAlert,
} from '@lucide/svelte';
import { docTitle } from '$lib/config/branding';
import { reportError } from '$lib/client/error-reporter';
import { onMount } from 'svelte';

let status = $derived(page.status);
let err = $derived(page.error);

// Forward every error route to the unified reporter so it lands
// in the Issues store + activity feed + OS notification (rate-limited).
onMount(() => {
  if (page.error) {
    void reportError(page.error.message ?? 'Unknown route error', {
      source: '+error.svelte',
      route: page.url?.pathname,
      data: { status: page.status },
    });
  }
});

type ErrorPreset = {
  title: string;
  description: string;
  icon: any;
  accent: string;
};

const presets: Record<number, ErrorPreset> = {
  400: {
    title: 'Bad request',
    description: "The request didn't pass server-side validation.",
    icon: ShieldAlert,
    accent: 'text-amber-400',
  },
  401: {
    title: 'Not authorized',
    description: 'You need to sign in to access this.',
    icon: Lock,
    accent: 'text-amber-400',
  },
  403: {
    title: 'Forbidden',
    description: "You don't have permission to view this resource.",
    icon: Lock,
    accent: 'text-red-400',
  },
  404: {
    title: 'Not found',
    description:
      "This page or job doesn't exist — it may have been moved, deleted, or the URL is wrong.",
    icon: FileSearch,
    accent: 'text-muted-foreground',
  },
  500: {
    title: 'Server error',
    description: 'Something broke on our end. The error has been logged.',
    icon: ServerCrash,
    accent: 'text-red-400',
  },
  502: {
    title: 'Bad gateway',
    description: "Upstream service didn't respond correctly.",
    icon: ServerCrash,
    accent: 'text-red-400',
  },
  503: {
    title: 'Service unavailable',
    description: 'The server is temporarily unavailable. Try again in a moment.',
    icon: WifiOff,
    accent: 'text-amber-400',
  },
};

let preset = $derived(
  presets[status] ?? {
    title: 'Something went wrong',
    description: 'An unexpected error occurred.',
    icon: ServerCrash,
    accent: 'text-red-400',
  },
);

let Icon = $derived(preset.icon);

async function retry() {
  await invalidateAll();
}
</script>

<svelte:head>
  <title>{docTitle([status + ' · ' + preset.title])}</title>
</svelte:head>

<div class="h-full flex items-center justify-center p-6 bg-card">
  <Card.Root class="w-full max-w-md">
    <Card.Header>
      <div class="flex items-start gap-4">
        <div class="size-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
          <Icon class={'size-5 ' + preset.accent} />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-baseline gap-2">
            <span class="font-mono text-xs text-muted-foreground tabular-nums">{status}</span>
            <Card.Title class="text-xl tracking-tight">{preset.title}</Card.Title>
          </div>
          <Card.Description class="mt-1 leading-relaxed">
            {err?.message || preset.description}
          </Card.Description>
        </div>
      </div>
    </Card.Header>

    {#if dev && err}
      <Card.Content>
        <details class="text-xs">
          <summary class="cursor-pointer text-muted-foreground hover:text-foreground transition-colors select-none">
            Developer details
          </summary>
          <pre class="mt-3 overflow-auto rounded-md bg-muted p-3 text-[11px] font-mono leading-relaxed text-foreground/80 max-h-64">{JSON.stringify(err, Object.getOwnPropertyNames(err), 2)}</pre>
        </details>
      </Card.Content>
    {/if}

    <Card.Footer class="gap-2 flex-wrap">
      <Button onclick={() => goto('/')} class="gap-1.5">
        <Home class="size-3.5" />
        Go home
      </Button>
      <Button variant="outline" onclick={retry} class="gap-1.5">
        <RotateCw class="size-3.5" />
        Try again
      </Button>
      <Button variant="ghost" onclick={() => history.back()} class="gap-1.5 text-muted-foreground">
        <ArrowLeft class="size-3.5" />
        Back
      </Button>
    </Card.Footer>
  </Card.Root>
</div>
