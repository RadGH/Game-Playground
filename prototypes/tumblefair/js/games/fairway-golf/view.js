// FAIRWAY GOLF, as drawn. The hole is built from the very layout the server measures lies on (init.layout): a dark
// out-of-bounds field, the woods (instanced round trees and pines), the rough, the fairway in mown cross-stripes, the
// tee box with its markers, ponds and creeks with a darker edge, bunkers with a lip, the fringe and the green (fine
// mowing lines and chevrons pointing downhill), yardage plates at 100 / 150 / 200 to the green, white stakes along out
// of bounds, the flag. Ground layers are flat, drawn in priority order without depth writes, so the ground cannot
// z-fight however far away the camera is and the drawing stacks exactly like lieAt().
//
// Every player has a ball (yours solid, the others' a little see-through: ghosts) and a character standing at it.
// A shot is replayed from the server's own numbers: the flight from flightPos(F, k), the roll from its 0.1 s points.
// Camera (a phone that plays): the whole hole at the start, then from behind your ball looking where you aim, chasing
// your ball in flight, over the green when you putt, and the whole hole again once you are in. A screen that only
// watches (a TV) always sees the whole hole and a list of where everyone stands.
// Your panel (bottom): club ◀ ▶ (the best one is picked for you), distance + lie, wind, aim ◀ ▶ (or drag the view),
// the POWER bar (a tick marks the power for the distance) and the ACCURACY needle, SWING, and Card (the scorecard).
import { flightPos, CLUB, clubsFor, suggestClub, targetFor, solveShot, reachOf, puttSpeed, ST, LEVELS } from './sim.js';
import { hydrate, LIES, LIE_NAME, bounds, FRINGE, TEE_BOX, pointAt } from './course.js';
import { pingPong, needle } from '../long-drive/sim.js';
import { rollDistance } from '../golf-kit.js';
import { scoreName } from '../golf-putt.js';
import { scoreBar, floatText, h, esc } from '../../client/gamehud.js';
import { createJuice } from '../../client/juice.js';
import { makeRng } from '../../shared/rng.js';

