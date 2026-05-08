/**
 * Module description.
 *
 * @module
 */

import fs from "node:fs";
import path from "node:path";

const UI = "/Users/home/career-ops/ui";
const CO = "/Users/home/career-ops";

// ---------- New career-ops modes ----------

const modeFiles = {
  // --- modes/mock-interview.md ---
  "modes/mock-interview.md": `# Mode: mock-interview — Realistic interview rehearsal

When the candidate runs \`/career-ops mock-interview <company>\` or invokes mock interview from the UI, you become the interviewer for that specific role.

## Setup

1. Read \`reports/<id>-<company>-*.md\` for the JD context (Block A: role summary, Block B: requirements, Block F: STAR stories already prepared)
2. Read \`config/profile.yml\` and \`cv.md\` for candidate context
3. Read \`interview-prep/story-bank.md\` for accumulated stories

## Interviewer persona

Pick the most likely interviewer type for this round:
- **Recruiter screen** (1st round): warm, asks about motivation, current comp, timeline, basic technical fit. ~15 min, no deep tech.
- **Hiring manager** (2nd round): mid-warmth, focused on past work, asks behavioral STAR questions, validates seniority. ~30-45 min.
- **Tech lead / peer** (3rd round): direct, asks specific technical depth questions, code/system design. ~45-60 min.
- **Cross-functional** (4th round): product/design/skip-level — asks about collaboration, conflict, judgment. ~30 min.

Default to Hiring Manager unless the user specifies.

## Interview structure

1. Open with a friendly question about why they're interested in this role/company. (1 question)
2. Ask 2-3 behavioral questions calibrated to the JD (use Block B requirements as the targeting filter). Examples:
   - "Tell me about a time you modernized a legacy system."
   - "Describe a production incident you led the response on."
   - "Walk me through a project where you owned a feature end-to-end."
3. Ask 1-2 technical depth questions specific to the JD's stack (TypeScript, Cloudflare Workers, etc.).
4. Ask a "weakness or growth area" question.
5. Open it up: "What questions do you have for me?"
6. After the candidate's reply to each, ALWAYS provide 1 short evaluator note (3-5 lines):
   - **Score 1-5** for that response
   - **What worked** (1 line)
   - **What to improve** (1 line, specific)
   - **Stronger phrasing** suggestion (1 line, ready to copy)

## Closing

After 5-7 exchanges, give a final summary:
- Overall score 1-5
- Top 2 strengths in this rehearsal
- Top 2 things to fix before the real interview
- 1 key story to commit to memory and lead with

The candidate then either iterates (asks for "another round") or moves on.
`,

  // --- modes/negotiation.md ---
  "modes/negotiation.md": `# Mode: negotiation — Offer negotiation playbook

Triggered when an offer arrives. Run \`/career-ops negotiation <company>\` or invoke from the UI's negotiation panel.

## Inputs needed from the candidate

Ask if not already in the offer message:
1. **Role/title** offered
2. **Base salary** (currency + amount)
3. **Equity** (shares, vesting schedule, valuation if known)
4. **Bonus** structure (signing, performance)
5. **Benefits highlights** (PTO, healthcare, retirement)
6. **Location** (remote / hybrid / on-site)
7. **Start date** flexibility
8. **Competing offers** if any
9. **Candidate's current comp** (only used for the "I'm coming from X" framing — optional)

## Research phase (do this BEFORE drafting any counter)

1. Read \`reports/<id>-<company>-*.md\` Block D for comp research already done
2. Run a fresh WebSearch for current data:
   - "<company> Senior Software Engineer salary Levels.fyi"
   - "<company> equity refresh"
   - "<company> Glassdoor compensation"
   - "<role title> remote US senior salary 2026"
3. Build a comp table:
   - 25th / 50th / 75th / 90th percentile for the role at the company
   - Same percentiles for the broader market

## Negotiation strategy

Score the offer:
- Base: percentile vs market (e.g., 60th)
- Equity: percentile + risk-adjusted value
- Total: percentile

Pick a leverage stance:
- **Strong** (offer < 50th percentile or competing offer in hand): counter aggressively
- **Moderate** (offer at 50-70th): counter with modest ask + non-cash improvements
- **Weak** (offer > 75th, no competing offer): polish edges (start date, signing bonus) — don't push base

## Counter-offer template

Output a draft email with:

> Hi [recruiter],
>
> Thanks so much for the offer — really excited about [specific thing about the team/role from Block A].
>
> I'd like to talk through a few details before signing:
>
> 1. **Base salary**: Based on market data for [role] at companies of [company]'s stage and the level/scope of this role, I'm seeing [60-90th percentile range from research]. Could we look at [target ask, justified]?
>
> 2. **[Equity / signing bonus / PTO]**: [specific ask with brief reasoning]
>
> 3. **[Start date / remote flexibility]**: [if relevant]
>
> Happy to talk through any of this on a call. Excited to make this work.
>
> Cole

## Output for the candidate

1. The comp table (so they can see the data)
2. The leverage stance + reasoning
3. The draft counter email
4. **Two alternate stances** if they want to push harder or back off (give the candidate options)
5. **Likely recruiter responses** + how to handle each

## Important rules

- Never auto-send. The candidate sends the email themselves.
- Geographic discount pushback (if recruiter cites Vancouver vs SF): "The roles I'm competitive for are output-based, not location-based. My track record doesn't change based on postal code."
- If competing offer leverage exists, frame it as "I have another offer at [range]; how can we close the gap?"
- BG check note: do NOT mention any criminal record proactively. If the offer letter requires BG-check pass-through, surface that to the candidate as a manual checkpoint — the candidate decides disclosure timing.
`,

  // --- modes/post-rejection.md ---
  "modes/post-rejection.md": `# Mode: post-rejection — Pattern analysis after rejections

Triggered weekly OR after every 5 rejections. Run \`/career-ops post-rejection\` or auto-trigger from the UI.

## Goal

Find what's failing in the candidate's funnel and recommend specific changes to the system (cv.md, profile.yml, modes/_profile.md, portals.yml).

## Inputs

1. \`data/applications.md\` — all application records, status column
2. \`reports/<id>-*.md\` — A-G evaluations (Block B has CV-vs-JD match analysis with gaps)
3. \`config/profile.yml\` — current profile
4. \`cv.md\` — current CV

## Analysis steps

1. **Filter to rejected applications** (Status = Rejected or "no response 4+ weeks")
2. **Extract patterns**:
   - Companies (size / industry / location / age)
   - Roles (archetype / level / specific keywords in title)
   - JD requirements with gap markers in Block B
   - Recurring "missing skills" or "weak match" notes
3. **Compare** to non-rejected (Interview / Offer) applications:
   - What are accepted apps' archetypes?
   - What are rejected apps' archetypes?
   - Is there an archetype mismatch driving rejections?
4. **Look at scoring**:
   - Average score of rejected applications
   - Distribution by BG risk
   - Distribution by company size

## Output

A structured report:

### Summary
- Total apps in window: N
- Rejected: R
- No response 4+ weeks: NR
- Interview / Offer: I
- Rejection rate: R/(R+I) %

### Patterns in rejection
1. **Top 3 failing archetypes** (with counts)
2. **Top 5 missing skills** flagged in Block B gaps
3. **Top 3 BG-related concerns** (HIGH risk + rejected combinations)
4. **Recurring company traits** (size, industry, geo)

### Recommendations
For each pattern, propose a SPECIFIC fix:
- "Drop archetype X from primary; market signal is weak"
- "Add skill Y to cv.md skills section — appears in 7 of 10 rejected JDs"
- "Disable companies in industry Z in portals.yml — 0 callbacks from 12 apps"
- "Adjust profile.yml comp target — current $X may be priced out for stage of companies you're hitting"

### Open questions for the candidate
- "Are you comfortable with the geographic discount that comes with these roles?"
- "Would you consider Y archetype despite previously deprioritizing it?"

## Important

This mode is INSIGHT, not action. It produces a recommendation report — the candidate (and you, the agent) review it together and decide which changes to actually apply.
`,
};

