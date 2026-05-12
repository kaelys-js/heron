<script lang="ts">
  /**
   * InterviewerPanel — surfaces the interviewer list for a job + lets
   * the user add new ones, generate a per-interviewer dossier, generate
   * 10-questions-to-ask, and draft a thank-you after the call.
   *
   * Props:
   *   jobId
   *   profileId
   *   interviewers — current list (from +page.server.ts data.interviewers)
   *
   * State is rerendered after each mutation by calling invalidateAll().
   */

  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { invalidateAll } from '$app/navigation';
  import { api } from '$lib/api';
  import { toast } from 'svelte-sonner';
  import { Plus, Trash2, FileText, MessageCircleQuestion, Send, RefreshCw } from '@lucide/svelte';

  type Interviewer = {
    slug: string;
    name: string;
    title?: string;
    email?: string;
    linkedinUrl?: string;
    stage: string;
    scheduledAt?: number;
    dossierPath?: string;
    questionsPath?: string;
    thankYouPath?: string;
    notes?: string;
    updatedAt: number;
  };

  let {
    jobId,
    profileId,
    interviewers,
  }: { jobId: string; profileId: string; interviewers: Interviewer[] } = $props();

  const STAGES = [
    'recruiter-screen',
    'hiring-manager-screen',
    'tech-screen',
    'take-home',
    'onsite',
    'final-round',
    'reference',
    'unknown',
  ];

  let showAddForm = $state(false);
  let formName = $state('');
  let formTitle = $state('');
  let formStage = $state<string>('hiring-manager-screen');
  let formScheduledAt = $state('');
  let formLinkedin = $state('');
  let busy = $state<string | null>(null);

  async function addInterviewer() {
    if (!formName.trim()) {
      toast.error('Name required');
      return;
    }
    busy = 'add';
    try {
      const body = {
        name: formName,
        title: formTitle || undefined,
        stage: formStage,
        scheduledAt: formScheduledAt ? new Date(formScheduledAt).getTime() : undefined,
        linkedinUrl: formLinkedin || undefined,
      };
      const res = await api.post<{ ok: boolean }>(`/api/job/${jobId}/interviewers`, body);
      if (res.ok) {
        toast.success('Interviewer added');
        showAddForm = false;
        formName = '';
        formTitle = '';
        formStage = 'hiring-manager-screen';
        formScheduledAt = '';
        formLinkedin = '';
        await invalidateAll();
      }
    } finally {
      busy = null;
    }
  }

  async function generateDossier(slug: string) {
    busy = 'dossier:' + slug;
    try {
      const res = await api.post<{ ok: boolean; dossierPath?: string }>(
        `/api/job/${jobId}/interviewers/${slug}/dossier`,
        {},
      );
      if (res.ok && res.dossierPath) {
        toast.success('Dossier ready');
        await invalidateAll();
      } else {
        toast.error('Dossier generation failed');
      }
    } finally {
      busy = null;
    }
  }

  async function generateQuestions(slug: string) {
    busy = 'q:' + slug;
    try {
      const res = await api.post<{ ok: boolean; questionsPath?: string }>(
        `/api/job/${jobId}/interviewers/${slug}/questions`,
        {},
      );
      if (res.ok && res.questionsPath) {
        toast.success('Questions ready');
        await invalidateAll();
      } else {
        toast.error('Questions generation failed');
      }
    } finally {
      busy = null;
    }
  }

  async function generateThankYou(slug: string) {
    const talkingPoints = window.prompt(
      'Talking points from the call (1-3 specific things — these get woven into the note):',
      '',
    );
    if (talkingPoints === null) return;
    busy = 'ty:' + slug;
    try {
      const res = await api.post<{ ok: boolean; thankYouPath?: string }>(
        `/api/job/${jobId}/interviewers/${slug}/thank-you`,
        { talkingPoints },
      );
      if (res.ok && res.thankYouPath) {
        toast.success('Thank-you note drafted');
        await invalidateAll();
      } else {
        toast.error('Thank-you generation failed');
      }
    } finally {
      busy = null;
    }
  }

  async function removeInterviewer(slug: string) {
    if (!window.confirm('Remove ' + slug + '?')) return;
    busy = 'rm:' + slug;
    try {
      const res = await api.delete<{ ok: boolean }>(`/api/job/${jobId}/interviewers/${slug}`);
      if (res.ok) {
        toast.success('Removed');
        await invalidateAll();
      }
    } finally {
      busy = null;
    }
  }

  function fmtDate(ms?: number): string {
    if (!ms) return 'no time';
    return new Date(ms).toLocaleString();
  }
