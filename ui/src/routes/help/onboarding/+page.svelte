<script lang="ts">
  import Topbar from '$lib/components/Topbar.svelte';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import {
    Sparkles,
    KeyRound,
    User,
    FileText,
    Target,
    Plug,
    Search,
    Trophy,
    Users,
    ArrowLeft,
    ArrowRight,
    RotateCw,
    CheckCircle2,
    AlertCircle,
    ExternalLink,
    Plus,
  } from '@lucide/svelte';

  type Step = {
    icon: any;
    label: string;
    href: string;
    blurb: string;
    writes: string[];
    redo: string;
  };

  const STEPS: Step[] = [
    {
      icon: KeyRound,
      label: 'API keys',
      href: '/onboarding/api-keys',
      blurb:
        'Captures Anthropic (required) + Gemini (recommended) + Adzuna (optional). Keys are validated with a real probe before you can advance.',
      writes: ['.env (ANTHROPIC_API_KEY, GEMINI_API_KEY, ADZUNA_*)'],
      redo: 'Settings → API keys card. Same probes, same fields. No need to re-run the wizard.',
    },
    {
      icon: User,
      label: 'Identity',
      href: '/onboarding/identity',
      blurb:
        'Captures name, email, location, work-auth, and optional links (LinkedIn, GitHub, portfolio). Drives CV signing, scraper search location, and the recruiter outreach mode.',
      writes: ['data/profiles/{slug}/profile.yml (candidate.*, location.*)'],
      redo: 'Profile page → Identity card. Or re-run the wizard via Settings → Reset onboarding.',
    },
    {
      icon: FileText,
      label: 'CV',
      href: '/onboarding/cv',
      blurb:
        'Three options: paste markdown directly, paste plain text (Claude converts to canonical sections), or paste a LinkedIn URL (uses the authenticated LinkedIn session if connected). After save, runs Reprocess to extract structured profile fields automatically.',
      writes: [
        'data/profiles/{slug}/cv.md',
        'data/profiles/{slug}/profile.yml (auto-populated by Reprocess)',
      ],
      redo: 'Profile page → CV manager (View / Replace / Reprocess).',
    },
    {
      icon: Target,
      label: 'Targeting',
      href: '/onboarding/targeting',
      blurb:
        'Target roles drive LinkedIn / Indeed search queries. Title-filter positive + negative keywords drive scan.mjs filtering. Compensation + hard preferences feed the deeper Claude evaluation.',
      writes: [
        'data/profiles/{slug}/profile.yml (target_roles, compensation, preferences)',
        'data/profiles/{slug}/portals.yml (title_filter.positive, title_filter.negative)',
        'data/profiles/{slug}/_profile.md (seeded from template if missing)',
      ],
      redo: 'Profile page → Targeting + preferences cards. Edit portals.yml directly for advanced search-query changes.',
    },
    {
      icon: Plug,
      label: 'Sources',
      href: '/onboarding/sources',
      blurb:
        'Connect LinkedIn / Indeed (authenticated Playwright sessions for full personalized feeds) and Gmail (IMAP polling for real-time job-alert ingestion). Skippable — the always-on aggregators (ATS APIs, JobSpy, curated boards) run regardless.',
      writes: [
        '.playwright-linkedin/ (Chromium profile)',
        '.playwright-indeed/ (Chromium profile)',
        '.env (GMAIL_IMAP_*)',
        'data/sources.json (connection state)',
      ],
      redo: 'Sources page (sidebar → Configure → Sources). Same Connect / Test / Disconnect actions.',
    },
    {
      icon: Search,
      label: 'First scan',
      href: '/onboarding/first-scan',
      blurb:
        'Triggers the same daily scan-all fan-out that runs on schedule. Live SSE progress per child scanner. Skippable — the daily run will populate your inbox tomorrow either way.',
      writes: [
        'data/profiles/{slug}/pipeline.md (new jobs)',
        'data/profiles/{slug}/scan-history.tsv (dedup)',
      ],
      redo: 'Agents page → Run Scan. Or wait for the next daily 09:00 weekday run.',
    },
    {
      icon: Trophy,
      label: 'Done',
      href: '/onboarding/done',
      blurb:
        'Marks onboarding complete. Future visits to the dashboard skip the wizard and land on /inbox directly.',
      writes: ['data/onboarding-state.json (completed=true)'],
      redo: 'Settings → Reset onboarding. Wipes the state file ONLY — your CV, profile, tracker, and reports are preserved.',
    },
  ];
</script>

