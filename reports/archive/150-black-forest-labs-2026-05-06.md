# Evaluación: Black Forest Labs — Member of Technical Staff - Infrastructure Engineer

**Fecha:** 2026-05-06
**Arquetipo:** Senior Platform / Cloud Engineer (SECONDARY) — hard mismatch: ML/GPU Infrastructure
**Score:** 2.4/5
**Legitimacy:** High Confidence
**Background Check Risk:** MEDIUM — Series B ($3.25B valuation), SF hires likely use Checkr-grade US BG check; German entity GDPR-restricted depth
**URL:** https://job-boards.greenhouse.io/blackforestlabs/jobs/4925659008
**PDF:** skipped: score 2.4 < 4.0 gate
**Batch ID:** 150

---

## A) Resumen del Rol

| Campo | Detalle |
|-------|---------|
| **Arquetipo detectado** | ML/GPU Infrastructure Engineer — no mapeado en archetipos de Cole (más cercano: Senior Platform / Cloud Engineer, SECONDARY, pero mismatch severo de dominio) |
| **Domain** | AI/ML Infrastructure — mantenimiento y escalabilidad de clusters de entrenamiento de modelos de imagen (FLUX) |
| **Function** | Infrastructure / Platform Engineering |
| **Seniority** | MTS (Member of Technical Staff) — equivale a Senior/Staff IC |
| **Remote** | ❌ Híbrido presencial requerido — Freiburg (Alemania) O San Francisco (EEUU) — 2 días/semana o 1 semana completa cada 2 meses. Vancouver no está disponible. |
| **Team size** | No mencionado; empresa de ~100–200 personas post-Series B |
| **Comp listada** | $180,000–$300,000 USD base anual (explícita en JD) |
| **TL;DR** | Black Forest Labs (creadores de FLUX, $3.25B valuation, Series B dic-2025) busca infrastructure engineer para su plataforma de entrenamiento de GPU clusters. Stack: Python, Go, Kubernetes, Nvidia GPU operators, OTel, Prometheus, SLURM. Excelente comp y empresa de primer nivel — pero el rol requiere habilidades ML infra que Cole no tiene (Python/Go/K8s/GPU), y exige presencia física en Freiburg o SF. **Recomendación: no aplicar.** |

---

## B) Match con CV

### Requisitos mapeados

| Requisito JD | Match CV Cole | Evidencia | Tipo |
|--------------|---------------|-----------|------|
| Python | ❌ HARD BLOCKER | CV no menciona Python en ningún rol ni Skills | Hard blocker |
| Go | ❌ HARD BLOCKER | Go no está en el stack de Cole | Hard blocker |
| Bash | ⚠️ Implícito | CI/CD, Linux, Docker experience implica scripting básico | Parcial débil |
| Kubernetes | ❌ HARD BLOCKER | No mencionado en CV ni Skills | Hard blocker |
| Nvidia GPU drivers / operators | ❌ HARD BLOCKER | Ninguna experiencia con GPU o ML infra | Hard blocker |
| OTel, Prometheus | ⚠️ Parcial | "monitoring and observability" general en Enzuzo; no OTel/Prometheus específicos | Parcial débil |
| Large-scale training platforms | ❌ HARD BLOCKER | Ninguna experiencia en ML training infra | Hard blocker |
| GPU compute clusters | ❌ HARD BLOCKER | Dominio completamente ajeno | Hard blocker |
| Debug perf en distributed systems | ⚠️ Parcial | High-traffic platforms (TELL: tens of millions users), Cloudflare real-time pipelines | Parcial |
| Cloud infra (AWS, GCP) | ✅ MATCH | cv.md: "cloud services across AWS and GCP", AWS-to-GCP migration a Enzuzo | Fuerte |
| Infrastructure as Code | ⚠️ Implícito | Cloud work implica algún IaC pero no mencionado explícitamente | Gap |
| SLURM (nice-to-have) | ❌ | No en stack de Cole | Gap |
| Strong communication / cross-team | ✅ MATCH | "Worked closely with product and engineering teams" — presente en todos los roles | Fuerte |

**Cobertura de requisitos hard: 2/13 cumplidos (~15%). Esto es un mismatch severo.**

### Gaps y mitigación

| Gap | ¿Hard blocker? | Experiencia adyacente | ¿Proyecto portfolio? | Plan de mitigación |
|-----|---------------|----------------------|---------------------|--------------------|
| Python | SÍ — lenguaje primario del rol | TypeScript/Node.js son los equivalentes webdev; no hay bridge natural a ML infra | No | Aprender Python para ML infra tomaría 6-12 meses de práctica real; no mitigable para esta aplicación |
| Go | SÍ — lenguaje de infraestructura listado | TypeScript con Node.js es parcialmente comparable para servicios, pero Go se usa aquí para infra sistémica | No | No mitigable en el corto plazo |
| Kubernetes | SÍ | Docker + CI/CD experience da contexto, pero K8s en GPU clusters es especialización distinta | No | No mitigable sin experiencia práctica real |
| Nvidia GPU / ML training | SÍ — core del rol | AWS/GCP cloud no cubre GPU clusters ML | No | Imposible mitigar para esta posición — es el dominio principal |
| OTel / Prometheus | Moderado | General observability experience parcial — requeriría aprendizaje rápido | No | Mitigable en 1-4 semanas pero es el menor de los problemas |
| Presencia física Freiburg/SF | SÍ — location constraint | Cole está en Vancouver | No | Requeriría relocalización — no compatible con preferencias actuales |

