// The Journal (play-test P17, key J): every quest you carry with a plain goal line, every step and how far along it
// is, WHERE the current step happens (place name, distance and direction, "Show on map"), who gave it, what it pays,
// a Track button (the tracked quest leads the HUD tracker and gets an arrow on the minimap rim) and Abandon.
// Plus the quests you have finished. Data: the server's `quests {active, done}` (protocol §15.9) through the atlas.
//
// Also the HUD quest tracker (top right, under the minimap): the tracked quest first with its goal and where to go,
// then up to three more, one line each.

import { createPanel, h, confirmBox } from '../ui-panel.js';
import { bandTone, titleCase } from './map-data.js';
import { crateRewards, catchRows, anglingText, rarityClass } from './pt5-core.js';
import { zoneName } from '../names.js';

export function rewardWords(r) {
  if (!r) return [];
  if (r.text) return [r.text];            // the server's own reward line (protocol §21.4)
  const out = [];
  if (r.xp) out.push(`${Math.round(r.xp * 100)}% of a level in experience`);
  if (r.gold) out.push(`${r.gold} gold`);
  if (r.item) { const t = typeof r.item === 'string' ? r.item : r.item.tier || 'good'; out.push(`${/^[aeiou]/i.test(t) ? 'an' : 'a'} ${t} item`); }
  out.push(...crateRewards(r));                 // T9: "Crate: boots (Magic or better)"
  return out;
}

