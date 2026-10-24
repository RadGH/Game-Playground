// FLOOR IS LAVA, as drawn: a toy-room floor of warm wooden boards with a round rug, low skirting walls, and the
// things to stand on — squashy cushions (with a button on top), wooden footstools on three legs, striped toy boxes
// and flat grey rocks. When a wave is coming the boards glow red and pulse; then a sheet of bubbling orange lava
// (a scrolling canvas texture, never a light switched on) covers the floor with bubbles popping. A worn-out thing goes
// darker and shivers, then sinks; a fresh one rises out of the floor. A pill under the score bar counts to the next
// change ("LAVA in 2", "Cools in 4"). Halloween: green slime instead of lava, pumpkins for cushions, toadstools for
// stools, candy boxes and mossy rocks.
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { createJuice } from '../../client/juice.js';
import { canvasTexture } from '../../client/stage.js';
import { pumpkinGeo } from '../../client/halloween.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';
import { KINDS } from './sim.js';

export function createView(ctx) {
  const { THREE, group, stage, init, arena } = ctx, HW = ctx.season === 'halloween', W = arena.hw, D = arena.hd;
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
  // ---- the room: boards, rug, skirting
  const boards = canvasTexture(512, 512, (c, w) => {
    c.fillStyle = HW ? '#4a3a52' : '#c98f55'; c.fillRect(0, 0, w, w);
    for (let i = 0; i < 16; i++) { c.fillStyle = (HW ? ['#55435e', '#3f3148'] : ['#d39a5f', '#bd8449'])[i % 2]; c.fillRect(0, i * 32 + 1, w, 30); c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(((i * 197) % 400) + 40, i * 32, 3, 32); }
  });
  boards.wrapS = boards.wrapT = THREE.RepeatWrapping; boards.repeat.set(3, 2.3);
  const floorMat = std('#ffffff', { map: boards, emissive: '#ff3a10', emissiveIntensity: 0 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, D * 2).rotateX(-Math.PI / 2), floorMat); floor.receiveShadow = true; group.add(floor);
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 + 30, D * 2 + 30).rotateX(-Math.PI / 2), std(HW ? '#2a2036' : '#8c6a4a')); outside.position.y = -0.02; group.add(outside);
  const rug = new THREE.Mesh(new THREE.CircleGeometry(3.4, 40).rotateX(-Math.PI / 2), std(HW ? '#5a2a7a' : '#4f8fd6', { emissive: '#ff3a10', emissiveIntensity: 0 })); rug.position.y = 0.01; group.add(rug);
  for (const [w, d, x, z] of [[W * 2 + 0.6, 0.3, 0, -D - 0.15], [W * 2 + 0.6, 0.3, 0, D + 0.15], [0.3, D * 2, -W - 0.15, 0], [0.3, D * 2, W + 0.15, 0]]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 0.55, d), std(HW ? '#6a4a8a' : '#f4ecd8')); wall.position.set(x, 0.27, z); wall.castShadow = true; group.add(wall);
  }
  // ---- lava: a sheet over the floor, see-through when cool
  const lavaTex = canvasTexture(256, 256, (c, w) => {
    c.fillStyle = HW ? '#4fdc6a' : '#ff7a1a'; c.fillRect(0, 0, w, w);
    let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 26; i++) { c.fillStyle = HW ? (i % 2 ? 'rgba(200,255,120,.55)' : 'rgba(60,10,90,.35)') : (i % 2 ? 'rgba(255,240,140,.6)' : 'rgba(160,20,0,.35)'); const x = r() * w, y = r() * w, a = 10 + r() * 26, b = 6 + r() * 14, rot = r() * 3; for (const ox of [-w, 0, w]) for (const oy of [-w, 0, w]) { c.beginPath(); c.ellipse(x + ox, y + oy, a, b, rot, 0, Math.PI * 2); c.fill(); } }
  });
  lavaTex.wrapS = lavaTex.wrapT = THREE.RepeatWrapping; lavaTex.repeat.set(3, 2.3);
  const lavaMat = new THREE.MeshBasicMaterial({ map: lavaTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, D * 2).rotateX(-Math.PI / 2), lavaMat); lava.position.y = 0.03; lava.renderOrder = 1; group.add(lava);
  const BUB = 26, bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: HW ? '#c8ff8a' : '#ffe08a', toneMapped: false }), BUB);
  const bub = Array.from({ length: BUB }, (_, i) => ({ x: ((i * 7.3) % (W * 2)) - W, z: ((i * 4.1) % (D * 2)) - D, t: (i * 0.37) % 1 }));
  group.add(bubbles);
  const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  // ---- things to stand on
  const COLS = HW ? { cushion: ['#ff7a14', '#ff9a3a'], stool: ['#e04a6a', '#b04ad0'], box: ['#7a3cc8', '#ff8a1a'], rock: ['#5f7a5a', '#6a8a64'] }
    : { cushion: ['#ff7aa8', '#5fd0c8', '#ffcf3f', '#9a7aff'], stool: ['#a8743f', '#8f5f30'], box: ['#3d8bff', '#e8394a', '#3ecf6a'], rock: ['#9aa4ad', '#8a949c'] };
  function buildThing(kind, id) {
    const k = KINDS[kind], g = new THREE.Group(), cols = COLS[k.id], col = cols[id % cols.length], mats = [];
    const m = (c, o) => { const mt = std(c, o); mats.push([mt, new THREE.Color(c)]); return mt; };
    if (k.id === 'cushion') {
      if (HW) { const p = new THREE.Mesh(pumpkinGeo(THREE, k.r), m(col)); p.scale.set(1, k.h / k.r * 1.1, 1); p.position.y = k.h * 0.5; g.add(p); }
      else { const c = new THREE.Mesh(new THREE.CylinderGeometry(k.r, k.r * 0.96, k.h, 24), m(col, { roughness: 1 })); c.position.y = k.h / 2; g.add(c); const top = new THREE.Mesh(new THREE.SphereGeometry(k.r, 24, 8, 0, Math.PI * 2, 0, 0.5), m(col, { roughness: 1 })); top.scale.y = 0.25; top.position.y = k.h - 0.04; g.add(top); const btn = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), m('#ffffff')); btn.position.y = k.h + 0.06; g.add(btn); }
    } else if (k.id === 'stool') {
      if (HW) { const cap = new THREE.Mesh(new THREE.SphereGeometry(k.r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), m(col)); cap.scale.y = 0.45; cap.position.y = k.h - 0.12; g.add(cap); const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, k.h - 0.1, 10), m('#f4ecd8')); stem.position.y = (k.h - 0.1) / 2; g.add(stem); }
      else { const top = new THREE.Mesh(new THREE.CylinderGeometry(k.r, k.r, 0.14, 20), m(col)); top.position.y = k.h - 0.07; g.add(top); for (let i = 0; i < 3; i++) { const a = i * 2.094, leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, k.h - 0.1, 6), m('#6a4426')); leg.position.set(Math.sin(a) * k.r * 0.6, (k.h - 0.1) / 2, Math.cos(a) * k.r * 0.6); g.add(leg); } }
    } else if (k.id === 'box') {
      const b = new THREE.Mesh(new THREE.BoxGeometry(k.hw * 2, k.h, k.hd * 2), m(col)); b.position.y = k.h / 2; g.add(b);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(k.hw * 2 + 0.02, 0.12, k.hd * 2 + 0.02), m(HW ? '#2a1d4a' : '#ffffff')); stripe.position.y = k.h * 0.62; g.add(stripe);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(k.hw * 2 + 0.06, 0.08, k.hd * 2 + 0.06), m(HW ? '#ffd23f' : '#ffd23f')); lid.position.y = k.h - 0.02; g.add(lid);
    } else {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(k.r, 0), m(col, { flatShading: true })); r.scale.set(1, k.h / k.r, 1); r.position.y = k.h * 0.02; g.add(r);
      if (HW) { const moss = new THREE.Mesh(new THREE.CircleGeometry(k.r * 0.6, 10).rotateX(-Math.PI / 2), m('#3a8a3a')); moss.position.y = k.h * 0.98; g.add(moss); }
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    group.add(g);
    return { g, mats, k, wear: 9, y: 0, x: 0, z: 0 };
  }
  const things = new Map();
  const dark = new THREE.Color(HW ? '#1a2a1a' : '#4a1a0a');
  // ---- HUD
  const bar = scoreBar(ctx, { unit: 's' });
  const pill = h('div', 'fl-pill'); ctx.ui.append(pill);
  const banner = h('div', 'fl-banner'); ctx.ui.append(banner); let bannerT = 0;
  const show = (text, cls = '', s = 1.6) => { banner.textContent = text; banner.className = 'fl-banner show ' + cls; bannerT = s; };
  const juice = createJuice(ctx);
  const LAVA = HW ? 'SLIME' : 'LAVA';
  const nameOf = pid => (pid === ctx.me ? 'You' : ctx.players.find(p => p.pid === pid)?.name || '?');
  let lv = 'calm', heat = 0, warnPulse = 0, prevB = 0, prevS = -9, stays = false;
  return {
    halloween: { y: 0, mist: false, spots: [[-W - 1.4, 0, -D + 1], [W + 1.4, 0, -D + 1], [-W - 1.4, 0, D - 1], [W + 1.4, 0, D - 1], [0, 0, -D - 1.5]] },
    start() { show(init.solo ? 'Stay off the floor when it glows!' : 'When it glows… get UP!', '', 2); },
    state(g) {
      bar.set(g.sc, g.left);
      for (const p of ctx.players) bar.mark(p.pid, 'out', g.o.includes(p.pid));
      lv = g.lv;
      const word = g.lv === 'warn' ? `🔥 ${LAVA} in ${g.nx}!` : g.lv === 'lava' ? (g.nx < 0 ? `🔥 The ${LAVA.toLowerCase()} stays!` : `🔥 ${LAVA}! Cools in ${g.nx}`) : g.lv === 'cool' ? `Floor is safe · ${LAVA.toLowerCase()} in ${g.nx + 2}` : 'Floor is safe… for now';
      if (pill.textContent !== word) pill.textContent = word;
      pill.className = 'fl-pill ' + g.lv;
      const seen = new Set();
      for (const [id, kind, x, z, wear, y] of g.pl) {
        seen.add(id); let T = things.get(id);
        if (!T) { T = buildThing(kind, id); T.x = x; T.z = z; T.g.position.set(x, y, z); things.set(id, T); }
        T.y = y; T.wear = wear;
        const k = Math.max(0, Math.min(1, (9 - wear) / 9)) * 0.75;
        for (const [mt, c0] of T.mats) mt.color.copy(c0).lerp(dark, k);
      }
      for (const [id, T] of things) if (!seen.has(id)) { T.g.removeFromParent(); for (const [mt] of T.mats) mt.dispose(); things.delete(id); }
    },
    input(inp) {
      const fresh = !(prevB & IN.A) || inp.s !== prevS + 1; prevB = inp.b; prevS = inp.s;
      if ((inp.b & IN.A) && fresh) ctx.actor(ctx.me)?.play('jump', 420);
    },
    event(ev) {
      if (ev.e === 'phase') {
        if (ev.p === 'warn') { show(`The floor is glowing… GET UP!`, 'warn', 1.4); ctx.sfx('trap'); }
        else if (ev.p === 'lava') { stays = ev.stays; show(ev.stays ? `The ${LAVA.toLowerCase()} is here to stay!` : `The floor is ${LAVA}!`, 'hot', 1.5); ctx.sfx('splat'); juice.shake(0.12, 0.35); }
        else if (ev.p === 'cool') { show('Phew! It cooled down', 'good', 1.3); ctx.sfx('good'); }
      } else if (ev.e === 'jump') { if (ev.pid !== ctx.me) ctx.actor(ev.pid)?.play('jump', 420); }
      else if (ev.e === 'long') { if (ev.pid === ctx.me) ctx.sfx('throw'); }
      else if (ev.e === 'shove') { ctx.actor(ev.pid)?.play('throw', 300); if (ev.hit.length) ctx.sfx('hit'); if (ev.hit.includes(ctx.me)) juice.flash('#ffd23f', 180); }
      else if (ev.e === 'burn') {
        ctx.sfx('out'); floatText(stage, ev.x, 1.4, ev.z, ev.pid === ctx.me ? 'Hot-foot! You are out' : `${nameOf(ev.pid)}: hot-foot!`, ev.pid === ctx.me ? 'bad' : '');
        if (ev.pid === ctx.me) { juice.flash(HW ? '#7dff5a' : '#ff5a10', 420); show('Hot-foot!', 'hot', 1.4); }
      } else if (ev.e === 'sink') { ctx.sfx('tap'); }
      else if (ev.e === 'end') {
        if (ev.win != null) { show(ev.win === ctx.me ? 'Last one standing — YOU!' : `${nameOf(ev.win)} is the last one up!`, ev.win === ctx.me ? 'good' : '', 2.6); ctx.sfx(ev.win === ctx.me ? 'win' : 'good'); }
        else if (ev.all) show('Time! Everyone still up wins', 'good', 2.4);
      }
    },
    pose(pid, flags, b) { if (flags & F.OUT || b.y < -0.05) return 'hit'; if (flags & F.AIR) return 'jump'; if (flags & F.STUN) return 'hit'; return undefined; },
    frame(dt, t) {
      // the floor heats up: a red pulse during the warning, then the lava sheet fades in
      const want = lv === 'lava' ? 1 : 0; heat += (want - heat) * Math.min(1, dt * 5);
      warnPulse = lv === 'warn' ? 0.5 + 0.5 * Math.sin(t * 12) : warnPulse * Math.max(0, 1 - dt * 6);
      lavaMat.opacity = heat * 0.97;
      floorMat.emissiveIntensity = lv === 'warn' ? 0.15 + warnPulse * 0.45 : heat * 0.3; rug.material.emissiveIntensity = floorMat.emissiveIntensity;
      floorMat.emissive.set(HW ? '#3cff6a' : '#ff3a10'); rug.material.emissive.copy(floorMat.emissive);
      lavaTex.offset.set(t * 0.03, t * 0.017);
      for (let i = 0; i < BUB; i++) {
        const B = bub[i]; B.t += dt * (0.7 + (i % 3) * 0.2);
        if (B.t >= 1) { B.t = 0; B.x = (((i * 7.3 + t * 13.1) % (W * 2)) + W * 2) % (W * 2) - W; B.z = (((i * 4.1 + t * 9.7) % (D * 2)) + D * 2) % (D * 2) - D; }
        if (heat < 0.3) { bubbles.setMatrixAt(i, zero); continue; }
        const s = Math.sin(B.t * Math.PI) * heat; m4.compose(v.set(B.x, 0.03 + B.t * 0.12, B.z), q.identity(), sc.set(s, s * 0.6, s)); bubbles.setMatrixAt(i, m4);
      }
      bubbles.instanceMatrix.needsUpdate = true;
      for (const T of things.values()) {
        const shiver = T.wear <= 3 && T.y > -0.01 ? 0.04 * (4 - T.wear) / 3 : 0;
        T.g.position.set(T.x + Math.sin(t * 41 + T.x) * shiver, T.g.position.y + (T.y - T.g.position.y) * Math.min(1, dt * 12), T.z + Math.cos(t * 37 + T.z) * shiver);
      }
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.className = 'fl-banner'; }
      juice.frame(dt, t);
    },
    dispose() { bar.el.remove(); pill.remove(); banner.remove(); juice.dispose(); boards.dispose(); lavaTex.dispose(); for (const T of things.values()) for (const [mt] of T.mats) mt.dispose(); },
  };
}
