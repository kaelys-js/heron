/**
 * Generate the user's "general CV" PDF — a non-tailored, ATS-friendly PDF
 * built straight from cv.md, deliberately consistent with their LinkedIn
 * profile.
 *
 * Why a separate concept from the per-job tailored CVs:
 *   LinkedIn Easy Apply shows recruiters the user's LinkedIn profile and the
 *   uploaded resume side by side. Uploading a CV that reframes the user's
 *   experience differently from their LinkedIn profile is a known recruiter
 *   red flag. So the rule is:
 *     - LinkedIn Easy Apply → upload this general CV (matches profile)
 *     - Greenhouse / Ashby / Lever / Workday / etc. → tailored per-job CV
 *
 * Pipeline:
 *   1. Read cv.md
 *   2. Read templates/cv-template.html
 *   3. Ask Claude to populate the template's placeholders from cv.md.
 *      No JD-specific tailoring — the prompt is explicit about this.
 *   4. Write filled HTML to a temp file in output/.tmp/
 *   5. Spawn `node generate-pdf.mjs <tmp.html> output/cv-general.pdf` to
 *      render the actual PDF (handles fonts, margins, ATS unicode cleanup)
 *   6. Return the path + sizing info
 *
 * Cost: 1 Anthropic call (~$0.30–$0.60) + ~5s Playwright render. Done once
 * per cv.md edit, not per application. Status endpoint surfaces whether the
 * existing PDF is stale relative to cv.md so the UI can prompt regeneration.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, readSafe } from './files';
import { complete } from './ai';
import { logEvent, reportServerError } from './events';
import { profilePath, ensureProfileDirs } from './profile-paths';
import { getActiveProfileId } from './profiles';
import { userContextEnv } from './user-context';

/** System-layer template — shared, never per-profile. */
const CV_TEMPLATE_HTML = path.join(ROOT, 'templates', 'cv-template.html');

/** Picks a template variant based on either an explicit override or the
 *  profile's `cv_template` field. Falls back to the classic ATS-safe
 *  template if the requested variant doesn't exist on disk. Exported for
 *  tests; production callers use `generateGeneralCv` etc. */
export function resolveTemplate(explicitName?: string, profileId?: string): string {
  const named =
    explicitName ||
    (() => {
      try {
        // Best-effort: read profile.yml's cv_template field. We avoid pulling
        // a YAML parser into this server file — only need one key. Routes
        // through profilePath() so multi-user installs read the ACTIVE
        // user's profile.yml at data/users/{uid}/profiles/{id}/profile.yml
        // rather than the legacy single-user data/profiles/{id}/profile.yml.
        if (!profileId) return undefined;
        const pPath = profilePath(profileId, 'profile-yml');
        if (!fs.existsSync(pPath)) return undefined;
        const text = fs.readFileSync(pPath, 'utf8');
        const m = text.match(/^\s*cv_template:\s*"?([a-z0-9-]+)"?/im);
        return m ? m[1] : undefined;
      } catch (e) {
        // profile.yml unreadable — silently fall back to the classic template.
        // Non-fatal but surface so users can debug missing customization.
        logEvent('cv-pdf', 'Could not read profile.yml for cv_template field', {
          level: 'warn',
          category: 'user',
          profileId,
          message: e instanceof Error ? e.message : String(e),
        });
        return undefined;
      }
    })();
  if (!named || named === 'classic' || named === 'default') return CV_TEMPLATE_HTML;
  const variant = path.join(ROOT, 'templates', 'cv-template-' + named + '.html');
  if (fs.existsSync(variant)) return variant;
  return CV_TEMPLATE_HTML;
}

function resolveId(profileId?: string): string {
  return profileId ?? getActiveProfileId();
}

function paths(profileId: string) {
  const outputDir = profilePath(profileId, 'output-dir');
  return {
    cvMd: profilePath(profileId, 'cv-md'),
    outputDir,
    generalCvPdf: path.join(outputDir, 'cv-general.pdf'),
    tmpDir: path.join(outputDir, '.tmp'),
    generalCvHtml: path.join(outputDir, '.tmp', 'cv-general.html'),
  };
}

export type GeneralCvStatus = {
  exists: boolean;
  path: string;
  bytes?: number;
  generatedAt?: number;
  /** Mtime of cv.md when the PDF was last produced — null if PDF doesn't exist. */
  cvLastModified?: number;
  /** True when cv.md is newer than the PDF — caller should prompt regenerate. */
  outdated: boolean;
  /** True when cv.md is missing — can't generate without it. */
  missingSource: boolean;
};

