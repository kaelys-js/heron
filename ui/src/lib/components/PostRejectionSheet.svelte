<!--
  PostRejectionSheet — non-blocking capture form that opens 600ms after a
  status flips to Rejected.
  Three optional textareas. Submitting POSTs to /api/job/[id]/post-rejection
  which appends an expanded entry to interview-prep/story-bank.md so the
  knowledge survives for future evaluations + interview prep.
  Lives at the layout level so it's available globally; opens via a custom
  window event 'career-ops:post-rejection-prompt' fired by JobActions when
  the user changes status to Rejected.
-->
<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet';
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import { CheckCircle2, AlertCircle, ThumbsDown, Loader2, BookOpen, Skull } from '@lucide/svelte';
  import { api, ApiError } from '$lib/api';
  import { toast } from 'svelte-sonner';
  import { onMount } from 'svelte';
  import { BRAND_STORAGE_PREFIX } from '$lib/client/brand';

  const EVENT_NAME = `${BRAND_STORAGE_PREFIX}:post-rejection-prompt`;

  let open = $state(false);
  let jobId = $state<string | null>(null);
  let profileId = $state<string | null>(null);
  let jobLabel = $state('');
  let wentWell = $state('');
  let surprised = $state('');
  let wouldChange = $state('');
  let busy = $state(false);

  type PromptDetail = { jobId: string; jobLabel: string; profileId?: string };

  function openFor(detail: PromptDetail) {
    jobId = detail.jobId;
    profileId = detail.profileId ?? null;
    jobLabel = detail.jobLabel;
    wentWell = '';
    surprised = '';
    wouldChange = '';
    busy = false;
    // 600ms delay so the status-update toast finishes settling before the
    // sheet slides in — feels less jumpy.
    setTimeout(() => {
      open = true;
    }, 600);
  }

  function onWindowEvent(e: Event) {
    const detail = (e as CustomEvent<PromptDetail>).detail;
    if (!detail?.jobId) return;
    openFor(detail);
  }

  onMount(() => {
    if (typeof window === 'undefined') return;
    window.addEventListener(EVENT_NAME, onWindowEvent);
    return () => window.removeEventListener(EVENT_NAME, onWindowEvent);
  });

  async function submit() {
    if (!jobId || busy) return;
    busy = true;
    try {
      const pq = profileId ? '?profile=' + encodeURIComponent(profileId) : '';
      const r = await api.post<{ ok: boolean; path: string; content: string; error?: string }>(
        '/api/job/' + encodeURIComponent(jobId) + '/post-rejection' + pq,
        { wentWell, surprised, wouldChange },
        { silent: true },
      );
      if (!r.ok) throw new Error(r.error ?? 'Capture failed');
      toast.success('Rejection learning saved', {
        description:
          'Appended to ' + r.path + ' — surfaced in future evaluations + interview prep.',
        duration: 8_000,
      });
      open = false;
    } catch (e) {
      const err = e as ApiError;
      toast.error('Capture failed', {
        description: err.message,
        action: { label: 'Retry', onClick: () => submit() },
        duration: 10_000,
      });
    } finally {
      busy = false;
    }
  }

  function skip() {
    open = false;
  }
</script>

<Sheet.Root bind:open>
  <Sheet.Content side="right" class="w-full sm:max-w-lg flex flex-col p-0 gap-0">
    <Sheet.Header class="px-5 pt-5 pb-3 border-b">
      <div class="flex items-start gap-3">
        <div
          class="size-9 rounded-lg bg-red-500/10 ring-1 ring-red-500/40 flex items-center justify-center flex-shrink-0"
        >
          <Skull class="size-4 text-red-300" />
        </div>
        <div class="flex-1 min-w-0">
          <Sheet.Title class="text-base">Capture this rejection</Sheet.Title>
          <Sheet.Description class="text-xs mt-0.5 leading-relaxed">
            {jobLabel} — losses teach more than wins. Two minutes here lets the system reuse the lesson
            in future applications.
          </Sheet.Description>
        </div>
      </div>
    </Sheet.Header>

    <div class="flex-1 overflow-y-auto px-5 py-4 space-y-4">
      <div class="space-y-1.5">
        <Label class="text-xs flex items-center gap-1.5">
          <CheckCircle2 class="size-3 text-emerald-400" />
          What went well?
        </Label>
        <Textarea
          bind:value={wentWell}
          placeholder="The application got read · the recruiter responded fast · I liked my CV bullets…"
          class="text-sm min-h-[72px]"
        />
        <p class="text-[10px] text-muted-foreground/70 leading-tight">
          Even a rejected app usually has SOMETHING you'd reuse — keep it for next time.
        </p>
      </div>

      <div class="space-y-1.5">
        <Label class="text-xs flex items-center gap-1.5">
          <AlertCircle class="size-3 text-amber-400" />
          What surprised you?
        </Label>
        <Textarea
          bind:value={surprised}
          placeholder="They wanted Rust experience that wasn't in the JD · the recruiter ghosted after asking about salary expectations…"
          class="text-sm min-h-[72px]"
        />
        <p class="text-[10px] text-muted-foreground/70 leading-tight">
          Anything that wasn't in the JD or was different from your expectation.
        </p>
      </div>

      <div class="space-y-1.5">
        <Label class="text-xs flex items-center gap-1.5">
          <ThumbsDown class="size-3 text-red-400" />
          What would you change?
        </Label>
        <Textarea
          bind:value={wouldChange}
          placeholder="Different proof point in the cover letter · fewer applications, more research per app · reach out to a peer first…"
          class="text-sm min-h-[72px]"
        />
        <p class="text-[10px] text-muted-foreground/70 leading-tight">
          A specific lever you'd pull next time. Vague is OK; specific is better.
        </p>
      </div>

      <div class="rounded-md border border-border/40 bg-muted/30 px-3 py-2 flex items-start gap-2">
        <BookOpen class="size-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
        <p class="text-[11px] text-muted-foreground/90 leading-relaxed">
          Saved to <code class="font-mono">interview-prep/story-bank.md</code>. Future runs of
          <code class="font-mono">oferta</code>, <code class="font-mono">interview-prep</code>, and
          <code class="font-mono">contacto</code> read from this file so each app gets smarter. You can
          leave any field blank — Claude expands what it has.
        </p>
      </div>
    </div>

    <Sheet.Footer class="px-5 py-3 border-t bg-muted/20 flex items-center gap-2">
      <Button variant="ghost" onclick={skip} disabled={busy}>Skip</Button>
      <div class="flex-1"></div>
      <Button onclick={submit} disabled={busy} class="gap-1.5">
        {#if busy}
          <Loader2 class="size-3.5 animate-spin" /> Capturing…
        {:else}
          <BookOpen class="size-3.5" /> Save learning
        {/if}
      </Button>
    </Sheet.Footer>
  </Sheet.Content>
</Sheet.Root>
