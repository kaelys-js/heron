<!--
  BackupsCard — render the backups list + manual trigger + restore /
  delete actions on /settings.

  Data flow:
    Initial paint: data from +page.server.ts (listBackups() + config).
    "Back up now": POST /api/backup/run, refresh via invalidateAll().
    Restore: POST /api/backup/restore with a "RESTORE" typed confirm.
    Delete:  DELETE /api/backup/[id] with a confirm gate.
    Download: GET /api/backup/[id] in a new tab.
    Retention: PUT /api/backup/config; debounces user input.

  Restore safety:
    - Disabled while any orchestrator task is running.
    - Requires the user to type "RESTORE" before the button enables.
    - The server-side also refuses if listRunning() is non-empty.
-->
<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Dialog from '$lib/components/ui/dialog';
  import {
    Archive, Download, Trash2, RotateCcw, Loader2, AlertTriangle, Info,
    CheckCircle2, RefreshCw,
  } from '@lucide/svelte';
  import { api, ApiError } from '$lib/api';
  import { toast } from 'svelte-sonner';
  import { invalidateAll } from '$app/navigation';
  import { formatRelativeTime, cn, withMinDuration } from '$lib/utils';

  export type BackupInfo = {
    id: string;
    path: string;
    metaPath: string;
    size: number;
    createdAt: number;
    fileCount?: number;
    profiles?: string[];
    app?: string;
  };

  let {
    initialBackups = [],
    initialConfig = { retentionDays: 14 },
  }: {
    initialBackups?: BackupInfo[];
    initialConfig?: { retentionDays: number };
  } = $props();

  // svelte-ignore state_referenced_locally — initial seed; user actions update.
  let backups = $state<BackupInfo[]>(initialBackups);
  // svelte-ignore state_referenced_locally — initial seed.
  let retentionDays = $state<number>(initialConfig.retentionDays);

  let busyBackup = $state(false);
  let busyDelete = $state<string | null>(null);
  let restoreTarget = $state<BackupInfo | null>(null);
  let restoreConfirmInput = $state('');
  let restoreInFlight = $state(false);

  // Retention save state — debounced via a small timer so typing doesn't
  // hit the endpoint on every keystroke.
  let retentionSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let retentionSaving = $state(false);

  // Refresh helper — pulls latest list + config from /api/backup/list.
  async function refresh() {
    try {
      const r = await api.get<{ backups: BackupInfo[]; config: { retentionDays: number } }>(
        '/api/backup/list',
        { silent: true },
      );
      backups = r.backups;
      retentionDays = r.config.retentionDays;
    } catch (e) {
      const err = e as ApiError;
      toast.error('Failed to refresh backup list', { description: err.message });
    }
  }

  async function backupNow() {
    if (busyBackup) return;
    busyBackup = true;
    try {
      const r = await withMinDuration(
        api.post<{ ok: boolean; id?: string; size?: number; fileCount?: number; pruned?: number; error?: string }>(
          '/api/backup/run',
          {},
          { silent: true },
        ),
        600,
      );
      if (r.ok) {
        const mb = ((r.size ?? 0) / 1024 / 1024).toFixed(1);
        toast.success('Backup created · ' + (r.id ?? ''), {
          description: `${r.fileCount ?? '?'} files · ${mb} MB` +
            (r.pruned ? ` · pruned ${r.pruned} old` : ''),
          duration: 6_000,
        });
        await refresh();
        await invalidateAll();
      } else {
        toast.error('Backup failed', { description: r.error ?? 'unknown error' });
      }
    } catch (e) {
      const err = e as ApiError;
      toast.error('Backup failed', { description: err.message });
    } finally {
      busyBackup = false;
    }
  }

  async function deleteOne(b: BackupInfo) {
    if (busyDelete) return;
    busyDelete = b.id;
    try {
      await api.delete('/api/backup/' + encodeURIComponent(b.id), { silent: true });
      toast.success('Backup deleted', { description: b.id });
      await refresh();
    } catch (e) {
      const err = e as ApiError;
      toast.error('Delete failed', { description: err.message });
    } finally {
      busyDelete = null;
    }
  }

  function downloadOne(b: BackupInfo) {
    // Open the download URL in a new window — the server sets
    // Content-Disposition so the browser saves it instead of navigating.
    window.open('/api/backup/' + encodeURIComponent(b.id), '_blank');
  }

  function openRestoreDialog(b: BackupInfo) {
    restoreTarget = b;
    restoreConfirmInput = '';
  }

  async function doRestore() {
    if (!restoreTarget || restoreInFlight) return;
    if (restoreConfirmInput.trim().toUpperCase() !== 'RESTORE') return;
    restoreInFlight = true;
    try {
      const r = await api.post<{ ok: boolean; id?: string; restoredFiles?: number; error?: string }>(
        '/api/backup/restore',
        { id: restoreTarget.id },
        { silent: true },
      );
      if (r.ok) {
        toast.success('Restored from ' + (r.id ?? ''), {
          description: (r.restoredFiles ?? 0) + ' files restored. The dashboard may need a refresh.',
          duration: 8_000,
        });
        restoreTarget = null;
        await invalidateAll();
      } else {
        toast.error('Restore failed', { description: r.error ?? 'unknown error', duration: 10_000 });
      }
    } catch (e) {
      const err = e as ApiError;
      toast.error('Restore failed', { description: err.message, duration: 10_000 });
    } finally {
      restoreInFlight = false;
    }
  }

  function onRetentionInput(e: Event) {
    const v = parseInt((e.currentTarget as HTMLInputElement).value, 10);
    if (!Number.isFinite(v)) return;
    retentionDays = v;
    if (retentionSaveTimer) clearTimeout(retentionSaveTimer);
    retentionSaveTimer = setTimeout(() => saveRetention(), 600);
  }

  async function saveRetention() {
    retentionSaving = true;
    try {
      await api.put('/api/backup/config', { retentionDays }, { silent: true });
      toast.success('Retention saved · ' + retentionDays + ' days');
    } catch (e) {
      const err = e as ApiError;
      toast.error('Save failed', { description: err.message });
    } finally {
      retentionSaving = false;
    }
  }

  function humanSize(n: number): string {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
    return (n / 1024 / 1024 / 1024).toFixed(1) + ' GB';
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title class="text-base flex items-center gap-2">
      <Archive class="size-4 text-fuchsia-400" />
      Backups
    </Card.Title>
    <Card.Description>
      Nightly snapshots of every profile dir (cv.md, profile.yml, applications.md, reports/, output/,
      interview-prep/) plus shared infra (autopilot.json, profiles.json, issues.jsonl, story-bank.md).
      Excludes <code class="font-mono text-[10px]">.env</code> and browser sessions — restore brings
      data back, not credentials.
    </Card.Description>
  </Card.Header>
  <Card.Content class="space-y-4">
    <!-- Controls -->
    <div class="flex items-center gap-3 flex-wrap rounded-md border border-border/40 bg-muted/20 px-3 py-2.5">
      <Button onclick={backupNow} disabled={busyBackup} size="sm" class="gap-1.5">
        {#if busyBackup}
          <Loader2 class="size-3.5 animate-spin" /> Creating…
        {:else}
          <Archive class="size-3.5" /> Back up now
        {/if}
      </Button>
      <Button variant="ghost" size="sm" onclick={refresh} class="gap-1.5" disabled={busyBackup}>
        <RefreshCw class="size-3.5" /> Refresh
      </Button>
      <div class="flex-1"></div>
      <Label for="retention-days" class="text-xs text-muted-foreground">Keep last</Label>
      <Input
        id="retention-days"
        type="number"
        min="1"
        max="365"
        class="h-8 text-xs w-20"
        value={retentionDays}
        oninput={onRetentionInput}
      />
      <span class="text-xs text-muted-foreground">days</span>
      {#if retentionSaving}
        <Loader2 class="size-3 animate-spin text-muted-foreground" />
      {/if}
    </div>

    <!-- List -->
    {#if backups.length === 0}
      <div class="rounded-md border border-dashed border-border/40 px-3 py-6 text-center">
        <Info class="size-5 text-muted-foreground/60 mx-auto mb-1" />
        <p class="text-xs text-muted-foreground">
          No backups yet. The autopilot runs nightly at 02:00, or click "Back up now" above to make one.
        </p>
      </div>
    {:else}
      <div class="space-y-1.5">
        {#each backups as b (b.id)}
          <div class="flex items-center gap-3 rounded-md border border-border/40 bg-card px-3 py-2">
            <CheckCircle2 class="size-3.5 text-emerald-400 flex-shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="text-xs font-mono truncate">{b.id}</div>
              <div class="text-[10px] text-muted-foreground/80 flex items-center gap-2 flex-wrap">
                <span>{formatRelativeTime(b.createdAt)}</span>
                <span>·</span>
                <span>{humanSize(b.size)}</span>
                {#if b.fileCount != null}
                  <span>·</span>
                  <span>{b.fileCount} files</span>
                {/if}
                {#if b.profiles && b.profiles.length > 0}
                  <span>·</span>
                  <span class="truncate">profiles: {b.profiles.join(', ')}</span>
                {/if}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              class="h-7 text-[11px] gap-1"
              onclick={() => downloadOne(b)}
              aria-label="Download {b.id}"
            >
              <Download class="size-3" /> Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="h-7 text-[11px] gap-1 text-amber-300 hover:text-amber-200"
              onclick={() => openRestoreDialog(b)}
              aria-label="Restore {b.id}"
            >
              <RotateCcw class="size-3" /> Restore
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class={cn(
                'h-7 text-[11px] gap-1 text-muted-foreground hover:text-red-300',
                busyDelete === b.id && 'opacity-50',
              )}
              onclick={() => deleteOne(b)}
              disabled={busyDelete === b.id}
              aria-label="Delete {b.id}"
            >
              {#if busyDelete === b.id}
                <Loader2 class="size-3 animate-spin" />
              {:else}
                <Trash2 class="size-3" />
              {/if}
            </Button>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Footnote -->
    <div class="rounded-md border border-border/40 bg-muted/10 px-3 py-2 flex items-start gap-2">
      <Info class="size-3 text-muted-foreground/60 mt-0.5 flex-shrink-0" />
      <p class="text-[10px] text-muted-foreground/70 leading-relaxed">
        Backups live under <code class="font-mono">data/backups/</code> on this machine — they're
        local-only. Add the dir to your Time Machine / rsync target for offsite redundancy.
        <code class="font-mono">.env</code> stays outside; back up your API keys manually.
      </p>
    </div>
  </Card.Content>
</Card.Root>

<!-- Restore confirmation dialog -->
<Dialog.Root open={restoreTarget !== null} onOpenChange={(v: boolean) => { if (!v) restoreTarget = null; }}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        <AlertTriangle class="size-4 text-amber-400" />
        Restore from backup?
      </Dialog.Title>
      <Dialog.Description class="space-y-2 pt-2">
        This will <strong>overwrite</strong> every profile dir + shared infra file with the snapshot from
        <code class="font-mono text-foreground">{restoreTarget?.id ?? ''}</code>.
      </Dialog.Description>
    </Dialog.Header>
    <div class="space-y-2 text-xs text-muted-foreground">
      {#if restoreTarget?.profiles && restoreTarget.profiles.length > 0}
        <p>
          Profiles in this snapshot:
          <span class="font-mono text-foreground">{restoreTarget.profiles.join(', ')}</span>
        </p>
      {/if}
      <p>
        Current state is saved to <code class="font-mono">.pre-restore-{restoreTarget?.id ?? ''}/</code>
        inside the backups dir so you can roll back manually if needed.
      </p>
      <p class="text-amber-200">
        <code class="font-mono">.env</code> is NOT touched. Type <strong>RESTORE</strong> to confirm.
      </p>
    </div>
    <div class="space-y-1.5 pt-1">
      <Label class="text-xs" for="restore-confirm">Type RESTORE to confirm</Label>
      <Input
        id="restore-confirm"
        type="text"
        autocomplete="off"
        placeholder="RESTORE"
        bind:value={restoreConfirmInput}
        class="h-9 text-sm font-mono"
      />
    </div>
    <Dialog.Footer class="gap-2">
      <Button variant="ghost" onclick={() => (restoreTarget = null)}>Cancel</Button>
      <Button
        variant="destructive"
        onclick={doRestore}
        disabled={restoreConfirmInput.trim().toUpperCase() !== 'RESTORE' || restoreInFlight}
        class="gap-1.5"
      >
        {#if restoreInFlight}
          <Loader2 class="size-3.5 animate-spin" /> Restoring…
        {:else}
          <RotateCcw class="size-3.5" /> Restore
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
