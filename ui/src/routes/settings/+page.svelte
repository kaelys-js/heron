<script lang="ts">
  import Topbar from '$lib/components/Topbar.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Badge } from '$lib/components/ui/badge';
  import * as Card from '$lib/components/ui/card';
  import BackupsCard, { type BackupInfo } from '$lib/components/BackupsCard.svelte';
  import PushNotificationsToggle from '$lib/components/PushNotificationsToggle.svelte';
  import ProfileSettingsCard from '$lib/components/ProfileSettingsCard.svelte';
  import { toast } from 'svelte-sonner';
  import { ApiError, api } from '$lib/api';
  import {
    ExternalLink,
    KeyRound,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Eye,
    EyeOff,
    RotateCw,
    Sparkles,
    Activity,
  } from '@lucide/svelte';
  import { cn } from '$lib/utils';
  import { onMount } from 'svelte';

  /** Compact "Nm/Nh/Nd ago" formatter for the health card. */
  function sinceShort(ts: number): string {
    const dt = Date.now() - ts;
    if (dt < 60_000) return 'just now';
    if (dt < 3600_000) return Math.floor(dt / 60_000) + 'm ago';
    if (dt < 86_400_000) return Math.floor(dt / 3600_000) + 'h ago';
    return Math.floor(dt / 86_400_000) + 'd ago';
  }

  // /api/health snapshot — surfaced at the top so the user sees pipeline
  // freshness + key configuration without leaving Settings. Refreshes on
  // mount only; click Refresh to re-poll.
  type HealthSnapshot = {
    pipeline: { exists: boolean; size?: number; mtime?: number; stale: boolean };
    reports: { count: number };
    gemini: { scoresExists: boolean; keyConfigured: boolean };
    anthropic: { keyConfigured: boolean };
    runningTasks: string[];
    lastScanAt: number | null;
  };
  let health = $state<HealthSnapshot | null>(null);
  let healthLoading = $state(false);
  async function refreshHealth() {
    healthLoading = true;
    try {
      health = await api.get<HealthSnapshot>('/api/health', { silent: true });
    } catch {
      /* leave previous snapshot in place */
    } finally {
      healthLoading = false;
    }
  }
  onMount(() => {
    void refreshHealth();
  });

  let {
    data,
  }: {
    data: {
      env: Record<string, string>;
      backups: BackupInfo[];
      backupConfig: { retentionDays: number };
    };
  } = $props();

  type ProviderKey = 'ANTHROPIC_API_KEY' | 'GEMINI_API_KEY' | 'ADZUNA_APP_ID' | 'ADZUNA_APP_KEY';

  // svelte-ignore state_referenced_locally — `data.env` is intentionally the seed; env takes over after save.
  let env = $state<Record<string, string>>({ ...data.env });
  let pending = $state<Record<string, string>>({});
  let revealed = $state<Record<string, boolean>>({});
  let saving = $state(false);

  type ProbeOutcome = { ok: boolean; message: string; ts: number };
  let probes = $state<Record<string, ProbeOutcome | null>>({
    anthropic: null,
    gemini: null,
    adzuna: null,
  });
  let probing = $state<Record<string, boolean>>({
    anthropic: false,
    gemini: false,
    adzuna: false,
  });

  type Field = {
    key: ProviderKey;
    label: string;
    placeholder: string;
    help: string;
    signupUrl?: string;
    signupLabel?: string;
    pattern?: RegExp;
    patternHint?: string;
    provider?: 'anthropic' | 'gemini' | 'adzuna';
  };

  const fields: Field[] = [
    {
      key: 'ANTHROPIC_API_KEY',
      label: 'Anthropic',
      placeholder: 'sk-ant-api03-…',
      help: 'Powers Claude — used for deep job evaluations, the agent chat, mock interviews, interview prep, and negotiation drafts.',
      signupUrl: 'https://console.anthropic.com/settings/keys',
      signupLabel: 'Get a key',
      pattern: /^sk-ant-(api03|admin01)-/,
      patternHint: 'Should start with sk-ant-api03-',
      provider: 'anthropic',
    },
    {
      key: 'GEMINI_API_KEY',
      label: 'Gemini',
      placeholder: 'AIza…',
      help: 'Free tier covers ~1M tokens/day. Used to score job listings before deeper Claude evaluation — keeps costs low.',
      signupUrl: 'https://aistudio.google.com/apikey',
      signupLabel: 'Free key',
      pattern: /^AIza[A-Za-z0-9_\-]{30,}$/,
      patternHint: 'Should start with AIza and be 39+ chars',
      provider: 'gemini',
    },
    {
      key: 'ADZUNA_APP_ID',
      label: 'Adzuna App ID',
      placeholder: 'a1b2c3d4',
      help: 'Optional. Adds Adzuna to your job sources alongside LinkedIn, Indeed, Greenhouse, and Ashby.',
      signupUrl: 'https://developer.adzuna.com',
      signupLabel: 'Sign up',
      pattern: /^[a-f0-9]{8}$/i,
      patternHint: '8 hex characters',
      provider: 'adzuna',
    },
    {
      key: 'ADZUNA_APP_KEY',
      label: 'Adzuna App Key',
      placeholder: '0123456789abcdef0123456789abcdef',
      help: '',
      pattern: /^[a-f0-9]{32}$/i,
      patternHint: '32 hex characters',
    },
  ];

  function isMasked(key: string): boolean {
    const v = env[key];
    return !!v && v.startsWith('****');
  }

  function isConnected(key: string): boolean {
    return isMasked(key) && pending[key] == null;
  }

  function dirtyValue(key: string): string | null {
    const p = pending[key];
    if (p == null) return null;
    return p;
  }

  function isDirty(key: string): boolean {
    return pending[key] != null && pending[key] !== '';
  }

  function fieldValidation(f: Field): { ok: boolean; message: string } | null {
    const value = pending[f.key];
    if (value == null || value === '') return null;
    if (f.pattern && !f.pattern.test(value)) {
      return { ok: false, message: f.patternHint ?? 'Invalid format' };
    }
    return { ok: true, message: 'Looks good' };
  }

  function setField(key: string, value: string) {
    pending = { ...pending, [key]: value };
  }

  function clearField(key: string) {
    const next = { ...pending };
    delete next[key];
    pending = next;
  }

  function toggleReveal(key: string) {
    revealed = { ...revealed, [key]: !revealed[key] };
  }

  let dirtyCount = $derived(
    Object.values(pending).filter((v) => v && !v.startsWith('****')).length,
  );
  let canSave = $derived(
    dirtyCount > 0 &&
      fields.every((f) => {
        const v = fieldValidation(f);
        return v == null || v.ok;
      }),
  );

  async function save() {
    if (!canSave || saving) return;
    saving = true;
    try {
      const r = await api.post<{ current: Record<string, string> }>('/api/settings', pending, {
        successToast: {
          title: 'Settings saved',
          description: 'Active immediately — no restart needed.',
        },
        inlineError: true,
      });
      env = { ...r.current };
      pending = {};
      revealed = {};
      probes = { anthropic: null, gemini: null, adzuna: null };
    } catch (e) {
      const err = e as ApiError;
      toast.error('Failed to save settings', {
        description: err.message,
        duration: 10_000,
      });
    } finally {
      saving = false;
    }
  }

  async function probe(provider: 'anthropic' | 'gemini' | 'adzuna') {
    if (probing[provider]) return;
    probing = { ...probing, [provider]: true };
    try {
      const r = await api.post<{ ok: boolean; provider: string; message: string }>(
        '/api/settings/test',
        { provider },
        { silent: true },
      );
      probes = { ...probes, [provider]: { ok: r.ok, message: r.message, ts: Date.now() } };
    } catch (e) {
      const err = e as ApiError;
      probes = {
        ...probes,
        [provider]: { ok: false, message: err.message ?? 'Test failed', ts: Date.now() },
      };
    } finally {
      probing = { ...probing, [provider]: false };
    }
  }

  // Bookmarklet wrapper. Loads /bookmarklet.js from the dashboard at click
  // time so updates ship without users having to re-drag the bookmark. The
  // wrapper hard-codes the host so the bookmarklet knows where to POST when
  // it's running on a third-party domain (greenhouse.io, ashbyhq.com, etc.).
  let bookmarkletHref = $derived.by(() => {
    if (typeof window === 'undefined') return '#';
    const host = window.location.origin;
    const code =
      "(function(){window.__CAREER_OPS_HOST__='" +
      host +
      "';" +
      "var s=document.createElement('script');" +
      "s.src='" +
      host +
      "/bookmarklet.js?t='+Date.now();" +
      'document.body.appendChild(s);})();';
    return 'javascript:' + encodeURIComponent(code);
  });

  async function linkedinLogin() {
    toast.info('Opening LinkedIn…', {
      description:
        'A headed browser window will open. Log in, then close it — the cookies persist.',
    });
    try {
      await api.post('/api/run', { task: 'apply-linkedin-login' }, { silent: true });
      toast.success('LinkedIn login launched', {
        description:
          'Watch the activity feed for browser-side events. Login is saved automatically.',
      });
    } catch (e) {
      const err = e as ApiError;
      toast.error('Failed to launch LinkedIn login', {
        description: err.message + ' — Playwright must be installed in the .venv.',
        action: { label: 'Retry', onClick: () => linkedinLogin() },
      });
    }
  }

  let resettingOnboarding = $state(false);
  async function resetOnboarding() {
    if (resettingOnboarding) return;
    if (
      !confirm(
        "Re-run onboarding? This wipes the wizard's state file ONLY — your CV, profile, " +
          'tracker, and reports are NOT touched. The wizard will run again on your next page load.',
      )
    )
      return;
    resettingOnboarding = true;
    try {
      await api.post('/api/onboarding/reset', {}, { silent: true });
      toast.success('Onboarding reset', {
        description: 'The wizard will run again on next page load. Your data is intact.',
      });
    } catch (e) {
      const err = e as ApiError;
      toast.error('Could not reset', { description: err.message });
    } finally {
      resettingOnboarding = false;
    }
  }

  function fmtRelative(ts: number): string {
    const dt = Date.now() - ts;
    if (dt < 5_000) return 'just now';
    if (dt < 60_000) return Math.floor(dt / 1000) + 's ago';
    return Math.floor(dt / 60_000) + 'm ago';
  }
