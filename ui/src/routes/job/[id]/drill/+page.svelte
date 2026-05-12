<!--
  /job/[id]/drill — live drill in the medium you'll be tested in.

  Two tabs:
    1. Code — plain textarea with monospace font + Claude commentary on
       demand. The actual run-the-code piece is intentionally omitted
       (too much infra); the user runs locally in their own IDE if they
       want to verify. The VALUE is the live coaching, not the IDE.
    2. Design — boxes-and-arrows: simple labeled-node + labeled-edge
       JSON editor + an SVG preview. Claude reads the JSON and comments
       on tradeoffs / failure modes / scaling.

  For each tab: type a problem statement, fill in the work, click
  "Get coach feedback" → see WORKING / WATCH / SUGGEST / QUESTION.
  Cumulative feedback log on the right so you can iterate.
-->
<script lang="ts">
  import Topbar from '$lib/components/Topbar.svelte';
  import * as Card from '$lib/components/ui/card';
  import * as Tabs from '$lib/components/ui/tabs';
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import { Input } from '$lib/components/ui/input';
  import {
    Code,
    Network,
    MessageSquare,
    Loader2,
    Sparkles,
    ArrowLeft,
    HelpCircle,
    CheckCircle2,
    AlertTriangle,
    Plus,
    X,
  } from '@lucide/svelte';
  import { api, ApiError } from '$lib/api';
  import { toast } from 'svelte-sonner';
  import { cn } from '$lib/utils';
  import type { Job } from '$lib/types';

  let { data }: { data: { job: Job; profileId: string } } = $props();

  type Feedback = {
    working?: string;
    watch?: string;
    suggest?: string;
    question?: string;
    mode: 'code' | 'design';
  };

  let activeTab = $state<'code' | 'design'>('code');

  // Code state
  let codeProblem = $state('');
  let codeText = $state('');
  let codeFeedback = $state<Feedback[]>([]);
  let codeBusy = $state(false);

  // Design state — nodes + edges JSON, plus SVG preview.
  type Node = { id: string; label: string; x: number; y: number };
  type Edge = { from: string; to: string; label?: string };
  let designProblem = $state('');
  let designNodes = $state<Node[]>([
    { id: 'client', label: 'Client', x: 60, y: 80 },
    { id: 'api', label: 'API', x: 240, y: 80 },
    { id: 'db', label: 'DB', x: 420, y: 80 },
  ]);
  let designEdges = $state<Edge[]>([
    { from: 'client', to: 'api', label: 'HTTPS' },
    { from: 'api', to: 'db', label: 'SQL' },
  ]);
  let designFeedback = $state<Feedback[]>([]);
  let designBusy = $state(false);

  // Drag-to-move: stores the active drag offset.
  let dragging = $state<{ id: string; ox: number; oy: number } | null>(null);

  function nodeMouseDown(node: Node, e: MouseEvent) {
    dragging = { id: node.id, ox: e.clientX - node.x, oy: e.clientY - node.y };
  }
  function onSvgMouseMove(e: MouseEvent) {
    if (!dragging) return;
    const i = designNodes.findIndex((n) => n.id === dragging!.id);
    if (i < 0) return;
    designNodes[i] = { ...designNodes[i], x: e.clientX - dragging.ox, y: e.clientY - dragging.oy };
    designNodes = [...designNodes];
  }
  function onSvgMouseUp() {
    dragging = null;
  }

  function addNode() {
    const id = 'n' + Date.now().toString(36);
    designNodes = [...designNodes, { id, label: 'New', x: 100, y: 200 }];
  }
  function removeNode(id: string) {
    designNodes = designNodes.filter((n) => n.id !== id);
    designEdges = designEdges.filter((e) => e.from !== id && e.to !== id);
  }
  function addEdge() {
    if (designNodes.length < 2) return;
    designEdges = [...designEdges, { from: designNodes[0].id, to: designNodes[1].id, label: '' }];
  }
  function removeEdge(i: number) {
    designEdges = designEdges.filter((_, idx) => idx !== i);
  }

  async function requestFeedback(mode: 'code' | 'design') {
    const busy = mode === 'code' ? codeBusy : designBusy;
    if (busy) return;
    const problem = mode === 'code' ? codeProblem : designProblem;
    if (!problem.trim()) {
      toast.warning('Set the problem statement first');
      return;
    }
    let userInput = '';
    if (mode === 'code') {
      userInput = codeText;
    } else {
      userInput = JSON.stringify({ nodes: designNodes, edges: designEdges }, null, 2);
    }
    const previousFeedback = (mode === 'code' ? codeFeedback : designFeedback).map((f) =>
      [f.working, f.watch, f.suggest, f.question].filter(Boolean).join(' / '),
    );
    if (mode === 'code') codeBusy = true;
    else designBusy = true;
    try {
      const r = await api.post<Feedback & { ok: boolean; error?: string }>(
        '/api/job/' +
          encodeURIComponent(data.job.id) +
          '/drill?profile=' +
          encodeURIComponent(data.profileId),
        { mode, problem, userInput, previousFeedback },
        { silent: true },
      );
      if (!r.ok) {
        toast.error('Drill feedback failed', { description: r.error ?? 'unknown' });
        return;
      }
      const entry: Feedback = {
        mode,
        working: r.working,
        watch: r.watch,
        suggest: r.suggest,
        question: r.question,
      };
      if (mode === 'code') codeFeedback = [...codeFeedback, entry];
      else designFeedback = [...designFeedback, entry];
    } catch (e) {
      const err = e as ApiError;
      toast.error('Drill failed', { description: err.message });
    } finally {
      if (mode === 'code') codeBusy = false;
      else designBusy = false;
    }
  }
