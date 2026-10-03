// Bottom control bar (PLAN §16), one per viewport:
//
// | portrait SLOT | name, level, HP/MP, damage/armour/speed, statuses, XP | 4x3 command card | belt + minimap |
//
// The portrait slot is an empty element (`bar.portraitSlot`) that stream C's js/view/portrait.js
// fills with a scissored 3D viewport (M7). Until then it shows a drawn crest. `bar.onSelect(fn)`
// tells the portrait which entity is selected.
//
// Command card (4 x 3):
//   Q  W  E  R          skills (cooldown sweep, rank pips, Ctrl+key or the + badge to learn)
//   D  Muster  Buy potion  Armory (G buys the cheapest gear step; click opens the Armory panel)
// Potions are drunk from the belt (1/2 or click a flask).
//   Z  X  C  V          the deck: 4 sends with stock pips, restock sweep, Shift+key or right badge = auto

import { h, setText, setStyle, toggle, setTipHtml, shortSecs } from './dom.js';
import { icon } from './icons.js';
import { DMG_NAMES, ARMOUR_NAMES } from './hud.js';
import { TEAM_CSS } from '../view/terrain.js';
import { hp as fmtHp, fmt } from '../../../../shared/format.js';

const STATUS_NAMES = { burn: 'Burning', bleed: 'Bleeding', root: 'Rooted', stun: 'Stunned', slow: 'Slowed', quarry: 'Marked', might: 'Might', regen: 'Regenerating', haste: 'Haste' };
const BAD = new Set(['burn', 'bleed', 'root', 'stun', 'slow', 'quarry']);
const SKILL_KEYS = ['Q', 'W', 'E', 'R'];
const SEND_KEYS = ['Z', 'X', 'C', 'V'];
const TIER_NAMES = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 6: 'Champion' };

