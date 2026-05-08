# Evaluación: Isomorphic Labs — Cloud Platform Engineer

**Fecha:** 2026-05-06
**Arquetipo:** Senior Platform / Cloud Engineer (SECONDARY)
**Score:** 1.5/5
**Legitimacy:** Proceed with Caution
**Background Check Risk:** MEDIUM — UK-based Alphabet subsidiary; GDPR restricts depth but Alphabet resources mean thorough checks are possible
**URL:** https://job-boards.greenhouse.io/isomorphiclabs/jobs/5584160004
**PDF:** skipped: score 1.5<4.0
**Batch ID:** 203

---

## A) Resumen del Rol

| Dimensión | Detalle |
|-----------|---------|
| **Arquetipo detectado** | Senior Platform / Cloud Engineer (SECONDARY en perfil Cole) |
| **Domain** | AI / Drug Discovery (Alphabet company) |
| **Function** | Cloud Infrastructure & DevOps |
| **Seniority** | Senior (implied — no explicit level stated) |
| **Remote** | ❌ London hybrid — 3 days/week in office (MANDATORY) |
| **Team size** | Small and highly efficient (exact size unstated) |
| **TL;DR** | Design, operate, and refine research + production cloud infra; partner with science/ML/product teams; contribute to core tooling and architecture decisions. Stack is Python + K8s + Terraform + GCP + Grafana/Prometheus. Newly created role with inherent ambiguity. |

