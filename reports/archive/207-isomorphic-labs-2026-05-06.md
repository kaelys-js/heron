# Evaluación: Isomorphic Labs — Software Engineer (Compute Infra)

**Fecha:** 2026-05-06
**Arquetipo:** Senior Platform / Cloud Engineer (ML Compute Infra) — SECONDARY
**Score:** 1.5/5
**Legitimacy:** High Confidence
**Background Check Risk:** HIGH
**URL:** https://job-boards.greenhouse.io/isomorphiclabs/jobs/5561630004
**PDF:** skipped: score 1.5<4.0 + BG risk HIGH
**Batch ID:** 207

---

## A) Resumen del Rol

| Campo | Detalle |
|-------|---------|
| Arquetipo detectado | Senior Platform / Cloud Engineer (ML Compute Infra) — SECONDARY |
| Domain | AI/ML Drug Discovery (Biotech + AI) |
| Function | GPU/TPU Compute Infrastructure, ML Platform |
| Seniority | Senior Software Engineer (IC, specialist infra) |
| Remote | ❌ Hybrid — 3 days/week in office, **London** |
| Team size | Cross-functional (infra + science + research + product) |
| TL;DR | End-to-end GPU/TPU infrastructure: cluster deployment, monitoring, reliability, hardware acquisition strategy. Alphabet subsidiary building AI-powered drug discovery (AlphaFold lineage). Requires Kubernetes + GCP + ML workload experience. London on-site 3 days/week — relocation required. |

