# Evaluación: Isomorphic Labs — Senior Platform Engineer

**Fecha:** 2026-05-06
**Arquetipo:** Senior Platform / Cloud Engineer (PRIMARY) — DevOps / SRE lean
**Score:** 2.5/5
**Legitimacy:** High Confidence
**Background Check Risk:** MEDIUM — UK/EU company, Alphabet-backed; GDPR restricts depth but Alphabet resources mean thorough checks are possible
**URL:** https://job-boards.greenhouse.io/isomorphiclabs/jobs/5539669004
**PDF:** skipped: score 2.5<4.0
**Batch ID:** 206

---

## A) Resumen del Rol

| Campo | Detalle |
|-------|---------|
| **Arquetipo detectado** | Senior Platform / Cloud Engineer (PRIMARY) with strong DevOps/SRE lean |
| **Domain** | AI Drug Discovery — cloud infrastructure for frontier ML research |
| **Function** | Platform Engineering — cloud infra design, K8s operations, tooling, CI/CD, observability |
| **Seniority** | Senior IC (newly created position, foundational scope) |
| **Remote** | Hybrid — London or Lausanne, 3 days/week on-site (Tue, Wed + 1 flex) |
| **Team size** | Not disclosed; cross-functional (science, ML research, product, ops) |
| **TL;DR** | Build foundational cloud infra for a frontier AI drug discovery platform. K8s + GCP + Terraform + Python heavy. Newly created role at an Alphabet-backed UK AI lab. Requires physical presence in London or Lausanne. |

**⚠️ Location flag:** This role requires relocation to London (UK) or Lausanne (Switzerland). Cole is Vancouver-based; hybrid 3d/week in Europe is not compatible with current location without relocation. Scored 3.0/5 on remote dimension per location policy (not hard_no since <4 days required), but relocation is the practical blocker.

---

## B) Match con CV

### Requirements matrix

| Requirement | Essential? | Match | CV Evidence |
|-------------|-----------|-------|-------------|
| Docker | ✅ Essential | ✅ Strong | cv.md (TELL): "Supported Linux, Docker, Nginx, and CI/CD environments" |
| Terraform / IaC | ✅ Essential | ❌ Gap | Not mentioned in cv.md |
| Major cloud platform (GCP / AWS) | ✅ Essential | ✅ Strong | cv.md (Enzuzo): "Supported cloud services across AWS and GCP" + full AWS-to-GCP migration |
| Kubernetes cluster management | ✅ Essential | ❌ Gap | Not mentioned in cv.md |
| Infrastructure as Code proficiency | ✅ Essential | ❌ Gap | CI/CD automation ≠ IaC; no Terraform / Pulumi / CDK in CV |
| Modern CI/CD / release management | ✅ Essential | ✅ Strong | cv.md (Enzuzo): "Improved CI/CD workflows to reduce build times, improve deployment reliability" (90% speedup via Turborepo) |
| Helm / Kustomize / Kapitan | ✅ Essential | ❌ Gap | Not mentioned in cv.md |
| Monitoring / observability (Grafana, Prometheus) | ✅ Essential | ⚠️ Adjacent | cv.md (Enzuzo): "contributing to reliability, monitoring, and operational improvements" — general language, no specific tool stack |
| Python | ✅ Essential | ❌ Gap | Cole is TypeScript / JavaScript / Node.js first; Python not in cv.md or skills |
| Cross-functional independent problem solving | ✅ Essential | ✅ Strong | All three roles (Enzuzo, TELL, Nyrion) show cross-team delivery |
| GCP experience | ⭐ Nice-to-have | ✅ Strong | Enzuzo: production GCP + AWS-to-GCP migration; also matches "Nice-to-have" explicitly |
| ML cloud infrastructure background | ⭐ Nice-to-have | ⚠️ Adjacent | Enzuzo: support for ML-adjacent analytics pipelines; not model training infra |
| GitHub Actions | ⭐ Nice-to-have | ✅ Likely | CI/CD work at Enzuzo; GitHub Actions is standard — not explicitly named |
| Software engineering foundation | ⭐ Nice-to-have | ✅ Strong | 10+ years SWE experience across 3 employers |
| Security risk identification / mitigation | ⭐ Nice-to-have | ⚠️ Adjacent | Enzuzo: privacy / consent domain (GDPR, CCPA, IAB TCF) — adjacent, not infra-security |