**Veredicto B:** Match insuficiente para avanzar. Los hard blockers son fundamentales al rol (lenguajes, plataforma, dominio), no periféricos.

**Score Bloque B: 1.5/5**

---

## C) Nivel y Estrategia

### Nivel detectado vs nivel de Cole

| Dimensión | JD | Cole |
|-----------|-----|------|
| Título | MTS (Member of Technical Staff) | Senior Software Engineer |
| Nivel efectivo | Senior/Staff IC | Senior IC |
| Alineación | Similar en jerarquía | Compatible en nivel, no en dominio |

### Plan "vender senior sin mentir"

No aplica — el problema no es el nivel sino el dominio. Cole es Senior en TypeScript/React/Node/Cloud. Este rol requiere Senior en Python/Go/Kubernetes/GPU-ML. Son arquetipos completamente distintos.

Si Cole quisiera aplicar de todas formas (no recomendado):
- **Ángulo cloud:** "I've operated workloads across AWS and GCP in production, including a full AWS-to-GCP migration with monitoring and observability improvements." — Cubre el requisito de cloud infra, pero es insuficiente sin K8s/GPU.
- **Ángulo real-time pipelines:** "Cloudflare Analytics Engine pipelines processing high-volume consent events in real time." — Demuestra algo de distributed systems thinking, pero no es ML infra.
- **Ángulo honesto:** "I'm a strong TypeScript/Node/cloud engineer looking to expand into ML infrastructure." — Esto es un career pivot, no una aplicación lateral. Poco probable de pasar screening.

### Plan "si me downlevelan"

No relevante — el problema es de dominio, no de nivel.

---

## D) Comp y Demanda

### Datos de mercado

| Fuente | Rol | Rango | Notas |
|--------|-----|-------|-------|
| JD (explícito) | MTS Infra Engineer | $180K–$300K USD base | Transparencia total — muy buena señal |
| Levels.fyi | SW Engineer @ BFL | Datos limitados (empresa pequeña hasta Series B) | BFL activa en Levels pero pocos datapoints anónimos |
| Mercado AI Labs (comparable) | Senior Infra Engineer @ AI labs | $200K–$280K base + equity | OpenAI, Anthropic, Mistral niveles similares |
| Black Forest Labs funding | $300M Series B @ $3.25B (dic-2025) | Equity significativa para Stage | a16z + NVIDIA + Salesforce Ventures |

**Análisis:** El rango $180K–$300K es competitivo incluso para AI labs de primer nivel. Refleja que BFL está pagando para atraer ML infra talent escaso. Para el arquetipo correcto (Python/Go/K8s/GPU infra), este es un rango top quartile.

Para Cole (arquetipo TypeScript/Node), el comp objetivo de $170K–$240K USD remote haría que el range fuera técnicamente alcanzable — pero el rol en sí no es adecuado.

**Score comp: 5/5** — Rango explícito, top quartile para ML infra.

**Demanda en mercado:** GPU/ML infrastructure talent es extremadamente escaso en 2026. Rol de alta demanda, baja oferta. No aplicable a Cole.

---

## E) Plan de Personalización

**Dado el score 2.4/5, no se recomienda aplicar. Este bloque es académico.**

Si Cole quisiera hacer un pivot a ML infra en el futuro (6-18 meses), los cambios serían:

| # | Sección | Estado actual | Cambio propuesto | Por qué |
|---|---------|---------------|------------------|---------|
| 1 | Skills | TypeScript, JS, Node, React, SQL, AWS, GCP, Docker | Añadir Python, Kubernetes, Prometheus tras adquirir experiencia real | Los lenguajes son el primer filtro de ATS |
| 2 | Enzuzo bullets | "real-time data pipelines using Cloudflare Workers" | Reformular como "distributed event processing pipeline" con métricas de throughput/latency | Acerca el lenguaje a infra/SRE framing |
| 3 | Skills | Sin mención de observabilidad | Añadir OTel, Prometheus si se usa en algún proyecto | Stack de monitoreo específico |
| 4 | Summary | "TypeScript, React, and Node.js" | Pivot narrativo a "distributed systems, cloud infrastructure, production reliability" | Reframing de identidad |
| 5 | Projects | Sin proyectos de infra | Añadir proyecto de Kubernetes / distributed systems real | Demostrar el dominio, no solo el interés |

