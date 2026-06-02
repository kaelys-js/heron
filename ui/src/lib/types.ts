export type Status =
  | 'New'
  | 'Scoring'
  | 'Scored'
  | 'Ready'
  | 'Queued'
  | 'Applying'
  | 'Applied'
  | 'Screened'
  // Interview sub-stages -- finer-grained than the legacy 'Interview' bucket.
  // 'Interview' is preserved as a catch-all parent for back-compat with
  // existing applications.md rows; new flows should pick one of the specific
  // stages below.
  | 'Interview'
  | 'PhoneScreen'
  | 'Technical'
  | 'Onsite'
  | 'TakeHome'
  | 'Final'
  | 'Offer'
  // Post-offer stages -- used by the negotiation + decision-support flows.
  | 'Negotiating'
  | 'Accepted'
  | 'Declined'
  | 'Ghosted'
  | 'Rejected'
  | 'Closed'
  | 'ManualApplyNeeded';

/**
 * Canonical application status per `data/states.yml`. This is the
 * "where in the hiring process is this job" axis, parallel to the
 * pipeline `Status` above. See `docs/STATUS_MODEL.md` for why they're
 * orthogonal. The dashboard renders this as a secondary chip beside the
 * pipeline badge when it differs from the trivial fold.
 */
export type ApplicationStatus =
  | 'evaluated'
  | 'applied'
  | 'responded'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'discarded'
  | 'skip';

export const APPLICATION_STATUS_TINTS: Record<ApplicationStatus, string> = {
  evaluated: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
  applied: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30',
  responded: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
  interview: 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30',
  offer: 'bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/40',
  rejected: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30',
  discarded: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/30',
  skip: 'bg-zinc-500/5 text-zinc-600 dark:text-zinc-400 border-zinc-500/20',
};

export type BgRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED' | undefined;

export type WorkMode = 'remote' | 'hybrid' | 'onsite' | 'unknown';

export type Job = {
  id: string;
  url: string;
  company: string;
  role: string;
  location: string;
  score?: number;
  geminiScore?: number;
  status: Status;
  /** states.yml canonical, parsed straight from the applications.md row.
   *  Orthogonal to `status` (pipeline stage). See `docs/STATUS_MODEL.md`. */
  applicationStatus?: ApplicationStatus;
  bgRisk?: BgRisk;
  reportFile?: string;
  pdfFile?: string;
  notes?: string;
  /** Order index from pipeline.md (0 = first/oldest entry). Used for date-desc sort. */
  pipelineIndex?: number;
  /** Parsed from the job's deep-evaluation report when one exists. */
  workMode?: WorkMode;
  salary?: string;
  /**
   * Where the URL was first discovered. Looked up from data/scan-history.tsv
   * during job parsing. Stable identifier (`workday-api`, `aijobs`,
   * `linkedin-alert-email`, etc) -- see `SOURCE_LABELS` for human-readable
   * names + tints.
   */
  source?: string;
  /**
   * Profile slug this job belongs to. Set by loadAllJobs(); used by the
   * cross-profile "all profiles" inbox to render a profile badge per job.
   * Single-profile installs / profile-scoped queries leave this undefined.
   */
  profileId?: string;
};

/** Per-source UI metadata. Anything not listed renders as a neutral "Other"
 *  chip. Keep keys in sync with the `source` strings emitted by the various
 *  scan-*.mjs files (see scan.mjs:316 etc). */
