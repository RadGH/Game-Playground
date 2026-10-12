// The experiments home page. Everything on it is drawn from data/experiments.json (one row per card) and
// data/live-links.json (public URLs of games that run on their own server). Adding an experiment is one row
// in the JSON — see the `about` line at the top of that file for the fields.
//
// Pure helpers (filterEntries, serverUrl, onPublicSite, statusLabel) are exported so tests/experiments.test.js
// can check them without a browser.
import { el } from '../shared/ui.js';

export const STATUS = {
  done: { label: 'Done', cls: 'ok', tip: 'Finished and documented. Safe to build on.' },
  playable: { label: 'Playable', cls: 'ok', tip: 'A game you can play start to finish (or close to it).' },
  prototype: { label: 'Prototype', cls: 'warn', tip: 'Works, but nothing depends on it yet and it may change.' },
  docs: { label: 'Design docs', cls: 'warn', tip: 'Written up, not built.' },
  deprecated: { label: 'Deprecated', cls: 'bad', tip: 'Kept for reference. Do not build new work on it.' },
};
export const statusLabel = s => (STATUS[s] || { label: s }).label;

/** GitHub Pages (or any public static host) cannot reach a game server on this network. */
export const onPublicSite = hostname => /(^|\.)github\.io$/i.test(hostname || '');

/** Where a game with its own server lives, seen from the machine that opened this page. */
export function serverUrl(server, hostname) {
  if (!server || !hostname || onPublicSite(hostname)) return null;
  const host = hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname;   // bare IPv6
  return `http://${host}:${server.port}/${String(server.path || '').replace(/^\/+/, '')}`;
}

/** Entries matching the search text (every word must appear somewhere) and the status chip. */
export function filterEntries(entries, { q = '', status = 'all' } = {}) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter(e => {
    if (status === 'new' ? !e.isNew : status === 'deprecated' ? !(e.status === 'deprecated' || e.deprecated) : status !== 'all' && e.status !== status) return false;
    if (!words.length) return true;
    const hay = [e.title, e.summary, e.status, statusLabel(e.status), e.statusNote, e.folder, e.deprecated, ...(e.tags || []), ...(e.links || []).map(l => l.label)].join(' ').toLowerCase();
    return words.every(w => hay.includes(w));
  });
}

function card(e, live, hostname) {
  const st = STATUS[e.status] || { label: e.status, cls: '' };
  const head = el('div', { class: 'xcard-head' },
    el('h3', {}, e.href ? el('a', { href: e.href, text: e.title }) : e.title),
    e.isNew ? el('span', { class: 'badge new', text: 'New', 'data-tip': 'Added in the latest round.' }) : null,
    el('span', { class: 'badge ' + st.cls, text: st.label + (e.statusNote ? ' · ' + e.statusNote : ''), 'data-tip': st.tip || '' }),
    e.deprecated && e.status !== 'deprecated' ? el('span', { class: 'badge bad', text: 'Part deprecated', 'data-tip': e.deprecated }) : null,
    e.date ? el('span', { class: 'xcard-date muted small', text: e.date, 'data-tip': 'Last milestone' }) : null);

  const actions = el('div', { class: 'xcard-actions' });
  if (e.href) actions.append(el('a', { class: 'btn primary', href: e.href, text: 'Open' }));
  if (e.server) {
    const url = serverUrl(e.server, hostname);
    if (url) actions.append(el('a', { class: 'btn primary', href: url, text: 'Play on this network', 'data-role': 'network', 'data-tip': `The stable game server on this machine, port ${e.server.port}. Works for anyone on the same network.` }));
  }
  const link = e.live && live?.[e.live];
  if (link?.url) {
    actions.append(el('a', { class: 'btn live', href: link.url, target: '_blank', rel: 'noopener', text: 'Live link', 'data-role': 'live', 'data-tip': [link.note, link.updated ? 'Checked ' + link.updated : ''].filter(Boolean).join('. ') }));
  }
  for (const l of e.links || []) actions.append(el('a', { class: 'btn', href: l.href, text: l.label }));
  const readme = e.readme || (e.folder ? e.folder + '/README.md' : null);
  if (readme) actions.append(el('a', { class: 'btn quiet', href: readme, text: e.readme ? 'Docs' : 'README', 'data-tip': 'How it works and how to reuse it (plain text).' }));

  return el('article', { class: 'panel xcard' + (e.status === 'deprecated' ? ' is-deprecated' : ''), id: 'card-' + e.id, 'data-id': e.id, 'data-status': e.status },
    head,
    el('p', { class: 'xcard-summary', text: e.summary }),
    e.deprecated ? el('p', { class: 'xcard-note small', text: e.deprecated }) : null,
    link?.note && e.live ? el('p', { class: 'xcard-note small muted', text: `Live link: ${link.note}${link.updated ? ' (checked ' + link.updated + ')' : ''}.` }) : null,
    el('div', { class: 'xcard-tags' }, ...(e.tags || []).map(t => el('span', { class: 'badge tag', text: t }))),
    actions);
}