</script>

<div class="h-full overflow-y-auto">
  <Topbar
    title="Drill · {data.job?.role ?? 'Job'}"
    subtitle={data.job?.company}
    breadcrumb="Job"
    breadcrumbHref={'/job/' + (data.job?.id ?? '')}
    showTabs={false}
  />

  <div class="p-6 pb-24">
    <div class="max-w-6xl mx-auto space-y-5">
      <!-- Hero -->
      <div class="space-y-2">
        <div class="flex items-center gap-3">
          <div
            class="size-10 rounded-lg bg-orange-500/10 ring-1 ring-orange-500/40 flex items-center justify-center"
          >
            <Code class="size-5 text-orange-400" />
          </div>
          <h1 class="text-2xl font-semibold tracking-tight">Drill mode</h1>
        </div>
        <p class="text-sm text-muted-foreground leading-relaxed">
          Live coaching while you code or whiteboard. Type the problem, draft a solution, click "Get
          coach feedback" — Claude gives you a 4-line scorecard: what's working, what to watch, what
          to do next, and a question a real interviewer would ask right now.
        </p>
      </div>

      <Tabs.Root
        value={activeTab}
        onValueChange={(v) => (activeTab = v as 'code' | 'design')}
        class="w-full"
      >
        <Tabs.List>
          <Tabs.Trigger value="code" class="gap-1.5"><Code class="size-3" /> Code</Tabs.Trigger>
          <Tabs.Trigger value="design" class="gap-1.5"
            ><Network class="size-3" /> System design</Tabs.Trigger
          >
        </Tabs.List>

        <!-- CODE TAB -->
        <Tabs.Content value="code">
          <div class="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
            <Card.Root>
              <Card.Header class="pb-2">
                <Card.Title class="text-sm">Code drill</Card.Title>
              </Card.Header>
              <Card.Content class="space-y-3">
                <div class="space-y-1">
                  <Label class="text-xs" for="code-problem">Problem statement</Label>
                  <Input
                    id="code-problem"
                    bind:value={codeProblem}
                    placeholder="e.g. Implement an in-memory rate limiter, 100 req/min per user, sliding window"
                    class="text-sm"
                  />
                </div>
                <div class="space-y-1">
                  <Label class="text-xs" for="code-text">Your code (any language)</Label>
                  <Textarea
                    id="code-text"
                    bind:value={codeText}
                    rows={20}
                    class="font-mono text-xs"
                    placeholder={'function solve() {\n  // think aloud as you type\n}'}
                  />
                </div>
                <div class="flex items-center gap-2">
                  <Button
                    onclick={() => requestFeedback('code')}
                    disabled={codeBusy}
                    class="gap-1.5"
                  >
                    {#if codeBusy}<Loader2 class="size-3 animate-spin" />{:else}<MessageSquare
                        class="size-3"
                      />{/if}
                    Get coach feedback
                  </Button>
                  <span class="text-[11px] text-muted-foreground"
                    >{codeFeedback.length} round{codeFeedback.length === 1 ? '' : 's'} this session</span
                  >
                </div>
              </Card.Content>
            </Card.Root>

            <Card.Root>
              <Card.Header class="pb-2">
                <Card.Title class="text-sm flex items-center gap-1.5"
                  ><Sparkles class="size-3 text-amber-400" /> Coach feedback</Card.Title
                >
              </Card.Header>
              <Card.Content class="space-y-2">
                {#if codeFeedback.length === 0}
                  <p class="text-[11px] text-muted-foreground italic">
                    Write code + click feedback to start.
                  </p>
                {/if}
                {#each codeFeedback as f, i (i)}
                  <div
                    class="rounded-md border border-border/40 bg-card px-2.5 py-2 space-y-1 text-[11px]"
                  >
                    <div class="text-[9px] uppercase tracking-wider text-muted-foreground">
                      Round {i + 1}
                    </div>
                    {#if f.working}<div>
                        <span class="text-emerald-300 font-mono text-[9px]">WORKING</span>
                        <span class="text-muted-foreground">{f.working}</span>
                      </div>{/if}
                    {#if f.watch}<div>
                        <span class="text-amber-300 font-mono text-[9px]">WATCH</span>
                        <span class="text-muted-foreground">{f.watch}</span>
                      </div>{/if}
                    {#if f.suggest}<div>
                        <span class="text-cyan-300 font-mono text-[9px]">SUGGEST</span>
                        <span class="text-muted-foreground">{f.suggest}</span>
                      </div>{/if}
                    {#if f.question}<div>
                        <span class="text-fuchsia-300 font-mono text-[9px]">QUESTION</span>
                        <span class="text-muted-foreground italic">"{f.question}"</span>
                      </div>{/if}
                  </div>
                {/each}
              </Card.Content>
            </Card.Root>
          </div>
        </Tabs.Content>

        <!-- DESIGN TAB -->
        <Tabs.Content value="design">
          <div class="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
            <Card.Root>
              <Card.Header class="pb-2">
                <Card.Title class="text-sm">System design whiteboard</Card.Title>
              </Card.Header>
              <Card.Content class="space-y-3">
                <div class="space-y-1">
                  <Label class="text-xs" for="design-problem">Problem statement</Label>
                  <Input
                    id="design-problem"
                    bind:value={designProblem}
                    placeholder="e.g. Design a URL shortener for 1B daily clicks"
                    class="text-sm"
                  />
                </div>
                <div class="space-y-1">
                  <Label class="text-xs">Diagram (drag boxes to move)</Label>
                  <div class="rounded-md border border-border/40 bg-card overflow-hidden">
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <svg
                      viewBox="0 0 800 400"
                      class="w-full h-72 bg-card"
                      onmousemove={onSvgMouseMove}
                      onmouseup={onSvgMouseUp}
                      onmouseleave={onSvgMouseUp}
                    >
                      <!-- Edges -->
                      {#each designEdges as edge (edge.from + edge.to)}
                        {@const from = designNodes.find((n) => n.id === edge.from)}
                        {@const to = designNodes.find((n) => n.id === edge.to)}
                        {#if from && to}
                          <line
                            x1={from.x + 50}
                            y1={from.y + 20}
                            x2={to.x + 50}
                            y2={to.y + 20}
                            stroke="#666"
                            stroke-width="2"
                          />
                          {#if edge.label}
                            <text
                              x={(from.x + to.x) / 2 + 50}
                              y={(from.y + to.y) / 2 + 12}
                              fill="#999"
                              font-size="10"
                              text-anchor="middle">{edge.label}</text
                            >
                          {/if}
                        {/if}
                      {/each}
                      <!-- Nodes -->
                      {#each designNodes as node (node.id)}
                        <g
                          transform="translate({node.x}, {node.y})"
                          class="cursor-move"
                          onmousedown={(e) => nodeMouseDown(node, e)}
                          role="button"
                          tabindex="0"
                        >
                          <rect
                            width="100"
                            height="40"
                            rx="6"
                            fill="#1f2937"
                            stroke="#a78bfa"
                            stroke-width="1.5"
                          />
                          <text x="50" y="25" fill="#e9d5ff" font-size="12" text-anchor="middle"
                            >{node.label}</text
                          >
                        </g>
                      {/each}
                    </svg>
                  </div>
                </div>
                <!-- Edit nodes/edges -->
                <div class="grid grid-cols-2 gap-3">
                  <div class="space-y-1.5">
                    <div class="flex items-center justify-between">
                      <Label class="text-xs">Nodes</Label>
                      <Button size="sm" variant="ghost" onclick={addNode} class="h-6 text-[11px]"
                        ><Plus class="size-3" /></Button
                      >
                    </div>
                    {#each designNodes as node, i (node.id)}
                      <div class="flex items-center gap-1">
                        <Input
                          type="text"
                          value={node.label}
                          oninput={(e) => {
                            designNodes[i].label = (e.currentTarget as HTMLInputElement).value;
                            designNodes = [...designNodes];
                          }}
                          class="h-7 text-xs"
                        />
                        <button
                          onclick={() => removeNode(node.id)}
                          class="text-muted-foreground hover:text-red-300"
                          aria-label="Remove node"><X class="size-3" /></button
                        >
                      </div>
                    {/each}
                  </div>
                  <div class="space-y-1.5">
                    <div class="flex items-center justify-between">
                      <Label class="text-xs">Edges</Label>
                      <Button size="sm" variant="ghost" onclick={addEdge} class="h-6 text-[11px]"
                        ><Plus class="size-3" /></Button
                      >
                    </div>
                    {#each designEdges as edge, i (i)}
                      <div class="flex items-center gap-1">
                        <select
                          value={edge.from}
                          onchange={(e) => {
                            designEdges[i].from = (e.currentTarget as HTMLSelectElement).value;
                            designEdges = [...designEdges];
                          }}
                          class="h-7 rounded text-[11px] border border-border/40 bg-card flex-1"
                        >
                          {#each designNodes as n}<option value={n.id}>{n.label}</option>{/each}
                        </select>
                        <span class="text-[11px] text-muted-foreground">→</span>
                        <select
                          value={edge.to}
                          onchange={(e) => {
                            designEdges[i].to = (e.currentTarget as HTMLSelectElement).value;
                            designEdges = [...designEdges];
                          }}
                          class="h-7 rounded text-[11px] border border-border/40 bg-card flex-1"
                        >
                          {#each designNodes as n}<option value={n.id}>{n.label}</option>{/each}
                        </select>
                        <button
                          onclick={() => removeEdge(i)}
                          class="text-muted-foreground hover:text-red-300"
                          aria-label="Remove edge"><X class="size-3" /></button
                        >
                      </div>
                    {/each}
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <Button
                    onclick={() => requestFeedback('design')}
                    disabled={designBusy}
                    class="gap-1.5"
                  >
                    {#if designBusy}<Loader2 class="size-3 animate-spin" />{:else}<MessageSquare
                        class="size-3"
                      />{/if}
                    Get coach feedback
                  </Button>
                  <span class="text-[11px] text-muted-foreground"
                    >{designFeedback.length} round{designFeedback.length === 1 ? '' : 's'}</span
                  >
                </div>
              </Card.Content>
            </Card.Root>

            <Card.Root>
              <Card.Header class="pb-2">
                <Card.Title class="text-sm flex items-center gap-1.5"
                  ><Sparkles class="size-3 text-amber-400" /> Coach feedback</Card.Title
                >
              </Card.Header>
              <Card.Content class="space-y-2">
                {#if designFeedback.length === 0}
                  <p class="text-[11px] text-muted-foreground italic">
                    Draft a diagram + click feedback to start.
                  </p>
                {/if}
                {#each designFeedback as f, i (i)}
                  <div
                    class="rounded-md border border-border/40 bg-card px-2.5 py-2 space-y-1 text-[11px]"
                  >
                    <div class="text-[9px] uppercase tracking-wider text-muted-foreground">
                      Round {i + 1}
                    </div>
                    {#if f.working}<div>
                        <span class="text-emerald-300 font-mono text-[9px]">WORKING</span>
                        <span class="text-muted-foreground">{f.working}</span>
                      </div>{/if}
                    {#if f.watch}<div>
                        <span class="text-amber-300 font-mono text-[9px]">WATCH</span>
                        <span class="text-muted-foreground">{f.watch}</span>
                      </div>{/if}
                    {#if f.suggest}<div>
                        <span class="text-cyan-300 font-mono text-[9px]">SUGGEST</span>
                        <span class="text-muted-foreground">{f.suggest}</span>
                      </div>{/if}
                    {#if f.question}<div>
                        <span class="text-fuchsia-300 font-mono text-[9px]">QUESTION</span>
                        <span class="text-muted-foreground italic">"{f.question}"</span>
                      </div>{/if}
                  </div>
                {/each}
              </Card.Content>
            </Card.Root>
          </div>
        </Tabs.Content>
      </Tabs.Root>

      <!-- Back -->
      <div class="pt-2">
        <Button
          variant="ghost"
          size="sm"
          href={'/job/' + (data.job?.id ?? '')}
          class="text-xs gap-1"
        >
          <ArrowLeft class="size-3" /> Back to job
        </Button>
      </div>
    </div>
  </div>
</div>
