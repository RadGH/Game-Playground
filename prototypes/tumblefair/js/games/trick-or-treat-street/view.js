// TRICK-OR-TREAT STREET, as drawn: a friendly moonlit street (purple sky, no real darkness). A cobbled road down the
// middle with a pale pavement round it; five little houses along the back and two down each side, in candy colours
// (lilac, mint, peach, teal, butter) with pointy roofs, round windows and a front door on the pavement. A LIT door
// glows warm orange, its windows are yellow, a pool of light spills on the step, a jack-o'-lantern grins beside it and
// a bouncing wrapped sweet floats over it. A dark door is shut and plain. Knocking: the door swings open; a treat
// throws "+2" (a BIG BAR is a gold "BIG BAR! +5"), a trick is a cartoon bedsheet ghost popping up out of the doorway
// with "BOO!" or green slime splashing down (a green puddle follows that player while they are slowed). Two lamp posts
// and a pile of pumpkins sit in the road. Each player carries a pumpkin bucket in their seat colour, filling with
// sweets as they score. Spilled candy lies on the road as wrapped sweets. HUD: score bar (candy), a hint pill that
// says what to do right now, a banner for CANDY RUSH and for big moments; solo shows the medal targets.
import { RULES } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { createTunes } from '../../client/tunes.js';
import { spookyKit } from '../ghost-tag/spooky-kit.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

