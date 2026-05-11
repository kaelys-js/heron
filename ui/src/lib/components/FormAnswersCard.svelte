<!--
  FormAnswersCard — manage the persistent per-question answer cache.

  Renders on /profile in a CollapsibleCard. Each row is one saved answer
  with edit + delete affordances. The "Add answer" form lets the user
  seed common archetypal questions ("Notice period", "Salary", "Visa
  status", "Years of experience with X") before they ever apply.

  Why this lives on /profile vs /settings: the cache is per-profile, and
  users with multiple profiles (Software Engineering / Consulting / etc.)
  will have wildly different stock answers per identity.
-->
<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import { Plus, Trash2, Save, Loader2, Edit3, Info, MessageSquare, Sparkles } from '@lucide/svelte';
  import { api, ApiError } from '$lib/api';
  import { toast } from 'svelte-sonner';
  import { formatRelativeTime, cn, withMinDuration } from '$lib/utils';

  export type FormAnswer = {
    key: string;
    label: string;
    answer: string;
    updatedAt: number;
    useCount: number;
  };

  let {
    profileId,
    initialAnswers = [],
    initialStats = { total: 0, usedToday: 0, lastUpdatedAt: null as number | null },
  }: {
    profileId: string;
    initialAnswers?: FormAnswer[];
    initialStats?: { total: number; usedToday: number; lastUpdatedAt: number | null };
  } = $props();

  // svelte-ignore state_referenced_locally
  let answers = $state<FormAnswer[]>(initialAnswers);
  // svelte-ignore state_referenced_locally
  let stats = $state(initialStats);

  // Add-new form state.
  let newLabel = $state('');
  let newAnswer = $state('');
  let saving = $state(false);

  // Background seed-from-CV state. Spawns the seed-form-answers Claude
  // mode which reads cv.md + profile.yml and writes ~15-25 cache rows.
  let seedingFromCv = $state(false);

  // Edit-in-place state.
  let editingKey = $state<string | null>(null);
  let editLabel = $state('');
  let editAnswer = $state('');

  let suggestedQuestions = [
    'Notice period (weeks)',
    'Desired salary',
    'Visa / work authorization status',
    'Years of experience with TypeScript',
    'Years of experience with React',
    'Years of experience with Node.js',
    'Why this company?',
    'Why this role?',
    'When can you start?',
    'Are you authorized to work in this country?',
    'Will you now or in the future require visa sponsorship?',
    'How did you hear about us?',
  ];

  async function refresh() {
    try {
      const r = await api.get<{
        profileId: string;
        answers: FormAnswer[];
        stats: { total: number; usedToday: number; lastUpdatedAt: number | null };
      }>('/api/profile/form-answers?profile=' + encodeURIComponent(profileId), { silent: true });
      answers = r.answers;
      stats = r.stats;
    } catch (e) {
      const err = e as ApiError;
      toast.error('Refresh failed', { description: err.message });
    }
  }

  /**
   * Trigger the seed-form-answers Claude mode. Reads cv.md + profile.yml
   * and writes ~15-25 high-confidence cache rows (identity, work auth,
   * comp, behavioral templates, per-archetype YoE). Eliminates the
   * cold-cache dead-end that hits every first-time autonomous-apply user.
   */
  async function seedFromCv() {
    if (seedingFromCv) return;
    seedingFromCv = true;
    try {
      const r = await withMinDuration(
        api.post<{
          ok: boolean;
          rowsWritten?: number;
          rowsActuallyAdded?: number;
          error?: string;
        }>('/api/profile/seed-form-answers?profile=' + encodeURIComponent(profileId), {}, { silent: true }),
        600,
      );
      if (r.ok) {
        toast.success('Seeded from CV', {
          description: '+' + (r.rowsActuallyAdded ?? r.rowsWritten ?? 0) +
            ' new answers (existing entries left untouched). 30-60s via Claude.',
          duration: 8_000,
        });
        await refresh();
      } else {
        toast.error('Seed failed', { description: r.error ?? 'unknown' });
      }
    } catch (e) {
      const err = e as ApiError;
      toast.error('Seed failed', { description: err.message });
    } finally {
      seedingFromCv = false;
    }
  }

  async function saveNew() {
    if (saving) return;
    if (!newLabel.trim() || !newAnswer.trim()) return;
    saving = true;
    try {
      await api.post(
        '/api/profile/form-answers?profile=' + encodeURIComponent(profileId),
        { label: newLabel, answer: newAnswer },
        { silent: true },
      );
      toast.success('Answer saved', { description: newLabel.slice(0, 60) });
      newLabel = '';
      newAnswer = '';
      await refresh();
    } catch (e) {
      const err = e as ApiError;
      toast.error('Save failed', { description: err.message });
    } finally {
      saving = false;
    }
  }

  function startEdit(row: FormAnswer) {
    editingKey = row.key;
    editLabel = row.label;
    editAnswer = row.answer;
  }

  function cancelEdit() {
    editingKey = null;
    editLabel = '';
    editAnswer = '';
  }

  async function saveEdit() {
    if (!editingKey || saving) return;
    saving = true;
    try {
      await api.post(
        '/api/profile/form-answers?profile=' + encodeURIComponent(profileId),
        { label: editLabel, answer: editAnswer },
        { silent: true },
      );
      toast.success('Answer updated');
      cancelEdit();
      await refresh();
    } catch (e) {
      const err = e as ApiError;
      toast.error('Save failed', { description: err.message });
    } finally {
      saving = false;
    }
  }

  async function deleteOne(row: FormAnswer) {
    if (saving) return;
    saving = true;
    try {
      // DELETE with body isn't in the shared api helper, so we pass key
      // as a URL parameter — matches the endpoint's expectations.
      await api.delete(
        '/api/profile/form-answers?profile=' + encodeURIComponent(profileId) +
          '&key=' + encodeURIComponent(row.key),
        { silent: true },
      );
      toast.success('Answer deleted');
      await refresh();
    } catch (e) {
      const err = e as ApiError;
      toast.error('Delete failed', { description: err.message });
    } finally {
      saving = false;
    }
  }

  function quickFill(suggestion: string) {
    newLabel = suggestion;
    // Move focus to the answer textarea so the user can just type.
    requestAnimationFrame(() => {
      const ta = document.getElementById('new-answer-textarea') as HTMLTextAreaElement | null;
      ta?.focus();
    });
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title class="text-base flex items-center gap-2">
      <MessageSquare class="size-4 text-fuchsia-400" />
      Form-answers cache
    </Card.Title>
    <Card.Description>
      Reusable answers for the questions every job application asks. apply-greenhouse.py and
      apply-ashby.py read this cache when filling forms — adding "Notice period: 2 weeks" once
      eliminates retyping it for every job. Per-profile.
    </Card.Description>
  </Card.Header>
  <Card.Content class="space-y-4">
    <!-- Stats strip + seed-from-CV button -->
    <div class="flex items-center gap-3 text-xs flex-wrap">
      <span class="text-muted-foreground">
        <span class="font-mono text-foreground">{stats.total}</span> saved
      </span>
      <span class="text-muted-foreground">·</span>
      <span class="text-muted-foreground">
        <span class="font-mono">{stats.usedToday}</span> updated today
      </span>
      {#if stats.lastUpdatedAt}
        <span class="text-muted-foreground">·</span>
        <span class="text-muted-foreground">last edit {formatRelativeTime(stats.lastUpdatedAt)}</span>
      {/if}
      <div class="flex-1"></div>
      <!--
        Seed-from-CV — closes the cold-cache gap. Onboarding fires this
        automatically; this button is for re-seed after the user updates
        cv.md or profile.yml. Only NEW keys are added — existing answers
        are never overwritten.
      -->
      <Button
        size="sm"
        variant="outline"
        onclick={seedFromCv}
        disabled={seedingFromCv}
        class="gap-1.5 h-7 text-[11px]"
      >
        {#if seedingFromCv}
          <Loader2 class="size-3 animate-spin" /> Seeding…
        {:else}
          <Sparkles class="size-3 text-fuchsia-400" />
          {stats.total === 0 ? 'Seed from CV + profile' : 'Re-seed from CV'}
        {/if}
      </Button>
    </div>

    <!-- Add new -->
    <div class="rounded-md border border-border/40 bg-card px-3 py-3 space-y-2">
      <Label class="text-xs" for="new-label">Add an answer</Label>
      <Input
        id="new-label"
        type="text"
        placeholder="Question label (e.g. 'Notice period')"
        bind:value={newLabel}
        class="h-9 text-sm"
      />
      <Textarea
        id="new-answer-textarea"
        placeholder="Answer"
        bind:value={newAnswer}
        rows={3}
        class="text-sm"
      />
      <div class="flex items-center gap-2 flex-wrap">
        <Button size="sm" onclick={saveNew} disabled={saving || !newLabel.trim() || !newAnswer.trim()} class="gap-1.5">
          {#if saving}<Loader2 class="size-3 animate-spin" />{:else}<Plus class="size-3" />{/if}
          Save answer
        </Button>
        <span class="text-[10px] text-muted-foreground/70">Or pick a common one:</span>
        {#each suggestedQuestions.slice(0, 6) as q}
          <button
            type="button"
            onclick={() => quickFill(q)}
            class="text-[10px] px-1.5 py-0.5 rounded border border-border/40 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
          >{q}</button>
        {/each}
      </div>
    </div>

    <!-- List -->
    {#if answers.length === 0}
      <div class="rounded-md border border-dashed border-border/40 px-3 py-6 text-center">
        <Info class="size-5 text-muted-foreground/60 mx-auto mb-1" />
        <p class="text-xs text-muted-foreground">
          No answers saved yet. Seed common ones above, or they'll auto-save the first time you
          use the "Pre-fill application answers" action on a job.
        </p>
      </div>
    {:else}
      <div class="space-y-1.5">
        {#each answers as row (row.key)}
          {#if editingKey === row.key}
            <div class="rounded-md border border-fuchsia-500/40 bg-fuchsia-500/5 px-3 py-2.5 space-y-2">
              <Input bind:value={editLabel} class="h-9 text-sm" />
              <Textarea bind:value={editAnswer} rows={3} class="text-sm" />
              <div class="flex items-center gap-2">
                <Button size="sm" onclick={saveEdit} disabled={saving} class="gap-1.5">
                  {#if saving}<Loader2 class="size-3 animate-spin" />{:else}<Save class="size-3" />{/if}
                  Save
                </Button>
                <Button variant="ghost" size="sm" onclick={cancelEdit}>Cancel</Button>
              </div>
            </div>
          {:else}
            <div class="flex items-start gap-3 rounded-md border border-border/40 bg-card px-3 py-2">
              <div class="flex-1 min-w-0 space-y-0.5">
                <div class="text-xs font-medium truncate">{row.label}</div>
                <div class="text-[11px] text-muted-foreground/80 whitespace-pre-wrap line-clamp-2 leading-snug">{row.answer}</div>
                <div class="text-[10px] text-muted-foreground/60 flex items-center gap-2">
                  <span class="font-mono">{row.key.slice(0, 40)}</span>
                  {#if row.useCount > 0}
                    <span>·</span>
                    <span>used {row.useCount}×</span>
                  {/if}
                </div>
              </div>
              <Button variant="ghost" size="sm" class="h-7 text-[11px] gap-1" onclick={() => startEdit(row)}>
                <Edit3 class="size-3" /> Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class={cn('h-7 text-[11px] gap-1 text-muted-foreground hover:text-red-300', saving && 'opacity-50')}
                onclick={() => deleteOne(row)}
                disabled={saving}
              >
                <Trash2 class="size-3" />
              </Button>
            </div>
          {/if}
        {/each}
      </div>
    {/if}

    <p class="text-[10px] text-muted-foreground/60 leading-relaxed pt-1 border-t border-border/30">
      Storage: <code class="font-mono">data/profiles/{profileId}/form-answers-cache.jsonl</code>.
      Question labels are normalized (lowercase, no punctuation, stripped of "the/a/an/please") so
      "Why this role?" and "why-this-role" hit the same cache slot.
    </p>
  </Card.Content>
</Card.Root>
