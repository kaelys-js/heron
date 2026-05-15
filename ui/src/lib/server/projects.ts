/**
 * Projects = saved filter profiles. Each project bundles a `FilterState` plus a
 * target (e.g. 5 applications) so the user can track parallel job-hunting tracks
 * (e.g. "Vancouver Senior", "Remote US Staff", "Founding Engineer").
 *
 * Per-profile storage: each career profile owns its own `projects.json`. The
 * file lives at `data/users/{uid}/profiles/{slug}/projects.json` (or
 * `data/profiles/{slug}/projects.json` in legacy single-user installs) and is
 * one of the items the migration (`profile-migrate.ts`) moves out of the flat
 * layout.
 *
 * Every read/write accepts an optional `profileId` first argument. Legacy
 * call shapes without `profileId` resolve to the active profile.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Job, Status, FilterState, BgRisk } from '$lib/types';
import { STATUS_ORDER, DEFAULT_FILTER } from '$lib/types';
import { profilePath } from './profile-paths';
import { getActiveProfileId } from './profiles';

function resolveId(profileId?: string): string {
  return profileId ?? getActiveProfileId();
}

function projectsPath(profileId: string): string {
  return profilePath(profileId, 'projects-json');
}

export type ProjectColor =
  | 'emerald'
  | 'blue'
  | 'violet'
  | 'amber'
  | 'rose'
  | 'cyan'
  | 'orange'
  | 'pink';

export const PROJECT_COLORS: ProjectColor[] = [
  'emerald',
  'blue',
  'violet',
  'amber',
  'rose',
  'cyan',
  'orange',
  'pink',
];

export type Project = {
  id: string;
  name: string;
  description: string;
  color: ProjectColor;
  filter: FilterState;
  target: number; // optional goal: target number of applications
  createdAt: number;
  updatedAt: number;
};

export type ProjectStats = {
  total: number;
  byStatus: Record<Status, number>;
  applied: number; // Applied + Screened + Interview + Offer + Rejected
  active: number; // Applied + Screened + Interview + Offer (not rejected)
  interview: number; // Interview + Offer
  offer: number;
  rejected: number;
  evaluated: number; // jobs with reports
  topCompanies: { name: string; count: number }[];
};

const STARTER_TEMPLATES: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Top scorers',
    description: 'High-fit jobs (≥4.5) — your best leads, awaiting your attention.',
    color: 'emerald',
    filter: { ...DEFAULT_FILTER, minScore: 4.5, bgRisk: { ...DEFAULT_FILTER.bgRisk } },
    target: 10,
  },
  {
    name: 'Ready to send',
    description: 'Jobs with both an evaluation report and a tailored CV PDF — one click to apply.',
    color: 'blue',
    filter: {
      ...DEFAULT_FILTER,
      minScore: 4,
      hasReport: true,
      hasPdf: true,
      bgRisk: { ...DEFAULT_FILTER.bgRisk },
    },
    target: 30,
  },
  {
    name: 'Awaiting evaluation',
    description: 'Promising jobs (≥4.0) without a deep report yet — next to evaluate.',
    color: 'amber',
    filter: {
      ...DEFAULT_FILTER,
      minScore: 4,
      hasReport: false,
      bgRisk: { ...DEFAULT_FILTER.bgRisk },
    },
    target: 0,
  },
  {
    name: 'Background-friendly',
    description: 'Only LOW background-check risk — safe to pursue without disclosure prep.',
    color: 'cyan',
    filter: {
      ...DEFAULT_FILTER,
      bgRisk: { LOW: true, MEDIUM: false, HIGH: false, BLOCKED: false },
    },
    target: 0,
  },
];

export function getStarterTemplates(): Omit<Project, 'id' | 'createdAt' | 'updatedAt'>[] {
  // Fresh deep clones so callers can mutate freely
  return STARTER_TEMPLATES.map((t) => ({
    ...t,
    filter: { ...t.filter, bgRisk: { ...t.filter.bgRisk } },
  }));
}

function readRaw(profileId: string): Project[] {
  const p = projectsPath(profileId);
  try {
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is Project => typeof p?.id === 'string' && typeof p?.name === 'string',
    );
  } catch {
    return [];
  }
}

function writeRaw(profileId: string, projects: Project[]): void {
  const p = projectsPath(profileId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(projects, null, 2) + '\n');
}

export function listProjects(profileId?: string): Project[] {
  return readRaw(resolveId(profileId)).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getProject(profileId: string | undefined, id: string): Project | null;
export function getProject(id: string): Project | null;
export function getProject(arg1: string | undefined, arg2?: string): Project | null {
  // Legacy 1-arg call: getProject(id). New: getProject(profileId, id).
  const isLegacy = arg2 === undefined;
  const profileId = isLegacy ? undefined : arg1;
  const id = isLegacy ? (arg1 as string) : arg2!;
  return readRaw(resolveId(profileId)).find((p) => p.id === id) ?? null;
}

export function createProject(profileId: string | undefined, input: Partial<Project>): Project;
export function createProject(input: Partial<Project>): Project;
export function createProject(
  arg1: string | undefined | Partial<Project>,
  arg2?: Partial<Project>,
): Project {
  const isLegacy = typeof arg1 !== 'string' && arg2 === undefined;
  const profileId = isLegacy ? undefined : (arg1 as string | undefined);
  const input = (isLegacy ? arg1 : arg2!) as Partial<Project>;
  const id = resolveId(profileId);
  const projects = readRaw(id);
  const now = Date.now();
  const slug = input.id ?? slugifyId(input.name ?? 'project', new Set(projects.map((p) => p.id)));
  const project: Project = {
    id: slug,
    name: (input.name ?? 'Untitled').trim() || 'Untitled',
    description: (input.description ?? '').trim(),
    color: input.color ?? PROJECT_COLORS[projects.length % PROJECT_COLORS.length],
    filter: normalizeFilter(input.filter),
    target: typeof input.target === 'number' ? Math.max(0, Math.floor(input.target)) : 0,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
  writeRaw(id, [project, ...projects]);
  return project;
}

export function updateProject(
  profileId: string | undefined,
  id: string,
  patch: Partial<Project>,
): Project | null;
export function updateProject(id: string, patch: Partial<Project>): Project | null;
export function updateProject(
  arg1: string | undefined,
  arg2: string | Partial<Project>,
  arg3?: Partial<Project>,
): Project | null {
  const isLegacy = arg3 === undefined;
  const profileId = isLegacy ? undefined : arg1;
  const id = isLegacy ? (arg1 as string) : (arg2 as string);
  const patch = (isLegacy ? arg2 : arg3) as Partial<Project>;
  const pid = resolveId(profileId);
  const projects = readRaw(pid);
  const idx = projects.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const next: Project = {
    ...projects[idx],
    ...patch,
    id: projects[idx].id, // immutable
    createdAt: projects[idx].createdAt,
    updatedAt: Date.now(),
    filter: patch.filter ? normalizeFilter(patch.filter) : projects[idx].filter,
    target:
      typeof patch.target === 'number'
        ? Math.max(0, Math.floor(patch.target))
        : projects[idx].target,
    name: (patch.name ?? projects[idx].name).trim() || projects[idx].name,
    description: (patch.description ?? projects[idx].description).trim(),
  };
  projects[idx] = next;
  writeRaw(pid, projects);
  return next;
}

export function deleteProject(profileId: string | undefined, id: string): boolean;
export function deleteProject(id: string): boolean;
export function deleteProject(arg1: string | undefined, arg2?: string): boolean {
  const isLegacy = arg2 === undefined;
  const profileId = isLegacy ? undefined : arg1;
  const id = isLegacy ? (arg1 as string) : arg2!;
  const pid = resolveId(profileId);
  const projects = readRaw(pid);
  const next = projects.filter((p) => p.id !== id);
  if (next.length === projects.length) return false;
  writeRaw(pid, next);
  return true;
}

function slugifyId(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'project';
  let candidate = base;
  let i = 2;
  while (taken.has(candidate)) {
    candidate = base + '-' + i;
    i++;
  }
  return candidate;
}

function normalizeFilter(f?: Partial<FilterState>): FilterState {
  const base: FilterState = {
    ...DEFAULT_FILTER,
    bgRisk: { ...DEFAULT_FILTER.bgRisk },
    workMode: { ...DEFAULT_FILTER.workMode },
  };
  if (!f) return base;
  return {
    minScore: typeof f.minScore === 'number' ? Math.min(5, Math.max(0, f.minScore)) : base.minScore,
    bgRisk: {
      LOW: f.bgRisk?.LOW ?? base.bgRisk.LOW,
      MEDIUM: f.bgRisk?.MEDIUM ?? base.bgRisk.MEDIUM,
      HIGH: f.bgRisk?.HIGH ?? base.bgRisk.HIGH,
      BLOCKED: f.bgRisk?.BLOCKED ?? base.bgRisk.BLOCKED,
    },
    workMode: {
      remote: f.workMode?.remote ?? base.workMode.remote,
      hybrid: f.workMode?.hybrid ?? base.workMode.hybrid,
      onsite: f.workMode?.onsite ?? base.workMode.onsite,
      unknown: f.workMode?.unknown ?? base.workMode.unknown,
    },
    hasPdf: !!f.hasPdf,
    hasReport: !!f.hasReport,
    hasSalary: !!f.hasSalary,
    search: typeof f.search === 'string' ? f.search.trim() : '',
    source: typeof f.source === 'string' ? f.source : '',
  };
}

export function matchesProject(job: Job, project: Project): boolean {
  const f = project.filter;
  const score = job.score ?? job.geminiScore ?? 0;
  if (f.minScore > 0 && score < f.minScore) return false;
  if (job.bgRisk && f.bgRisk[job.bgRisk] === false) return false;
  if (f.hasPdf && !job.pdfFile) return false;
  if (f.hasReport && !job.reportFile) return false;
  if (f.search.trim()) {
    const q = f.search.trim().toLowerCase();
    if (!job.company.toLowerCase().includes(q) && !job.role.toLowerCase().includes(q)) return false;
  }
  return true;
}

export function computeStats(project: Project, jobs: Job[]): ProjectStats {
  const byStatus = STATUS_ORDER.reduce<Record<Status, number>>(
    (acc, s) => {
      acc[s] = 0;
      return acc;
    },
    {} as Record<Status, number>,
  );
  const companyCounts = new Map<string, number>();
  let total = 0;
  let evaluated = 0;
  for (const job of jobs) {
    if (!matchesProject(job, project)) continue;
    total++;
    byStatus[job.status]++;
    if (job.reportFile) evaluated++;
    if (job.company) {
      companyCounts.set(job.company, (companyCounts.get(job.company) ?? 0) + 1);
    }
  }
  const applied =
    byStatus.Applied + byStatus.Screened + byStatus.Interview + byStatus.Offer + byStatus.Rejected;
  const active = byStatus.Applied + byStatus.Screened + byStatus.Interview + byStatus.Offer;
  const interview = byStatus.Interview + byStatus.Offer;
  const offer = byStatus.Offer;
  const rejected = byStatus.Rejected;
  const topCompanies = [...companyCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));
  return { total, byStatus, applied, active, interview, offer, rejected, evaluated, topCompanies };
}

/**
 * Build URL search-params string that pre-applies a project's filter on the pipeline page.
 * Used by the "Open in Pipeline" button — links like `/?from=project:abc&score=4&bg=LOW,MEDIUM&search=…`.
 */