export async function mount(root, { hostname = location.hostname } = {}) {
  const [data, live] = await Promise.all([
    fetch(new URL('../data/experiments.json', import.meta.url)).then(r => r.json()),
    fetch(new URL('../data/live-links.json', import.meta.url)).then(r => r.json()).catch(() => ({})),
  ]);
  const state = { q: '', status: 'all' };
  try { const h = new URLSearchParams(location.hash.slice(1)); state.q = h.get('q') || ''; state.status = h.get('status') || 'all'; } catch { /* no hash */ }

  const search = el('input', { type: 'text', id: 'home-search', placeholder: 'Search experiments (name, tag, status…)', value: state.q, 'aria-label': 'Search experiments' });
  const count = el('span', { class: 'muted small', id: 'home-count', role: 'status' });
  const chips = el('div', { class: 'chips', id: 'home-status' });
  const CHIPS = [['all', 'All'], ['new', 'New'], ['playable', 'Playable'], ['done', 'Done'], ['prototype', 'Prototype'], ['docs', 'Design docs'], ['deprecated', 'Deprecated']];
  const jump = el('nav', { class: 'home-jump small', 'aria-label': 'Sections' });
  const list = el('div', { id: 'home-list' });
  root.replaceChildren(el('div', { class: 'home-tools' }, search, chips, count), jump, list);

  function draw() {
    chips.replaceChildren(...CHIPS.map(([id, label]) => el('button', { class: 'chip' + (state.status === id ? ' on' : ''), type: 'button', text: label, 'data-status': id, 'aria-pressed': String(state.status === id), onclick: () => { state.status = id; draw(); } })));
    const shown = filterEntries(data.entries, state);
    const sections = [];
    jump.replaceChildren();
    for (const g of data.groups) {
      const rows = shown.filter(e => e.group === g.id);
      if (!rows.length) continue;
      jump.append(el('a', { href: '#group-' + g.id, text: `${g.title} (${rows.length})` }));
      sections.push(el('section', { class: 'home-group', id: 'group-' + g.id },
        el('h2', {}, g.title, el('span', { class: 'muted small', text: ' ' + rows.length })),
        el('p', { class: 'muted small', text: g.blurb }),
        el('div', { class: 'xcards' }, ...rows.map(e => card(e, live, hostname)))));
    }
    if (!sections.length) sections.push(el('p', { class: 'muted', id: 'home-empty', text: 'Nothing matches. Clear the search or pick "All".' }));
    list.replaceChildren(...sections);
    count.textContent = `${shown.length} of ${data.entries.length}`;
    const h = new URLSearchParams(); if (state.q) h.set('q', state.q); if (state.status !== 'all') h.set('status', state.status);
    // keep an in-page anchor (#group-…, #card-…) the visitor arrived on
    if (h.toString() || /^#(q|status)=/.test(location.hash)) history.replaceState(null, '', h.toString() ? '#' + h : location.pathname + location.search);
  }
  search.addEventListener('input', () => { state.q = search.value; draw(); });
  draw();
  return { data, live, state, draw };
}

if (typeof document !== 'undefined' && document.getElementById('home')) {
  const { installTooltips } = await import('../shared/tooltip.js');
  installTooltips();
  mount(document.getElementById('home')).then(api => { window.homePage = api; }).catch(e => {
    document.getElementById('home').textContent = 'Could not load the experiments list: ' + e.message; console.error(e);
  });
}
