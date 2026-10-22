// GHOST PHOTOGRAPHER, as drawn: a funhouse floor of nine rugs (one canvas texture: each room's colour, picture and
// name, so a call-out like "Puppet Nook!" can be found at a glance), striped walls round it, and purple curtains at
// the back. Ghosts are NOT drawn unless the server says they are lit: then a little sheet ghost (dome + skirt + eyes,
// see-through, in its kind's colour) with its name over it. The lantern carrier holds a lantern and stands in a warm
// circle on the floor (the reveal radius); a flash is a bright ring that grows out and fades. Every photographer has a
// dashed square on the floor in front of them: the photo frame (yours is bright). A snap flashes the frame white; a
// catch spins the ghost into the camera with "+2"; an escape shows the ghost for a moment flying off.
// The phone shows its clue cards (room on a mini map / footprints on a mini map / a thermometer) under the team strip.
import { RULES, ROOMS, KINDS, COLD, roomCentre } from './sim.js';
import { scoreBar, floatText, h, esc } from '../../client/gamehud.js';
import { IN } from '../../shared/protocol.js';

const INK = '#0d2228';
function drawIcon(c, kind, x, y, s) {
  c.save(); c.translate(x, y); c.scale(s, s); c.lineWidth = 3; c.strokeStyle = INK; c.lineJoin = c.lineCap = 'round';
  const fill = col => { c.fillStyle = col; c.fill(); c.stroke(); };
  c.beginPath();
  if (kind === 'mirror') { c.ellipse(0, 0, 13, 18, 0, 0, Math.PI * 2); fill('#e8f6ff'); c.beginPath(); c.moveTo(-5, -8); c.lineTo(3, -12); c.stroke(); }
  else if (kind === 'nose') { c.arc(0, 0, 13, 0, Math.PI * 2); fill('#ff4d6d'); c.beginPath(); c.arc(-4, -4, 3, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); }
  else if (kind === 'pipes') { [-12, -4, 4, 12].forEach((px, i) => { c.beginPath(); c.rect(px - 3, -6 - i % 2 * 8, 6, 22 + i % 2 * 8); fill('#c9a227'); }); }
  else if (kind === 'puppet') { c.moveTo(-14, -16); c.lineTo(14, -16); c.moveTo(0, -16); c.lineTo(0, -6); c.moveTo(-12, -16); c.lineTo(-8, 4); c.moveTo(12, -16); c.lineTo(8, 4); c.stroke(); c.beginPath(); c.arc(0, 0, 6, 0, Math.PI * 2); fill('#ffd8a8'); c.beginPath(); c.rect(-6, 6, 12, 10); fill('#4fa3ff'); }
  else if (kind === 'spiral') { for (let a = 0; a < 14; a += 0.2) { const r = a * 1.2; a ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(0, 0); } c.stroke(); }
  else if (kind === 'web') { for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; c.moveTo(0, 0); c.lineTo(Math.cos(a) * 16, Math.sin(a) * 16); } for (const r of [6, 11, 16]) { for (let k = 0; k <= 6; k++) { const a = k * Math.PI / 3; k ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(r, 0); } } c.stroke(); }
  else if (kind === 'barrel') { c.ellipse(0, 0, 12, 16, 0, 0, Math.PI * 2); fill('#b07a4a'); c.beginPath(); c.moveTo(-12, -5); c.lineTo(12, -5); c.moveTo(-12, 5); c.lineTo(12, 5); c.stroke(); }
  else if (kind === 'ticket') { c.rect(-16, -9, 32, 18); fill('#ffd23f'); c.beginPath(); c.moveTo(-8, -9); c.lineTo(-8, 9); c.setLineDash([3, 3]); c.stroke(); c.setLineDash([]); }
  else if (kind === 'candle') { c.rect(-5, -4, 10, 20); fill('#fff8e7'); c.beginPath(); c.moveTo(0, -18); c.quadraticCurveTo(7, -9, 0, -5); c.quadraticCurveTo(-7, -9, 0, -18); fill('#ff9b3d'); }
  c.restore();
}
/** A mini map of the nine rooms, as SVG: `hl` = room to highlight, `dots` = footprints [[x, z], …] newest first. */
function miniMap(hl, dots = []) {
  let s = '<svg viewBox="0 0 90 60" class="gp-map" aria-hidden="true">';
  for (let i = 0; i < 9; i++) { const x = (i % 3) * 30, y = Math.floor(i / 3) * 20; s += `<rect x="${x + 0.5}" y="${y + 0.5}" width="29" height="19" fill="${i === hl ? '#ffd23f' : ROOMS[i].color}" stroke="${INK}" stroke-width="${i === hl ? 2 : 0.8}"/>`; }
  dots.forEach(([x, z], k) => { const px = (x + 9) * 5, py = (z + 6) * 5, o = [1, 0.65, 0.4][k] ?? 0.4; s += `<g opacity="${o}" transform="translate(${px.toFixed(1)} ${py.toFixed(1)})"><ellipse rx="2.6" ry="3.6" fill="${INK}"/><text y="-5" font-size="7" text-anchor="middle" font-weight="900" fill="${INK}">${k + 1}</text></g>`; });
  return s + '</svg>';
}

