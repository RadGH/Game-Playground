// The flight HUD. DOM for text (bars, goal card, target card, prompts) and one overlay canvas for things that sit
// on the 3D view: the crosshair (with a tick for every turret that can reach it), the nose marker, enemy brackets
// with health, the locked target's lead marker (where to shoot so a shell meets it), off-screen arrows, loot
// labels and the radar (a disc seen from above your ship; stalks show how far above or below things are).

import * as THREE from 'three';
import { $, el, num, dist, credits as cr, btn } from './dom.js';
import { vsub, vlen, vdot, vnorm, qinv, clamp } from '../core/math.js';
import { hostile, leadPoint, inSafeZone, integrity } from '../sim/world.js';
import { turretFrame, turretDir, aimAngles, PITCH_MIN, upOf, forward } from '../sim/body.js';
import { cargoUsed } from '../sim/state.js';
import { currentGoal, goalProgress } from '../sim/goals.js';
import { RARITY, ORES } from '../data/blocks.js';
import { itemName } from '../sim/items.js';
import { bindingText } from '../core/input.js';

export function createHud(app) {
  const hud = $('#hud'); hud.classList.remove('hidden');
  const cv = $('#overlay'); const g = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  function resize() { dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
  resize();
  const bars = { hull: $('#bar-hull'), shield: $('#bar-shield'), boost: $('#bar-boost'), power: $('#bar-power') };
  const flashT = { hull: 0, shield: 0 };
  const v3 = new THREE.Vector3();
  const project = p => { v3.set(p.x, p.y, p.z).project(app.camera); return { x: (v3.x * 0.5 + 0.5) * W, y: (-v3.y * 0.5 + 0.5) * H, front: v3.z < 1 }; };
  $('#btn-menu').onclick = () => app.openMenu?.();
  $('#goal').onclick = () => app.openGoals?.();
  $('#radar').onclick = () => app.openMap?.();
  let goalKey = '';

  function setBar(elm, frac, text) { elm.querySelector('i').style.transform = `scaleX(${clamp(frac, 0, 1)})`; elm.querySelector('span').textContent = text; }
  function update(dt, now, paused) {
    const P = app.P, w = app.w, G = app.G; if (!P || !w) return;
    hud.classList.toggle('hidden', app.mode !== 'fly' && app.mode !== 'dead');
    const st = P.stats;
    const ig = integrity(P); setBar(bars.hull, ig, `Hull ${Math.round(ig * 100)}%`);
    bars.shield.classList.toggle('hidden', !st.shield);
    if (st.shield) setBar(bars.shield, P.shield / st.shield, `Shield ${num(P.shield)} / ${num(st.shield)}`);
    setBar(bars.boost, P.cruise ? 1 : P.boostE, P.cruise ? 'Cruise' : 'Boost');
    bars.boost.classList.toggle('cruise', !!P.cruise);
    bars.power.classList.toggle('hidden', st.powerRatio >= 1);
    if (st.powerRatio < 1) setBar(bars.power, st.powerRatio, `Power ${Math.round(st.powerRatio * 100)}% — guns slowed`);
    for (const k of ['hull', 'shield']) { flashT[k] = Math.max(0, flashT[k] - dt * 3); bars[k].style.boxShadow = flashT[k] > 0 ? `0 0 ${12 * flashT[k]}px ${k === 'hull' ? '#ff7a4a' : '#5fc8ff'}` : ''; }
    $('#st-credits').textContent = cr(G.credits);
    const used = cargoUsed(G); $('#st-cargo').textContent = `Cargo ${num(used)} / ${num(st.cargo)}`;   // economy: ore + goods share the hold
    $('#st-cargo').classList.toggle('bad', used >= st.cargo);
    $('#st-speed').textContent = `${num(vlen(P.vel))} m/s`;
    const sys = w.sys; $('#st-system').textContent = `${sys.name} · danger ${sys.danger}`;
    // goal
    const goal = currentGoal(G); const gk = goal ? goal.id + goalProgress(G, goal).have : 'none';
    if (gk !== goalKey) { goalKey = gk; drawGoal(goal); }
    // prompt
    const prompt = $('#prompt');
    const dockable = app.mode === 'fly' && app.w.station && vlen(vsub(P.pos, app.w.station.pos)) < app.w.station.radius + 60;
    const hint = app.input?.device === 'pad' ? 'X' : 'F';
    if (dockable) { prompt.textContent = `${hint} · Dock at ${w.station.name}`; prompt.classList.remove('hidden'); }
    else if (P.grace > w.t) { prompt.textContent = `Safe launch ${Math.ceil(P.grace - w.t)} s`; prompt.classList.remove('hidden'); }
    else prompt.classList.add('hidden');
    // target card
    const T = P.target && !P.target.dead ? P.target : null; const tc = $('#target');
    tc.classList.toggle('hidden', !T);
    if (T) {
      tc.replaceChildren(el('h4', {}, T.name), el('div', { class: 'kv' },
        el('span', {}, 'Distance'), el('b', {}, dist(vlen(vsub(T.pos, P.pos)))),
        el('span', {}, 'Hull'), el('b', {}, `${Math.round(integrity(T) * 100)}%`),
        T.stats.shield ? el('span', {}, 'Shield') : '', T.stats.shield ? el('b', {}, `${num(T.shield)} / ${num(T.stats.shield)}`) : '',
        el('span', {}, 'Rating'), el('b', {}, num(T.stats.rating))));
    }
    if (!paused || app.mode === 'dead') drawOverlay(now);
  }
  function drawGoal(goal) {
    const box = $('#goal');
    if (!goal) { box.classList.add('hidden'); return; }
    const p = goalProgress(app.G, goal);
    box.classList.remove('hidden');
    box.replaceChildren(el('b', {}, goal.title), el('p', {}, goal.text), el('div', { class: 'prog' }, el('i', { style: `width:${Math.round(p.have / p.need * 100)}%` })), el('small', {}, `${num(p.have)} / ${num(p.need)} · reward ${cr(goal.reward)}`));
  }

  function drawOverlay(now) {
    const P = app.P, w = app.w;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    if (app.mode !== 'fly') return;
    const cx = W / 2, cy = H / 2;
    // enemies + loot + station markers
    for (const b of w.bodies) {
      if (b.dead || b === P) continue;
      const isFoe = b.kind === 'ship' && hostile(P, b); const isSt = b.kind === 'station';
      if (!isFoe && !isSt) continue;
      const pp = app.pose(b).pos; const d = vlen(vsub(pp, P.pos)); if (isFoe && d > 2600) continue;
      const s = project(pp);
      const on = s.front && s.x > 20 && s.x < W - 20 && s.y > 20 && s.y < H - 20;
      const col = isSt ? '#62f0a8' : b === P.target ? '#ffc45a' : '#ff5a4a';
      if (on) {
        const r = clamp(b.radius * app.camera.projectionMatrix.elements[5] * H / 2 / Math.max(1, d), 10, 120);
        g.strokeStyle = col; g.lineWidth = b === P.target ? 2 : 1.4;
        if (isSt) { g.beginPath(); g.moveTo(s.x, s.y - 9); g.lineTo(s.x + 9, s.y); g.lineTo(s.x, s.y + 9); g.lineTo(s.x - 9, s.y); g.closePath(); g.stroke(); label(s.x, s.y + 22, `${b.name} · ${dist(d)}`, col); continue; }
        bracket(s.x, s.y, r, col);
        // health
        const f = integrity(b); const bw = Math.max(34, r * 1.4);
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(s.x - bw / 2, s.y - r - 10, bw, 4); g.fillStyle = col; g.fillRect(s.x - bw / 2, s.y - r - 10, bw * f, 4);
        if (b.stats.shield) { g.fillStyle = '#5fc8ff'; g.fillRect(s.x - bw / 2, s.y - r - 15, bw * (b.shield / b.stats.shield), 3); }
        if (b === P.target || d < 600) label(s.x, s.y + r + 14, `${b.boss ? '★ ' : ''}${b.name} · ${dist(d)}`, col);
        // lead marker for the locked target: where shells must go to meet it
        if (b === P.target) {
          const sp = P.turrets.find(t => t.s.speed && t.def.fire !== 'missile')?.s.speed;
          if (sp) { const lp = leadPoint(P.pos, pp, sp, b.vel, P.vel); const ls = project(lp); if (ls.front) { g.strokeStyle = '#ffc45a'; g.beginPath(); g.arc(ls.x, ls.y, 6, 0, 7); g.stroke(); g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(ls.x, ls.y); g.setLineDash([3, 4]); g.stroke(); g.setLineDash([]); } }
        }
      } else if (isFoe && d < 1800 || isSt) {
        // arrow at the screen edge pointing toward it
        let dx = s.x - cx, dy = s.y - cy; if (!s.front) { dx = -dx; dy = -dy; }
        const a = Math.atan2(dy, dx); const R = Math.min(W, H) * 0.42;
        const ax = cx + Math.cos(a) * R, ay = cy + Math.sin(a) * R;
        g.save(); g.translate(ax, ay); g.rotate(a); g.fillStyle = col; g.beginPath(); g.moveTo(10, 0); g.lineTo(-6, -7); g.lineTo(-6, 7); g.closePath(); g.fill(); g.restore();
      }
    }
    for (const k of w.pickups) {
      if (k.kind !== 'item') continue; const d = vlen(vsub(k.pos, P.pos)); if (d > 700) continue;
      const s = project(k.pos); if (!s.front) continue;
      label(s.x, s.y - 16, `${RARITY[k.item.rarity].name} ${itemName(k.item)}`, RARITY[k.item.rarity].color);
    }
    // world: markers from other systems (jobs, encounters, scan marks, the orbit spot) — ui/world-ext.js
    for (const m of app.hudMarkers || []) m.overlay?.({ g, project, label, bracket, W, H, cx, cy, P, w });
    // nose marker: where the ship points now (it turns toward the crosshair)
    const nose = project({ x: P.pos.x + forward(P).x * 1000, y: P.pos.y + forward(P).y * 1000, z: P.pos.z + forward(P).z * 1000 });
    if (nose.front) { g.strokeStyle = 'rgba(180,220,255,0.55)'; g.lineWidth = 1.5; g.beginPath(); g.arc(nose.x, nose.y, 5, 0, 7); g.stroke(); g.beginPath(); g.moveTo(nose.x - 12, nose.y); g.lineTo(nose.x - 7, nose.y); g.moveTo(nose.x + 7, nose.y); g.lineTo(nose.x + 12, nose.y); g.stroke(); }
    // crosshair with a tick per turret that can reach the aim point
    const aimP = P.input.aimPoint; let bear = 0, total = 0;
    if (aimP) for (const t of P.turrets) { total++; const fr = turretFrame(P, t); const a = aimAngles(fr, vnorm(vsub(aimP, fr.mount))); const d = vlen(vsub(aimP, fr.mount)); if (a.pitch >= PITCH_MIN - 0.02 && d < t.s.range * 1.15) bear++; }
    const safe = inSafeZone(w, P.pos);
    g.strokeStyle = safe ? 'rgba(98,240,168,0.8)' : app.aimHit && hostile(P, app.aimHit.body) ? '#ff7a5a' : 'rgba(220,235,255,0.9)'; g.lineWidth = 1.6;
    g.beginPath(); g.arc(cx, cy, 14, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(cx - 24, cy); g.lineTo(cx - 17, cy); g.moveTo(cx + 17, cy); g.lineTo(cx + 24, cy); g.moveTo(cx, cy - 24); g.lineTo(cx, cy - 17); g.moveTo(cx, cy + 17); g.lineTo(cx, cy + 24); g.stroke();
    for (let i = 0; i < total; i++) { const a = -Math.PI / 2 + (i - (total - 1) / 2) * 0.22; g.strokeStyle = i < bear ? '#62f0a8' : 'rgba(255,255,255,0.18)'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 20, a - 0.07, a + 0.07); g.stroke(); }
    if (safe) label(cx, cy + 42, 'Station safe zone — weapons hold fire', '#62f0a8');
    drawRadar(now);
  }
  function bracket(x, y, r, col) {
    const k = r * 0.35; g.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { g.moveTo(x + sx * r, y + sy * (r - k)); g.lineTo(x + sx * r, y + sy * r); g.lineTo(x + sx * (r - k), y + sy * r); }
    g.stroke();
  }
  function label(x, y, text, col) { g.font = '600 12px Barlow, sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(0,0,0,0.6)'; const wdt = g.measureText(text).width; g.fillRect(x - wdt / 2 - 4, y - 10, wdt + 8, 15); g.fillStyle = col; g.fillText(text, x, y + 1); }

  const rc = $('#radar'); const rg = rc.getContext('2d');
  function drawRadar() {
    const P = app.P, w = app.w; const S = rc.width = rc.height = 190 * dpr; rg.setTransform(dpr, 0, 0, dpr, 0, 0);
    const R = 85, c = 95, range = 2000;
    rg.clearRect(0, 0, 190, 190);
    rg.fillStyle = 'rgba(6,12,24,0.78)'; rg.beginPath(); rg.arc(c, c, R + 4, 0, 7); rg.fill();
    rg.strokeStyle = 'rgba(95,216,255,0.25)'; rg.lineWidth = 1; for (const f of [1, 0.66, 0.33]) { rg.beginPath(); rg.arc(c, c, R * f, 0, 7); rg.stroke(); }
    rg.beginPath(); rg.moveTo(c, c - R); rg.lineTo(c, c + R); rg.moveTo(c - R, c); rg.lineTo(c + R, c); rg.stroke();
    const dot = (p, col, size = 3, stalk = true) => {
      const l = qinv(P.quat, vsub(p, P.pos)); const d = Math.hypot(l.x, l.z, l.y); let k = Math.min(1, d / range) / (d || 1);
      const x = c + l.x * k * R, y = c - l.z * k * R, up = clamp(l.y / range * R, -30, 30);
      if (stalk) { rg.strokeStyle = col; rg.globalAlpha = 0.5; rg.beginPath(); rg.moveTo(x, y); rg.lineTo(x, y - up); rg.stroke(); rg.globalAlpha = 1; }
      rg.fillStyle = col; rg.beginPath(); rg.arc(x, y - up, size, 0, 7); rg.fill();
    };
    for (const b of w.bodies) {
      if (b.dead || b === P) continue;
      if (b.kind === 'station') dot(b.pos, '#62f0a8', 5);
      else if (b.kind === 'ship') dot(b.pos, b === P.target ? '#ffc45a' : hostile(P, b) ? '#ff5a4a' : b.team === 'player' ? '#5fd8ff' : b.team === 'ally' ? '#7ad8ff' : '#ffd27a', b.boss ? 5 : b.team === 'player' ? 2 : 3);   // world: friends are not red
      else if (b.kind === 'rock' && vlen(vsub(b.pos, P.pos)) < range) dot(b.pos, 'rgba(190,170,150,0.55)', 1.6, false);
    }
    for (const k of w.pickups) if (k.kind === 'item') dot(k.pos, RARITY[k.item.rarity].color, 2.2, false);
    for (const m of app.hudMarkers || []) m.radar?.({ dot, rg, c, R, range, P, w });   // world:
    rg.fillStyle = '#dff4ff'; rg.beginPath(); rg.moveTo(c, c - 7); rg.lineTo(c + 5, c + 5); rg.lineTo(c - 5, c + 5); rg.closePath(); rg.fill();
  }
  return { update, resize, flash(k) { flashT[k] = 1; }, goal() { goalKey = ''; } };
}
