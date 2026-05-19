<script lang="ts">
  /**
   * /help/autonomous-apply -- risk acknowledgment + reference for the
   * autonomous-apply pipeline. Linked from the /profile autonomous-apply
   * card and the AGENTS.md ethical-rule amendment.
   *
   * Sections:
   *   1. What it does (3-sentence summary)
   *   2. Pipeline diagram (Scored → Queued → Applying → Applied)
   *   3. Portal coverage table (production vs stub)
   *   4. Score gate + warmup days mechanics
   *   5. Failure modes + how they surface in the Inbox
   *   6. Risk acknowledgment (LinkedIn, anti-bot, generic cover-letter quality)
   *   7. How to enable + how to cancel an in-flight queue
   */
  import Topbar from '$lib/components/Topbar.svelte';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import {
    Zap,
    ArrowRight,
    ArrowLeft,
    ShieldAlert,
    CheckCircle2,
    AlertCircle,
    AlertTriangle,
    Hourglass,
    Loader2,
    Bell,
    ListChecks,
    ExternalLink,
    FileBadge2,
    Briefcase,
    Activity,
    Info,
  } from '@lucide/svelte';

  type Portal = { id: string; label: string; status: 'production' | 'stub'; notes: string };

  const PORTALS: Portal[] = [
    {
      id: 'linkedin',
      label: 'LinkedIn',
      status: 'production',
      notes:
        'Easy Apply automation. Uses your saved LinkedIn session (.playwright-linkedin/). Uploads cv-general.pdf — never the per-job tailored CV (recruiter red flag).',
    },
    {
      id: 'greenhouse',
      label: 'Greenhouse',
      status: 'production',
      notes:
        'Schema fetch from boards-api / job-boards-api. Handles intl-tel-input phone, react-select dropdowns, Google Places location, custom Q&A from your form-answers cache.',
    },
    {
      id: 'ashby',
      label: 'Ashby',
      status: 'production',
      notes:
        'Persistent context for Cloudflare warm-up. Single name field. Cascading structured location (country/region/city). RichText or file-upload cover letter depending on schema.',
    },
    {
      id: 'lever',
      label: 'Lever',
      status: 'stub',
      notes: '3-4 days of work pending. Routes to apply-stub.py → ManualApplyNeeded.',
    },
    { id: 'workable', label: 'Workable', status: 'stub', notes: '3-4 days of work pending.' },
    {
      id: 'personio',
      label: 'Personio',
      status: 'stub',
      notes: 'DACH-specific quirks (German labels, GDPR consent). 3-4 days.',
    },
    { id: 'smartrecruiters', label: 'SmartRecruiters', status: 'stub', notes: '3-4 days.' },
    { id: 'recruitee', label: 'Recruitee', status: 'stub', notes: '3-4 days.' },
    { id: 'teamtailor', label: 'Teamtailor', status: 'stub', notes: '3-4 days.' },
    {
      id: 'indeed',
      label: 'Indeed',
      status: 'stub',
      notes: 'Aggressive anti-bot, needs careful pacing + persistent context. 5-7 days.',
    },
    {
      id: 'workday',
      label: 'Workday',
      status: 'stub',
      notes:
        'Every customer instance differs; needs per-instance form-schema heuristics. 7-10 days.',
    },
  ];

  type FailureMode = { id: string; summary: string; trigger: string; fix: string };
  const FAILURE_MODES: FailureMode[] = [
    {
      id: 'stub',
      summary: 'Portal not yet automated',
      trigger:
        'Job URL routes to one of the 8 stub portals (Lever, Workable, Personio, SmartRecruiters, Recruitee, Teamtailor, Workday, Indeed).',
      fix: 'Click "Open posting" in the Inbox. Walk the form by hand and use the form-answers cache from the per-job menu.',
    },
    {
      id: 'captcha',
      summary: 'CAPTCHA detected',
      trigger:
        'reCAPTCHA / hCaptcha / Cloudflare Turnstile rendered on the form. Most often after ~10 rapid Greenhouse submissions from the same persistent context.',
      fix: '"Resume in headed browser" — opens a headed Playwright session so you can solve the CAPTCHA. Then re-queue.',
    },
    {
      id: 'anti-bot',
      summary: 'Cloudflare 403 / anti-bot block',
      trigger: 'Edge filter rejected our request fingerprint. Ashby is the most common culprit.',
      fix: 'Re-login to portal in headed mode so the persistent context cookies warm up.',
    },
    {
      id: 'unknown-field',
      summary: 'Required form field has no answer',
      trigger:
        'Schema-required question whose label doesn\'t match any cached answer (e.g. "Why this company?" custom prompt).',
      fix: 'Add the answer to your form-answers cache via the per-job menu, or fill it manually on the posting and mark Applied.',
    },
    {
      id: 'upload-failed',
      summary: 'Resume / cover-letter upload failed',
      trigger:
        'set_input_files() failed after retries — usually a stale tailored CV PDF that was generated but then deleted.',
      fix: 'Click "Regenerate CV" on the job\'s menu. Re-queue once the PDF lands.',
    },
    {
      id: 'validation',
      summary: 'Submission rejected',
      trigger:
        'Submit clicked, but the form validated and returned an error toast (missing field, wrong phone format, etc).',
      fix: 'Open posting, scroll to the validation error, fill manually, submit.',
    },
    {
      id: 'error',
      summary: 'Script crashed',
      trigger: 'Selenium/Playwright threw — usually because a selector changed on the portal side.',
      fix: 'Open posting and finish by hand. If it persists, the adapter needs a selector update — open an issue.',
    },
  ];