export function createView(ctx) {
  const { THREE, group, stage, meta, me, init, players } = ctx;
  const { hw, hd } = meta.arena;
  const mats = [], std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra }); mats.push(m); return m; };
  const basic = (color, extra = {}) => { const m = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, ...extra }); mats.push(m); return m; };
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent = group) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();

  // ---- the floor: one canvas, nine rugs with picture + name
  const cv = document.createElement('canvas'); cv.width = 1152; cv.height = 768; const c = cv.getContext('2d');
  c.fillStyle = '#3b2346'; c.fillRect(0, 0, 1152, 768);
  ROOMS.forEach((r, i) => {
    const x = (i % 3) * 384, y = Math.floor(i / 3) * 256;
    c.fillStyle = r.color; c.beginPath(); c.roundRect(x + 10, y + 10, 364, 236, 26); c.fill();
    c.strokeStyle = 'rgba(13,34,40,.45)'; c.lineWidth = 6; c.setLineDash([18, 12]); c.beginPath(); c.roundRect(x + 24, y + 24, 336, 208, 18); c.stroke(); c.setLineDash([]);
    drawIcon(c, r.icon, x + 192, y + 100, 3.2);
    c.font = '900 40px system-ui, sans-serif'; c.textAlign = 'center'; c.fillStyle = INK; c.fillText(r.name, x + 192, y + 212);
  });
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const floorMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }); mats.push(floorMat);
  mesh(new THREE.PlaneGeometry(hw * 2, hd * 2).rotateX(-Math.PI / 2), floorMat).receiveShadow = true;
  mesh(new THREE.PlaneGeometry(90, 70).rotateX(-Math.PI / 2), std('#2a1733'), 0, -0.03, 0);
  // striped walls (sides + back), low at the front
  const wallN = 2 * 12 + 18 + 18, walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), std('#ffffff'), wallN);
  let wi = 0;
  const wall = (x, z, w, d, hgt) => { m4.compose(v.set(x, hgt / 2, z), q.identity(), sc.set(w, hgt, d)); walls.setMatrixAt(wi, m4); walls.setColorAt(wi, col.set(wi % 2 ? '#7a3fa0' : '#f4e3ff')); wi++; };
  for (const sx of [-1, 1]) for (let k = 0; k < 12; k++) wall(sx * (hw + 0.3), -hd + 0.5 + k * (hd * 2 - 1) / 11, 0.5, (hd * 2) / 12 + 0.02, 1.4);
  for (let k = 0; k < 18; k++) wall(-hw + 0.5 + k * (hw * 2 - 1) / 17, -hd - 0.3, (hw * 2) / 18 + 0.02, 0.5, 2.6);
  for (let k = 0; k < 18; k++) wall(-hw + 0.5 + k * (hw * 2 - 1) / 17, hd + 0.3, (hw * 2) / 18 + 0.02, 0.5, 0.5);
  walls.castShadow = true; group.add(walls);
  // curtains behind the back wall
  for (let k = 0; k < 9; k++) { const cu = mesh(new THREE.CylinderGeometry(1.1, 1.3, 4.2, 10, 1, true, 0, Math.PI), std(k % 2 ? '#5b1f6e' : '#7b2a8f', { side: THREE.DoubleSide }), -8 + k * 2, 2.1, -hd - 1.1); cu.rotation.y = Math.PI; }

  // ---- the lantern (held by its carrier) and its glow on the floor
  const lamp = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.32, 8), std('#ffe9a8', { emissive: new THREE.Color('#ffcf5a'), emissiveIntensity: 0.9 }), 0, 0, 0, lamp);
  mesh(new THREE.ConeGeometry(0.22, 0.14, 8), std('#4a3a2a'), 0, 0.23, 0, lamp);
  mesh(new THREE.TorusGeometry(0.09, 0.02, 4, 10), std('#4a3a2a'), 0, 0.34, 0, lamp);
  const glow = mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), basic('#ffd27a', { opacity: 0.32 }), 0, 0.04, 0);
  const glowEdge = mesh(new THREE.RingGeometry(0.95, 1, 48).rotateX(-Math.PI / 2), basic('#ffb43a', { opacity: 0.8 }), 0, 0.05, 0);
  const lightR = init.solo ? RULES.soloLantern : RULES.lantern;
  glow.scale.setScalar(lightR); glowEdge.scale.setScalar(lightR);
  const flashRing = mesh(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2), basic('#fffbe0', { opacity: 0 }), 0, 0.06, 0);
  const flashDisc = mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), basic('#fff7c0', { opacity: 0 }), 0, 0.05, 0);
  let lampOn = null, flashT = 0;
  function giveLamp(pid) {
    if (lampOn === pid) return; lampOn = pid;
    const a = ctx.actor(pid); lamp.removeFromParent();
    if (a) { a.body.group.add(lamp); lamp.position.set(0.38, 0.75, 0.25); }
  }

  // ---- photo frames on the floor in front of each photographer
  const frameGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(RULES.snapR * 1.6, RULES.snapR * 1.6).rotateX(-Math.PI / 2));
  const frames = new Map(players.map(p => {
    const mine = p.pid === me, f = new THREE.LineSegments(frameGeo, new THREE.LineBasicMaterial({ color: mine ? '#ffffff' : p.color, transparent: true, opacity: mine ? 0.95 : 0.45 }));
    mats.push(f.material); f.position.y = 0.07; group.add(f); return [p.pid, f];
  }));

  // ---- ghosts (only the lit ones are ever drawn)
  const ghostGeo = { top: new THREE.SphereGeometry(0.5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), skirt: new THREE.CylinderGeometry(0.5, 0.62, 0.7, 16, 1, true), eye: new THREE.SphereGeometry(0.08, 8, 6) };
  const eyeMat = std(INK);
  function makeGhost(kind) {
    const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: KINDS[kind].color, emissive: new THREE.Color(KINDS[kind].color), emissiveIntensity: 0.35, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    mesh(ghostGeo.top, m, 0, 1.1, 0, g); mesh(ghostGeo.skirt, m, 0, 0.75, 0, g);
    for (const s of [-1, 1]) mesh(ghostGeo.eye, eyeMat, s * 0.17, 1.25, 0.45, g);
    g.userData.mat = m; group.add(g); return g;
  }
  const ghosts = new Map(), fx = [];
  function dropGhost(G) { group.remove(G.g); G.g.userData.mat.dispose(); G.tag?.remove(); }

  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'points' });
  const hud = h('div', 'gp-hud'), banner = h('div', 'gp-banner'), clues = h('div', 'gp-clues');
  hud.innerHTML = `<span><b>Caught</b> <em class="gp-c">0</em>/<em>${init.goal}</em></span><span><b>Loose</b> <em class="gp-n">0</em></span><span class="gp-lamp"><b>Lantern</b> <em class="gp-lt"></em></span>`;
  ctx.ui.append(hud, banner, clues);
  const cEl = hud.querySelector('.gp-c'), nEl = hud.querySelector('.gp-n'), ltEl = hud.querySelector('.gp-lt');
  const name = pid => pid === me ? 'You' : (players.find(p => p.pid === pid)?.name || '?');
  const showBanner = (text, cls = '', ms = 1500) => { banner.textContent = text; banner.className = 'gp-banner show ' + cls; clearTimeout(showBanner.t); showBanner.t = setTimeout(() => { banner.className = 'gp-banner'; }, ms); };
  let G = null, clueKey = '';
  function drawClues(pv) {
    if (me == null) return;
    const key = JSON.stringify(pv); if (key === clueKey) return; clueKey = key;
    const lampLine = pv.lamp ? `<div class="gp-you-lamp">${init.solo ? ctx.btn('Lantern + camera: walk to a clue, A = snap') : 'You carry the LANTERN: walk ghosts into the light!'} <i>${pv.fc > 0 ? `flash in ${pv.fc}` : ctx.btn('B = flash ready')}</i></div>` : '';
    const cards = pv.clues.map(c => {
      const k = KINDS[c.k], head = `<b><i style="background:${k.color}"></i>${esc(k.name)}</b><small>${c.life} s</small>`;
      if (c.t === 'room') return `<div class="gp-clue">${head}${miniMap(c.room)}<span>Shimmer in <u>${esc(ROOMS[c.room].name)}</u></span></div>`;
      if (c.t === 'trail') return `<div class="gp-clue">${head}${miniMap(-1, c.steps)}<span>Footprints (1 = newest)</span></div>`;
      return `<div class="gp-clue">${head}<div class="gp-thermo t${c.cold}">${[0, 1, 2, 3].map(k2 => `<i class="${k2 >= c.cold ? 'on' : ''}"></i>`).join('')}</div><span>Cold spot near you: <u>${COLD[c.cold]}</u></span></div>`;
    }).join('');
    clues.innerHTML = lampLine + (cards ? `<div class="gp-cards">${cards}</div>` : (pv.lamp ? '' : '<div class="gp-none">No clues for you right now — listen to your team!</div>'));
  }
  const tall = () => innerHeight > innerWidth * 1.15;
  const frameCam = () => stage.setSafe?.(tall() ? { top: 0.27 } : { top: 0.15 });
  addEventListener('resize', frameCam);

  return {
    start() { frameCam(); showBanner(init.solo ? 'Find the ghosts!' : 'Call out your clues!'); },
    state(g) {
      G = g;
      giveLamp(g.lt);
      for (const X of ghosts.values()) X.seen = false;
      for (const [id, kind, x, z] of g.gh) {
        let X = ghosts.get(id);
        if (!X) { X = { id, kind, g: makeGhost(kind), x, z }; X.g.position.set(x, 0, z); X.tag = stage.tag(X.g, { text: KINDS[kind].name, height: 1.9, cls: 'gp-tag' }); ghosts.set(id, X); }
        X.seen = true; X.x = x; X.z = z;
      }
      for (const [id, X] of ghosts) if (!X.seen) { dropGhost(X); ghosts.delete(id); }
      if (cEl.textContent !== String(g.c)) cEl.textContent = g.c;
      if (nEl.textContent !== String(g.n)) nEl.textContent = g.n;
      const ln = name(g.lt); if (ltEl.textContent !== ln) ltEl.textContent = ln;
      bar.set(g.sc, g.left);
    },
    priv(d) { drawClues(d); },
    event(ev) {
      if (ev.e === 'snap') {
        ctx.sfx(ev.got.length ? 'coins' : 'tap');
        fx.push({ kind: 'flash', p: mesh(new THREE.PlaneGeometry(RULES.snapR * 1.6, RULES.snapR * 1.6).rotateX(-Math.PI / 2), basic('#ffffff', { opacity: 0.9 }), ev.x, 0.08, ev.z), t: 0 });
        for (const [id, kind, x, z] of ev.got) {
          const old = ghosts.get(id); if (old) { dropGhost(old); ghosts.delete(id); }
          const g = makeGhost(kind); g.position.set(x, 0, z); const a = ctx.pos(ev.pid);
          fx.push({ kind: 'catch', g, t: 0, from: new THREE.Vector3(x, 0, z), to: new THREE.Vector3(a?.x ?? x, 1, a?.z ?? z) });
          floatText(stage, x, 2.2, z, `${KINDS[kind].name} +2`, 'good');
        }
        if (ev.got.length) ctx.actor(ev.pid)?.play('cheer', 600);
      } else if (ev.e === 'escape') {
        const g = makeGhost(ev.kind); g.position.set(ev.x, 0, ev.z); fx.push({ kind: 'escape', g, t: 0 }); ctx.sfx('out');
        floatText(stage, ev.x, 2, ev.z, `${KINDS[ev.kind].name} got away!`, 'bad');
      } else if (ev.e === 'flash') { flashT = 1; flashRing.position.set(ev.x, 0.06, ev.z); flashDisc.position.set(ev.x, 0.05, ev.z); ctx.sfx('pick'); }
      else if (ev.e === 'lantern') { if (ev.pid === me) { showBanner('You have the lantern!', 'good'); ctx.sfx('pick'); } else showBanner(`${name(ev.pid)} has the lantern`, '', 1100); }
      else if (ev.e === 'spawn') { ctx.sfx('trap'); showBanner('New clue!', 'warn', 900); }
      else if (ev.e === 'busy') floatText(stage, ctx.pos(me)?.x ?? 0, 2, ctx.pos(me)?.z ?? 0, ctx.btn('Hands full! B = flash'), '');
      else if (ev.e === 'nolamp') floatText(stage, ctx.pos(me)?.x ?? 0, 2, ctx.pos(me)?.z ?? 0, 'Only the lantern can flash', '');
      else if (ev.e === 'end') { showBanner(ev.ok ? 'Album full!' : 'They got away…', ev.ok ? 'good' : 'bad', 4000); ctx.sfx(ev.ok ? 'win' : 'bad'); }
    },
    input(inp) { if (inp.b & IN.A) ctx.actor(me)?.play('throw', 300); },
    frame(dt, t) {
      // lantern glow follows its carrier
      const lp = G ? ctx.pos(G.lt) : null;
      if (lp) { glow.position.set(lp.x, 0.04, lp.z); glowEdge.position.set(lp.x, 0.05, lp.z); glow.material.opacity = 0.26 + 0.06 * Math.sin(t * 5); }
      if (lampOn != null && !lamp.parent) { const a = ctx.actor(lampOn); if (a) { a.body.group.add(lamp); lamp.position.set(0.38, 0.75, 0.25); } }
      lamp.rotation.z = Math.sin(t * 4) * 0.15;
      // photo frames
      for (const [pid, f] of frames) {
        const p = ctx.pos(pid), isLamp = G && pid === G.lt && !init.solo;
        f.visible = !!p && !isLamp && G?.left > 0;
        if (p) { f.position.set(p.x + Math.sin(p.yaw) * RULES.snapAhead, 0.07, p.z + Math.cos(p.yaw) * RULES.snapAhead); f.rotation.y = p.yaw; }
      }
      // lit ghosts drift to their latest spot and bob
      for (const X of ghosts.values()) {
        const k = Math.min(1, dt * 10); X.g.position.x += (X.x - X.g.position.x) * k; X.g.position.z += (X.z - X.g.position.z) * k;
        X.g.position.y = 0.15 * Math.sin(t * 3 + X.id); X.g.rotation.y = Math.sin(t * 1.5 + X.id) * 0.5;
        X.g.userData.mat.opacity = 0.6 + 0.2 * Math.sin(t * 6 + X.id);
      }
      if (flashT > 0) { flashT = Math.max(0, flashT - dt * 1.6); const r = RULES.flashR * (1 - flashT * 0.6); flashRing.scale.setScalar(r); flashDisc.scale.setScalar(r); flashRing.material.opacity = flashT; flashDisc.material.opacity = flashT * 0.35; }
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i]; f.t += dt;
        if (f.kind === 'flash') { f.p.material.opacity = Math.max(0, 0.9 - f.t * 3); if (f.t > 0.3) { group.remove(f.p); f.p.geometry.dispose(); f.p.material.dispose(); fx.splice(i, 1); } }
        else if (f.kind === 'catch') { const k = Math.min(1, f.t / 0.5); f.g.position.lerpVectors(f.from, f.to, k); f.g.scale.setScalar(1 - k * 0.9); f.g.rotation.y += dt * 14; if (k >= 1) { group.remove(f.g); f.g.userData.mat.dispose(); fx.splice(i, 1); } }
        else { f.g.position.y = f.t * 4; f.g.userData.mat.opacity = Math.max(0, 0.8 - f.t); if (f.t > 0.8) { group.remove(f.g); f.g.userData.mat.dispose(); fx.splice(i, 1); } }
      }
    },
    dispose() { bar.el.remove(); lamp.removeFromParent(); for (const X of ghosts.values()) dropGhost(X); clearTimeout(showBanner.t); removeEventListener('resize', frameCam); tex.dispose(); for (const m of mats) m.dispose(); },
  };
}
