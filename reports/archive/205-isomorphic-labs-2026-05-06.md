# Evaluación: Isomorphic Labs — Platform Engineer - Security

**Fecha:** 2026-05-06
**Arquetipo:** Senior DevOps / SRE / Infrastructure (SECONDARY) + Senior Platform / Cloud Engineer (partial)
**Score:** 1.5/5
**Legitimacy:** Proceed with Caution
**Background Check Risk:** MEDIUM — Alphabet-backed UK research lab; Google-level BG check practices likely despite GDPR
**URL:** https://job-boards.greenhouse.io/isomorphiclabs/jobs/5978596004
**PDF:** skipped: score 1.5 < 4.0
**Batch ID:** 205

---

## A) Resumen del Rol

| Campo | Detalle |
|---|---|
| **Arquetipo detectado** | Senior DevOps / SRE / Infrastructure + Platform/Cloud Security |
| **Domain** | Biotech / Drug Discovery AI (Alphabet subsidiary) |
| **Function** | Platform Engineering + Security |
| **Seniority** | Senior (no explicit level stated in JD) |
| **Remote** | NO — London hybrid, 3 days/week in-office (Tue + Wed + 1 flex) |
| **Team size** | Not specified |
| **Salary** | Not posted |
| **TL;DR** | Platform security infra role at Google-backed drug discovery AI lab. Requires deep Python + Kubernetes + Terraform + security engineering background, plus physical presence in London 3 days/week. Fundamental stack, security domain, and location mismatch for Cole. |

**About Isomorphic Labs:** Founded 2021, spun out of DeepMind (Alphabet subsidiary). Mission: apply frontier AI to accelerate drug discovery. Made headlines with AlphaFold partnerships with Eli Lilly and Novartis. ~200-400 employees (estimated). Active hiring with 32 open roles as of May 2026.

---

## B) Match con CV

### Requirement Mapping

| JD Requirement | Type | Match | CV Evidence |
|---|---|---|---|
| Docker | Hard req | ✅ Partial | "Supported Linux, Docker, Nginx" — TELL (cv.md) |
| Major cloud platforms | Hard req | ✅ | "cloud services across AWS and GCP" — Enzuzo (cv.md) |
| CI/CD + release management | Hard req | ✅ | "Improved CI/CD workflows to reduce build times" — Enzuzo (cv.md) |
| Terraform | Hard req | ❌ | Not mentioned in CV |
| Kubernetes cluster management | Hard req | ❌ | Not mentioned in CV |
| Infrastructure as Code principles | Hard req | ⚠️ | Cloud work implied but not explicit; no IaC tooling named |
| Helm or Kapitan | Hard req | ❌ | Not mentioned |
| Grafana or Prometheus | Hard req | ❌ | "monitoring" at Enzuzo but no specific tools named |
| Python programming | Hard req | ❌ | Not mentioned; Cole is TypeScript/JavaScript-first |
| Security expertise + vuln identification | Hard req | ❌ | Privacy/GDPR/CCPA at Enzuzo is adjacent compliance, not security engineering |
| GCP (preferred) | Preferred | ✅ | GCP at Enzuzo; AWS-to-GCP migration (cv.md) |
| ML infra support (preferred) | Preferred | ❌ | Not mentioned |
| GitHub Actions (preferred) | Preferred | ⚠️ | CI/CD at Enzuzo; specific tooling unconfirmed |
| Software engineering foundation (preferred) | Preferred | ✅ | 10+ years SWE background (cv.md) |
| London hybrid attendance | Hard req | ❌ | Cole is in Vancouver, BC |

**Match ratio:** 4 clear matches out of 14 requirements. 5 hard blockers.

### Gap Analysis

| Gap | Hard blocker? | Adjacent experience? | Mitigation |
|---|---|---|---|
| **Location (London hybrid)** | YES — requires London residency | None | Relocation would be required; not in Cole's current plans |
| **Kubernetes** | YES — core of the role | Docker/containers adjacent, but K8s mgmt is distinct | Would need 3-6 months hands-on K8s to credibly claim; no portfolio proof |
| **Terraform / IaC** | YES — central to infra work | Cloud configuration experience adjacent | No IaC tooling named in CV; cannot credibly claim |
| **Python** | YES — primary scripting language | TypeScript/JavaScript present but different ecosystem | Cannot credibly bridge: role expects Python day-to-day |
| **Security engineering** | YES — the "Security" in the title | GDPR/CCPA compliance at Enzuzo is adjacent but compliance ≠ security engineering | No vuln scanning, pen testing, or security tooling experience demonstrable |
| **Helm / Kapitan** | Nice-to-have | Deployment workflow experience | Could note CI/CD delivery experience but Helm is Kubernetes-specific |
| **Grafana / Prometheus** | Nice-to-have | General monitoring/observability work | Vague monitoring mention insufficient; cannot name tools |