export const SOURCE_LABELS: Record<string, { label: string; tint: string }> = {
  // ATS direct (scan.mjs)
  'greenhouse-api': {
    label: 'Greenhouse',
    tint: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  },
  'ashby-api': {
    label: 'Ashby',
    tint: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30',
  },
  'lever-api': {
    label: 'Lever',
    tint: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
  },
  'workday-api': {
    label: 'Workday',
    tint: 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30',
  },
  'smartrecruiters-api': {
    label: 'SmartRecruiters',
    tint: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30',
  },
  'workable-api': {
    label: 'Workable',
    tint: 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30',
  },
  'personio-api': {
    label: 'Personio',
    tint: 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30',
  },
  'recruitee-api': {
    label: 'Recruitee',
    tint: 'bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-500/30',
  },
  'teamtailor-api': {
    label: 'Teamtailor',
    tint: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
  },
  // Authenticated Playwright scrapers (your logged-in personalised feed)
  'linkedin-authenticated': {
    label: 'LinkedIn (auth)',
    tint: 'bg-sky-500/15 text-sky-700 dark:text-sky-200 border-sky-500/50',
  },
  'indeed-authenticated': {
    label: 'Indeed (auth)',
    tint: 'bg-blue-700/15 text-blue-700 dark:text-blue-200 border-blue-700/50',
  },
  // Broad scan (scan-broad.py -- JobSpy + free aggregators)
  linkedin: {
    label: 'LinkedIn',
    tint: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30',
  },
  indeed: {
    label: 'Indeed',
    tint: 'bg-blue-700/10 text-blue-700 dark:text-blue-300 border-blue-700/30',
  },
  glassdoor: {
    label: 'Glassdoor',
    tint: 'bg-emerald-700/10 text-emerald-700 dark:text-emerald-300 border-emerald-700/30',
  },
  ziprecruiter: {
    label: 'ZipRecruiter',
    tint: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/30',
  },
  google: {
    label: 'Google Jobs',
    tint: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30',
  },
  themuse: {
    label: 'The Muse',
    tint: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30',
  },
  adzuna: {
    label: 'Adzuna',
    tint: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
  },
  remoteok: {
    label: 'RemoteOK',
    tint: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30',
  },
  wwr: {
    label: 'WeWorkRemotely',
    tint: 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30',
  },
  hn: {
    label: 'HN Hiring',
    tint: 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30',
  },
  yc: {
    label: 'YC startups',
    tint: 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30',
  },
  // Curated boards
  aijobs: {
    label: 'AI Jobs',
    tint: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
  },
  // Email ingestion
  'linkedin-alert-email': {
    label: 'LinkedIn alert',
    tint: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30',
  },
  'indeed-alert-email': {
    label: 'Indeed alert',
    tint: 'bg-blue-700/10 text-blue-700 dark:text-blue-300 border-blue-700/30',
  },
  'email-digest': {
    label: 'Email digest',
    tint: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/30',
  },
};

export const STATUS_ORDER: Status[] = [
  'New',
  'Scoring',
  'Scored',
  'Ready',
  'Queued',
  'Applying',
  'Applied',
  'Screened',
  // Interview stages -- ordered by typical progression. 'Interview' as a
  // generic bucket sits last so users with legacy data still see it grouped
  // but don't pick it for new flows.
  'PhoneScreen',
  'Technical',
  'TakeHome',
  'Onsite',
  'Final',
  'Interview',
  'Offer',
  'Negotiating',
  'Accepted',
  'Declined',
  'Ghosted',
  'Rejected',
  'Closed',
  'ManualApplyNeeded',
];

export const STATUS_TINTS: Record<Status, string> = {
  New: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/30',
  Scoring: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30',
  Scored: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
  Ready: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  Queued: 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30',
  // Applying = active blue with pulse anim -- script is running right now.
  Applying: 'bg-blue-500/15 text-blue-700 dark:text-blue-200 border-blue-500/50 animate-pulse',
  Applied: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30',
  Screened: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
  // Interview stages share a warm hue family -- distinguishable but
  // visually clustered so you can tell "interview pipeline" at a glance.
  PhoneScreen: 'bg-amber-500/10 text-amber-700 dark:text-amber-200 border-amber-500/40',
  Technical: 'bg-orange-500/10 text-orange-700 dark:text-orange-200 border-orange-500/40',
  TakeHome: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-200 border-yellow-500/40',
  Onsite: 'bg-orange-600/15 text-orange-700 dark:text-orange-200 border-orange-600/50',
  Final: 'bg-red-400/15 text-red-700 dark:text-red-200 border-red-400/50',
  Interview: 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30',
  Offer: 'bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/40',
  // Post-offer flow stages -- green spectrum trending to neutral as the
  // candidate moves from offer to outcome.
  Negotiating: 'bg-lime-500/15 text-lime-800 dark:text-lime-200 border-lime-500/50',
  Accepted: 'bg-emerald-500/25 text-emerald-800 dark:text-emerald-100 border-emerald-500/60',
  Declined: 'bg-zinc-600/15 text-zinc-700 dark:text-zinc-300 border-zinc-600/40',
  // Ghosted = grey-with-stroke; visually distinct from Rejected (which
  // is bad-news-confirmed) vs Ghosted (no-news-treat-as-dead).
  Ghosted: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/40 border-dashed',
  Rejected: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30',
  Closed: 'bg-zinc-500/5 text-zinc-600 dark:text-zinc-400 border-zinc-500/20',
  // ManualApplyNeeded = amber with dashed border -- action required.
  ManualApplyNeeded:
    'bg-amber-500/15 text-amber-700 dark:text-amber-200 border-amber-500/50 border-dashed',
};

