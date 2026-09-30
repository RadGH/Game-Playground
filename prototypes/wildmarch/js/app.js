/**
 * app.js — the Wildmarch design-bible site: a home page drawn from data/canon.json and a Markdown
 * viewer for everything in docs/ (listed by docs/index.json, which tools/build-docs-index.mjs writes).
 *
 * Routes (all in the hash, so the site works from any static host and any sub-folder):
 *   #/                      home (brainstorm overview)
 *   #/doc/<id>              a doc, where <id> is its path under docs/ without ".md" (e.g. classes/druid)
 *   #/doc/<id>~<heading>    the same doc, scrolled to a heading id
 *   #/search/<words>        search results across every doc
 */
import { renderMarkdown, slugify } from './md.js';

const $ = sel => document.querySelector(sel);
const content = $('#content');
const nav = $('#nav');
const toc = $('#toc');
const searchBox = $('#search');

let index = { groups: [] };
let canon = null;
const docText = new Map();       // id -> markdown source (cached)
let flatDocs = [];               // docs in reading order, for prev/next

const store = {
  get(k, d) { try { const v = localStorage.getItem('wildmarch.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('wildmarch.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const docHref = (id, slug) => `#/doc/${id}${slug ? '~' + slug : ''}`;
const findDoc = id => flatDocs.find(d => d.id === id);

/* ---------------------------------------------------------------- loading */

async function loadJSON(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

async function loadDoc(id) {
  if (docText.has(id)) return docText.get(id);
  const r = await fetch(`docs/${id}.md`, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`docs/${id}.md was not found (${r.status}).`);
  const t = await r.text();
  docText.set(id, t);
  return t;
}

/* ---------------------------------------------------------------- nav */

function buildNav() {
  const open = store.get('navOpen', {});
  nav.innerHTML = `<a href="#/" data-id="">Home — brainstorm</a>` + index.groups.map(g => {
    const isOpen = open[g.title] ?? g.title !== 'Classes';
    return `<details class="nav-group" data-group="${escHtml(g.title)}"${isOpen ? ' open' : ''}>
      <summary>${escHtml(g.title)} <span class="n">(${g.docs.length})</span></summary>
      ${g.docs.map(d => `<a href="${docHref(d.id)}" data-id="${d.id}" title="${escHtml(d.title)}">
        <span>${escHtml(d.short || d.title)}</span><span class="n">${d.lines}</span></a>`).join('')}
    </details>`;
  }).join('');
  nav.querySelectorAll('details').forEach(el => el.addEventListener('toggle', () => {
    const o = store.get('navOpen', {});
    o[el.dataset.group] = el.open;
    store.set('navOpen', o);
  }));
}

function markNav(id) {
  nav.querySelectorAll('a').forEach(a => a.classList.toggle('active', a.dataset.id === (id ?? '')));
  const a = nav.querySelector(`a[data-id="${CSS.escape(id ?? '')}"]`);
  if (a) {
    const g = a.closest('details');
    if (g && !g.open) g.open = true;
    a.scrollIntoView({ block: 'nearest' });
  }
}

/* ---------------------------------------------------------------- links inside docs */

/** Resolve a relative href found in doc `fromId` into a site route (or a real file URL). */
function resolveLink(fromId, href) {
  if (href.startsWith('#')) return docHref(fromId, href.slice(1));
  const [path, frag] = href.split('#');
  const base = fromId.split('/').slice(0, -1);
  const parts = [...base];
  for (const p of path.split('/')) {
    if (p === '..') parts.pop();
    else if (p && p !== '.') parts.push(p);
  }
  const joined = parts.join('/');
  if (joined.endsWith('.md')) {
    const id = joined.slice(0, -3);
    if (findDoc(id) || !joined.startsWith('..')) return docHref(id, frag);
  }
  return `docs/${joined}${frag ? '#' + frag : ''}`;
}

/* ---------------------------------------------------------------- views */

async function showDoc(id, slug) {
  const meta = findDoc(id);
  content.innerHTML = '<p class="loading">Loading…</p>';
  let text;
  try { text = await loadDoc(id); } catch (e) {
    content.innerHTML = `<div class="doc"><h1>Not written yet</h1><p class="error">${escHtml(e.message)}</p>
      <p>This page is planned but its writer has not finished it. <a href="#/">Back to the overview</a>.</p></div>`;
    toc.innerHTML = '';
    markNav(id);
    return;
  }
  const { html, headings } = renderMarkdown(text, { linkDoc: href => resolveLink(id, href) });
  const i = flatDocs.findIndex(d => d.id === id);
  const prev = flatDocs[i - 1], next = flatDocs[i + 1];
  const metaLine = meta ? `<div class="doc-meta">docs/${escHtml(id)}.md · ${meta.lines} lines · ${meta.words.toLocaleString()} words · <a href="docs/${escHtml(id)}.md" target="_blank">raw</a></div>` : '';
  content.innerHTML = `<article class="doc">${html.replace(/<\/h1>/, '</h1>' + metaLine)}</article>
    <nav class="pager">
      ${prev ? `<a class="prev" href="${docHref(prev.id)}"><small>← Previous</small>${escHtml(prev.title)}</a>` : ''}
      ${next ? `<a class="next" href="${docHref(next.id)}"><small>Next →</small>${escHtml(next.title)}</a>` : ''}
    </nav>`;
  if (!/<h1/.test(html)) content.querySelector('.doc').insertAdjacentHTML('afterbegin', metaLine);

  content.querySelectorAll('a[data-anchor]').forEach(a => {
    a.href = docHref(id, a.dataset.anchor);
    a.addEventListener('click', () => { try { navigator.clipboard?.writeText(location.href.split('#')[0] + docHref(id, a.dataset.anchor)); } catch { /* no clipboard */ } });
  });

  buildToc(headings, id);
  markNav(id);
  document.title = `${meta?.title ?? id} — Wildmarch`;
  scrollToHeading(slug);
}

function scrollToHeading(slug) {
  if (!slug) { window.scrollTo(0, 0); return; }
  const el = document.getElementById(slug);
  if (!el) { window.scrollTo(0, 0); return; }
  el.scrollIntoView();
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1700);
}

let tocObserver = null;
function buildToc(headings, id) {
  const hs = headings.filter(h => h.level === 2 || h.level === 3);
  if (hs.length < 2) { toc.innerHTML = ''; return; }
  toc.innerHTML = `<h4>On this page</h4>` + hs.map(h =>
    `<a class="l${h.level}" href="${docHref(id, h.id)}" data-h="${h.id}">${escHtml(h.text)}</a>`).join('');
  tocObserver?.disconnect();
  tocObserver = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) {
      toc.querySelectorAll('a').forEach(a => a.classList.toggle('here', a.dataset.h === e.target.id));
    }
  }, { rootMargin: '0px 0px -75% 0px' });
  hs.forEach(h => { const el = document.getElementById(h.id); if (el) tocObserver.observe(el); });
}

function showHome() {
  toc.innerHTML = '';
  markNav('');
  document.title = 'Wildmarch — Design Bible';
  const c = canon;
  const total = flatDocs.reduce((s, d) => ({ lines: s.lines + d.lines, words: s.words + d.words }), { lines: 0, words: 0 });
  const roleColour = r => c.roles[r] || '#888';
  const classLink = ([id, name, role, mech]) => {
    const has = findDoc(`classes/${id}`);
    return `<a href="${docHref('classes/' + id)}" class="${has ? '' : 'missing'}" style="border-left-color:${roleColour(role)}" title="${has ? '' : 'not written yet'}">
      <b>${escHtml(name)}</b><span>${escHtml(role)} · ${escHtml(mech)}</span></a>`;
  };
  const pct = lvl => ((lvl - 1) / 59) * 100;
  const bands = c.regions.map(([id, name, lo, hi, col]) => {
    const pins = c.instances.filter(([iid]) => INSTANCE_REGION[iid.slice(0, 3)] === id)
      .map(([iid, iname, kind, lvl]) => `<span class="pin ${kind}" style="left:${pct(lvl)}%" title="${escHtml(iname)} (${kind}, level ${lvl})"></span>`).join('');
    const w = Math.max(pct(hi) - pct(lo), 1.6);
    return `<div class="band"><span>${escHtml(name)}</span><div class="track">
      <div class="bar" style="left:${pct(lo)}%;width:${w}%;background:${col}">${lo === hi ? lo : `${lo}–${hi}`}</div>${pins}</div></div>`;
  }).join('');
  const startHere = [
    ['WOW-AUDIT', 'WoW audit — your call', '40 things borrowed from World of Warcraft: remove, reshape or keep.'],
    ['00-OVERVIEW', 'The canon', 'Names, ids, level bands, the class list and the rules every page follows.'],
    ['07-PROGRESSION', 'Earn every verb', 'The level 1–60 feature-unlock ladder: mounts, dodge, talents, raids.'],
    ['classes/druid', 'The Druid', 'Caster, Bear, Cat, Owl and Stag — a full spell bar per form.'],
    ['11-BOSS-MECHANICS', 'Boss mechanics', 'Void zones, danger zones, soaks and bosses that talk.'],
    ['09-SETS-LEGENDARIES', 'Sets & legendaries', 'Generic sets, legendary powers and the class-set index.'],
    ['QUESTIONS', 'Open questions', 'Decisions waiting on you before anything gets built.'],
  ].map(([id, t, p]) => `<a class="card" href="${docHref(id)}"><h3>${escHtml(t)}</h3><p>${escHtml(p)}</p></a>`).join('');

  content.innerHTML = `<div class="home">
    <section class="hero">
      <span class="status">DOCS ONLY · NOTHING BUILT YET · AWAITING YOUR REVIEW</span>
      <h1>${escHtml(c.title)}</h1>
      <p class="tag">“${escHtml(c.tagline)}”</p>
      <p>${escHtml(c.pitch)}</p>
      <div class="stats">
        <div><b>${flatDocs.length}</b><span>pages</span></div>
        <div><b>${total.words.toLocaleString()}</b><span>words</span></div>
        <div><b>${c.classes.length}</b><span>classes</span></div>
        <div><b>${c.classes.length * 6}</b><span>bespoke spells</span></div>
        <div><b>${c.instances.filter(i => i[2] === 'dungeon').length}</b><span>dungeons</span></div>
        <div><b>${c.instances.filter(i => i[2] === 'raid').length}</b><span>raids</span></div>
      </div>
    </section>
    <h2>Start here</h2>
    <div class="cards">${startHere}</div>
    <h2>Pillars</h2>
    <div class="cards">${c.pillars.map(([t, p]) => `<div class="card"><h3>${escHtml(t)}</h3><p>${escHtml(p)}</p></div>`).join('')}</div>
    <h2>The thirty classes</h2>
    <div class="role-legend">${Object.entries(c.roles).map(([r, col]) => `<span><i style="background:${col}"></i>${r}</span>`).join('')}</div>
    <div class="class-grid">${c.classes.map(classLink).join('')}</div>
    <h2>The road north — level bands</h2>
    <div class="role-legend"><span><i style="background:var(--fg2)"></i>dungeon</span><span><i style="background:var(--ember)"></i>raid</span></div>
    <div class="bands">${bands}<div class="axis"><span></span><div><span>1</span><span>15</span><span>30</span><span>45</span><span>60</span></div></div></div>
  </div>`;
  window.scrollTo(0, 0);
}

/** Which region's band each dungeon/raid pin sits on (mirrors 00-OVERVIEW §8–9). */
const INSTANCE_REGION = {
  d01: 'hearthvale', d02: 'mossfen', d03: 'greyridge', d04: 'greyridge', d05: 'sunscar', d06: 'sunscar',
  d07: 'whisperwood', d08: 'whisperwood', d09: 'cinder_steppe', d10: 'frostmantle', d11: 'drowned_coast',
  d12: 'riftmarch', d13: 'emberthrone', d14: 'emberthrone', r01: 'greyridge', r02: 'frostmantle',
  r03: 'drowned_coast', r04: 'emberthrone', r05: 'veilspire',
};
/* ---------------------------------------------------------------- search */

let allLoaded = null;
async function loadAll() {
  if (!allLoaded) allLoaded = Promise.all(flatDocs.map(d => loadDoc(d.id).catch(() => '')));
  return allLoaded;
}

async function showSearch(q) {
  toc.innerHTML = '';
  markNav(null);
  searchBox.value = q;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) { showHome(); return; }
  content.innerHTML = `<p class="loading">Searching ${flatDocs.length} pages…</p>`;
  await loadAll();
  const results = [];
  for (const d of flatDocs) {
    const text = docText.get(d.id) || '';
    const lines = text.split('\n');
    let heading = '';
    let headingSlug = '';
    const used = new Map();
    for (const line of lines) {
      const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
      if (h) {
        heading = h[2];
        const base = slugify(h[2]) || 'section';
        const n = used.get(base) || 0; used.set(base, n + 1);
        headingSlug = n ? `${base}-${n}` : base;
      }
      const low = line.toLowerCase();
      if (words.every(w => low.includes(w))) {
        results.push({ d, heading, headingSlug, line: line.trim(), score: (h ? 5 : 1) + (d.title.toLowerCase().includes(words[0]) ? 2 : 0) });
      }
    }
  }
  results.sort((a, b) => b.score - a.score);
  const shown = results.slice(0, 200);
  const mark = s => { let out = escHtml(s.length > 260 ? s.slice(0, 260) + '…' : s); for (const w of words) out = out.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>'); return out; };
  content.innerHTML = `<div class="doc"><h1>Search: “${escHtml(q)}”</h1>
    <p class="doc-meta">${results.length} matching line${results.length === 1 ? '' : 's'}${results.length > shown.length ? ` — showing the first ${shown.length}` : ''}.</p></div>
    <div class="results">${shown.map(r => `<a class="result" href="${docHref(r.d.id, r.headingSlug)}">
      <small>${escHtml(r.d.title)}${r.heading ? ' › ' + escHtml(r.heading) : ''}</small><p>${mark(r.line.replace(/^[#>*\-|\s]+/, ''))}</p></a>`).join('') || '<p class="loading">Nothing found.</p>'}</div>`;
  document.title = `Search: ${q} — Wildmarch`;
  window.scrollTo(0, 0);
}

/* ---------------------------------------------------------------- router */

function route() {
  document.body.classList.remove('nav-open');
  $('#navToggle').setAttribute('aria-expanded', 'false');
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  if (h.startsWith('doc/')) {
    const [id, slug] = h.slice(4).split('~');
    showDoc(id, slug);
  } else if (h.startsWith('search/')) {
    showSearch(h.slice(7));
  } else if (/^[\w-]/.test(h) && findDoc(h.split('~')[0])) {
    // tolerate "#05-COMBAT" style links
    const [id, slug] = h.split('~');
    showDoc(id, slug);
  } else {
    showHome();
  }
}

let searchTimer = 0;
searchBox.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const q = searchBox.value.trim();
    location.hash = q ? `#/search/${encodeURIComponent(q)}` : '#/';
  }, 280);
});
document.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement !== searchBox && !/input|textarea/i.test(document.activeElement.tagName)) {
    e.preventDefault(); searchBox.focus(); searchBox.select();
  } else if (e.key === 'Escape') {
    document.body.classList.remove('nav-open');
    if (document.activeElement === searchBox) searchBox.blur();
  }
});
$('#navToggle').addEventListener('click', () => {
  const open = document.body.classList.toggle('nav-open');
  $('#navToggle').setAttribute('aria-expanded', String(open));
});
window.addEventListener('hashchange', route);

(async function boot() {
  try {
    [index, canon] = await Promise.all([loadJSON('docs/index.json'), loadJSON('data/canon.json')]);
  } catch (e) {
    content.innerHTML = `<p class="error">Could not load the page list: ${escHtml(e.message)}</p>`;
    return;
  }
  flatDocs = index.groups.flatMap(g => g.docs);
  buildNav();
  route();
})();