**Company context:** Isomorphic Labs is an Alphabet company based in London (King's Cross), building AI-first drug discovery platforms. Backed by Google. ~100–200 person org, high-calibre science/ML team. Not publicly traded but Alphabet-backed = substantial resources and hiring rigor. Glassdoor: 92% recommend (London), 4.4/5 comp rating. Concerns flagged: unclear career progression, long hours.

---

## B) Match con CV

### Requirements Map

| JD Requirement | Priority | Match | CV Evidence / Gap |
|----------------|----------|-------|-------------------|
| Strong Python programming | PRIMARY | ❌ **HARD BLOCKER** | Python absent from cv.md skills and all experience bullets |
| Docker experience | PRIMARY | ✅ | cv.md — TELL: "Linux, Docker, Nginx, CI/CD environments"; Enzuzo: implied via CI/CD ownership |
| Terraform / IaC | PRIMARY | ❌ **HARD BLOCKER** | Terraform not in cv.md; no IaC tooling mentioned |
| Kubernetes cluster management | PRIMARY | ❌ **HARD BLOCKER** | K8s absent from cv.md; no container orchestration at scale mentioned |
| CI/CD / release management | PRIMARY | ✅ | cv.md (Enzuzo): "Improved CI/CD workflows to reduce build times, improve deployment reliability" |
| Major cloud platform (GCP) | PRIMARY | ✅ (partial) | cv.md (Enzuzo): "Supported cloud services across AWS and GCP" |
| Modern DevOps proficiency | PRIMARY | ✅ (partial) | cv.md (Enzuzo, TELL): CI/CD, Linux, Docker presence — but depth is infrastructure-lite vs this role's expectations |
| Helm / Kustomize / Kapitan | NICE-TO-HAVE | ❌ | Not in cv.md |
| Grafana / Prometheus / Splunk monitoring | NICE-TO-HAVE | ❌ | "Monitoring and operational improvements" mentioned at Enzuzo but no specific tooling named |
| GCP experience | NICE-TO-HAVE | ✅ | cv.md (Enzuzo): AWS-to-GCP migration |
| GitHub Actions | NICE-TO-HAVE | ⚠️ | CI/CD experience present but no explicit GitHub Actions mention |
| Security risk identification | NICE-TO-HAVE | ❌ | Not in cv.md |
| ML cloud infra support | NICE-TO-HAVE | ❌ | No ML infra experience |
| Cross-functional partnership | NICE-TO-HAVE | ✅ | cv.md (all roles): "Worked closely with product and engineering teams" |

**Match summary:** 4 of 8 primary requirements met (or partially met). 3 PRIMARY BLOCKERS: Python, Kubernetes, Terraform — all absent from Cole's profile.

### Gaps Analysis

| Gap | Blocker? | Adjacent Experience? | Mitigation |
|-----|----------|---------------------|------------|
| **Python** | ✅ Hard blocker | TypeScript/JS background — different ecosystem entirely | No mitigation; cannot credibly claim Python seniority from a TS background without portfolio evidence |
| **Kubernetes** | ✅ Hard blocker | Docker usage, CI/CD ownership | K8s cluster management is a specialty; container ops ≠ K8s cluster management |
| **Terraform / IaC** | ✅ Hard blocker | AWS + GCP familiarity, CI/CD scripting | Cloud familiarity ≠ IaC practice; Terraform requires direct hands-on history |
| **Helm / Kustomize** | Nice-to-have | None | Skip — would rely on learning quickly |
| **Grafana / Prometheus** | Nice-to-have | "Monitoring improvements" at Enzuzo | Could mention monitoring work but lack specific tooling names |
| **London (3d/wk hybrid)** | ✅ Geographic blocker | Cole in Vancouver | Would require full relocation; Cole's profile does not include London relocation willingness |

---

## C) Nivel y Estrategia

**JD level:** Senior (unnamed but implied — "independently deliver", "highly efficient team", novel role).
**Cole's natural level:** Senior IC — archetype match is SECONDARY (Platform/Cloud), not PRIMARY.

**Plan "vender senior sin mentir":** Largely irrelevant given the three hard technical blockers. Even if Cole pitched the GCP migration + CI/CD work hard, the absence of Python, K8s, and Terraform would be caught at first technical screen. There is no honest path to clearing the bar on the primary requirements.

**Plan "si me downlevelan":** N/A — this is a SKIP recommendation. The role mismatch is technical, not positional.

---

## D) Comp y Demanda

### Market Data

| Source | Data Point |
|--------|------------|
| Levels.fyi (Isomorphic Labs, London) | Software Engineer median: £195K total comp; median: £212K |
| Levels.fyi (range) | £101K–£195K base; top-end with equity: £540K reported |
| Glassdoor comp rating | 4.4/5 — above average for London market |
| Cole target (remote US) | $170K–$240K USD |
| Cole target (local/Canada) | $150K–$210K CAD |

**Comp score: 3/5** — London market comp is strong in absolute terms (£195K ≈ $245K USD at current rates). However: (1) requires relocation to London, which introduces significant life-cost delta; (2) Cole would be paid in GBP with London cost-of-living; (3) no salary transparency in JD. Comp is above Vancouver market but below what a TS-stack Senior role at a US-remote company would offer with Vancouver cost-of-living advantage.

**Demand signal:** AI drug discovery is a growing niche. Isomorphic Labs is well-funded and backed by Alphabet. Hiring appears active (role newly created).

Sources: [Levels.fyi — Isomorphic Labs](https://www.levels.fyi/companies/isomorphic-labs/salaries/software-engineer) | [Glassdoor](https://www.glassdoor.co.uk/Salary/Isomorphic-Labs-Salaries-E7140434.htm)

---

## E) Plan de Personalización

Not applicable — SKIP recommendation. Personalizing the CV for this role would not overcome the Python/K8s/Terraform hard blockers or the London hybrid requirement.

If Cole were to apply against all advice:

| # | Section | Current | Proposed Change | Why |
|---|---------|---------|-----------------|-----|
| 1 | Summary | TS-first framing | Add "cloud infrastructure" language | Surface GCP/AWS line |
| 2 | Enzuzo bullets | CI/CD, Cloudflare | Foreground "GCP, Docker, cloud reliability" explicitly | Closest match to JD |
| 3 | Skills | TS, React, Node first | Promote Docker, GCP, Linux | Align with infra-first scan |
| 4 | TELL | Consumer platform | Add "Linux, Docker, Nginx production environments" | Already in cv but undersurfaced |
| 5 | Projects | Not applicable | No relevant platform/infra projects to add | Gap is unbridgeable without portfolio |

LinkedIn changes: same direction — foreground cloud and infra keywords. Still won't cover Python/K8s gap.

---

## F) Plan de Entrevistas

Not applicable — SKIP recommendation. Role would not clear technical screen given Python and K8s gaps.

For completeness, the closest STAR stories from Cole's experience if he were to attempt it:

| # | JD Requirement | Story | S | T | A | R |
|---|----------------|-------|---|---|---|---|
| 1 | GCP cloud ops | Enzuzo AWS-to-GCP migration | Enzuzo running on AWS needed GCP capabilities | Migrate production workloads to GCP | Led migration, set up GCP services, monitoring improvements | Reduced infra fragmentation; improved observability |
| 2 | CI/CD reliability | Turborepo + CI/CD overhaul at Enzuzo | Slow, unreliable builds blocking team velocity | Rebuild CI/CD pipeline | Introduced Turborepo monorepo + incremental build caching | 90% reduction in build times |
| 3 | Docker / production ops | TELL platform infra | High-traffic consumer platforms required stable infra | Maintain Linux/Docker/Nginx production environment | Refactored infrastructure, maintained deployment workflows | Globally distributed users, reliable operations |
| 4 | Cross-functional partnership | Enzuzo privacy analytics | Multiple teams needed data pipeline visibility | Build Cloudflare Workers + Analytics Engine pipeline | Implemented real-time consent event processing at edge | Privacy-safe analytics in production, adopted by product and science teams |

Case study recommendation: Enzuzo Cloudflare + GCP story is the strongest platform angle. Still insufficient for a Python/K8s-centric screener.

Red flag questions to prep (if applying):
- "Walk me through your Kubernetes cluster management experience" → Cole has none; honest answer kills candidacy
- "Describe a Terraform module you've authored" → same
- "What Python frameworks have you used in production?" → Cole has none; hard stop

---

## G) Posting Legitimacy

**Assessment: Proceed with Caution**

| Signal | Status | Notes |
|--------|--------|-------|
| JD specificity | ✅ High | Concrete tech stack (Kapitan, Analytics Engine, specific tooling), realistic requirements |
| Salary transparency | ❌ None | No comp range in JD |
| Boilerplate ratio | Low | Role described as "newly created" with inherent ambiguity — honest framing |
| Company hiring signals | ✅ Active | Isomorphic Labs appears to be actively hiring across multiple roles (startup.jobs confirms) |
| Reposting detection | First appearance | scan-history.tsv: first seen 2026-05-06, status "added" — not a repost |
| Posting freshness | Unverified (batch mode) | Cannot confirm exact days posted; Playwright not available |
| Layoff / freeze signals | None found | No negative hiring signals in recent search results |

**Context:** Isomorphic Labs is a well-funded Alphabet subsidiary. The role appears genuine and active. The "Proceed with Caution" tier reflects the lack of salary transparency and inability to verify posting freshness, not any suspicion of inauthenticity.

**Background Check Risk:** MEDIUM — UK-based Alphabet subsidiary. GDPR limits the depth of employer background checks in the UK (no criminal record checks without regulated-role justification). However, Alphabet's resources and connections mean a more thorough process than a typical EU startup. Unlikely to trigger CPIC cross-border check at application stage; higher risk at offer/onboarding stage if process goes international.

---

## Score Global

| Dimensión | Score |
|-----------|-------|
| Match con CV | 1.5/5 |
| Alineación North Star | 1.5/5 |
| Comp | 3.0/5 |
| Señales culturales | 2.5/5 |
| Red flags | -1.5 (London mandatory + Python/K8s/Terraform all missing) |
| **Global** | **1.5/5** |

**Recomendación: NO APLICAR.** Three primary technical requirements (Python, Kubernetes, Terraform) are absent from Cole's CV with no adjacent experience to bridge the gap. The London 3-day hybrid requirement additionally requires full relocation from Vancouver. This role is a misalignment on both tech stack and geography simultaneously.

---

## Keywords extraídas

cloud platform, kubernetes, k8s, terraform, infrastructure as code, python, docker, GCP, google cloud platform, helm, kustomize, kapitan, grafana, prometheus, splunk, devops, CI/CD, observability, monitoring, release management, infrastructure reliability, site reliability, MLOps infrastructure, github actions
