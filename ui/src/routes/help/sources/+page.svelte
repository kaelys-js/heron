<script lang="ts">
  import Topbar from '$lib/components/Topbar.svelte';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import {
    Plug, Globe, Mail, Database, Briefcase, KeyRound, Power, RefreshCw,
    AlertCircle, CheckCircle2, ArrowRight, ArrowLeft, Sparkles, ExternalLink,
  } from '@lucide/svelte';

  type SourceDoc = {
    icon: any;
    label: string;
    type: 'authenticated' | 'imap' | 'env-key' | 'always-on';
    pitch: string;
    how: string[];
    reconnect: string;
    files: string[];
  };

  const SOURCES: SourceDoc[] = [
    {
      icon: Briefcase,
      label: 'LinkedIn (authenticated)',
      type: 'authenticated',
      pitch:
        'Scrapes your logged-in LinkedIn feed via a saved Playwright Chromium profile. Same view you\'d see scrolling LinkedIn yourself — full personalized feed, no API keys, no OAuth, ToS-clean for personal use.',
      how: [
        'Click Connect → headed Chromium opens',
        'Log in normally (handle 2FA / captcha if prompted)',
        'lib_playwright_auth.py polls /feed/ every 2s; once login is detected, the browser auto-closes',
        'Cookies + session storage are saved to .playwright-linkedin/',
        'Daily 09:15 weekday scan runs scan-linkedin-auth.py headless against the saved session',
      ],
      reconnect:
        'LinkedIn typically expires sessions after ~30 days, or sooner if you log out elsewhere. The /sources card flips to red after 3 consecutive scrape failures. Click Connect again to re-authenticate — the browser remembers your account so it\'s usually 1 click.',
      files: [
        '.playwright-linkedin/ — Chromium user-data dir (cookies + storage)',
        'scan-linkedin-auth.py — the scrape script',
        'data/sources.json — connection state (consecutiveFailures, lastError)',
      ],
    },
    {
      icon: Globe,
      label: 'Indeed (authenticated)',
      type: 'authenticated',
      pitch:
        'Same architecture as LinkedIn, but for Indeed. Bypasses the captcha gate that public scrapers hit. Daily 09:30 weekday scan.',
      how: [
        'Click Connect → headed Chromium opens at secure.indeed.com/auth',
        'Log in (Indeed accepts Google/Apple SSO; handle as you normally would)',
        'Once /account stops redirecting to /signin, the browser closes',
        'Daily scan runs scan-indeed-auth.py headless against the saved cookies',
      ],
      reconnect:
        'If Indeed serves a "press and hold" captcha mid-scrape, the script exits cleanly with code 4 and the source flips to disconnected. You\'ll see "captcha — re-login on /sources" in the lastError. Click Connect again and Indeed will usually let you back in.',
      files: [
        '.playwright-indeed/ — Chromium user-data dir',
        'scan-indeed-auth.py — the scrape script',
      ],
    },
    {
      icon: Mail,
      label: 'Gmail (job alerts)',
      type: 'imap',
      pitch:
        'Polls a Gmail label every 30 minutes via IMAP. Parses LinkedIn / Indeed / generic alert emails using the same parser registry as the local mbox path. Idempotent — processed messages are marked as Seen.',
      how: [
        'Enable 2-factor auth on your Google account (required for app passwords)',
        'Generate an app password at myaccount.google.com/apppasswords (pick "Mail" + "Other → career-ops")',
        'Optional: in Gmail, create a filter that auto-applies a label to LinkedIn/Indeed alert emails (e.g. "career-ops/job-alerts")',
        'On /sources, fill the IMAP form (host, email, app password, label) and click Test & Save',
        'A setInterval daemon in the dashboard polls every 30 min — no autopilot scheduler change needed',
      ],
      reconnect:
        'IMAP errors (revoked app password, 2FA disabled, label renamed) auto-disconnect the source after 3 failures. Just re-fill the form and click Test & Save. Gmail-side: if you renamed your filter\'s label, update GMAIL_IMAP_LABEL.',
      files: [
        '.env (GMAIL_IMAP_HOST, GMAIL_IMAP_USER, GMAIL_IMAP_PASSWORD, GMAIL_IMAP_LABEL)',
        'scan-email-imap.mjs — the polling script',
      ],
    },
    {
      icon: KeyRound,
      label: 'API-key sources (Anthropic, Gemini, Adzuna)',
      type: 'env-key',
      pitch:
        'Not a scanner per se — these are LLM + aggregator credentials the system uses elsewhere. Listed on /sources for completeness so you can probe each key without leaving the page.',
      how: [
        'Anthropic — required for deep evaluations and agent chat',
        'Gemini — recommended for cheap first-pass scoring (free tier)',
        'Adzuna — optional aggregator (adds Adzuna to JobSpy\'s portal list)',
        'Click Test on the card → dashboard runs a real probe (1 token completion / 1 query) against the provider',
      ],
      reconnect:
        'If your key gets revoked or rate-limited, the Test button surfaces the error. Click Configure to jump to /settings and rotate the key. The wizard\'s API-keys step does the same probes before letting you advance.',
      files: ['.env (ANTHROPIC_API_KEY, GEMINI_API_KEY, ADZUNA_APP_ID, ADZUNA_APP_KEY)'],
    },
    {
      icon: Database,
      label: 'Always-on aggregators',
      type: 'always-on',
      pitch:
        'These run every day regardless of /sources state. They don\'t need credentials and can\'t be "disconnected" — they\'re listed for completeness so you understand what\'s covered.',
      how: [
        'scan-portals (scan.mjs) — direct ATS APIs (Greenhouse, Ashby, Lever, Workday, SmartRecruiters, Workable, Personio, Recruitee, Teamtailor — 9 providers)',
        'scan (scan-broad.py) — JobSpy + free aggregators (LinkedIn public, Glassdoor, RemoteOK, etc)',
        'scan-curated (scan-curated.mjs) — niche AI/ML/Dev boards (ai-jobs.net, fwddeploy, etc)',
      ],
      reconnect:
        'Nothing to reconnect. If one of them is failing, check the activity feed for the specific error. Most ATS-API failures are upstream (the ATS provider had a 503); they self-heal on the next run.',
      files: ['scan.mjs, scan-broad.py, scan-curated.mjs'],
    },
  ];

  function tint(t: SourceDoc['type']): string {
    if (t === 'authenticated') return 'border-blue-500/30 bg-blue-500/5';
    if (t === 'imap')          return 'border-rose-500/30 bg-rose-500/5';
    if (t === 'env-key')       return 'border-amber-500/30 bg-amber-500/5';
    return 'border-emerald-500/30 bg-emerald-500/5';
  }
