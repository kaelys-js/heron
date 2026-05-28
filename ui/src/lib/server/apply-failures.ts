/** Single entry point for autonomous-apply failures. reportApplyFailure()
 *  emits a deduped Issue (`apply:{jobId}`), flips status to
 *  ManualApplyNeeded, appends a row note, logs a warn event.
 *  Modes (each renders a distinct Inbox fix CTA): stub (unknown portal),
 *  captcha, anti-bot, unknown-field, upload-failed, validation, error. */

import { reportIssue } from './issues';
import { logEvent } from './events';
import { markStatus } from './applications';
import { getActiveProfileId } from './profiles';

export type ApplyFailureMode =
  | 'stub'
  | 'captcha'
  | 'anti-bot'
  | 'unknown-field'
  | 'upload-failed'
  | 'validation'
  | 'error';

const SUMMARY_PREFIX: Record<ApplyFailureMode, string> = {
  stub: 'Apply manually',
  captcha: 'CAPTCHA blocked apply',
  'anti-bot': 'Bot-protection blocked apply',
  'unknown-field': 'Unknown form field — needs answer',
  'upload-failed': 'Resume upload failed',
  validation: 'Submission rejected',
  error: 'Apply script crashed',
};

const FIX_LABELS: Record<ApplyFailureMode, string> = {
  stub: 'Open posting',
  captcha: 'Resume in browser',
  'anti-bot': 'Re-login to portal',
  'unknown-field': 'Open posting',
  'upload-failed': 'Regenerate CV',
  validation: 'Open posting',
  error: 'Open posting',
};

export type ReportApplyFailureInput = {
  jobId: string;
  url?: string;
  portal: string;
  profileId?: string;
  /** Job's company name -- used in the Issue summary. Optional but helps UX. */
  company?: string;
  /** Job's role title -- same. */
  role?: string;
  mode: ApplyFailureMode;
  /** Free-form detail surfaced in the Issue body and the applications.md note.
   *  E.g. "reCAPTCHA Enterprise v3 score below threshold". */
  detail?: string;
  /** Optional screenshot path (relative to ROOT) saved by the Python adapter.
   *  Surfaces in the Issue body as evidence the user can see when finishing
   *  manually. */
  screenshotPath?: string;
};

/**
 * Single entry-point. Idempotent (deduped by `apply:{jobId}`).
 *
 *   - Issue created/refreshed
 *   - applications.md status → `ManualApplyNeeded`
 *   - applications.md notes → `Auto-apply: {mode} -- {detail}`
 *   - activity feed event at warn level
 */
export function reportApplyFailure(input: ReportApplyFailureInput): void {
  const { jobId, url, portal, mode, detail, screenshotPath, company, role } = input;
  const profileId = input.profileId ?? getActiveProfileId();

  // 1. Issue with stable dedupeKey so retries don't multiply rows in Inbox.
  const summary = `${SUMMARY_PREFIX[mode]} · ${company || '?'}${
    role ? ' — ' + role : ''
  }${portal !== 'unknown' ? ' (' + portal + ')' : ''}`;
  const detailBody = `${
    (detail ? detail + '\n\n' : '') +
    (url ? 'Posting: ' + url + '\n' : '') +
    (screenshotPath ? 'Screenshot: ' + screenshotPath + '\n' : '')
  }Job ID: ${jobId}`;

  reportIssue({
    severity: mode === 'error' ? 'error' : 'warn',
    source: `apply-${portal}`,
    summary,
    detail: detailBody,
    fix: url ? { label: FIX_LABELS[mode], href: url } : undefined,
    dedupeKey: `apply:${jobId}`,
  });

  // 2. Flip status to ManualApplyNeeded in applications.md.
  if (url) {
    try {
      markStatus(
        profileId,
        url,
        'ManualApplyNeeded',
        `Auto-apply: ${mode}${detail ? ' — ' + detail : ''}`,
      );
    } catch (e) {
      // markStatus reports its own server error; we don't double-log.
      void e;
    }
  }

  // 3. Activity feed event -- warn level so the bell highlights.
  logEvent(`apply-${portal}`, summary, {
    level: 'warn',
    category: 'application',
    message: detail,
    link: url,
    profileId,
  });
}