export function generalCvStatus(profileId?: string): GeneralCvStatus {
  const id = resolveId(profileId);
  const { cvMd, generalCvPdf } = paths(id);
  const missingSource = !fs.existsSync(cvMd);
  if (!fs.existsSync(generalCvPdf)) {
    return {
      exists: false,
      path: path.relative(ROOT, generalCvPdf),
      outdated: false,
      missingSource,
    };
  }
  const pdfStat = fs.statSync(generalCvPdf);
  const cvStat = missingSource ? null : fs.statSync(cvMd);
  return {
    exists: true,
    path: path.relative(ROOT, generalCvPdf),
    bytes: pdfStat.size,
    generatedAt: pdfStat.mtimeMs,
    cvLastModified: cvStat?.mtimeMs,
    // Outdated when cv.md was edited after the PDF was generated. We compare
    // by 1s buckets so a same-second double-write doesn't flag as outdated.
    outdated: cvStat
      ? Math.floor(cvStat.mtimeMs / 1000) > Math.floor(pdfStat.mtimeMs / 1000)
      : false,
    missingSource,
  };
}

const SYSTEM_PROMPT =
  'You are populating an HTML CV template from a markdown CV.\n\n' +
  'INPUT (in user message): the markdown CV (cv.md), then a separator line "===HTML TEMPLATE===", then the HTML template with {{PLACEHOLDER}} tokens.\n\n' +
  'TASK: Output the FULL HTML with every {{PLACEHOLDER}} replaced. Return ONLY the HTML — no markdown fences, no commentary, no preamble.\n\n' +
  'PLACEHOLDER REFERENCE:\n' +
  '  Identity:\n' +
  '    {{NAME}}              — full name (required)\n' +
  '    {{EMAIL}}             — email\n' +
  '    {{PHONE}}             — phone (omit cleanly if not in CV)\n' +
  '    {{LOCATION}}          — "City, Country"\n' +
  '    {{LINKEDIN_URL}}      — full https URL\n' +
  '    {{LINKEDIN_DISPLAY}}  — human label like "linkedin.com/in/jane"\n' +
  '    {{PORTFOLIO_URL}}     — full https URL\n' +
  '    {{PORTFOLIO_DISPLAY}} — human label like "github.com/jane"\n' +
  '  Document chrome:\n' +
  "    {{LANG}}              — IETF tag (en, de, fr, ja, etc.) — derive from CV's primary language\n" +
  '    {{PAGE_WIDTH}}        — "8.5in" for letter sizes (use this default unless CV is clearly EU/A4 oriented; then use "210mm")\n' +
  '  Sections (each pair is heading label + body HTML):\n' +
  '    {{SECTION_SUMMARY}}      → "Summary" / localized\n' +
  '    {{SUMMARY_TEXT}}         → 3-5 sentence summary as <p>...</p>\n' +
  '    {{SECTION_EXPERIENCE}}   → "Experience"\n' +
  '    {{EXPERIENCE}}           → series of role blocks (see structure rule below)\n' +
  '    {{SECTION_PROJECTS}}     → "Projects"\n' +
  '    {{PROJECTS}}             → series of project blocks\n' +
  '    {{SECTION_EDUCATION}}    → "Education"\n' +
  '    {{EDUCATION}}            → list of degree entries\n' +
  '    {{SECTION_SKILLS}}       → "Skills"\n' +
  '    {{SKILLS}}               → grouped skills HTML\n' +
  '    {{SECTION_COMPETENCIES}} → "Core Competencies" or omit empty section entirely\n' +
  '    {{COMPETENCIES}}         → competencies HTML or empty string\n' +
  '    {{SECTION_CERTIFICATIONS}} → "Certifications" or omit if none in CV\n' +
  '    {{CERTIFICATIONS}}       → cert list or empty string\n\n' +
  'STRUCTURE RULES:\n' +
  '- For {{EXPERIENCE}}: each role uses the same HTML pattern as the surrounding template. If the template shows a specific role markup, mirror it exactly. Default pattern when in doubt:\n' +
  '  <div class="experience-item">\n' +
  '    <div class="exp-header"><span class="exp-role">{Role}</span><span class="exp-company">{Company}</span><span class="exp-dates">{Start} – {End or Present}</span></div>\n' +
  '    <ul><li>{bullet}</li>...</ul>\n' +
  '  </div>\n' +
  '- For {{PROJECTS}}: <div class="project-item"><h3>{Name}</h3><ul><li>{bullet}</li>...</ul></div>\n' +
  '- For {{EDUCATION}}: <ul><li><strong>{Degree}</strong>, {Institution} ({year})</li>...</ul>\n' +
  '- For {{SKILLS}}: <ul><li><strong>{Category}:</strong> a, b, c</li>...</ul>\n' +
  '- IF a section has no content in cv.md (e.g. no Projects), set BOTH the heading AND body placeholder to empty string ("") so the rendered HTML has no orphan section title.\n\n' +
  'CRITICAL CONTENT RULES:\n' +
  "- This is a GENERAL CV — do NOT tailor it to any specific job, do NOT reorder bullets to emphasize particular skills, do NOT inject keywords that aren't already in cv.md. Match the cv.md content as faithfully as possible.\n" +
  '- Preserve every role and every metric verbatim.\n' +
  "- HTML-escape any < > & in the user's text.\n" +
  '- Do not invent dates, employers, metrics, or sections not present in cv.md.\n' +
  "- Keep the template's CSS, fonts, and class names exactly as given — only fill placeholders.";