</script>

<div class="h-full overflow-y-auto">
  <Topbar
    title="Help · Autonomous apply"
    subtitle="risk acknowledgment + reference"
    showTabs={false}
  />

  <div class="p-6 pb-24">
    <div class="max-w-3xl mx-auto space-y-6">
      <!-- Hero -->
      <div class="space-y-2">
        <div class="flex items-center gap-3">
          <div
            class="size-10 rounded-lg bg-fuchsia-500/10 ring-1 ring-fuchsia-500/40 flex items-center justify-center"
          >
            <Zap class="size-5 text-fuchsia-400" />
          </div>
          <h1 class="text-2xl font-semibold tracking-tight">Autonomous apply</h1>
        </div>
        <p class="text-sm text-muted-foreground leading-relaxed">
          A per-profile opt-in that lets the apply-queue drain submit applications for you on
          LinkedIn / Greenhouse / Ashby — including the final Submit click. Default: OFF. The system
          overrides the usual "stop at Submit" ethical rule only when this toggle is explicitly
          enabled on a profile, the job's score clears your minimum-score gate, the portal has a
          production adapter, and the daily apply cap hasn't been hit.
        </p>
      </div>

      <!-- Risk acknowledgment -->
      <Card.Root class="border-amber-500/40 bg-amber-500/5">
        <Card.Header class="pb-2">
          <Card.Title class="text-base flex items-center gap-2">
            <ShieldAlert class="size-4 text-amber-300" />
            Risk acknowledgment — read before enabling
          </Card.Title>
        </Card.Header>
        <Card.Content class="space-y-3 text-sm leading-relaxed">
          <ul class="space-y-2 list-disc pl-5 text-amber-100/90">
            <li>
              <strong>LinkedIn shadowban risk.</strong> Easy Apply at &gt;10/day from a single IP for
              consecutive days can land your account in a soft-flagged state where listings disappear
              and recruiter messages stop arriving. The warmup window (5/day for the first N days) and
              the global cap exist for this reason — leave them at the defaults unless you accept the
              risk.
            </li>
            <li>
              <strong>Generic cover-letter quality.</strong> Each autonomous apply generates a fresh
              cover letter via Claude. Quality varies and is sometimes worse than what a human would
              write. The generated cover lives under the active user's
              <code class="font-mono">profiles/&lt;slug&gt;/output/</code> dir (<code
                class="font-mono">data/users/&lt;uid&gt;/profiles/&lt;slug&gt;/output/</code
              >, or <code class="font-mono">data/profiles/&lt;slug&gt;/output/</code> in legacy single-user
              installs) so you can audit it post-apply.
            </li>
            <li>
              <strong>Selector breakage.</strong> Every ATS rebuilds its forms eventually. When that
              happens this script will start failing soft to
              <code class="font-mono">ManualApplyNeeded</code>. Inbox will surface the failures; you
              finish by hand until the adapter ships a fix.
            </li>
            <li>
              <strong>Recruiter "bot-filter" filtering.</strong> Some teams add invisible honeypot fields
              specifically to catch automated submissions. Our adapters skip hidden inputs, but a perfectly
              normal-looking form may still flag the submission as bot-originated.
            </li>
          </ul>
        </Card.Content>
      </Card.Root>

      <!-- Pipeline flow -->
      <Card.Root>
        <Card.Header class="pb-2">
          <Card.Title class="text-base flex items-center gap-2">
            <ListChecks class="size-4 text-fuchsia-400" />
            Pipeline flow
          </Card.Title>
        </Card.Header>
        <Card.Content class="space-y-3">
          <div class="flex items-center gap-1.5 text-xs flex-wrap">
            <span
              class="px-2 py-1 rounded bg-cyan-500/10 ring-1 ring-cyan-500/40 text-cyan-200 font-mono"
              >Scored</span
            >
            <ArrowRight class="size-3 text-muted-foreground" />
            <span
              class="px-2 py-1 rounded bg-fuchsia-500/10 ring-1 ring-fuchsia-500/40 text-fuchsia-200 font-mono"
              >Queued</span
            >
            <ArrowRight class="size-3 text-muted-foreground" />
            <span
              class="px-2 py-1 rounded bg-blue-500/10 ring-1 ring-blue-500/40 text-blue-200 font-mono"
              >Applying</span
            >
            <ArrowRight class="size-3 text-muted-foreground" />
            <span
              class="px-2 py-1 rounded bg-violet-500/10 ring-1 ring-violet-500/40 text-violet-200 font-mono"
              >Applied</span
            >
            <span class="text-muted-foreground/50">or</span>
            <span
              class="px-2 py-1 rounded bg-amber-500/10 ring-1 ring-amber-500/40 text-amber-200 font-mono"
              >ManualApplyNeeded</span
            >
          </div>
          <ol class="text-xs text-muted-foreground space-y-1.5 list-decimal pl-5">
            <li>
              Click <strong>Apply</strong> on a Scored job (or auto-queue from CV generation) →
              status flips to <strong>Queued</strong>.
            </li>
            <li>
              The <code class="font-mono">apply-queue-drain</code> autopilot job runs daily on
              weekdays (or "Run drain now" from /queue) → status flips to <strong>Applying</strong>.
            </li>
            <li>
              Drain spawns the right per-portal Python adapter via <code class="font-mono"
                >apply-portal.py</code
              >.
            </li>
            <li>
              Adapter fills the form, uploads the tailored CV, clicks Submit. Confirmation page → <strong
                >Applied</strong
              >.
            </li>
            <li>
              Any soft block (CAPTCHA, unknown field, anti-bot) → <strong>ManualApplyNeeded</strong> +
              Inbox issue with "Open posting" CTA.
            </li>
          </ol>
        </Card.Content>
      </Card.Root>

      <!-- Portal coverage -->
      <Card.Root>
        <Card.Header class="pb-2">
          <Card.Title class="text-base flex items-center gap-2">
            <Briefcase class="size-4 text-fuchsia-400" />
            Portal coverage
          </Card.Title>
        </Card.Header>
        <Card.Content class="space-y-1.5">
          {#each PORTALS as p (p.id)}
            <div
              class="rounded-md border border-border/40 bg-card px-3 py-2 flex items-start gap-3"
            >
              {#if p.status === 'production'}
                <CheckCircle2 class="size-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              {:else}
                <Hourglass class="size-4 text-amber-400 mt-0.5 flex-shrink-0" />
              {/if}
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium flex items-center gap-2">
                  {p.label}
                  <span
                    class={p.status === 'production'
                      ? 'text-[11px] uppercase tracking-wider text-emerald-300/80'
                      : 'text-[11px] uppercase tracking-wider text-amber-300/80'}
                  >
                    {p.status}
                  </span>
                </div>
                <p class="text-[11px] text-muted-foreground/80 leading-relaxed mt-0.5">{p.notes}</p>
              </div>
            </div>
          {/each}
        </Card.Content>
      </Card.Root>

      <!-- Gating mechanics -->
      <Card.Root>
        <Card.Header class="pb-2">
          <Card.Title class="text-base flex items-center gap-2">
            <Activity class="size-4 text-fuchsia-400" />
            Score gate &amp; warmup
          </Card.Title>
        </Card.Header>
        <Card.Content class="space-y-3 text-sm leading-relaxed">
          <div>
            <h3 class="font-medium text-sm">Score gate</h3>
            <p class="text-xs text-muted-foreground mt-1">
              Default 4.0/5. Jobs below this threshold stay at <code class="font-mono"
                >ManualApplyNeeded</code
              >
              even when autonomous mode is on — protecting recruiter time on borderline-fit roles. Tune
              via the slider on the /profile autonomous-apply card. Recommended floor: 4.0.
            </p>
          </div>
          <div>
            <h3 class="font-medium text-sm">Warmup days</h3>
            <p class="text-xs text-muted-foreground mt-1">
              For the first N days after enabling, the per-profile cap is clamped to 5
              applications/day regardless of the global "Max applies / day" setting on /autopilot.
              Default 7 days. Buys you a window to confirm the pipeline works before opening the
              flood gates.
            </p>
          </div>
          <div>
            <h3 class="font-medium text-sm">Daily apply cap (global)</h3>
            <p class="text-xs text-muted-foreground mt-1">
              The <code class="font-mono">maxAppliesPerDay</code> threshold on /autopilot caps EVERY profile's
              autonomous applies combined. This is intentional — a single IP applying 60×/day across 3
              profiles still trips LinkedIn's shadowban. The drain stops as soon as today's counter hits
              the cap.
            </p>
          </div>
        </Card.Content>
      </Card.Root>

      <!-- Failure modes -->
      <Card.Root>
        <Card.Header class="pb-2">
          <Card.Title class="text-base flex items-center gap-2">
            <Bell class="size-4 text-amber-400" />
            Failure modes
          </Card.Title>
        </Card.Header>
        <Card.Content class="space-y-2">
          {#each FAILURE_MODES as f (f.id)}
            <div class="rounded-md border border-border/40 bg-card px-3 py-2 space-y-1">
              <div class="text-sm font-medium flex items-center gap-2">
                <AlertTriangle class="size-3.5 text-amber-400 flex-shrink-0" />
                {f.summary}
                <span
                  class="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-mono"
                  >{f.id}</span
                >
              </div>
              <p class="text-[11px] text-muted-foreground/80 leading-relaxed">
                <strong class="text-foreground/80">When:</strong>
                {f.trigger}
              </p>
              <p class="text-[11px] text-muted-foreground/80 leading-relaxed">
                <strong class="text-foreground/80">Fix:</strong>
                {f.fix}
              </p>
            </div>
          {/each}
        </Card.Content>
      </Card.Root>

      <!-- How to enable -->
      <Card.Root>
        <Card.Header class="pb-2">
          <Card.Title class="text-base flex items-center gap-2">
            <Zap class="size-4 text-fuchsia-400" />
            How to enable / cancel
          </Card.Title>
        </Card.Header>
        <Card.Content class="space-y-3 text-sm">
          <ol class="list-decimal pl-5 space-y-1.5 text-muted-foreground">
            <li>
              Go to <a href="/profile" class="underline underline-offset-2 hover:text-foreground"
                >/profile</a
              >
              → open the <strong>Autonomous apply</strong> card.
            </li>
            <li>Tick "Enable autonomous apply for this profile".</li>
            <li>(Optional) Adjust min score, warmup days, and which portals are enabled.</li>
            <li>Click <strong>Save changes</strong> at the bottom of the page.</li>
            <li>
              The Apply button on every job in this profile now collapses to a single "Queue apply"
              click.
            </li>
          </ol>
          <p class="text-[11px] text-muted-foreground/70 pt-2 border-t border-border/30">
            <strong>To cancel an in-flight queue:</strong> on
            <a href="/queue" class="underline underline-offset-2 hover:text-foreground">/queue</a>,
            each Queued job has a <strong>Cancel</strong> button that reverts it to Scored. Once a
            job has transitioned to <strong>Applying</strong>, you cannot cancel — wait for the
            script to finish (or fail soft). Disable the toggle to stop future drains, but in-flight
            jobs will still complete their current run.
          </p>
        </Card.Content>
      </Card.Root>

      <!-- Back link -->
      <div class="flex items-center justify-between pt-2">
        <Button variant="ghost" size="sm" href="/profile" class="text-xs gap-1">
          <ArrowLeft class="size-3" /> Back to /profile
        </Button>
        <Button variant="ghost" size="sm" href="/help" class="text-xs gap-1">
          More help <ArrowRight class="size-3" />
        </Button>
      </div>
    </div>
  </div>
</div>
