export type Status =
  | 'New' | 'Scoring' | 'Scored' | 'Ready'
  | 'Queued' | 'Applied' | 'Screened' | 'Interview'
  | 'Offer' | 'Rejected' | 'Closed';

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
  bgRisk?: BgRisk;
  reportFile?: string;
  pdfFile?: string;
  notes?: string;
  /** Order index from pipeline.md (0 = first/oldest entry). Used for date-desc sort. */
  pipelineIndex?: number;
  /** Parsed from the job's deep-evaluation report when one exists. */
  workMode?: WorkMode;
  salary?: string;
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
export type EventCategory = 'task' | 'api' | 'application' | 'system' | 'user' | 'orchestrator';

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
};

export const DEFAULT_FILTER: FilterState = {
  minScore: 0,
  bgRisk: { LOW: true, MEDIUM: true, HIGH: true, BLOCKED: false },
  workMode: { remote: true, hybrid: true, onsite: true, unknown: true },
  hasPdf: false,
  hasReport: false,
  hasSalary: false,
  search: '',
};
