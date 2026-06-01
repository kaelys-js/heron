/**
 * The per-request correlation id, injected by hooks.server.ts as
 * `<meta name="x-request-id">` (a page cannot read its own response headers, so
 * the server bakes it into the document). It mirrors the `X-Request-Id` response
 * header + the server log line + the error reference shown on the error page, so
 * client code (error reporting, support flows) can quote the SAME id.
 *
 * Returns '' off-server (Capacitor static build, where there's no server request)
 * or before hydration.
 */
export function getRequestId(): string {
  if (typeof document === 'undefined') return '';
  return document.querySelector('meta[name="x-request-id"]')?.getAttribute('content') ?? '';
}
