# Modo: cover-letter — Tailored Cover Letter

Generate a single-page cover letter for a specific role, anchored on proof points from `__CV__` and tone calibrated by `config/profile.yml` and `__PROFILE_MD__`.

## Inputs

- URL or pasted JD (the job offer)
- `__CV__` (canonical CV)
- `config/profile.yml` (candidate name, contact, location, comp targets, narrative)
- `__PROFILE_MD__` (archetype mapping, tone, language)
- `__ARTICLE_DIGEST__` (proof points, optional)
- The matching report file in `__REPORTS__/{n}-{slug}-{date}.md` (if it exists — use Bloque B match table for the strongest proof points)

## Output

Write the cover letter to: `__OUTPUT__/{n}-{slug}-{date}-cover.md`

Where `{n}-{slug}-{date}` matches the existing report/CV pair so all three live next to each other in `__OUTPUT__/` and `__REPORTS__/`.

## Structure

1. **Header** (5 lines max)
   - Candidate name + email + city
   - Date (today)
   - "Hiring team — {Company}" or specific hiring manager if known

2. **Opening (1 short paragraph, 2–3 sentences)**
   - Why THIS role at THIS company. Reference one specific thing from the JD or company materials (a product, a public engineering challenge, a team focus).
   - One concrete proof point that maps directly to the role's headline requirement.
   - NO "I'm excited to apply" — show the excitement through specificity.

3. **Body (1–2 paragraphs, 3–5 sentences each)**
   - Two of the strongest proof points from `__CV__` mapped to the JD's most important requirements. Use numbers when they exist in `__CV__` — never invent.
   - One proof point should address the riskiest gap with adjacent experience or a portfolio project. Honest framing, no hedge words.
   - Connect each proof to a problem the company is likely solving (read between the lines of the JD).

4. **Close (1 short paragraph, 2–3 sentences)**
   - State availability (immediate / N weeks notice — read from `config/profile.yml` if defined)
   - Mention location/work-mode alignment if non-trivial (remote ✓, time zone overlap, willing to relocate, etc.)
   - One sentence that signals self-direction without being pushy ("Happy to walk through {portfolio piece} on a call.")

## Voice rules

- Reuse the user's tone from `__CV__`/`__ARTICLE_DIGEST__`. If the CV says "I built X" use first-person and active voice. Do NOT inject corporate-speak.
- Maximum 350 words including header. Single-page is the constraint.
- NO bullet points in the body — this is prose.
- NO "I am writing to apply for..." or "Please find attached..."
- NO superlatives the CV doesn't back up ("expert", "world-class", "passionate").
- Match language: if the JD is in Spanish/German/French/Japanese, write the letter in that language using the language-specific archetypes from `modes/{lang}/_shared.md`.
- One short quote from the JD is allowed — wrap in quotes and keep under 12 words.

## Validation before writing

1. Verify the report exists at `__REPORTS__/{n}-{slug}-{date}.md`. If not, run `oferta` first to generate it.
2. Verify CV-PDF exists at `__OUTPUT__/{n}-{slug}-{date}.pdf`. If not, suggest running `pdf` first — but cover letter still proceeds.
3. Check that the strongest proof point in the cover letter exists verbatim in `__CV__`. Never invent metrics.

## After writing

- Print the path of the file written.
- Print a 2-line summary of the angle: "Anchored on {proof}; addresses {gap} via {framing}."
- Do NOT print the full cover letter to stdout — it's in the file.
