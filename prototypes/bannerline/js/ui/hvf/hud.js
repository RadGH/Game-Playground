// Hunters vs Farmers HUD (stream H). Plain DOM over the 3D view, rebuilt only where numbers change.
//
//   top bar      clock · release countdown · gold · income/s · strays · the Turn moon · sides strip
//   farmer bar   build grid (cost, income, payback, how loud) · farm upgrades · Scamper / Lie Low / Bell
//                · army panel once a Harvest Hall stands
//   hunter bar   Pounce / Snare / Hawk / Horn with cooldowns · six item slots · lodge · the shop at a lodge
//   minimap      terrain + fog + what you can see (+ remembered buildings, noise ripples)
//   ghost card   "you are down" with the revive / Farmhouse timer
// Every button has a tooltip (shared/tooltip.js: data-tip, or the hvf-* renderers registered here).

import * as Q from '../../sim/modes/hvf/query.js';
import { KIND } from '../../sim/modes/hvf/mapgen.js';
import { hasBit } from '../../sim/modes/hvf/vision.js';
import { registerTip } from '../../../../../shared/tooltip.js';
import { FARMER_COLOURS } from '../../view/hvf/actors.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const TELL = ['silent', 'quiet', 'noisy', 'loud'];
export const REASONS = {
  gold: 'Not enough gold', blocked: 'Cannot build there', reach: 'Cannot get there', role: 'Not for your role', dead: 'You are down',
  kennel: 'Still in the kennel — wait for the release', onePer: 'Only one of those', needs: 'Needs 3 producer buildings first', cap: 'Army is at its limit',
  max: 'Already at the maximum', cooldown: 'Not ready yet', level: 'Needs a higher level', unseen: 'You cannot see that', notAtShop: 'Stand at one of your lodges to shop',
  uniqueEquipped: 'You can carry only one of those', group: 'You already have a mount', full: 'All six slots are full', notUsable: 'That item is not used — it just works',
  none: 'No watchstones carried', over: 'The match is over', bad: 'Not possible',
};
const SKILL_KEYS = { farmer: ['Q', 'W', 'E'], hunter: ['Q', 'W', 'E', 'R'] };
const FARMER_ABILITY_TEXT = {
  Q: 'Run 60% faster for 2.5 s.', W: 'Stand still for 1.5 s in tall grass or at a forest edge: you are seen only from 3 m until you move.',
  E: 'Ring the bell: every animal of yours within 30 m trots home.',
};
const HUNTER_SKILL_TEXT = {
  Q: 'Leap 8 m to a point on the same level.', W: 'Set a hidden snare (3 at most): it roots a farmer for 3 s, slows a scarecrow. Farmers see it only from 6 m.',
  E: 'Send your hawk to a point: it circles for 12 s and sees 12 m.', R: 'Every animal within 40 m bolts home and shows for 5 s (from level 6).',
};