</script>

<div class="h-full overflow-y-auto">
  <Topbar title="Sources" subtitle="How each scanner works and when to reconnect" showTabs={false} />

  <div class="p-6 pb-24">
    <div class="max-w-4xl mx-auto space-y-5">

      <!-- Hero -->
      <div class="space-y-1.5 max-w-3xl">
        <h1 class="text-xl font-semibold tracking-tight flex items-center gap-2">
          <Plug class="size-5 text-fuchsia-400" />
          Sources
        </h1>
        <p class="text-sm text-muted-foreground leading-relaxed">
          The dashboard pulls jobs from multiple sources every weekday at 09:00. Authenticated
          sources (LinkedIn, Indeed) need a one-time browser login. The Gmail IMAP source needs
          an app password. Always-on aggregators (ATS APIs, JobSpy, curated boards) run with no
          configuration. The <a href="/sources" class="underline underline-offset-2 hover:text-foreground">/sources</a>
          page is your single dashboard for all of them.
        </p>
      </div>

      <!-- How status works -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="text-base">How connection state works</Card.Title>
          <Card.Description>
            Every source has a row in <code class="font-mono">data/sources.json</code> tracking its
            health. Each scan run calls one of two helpers:
          </Card.Description>
        </Card.Header>
        <Card.Content class="space-y-2">
          <ul class="text-[11.5px] text-muted-foreground/90 list-disc pl-5 leading-relaxed space-y-1">
            <li>
              <strong>recordSuccess(id)</strong> — sets <code class="font-mono">connected: true</code>,
              updates <code class="font-mono">lastSuccessfulPullAt</code>, resets the failure
              counter.
            </li>
            <li>
              <strong>recordFailure(id, error)</strong> — increments
              <code class="font-mono">consecutiveFailures</code>, stores the last error message.
              After <strong>3</strong> consecutive failures the source flips to
              <code class="font-mono">connected: false</code> and surfaces a red card on /sources.
            </li>
          </ul>
          <p class="text-[11px] text-muted-foreground/80 leading-relaxed pt-1">
            The 3-strike threshold means transient flakes (one captcha, one rate-limit) don't
            disconnect you. Three failures in a row means the underlying credential or session
            actually needs attention.
          </p>
        </Card.Content>
      </Card.Root>

      <!-- Each source -->
      <div class="space-y-3">
        <h2 class="text-sm font-semibold tracking-tight">Sources</h2>
        {#each SOURCES as src (src.label)}
          {@const Icon = src.icon}
          <div class={'rounded-lg border ' + tint(src.type)}>
            <div class="px-4 py-3 space-y-3">
              <div class="flex items-center gap-2">
                <span class="size-7 rounded-md bg-background/60 ring-1 ring-border/40 flex items-center justify-center">
                  <Icon class="size-3.5" />
                </span>
                <h3 class="text-sm font-semibold">{src.label}</h3>
                <span class="ml-auto text-[9px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded border border-border/40 bg-background/50 text-muted-foreground">
                  {src.type}
                </span>
              </div>
              <p class="text-[12px] text-muted-foreground leading-relaxed">{src.pitch}</p>

              <div class="text-[11.5px] space-y-1.5">
                <div>
                  <span class="text-[10px] uppercase tracking-wider font-mono text-muted-foreground/80">How it works</span>
                  <ul class="list-disc pl-5 mt-1 space-y-0.5 text-muted-foreground/90 leading-relaxed">
                    {#each src.how as h (h)}
                      <li>{h}</li>
                    {/each}
                  </ul>
                </div>
                <div>
                  <span class="text-[10px] uppercase tracking-wider font-mono text-muted-foreground/80">When to reconnect</span>
                  <p class="mt-1 text-muted-foreground/90 leading-relaxed">{src.reconnect}</p>
                </div>
                <div>
                  <span class="text-[10px] uppercase tracking-wider font-mono text-muted-foreground/80">Files involved</span>
                  <ul class="list-disc pl-5 mt-1 space-y-0.5 text-muted-foreground/80 leading-relaxed">
                    {#each src.files as f (f)}
                      <li><code class="font-mono text-[10.5px]">{f}</code></li>
                    {/each}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        {/each}
      </div>

      <!-- Actions reference -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="text-base">/sources page actions</Card.Title>
          <Card.Description>What each button does, and what side effects it has.</Card.Description>
        </Card.Header>
        <Card.Content class="space-y-2">
          <div class="space-y-2 text-[12px]">
            <div class="flex items-start gap-3">
              <span class="text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded border border-blue-500/40 bg-blue-500/10 text-blue-300 flex-shrink-0">
                <Plug class="inline size-2.5 mr-0.5" /> Connect
              </span>
              <p class="text-muted-foreground/90 leading-relaxed">
                LinkedIn / Indeed → spawns a headed Chromium for one-time login. Gmail → validates
                IMAP creds + writes them to <code class="font-mono">.env</code>. API-key sources →
                presence-check.
              </p>
            </div>
            <div class="flex items-start gap-3">
              <span class="text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 flex-shrink-0">
                <RefreshCw class="inline size-2.5 mr-0.5" /> Test
              </span>
              <p class="text-muted-foreground/90 leading-relaxed">
                Headless probe — checks the saved Playwright session is still valid, that IMAP
                login still works, or that the API key still authenticates. Updates
                <code class="font-mono">lastSuccessfulPullAt</code> on success.
              </p>
            </div>
            <div class="flex items-start gap-3">
              <span class="text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded border border-red-500/40 bg-red-500/10 text-red-300 flex-shrink-0">
                <Power class="inline size-2.5 mr-0.5" /> Disconnect
              </span>
              <p class="text-muted-foreground/90 leading-relaxed">
                LinkedIn / Indeed → removes <code class="font-mono">.playwright-{'{portal}'}/</code>
                directory. Gmail → wipes <code class="font-mono">GMAIL_IMAP_*</code> from
                <code class="font-mono">.env</code>. State flips to disconnected.
              </p>
            </div>
          </div>
          <p class="text-[11px] text-muted-foreground/80 leading-relaxed pt-1">
            Always-on aggregators have no Connect / Disconnect — only Test (which runs a tiny probe
            against the upstream API).
          </p>
        </Card.Content>
      </Card.Root>

      <!-- Failures -->
      <Card.Root>
        <Card.Header>
          <div class="flex items-center gap-2">
            <AlertCircle class="size-4 text-amber-400" />
            <Card.Title class="text-base">Common failure modes</Card.Title>
          </div>
        </Card.Header>
        <Card.Content class="space-y-2">
          <ul class="text-[12px] text-muted-foreground/90 leading-relaxed space-y-1.5">
            <li>
              <strong>LinkedIn "session expired"</strong> — log out happened on another device, or
              30+ days passed. Click Connect, log in again. Same session unlocks both apply +
              scrape, since they share <code class="font-mono">.playwright-linkedin/</code>.
            </li>
            <li>
              <strong>Indeed captcha</strong> — Indeed periodically serves a "press and hold" test.
              The scraper exits cleanly with the message "captcha — re-login on /sources". Click
              Connect, complete the captcha + login, you're back. Indeed gets less aggressive over
              time once your IP has a stable history.
            </li>
            <li>
              <strong>Gmail "auth failed"</strong> — usually a revoked app password (Google revokes
              them when you change your account password) or 2FA was disabled. Generate a new app
              password and re-fill the form on /sources.
            </li>
            <li>
              <strong>"All scanners failed" on a daily run</strong> — typically a transient
              upstream issue (multiple ATS APIs returning 503 in the same window). Check the
              activity feed; if a single source is consistently failing, click Test on its card
              for a focused error.
            </li>
            <li>
              <strong>Anthropic 401 / Gemini 403</strong> — key was rotated upstream (e.g. you
              regenerated it from the Anthropic console but didn't update <code class="font-mono">.env</code>).
              Open Settings, paste the new key, save.
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
          <a href="/help/onboarding" class="flex items-center justify-between text-[12px] hover:text-foreground text-muted-foreground py-1">
            <span class="inline-flex items-center gap-1.5">
              <Sparkles class="size-3" /> Onboarding — what each wizard step does
            </span>
            <ArrowRight class="size-2.5" />
          </a>
          <a href="/sources" class="flex items-center justify-between text-[12px] hover:text-foreground text-muted-foreground py-1">
            <span class="inline-flex items-center gap-1.5">
              <Plug class="size-3" /> Sources page — connect / test / disconnect now
            </span>
            <ArrowRight class="size-2.5" />
          </a>
          <a href="/help" class="flex items-center justify-between text-[12px] hover:text-foreground text-muted-foreground py-1">
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
