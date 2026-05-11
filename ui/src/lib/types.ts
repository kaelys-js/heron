export type Status =
  | 'New' | 'Scoring' | 'Scored' | 'Ready'
  | 'Queued' | 'Applied' | 'Screened' | 'Interview'
  | 'Offer' | 'Rejected' | 'Closed';

/**
 * Canonical application status per `templates/states.yml`. This is the
 * "where in the hiring process is this job" axis, parallel to the
 * pipeline `Status` above. See `docs/STATUS_MODEL.md` for why they're
 * orthogonal. The dashboard renders this as a secondary chip beside the
 * pipeline badge when it differs from the trivial fold.
 */
export type ApplicationStatus =
  | 'evaluated' | 'applied' | 'responded' | 'interview'
  | 'offer' | 'rejected' | 'discarded' | 'skip';

export const APPLICATION_STATUS_TINTS: Record<ApplicationStatus, string> = {
  evaluated: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
  applied:   'bg-violet-500/10 text-violet-300 border-violet-500/30',
  responded: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  interview: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
  offer:     'bg-green-500/15 text-green-300 border-green-500/40',
  rejected:  'bg-red-500/10 text-red-300 border-red-500/30',
  discarded: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/30',
  skip:      'bg-zinc-500/5 text-zinc-500 border-zinc-500/20',
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
   * `linkedin-alert-email`, etc) — see `SOURCE_LABELS` for human-readable
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
  'greenhouse-api':       { label: 'Greenhouse',     tint: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
  'ashby-api':            { label: 'Ashby',          tint: 'bg-violet-500/10 text-violet-300 border-violet-500/30' },
  'lever-api':            { label: 'Lever',          tint: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' },
  'workday-api':          { label: 'Workday',        tint: 'bg-orange-500/10 text-orange-300 border-orange-500/30' },
  'smartrecruiters-api':  { label: 'SmartRecruiters', tint: 'bg-blue-500/10 text-blue-300 border-blue-500/30' },
  'workable-api':         { label: 'Workable',       tint: 'bg-teal-500/10 text-teal-300 border-teal-500/30' },
  'personio-api':         { label: 'Personio',       tint: 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30' },
  'recruitee-api':        { label: 'Recruitee',      tint: 'bg-pink-500/10 text-pink-300 border-pink-500/30' },
  'teamtailor-api':       { label: 'Teamtailor',     tint: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30' },
  // Authenticated Playwright scrapers (your logged-in personalised feed)
  'linkedin-authenticated': { label: 'LinkedIn (auth)', tint: 'bg-sky-500/15 text-sky-200 border-sky-500/50' },
  'indeed-authenticated':   { label: 'Indeed (auth)',   tint: 'bg-blue-700/15 text-blue-200 border-blue-700/50' },
  // Broad scan (scan-broad.py — JobSpy + free aggregators)
  'linkedin':             { label: 'LinkedIn',       tint: 'bg-sky-500/10 text-sky-300 border-sky-500/30' },
  'indeed':               { label: 'Indeed',         tint: 'bg-blue-700/10 text-blue-300 border-blue-700/30' },
  'glassdoor':            { label: 'Glassdoor',      tint: 'bg-emerald-700/10 text-emerald-300 border-emerald-700/30' },
  'ziprecruiter':         { label: 'ZipRecruiter',   tint: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/30' },
  'google':               { label: 'Google Jobs',    tint: 'bg-blue-500/10 text-blue-300 border-blue-500/30' },
  'themuse':              { label: 'The Muse',       tint: 'bg-rose-500/10 text-rose-300 border-rose-500/30' },
  'adzuna':               { label: 'Adzuna',         tint: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  'remoteok':             { label: 'RemoteOK',       tint: 'bg-purple-500/10 text-purple-300 border-purple-500/30' },
  'wwr':                  { label: 'WeWorkRemotely', tint: 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30' },
  'hn':                   { label: 'HN Hiring',      tint: 'bg-orange-500/10 text-orange-300 border-orange-500/30' },
  'yc':                   { label: 'YC startups',    tint: 'bg-orange-500/10 text-orange-300 border-orange-500/30' },
  // Curated boards
  'aijobs':               { label: 'AI Jobs',        tint: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  // Email ingestion
  'linkedin-alert-email': { label: 'LinkedIn alert', tint: 'bg-sky-500/10 text-sky-300 border-sky-500/30' },
  'indeed-alert-email':   { label: 'Indeed alert',   tint: 'bg-blue-700/10 text-blue-300 border-blue-700/30' },
  'email-digest':         { label: 'Email digest',   tint: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/30' },
};

export const STATUS_ORDER: Status[] = [
  'New', 'Scoring', 'Scored', 'Ready', 'Queued',
  'Applied', 'Screened', 'Interview',
  'Offer', 'Rejected', 'Closed',
];

export const STATUS_TINTS: Record<Status, string> = {
  New: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/30',
  Scoring: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  Scored: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
  Ready: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  Queued: 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30',
  Applied: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
  Screened: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  Interview: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
  Offer: 'bg-green-500/15 text-green-300 border-green-500/40',
  Rejected: 'bg-red-500/10 text-red-300 border-red-500/30',
  Closed: 'bg-zinc-500/5 text-zinc-500 border-zinc-500/20',
};

export const BG_TINTS: Record<NonNullable<BgRisk>, string> = {
  LOW: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  MEDIUM: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  HIGH: 'bg-red-500/10 text-red-300 border-red-500/30',
  BLOCKED: 'bg-red-500/30 text-red-200 border-red-500/60',
};

export const STATUS_EMPTY_COPY: Record<Status, string> = {
  New: 'No new jobs — run a scan to find some.',
  Scoring: 'Nothing being scored right now.',
  Scored: 'No scored jobs yet — run Gemini first-pass.',
  Ready: 'No jobs ready to apply yet.',
  Queued: 'Nothing queued for the next batch send.',
  Applied: "You haven't submitted any applications.",
  Screened: 'No screening calls scheduled.',
  Interview: 'No interviews in progress.',
  Offer: 'No offers in hand yet — keep going.',
  Rejected: 'No rejections (or you haven\u2019t tracked them).',
  Closed: 'Nothing closed.',
};

export type EventLevel = 'info' | 'warn' | 'error' | 'success';
export type EventCategory = 'task' | 'api' | 'application' | 'system' | 'user';

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
  /** Profile slug this event originated in (when the event is profile-scoped).
   *  Cross-profile events (autopilot tick, IMAP daemon, migration) omit this
   *  so the activity feed can distinguish "shared infra" from "this profile". */
  profileId?: string;
  /** Stack trace (only set for level === 'error'). Truncated to ~2KB. */
  stack?: string;
};

/**
 * Issue — a structured, persisted "open problem" that needs user attention.
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
  /** Optional fix hint — a button + URL the UI surfaces. */
  fix?: { label: string; href: string };
  /** When set, repeated reports of the same dedupeKey overwrite the previous
   *  open issue rather than creating a new one. */
  dedupeKey?: string;
  /** Resolution timestamp. Resolved issues stay in the file (audit trail) but
   *  drop off the open-list. */
  resolvedAt?: number;
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
 * Tab filter — controls which Status columns appear on the board.
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
  if (t === 'all') return STATUS_ORDER;
  if (t === 'ready') return ['Ready'];
  if (t === 'applied') return ['Applied', 'Screened', 'Interview', 'Offer'];
  if (typeof t === 'string' && t.startsWith('s:')) {
    const s = t.slice(2) as Status;
    if (STATUS_ORDER.includes(s)) return [s];
  }
  return STATUS_ORDER;
}

export function tabLabel(t: TabFilter): string {
  if (t === 'all') return 'All';
  if (t === 'ready') return 'Ready';
  if (t === 'applied') return 'In flight';
  if (typeof t === 'string' && t.startsWith('s:')) return t.slice(2);
  return 'All';
}

export type FilterState = {
  minScore: number;       // 0 = no filter
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