export const BG_TINTS: Record<NonNullable<BgRisk>, string> = {
  LOW: 'bg-success/10 text-success border-success/30',
  MEDIUM: 'bg-warning/10 text-warning border-warning/30',
  HIGH: 'bg-destructive/10 text-destructive border-destructive/30',
  BLOCKED: 'bg-destructive/25 text-destructive border-destructive/60',
};

export const STATUS_EMPTY_COPY: Record<Status, string> = {
  New: 'No new jobs — run a scan to find some.',
  Scoring: 'Nothing being scored right now.',
  Scored: 'No scored jobs yet — run Gemini first-pass.',
  Ready: 'No jobs ready to apply yet.',
  Queued: 'Nothing queued for the next batch send.',
  Applied: "You haven't submitted any applications.",
  Screened: 'No screening calls scheduled.',
  PhoneScreen: 'No phone screens scheduled.',
  Technical: 'No technical interviews in progress.',
  TakeHome: 'No take-homes in flight.',
  Onsite: 'No onsite / final-round loops scheduled.',
  Final: 'No final-round / hiring-committee stages active.',
  Interview: 'No interviews in progress.',
  Offer: 'No offers in hand yet — keep going.',
  Negotiating: 'No active negotiations.',
  Accepted: 'No accepted offers yet.',
  Declined: 'No declined offers.',
  Ghosted: 'No ghosted applications (auto-ghost flags applies silent for 21d+).',
  Rejected: 'No rejections (or you haven\u2019t tracked them).',
  Closed: 'Nothing closed.',
  Applying: 'No applications in flight right now.',
  ManualApplyNeeded: 'No jobs awaiting manual apply \u2014 autonomous mode is keeping up.',
};

export type EventLevel = 'info' | 'warn' | 'error' | 'success';
export type EventCategory = 'task' | 'api' | 'application' | 'system' | 'user';

/**
 * Report kind -- the orthogonal "what audience is this for" axis to
 * EventLevel. `product` = job-search domain events the user acts on;
 * `technical` = software/infra diagnostics that stay quiet. The routing
 * matrix in $lib/report-routing maps (kind, level) -> where it surfaces.
 */
export type ReportKind = 'product' | 'technical';

export type ActivityEvent = {
  id: string;
  ts: number;
  level: EventLevel;
  category: EventCategory;
  source: string;
  title: string;
  message?: string;
  link?: string;
  read?: boolean;
  /** User id this event belongs to (multi-user isolation). Omitted for
   *  truly system-wide events like server start, migration runs, etc.
   *  When omitted, every authenticated user sees the event in their
   *  feed (it's broadcast). */
  userId?: string;
  /** Profile slug this event originated in (when the event is profile-scoped).
   *  Cross-profile events (autopilot tick, IMAP daemon, migration) omit this
   *  so the activity feed can distinguish "shared infra" from "this profile". */
  profileId?: string;
  /** Stack trace (only set for level === 'error'). Truncated to ~2KB. */
  stack?: string;
  /** Report kind -- product (domain, loud) vs technical (diagnostic, quiet).
   *  OPTIONAL for back-compat: the many existing logEvent call sites omit it,
   *  so $lib/report-routing's eventKind() derives it from `category` when
   *  absent. An explicit kind always wins. */
  kind?: ReportKind;
  /** Correlation id == the request's X-Request-Id (hooks.server.ts mints it per
   *  request and surfaces it on the response header + a <meta> tag + the
   *  on-screen error ref). Threaded here so a logged error is grep-able by that
   *  ref: server errors carry event.locals.requestId; client errors POST their
   *  ORIGINAL page's request id to /api/telemetry. Omitted with no request ctx. */
  requestId?: string;
  /** Stable error fingerprint (hash of source+title+top stack frames, line
   *  numbers stripped) used to GROUP recurring errors + count occurrences without
   *  a remote service. Set only for error/warn events with a stack; see
   *  fingerprint.ts. Omitted otherwise. */
  fingerprint?: string;
};