export type GenerateResult = GeneralCvStatus & {
  pages?: number;
  /** 0-100 ATS-compatibility score from ats-check.mjs (run on the PDF). */
  atsScore?: number;
  /** 0-100 resume-quality score from resume-quality.mjs (run on cv.md). */
  qualityScore?: number;
};

/**
 * Run the full pipeline: cv.md + template → Claude → HTML → spawn
 * generate-pdf.mjs → cv-general.pdf. Throws on any step failure with a
 * descriptive message; the caller logs + surfaces it.
 */
export async function generateGeneralCv(profileId?: string): Promise<GenerateResult> {
  const id = resolveId(profileId);
  ensureProfileDirs(id);
  const { cvMd, outputDir, generalCvPdf, tmpDir, generalCvHtml } = paths(id);

  if (!fs.existsSync(cvMd)) {
    throw new Error('cv.md is missing — paste your CV first via Profile → CV manager.');
  }
  const templatePath = resolveTemplate(undefined, id);
  if (!fs.existsSync(templatePath)) {
    throw new Error('templates/cv-template.html is missing — your install may be incomplete.');
  }

  const cvText = readSafe(cvMd);
  if (cvText.trim().length < 100) {
    throw new Error('cv.md looks too short to be a CV (under 100 chars). Update it first.');
  }
  const template = readSafe(templatePath);
  if (!template) throw new Error('cv-template.html is empty — re-clone the repo to restore it.');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  logEvent('cv-pdf', 'Generating general CV PDF', {
    category: 'user',
    message:
      cvText.length.toLocaleString() + ' chars in cv.md · model=claude-opus-4-7 · profile=' + id,
  });

  const userMessage = cvText + '\n\n===HTML TEMPLATE===\n\n' + template;
  const html = await complete(SYSTEM_PROMPT, userMessage, { maxTokens: 32000, thinking: false });

  const cleanHtml = html
    .trim()
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  if (!cleanHtml.startsWith('<!DOCTYPE') && !cleanHtml.startsWith('<html')) {
    throw new Error(
      'Claude did not return a valid HTML document (no <!DOCTYPE>). Try regenerating.',
    );
  }
  const leftover = cleanHtml.match(/\{\{[A-Z_]+\}\}/g);
  if (leftover && leftover.length > 0) {
    throw new Error(
      'Claude left ' +
        leftover.length +
        ' placeholders unfilled (' +
        leftover.slice(0, 4).join(', ') +
        '…). Try regenerating.',
    );
  }

  fs.writeFileSync(generalCvHtml, cleanHtml);

  const result = await spawnPdfRender(generalCvHtml, generalCvPdf);

  logEvent('cv-pdf', 'General CV PDF generated', {
    level: 'success',
    category: 'user',
    message:
      path.relative(ROOT, generalCvPdf) +
      ' · ' +
      (result.bytes / 1024).toFixed(1) +
      ' KB' +
      (result.pages ? ' · ' + result.pages + 'p' : ''),
  });

  // Run the strict ATS + resume-quality checks on the freshly-rendered
  // PDF + the source cv.md. Both are non-blocking — they surface scores
  // via the activity feed so the user can decide whether to regenerate.
  // The dashboard renders the fail-summary as actionable cards.
  const { checkAts, checkResumeQuality } = await import('./quality-checks');
  // .catch(() => null) is safe here because checkAts / checkResumeQuality
  // already call reportServerError on their internal failures — the null
  // just means "no score badge for this run" rather than a missed event.
  const [atsResult, resumeResult] = await Promise.all([
    checkAts(generalCvPdf).catch((e) => {
      reportServerError('cv-pdf', 'checkAts threw before quality-checks could handle it', e, {
        category: 'user',
        profileId: id,
      });
      return null;
    }),
    checkResumeQuality(cvMd).catch((e) => {
      reportServerError(
        'cv-pdf',
        'checkResumeQuality threw before quality-checks could handle it',
        e,
        { category: 'user', profileId: id },
      );
      return null;
    }),
  ]);
  if (atsResult) {
    logEvent('cv-pdf', `ATS score ${atsResult.score.toFixed(1)}%`, {
      level: atsResult.score === 100 ? 'success' : atsResult.score >= 80 ? 'info' : 'warn',
      category: 'user',
      message:
        atsResult.failSummary || `${atsResult.passCount}/${atsResult.total} ATS checks passed`,
    });
  }
  if (resumeResult) {
    logEvent('cv-pdf', `Resume-quality score ${resumeResult.score.toFixed(1)}%`, {
      level: resumeResult.score === 100 ? 'success' : resumeResult.score >= 85 ? 'info' : 'warn',
      category: 'user',
      message:
        resumeResult.failSummary ||
        `${resumeResult.passCount}/${resumeResult.total} quality checks passed`,
    });
  }

  return {
    ...generalCvStatus(id),
    pages: result.pages,
    atsScore: atsResult?.score,
    qualityScore: resumeResult?.score,
  };
}

