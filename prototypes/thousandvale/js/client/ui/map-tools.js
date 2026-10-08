// Play-test 8 — what the map gained this round (stream D-UI); worldmap.js and minimap.js call into this file.
//
//   W15  FIND: a filter ("Stable", "Angler", "Class trainer" …) and a search box over every place in the province where
//        somebody serves you. Zoomed in, each match is a pin at its door; zoomed out, the TOWNS that have a match are
//        ringed (with how many) and the other towns fade, and the side panel lists them nearest first.
//        The facts are the game's own data files, read once: data/provinces/offices.json (every town's working
//        buildings), the placed NPCs of the map model (anglers, trainers at their camps), data/provinces/carts.json and E's
//        data/provinces/town-services.json (what all 46 settlements have, also the ones with no door on record).
//   W15  the map REMEMBERS where you left it for the session (sessionStorage `tv.map.view`).
//   W17  quest zones: the ring answers the pointer anywhere inside it — a card with the quest and its objective — and
//        lights up while the pointer is in it (map-render.js draws `hot`).
//
// The rules are pure and node-tested (pt8-core.js): buildServices / findServices / townsWith / areaAt / areaCard.

import { h } from '../ui-panel.js';
import { buildServices, serviceRoles, serviceLabel, findServices, townsWith, areaAt, areaCard, SERVICE_PIN_SCALE } from './pt8-core.js';
import { distText, compass } from './map-data.js';
import { esc } from './tips.js';

const DATA = new URL('../../../data/', import.meta.url);
const j = async path => { try { const r = await fetch(new URL(path, DATA)); return r.ok ? await r.json() : null; } catch { return null; } };
const VIEW_KEY = 'tv.map.view';

/** The session's saved view of the outdoor map: { cx, cz, scale, preset } or null. */
export const savedView = () => { try { const v = JSON.parse(sessionStorage.getItem(VIEW_KEY) || 'null'); return v && Number.isFinite(v.cx) && Number.isFinite(v.cz) && v.scale > 0 ? v : null; } catch { return null; } };
export function saveView(v) { try { sessionStorage.setItem(VIEW_KEY, JSON.stringify({ cx: Math.round(v.cx), cz: Math.round(v.cz), scale: +v.scale.toFixed(4), preset: v.preset || null })); } catch { /* private window */ } }

const TOWN_KINDS = new Set(['town', 'city', 'capital', 'village', 'hamlet']);

