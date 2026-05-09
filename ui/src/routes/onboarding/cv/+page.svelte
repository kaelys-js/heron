<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Label } from '$lib/components/ui/label';
  import { FileText, ArrowRight, ArrowLeft, Loader2, Wand2, Info } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { api, ApiError } from '$lib/api';
  import { toast } from 'svelte-sonner';

  let { data }: { data: { existing: string } } = $props();

  // svelte-ignore state_referenced_locally — initial seed only
  let mode = $state<'markdown' | 'plain'>(data.existing ? 'markdown' : 'plain');
  // svelte-ignore state_referenced_locally — initial seed only
  let textArea = $state(data.existing);
  let working = $state(false);
  let workingLabel = $state('');

  const MARKDOWN_PLACEHOLDER = `# Jane Doe
Senior Software Engineer · jane@example.com · +1 555 555 5555 · Vancouver, Canada · linkedin.com/in/jane

## Summary
Backend engineer with 8 years of experience…

## Experience
### Senior Software Engineer — Acme Corp (2021 – Present)
- Shipped X that reduced Y by 40%.
- Led the migration to Z, cutting infra costs by $200k/yr.

## Projects
### Open-Source Library Foo
- 12k GitHub stars, used by Bar Inc and Baz Inc.

## Education
- BSc Computer Science, University of British Columbia (2016)

## Skills
- **Languages:** TypeScript, Python, Go
- **Infra:** AWS, Kubernetes, Postgres
`;

  const PLAIN_PLACEHOLDER = `Jane Doe
Senior Software Engineer
jane@example.com
+1 555 555 5555
Vancouver, Canada

Acme Corp - Senior Software Engineer
2021 - Present
Shipped X that reduced Y by 40%.
Led the migration to Z, cutting infra costs by $200k/yr.

Beta Co - Software Engineer
2019 - 2021
Built the analytics pipeline...

Education: BSc Computer Science, UBC, 2016
Skills: TypeScript, Python, Go, AWS, Kubernetes, Postgres`;

  async function saveAndContinue() {
    if (working) return;
    const text = textArea.trim();
    if (!text) {
      toast.error('Paste your CV first');
      return;
    }
    if (text.length < 50) {
      toast.error('That looks too short to be a CV');
      return;
    }
    working = true;
    try {
      let markdown = text;

      // Plain-text mode: convert to canonical markdown via Claude.
      if (mode === 'plain') {
        workingLabel = 'Converting to markdown…';
        const { markdown: converted } = await api.post<{ markdown: string }>(
          '/api/profile/cv-from-text',
          { text },
          { silent: true },
        );
        markdown = converted;
      }

      // Write cv.md.
      workingLabel = 'Saving cv.md…';
      await api.put('/api/profile/file/cv', { content: markdown }, { silent: true });

      // Auto-extract structured profile fields from cv.md so the user doesn't
      // have to manually re-enter their identity / superpowers / proof points
      // on the /profile page later. Failure here is non-fatal — the CV is
      // saved, the user can re-run reprocessing from /profile any time.
      try {
        workingLabel = 'Extracting profile fields…';
        await api.post('/api/profile/reprocess', {}, { silent: true });
      } catch (e) {
        // Don't block the wizard on a reprocess failure — log and continue.
        console.warn('reprocess failed, continuing anyway:', e);
      }

      await api.post('/api/onboarding/step', { step: 'cv', action: 'complete' }, { silent: true });
      toast.success('CV saved');
      await goto('/onboarding/targeting');
    } catch (e) {
      const err = e as ApiError;
      toast.error('Could not save CV', { description: err.message });
      working = false;
      workingLabel = '';
    }
  }
</script>