function spawnPdfRender(
  htmlPath: string,
  pdfPath: string,
): Promise<{ bytes: number; pages?: number }> {
  return new Promise((resolve, reject) => {
    const p = spawn('node', ['scripts/cv/generate-pdf.mjs', htmlPath, pdfPath, '--format=letter'], {
      cwd: ROOT,
      env: userContextEnv(),
    });
    let stdoutBuf = '';
    let stderrBuf = '';
    p.stdout?.on('data', (c: Buffer) => {
      stdoutBuf += c.toString();
    });
    p.stderr?.on('data', (c: Buffer) => {
      stderrBuf += c.toString();
    });

    const timer = setTimeout(() => {
      try {
        p.kill('SIGTERM');
      } catch {
        /* process already exited — kill races with the close event */
      }
      reject(new Error('PDF render timed out after 90s'));
    }, 90_000);

    p.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const tail = (stderrBuf || stdoutBuf || '').slice(-400).trim();
        reject(new Error('generate-pdf.mjs exited ' + code + (tail ? ': ' + tail : '')));
        return;
      }
      try {
        const stat = fs.statSync(pdfPath);
        // generate-pdf.mjs prints "📊 Pages: N" on success — parse if present.
        const pageMatch = stdoutBuf.match(/Pages:\s*(\d+)/);
        resolve({ bytes: stat.size, pages: pageMatch ? Number(pageMatch[1]) : undefined });
      } catch (e) {
        reject(new Error('PDF render reported success but file missing at ' + pdfPath));
      }
    });
  });
}

/** Path the apply script should be told to use for the given profile. */
export function generalCvPath(profileId?: string): string {
  return paths(resolveId(profileId)).generalCvPdf;
}

/**
 * Lint a generated PDF for ATS compatibility — non-blocking, just emits
 * an activity event with the score so the dashboard can surface it.
 *
 * Returns { score, warnings, failures } so callers can decide whether
 * to retry the render with different content. Score < 75% → fail soft +
 * surface an Issue (the user should regenerate after fixing the JD
 * keyword injection / section names).
 */
export function spawnAtsCheck(
  pdfPath: string,
): Promise<{ score: number; warnings: number; failures: number; raw: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn('node', ['scripts/cv/ats-check.mjs', pdfPath, '--json'], {
      cwd: ROOT,
      env: userContextEnv(),
    });
    let stdoutBuf = '';
    let stderrBuf = '';
    p.stdout?.on('data', (c: Buffer) => {
      stdoutBuf += c.toString();
    });
    p.stderr?.on('data', (c: Buffer) => {
      stderrBuf += c.toString();
    });
    p.on('error', (err) => reject(err));
    p.on('close', () => {
      // ats-check exits non-zero when score is low — but we still want
      // to parse its JSON output (it always emits it on stdout first).
      try {
        const json = JSON.parse(stdoutBuf);
        resolve({
          score: json.score ?? 0,
          warnings: json.warnCount ?? 0,
          failures: json.failCount ?? 0,
          raw: stdoutBuf,
        });
      } catch {
        reject(
          new Error(
            'ats-check.mjs produced non-JSON output: ' +
              (stderrBuf.slice(-200) || stdoutBuf.slice(-200)),
          ),
        );
      }
    });
  });
}
