/**
 * /linkedin-audit loader -- surfaces the saved audit report (or null
 * when never run). Page renders the findings grouped by category +
 * severity, each with a copy-to-clipboard paste block.
 */

import { readAuditReport } from '$lib/server/linkedin-audit';

export async function load() {
  const report = readAuditReport();
  return { report };
}