</script>

<div class="h-full overflow-y-auto">
  <Topbar title="Settings" showTabs={false} />
  <div class="p-6">
    <div class="max-w-2xl mx-auto space-y-4">
      <!-- Pipeline health summary — consumes /api/health. Reads the active
           profile's pipeline + reports + key configuration so the user
           sees at a glance whether anything is stale or unconfigured
           without having to navigate to Runtimes / Stats / Sources. -->
      <Card.Root>
        <Card.Header>
          <div class="flex items-center gap-2">
            <Activity class="size-4 text-muted-foreground" />
            <Card.Title class="text-base">Pipeline health</Card.Title>
            <Button
              variant="ghost"
              size="icon"
              class="h-7 w-7 ml-auto"
              disabled={healthLoading}
              onclick={refreshHealth}
              aria-label="Refresh"
            >
              {#if healthLoading}
                <Loader2 class="size-3.5 animate-spin" />
              {:else}
                <RotateCw class="size-3.5" />
              {/if}
            </Button>
          </div>
          <Card.Description>
            Snapshot of pipeline freshness, reports count, key configuration, and any tasks running
            right now. Refreshes on page load; click the icon to re-poll.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          {#if health}
            <div class="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              <div
                class={cn(
                  'rounded-md border px-3 py-2',
                  health.pipeline.stale
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : 'border-emerald-500/30 bg-emerald-500/5',
                )}
              >
                <div class="text-[11px] uppercase tracking-wider text-muted-foreground/70">
                  Pipeline
                </div>
                <div class="text-sm font-medium">
                  {health.pipeline.exists ? (health.pipeline.stale ? 'Stale' : 'Fresh') : 'Missing'}
                </div>
                {#if health.lastScanAt}
                  <div class="text-[11px] text-muted-foreground/80">
                    Last update {sinceShort(health.lastScanAt)}
                  </div>
                {/if}
              </div>
              <div class="rounded-md border border-border/40 bg-card px-3 py-2">
                <div class="text-[11px] uppercase tracking-wider text-muted-foreground/70">
                  Reports
                </div>
                <div class="text-sm font-medium">{health.reports.count}</div>
                <div class="text-[11px] text-muted-foreground/80">deep evaluations done</div>
              </div>
              <div
                class={cn(
                  'rounded-md border px-3 py-2',
                  health.anthropic.keyConfigured
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-amber-500/30 bg-amber-500/5',
                )}
              >
                <div class="text-[11px] uppercase tracking-wider text-muted-foreground/70">
                  Anthropic
                </div>
                <div class="text-sm font-medium">
                  {health.anthropic.keyConfigured ? 'Configured' : 'Missing'}
                </div>
                <div class="text-[11px] text-muted-foreground/80">ANTHROPIC_API_KEY in .env</div>
              </div>
              <div
                class={cn(
                  'rounded-md border px-3 py-2',
                  health.gemini.keyConfigured
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-zinc-500/30 bg-zinc-500/5',
                )}
              >
                <div class="text-[11px] uppercase tracking-wider text-muted-foreground/70">
                  Gemini
                </div>
                <div class="text-sm font-medium">
                  {health.gemini.keyConfigured ? 'Configured' : 'Optional'}
                </div>
                <div class="text-[11px] text-muted-foreground/80">
                  {health.gemini.scoresExists ? 'scores.tsv present' : 'no scores yet'}
                </div>
              </div>
              <div
                class="rounded-md border border-border/40 bg-card px-3 py-2 col-span-2 md:col-span-1"
              >
                <div class="text-[11px] uppercase tracking-wider text-muted-foreground/70">
                  Running
                </div>
                <div class="text-sm font-medium">
                  {health.runningTasks.length === 0
                    ? 'Idle'
                    : health.runningTasks.length + ' task(s)'}
                </div>
                {#if health.runningTasks.length > 0}
                  <div class="text-[11px] text-muted-foreground/80 truncate">
                    {health.runningTasks.join(' · ')}
                  </div>
                {/if}
              </div>
            </div>
          {:else if healthLoading}
            <div class="text-xs text-muted-foreground">Loading…</div>
          {:else}
            <div class="text-xs text-muted-foreground">No data — click refresh.</div>
          {/if}
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <div class="flex items-center gap-2">
            <KeyRound class="size-4 text-muted-foreground" />
            <Card.Title class="text-base">API keys</Card.Title>
          </div>
          <Card.Description>
            Bring your own keys — they're stored locally in <code
              class="text-foreground bg-muted px-1 py-0.5 rounded">~/career-ops/.env</code
            > and never leave your machine.
          </Card.Description>
        </Card.Header>
        <Card.Content class="space-y-5">
          {#each fields as f}
            {@const validation = fieldValidation(f)}
            {@const probeResult = f.provider ? probes[f.provider] : null}
            {@const isProbing = f.provider ? probing[f.provider] : false}
            {@const dirty = isDirty(f.key)}
            <div class="space-y-1.5">
              <div class="flex items-center justify-between gap-2">
                <Label for={f.key} class="flex items-center gap-2">
                  <span>{f.label}</span>
                  {#if isConnected(f.key)}
                    <Badge
                      variant="outline"
                      class="text-[11px] h-5 px-1.5 border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    >
                      <CheckCircle2 class="size-2.5 mr-0.5" /> connected
                    </Badge>
                  {:else if dirty}
                    <Badge
                      variant="outline"
                      class="text-[11px] h-5 px-1.5 border-amber-500/40 bg-amber-500/10 text-amber-300"
                    >
                      unsaved
                    </Badge>
                  {/if}
                </Label>
                {#if f.signupUrl}
                  <a
                    href={f.signupUrl}
                    target="_blank"
                    rel="noopener"
                    class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {f.signupLabel}
                    <ExternalLink class="size-3" />
                  </a>
                {/if}
              </div>
              <div class="relative">
                <Input
                  id={f.key}
                  type={revealed[f.key] || dirty ? 'text' : 'password'}
                  value={pending[f.key] ?? (isMasked(f.key) ? env[f.key] : '')}
                  oninput={(e: Event) =>
                    setField(f.key, (e.currentTarget as HTMLInputElement).value)}
                  placeholder={f.placeholder}
                  class="font-mono text-sm pr-9"
                  data-invalid={validation?.ok === false ? 'true' : undefined}
                />
                {#if dirty}
                  <button
                    type="button"
                    onclick={() => toggleReveal(f.key)}
                    class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                    aria-label={revealed[f.key] ? 'Hide value' : 'Reveal value'}
                  >
                    {#if revealed[f.key]}
                      <EyeOff class="size-3.5" />
                    {:else}
                      <Eye class="size-3.5" />
                    {/if}
                  </button>
                {/if}
              </div>

              {#if validation}
                <p
                  class={'text-xs flex items-center gap-1 ' +
                    (validation.ok ? 'text-emerald-400' : 'text-red-400')}
                >
                  {#if validation.ok}
                    <CheckCircle2 class="size-3" />
                  {:else}
                    <AlertCircle class="size-3" />
                  {/if}
                  {validation.message}
                </p>
              {:else if f.help}
                <p class="text-xs text-muted-foreground leading-relaxed">{f.help}</p>
              {/if}

              {#if f.provider && (isConnected(f.key) || (f.provider === 'adzuna' && isConnected('ADZUNA_APP_ID') && isConnected('ADZUNA_APP_KEY')))}
                <div class="flex items-center gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    class="h-7 text-xs gap-1.5"
                    onclick={() => probe(f.provider!)}
                    disabled={isProbing || dirty}
                  >
                    {#if isProbing}
                      <Loader2 class="size-3 animate-spin" />
                      Testing…
                    {:else if probeResult}
                      <RotateCw class="size-3" />
                      Test again
                    {:else}
                      <RotateCw class="size-3" />
                      Test connection
                    {/if}
                  </Button>
                  {#if probeResult}
                    <span
                      class={'text-xs flex items-center gap-1 ' +
                        (probeResult.ok ? 'text-emerald-400' : 'text-red-400')}
                    >
                      {#if probeResult.ok}
                        <CheckCircle2 class="size-3" />
                      {:else}
                        <AlertCircle class="size-3" />
                      {/if}
                      <span class="truncate max-w-[280px]">{probeResult.message}</span>
                      <span class="text-muted-foreground">· {fmtRelative(probeResult.ts)}</span>
                    </span>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </Card.Content>
        <Card.Footer class="justify-between border-t pt-4">
          <p class="text-xs text-muted-foreground">
            {#if dirtyCount > 0}
              <span class="text-amber-400"
                >{dirtyCount} unsaved {dirtyCount === 1 ? 'change' : 'changes'}</span
              > · take effect immediately on save
            {:else}
              Changes take effect immediately — no restart needed.
            {/if}
          </p>
          <div class="flex items-center gap-2">
            {#if dirtyCount > 0}
              <Button
                variant="ghost"
                onclick={() => {
                  pending = {};
                  revealed = {};
                }}
                disabled={saving}
              >
                Discard
              </Button>
            {/if}
            <Button onclick={save} disabled={!canSave || saving}>
              {#if saving}
                <Loader2 class="size-3.5 animate-spin mr-1" />
                Saving…
              {:else}
                Save
              {/if}
            </Button>
          </div>
        </Card.Footer>
      </Card.Root>

      <!-- Backups card — nightly auto + manual trigger + restore. Surfaced
           up here (above the LinkedIn / onboarding cards) because data loss
           is the highest-impact failure mode. -->
      <!-- Profile + appearance card — avatar, display name, dark/light/system,
           theme accent, in-app notification toggles. Per-machine for now;
           multi-user support is explicitly out of scope. -->
      <ProfileSettingsCard />

      <BackupsCard initialBackups={data.backups} initialConfig={data.backupConfig} />

      <!-- OS-level notifications + daily digest. Enable so high-priority
           events ping you even when the tab is in the background. The
           daily-digest autopilot job (07:00) fires regardless of
           Notification permission — that one is bell + activity-feed. -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="text-base">Notifications</Card.Title>
          <Card.Description>
            Get OS-level pings for important events (ManualApplyNeeded, recruiter emails detected,
            offers received). The daily digest at 07:00 summarizes what to focus on.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <PushNotificationsToggle />
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title class="text-base">LinkedIn Easy Apply</Card.Title>
          <Card.Description>
            One-time setup. We'll open LinkedIn so you can log in normally — your session stays
            signed in for future runs of the auto-apply agent.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <Button onclick={linkedinLogin} variant="outline">Connect LinkedIn</Button>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <div class="flex items-center gap-2">
            <Sparkles class="size-4 text-fuchsia-400" />
            <Card.Title class="text-base">Re-run onboarding</Card.Title>
          </div>
          <Card.Description>
            Wipes the wizard's state file so the multi-step onboarding flow runs again from scratch
            on your next page load. Your CV, profile, tracker, reports, and connected sources are
            <strong>not</strong> touched. Useful when you want to revisit the targeting / source-connection
            steps as a guided flow.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <Button
            onclick={resetOnboarding}
            variant="outline"
            disabled={resettingOnboarding}
            class="gap-1.5"
          >
            {#if resettingOnboarding}<Loader2 class="size-3.5 animate-spin" /> Resetting…{:else}<RotateCw
                class="size-3.5"
              /> Reset onboarding{/if}
          </Button>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title class="text-base"
            >Browser bookmarklet · auto-fill application forms</Card.Title
          >
          <Card.Description>
            One click to fill out a Greenhouse / Ashby / Lever application form with your tailored
            answers. Drag the link below to your bookmarks bar. When you're on a job application
            page, click the bookmark — it reads the form fields, asks this dashboard for matching
            answers, and fills them in. You review what landed in each field and click Submit
            yourself.
          </Card.Description>
        </Card.Header>
        <Card.Content class="space-y-3">
          <div
            class="rounded-md border border-border/40 bg-muted/20 p-3 flex items-center gap-3 flex-wrap"
          >
            <a
              href={bookmarkletHref}
              draggable="true"
              class="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200 hover:bg-fuchsia-500/20 transition-colors"
              onclick={(e: MouseEvent) => e.preventDefault()}
            >
              📎 career-ops fill
            </a>
            <span class="text-[11px] text-muted-foreground">↑ Drag this to your bookmarks bar</span>
          </div>
          <ul class="text-[11px] text-muted-foreground/80 list-disc pl-4 space-y-0.5">
            <li>Works on Greenhouse, Ashby, and Lever portals.</li>
            <li>
              Add the job's URL to your pipeline first — without it, the answers fall back to
              generic copy with no CV proof points.
            </li>
            <li>
              Reads from cv.md + config/profile.yml — the same files the "Pre-fill application
              answers" action on each job uses.
            </li>
            <li>
              Posts to your local dashboard at localhost:5174 — the dashboard must be running.
              Nothing leaves your machine.
            </li>
          </ul>
        </Card.Content>
      </Card.Root>
    </div>
  </div>
</div>
