<script lang="ts">
  import Topbar from '$lib/components/Topbar.svelte';
  import * as Card from '$lib/components/ui/card';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Button } from '$lib/components/ui/button';
  import {
    Search, Sparkles, Send, FileText, Bot, KanbanSquare, FolderKanban, BarChart3,
    Inbox, ListTodo, Cpu, Wrench, Settings, User, HelpCircle, ChevronRight,
    Copy, Check, Terminal, Code2, MessageCircle, ExternalLink, Zap, Map, Plug,
  } from '@lucide/svelte';
  import { toast } from 'svelte-sonner';
  import { cn } from '$lib/utils';
  import { APP_NAME, REPO_URL, cmd } from '$lib/config/branding';

  let copiedKey = $state<string | null>(null);
  async function copyText(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedKey = key;
      setTimeout(() => { if (copiedKey === key) copiedKey = null; }, 1500);
    } catch {
      toast.error('Copy failed');
    }
  }

  type StepDef = { n: number; title: string; body: string; cta?: { label: string; href: string } };
  const QUICK_START: StepDef[] = [
    {
      n: 1,
      title: 'Set up your profile',
      body: 'Open Profile and fill in your name, target roles, narrative, and compensation expectations. Every evaluation reads from this — without it, scoring is inaccurate.',
      cta: { label: 'Open Profile', href: '/profile' },
    },
    {
      n: 2,
      title: 'Add API keys',
      body: 'Open Settings and add your Gemini key (free tier covers ~1M tokens/day) for cheap first-pass scoring. Add an Anthropic key for deep evaluations and the agent chat.',
      cta: { label: 'Open Settings', href: '/settings' },
    },
    {
      n: 3,
      title: 'Run your first scan',
      body: 'Go to Agents and click Run Scan. The Python scanner pulls jobs from LinkedIn, Indeed, Glassdoor, RemoteOK, We Work Remotely, HN Hiring, The Muse and (if configured) Adzuna. Then click Score with Gemini to triage.',
      cta: { label: 'Open Agents', href: '/agents' },
    },
  ];

  type PageDef = {
    href: string;
    label: string;
    icon: any;
    purpose: string;
    when: string;
  };
  const PAGES: PageDef[] = [
    {
      href: '/pipeline',
      label: 'Pipeline',
      icon: KanbanSquare,
      purpose: 'The kanban board of every job in flight, grouped by status. Filter by score, BG-check risk, or search.',
      when: 'Daily — your single view of where everything stands.',
    },
    {
      href: '/inbox',
      label: 'Inbox',
      icon: Inbox,
      purpose: 'High-fit jobs (≥4.0) that haven\'t been deeply evaluated yet — the queue of next things to look at.',
      when: 'After every Gemini scoring run.',
    },
    {
      href: '/applied',
      label: 'My Applications',
      icon: ListTodo,
      purpose: 'Active applications — Applied / Screened / Interview / Offer. Filtered down for daily review.',
      when: 'Daily for follow-ups; weekly for cadence checks.',
    },
    {
      href: '/projects',
      label: 'Projects',
      icon: FolderKanban,
      purpose: 'Saved filter profiles. Track parallel job-hunting tracks ("Vancouver Senior", "Founding Engineer") with per-track application targets and live stats.',
      when: 'Set up once; revisit weekly to see progress per track.',
    },
    {
      href: '/autopilot',
      label: 'Autopilot',
      icon: Zap,
      purpose: 'Recurring + event-triggered task schedules. Daily scan, auto-score after scan, weekday LinkedIn Easy Apply.',
      when: 'Configure once. Active while the dashboard is open.',
    },
    {
      href: '/agents',
      label: 'Agents',
      icon: Bot,
      purpose: 'Manual one-shot triggers for Python tasks: Portal Scanner, Gemini First-Pass, LinkedIn Easy Apply.',
      when: 'When you want to run something now without waiting for Autopilot.',
    },
    {
      href: '/stats',
      label: 'Stats',
      icon: BarChart3,
      purpose: 'Pipeline funnel, score distribution, top companies/sources, 14-day velocity, conversion rates, BG-risk breakdown.',
      when: 'Weekly — to spot what\'s working and where time is going.',
    },
    {
      href: '/runtimes',
      label: 'Runtimes',
      icon: Cpu,
      purpose: 'Live health of every dependency — Node, Python venv, Anthropic, Gemini, Adzuna. Shows real version probes, recent usage, and last errors per integration.',
      when: 'When something feels broken; before a big run.',
    },
    {
      href: '/skills',
      label: 'Skills',
      icon: Wrench,
      purpose: 'Catalog of all Claude Code slash-commands the system understands. Search, filter by category, copy invocations to your terminal.',
      when: 'When you forget how to invoke a specific mode.',
    },
    {
      href: '/profile',
      label: 'Profile',
      icon: User,
      purpose: 'Your personal data: identity, location, target roles, narrative, comp targets, hard preferences. Read by every evaluation.',
      when: 'On first run. Update whenever your search criteria evolve.',
    },
    {
      href: '/sources',
      label: 'Sources',
      icon: Plug,
      purpose: 'One card per scanner. Authenticated LinkedIn / Indeed (saved Playwright sessions), Gmail IMAP polling, API-key sources, and the always-on aggregators. Connect / Test / Disconnect from one place.',
      when: 'When a scanner is failing; after re-installing; whenever you want to add a source.',
    },
    {
      href: '/settings',
      label: 'Settings',
      icon: Settings,
      purpose: 'API keys (Anthropic / Gemini / Adzuna) and the LinkedIn session login. All stored locally in .env.',
      when: 'On first run; whenever you rotate a key.',
    },
  ];

  type DeepDive = { href: string; title: string; blurb: string; icon: any };
  const DEEP_DIVES: DeepDive[] = [
    {
      href: '/help/onboarding',
      title: 'Onboarding wizard',
      blurb: 'What each step does, what files it writes, and how to redo it later from the per-page UIs.',
      icon: Sparkles,
    },
    {
      href: '/help/sources',
      title: 'Sources & scanners',
      blurb: 'How each source works, when to reconnect, common failure modes (LinkedIn session expiry, Indeed captcha, Gmail app-password rotation), and what each /sources action does.',
      icon: Plug,
    },
  ];

  type CommandDef = { invocation: string; purpose: string };
  const COMMANDS: CommandDef[] = [
    { invocation: cmd('oferta'), purpose: 'Deep evaluation of one job (paste URL or JD text). Produces 7-block A-G report + tailored CV PDF.' },
    { invocation: cmd('scan'), purpose: 'Run portal scan for new jobs (alternative to Agents page).' },
    { invocation: cmd('pipeline'), purpose: 'Process pending URLs from data/pipeline.md.' },
    { invocation: cmd('batch'), purpose: 'Batch-evaluate many jobs at once.' },
    { invocation: cmd('apply'), purpose: 'Fill out an application form (paste URL).' },
    { invocation: cmd('contacto'), purpose: 'Generate LinkedIn outreach for hiring manager / recruiter / peers.' },
    { invocation: cmd('deep'), purpose: 'Generate a Perplexity-style company-research prompt.' },
    { invocation: cmd('interview-prep'), purpose: 'Company-specific interview intel report.' },
    { invocation: cmd('mock-interview'), purpose: 'Practice interview with role-specific questions.' },
    { invocation: cmd('negotiation'), purpose: 'Generate offer-negotiation drafts and counter-strategy.' },
    { invocation: cmd('patterns'), purpose: 'Analyze rejection patterns and surface actionable insights.' },
    { invocation: cmd('followup'), purpose: 'Follow-up cadence tracker for active applications.' },
    { invocation: cmd('pdf'), purpose: 'Re-generate a tailored CV PDF for a specific job.' },
  ];

  type FileDef = { path: string; purpose: string; tier: 'user' | 'system' | 'output' };
  // Multi-profile layout: per-profile content lives under data/profiles/{slug}/.
  // The repo-root paths (cv.md, config/profile.yml, portals.yml, modes/_profile.md)
  // are SYMLINKS into the active profile's dir — the Claude CLI reads them at
  // their canonical paths, the dashboard swaps the symlinks when you switch
  // profiles. See /help/onboarding for the full multi-profile primer.
  const FILES: FileDef[] = [
    { path: 'data/profiles/{slug}/profile.yml', purpose: 'Per-profile identity + narrative + comp. config/profile.yml symlinks to the active one.', tier: 'user' },
    { path: 'data/profiles/{slug}/cv.md', purpose: 'Per-profile canonical CV. cv.md at repo root symlinks to the active profile.', tier: 'user' },
    { path: 'data/profiles/{slug}/_profile.md', purpose: 'Per-profile BG-check policy + archetype + language overrides. NEVER auto-updated.', tier: 'user' },
    { path: 'data/profiles/{slug}/pipeline.md', purpose: 'Per-profile inbox of pending job URLs (auto-appended by scanner).', tier: 'system' },
    { path: 'data/profiles/{slug}/applications.md', purpose: 'Per-profile application tracker — every evaluated job, with status and notes.', tier: 'system' },
    { path: 'data/profiles/{slug}/gemini-scores.tsv', purpose: 'Per-profile Gemini first-pass scores per URL.', tier: 'system' },
    { path: 'data/profiles/{slug}/projects.json', purpose: 'Per-profile saved filter views (Projects page).', tier: 'system' },
    { path: 'data/profiles/{slug}/reports/{n}-{slug}-{date}.md', purpose: 'Per-profile deep Claude evaluation reports.', tier: 'output' },
    { path: 'data/profiles/{slug}/output/{n}-{slug}-{date}.pdf', purpose: 'Per-profile tailored CV PDFs.', tier: 'output' },
    { path: 'data/profiles.json', purpose: 'Profile registry + active profile selection. SHARED across the install.', tier: 'system' },
    { path: 'data/autopilot.json', purpose: 'Autopilot schedule config. SHARED (one schedule across all profiles).', tier: 'system' },
    { path: 'data/activity.jsonl', purpose: 'Append-only event log. SHARED — events tagged with profileId where applicable.', tier: 'system' },
    { path: '.env', purpose: 'API keys (Anthropic / Gemini / Adzuna) + IMAP creds. SHARED across all profiles.', tier: 'user' },
    { path: 'modes/*.md', purpose: 'Slash-command prompts (the "Skills" page lists these).', tier: 'system' },
  ];

  type LinkDef = { label: string; href: string; icon: any };
  const LINKS: LinkDef[] = [
    { label: 'GitHub repo', href: REPO_URL, icon: Code2 },
    { label: 'Discord community', href: 'https://discord.gg/8pRpHETxa4', icon: MessageCircle },
  ];

  type FaqDef = { q: string; a: string };
  const FAQ: FaqDef[] = [
    {
      q: 'Why is my Pipeline empty after a scan?',
      a: 'Run `' + cmd('scan') + '` (or click Run Scan on Agents) and check the Activity feed. If the scan reports 0 new jobs, your portals.yml may be too narrow or the scanner may have hit a CAPTCHA — check Runtimes → Python for last errors.',
    },
    {
      q: 'My Anthropic key shows "Connected" but agent chat fails.',
      a: 'Open Settings, click Test connection on the Anthropic card. If it 401s, the key was revoked or copied with a leading/trailing space. Generate a fresh one at console.anthropic.com.',
    },
    {
      q: 'How do I run scheduled jobs when the dashboard is closed?',
      a: 'Autopilot\'s scheduler only runs while the dashboard is open. For 24/7 scheduling, set up a macOS launchd agent that opens http://localhost:5174 at boot, or invoke the Python scripts directly from cron.',
    },
    {
      q: 'A job has BG risk MEDIUM/HIGH — does that block the application?',
      a: 'No. BG risk is informational only. The system never auto-skips a job based on it (only explicit clearance/security keywords trigger BLOCKED). You decide per-company whether to apply and how to handle disclosure.',
    },
    {
      q: 'How do I customize archetypes / scoring weights?',
      a: 'Edit modes/_profile.md (your overrides — never auto-updated) for per-user customization. Don\'t touch modes/_shared.md — that\'s system-layer and gets overwritten by updates.',
    },
  ];