// ---------- New UI files for M3 ----------

const uiFiles = {
  // ----- AI wrapper -----
  "src/lib/server/ai.ts": `import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export async function complete(systemPrompt: string, userMessage: string, opts: { model?: string; maxTokens?: number } = {}): Promise<string> {
  const c = getClient();
  if (!c) throw new Error('ANTHROPIC_API_KEY not set; configure it in Settings');
  const resp = await c.messages.create({
    model: opts.model ?? 'claude-sonnet-4-5-20250929',
    max_tokens: opts.maxTokens ?? 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });
  const text = resp.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\\n');
  return text;
}

export async function chat(systemPrompt: string, history: { role: 'user' | 'assistant'; content: string }[], opts: { model?: string; maxTokens?: number } = {}): Promise<string> {
  const c = getClient();
  if (!c) throw new Error('ANTHROPIC_API_KEY not set; configure it in Settings');
  const resp = await c.messages.create({
    model: opts.model ?? 'claude-sonnet-4-5-20250929',
    max_tokens: opts.maxTokens ?? 1500,
    system: systemPrompt,
    messages: history,
  });
  const text = resp.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\\n');
  return text;
}
`,

  // ----- Interview prep generator -----
  "src/lib/server/interview.ts": `import path from 'node:path';
import fs from 'node:fs';
import { ROOT, readSafe } from './files';
import { complete } from './ai';

export function loadModeFile(name: string): string {
  return readSafe(path.join(ROOT, 'modes', name));
}

export async function generateInterviewPrep(reportPath: string, archetypeOverride?: string): Promise<string> {
  const reportContent = readSafe(path.join(ROOT, reportPath));
  const cv = readSafe(path.join(ROOT, 'cv.md'));
  const interviewPrepMode = loadModeFile('interview-prep.md');

  const systemPrompt = \`You are a senior interview-prep coach for software engineering roles. The candidate is preparing for an interview at the company described in the report below. Use the report's Block A (role summary), Block B (CV match + gaps), and Block F (STAR stories) to produce a focused, no-fluff interview prep brief.

\${interviewPrepMode || 'Generate a comprehensive interview prep brief.'}\`;

  const user = \`# Report (full A-G evaluation)

\${reportContent}

# Candidate CV (cv.md)

\${cv.slice(0, 3000)}

# Task

Generate an INTERVIEW PREP BRIEF with these sections:

1. **Likely 8-12 interview questions** (mix: 3 behavioral, 3 technical, 2 system design, 2 culture/motivation), tailored to THIS role's JD
2. **STAR stories to lead with** — pull from Block F, refine wording, mark which question each maps to
3. **Technical study plan** — 5 specific topics to review based on the JD stack (with one suggested resource per topic)
4. **Top 3 company-specific talking points** — recent news, team facts, mission angle
5. **Red flags to watch for** in the interview (hours culture? unclear role? unstable funding?) and how to ask
6. **Questions to ask the interviewer** — 5 sharp ones that signal seniority
\${archetypeOverride ? \`\\n7. **Reframe for archetype:** \${archetypeOverride}\` : ''}

Output as Markdown. Be specific, not generic. If the report lacks data for a section, say so explicitly.\`;

  return complete(systemPrompt, user, { maxTokens: 3500 });
}

export async function generateNegotiationBrief(reportPath: string, offerDetails: string): Promise<string> {
  const reportContent = readSafe(path.join(ROOT, reportPath));
  const profile = readSafe(path.join(ROOT, 'config', 'profile.yml'));
  const negotiationMode = loadModeFile('negotiation.md');

  const systemPrompt = \`You are a senior compensation and negotiation coach. The candidate has received an offer; produce a negotiation brief and counter-offer draft.

\${negotiationMode || ''}\`;

  const user = \`# Report (full A-G evaluation including Block D comp research)

\${reportContent}

# Candidate profile (config/profile.yml)

\${profile}

# Offer details (from candidate)

\${offerDetails}

# Task

Produce a NEGOTIATION BRIEF following the modes/negotiation.md structure:
1. Comp percentile table
2. Leverage stance (Strong / Moderate / Weak) with reasoning
3. Draft counter email (ready to copy-paste, customize ONLY where needed)
4. Two alternate stances
5. Likely recruiter responses + handling
6. Manual-checkpoint reminder for BG check disclosure

Output as Markdown.\`;

  return complete(systemPrompt, user, { maxTokens: 3000 });
}
`,

  // ----- API: interview prep generation -----
  "src/routes/api/interview/+server.ts": `import { json, error } from '@sveltejs/kit';
import { generateInterviewPrep } from '$lib/server/interview';
import { logEvent } from '$lib/server/events';

export const POST = async ({ request }) => {
  const { reportFile, archetype } = await request.json();
  if (!reportFile) throw error(400, 'reportFile required');
  try {
    logEvent('interview', \`generating prep for \${reportFile}\`);
    const md = await generateInterviewPrep(\`reports/\${reportFile}\`, archetype);
    logEvent('interview', \`prep ready (\${md.length} chars)\`, 'success');
    return json({ ok: true, content: md });
  } catch (e: any) {
    logEvent('interview', \`failed: \${e.message}\`, 'error');
    return json({ ok: false, error: e.message }, { status: 500 });
  }
};
`,

  // ----- API: mock interview chat -----
  "src/routes/api/mock-interview/+server.ts": `import { json, error } from '@sveltejs/kit';
import { chat } from '$lib/server/ai';
import { readSafe } from '$lib/server/files';
import { ROOT } from '$lib/server/files';
import path from 'node:path';
import { logEvent } from '$lib/server/events';

export const POST = async ({ request }) => {
  const { reportFile, history, persona } = await request.json();
  if (!reportFile) throw error(400, 'reportFile required');

  const report = readSafe(path.join(ROOT, 'reports', reportFile));
  const cv = readSafe(path.join(ROOT, 'cv.md'));
  const mode = readSafe(path.join(ROOT, 'modes', 'mock-interview.md'));

  const personaName = persona ?? 'Hiring Manager';

  const systemPrompt = \`You are conducting a mock interview as the \${personaName} for the role described in the report below. Follow the mock-interview mode protocol exactly.

\${mode}

# Job Report (A-G evaluation)
\${report}

# Candidate CV
\${cv.slice(0, 2500)}

You are interviewing the candidate now. After EACH candidate response, ALWAYS provide a brief evaluator note (score 1-5, what worked, what to improve, stronger phrasing). Then ask the next question.

Begin the interview with your FIRST question if history is empty.\`;

  try {
    const reply = await chat(systemPrompt, history ?? [], { maxTokens: 1500 });
    logEvent('mock-interview', \`turn ok (\${(history ?? []).length} prior)\`);
    return json({ ok: true, reply });
  } catch (e: any) {
    logEvent('mock-interview', \`failed: \${e.message}\`, 'error');
    return json({ ok: false, error: e.message }, { status: 500 });
  }
};
`,

  // ----- API: negotiation brief -----
  "src/routes/api/negotiation/+server.ts": `import { json, error } from '@sveltejs/kit';
import { generateNegotiationBrief } from '$lib/server/interview';
import { logEvent } from '$lib/server/events';

export const POST = async ({ request }) => {
  const { reportFile, offer } = await request.json();
  if (!reportFile || !offer) throw error(400, 'reportFile + offer required');
  try {
    logEvent('negotiation', \`generating brief for \${reportFile}\`);
    const md = await generateNegotiationBrief(\`reports/\${reportFile}\`, offer);
    logEvent('negotiation', \`brief ready\`, 'success');
    return json({ ok: true, content: md });
  } catch (e: any) {
    logEvent('negotiation', \`failed: \${e.message}\`, 'error');
    return json({ ok: false, error: e.message }, { status: 500 });
  }
};
`,

  // ----- Job detail page: add interview/mock/negotiation panels -----
  "src/routes/job/[id]/+page.svelte": `<script lang="ts">
  import { marked } from 'marked';
  let { data } = $props();
  let html = $derived(data.report ? marked.parse(data.report) : '');

  let prepLoading = $state(false);
  let prepContent = $state('');
  let prepHtml = $derived(prepContent ? marked.parse(prepContent) : '');

  let chatHistory = $state<{ role: 'user' | 'assistant'; content: string }[]>([]);
  let chatInput = $state('');
  let chatLoading = $state(false);
  let chatPersona = $state('Hiring Manager');

  let offerInput = $state('');
  let negotiationContent = $state('');
  let negotiationHtml = $derived(negotiationContent ? marked.parse(negotiationContent) : '');
  let negotiationLoading = $state(false);

  let activePanel = $state<'report' | 'prep' | 'mock' | 'negotiation'>('report');

  async function loadPrep() {
    if (!data.job?.reportFile) return;
    prepLoading = true;
    try {
      const r = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportFile: data.job.reportFile }),
      });
      const j = await r.json();
      prepContent = j.ok ? j.content : 'Error: ' + (j.error || 'unknown');
    } finally {
      prepLoading = false;
    }
  }

  async function sendChat() {
    if (!chatInput.trim() || chatLoading || !data.job?.reportFile) return;
    const msg = chatInput.trim();
    chatInput = '';
    const newHistory = [...chatHistory, { role: 'user' as const, content: msg }];
    chatHistory = newHistory;
    chatLoading = true;
    try {
      const r = await fetch('/api/mock-interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportFile: data.job.reportFile, history: newHistory, persona: chatPersona }),
      });
      const j = await r.json();
      if (j.ok) chatHistory = [...newHistory, { role: 'assistant', content: j.reply }];
      else chatHistory = [...newHistory, { role: 'assistant', content: '⚠️ ' + (j.error || 'error') }];
    } finally {
      chatLoading = false;
    }
  }

  async function startMock() {
    if (!data.job?.reportFile) return;
    chatHistory = [];
    chatLoading = true;
    try {
      const r = await fetch('/api/mock-interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportFile: data.job.reportFile, history: [], persona: chatPersona }),
      });
      const j = await r.json();
      chatHistory = [{ role: 'assistant', content: j.ok ? j.reply : '⚠️ ' + (j.error || 'error') }];
    } finally {
      chatLoading = false;
    }
  }

  async function getNegotiation() {
    if (!data.job?.reportFile || !offerInput.trim()) return;
    negotiationLoading = true;
    try {
      const r = await fetch('/api/negotiation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportFile: data.job.reportFile, offer: offerInput }),
      });
      const j = await r.json();
      negotiationContent = j.ok ? j.content : '⚠️ ' + (j.error || 'error');
    } finally {
      negotiationLoading = false;
    }
  }

  async function updateStatus(newStatus: string) {
    if (!data.job?.url) return;
    await fetch('/api/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: data.job.url, newStatus }),
    });
    location.reload();
  }
</script>

<div class="h-full overflow-y-auto p-6">
  <a href="/" class="text-sub text-sm hover:text-ink">← back to board</a>
  {#if data.job}
    <h1 class="text-2xl font-semibold mt-2">{data.job.company} — {data.job.role}</h1>
    <div class="text-sub text-sm mt-1">
      {data.job.location || '—'} ·
      <a class="hover:text-accent" href={data.job.url} target="_blank" rel="noopener">open posting ↗</a>
    </div>
    <div class="flex gap-3 mt-4 text-sm flex-wrap items-center">
      {#if data.job.score != null}
        <span class="score-badge {data.job.score >= 4 ? 'score-ok' : data.job.score >= 3 ? 'score-warn' : 'score-bad'}">
          score {data.job.score.toFixed(1)}
        </span>
      {/if}
      {#if data.job.bgRisk}
        <span class="text-xs px-2 py-1 rounded border bg-{data.job.bgRisk.toLowerCase()}">BG {data.job.bgRisk}</span>
      {/if}
      <span class="text-xs px-2 py-1 rounded border border-line text-sub">status: {data.job.status}</span>
      <select onchange={(e) => updateStatus((e.target as HTMLSelectElement).value)} class="text-xs bg-panel border border-line rounded px-2 py-1">
        <option value="">→ change status</option>
        {#each ['New', 'Scoring', 'Scored', 'READY-TO-APPLY', 'APPLIED', 'SCREENED', 'INTERVIEW', 'OFFER', 'REJECTED', 'CLOSED'] as s}
          <option value={s}>{s}</option>
        {/each}
      </select>
    </div>

    <div class="flex gap-1 mt-6 border-b border-line">
      {#each [['report', '📄 Report'], ['prep', '📚 Interview Prep'], ['mock', '💬 Mock Interview'], ['negotiation', '💰 Negotiation']] as [key, label]}
        <button
          onclick={() => (activePanel = key as any)}
          class="px-3 py-2 text-sm border-b-2 -mb-px transition-colors {activePanel === key ? 'border-accent text-ink' : 'border-transparent text-sub hover:text-ink'}"
        >
          {label}
        </button>
      {/each}
    </div>

    <div class="mt-4">
      {#if activePanel === 'report'}
        {#if data.report}
          <article class="prose prose-invert max-w-none prose-headings:text-ink prose-a:text-accent prose-strong:text-ink prose-th:text-ink prose-td:text-sub">
            {@html html}
          </article>
        {:else}
          <div class="text-sub italic">No deep evaluation report yet for this job.</div>
        {/if}
      {/if}

      {#if activePanel === 'prep'}
        {#if !prepContent}
          <button onclick={loadPrep} disabled={prepLoading} class="px-4 py-2 bg-accent/20 text-accent rounded border border-accent/30 hover:bg-accent/30 disabled:opacity-50">
            {prepLoading ? 'Generating...' : 'Generate Interview Prep Brief'}
          </button>
          <div class="text-sub text-xs mt-2">Uses Claude to produce 8-12 likely questions, STAR map, study plan, talking points, red flags, and questions to ask back.</div>
        {:else}
          <article class="prose prose-invert max-w-none">
            {@html prepHtml}
          </article>
        {/if}
      {/if}

      {#if activePanel === 'mock'}
        <div class="flex items-center gap-2 mb-3">
          <label class="text-sm text-sub">Persona:</label>
          <select bind:value={chatPersona} class="text-sm bg-panel border border-line rounded px-2 py-1">
            <option>Recruiter Screen</option>
            <option>Hiring Manager</option>
            <option>Tech Lead / Peer</option>
            <option>Cross-functional</option>
          </select>
          <button onclick={startMock} disabled={chatLoading} class="px-3 py-1 text-sm bg-accent/20 text-accent rounded border border-accent/30 hover:bg-accent/30 disabled:opacity-50">
            {chatHistory.length === 0 ? 'Start Mock' : 'Restart'}
          </button>
        </div>

        <div class="border border-line rounded bg-panel/40 p-3 max-h-[60vh] overflow-y-auto space-y-3">
          {#each chatHistory as turn}
            <div class={turn.role === 'user' ? 'text-ink' : 'text-sub'}>
              <div class="text-xs uppercase tracking-wide mb-1 {turn.role === 'user' ? 'text-accent' : 'text-sub'}">
                {turn.role === 'user' ? 'You' : 'Interviewer'}
              </div>
              <div class="whitespace-pre-wrap text-sm">{turn.content}</div>
            </div>
          {/each}
          {#if chatHistory.length === 0}
            <div class="text-sub italic text-sm">Click Start Mock — interviewer will open with a question.</div>
          {/if}
          {#if chatLoading}
            <div class="text-sub italic text-sm">interviewer is thinking…</div>
          {/if}
        </div>

        <form onsubmit={(e) => { e.preventDefault(); sendChat(); }} class="flex gap-2 mt-3">
          <input bind:value={chatInput} placeholder="Your answer…" class="flex-1 bg-panel border border-line rounded px-3 py-2 text-sm" disabled={chatLoading || chatHistory.length === 0} />
          <button type="submit" disabled={chatLoading || !chatInput.trim() || chatHistory.length === 0} class="px-4 py-2 bg-accent/20 text-accent rounded border border-accent/30 hover:bg-accent/30 disabled:opacity-50">Send</button>
        </form>
      {/if}

      {#if activePanel === 'negotiation'}
        <div class="space-y-3">
          <label class="text-sm text-sub">Paste offer details (base / equity / bonus / location / start date / competing offers):</label>
          <textarea bind:value={offerInput} class="w-full bg-panel border border-line rounded px-3 py-2 text-sm font-mono min-h-[120px]"></textarea>
          <button onclick={getNegotiation} disabled={negotiationLoading || !offerInput.trim()} class="px-4 py-2 bg-accent/20 text-accent rounded border border-accent/30 hover:bg-accent/30 disabled:opacity-50">
            {negotiationLoading ? 'Generating...' : 'Generate Negotiation Brief'}
          </button>
          {#if negotiationContent}
            <article class="prose prose-invert max-w-none mt-4">
              {@html negotiationHtml}
            </article>
          {/if}
        </div>
      {/if}
    </div>
  {:else}
    <div class="text-sub mt-4">Job not found.</div>
  {/if}
</div>
`,
};

let written = 0;

for (const [rel, content] of Object.entries(modeFiles)) {
  const full = path.join(CO, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  written++;
  console.log("wrote " + rel);
}
for (const [rel, content] of Object.entries(uiFiles)) {
  const full = path.join(UI, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  written++;
  console.log("wrote " + rel);
}
console.log("\nM3: " + written + " files written.");
