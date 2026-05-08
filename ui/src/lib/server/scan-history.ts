/**
 * Scan-history parser. Reads data/scan-history.tsv (one row per URL ever seen
 * by any scan) and returns time-bucketed aggregates for the Stats page.
 *
 * Schema:
 *   url, first_seen (YYYY-MM-DD), portal, title, company, status
 *
 * Each scan run appends a row per discovered URL (status='added' for new,
 * 'duplicate' for re-discovery). The "first_seen" date doubles as the run
 * day, which is what we group by for the sparkline.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './files';

const HISTORY_PATH = path.join(ROOT, 'data', 'scan-history.tsv');

export type ScanRow = {
  url: string;
  firstSeen: string; // YYYY-MM-DD
  portal: string;
  title: string;
  company: string;
  status: string;
};

export type DailyAggregate = {
  date: string;
  added: number;     // status === 'added'
  duplicates: number; // anything else (most often 'duplicate')
  total: number;
};

export type ScanHistorySummary = {
  totalRuns: number;
  totalAdded: number;
  totalDuplicates: number;
  /** Most-recent first; capped to last 30 entries. */
  recent: DailyAggregate[];
  /** ISO YYYY-MM-DD of the last scan day. */
  lastRunDate: string | null;
  /** Top 10 portals by URL count (overall). */
  topPortals: { portal: string; count: number }[];
  /** Top 10 companies (overall). */
  topCompanies: { company: string; count: number }[];
};

function readRows(): ScanRow[] {
  if (!fs.existsSync(HISTORY_PATH)) return [];
  let text = '';
  try { text = fs.readFileSync(HISTORY_PATH, 'utf8'); } catch { return []; }
  const lines = text.split('\n').slice(1); // skip header
  const out: ScanRow[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = line.split('\t');
    if (cells.length < 6) continue;
    out.push({
      url: cells[0],
      firstSeen: cells[1],
      portal: cells[2],
      title: cells[3],
      company: cells[4],
      status: cells[5],
    });
  }
  return out;
}

export function readScanHistorySummary(): ScanHistorySummary {
  const rows = readRows();
  const byDate = new Map<string, DailyAggregate>();
  const portalCounts = new Map<string, number>();
  const companyCounts = new Map<string, number>();
  let totalAdded = 0;
  let totalDuplicates = 0;
  let lastRunDate: string | null = null;

  for (const r of rows) {
    if (!byDate.has(r.firstSeen)) {
      byDate.set(r.firstSeen, { date: r.firstSeen, added: 0, duplicates: 0, total: 0 });
    }
    const bucket = byDate.get(r.firstSeen)!;
    bucket.total++;
    if (r.status === 'added') {
      bucket.added++;
      totalAdded++;
    } else {
      bucket.duplicates++;
      totalDuplicates++;
    }
    if (!lastRunDate || r.firstSeen > lastRunDate) lastRunDate = r.firstSeen;
    portalCounts.set(r.portal, (portalCounts.get(r.portal) ?? 0) + 1);
    if (r.company) companyCounts.set(r.company, (companyCounts.get(r.company) ?? 0) + 1);
  }

  const recent = [...byDate.values()]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 30);

  return {
    totalRuns: byDate.size,
    totalAdded,
    totalDuplicates,
    recent,
    lastRunDate,
    topPortals: [...portalCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([portal, count]) => ({ portal, count })),
    topCompanies: [...companyCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([company, count]) => ({ company, count })),
  };
}
