/**
 * Heron form-fill bookmarklet.
 *
 * Drag the wrapper link from /settings to your bookmarks bar. While viewing
 * a Greenhouse / Ashby / Lever job application, click the bookmark. The
 * script:
 *   1. Detects the portal from window.location
 *   2. Scrapes the visible label/textarea/select pairs into a question list
 *   3. POSTs them to http://localhost:5174/api/answer-form along with
 *      window.location.href (so the dashboard can match the URL to a
 *      pipeline job for context)
 *   4. Receives back a list of {label, value} pairs and fills the matching
 *      fields on the page. The user reviews, tweaks any answers that
 *      sound off, and clicks the portal's Submit button themselves.
 *
 * NOTE: This file is the SOURCE -- what gets pasted into a bookmark bar is
 * the minified IIFE wrapped in `javascript:` per the Settings page.
 */

(function () {
  'use strict';

  const DASHBOARD = window.__HERON_HOST__ || 'http://localhost:5174';
  const ENDPOINT = DASHBOARD + '/api/answer-form';

  function toast(msg, kind) {
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:16px',
      'padding:10px 14px',
      'border-radius:8px',
      'font:13px/1.4 system-ui',
      'color:#fff',
      'z-index:2147483647',
      `background:${kind === 'error' ? '#dc2626' : kind === 'warn' ? '#d97706' : '#16a34a'}`,
      'box-shadow:0 6px 16px rgba(0,0,0,0.25)',
    ].join(';');
    document.body.appendChild(el);
    setTimeout(function () {
      el.remove();
    }, 5500);
  }

  // Hostname exact-or-subdomain match. CodeQL flagged the previous
  // host.indexOf('domain') shape under js/incomplete-url-substring-sanitization
  // because `attacker.greenhouse.io.evil.com` would have matched. Strip the
  // port, lowercase, then require equality or a `.<allowed>` suffix.
  function hostnameMatches(host, allowed) {
    const h = (host || '').toLowerCase().split(':')[0];
    for (let i = 0; i < allowed.length; i++) {
      const d = allowed[i];
      if (h === d || (h.length > d.length + 1 && h.slice(-d.length - 1) === `.${d}`)) {
        return true;
      }
    }
    return false;
  }

  function detectPortal() {
    const h = window.location.hostname;
    if (hostnameMatches(h, ['greenhouse.io'])) {
      return 'greenhouse';
    }
    if (hostnameMatches(h, ['ashbyhq.com'])) {
      return 'ashby';
    }
    if (hostnameMatches(h, ['lever.co'])) {
      return 'lever';
    }
    return null;
  }

  // Walk the DOM for input/textarea/select elements that have a visible label.
  // Returns an array of { label, type, ref } where ref is the actual element.
  function scrapeQuestions() {
    const out = [];
    const fields = document.querySelectorAll(
      'textarea, input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="url"], select',
    );
    fields.forEach(function (f) {
      // Skip hidden / disabled fields
      const rect = f.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        return;
      }
      if (f.disabled || f.readOnly) {
        return;
      }

      // Strategy 1: <label for="id"> closest match
      let label = '';
      if (f.id) {
        const el = document.querySelector('label[for="' + CSS.escape(f.id) + '"]');
        if (el) {
          label = el.textContent.trim();
        }
      }
      // Strategy 2: surrounding <label> ancestor
      if (!label) {
        const parent = f.closest('label');
        if (parent) {
          const clone = parent.cloneNode(true);
          // Strip the field itself from the clone before reading text
          const inputs = clone.querySelectorAll('input, textarea, select');
          inputs.forEach(function (i) {
            i.remove();
          });
          label = clone.textContent.trim();
        }
      }
      // Strategy 3: aria-label / placeholder / nearest preceding text node
      if (!label) {
        label = f.getAttribute('aria-label') || '';
      }
      if (!label) {
        label = f.placeholder || '';
      }
      if (!label) {
        const prev = f.previousElementSibling;
        if (prev) {
          label = prev.textContent.trim();
        }
      }
      if (!label) {
        return;
      } // skip unlabelled fields -- we can't match them

      const type =
        f.tagName.toLowerCase() === 'textarea'
          ? 'long-text'
          : f.tagName.toLowerCase() === 'select'
            ? 'select'
            : f.type === 'email'
              ? 'email'
              : f.type === 'tel'
                ? 'phone'
                : f.type === 'number'
                  ? 'number'
                  : 'short-text';
      out.push({ label: label.slice(0, 200), type, ref: f });
    });
    return out;
  }

  function setFieldValue(el, value) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'select') {
      // Match by value or by visible text
      const opts = el.querySelectorAll('option');
      for (let i = 0; i < opts.length; i++) {
        if (opts[i].value === value || opts[i].textContent.trim() === value) {
          el.value = opts[i].value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    }
    const setter = Object.getOwnPropertyDescriptor(
      tag === 'textarea' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
      'value',
    ).set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function normalize(s) {
    return (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  async function run() {
    const portal = detectPortal();
    if (!portal) {
      toast('heron: not on a Greenhouse/Ashby/Lever page. Bookmarklet aborted.', 'warn');
      return;
    }
    const questions = scrapeQuestions();
    if (questions.length === 0) {
      toast('heron: no labelled form fields found on this page.', 'warn');
      return;
    }
    toast(`heron: filling ${questions.length} fields…`, 'info');

    const payloadQuestions = questions.map(function (q) {
      return { label: q.label, type: q.type };
    });
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: window.location.href,
          portal: portal,
          questions: payloadQuestions,
        }),
      });
      if (!res.ok) {
        let msg = 'HTTP ' + res.status;
        try {
          const e = await res.json();
          msg = (e && e.error && e.error.message) || msg;
        } catch (_) {}
        toast(`heron: ${msg}`, 'error');
        return;
      }
      const data = await res.json();
      if (!data.ok) {
        toast(`heron: ${data.error || 'unknown error'}`, 'error');
        return;
      }
      // Fill answers -- map by normalized label
      const answers = data.answers || [];
      const byLabel = {};
      answers.forEach(function (a) {
        byLabel[normalize(a.label)] = a.value;
      });
      let filled = 0;
      questions.forEach(function (q) {
        const v = byLabel[normalize(q.label)];
        if (v != null && v !== '') {
          if (setFieldValue(q.ref, String(v))) {
            filled += 1;
          }
        }
      });
      const missed = questions.length - filled;
      toast(
        `heron: filled ${filled} of ${questions.length} fields${
          missed ? ' · ' + missed + ' skipped' : ''
        }. Review and click Submit.`,
        filled > 0 ? 'info' : 'warn',
      );
    } catch (e) {
      toast(
        `heron: ${e && e.message ? e.message : 'request failed'}. Is the dashboard running on ${
          DASHBOARD
        }?`,
        'error',
      );
    }
  }

  run();
})();
