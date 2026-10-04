// Bottom control bar (PLAN §16, owner round 2), one per viewport:
//
// | portrait SLOT | name, level, HP/MP, damage/armour, statuses, XP | command card | items + minimap |
//
// Command card (4 columns):
//   Q  W  E  R                       hero skills (cooldown sweep, rank pips, + badge / Ctrl+key learns)
//   D  Outfitter  Drill Yard  Sanctum   the hero's D skill, then three town buildings (O U P)
//   [ Hire units — Barracks  (B) ]   THE way to send units (opens the Barracks panel)
// Items: the hero's six inventory slots (WC3-style grid). Click / 1-6 uses a consumable; every slot
// has a tooltip. The portrait slot is filled by stream C's js/view/portrait.js (`portraitSlot`).

import { h, setText, setStyle, toggle, setTipHtml, shortSecs } from './dom.js';
import { icon } from './icons.js';
import { DMG_NAMES, ARMOUR_NAMES } from './hud.js';
import { TEAM_CSS } from '../view/terrain.js';
import { BUILDING_NAMES, BUILDING_KEYS, BUILDING_PAD, BUILDING_ICONS } from './townpanel.js';
import { hp as fmtHp, fmt } from '../../../../shared/format.js';

const STATUS_NAMES = { burn: 'Burning', bleed: 'Bleeding', root: 'Rooted', stun: 'Stunned', slow: 'Slowed', quarry: 'Marked', might: 'Might', regen: 'Regenerating', haste: 'Haste', taunt: 'Taunted', shred: 'Shredded', barrier: 'Shielded', empower: 'Empowered', revealed: 'Revealed' };
const STATUS_TEXT = { burn: 'Taking fire damage over time.', bleed: 'Taking damage over time.', root: 'Cannot move.', stun: 'Cannot act.', slow: 'Moving slower.', quarry: 'Takes extra damage.', might: 'Deals extra damage.', regen: 'Healing over time.', haste: 'Moving faster.', taunt: 'Forced to attack one target.', shred: 'Armour stripped.', barrier: 'A shield absorbs damage.', empower: 'The next hit lands harder.', revealed: 'Hidden units here can be seen.' };
const BAD = new Set(['burn', 'bleed', 'root', 'stun', 'slow', 'quarry', 'taunt', 'shred']);
const SKILL_KEYS = ['Q', 'W', 'E', 'R'];
const TIER_NAMES = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'Champion' };
const PAD_SKILL = { Q: 'X', W: 'Y', E: 'B', D: 'RB', R: 'RT' };

