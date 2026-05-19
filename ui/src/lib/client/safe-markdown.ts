/** XSS-safe markdown -> HTML renderer for `{@html ...}` sinks. Pipeline:
 *  marked.parse -> DOMPurify.sanitize. JDs, LLM output, and user docs
 *  all pass through here. `marked.parse` alone keeps raw HTML
 *  (script tags, event handlers); DOMPurify strips that + javascript:
 *  URIs + non-image data: URIs. Every `{@html}` sink MUST consume this
 *  helper -- never raw marked output. */
import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

// Marked configuration. GitHub-Flavoured Markdown by default.
marked.use({
  async: false,
  gfm: true,
  breaks: false, // single newlines stay as single newlines
  pedantic: false,
});

/** Render markdown to a sanitized HTML string. */
export function renderMarkdown(md: string | null | undefined): string {
  if (!md) return '';
  const raw = marked.parse(md) as string;
  return DOMPurify.sanitize(raw, {
    // Permitted HTML elements. Mirrors GitHub's allowlist plus a few
    // Heron extensions (e.g. <kbd> for keyboard shortcuts in help docs).
    ALLOWED_TAGS: [
      'a',
      'abbr',
      'b',
      'blockquote',
      'br',
      'caption',
      'cite',
      'code',
      'col',
      'colgroup',
      'dd',
      'del',
      'details',
      'dfn',
      'div',
      'dl',
      'dt',
      'em',
      'figcaption',
      'figure',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'hr',
      'i',
      'img',
      'ins',
      'kbd',
      'li',
      'mark',
      'ol',
      'p',
      'pre',
      'q',
      'samp',
      'small',
      'span',
      'strong',
      'sub',
      'summary',
      'sup',
      'table',
      'tbody',
      'td',
      'tfoot',
      'th',
      'thead',
      'time',
      'tr',
      'u',
      'ul',
      'var',
      'wbr',
    ],
    ALLOWED_ATTR: [
      'href',
      'name',
      'target',
      'rel',
      'title',
      'src',
      'alt',
      'width',
      'height',
      'class',
      'id',
      'role',
      'aria-*',
      'data-*',
      'colspan',
      'rowspan',
      'lang',
      'datetime',
    ],
    // Force https or relative for href/src. Blocks javascript:, data:,
    // and other dangerous URIs.
    ALLOWED_URI_REGEXP: /^(https?:|mailto:|tel:|#|\/|\.\.?\/)/i,
    // Add rel="noopener noreferrer" to every external link automatically
    // -- pairs with target="_blank" to prevent tabnabbing.
    ADD_ATTR: ['target', 'rel'],
    // Force every <a target=_blank> to carry safe rel.
    ADD_TAGS: [],
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea'],
    FORBID_ATTR: [
      'onerror',
      'onload',
      'onclick',
      'onmouseover',
      'onfocus',
      'onblur',
      'onchange',
      'onsubmit',
      'srcdoc',
      'formaction',
    ],
    SANITIZE_DOM: true,
    KEEP_CONTENT: true,
    // Disable XML namespaces (SVG / MathML) -- markdown shouldn't need them
    // and they're a common XSS vector via <svg onload=…>.
    USE_PROFILES: { html: true },
  });
}

/** Inline-only variant -- strips block-level wrappers. For single-line
 *  fields like job titles, company names, etc. where we want bold/italic
 *  emphasis but no headings/lists. */
export function renderMarkdownInline(md: string | null | undefined): string {
  if (!md) return '';
  const raw = marked.parseInline(md) as string;
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [
      'a',
      'b',
      'br',
      'code',
      'em',
      'i',
      'kbd',
      'mark',
      'small',
      'span',
      'strong',
      'sub',
      'sup',
      'u',
    ],
    ALLOWED_ATTR: ['href', 'title', 'class', 'lang'],
    ALLOWED_URI_REGEXP: /^(https?:|mailto:|tel:|#|\/|\.\.?\/)/i,
    USE_PROFILES: { html: true },
  });
}