export function projectToPipelineQuery(project: Project): string {
  const params = new URLSearchParams();
  params.set('from', 'project:' + project.id);
  if (project.filter.minScore > 0) params.set('score', String(project.filter.minScore));
  const bg = (Object.entries(project.filter.bgRisk) as [NonNullable<BgRisk>, boolean][])
    .filter(([, on]) => on)
    .map(([k]) => k);
  // Only set bg param if it diverges from the default (LOW+MEDIUM+HIGH on, BLOCKED off)
  const isDefault =
    bg.length === 3 && bg.every((b) => b === 'LOW' || b === 'MEDIUM' || b === 'HIGH');
  if (!isDefault) params.set('bg', bg.join(','));
  if (project.filter.hasPdf) params.set('pdf', '1');
  if (project.filter.hasReport) params.set('report', '1');
  if (project.filter.search.trim()) params.set('search', project.filter.search.trim());
  return params.toString();
}

/**
 * Inverse of `projectToPipelineQuery` — used by `+page.server.ts` to seed initial filter from URL.
 */
export function parseFilterFromUrl(url: URL): Partial<FilterState> {
  const out: Partial<FilterState> = {};
  const score = url.searchParams.get('score');
  if (score != null) {
    const n = parseFloat(score);
    if (!isNaN(n)) out.minScore = Math.min(5, Math.max(0, n));
  }
  const bg = url.searchParams.get('bg');
  if (bg != null) {
    const allowed: Record<NonNullable<BgRisk>, boolean> = {
      LOW: false,
      MEDIUM: false,
      HIGH: false,
      BLOCKED: false,
    };
    for (const k of bg.split(',').map((x) => x.trim().toUpperCase())) {
      if (k === 'LOW' || k === 'MEDIUM' || k === 'HIGH' || k === 'BLOCKED') {
        allowed[k] = true;
      }
    }
    out.bgRisk = allowed;
  }
  if (url.searchParams.get('pdf') === '1') out.hasPdf = true;
  if (url.searchParams.get('report') === '1') out.hasReport = true;
  const search = url.searchParams.get('search');
  if (search) out.search = search;
  // `?source=workday-api` — single source filter, persists in URL so a
  // bookmark like /pipeline?source=linkedin-alert-email gives a focused view.
  const source = url.searchParams.get('source');
  if (source) out.source = source;
  return out;
}
