// CANDY FLOSS FRENZY, as drawn: a round candy-striped stall floor fenced with little red-and-white posts, a big
// silver floss machine in the middle with a spinning pink cloud, and a striped tub at the edge for each player (in
// their seat colour, with their seat shape on a flag and BANK written on it). Floss puffs are soft pink clusters
// (golden ones sparkle) drifting about. Every player carries a stick with their own cloud of floss on top, which
// visibly swells as they grab more — the big ones wobble.
import { RULES } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { createTunes } from '../../client/tunes.js';
import { createJuice } from '../../client/juice.js';
import { F } from '../../shared/arena.js';

const SHAPE_CH = { circle: '●', square: '■', triangle: '▲', diamond: '◆' };
const MAXP = 48;
export function createView(ctx) {
  const { THREE, group, stage, arena: AR, init } = ctx, HW = ctx.season === 'halloween', WN = ctx.season === 'winter';
  const mats = [], geos = [], texs = [];
  const std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra }); mats.push(m); return m; };
  const geo = g => { geos.push(g); return g; };
  const tex = t => { texs.push(t); return t; };
  const mesh = (g, m, x = 0, y = 0, z = 0, parent = group) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
  const tunes = createTunes({ volume: 0.2 }), juice = createJuice(ctx);
  const FLOSS = HW ? '#b48cff' : WN ? '#bfe3ff' : '#ff9fd0';

  // ---- floor, fence, the machine
  mesh(geo(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2)), std(WN ? '#eef5fc' : '#7cc46a', { roughness: 1 }), 0, -0.02, 0).castShadow = false;
  const floorTex = tex(canvasTexture(256, 256, (c, w) => { c.fillStyle = '#fff3f8'; c.fillRect(0, 0, w, w); c.fillStyle = '#ffd3e6'; for (let i = 0; i < 16; i++) { c.beginPath(); c.moveTo(w / 2, w / 2); c.arc(w / 2, w / 2, w, i / 16 * Math.PI * 2, (i + 0.5) / 16 * Math.PI * 2); c.fill(); } }));
  mesh(geo(new THREE.CircleGeometry(AR.r + 0.3, 48).rotateX(-Math.PI / 2)), std('#ffffff', { map: floorTex, roughness: 0.8 }), 0, 0.005, 0).castShadow = false;
  const POSTS = 40, posts = new THREE.InstancedMesh(geo(new THREE.CylinderGeometry(0.09, 0.09, 0.8, 6)), std('#ffffff'), POSTS);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), col = new THREE.Color();
  for (let i = 0; i < POSTS; i++) { const a = i / POSTS * Math.PI * 2; m4.compose(v3.set(Math.sin(a) * (AR.r + 0.35), 0.4, Math.cos(a) * (AR.r + 0.35)), q.identity(), s3.setScalar(1)); posts.setMatrixAt(i, m4); posts.setColorAt(i, col.set(i % 2 ? '#e8394a' : '#ffffff')); }
  group.add(posts);
  mesh(geo(new THREE.TorusGeometry(AR.r + 0.35, 0.05, 6, 64).rotateX(Math.PI / 2)), std('#e8394a'), 0, 0.78, 0);
  const steel = std('#d9dde3', { metalness: 0.7, roughness: 0.25 });
  mesh(geo(new THREE.CylinderGeometry(0.5, 0.7, 0.9, 18)), std('#3d8bff'), 0, 0.45, 0);
  mesh(geo(new THREE.CylinderGeometry(0.95, 0.6, 0.45, 24, 1, true)), std('#d9dde3', { metalness: 0.7, roughness: 0.25, side: THREE.DoubleSide }), 0, 1.12, 0);
  mesh(geo(new THREE.TorusGeometry(0.95, 0.05, 6, 30).rotateX(Math.PI / 2)), steel, 0, 1.34, 0);
  const flossMat = std(FLOSS, { roughness: 1, emissive: FLOSS, emissiveIntensity: 0.12 }), goldMat = std('#ffd23f', { roughness: 0.6, emissive: '#7a5a00', emissiveIntensity: 0.5 });
  const blob = geo(new THREE.IcosahedronGeometry(0.5, 1));
  const spin = new THREE.Group(); spin.position.set(0, 1.25, 0); group.add(spin);
  for (const [x, y, z, s] of [[0, 0.1, 0, 1.3], [0.45, 0.05, 0.2, 0.8], [-0.4, 0.08, -0.25, 0.85], [0.1, 0.35, -0.3, 0.7]]) mesh(blob, flossMat, x, y, z, spin).scale.setScalar(s * 0.8);
  // ---- tubs
  const tubLabel = tex(canvasTexture(128, 48, (c, w, hh) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, hh); c.fillStyle = '#1d1f24'; c.font = '900 34px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('BANK', w / 2, hh / 2 + 2); }));
  const tubs = new Map();
  for (const t of init.tubs || []) {
    const p = ctx.players.find(q2 => q2.pid === t.pid); if (!p) continue;
    const g = new THREE.Group(); g.position.set(t.x, 0, t.z); g.rotation.y = Math.atan2(-t.x, -t.z); group.add(g);
    mesh(geo(new THREE.CylinderGeometry(0.75, 0.6, 0.8, 18)), std(p.color), 0, 0.4, 0, g);
    mesh(geo(new THREE.TorusGeometry(0.75, 0.07, 6, 22).rotateX(Math.PI / 2)), std('#ffffff'), 0, 0.8, 0, g);
    const lab = new THREE.Mesh(geo(new THREE.PlaneGeometry(0.8, 0.3)), std('#ffffff', { map: tubLabel })); lab.position.set(0, 0.42, 0.69); g.add(lab);
    const fill = mesh(blob, flossMat, 0, 0.7, 0, g); fill.scale.set(1.2, 0.1, 1.2);
    const flagTex = tex(canvasTexture(64, 48, (c, w, hh) => { c.fillStyle = p.color; c.fillRect(0, 0, w, hh); c.fillStyle = '#fff'; c.font = '900 34px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(SHAPE_CH[p.shape] || '★', w / 2, hh / 2 + 2); }));
    mesh(geo(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5)), steel, 0.6, 1.2, 0, g);
    const flag = new THREE.Mesh(geo(new THREE.PlaneGeometry(0.5, 0.36)), std('#ffffff', { map: flagTex, side: THREE.DoubleSide })); flag.position.set(0.86, 1.8, 0); g.add(flag);
    tubs.set(t.pid, { g, fill, flag, n: 0 });
  }
  // ---- puffs (instanced: plain and gold)
  const puffGeo = geo(new THREE.IcosahedronGeometry(0.32, 1));
  const plain = new THREE.InstancedMesh(puffGeo, flossMat, MAXP), golds = new THREE.InstancedMesh(puffGeo, goldMat, MAXP);
  plain.count = 0; golds.count = 0; group.add(plain, golds);
  const puffs = new Map();        // id -> { x, z, v, tx, tz, born }
  // ---- each player's stick and cloud
  const clouds = new Map();
  for (const p of ctx.players) {
    const a = ctx.actor(p.pid); if (!a) continue;
    const g = new THREE.Group(); g.position.set(0.42, 0, 0.15); a.group.add(g);
    const stick = mesh(geo(new THREE.CylinderGeometry(0.03, 0.03, 1, 5)), std('#f4e1b5'), 0, 1.3, 0, g);
    const cl = new THREE.Group(); cl.position.y = 1.85; g.add(cl);
    for (const [x, y, z, s] of [[0, 0, 0, 1], [0.3, 0.05, 0.1, 0.7], [-0.28, 0.08, -0.08, 0.72], [0.05, 0.28, 0, 0.66], [0, -0.05, 0.3, 0.6]]) mesh(blob, flossMat, x, y, z, cl).scale.setScalar(s * 0.5);
    clouds.set(p.pid, { g, stick, cl, n: 0, size: 0.4, hit: 0 });
  }

  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'floss' }), pill = h('div', 'cf-pill'), banner = h('div', 'cf-banner');
  pill.innerHTML = `<span><b>A</b> Bonk</span><span>Bank at your tub</span><span class="cf-mine">Cloud <b>0</b></span>`;
  if (ctx.me == null) pill.querySelector('.cf-mine').remove();
  ctx.ui.append(pill, banner);
  const mine = pill.querySelector('.cf-mine b');
  let bannerT = 0, started = false;
  const show = (text, cls = '', ms = 1000) => { banner.textContent = text; banner.className = 'cf-banner show ' + cls; bannerT = ms / 1000; };
  const nameOf = id => id === ctx.me ? 'You' : ctx.players.find(p => p.pid === id)?.name || '?';

  return {
    state(g) {
      bar.set(g.sc, g.left); pill.classList.toggle('rush', !!g.rush);
      for (const [pid, n] of Object.entries(g.fl || {})) { const C = clouds.get(+pid); if (C) C.n = n; }
      if (mine && g.fl) { const n = g.fl[ctx.me] || 0; mine.textContent = n; mine.parentElement.classList.toggle('big', n >= RULES.heavyAt); }
      for (const pid of Object.keys(g.sc || {})) { const T = tubs.get(+pid); if (T) T.n = g.sc[pid] - (g.fl?.[pid] || 0); }
      const seen = new Set();
      for (const [id, x, z, v] of g.pf || []) { seen.add(id); const P = puffs.get(id); if (P) { P.tx = x; P.tz = z; } else puffs.set(id, { x, z, tx: x, tz: z, v, born: 0 }); }
      for (const id of puffs.keys()) if (!seen.has(id)) puffs.delete(id);
      if (!g.cd && !started && g.left > 0) { started = true; tunes.start('boogie'); }
      if (g.left <= 0 && tunes.playing) tunes.stop(false);
    },
    event(ev) {
      if (ev.e === 'count') { show(String(ev.n), 'count', 900); ctx.sfx('tap'); }
      else if (ev.e === 'go') { show('GRAB IT!', 'go', 900); ctx.sfx('good'); }
      else if (ev.e === 'rush') { show('SUGAR RUSH!', 'go small', 1500); ctx.sfx('trap'); }
      else if (ev.e === 'grab') { if (ev.pid === ctx.me) { ctx.sfx(ev.v > 1 ? 'coins' : 'pick'); if (ev.v > 1) floatText(stage, ev.x, 1.5, ev.z, `+${ev.v}`, 'good'); } }
      else if (ev.e === 'bank') {
        ctx.sfx('coins'); floatText(stage, ev.x, 1.8, ev.z, `+${ev.v} banked`, ev.pid === ctx.me ? 'good' : '');
        if (ev.pid === ctx.me && ev.v >= 8) show('BIG BANK!', 'go small', 900);
      } else if (ev.e === 'bonk') {
        ctx.sfx('hit'); tunes.fx('pop', 1.1); floatText(stage, ev.x, 2.2, ev.z, `BONK! -${ev.lost}`, ev.hit === ctx.me ? 'bad' : '');
        const C = clouds.get(ev.hit); if (C) C.hit = 1;
        if (ev.hit === ctx.me) { juice.flash('rgba(255,95,158,.7)', 220); navigator.vibrate?.(50); }
        if (ev.pid === ctx.me && ev.lost) show('BONK!', 'go small', 700);
      } else if (ev.e === 'swish') { if (ev.pid === ctx.me) ctx.sfx('throw'); }
      else if (ev.e === 'end') { show('Time!', 'small', 1500); ctx.sfx('win'); tunes.stop(false); }
    },
    pose(pid, flags) { return flags & F.STUN ? 'hit' : null; },
    frame(dt, t) {
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.remove('show'); }
      spin.rotation.y = t * 3;
      let ip = 0, ig = 0; const k = 1 - Math.exp(-dt * 12);
      for (const P of puffs.values()) {
        P.x += (P.tx - P.x) * k; P.z += (P.tz - P.z) * k; P.born = Math.min(1, P.born + dt * 4);
        const s = P.born * (0.8 + Math.sqrt(P.v) * 0.35), y = 0.7 + Math.sin(t * 2.5 + P.x * 2) * 0.12;
        m4.compose(v3.set(P.x, y, P.z), q.identity(), s3.set(s, s * 0.85, s));
        if (P.v >= RULES.goldValue && ig < MAXP) golds.setMatrixAt(ig++, m4); else if (ip < MAXP) plain.setMatrixAt(ip++, m4);
      }
      plain.count = ip; golds.count = ig; plain.instanceMatrix.needsUpdate = true; golds.instanceMatrix.needsUpdate = true;
      for (const C of clouds.values()) {
        const want = 0.35 + Math.sqrt(C.n) * 0.42; C.size += (want - C.size) * (1 - Math.exp(-dt * 8)); C.hit = Math.max(0, C.hit - dt * 2);
        const wob = C.n >= RULES.heavyAt ? Math.sin(t * 6) * 0.08 : 0;
        C.cl.scale.setScalar(C.size); C.cl.position.y = 1.65 + C.size * 0.45; C.stick.scale.y = 1 + C.size * 0.3; C.stick.position.y = 1.15 + C.size * 0.15;
        C.cl.rotation.z = wob + Math.sin(t * 30) * 0.2 * C.hit; C.cl.visible = C.n > 0 || C.size > 0.4;
      }
      for (const T of tubs.values()) { const want = Math.min(1.15, 0.1 + Math.sqrt(T.n) * 0.18); T.fill.scale.y += (want - T.fill.scale.y) * k; T.flag.rotation.y = Math.sin(t * 5 + T.g.position.x) * 0.3; }
      juice.frame(dt, t);
    },
    dispose() {
      tunes.dispose(); juice.dispose(); bar.el.remove(); pill.remove(); banner.remove();
      for (const C of clouds.values()) C.g.removeFromParent();
      for (const t2 of texs) t2.dispose(); for (const m of mats) m.dispose(); for (const g2 of geos) g2.dispose();
    },
  };
}
