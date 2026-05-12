# User Profile Context -- career-ops

## Background-Check Policy (CRITICAL — read this first, every evaluation)

Cole has a Canadian criminal record. Standard CPIC checks and US-side Checkr / HireRight cross-border checks may surface it. The agent's job is to **inform, not pre-decide**. Cole decides per-job whether to apply.

**Rule for every evaluation: ALWAYS produce a full A-G report and a tailored CV PDF if score >= 4.0. NEVER auto-skip a job based on BG risk. The BG line in Block G is information, not a verdict.**

**HARD STOP (only these — score 1.0, no PDF, mark `applications.md` status `BLOCKED`):**
- JD explicitly mentions: Security Clearance, TS/SCI, Top Secret, Government Clearance, Polygraph, Background Investigation, Vulnerable Sector Check, Clean Background required, No Criminal Record required
- Defense / intelligence / government contractor primary work (Palantir, Helsing — already disabled in portals.yml)

**Everything else: full evaluation, normal scoring, generate the PDF if score >= 4.0.** Then add ONE of these lines in Block G:

- `**Background Check Risk: HIGH** — {company} runs FINRA/SOX-grade BG checks. Apply only if you're prepared to disclose post-offer. Examples: US fintech (Stripe, Plaid), FAANG, Anthropic/OpenAI high-trust roles.`
- `**Background Check Risk: MEDIUM** — Standard US/Canadian employer BG check (Checkr-tier criminal record check). Many non-violent/non-fraud Canadian records pass; not guaranteed. Apply normally; have a disclosure plan ready.`
- `**Background Check Risk: LOW** — Small startup, founding role, or EU/GDPR-protected employer; BG check is unlikely or shallow.`

**Do NOT apply a scoring penalty based on BG risk.** Score reflects fit, not BG-passability. The BG line is separate, advisory, and visible in the report so Cole can make an informed decision per company.

**Application disclosure rule:** NEVER auto-disclose the criminal record in cover letters, intro paragraphs, or initial application form text. If a form has an explicit criminal-history question, leave the field BLANK and surface it to Cole as a manual checkpoint — do NOT fill it in either way.



<!-- ============================================================
     THIS FILE IS YOURS. It will NEVER be auto-updated.
     
     Customize everything here: your archetypes, narrative,
     proof points, negotiation scripts, location policy.
     
     The system reads _shared.md (updatable) first, then this
     file (your overrides). Your customizations always win.
     ============================================================ -->

## Your Target Roles

<!-- Replace these with YOUR target roles. Examples:
     - Senior Backend Engineer / Staff Platform Engineer
     - AI Product Manager / Technical PM
     - Data Engineer / ML Engineer
     - DevOps / SRE / Platform
     Whatever you're optimizing for. -->

| Archetype | Thematic axes | What they buy |
|-----------|---------------|---------------|
| **Senior Full-Stack Engineer (TS)** (PRIMARY) | TypeScript + React + Node end-to-end | Reliable senior IC who can own a feature across the whole stack |
| **Senior Backend Engineer (Node.js / TS)** (PRIMARY) | Node services, REST APIs, real-time data pipelines, SQL | Senior backend IC who ships and maintains production services |
| **Senior Frontend Engineer (React / TS)** (PRIMARY) | Modern React, TypeScript, perf, SEO | Senior frontend IC who keeps a complex React codebase healthy |
| **Senior Platform / Cloud Engineer** (PRIMARY) | AWS + GCP, CI/CD, observability, multi-cloud | Senior platform IC comfortable across two major clouds plus Cloudflare |
| **Senior Edge / Cloudflare Workers Engineer** (PRIMARY) | Workers, KV/R2, Analytics Engine, edge data pipelines | Rare specialty — most engineers have only touched Workers casually; Cole has shipped real-time analytics in production |
| **Senior DevOps / SRE / Infrastructure** (SECONDARY) | CI/CD, Docker, Linux, Nginx, monitoring, cost optimization | Senior IC who treats infra as a product and improves reliability + cost |
| **Tech Lead (hands-on IC)** (SECONDARY) | Senior IC with informal leadership scope, no people-management overhead | A senior who can lead a small initiative without being pulled out of code |
| **Staff Software Engineer (selective stretch)** (SECONDARY) | Staff IC at companies where the bar matches | Where role + comp + scope make the stretch worth it; otherwise default to Senior |
| **Developer Experience / DX Engineer** (ADJACENT) | Internal tooling, dev productivity, build systems, dev workflows | Senior who can improve the dev experience for an engineering org |
| **AI Dev Tools (Anthropic / Cursor / Sourcegraph)** (ADJACENT) | Daily Claude Code user shipping production TS with agents | Real differentiator at companies building AI for engineers |
| **Privacy / Compliance Engineering** (ADJACENT) | GDPR, CCPA, IAB TCF, consent, privacy-safe analytics | Senior who knows the consent/privacy regulatory surface from Enzuzo |

## Your Adaptive Framing

<!-- Map YOUR projects to each archetype. Example:
     | Platform / LLMOps | My monitoring dashboard project | article-digest.md |
     | Agentic | My chatbot with HITL escalation | cv.md section 3 | -->

