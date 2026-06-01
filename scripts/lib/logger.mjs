// logger.mjs -- shared CI/local logging for MJS scripts.
//
// One place that knows how to emit GitHub Actions workflow-command
// annotations (::error::/::warning::/::notice::) with correct escaping,
// and how to fall back to plain prefixed console output when not running
// under Actions. ~122 .mjs scripts previously hand-rolled the
// `console.error('::error::...')` string, each re-implementing (or
// skipping) the escaping rules and none embedding the run id.
//
// Two reasons this matters:
//
//   1. Overlapping workflow runs (a push + a scheduled sweep landing in
//      the same window) interleave in shared log views. Prefixing every
//      annotation with `[run <GITHUB_RUN_ID>]` makes each line traceable
//      to its run. Without it the lines are ambiguous.
//
//   2. GitHub parses `::error::` lines for the message text and for
//      `file=`/`line=` properties. Unescaped newlines truncate the
//      annotation; unescaped `,`/`:` in a property value corrupt the
//      property parse. The escaping below follows the documented Actions
//      workflow-command rules.
//
// Usage:
//   import { error, warn, notice } from '../lib/logger.mjs';
//   error('3 targets below threshold');
//   error('cobertura.xml missing', { file: 'scripts/x.mjs', line: 12 });
//
// formatAnnotation(level, msg, props, env) is pure -- it builds the
// output string from an injectable env so tests never touch the real
// process.env. The exported error/warn/notice are thin console wrappers
// over it.

/** Escape a message body for a workflow command (data section, after the
 *  second `::`). Order matters: `%` first so we don't double-escape the
 *  `%` we introduce for the others.
 *  @param {string} s
 *  @returns {string}
 */
function escapeData(s) {
  return String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/** Escape a property VALUE (e.g. file=, line=). Same base rules as the
 *  data section plus `,` and `:` which delimit the property list and the
 *  command, so they must be encoded inside a value.
 *  @param {string} s
 *  @returns {string}
 */
function escapeProp(s) {
  return escapeData(s).replace(/,/g, '%2C').replace(/:/g, '%3A');
}

/**
 * Build the log line for one message. Pure -- no console, no real env.
 *
 *   - When env.GITHUB_ACTIONS is set: an annotation
 *       `::<level> file=...,line=...::<message>`
 *     with the message escaped and properties escaped. When
 *     env.GITHUB_RUN_ID is present the message is prefixed with
 *     `[run <id>] ` (the prefix is escaped along with the message).
 *   - Otherwise: a plain `<level>: <message>` line (no run prefix, no
 *     annotation noise) so local runs read cleanly.
 *
 * @param {'error'|'warning'|'notice'} level
 * @param {string} msg
 * @param {{file?: string, line?: number|string, col?: number|string}} [props]
 * @param {Record<string, string|undefined>} [env]
 * @returns {string}
 */
export function formatAnnotation(level, msg, props = {}, env = {}) {
  const message = String(msg);
  if (!env.GITHUB_ACTIONS) {
    // Local: plain, prefixed, unescaped. No run id (single-run context).
    return `${level}: ${message}`;
  }
  const runId = env.GITHUB_RUN_ID;
  const prefixed = runId ? `[run ${runId}] ${message}` : message;
  const parts = [];
  if (props.file != null) parts.push(`file=${escapeProp(String(props.file))}`);
  if (props.line != null) parts.push(`line=${escapeProp(String(props.line))}`);
  if (props.col != null) parts.push(`col=${escapeProp(String(props.col))}`);
  const propStr = parts.length ? ` ${parts.join(',')}` : '';
  return `::${level}${propStr}::${escapeData(prefixed)}`;
}

/** Emit an error annotation (CI) or `error: ...` line (local) to stderr.
 *  @param {string} msg
 *  @param {{file?: string, line?: number|string, col?: number|string}} [props]
 */
export function error(msg, props) {
  console.error(formatAnnotation('error', msg, props, process.env));
}

/** Emit a warning annotation (CI) or `warning: ...` line (local) to stderr.
 *  @param {string} msg
 *  @param {{file?: string, line?: number|string, col?: number|string}} [props]
 */
export function warn(msg, props) {
  console.error(formatAnnotation('warning', msg, props, process.env));
}

/** Emit a notice annotation (CI) or `notice: ...` line (local) to stdout.
 *  Notices are advisory, so they go to stdout (not stderr) -- mirrors the
 *  prior hand-rolled `console.log('::notice::...')` call sites.
 *  @param {string} msg
 *  @param {{file?: string, line?: number|string, col?: number|string}} [props]
 */
export function notice(msg, props) {
  console.log(formatAnnotation('notice', msg, props, process.env));
}
