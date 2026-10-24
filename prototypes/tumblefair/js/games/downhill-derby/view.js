// DOWNHILL DERBY, as drawn: a long mown grass run between walls of hay bales, trees and bunting beyond them, a striped
// start gate at the top and a chequered finish arch at the bottom, painted distance boards every 50 m. The course's
// own hay bales are stacked across the run, muddy puddles splash, and wooden ramps (a wedge with yellow chevrons)
// launch you over the puddle behind. Each player sits in a soapbox cart in their seat colour: a box body with a pointed
// nose, four fat wheels, a number flag with their seat shape; it rocks side to side as it wobbles and rolls onto its
// side when it tips. The camera follows your own cart on an upright phone (the whole pack on a TV), and a strip on the
// right shows where everyone is on the hill. Halloween: pumpkins down both sides and the shared dusk dressing.
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { createTunes } from '../../client/tunes.js';
import { F } from '../../shared/arena.js';

const SHAPE_CH = { circle: '●', square: '■', triangle: '▲', diamond: '◆' };
const SEAT_Y = 0.42, PLACE = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];
export function createView(ctx) {
  const { THREE, group, stage, arena: A, init } = ctx, HW = ctx.season === 'halloween';
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler(), col = new THREE.Color();
  const mats = [], geos = [], texs = [];
  const std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra }); mats.push(m); return m; };
  const basic = opts => { const m = new THREE.MeshBasicMaterial(opts); mats.push(m); return m; };
  const geo = g => { geos.push(g); return g; };
  const tex = t => { texs.push(t); return t; };
  const mesh = (g, m, x = 0, y = 0, z = 0, parent = group) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const tunes = createTunes({ volume: 0.2 });
  const sZ = init.startZ, fZ = init.finishZ, LEN = A.hd * 2 + 20;

  // ---- the hill: outside grass, the mown run, hay walls, trees
  const outside = new THREE.Mesh(geo(new THREE.PlaneGeometry(120, LEN + 60).rotateX(-Math.PI / 2)), std(HW ? '#2c3a2e' : '#5aa84a', { roughness: 1 })); outside.position.y = -0.04; outside.receiveShadow = true; group.add(outside);
  const NS = 30, run = new THREE.InstancedMesh(geo(new THREE.PlaneGeometry(A.hw * 2, LEN / NS).rotateX(-Math.PI / 2)), std('#ffffff', { roughness: 1 }), NS);
  for (let i = 0; i < NS; i++) { m4.makeTranslation(0, 0, A.hd + 10 - (i + 0.5) * LEN / NS); run.setMatrixAt(i, m4); run.setColorAt(i, col.set(HW ? (i % 2 ? '#3f6a45' : '#4a7a50') : (i % 2 ? '#86d86e' : '#95e27c'))); }
  run.receiveShadow = true; group.add(run);
  const strawTex = tex(canvasTexture(64, 64, (c, w) => { c.fillStyle = HW ? '#c8963a' : '#e8c35a'; c.fillRect(0, 0, w, w); c.strokeStyle = HW ? '#8a6420' : '#c99a36'; c.lineWidth = 2; for (let i = 0; i < 26; i++) { const x = (i * 23) % w, y = (i * 41) % w; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 9, y + 3); c.stroke(); } c.fillStyle = '#a0703a'; c.fillRect(0, w * 0.3, w, 4); c.fillRect(0, w * 0.68, w, 4); }));
  const baleMat = std('#ffffff', { map: strawTex, roughness: 1 }), baleGeo = geo(new THREE.BoxGeometry(1, 1, 1));
  const wallN = Math.ceil((A.hd * 2) / 2.2) * 2, walls = new THREE.InstancedMesh(baleGeo, baleMat, wallN);
  for (let i = 0; i < wallN; i++) { const side = i % 2 ? 1 : -1, z = A.hd - (i >> 1) * 2.2 - 1.1; m4.compose(v.set(side * (A.hw + 0.6), 0.5, z), q.identity(), sc.set(1.1, 1, 2.1)); walls.setMatrixAt(i, m4); }
  walls.castShadow = true; walls.receiveShadow = true; group.add(walls);
  const NT = 90, trees = new THREE.InstancedMesh(geo(new THREE.ConeGeometry(1.5, 3.8, 8)), std(HW ? '#2b4a36' : '#2f8a3e'), NT), trunks = new THREE.InstancedMesh(geo(new THREE.CylinderGeometry(0.22, 0.28, 1, 6)), std('#6a4a2a'), NT);
  for (let i = 0; i < NT; i++) { const side = i % 2 ? 1 : -1, k = i >> 1, x = side * (A.hw + 4 + (k % 3) * 2.6), z = A.hd - k * 7 - (k % 2) * 3, s = 0.8 + ((i * 37) % 10) / 22; m4.compose(v.set(x, 1 + 1.9 * s, z), q.identity(), sc.setScalar(s)); trees.setMatrixAt(i, m4); m4.compose(v.set(x, 0.5, z), q.identity(), sc.setScalar(1)); trunks.setMatrixAt(i, m4); }
  trees.castShadow = true; group.add(trees, trunks);
  // start gate and finish arch
  function arch(z, map, color) {
    for (const sx of [-1, 1]) mesh(geo(new THREE.CylinderGeometry(0.16, 0.18, 4.2, 8)), std(color), sx * (A.hw + 0.4), 2.1, z);
    const bnr = new THREE.Mesh(geo(new THREE.PlaneGeometry(A.hw * 2 + 0.8, 1.2)), basic({ map, side: THREE.DoubleSide })); bnr.position.set(0, 3.7, z); group.add(bnr);
  }
  const chequer = tex(canvasTexture(256, 32, (c, w, hh) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { c.fillStyle = (i + j) % 2 ? '#111' : '#fff'; c.fillRect(i * 16, j * 16, 16, 16); } }));
  const stripes = tex(canvasTexture(256, 32, (c) => { for (let i = 0; i < 16; i++) { c.fillStyle = i % 2 ? '#ffffff' : (HW ? '#ff8a1a' : '#e8394a'); c.fillRect(i * 16, 0, 16, 32); } }));
  arch(sZ + 1.5, stripes, '#ffffff'); arch(fZ, chequer, '#111111');
  const line = new THREE.Mesh(geo(new THREE.PlaneGeometry(A.hw * 2, 1).rotateX(-Math.PI / 2)), basic({ map: chequer })); line.position.set(0, 0.02, fZ); group.add(line);
  const tags = [];
  for (let d = 50; d < init.length; d += 50) { const post = mesh(geo(new THREE.BoxGeometry(0.12, 1.3, 0.12)), std('#ffffff'), -(A.hw + 1.4), 0.65, sZ - d); tags.push(stage.tag(post, { text: `${d} m`, height: 1.0, cls: 'dd-mark' })); }
  // ---- the course: bales, puddles, ramps
  const blocks = A.blocks || [], bales = new THREE.InstancedMesh(baleGeo, baleMat, Math.max(1, blocks.length));
  blocks.forEach((b, i) => { m4.compose(v.set(b.x, 0.55, b.z), q.setFromEuler(e3.set(0, ((i * 13) % 7 - 3) * 0.02, 0)), sc.set(b.hw * 2, 1.1, b.hd * 2)); bales.setMatrixAt(i, m4); });
  bales.count = blocks.length; bales.castShadow = true; group.add(bales);
  const puddles = init.puddles || [], mud = new THREE.InstancedMesh(geo(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2)), std(HW ? '#3a3a6a' : '#7a5a3a', { roughness: 0.15, metalness: 0.2 }), Math.max(1, puddles.length));
  puddles.forEach((p, i) => { m4.compose(v.set(p.x, 0.025, p.z), q.identity(), sc.set(p.r, 1, p.r * 0.85)); mud.setMatrixAt(i, m4); }); mud.count = puddles.length; group.add(mud);
  const rampShape = new THREE.Shape(); rampShape.moveTo(0, 0); rampShape.lineTo(1, 0); rampShape.lineTo(1, 0.5); rampShape.closePath();
  const rampGeo = geo(new THREE.ExtrudeGeometry(rampShape, { depth: 1, bevelEnabled: false }).translate(-0.5, 0, -0.5).rotateY(Math.PI / 2));   // high side toward -z (downhill)
  const chev = tex(canvasTexture(64, 64, (c, w) => { c.fillStyle = '#a0703a'; c.fillRect(0, 0, w, w); c.strokeStyle = '#ffd23f'; c.lineWidth = 8; for (const y of [10, 34]) { c.beginPath(); c.moveTo(6, y + 16); c.lineTo(w / 2, y); c.lineTo(w - 6, y + 16); c.stroke(); } }));
  const rampMat = std('#ffffff', { map: chev });
  const woodMat = std('#a0703a'), slopeGeo = geo(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  for (const r of init.ramps || []) {
    const o = mesh(rampGeo, woodMat, r.x, 0, r.z); o.scale.set(r.hw * 2, 1, r.hd * 2); o.receiveShadow = true;
    // the chevrons on the slope point down the hill (up the screen)
    const len = Math.hypot(r.hd * 2, 0.5), top = new THREE.Mesh(slopeGeo, rampMat); top.scale.set(r.hw * 2, 1, len); top.rotation.x = Math.atan2(0.5, r.hd * 2); top.position.set(r.x, 0.26, r.z); group.add(top);
  }
  // ---- carts
  const rubber = std('#1d1f24', { roughness: 0.8 }), wood = std('#c98a4a');
  const bodyGeo = geo(new THREE.BoxGeometry(0.95, 0.42, 1.7)), noseGeo = geo(new THREE.ConeGeometry(0.5, 0.7, 4).rotateX(-Math.PI / 2).rotateZ(Math.PI / 4)), wheelGeo = geo(new THREE.CylinderGeometry(0.27, 0.27, 0.16, 14).rotateZ(Math.PI / 2));
  function makeCart(color, dark, mark) {
    const g = new THREE.Group(), roll = new THREE.Group(); g.add(roll);
    mesh(bodyGeo, std(color, { roughness: 0.45 }), 0, 0.42, 0, roll);
    mesh(noseGeo, std(dark, { roughness: 0.5 }), 0, 0.42, 1.15, roll);
    mesh(geo(new THREE.BoxGeometry(0.9, 0.06, 0.5)), wood, 0, 0.66, -0.6, roll);
    const wheels = [];
    for (const [x, z] of [[-0.56, 0.6], [0.56, 0.6], [-0.56, -0.6], [0.56, -0.6]]) wheels.push(mesh(wheelGeo, rubber, x, 0.27, z, roll));
    const flagTex = tex(canvasTexture(64, 48, (c, w, hh) => { c.fillStyle = color; c.fillRect(0, 0, w, hh); c.fillStyle = '#fff'; c.font = '900 34px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(mark, w / 2, hh / 2 + 2); }));
    mesh(geo(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 5)), std('#ffffff'), 0.38, 1.1, -0.8, roll);
    const flag = new THREE.Mesh(geo(new THREE.PlaneGeometry(0.46, 0.34)), basic({ map: flagTex, side: THREE.DoubleSide })); flag.position.set(0.38, 1.6, -0.6); flag.rotation.y = Math.PI / 2; roll.add(flag);
    g.userData = { roll, wheels, flag }; g.scale.setScalar(1.15);
    return g;
  }
  const carts = new Map();
  for (const p of ctx.players) { const a = ctx.actor(p.pid); if (!a) continue; const c = makeCart(p.color, p.dark, SHAPE_CH[p.shape] || '★'); a.group.add(c); carts.set(p.pid, { cart: c, actor: a }); }
  const cpuTags = [];
  for (const [i, t] of (init.cpus || []).entries()) {
    const c = makeCart(['#9aa3ad', '#c98aff'][i % 2], '#5a626b', '★'), holder = new THREE.Group(); holder.add(c); group.add(holder);
    const K = { cart: c, holder, actor: null, cpu: true, cur: null, to: null, id: t.id }; carts.set(t.id, K);
    cpuTags.push(stage.tag(holder, { text: t.name, height: 2.0, cls: 'dd-cpu' }));
    ctx.createActor({ look: { race: ['halfling', 'dwarf'][i % 2], seed: 5100 + i * 77 } }).then(a => { if (!a) return; K.actor = a; c.userData.roll.add(a.group); a.place(0, SEAT_Y, -0.2, 0); a.setPose('sitGround'); });
  }
  // ---- splashes and dust
  const PUFF = 60, puffs = new THREE.InstancedMesh(geo(new THREE.SphereGeometry(0.16, 6, 4)), basic({ color: HW ? '#8a8ac8' : '#a8d8ff', transparent: true, opacity: 0.85 }), PUFF); puffs.count = 0; group.add(puffs);
  const bursts = [];
  const burst = (x, z, n = 10) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; bursts.push({ x, z, y: 0.3, vx: Math.sin(a) * 2.5, vz: Math.cos(a) * 2.5, vy: 3 + (i % 3), t: 0 }); } while (bursts.length > PUFF) bursts.shift(); };
  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'metres' });
  const banner = h('div', 'dd-banner'), strip = h('div', 'dd-strip', `<i class="dd-top">▲</i>${ctx.players.map(p => `<b class="dd-dot" data-pid="${p.pid}" style="--seat:${p.color}">${SHAPE_CH[p.shape] || ''}</b>`).join('')}${(init.cpus || []).map(c => `<b class="dd-dot cpu" data-pid="${c.id}"></b>`).join('')}<i class="dd-flag">🏁</i>`);
  const tip = h('div', 'dd-tip', 'Hold A to tuck · let go in the turns');
  ctx.ui.append(banner, strip); if (ctx.me != null) ctx.ui.append(tip);
  let bannerT = 0;
  const show = (text, cls = '', ms = 1000) => { banner.textContent = text; banner.className = 'dd-banner show ' + cls; bannerT = ms / 1000; };
  const flagsOf = new Map();
  let fin = {}, wob = {}, started = false, camZ = sZ - 6, camHd = 12;
  const zOf = id => { const K = carts.get(id); if (!K) return null; if (K.cpu) return K.cur?.z ?? null; return ctx.pos(id)?.z ?? null; };
  const portrait = () => innerHeight > innerWidth * 1.15;
  function frameCam(dt, instant = false) {
    const mine = ctx.me != null ? zOf(ctx.me) : null;
    let cz, hd;
    if (mine != null && portrait()) { cz = mine - 6; hd = 12; }
    else {
      const zs = [...carts.keys()].map(zOf).filter(z => z != null), lead = Math.min(...zs), back = Math.max(...zs);
      hd = Math.min(26, Math.max(13, (back - lead) / 2 + 7)); cz = mine != null ? mine - 6 : (lead + back) / 2 - 4;
    }
    cz = Math.max(fZ - 2, Math.min(sZ - 6, cz));
    const k = instant ? 1 : Math.min(1, dt * 3); camZ += (cz - camZ) * k; camHd += (hd - camHd) * k;
    ctx.camera({ cx: 0, cz: camZ, hw: A.hw + 1.4, hd: camHd }, { instant });
  }
  frameCam(0, true);
  return {
    halloween: { spots: Array.from({ length: 24 }, (_, i) => [(i % 2 ? 1 : -1) * (A.hw + 2.2), 0, sZ - 8 - (i >> 1) * 24]), ghosts: [[-A.hw - 6, 2.5, sZ - 40], [A.hw + 6, 2.5, sZ - 120], [-A.hw - 6, 2.5, fZ + 30]] },
    state(g) {
      bar.set(g.sc, g.left);
      for (const row of g.cpu || []) { const K = carts.get(row[0]); if (!K) continue; const to = { x: row[1], z: row[2], yaw: row[3], flags: row[4], y: row[5] }; if (!K.cur) K.cur = { ...to }; K.to = to; if (row[6]) fin[row[0]] = row[6]; }
      for (const [pid, pl] of Object.entries(g.fin || {})) fin[pid] = pl;
      wob = g.wob || {};
      if (!g.cd && !started && g.left > 0) { started = true; tunes.start(HW ? 'spooky' : 'jig'); }
    },
    event(ev) {
      if (ev.e === 'count') { show(String(ev.n), 'count', 900); ctx.sfx('tap'); }
      else if (ev.e === 'go') { show('GO!', 'go', 900); ctx.sfx('good'); setTimeout(() => tip.classList.add('gone'), 5000); }
      else if (ev.e === 'tip') { burst(ev.x, ev.z, 8); ctx.sfx('hit'); tunes.fx('boing', 0.7); floatText(stage, ev.x, 1.8, ev.z, 'Tipped!', ''); if (ev.id === ctx.me) show('Wobble… TIPPED!', 'small', 1000); }
      else if (ev.e === 'bale') { burst(ev.x, ev.z - 0.6, 10); ctx.sfx('hit'); tunes.fx('knock', 0.8); if (ev.id === ctx.me) show('Hay!', 'small', 700); }
      else if (ev.e === 'splash') { burst(ev.x, ev.z, 12); ctx.sfx('splat'); }
      else if (ev.e === 'jump') { tunes.fx('boing', 1.3); if (ev.id === ctx.me) show('Big air!', 'go small', 800); }
      else if (ev.e === 'land') { burst(ev.x, ev.z, 6); }
      else if (ev.e === 'finish') {
        fin[ev.id] = ev.place; ctx.sfx(ev.place === 1 ? 'win' : 'good');
        const p = carts.get(ev.id); if (p) floatText(stage, 0, 2.6, fZ, `${PLACE[ev.place] || ''}!`, ev.id === ctx.me ? 'good' : '');
        if (ev.id === ctx.me) show(ev.place === 1 ? 'FIRST DOWN!' : `${PLACE[ev.place]}!`, 'go', 1600);
        else if (ev.place === 1) show(`${ev.id < 0 ? (init.cpus || []).find(c => c.id === ev.id)?.name : ctx.players.find(p2 => p2.pid === ev.id)?.name || '?'} wins!`, 'small', 1400);
      } else if (ev.e === 'end') { show('Finish!', 'small', 1400); tunes.stop(false); }
    },
    pose(pid, flags) { flagsOf.set(pid, flags); return 'sitGround'; },
    frame(dt, t) {
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.remove('show'); }
      frameCam(dt);
      for (const [id, K] of carts) {
        const ud = K.cart.userData; let flags = 0, speed = 0;
        if (K.cpu) {
          if (!K.to) continue; const k = 1 - Math.exp(-dt * 14), c = K.cur, to = K.to;
          const ox = c.x, oz = c.z; c.x += (to.x - c.x) * k; c.z += (to.z - c.z) * k; c.y = to.y; let d = to.yaw - c.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); c.yaw += d * k;
          speed = Math.hypot(c.x - ox, c.z - oz) / Math.max(dt, 1e-3);
          K.holder.position.set(c.x, c.y, c.z); K.cart.rotation.y = c.yaw; flags = to.flags;
          if (K.actor) K.actor.update(dt);
        } else {
          const a = K.actor; flags = flagsOf.get(id) || 0; K.cart.rotation.y = a.body.group.rotation.y; a.body.group.position.y = SEAT_Y; speed = 6;
        }
        const w = (wob[id] || 0) / 9, tipped = (flags & F.STUN) && !(flags & F.FROZEN);
        ud.roll.rotation.z = tipped ? 1.1 : Math.sin(t * 17 + id) * w * 0.32;
        if (!K.cpu) K.actor.body.group.rotation.z = ud.roll.rotation.z * 0.8;
        for (const wh of ud.wheels) wh.rotation.x -= dt * speed * 3;
        ud.flag.rotation.y = Math.PI / 2 + Math.sin(t * 9 + id) * 0.3;
        // where everyone is on the hill
        const z = zOf(id), dot = strip.querySelector(`[data-pid="${id}"]`);
        if (z != null && dot) { const u = Math.max(0, Math.min(1, (sZ - z) / (sZ - fZ))); dot.style.top = `${8 + u * 84}%`; dot.dataset.place = fin[id] ? PLACE[fin[id]] : ''; }
      }
      let np = 0;
      for (let i = bursts.length - 1; i >= 0; i--) { const B = bursts[i]; B.t += dt; if (B.t > 0.6) { bursts.splice(i, 1); continue; } B.vy -= 12 * dt; B.x += B.vx * dt; B.z += B.vz * dt; B.y = Math.max(0.05, B.y + B.vy * dt); m4.compose(v.set(B.x, B.y, B.z), q.identity(), sc.setScalar(1 - B.t)); puffs.setMatrixAt(np++, m4); }
      puffs.count = np; puffs.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      tunes.dispose(); bar.el.remove(); banner.remove(); strip.remove(); tip.remove();
      for (const t2 of [...cpuTags, ...tags]) t2.remove();
      for (const K of carts.values()) if (!K.cpu) { K.cart.removeFromParent(); if (K.actor) { K.actor.body.group.position.y = 0; K.actor.body.group.rotation.z = 0; } }
      for (const t2 of texs) t2.dispose(); for (const m of mats) m.dispose(); for (const g2 of geos) g2.dispose();
    },
  };
}
