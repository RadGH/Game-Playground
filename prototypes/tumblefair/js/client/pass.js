// The Fair Pass on the phone (Expansion 1, M7): the screen (level + progress, today's challenge, name-plate colours, the
// sticker book, what the next levels unlock), the small pop-up when a sticker / level / daily lands, the sticker block
// on the final screen, and the level badge + name plate on every chip. The rules live on the server (js/sim/pass.js);
// this only draws what it is told: `me.pass` (passView) and `{ t: 'pass', stickers, levelUp, rewards, daily, view,
// final?, match? }` messages.
//
//   const pass = createPass({ net, S, sfx, costumeName });  pass.open();  pass.titleHtml(me);  pass.chipBits(member)
//
// Layout rule (README): the whole sheet scrolls (the modal does), never a box inside it — a scrolling box inside a
// panel blanks the 3D canvas behind it on phones.
import { h, esc } from './gamehud.js';

const get = async p => (await fetch(new URL(`../../data/${p}`, import.meta.url))).json();
const [STICKERS, PASS] = await Promise.all([get('stickers.json').then(d => d.stickers), get('pass.json')]);
const byId = new Map(STICKERS.map(s => [s.id, s]));
const PLATES = new Map(PASS.plates.map(p => [p.id, p]));
const DAILY = new Map(PASS.daily.map(d => [d.id, d]));
export { STICKERS, PASS };

/** Pure: the sticker book's cells, grouped in data order. */
export function bookRows(view, { season = null } = {}) {
  const got = view?.got || {}, st = view?.st || {}, groups = [];
  for (const s of STICKERS) {
    let g = groups.find(x => x.name === s.group); if (!g) groups.push(g = { name: s.group, cells: [] });
    const have = !!got[s.id], secret = s.hidden && !have;
    const n = s.rule.stat ? Math.min(s.rule.n, st[s.rule.stat] || 0) : 0;
    g.cells.push({ id: s.id, have, secret, pic: secret ? '?' : s.pic, name: secret ? 'Secret sticker' : s.name, how: secret ? 'Keep playing to find this one.' : s.how,
      progress: !have && !secret && s.rule.stat && s.rule.n > 1 ? `${n}/${s.rule.n}` : '', season: s.season || null, offSeason: !!s.season && s.season !== season });
  }
  return groups;
}
/** Pure: the next few things levels unlock. */
export function upcoming(view, costumeName = id => id, count = 5) {
  return PASS.rewards.filter(r => r.level > (view?.level || 1)).slice(0, count).map(r => ({ level: r.level,
    text: r.costume ? `Costume: ${costumeName(r.costume)}` : r.plate ? `Name colour: ${PLATES.get(r.plate)?.name || r.plate}` : `${r.coins} coins` }));
}
const SEASON_LABEL = { winter: 'Winter Fair only', halloween: 'Halloween only' };
const plateCss = id => { const p = PLATES.get(id); return p && p.color ? `--plate:${p.color};--plate-ink:${p.ink}` : ''; };