Isomorphic Labs is an autonomous subsidiary of Alphabet Inc. (Google's parent), spun out from Google DeepMind in 2021. Known for AlphaFold-derived drug discovery tooling. Recently raised $600M (2024) and released the Drug Design Engine (IsoDDE, Feb 2026). Genuinely interesting science, but the infra role is deep ML compute specialty — not a general cloud/platform role.

---

## B) Match con CV

| Requisito JD | Must-have? | Match | CV Reference |
|---|---|---|---|
| Cloud compute infrastructure design (GCP preferred) | ✅ Essential | ✅ Partial | "Supported cloud services across AWS and GCP" (Enzuzo); AWS-to-GCP migration |
| Strong programming skills | ✅ Essential | ✅ | TypeScript, Node.js, 10+ years production |
| Real-world large-scale AI/ML workload experience | ✅ Essential | ❌ Hard gap | No ML workload experience in CV |
| Significant Kubernetes deployment experience | ✅ Essential | ❌ Hard gap | Not mentioned in CV — significant miss |
| Nvidia GPU generation familiarity | ✅ Essential | ❌ Hard gap | No hardware background |
| Cluster deployment, monitoring, management | ✅ Essential | ❌ Hard gap | CI/CD + monitoring experience but not GPU cluster ops |
| ML SWE or infrastructure SRE background | Nice-to-have | ❌ | Platform/cloud experience but not ML-specific |
| Hardware acquisition/deployment strategy | Nice-to-have | ❌ | No procurement experience |
| Google TPU familiarity | Nice-to-have | ❌ | Not in CV |
| Workload scheduling | Nice-to-have | ❌ | Not in CV |
| Cross-team collaboration (science/research/product) | Nice-to-have | ✅ | Cross-functional work at Enzuzo (product + engineering) |

**Raw match score: 2.0/5**
**After HIGH BG penalty (−1.5): 1.0/5** (floor applied)

### Gaps & Mitigation

1. **Kubernetes (HARD BLOCKER):** Not in CV anywhere. Cole has Docker and CI/CD experience, but Kubernetes is architecturally different and the JD lists it as essential. No credible adjacent experience to bridge this. Mitigation: none short of weeks of hands-on work to build a side project — not applicable at application stage.

2. **GPU/TPU experience (HARD BLOCKER):** ML hardware background is a specialist domain. Cole's work has been application-layer and infrastructure (cloud services, CI/CD, data pipelines) — not compute hardware. Not bridgeable.

3. **Large-scale AI/ML workloads (HARD BLOCKER):** Cole's real-time data pipelines (Cloudflare Analytics Engine for consent events) are not ML training or inference workloads. The vocabulary overlaps ("data pipelines") but the substance doesn't.

4. **London on-site 3 days/week (HARD BLOCKER):** Cole is in Vancouver, BC. This role requires relocation to London. Not a hybrid-but-remote situation — it's UK-based employment. Cole's must_have is "Remote-friendly OR Vancouver-based"; hard_no includes "On-site 4-5 days/week outside Vancouver area." Three days/week in London is effectively the same as relocation.

5. **Cluster management / hardware acquisition (HARD BLOCKER):** Entirely outside Cole's experience surface. No mitigation at application stage.

---

## C) Nivel y Estrategia

**Nivel detectado en JD:** Senior Software Engineer (undifferentiated title masking a deep ML-infra specialty)
**Cole's natural level:** Senior IC — but in a different specialty domain (TS/React/Node/cloud-app)

This is not a level problem — it's a domain mismatch. The role title says "Software Engineer" but the reality is a GPU cluster operations / ML compute infrastructure specialist. Cole's cloud experience (GCP, AWS) is real and relevant to the _platform_ layer, but the ML compute layer (Kubernetes, GPU scheduling, CUDA, cluster monitoring for ML runs) is a distinct discipline that Cole hasn't worked in.

There is no credible "vender senior sin mentir" path here. The essential requirements (Kubernetes, GPU, ML workloads) would require significant fabrication or enormous overstatement. Skip.

**Downlevel plan:** N/A — domain mismatch, not level mismatch.

---

## D) Comp y Demanda

| Metric | Data | Source |
|--------|------|--------|
| Median total comp (SE, London) | £195K–£211K/year | [Levels.fyi](https://www.levels.fyi/companies/isomorphic-labs/salaries/software-engineer) |
| Top reported (London metro) | £539K (equity-heavy outlier) | [Levels.fyi London](https://www.levels.fyi/en-gb/companies/isomorphic-labs/salaries/software-engineer/locations/london-metro-area) |
| Base range | £101K–£195K+ | [Levels.fyi UK](https://www.levels.fyi/companies/isomorphic-labs/salaries/software-engineer/locations/united-kingdom) |
| Glassdoor data (2026) | 22 reported salaries on record | [Glassdoor](https://www.glassdoor.co.uk/Salary/Isomorphic-Labs-Salaries-E7140434.htm) |

**USD conversion (1 GBP ≈ 1.27 USD):** £195K ≈ $248K USD total comp — on paper above Cole's $170K–$240K target range.

**Purchasing power parity caveat:** London CoL is ~30–40% higher than Vancouver. A £195K London package is roughly equivalent to $175K–$185K CAD-equivalent purchasing power — within range but not exceptional once housing is accounted for.

**Comp score: 4.0/5** — strong market rate for London, above Cole's stated minimums. Alphabet backing likely means equity + benefits package is competitive.

**Demand signals:** Isomorphic Labs is actively hiring across compute infra (this is a focused, niche role), recently raised $600M, and is in growth phase. However, the ML compute infra market is specialist and competitive — this role likely sees few qualified candidates globally, meaning hiring bar is high.

---

## E) Plan de Personalización

**Not applicable.** Score gate not met (1.5/5 < 4.0 threshold). PDF not generated. No CV customization recommended.

Summary of why customization would not help: the gaps are structural (no Kubernetes, no GPU/TPU, no ML workloads, relocation required) — not presentation gaps. Keyword injection cannot bridge missing hands-on experience in a specialist domain.

---

## F) Plan de Entrevistas

**Not applicable.** Score gate not met. Skip.

---

## G) Posting Legitimacy

**Assessment: High Confidence**

| Signal | Status | Notes |
|--------|--------|-------|
| ATS platform | ✅ | Greenhouse — legitimate enterprise ATS |
| Company verifiability | ✅ | Isomorphic Labs is a well-documented Alphabet subsidiary |
| JD specificity | ✅ | Specific technical requirements (Kubernetes, GCP, GPU/TPU, cluster ops) — not generic boilerplate |
| Salary transparency | ⚠️ | No salary listed in posting (common for UK tech roles; Levels.fyi data exists) |
| Reposting detection | ✅ No repost | Reports 203 (Cloud Platform Engineer) and 204 (Full Stack Engineer) are different roles at same company |
| Apply button state | ⚠️ Unverified | Batch mode — freshness cannot be confirmed via Playwright |
| Company hiring signals | ✅ | $600M raised (2024), active Drug Design Engine release (Feb 2026), growth phase |
| Layoff/freeze news | ✅ Clear | No layoff signals found; company appears to be scaling |

**Context:** This is a real, active company with verifiable funding and product momentum. The posting is on Greenhouse with specific, domain-appropriate requirements. High confidence this is a live role.

**Background Check Risk: HIGH** — Isomorphic Labs is an autonomous subsidiary of Alphabet Inc. (Google's parent company). As part of the Alphabet family, it would inherit or mirror Google's HR and compliance infrastructure, including SOX-driven thorough background check standards applicable to large public US tech companies. CPIC/Checkr cross-border checks are standard in Alphabet's hiring pipeline. Not a safe application for Cole. Recommend skip.

---

## Score Global

| Dimensión | Score |
|-----------|-------|
| Match con CV | 1.0/5 (raw 2.0/5, HIGH BG −1.5) |
| Alineación North Star | 1.5/5 |
| Comp | 4.0/5 |
| Señales culturales | 2.5/5 |
| Red flags | −1.0 (location relocation + domain mismatch) |
| **Global** | **1.5/5** |

**Recomendación: NO APLICAR.** Triple blocker: domain mismatch (no Kubernetes/GPU/ML), location (London relocation), BG risk (Alphabet subsidiary). Even if Cole were interested in relocating, the technical gaps are too fundamental to overcome without months of dedicated upskilling.

---

## Keywords extraídas

GPU infrastructure, TPU infrastructure, Kubernetes, cluster deployment, GCP, Google Cloud Platform, ML workloads, AI/ML infrastructure, cluster monitoring, hardware acquisition, NVIDIA GPU, compute infrastructure, infrastructure reliability, workload scheduling, ML efficiency, drug discovery AI, AlphaFold, distributed computing, HPC, MLOps infrastructure
