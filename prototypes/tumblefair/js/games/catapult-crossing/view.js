// CATAPULT CROSSING, as drawn: a sunny canyon with a bottomless pit. A grassy start ledge at the top, then twelve rows
// of stone blocks stepping down toward the camera (each block a pale cap on a tall pillar that fades into the dark), and
// the goal ledge at the bottom with a chequered finish line and two pennant poles at its sides (nothing over the
// field). Behind the start ledge, on a rocky outcrop, the wooden CATAPULT with the round's catapult player standing
// beside it (their own character; their real body is the target, so it is hidden).
//   the target    a ring + cross in the catapult player's colour on the ground, dimmed while it reloads
//   a boulder     arcs from the catapult's bucket to its spot; a RED ring there from the moment it is fired (the
//                 warning), with a shadow that grows as it falls; dust when it lands
//   a block       shakes when it is smashed, then tips and drops into the pit
// HUD: the score bar, a role line under it ("You're the catapult — …" / "Cross to the bottom!"), the round banner and
// a reload meter for the catapult player. The catapult player's buttons say Fire / Big shot (ctx.buttons).
import { COLS, ROWS, S, HW, FZ0, FZ1, LEDGE, CAT, RULES, floorY, tileXZ } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export function createView(ctx) {
  const { THREE, group, stage, init } = ctx, N = COLS * ROWS;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler(), col = new THREE.Color();
  const mats = [], geos = [], texs = [];
  const std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra }); mats.push(m); return m; };
  const G = g => (geos.push(g), g);
  const mesh = (geo, mat, x, y, z, shadow = true) => { const m = new THREE.Mesh(G(geo), mat); m.position.set(x, y, z); m.receiveShadow = true; m.castShadow = shadow; group.add(m); return m; };
  const nameOf = pid => (pid === ctx.me ? 'You' : ctx.players.find(p => p.pid === pid)?.name || '?');
  const seatOf = pid => ctx.players.find(p => p.pid === pid);
  const goalY = floorY(FZ1 + 1);

  // ---- the pit: a dark floor far below, canyon walls either side
  const fade = canvasTexture(8, 128, (c, w, hh) => { const g = c.createLinearGradient(0, 0, 0, hh); g.addColorStop(0, '#9a8b76'); g.addColorStop(0.05, '#5e5246'); g.addColorStop(0.16, '#1c1620'); g.addColorStop(1, '#06040a'); c.fillStyle = g; c.fillRect(0, 0, w, hh); }); texs.push(fade);
  const rockFade = canvasTexture(8, 128, (c, w, hh) => { const g = c.createLinearGradient(0, 0, 0, hh); g.addColorStop(0, '#b5835a'); g.addColorStop(0.08, '#7a5238'); g.addColorStop(0.3, '#2a1a18'); g.addColorStop(1, '#08060a'); c.fillStyle = g; c.fillRect(0, 0, w, hh); }); texs.push(rockFade);
  mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#07050c' }), 0, -14, 0, false); mats.push(group.children.at(-1).material);
  for (const sx of [-1, 1]) {
    const wall = mesh(new THREE.BoxGeometry(14, 16, 44), std('#ffffff', { map: rockFade }), sx * (HW + 0.35 + 7), -7.6, 0, false);
    wall.receiveShadow = true;
    mesh(new THREE.BoxGeometry(14, 0.3, 44), std('#c99a68'), sx * (HW + 0.35 + 7), 0.45, 0, false);       // sandstone canyon rims
  }
  // rim dressing: a few rocks and shrubs along both canyon rims (instanced)
  const RD = 28, rimRocks = new THREE.InstancedMesh(G(new THREE.DodecahedronGeometry(0.6, 0)), std('#a07850', { flatShading: true }), RD), shrubs = new THREE.InstancedMesh(G(new THREE.IcosahedronGeometry(0.55, 0)), std('#6f9a3c', { flatShading: true }), RD);
  for (let i = 0; i < RD; i++) {
    const sx = i % 2 ? 1 : -1, z = -16 + (i >> 1) * 2.4 + (i % 3) * 0.5, x = sx * (HW + 1.6 + (i % 4) * 1.3);
    m4.compose(v.set(x, 0.75, z), q.setFromEuler(e3.set(i, i * 2.1, 0)), sc.set(1 + (i % 3) * 0.3, 0.7 + (i % 2) * 0.3, 1)); rimRocks.setMatrixAt(i, m4);
    m4.compose(v.set(x + sx * 1.9, 0.8, z + 1.1), q.identity(), sc.setScalar(0.8 + (i % 4) * 0.2)); shrubs.setMatrixAt(i, m4);
  }
  rimRocks.castShadow = shrubs.castShadow = true; group.add(rimRocks, shrubs);
  // ---- the start ledge, the catapult's outcrop, the goal ledge
  const ledgeTop = std('#8fd15a'), ledgeSide = std('#ffffff', { map: rockFade });
  function ledge(z0, z1, top, w = HW * 2 + 0.7) { mesh(new THREE.BoxGeometry(w, 16, z1 - z0), ledgeSide, 0, top - 8.15, (z0 + z1) / 2, false); mesh(new THREE.BoxGeometry(w, 0.3, z1 - z0), ledgeTop, 0, top - 0.15, (z0 + z1) / 2, false); }
  ledge(FZ0 - LEDGE, FZ0, 0);
  ledge(FZ0 - LEDGE - 5, FZ0 - LEDGE, 0.6, 5.5);                                                         // outcrop
  ledge(FZ1, FZ1 + LEDGE + 3, goalY);
  // finish line: chequered strip on the goal ledge; pennant poles at its ends (outside the field)
  const chk = canvasTexture(128, 16, (c, w, hh) => { for (let x = 0; x < w; x += 8) for (let y = 0; y < hh; y += 8) { c.fillStyle = ((x + y) / 8) % 2 ? '#222' : '#fff'; c.fillRect(x, y, 8, 8); } }); texs.push(chk);
  chk.wrapS = THREE.RepeatWrapping; chk.repeat.set(3, 1);
  mesh(new THREE.PlaneGeometry(HW * 2, 0.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: chk }), 0, goalY + 0.02, FZ1 + 0.3, false); mats.push(group.children.at(-1).material);
  for (const sx of [-1, 1]) {
    mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8), std('#e8e2d0'), sx * (HW + 0.15), goalY + 1.3, FZ1 + 0.3);
    const flag = mesh(new THREE.PlaneGeometry(0.8, 0.5), std(sx < 0 ? '#ff5f5f' : '#ffd23f', { side: THREE.DoubleSide }), sx * (HW + 0.15) - sx * 0.42, goalY + 2.3, FZ1 + 0.3, false); flag.userData.flag = sx;
  }
  const flags = group.children.filter(o => o.userData.flag);

  // ---- the blocks: a pale stone cap on a pillar that fades into the dark
  const capGeo = G(new THREE.BoxGeometry(S * 0.95, 0.3, S * 0.95).translate(0, -0.15, 0));
  const pilGeo = G(new THREE.BoxGeometry(S * 0.86, 10, S * 0.86).translate(0, -5.3, 0));
  const caps = new THREE.InstancedMesh(capGeo, std('#ffffff', { roughness: 0.7 }), N), pillars = new THREE.InstancedMesh(pilGeo, std('#ffffff', { map: fade }), N);
  caps.receiveShadow = caps.castShadow = true; group.add(caps, pillars);
  const CAP = [new THREE.Color('#e7dcc6'), new THREE.Color('#d6c8ae')], CRACKED = new THREE.Color('#c9a27a');
  const tiles = Array.from({ length: N }, () => ({ s: '0', drop: -1 })), zero = new THREE.Matrix4().makeScale(0, 0, 0), moving = new Set();
  function drawTile(i, now) {
    const T = tiles[i], [x, z] = tileXZ(i), y0 = floorY(z);
    let y = y0, rx = 0, rz = 0, hide = false;
    if (T.s === 'x') {
      if (T.drop < 0) hide = true;
      else { const k = (now - T.drop) / 1.1; if (k >= 1) hide = true; else { y = y0 - k * k * 12; rx = k * 0.6 * Math.sin(i * 2.3); rz = k * 0.6 * Math.cos(i * 1.7); } }
    } else if (T.s === '1') { y = y0 + Math.sin(now * 40 + i) * 0.04; rx = Math.sin(now * 33 + i) * 0.05; rz = Math.cos(now * 29 + i) * 0.05; }
    if (hide) { caps.setMatrixAt(i, zero); pillars.setMatrixAt(i, zero); return; }
    m4.compose(v.set(x, y, z), q.setFromEuler(e3.set(rx, 0, rz)), sc.setScalar(1)); caps.setMatrixAt(i, m4); pillars.setMatrixAt(i, m4);
  }
  function setTiles(t, instant) {
    const now = performance.now() / 1000;
    for (let i = 0; i < N; i++) {
      const ch = t[i], T = tiles[i]; if (!instant && ch === T.s) continue;
      if (ch === 'x') { T.drop = instant || T.s === 'x' ? -1 : now; if (T.drop >= 0) moving.add(i); }
      else if (ch === '1') moving.add(i);
      T.s = ch;
      caps.setColorAt(i, ch === '1' ? CRACKED : CAP[(i + Math.floor(i / COLS)) % 2]);
      drawTile(i, now);
    }
    caps.instanceMatrix.needsUpdate = pillars.instanceMatrix.needsUpdate = true; if (caps.instanceColor) caps.instanceColor.needsUpdate = true;
  }
  setTiles('0'.repeat(N), true);

  // ---- the catapult on its outcrop
  const wood = std('#8a5a32'), dark = std('#5e3b20'), iron = std('#55575e', { metalness: 0.5, roughness: 0.5 });
  const cat = new THREE.Group(); cat.position.set(CAT.x, 0.6, CAT.z - 0.4); group.add(cat);
  const part = (geo, mat, x, y, z, parent = cat) => { const m = new THREE.Mesh(G(geo), mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  for (const sx of [-1, 1]) { part(new THREE.BoxGeometry(0.22, 0.22, 2.6), wood, sx * 0.75, 0.45, 0); part(new THREE.BoxGeometry(0.2, 1.5, 0.2), wood, sx * 0.75, 1.2, 0.2); for (const z of [-0.95, 0.95]) part(new THREE.CylinderGeometry(0.38, 0.38, 0.16, 14).rotateZ(Math.PI / 2), dark, sx * 0.9, 0.38, z); }
  part(new THREE.BoxGeometry(1.7, 0.18, 0.18), wood, 0, 1.9, 0.2);
  const arm = new THREE.Group(); arm.position.set(0, 1.0, 0.2); cat.add(arm);
  part(new THREE.BoxGeometry(0.18, 0.16, 2.6).translate(0, 0, 1.1), dark, 0, 0, 0, arm);
  const bucket = part(new THREE.CylinderGeometry(0.42, 0.3, 0.3, 12), iron, 0, 0.12, 2.3, arm);
  part(new THREE.BoxGeometry(0.7, 0.6, 0.6), iron, 0, -0.15, -0.35, arm);                    // counterweight
  const ARM_REST = -0.55, ARM_FIRED = 1.15; let armK = 1; arm.rotation.x = ARM_REST;
  const loaded = new THREE.Mesh(G(new THREE.IcosahedronGeometry(0.34, 1)), std('#8d8a84', { flatShading: true })); loaded.position.set(0, 0.42, 2.3); arm.add(loaded);
  let cannoneer = null, cannoneerPid = null, cannonLoad = null;
  const npcs = new Map();
  function standAtCatapult(pid) {
    if (cannoneer) cannoneer.group.visible = false;
    cannoneer = null; cannoneerPid = pid;
    if (pid == null) { (npcs.get('bonkers') ? Promise.resolve(npcs.get('bonkers')) : ctx.createActor({ look: { race: 'dwarf', seed: 4417 }, costume: 'cos_none' })).then(a => { if (!a || cannoneerPid != null) return; npcs.set('bonkers', a); a.group.visible = true; a.place(CAT.x + 1.5, 0.6, CAT.z + 0.5, 0); cannoneer = a; }).catch(() => {}); return; }
    const p = seatOf(pid); if (!p) return;
    const have = npcs.get(pid);
    const load = cannonLoad = have ? Promise.resolve(have) : ctx.createActor({ look: p.look || { race: 'human', seed: pid * 977 + 1 }, costume: p.costume, seat: p.seat });
    load.then(a => { if (!a) return; npcs.set(pid, a); if (cannonLoad !== load || cannoneerPid !== pid) { a.group.visible = false; return; } a.group.visible = true; a.place(CAT.x + 1.5, 0.6, CAT.z + 0.5, 0); cannoneer = a; }).catch(() => {});
  }

  // ---- the target, boulders, rings, dust
  const ringGeo = G(new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2)), discGeo = G(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2));
  const crossGeo = G(new THREE.PlaneGeometry(0.12, 1.5).rotateX(-Math.PI / 2));
  const target = new THREE.Group(); group.add(target); target.visible = false;
  const tMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false }); mats.push(tMat);
  const tRing = new THREE.Mesh(ringGeo, tMat); tRing.scale.setScalar(RULES.hitR); target.add(tRing);
  for (const r of [0, Math.PI / 2]) { const c = new THREE.Mesh(crossGeo, tMat); c.rotation.y = r; target.add(c); }
  for (const o of target.children) o.renderOrder = 4;
  const rockGeo = G(new THREE.IcosahedronGeometry(1, 1)), rockMat = std('#8d8a84', { flatShading: true });
  const warnMat = new THREE.MeshBasicMaterial({ color: '#ff3b3b', transparent: true, opacity: 0.9, depthWrite: false }); mats.push(warnMat);
  const shadowMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.3, depthWrite: false }); mats.push(shadowMat);
  const zoneMat = new THREE.MeshBasicMaterial({ color: '#ff2a2a', transparent: true, opacity: 0.32, depthWrite: false }); mats.push(zoneMat);   // the danger zone: filled, so it never reads as a player's target ring
  const boulders = new Map(), fx = [];
  function addBoulder(id, x, z, left, big) {
    if (boulders.has(id)) return;
    const r = big ? 0.62 : 0.42, rock = new THREE.Mesh(rockGeo, rockMat); rock.scale.setScalar(r); rock.castShadow = true; group.add(rock);
    const y = floorY(z), R = big ? RULES.bigHitR : RULES.hitR;
    const ring = new THREE.Mesh(ringGeo, warnMat); ring.position.set(x, y + 0.04, z); ring.scale.setScalar(R); ring.renderOrder = 3; group.add(ring);
    const zone = new THREE.Mesh(discGeo, zoneMat); zone.position.set(x, y + 0.035, z); zone.scale.setScalar(R); zone.renderOrder = 2; group.add(zone);
    const shadow = new THREE.Mesh(discGeo, shadowMat); shadow.position.set(x, y + 0.03, z); shadow.renderOrder = 2; group.add(shadow);
    const born = performance.now() / 1000 - (init.flight - left);
    boulders.set(id, { rock, ring, zone, shadow, x, z, y, born, r, R });
  }
  function dropBoulder(id) { const b = boulders.get(id); if (!b) return; for (const m of [b.rock, b.ring, b.zone, b.shadow]) m.removeFromParent(); boulders.delete(id); }
  const dustGeo = G(new THREE.IcosahedronGeometry(0.2, 0));
  function dust(x, y, z, big) { for (let i = 0; i < (big ? 12 : 8); i++) { const m = new THREE.Mesh(dustGeo, new THREE.MeshBasicMaterial({ color: '#d8c8a8', transparent: true, opacity: 0.9, depthWrite: false })); const a = i * 0.8; m.position.set(x, y + 0.2, z); m.userData.v = [Math.sin(a) * 2.4, 1.6 + (i % 3), Math.cos(a) * 2.4]; group.add(m); fx.push({ m, t: 0 }); } }

  // frame the whole canyon: the catapult's outcrop at the top down to the goal ledge
  ctx.camera({ cx: 0, cz: (CAT.z - 1.2 + FZ1 + LEDGE) / 2, hw: HW + 0.6, hd: (FZ1 + LEDGE - CAT.z + 1.2) / 2, pitch: 46 }, { instant: true });

  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'pts' });
  const role = h('div', 'cx-role'); ctx.ui.append(role);
  const banner = h('div', 'cx-banner'); ctx.ui.append(banner); let bannerT = 0;
  const show = (text, cls = '', s = 1.6) => { banner.textContent = text; banner.className = 'cx-banner show ' + cls; bannerT = s; };
  const meter = h('div', 'cx-meter', '<span class="lbl">Boulder</span><i><b></b></i><span class="lbl big">Big shot</span><i class="big"><b></b></i>'); ctx.ui.append(meter);
  const [fillA, fillB] = meter.querySelectorAll('b');
  let curCat = undefined, roleKey = '', curRound = -1, phase = '', home = [], out = [], lastT = '', prevB = 0, prevS = -9;
  // the role line sits just under the score bar (which wraps to two rows on a narrow phone) and fades after a while
  let roleShown = 0;
  function placeRole() { const r = bar.el.getBoundingClientRect(); if (r.height) role.style.top = `${Math.round(r.bottom + 6)}px`; }
  function setRole() {
    roleShown = 5; role.classList.remove('gone'); placeRole();
    const me = ctx.me, mine = me != null && curCat === me;
    ctx.ui.classList.toggle('is-cat', mine);
    meter.style.display = mine ? '' : 'none';
    if (me == null) role.textContent = curCat == null ? 'Old Bonkers is firing the catapult' : `${nameOf(curCat)} is firing the catapult`;
    else if (mine) role.textContent = 'You\'re the catapult! Aim, then Fire. Big shot smashes five blocks';
    else if (home.includes(me)) role.textContent = 'Home safe! Cheer the others on';
    else if (out.includes(me)) role.textContent = 'In the pit — back next round';
    else role.textContent = 'Cross to the bottom! Hop over gaps';
    if (me != null) ctx.buttons(mine ? { a: 'Fire', b: 'Big shot' } : { a: 'Hop', b: '' });
  }

  return {
    halloween: false, winter: false,
    start() { setRole(); },
    state(g) {
      if (g.r !== curRound) { curRound = g.r; setTiles(g.t, true); lastT = g.t; for (const id of [...boulders.keys()]) dropBoulder(id); }
      else if (g.t !== lastT) { setTiles(g.t, false); lastT = g.t; }
      if (g.cat !== curCat) { curCat = g.cat; standAtCatapult(curCat); }
      const key = [g.cat, g.home.join(), g.out.join()].join('|');
      home = g.home; out = g.out; if (key !== roleKey) { roleKey = key; setRole(); }
      phase = g.ph;
      for (const p of ctx.players) { bar.mark(p.pid, 'out', g.out.includes(p.pid)); bar.mark(p.pid, 'cat', p.pid === g.cat); }
      bar.set(g.sc, g.left);
      const seen = new Set(); for (const [id, x, z, left, big] of g.bo) { seen.add(id); addBoulder(id, x, z, left, big); }
      for (const id of [...boulders.keys()]) if (!seen.has(id) && performance.now() / 1000 - boulders.get(id).born > init.flight + 0.25) dropBoulder(id);
      if (g.rl) {
        const rA = Math.max(0, Math.min(1, 1 - g.rl[0] / init.reload)), rB = Math.max(0, Math.min(1, 1 - g.rl[1] / RULES.bigReload));
        fillA.style.width = `${Math.round(rA * 100)}%`; fillB.style.width = `${Math.round(rB * 100)}%`;
        meter.classList.toggle('ready', g.rl[0] <= 0); meter.classList.toggle('big-ready', g.rl[1] <= 0 && g.rl[0] <= 0);
        tMat.opacity = g.rl[0] <= 0 ? 0.95 : 0.4;
      }
    },
    input(inp) {
      const fresh = !(prevB & IN.A) || inp.s !== prevS + 1; prevB = inp.b; prevS = inp.s;
      if ((inp.b & IN.A) && fresh && ctx.me !== curCat && phase === 'play') ctx.actor(ctx.me)?.play('jump', 400);
    },
    event(ev) {
      if (ev.e === 'round') {
        const who = ev.cat == null ? 'Old Bonkers' : ev.cat === ctx.me ? 'You' : nameOf(ev.cat);
        show(init.solo ? `Crossing ${ev.r + 1} of ${init.rounds}` : `Round ${ev.r + 1} of ${init.rounds}: ${who} ${ev.cat === ctx.me ? 'fire' : 'fires'} the catapult`, '', 2.4);
      } else if (ev.e === 'go') { show(ctx.me === curCat ? 'FIRE!' : 'GO!', 'good', 1); ctx.sfx('pick'); }
      else if (ev.e === 'fire') {
        addBoulder(ev.id, ev.x, ev.z, ev.t, ev.big); armK = 0; ctx.sfx('throw');
        if (cannoneer) cannoneer.play('throw', 500);
      } else if (ev.e === 'land') {
        dropBoulder(ev.id); dust(ev.x, floorY(ev.z), ev.z, ev.big); ctx.sfx('hit');
        for (const pid of ev.hit) { const p = ctx.pos(pid); if (p) floatText(stage, p.x, p.y + 2, p.z, 'Bonk!', 'bad'); }
      } else if (ev.e === 'hop') { if (ev.pid !== ctx.me) ctx.actor(ev.pid)?.play('jump', 400); }
      else if (ev.e === 'fall') {
        ctx.sfx('out'); const p = ctx.pos(ev.pid);
        if (p) floatText(stage, p.x, p.y + 1, p.z, ev.pid === ctx.me ? 'Into the pit!' : `${nameOf(ev.pid)} fell!`, ev.pid === ctx.me ? 'bad' : '');
        if (ev.by === ctx.me && ev.by != null) show(`+${RULES.pts.catch} — got ${nameOf(ev.pid)}!`, 'good', 1.2);
      } else if (ev.e === 'home') {
        ctx.sfx(ev.pid === ctx.me ? 'win' : 'good'); const p = ctx.pos(ev.pid);
        if (p) floatText(stage, p.x, p.y + 2, p.z, `+${ev.add}${ev.first ? ' first home!' : ''}`, 'good');
        if (ev.pid === ctx.me) show(ev.first ? 'First one home!' : 'Home safe!', 'good', 1.6);
      } else if (ev.e === 'alive') { if (ev.pid === ctx.me) show('Still standing +1', '', 1.2); }
      else if (ev.e === 'end') ctx.sfx('win');
    },
    pose(pid, flags, b) {
      if (home.includes(pid)) return 'cheer';
      if (b && b.y < floorY(b.z) - 0.3) return 'hit';
      if (flags & F.AIR) return 'jump';
      if (flags & F.STUN) return 'hit';
      return undefined;
    },
    frame(dt, t) {
      const now = performance.now() / 1000;
      // the catapult player's real body is the target: hide their character on the field, draw the target there
      if (curCat != null) {
        const a = ctx.actor(curCat); if (a) a.group.visible = false;
        const p = ctx.pos(curCat);
        if (p) { target.visible = true; target.position.set(p.x, floorY(p.z) + 0.06, p.z); const s = seatOf(curCat); if (s) tMat.color.set(s.color); target.rotation.y = t * 0.8; }
      } else target.visible = false;
      // boulders: the arc, the warning ring pulses, the shadow grows
      for (const b of boulders.values()) {
        const k = Math.min(1, (now - b.born) / init.flight), sx = CAT.x, sy = CAT.y + 0.6, sz = CAT.z + 1.6;
        b.rock.position.set(sx + (b.x - sx) * k, sy + (b.y + b.r - sy) * k + 7 * k * (1 - k), sz + (b.z - sz) * k);
        b.rock.rotation.set(k * 6, k * 3, 0);
        b.ring.material.opacity = 0.55 + 0.4 * Math.abs(Math.sin(now * 10)); b.zone.scale.setScalar(b.R * (0.35 + 0.65 * k));
        b.shadow.scale.setScalar(b.R * (0.3 + 0.6 * k)); shadowMat.opacity = 0.35;
      }
      // the arm flings forward, then winds back while it reloads
      armK = Math.min(1, armK + dt * 1.4); const throwK = armK < 0.15 ? armK / 0.15 : 1 - (armK - 0.15) / 0.85;
      arm.rotation.x = ARM_REST + (ARM_FIRED - ARM_REST) * Math.max(0, throwK); loaded.visible = armK > 0.8;
      if (moving.size) {
        for (const i of moving) { drawTile(i, now); const T = tiles[i]; if (T.s === 'x' && (T.drop < 0 || now - T.drop > 1.15)) moving.delete(i); else if (T.s === '0') moving.delete(i); }
        caps.instanceMatrix.needsUpdate = pillars.instanceMatrix.needsUpdate = true;
      }
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i]; f.t += dt * 2.2; const [vx, vy, vz] = f.m.userData.v;
        f.m.position.x += vx * dt; f.m.position.y += vy * dt; f.m.position.z += vz * dt; f.m.material.opacity = Math.max(0, 0.9 - f.t);
        if (f.t >= 1) { f.m.removeFromParent(); f.m.material.dispose(); fx.splice(i, 1); }
      }
      for (const fl of flags) fl.rotation.y = Math.sin(t * 3 + fl.userData.flag) * 0.25;
      cannoneer?.update(dt);
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.className = 'cx-banner'; }
      if (roleShown > 0) { roleShown -= dt; if (roleShown <= 0) role.classList.add('gone'); }
    },
    dispose() { bar.el.remove(); for (const tx of texs) tx.dispose(); for (const m of mats) m.dispose(); for (const g of geos) g.dispose(); },
  };
}