export function createPass({ net, S, sfx = () => {}, costumeName = id => id, season = () => null, closeModal = () => {} }) {
  if (!document.querySelector('link[data-pass]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('../../css/pass.css', import.meta.url).href; l.dataset.pass = '1'; document.head.append(l); }
  const view = () => S.me?.pass || net.me?.pass || null;
  let el = null;

  // ---- pop-ups: one at a time, small, top-middle (under the score bar, never over the controls)
  const popLayer = h('div', 'pass-pops'); popLayer.setAttribute('aria-live', 'polite'); document.body.append(popLayer);
  const queue = []; let showing = false;
  function pop(pic, title, sub = '', cls = '') { queue.push({ pic, title, sub, cls }); if (!showing) next(); }
  function next() {
    const q = queue.shift(); if (!q) { showing = false; return; }
    showing = true;
    const e = h('div', 'pass-pop ' + q.cls);
    e.innerHTML = `<i aria-hidden="true">${esc(q.pic)}</i><span><b>${esc(q.title)}</b>${q.sub ? `<small>${esc(q.sub)}</small>` : ''}</span>`;
    popLayer.append(e);
    setTimeout(() => e.classList.add('out'), 2400); setTimeout(() => { e.remove(); next(); }, 2800);
  }

  net.on('pass', m => {
    net.me = { ...net.me, pass: m.view, ...(typeof m.coinsNow === 'number' ? { coins: m.coinsNow } : {}) };
    S.me = net.me;
    for (const id of m.stickers || []) { const s = byId.get(id); if (s) { pop(s.pic, `Sticker: ${s.name}`, s.how, 'sticker'); sfx('good'); } }
    if (m.daily) { const d = DAILY.get(m.daily); pop('📅', 'Daily challenge done!', `${d?.text || ''} · +${d?.coins || 0} coins`, 'daily'); }
    for (const l of m.levelUp || []) {
      const r = (m.rewards || []).filter(x => x.level === l).map(x => x.costume ? `${costumeName(x.costume)} costume` : x.plate ? `${PLATES.get(x.plate)?.name} name colour` : `${x.coins} coins`);
      pop('⭐', `Fair Pass level ${l}!`, r.length ? `Unlocked: ${r.join(', ')}` : '', 'level'); sfx('win');
    }
    if (m.final) { S.passFinal = { match: m.match || [], level: m.view?.level, xp: m.view?.xp }; setTimeout(finalBlock, 0); }
    if (el) draw();
  });
  // the final screen is drawn by main.js; the sticker block is added beside it (a separate block, M2 owns the card)
  net.on('phase', m => { if (m.phase === 'final') setTimeout(finalBlock, 0); else if (m.phase !== 'bonus') S.passFinal = null; });
  function finalBlock() {
    const card = document.querySelector('#screen.final .final-card'); if (!card || card.querySelector('.pass-final') || !S.passFinal) return;
    const ids = S.passFinal.match.filter(id => byId.has(id)), v = view();
    const b = h('div', 'pass-final');
    b.innerHTML = `<div class="pf-head"><b>Fair Pass</b><span>Level ${v?.level || 1}${v && !v.max ? ` · ${v.into}/${v.need} XP` : ''}</span><button class="btn small" data-pass-open="1">Open</button></div>
      ${ids.length ? `<ul class="pf-stickers">${ids.map(id => { const s = byId.get(id); return `<li title="${esc(s.how)}"><i>${esc(s.pic)}</i><span>${esc(s.name)}</span></li>`; }).join('')}</ul>` : '<p class="note">No new stickers this time — open the Fair Pass to see what is next.</p>'}`;
    b.querySelector('[data-pass-open]').onclick = () => { sfx('tap'); open(); };
    const before = card.querySelector('.final-go') || card.lastElementChild;
    card.insertBefore(b, before);
  }

  // ---- the Fair Pass screen
  let sel = null;
  function draw() {
    if (!el) return;
    const v = view(), body = el.querySelector('.pass-body');
    if (!v) { body.innerHTML = '<p class="note">Connecting…</p>'; return; }
    const pct = v.max ? 100 : Math.round(100 * v.into / Math.max(1, v.need));
    const d = v.daily && DAILY.get(v.daily.id);
    const groups = bookRows(v, { season: season() }), total = STICKERS.length, have = Object.keys(v.got).filter(id => byId.has(id)).length;
    const s = sel && byId.get(sel), cell = s && groups.flatMap(g => g.cells).find(c => c.id === sel);
    body.innerHTML = `
      <div class="pass-level">
        <span class="lv-big" aria-label="Level ${v.level}"><small>LEVEL</small>${v.level}</span>
        <div class="lv-bar"><div class="bar"><i style="width:${pct}%"></i></div><small>${v.max ? 'Top level — every reward unlocked!' : `${v.into} / ${v.need} XP to level ${v.level + 1}`}</small>
          <small class="how">XP for every minigame played (more for a win), finished match, sticker and daily challenge.</small></div>
      </div>
      ${d ? `<div class="pass-daily${v.daily.done ? ' done' : ''}"><i aria-hidden="true">📅</i><span><b>Today: ${esc(d.text)}</b><small>${v.daily.done ? `Done! +${d.coins} coins collected. A new one tomorrow.` : `${v.daily.n}/${d.rule.n} · +${d.coins} coins and ${PASS.xp.daily} XP`}</small></span></div>` : ''}
      <h3>Name colour</h3>
      <div class="pass-plates">${PASS.plates.map(p => { const ok = v.level >= p.level; return `<button class="plate-pick${v.plate === p.id ? ' on' : ''}" data-plate="${esc(p.id)}" ${ok ? '' : 'disabled'} style="${p.color ? `--plate:${p.color};--plate-ink:${p.ink}` : ''}"><b>${esc(p.name)}</b>${ok ? '' : `<small>Lv ${p.level}</small>`}</button>`; }).join('')}</div>
      <h3>Sticker book <small>${have} of ${total}</small></h3>
      ${cell ? `<p class="pass-sel"><i>${esc(cell.pic)}</i><span><b>${esc(cell.name)}</b>${esc(cell.how)}${cell.progress ? ` · ${cell.progress}` : ''}${cell.season ? ` · ${SEASON_LABEL[cell.season] || ''}` : ''}${cell.have ? ' · ✓ yours' : ''}</span></p>` : '<p class="note pass-sel">Tap a sticker to see how to get it.</p>'}
      ${groups.map(g => `<h4>${esc(g.name)}</h4><ul class="pass-book">${g.cells.map(c => `<li><button class="stk${c.have ? ' have' : ''}${c.secret ? ' secret' : ''}${c.offSeason && !c.have ? ' off' : ''}${c.id === sel ? ' sel' : ''}" data-stk="${esc(c.id)}"><i aria-hidden="true">${esc(c.pic)}</i><span>${esc(c.name)}</span>${c.progress ? `<em>${c.progress}</em>` : ''}</button></li>`).join('')}</ul>`).join('')}
      <h3>Coming up</h3>
      <ol class="pass-next">${upcoming(v, costumeName).map(r => `<li><b>Lv ${r.level}</b> ${esc(r.text)}</li>`).join('') || '<li>Everything is unlocked. Well played!</li>'}</ol>
      <p class="note">Stickers, levels and their rewards never help you win. They are kept with your character — sign in to keep them on every device.</p>`;
  }
  function close() { if (el && S.modal?.el === el) S.modal = null; el?.remove(); el = null; sel = null; }
  function open() {
    close(); closeModal();
    el = h('div', 'modal passbook');
    el.innerHTML = `<div class="panel"><div class="row pass-head"><h2>🎟️ Fair Pass</h2><button class="btn small" data-x="1">Close</button></div><div class="pass-body"></div></div>`;
    el.addEventListener('click', e => {
      if (e.target === el || e.target.closest('[data-x]')) { sfx('tap'); close(); return; }
      const p = e.target.closest('[data-plate]'); if (p && !p.disabled) { sfx('tap'); net.send({ t: 'plate', id: p.dataset.plate }); return; }
      const k = e.target.closest('[data-stk]')?.dataset.stk; if (k) { sfx('tap'); sel = sel === k ? null : k; draw(); el.querySelector('.pass-sel')?.scrollIntoView?.({ block: 'nearest' }); }
    });
    document.body.append(el); S.modal = { el, refresh: draw, onClose: () => { el = null; sel = null; } };
    draw();
  }
  net.on('me', () => { if (el) draw(); });

  // ---- little bits for other screens
  /** The title screen's Fair Pass button: level, a thin bar, today's challenge. */
  function titleHtml(me) {
    const v = me?.pass; if (!v) return '';
    const d = v.daily && DAILY.get(v.daily.id), pct = v.max ? 100 : Math.round(100 * v.into / Math.max(1, v.need));
    return `<button class="btn pass-title" data-act="pass"><span class="pt-lv">🎟️ Fair Pass <b>Lv ${v.level}</b></span><span class="bar"><i style="width:${pct}%"></i></span>${d ? `<small class="pt-daily">${v.daily.done ? '✓ ' : 'Today: '}${esc(d.text)}${v.daily.done ? '' : ` · +${d.coins} coins`}</small>` : ''}</button>`;
  }
  /** -> { cls, attr, html } to add to a player chip: the level badge and the name plate. */
  function chipBits(m) {
    if (!m || m.cpu || m.display || !m.lv) return { attr: '', html: '' };
    const css = m.plate ? plateCss(m.plate) : '';
    return { attr: m.plate ? ` data-plate="${esc(m.plate)}"` : '', style: css, html: `<em class="lv-tag" title="Fair Pass level ${m.lv}">${m.lv}</em>` };
  }
  return { open, close, draw, titleHtml, chipBits, pop, get isOpen() { return !!el; } };
}
