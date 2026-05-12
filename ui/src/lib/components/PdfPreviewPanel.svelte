<!--
  PdfPreviewPanel — collapsible iframe of a job's tailored CV PDF.

  Renders inline on the job detail page when `job.pdfFile` exists. The PDF
  is served by /api/job/[id]/pdf (Content-Disposition: inline) so the
  browser renders it natively. No PDF.js dependency needed — every modern
  browser ships a viewer.

  Header has Open-in-new-tab + Download + Collapse controls. The iframe
  uses display: none when collapsed (rather than removing) so we don't pay
  the re-render cost when the user re-opens.
-->
<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { ChevronRight, FileBadge2, Download, ExternalLink } from '@lucide/svelte';
  import { cn } from '$lib/utils';

  let {
    jobId,
    pdfFile,
    profileId,
    defaultOpen = true,
    class: className = '',
  }: {
    jobId: string;
    pdfFile: string;
    /** When set, appended as `?profile=<slug>` so the PDF endpoint reads
     *  from the right profile's output dir. Omit to default to active. */
    profileId?: string;
    defaultOpen?: boolean;
    class?: string;
  } = $props();

  // svelte-ignore state_referenced_locally — initial seed only.
  let open = $state(defaultOpen);
  let pq = $derived(profileId ? '?profile=' + encodeURIComponent(profileId) : '');
  let pdfUrl = $derived('/api/job/' + encodeURIComponent(jobId) + '/pdf' + pq);
</script>

<div class={cn('rounded-md border border-border/40 bg-card overflow-hidden', className)}>
  <button
    type="button"
    onclick={() => (open = !open)}
    aria-expanded={open}
    class="w-full flex items-center gap-2 px-3.5 py-2 hover:bg-muted/40 transition-colors text-left group/pdf-header"
  >
    <ChevronRight
      class={cn(
        'size-3.5 text-muted-foreground/60 transition-transform duration-200 ease-out',
        open && 'rotate-90',
      )}
    />
    <FileBadge2 class="size-3.5 text-emerald-400/80 flex-shrink-0" />
    <span class="text-xs font-medium">Tailored CV preview</span>
    <span class="text-[10px] font-mono text-muted-foreground/60 truncate">{pdfFile}</span>
    <div class="flex-1"></div>

    <!--
      Stop bubbling into the toggle button so clicking these icons opens the
      tab/download but DOESN'T also collapse the panel.
    -->
    <span
      class="flex items-center gap-0.5"
      role="presentation"
      onclick={(e) => e.stopPropagation()}
    >
      <Tooltip.Provider delayDuration={300}>
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <a
                {...props}
                href={pdfUrl}
                target="_blank"
                rel="noopener"
                class="size-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                aria-label="Open PDF in new tab"
              >
                <ExternalLink class="size-3.5" />
              </a>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content side="bottom" class="text-xs">Open in new tab</Tooltip.Content>
        </Tooltip.Root>
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <a
                {...props}
                href={pdfUrl}
                download={pdfFile}
                class="size-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                aria-label="Download PDF"
              >
                <Download class="size-3.5" />
              </a>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content side="bottom" class="text-xs">Download</Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>
    </span>
  </button>

  <!--
    grid-template-rows: 0fr ↔ 1fr animates height smoothly. We KEEP the iframe
    in the DOM when collapsed (display: none) so re-opening is instant.
  -->
  <div
    class={cn(
      'grid transition-[grid-template-rows] duration-200 ease-out',
      open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
    )}
  >
    <div class={cn('overflow-hidden min-h-0', !open && 'pointer-events-none')}>
      <div class="border-t border-border/40 bg-muted/20">
        <iframe
          src={pdfUrl}
          title="Tailored CV — {pdfFile}"
          class="w-full h-[720px] border-0 bg-white"
          loading="lazy"
        ></iframe>
      </div>
    </div>
  </div>
</div>