<div class="space-y-6">
  <header class="space-y-2">
    <h1 class="text-2xl font-semibold tracking-tight flex items-center gap-2">
      <FileText class="size-5 text-emerald-400" />
      CV
    </h1>
    <p class="text-sm text-muted-foreground leading-relaxed max-w-xl">
      Your CV is the source of truth — the system reads it on every job evaluation, every cover
      letter, every tailored CV PDF it generates. Paste it in clean markdown, or paste plain text
      and we'll convert it for you.
    </p>
  </header>

  <!-- Mode toggle -->
  <div class="grid grid-cols-2 gap-2">
    <button
      type="button"
      class={`rounded-md border px-4 py-3 text-left transition-colors ${
        mode === 'markdown'
          ? 'border-blue-500/40 bg-blue-500/5 ring-1 ring-blue-500/30'
          : 'border-border/40 bg-card hover:border-border/70'
      }`}
      onclick={() => (mode = 'markdown')}
    >
      <div class="flex items-center gap-1.5">
        <FileText class="size-3.5 text-blue-400" />
        <span class="text-xs font-semibold">Paste markdown</span>
      </div>
      <p class="mt-1 text-[11px] text-muted-foreground">
        You already have a markdown CV. We'll save it as-is.
      </p>
    </button>
    <button
      type="button"
      class={`rounded-md border px-4 py-3 text-left transition-colors ${
        mode === 'plain'
          ? 'border-fuchsia-500/40 bg-fuchsia-500/5 ring-1 ring-fuchsia-500/30'
          : 'border-border/40 bg-card hover:border-border/70'
      }`}
      onclick={() => (mode = 'plain')}
    >
      <div class="flex items-center gap-1.5">
        <Wand2 class="size-3.5 text-fuchsia-400" />
        <span class="text-xs font-semibold">Paste plain text</span>
      </div>
      <p class="mt-1 text-[11px] text-muted-foreground">
        Copy from Word, PDF, or LinkedIn. Claude converts to clean markdown.
      </p>
    </button>
  </div>

  <!-- Help banner -->
  <div class="rounded-md border border-border/40 bg-muted/20 px-3 py-2 flex items-start gap-2">
    <Info class="size-3.5 text-muted-foreground/80 mt-0.5 flex-shrink-0" />
    <p class="text-[11px] text-muted-foreground/90 leading-relaxed">
      {#if mode === 'markdown'}
        Use standard sections: <code class="font-mono text-[10px]">## Summary</code>,
        <code class="font-mono text-[10px]">## Experience</code>,
        <code class="font-mono text-[10px]">## Projects</code>,
        <code class="font-mono text-[10px]">## Education</code>,
        <code class="font-mono text-[10px]">## Skills</code>. Bullet experience with
        <code class="font-mono text-[10px]">-</code>. Use <code class="font-mono text-[10px]">###</code> for each role.
      {:else}
        Just paste — formatting doesn't matter. We'll structure it into the standard sections.
        Tip: from LinkedIn use "Save to PDF" then copy text out; from a Word CV use Select All →
        Copy.
      {/if}
    </p>
  </div>

  <!-- Textarea -->
  <div class="space-y-1.5">
    <Label for="cv-textarea" class="text-xs">
      {mode === 'markdown' ? 'Markdown CV' : 'Plain-text CV'}
    </Label>
    <textarea
      id="cv-textarea"
      bind:value={textArea}
      placeholder={mode === 'markdown' ? MARKDOWN_PLACEHOLDER : PLAIN_PLACEHOLDER}
      class="w-full min-h-[400px] rounded-md border border-border/60 bg-background px-3 py-2 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-y"
      disabled={working}
    ></textarea>
    <div class="flex items-center justify-between text-[10px] text-muted-foreground/70">
      <span>{textArea.length.toLocaleString()} chars</span>
      {#if data.existing && textArea === data.existing}
        <span>Loaded from existing cv.md — edit or replace</span>
      {/if}
    </div>
  </div>

  <div class="flex items-center justify-between pt-4 border-t border-border/40">
    <a href="/onboarding/identity" class="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
      <ArrowLeft class="size-3" /> Back
    </a>
    <Button onclick={saveAndContinue} disabled={working} class="gap-1.5">
      {#if working}
        <Loader2 class="size-3.5 animate-spin" /> {workingLabel || 'Saving…'}
      {:else}
        Continue<ArrowRight class="size-4" />
      {/if}
    </Button>
  </div>
</div>
