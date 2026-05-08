# Evaluación: Black Forest Labs — Member of Technical Staff, Large Scale Data Infrastructure

**Fecha:** 2026-05-06
**Arquetipo:** Senior Platform / Cloud Engineer (SECONDARY stretch — poor fit; see Block A)
**Score:** 1.4/5
**Legitimacy:** High Confidence
**Background Check Risk:** MEDIUM
**URL:** https://job-boards.greenhouse.io/blackforestlabs/jobs/5019171008
**PDF:** skipped: score 1.4 < 4.0 + archetype mismatch
**Batch ID:** 151

---

## A) Resumen del Rol

| Dimensión | Detalle |
|-----------|---------|
| **Arquetipo detectado** | ML Data Infrastructure Engineer (NO MATCH — not in Cole's archetype table) |
| **Closest archetype** | Senior Platform / Cloud Engineer (SECONDARY) — only because of cloud/storage overlap; stack is otherwise completely different |
| **Domain** | Generative AI / Visual AI (image + video generation — FLUX, Stable Diffusion) |
| **Function** | Large-scale ML training data infrastructure: petabyte-scale data loaders, distributed storage, multi-cloud object storage |
| **Seniority** | Senior IC (Member of Technical Staff title) |
| **Remote** | Hybrid on-site — minimum 2 days/week OR 1 full week biweekly in Freiburg (Germany) or San Francisco (USA). No remote-only option. |
| **Team size** | Not specified; research-focused AI lab structure |
| **TL;DR** | Build Python data infrastructure for training foundation models on petabyte-scale image/video datasets across GPU clusters. Requires deep Python, PyTorch, video codec, and distributed systems expertise. Not a TypeScript role. |

**Company context:** Black Forest Labs created Stable Diffusion and FLUX. Raised $300M Series B at $3.25B valuation (Dec 2025), backed by a16z, NVIDIA, Salesforce Ventures, General Catalyst. ~$96M ARR. HQ in Freiburg (Germany) + SF office.

---

## B) Match con CV

### Requirements mapping

| JD Requirement | Cole's CV | Match |
|----------------|-----------|-------|
| Python — primary language | Not in CV. Cole is TypeScript/JavaScript/Node.js | ❌ Hard blocker |
| PyTorch DataLoader internals | Not in CV. No ML framework experience | ❌ Hard blocker |
| Petabyte-scale data pipelines | CV: Cloudflare Analytics Engine real-time pipelines (Enzuzo). Different scale, different tech | ⚠️ Adjacent (orders of magnitude apart) |
| Object storage (S3, Azure Blob, GCS) | CV: AWS + GCP in production (Enzuzo). S3/GCS overlap plausible | ✅ Partial match |
| Parquet file format | Not in CV | ❌ Gap |
| Video processing (ffmpeg, PyAV, codec fundamentals) | Not in CV | ❌ Hard blocker |
| Distributed system debugging across GPU fleets | Not in CV. Cole has distributed systems experience (CI/CD, multi-cloud) but not GPU fleet management | ❌ Hard blocker |
| WebDataset experience (preferred) | Not in CV | ❌ Gap |
| Slurm/Kubernetes orchestration (preferred) | CV: Docker, CI/CD. Kubernetes not explicitly mentioned | ⚠️ Partial (Docker yes, K8s/Slurm no) |
| Multi-cloud object storage abstraction layers | CV: AWS + GCP, multi-cloud comfort (Enzuzo) | ✅ Partial match |
| Large-scale data migrations between storage systems | CV: AWS-to-GCP migration at Enzuzo | ✅ Relevant match |
| Performance bottleneck identification in distributed loading | CV: CI/CD speedup, performance optimizations (TELL). Not at GPU training scale | ⚠️ Adjacent |
| Hybrid on-site: Freiburg or SF | Cole is in Vancouver, BC. Would require relocation | ❌ Location blocker |

### Gaps analysis

| Gap | Blocker? | Adjacent experience? | Mitigation |
|-----|----------|----------------------|------------|
| Python (entire stack) | **Hard blocker** — the role is 100% Python ecosystem | Cole codes TS/JS; no Python in CV | No mitigation possible without fundamentally misrepresenting the profile |
| PyTorch / ML training infra | **Hard blocker** — core of the role | None | Same |
| Video codec knowledge (ffmpeg, PyAV) | **Hard blocker** — primary requirement | None | None |
| Petabyte-scale data pipelines | Hard gap — Cole has data pipeline experience but at event analytics scale, not ML training scale | Cloudflare Analytics Engine pipelines (ev-scale) | Could frame as "data pipeline experience" but the gap in scale and tech is fundamental |
| Location (Freiburg or SF) | **Hard blocker** — hybrid mandatory | Cole is Vancouver-based | Relocation would be required |

**Bottom line:** This role requires a Python/ML-native engineer with deep ML data infrastructure experience. Cole is a TypeScript/Node.js engineer. The overlap is limited to multi-cloud storage experience. This is not a profile match — not a "gap to bridge" but a fundamentally different specialization.

### Match score: 1.5/5

---

## C) Nivel y Estrategia

**Nivel detectado en JD:** Senior IC ("Member of Technical Staff" — standard AI lab IC title equivalent to Senior/Staff SWE)

**Cole's natural level:** Senior IC (exact match on seniority level, complete mismatch on specialization)

**Plan "vender senior sin mentir":** Not applicable — the stack mismatch is fundamental. Cole cannot credibly position for this role without Python/ML experience. The multi-cloud and data pipeline experience is a talking point at best, not a qualification.

**Plan "si me downlevelan":** Not applicable.

**Recommendation:** Do not apply. The role is not in Cole's skillset regardless of seniority framing.

---

## D) Comp y Demanda

| Dimensión | Datos | Fuente |
|-----------|-------|--------|
| JD salary range | $180,000–$300,000 USD + Equity (SF) | JD (Greenhouse posting) |
| Black Forest Labs valuation | $3.25B (Series B, Dec 2025) | TechCrunch / Tech.eu |
| Black Forest Labs ARR | ~$96M (Aug 2025 estimate) | Sacra |
| Total funding | $450M+ | Multiple sources |
| Levels.fyi — BFL data | Limited data available; company recently scaled up post-Series B | Levels.fyi search |
| Market comparable — ML infra engineer at funded AI lab | $200K–$350K USD total comp at Series B+ | General market |
| Comp score (for Cole's profile) | N/A — role not a fit | — |

**Comp score (if the role fit): 4.5/5** — Range is top quartile for Cole's targets. However, this score is irrelevant given the fundamental mismatch.

**Demand trend:** ML data infrastructure engineers are in high demand globally. Black Forest Labs is actively hiring post-Series B. This specific niche (video + image dataset pipelines at petabyte scale for generative AI) is extremely competitive and rare.

Sources:
- [Black Forest Labs raises $300M at $3.25B valuation — TechCrunch](https://techcrunch.com/2025/12/01/black-forest-labs-raises-300m-at-3-25b-valuation/)
- [Black Forest Labs Salaries — Levels.fyi](https://www.levels.fyi/companies/black-forest-labs/salaries)

---

## E) Plan de Personalización

**Not generated — role is not a fit. Score 1.4/5 is below the 4.0 application threshold.**

If Cole wanted to explore this space in the future, he would need to:
1. Build Python proficiency (6–12 month investment)
2. Develop hands-on experience with PyTorch DataLoader and distributed training infrastructure
3. Work on video processing pipelines (ffmpeg, codec fundamentals)
4. Gain petabyte-scale data systems experience

This is a career pivot, not a skill gap.

---

## F) Plan de Entrevistas

**Not generated — role is not a fit.**

---

## G) Posting Legitimacy

**Assessment: High Confidence**

| Signal | Status | Notes |
|--------|--------|-------|
| JD specificity | Strong | Detailed technical requirements, specific tech stack (PyTorch DataLoader internals, PyAV, WebDataset), realistic scope |
| Salary transparency | Yes | $180K–$300K explicitly stated |
| Company funding status | Active | $300M Series B closed Dec 2025, $3.25B valuation — actively scaling |
| Boilerplate ratio | Low | JD is highly specific to this role's function |
| Apply button / freshness | Unverified (batch mode) | Could not verify via Playwright; posting is on Greenhouse |
| Prior appearances in scan-history | None found | First Black Forest Labs infrastructure posting in this batch |
| Company hiring signals | Strong | Multiple ML-infrastructure roles open; post-Series B scaling |

**Context:** Black Forest Labs is one of the most credible generative AI companies (created FLUX and Stable Diffusion). This is a real, active role. The JD is specific and written by engineers who know exactly what they need.

**Background Check Risk: MEDIUM** — US Series B company at $3.25B valuation with institutional VC backing (a16z, NVIDIA, Salesforce Ventures). Likely runs standard Checkr-grade BG checks for US-based hires. German office may apply GDPR-restricted checks. Overall: MEDIUM risk; not fintech, not healthcare, not government. Non-violent criminal record may not be disqualifying but is not guaranteed to clear.

---

## Score Global

| Dimensión | Score |
|-----------|-------|
| Match con CV | 1.5/5 |
| Alineación North Star | 1.0/5 |
| Comp | 4.5/5 |
| Señales culturales | 2.5/5 |
| Red flags | -1.0 (location: Freiburg or SF hybrid, no remote; stack: Python/ML vs TS) |
| **Global** | **1.4/5** |

**Recomendación: NO APLICAR.** Fundamental archetype mismatch — Python/ML data infrastructure vs TypeScript/Node.js web engineering. Location blocker (hybrid Freiburg or SF). Score 1.4/5.

---

## Keywords extraídas

`data infrastructure`, `petabyte-scale datasets`, `PyTorch DataLoader`, `distributed data loading`, `object storage`, `S3`, `GCS`, `Azure Blob Storage`, `Parquet`, `ffmpeg`, `video codecs`, `PyAV`, `WebDataset`, `Slurm`, `Kubernetes`, `multi-cloud storage`, `GPU clusters`, `generative AI`, `image generation`, `video processing`, `distributed systems`