const HOUSE_COLS = ['#b79cff', '#7fe0c0', '#ffb38a', '#6cc7e0', '#ffe08a', '#ff9ec7', '#a6e07a', '#c7a6ff', '#8ad0ff'];
const CANDY_COLS = ['#ff4d6d', '#ffd23f', '#7be0ff', '#a6ff7a', '#ff9ef0', '#ffffff'];
export function createView(ctx) {
  const { THREE, group, stage, arena: A, init } = ctx;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler(), col = new THREE.Color();
  const mats = [], geos = [], texs = [];
  const std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra }); mats.push(m); return m; };
  const basic = opts => { const m = new THREE.MeshBasicMaterial(opts); mats.push(m); return m; };
  const geo = g => { geos.push(g); return g; };
  const tex = t => { texs.push(t); return t; };
  const mesh = (g, m, x = 0, y = 0, z = 0, parent = group) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const kit = spookyKit(ctx); kit.night();
  const tunes = createTunes({ volume: 0.24 });
  const doorsAt = init.doors.map(([x, z, face]) => ({ x, z, face }));

  // ---- ground: lawn outside, pavement band, cobbled road
  const lawn = new THREE.Mesh(geo(new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2)), std('#3f6a4a', { roughness: 1 })); lawn.position.y = -0.03; lawn.receiveShadow = true; group.add(lawn);
  const paveTex = tex(canvasTexture(128, 128, (c, w) => { c.fillStyle = '#b8b0cf'; c.fillRect(0, 0, w, w); c.strokeStyle = 'rgba(60,50,90,.35)'; c.lineWidth = 3; for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * 32, 0); c.lineTo(i * 32, w); c.stroke(); c.beginPath(); c.moveTo(0, i * 32); c.lineTo(w, i * 32); c.stroke(); } }));
  paveTex.wrapS = paveTex.wrapT = THREE.RepeatWrapping; paveTex.repeat.set(A.hw, A.hd);
  const pave = new THREE.Mesh(geo(new THREE.PlaneGeometry(A.hw * 2 + 0.6, A.hd * 2 + 0.6).rotateX(-Math.PI / 2)), std('#ffffff', { map: paveTex, roughness: 0.95 })); pave.position.y = 0; pave.receiveShadow = true; group.add(pave);
  const cobTex = tex(canvasTexture(256, 256, (c, w) => { c.fillStyle = '#5b5277'; c.fillRect(0, 0, w, w); for (let y = 0; y < 8; y++) for (let x = 0; x < 9; x++) { const ox = (y % 2) * 16; c.fillStyle = ['#6a6189', '#655c84', '#71688f'][(x + y) % 3]; c.beginPath(); c.roundRect(x * 32 - ox + 2, y * 32 + 2, 28, 28, 8); c.fill(); } }));
  cobTex.wrapS = cobTex.wrapT = THREE.RepeatWrapping; cobTex.repeat.set((A.hw - 1.3) / 2, (A.hd - 1.3) / 2);
  const road = new THREE.Mesh(geo(new THREE.PlaneGeometry((A.hw - 1.3) * 2, (A.hd - 1.3) * 2).rotateX(-Math.PI / 2)), std('#ffffff', { map: cobTex, roughness: 0.9 })); road.position.set(0, 0.004, 0); road.receiveShadow = true; group.add(road);
  // curbs
  const curbMat = std('#8f86ad');
  for (const sz of [-1, 1]) mesh(geo(new THREE.BoxGeometry((A.hw - 1.3) * 2 + 0.2, 0.08, 0.1)), curbMat, 0, 0.04, sz * (A.hd - 1.3));
  for (const sx of [-1, 1]) mesh(geo(new THREE.BoxGeometry(0.1, 0.08, (A.hd - 1.3) * 2)), curbMat, sx * (A.hw - 1.3), 0.04, 0);

  // ---- houses: body, pointy roof, round windows, a door on a hinge
  const bodyGeo = geo(new THREE.BoxGeometry(1, 1, 1)), roofGeo = geo(new THREE.CylinderGeometry(1, 1, 1, 3).rotateX(-Math.PI / 2).rotateY(Math.PI / 2)), winGeo = geo(new THREE.CircleGeometry(0.28, 16));
  const doorGeo = geo(new THREE.BoxGeometry(0.86, 1.4, 0.08).translate(0.43, 0.7, 0)), knobGeo = geo(new THREE.SphereGeometry(0.05, 8, 6));
  const roofCols = ['#9a6ad8', '#5aa0d8', '#e07a5a', '#5ad0a0', '#e0b85a'];
  const poolGeo = geo(new THREE.CircleGeometry(1.2, 28).rotateX(-Math.PI / 2)), ringGeo = geo(new THREE.RingGeometry(0.95, 1.12, 32).rotateX(-Math.PI / 2));
  const doors = doorsAt.map((d, i) => {
    const out = { x: Math.sin(d.face), z: Math.cos(d.face) };        // the way the door looks (into the street)
    const W = i < 5 ? 3.2 : 3.0, D = 2.6, H = 2.3;
    const house = new THREE.Group(); house.position.set(d.x - out.x * (0.55 + D / 2 + 0.15), 0, d.z - out.z * (0.55 + D / 2 + 0.15)); house.rotation.y = d.face; group.add(house);
    const body = mesh(bodyGeo, std(HOUSE_COLS[i % HOUSE_COLS.length], { roughness: 0.85 }), 0, H / 2, 0, house); body.scale.set(W, H, D); body.receiveShadow = true;
    const roof = mesh(roofGeo, std(roofCols[i % roofCols.length], { roughness: 0.7, emissive: roofCols[i % roofCols.length], emissiveIntensity: 0.18 }), 0, H + 0.5 * 1.2, 0, house); roof.scale.set(W + 0.4, 1.2, (D / 2 + 0.3) / 0.87);
    const winMat = std('#2a2340', { emissive: '#ffd36b', emissiveIntensity: 1.2, roughness: 0.4 });
    for (const sx of [-1, 1]) { const w = mesh(winGeo, winMat, sx * W * 0.3, H * 0.62, D / 2 + 0.01, house); w.castShadow = false; }
    const frame = mesh(geo(new THREE.BoxGeometry(1.04, 1.52, 0.06)), std('#ffffff'), 0, 0.76, D / 2 + 0.01, house); frame.castShadow = false;
    const glowMat = std('#2a1a10', { emissive: '#ffae3b', emissiveIntensity: 1.6 });
    const gap = mesh(geo(new THREE.PlaneGeometry(0.86, 1.4)), glowMat, 0, 0.7, D / 2 + 0.045, house); gap.castShadow = false;
    const hinge = new THREE.Group(); hinge.position.set(-0.43, 0, D / 2 + 0.08); house.add(hinge);
    const doorMat = std(['#7a3fbf', '#d9534f', '#2f8f6f', '#3f6fbf', '#c76f1f'][i % 5], { roughness: 0.6, emissive: '#ff9a2e', emissiveIntensity: 0 });
    mesh(doorGeo, doorMat, 0, 0, 0, hinge); mesh(knobGeo, std('#ffd23f', { metalness: 0.6, roughness: 0.3 }), 0.72, 0.7, 0.06, hinge);
    const step = mesh(geo(new THREE.BoxGeometry(1.3, 0.1, 0.5)), std('#a79fc4'), 0, 0.05, D / 2 + 0.3, house); step.receiveShadow = true;
    const jack = kit.jackOLantern(0.3); jack.position.set(0.9, 0, D / 2 + 0.35); jack.rotation.y = -0.3; house.add(jack);
    const pool = new THREE.Mesh(poolGeo, basic({ color: '#ffb347', transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })); pool.position.set(d.x + out.x * 0.35, 0.012, d.z + out.z * 0.35); group.add(pool);
    const ring = new THREE.Mesh(ringGeo, basic({ color: '#ffd23f', transparent: true, opacity: 0.8, depthWrite: false })); ring.position.set(d.x + out.x * 0.35, 0.016, d.z + out.z * 0.35); group.add(ring);
    const halo = kit.glowSprite('#ffb347', 2.6, 0.55); halo.position.set(0, 0.9, D / 2 + 0.3); house.add(halo);
    const sweet = new THREE.Group(); sweet.position.set(d.x + out.x * 0.2, 2.2, d.z + out.z * 0.2); group.add(sweet);
    return { ...d, out, house, hinge, glowMat, winMat, doorMat, jack, pool, ring, halo, sweet, st: 1, lit: 1, open: 0, openT: 0 };
  });
  // the floating "knock here" sweet over each lit door: a wrapped candy (ellipsoid + two twist cones)
  const candyBody = geo(new THREE.SphereGeometry(0.18, 12, 8).scale(1.25, 0.85, 0.85)), twist = geo(new THREE.ConeGeometry(0.11, 0.18, 8).rotateZ(Math.PI / 2));
  doors.forEach((d, i) => {
    const m = std(CANDY_COLS[i % 5], { emissive: CANDY_COLS[i % 5], emissiveIntensity: 0.35, roughness: 0.3 });
    mesh(candyBody, m, 0, 0, 0, d.sweet).castShadow = false;
    const a = mesh(twist, m, -0.29, 0, 0, d.sweet); a.rotation.z = Math.PI; a.castShadow = false;
    mesh(twist, m, 0.29, 0, 0, d.sweet).castShadow = false;
    d.sweet.scale.setScalar(2.2);
  });
  // trick pop-ups: one bedsheet ghost (reused) and one slime bucket splash
  const boo = kit.sheetGhost({ opacity: 0.95, scale: 1.0 }); boo.visible = false; group.add(boo);
  let booT = 0, booAt = null;

  // ---- street furniture: two lamp posts and a pile of pumpkins (the solid posts in the arena)
  const lampPostMat = std('#2d2546', { roughness: 0.5, metalness: 0.4 }), lampMat = std('#fff2c4', { emissive: '#ffd27a', emissiveIntensity: 2 });
  for (const p of A.posts.slice(0, 2)) {
    mesh(geo(new THREE.CylinderGeometry(0.08, 0.12, 2.6, 8)), lampPostMat, p.x, 1.3, p.z);
    mesh(geo(new THREE.CylinderGeometry(0.22, 0.14, 0.4, 6)), lampMat, p.x, 2.75, p.z).castShadow = false;
    mesh(geo(new THREE.ConeGeometry(0.3, 0.25, 6)), lampPostMat, p.x, 3.05, p.z);
    const g = kit.glowSprite('#ffd27a', 2.2, 0.7); g.position.set(p.x, 2.75, p.z); group.add(g);
    const pool = new THREE.Mesh(geo(new THREE.CircleGeometry(1.6, 24).rotateX(-Math.PI / 2)), basic({ color: '#ffd27a', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending })); pool.position.set(p.x, 0.011, p.z); group.add(pool);
  }
  const pile = A.posts[2];
  for (const [dx, dz, r, y] of [[-0.25, 0.1, 0.36, 0], [0.3, 0.05, 0.32, 0], [0, -0.25, 0.3, 0], [0.02, 0.05, 0.27, 0.48]]) { const j = kit.jackOLantern(r); j.position.set(pile.x + dx, y, pile.z + dz); j.rotation.y = dx * 1.5; group.add(j); }
  // a picket fence along the front edge, and round trees beyond the houses
  const PK = 70, pickets = new THREE.InstancedMesh(geo(new THREE.BoxGeometry(0.12, 0.6, 0.05)), std('#e9e1ff'), PK);
  let pk = 0; for (let x = -A.hw - 0.2; x <= A.hw + 0.2 && pk < PK; x += 0.3) { m4.compose(v.set(x, 0.3, A.hd + 0.35), q.identity(), sc.setScalar(1)); pickets.setMatrixAt(pk++, m4); }
  pickets.count = pk; pickets.castShadow = true; group.add(pickets);
  const TREES = 14, treeTop = new THREE.InstancedMesh(geo(new THREE.IcosahedronGeometry(1, 0)), std('#2d5a4a', { flatShading: true }), TREES), trunk = new THREE.InstancedMesh(geo(new THREE.CylinderGeometry(0.12, 0.18, 1.4, 6)), std('#4a3326'), TREES);
  for (let i = 0; i < TREES; i++) {
    const back = i < 8, x = back ? -12 + i * 3.4 : (i % 2 ? 1 : -1) * (A.hw + 4.4), z = back ? -A.hd - 4.6 - (i % 2) : -3 + Math.floor((i - 8) / 2) * 3.4, s = 1 + (i % 3) * 0.3;
    m4.compose(v.set(x, 1.4 + s * 0.8, z), q.setFromEuler(e3.set(i, i * 2, 0)), sc.setScalar(s)); treeTop.setMatrixAt(i, m4);
    m4.compose(v.set(x, 0.7, z), q.identity(), sc.setScalar(1)); trunk.setMatrixAt(i, m4);
  }
  treeTop.castShadow = true; group.add(treeTop, trunk);
  // the moon, low over the back houses
  const moon = new THREE.Mesh(geo(new THREE.CircleGeometry(2.2, 32)), basic({ color: '#fff6d8' })); moon.position.set(6, 9, -22); group.add(moon);
  const moonGlow = kit.glowSprite('#fff2c4', 9, 0.5); moonGlow.position.copy(moon.position); group.add(moonGlow);

  // ---- spilled candy on the road (instanced)
  const DROPS = 24, dropMesh = new THREE.InstancedMesh(candyBody, std('#ffffff', { roughness: 0.35, emissive: '#ffffff', emissiveIntensity: 0.15 }), DROPS);
  dropMesh.count = 0; dropMesh.castShadow = true; group.add(dropMesh);
  for (let i = 0; i < DROPS; i++) dropMesh.setColorAt(i, col.set(CANDY_COLS[i % CANDY_COLS.length]));
  let drops = [];

  // ---- each player's pumpkin bucket (seat colour) with sweets that pile up; a slime puddle while slowed
  const bucketGeo = geo(new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, Math.PI * 0.18, Math.PI * 0.82).scale(1, 0.85, 1)), handleGeo = geo(new THREE.TorusGeometry(0.17, 0.018, 6, 16, Math.PI));
  const heapGeo = geo(new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2));
  const puddleGeo = geo(new THREE.CircleGeometry(0.75, 20).rotateX(-Math.PI / 2)), puddleMat = basic({ color: '#7dff5a', transparent: true, opacity: 0.55, depthWrite: false });
  const slimeTopGeo = geo(new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1)), slimeMat = std('#7dff5a', { roughness: 0.15, emissive: '#3aa020', emissiveIntensity: 0.4, transparent: true, opacity: 0.85 });
  const P = new Map();
  for (const p of ctx.players) {
    const bm = std(p.color, { map: kit.faceTex, roughness: 0.6 });
    const bucket = new THREE.Group(); bucket.add(new THREE.Mesh(bucketGeo, bm));
    const handle = new THREE.Mesh(handleGeo, std('#2d2546')); handle.position.y = 0.08; bucket.add(handle);
    const heap = new THREE.Mesh(heapGeo, std('#ffd23f', { roughness: 0.4, emissive: '#ff9ef0', emissiveIntensity: 0.15 })); heap.position.y = 0.06; heap.scale.setScalar(0.01); bucket.add(heap);
    bucket.traverse(o => { o.castShadow = true; });
    const puddle = new THREE.Mesh(puddleGeo, puddleMat); puddle.position.y = 0.02; puddle.visible = false; group.add(puddle);
    const goo = new THREE.Mesh(slimeTopGeo, slimeMat); goo.visible = false;
    P.set(p.pid, { bucket, heap, puddle, goo, attached: false, candy: 0, flags: 0, speed: 0 });
  }
  function attach() {
    for (const [pid, s] of P) {
      if (s.attached) continue;
      const a = ctx.actor(pid); if (!a) continue;
      const hgt = a.height || 1.6;
      s.bucket.position.set(0.42, hgt * 0.33, 0.12); s.bucket.scale.setScalar(1.35); a.body.group.add(s.bucket);
      s.goo.position.set(0, hgt * 0.98, 0); a.body.group.add(s.goo);
      s.attached = true;
    }
  }

  // frame the street with the houses in view
  // a portrait phone sees a 12 m slice of the street that follows its own character (the whole street makes everyone
  // ant-sized); a TV, a landscape phone or a watcher sees the whole street
  const FULL = { cx: 0, cz: -0.7, hw: A.hw + 0.4, hd: A.hd + 1.3 }, SLICE = 6.2;
  const portrait = () => ctx.me != null && innerHeight > innerWidth * 1.15;
  let camX = ctx.me != null ? (ctx.pos(ctx.me)?.x ?? 0) : 0;
  const frameCam = (dt, instant = false) => {
    if (!portrait()) { ctx.camera(FULL, { instant }); return; }
    const at = ctx.pos(ctx.me), lim = FULL.hw - SLICE, want = Math.max(-lim, Math.min(lim, at ? at.x : 0));
    camX = instant ? want : camX + (want - camX) * Math.min(1, dt * 4);
    ctx.camera({ cx: camX, cz: FULL.cz, hw: SLICE, hd: FULL.hd }, { instant });
  };
  frameCam(0, true);

  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'candy' });
  const pill = h('div', 'tts-pill'), banner = h('div', 'tts-banner');
  ctx.ui.append(pill, banner);
  let medals = null;
  if (init.solo && init.medals) { medals = h('div', 'tts-medals'); medals.innerHTML = init.medals.map((m, i) => `<span data-m="${i}"><i>${['🥉', '🥈', '🥇'][i]}</i>${m}</span>`).join(''); ctx.ui.append(medals); }
  let bannerT = 0, rush = false, ended = false, lastPill = '', lastG = null, holdPill = 0;
  function show(text, cls = '', ms = 1200) { banner.textContent = text; banner.className = 'tts-banner show ' + cls; bannerT = ms / 1000; }
  const nameOf = pid => (pid === ctx.me ? 'You' : ctx.players.find(p => p.pid === pid)?.name || '?');
  const nearLit = pid => { const at = ctx.pos(pid); if (!at) return null; let best = null, bd = RULES.reach; for (const d of doors) { if (d.st !== 1) continue; const dd = Math.hypot(at.x - d.x, at.z - d.z); if (dd < bd) { bd = dd; best = d; } } return best; };
  function setPill(icon, text, cls = '') { const s = icon + text + cls; if (s === lastPill) return; lastPill = s; pill.className = 'tts-pill ' + cls; pill.innerHTML = `<i>${icon}</i><span>${text}</span>`; }
  tunes.start('spooky');
  show('Trick or treat!', 'go', 1500);

  // the pill (and the line under it) sit just under the score bar, which wraps to two rows with four players on a phone
  let hudTop = -1;
  function placeHud() {
    const top = Math.round(bar.el.getBoundingClientRect().bottom - ctx.ui.getBoundingClientRect().top + 8), key = top * 1000 + pill.offsetHeight; if (key === hudTop || !(top > 0)) return; hudTop = key;
    pill.style.top = top + 'px'; const under = [pill, medals][1]; if (under) under.style.top = (top + pill.offsetHeight + 6) + 'px';
  }
  return {
    state(g) {
      lastG = g;
      bar.set(g.sc, g.left);
      for (let i = 0; i < doors.length; i++) doors[i].st = +g.d[i];
      drops = g.dr;
      for (const [pid, s] of P) s.candy = g.sc[pid] || 0;
      if (g.rush && !rush) { rush = true; show('CANDY RUSH!', 'rush', 1800); tunes.fx('chime', 1.2); }
      if (medals && ctx.me != null) { const c = g.sc[ctx.me] || 0; medals.querySelectorAll('span').forEach((e, i) => e.classList.toggle('got', c >= init.medals[i])); }
      if (g.left <= 0 && !ended) { ended = true; tunes.stop(false); }
    },
    input(inp) {
      const a = ctx.actor(ctx.me); if (!a) return;
      if ((inp.b & IN.A) && nearLit(ctx.me)) { a.play('punch', 380); tunes.fx('knock'); }
      else if (inp.b & IN.B) a.play('punch', 300);
    },
    event(ev) {
      const d = ev.door != null ? doors[ev.door] : null;
      if (ev.e === 'knock') { if (ev.pid !== ctx.me) { tunes.fx('knock', 0.9); ctx.actor(ev.pid)?.play('punch', 380); } d.openT = 0.5; }
      else if (ev.e === 'open') {
        d.open = 1; d.openT = 0.9;
        const at = { x: d.x + d.out.x * 0.6, z: d.z + d.out.z * 0.6 }, mine = ev.pid === ctx.me;
        if (ev.kind === 'boo') {
          booT = 1.2; booAt = d; boo.visible = true; tunes.fx('boo'); ctx.sfx(mine ? 'bad' : 'tap');
          floatText(stage, at.x, 2.4, at.z, mine ? 'BOO! Spooked!' : `BOO! ${nameOf(ev.pid)}`, 'bad');
          if (mine) show('BOO!', 'boo', 900);
        } else if (ev.kind === 'slime') {
          tunes.fx('slime'); ctx.sfx('splat');
          floatText(stage, at.x, 2.4, at.z, mine ? 'SLIMED! Slow…' : `Slimed! ${nameOf(ev.pid)}`, 'bad');
          if (mine) show('SLIMED!', 'slime', 900);
        } else if (ev.kind === 'big') {
          tunes.fx('chime', 1.3); ctx.sfx(mine ? 'win' : 'coins');
          floatText(stage, at.x, 2.6, at.z, 'BIG BAR! +5', 'good big');
          if (mine) show('BIG BAR! +5', 'go', 1200);
          ctx.actor(ev.pid)?.play('cheer', 900);
        } else {
          tunes.fx('chime'); if (mine) ctx.sfx('coins');
          floatText(stage, at.x, 2.4, at.z, `+${ev.n} 🍬`, 'good');
        }
      } else if (ev.e === 'lit') { const dd = doors[ev.door]; dd.pop = 1; }
      else if (ev.e === 'bumped') {
        tunes.fx('boing', 0.8); ctx.sfx('hit');
        if (ev.by !== ctx.me) ctx.actor(ev.by)?.play('punch', 300);
        floatText(stage, ev.x, 2.2, ev.z, ev.pid === ctx.me ? 'Bumped!' : 'Bump!', 'bad');
      } else if (ev.e === 'spill') { tunes.fx('pop'); }
      else if (ev.e === 'grab') { tunes.fx('chime', 1.5); if (ev.pid === ctx.me) { ctx.sfx('pick'); floatText(stage, ev.x, 1.6, ev.z, '+1 🍬', 'good'); } }
      else if (ev.e === 'nope') { ctx.sfx('tap'); setPill('🚪', 'Find a GLOWING door first!', 'warn'); holdPill = 1.2; }
    },
    pose(pid, flags, b) {
      const s = P.get(pid); if (s) { s.flags = flags; s.speed = Math.hypot(b?.vx || 0, b?.vz || 0); }
      if (ended) { const best = Math.max(...Object.values(lastG?.sc || { 0: 0 })); return best > 0 && lastG.sc[pid] === best ? 'cheer' : 'idle'; }
      if (flags & F.STUN) return 'hit';
      if (flags & F.FROZEN) return 'idle';
      return undefined;
    },
    frame(dt, t) {
      attach(); frameCam(dt); placeHud();
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.remove('show'); }
      // doors: lit = glowing, opening = swung, dark = shut and plain
      for (const d of doors) {
        const want = d.st === 0 ? 0 : 1;
        d.lit += (want - d.lit) * Math.min(1, dt * 6);
        if (d.openT > 0) d.openT -= dt;
        const openWant = d.st === 2 || d.openT > 0 ? 1 : 0;
        d.open += (openWant - d.open) * Math.min(1, dt * 9);
        d.hinge.rotation.y = -d.open * 1.6;
        const L = d.lit;
        d.glowMat.emissiveIntensity = 0.15 + 1.8 * L; d.winMat.emissiveIntensity = 0.12 + 1.3 * L;
        d.doorMat.emissiveIntensity = 0.35 * L * (0.8 + 0.2 * Math.sin(t * 3 + d.x));
        d.jack.userData.mat.emissiveIntensity = 0.05 + 1.7 * L;
        d.pool.material.opacity = 0.6 * L * (d.st === 1 ? 0.8 + 0.2 * Math.sin(t * 4 + d.z) : 1);
        d.ring.material.opacity = 0.85 * L * (d.st === 1 ? 1 : 0.3); d.ring.scale.setScalar(1 + 0.08 * Math.sin(t * 5 + d.x));
        d.halo.material.opacity = 0.6 * L;
        if (d.pop > 0) d.pop = Math.max(0, d.pop - dt * 2.5);
        d.sweet.visible = d.st === 1 || L > 0.2;
        d.sweet.scale.setScalar(2.2 * Math.min(1, L * 1.2) * (1 + (d.pop || 0) * 0.6));
        d.sweet.position.y = 2.25 + Math.sin(t * 3 + d.x) * 0.15; d.sweet.rotation.y = t * 1.8 + d.z; d.sweet.rotation.z = Math.sin(t * 2.4 + d.x) * 0.3;
      }
      // the BOO ghost rises out of the doorway, wobbles, sinks back
      if (booT > 0 && booAt) {
        booT -= dt; const k = 1 - booT / 1.2, up = k < 0.25 ? k / 0.25 : k > 0.75 ? (1 - k) / 0.25 : 1;
        boo.position.set(booAt.x + booAt.out.x * 0.5, -0.4 + up * 0.9, booAt.z + booAt.out.z * 0.5);
        boo.rotation.y = booAt.face + Math.sin(t * 14) * 0.25; boo.scale.setScalar(0.6 + up * 0.75);
        if (booT <= 0) boo.visible = false;
      }
      // buckets fill, slime follows the slowed
      for (const [pid, s] of P) {
        s.heap.scale.setScalar(s.candy > 0 ? Math.min(1.25, 0.45 + s.candy * 0.04) : 0.01);
        const a = ctx.actor(pid), at = ctx.pos(pid), slow = s.flags & F.SLOW;
        s.puddle.visible = !!slow && !!at; s.goo.visible = !!slow;
        if (slow && at) { s.puddle.position.x = at.x; s.puddle.position.z = at.z; s.puddle.scale.setScalar(1 + Math.sin(t * 5) * 0.06); s.goo.scale.set(1 + Math.sin(t * 7) * 0.08, 1, 1 + Math.cos(t * 7) * 0.08); }
        if (a && s.bucket.parent) s.bucket.rotation.z = Math.sin(t * 8 + pid) * 0.15 * Math.min(1, s.speed / 3);
      }
      // spilled candy
      dropMesh.count = Math.min(DROPS, drops.length);
      for (let i = 0; i < dropMesh.count; i++) { const [id, x, z] = drops[i]; m4.compose(v.set(x, 0.14 + Math.abs(Math.sin(t * 4 + id)) * 0.1, z), q.setFromEuler(e3.set(0, t * 2 + id, 0.3)), sc.setScalar(1.3)); dropMesh.setMatrixAt(i, m4); dropMesh.setColorAt(i, col.set(CANDY_COLS[id % CANDY_COLS.length])); }
      dropMesh.instanceMatrix.needsUpdate = true; if (dropMesh.instanceColor) dropMesh.instanceColor.needsUpdate = true;
      moonGlow.material.opacity = 0.45 + Math.sin(t * 0.8) * 0.05;
      // the hint pill: what should I do right now?
      if (holdPill > 0) holdPill -= dt;
      else if (ctx.me == null) setPill('🎃', rush ? 'Candy Rush! Every door is lighting up!' : 'Trick or treat!', rush ? 'rush' : '');
      else if (ended) setPill('🍬', 'Time! Counting candy…');
      else {
        const fl = lastFlags(ctx.me);
        if (fl & F.STUN) setPill('👻', 'Spooked! Hold on…', 'warn');
        else if (fl & F.FROZEN) setPill('🚪', 'Knock knock…');
        else if (nearLit(ctx.me)) setPill('🅰️', ctx.btn('Press A to KNOCK!'), 'go');
        else if (fl & F.SLOW) setPill('🟢', 'Slimed — slow for a bit', 'slime');
        else setPill('🎃', rush ? 'CANDY RUSH! Go go go!' : 'Walk to a GLOWING door', rush ? 'rush' : '');
      }
    },
    dispose() {
      tunes.dispose(); kit.dispose();
      bar.el.remove(); pill.remove(); banner.remove(); medals?.remove();
      for (const s of P.values()) { s.bucket.removeFromParent(); s.goo.removeFromParent(); }
      for (const x of texs) x.dispose(); for (const m of mats) m.dispose(); for (const g2 of geos) g2.dispose();
    },
  };
  function lastFlags(pid) { return P.get(pid)?.flags ?? 0; }
}
