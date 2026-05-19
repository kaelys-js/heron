# Templates

System-layer template + scaffold files used by Heron scripts. These
files are placeholder-driven (`{{NAME}}` / `{{EXPERIENCE}}` style)
or copy-to-activate scaffolds for the user-layer. Auto-updated by
`pnpm update`; put your customizations in the user-layer files
instead (see [`../docs/DATA_CONTRACT.md`](../docs/DATA_CONTRACT.md)).

## Files

| File | Used By | Purpose |
|------|---------|---------|
| `cv-template.html` | `ui/src/lib/server/cv-pdf.ts`, `compile-latex.job.ts` | HTML/CSS template for ATS-optimized CV PDFs (Playwright-rendered) |
| `cv-template.tex` | `compile-latex.job.ts`, `scripts/cv/generate-latex.mjs` | LaTeX/Overleaf template for CV PDFs (pdflatex / Overleaf) |
| `portals.example.yml` | Onboarding, `ui/src/lib/server/portals.ts` | Example portal-scanner configuration (copy to `portals.yml` to activate) |
| `profile.example.yml` | Onboarding, `profile.ts`, `autopilot-circuit-breaker.ts`, `cv-sync-check.mjs`, `doctor.mjs` | Example user profile (copy to `config/profile.yml` to activate) |
| `fonts/` | `cv-template.html` (`@font-face`) | Self-hosted woff2 for the CV template (Inter latin + latin-ext) |

**Note**: `batch-prompt.md` (the AI worker prompt) moved to
[`../modes/batch-prompt.md`](../modes/batch-prompt.md) — it's a
system-prompt sibling to the rest of the modes, not a data template.
The canonical-state schema (formerly `templates/states.yml`) moved to
[`../data/states.yml`](../data/states.yml) — it's runtime data, not a
template.

### cv-template.html

The HTML template rendered by Playwright into PDF. Uses placeholder
tokens (`{{NAME}}`, `{{SUMMARY_TEXT}}`, `{{EXPERIENCE}}`, etc.) that
the PDF pipeline fills at generation time.

**Design:** Inter throughout (display + body) — ATS-safe, matches the
Heron brand's `brand.json::fonts.body` family. Single-column layout.
Self-hosted woff2 in `templates/fonts/` so the renderer works offline
and produces identical bytes on every machine.

**Customization:** Edit this file to change colors, spacing, or section
order. The placeholder tokens are documented in
[`../modes/batch-prompt.md`](../modes/batch-prompt.md) under "Template
placeholders" (the worker fills them in for batch CV runs).

### cv-template.tex

LaTeX template for Overleaf-compatible CV generation. Based on the [sb2nov/resume](https://github.com/sb2nov/resume) format. Uses placeholder tokens (`{{NAME}}`, `{{EXPERIENCE}}`, `{{PROJECTS}}`, etc.) that the LaTeX pipeline fills at generation time.

**Design:** Single-column ATS-safe layout using standard CTAN packages (`fontawesome5`, `enumitem`, `hyperref`, `titlesec`). No custom fonts or external dependencies — uploads directly to Overleaf.

**Usage:**
```bash
# Validate and compile .tex → .pdf (requires pdflatex on PATH)
node generate-latex.mjs output/cv-name-company-date.tex

# Or specify a custom output path
node generate-latex.mjs output/cv-name-company-date.tex output/custom-name.pdf
```

**Prerequisites:** `pdflatex` via [MiKTeX](https://miktex.org/) (Windows) or TeX Live (Linux/macOS). First compilation may auto-install missing LaTeX packages. Alternatively, upload the `.tex` file directly to [Overleaf](https://www.overleaf.com) — no local install needed.

**Customization:** Edit this file to change margins, section order, or formatting commands. The placeholder tokens are documented in `modes/latex.md` under "Template Placeholders."

### portals.example.yml

Pre-configured portal scanner with 45+ tracked companies and search queries. Contains title filters, company career page URLs, Greenhouse API endpoints, and WebSearch queries.

**To activate:** Copy to project root as `portals.yml` and customize `title_filter.positive` keywords for your target roles. Add or remove companies as needed.