export function createJournal({ atlas, net, me, hud, worldMap }) {
  const panel = createPanel({ id: 'journal', title: 'Journal', width: 640, cls: 'journal-panel', onOpen: () => draw(true) });
  const S = { sel: null, tab: 'active', done: [], last: '' };
  // T25 (play-test 5): the Catch tab — set by ui/pt5.js: { data: () => E's angling.json, angling: () => you.angling }
  let catchSrc = null;
  const extraTabs = [];          // play-test 8: [{ id, label, draw(page) }]
  function catchModel() {
    const a = catchSrc?.angling?.() || null, d = catchSrc?.data?.() || null;
    if (!d || !(d.fish || []).length) return null;
    // A sends catches per species ({n, best, zone, zones}) — or per zone ({zone: {species: {n, best}}}) as saved
    let catches = a?.catches || null;
    if (!catches && a?.caught) { catches = {}; for (const [z, m] of Object.entries(a.caught)) for (const [sp, c] of Object.entries(m || {})) { const o = catches[sp] ||= { n: 0, best: null, zone: z }; o.n += c.n || 0; if (c.best != null && (o.best == null || c.best > o.best)) { o.best = c.best; o.zone = z; } } }
    return { rows: catchRows(d, { catches: catches || {}, legends: a?.legends || [] }, z => zoneName(z) || z), angling: a };
  }
  function drawCatch(tabs) {
    const m = catchModel();
    if (!m) { panel.fill(tabs, h('div.j-empty', {}, h('p', {}, 'Nothing caught yet.'), h('p.tiny', {}, 'Find the angler by the water near Torborhold: they will lend you a rod. Then face any water and press X.'))); return; }
    const R = m.rows, a = m.angling ? anglingText(m.angling) : null;
    const fish = r => h('li.jc-fish' + (r.known ? '.known' : ''), { dataset: { id: r.id, ...(r.hint ? { tip: r.hint } : {}) } },
      h('b.r-' + rarityClass(r.rarity), {}, r.name), r.known ? h('span', {}, `× ${r.n}`) : h('span.dim', {}, r.hint || 'not yet caught'), r.bestText ? h('em', {}, `biggest ${r.bestText}`) : null);
    panel.fill(tabs,
      h('div.jc-top', {},
        a ? h('div.jc-skill', {}, h('b', {}, a.text), h('div.jc-bar', {}, h('i', { style: `width:${(a.frac * 100).toFixed(1)}%` })), h('small', {}, a.sub)) : null,
        h('div.jc-sum', {}, h('span', {}, h('b', {}, `${R.found} / ${R.total}`), ' species found'), h('span', {}, h('b', {}, `${R.legendsFound} / ${R.legends.length}`), ' legends landed'), R.biggest ? h('span', {}, 'Biggest: ', h('b', {}, R.biggest.text)) : null)),
      h('div.jc-body', {},
        ...R.groups.map(g => h('section.jc-group', {}, h('h4', {}, g.name, h('small', {}, ` ${g.found} / ${g.rows.length}`)), h('ul', {}, ...g.rows.map(fish)))),
        R.legends.length ? h('section.jc-group.legends', {}, h('h4', {}, 'Legends', h('small', {}, ' one in every zone')), h('ul', {}, ...R.legends.map(l => h('li.jc-fish.legend' + (l.known ? '.known' : ''), { dataset: l.hint ? { tip: l.hint } : {} },
          h('b', {}, l.known ? '★ ' + l.name : '☆ ' + l.name), h('span' + (l.known ? '' : '.dim'), {}, l.known ? (l.title ? `Title: ${l.title}` : l.zone) : (l.hint || l.zone)), l.bestText ? h('em', {}, l.bestText) : null)))) : null));
  }

  function where(q) {
    const L = q.loc; if (!L) return q.where ? titleCase(q.where) : '';
    const w = atlas.whereText(L, L.exact ? L.r : 0);
    if (!L.exact) return `Somewhere in ${L.name} — ${w}`;
    return `${L.name ? L.name + ' — ' : ''}${w === 'here' ? 'you are there' : w}`;
  }
  function list() {
    const qs = atlas.quests.slice().sort((a, b) => (b.id === atlas.tracked) - (a.id === atlas.tracked) || (b.ready - a.ready) || (a.level || 0) - (b.level || 0));
    return qs;
  }
  function draw(force = false) {
    if (!panel.isOpen) return;
    const qs = list();
    const p = me();
    const key = JSON.stringify([S.tab, S.tab === 'catch' ? catchSrc?.angling?.() : 0, S.sel, atlas.tracked, qs.map(q => [q.id, q.step, q.goal, q.loc && Math.round(Math.hypot(q.loc.x - (p?.x || 0), q.loc.z - (p?.z || 0)) / 25)]), S.done.length]);
    if (!force && key === S.last) return;
    S.last = key;
    if (!qs.some(q => q.id === S.sel)) S.sel = atlas.tracked || qs[0]?.id || null;
    const tabs = h('div.chips.j-tabs', { role: 'tablist' },
      h('button.chip', { type: 'button', role: 'tab', 'aria-checked': String(S.tab === 'active'), onclick: () => { S.tab = 'active'; draw(true); } }, `Quests (${qs.length})`),
      h('button.chip', { type: 'button', role: 'tab', 'aria-checked': String(S.tab === 'done'), onclick: () => { S.tab = 'done'; draw(true); } }, `Finished (${S.done.length})`),
      catchSrc ? h('button.chip', { type: 'button', role: 'tab', dataset: { tab: 'catch' }, 'aria-checked': String(S.tab === 'catch'), onclick: () => { S.tab = 'catch'; draw(true); } }, 'Catch') : null,
      // play-test 8: tabs other streams add (P-client: "Professions") — they draw the page, the journal owns the tab row
      ...extraTabs.map(t => h('button.chip', { type: 'button', role: 'tab', dataset: { tab: t.id }, 'aria-checked': String(S.tab === t.id), onclick: () => { S.tab = t.id; draw(true); } }, typeof t.label === 'function' ? t.label() : t.label)));
    if (S.tab === 'catch') { drawCatch(tabs); return; }
    const xt = extraTabs.find(t => t.id === S.tab);
    if (xt) {
      const page = h('div.j-extra', { dataset: { tab: xt.id } });
      panel.fill(tabs, page);
      try { const kids = xt.draw(page); if (kids) page.append(...[kids].flat().filter(k => k != null && k !== false)); }
      catch (e) { console.warn(`[journal] tab ${xt.id}:`, e?.message || e); page.append(h('p.empty', {}, 'This page could not be drawn.')); }
      return;
    }
    if (!['active', 'done'].includes(S.tab)) S.tab = 'active';
    if (S.tab === 'done') {
      const names = S.done.map(id => atlas.model?.quests.get(id)?.name || titleCase(String(id).replace(/^job:([^:]+).*/, '$1'))).filter(Boolean);
      panel.fill(tabs, names.length ? h('ul.j-done', {}, ...names.map(n => h('li', {}, '✓ ', n))) : h('p.empty', {}, 'Nothing finished yet. Talk to people in town — anyone with a request has a gold mark over them.'));
      return;
    }
    if (!qs.length) {
      panel.fill(tabs, h('div.j-empty', {}, h('p', {}, 'You carry no quests.'), h('p.tiny', {}, 'Elders, guards and innkeepers in every town have work. Talk to them (E). Notice boards and travellers on the road have jobs too.')));
      return;
    }
    const rows = qs.map(q => h('li.j-row' + (q.id === S.sel ? '.on' : '') + (q.ready ? '.ready' : ''), { tabIndex: 0, onclick: () => { S.sel = q.id; draw(true); }, onkeydown: e => { if (e.key === 'Enter') { S.sel = q.id; draw(true); } } },
      h('span.j-mark', {}, q.id === atlas.tracked ? '◆' : q.ready ? '?' : '!'),
      h('div', {}, h('b', {}, q.name), h('small', {}, q.goal)),
      h('span.j-lvl.tone-' + bandTone([q.level || 1, q.level || 1], p?.level || 1), {}, q.level || '')));
    const q = qs.find(x => x.id === S.sel) || qs[0];
    const def = atlas.model?.quests.get(q.id);
    const steps = (q.steps || []).map((st, i) => h('li.' + (st.done || i < q.step ? 'done' : i === q.step ? 'now' : 'later'), {},
      h('span.j-tick', {}, st.done || i < q.step ? '✓' : i === q.step ? '▸' : '·'), `${st.text || 'Step'}`, st.of > 1 ? h('small', {}, ` ${i < q.step ? st.of : i === q.step ? st.n || 0 : 0}/${st.of}`) : null));
    const reward = q.rewardText ? [q.rewardText] : rewardWords(q.reward);   // E/A: a ready-made reward line wins (play-test 2)
    const giver = q.giverName || atlas.model?.npcs.get(q.giver)?.name;
    const giverAt = atlas.model?.npcs.get(q.giver)?.at;
    const detail = h('div.j-detail', {},
      h('h3', {}, q.name),
      h('p.j-meta', {}, h('span.tone-' + bandTone([q.level || 1, q.level || 1], p?.level || 1), {}, `Level ${q.level || 1}`), q.zoneName ? ` · ${q.zoneName}` : '', q.story ? ' · story' : '', q.job ? ' · job' : ''),
      h('div.j-goal', {}, h('span.label', {}, q.ready ? 'Done' : 'Goal'), h('p', {}, q.ready ? `Go back to ${giver || 'whoever asked'}${giverAt ? ` in ${giverAt}` : ''} and hand it in.` : q.goal),
        q.loc ? h('p.j-where', {}, '⌖ ', where(q)) : null,
        h('div.row', {}, q.loc ? h('button.ghost.small', { type: 'button', onclick: () => { worldMap?.panel.open(); worldMap?.showAt(q.loc.x, q.loc.z, q.loc.exact ? 0.6 : 0.2); } }, 'Show on map') : null,
          q.ready && q.remote !== false ? h('button.primary.small', { type: 'button', title: 'Hand it in from here (S10)', dataset: { turnin: q.id }, onclick: () => { net()?.quest?.('turnin', q.id); } }, 'Hand in') : null,
          atlas.isTracked(q.id) ? h('button.ghost.small.on', { type: 'button', title: 'Take it off your screen (it stays in the journal)', onclick: () => { atlas.untrack(q.id); draw(true); } }, 'Tracked ✓') : h('button.primary.small', { type: 'button', onclick: () => { atlas.setTracked(q.id); draw(true); } }, 'Track'))),
      q.text ? h('p.j-text', {}, `“${q.text}”`) : null,
      giver ? h('p.tiny', {}, `From ${giver}${giverAt ? ` in ${giverAt}` : ''}.`) : null,
      h('span.label', {}, 'Steps'), h('ol.j-steps', {}, steps),
      q.group ? h('p.j-group', {}, `Group: ${q.group}`) : null,
      reward.length ? h('div.j-reward', {}, h('span.label', {}, 'Reward'), h('p', {}, reward.join(' · '))) : null,
      def?.next ? h('p.tiny', {}, 'There is more to this story after it.') : null,
      h('div.row.j-foot', {}, h('span.grow'), h('button.ghost.small.x', { type: 'button', onclick: async () => { if (await confirmBox(`Abandon "${q.name}"? You can take it again from ${giver || 'whoever offered it'}.`, { yes: 'Abandon', danger: true })) net()?.quest?.('abandon', q.id); } }, 'Abandon')));
    panel.fill(tabs, h('div.j-split', {}, h('ul.j-list', {}, rows), detail));
  }

  // ---- the HUD tracker ----
  const tracker = h('div.tv-tracker', { 'aria-live': 'polite', hidden: true });
  (document.getElementById('hud') || document.body).appendChild(tracker);
  let trackKey = '';
  function drawTracker() {
    const qs = list().filter(q => atlas.isTracked(q.id));      // S2: only what you track is on the HUD
    const p = me();
    tracker.hidden = !qs.length;
    if (!qs.length) { trackKey = ''; return; }
    const t = (atlas.trackedQuest && atlas.isTracked(atlas.trackedQuest.id) ? atlas.trackedQuest : null) || qs[0];
    const others = qs.filter(q => q.id !== t.id).slice(0, 3);
    const key = JSON.stringify([t.id, t.goal, t.loc && [Math.round(t.loc.x), Math.round(t.loc.z)], p && Math.round(p.x / 10), p && Math.round(p.z / 10), others.map(q => q.id + q.goal)]);
    if (key === trackKey) return;
    trackKey = key;
    const w = t.loc ? where(t) : '';
    tracker.replaceChildren(
      h('div.tr-main' + (t.ready ? '.ready' : ''), { tabIndex: 0, title: 'Open the journal (J)', onclick: () => { S.sel = t.id; panel.open(); } },
        h('b', {}, t.name), h('p.tr-goal', {}, t.goal), w ? h('p.tr-where', {}, h('i.tr-arrow', { style: arrowStyle(t, p) }, '➤'), w) : null),
      ...others.map(q => h('div.tr-row' + (q.ready ? '.ready' : ''), { onclick: () => { atlas.setTracked(q.id); } , title: 'Click to track this one instead' }, h('b', {}, q.name), h('small', {}, q.goal))));
  }
  function arrowStyle(q, p) {
    if (!q.loc || !p) return '';
    // the arrow points the way to go relative to the camera-free compass (north up), like the map
    const a = Math.atan2(q.loc.z - p.z, q.loc.x - p.x);
    return `transform: rotate(${a.toFixed(2)}rad)`;
  }

  function wire(n) {
    n.on('quests', m => { S.done = m.done || S.done; draw(); drawTracker(); });
    n.on('questR', r => { if (r.ok && r.op === 'abandon') draw(true); });
  }
  atlas.onChange(() => { draw(); drawTracker(); });
  return { panel, wire, draw, drawTracker,
    /** A page of its own in the journal: addTab('professions', 'Professions', page => [nodes…]). `redraw()` when its facts change. */
    addTab(id, label, drawFn) { const t = { id: String(id), label, draw: drawFn }; const i = extraTabs.findIndex(x => x.id === t.id); if (i >= 0) extraTabs[i] = t; else extraTabs.push(t); draw(true); return () => { const k = extraTabs.indexOf(t); if (k >= 0) extraTabs.splice(k, 1); draw(true); }; },
    redraw() { draw(true); }, get tabs() { return ['active', 'done', ...(catchSrc ? ['catch'] : []), ...extraTabs.map(t => t.id)]; }, setCatch(src) { catchSrc = src; draw(true); }, showTab(t) { S.tab = t; panel.open(); draw(true); }, tick: () => { drawTracker(); draw(); }, get state() { return { sel: S.sel, tab: S.tab, done: S.done.length }; } };
}
