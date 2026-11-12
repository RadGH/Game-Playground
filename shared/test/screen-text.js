// Rendered-text check for browser tests (docs/lessons-from-games.md Part 4 check 1). Owner 2026-11-11: numbers that
// don't round, NaN, code names ("dust"), "[object …]", leftover {placeholders}. Run it on every screen a test opens:
//   import { screenTextProblems } from '../../../shared/test/screen-text.js';
//   const bad = await page.evaluate(screenTextProblems, { allow: ['N/A'] });   assert.deepEqual(bad, []);
// Also: a scroller nested in another scroller, and a page wider than the screen.
// It reads only what is VISIBLE (display, visibility, size), so hidden templates don't count.
export function screenTextProblems(opts = {}) {
  const allow = new Set(opts.allow || []);
  const RULES = [
    ['long decimal', /\d+\.\d{3,}/],
    ['NaN', /\bNaN\b/],
    ['undefined', /\bundefined\b/],
    ['null', /(^|\s)null(\s|$)/],
    ['[object', /\[object /],
    ['placeholder', /\{[a-zA-Z_]+\}/],
    ['code name', /\b[a-z]+_[a-z0-9_]+\b/],          // snake_case ids leaking into the page
    ['Infinity', /\bInfinity\b/],
  ];
  const seen = new Set(), out = [];
  const visible = el => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05; };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.trim(); if (!t || allow.has(t)) continue;
    const el = n.parentElement; if (!el || el.closest('script,style,noscript,textarea,input,[data-lint-skip]') || !visible(el)) continue;
    for (const [what, re] of RULES) if (re.test(t)) { const k = what + '|' + t; if (!seen.has(k)) { seen.add(k); out.push({ what, text: t.slice(0, 80) }); } }
  }
  // browser tooltips on anything visible
  for (const el of document.querySelectorAll('[title]')) if (el.getAttribute('title') && visible(el) && !el.closest('[data-lint-skip]')) out.push({ what: 'browser tooltip', text: (el.getAttribute('title') || '').slice(0, 60) });
  // one scroller per screen (lessons rule 11): a visible scroller that can scroll, inside another one that can
  const scrolls = el => { const s = getComputedStyle(el); return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 2; };
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || !scrolls(el) || el.closest('[data-lint-skip]')) continue;
    for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) if (visible(up) && scrolls(up)) {
      const name = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.classList[0] ? '.' + e.classList[0] : '');
      out.push({ what: 'nested scroller', text: `${name(el)} inside ${name(up)}` }); break;
    }
  }
  // no sideways page scroll on a phone (rule 11/14)
  const over = document.documentElement.scrollWidth - window.innerWidth;
  if (over > 2) out.push({ what: 'sideways scroll', text: `page is ${over}px wider than the screen` });
  return out;
}