const S = 0.15;                                   // scene units per yard (a 590-yard hole must fit the stage's 400-unit camera under a phone's panel)
const DEG = Math.PI / 180;
const yd2ft = y => Math.max(1, Math.round(y * 3));
export function createView(ctx) {
  const { THREE, group, stage, players, me, init, ui } = ctx;
  const L = init.level || LEVELS.normal, H = hydrate(init.layout), playing = me != null;
  const mats = [], texs = [], geos = [];
  const lam = (color, extra = {}) => { const m = new THREE.MeshLambertMaterial({ color, ...extra }); mats.push(m); return m; };
  const std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra }); mats.push(m); return m; };
  const basic = (color, extra = {}) => { const m = new THREE.MeshBasicMaterial({ color, ...extra }); mats.push(m); return m; };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc3 = new THREE.Vector3(), col = new THREE.Color();
  const W = (x, y, hh = 0) => v3.set(x * S, hh * S, -y * S);
  const juice = createJuice(ctx);

  // ---------------------------------------------------------------- sky
  const scene = stage.scene, bg0 = scene.background, fog0 = scene.fog;
  scene.background = new THREE.Color('#a9d8f2'); scene.fog = new THREE.Fog('#c4e6f7', 320, 560);

  // ---------------------------------------------------------------- textures
  const canvasTex = (w, hh, draw, repeat = true) => { const c = document.createElement('canvas'); c.width = w; c.height = hh; draw(c.getContext('2d'), w, hh); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; texs.push(t); return t; };
  const nrng = makeRng(H.n * 131 + 7);
  const noise = canvasTex(128, 128, (g, w, hh) => { const im = g.createImageData(w, hh); for (let i = 0; i < w * hh; i++) { const v = 222 + Math.floor(nrng() * 34); im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; } g.putImageData(im, 0, 0); });
  const greenTex = canvasTex(64, 64, (g, w) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, w); g.fillStyle = '#e4efe0'; for (let i = -w; i < w * 2; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 8, 0); g.lineTo(i + 8 - w, w); g.lineTo(i - w, w); g.fill(); } });
  const sandTex = canvasTex(64, 64, (g, w) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, w); for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(150,120,70,${0.08 + nrng() * 0.12})`; g.fillRect(nrng() * w, nrng() * w, 1.5, 1.5); } });
  const chevTex = canvasTex(64, 64, (g) => { g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(16, 22); g.lineTo(32, 40); g.lineTo(48, 22); g.stroke(); });

  // ---------------------------------------------------------------- flat ground pieces (hole coords -> scene)
  /** tris: [x, y, x, y, …] in yards, three points a triangle; cols: optional [r, g, b] per point. */
  function flat(tris, mat, order, cols = null, uvScale = 5) {
    const n = tris.length / 2, pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), nor = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const x = tris[i * 2], y = tris[i * 2 + 1]; pos[i * 3] = x * S; pos[i * 3 + 1] = 0; pos[i * 3 + 2] = -y * S; uv[i * 2] = x / uvScale; uv[i * 2 + 1] = y / uvScale; nor[i * 3 + 1] = 1; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (cols) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3));
    geos.push(g);
    const mesh = new THREE.Mesh(g, mat); mesh.renderOrder = order - 20; mesh.receiveShadow = true; group.add(mesh); return mesh;
  }
  const groundMat = (color, map = noise, extra = {}) => { const m = lam(color, { map, side: THREE.DoubleSide, depthWrite: false, ...extra }); return m; };
  function ellipseTris(e, grow = 0, segs = 44) {
    const out = [], c = Math.cos(e[4] || 0), s = Math.sin(e[4] || 0), rx = e[2] + grow, ry = e[3] + grow;
    const pt = a => { const u = Math.cos(a) * rx, w = Math.sin(a) * ry; return [e[0] + u * c - w * s, e[1] + u * s + w * c]; };
    for (let i = 0; i < segs; i++) { const a = pt(i / segs * Math.PI * 2), b = pt((i + 1) / segs * Math.PI * 2); out.push(e[0], e[1], a[0], a[1], b[0], b[1]); }
    return out;
  }
  const discTris = (x, y, r, segs = 20) => ellipseTris([x, y, r, r, 0], 0, segs);
  /** A strip down the centre line from s0 to s1, half width w, with round ends; colorAt(s) gives a band colour. */
  function ribbon(s0, s1, w, colorAt = null) {
    const tris = [], cols = colorAt ? [] : null, step = 3;
    let prev = null;
    for (let s = s0; ; s += step) {
      const ss = Math.min(s, s1), p = pointAt(H, ss), nx = p.ny, ny = -p.nx;
      const Lp = [p.x - nx * w, p.y - ny * w], Rp = [p.x + nx * w, p.y + ny * w];
      if (prev) { tris.push(prev.L[0], prev.L[1], prev.R[0], prev.R[1], Rp[0], Rp[1], prev.L[0], prev.L[1], Rp[0], Rp[1], Lp[0], Lp[1]); if (cols) { const c = colorAt((prev.s + ss) / 2); for (let k = 0; k < 6; k++) cols.push(...c); } }
      prev = { L: Lp, R: Rp, s: ss }; if (ss >= s1) break;
    }
    for (const [ss, cs] of [[s0, s0], [s1, s1]]) { const p = pointAt(H, ss), d = discTris(p.x, p.y, w, 24); tris.push(...d); if (cols) { const c = colorAt(cs); for (let k = 0; k < d.length / 2; k++) cols.push(...c); } }
    return { tris, cols };
  }
  const [bx0, bx1, by0, by1] = bounds(H), midX = (bx0 + bx1) / 2, midY = (by0 + by1) / 2;
  // out of bounds: a big field to the horizon
  flat([midX - 900, midY - 900, midX + 900, midY - 900, midX + 900, midY + 900, midX - 900, midY - 900, midX + 900, midY + 900, midX - 900, midY + 900], groundMat('#3f7a3a'), 0, null, 9);
  { const r = ribbon(0, H.len, H.ow); flat(r.tris, groundMat('#4d8a40'), 1); }                // the woods (playable, under the trees)
  { const r = ribbon(0, H.len, H.rw); flat(r.tris, groundMat('#5fa04a'), 2); }                // the rough
  const FW_A = [0.53, 0.80, 0.37], FW_B = [0.47, 0.73, 0.33];
  for (const [s0, s1, w] of H.spans) { const r = ribbon(s0, s1, w, s => (Math.floor(s / 12) % 2 ? FW_A : FW_B)); flat(r.tris, groundMat('#ffffff', noise, { vertexColors: true }), 3, r.cols); }
  { const T = TEE_BOX; flat([T.x0, T.y0, T.x1, T.y0, T.x1, T.y1, T.x0, T.y0, T.x1, T.y1, T.x0, T.y1], groundMat('#86c86a'), 4); }
  for (const w of H.water) { flat(ellipseTris(w), groundMat('#2a6f9e', null), 5); flat(ellipseTris(w, -1.1), groundMat('#3f97d0', null, { color: '#3f97d0' }), 6); }
  for (const k of H.creeks) {
    const t = [], t2 = [];
    for (let i = 0; i < k.pts.length - 1; i++) {
      const a = k.pts[i], b = k.pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = dy / l, ny = -dx / l;
      const quad = (w, out) => out.push(a[0] - nx * w, a[1] - ny * w, a[0] + nx * w, a[1] + ny * w, b[0] + nx * w, b[1] + ny * w, a[0] - nx * w, a[1] - ny * w, b[0] + nx * w, b[1] + ny * w, b[0] - nx * w, b[1] - ny * w);
      quad(k.w, t); quad(k.w * 0.6, t2);
    }
    for (const p of k.pts) { t.push(...discTris(p[0], p[1], k.w)); t2.push(...discTris(p[0], p[1], k.w * 0.6)); }
    flat(t, groundMat('#2a6f9e', null), 5); flat(t2, groundMat('#3f97d0', null), 6);
  }
  for (const b of H.bunkers) { flat(ellipseTris(b), groundMat('#c9ae74', sandTex), 7); flat(ellipseTris(b, -0.9), groundMat('#ecdcae', sandTex, {}), 8); }
  flat(ellipseTris(H.green, FRINGE), groundMat('#62b552'), 9);
  flat(ellipseTris(H.green), groundMat('#7fd468', greenTex, {}), 10, null, 3);
  // slope chevrons on the green, pointing downhill
  { const g = H.slope, mag = Math.hypot(g[0], g[1]); if (mag > 0.02) { const m = groundMat('#ffffff', chevTex, { transparent: true, opacity: 0.22 }); const t = chevTex.clone(); texs.push(t); t.needsUpdate = true; m.map = t; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.center.set(0.5, 0.5); t.rotation = Math.atan2(g[0], g[1]) + Math.PI; flat(ellipseTris(H.green, -0.6), m, 11, null, 4); } }
  // tee markers, yardage plates, out of bounds stakes
  const markGeo = new THREE.SphereGeometry(0.09, 10, 8); geos.push(markGeo);
  for (const x of [-6, 6]) { const mk = new THREE.Mesh(markGeo, std('#d8343f', { emissive: '#7a1018', emissiveIntensity: 0.3 })); mk.position.copy(W(x, 2, 0)); mk.position.y = 0.09; mk.castShadow = true; group.add(mk); }
  for (const [d, c] of [[100, '#d33b3b'], [150, '#f4f4f4'], [200, '#2f6fd0']]) { const s = H.gS - d; if (s < 40) continue; const p = pointAt(H, s); const plate = flat(discTris(p.x, p.y, 1.2, 16), lam(c, { side: THREE.DoubleSide, depthWrite: false }), 12); plate.userData.d = d; }
  { const stakes = [], step = 18; for (let s = 0; s <= H.len; s += step) { const p = pointAt(H, s), nx = p.ny, ny = -p.nx; for (const side of [-1, 1]) stakes.push([p.x + side * nx * H.ow, p.y + side * ny * H.ow]); }
    const sg = new THREE.BoxGeometry(0.08, 0.38, 0.08).translate(0, 0.19, 0); geos.push(sg);
    const im = new THREE.InstancedMesh(sg, std('#ffffff'), stakes.length); stakes.forEach(([x, y], i) => { m4.makeTranslation(x * S, 0, -y * S); im.setMatrixAt(i, m4); }); group.add(im); }
  // trees: round ones and pines, instanced, colours varied; a ring of decoration trees out past the stakes
  {
    const deco = [], dr = makeRng(H.n * 977 + 3);
    for (let s = -20; s < H.len + 30; s += 7) { const p = pointAt(H, s), nx = p.ny, ny = -p.nx; for (const side of [-1, 1]) for (let k = 0; k < 2; k++) { const d = H.ow + 30 + dr() * 60; deco.push([p.x + side * nx * d + p.nx * (dr() - 0.5) * 6, p.y + side * ny * d + p.ny * (dr() - 0.5) * 6, 3 + dr() * 2, 10 + dr() * 7]); } }
    const all = [...H.trees, ...deco], pines = [], rounds = [];
    for (const t of all) ((Math.abs(Math.round(t[0] * 7 + t[1] * 3)) % 3 === 0) ? pines : rounds).push(t);
    const canG = new THREE.IcosahedronGeometry(1, 1), pineG = new THREE.ConeGeometry(1, 1, 8), trunkG = new THREE.CylinderGeometry(0.3, 0.4, 1, 6).translate(0, 0.5, 0); geos.push(canG, pineG, trunkG);
    const can = new THREE.InstancedMesh(canG, lam('#ffffff', { flatShading: true }), Math.max(1, rounds.length)), pine = new THREE.InstancedMesh(pineG, lam('#ffffff', { flatShading: true }), Math.max(1, pines.length));
    const trunk = new THREE.InstancedMesh(trunkG, lam('#6b4a2c'), all.length);
    const tint = (t, base) => { const k = ((t[0] * 13.7 + t[1] * 7.1) % 1 + 1) % 1; return col.set(base).offsetHSL((k - 0.5) * 0.05, 0, (k - 0.5) * 0.12); };
    rounds.forEach((t, i) => { m4.compose(W(t[0], t[1], t[3] * 0.62).clone(), q.identity(), sc3.set(t[2] * S, t[3] * 0.4 * S, t[2] * S)); can.setMatrixAt(i, m4); can.setColorAt(i, tint(t, '#3f8f3a')); });
    pines.forEach((t, i) => { m4.compose(W(t[0], t[1], t[3] * 0.58).clone(), q.identity(), sc3.set(t[2] * 0.85 * S, t[3] * 0.84 * S, t[2] * 0.85 * S)); pine.setMatrixAt(i, m4); pine.setColorAt(i, tint(t, '#2f6e3c')); });
    all.forEach((t, i) => { m4.compose(W(t[0], t[1], 0).clone(), q.identity(), sc3.set(S * 1.6, t[3] * 0.3 * S, S * 1.6)); trunk.setMatrixAt(i, m4); });
    can.count = rounds.length; pine.count = pines.length;
    can.castShadow = pine.castShadow = true; group.add(can, pine, trunk);
  }
  // the flag and the cup
  const cupMesh = new THREE.Mesh(new THREE.CircleGeometry(Math.max(0.2, L.cupR) * S * 1.6, 20).rotateX(-Math.PI / 2), basic('#10241a')); cupMesh.position.copy(W(H.cup.x, H.cup.y, 0.02)); cupMesh.renderOrder = -5; group.add(cupMesh); geos.push(cupMesh.geometry);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.45, 6).translate(0, 0.725, 0), std('#ffffff')); pole.position.copy(W(H.cup.x, H.cup.y)); pole.castShadow = true; group.add(pole); geos.push(pole.geometry);
  const flagG = new THREE.Group(); flagG.position.set(pole.position.x, 1.27, pole.position.z); group.add(flagG);
  const flagMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.34).translate(0.28, 0, 0), std('#ff4d4d', { side: THREE.DoubleSide, emissive: '#c42a2a', emissiveIntensity: 0.6 })); flagG.add(flagMesh); geos.push(flagMesh.geometry);

  // ---------------------------------------------------------------- balls, characters
  const ballGeo = new THREE.SphereGeometry(1, 14, 10), shadowGeo = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2); geos.push(ballGeo, shadowGeo);
  const R = new Map();
  players.forEach((p, i) => {
    const mine = p.pid === me;
    const ball = new THREE.Mesh(ballGeo, std(mine ? '#ffffff' : p.color, { roughness: 0.35, transparent: !mine, opacity: mine ? 1 : 0.7, emissive: p.color, emissiveIntensity: mine ? 0.15 : 0.35 })); ball.castShadow = true;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.9, 24).rotateX(-Math.PI / 2), basic(p.color, { transparent: true, opacity: 0.85, depthWrite: false })); ring.renderOrder = -2; geos.push(ring.geometry);
    const shadow = new THREE.Mesh(shadowGeo, basic('#000000', { transparent: true, opacity: 0.25, depthWrite: false })); shadow.renderOrder = -3;
    const N = 70, tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); tg.setDrawRange(0, 0); geos.push(tg);
    const trail = new THREE.Line(tg, basic(mine ? '#ffffff' : p.color, { transparent: true, opacity: 0.75 })); trail.frustumCulled = false;
    group.add(ball, ring, shadow, trail);
    const t0 = init.tees?.[i] || { x: 0, y: 0 };
    const tag = stage.tag(ball, { text: mine ? 'YOU' : p.name, seat: p.seat, height: 0.6, cls: 'fg-tag' + (mine ? ' me' : '') });
    R.set(p.pid, { p, i, mine, ball, ring, shadow, trail, tg, N, tag, x: t0.x, y: t0.y, st: ST.ready, strokes: 0, lie: 'tee', anim: null, actor: null, club: null, swingT: 0, faceYaw: 0 });
    ctx.createActor({ look: p.look || { race: 'human', seed: p.pid * 977 + 1 }, costume: p.costume, seat: p.seat }, { scale: 0.4 }).then(a => { if (!a) return; const r = R.get(p.pid); r.actor = a; a.setRing?.(false); addClub(r); placeActor(r); });
  });
  const clubShaft = new THREE.CylinderGeometry(0.02, 0.02, 0.85, 6).translate(0, -0.42, 0), clubHead = new THREE.BoxGeometry(0.16, 0.07, 0.08).translate(0.03, -0.85, 0); geos.push(clubShaft, clubHead);
  const shaftMat = std('#c8ccd6', { metalness: 0.5, roughness: 0.3 }), headMat = std('#2d2d38', { metalness: 0.4, roughness: 0.4 });
  function addClub(r) { const pv = new THREE.Group(); pv.position.set(0.06, 0.66, 0.24); pv.add(new THREE.Mesh(clubShaft, shaftMat), new THREE.Mesh(clubHead, headMat)); pv.rotation.x = 0.55; r.actor.body.group.add(pv); r.club = pv; }
  /** Stand a character side-on to its ball, facing it, the target off its left shoulder. */
  function placeActor(r, aimYaw = null) {
    const a = r.actor; if (!a) return;
    const hidden = r.st === ST.out || (r.st === ST.in && false);
    a.group.visible = !hidden;
    let x = r.x, y = r.y, yaw = aimYaw ?? Math.atan2(H.cup.x - r.x, H.cup.y - r.y);
    if (r.st === ST.in) { const k = r.i * Math.PI / 2 + 0.6; x = H.cup.x + Math.cos(k) * 2.2; y = H.cup.y + Math.sin(k) * 2.2; yaw = Math.atan2(H.cup.x - x, H.cup.y - y) - Math.PI / 2; }
    const dx = Math.sin(yaw), dy = Math.cos(yaw), nx = dy, ny = -dx;            // nx, ny: to the right of the aim
    const sx = x - nx * 1.15, sy = y - ny * 1.15;                              // stand on the left of the ball…
    a.place(sx * S, 0, -sy * S, Math.atan2(nx, -ny));                         // …facing it (scene yaw of the right-hand normal)
    r.faceYaw = yaw;
  }

  // ---------------------------------------------------------------- your aim
  const NDOT = 22, dots = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), basic('#ffffff', { transparent: true, opacity: 0.95, depthWrite: false }), NDOT); dots.count = 0; dots.renderOrder = 3; group.add(dots); geos.push(dots.geometry);
  const target = new THREE.Mesh(new THREE.RingGeometry(0.78, 1, 32).rotateX(-Math.PI / 2), basic('#ffe36b', { transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide })); target.renderOrder = 2; target.visible = false; group.add(target); geos.push(target.geometry);

  // ---------------------------------------------------------------- HUD
  const bar = scoreBar(ctx, { unit: 'strokes' });
  const pill = h('div', 'gp-pill fg-pill'), banner = h('div', 'gp-banner fg-banner'), card = h('div', 'fg-card'), hio = h('div', 'fg-hio');
  ui.append(pill, banner, card, hio);
  const showBanner = (html, cls = '', ms = 1900) => { banner.innerHTML = html; banner.className = 'gp-banner fg-banner show ' + cls; clearTimeout(showBanner.t); showBanner.t = setTimeout(() => { banner.className = 'gp-banner fg-banner'; }, ms); };
  const wind = h('div', 'fg-wind' + (playing ? ' in-panel' : ''), '<i class="fg-arrow"></i><span><b>Wind</b> <em></em></span>');
  const board = h('div', 'fg-board');
  let panel = null, $ = null;
  if (playing) {
    panel = h('div', 'fg-panel', `
      <div class="fg-row fg-top"><button class="fg-btn fg-cl" aria-label="Previous club">◀</button><button class="fg-club" aria-label="Change club"><b></b><small></small></button><button class="fg-btn fg-cr" aria-label="Next club">▶</button>
        <div class="fg-info"><b class="fg-dist"></b><span class="fg-lie"></span></div></div>
      <div class="fg-row fg-mid"><button class="fg-btn fg-al" aria-label="Aim left">◀</button><span class="fg-aimtx"></span><button class="fg-btn fg-ar" aria-label="Aim right">▶</button><span class="fg-wind-slot"></span></div>
      <div class="fg-last" aria-live="polite"></div>
      <div class="fg-meter fg-power"><span>Power</span><div class="fg-track"><i class="fg-fill"></i><i class="fg-pin"></i><i class="fg-mark"></i></div></div>
      <div class="fg-meter fg-acc"><span>Accuracy</span><div class="fg-track"><i class="fg-sweet"></i><i class="fg-needle"></i></div></div>
      <div class="fg-row fg-go"><button class="fg-swing big-btn">Get ready…</button><button class="fg-cardbtn" aria-label="Scorecard">Card</button></div>`);
    ui.append(panel);
    $ = s => panel.querySelector(s);
    $('.fg-wind-slot').append(wind);
    // the sweet spot on the needle is as wide as the level's
    $('.fg-sweet').style.left = (50 - L.sweet * 50) + '%'; $('.fg-sweet').style.width = (L.sweet * 100) + '%';
  } else { ui.append(wind, board); }
  const aimPad = h('div', 'fg-aimpad'); if (playing) ui.prepend(aimPad);
  const lastTx = $?.('.fg-last');
  const showLast = (text, cls = '') => { if (!lastTx) return; lastTx.textContent = text; lastTx.className = 'fg-last show ' + cls; clearTimeout(showLast.t); showLast.t = setTimeout(() => { lastTx.className = 'fg-last'; }, 3200); };

  // the screen: leave the panel's height free at the bottom
  function setSafe() {
    const hgt = innerHeight || 780, ph = panel ? panel.getBoundingClientRect().height + 18 : 0;
    stage.setSafe(playing ? { top: 0.15, bottom: Math.min(0.55, Math.max(0.12, ph / hgt)), left: 0.03, right: 0.03 } : { top: 0.14, bottom: 0.05, left: innerWidth > innerHeight ? 0.2 : 0.03, right: 0.03 });
  }
  setSafe(); addEventListener('resize', setSafe);

  // ---------------------------------------------------------------- local swing state
  const now = () => performance.now() / 1000;
  let mode = 'wait', t0 = now(), t1 = 0, lockedP = 0, sent = false, sentAt = 0, last = null, myN = 0;
  let club = 'dr', aimOff = 0, aimBase = 0, pinP = 0, myKey = '', tStart = Infinity, done = false;
  const mineR = () => (me != null ? R.get(me) : null);
  const isPutt = () => CLUB[club]?.putt;
  /** A new lie for your ball: pick the club, aim at the target. */
  function newLie(r) {
    club = suggestClub(H, r.x, r.y, r.lie); aimOff = 0; setBase(r);
  }
  function setBase(r) {
    const t = targetFor(H, r.x, r.y, r.lie, club);
    if (isPutt()) {
      aimBase = Math.atan2(t.x - r.x, t.y - r.y);
      const D = Math.hypot(t.x - r.x, t.y - r.y) + 0.3; let lo = 0, hi = 1; for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; if (rollDistance(puttSpeed(m, L), L.gR, L.gK) < D) lo = m; else hi = m; } pinP = (lo + hi) / 2;
    } else if (L.help) { const s = solveShot(r, r.lie, club, t, init.wind); aimBase = s.aim; pinP = Math.min(1, s.p); }
    else { aimBase = Math.atan2(t.x - r.x, t.y - r.y); pinP = Math.min(1, Math.hypot(t.x - r.x, t.y - r.y) / Math.max(1, reachOf(club, r.lie))); }
    drawPanel();
  }
  const aimNow = () => aimBase + aimOff;
  function cycleClub(dir) {
    const r = mineR(); if (!r || !(mode === 'power' || mode === 'wait')) return;
    const list = clubsFor(r.lie), i = list.indexOf(club); club = list[(i + dir + list.length) % list.length]; aimOff = 0; setBase(r); ctx.sfx('tap');
  }
  function nudgeAim(deg) { if (!(mode === 'power' || mode === 'acc' || mode === 'wait')) return; aimOff = Math.max(-25 * DEG, Math.min(25 * DEG, aimOff + deg * DEG)); drawPanel(); }
  function drawPanel() {
    if (!panel) return; const r = mineR(); if (!r) return;
    const c = CLUB[club], D = Math.hypot(H.cup.x - r.x, H.cup.y - r.y), onGreen = r.lie === 'green' || r.lie === 'fringe';
    $('.fg-club b').textContent = c.name; $('.fg-club small').textContent = c.putt ? 'roll it' : `${Math.round(reachOf(club, r.lie))} yd`;
    $('.fg-dist').textContent = r.st === ST.in ? 'In the hole!' : r.st === ST.out ? 'Picked up' : onGreen && D < 30 ? `${yd2ft(D)} ft to the hole` : `${Math.round(D)} yd to the pin`;
    $('.fg-lie').textContent = r.st >= ST.in ? '' : LIE_NAME[r.lie] + ({ rough: ' · shorter', woods: ' · much shorter', sand: ' · tough lie' }[r.lie] || '');
    $('.fg-lie').className = 'fg-lie lie-' + r.lie;
    const a = aimOff / DEG;
    let aimText = Math.abs(a) < 0.05 ? (isPutt() ? 'Aim: at the hole' : targetFor(H, r.x, r.y, r.lie, club).pin ? 'Aim: at the pin' : 'Aim: down the middle') : `Aim ${Math.abs(a).toFixed(a % 1 ? 2 : 0).replace(/\.?0+$/, '')}° ${a < 0 ? 'left' : 'right'}`;
    if (isPutt()) {        // the slope hint: up / downhill and which way it breaks, from where you stand
      const g = H.slope, d = [Math.sin(aimNow()), Math.cos(aimNow())], along = g[0] * d[0] + g[1] * d[1], cross = g[0] * d[1] - g[1] * d[0];
      aimText += ` <small>${along > 0.06 ? 'downhill' : along < -0.06 ? 'uphill' : 'flat'}${Math.abs(cross) > 0.06 ? `, breaks ${cross > 0 ? 'right' : 'left'}` : ''}</small>`;
    }
    $('.fg-aimtx').innerHTML = aimText;
    $('.fg-pin').style.left = (pinP * 100).toFixed(1) + '%';
    panel.classList.toggle('putting', !!isPutt());
    const busyOrDone = !(mode === 'power' || mode === 'wait');
    for (const s of ['.fg-cl', '.fg-cr', '.fg-club']) $(s).disabled = busyOrDone || clubsFor(r.lie).length < 2;
    for (const s of ['.fg-al', '.fg-ar']) $(s).disabled = !(mode === 'power' || mode === 'acc' || mode === 'wait');
  }
  function tap() {
    if (mode === 'power') {
      const period = isPutt() ? L.putt : L.power;
      lockedP = pingPong(now() - t0, period);
      if (isPutt()) { send(lockedP, 0); return; }
      mode = 'acc'; t1 = now(); ctx.sfx('tap'); drawPanel();
    } else if (mode === 'acc') send(lockedP, Math.round(needle(now() - t1, L.acc) * 100) / 100);
  }
  function send(p, a) {
    ctx.send('swing', { c: club, p: Math.round(p * 1000) / 1000, a, aim: Math.round(aimNow() * 10000) / 10000 });
    mode = 'sent'; sent = true; sentAt = now(); ctx.sfx('throw');
    const r = mineR(); if (r) { r.swingT = 0.001; r.actor?.play('attack', 700); }
    drawPanel();
  }
  if (playing) {
    const sw = $('.fg-swing');
    sw.addEventListener('pointerdown', e => { e.preventDefault(); tap(); });
    sw.addEventListener('click', e => { if (e.detail === 0) tap(); });          // a controller's A (padnav) or the keyboard clicks
    const hold = (sel, fn) => { const b = $(sel); let iv = null, to = null; const stop = () => { clearTimeout(to); clearInterval(iv); }; b.addEventListener('pointerdown', e => { e.preventDefault(); fn(); to = setTimeout(() => { iv = setInterval(fn, 70); }, 320); }); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop); b.addEventListener('click', e => { if (e.detail === 0) fn(); }); };
    hold('.fg-al', () => nudgeAim(-0.25)); hold('.fg-ar', () => nudgeAim(0.25));
    $('.fg-cl').addEventListener('click', () => cycleClub(-1)); $('.fg-cr').addEventListener('click', () => cycleClub(1)); $('.fg-club').addEventListener('click', () => cycleClub(1));
    $('.fg-cardbtn').addEventListener('click', () => toggleCard());
    // drag anywhere on the view to aim
    let drag = null;
    aimPad.addEventListener('pointerdown', e => { drag = { x: e.clientX }; aimPad.setPointerCapture?.(e.pointerId); });
    aimPad.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x; drag.x = e.clientX; nudgeAim(dx * (isPutt() ? 0.06 : 0.035)); });
    for (const ev of ['pointerup', 'pointercancel']) aimPad.addEventListener(ev, () => { drag = null; });
  }
  const onKey = e => {
    if (/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) return;
    if (e.code === 'KeyC') { toggleCard(); return; }
    if (!playing) return;
    const fine = e.shiftKey ? 1 : 0.25;
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) tap(); }
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); nudgeAim(-fine); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); nudgeAim(fine); }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); cycleClub(-1); }
    else if (e.code === 'ArrowDown' || e.code === 'KeyS' || e.code === 'KeyB') { e.preventDefault(); cycleClub(1); }
  };
  addEventListener('keydown', onKey);

  // ---------------------------------------------------------------- scorecard
  const round = init.round || [{ n: init.no, par: init.par, name: init.name, yards: init.yards }];
  let cardOpen = false, cardAuto = null;
  function cardRows() {
    const live = Object.fromEntries((last?.b || []).map(row => [row[0], row]));
    return players.map(p => {
      const prev = init.card?.[p.pid] || [], vals = round.map((hh, i) => (i < init.hole ? prev[i] ?? null : i === init.hole ? (live[p.pid] ? (last.sc?.[p.pid] ?? live[p.pid][4]) : null) : null));
      const tot = vals.reduce((a, v) => a + (v ?? 0), 0), parTo = round.reduce((a, hh, i) => a + (vals[i] != null ? hh.par : 0), 0);
      return { p, vals, tot, toPar: tot - parTo, cur: live[p.pid] };
    });
  }
  function drawCard() {
    const rows = cardRows(), fmt = n => (n === 0 ? 'E' : n > 0 ? '+' + n : String(n));
    card.innerHTML = `<b class="fg-title">Scorecard</b><table><tr><th>Hole</th><th>Par</th>${rows.map(r => `<th class="${r.p.pid === me ? 'me' : ''}"><i class="gp-dot" data-shape="${r.p.shape}" style="--seat:${r.p.color}"></i>${esc(r.p.pid === me ? 'You' : r.p.name.slice(0, 6))}</th>`).join('')}</tr>
      ${round.map((hh, i) => `<tr class="${i === init.hole ? 'now' : ''}"><td>${i + 1}</td><td>${hh.par}</td>${rows.map(r => { const v = r.vals[i]; return `<td class="${v == null ? '' : v < hh.par ? 'under' : v > hh.par ? 'over' : 'par'}">${v ?? '–'}</td>`; }).join('')}</tr>`).join('')}
      <tr class="tot"><td colspan="2">Total</td>${rows.map(r => `<td><b>${r.tot}</b><small>${fmt(r.toPar)}</small></td>`).join('')}</tr></table><button class="fg-close" aria-label="Close the scorecard">Close</button>`;
    card.querySelector('.fg-close').addEventListener('click', () => toggleCard(false));
  }
  function toggleCard(on = !cardOpen) { cardOpen = on; clearTimeout(cardAuto); if (on) drawCard(); card.classList.toggle('show', on); }
  function flashCard(ms) { toggleCard(true); cardAuto = setTimeout(() => toggleCard(false), ms); }

  // ---------------------------------------------------------------- the wind
  function showWind(upYaw) {
    const w = init.wind; wind.querySelector('em').textContent = w.mph ? `${w.mph} mph` : 'calm';
    wind.querySelector('.fg-arrow').style.transform = `rotate(${(w.dir - upYaw).toFixed(3)}rad)`;
    wind.classList.toggle('calm', !w.mph);
  }
  // the flag flaps with it
  const flagYaw = Math.atan2(Math.sin(init.wind.dir), -Math.cos(init.wind.dir));

  // ---------------------------------------------------------------- shots in flight
  function launch(ev) {
    const r = R.get(ev.pid); if (!r) return;
    r.anim = { ev, t: 0, pts: [], tf: ev.tf, T: ev.F ? ev.F.T : 0, n: ev.pts.length / 2, done: false, splashed: false };
    r.tg.setDrawRange(0, 0);
    if (ev.pid !== me) { r.actor?.play('attack', 700); r.swingT = 0.001; }
    if (ev.F) { const yaw = Math.atan2(ev.F.dx, ev.F.dy); placeActor(r, yaw); }
  }
  /** Where a ball is during its animation (yards; h = height). */
  function animPos(A) {
    const ev = A.ev;
    if (ev.F && A.t < A.tf) { const k = Math.min(ev.F.k, A.t / A.T); return flightPos(ev.F, k); }
    const rt = A.t - A.tf, i = Math.min(A.n - 1, rt / 0.1), i0 = Math.floor(i), f = i - i0, P = ev.pts;
    const x = P[i0 * 2] + ((P[(i0 + 1) * 2] ?? P[i0 * 2]) - P[i0 * 2]) * f, y = P[i0 * 2 + 1] + ((P[(i0 + 1) * 2 + 1] ?? P[i0 * 2 + 1]) - P[i0 * 2 + 1]) * f;
    const hop = ev.F && !ev.tree && rt < 0.6 ? Math.abs(Math.sin(rt / 0.6 * Math.PI)) * Math.min(2.5, ev.F.apex * 0.08) * (1 - rt / 0.6) : 0;
    return { x, y, h: hop };
  }
  const RES_TEXT = { water: 'Splash! +1 penalty — drop', oob: 'Out of bounds! +1 — play again' };
  function landed(r, ev) {
    if (ev.res === 'water' || ev.res === 'oob') {
      if (ev.res === 'water') { splash(ev.at.x, ev.at.y); ctx.sfx('splat'); } else ctx.sfx('bad');
      if (r.mine) showLast(RES_TEXT[ev.res], 'bad');
      floatText(stage, ev.at.x * S, 1, -ev.at.y * S, ev.res === 'water' ? 'Splash!' : 'Out of bounds', 'bad');
    } else if (r.mine && ev.res !== 'in') {
      const D = Math.hypot(ev.end.x - H.cup.x, ev.end.y - H.cup.y), onG = ev.lie === 'green';
      const msg = ev.tree ? 'Into the trees!' : onG ? `On the green — ${yd2ft(D)} ft` : ev.lie === 'sand' ? 'In the bunker' : ev.lie === 'fairway' ? `Fairway — ${Math.round(D)} yd to go` : ev.lie === 'fringe' ? 'Just off the green' : `${LIE_NAME[ev.lie]} — ${Math.round(D)} yd to go`;
      showLast((ev.carry ? `${ev.carry} yd carry. ` : '') + msg, onG || ev.lie === 'fairway' ? 'good' : ev.lie === 'sand' || ev.tree ? 'bad' : '');
      ctx.sfx(onG || ev.lie === 'fairway' ? 'good' : 'tap');
      if (ev.lip) floatText(stage, H.cup.x * S, 0.8, -H.cup.y * S, 'Lipped out!', 'bad');
    }
  }
  const splashes = [];
  const splashGeo = new THREE.RingGeometry(0.6, 1, 24).rotateX(-Math.PI / 2); geos.push(splashGeo);
  function splash(x, y) { const m = new THREE.Mesh(splashGeo, basic('#ffffff', { transparent: true, opacity: 0.9, depthWrite: false })); m.position.copy(W(x, y, 0.1)); m.renderOrder = 4; group.add(m); splashes.push({ m, t: 0 }); }

  // ---------------------------------------------------------------- confetti (a hole in one)
  function celebrate(name) {
    hio.innerHTML = `<b>HOLE IN ONE!</b><small>${esc(name)}</small>${Array.from({ length: 36 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${(i % 7) * 0.12}s;--c:${['#ffd23f', '#ff5a7a', '#3d8bff', '#3ecf5a', '#ffffff'][i % 5]};--r:${(i * 53) % 360}deg"></i>`).join('')}`;
    hio.className = 'fg-hio show'; clearTimeout(celebrate.t); celebrate.t = setTimeout(() => { hio.className = 'fg-hio'; }, 5200);
    juice.flash('#ffd23f', 500); juice.shake(0.2, 0.5); ctx.sfx('win'); setTimeout(() => ctx.sfx('coins'), 500);
  }

  // ---------------------------------------------------------------- camera
  let cam = null, framed = false;
  const tall = () => innerHeight > innerWidth * 1.15;
  function frameBox(pts, yawRad, pitch, minHalf = 16, instant = false) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x * S); x1 = Math.max(x1, x * S); z0 = Math.min(z0, -y * S); z1 = Math.max(z1, -y * S); }
    const want = { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hw: Math.max(minHalf * S, (x1 - x0) / 2), hd: Math.max(minHalf * S, (z1 - z0) / 2), pitch, yaw: -yawRad / DEG, tall: 1.5 };
    cam = want; ctx.camera(want, { instant });           // every frame: the page may have moved the camera between phases
  }
  const holeYaw = Math.atan2(H.cup.x, H.cup.y);
  // the whole hole: tee to just past the green, the fairway's width either side, and every hazard
  const holeBox = (() => { const pts = [[0, -8], [H.cup.x, H.cup.y + H.green[3] + 12]]; for (let i = 0; i < H.line.length; i += 4) { const [x, y] = H.line[i]; if (y <= H.cup.y + 10) pts.push([x - 32, y], [x + 32, y]); } for (const e of [...H.bunkers, ...H.water]) pts.push([e[0] - e[2], e[1]], [e[0] + e[2], e[1]]); return pts; })();
  let upYaw = holeYaw;
  function overview(instant = false) {
    const wide = !tall(), yaw = wide && !playing ? holeYaw - Math.PI / 2 : holeYaw;
    upYaw = yaw; frameBox(holeBox, yaw, wide ? 52 : 58, 20, instant);
  }
  overview(true);
  /** A watching screen: frame everyone still playing (and the cup) once play is under way. false = nothing to follow. */
  function action() {
    const pts = [[H.cup.x, H.cup.y]];
    for (const r of R.values()) { if (r.st === ST.out || (r.st === ST.in && !r.anim)) continue; if (r.anim) { const P = animPos(r.anim); pts.push([P.x, P.y], [r.anim.ev.at.x, r.anim.ev.at.y]); } else pts.push([r.x, r.y]); }
    if (pts.length < 2) return false;
    const wide = !tall(), yaw = wide ? holeYaw - Math.PI / 2 : holeYaw; upYaw = yaw;
    frameBox(pts, yaw, wide ? 46 : 54, 34); return true;
  }

  // ---------------------------------------------------------------- server updates
  function apply(g) {
    for (const row of g.b) {
      const r = R.get(row[0]); if (!r) continue;
      const [, x, y, st, strokes, li] = row, moved = Math.hypot(x - r.x, y - r.y) > 0.05;
      const wasIn = r.st;
      r.x = x; r.y = y; r.st = st; r.strokes = strokes; r.lie = LIES[li] || 'rough';
      if (!r.anim && (moved || wasIn !== st)) placeActor(r);
      if (r.mine && st === ST.ready) { const key = `${x},${y},${strokes}`; if (key !== myKey) { myKey = key; newLie(r); } }
    }
  }
  function drawBoard(g) {
    if (playing) return;
    board.innerHTML = players.map(p => { const r = R.get(p.pid); const D = Math.hypot(H.cup.x - r.x, H.cup.y - r.y); const where = r.st === ST.in ? scoreName(g.sc[p.pid], init.par) : r.st === ST.out ? 'Picked up' : r.lie === 'green' ? `${yd2ft(D)} ft` : `${Math.round(D)} yd · ${LIE_NAME[r.lie]}`;
      return `<div class="fg-brow"><i class="gp-dot" data-shape="${p.shape}" style="--seat:${p.color}"></i><b>${esc(p.name)}</b><em>${g.sc[p.pid] ?? 0}</em><span>${esc(where)}</span></div>`; }).join('');
  }
  const view = {
    state(g) {
      const first = !last; last = g; apply(g);
      if (g.go && tStart === Infinity) tStart = now();                 // the whole hole on show for a moment once play starts
      bar.set(g.sc, g.left);
      const vals = Object.values(g.sc), best = Math.min(...vals); for (const p of players) bar.mark(p.pid, 'lead', g.sc[p.pid] === best && vals.some(s => s !== best));
      pill.innerHTML = `<b>Hole ${init.hole + 1} of ${init.holes}</b> <span>${esc(init.name)}</span> <em>Par ${init.par}</em> <span>${init.yards} yds</span> <span class="gp-hl${g.left <= 15 ? ' hurry' : ''}">${Math.floor(g.left / 60)}:${String(g.left % 60).padStart(2, '0')}</span>`;
      if (playing) {
        const r = mineR(), n2 = r.strokes;
        if (n2 !== myN) { myN = n2; sent = false; }
        if (sent && now() - sentAt > 2.5 && r.st === ST.ready) { sent = false; mode = 'wait'; }      // the server never took it: try again
        if (r.st === ST.in || r.st === ST.out) mode = 'done';
        else if (!g.go) mode = 'wait';
        else if (r.st === ST.busy || r.anim) mode = 'flying';
        else if (!sent && (mode === 'wait' || mode === 'flying')) { mode = 'power'; t0 = now(); }
        drawPanel();
      }
      drawBoard(g);
      if (first) drawPanel();
      if (cardOpen) drawCard();
    },
    event(ev) {
      const r = R.get(ev.pid);
      if (ev.e === 'shot') { launch(ev); if (ev.pid !== me) ctx.sfx('tap'); }
      else if (ev.e === 'in') {
        const p = players.find(q => q.pid === ev.pid);
        if (ev.strokes === 1) celebrate(ev.pid === me ? 'You!' : p?.name || '');
        else { floatText(stage, H.cup.x * S, 1.6, -H.cup.y * S, `${p?.name || ''}: ${ev.name}`, ev.strokes <= ev.par ? 'good' : ''); if (ev.pid === me) showBanner(ev.name, ev.strokes <= ev.par ? 'good' : '', 2200); ctx.sfx(ev.pid === me ? 'win' : 'good'); }
        r?.actor?.play('cheer', 1600);
        if (ev.pid === me) { done = true; setTimeout(() => flashCard(3500), ev.strokes === 1 ? 5000 : 1800); }      // after the celebration
      }
      else if (ev.e === 'pickup' || ev.e === 'timeout') { if (ev.pid === me) { ctx.sfx('bad'); showBanner('Picked up', 'bad', 1500); done = true; } if (r) { r.st = ST.out; placeActor(r); } }
      else if (ev.e === 'end') { flashCard(9000); }
    },
    frame(dt, t) {
      juice.frame(dt, t);
      const camPos = stage.camera.position, panelTop = panel ? panel.getBoundingClientRect().top : 0;
      for (const [pid, r] of R) {
        let pos;
        const A = r.anim;
        if (A) {
          A.t += dt; pos = animPos(A);
          const flying = A.ev.F && A.t < A.tf;
          if (flying && A.pts.length < r.N * 3) { A.pts.push(pos.x * S, pos.h * S + 0.05, -pos.y * S); r.tg.attributes.position.array.set(A.pts); r.tg.attributes.position.needsUpdate = true; r.tg.setDrawRange(0, A.pts.length / 3); }
          if (!flying && !A.landed) { A.landed = true; if (A.ev.F && !A.ev.tree) ctx.sfx(pid === me ? 'hit' : 'tap'); }
          const total = A.tf + A.ev.tr;
          if (A.t >= total && !A.done) { A.done = true; landed(r, A.ev); }
          const wait = A.ev.pen ? 1.3 : 0.3;
          if (A.t >= total + wait) { r.anim = null; r.tg.setDrawRange(0, 0); pos = { x: r.x, y: r.y, h: 0 }; placeActor(r); if (A.ev.res === 'in') r.st = ST.in; }
          if (A.done && (A.ev.res === 'water' || A.ev.res === 'oob')) pos = null;           // gone until it is dropped
        } else pos = { x: r.x, y: r.y, h: 0 };
        const show = !!pos && r.st !== ST.out && !(r.st === ST.in && !A);
        r.ball.visible = r.shadow.visible = show; r.ring.visible = show && (!A || A.done);
        const under = show && panelTop && pos && stage.toScreen(pos.x * S, pos.h * S + 0.6, -pos.y * S).y > panelTop - 6;
        r.tag.el.style.visibility = show && !under ? '' : 'hidden';
        if (pos) {
          const dCam = Math.hypot(camPos.x - pos.x * S, camPos.y, camPos.z + pos.y * S), size = Math.max(0.05, Math.min(0.9, dCam * 0.0045));
          r.ball.scale.setScalar(size); r.ball.position.set(pos.x * S, pos.h * S + size, -pos.y * S);
          r.shadow.scale.setScalar(size * (1 + pos.h * 0.02)); r.shadow.position.set(pos.x * S, 0.01, -pos.y * S);
          r.ring.scale.setScalar(size); r.ring.position.set(pos.x * S, 0.012, -pos.y * S);
        }
        // the swing: draw back, through, finish
        if (r.club) { if (r.swingT > 0) { r.swingT += dt; const k = r.swingT / 0.7; r.club.rotation.x = k < 0.45 ? 0.55 - 2.2 * (k / 0.45) : 0.55 - 2.2 + 4.6 * Math.min(1, (k - 0.45) / 0.3); if (k > 1.6) r.swingT = 0; } else r.club.rotation.x = 0.55; r.club.visible = r.st < ST.in; }
        r.actor?.update(dt);
      }
      for (let i = splashes.length - 1; i >= 0; i--) { const s = splashes[i]; s.t += dt; s.m.scale.setScalar((1 + s.t * 6) * 0.6); s.m.material.opacity = Math.max(0, 0.9 - s.t * 0.9); if (s.t > 1) { s.m.removeFromParent(); s.m.material.dispose(); splashes.splice(i, 1); } }
      flagG.rotation.y = flagYaw + Math.sin(t * 5) * 0.12 * (0.3 + init.wind.mph / 15);
      // meters
      const r = mineR();
      if (playing && r) {
        panel.dataset.mode = mode;
        const period = isPutt() ? L.putt : L.power, p = mode === 'power' ? pingPong(now() - t0, period) : lockedP;
        $('.fg-fill').style.width = (p * 100).toFixed(1) + '%'; $('.fg-mark').style.left = (lockedP * 100).toFixed(1) + '%'; $('.fg-mark').style.opacity = mode === 'acc' || mode === 'sent' ? 1 : 0;
        const a = mode === 'acc' ? needle(now() - t1, L.acc) : 0; $('.fg-needle').style.left = (50 + a * 50).toFixed(1) + '%';
        const label = { power: isPutt() ? 'TAP: PUTT' : 'TAP: POWER', acc: 'TAP: ACCURACY', sent: 'Swing!', flying: 'Watch it fly…', done: r.st === ST.in ? 'In the hole!' : 'Picked up', wait: 'Get ready…' }[mode];
        const sw = $('.fg-swing'); if (sw.textContent !== label) sw.textContent = label; sw.disabled = !(mode === 'power' || mode === 'acc');
        // your aim: the arc to where a pure strike at this power lands (allowing for the wind on Easy), or the putt line
        const ready = (mode === 'power' || mode === 'acc') && !r.anim;
        if (ready) {
          const aim = aimNow(), dx = Math.sin(aim), dy = Math.cos(aim);
          if (isPutt()) {
            const len = Math.min(40, rollDistance(puttSpeed(p, L), L.gR, L.gK)), n = NDOT;
            for (let i = 0; i < n; i++) { const d = 0.6 + i * (len - 0.6) / (n - 1); m4.compose(W(r.x + dx * d, r.y + dy * d, 0.15).clone(), q.identity(), sc3.setScalar(0.07 * (1 - i / (n * 1.5)))); dots.setMatrixAt(i, m4); }
            dots.count = n; target.visible = false;
          } else {
            const C = reachOf(club, r.lie) * Math.max(0.05, p), w = init.wind, k = w.mph * 1.3 / 200 * (CLUB[club].wind || 1);
            const F = { fx: r.x, fy: r.y, dx, dy, nx: dy, ny: -dx, C, off: 0, wx: L.help ? Math.sin(w.dir) * k * C : 0, wy: L.help ? Math.cos(w.dir) * k * C : 0, apex: CLUB[club].apex * (0.45 + 0.55 * p), T: 1, k: 1 };
            for (let i = 0; i < NDOT; i++) { const P = flightPos(F, (i + 1) / (NDOT + 1)); m4.compose(W(P.x, P.y, P.h).clone(), q.identity(), sc3.setScalar(Math.max(0.06, Math.min(0.5, Math.hypot(camPos.x - P.x * S, camPos.z + P.y * S) * 0.003)))); dots.setMatrixAt(i, m4); }
            dots.count = NDOT;
            const end = flightPos(F, 1); target.position.copy(W(end.x, end.y, 0.05)); target.scale.setScalar(Math.max(2.5, C * 0.025) * S); target.visible = true;
          }
          dots.instanceMatrix.needsUpdate = true;
        } else { dots.count = 0; target.visible = false; }
        if (r.actor && ready && r.st === ST.ready) placeActor(r, aimNow());
      }
      // camera
      const intro = now() - tStart < 2.8 || tStart === Infinity;
      if (!framed) { framed = true; overview(true); }                    // the first frame of play: snap, don't drift in from the intro screen's camera
      if (!playing) { if (intro || !action()) overview(); }
      else if (intro || !r) overview();
      else if (done) { if (!action()) overview(); }                     // in (or picked up): watch the others play
      else if (r.anim) {
        const A = r.anim, P = animPos(A), end = A.ev.pen ? A.ev.at : A.ev.end, yaw = A.ev.F ? Math.atan2(A.ev.F.dx, A.ev.F.dy) : Math.atan2(H.cup.x - A.ev.from.x, H.cup.y - A.ev.from.y);
        upYaw = yaw; frameBox([[P.x, P.y], [end.x, end.y]], yaw, isPuttLie(A.ev.from) ? 50 : 20, A.ev.F ? 20 : 9);
      } else {
        const aim = aimNow();
        upYaw = aim;
        if (isPutt()) frameBox([[r.x - Math.sin(aim) * 3, r.y - Math.cos(aim) * 3], [H.cup.x, H.cup.y]], aim, 50, 7);
        else { const C = reachOf(club, r.lie) * Math.max(0.35, pinP), ex = r.x + Math.sin(aim) * C, ey = r.y + Math.cos(aim) * C; frameBox([[r.x - Math.sin(aim) * 6, r.y - Math.cos(aim) * 6], [ex, ey]], aim, 14, 14); }
      }
      showWind(upYaw);
    },
    dispose() {
      removeEventListener('keydown', onKey); removeEventListener('resize', setSafe);
      clearTimeout(showBanner.t); clearTimeout(showLast.t); clearTimeout(cardAuto); clearTimeout(celebrate.t);
      scene.background = bg0; scene.fog = fog0;
      bar.el.remove(); for (const r of R.values()) r.tag.remove();
      juice.dispose?.();
      for (const m of mats) m.dispose(); for (const t of texs) t.dispose(); for (const g of geos) g.dispose();
    },
  };
  function isPuttLie(p) { const d = Math.hypot(p.x - H.cup.x, p.y - H.cup.y); return d < H.green[2] + H.green[3]; }
  return view;
}