<div class="h-full overflow-y-auto">
  <Topbar
    title="Onboarding"
    subtitle="What each wizard step does and how to redo it"
    showTabs={false}
  />

  <div class="p-6 pb-24">
    <div class="max-w-4xl mx-auto space-y-5">
      <!-- Hero -->
      <div class="space-y-1.5 max-w-3xl">
        <h1 class="text-xl font-semibold tracking-tight flex items-center gap-2">
          <Sparkles class="size-5 text-fuchsia-400" />
          Onboarding
        </h1>
        <p class="text-sm text-muted-foreground leading-relaxed">
          The wizard at <a
            href="/onboarding"
            class="underline underline-offset-2 hover:text-foreground">/onboarding</a
          >
          walks a fresh install through 7 steps in 5–10 minutes. Onboarding is also how you ADD A NEW
          PROFILE — career-ops supports multiple distinct career tracks per install (e.g. Software Engineering
          + Electrician), and each track gets its own walk-through so the CV / targeting / first-scan
          are scoped to that profile. By the end you have keys configured, identity captured, CV imported,
          target roles + filters set, sources connected, and a first scan complete. This page documents
          what each step does, what files it writes, and where you can edit the same data after the wizard
          finishes.
        </p>
      </div>

      <!-- Multi-profile -->
      <Card.Root>
        <Card.Header>
          <div class="flex items-center gap-2">
            <Users class="size-4 text-fuchsia-400" />
            <Card.Title class="text-base">Multi-profile onboarding</Card.Title>
          </div>
          <Card.Description>
            Career-ops supports multiple distinct career tracks per install. Each profile has its
            own CV, target roles, filters, pipeline, applications tracker, and reports.
          </Card.Description>
        </Card.Header>
        <Card.Content class="space-y-2">
          <p class="text-[12px] text-muted-foreground/90 leading-relaxed">
            <strong>First-run</strong> — onboarding creates a profile (or skips that prompt if you
            launched the wizard with no <code class="font-mono">?new=1</code> param). The target
            profile's slug is threaded through every step page via
            <code class="font-mono">?profile=&lt;slug&gt;</code>, so all the CV / identity /
            targeting writes land in <code class="font-mono">data/profiles/&lt;slug&gt;/</code>.
          </p>
          <p class="text-[12px] text-muted-foreground/90 leading-relaxed">
            <strong>Adding a profile later</strong> — click the profile switcher in the sidebar,
            pick "Add new profile", or hit <code class="font-mono">/onboarding?new=1</code> directly.
            The wizard's Welcome step prompts for a display name + color, derives a kebab-case slug, persists,
            and redirects you into the API-keys step with the new slug.
          </p>
          <p class="text-[12px] text-muted-foreground/90 leading-relaxed">
            <strong>Shared steps</strong> — API keys (in <code class="font-mono">.env</code>) and
            connected sources (Playwright sessions, Gmail IMAP) are SHARED across every profile. On
            2nd+ profile onboarding the API-keys step shows a "Keys already configured — continue"
            express path, and the sources step shows existing connections as already- connected so
            you can skip them.
          </p>
          <p class="text-[12px] text-muted-foreground/90 leading-relaxed">
            <strong>Per-profile steps</strong> — Identity, CV, Targeting, First-scan, Done. The Done
            step makes the just-onboarded profile active and routes to
            <code class="font-mono">/inbox?profile=&lt;slug&gt;</code>.
          </p>
          <p class="text-[11px] text-muted-foreground/80 leading-relaxed pt-1">
            See <a href="/help/sources" class="underline underline-offset-2 hover:text-foreground"
              >/help/sources</a
            >
            for how scanners interact with multi-profile, or
            <a href="/profiles" class="underline underline-offset-2 hover:text-foreground"
              >/profiles</a
            > to manage them.
          </p>
        </Card.Content>
      </Card.Root>

      <!-- Trigger conditions -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="text-base">When the wizard runs</Card.Title>
          <Card.Description>
            On the very first dashboard load, the root layout checks for a "fresh install" and
            redirects to <code class="font-mono">/onboarding</code> if any of these are true.
          </Card.Description>
        </Card.Header>
        <Card.Content class="space-y-2">
          <ul class="text-[12px] text-muted-foreground/90 list-disc pl-5 space-y-1 leading-relaxed">
            <li>
              <code class="font-mono">data/onboarding-state.json</code> doesn't exist OR has
              <code class="font-mono">completed: false</code>
            </li>
            <li>The active profile's <code class="font-mono">cv.md</code> is missing</li>
            <li>The active profile's <code class="font-mono">profile.yml</code> is missing</li>
            <li>The active profile's <code class="font-mono">portals.yml</code> is missing</li>
            <li>The active profile's <code class="font-mono">_profile.md</code> is missing</li>
            <li>
              <code class="font-mono">ANTHROPIC_API_KEY</code> isn't set in
              <code class="font-mono">.env</code>
            </li>
          </ul>
          <p class="text-[11px] text-muted-foreground/80 leading-relaxed pt-1">
            Once <code class="font-mono">completed: true</code> is written, the redirect stops
            firing even if you later delete a config file. To force the wizard to re-run, hit
            <strong>Settings → Reset onboarding</strong>. To add a NEW profile, use the sidebar
            profile switcher's "Add new profile" or visit
            <code class="font-mono">/onboarding?new=1</code> directly.
          </p>
        </Card.Content>
      </Card.Root>

      <!-- Steps -->
      <div class="space-y-3">
        <h2 class="text-sm font-semibold tracking-tight">The 7 steps</h2>
        {#each STEPS as step, i (step.label)}
          {@const Icon = step.icon}
          <Card.Root>
            <Card.Header>
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span
                    class="size-7 rounded-md bg-muted/40 ring-1 ring-border/40 flex items-center justify-center"
                  >
                    <Icon class="size-3.5 text-muted-foreground" />
                  </span>
                  <Card.Title class="text-base">{i + 1}. {step.label}</Card.Title>
                </div>
                <a
                  href={step.href}
                  class="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  Open step <ArrowRight class="size-2.5" />
                </a>
              </div>
              <Card.Description class="text-[12px] leading-relaxed">{step.blurb}</Card.Description>
            </Card.Header>
            <Card.Content class="pt-0 space-y-2">
              <div class="text-[11px] space-y-1">
                <div class="flex items-start gap-2">
                  <span
                    class="text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 flex-shrink-0"
                    >writes</span
                  >
                  <ul class="text-muted-foreground/90 space-y-0.5">
                    {#each step.writes as w (w)}
                      <li><code class="font-mono text-[10.5px]">{w}</code></li>
                    {/each}
                  </ul>
                </div>
                <div class="flex items-start gap-2">
                  <span
                    class="text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded border border-blue-500/40 bg-blue-500/10 text-blue-300 flex-shrink-0"
                    >redo</span
                  >
                  <p class="text-muted-foreground/90 leading-relaxed">{step.redo}</p>
                </div>
              </div>
            </Card.Content>
          </Card.Root>
        {/each}
      </div>

      <!-- Resetting -->
      <Card.Root>
        <Card.Header>
          <div class="flex items-center gap-2">
            <RotateCw class="size-4 text-amber-400" />
            <Card.Title class="text-base">Re-run onboarding</Card.Title>
          </div>
          <Card.Description>
            Wipes the wizard's state file so the multi-step flow runs again from scratch on your
            next page load. <strong
              >Your CV, profile, tracker, reports, and connected sources are not touched.</strong
            > Useful when you want to revisit the targeting / sources steps as a guided flow rather than
            from each individual page.
          </Card.Description>
        </Card.Header>
        <Card.Content class="space-y-2">
          <Button href="/settings" variant="outline" class="gap-1.5">
            Open Settings <ArrowRight class="size-3.5" />
          </Button>
          <p class="text-[11px] text-muted-foreground/80 leading-relaxed">
            Look for the "Re-run onboarding" card. The reset is a single POST to
            <code class="font-mono">/api/onboarding/reset</code> — config files stay intact.
          </p>
        </Card.Content>
      </Card.Root>

      <!-- Skipping -->
      <Card.Root>
        <Card.Header>
          <div class="flex items-center gap-2">
            <AlertCircle class="size-4 text-amber-400" />
            <Card.Title class="text-base">"Skip — I've set everything up by hand"</Card.Title>
          </div>
          <Card.Description>
            For power users who already populated <code class="font-mono">cv.md</code>,
            <code class="font-mono">profile.yml</code>, <code class="font-mono">portals.yml</code>,
            and
            <code class="font-mono">modes/_profile.md</code> manually (e.g. by editing files via your
            preferred editor + AI agent). Marks the wizard complete without writing any of those files.
            The system continues working as long as those files exist.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <ul
            class="text-[11px] text-muted-foreground/90 list-disc pl-5 space-y-0.5 leading-relaxed"
          >
            <li>
              <strong>Don't skip</strong> if any required file is missing — the daily scan will run but
              evaluations will fail.
            </li>
            <li>
              <strong>Don't skip</strong> if you don't have an Anthropic key set — the deeper evaluation
              modes won't work.
            </li>
            <li>
              Skip <em>is</em> safe if you cloned an existing setup (dotfiles, prior career-ops install)
              and want to dismiss the redirect.
            </li>
          </ul>
        </Card.Content>
      </Card.Root>

      <!-- Related -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="text-base">Related help</Card.Title>
        </Card.Header>
        <Card.Content class="space-y-1.5">
          <a
            href="/help/sources"
            class="flex items-center justify-between text-[12px] hover:text-foreground text-muted-foreground py-1"
          >
            <span class="inline-flex items-center gap-1.5">
              <Plug class="size-3" /> Sources — how each scanner works + when to reconnect
            </span>
            <ArrowRight class="size-2.5" />
          </a>
          <a
            href="/help"
            class="flex items-center justify-between text-[12px] hover:text-foreground text-muted-foreground py-1"
          >
            <span class="inline-flex items-center gap-1.5">
              <ArrowLeft class="size-3" /> Back to all help
            </span>
            <ExternalLink class="size-2.5" />
          </a>
        </Card.Content>
      </Card.Root>
    </div>
  </div>
</div>