export function createControlBar({ root, sim, Q, player, seat, actors, minimapLayout, isPad = false, itemIconUrl = () => null, skillIconUrl = () => null }) {
  const data = sim.data;
  const tickHz = data.econ?.clock?.tickHz || 20;
  const bar = h('div', 'controlbar', null, { 'data-ui': true });
  bar.innerHTML = `
    <div class="cb-portrait"><div class="portrait-slot" data-slot="portrait"><div class="crest-fallback"><span></span></div></div></div>
    <div class="cb-info">
      <div class="ci-name"><b></b><span class="ci-lv"></span></div>
      <div class="ci-bar hp" data-tip="Health. At zero your hero falls and comes back at the Outfitter after a short wait."><div class="fill"></div><span></span></div>
      <div class="ci-bar mp" data-tip="Mana. Skills cost mana; it refills over time."><div class="fill"></div><span></span></div>
      <div class="ci-tags"></div>
      <div class="ci-status"></div>
      <div class="ci-xp" data-tip="Experience. Kills in your field level your hero up; every level gives a skill point."><div class="fill"></div></div>
    </div>
    <div class="cb-card"></div>
    <div class="cb-side">
      <div class="cb-inv"></div>
      <canvas class="minimap" width="200" height="150" data-tip="Map of every field. Click to look there, right-click to walk there."></canvas>
    </div>`;
  root.append(bar);
  const $ = (sel) => bar.querySelector(sel);
  const portraitSlot = $('.portrait-slot');
  const card = $('.cb-card');
  const tags = $('.ci-tags');
  const statusEl = $('.ci-status');
  const invEl = $('.cb-inv');
  const mini = $('.minimap');
  const selectListeners = new Set();
  let selected = -1;

  // ---------- command card ----------
  const skillCells = SKILL_KEYS.map((k) => skillCell(k));
  const dCell = skillCell('D');
  const bldCells = ['shop', 'drillyard', 'sanctum'].map((kind) => {
    const el = h('button', 'cc cc-bld bld-' + kind, null, { type: 'button', 'data-bld': kind });
    el.innerHTML = `<span class="cc-face">${icon(BUILDING_ICONS[kind])}</span><kbd class="cc-key${isPad ? ' pad' : ''}">${isPad ? BUILDING_PAD[kind] : BUILDING_KEYS[kind]}</kbd><span class="cc-sub"></span>`;
    return el;
  });
  const hireBtn = h('button', 'cc-hire', null, { type: 'button', 'data-bld': 'barracks' });
  hireBtn.innerHTML = `<span class="hire-ic">${icon('coin')}${icon('income')}</span><span class="hire-t"><b>Hire units</b><small>Barracks</small></span><kbd class="hire-key${isPad ? ' pad' : ''}">${isPad ? '↓' : 'B'}</kbd>`;
  setTipHtml(hireBtn, `<b>Barracks</b><br>Hire units and send them down your rival's lane. Every unit you hire raises your income. ${isPad ? 'D-pad down' : 'B'} opens it from anywhere; walking up to the Barracks opens it too.`);
  card.append(...skillCells, dCell, ...bldCells, hireBtn);
  let onBuilding = null;
  let openPanel = () => null;

  function skillCell(key) {
    const el = h('button', 'cc cc-skill', null, { type: 'button', 'data-tip-render': 'bl-skill', 'data-tip-skill': key, 'data-tip-player': String(player) });
    el.innerHTML = `<span class="cc-face"></span><span class="cc-cd"></span><kbd class="cc-key${isPad ? ' pad' : ''}">${isPad ? PAD_SKILL[key] : key}</kbd><span class="cc-sub"></span><span class="cc-pips"></span><span class="cc-learn">+</span>`;
    el.dataset.key = key;
    return el;
  }

  card.addEventListener('click', (e) => {
    const b = e.target.closest('[data-bld]');
    if (b) { onBuilding?.(b.dataset.bld); return; }
    const el = e.target.closest('.cc-skill'); if (!el) return;
    const slot = el.dataset.key;
    if (e.target.closest('.cc-learn') || e.ctrlKey) seat.issue({ type: 'learn', slot });
    else { const g = seat.ground; seat.issue(g ? { type: 'cast', slot, x: g.x, z: g.z } : { type: 'cast', slot }); }
    el.classList.remove('press'); void el.offsetWidth; el.classList.add('press');
  });

  // ---------- inventory (six slots, no slot types) ----------
  const invCells = Array.from({ length: data['items-bl']?.rules?.slots || 6 }, (_, i) => {
    const b = h('button', 'inv-slot', null, { type: 'button', 'data-slot': String(i), 'data-tip-render': 'bl-slot', 'data-tip-slot': String(i), 'data-tip-player': String(player) });
    invEl.append(b);
    return b;
  });
  invEl.addEventListener('click', (e) => {
    const b = e.target.closest('.inv-slot'); if (!b) return;
    const v = Q.itemView(sim.state, data, player, Number(b.dataset.slot));
    if (v?.consumable) { seat.issue({ type: 'use', slot: Number(b.dataset.slot) }); b.classList.remove('press'); void b.offsetWidth; b.classList.add('press'); }
    else onBuilding?.('shop');
  });
  // Drag one slot onto another to swap them (the `swap` command works anywhere).
  let dragFrom = -1;
  invEl.addEventListener('pointerdown', (e) => { const b = e.target.closest('.inv-slot'); dragFrom = b ? Number(b.dataset.slot) : -1; });
  invEl.addEventListener('pointerup', (e) => {
    const b = e.target.closest('.inv-slot');
    const to = b ? Number(b.dataset.slot) : -1;
    if (dragFrom >= 0 && to >= 0 && to !== dragFrom) seat.issue({ type: 'swap', a: dragFrom, b: to });
    dragFrom = -1;
  });

  // ---------- update ----------
  function updateSkill(el, sk, hero) {
    if (!sk) { el.classList.add('empty'); return; }
    el.classList.remove('empty');
    const face = el.querySelector('.cc-face');
    if (face._id !== sk.id) {
      face._id = sk.id;
      const url = skillIconUrl(sk.id);
      if (url) face.innerHTML = `<img src="${url}" alt="" draggable="false">`;
      else face.textContent = sk.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2);
    }
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
      setText($('.ci-lv'), ent.kind === 'hero' ? `Level ${ent.level}${hi?.form && isMine ? ` · ${hi.form} form` : ''}` : ent.kind === 'tide' ? `Tide ${ent.level}` : ent.kind === 'unit' ? `Tier ${TIER_NAMES[data.units.units[ent.type]?.tier] || ''}` : '');
      bar.style.setProperty('--team', ent.team >= 0 ? TEAM_CSS[ent.team] : '#9a8f80');
      const hpF = ent.hpMax ? Math.max(0, ent.hp / ent.hpMax) : 0;
      setStyle($('.ci-bar.hp .fill'), 'width', (hpF * 100).toFixed(1) + '%');
      setText($('.ci-bar.hp span'), ent.alive === false ? `Back in ${Math.ceil((hi?.respawnIn || 0) / tickHz)}s` : `${fmtHp(ent.hp)} / ${fmtHp(ent.hpMax)}`);
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
        tags.innerHTML = `<span class="tag dmg" data-type="${ent.dmgType}" data-tip="Damage type: each type hits one armour hard (+15%) and one armour poorly (−10%).">${icon('sword')}${DMG_NAMES[ent.dmgType] || ent.dmgType || '—'}${dps ? ` · ${fmt(dps, { decimals: 0 })} dps` : ''}</span>
          <span class="tag arm" data-tip="Armour class: decides which damage types hurt it most.${isMine ? ' The number is your armour value.' : ''}">${icon('shield')}${ARMOUR_NAMES[ent.armour] || ent.armour || '—'}${isMine && hi?.armor ? ` · ${fmt(hi.armor, { decimals: 0 })}` : ''}</span>`;
      }
      const sk = (ent.statuses || []).map((x) => x.id + (x.stacks || '')).join(',');
      if (statusEl._k !== sk) {
        statusEl._k = sk;
        statusEl.innerHTML = (ent.statuses || []).filter((x) => !x.id.startsWith('lock_')).map((x) => `<span class="st ${BAD.has(x.id) ? 'bad' : 'good'}" data-tip="${STATUS_NAMES[x.id] || x.id}: ${STATUS_TEXT[x.id] || 'an effect from a skill.'}">${(STATUS_NAMES[x.id] || x.id).slice(0, 3)}${x.stacks > 1 ? `<b>${x.stacks}</b>` : ''}</span>`).join('');
      }
      const xpF = hi && isMine ? (hi.xpNext > hi.xpPrev ? (hi.xp - hi.xpPrev) / (hi.xpNext - hi.xpPrev) : 1) : 0;
      $('.ci-xp').hidden = !isMine;
      setStyle($('.ci-xp .fill'), 'width', (Math.max(0, Math.min(1, xpF)) * 100).toFixed(1) + '%');
      setText($('.crest-fallback span'), (Q.entName(s, data, ent) || '?')[0]);
    }

    // Skills (the Druid's wolf form swaps these: heroInfo returns the form's skills).
    const byslot = {};
    for (const sk of hi?.skills || []) byslot[sk.slot] = sk;
    const heroDef = data.heroes?.heroes?.[me.hero];
    SKILL_KEYS.forEach((k, i) => updateSkill(skillCells[i], byslot[k], heroDef));
    updateSkill(dCell, byslot.D, heroDef);
    toggle(bar, 'has-points', (hi?.skillPts || 0) > 0);
    toggle(bar, 'form', !!hi?.form);

    // Building buttons.
    const open = openPanel();
    for (const el of [...bldCells, hireBtn]) toggle(el, 'open', open === el.dataset.bld);
    const bk = bldCells.map((el) => el.dataset.bld).join();
    if (bar._bk !== bk) {
      bar._bk = bk;
      for (const el of bldCells) {
        const kind = el.dataset.bld;
        const d = data.buildings?.kinds?.[kind];
        setTipHtml(el, `<b>${BUILDING_NAMES[kind]}</b> <span class="muted">${isPad ? BUILDING_PAD[kind] : BUILDING_KEYS[kind]}</span><br>${d?.desc || ''}`);
      }
    }
    for (const el of bldCells) setText(el.querySelector('.cc-sub'), el.dataset.bld === 'shop' ? 'items' : el.dataset.bld === 'drillyard' ? 'train' : 'powers');

    // Inventory.
    const inv = Q.inventoryInfo(s, data, player);
    inv.slots.forEach((v, i) => {
      const b = invCells[i]; if (!b) return;
      const k = v ? `${v.uid}|${v.chargesLeft}` : 'e';
      if (b._k !== k) {
        b._k = k;
        const url = v?.icon ? itemIconUrl(v.icon) : null;
        b.innerHTML = v ? `${url ? `<img src="${url}" alt="" draggable="false">` : `<b>${v.name.slice(0, 2)}</b>`}${v.consumable && v.chargesLeft > 1 ? `<i>${v.chargesLeft}</i>` : ''}${v.uniqueEquipped ? '<span class="uq">★</span>' : ''}<kbd>${i + 1}</kbd>` : `<kbd>${i + 1}</kbd>`;
      }
      toggle(b, 'empty', !v);
      toggle(b, 'usable', !!v?.consumable);
      toggle(b, 'ready', !!v?.canUse);
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
      for (const lane of f.lanes) ctx.fillRect(X(lane[0].x) - 1.5, Z(f.zGate), 3, (f.zKeep - f.zGate) * k);
      ctx.fillStyle = TEAM_CSS[f.team]; ctx.fillRect(X(f.keep.x) - 5, Z(f.keep.z) - 3, 10, 6);
      ctx.strokeStyle = 'rgba(214,188,128,.5)'; ctx.lineWidth = 1; ctx.strokeRect(X(f.x0) + .5, Z(f.zGate) + .5, (f.x1 - f.x0) * k, (f.zEnd - f.zGate) * k);
    }
    for (const bd of L.buildings || []) { ctx.fillStyle = 'rgba(242,196,90,.75)'; ctx.fillRect(X(bd.x) - 2, Z(bd.z) - 2, 4, 4); }
    const me = sim.state.players[player];
    for (const e of sim.state.ents) {
      if (e.alive === false) continue;
      const hero = e.kind === 'hero';
      ctx.fillStyle = e.team < 0 ? '#c8b48a' : TEAM_CSS[e.team];
      const r = hero ? 3.2 : 1.6;
      ctx.beginPath(); ctx.arc(X(e.x), Z(e.z), r, 0, Math.PI * 2); ctx.fill();
      // Your own units (in the enemy field) get a white rim so you can follow them.
      if ((hero && e.id === me.heroEnt) || (e.kind === 'unit' && e.owner === player)) { ctx.strokeStyle = '#fff'; ctx.lineWidth = hero ? 1.2 : 0.7; ctx.stroke(); }
    }
    if (cameraBox) {
      const pts = cameraBox();
      if (pts) {
        ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1;
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Z(p.z)) : ctx.moveTo(X(p.x), Z(p.z)))); ctx.closePath(); ctx.stroke();
      }
    }
    mini._map = { X, Z, k, ox, oz, b };
  }
  let cameraBox = null;
  let onMiniClick = null;
  mini.addEventListener('mousedown', (e) => {
    const m = mini._map; if (!m || !onMiniClick) return;
    const r = mini.getBoundingClientRect();
    const px = (e.clientX - r.left) * (mini.width / r.width), pz = (e.clientY - r.top) * (mini.height / r.height);
    onMiniClick({ x: m.b.x0 + (px - m.ox) / m.k, z: m.b.z0 + (pz - m.oz) / m.k, button: e.button });
    e.preventDefault();
  });
  mini.addEventListener('contextmenu', (e) => e.preventDefault());

  function setSelected(id) { selected = id; for (const fn of selectListeners) fn(id); }

  return {
    el: bar, portraitSlot, hireButton: hireBtn,
    update,
    select(id) { setSelected(id); },
    get selected() { return selected; },
    onSelect(fn) { selectListeners.add(fn); return () => selectListeners.delete(fn); },
    setCameraBox(fn) { cameraBox = fn; },
    onMinimap(fn) { onMiniClick = fn; },
    /** fn(kind) opens a building panel; isOpen() returns the open panel's kind (for the lit button). */
    onBuilding(fn, isOpen) { onBuilding = fn; openPanel = isOpen || (() => null); },
    destroy() { bar.remove(); },
  };
}