**Verdict:** 5 hard blockers including location. Even if Cole had the right stack, the London hybrid requirement alone makes this a non-starter from Vancouver.

---

## C) Nivel y Estrategia

**Nivel detectado en JD:** Senior (implied; no explicit level). The breadth of requirements (K8s, Terraform, security, cloud, ML infra) suggests a mid-to-senior IC with 5-8+ years of platform/infra specialization.

**Cole's natural level:** Senior IC — but optimized for full-stack TypeScript / cloud, not platform-security infra.

**Stack alignment verdict:** This is a Python + Kubernetes + Terraform + security engineering role. Cole's natural stack is TypeScript + React + Node + cloud (AWS/GCP). These are fundamentally different specializations. Even with strong senior credentials, the skill profile doesn't translate.

**"Sell senior without lying" plan:** N/A — the gaps are too fundamental. There is no framing that bridges Python/K8s/Terraform/security engineering from a TS/React/Node background convincingly. Attempting to apply would result in an early screen-out.

**"If downleveled" plan:** Not applicable. Level is not the constraint here.

---

## D) Comp y Demanda

### Market Data

| Source | Data | Notes |
|---|---|---|
| Levels.fyi | £101K–£195K+ (SWE at Isomorphic Labs, London) | General SWE data, not platform-specific |
| Glassdoor | Cloud Platform Engineer at Isomorphic: £64K–£106K | Most relevant comparable |
| Estimated Platform Engineer - Security | £80K–£140K GBP | Based on adjacent roles; role-specific data unavailable |
| USD equivalent | ~$100K–$178K USD | At ~1.27 GBP/USD exchange rate |
| CAD equivalent | ~$135K–$240K CAD | At ~1.71 GBP/CAD exchange rate |

### Cole's Targets vs. This Role

| | Cole's Target | This Role Estimate |
|---|---|---|
| Remote US target | $170K–$240K USD | N/A (London-based) |
| CAD equivalent range | $150K–$210K CAD | ~$135K–$240K CAD (wide range, no salary posted) |
| Walk-away | $150K USD / $140K CAD | Unclear |

**Comp score: 2.0/5** — No salary transparency. London market for platform engineering typically comes in below remote US tech at Cole's target level when converted to USD. London cost of living premium partially offsets but Cole would not be moving to London.

**Market demand for this role:** Platform engineers with K8s + Terraform + security + Python are in demand in London's deep-tech/biotech AI sector. Isomorphic Labs is actively hiring (32 open roles), no public layoffs, though Glassdoor notes concern about "silent layoffs" and "good scientists leaving." Alphabet backing = financial stability.

**Comp score: 2.0/5**

---

## E) Plan de Personalización

Not recommended — score below threshold (1.5/5) and hard blockers are structural. No CV customization would address location, Python, or Kubernetes gaps.

If Cole were to apply hypothetically:

| # | Sección | Cambio propuesto | Por qué |
|---|---|---|---|
| 1 | Summary | Lead with GCP + cloud infra angle; de-emphasize React/frontend | Role is infra-first, not full-stack |
| 2 | Enzuzo bullets | Surface "cloud services across AWS and GCP" more prominently; add any monitoring details | Closest match to JD |
| 3 | Skills | Reorder: Docker, Linux, GCP → top; TypeScript → bottom | ATS optimization for this role |
| 4 | TELL bullets | Surface Docker + Nginx + Linux operations experience | Most infra-relevant from 2017-2023 |
| 5 | Summary | Acknowledge interest in Python ecosystem briefly | Honest bridging to reduce screen-out |

**LinkedIn changes:** Not recommended for this role given the fundamental stack mismatch.

---

## F) Plan de Entrevistas

Provided for completeness, though application is not recommended.

