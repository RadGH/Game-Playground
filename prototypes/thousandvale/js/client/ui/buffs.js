// Play-test 2 follow-up (C's ask): a cast bar for your own channel (the recall charm: `fx {kind:'channel', id, name, ms}`
// starts it, `fx {kind:'channel', end:'done'|'broken'}` ends it), and buff icons under your frame with the time left.
// Buffs are statuses on your entity (`info.st`, protocol §18.8); a shop buff's length comes back on `itemR {ok, id, ms}`.
// Item buffs (`item:whetted`, `item:torch`, `item:well_fed` …) get a picture and a countdown; other statuses show by name.

import { h } from '../ui-panel.js';

const GLYPH = { whetted: '⚔', oiled: '◈', silvered: '✧', fletched: '➶', well_fed: '♨', oats: '♞', torch: '🔥', steamed: '♨', steam_soaked: '♒' };      // [S] the hot springs' two
const NAMES = { 'item:steamed': 'Steam-warmed (+5% max health)', steam_soaked: 'Steam-soaked (fast health and mana)' };      // [S]
// [World, round 11 #47] a shrine's blessing: the server's own sentence (used.buff.text) is its name on the bar
const BLESS_GLYPH = { haste: '»', might: '⚔', guard: '◈', rally: '✦', regen: '✚' };
const NICE = id => NAMES[id] || String(id).replace(/^bless:/, '').replace(/^item:/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export function createBuffs({ me, infoOf, net = null }) {
  const root = document.getElementById('hud');
  // ---- the cast bar ----
  const fill = h('i'), label = h('span'), time = h('em');
  const bar = h('div.castbar', { hidden: true, role: 'progressbar' }, fill, label, time);
  root?.appendChild(bar);
  const C = { at: 0, ms: 0, on: false, endAt: 0 };
  function onFx(ev) {
    if (ev.kind === 'spring' && ev.warmMs && ev.id === me()?.id) { until.set('item:steamed', performance.now() + ev.warmMs); return; }      // [S] Steam-warmed's ten minutes
    if (ev.kind !== 'channel' || ev.id !== me()?.id) return;
    if (ev.end) {
      C.on = false; bar.classList.toggle('broken', ev.end === 'broken'); bar.classList.toggle('done', ev.end === 'done');
      label.textContent = ev.end === 'broken' ? 'Interrupted' : label.textContent; C.endAt = performance.now() + 700;
      if (ev.end === 'done') fill.style.width = '100%';
      return;
    }
    C.on = true; C.at = performance.now(); C.ms = ev.ms || 5000; C.endAt = 0;
    bar.classList.remove('broken', 'done'); label.textContent = ev.name || 'Channelling'; bar.hidden = false;
  }
  // ---- buff icons ----
  const row = h('div.buffrow', { 'aria-label': 'Your buffs' });
  root?.appendChild(row);
  const until = new Map();          // status id -> performance.now() when it ends (from itemR ms)
  let shown = '';
  function tick() {
    const now = performance.now();
    if (C.on) {
      const f = Math.min(1, (now - C.at) / C.ms);
      fill.style.width = (f * 100).toFixed(1) + '%'; time.textContent = `${Math.max(0, (C.ms - (now - C.at)) / 1000).toFixed(1)} s`;
    } else if (C.endAt && now > C.endAt) { bar.hidden = true; C.endAt = 0; }
    mealTick(now);
    const id = me()?.id;
    const st = (id != null && infoOf(id)?.st) || [];
    const key = st.join(',') + '|' + st.map(s => Math.ceil(Math.max(0, (until.get(s) || 0) - now) / 1000)).join(',');
    if (key === shown) return;
    shown = key;
    row.replaceChildren(...st.map(s => {
      const left = Math.max(0, (until.get(s) || 0) - now), short = String(s).replace(/^item:/, '');
      const t = left > 0 ? (left > 60000 ? `${Math.ceil(left / 60000)}m` : `${Math.ceil(left / 1000)}s`) : '';
      return h('span.buff' + (String(s).startsWith('item:') ? '.item' : ''), { dataset: { tip: `${NICE(s)}${t ? ` — ${t} left` : ''}`, st: s } }, h('b', {}, GLYPH[short] || BLESS_GLYPH[String(s).replace(/^bless:/, '')] || NICE(s)[0]), t ? h('em', {}, t) : null);
    }));
  }
  /** S21: the mount-call delay and anything else timed on you gets the same bar. */
  function startBar(name, ms) { onFx({ kind: 'channel', id: me()?.id, name, ms }); }
  function endBar(how, text) { if (!C.on) return; onFx({ kind: 'channel', id: me()?.id, end: how }); if (text) label.textContent = text; }
  // ---- S20: eating / drinking — a pill with the time left; moving or a fight ends it (the server says so)
  const meal = h('div.meal-pill', { hidden: true }, h('b'), h('em'), h('button.ghost.small', { type: 'button', dataset: { act: 'stand' }, onclick: () => { const n = net?.(); n?.item?.('stand'); } }, 'Stand up'));   // §20.6
  root?.appendChild(meal);
  const M = { until: 0, kind: null };
  function mealTick(now) {
    if (!M.kind) return;
    const left = Math.max(0, M.until - now);
    meal.querySelector('em').textContent = left ? `${Math.ceil(left / 1000)} s` : '';
    if (!left) { M.kind = null; meal.hidden = true; }
  }
  function wire(n) {
    n.on('mountR', r => { if (r.casting) startBar('Calling your mount', r.casting); else if (r.ok === false) endBar('broken', r.why === 'interrupted' ? 'Interrupted' : (r.msg || 'Cannot ride now')); });
    n.on('you', p => {
      if ('mount' in p && p.mount) endBar('done');
      if ('regen' in p) {
        if (p.regen) { M.kind = p.regen.kind; M.until = performance.now() + (p.regen.ms || 20000); meal.hidden = false; meal.querySelector('b').textContent = M.kind === 'drink' ? 'Drinking — sitting' : 'Eating — sitting'; }
        else { M.kind = null; meal.hidden = true; }
      }
    });
    n.on('ev', ({ e }) => { for (const ev of e || []) if ((ev.type || ev.t) === 'fx') onFx(ev); });
    n.on('itemR', r => { if (r.ok && r.ms && r.id) { const s = r.status || ('item:' + (r.buff || r.id)); until.set(s, performance.now() + r.ms); if (r.buff) until.set('item:' + r.buff, performance.now() + r.ms); } });
    n.on('used', u => { const b = u && u.ok && u.buff; if (b && b.id && b.seconds) { until.set(b.id, performance.now() + b.seconds * 1000); if (b.text) NAMES[b.id] = b.text.replace(/ for [^.]*\.$/, ''); } });      // [World #47]
    n.on('joined', () => { C.on = false; bar.hidden = true; });
  }
  return { wire, tick, onFx, startBar, get state() { return { cast: C.on ? label.textContent : null, buffs: [...row.children].map(c => c.dataset.st) }; }, setUntil: (s, ms) => until.set(s, performance.now() + ms) };
}