| If the role is... | Emphasize about you... | Proof point sources |
|-------------------|------------------------|---------------------|
| Senior Full-Stack (TS) | TS + React + Node experience at Enzuzo + TELL, frontend + backend + data pipeline ownership | cv.md (Enzuzo, TELL) |
| Senior Backend (Node) | Node services, REST APIs, data pipelines, SQL — TELL high-traffic, Nyrion multi-tenant SaaS, Enzuzo APIs | cv.md (all three) |
| Senior Frontend (React/TS) | TS modernization at Enzuzo, modern React in production, SEO architecture experience at TELL | cv.md (Enzuzo, TELL) |
| Senior Platform / Cloud | AWS + GCP both in production, AWS-to-GCP migration, CI/CD pipeline ownership, Cloudflare integration | cv.md (Enzuzo) |
| Senior Edge / Cloudflare | Real-time consent analytics on Cloudflare Analytics Engine + Workers in production at Enzuzo — actual shipped product, not a tutorial | cv.md (Enzuzo) |
| Senior DevOps / SRE | CI/CD speedups (90%), Docker / Nginx / Linux production experience, monitoring and observability | cv.md (Enzuzo, TELL) |
| Tech Lead (IC) | Senior IC who's worked across many roles — happy to take on tech lead scope without becoming an EM | cv.md general |
| Staff stretch (selective) | Same proof points framed harder — only apply at companies where Staff genuinely matches the bullet pattern | cv.md (lean on Enzuzo edge analytics + AWS-to-GCP + Turborepo) |
| DX Engineer | CI/CD optimization, Turborepo monorepo, daily Claude Code user — credibly cares about dev experience | cv.md (Enzuzo CI/CD line) + lived experience |
| AI Dev Tools | "I ship production TypeScript every day inside Claude Code" — verifiable + a real differentiator | (Mention in cover/intro for Anthropic, Cursor, Sourcegraph, Continue, Vercel) |
| Privacy / Compliance | 2+ years at Enzuzo on consent management at scale, deep knowledge of GDPR/CCPA/IAB TCF surface | cv.md (Enzuzo) |

## Your Exit Narrative

The framing in every CV summary, every STAR story, and every cover/intro should bridge:

> **Past:** 10+ years building and maintaining production TypeScript / React / Node applications across SaaS and high-traffic consumer platforms. Strong hands-on across frontend, backend, and cloud (AWS + GCP + Cloudflare). Focused on shipping reliable features, improving performance, and keeping scalable systems healthy.
>
> **Future:** Looking for a Senior IC role at a TypeScript-first company doing interesting work — ideally where edge computing, modern monorepos, AI-augmented engineering, or privacy/compliance matter. Open to Staff title where the role + comp warrant; not chasing the title for the sake of the title.

In PDF summaries: lead with the breadth (frontend + backend + cloud) and reliability framing. Mention specific tech the company uses if it matches.
In STAR stories: pull from cv.md (Enzuzo Cloudflare analytics, AWS-to-GCP migration, Turborepo CI/CD speedup; TELL high-traffic consumer + SEO; Nyrion multi-tenant SaaS).
In draft cover answers: open with the bridge above, then a specific reason for this company.

## Your Cross-cutting Advantage

**"Senior IC with rare full-stack-plus-edge breadth and a real Cloudflare Workers track record."**

Most senior engineers are deep in one part of the stack. Cole has shipped production work across frontend (TS/React), backend (Node, REST, real-time pipelines), AND cloud (AWS + GCP + Cloudflare Workers + Analytics Engine). The Cloudflare Workers production experience is the most differentiating piece — most senior engineers have only touched Workers as a side project; Cole has shipped a real-time consent analytics product on Analytics Engine.

For AI-dev-tool companies (Anthropic, Cursor, Sourcegraph, Continue, Vercel): add the "I ship production TypeScript every day inside Claude Code" angle — a real, verifiable differentiator at companies building AI for engineers.

## Your Portfolio / Demo

<!-- If you have a live demo, dashboard, or public project:
     url: https://yoursite.dev/demo
     password: demo-2026
     when_to_share: "LLMOps, AI Platform roles" -->

If you have a live demo/dashboard (check profile.yml), offer access in applications for relevant roles.

## Your Comp Targets

**Targets (USD unless noted) — Senior IC framing:**

| Role / Location | Target | Walk-away |
|---|---|---|
| Senior IC, remote US | $180K–$240K | $150K |
| Senior IC, remote Canada / Vancouver | $160K–$210K CAD | $140K CAD |
| Senior IC, Vancouver hybrid | $160K–$210K CAD | $140K CAD |
| Staff IC (selective stretch, remote US) | $230K–$300K | Discuss |
| Founding Eng (early-stage, real equity) | Cash flexible if equity is meaningful | Discuss |

**Calibration sources to cite in Block D (comp research):**
- Levels.fyi (search: "Senior Software Engineer" at target company)
- Glassdoor + LinkedIn salary insights
- Blind (anonymous, often most accurate for tech)
- Pragmatic Engineer salary surveys (Canada / global)

**Reference points (Senior IC):**
- Shopify, Stripe, Vercel, Cloudflare, Linear, Notion → Senior = $200–270K USD remote
- Mid-size SaaS / Series B–D startups remote → Senior = $160–220K USD
- Vancouver local market (Hootsuite, 1Password, Klue, Later, Jane App tier) → Senior = $140–190K CAD
- Contractor rates: $130–$180 / hr (about 30–50% above equivalent salary)

## Your Negotiation Scripts

<!-- Adapt to YOUR situation, currency, location -->

**Salary expectations:**
> "Based on market data for this role, I'm targeting [RANGE from profile.yml]. I'm flexible on structure -- what matters is the total package and the opportunity."

**Geographic discount pushback:**
> "The roles I'm competitive for are output-based, not location-based. My track record doesn't change based on postal code."

**When offered below target:**
> "I'm comparing with opportunities in the [higher range]. I'm drawn to [company] because of [reason]. Can we explore [target]?"

## Your Location Policy

<!-- Adapt to YOUR situation -->

**In forms:**
- Follow your actual availability from profile.yml
- Specify timezone overlap in free-text fields

**In evaluations (scoring):**
- Remote dimension for hybrid outside your country: score **3.0** (not 1.0)
- Only score 1.0 if JD says "must be on-site 4-5 days/week, no exceptions"