---

## F) Plan de Entrevistas

**No aplicable — score por debajo del gate. Se incluyen 2 historias parcialmente relevantes para referencia.**

| # | Requisito del JD | Historia STAR | S | T | A | R |
|---|-----------------|---------------|---|---|---|---|
| 1 | Cloud infrastructure operations | AWS-to-GCP migration a Enzuzo | Enzuzo con workloads en AWS necesitando migrar a GCP | Cole encargado de la migración completa con zero downtime objetivo | Planificó migración por fases, configuró monitoring en GCP, migró servicios uno a uno | Migración exitosa de workloads de producción; mejoras de observabilidad y reducción de costo |
| 2 | Performance in distributed systems / high-traffic | TELL: plataformas consumer de alto tráfico | Plataformas con decenas de millones de usuarios, latencia crítica | Mantener reliability y performance bajo carga | Optimizaciones de perf, SEO architecture, content delivery | Plataformas sirviendo millones de usuarios con alta disponibilidad |

**Red flags a preparar (si Cole aplicara):**
- "No tengo experiencia con Python/Go" — respuesta honesta: "My primary languages are TypeScript and Node.js. I've worked with cloud infrastructure at scale but on the web side, not ML training."
- "¿Qué experiencia tienes con GPU clusters?" — respuesta honesta: "None directly — this would be a new domain for me." (Esto terminará la entrevista.)

---

## G) Posting Legitimacy

### Señales analizadas (batch mode — posting freshness unverified)

| Señal | Estado | Detalle |
|-------|--------|---------|
| Calidad del JD | ✅ Alta | Requisitos técnicos específicos (OTel, Prometheus, Nvidia GPU operators, SLURM), comp explícita, cultura listada |
| Transparencia salarial | ✅ Alta | $180K–$300K USD base — range amplio pero presente |
| Boilerplate ratio | ✅ Bajo | JD orientado a requirements técnicos específicos, no genérico |
| Empresa verificable | ✅ Sí | Black Forest Labs es empresa real y prominente (FLUX, $3.25B valuation) |
| Señales de contratación | ✅ Activas | Series B dic-2025 con objetivo explícito de hiring; 5 otros roles BFL en scan-history del mismo día |
| Layoff / freeze news | ✅ Sin señales | Ningún indicio de freeze — al contrario, expansión activa |
| Reposting en scan-history | ⚠️ No encontrado este URL exacto | scan-history tiene otros 5 URLs de BFL; este posting podría ser nuevo o diferente de los scaneados |
| Posting freshness | ⚠️ Unverified (batch mode) | No se puede verificar con Playwright en batch mode |

**Assessment: High Confidence** — Empresa legítima, JD de calidad, comp explícita, señales de expansión activa. Alta probabilidad de que sea una apertura real.

**Context Notes:** Black Forest Labs levantó $300M Series B en dic-2025 liderado por Salesforce Ventures y a16z, con participación de NVIDIA y General Catalyst. Valoración $3.25B. Empresa en expansión activa de equipo para escalar FLUX. Los puestos de infraestructura son críticos para soportar training a escala.

---

**Background Check Risk:** MEDIUM — Black Forest Labs es Series B ($3.25B) con oficina en SF y HQ en Freiburg. Para contrataciones en SF, es probable que usen Checkr-grade US BG checks (criminal-only). Para contrataciones en Freiburg, GDPR restringe la profundidad del BG check. Sin señales de clearance de seguridad ni fintech/healthcare. Sin embargo, nivel de financiamiento y respaldo de investors institucionales (Salesforce Ventures) sugiere procesos de RRHH más formales que una seed startup.

---

## Score Global

| Dimensión | Score |
|-----------|-------|
| Match con CV | 1.5/5 |
| Alineación North Star | 1.5/5 |
| Comp | 5.0/5 |
| Señales culturales | 3.5/5 |
| Red flags | -0.5 (presencia física requerida en Freiburg o SF; Vancouver no es opción) |
| **Global** | **2.4/5** |

**Recomendación: NO APLICAR.** El mismatch no es de nivel sino de dominio. Python/Go/Kubernetes/Nvidia GPU son requisitos primarios del rol — Cole no tiene ninguno de estos en su stack. El comp es excelente y la empresa es de primera línea, pero este no es el rol correcto para el perfil actual. Si en el futuro Cole quiere pivotar a ML infra, este podría ser un objetivo a 12-18 meses con las inversiones de skill adecuadas.

---

## Keywords extraídas

`infrastructure engineer`, `Kubernetes`, `GPU clusters`, `Nvidia GPU operators`, `OTel`, `Prometheus`, `Python`, `Go`, `Bash`, `SLURM`, `distributed systems`, `training platform`, `Infrastructure as Code`, `cloud infrastructure`, `incident response`, `on-call`, `performance bottlenecks`, `telemetry`, `monitoring`, `large-scale compute`