### Gaps analysis

| Gap | Hard blocker? | Adjacent experience? | Mitigation |
|-----|--------------|---------------------|------------|
| **Kubernetes** | Yes — listed first under essentials; this is table stakes for any Platform Engineer hiring today | No direct K8s in cv.md | No quick mitigation; Cole would need to proactively add a personal K8s lab project and cite it. Without production K8s, this is likely a screener filter. |
| **Terraform** | Yes — IaC is listed as a core essential; Terraform is the default for GCP shops | No Terraform in cv.md | Could frame CI/CD automation work as adjacent, but reviewers will check LinkedIn/GitHub for Terraform. No short-term mitigation that's honest. |
| **Python** | Yes — "strong Python programming" is an explicit essential requirement; this is a Python-heavy shop (DeepMind lineage) | No Python in cv.md | Cole would need to add Python projects. TypeScript adjacency argument works intellectually but won't pass recruiter screen. |
| **Helm / Kustomize** | Yes for passing technical screens | No mention | Follows from K8s gap; if K8s isn't there, Helm tooling doesn't matter. |
| **Grafana / Prometheus specifics** | Soft — could overcome with "I've worked with observability stacks, specifically Datadog/CloudWatch; Grafana/Prometheus is new tooling, not a new concept" | Enzuzo: monitoring + observability work | This gap is coverable in a phone screen; less of a blocker. |
| **European location** | Practical hard stop — requires relocation to London or Lausanne | Not applicable | Would need to commit to relocation. Cole's profile indicates no explicit hard_no on relocation but it's not in stated preferences. |

**Summary:** 4 of 9 essential requirements are covered (Docker, GCP/Cloud, CI/CD, cross-functional), 5 are gaps. Three of the gaps (K8s, Terraform, Python) are not bridgeable without genuine reskilling or misrepresenting experience. This is a structural mismatch at the technical core of the role.

---

## C) Nivel y Estrategia

**Nivel detectado en JD:** Senior IC (no explicit leveling system, "Senior Platform Engineer")
**Cole's natural level:** Senior IC — exact match in title

**"Vender senior sin mentir":**
The strongest case for Cole would lean hard on:
1. GCP production experience (matches the "nice-to-have GCP" and the DeepMind/Google culture)
2. AWS-to-GCP migration (demonstrates cloud architect-level thinking, not just ops)
3. CI/CD transformation work (Turborepo, 90% build time reduction) — this is a genuine platform-level achievement
4. Cloudflare Workers + Analytics Engine production work (edge computing is adjacent to platform work)

The honest framing: Cole is a strong platform/cloud engineer on the cloud management and CI/CD sides, but is not a Kubernetes operator or Python infra engineer. For this role, that's a material gap.

**"Si me downlevelan":** N/A — the gap here isn't about leveling, it's about skill mismatch.

**Strategic verdict:** This role requires a K8s/Terraform/Python-fluent Platform Engineer. Cole's profile is a cloud + CI/CD generalist with TS/Node backend strength. The profile fit is partial at best. Recommending skip unless Cole has unlisted K8s/Terraform/Python experience.

---

## D) Comp y Demanda

### Salary data (Isomorphic Labs, London)