export function createControlBar({ root, sim, Q, player, seat, actors, minimapLayout }) {
  const data = sim.data;
  const tickHz = data.econ?.clock?.tickHz || 20;
  const bar = h('div', 'controlbar', null, { 'data-ui': true });
  bar.innerHTML = `
    <div class="cb-portrait"><div class="portrait-slot" data-slot="portrait"><div class="crest-fallback"><span></span></div></div></div>
    <div class="cb-info">
      <div class="ci-name"><b></b><span class="ci-lv"></span></div>
      <div class="ci-bar hp"><div class="fill"></div><span></span></div>
      <div class="ci-bar mp"><div class="fill"></div><span></span></div>
      <div class="ci-tags"></div>
      <div class="ci-status"></div>
      <div class="ci-xp" data-tip="Experience"><div class="fill"></div></div>
    </div>
    <div class="cb-card"></div>
    <div class="cb-side">
      <div class="belt" data-tip="Belt potions: 1 or 2 drinks one (heals 40%)."></div>
      <canvas class="minimap" width="200" height="150"></canvas>
    </div>`;
  root.append(bar);
  const $ = (sel) => bar.querySelector(sel);
  const portraitSlot = $('.portrait-slot');
  const card = $('.cb-card');
  const tags = $('.ci-tags');
  const statusEl = $('.ci-status');
  const belt = $('.belt');
  const mini = $('.minimap');
  const selectListeners = new Set();
  let selected = -1;

  // ---------- command card cells ----------
  const skillCells = SKILL_KEYS.map((k) => cell('skill', k));
  const dCell = cell('skill', 'D');
  const musterCell = cell('util', 'M');
  const potionCell = cell('util', '');
  const gearCell = cell('util', 'G');
  const sendCells = SEND_KEYS.map((k, i) => cell('send', k, i));
  card.append(...skillCells, dCell, musterCell, potionCell, gearCell, ...sendCells);

  function cell(kind, key, index = -1) {
    const el = h('button', 'cc cc-' + kind, null, { type: 'button' });
    el.innerHTML = `<span class="cc-face"></span><span class="cc-cd"></span><kbd class="cc-key">${key}</kbd><span class="cc-sub"></span><span class="cc-pips"></span>`;
    if (kind === 'skill') el.insertAdjacentHTML('beforeend', '<span class="cc-learn" data-tip="Learn a rank (Ctrl + key)">+</span>');
    if (kind === 'send') el.insertAdjacentHTML('beforeend', `<span class="cc-auto" data-tip="Auto-send: buys this whenever stock and gold allow (Shift + ${key})">${icon('auto')}</span><span class="cc-lock"></span>`);
    el.dataset.key = key; el.dataset.index = String(index);
    return el;
  }

  card.addEventListener('click', (e) => {
    const el = e.target.closest('.cc'); if (!el) return;
    const me = sim.state.players[player];
    if (el.classList.contains('cc-skill')) {
      const slot = el.dataset.key;
      if (e.target.closest('.cc-learn') || e.ctrlKey) seat.issue({ type: 'learn', slot });
      else {
        const g = seat.ground;
        seat.issue(g ? { type: 'cast', slot, x: g.x, z: g.z } : { type: 'cast', slot });
      }
    } else if (el.classList.contains('cc-send')) {
      const i = Number(el.dataset.index);
      if (e.target.closest('.cc-auto') || e.shiftKey) seat.issue({ type: 'auto', index: i, on: !me.auto[i] });
      else seat.issue({ type: 'send', unit: me.deck[i] });
    } else if (el === musterCell) seat.issue({ type: 'muster' });
    else if (el === potionCell) seat.issue({ type: 'potion' });
    else if (el === gearCell) { if (e.shiftKey || !onGearClick) seat.issue({ type: 'upgrade' }); else onGearClick(); }
    el.classList.remove('press'); void el.offsetWidth; el.classList.add('press');
  });
  // Right-click a send to swap it from the roster.
  const picker = h('div', 'roster-picker', null, { hidden: true, 'data-ui': true, 'data-ui-menu': true });
  root.append(picker);
  let pickIndex = -1;
  card.addEventListener('contextmenu', (e) => {
    const el = e.target.closest('.cc-send'); if (!el) return;
    e.preventDefault();
    pickIndex = Number(el.dataset.index);
    const ro = Q.roster(sim.state, data, player);
    const me = sim.state.players[player];
    picker.innerHTML = `<div class="rp-head">Swap ${SEND_KEYS[pickIndex]} for…</div>` + ro.map((r) =>
      `<button class="rp-row${me.deck.includes(r.unit) ? ' in' : ''}" data-unit="${r.unit}"><span class="rp-t t${r.tier}">${TIER_NAMES[r.tier] || r.tier}</span><b>${data.units.units[r.unit].name}</b><span class="rp-c">${icon('coin')}${r.cost}</span></button>`).join('');
    const r = el.getBoundingClientRect();
    picker.hidden = false;
    picker.style.left = Math.min(window.innerWidth - 240, r.left) + 'px';
    picker.style.bottom = (window.innerHeight - r.top + 8) + 'px';
  });
  picker.addEventListener('click', (e) => {
    const b = e.target.closest('[data-unit]'); if (!b) return;
    const me = sim.state.players[player];
    const deck = me.deck.slice();
    const unit = b.dataset.unit;
    const j = deck.indexOf(unit);
    if (j >= 0) deck[j] = deck[pickIndex];     // already in the deck: swap places
    deck[pickIndex] = unit;
    seat.issue({ type: 'deck', units: deck });
    picker.hidden = true;
  });
  const closePicker = (e) => { if (!picker.hidden && !e.target.closest('.roster-picker')) picker.hidden = true; };
  window.addEventListener('mousedown', closePicker);

  // ---------- update ----------
  function updateSkill(el, sk, hero) {
    if (!sk) { el.classList.add('empty'); return; }
    el.classList.remove('empty');
    const face = el.querySelector('.cc-face');
    setText(face, sk.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2));
    face.dataset.el = data.heroes?.skills?.[sk.id]?.element || hero?.dmgType || '';
    const cdFrac = sk.cooldown > 0 && sk.readyIn > 0 ? sk.readyIn / sk.cooldown : 0;   // both in ticks
    setStyle(el.querySelector('.cc-cd'), '--cd', String(Math.max(0, Math.min(1, cdFrac))));
    setText(el.querySelector('.cc-sub'), sk.readyIn > 0 ? shortSecs(sk.readyIn / tickHz) : (sk.mp ? String(sk.mp) : ''));
    toggle(el, 'cooling', sk.readyIn > 0);
    toggle(el, 'unlearned', sk.rank <= 0);
    toggle(el, 'ready', sk.canCast);
    toggle(el, 'can-learn', !!sk.canLearn);
    const pips = el.querySelector('.cc-pips');
    const pk = sk.rank + '/' + sk.maxRank;
    if (pips._k !== pk) { pips._k = pk; pips.innerHTML = Array.from({ length: sk.maxRank }, (_, i) => `<i class="${i < sk.rank ? 'on' : ''}"></i>`).join(''); }
    setTipHtml(el, `<b>${sk.name}</b> · rank ${sk.rank}/${sk.maxRank}${sk.mp ? ` · ${sk.mp} mana` : ''}${sk.cooldown ? ` · ${fmt(sk.cooldown / tickHz, { decimals: 1 })}s cooldown` : ''}<br>${sk.desc || ''}`);
  }

  function update(dt) {
    const s = sim.state;
    const me = s.players[player];
    const hi = Q.heroInfo(s, data, player);
    // Info panel: the selected entity, or my hero.
    const selEnt = selected >= 0 ? s.ents.find((e) => e.id === selected) : null;
    const ent = selEnt && selEnt.alive !== false ? selEnt : s.ents.find((e) => e.id === me.heroEnt);
    if (selEnt == null && selected >= 0) setSelected(-1);
    if (ent) {
      const isMine = ent.id === me.heroEnt;
      setText($('.ci-name b'), Q.entName(s, data, ent));
      setText($('.ci-lv'), ent.kind === 'hero' ? `Level ${ent.level}` : ent.kind === 'tide' ? `Tide ${ent.level}` : `Tier ${TIER_NAMES[data.units.units[ent.type]?.tier] || ''}`);
      bar.style.setProperty('--team', ent.team >= 0 ? TEAM_CSS[ent.team] : '#9a8f80');
      const hpF = ent.hpMax ? Math.max(0, ent.hp / ent.hpMax) : 0;
      setStyle($('.ci-bar.hp .fill'), 'width', (hpF * 100).toFixed(1) + '%');
      setText($('.ci-bar.hp span'), ent.alive === false ? `Respawn in ${Math.ceil((hi?.respawnIn || 0) / tickHz)}s` : `${fmtHp(ent.hp)} / ${fmtHp(ent.hpMax)}`);
      const showMp = ent.mpMax > 0;
      $('.ci-bar.mp').hidden = !showMp;
      if (showMp) {
        setStyle($('.ci-bar.mp .fill'), 'width', ((ent.mp / ent.mpMax) * 100).toFixed(1) + '%');
        setText($('.ci-bar.mp span'), `${Math.floor(ent.mp)} / ${Math.floor(ent.mpMax)}`);
      }
      const u = data.units.units[ent.type];
      const tk = `${ent.dmgType}|${ent.armour}|${isMine ? hi?.dps : u?.dps}|${isMine ? hi?.armor : ''}`;
      if (tags._k !== tk) {
        tags._k = tk;
        const dps = isMine ? hi?.dps : u?.dps;
        tags.innerHTML = `<span class="tag dmg" data-type="${ent.dmgType}" data-tip="Damage type">${icon('sword')}${DMG_NAMES[ent.dmgType] || ent.dmgType || '—'}${dps ? ` · ${fmt(dps, { decimals: 0 })} dps` : ''}</span>
          <span class="tag arm" data-tip="Armour class">${icon('shield')}${ARMOUR_NAMES[ent.armour] || ent.armour || '—'}${isMine && hi?.armor ? ` · ${fmt(hi.armor, { decimals: 0 })}` : ''}</span>`;
      }
      const st = (ent.statuses || []).map((x) => x.id);
      const sk = st.join(',');
      if (statusEl._k !== sk) {
        statusEl._k = sk;
        statusEl.innerHTML = (ent.statuses || []).map((x) => `<span class="st ${BAD.has(x.id) ? 'bad' : 'good'}" data-tip="${STATUS_NAMES[x.id] || x.id}">${(STATUS_NAMES[x.id] || x.id).slice(0, 3)}${x.stacks > 1 ? `<b>${x.stacks}</b>` : ''}</span>`).join('');
      }
      const xpF = hi && isMine ? (hi.xpNext > hi.xpPrev ? (hi.xp - hi.xpPrev) / (hi.xpNext - hi.xpPrev) : 1) : 0;
      $('.ci-xp').hidden = !isMine;
      setStyle($('.ci-xp .fill'), 'width', (Math.max(0, Math.min(1, xpF)) * 100).toFixed(1) + '%');
      setText($('.crest-fallback span'), (Q.entName(s, data, ent) || '?')[0]);
    }

    // Skills.
    const byslot = {};
    for (const sk of hi?.skills || []) byslot[sk.slot] = sk;
    const heroDef = data.heroes?.heroes?.[me.hero];
    SKILL_KEYS.forEach((k, i) => updateSkill(skillCells[i], byslot[k], heroDef));
    updateSkill(dCell, byslot.D, heroDef);
    toggle(bar, 'has-points', (hi?.skillPts || 0) > 0);

    // Muster.
    const mi = Q.musterInfo(s, data, player);
    setText(musterCell.querySelector('.cc-face'), ['—', 'I', 'II', 'III'][mi.rank] ?? mi.rank);
    musterCell.querySelector('.cc-face').dataset.el = 'muster';
    setText(musterCell.querySelector('.cc-sub'), mi.next ? String(mi.next.cost) : 'max');
    toggle(musterCell, 'ready', !!mi.next?.canBuy);
    toggle(musterCell, 'dim', !mi.next?.canBuy);
    setTipHtml(musterCell, mi.next ? `<b>Muster ${['I', 'II', 'III'][mi.rank]}</b> · ${mi.next.cost} gold<br>+10% health and damage on every unit you send.` : '<b>Muster</b> is at full rank.');
    // Potions.
    const pf = potionCell.querySelector('.cc-face');
    if (!pf._i) { pf._i = 1; pf.innerHTML = icon('potion'); }
    setText(potionCell.querySelector('.cc-sub'), '25');
    setText(potionCell.querySelector('.cc-key'), 'Buy');
    toggle(potionCell, 'dim', me.belt >= 2 || me.gold < 25);
    setTipHtml(potionCell, '<b>Buy a potion</b> · 25 gold<br>The belt holds two.');
    const gi = Q.gearInfo(s, data, player);
    const gf = gearCell.querySelector('.cc-face');
    if (!gf._i) { gf._i = 1; gf.innerHTML = icon('hammer'); }
    setText(gearCell.querySelector('.cc-sub'), gi.cheapest ? String(gi.cheapest.cost) : '—');
    toggle(gearCell, 'ready', !!gi.cheapest && me.gold >= gi.cheapest.cost);
    toggle(gearCell, 'dim', !gi.cheapest || me.gold < gi.cheapest.cost);
    setTipHtml(gearCell, `<b>Armory</b>${gi.cheapest ? ` · next upgrade ${gi.cheapest.cost} gold` : ''}<br>G buys the cheapest gear step from anywhere. Click (or B) opens the Armory.`);
    const bk = String(me.belt);
    if (belt._k !== bk) { belt._k = bk; belt.innerHTML = [0, 1].map((i) => `<button type="button" class="flask${i < me.belt ? ' full' : ''}" data-drink="1">${icon('potion')}<kbd>${i + 1}</kbd></button>`).join(''); }

    // Deck sends.
    const deck = Q.deckInfo(s, data, player);
    deck.forEach((d, i) => {
      const el = sendCells[i];
      const u = data.units.units[d.unit];
      const face = el.querySelector('.cc-face');
      setText(face, (u?.name || d.unit).split(/\s+/).map((w) => w[0]).join('').slice(0, 2));
      face.dataset.tier = String(d.tier);
      setText(el.querySelector('.cc-sub'), String(d.cost));
      const pk = `${d.stock}/${d.max}`;
      const pips = el.querySelector('.cc-pips');
      if (pips._k !== pk) { pips._k = pk; pips.innerHTML = Array.from({ length: d.max }, (_, j) => `<i class="${j < d.stock ? 'on' : ''}"></i>`).join(''); }
      const rf = d.stock < d.max && d.restockEvery ? 1 - d.restockIn / d.restockEvery : 0;
      setStyle(el.querySelector('.cc-cd'), '--cd', String(d.stock === 0 ? 1 - rf : 0));
      toggle(el, 'auto-on', !!d.auto);
      toggle(el, 'locked', !d.unlocked);
      toggle(el, 'ready', !!d.canBuy);
      toggle(el, 'poor', d.unlocked && d.stock > 0 && !d.canBuy && d.reason === 'gold');
      toggle(el, 'empty-stock', d.unlocked && d.stock === 0);
      setText(el.querySelector('.cc-lock'), d.unlocked ? '' : shortSecs((d.unlockIn || 0) / tickHz));
      setTipHtml(el, `<b>${u?.name || d.unit}</b> · tier ${TIER_NAMES[d.tier] || d.tier}<br>${d.cost} gold · +${fmt(d.income, { decimals: 1 })} income · ${d.stock}/${d.max} in stock` +
        `${u ? `<br>${fmtHp(u.hp)} health${u.bodies > 1 ? ` ×${u.bodies}` : ''} · ${ARMOUR_NAMES[u.armour]} armour · ${DMG_NAMES[u.dmg]} damage` : ''}` +
        `${u?.traits?.length ? `<br><i>${u.traits.map((t) => data.units.traits[t]?.desc).filter(Boolean).join(' ')}</i>` : ''}` +
        `<br><span class="muted">Click or ${SEND_KEYS[i]} to send · Shift = auto · right-click to swap</span>`);
    });

    drawMinimap(dt);
  }

  // ---------- minimap ----------
  let miniT = 0;
  function drawMinimap(dt) {
    miniT -= dt; if (miniT > 0) return; miniT = 0.1;
    const ctx = mini.getContext('2d');
    const W = mini.width, H = mini.height;
    const L = minimapLayout;
    const b = L.bounds;
    const pad = 6;
    const sx = (W - pad * 2) / (b.x1 - b.x0), sz = (H - pad * 2) / (b.z1 - b.z0 + 6);
    const k = Math.min(sx, sz);
    const ox = (W - (b.x1 - b.x0) * k) / 2, oz = (H - (b.z1 - b.z0) * k) / 2;
    const X = (x) => ox + (x - b.x0) * k, Z = (z) => oz + (z - b.z0) * k;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#1c2318'; ctx.fillRect(0, 0, W, H);
    for (const f of L.fields) {
      ctx.fillStyle = '#3c5230'; ctx.fillRect(X(f.x0), Z(f.zGate), (f.x1 - f.x0) * k, (f.zEnd - f.zGate) * k);
      if (f.ford) { ctx.fillStyle = '#3d6f86'; ctx.fillRect(X(f.x0), Z(f.ford.z0), (f.x1 - f.x0) * k, (f.ford.z1 - f.ford.z0) * k); }
      ctx.fillStyle = '#7a6a50';
      for (const lane of f.lanes) { ctx.fillRect(X(lane[0].x) - 1.5, Z(f.zGate), 3, (f.zKeep - f.zGate) * k); }
      ctx.fillStyle = TEAM_CSS[f.team]; ctx.fillRect(X(f.keep.x) - 5, Z(f.keep.z) - 3, 10, 6);
      ctx.strokeStyle = 'rgba(214,188,128,.5)'; ctx.lineWidth = 1; ctx.strokeRect(X(f.x0) + .5, Z(f.zGate) + .5, (f.x1 - f.x0) * k, (f.zEnd - f.zGate) * k);
    }
    const me = sim.state.players[player];
    for (const e of sim.state.ents) {
      if (e.alive === false) continue;
      const hero = e.kind === 'hero';
      ctx.fillStyle = e.team < 0 ? '#c8b48a' : TEAM_CSS[e.team];
      const r = hero ? 3.2 : 1.6;
      ctx.beginPath(); ctx.arc(X(e.x), Z(e.z), r, 0, Math.PI * 2); ctx.fill();
      if (hero && e.id === me.heroEnt) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke(); }
    }
    // Camera view box.
    if (seat.viewport && cameraBox) {
      const pts = cameraBox();
      if (pts) {
        ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1;
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Z(p.z)) : ctx.moveTo(X(p.x), Z(p.z)))); ctx.closePath(); ctx.stroke();
      }
    }
    mini._map = { X, Z, k, ox, oz, b };
  }
  let cameraBox = null;
  let onGearClick = null;
  belt.addEventListener('click', (e) => { if (e.target.closest('[data-drink]')) seat.issue({ type: 'drink' }); });
  let onMiniClick = null;
  mini.addEventListener('mousedown', (e) => {
    const m = mini._map; if (!m || !onMiniClick) return;
    const r = mini.getBoundingClientRect();
    const px = (e.clientX - r.left) * (mini.width / r.width), pz = (e.clientY - r.top) * (mini.height / r.height);
    const x = m.b.x0 + (px - m.ox) / m.k, z = m.b.z0 + (pz - m.oz) / m.k;
    onMiniClick({ x, z, button: e.button });
    e.preventDefault();
  });
  mini.addEventListener('contextmenu', (e) => e.preventDefault());

  function setSelected(id) {
    selected = id;
    for (const fn of selectListeners) fn(id);
  }

  return {
    el: bar, portraitSlot,
    update,
    select(id) { setSelected(id); },
    get selected() { return selected; },
    onSelect(fn) { selectListeners.add(fn); return () => selectListeners.delete(fn); },
    setCameraBox(fn) { cameraBox = fn; },
    onMinimap(fn) { onMiniClick = fn; },
    onGear(fn) { onGearClick = fn; },
    destroy() { window.removeEventListener('mousedown', closePicker); bar.remove(); picker.remove(); },
  };
}