// spectate: { fog: () => 'farmers' | 'hunters' | 'both' | 'off' } turns this into the spectator's HUD: the
// clock, the Turn and the sides strip stay, the role bar goes (js/ui/spectator.js draws the side panels),
// the minimap shows everyone with the chosen side's fog, and alerts / results are told neutrally.
export function createHvfHud({ root, sim, player, onCmd, onPlace, onAim, onMinimap, getCamBox, keyLabel = (k) => k, iconUrl = () => null, spectate = null }) {
  const ic = (kind, id) => { const u = iconUrl(kind, id); return u ? `<img class="ic" src="${u}" alt="">` : ''; };
  const data = sim.data, map = sim.map;
  const me = () => sim.state.players[player];
  const role = spectate ? 'spectator' : me().role;
  const el = document.createElement('div');
  el.className = 'hvf-hud ' + role;
  root.append(el);
  const B = data.hvf.buildings, A = data.hvf.animals, U = data.hvf.units, HJ = data.hvf.hunter, HI = data.hvf['hunter-items'];

  el.innerHTML = `
    <header class="hv-top" data-ui>
      <div class="hv-res"><span class="hv-gold" data-tip="Gold: the only thing that limits what you build or buy"><i class="coin"></i><b data-k="gold">0</b></span>
        <span class="hv-inc" data-k="incw" data-tip=""><b data-k="inc">+0</b>/s</span>
        <span class="hv-strays" data-k="strayw" hidden data-tip="Animals wandering far from home leave tracks and are how hunters find a farm. Ring the Bell (E) to call them in."><b data-k="strays">0</b> strays</span>
        <span class="hv-lvl" data-k="lvlw" hidden data-tip="Hunters level up from kills only: +8% health and damage per level">Lv <b data-k="lvl">1</b></span>
      </div>
      <div class="hv-clock"><b data-k="clock">0:00</b><small data-k="clocksub"></small></div>
      <div class="hv-turn" data-tip-render="hvf-turn"><span class="moon"><i data-k="moon"></i></span><small data-k="turn">Hunters' night</small></div>
      <div class="hv-sides" data-k="sides"></div>
      <div class="hv-sound" data-k="soundw" hidden><button class="hv-mute" data-act="mute" data-k="mute" data-tip="Sound on / off (M)">🔊</button><input type="range" min="0" max="100" data-k="vol" data-tip="Volume"></div>
    </header>
    <div class="hv-alerts" data-k="alerts"></div>
    <div class="hv-ghost" data-k="ghost" hidden></div>
    <div class="hv-placehint" data-k="placehint" hidden></div>
    <div class="hv-wait" data-k="wait" hidden></div>
    <div class="hv-shop" data-k="shop" hidden data-ui></div>
    <footer class="hv-bar" data-ui>
      <canvas class="hv-mini" data-k="mini" width="168" height="168" data-tip="Minimap: click to look, right-click to walk there"></canvas>
      <div class="hv-main" data-k="main"></div>
    </footer>
    <div class="hv-result" data-k="result" hidden></div>`;
  const K = {};
  for (const n of el.querySelectorAll('[data-k]')) K[n.dataset.k] = n;
  const setT = (n, v) => { const s = String(v); if (n._t !== s) { n._t = s; n.textContent = s; } };
  const setH = (n, v) => { if (n._h !== v) { n._h = v; n.innerHTML = v; } };

  // ── the role's main bar ──
  if (role === 'farmer') {
    K.main.innerHTML = `
      <div class="hv-group"><h4>Build <small>each copy costs 15% more</small></h4><div class="hv-build" data-k="build">${B.order.map((kind, i) => {
        const d = B.kinds[kind], key = '1234567890-='.charAt(i) || '';
        return `<button class="hv-bt${iconUrl('hvf-building', kind) ? ' has-ic' : ''}" data-build="${kind}" data-tip-render="hvf-build" data-tip-kind="${kind}">${ic('hvf-building', kind)}<span class="nm">${esc(d.name)}</span><span class="cost" data-cost></span><span class="tell t${d.tell}">${'●'.repeat(d.tell) || '○'}</span>${key ? `<kbd>${key}</kbd>` : ''}</button>`;
      }).join('')}</div></div>
      <div class="hv-group"><h4>Farm</h4><div class="hv-ups" data-k="ups">${B.upgrades.order.map((id) => `<button class="hv-bt up" data-up="${id}" data-tip-render="hvf-up" data-tip-up="${id}"><span class="nm">${esc(B.upgrades[id].name)}</span><span class="cost" data-cost></span></button>`).join('')}</div>
        <div class="hv-skills" data-k="skills">${SKILL_KEYS.farmer.map((k) => { const a = U.farmer.abilities[k]; return `<button class="hv-sk" data-skill="${k}" data-tip="${esc(a.name)} — ${esc(FARMER_ABILITY_TEXT[k])}"><b>${esc(a.name)}</b><kbd>${keyLabel(k)}</kbd><i class="cd" data-cd></i></button>`; }).join('')}</div>
        <div class="hv-army" data-k="army" hidden></div></div>`;
  } else if (role === 'hunter') {
    K.main.innerHTML = `
      <div class="hv-group"><h4>Skills</h4><div class="hv-skills" data-k="skills">${SKILL_KEYS.hunter.map((k) => { const s = HJ.skills[k]; return `<button class="hv-sk" data-skill="${k}" data-tip="${esc(s.name)} — ${esc(HUNTER_SKILL_TEXT[k])}${s.level > 1 ? ` (level ${s.level})` : ''}"><b>${esc(s.name)}</b><kbd>${keyLabel(k)}</kbd><i class="cd" data-cd></i></button>`; }).join('')}</div>
        <div class="hv-row"><button class="hv-bt" data-act="lodge" data-tip="Build a lodge (${HJ.lodge.cost} gold, ${HJ.lodge.seconds} s): a shop, a respawn point and 10 m of sight. At most ${HJ.lodge.max} including your kennel. A hunter who dies with no lodge standing is out."><span class="nm">Lodge</span><span class="cost">${HJ.lodge.cost}</span><kbd>L</kbd></button>
        <button class="hv-bt" data-act="shop" data-tip="The hunters' shop: open it at any of your lodges"><span class="nm">Shop</span><kbd>B</kbd></button></div></div>
      <div class="hv-group"><h4>Pack <small>six slots</small></h4><div class="hv-slots" data-k="slots">${[0, 1, 2, 3, 4, 5].map((i) => `<button class="hv-slot" data-slot="${i}" data-tip-render="hvf-slot" data-tip-slot="${i}"><kbd>${i + 1}</kbd></button>`).join('')}</div>
        <div class="hv-stats" data-k="hstats"></div></div>`;
  }

  for (const n of K.main.querySelectorAll('[data-k]')) K[n.dataset.k] = n;

  // ── tooltips (live numbers) ──
  registerTip('hvf-build', (t) => {
    const r = Q.buildMenu(sim, player).find((x) => x.kind === t.dataset.tipKind); if (!r) return null;
    const d = B.kinds[r.kind];
    const lines = [];
    if (d.makes) lines.push(`${d.cap} × ${A.kinds[d.makes].name.toLowerCase()} · +${f1(r.income)} gold/s`);
    else if (r.income) lines.push(`+${f1(r.income)} gold/s`);
    if (r.incomePct) lines.push(`+${Math.round(r.incomePct * 100)}% to all your income`);
    if (r.payback) lines.push(`Pays for itself in ${r.payback} s`);
    if (d.hp) lines.push(`${d.hp} health`);
    return `<div class="tt"><b class="tt-h">${esc(r.name)}</b> <span class="tt-sub">${r.cost} gold · ${TELL[r.tell]}</span><div>${esc(d.desc)}</div>${lines.map((l) => `<div class="tt-good">${esc(l)}</div>`).join('')}
      <div class="tt-dim">${r.tell >= 2 ? 'Loud: hunters hear it and its animals from far off.' : r.tell === 1 ? 'Quiet, but its animals still wander.' : 'Silent.'}</div>
      <div class="tt-key">${r.canBuy ? 'Click, then click where it goes' : esc(REASONS[r.reason] || r.reason)}</div></div>`;
  });
  registerTip('hvf-up', (t) => {
    const r = Q.farmUpgrades(sim, player).find((x) => x.id === t.dataset.tipUp); if (!r) return null;
    return `<div class="tt"><b class="tt-h">${esc(r.name)}</b> <span class="tt-sub">rank ${r.rank} / ${r.ranks}</span><div>${esc(r.desc)}</div><div class="tt-key">${r.cost == null ? 'Done' : `${r.cost} gold`}</div></div>`;
  });
  registerTip('hvf-slot', (t) => {
    const it = me().inv?.[Number(t.dataset.tipSlot)];
    if (!it) return `<div class="tt"><b class="tt-h">Empty slot</b><div class="tt-dim">Buy items at one of your lodges. Every copy counts.</div></div>`;
    const d = HI.items[it.id];
    return `<div class="tt"><b class="tt-h">${esc(d.name)}</b> <span class="tt-sub">${d.price} gold${d.charges ? ` · ${it.charges} left` : ''}</span><div>${esc(d.desc)}</div><div class="tt-key">${d.use ? 'Click or press its number to use' : 'Works while carried'}</div></div>`;
  });
  registerTip('hvf-shopitem', (t) => {
    const d = HI.items[t.dataset.tipItem]; if (!d) return null;
    return `<div class="tt"><b class="tt-h">${esc(d.name)}</b> <span class="tt-sub">${d.price} gold${d.uniqueEquipped ? ' · unique' : ''}${d.group ? ' · one mount' : ''}</span><div>${esc(d.desc)}</div></div>`;
  });
  registerTip('hvf-turn', () => {
    const t = Q.turnInfo(sim);
    return `<div class="tt"><b class="tt-h">The Turn</b><div>${esc(t.reason)}</div><div class="tt-dim">Farmers' army and towers: ${t.farm} · hunters' strength: ${t.hunt}</div>
      <div class="tt-key">New moon = the hunters' night. Full moon = the farmers have turned the hunt around.</div></div>`;
  });

  // ── clicks ──
  let sound = null;
  K.vol.addEventListener('input', () => { sound?.setVolume(K.vol.value / 100); });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'mute') { if (sound) { sound.setMuted(!sound.settings.muted); paintSound(); } return; }
    sound?.ui('click');
    if (b.dataset.build) onPlace(b.dataset.build);
    else if (b.dataset.up) onCmd({ type: 'upgrade', id: b.dataset.up });
    else if (b.dataset.skill) onAim({ skill: b.dataset.skill });
    else if (b.dataset.slot != null) useSlot(Number(b.dataset.slot));
    else if (b.dataset.act === 'lodge') onAim({ lodge: true });
    else if (b.dataset.act === 'shop') toggleShop();
    else if (b.dataset.buy) onCmd({ type: 'buy', id: b.dataset.buy });
    else if (b.dataset.sell != null) onCmd({ type: 'sell', slot: Number(b.dataset.sell) });
    else if (b.dataset.train) onCmd({ type: 'train', unit: b.dataset.train, building: Number(b.dataset.hall) });
    else if (b.dataset.act === 'armygo') onAim({ army: true });
    else if (b.dataset.act === 'closeshop') toggleShop(false);
  });
  el.addEventListener('contextmenu', (e) => { const b = e.target.closest('.hv-slot'); if (b && shopOpen) { e.preventDefault(); onCmd({ type: 'sell', slot: Number(b.dataset.slot) }); } });

  function useSlot(i) {
    const it = me().inv?.[i]; if (!it) return;
    const use = HI.items[it.id].use;
    if (!use) { alert(REASONS.notUsable, 'info'); return; }
    if (use === 'ward' || use === 'flare') onAim({ slot: i, use });
    else onCmd({ type: 'use', slot: i });
  }

  // ── shop (hunters, at a lodge) ──
  let shopOpen = false;
  function toggleShop(v = !shopOpen) {
    shopOpen = v;
    K.shop.hidden = !v;
    if (v) {
      K.shop.innerHTML = `<header><b>Hunters' shop</b><small>Stand at a lodge. Every copy counts; right-click a pack slot to sell for half.</small><button class="x" data-act="closeshop" data-tip="Close (B)">×</button></header>
        <div class="hv-shopgrid">${Object.keys(HI.items).map((id) => `<button class="hv-item" data-buy="${id}" data-tip-render="hvf-shopitem" data-tip-item="${id}">${ic('hvf-item', id)}<b>${esc(HI.items[id].name)}</b><span class="cost">${HI.items[id].price}</span></button>`).join('')}</div>`;
    }
  }

  // ── alerts ──
  function alert(text, kind = 'info', ms = 3200) {
    const a = document.createElement('div');
    a.className = 'hv-alert ' + kind; a.textContent = text;
    K.alerts.prepend(a);
    while (K.alerts.children.length > 5) K.alerts.lastChild.remove();
    setTimeout(() => { a.classList.add('out'); setTimeout(() => a.remove(), 400); }, ms);
  }

  // ── minimap ──
  const mini = K.mini, mctx = mini.getContext('2d');
  const base = document.createElement('canvas'); base.width = map.cols; base.height = map.rows;
  {
    const bctx = base.getContext('2d'), img = bctx.createImageData(map.cols, map.rows);
    const COLS = { [KIND.grass]: [96, 130, 60], [KIND.trail]: [176, 150, 102], [KIND.tree]: [34, 62, 32], [KIND.briar]: [104, 70, 84], [KIND.tallgrass]: [138, 150, 66], [KIND.rock]: [120, 120, 116], [KIND.water]: [52, 98, 132], [KIND.ford]: [96, 150, 168], [KIND.cliff]: [88, 70, 52], [KIND.ramp]: [150, 124, 88] };
    for (let i = 0; i < map.cols * map.rows; i++) { const c = COLS[map.cells[i]], l = map.level[i] ? 1.15 : 1; img.data.set([Math.min(255, c[0] * l), Math.min(255, c[1] * l), Math.min(255, c[2] * l), 255], i * 4); }
    bctx.putImageData(img, 0, 0);
  }
  const fogC = document.createElement('canvas'); fogC.width = map.cols; fogC.height = map.rows;
  const fctx = fogC.getContext('2d'), fimg = fctx.createImageData(map.cols, map.rows);
  const ripples = [];
  let fogT = 0;
  mini.addEventListener('mousedown', (e) => {
    const r = mini.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * map.size, z = (e.clientY - r.top) / r.height * map.size;
    onMinimap({ x, z, button: e.button });
  });
  mini.addEventListener('contextmenu', (e) => e.preventDefault());
  function drawMini(dt, visibleEnt, remembered) {
    const s = sim.state, team = spectate ? -1 : me().team;
    fogT -= dt;
    if (fogT <= 0) {
      fogT = 0.2;
      if (spectate) {
        // the spectator's minimap: the chosen side's fog, light enough to see through (like the 3D view)
        const mode = spectate.fog(), V = s.hvf.vision, E = s.hvf.explored;
        const seen = (i) => (mode === 'farmers' ? hasBit(V[0], i) : mode === 'hunters' ? hasBit(V[1], i) : hasBit(V[0], i) || hasBit(V[1], i));
        const known = (i) => (mode === 'farmers' ? hasBit(E[0], i) : mode === 'hunters' ? hasBit(E[1], i) : hasBit(E[0], i) || hasBit(E[1], i));
        for (let i = 0; i < map.cols * map.rows; i++) fimg.data[i * 4 + 3] = mode === 'off' || seen(i) ? 0 : known(i) ? 45 : 95;
      } else {
        const vis = s.hvf.vision[team], ex = s.hvf.explored[team];
        for (let i = 0; i < map.cols * map.rows; i++) fimg.data[i * 4 + 3] = hasBit(vis, i) ? 0 : hasBit(ex, i) ? 130 : 225;
      }
      fctx.putImageData(fimg, 0, 0);
    }
    const W = mini.width, k = W / map.size;
    mctx.imageSmoothingEnabled = false;
    mctx.drawImage(base, 0, 0, W, W);
    mctx.drawImage(fogC, 0, 0, W, W);
    for (const m of remembered) { mctx.fillStyle = '#9a8f7a'; mctx.fillRect(m.x * k - 2, m.z * k - 2, 4, 4); }
    for (const e of s.ents) {
      if (!e.alive || e._gone || !visibleEnt(e)) continue;
      let c = null, r = 1.5;
      if (e.kind === 'farmer') { c = FARMER_COLOURS[s.players[e.owner].colour % FARMER_COLOURS.length]; r = 3; }
      else if (e.kind === 'hunter') { c = '#ff4a3a'; r = 3; }
      else if (e.kind === 'animal') { c = '#f5f2e8'; r = 1.2; }
      else if (e.kind === 'building') { c = team < 0 ? (e.team === 1 ? '#d06a50' : '#ffe08a') : e.team === team ? '#ffe08a' : '#d06a50'; r = 2.5; }
      else if (e.kind === 'army') { c = '#e8c070'; r = 2; }
      else if (e.kind === 'ward' || e.kind === 'hawk') { c = '#9fe0ff'; r = 2; }
      if (!c) continue;
      mctx.fillStyle = c;
      mctx.beginPath(); mctx.arc(e.x * k, e.z * k, r, 0, 6.283); mctx.fill();
    }
    for (const g of s.hvf.graves) { mctx.strokeStyle = '#e0e0e0'; mctx.strokeRect(g.x * k - 2.5, g.z * k - 2.5, 5, 5); }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i]; rp.t += dt;
      if (rp.t > 1.6) { ripples.splice(i, 1); continue; }
      mctx.strokeStyle = `rgba(255,220,120,${1 - rp.t / 1.6})`; mctx.lineWidth = 1.5;
      mctx.beginPath(); mctx.arc(rp.x * k, rp.z * k, 3 + rp.t * 10, 0, 6.283); mctx.stroke();
    }
    const box = getCamBox?.();
    if (box) { mctx.strokeStyle = 'rgba(255,255,255,.7)'; mctx.lineWidth = 1; mctx.beginPath(); box.forEach((p, i) => (i ? mctx.lineTo(p.x * k, p.z * k) : mctx.moveTo(p.x * k, p.z * k))); mctx.closePath(); mctx.stroke(); }
  }

  // ── per-frame refresh ──
  function update(dt, { visibleEnt, remembered, placing }) {
    const s = sim.state, p = me(), c = Q.clock(sim);
    if (spectate) {
      setT(K.clock, mmss(c.left));
      setT(K.clocksub, c.released ? 'until the farmers hold out' : `hunters released in ${Math.ceil(c.releaseIn)} s`);
      const t = s.hvf.turn;
      K.moon.style.setProperty('--full', Math.round((t + 1) * 50) + '%');
      setT(K.turn, t < -0.6 ? "Hunters' night" : t < 0 ? 'Waxing' : t < 0.6 ? 'Turning' : "Farmers' moon");
      const si = Q.sideInfo(sim);
      setH(K.sides, `<span class="f" data-tip="Farmers up / down">🌾 ${si.farmers.alive}${si.farmers.ghost ? ` <i>· ${si.farmers.ghost} down</i>` : ''}</span><span class="h" data-tip="Hunters up / out">🏹 ${si.hunters.alive}${si.hunters.down ? ` <i>· ${si.hunters.down} down</i>` : ''}${si.hunters.out ? ` <i>· ${si.hunters.out} out</i>` : ''}</span>`);
      K.ghost.hidden = true;
      drawMini(dt, visibleEnt, remembered);
      return;
    }
    setT(K.gold, Math.floor(p.gold));
    setT(K.clock, mmss(c.left));
    setT(K.clocksub, c.released ? 'until the farmers hold out' : `hunters released in ${Math.ceil(c.releaseIn)} s`);
    const t = s.hvf.turn, moon = Math.round((t + 1) * 50);
    K.moon.style.setProperty('--full', moon + '%');
    setT(K.turn, t < -0.6 ? "Hunters' night" : t < 0 ? 'Waxing' : t < 0.6 ? 'Turning' : "Farmers' moon");
    const si = Q.sideInfo(sim);
    setH(K.sides, `<span class="f" data-tip="Farmers up / down">🌾 ${si.farmers.alive}${si.farmers.ghost ? ` <i>· ${si.farmers.ghost} down</i>` : ''}</span><span class="h" data-tip="Hunters up / out">🏹 ${si.hunters.alive}${si.hunters.down ? ` <i>· ${si.hunters.down} down</i>` : ''}${si.hunters.out ? ` <i>· ${si.hunters.out} out</i>` : ''}</span>`);
    if (role === 'farmer') {
      const fi = Q.farmerInfo(sim, player);
      setT(K.inc, '+' + f1(fi.income));
      const parts = fi.incomeParts;
      K.incw.dataset.tip = `Income per second: animals ${f1(parts.animals)}, hives ${f1(parts.flat)}${parts.pct ? `, +${Math.round(parts.pct * 100)}% from granaries and windmills` : ''}. Paid every second.`;
      K.strayw.hidden = !fi.strays; setT(K.strays, fi.strays);
      const menu = Q.buildMenu(sim, player);
      for (const r of menu) {
        const b = K.build.querySelector(`[data-build="${r.kind}"]`); if (!b) continue;
        setT(b.querySelector('[data-cost]'), r.cost);
        b.classList.toggle('no', !r.canBuy); b.classList.toggle('on', placing === r.kind);
      }
      for (const r of Q.farmUpgrades(sim, player)) {
        const b = K.ups.querySelector(`[data-up="${r.id}"]`);
        setT(b.querySelector('[data-cost]'), r.cost == null ? '✓' : r.cost);
        b.classList.toggle('no', !r.canBuy); b.classList.toggle('done', r.cost == null);
        if (r.ranks > 1) b.querySelector('.nm').textContent = `${B.upgrades[r.id].name} ${'I'.repeat(Math.min(3, r.rank + (r.cost == null ? 0 : 1)))}`;
      }
      for (const k of SKILL_KEYS.farmer) {
        const left = Math.max(0, ((p.cd[k] || 0) - s.tick) / 20), cd = U.farmer.abilities[k].cooldown;
        const b = K.skills.querySelector(`[data-skill="${k}"]`);
        b.querySelector('[data-cd]').style.height = (left > 0 ? (left / cd) * 100 : 0) + '%';
        b.classList.toggle('no', left > 0 || p.ghost);
      }
      const hall = s.ents.find((e) => e.kind === 'building' && e.type === 'hall' && e.owner === player && e.alive && !e._gone);
      K.army.hidden = !hall;
      if (hall) {
        const ai = Q.armyInfo(sim, player);
        setH(K.army, `<h4>Army <small>${ai.count} / ${ai.cap}</small></h4>
          <button class="hv-bt" data-train="scarecrow" data-hall="${hall.id}" data-tip="Scarecrow: ${U.army.scarecrow.hp} health, ${U.army.scarecrow.dps} damage/s. Marches on lodges and hunters."><span class="nm">Scarecrow</span><span class="cost">${U.army.scarecrow.cost}</span></button>
          <button class="hv-bt" data-train="crow" data-hall="${hall.id}" data-tip="Crow Flock: ${U.army.crow.flock} crows that fly over trees, see ${U.army.crow.sight} m and pick off watchstones."><span class="nm">Crow Flock</span><span class="cost">${U.army.crow.cost}</span></button>
          <button class="hv-bt" data-act="armygo" data-tip="Send the whole army: click where it should go (it fights what it meets)"><span class="nm">Send army</span><kbd>G</kbd></button>`);
      }
      // ghost card
      if (p.ghost) {
        const gr = s.hvf.graves.find((g) => g.pid === player);
        const fh = s.ents.find((e) => e.kind === 'building' && e.type === 'farmhouse' && e.owner === player && e.alive && !e._gone);
        const left = gr && fh ? Math.max(0, gr.since / 20 + B.kinds.farmhouse.respawn - s.tick / 20) : null;
        K.ghost.hidden = false;
        setH(K.ghost, `<b>You are down</b><span>${left != null ? `Back at your Farmhouse in ${Math.ceil(left)} s.` : 'No Farmhouse: an ally must revive you at your grave (right-click it, 4 s).'}</span><small>Your animals have gone wild and earn nothing until you are back.</small>`);
      } else K.ghost.hidden = true;
    } else {
      const hi = Q.hunterInfo(sim, player);
      setT(K.inc, '+' + f1(p.income));
      K.incw.dataset.tip = 'Hunters earn a trickle once released, plus bounty for every kill.';
      K.lvlw.hidden = false; setT(K.lvl, hi.level);
      for (const sk of hi.skills) {
        const b = K.skills.querySelector(`[data-skill="${sk.slot}"]`);
        b.querySelector('[data-cd]').style.height = (sk.readyIn > 0 ? Math.min(100, sk.readyIn / HJ.skills[sk.slot].cooldown * 100) : 0) + '%';
        b.classList.toggle('no', !sk.canCast);
      }
      hi.inv.forEach((it, i) => {
        const b = K.slots.querySelector(`[data-slot="${i}"]`);
        setH(b, it ? `${ic('hvf-item', it.id)}<b>${esc(it.name)}</b>${it.charges ? `<i class="ch">${it.charges}</i>` : ''}<kbd>${i + 1}</kbd>` : `<kbd>${i + 1}</kbd>`);
        b.classList.toggle('empty', !it);
      });
      const g = hi.gear;
      setH(K.hstats, `<span data-tip="Damage per hit">⚔ ${Math.round(U.hunter.damage * sim.state.hvf.hunterMult * (1 + U.hunter.perLevel * (hi.level - 1)) + g.damage)}</span><span data-tip="Snares standing / allowed">◎ ${hi.snares.standing}/${hi.snares.max}</span><span data-tip="Watchstones planted">◆ ${hi.wards.length}</span><span data-tip="Lodges standing (respawn points)">⌂ ${hi.lodges.length}</span>${hi.tracking ? '<span data-tip="Tracking: you see the tracks strays leave">👣</span>' : ''}`);
      const near = hi.lodges.some((l) => l.done && hi.ent && Math.hypot(l.x - hi.ent.x, l.z - hi.ent.z) <= HJ.lodge.range + 3);
      if (shopOpen) for (const b of K.shop.querySelectorAll('[data-buy]')) {
        const r = Q.hunterShop(sim, player).find((x) => x.id === b.dataset.buy);
        b.classList.toggle('no', !r.canBuy);
      }
      el.classList.toggle('at-lodge', near);
      if (!hi.alive) {
        K.ghost.hidden = false;
        setH(K.ghost, hi.out ? '<b>You are out</b><span>No lodge was standing when you fell.</span>' : `<b>You are down</b><span>Back at a lodge in ${Math.ceil(hi.respawnIn)} s.</span>`);
      } else K.ghost.hidden = true;
    }
    drawMini(dt, visibleEnt, remembered);
  }

  function onEvent(ev) {
    const s = sim.state, p = me();
    const near = (x, z) => nearName(map, x, z);
    if (spectate) { spectatorEvent(ev, near); return; }
    switch (ev.type) {
      case 'released': alert(role === 'hunter' ? 'The kennel opens — go hunting!' : 'The hunters are loose!', role === 'hunter' ? 'good' : 'bad', 4000); break;
      case 'animalKilled': if (ev.owner === player) alert(`A ${ev.kind} was taken near ${near(ev.x, ev.z)}`, 'bad'); break;
      case 'farmerDown': alert(ev.player === player ? 'You are down!' : `${s.players[ev.player].name} is down near ${near(ev.grave.x, ev.grave.z)}`, ev.player === player || role === 'farmer' ? 'bad' : 'good'); break;
      case 'farmerRevived': alert(ev.player === player ? 'You are back on your feet' : `${s.players[ev.player].name} is back on their feet`, role === 'farmer' ? 'good' : 'bad'); break;
      case 'hunterDown': alert(ev.player === player ? 'You fell — back at a lodge soon' : 'A hunter is down', role === 'farmer' ? 'good' : 'bad'); break;
      case 'hunterOut': alert(`${s.players[ev.player].name} is out of the hunt`, role === 'farmer' ? 'good' : 'bad', 4500); break;
      case 'lost': if (ev.owner === player) alert(`Your ${(B.kinds[ev.kind] || { name: ev.kind }).name} was destroyed`, 'bad'); break;
      case 'wardPulled': if (ev.owner === player) alert('Your watchstone was pulled up', 'bad'); else if (role === 'farmer') alert('Watchstone pulled up', 'good'); break;
      case 'snared': if (ev.owner === player) alert('Snared!', 'bad'); else if (ev.by === player) alert('Your snare caught something', 'good'); break;
      case 'levelUp': if (ev.player === player) alert(`Level ${ev.level}!`, 'good'); break;
      case 'turn': alert(ev.value > 0 ? 'The Turn: the farmers now outweigh the hunt' : 'The Turn swings back to the hunters', ev.value > 0 === (role === 'farmer') ? 'good' : 'bad', 4500); break;
      case 'noise': if (role === 'hunter' && ev.heard && ev.heard.includes(player)) ripples.push({ x: ev.x, z: ev.z, t: 0 }); break;
      case 'reject': if (ev.player === player) alert(REASONS[ev.reason] || ev.reason, 'warn', 1600); break;
      case 'item': if (ev.player === player) alert(`Bought ${HI.items[ev.id]?.name || ev.id}`, 'good', 1400); break;
      case 'built': if (ev.player === player) alert(`${(B.kinds[ev.kind] || { name: 'Lodge' }).name} built`, 'good', 1400); break;
      default: break;
    }
  }

  /** The same news, told to someone with no side. */
  function spectatorEvent(ev, near) {
    const s = sim.state, who = (pid) => s.players[pid]?.name || 'Someone';
    switch (ev.type) {
      case 'released': alert('The kennel opens: the hunters are loose', 'warn', 4000); break;
      case 'farmerDown': alert(`${who(ev.player)} is down near ${near(ev.grave.x, ev.grave.z)}`, 'bad'); break;
      case 'farmerRevived': alert(`${who(ev.player)} is back on their feet`, 'good'); break;
      case 'hunterDown': alert(`${who(ev.player)} is down`, 'good'); break;
      case 'hunterOut': alert(`${who(ev.player)} is out of the hunt`, 'good', 4500); break;
      case 'lost': alert(`${who(ev.owner)} lost a ${(B.kinds[ev.kind] || { name: ev.kind }).name}`, 'warn', 2200); break;
      case 'wardPulled': alert('A watchstone was pulled up', 'info', 2000); break;
      case 'snared': alert(`${who(ev.owner)} is snared`, 'warn', 2000); break;
      case 'levelUp': alert(`${who(ev.player)} reached level ${ev.level}`, 'info', 2000); break;
      case 'turn': alert(ev.value > 0 ? 'The Turn: the farmers now outweigh the hunt' : 'The Turn swings back to the hunters', 'warn', 4500); break;
      default: break;
    }
  }

  function paintSound() {
    if (!sound) return;
    const st = sound.settings;
    K.mute.textContent = st.muted ? '🔇' : '🔊';
    K.vol.value = Math.round(st.volume * 100);
  }

  function showResult(result, { onAgain, onBack }) {
    const won = spectate ? true : (result.winner === me().team);
    const why = { caught: 'Every farmer was caught.', hunted: 'Every hunter was put out.', clock: 'The farmers held out until the clock ran down.', surrender: 'A side surrendered.' }[result.reason] || '';
    K.result.hidden = false;
    const head = spectate ? (result.winner === 0 ? 'Farmers win' : 'Hunters win') : won ? 'Victory' : 'Defeat';
    K.result.innerHTML = `<div class="card ${won ? 'win' : 'lose'}"><h2>${head}</h2><p>${result.winner === 0 ? 'The farmers win.' : 'The hunters win.'} ${why}</p>
      <div class="stats">${sim.state.players.map((q) => `<div><b style="color:${q.role === 'farmer' ? FARMER_COLOURS[q.colour % 9] : '#ff7a6a'}">${esc(q.name)}</b> ${q.role} · earned ${Math.round(q.stats.earned)} g${q.role === 'farmer' ? ` · animals lost ${q.stats.animalsLost}` : ` · kills ${q.stats.kills} · level ${q.level}`}</div>`).join('')}</div>
      <div class="btns"><button class="hv-bt big" data-res="again">Play again</button><button class="hv-bt big" data-res="back">Back</button></div></div>`;
    K.result.querySelector('[data-res="again"]').onclick = onAgain;
    K.result.querySelector('[data-res="back"]').onclick = onBack;
  }

  return {
    el, update, onEvent, alert, showResult, useSlot, toggleShop,
    get shopOpen() { return shopOpen; },
    /** The sound bridge arrived: show mute + volume (saved per browser by the bridge). */
    setSound(snd) { sound = snd; K.soundw.hidden = !snd; paintSound(); },
    setWaiting(text) { K.wait.hidden = !text; setT(K.wait, text || ''); },
    setPlaceHint(html) { K.placehint.hidden = !html; if (html) setH(K.placehint, html); },
    destroy() { el.remove(); },
  };
}

/** "the Stone Ring" / "Foxglove Glade": the named place nearest a point (alerts, pings). */
export function nearName(map, x, z) {
  let best = null, bd = 1e18;
  for (const n of map.graph.nodes) {
    if (!n.name) continue;
    const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
    if (d < bd) { bd = d; best = n; }
  }
  return best ? best.name.replace(/^The /, 'the ') : 'the forest';
}