/**
 * Issue -- a structured, persisted "open problem" that needs user attention.
 * Distinct from ActivityEvent because issues represent open work that should
 * stay visible until resolved (failed integrity check, dead links found,
 * autopilot circuit-broken). Backed by data/issues.jsonl.
 */
export type Issue = {
  id: string;
  ts: number;
  /** Determines visual treatment in the Inbox. */
  severity: 'info' | 'warn' | 'error';
  /** Subsystem that detected the issue (used for filtering + dedupeKey). */
  source: string;
  /** Short user-facing summary. */
  summary: string;
  /** Optional longer body / diagnostic detail (markdown OK). */
  detail?: string;
  /** Optional fix hint -- a button + URL the UI surfaces. */
  fix?: { label: string; href: string };
  /** When set, repeated reports of the same dedupeKey overwrite the previous
   *  open issue rather than creating a new one. */
  dedupeKey?: string;
  /** Resolution timestamp. Resolved issues stay in the file (audit trail) but
   *  drop off the open-list. */
  resolvedAt?: number;
  /** User this issue belongs to. Omitted for system-wide issues (server
   *  start, migration, etc.) that every authenticated user should see. */
  userId?: string;
};

export type SortKey = 'score-desc' | 'score-asc' | 'date-desc' | 'company-asc';
/**
 * Pipeline view modes:
 *  - `board`: kanban columns by status (default)
 *  - `list`: card list (one card per job, full info)
 *  - `compact`: dense single-line rows (~50+ visible per screen)
 *  - `table`: spreadsheet with sortable column headers
 *  - `by-company`: grouped sections per company (good for "all the Vercel jobs")
 */
export type ViewMode = 'board' | 'list' | 'compact' | 'table' | 'by-company';
/**
 * Tab filter -- controls which Status columns appear on the board.
 *  - 'all': every status (default)
 *  - 'ready': just the Ready column
 *  - 'applied': Applied + Screened + Interview + Offer
 *  - 's:<Status>': single status column (e.g. 's:Interview')
 */
export type TabFilter = 'all' | 'ready' | 'applied' | `s:${Status}`;

export const TAB_PRESETS: { value: TabFilter; label: string; statuses: Status[] }[] = [
  { value: 'all', label: 'All', statuses: STATUS_ORDER },
  { value: 'ready', label: 'Ready', statuses: ['Ready'] },
  { value: 'applied', label: 'In flight', statuses: ['Applied', 'Screened', 'Interview', 'Offer'] },
];

export function tabStatuses(t: TabFilter): Status[] {
  if (t === 'all') {
    return STATUS_ORDER;
  }
  if (t === 'ready') {
    return ['Ready'];
  }
  if (t === 'applied') {
    return ['Applied', 'Screened', 'Interview', 'Offer'];
  }
  if (typeof t === 'string' && t.startsWith('s:')) {
    const s = t.slice(2) as Status;
    if (STATUS_ORDER.includes(s)) {
      return [s];
    }
  }
  return STATUS_ORDER;
}

export function tabLabel(t: TabFilter): string {
  if (t === 'all') {
    return 'All';
  }
  if (t === 'ready') {
    return 'Ready';
  }
  if (t === 'applied') {
    return 'In flight';
  }
  if (typeof t === 'string' && t.startsWith('s:')) {
    return t.slice(2);
  }
  return 'All';
}

export type FilterState = {
  minScore: number; // 0 = no filter
  bgRisk: Record<NonNullable<BgRisk>, boolean>;
  /** Each work mode key may be true (allowed) or false (excluded). All-true = no filter. */
  workMode: Record<WorkMode, boolean>;
  hasPdf: boolean;
  hasReport: boolean;
  hasSalary: boolean;
  search: string;
  /** Source identifier (e.g. 'workday-api', 'aijobs') or '' for "all sources". */
  source: string;
};

export const DEFAULT_FILTER: FilterState = {
  minScore: 0,
  bgRisk: { LOW: true, MEDIUM: true, HIGH: true, BLOCKED: false },
  workMode: { remote: true, hybrid: true, onsite: true, unknown: true },
  hasPdf: false,
  hasReport: false,
  hasSalary: false,
  search: '',
  source: '',
};