| # | JD Requirement | Historia STAR | S | T | A | R |
|---|---|---|---|---|---|---|
| 1 | Cloud infrastructure design | AWS-to-GCP migration at Enzuzo | Enzuzo had prod workloads on AWS; leadership decided to consolidate on GCP | Migrate all production services with zero downtime | Planned migration phases, set up GCP monitoring and observability, managed cutover sequencing | Full production workloads migrated; improved cost visibility and GCP-native observability |
| 2 | CI/CD and DevOps practices | CI/CD overhaul at Enzuzo | Build times were slow (30-40 min), blocking rapid iteration | Cut build times and improve deployment reliability | Implemented Turborepo, optimized parallelization, incremental caching | 90% faster builds; CI pipeline became a team asset rather than a bottleneck |
| 3 | Docker / containerization | TELL production infra | High-traffic consumer platforms (tens of millions of users) across multiple services | Maintain Docker + Nginx + Linux production environments with high uptime | Contributed to containerization, deployment, and operational reliability of core services | Supported reliability and operations for platforms serving tens of millions of users |
| 4 | Cloud monitoring/reliability | Cloud services at Enzuzo | Production services needed better reliability and monitoring visibility | Improve observability and operational confidence | Contributed to monitoring improvements alongside AWS-to-GCP migration | Improved operational reliability, faster detection of production issues |
| 5 | Cross-functional collaboration | Working with product/science/ops at Enzuzo | Engineering team needed to ship features while maintaining platform reliability | Ship features quickly while keeping infra healthy | Close collaboration with product on consent analytics pipeline (Cloudflare Analytics Engine) | Delivered real-time consent analytics in production — platform + product jointly owned |

**Case study recommendation:** The AWS-to-GCP migration is the strongest proof point for this role — demonstrates cloud platform maturity, planning, execution, and operations. Lead with it if applying.

**Red-flag questions and how to handle them:**

| Question | Honest response |
|---|---|
| "What Kubernetes experience do you have?" | "I've worked with containerized environments at scale (Docker, Linux, cloud-native GCP services) but haven't managed K8s clusters directly in production. I'm actively ramping up on K8s administration and would treat that as a 30-60 day onboarding priority." |
| "What Python are you writing today?" | "My primary language is TypeScript/Node. I can read and write Python — used it for scripting at [prior project] — but I wouldn't claim it as a strength. I'd want to be honest about the ramp time on a Python-heavy platform team." |
| "Can you be in London 3 days a week?" | "I'm currently based in Vancouver. For the right role and company I'm open to discussing relocation, but I'd want to understand the timeline and relocation support before committing." |

---

## G) Posting Legitimacy

**Assessment: Proceed with Caution**

| Signal | Status | Detail |
|---|---|---|
| JD specificity | ✅ High | Specific tool requirements (Helm/Kapitan, Grafana/Prometheus, Terraform), domain-specific (ML infra support), realistic seniority bar |
| Boilerplate ratio | ✅ Low | Custom description with domain-relevant context (drug discovery, cross-functional science teams) |
| Salary transparency | ❌ None | No compensation range posted — common for UK companies but reduces candidate filtering quality |
| Company hiring signals | ✅ Active | 32 open roles as of May 2026; Alphabet backing ensures financial stability; no public hiring freeze |
| Layoff / freeze news | ⚠️ Soft signal | No public layoffs; Glassdoor notes (March 2026, current Principal SWE) reference "silent layoffs" and "good scientists leaving" — unverified but worth noting |
| Reposting in scan-history.tsv | ✅ Not found | URL does not appear in scan-history.tsv |
| Posting freshness | ⚠️ Unverified | Batch mode — Playwright not available; cannot confirm exact days posted or apply button state |
| Apply button state | ⚠️ Unverified | Batch mode limitation |

**Context Notes:** Isomorphic Labs is a legitimate, well-funded drug discovery AI company (Alphabet subsidiary, AlphaFold commercial partnerships with Eli Lilly and Novartis). The posting quality is genuine. The "Proceed with Caution" rating reflects the soft Glassdoor signal about internal culture shifts, not doubts about legitimacy. The role appears to be a real, active opening.

**Background Check Risk:** MEDIUM — Alphabet subsidiary with likely Google-level BG check practices; UK GDPR provides some depth limitation but corporate parent influence is significant. Criminal record may surface in cross-border check. Not a hard stop (no security clearance, no fintech, no PHI), but not risk-free.

---

## Score Global

| Dimensión | Score |
|---|---|
| Match con CV | 2.0/5 |
| Alineación North Star | 1.5/5 |
| Comp | 2.0/5 |
| Señales culturales | 3.0/5 |
| Red flags | −1.5 (London hybrid = de facto relocation; Python-primary = fundamental stack mismatch) |
| **Global** | **1.5/5** |

**Recommendation: DO NOT APPLY.** This role has five hard blockers — location (London hybrid from Vancouver), Kubernetes, Terraform, Python, and security engineering. None of these are bridgeable through framing. Even if Cole had the stack, the London hybrid requirement alone eliminates this from consideration without a relocation decision.

---

## Keywords extraídas

Platform Engineering, Kubernetes, Terraform, Docker, GCP, Google Cloud Platform, CI/CD, DevOps, Infrastructure as Code, Helm, Grafana, Prometheus, Python, Security Engineering, Vulnerability Management, ML Infrastructure, GitHub Actions, Release Management, Cloud Security, Site Reliability