</script>

<section
  id="interview-panel"
  class="space-y-4 rounded-lg border border-zinc-700 bg-zinc-900/40 p-5"
>
  <header class="flex items-center justify-between">
    <h3 class="text-base font-medium">Interview panel</h3>
    <Button size="sm" variant="ghost" onclick={() => (showAddForm = !showAddForm)}>
      <Plus class="size-3.5 mr-1" />
      Add
    </Button>
  </header>

  {#if showAddForm}
    <div class="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
      <input
        bind:value={formName}
        placeholder="Name (e.g. Sarah Chen)"
        class="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
      />
      <input
        bind:value={formTitle}
        placeholder="Title (e.g. Engineering Manager)"
        class="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
      />
      <select
        bind:value={formStage}
        class="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
      >
        {#each STAGES as s}
          <option value={s}>{s}</option>
        {/each}
      </select>
      <input
        type="datetime-local"
        bind:value={formScheduledAt}
        class="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
      />
      <input
        bind:value={formLinkedin}
        placeholder="LinkedIn URL (optional)"
        class="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
      />
      <div class="flex gap-2">
        <Button size="sm" onclick={addInterviewer} disabled={busy === 'add'}>
          {busy === 'add' ? 'Adding...' : 'Save'}
        </Button>
        <Button size="sm" variant="ghost" onclick={() => (showAddForm = false)}>Cancel</Button>
      </div>
    </div>
  {/if}

  {#if interviewers.length === 0}
    <p class="text-sm text-zinc-500">
      No interviewers logged. Add someone above to start generating dossiers, questions, and
      thank-you notes.
    </p>
  {:else}
    <div class="space-y-3">
      {#each interviewers as iv (iv.slug)}
        <div
          id={'interviewer-' + iv.slug}
          class="rounded-md border border-zinc-800 bg-zinc-950/40 p-3"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <span class="font-medium">{iv.name}</span>
                <Badge variant="outline" class="text-xs">{iv.stage}</Badge>
                {#if iv.linkedinUrl}
                  <a
                    href={iv.linkedinUrl}
                    target="_blank"
                    rel="noopener"
                    class="text-xs text-cyan-400 hover:underline">LinkedIn</a
                  >
                {/if}
              </div>
              {#if iv.title}
                <div class="text-xs text-zinc-400">{iv.title}</div>
              {/if}
              <div class="text-xs text-zinc-500">Scheduled: {fmtDate(iv.scheduledAt)}</div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onclick={() => removeInterviewer(iv.slug)}
              disabled={busy === 'rm:' + iv.slug}
              title="Remove this interviewer"
            >
              <Trash2 class="size-3.5" />
            </Button>
          </div>

          <div class="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={iv.dossierPath ? 'ghost' : 'outline'}
              onclick={() => generateDossier(iv.slug)}
              disabled={busy === 'dossier:' + iv.slug}
            >
              <FileText class="size-3.5 mr-1" />
              {iv.dossierPath ? 'Dossier ready' : 'Generate dossier'}
            </Button>
            <Button
              size="sm"
              variant={iv.questionsPath ? 'ghost' : 'outline'}
              onclick={() => generateQuestions(iv.slug)}
              disabled={busy === 'q:' + iv.slug}
            >
              <MessageCircleQuestion class="size-3.5 mr-1" />
              {iv.questionsPath ? 'Questions ready' : 'Questions to ask'}
            </Button>
            <Button
              size="sm"
              id={'thank-you-' + iv.slug}
              variant={iv.thankYouPath ? 'ghost' : 'outline'}
              onclick={() => generateThankYou(iv.slug)}
              disabled={busy === 'ty:' + iv.slug}
            >
              <Send class="size-3.5 mr-1" />
              {iv.thankYouPath ? 'Thank-you ready' : 'Draft thank-you'}
            </Button>
            {#if iv.dossierPath || iv.questionsPath || iv.thankYouPath}
              <Button size="sm" variant="ghost" onclick={() => generateDossier(iv.slug)}>
                <RefreshCw class="size-3 mr-1" />
                Refresh
              </Button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>