export function createMapFind({ atlas, me, onChange = () => {}, onShow = () => {} }) {
  const S = { role: '', query: '', list: null, loading: null, matches: [], towns: [], sig: '' };

  /** Read the data once (in the background, the first time the map opens). */
  function load() {
    if (S.list || S.loading) return S.loading;
    S.loading = (async () => {
      const model = atlas.model || await atlas.src.model().catch(() => null);
      const [offices, carts, townServices] = await Promise.all([j('provinces/offices.json'), j('provinces/carts.json'), j('provinces/town-services.json')]);
      const towns = (model?.pois || []).filter(p => TOWN_KINDS.has(p.kind)).map(p => ({ name: p.name, x: p.x, z: p.z, r: p.r || 90 }));
      const npcs = [...(model?.npcs || new Map()).entries()].map(([id, n]) => ({ id, ...n }));
      // the ox carts' stops (W5, stream E): one carter per town on the road network, world metres
      for (const st of carts?.stops || []) if (Number.isFinite(st.x)) npcs.push({ id: st.carter?.id || st.id, role: 'carter', name: st.carter?.name || '', at: st.town, x: st.x, z: st.z });
      S.list = buildServices({ offices, npcs, towns, townServices });
      S.townAt = new Map(towns.map(t => [t.name, t]));
      drawSelect(); refresh();
    })();
    return S.loading;
  }
  function refresh() {
    S.matches = S.list ? findServices(S.list, { role: S.role, query: S.query }) : [];
    S.towns = townsWith(S.matches, me());
    for (const t of S.towns) { const c = !t.lone && S.townAt?.get(t.town); if (c) { t.x = c.x; t.z = c.z; t.r = c.r; const p = me(); t.dist = p ? Math.hypot(c.x - p.x, c.z - p.z) : null; } }
    S.towns.sort((a, b) => (a.dist ?? 0) - (b.dist ?? 0));
    S.sig = `${S.role}|${S.query}|${S.matches.length}`;
    clear.hidden = !active();
    onChange();
  }
  const active = () => !!(S.role || S.query.trim());

  // ---- the bar: a filter and a search box ----
  const select = h('select', { 'aria-label': 'Show a service', dataset: { find: 'role' }, onchange: e => { S.role = e.target.value; refresh(); } });
  const input = h('input', { type: 'search', placeholder: 'Find a shop or service…', 'aria-label': 'Find a shop or service', dataset: { find: 'query' }, oninput: e => { S.query = e.target.value; refresh(); } });
  const clear = h('button.ghost.small', { type: 'button', hidden: true, dataset: { find: 'clear' }, onclick: () => { S.role = ''; S.query = ''; select.value = ''; input.value = ''; refresh(); } }, 'Clear');
  const bar = h('div.map-find', { role: 'search' }, select, input, clear);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && S.towns[0]) { onShow(S.towns[0]); e.preventDefault(); } if (e.key !== 'Escape') e.stopPropagation(); });
  function drawSelect() {
    const roles = S.list ? serviceRoles(S.list) : [];
    select.replaceChildren(h('option', { value: '' }, 'All services'), ...roles.map(r => h('option', { value: r, selected: S.role === r }, serviceLabel(r))));
    select.value = S.role;
  }
  drawSelect();

  /**
   * What the search adds to the map at this zoom, and which of the map's own markers to fade.
   * `markers` = the map's list (mutated: towns without a match get `dim`). Returns the extra markers.
   */
  function markersFor(markers, scale) {
    if (!active() || !S.list) return [];
    const out = [];
    const have = new Set(S.towns.filter(t => !t.lone).map(t => t.town));
    for (const m of markers) if (TOWN_KINDS.has(m.kind)) { if (have.has(m.name)) m.found = true; else m.dim = true; }
    if (scale >= SERVICE_PIN_SCALE) {
      for (const s of S.matches) out.push({ id: 'svc:' + s.id, kind: 'service', x: s.x, z: s.z, name: s.label, sub: [s.name, s.town].filter(Boolean).join(' · '), priority: 5, size: 6.5, role: s.role });
    } else {
      for (const t of S.towns) out.push({ id: 'svct:' + t.town, kind: 'townhl', x: t.x, z: t.z, name: t.town, sub: t.lone ? '' : `${t.labels.join(', ')}`, n: t.n, priority: 6, size: 12, act: 'zoom' });
    }
    return out;
  }

  /** The side panel's "Found" section (null when nothing is being looked for). */
  function section() {
    if (!active()) return null;
    if (!S.list) return h('section.map-found', {}, h('h4', {}, 'Looking…'));
    const what = S.role ? serviceLabel(S.role) : `“${S.query.trim()}”`;
    if (!S.towns.length) return h('section.map-found', {}, h('h4', {}, `Nothing found for ${what}`), h('p.tiny', {}, 'Try a plainer word: stable, angler, trainer, smith, inn, potions, barber.'));
    const p = me();
    return h('section.map-found', {}, h('h4', {}, `${what} — ${S.towns.length} place${S.towns.length === 1 ? '' : 's'}`),
      h('ul.map-foundlist', {}, ...S.towns.slice(0, 24).map(t => h('li', { dataset: { town: t.town } },
        h('div', {}, h('b', {}, t.town), t.lone ? null : h('small', {}, t.labels.slice(0, 4).join(', ') + (t.labels.length > 4 ? '…' : '')),
          p && t.dist != null ? h('small.dim', {}, t.dist <= (t.r || 60) + 20 ? 'You are here' : `${distText(t.dist)} ${compass(t.x - p.x, t.z - p.z)}`) : null),
        h('button.ghost.small', { type: 'button', onclick: () => onShow(t) }, 'Show')))),
      S.towns.length > 24 ? h('p.tiny', {}, `…and ${S.towns.length - 24} more. Narrow the search.`) : null);
  }

  return {
    bar, load, refresh, markersFor, section, active,
    set({ role, query } = {}) { if (role != null) { S.role = role; select.value = role; } if (query != null) { S.query = query; input.value = query; } refresh(); },
    get state() { return { role: S.role, query: S.query, loaded: !!S.list, services: S.list ? S.list.length : 0, matches: S.matches.length, towns: S.towns.map(t => ({ town: t.town, n: t.n, labels: t.labels })), sig: S.sig }; },
  };
}

/** W17: the quest zone under a world point, with its card as HTML (the map's and the minimap's hover). */
export function questZoneAt(markers, x, z, quests = []) {
  const m = areaAt(markers, x, z);
  if (!m) return null;
  const qid = m.quest ?? (String(m.id).startsWith('qa:') ? String(m.id).split(':')[1] : String(m.id).replace(/^q:/, ''));
  const q = (quests || []).find(x2 => String(x2.id) === String(qid)) || null;
  const c = areaCard(m, q);
  const html = `<div class="tip-title">${esc(c.title)}</div>${c.lines.map(l => `<div class="tip-row qz-row"><span class="qz-label">${esc(l.label)}</span><span>${esc(l.text)}</span></div>`).join('')}<hr><div class="tip-act">${esc(c.foot)}</div>`;
  return { marker: m, quest: q, card: c, html };
}