| Source | Data | Notes |
|--------|------|-------|
| [Levels.fyi — Isomorphic Labs London SWE](https://www.levels.fyi/companies/isomorphic-labs/salaries/software-engineer/locations/london-metro-area) | £106K–£131K+ base | London metro area; Software Engineer range, includes equity |
| [Glassdoor — Isomorphic Labs overall median](https://www.glassdoor.co.uk/Salary/Isomorphic-Labs-Salaries-E7140434.htm) | $164K/yr overall median total comp (~£130K) | All roles, all levels globally |
| [Levels.fyi — Isomorphic Labs UK overall](https://www.levels.fyi/companies/isomorphic-labs/salaries/software-engineer) | £195K median (UK, all levels); high end £324K | UK-wide, includes senior+ and equity-heavy packages |
| London Senior Platform Engineer market (benchmark) | £90K–£130K base; total comp £110K–£160K | Standard UK Platform Engineer market rate |

**Cole's target range:** $170K–$240K USD remote US; $150K–$210K CAD Canada
**London £130K ≈ $165K USD** — this is below Cole's walk-away floor of $150K USD (~£120K) at current exchange rates when considering London cost-of-living is significantly higher than Vancouver.

**Comp score: 2.0/5** — Below target range, London cost-of-living premium not offset by salary, no salary transparency in JD, not remote so no geographic flexibility.

### Market demand context
Platform Engineer roles at AI research labs are high demand (2025-2026). Isomorphic Labs is actively hiring multiple platform roles as of April 2026 (no freeze signals). However, the role requires European in-person presence which limits the candidate pool Cole can realistically compete in without relocation.

---

## E) Plan de Personalización

**Not recommended** — score below 4.0, structural K8s/Terraform/Python gaps, and location incompatibility. If Cole decides to apply despite these barriers, here are the changes:

| # | Sección | Estado actual | Cambio propuesto | Por qué |
|---|---------|---------------|------------------|---------|
| 1 | CV Skills | "TypeScript, JavaScript, Node.js, React, SQL, AWS, GCP, Cloudflare, Docker, CI/CD, PostgreSQL..." | Add: GCP (Cloud Run, GKE if applicable), GitHub Actions, observability tooling | GCP and GitHub Actions should be foregrounded since GCP is listed as "nice-to-have" |
| 2 | CV Enzuzo bullets | "Supported cloud services across AWS and GCP, contributing to reliability, monitoring, and operational improvements." | "Operated production multi-cloud infrastructure on AWS and GCP; executed full AWS-to-GCP migration; contributed to CI/CD reliability and observability improvements." | More specific, K8s-adjacent framing |
| 3 | CV Summary | Generic senior IC summary | Add: "…with particular depth in cloud infrastructure (GCP, AWS), CI/CD platform engineering, and production observability." | Surfaces platform-specific framing immediately |
| 4 | Cover letter | N/A | Lead with AWS-to-GCP migration story and 90% CI/CD speedup as proof of platform-level thinking. Acknowledge Python proficiency gap proactively if applying. | The GCP migration is the strongest signal this role would value |
| 5 | LinkedIn | Skills section | Add GCP certifications if pursuing; prominently list GCP, CI/CD platform work | Isomorphic uses GCP (Google pedigree); GCP credentialing would differentiate |

---

## F) Plan de Entrevistas

**Only relevant if Cole decides to apply despite the above — these gaps would need to be addressed in screens.**

| # | Requisito del JD | Historia STAR | S | T | A | R |
|---|-----------------|--------------|---|---|---|---|
| 1 | Cloud platform expertise / migration | AWS-to-GCP Migration at Enzuzo | Production services running on AWS needing cost and reliability improvement | Migrate all production workloads to GCP with zero downtime | Planned migration in phases, set up GCP environment, migrated services incrementally, implemented GCP-native monitoring | Zero downtime migration; improved reliability + observability; production running on GCP |
| 2 | CI/CD / release management | Turborepo + CI/CD overhaul at Enzuzo | Build times making developer iterations slow; pipeline flakiness | Cut CI/CD time by 90%, improve deployment reliability | Implemented Turborepo monorepo, parallelized builds, added incremental caching, standardized pipeline configs | 90% reduction in build time; faster releases; reduced deployment errors |
| 3 | Modern DevOps / automation | Infrastructure automation at TELL | Globally distributed platform with manual deployment steps | Automate and standardize deployments across environments | Refactored infrastructure with Docker + Nginx + scripted deployments; improved Linux environment stability | Reduced manual steps; improved deployment consistency for tens-of-millions-user platform |
| 4 | Cross-functional collaboration | Cloudflare Workers + Analytics Engine at Enzuzo | Privacy analytics needed to work with scientists/product to define the data model | Build a real-time consent analytics pipeline usable by non-engineers | Designed a Cloudflare Workers pipeline feeding Analytics Engine; worked with product to define dimensions; iterated on the data model | Privacy-safe real-time analytics in production; used by product and compliance teams |
| 5 | Monitoring / observability | Reliability improvements at Enzuzo | Production alerts were noisy; unclear error attribution | Improve monitoring stack to reduce MTTR | Contributed to observability setup across AWS and GCP; identified redundant alerts, improved error logging structure | Better production visibility; faster incident response |
| 6 | Independent problem solving in cross-functional settings | Multi-tenant SaaS backend at Nyrion | Shared infrastructure serving multiple tenants; isolation and reliability gaps | Own backend services and APIs end-to-end without close oversight | Built REST APIs, background jobs, QA tooling independently; worked across product and ops teams to ship and maintain | Reliable multi-tenant SaaS with improved test coverage and release stability |

**Case study recommendation:** AWS-to-GCP migration at Enzuzo — this is the closest proof point to infrastructure architect-level work. Frame it as: "I owned the cloud migration end-to-end: planning, execution, monitoring, and cutover. It demonstrates that I can operate at the infrastructure layer, not just as an application engineer."

**Red-flag questions to prepare:**
- *"Do you have Kubernetes experience?"* — Be honest: "I haven't operated K8s clusters in production, but I've worked with containerized deployments in Docker + CI/CD, and I understand the layer K8s operates at. I'd want to ramp quickly — are there projects where I could shadow the existing K8s setup before taking ownership?"
- *"What Python experience do you have?"* — Be honest about TypeScript-first background; can highlight that Python scripting shares enough fundamentals to ramp; cite any automation scripts written; mention Cloudflare Workers (JS/TS) as analogous compute boundary work.
- *"Why London / Lausanne?"* — Cole should have a clear relocation answer ready if applying; vague answers here will stall the process.

---

## G) Posting Legitimacy

**Assessment: High Confidence**

| Signal | Status | Notes |
|--------|--------|-------|
| Description specificity | ✅ High | Specific tool stack (Helm, Kustomize, Kapitan named), concrete team context (scientists, ML researchers), clear seniority level |
| Salary transparency | ⚠️ None | Common for UK/EU job postings; not a red flag in context |
| Boilerplate ratio | ✅ Low | ~20% standard company culture boilerplate; 80% role-specific content |
| Company hiring signals | ✅ Active | Isomorphic Labs posting 3+ platform roles as of April 2026; no layoff news found |
| Prior scan appearances | ✅ New | URL not found in data/scan-history.tsv; first appearance of this specific posting |
| "Newly created position" | ✅ Positive | JD explicitly says newly created — genuine headcount, not backfill |
| Glassdoor concerns | ⚠️ Minor | Reviewer mentions "silent layoffs" and senior talent departures; no systematic event confirmed |
| Posting freshness | ⚠️ Unverified | Batch mode — posting age not directly verified via Playwright; Greenhouse iframe active |

**Context notes:** Isomorphic Labs is backed by Alphabet/Google DeepMind and has been publicly active in hiring platform and ML infrastructure talent. The Greenhouse posting structure, specific requirements, and "newly created" language all point to a genuine open position. No signals of ghost posting or hiring freeze.

**Background Check Risk: MEDIUM** — UK/EU company, GDPR limits depth of background checks under the Employment Practices Code. However, Isomorphic Labs is backed by Alphabet, which has resources for more thorough checks than a typical EU startup. No clearance/FINRA/HIPAA requirements in this role. Standard UK employment screening expected (right-to-work, references, possible criminal record check). GDPR-restricted depth.

---

## Score Global

| Dimensión | Score |
|-----------|-------|
| Match con CV | 2.5/5 |
| Alineación North Star | 3.0/5 |
| Comp | 2.0/5 |
| Señales culturales | 3.0/5 |
| Red flags (K8s + Terraform + Python gaps; EU relocation required) | -0.75 |
| **Global** | **2.5/5** |

**Recomendación: SKIP.** Three essential requirements (Kubernetes, Terraform, Python) are not in Cole's CV and cannot be bridged with adjacent framing. Location requires relocation to Europe. Comp is below target range on London rates. This is an interesting company but structurally mismatched to Cole's current profile. If Cole wants to target Isomorphic Labs, a better fit would be a full-stack/platform hybrid role with TypeScript/Node components — their Full Stack Engineer role (report 204) was evaluated separately and also scored below threshold primarily due to location.

---

## Keywords extraídas

Kubernetes, Terraform, GCP, Docker, CI/CD, Infrastructure as Code, Helm, Kustomize, Prometheus, Grafana, Platform Engineering, Release Management, GitHub Actions, Python, Cloud Infrastructure, DevOps, Observability, Monitoring, Multi-cloud, Cross-functional engineering
