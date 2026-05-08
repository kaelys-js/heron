# Evaluación: GetYourGuide — Senior Software Engineer, Developer Enablement

**Fecha:** 2026-05-06
**Arquetipo:** Developer Experience / DX Engineer (ADJACENT) + Senior DevOps / SRE (SECONDARY)
**Score:** 2.2/5
**Legitimacy:** Proceed with Caution
**Background Check Risk:** MEDIUM — Large EU company (Berlin HQ, SoftBank-backed, Series F+, 3000+ employees); GDPR restricts BG check depth vs US standard but practices variable at this scale
**URL:** https://getyourguide.careers/jobs/7234277?gh_jid=7234277
**PDF:** skipped: below score gate (2.2 < 4.0)
**Batch ID:** 155

---

## A) Resumen del Rol

| Campo | Detalle |
|-------|---------|
| Arquetipo detectado | Developer Experience / DX Engineer (ADJACENT); DevOps/SRE secondary |
| Domain | Travel Tech / Consumer Platform |
| Function | Platform Engineering / Developer Tooling |
| Seniority | Senior IC (5+ years backend required; no people-management) |
| Remote | Berlin HYBRID (#LI-Hybrid) — 40 days/year work from anywhere; relocation required for Vancouver candidate |
| Team size | Developer Enablement team (size not disclosed) |
| TL;DR | Build and maintain internal CI/CD pipelines, testing infrastructure, local dev tooling, and AI tool adoption for GetYourGuide's multi-language engineering org (Java, JS, Python, Go). GitHub Actions + ArgoCD + Kubernetes stack. Berlin-based, EU comp well below Cole's targets. |

---

## B) Match con CV

### Requirements Mapping

| Requisito del JD | Match | Referencia en CV |
|-----------------|-------|-----------------|
| 5+ years backend (Java / **JS/Node.js** / Python / Go) | ✅ STRONG — Node.js/TS primary | cv.md: "Senior Software Engineer… TypeScript, React, Node.js" — 10+ years total; Enzuzo (2023–present), TELL (2017–2023), Nyrion (2013–2017) |
| Git, cloud (AWS preferred), CI/CD concepts | ✅ STRONG | cv.md Skills: "AWS, Google Cloud Platform (GCP)… CI/CD"; Enzuzo: "Improved CI/CD workflows to reduce build times, improve deployment reliability" |
| Docker | ✅ MATCH | cv.md Skills: "Docker" |
| GitHub administration (repos, permissions, workflows) | ✅ IMPLIED | CI/CD pipeline ownership at Enzuzo implies GitHub Actions; repo management standard at Senior IC level |
| Testing infrastructure development | ✅ PARTIAL | Nyrion: "Contributing to testing and QA tooling to reduce regressions and improve release stability" |
| AI tool adoption and in-house AI agents | ✅ STRONG differentiator | Daily Claude Code user shipping production TypeScript — real, verifiable, matches role's AI-native tooling focus |
| Automated testing (unit, integration, E2E) | ✅ PARTIAL | Implied across three roles; no dedicated test-framework bullet |
| Local development tooling | ⚠️ ADJACENT | Enzuzo Cloudflare Workers local dev workflows (wrangler) adjacent; not a DX-specialist background |
| Cross-language support (Java, Python, Go) | ❌ GAP | cv.md exclusively JS/TS/Node — no Java, Python, or Go experience documented |
| Kubernetes | ⚠️ PARTIAL | Docker in production (TELL, Enzuzo); K8s not explicitly in cv.md |
| ArgoCD | ❌ GAP | Not mentioned in cv.md |
| Developer productivity tools track record | ⚠️ PARTIAL | CI/CD speedup (90% via Turborepo) — adjacent evidence; not a dedicated DX background |

### Gap Analysis

| Gap | Hard Blocker? | Adjacent Proof | Mitigation Strategy |
|-----|--------------|----------------|-------------------|
| Java | NO — JD says "at least one of Java, JS/Node.js, Python, Go" | Cole covers Node.js natively | Frame Node.js as primary qualifying language; "the JD accepts Node.js" |
| ArgoCD | NO (nice-to-have) | General CD/deployment pipeline experience | "I've worked with GitHub Actions-based CD; ArgoCD's GitOps model is a short learning curve given K8s/container familiarity" |
| Kubernetes | NO (nice-to-have) | Docker production experience at TELL scale | "Docker in production at scale; K8s is the natural next layer and I've operated containerized systems" |
| Berlin relocation | **REAL BLOCKER** | None | Cole must clarify relocation intent before applying — 40 days remote/year still requires living in Berlin |
| DX specialization | Soft concern | CI/CD ownership, Turborepo monorepo work | "My CI/CD work at Enzuzo is directly developer enablement — I just haven't had the title" |

---

## C) Nivel y Estrategia

**Nivel detectado en JD:** Senior (5+ years required) — no L-levels specified  
**Cole's natural level:** Senior IC (10+ years) — technically overqualified for the bar, well-matched in scope

**Plan "vender Senior sin mentir":**
- Lead with the **90% CI/CD speedup via Turborepo + parallelization** — directly maps to the team's mission of improving developer productivity
- The **daily Claude Code user shipping production TypeScript** angle is a genuine differentiator for a team explicitly building AI-native developer tools; most candidates "experimented with AI," Cole has integrated it into daily production delivery
- AWS experience (JD says "AWS preferred") is a direct hit — Cole has AWS + GCP both in production
- Frame Enzuzo's Cloudflare Workers work as "building developer infrastructure for real-time pipelines" — aligns with the local dev tooling requirement

**Plan "si me downlevelan":**
- Berlin comp market means even a Senior title here is well below Cole's minimum ($150K USD). No downlevel discussion is worth having at this comp range.
- If the role magically offered remote + competitive comp, the node.js qualification path is defensible; otherwise moot.

---

## D) Comp y Demanda

| Fuente | Rango Senior SWE (GetYourGuide, Berlin) | Notes |
|--------|----------------------------------------|-------|
| [Levels.fyi — GetYourGuide SWE](https://www.levels.fyi/companies/getyourguide/salaries/software-engineer) | €73.5K–€116K+ (median ~€106K) | Company-specific data, Berlin metro |
| [Glassdoor — Senior SWE Berlin](https://www.glassdoor.com/Salaries/berlin-germany-senior-software-engineer-salary-SRCH_IL.0,14_IM1020_KO15,39.htm) | €81.5K–€106K (P25–P75 market) | Berlin market average €92.5K |
| EUR/USD conversion (~1.08) | ~$79K–$125K USD equivalent | At current exchange rate |
| Cole's walk-away floor | **$150K USD** | Profile: minimum for remote US |

**Gap:** Cole's walk-away ($150K USD) is **20–50% above** the top of GetYourGuide's Berlin Senior SWE range. This is the primary disqualifier for this role.

**Demand signals:**
- No GetYourGuide-specific layoff news found in 2025–2026 searches
- Travel tech sector generally recovering; GYG well-funded (SoftBank Vision Fund, $1.1B+ total raised)
- Developer Enablement team investment suggests engineering org health, not a cost-cutting function
- No salary disclosed in posting — reduces transparency; posting freshness unverified (batch mode)

**Comp score: 1.5/5** — well below Cole's minimum at any reasonable EUR/USD exchange rate

---

## E) Plan de Personalización

| # | Sección | Estado actual | Cambio propuesto | Por qué |
|---|---------|---------------|------------------|---------|
| 1 | Professional Summary | "Senior Software Engineer… TypeScript, React, Node.js" generalist framing | Lead with developer productivity angle: "…with a focus on CI/CD infrastructure, developer tooling, and engineering platform work" | Mirrors Developer Enablement team mission directly |
| 2 | Enzuzo — top bullet | "Implemented real-time data pipelines using Cloudflare Workers" | Reorder: lead with "Owned CI/CD pipeline optimization — achieved 90% build time reduction via Turborepo + parallelization + incremental caching" | Most relevant proof point for this role |
| 3 | Enzuzo — AI line | Not mentioned | Add: "Integrated AI-augmented development workflows; active Claude Code user for daily production TypeScript delivery" | JD explicitly calls out AI tool adoption/maintenance |
| 4 | Nyrion — testing line | "Contributing to testing and QA tooling to reduce regressions" | Expand: "Built QA tooling and automated test infrastructure for multi-tenant SaaS — reduced regressions and improved release cadence" | Testing infrastructure is a core JD requirement |
| 5 | Skills section | Generic tech list | Add explicitly: "GitHub Actions, Docker, CI/CD pipeline design, multi-language repository management, developer productivity tooling" | ATS keyword coverage for JD-specific terms |

**LinkedIn (top 5 changes):**
1. Headline: add "Developer Enablement / CI/CD" to role description
2. Enzuzo featured section: surface CI/CD speedup as headline achievement
3. Skills: add "GitHub Actions", "Developer Productivity", "Engineering Platform"
4. Summary: add "I care about the developer experience — I've spent the last 3 years making CI/CD faster and local development less painful"
5. About: mention Claude Code daily usage for AI-tools-focused roles

---

## F) Plan de Entrevistas

| # | Requisito del JD | Historia STAR | S | T | A | R |
|---|-----------------|---------------|---|---|---|---|
| 1 | CI/CD pipeline enhancement | Enzuzo CI/CD bottleneck | Slow CI/CD blocking engineer velocity at Enzuzo | Reduce build times, improve deployment reliability | Implemented Turborepo monorepo, build parallelization, incremental caching | 90% faster CI/CD; unblocked faster iteration cycles |
| 2 | Testing infrastructure | Nyrion QA tooling | Manual-heavy QA process causing release regressions at Nyrion | Automate regression testing for multi-tenant SaaS | Built QA tooling and automated test suites for core workflows | Reduced regressions, improved release cadence and confidence |
| 3 | Cloud infrastructure (AWS) | Enzuzo AWS→GCP migration | Enzuzo running on AWS, migrating to GCP for cost/feature reasons | Execute full production cloud migration with zero downtime | Planned migration path, maintained monitoring and observability, executed incremental cutover | Full production migration with improved observability and operational efficiency |
| 4 | AI tool adoption | GYG AI tooling mission | Interviewer asks about AI in development practice | Demonstrate real, production-integrated AI usage | "I ship production TypeScript inside Claude Code every day — I understand how developers actually adopt and use AI tools because I am the developer in that scenario" | Positions as genuine expert, not someone who 'tried Copilot once' |
| 5 | Local dev tooling | Enzuzo Cloudflare Workers setup | Complex local dev environment for Workers + Analytics Engine pipelines | Enable faster local iteration without staging round-trips | Built local dev workflows using wrangler + emulation tools | Faster feedback loops for edge pipeline development |
| 6 | Cross-language environment | TELL multi-stack platform | High-traffic platform (tens of millions of users) across JS + service architecture | Maintain and ship features across a multi-service backend | Worked across frontend, backend, data pipelines in one codebase using JavaScript/Node.js | Maintained platform reliability at scale; learned to operate across service boundaries |

**Case study to present:** The Enzuzo CI/CD overhaul — frame it as "I was the developer enablement engineer for our build pipeline, I just didn't have the title." Bring the before-state (slow builds, blocked engineers), the analysis, the technical decision (Turborepo), the implementation, and the measurement (90% reduction).

**Red-flag Q&A prep:**
- "Do you have Java experience?" → "My primary qualifying language is Node.js/TypeScript, which the JD lists as an accepted option alongside Java. I've worked in multi-language environments and am a quick learner on new runtimes, but I won't claim Java experience I don't have."
- "This is a Berlin hybrid role — are you relocating?" → **Critical gate question.** Cole must have a clear, honest answer before investing further in this application.
- "What's your experience with ArgoCD/Kubernetes?" → "I've worked with Docker in production at scale and understand the GitOps model conceptually. ArgoCD and full K8s are short learning curves — I'd come in ready to learn the specifics while contributing immediately on the GitHub Actions and Node.js sides."

---

## G) Posting Legitimacy

**Assessment: Proceed with Caution**

| Signal | Value | Confidence |
|--------|-------|-----------|
| Description specificity | HIGH — named tech (GitHub Actions, ArgoCD, Java/JS/Python/Go), realistic requirements | High |
| Salary transparency | NONE — no range disclosed | High |
| Boilerplate ratio | LOW — role-specific content dominates; benefits section is standard | High |
| Apply button / form active | Unverified (batch mode — no Playwright) | — |
| GetYourGuide layoff / freeze news | None found in 2025–2026 web search | Medium |
| Prior scan-history repost | Not found in data/scan-history.tsv | High |
| Role market context | Developer Enablement is a genuine function; posting content looks authentic | Medium |

*Note: Posting freshness and apply button state are unverified (batch mode). Recommend visiting the URL manually before applying.*

**Context Notes:**
- GetYourGuide is an established Series F+ travel marketplace (Berlin HQ, SoftBank-backed, $1.1B+ raised). No recent layoff signals found. The Developer Enablement function represents engineering investment, not cost-cutting.
- No salary disclosed — at this company's Berlin-market comp range, this may be intentional; the range would likely not meet Cole's targets.
- Three prior GetYourGuide reports (152–154) already exist in this batch; confirm they are for different roles before proceeding.

**Background Check Risk:** MEDIUM — Large EU company (Berlin HQ, Series F+, SoftBank-backed, 3000+ employees). GDPR limits employer BG check depth in Germany, but company practices variable at this scale; not a fintech/healthcare/government role.

---

## Score Global

| Dimensión | Score |
|-----------|-------|
| Match con CV | 3.5/5 |
| Alineación North Star | 2.5/5 |
| Comp | 1.5/5 |
| Señales culturales | 3.5/5 |
| Red flags (Berlin relocation = relocation required; comp 20–50% below walk-away) | −1.0 |
| **Global** | **2.2/5** |

---

## Keywords extraídas

`Developer Enablement`, `CI/CD`, `GitHub Actions`, `ArgoCD`, `Kubernetes`, `Docker`, `Node.js`, `JavaScript`, `Java`, `Python`, `Go`, `testing infrastructure`, `developer productivity`, `local development tooling`, `AI agents`, `GitHub administration`, `backend development`, `cloud infrastructure`, `AWS`, `engineering platform`, `developer experience`
