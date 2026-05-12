<script lang="ts">
  import { docTitle } from '$lib/config/branding';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { api } from '$lib/api';
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { Copy, RefreshCw, Check, ExternalLink } from '@lucide/svelte';

  type AuditFinding = {
    kind: string;
    severity: 'error' | 'warn' | 'info';
    category: 'profile' | 'account' | 'activity' | 'security';
    title: string;
    detail: string;
    paste?: string;
    settingsPath?: string;
    resolvedAt?: number;
  };

  type AuditReport = {
    auditedAt: number;
    snapshot: Record<string, unknown>;
    findings: AuditFinding[];
    grade: number;
  };

  let { data }: { data: { report: AuditReport | null } } = $props();

  let busy = $state<string | null>(null);
  let copied = $state<string | null>(null);

  const findings = $derived(data.report?.findings ?? []);
  const open = $derived(findings.filter((f) => !f.resolvedAt));
  const errors = $derived(open.filter((f) => f.severity === 'error'));
  const warns = $derived(open.filter((f) => f.severity === 'warn'));
  const infos = $derived(open.filter((f) => f.severity === 'info'));

  async function runAudit(headed = false) {
    busy = 'audit';
    try {
      const res = await api.post<{ ok: boolean; error?: string }>(
        '/api/linkedin/audit',
        { headed },
        { silent: true },
      );
      if (res.ok) {
        toast.success('Audit complete');
        await invalidateAll();
      } else {
        toast.error(res.error || 'Audit failed');
      }
    } finally {
      busy = null;
    }
  }

  async function generateRewrite() {
    busy = 'rewrite';
    try {
      const res = await api.post<{ ok: boolean; rewritePath?: string; error?: string }>(
        '/api/linkedin/audit/rewrite',
        {},
        { silent: true },
      );
      if (res.ok) {
        toast.success(
          res.rewritePath
            ? 'Rewrite saved to ' + res.rewritePath
            : 'Nothing to rewrite — everything is text-clean',
        );
      } else {
        toast.error(res.error || 'Rewrite failed');
      }
    } finally {
      busy = null;
    }
  }

  async function markResolved(kind: string) {
    busy = 'fix:' + kind;
    try {
      const res = await api.post<{ ok: boolean }>(
        '/api/linkedin/audit/fix',
        { kind },
        { silent: true },
      );
      if (res.ok) {
        toast.success('Marked resolved');
        await invalidateAll();
      }
    } finally {
      busy = null;
    }
  }

  function copyToClipboard(text: string, kind: string) {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      copied = kind;
      setTimeout(() => {
        if (copied === kind) copied = null;
      }, 2000);
    });
  }

  function sevTint(s: string): string {
    if (s === 'error') return 'bg-red-500/15 text-red-200 border-red-500/40';
    if (s === 'warn') return 'bg-amber-500/15 text-amber-200 border-amber-500/40';
    return 'bg-cyan-500/15 text-cyan-200 border-cyan-500/40';
  }
</script>

<svelte:head>
  <title>{docTitle(['LinkedIn audit'])}</title>
</svelte:head>

<div class="mx-auto max-w-5xl space-y-6 p-6">
  <header class="flex items-start justify-between">
    <div>
      <h1 class="text-2xl font-semibold">LinkedIn audit</h1>
      <p class="text-sm text-zinc-400">
        Comprehensive review of your profile + account settings + activity.
        {#if data.report}
          Last run {new Date(data.report.auditedAt).toLocaleString()} · grade
          <span class="font-mono font-bold">{data.report.grade}/100</span>
        {/if}
      </p>
    </div>
    <div class="flex flex-col gap-2">
      <Button onclick={() => runAudit(false)} disabled={busy !== null}>
        <RefreshCw class="mr-2 size-4" />
        {busy === 'audit' ? 'Auditing...' : data.report ? 'Re-run audit' : 'Run audit'}
      </Button>
      {#if !data.report}
        <Button size="sm" variant="ghost" onclick={() => runAudit(true)} disabled={busy !== null}>
          Log in to LinkedIn (one-time)
        </Button>
      {/if}
      {#if data.report && open.length > 0}
        <Button size="sm" variant="outline" onclick={generateRewrite} disabled={busy !== null}>
          {busy === 'rewrite' ? 'Drafting...' : 'Draft paste-ready rewrites'}
        </Button>
      {/if}
    </div>
  </header>

  {#if !data.report}
    <div class="rounded-lg border border-zinc-700 bg-zinc-900/40 p-8 text-center">
      <p class="text-zinc-300">No audit run yet.</p>
      <p class="mt-2 text-xs text-zinc-500">
        First run requires a logged-in LinkedIn session. Click "Log in to LinkedIn" to open a
        browser, sign in once, then close it. Subsequent audits run headless.
      </p>
    </div>
  {:else if open.length === 0}
    <div class="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-6 text-center">
      <p class="text-emerald-200">All findings resolved. Profile + account look strong.</p>
    </div>
  {:else}
    <!-- Summary row -->
    <div class="grid grid-cols-3 gap-3">
      <div class="rounded-lg border border-red-500/40 bg-red-500/10 p-4">
        <div class="text-xs uppercase text-red-300">Errors</div>
        <div class="font-mono text-3xl">{errors.length}</div>
      </div>
      <div class="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
        <div class="text-xs uppercase text-amber-300">Warnings</div>
        <div class="font-mono text-3xl">{warns.length}</div>
      </div>
      <div class="rounded-lg border border-cyan-500/40 bg-cyan-500/10 p-4">
        <div class="text-xs uppercase text-cyan-300">Info</div>
        <div class="font-mono text-3xl">{infos.length}</div>
      </div>
    </div>

    <!-- Findings -->
    <div class="space-y-3">
      {#each open as f (f.kind)}
        <div class="rounded-lg border border-zinc-700 bg-zinc-900/40 p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <span class="rounded border px-2 py-0.5 text-[10px] uppercase {sevTint(f.severity)}"
                  >{f.severity}</span
                >
                <Badge variant="outline" class="text-xs">{f.category}</Badge>
                <span class="font-medium">{f.title}</span>
              </div>
              <p class="mt-2 text-sm text-zinc-400">{f.detail}</p>
              {#if f.settingsPath}
                <div class="mt-2 rounded border border-zinc-800 bg-zinc-950/50 p-2 text-xs">
                  <span class="text-zinc-500">Settings path:</span>
                  <span class="font-mono text-cyan-300">{f.settingsPath}</span>
                </div>
              {/if}
              {#if f.paste}
                <div class="mt-2 rounded border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <div class="mb-1 flex items-center justify-between">
                    <span class="text-xs uppercase tracking-wide text-emerald-300"
                      >Paste this into LinkedIn</span
                    >
                    <Button
                      size="sm"
                      variant="ghost"
                      onclick={() => copyToClipboard(f.paste!, f.kind)}
                    >
                      {#if copied === f.kind}
                        <Check class="size-3.5" /> Copied
                      {:else}
                        <Copy class="size-3.5" /> Copy
                      {/if}
                    </Button>
                  </div>
                  <pre
                    class="whitespace-pre-wrap break-words font-mono text-xs text-zinc-200">{f.paste}</pre>
                </div>
              {/if}
            </div>
            <Button
              size="sm"
              variant="outline"
              onclick={() => markResolved(f.kind)}
              disabled={busy === 'fix:' + f.kind}
            >
              {busy === 'fix:' + f.kind ? 'Marking...' : 'Mark resolved'}
            </Button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
