<script lang="ts">
  /**
   * /help/technical-interview -- guide to the tech-prep workflow.
   *
   * Tells the user:
   *   - When to run "Generate tech-prep plan" (any interview stage)
   *   - What it produces (file location, sections)
   *   - How to combine with story-bank + mock-interview modes
   *   - The 3-resource learning paths for the most common round types
   */
  import Topbar from '$lib/components/Topbar.svelte';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import {
    Sparkles,
    Code,
    Network,
    MessageSquare,
    ArrowLeft,
    ArrowRight,
    ExternalLink,
    Target,
    Clock,
    BookOpen,
    Mic2,
  } from '@lucide/svelte';
</script>

<div class="h-full overflow-y-auto">
  <Topbar title="Help · Technical interviews" subtitle="prep workflow" showTabs={false} />

  <div class="p-6 pb-24">
    <div class="max-w-3xl mx-auto space-y-6">
      <!-- Hero -->
      <div class="space-y-2">
        <div class="flex items-center gap-3">
          <div
            class="size-10 rounded-lg bg-orange-500/10 ring-1 ring-orange-500/40 flex items-center justify-center"
          >
            <Code class="size-5 text-orange-600 dark:text-orange-400" />
          </div>
          <h1 class="text-2xl font-semibold tracking-tight">Technical interview prep</h1>
        </div>
        <p class="text-sm text-muted-foreground leading-relaxed">
          The Heron technical-interview workflow combines three modes: <strong>tech-prep</strong>
          (company-specific plan), <strong>mock-interview</strong> (live drill), and
          <strong>seed-story-bank</strong> (STAR+R stories for the behavioral half). Run them in sequence
          once a job hits any interview stage and you'll walk into the loop with a focused plan instead
          of generic "review fundamentals" advice.
        </p>
      </div>

      <!-- Workflow -->
      <Card.Root>
        <Card.Header class="pb-2">
          <Card.Title class="text-base flex items-center gap-2">
            <Target class="size-4 text-orange-600 dark:text-orange-400" />
            Recommended workflow
          </Card.Title>
        </Card.Header>
        <Card.Content class="space-y-2 text-sm">
          <ol class="list-decimal pl-5 space-y-2 text-muted-foreground">
            <li>
              <strong class="text-foreground"
                >When a job moves to PhoneScreen / Technical / Onsite:</strong
              >
              click the job's "⋯" menu → <em>Generate tech-prep plan</em>. ~1-2 min via Claude.
              Output lands at
              <code class="font-mono text-[11px]"
                >interview-prep/{'{'}company-slug{'}'}-{'{'}role-slug{'}'}-tech-prep.md</code
              >.
            </li>
            <li>
              <strong class="text-foreground">Confirm story bank is seeded:</strong>
              /profile → <em>Story bank</em> card. If empty, click "Seed from CV". The tech-prep behavioral
              section pulls from this file.
            </li>
            <li>
              <strong class="text-foreground">Drill before the round:</strong> /chat → switch to
              <em>mock-interview</em> mode → paste the JD + tell it which round (e.g. "Behavioral prep
              for Stripe onsite, focus on conflict + scope-creep stories"). Claude plays the interviewer,
              scores your answers, asks follow-ups.
            </li>
            <li>
              <strong class="text-foreground">Update the bank after the interview:</strong>
              Failed a question? Add a story for it manually to
              <code class="font-mono text-[11px]">interview-prep/story-bank.md</code>. Hit a fresh
              topic? Add it to the bank so the next interview-prep run includes it.
            </li>
          </ol>
        </Card.Content>
      </Card.Root>

      <!-- What's in the file -->
      <Card.Root>
        <Card.Header class="pb-2">
          <Card.Title class="text-base flex items-center gap-2">
            <BookOpen class="size-4 text-orange-600 dark:text-orange-400" />
            What's in a tech-prep file
          </Card.Title>
        </Card.Header>
        <Card.Content class="space-y-2 text-sm text-muted-foreground">
          <ul class="list-disc pl-5 space-y-1.5">
            <li>
              <strong class="text-foreground">Pipeline map</strong> — the actual rounds this company runs,
              with sources cited (Glassdoor / Blind / careers page).
            </li>
            <li>
              <strong class="text-foreground">Coding-interview prep</strong> — per round: format, topic
              types, a 30-question LeetCode warm-up list, budgeted prep hours, company-specific cheat
              sheets.
            </li>
            <li>
              <strong class="text-foreground">System-design prep</strong> — likely problem types, 1-3
              deep-dive resources, the 3-4 architectural debates this company cares about (from their
              eng blog), and a practice problem.
            </li>
            <li>
              <strong class="text-foreground">Take-home guidance</strong> — time budget, tradeoff strategy,
              common rubric items, submission etiquette.
            </li>
            <li>
              <strong class="text-foreground">Behavioral prep</strong> — 3 stories from your bank that
              map best to this company's culture.
            </li>
            <li>
              <strong class="text-foreground">Day-of logistics</strong> — install/configure list, environment
              check, the 60-second "tell me about yourself" tuned for this role.
            </li>
            <li>
              <strong class="text-foreground">Red flags to listen for</strong> — questions that would
              downgrade your interest in the offer.
            </li>
          </ul>
        </Card.Content>
      </Card.Root>

      <!-- Round-type recipes -->
      <Card.Root>
        <Card.Header class="pb-2">
          <Card.Title class="text-base flex items-center gap-2">
            <Network class="size-4 text-orange-600 dark:text-orange-400" />
            Three-resource learning paths
          </Card.Title>
        </Card.Header>
        <Card.Content class="space-y-3 text-sm">
          <div>
            <h3 class="font-medium text-sm flex items-center gap-1.5">
              <Code class="size-3.5 text-orange-700 dark:text-orange-300" /> Coding rounds
            </h3>
            <ul class="list-disc pl-5 mt-1 text-xs text-muted-foreground space-y-0.5">
              <li>
                <strong class="text-foreground">Pattern reference:</strong>
                <a
                  href="https://www.educative.io/courses/grokking-the-coding-interview"
                  target="_blank"
                  class="underline">Grokking the Coding Interview</a
                > — 16 reusable patterns, ~24h end-to-end
              </li>
              <li>
                <strong class="text-foreground">Per-company list:</strong> LeetCode "{'{'}company{'}'}
                interview" tag — most-asked problems for that company
              </li>
              <li>
                <strong class="text-foreground">Live practice:</strong> /chat → mock-interview mode
                → "Live coding mock for {'{'}company{'}'} backend"
              </li>
            </ul>
          </div>
          <div>
            <h3 class="font-medium text-sm flex items-center gap-1.5">
              <Network class="size-3.5 text-orange-700 dark:text-orange-300" /> System design
            </h3>
            <ul class="list-disc pl-5 mt-1 text-xs text-muted-foreground space-y-0.5">
              <li>
                <strong class="text-foreground">Foundations:</strong>
                <a
                  href="https://github.com/donnemartin/system-design-primer"
                  target="_blank"
                  class="underline">System Design Primer</a
                > (donnemartin) — the canonical starting point
              </li>
              <li>
                <strong class="text-foreground">Per-company hints:</strong> read the engineering blog
                of the company you're interviewing at — what they write about is what they ask about
              </li>
              <li>
                <strong class="text-foreground">Live practice:</strong> mock-interview mode →
                "System design mock: rate-limit per merchant for {'{'}company{'}'}"
              </li>
            </ul>
          </div>
          <div>
            <h3 class="font-medium text-sm flex items-center gap-1.5">
              <MessageSquare class="size-3.5 text-orange-700 dark:text-orange-300" /> Behavioral / leadership
            </h3>
            <ul class="list-disc pl-5 mt-1 text-xs text-muted-foreground space-y-0.5">
              <li>
                <strong class="text-foreground">Story bank:</strong> /profile → Story bank → Seed from
                CV. Edit by hand to refine.
              </li>
              <li>
                <strong class="text-foreground">Mapping:</strong> tech-prep section 5 picks 3 stories
                tuned to the company's published values
              </li>
              <li>
                <strong class="text-foreground">Live practice:</strong> mock-interview mode →
                "Behavioral mock for {'{'}role{'}'} at {'{'}company{'}'}"
              </li>
            </ul>
          </div>
        </Card.Content>
      </Card.Root>

      <!-- Time budget -->
      <Card.Root>
        <Card.Header class="pb-2">
          <Card.Title class="text-base flex items-center gap-2">
            <Clock class="size-4 text-orange-600 dark:text-orange-400" />
            Realistic time budget
          </Card.Title>
        </Card.Header>
        <Card.Content class="space-y-1 text-sm text-muted-foreground">
          <p class="text-xs leading-relaxed">
            For a typical FAANG-tier Senior loop, plan 25-40 hours over 2 weeks before the onsite:
          </p>
          <ul class="list-disc pl-5 text-xs space-y-0.5 mt-2">
            <li>
              <strong class="text-foreground">~12-15h coding</strong> — 30 LeetCode problems at company-frequency-weighted
              tags
            </li>
            <li>
              <strong class="text-foreground">~6-8h system design</strong> — 1 deep-dive book + 2 practice
              problems written up
            </li>
            <li>
              <strong class="text-foreground">~4-6h behavioral</strong> — story refinement + 2 mock sessions
            </li>
            <li>
              <strong class="text-foreground">~2-3h logistics</strong> — environment check, company research,
              the "tell me about yourself" pitch
            </li>
          </ul>
          <p class="text-xs leading-relaxed pt-2 border-t border-border/30 mt-2">
            For a non-FAANG Senior role, halve all of these. For a Staff/Principal loop, double the
            system-design budget.
          </p>
        </Card.Content>
      </Card.Root>

      <!-- Back link -->
      <div class="flex items-center justify-between pt-2">
        <Button variant="ghost" size="sm" href="/help" class="text-xs gap-1">
          <ArrowLeft class="size-3" /> Back to help
        </Button>
        <Button variant="ghost" size="sm" href="/profile" class="text-xs gap-1">
          Seed story bank <ArrowRight class="size-3" />
        </Button>
      </div>
    </div>
  </div>
</div>