</script>

<div class="h-full overflow-y-auto">
  <Topbar title="Help" showTabs={false} />

  <div class="p-6">
    <div class="max-w-4xl mx-auto space-y-6">
      <!-- Hero -->
      <div class="space-y-2 max-w-3xl">
        <h1 class="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <HelpCircle class="size-5 text-muted-foreground" />
          {APP_NAME}
        </h1>
        <p class="text-sm text-muted-foreground leading-relaxed">
          A local-first job-search command center: scrapers find jobs across 7+ sources, Gemini scores them cheaply,
          Claude writes tailored evaluations + CVs, and a Playwright agent fills LinkedIn applications. All data
          lives on your machine in markdown and JSON files you can read.
        </p>
      </div>

      <!-- Quick start -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="text-sm flex items-center gap-2">
            <Sparkles class="size-3.5 text-muted-foreground" /> Quick start
          </Card.Title>
          <Card.Description class="text-xs">First three steps to your first scored pipeline.</Card.Description>
        </Card.Header>
        <Card.Content class="space-y-3">
          {#each QUICK_START as step}
            <div class="flex items-start gap-3 p-3 rounded-md border border-border/40 bg-card/50">
              <div class="size-7 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-mono font-semibold flex-shrink-0">
                {step.n}
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium">{step.title}</div>
                <p class="text-xs text-muted-foreground leading-relaxed mt-0.5">{step.body}</p>
              </div>
              {#if step.cta}
                <a
                  href={step.cta.href}
                  class="inline-flex items-center gap-1 h-7 px-3 text-xs rounded-md border border-input hover:bg-accent transition-colors flex-shrink-0"
                >
                  {step.cta.label}
                  <ChevronRight class="size-3" />
                </a>
              {/if}
            </div>
          {/each}
        </Card.Content>
      </Card.Root>

      <!-- Deep dives -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="text-sm flex items-center gap-2">
            <HelpCircle class="size-3.5 text-muted-foreground" /> Deep dives
          </Card.Title>
          <Card.Description class="text-xs">
            Topic-specific reference docs for the multi-step features.
          </Card.Description>
        </Card.Header>
        <Card.Content class="grid grid-cols-1 md:grid-cols-2 gap-2">
          {#each DEEP_DIVES as d (d.href)}
            {@const DIcon = d.icon}
            <a
              href={d.href}
              class="flex items-start gap-3 p-3 rounded-md border border-border/40 bg-card/40 hover:bg-accent/30 hover:border-accent/60 transition-colors group"
            >
              <div class="size-8 rounded-md bg-muted/40 flex items-center justify-center flex-shrink-0">
                <DIcon class="size-4 text-muted-foreground" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-medium">{d.title}</span>
                  <code class="text-[10px] font-mono text-muted-foreground/60">{d.href}</code>
                </div>
                <p class="text-[11px] text-muted-foreground leading-relaxed mt-1">{d.blurb}</p>
              </div>
              <ChevronRight class="size-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors flex-shrink-0 mt-1" />
            </a>
          {/each}
        </Card.Content>
      </Card.Root>

      <!-- Page reference -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="text-sm flex items-center gap-2">
            <Map class="size-3.5 text-muted-foreground" /> Page-by-page reference
          </Card.Title>
          <Card.Description class="text-xs">What each page does and when to open it.</Card.Description>
        </Card.Header>
        <Card.Content class="grid grid-cols-1 md:grid-cols-2 gap-2">
          {#each PAGES as p}
            {@const PIcon = p.icon}
            <a
              href={p.href}
              class="flex items-start gap-3 p-3 rounded-md border border-border/40 bg-card/40 hover:bg-accent/30 hover:border-accent/60 transition-colors group"
            >
              <div class="size-8 rounded-md bg-muted/40 flex items-center justify-center flex-shrink-0">
                <PIcon class="size-4 text-muted-foreground" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-medium">{p.label}</span>
                  <code class="text-[10px] font-mono text-muted-foreground/60">{p.href}</code>
                </div>
                <p class="text-[11px] text-muted-foreground leading-relaxed mt-1">{p.purpose}</p>
                <p class="text-[10px] text-muted-foreground/70 leading-relaxed mt-1 italic">When: {p.when}</p>
              </div>
              <ChevronRight class="size-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors flex-shrink-0 mt-1" />
            </a>
          {/each}
        </Card.Content>
      </Card.Root>

      <!-- CLI / slash commands -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="text-sm flex items-center gap-2">
            <Terminal class="size-3.5 text-muted-foreground" /> Slash-command reference
          </Card.Title>
          <Card.Description class="text-xs">
            Run any of these in Claude Code (or via <code class="font-mono">claude &lt;name&gt;</code> from your terminal).
            The Skills page shows the full prompt body for each.
          </Card.Description>
        </Card.Header>
        <Card.Content class="space-y-1">
          <Tooltip.Provider delayDuration={300}>
            {#each COMMANDS as cmd}
              <div class="flex items-start gap-2 p-2 rounded hover:bg-muted/30 transition-colors group">
                <Tooltip.Root>
                  <Tooltip.Trigger>
                    {#snippet child({ props })}
                      <button
                        {...props}
                        type="button"
                        onclick={() => copyText(cmd.invocation, 'cmd:' + cmd.invocation)}
                        aria-label={'Copy ' + cmd.invocation}
                        class="text-xs font-mono px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground/90 flex-shrink-0 transition-colors min-w-[18ch] text-left flex items-center gap-1.5"
                      >
                        {#if copiedKey === 'cmd:' + cmd.invocation}
                          <Check class="size-3 text-emerald-400" />
                        {:else}
                          <Copy class="size-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                        {/if}
                        <span>{cmd.invocation}</span>
                      </button>
                    {/snippet}
                  </Tooltip.Trigger>
                  <Tooltip.Content side="top" class="text-xs">
                    {copiedKey === 'cmd:' + cmd.invocation ? 'Copied!' : 'Copy to clipboard'}
                  </Tooltip.Content>
                </Tooltip.Root>
                <span class="text-xs text-muted-foreground leading-relaxed">{cmd.purpose}</span>
              </div>
            {/each}
          </Tooltip.Provider>
          <div class="pt-2 mt-2 border-t border-border/40">
            <a href="/skills" class="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors">
              See all skills with full prompts
              <ChevronRight class="size-3" />
            </a>
          </div>
        </Card.Content>
      </Card.Root>

      <!-- File reference -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="text-sm flex items-center gap-2">
            <FileText class="size-3.5 text-muted-foreground" /> Where things live on disk
          </Card.Title>
          <Card.Description class="text-xs">
            Everything is local plain-text. Edit, grep, or commit as you would any project.
          </Card.Description>
        </Card.Header>
        <Card.Content class="space-y-1">
          <Tooltip.Provider delayDuration={300}>
            {#each FILES as f}
              <div class="flex items-start gap-2 p-2 rounded hover:bg-muted/30 transition-colors group">
                <Tooltip.Root>
                  <Tooltip.Trigger>
                    {#snippet child({ props })}
                      <button
                        {...props}
                        type="button"
                        onclick={() => copyText(f.path, 'file:' + f.path)}
                        aria-label={'Copy ' + f.path}
                        class="text-xs font-mono px-2 py-0.5 rounded bg-muted hover:bg-muted/80 flex-shrink-0 transition-colors min-w-[26ch] text-left flex items-center gap-1.5"
                      >
                        {#if copiedKey === 'file:' + f.path}
                          <Check class="size-3 text-emerald-400" />
                        {:else}
                          <Copy class="size-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                        {/if}
                        <span class="truncate">{f.path}</span>
                      </button>
                    {/snippet}
                  </Tooltip.Trigger>
                  <Tooltip.Content side="top" class="text-xs">
                    {copiedKey === 'file:' + f.path ? 'Copied!' : 'Copy path to clipboard'}
                  </Tooltip.Content>
                </Tooltip.Root>
                <span class={cn(
                  'text-[10px] uppercase tracking-wider font-medium flex-shrink-0',
                  f.tier === 'user' ? 'text-emerald-400/80'
                    : f.tier === 'output' ? 'text-blue-400/80'
                    : 'text-muted-foreground/60'
                )}>{f.tier}</span>
                <span class="text-xs text-muted-foreground leading-relaxed">{f.purpose}</span>
              </div>
            {/each}
          </Tooltip.Provider>
        </Card.Content>
      </Card.Root>

      <!-- FAQ -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="text-sm flex items-center gap-2">
            <MessageCircle class="size-3.5 text-muted-foreground" /> Frequently hit issues
          </Card.Title>
        </Card.Header>
        <Card.Content class="space-y-3">
          {#each FAQ as f, i}
            <details class="group/faq">
              <summary class="cursor-pointer text-xs font-medium hover:text-foreground transition-colors flex items-start gap-2">
                <ChevronRight class="size-3.5 mt-0.5 flex-shrink-0 transition-transform group-open/faq:rotate-90 text-muted-foreground" />
                <span>{f.q}</span>
              </summary>
              <p class="text-xs text-muted-foreground leading-relaxed mt-2 pl-5.5">{f.a}</p>
            </details>
          {/each}
        </Card.Content>
      </Card.Root>

      <!-- About / links -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        {#each LINKS as l}
          {@const LIcon = l.icon}
          <a
            href={l.href}
            target="_blank"
            rel="noopener"
            class="flex items-center gap-3 p-3 rounded-md border border-border/40 bg-card/40 hover:bg-accent/30 hover:border-accent/60 transition-colors"
          >
            <div class="size-9 rounded-lg bg-muted/40 flex items-center justify-center flex-shrink-0">
              <LIcon class="size-4 text-muted-foreground" />
            </div>
            <span class="text-sm font-medium flex-1">{l.label}</span>
            <ExternalLink class="size-3.5 text-muted-foreground/60" />
          </a>
        {/each}
      </div>
    </div>
  </div>
</div>
