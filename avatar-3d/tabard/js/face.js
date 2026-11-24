// Tabard face layer (round 4): eyes, eyelids, brows, beards and face marks for a Chibi 2.6 look.
//
// The body file has its own face mesh (`face_layer`, tools/blender/tb_face.py) with its own 1024² texture whose
// layout is a longitude/latitude map of the face (same scale both ways), and models/<body>_face.json gives the
// landmarks on that texture (`uv`, v runs down) and each eye in the Head bone's own frame (`eyes`). This module:
//   1. EYES — real eyeballs in the sockets (a painted iris + pupil in the look's eye colour, a glossy shine) with an
//      upper and lower eyelid each. The lids are skin-coloured caps round the eyeball whose edge height and tilt make
//      the eye SHAPE (round, almond, sleepy, upswept…), with a lash line on the edge. They blink.
//   2. PAINT — on the face texture, like a painter: the clean painted face (models/<body>/face.webp) in the look's
//      skin colour, then brows made of single hair strokes, the lash line and crease round the eye openings, a beard
//      or moustache (strokes inside landmark-shaped areas, feathered edges), and face marks (freckles, scars, war
//      paint…). Brows and beards take the hair colour.
// Contract (tabard.js): createFace(ctx) → { set(look), update(dt), dispose() }; defaultLook(body).
// Look fields (Chibi 2.6 shape, avatar-3d/js/chibi25-options.js ids): skin.color, hair.color, eyes.{id,color},
// brows.id, extras.id, facialHair.id.
import { tintSkin, PAINTED_SKIN } from './tabard.js';

export function defaultLook(body) {
  return body === 'female'
    ? { skin: { color: '#e7b48f' }, hair: { id: 'ponytail', color: '#5a3a22' }, eyes: { id: 'almond', color: '#5a3a22' }, brows: { id: 'soft' }, extras: { id: 'none' }, facialHair: { id: 'none' } }
    : { skin: { color: '#e7b48f' }, hair: { id: 'short', color: '#3b2618' }, eyes: { id: 'round', color: '#5a3a22' }, brows: { id: 'straight' }, extras: { id: 'none' }, facialHair: { id: 'short_beard' } };
}

/** Eye shapes: where the upper / lower lid edges sit (degrees above / below the eye's middle, at the front), and the
 *  tilt of the opening (degrees, + = outer corner up). `iris` scales the iris; `liner` the lash line; `wing` a flick. */
export const EYE_SHAPES = {
  round:     { up: 21, low: -23, tilt: 0,   iris: 1.0,  liner: 1.0 },
  almond:    { up: 12, low: -14, tilt: 6,   iris: 1.0,  liner: 1.15 },
  storybook: { up: 25, low: -22, tilt: 0,   iris: 1.12, liner: 1.25 },
  narrow:    { up: 5,  low: -9,  tilt: 3,   iris: 0.95, liner: 1.0 },
  sleepy:    { up: 0,  low: -15, tilt: -6,  iris: 1.0,  liner: 0.9, crease: 0.7 },
  doe:       { up: 27, low: -25, tilt: -3,  iris: 1.15, liner: 1.1 },
  sharp:     { up: 8,  low: -9,  tilt: 14,  iris: 0.95, liner: 1.3, wing: 0.6 },
  hooded:    { up: 7,  low: -16, tilt: 0,   iris: 1.0,  liner: 0.9, crease: 1.2 },
  cat:       { up: 11, low: -11, tilt: 18,  iris: 1.0,  liner: 1.35, wing: 1.0 },
};
/** Brows: shape of the line through inner → peak → outer and the hair in it. lift/peakLift in uv (v up = negative). */
export const BROW_STYLES = {
  straight: { width: 1.0, peak: 0.002,  inner: 0,      outer: 0,      density: 1.0, soft: 0.25 },
  arched:   { width: 0.9, peak: -0.012, inner: 0.004,  outer: 0.006,  density: 1.0, soft: 0.25 },
  thick:    { width: 1.55, peak: 0,     inner: 0,      outer: 0.002,  density: 1.35, soft: 0.3 },
  thin:     { width: 0.55, peak: -0.006, inner: 0,     outer: 0.004,  density: 0.8, soft: 0.15 },
  soft:     { width: 0.95, peak: -0.004, inner: 0,     outer: 0.003,  density: 0.7, soft: 0.6 },
  bushy:    { width: 1.7, peak: -0.002, inner: -0.002, outer: 0.004,  density: 1.6, soft: 0.2, wild: 1 },
  slanted:  { width: 1.0, peak: -0.002, inner: 0.012,  outer: -0.008, density: 1.0, soft: 0.25 },
  curved:   { width: 0.85, peak: -0.02, inner: 0.008,  outer: 0.012,  density: 0.95, soft: 0.25 },
};
/** Every face option with its player-facing name (the same ids + names as the games' Chibi 2.6 creators, e.g.
 *  Wyrmroad js/ui/looks.js LOOK) — a game's creator can list these as they are. */
export const FACE_OPTIONS = {
  skin: [['#f6d7bd', 'Fair'], ['#f0c9a8', 'Light'], ['#e7b48f', 'Warm'], ['#d59c74', 'Tan'], ['#c98e66', 'Olive'], ['#a9714c', 'Bronze'], ['#8d5a3c', 'Brown'], ['#5e3b28', 'Deep']],
  eyes: [['round', 'Round'], ['almond', 'Almond'], ['storybook', 'Storybook'], ['narrow', 'Narrow'], ['sleepy', 'Sleepy'], ['doe', 'Wide'], ['sharp', 'Sharp'], ['hooded', 'Hooded'], ['cat', 'Upswept']],
  eyeColor: [['#5a3a22', 'Brown'], ['#3a6a9a', 'Blue'], ['#4a7a4a', 'Green'], ['#8a6a3a', 'Hazel'], ['#6a6a7a', 'Grey'], ['#9a5a2a', 'Amber']],
  brows: [['straight', 'Straight'], ['arched', 'Arched'], ['thick', 'Thick'], ['thin', 'Thin'], ['soft', 'Soft'], ['bushy', 'Bushy'], ['slanted', 'Slanted'], ['curved', 'High curve']],
  extras: [['none', 'None'], ['freckles', 'Freckles'], ['freckles_nose', 'Freckles over the nose'], ['blush_soft', 'Soft blush'], ['scar', 'Scar'], ['scar_brow', 'Scar through the brow'], ['beauty_mark', 'Beauty mark'], ['warpaint', 'War paint'], ['star_mark', 'Star mark']],
  facialHair: [['none', 'None'], ['stubble', 'Stubble'], ['short_beard', 'Short beard'], ['full', 'Full beard'], ['goatee', 'Goatee'], ['mustache', 'Moustache'], ['mutton_chops', 'Mutton chops']],
};
export const FACIAL_HAIR = FACE_OPTIONS.facialHair.map(o => o[0]);
export const FACE_MARKS = FACE_OPTIONS.extras.map(o => o[0]);

const DATA = new Map(), BASES = new Map();
const rgb = h => { const n = parseInt(String(h || '#000').replace('#', ''), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const lerp2 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
/** Seeded random (the same look draws the same freckles every time). */
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export async function createFace(ctx) {
  const { THREE, body, bones, faceMesh, faceCanvas, faceTex, at } = ctx;
  if (!faceMesh || !faceCanvas) return { async set() {}, update() {}, dispose() {} };
  if (!DATA.has(body)) DATA.set(body, fetch(at(`models/${body}_face.json`)).then(r => r.json()));
  if (!BASES.has(body)) BASES.set(body, new Promise((ok, fail) => { const im = new Image(); im.onload = () => ok(im); im.onerror = fail; im.src = at(`models/${body}/face.webp`); }));
  const [F, baseImg] = await Promise.all([DATA.get(body), BASES.get(body)]);
  const S = faceCanvas.width, g = faceCanvas.getContext('2d', { willReadFrequently: true });
  const P = p => [p[0] * S, p[1] * S];                    // a landmark (uv, v down) → canvas pixels
  const U = F.uv, cm = S / (100 * F.layout.metres_per_uv);  // pixels per centimetre on the face

  // ------------------------------------------------------------------------------------------------ eyeballs + lids
  const head = bones.Head;
  const eyes = [];
  const irisCanvas = document.createElement('canvas'); irisCanvas.width = 64; irisCanvas.height = 256;
  const irisTex = new THREE.CanvasTexture(irisCanvas); irisTex.colorSpace = THREE.SRGBColorSpace;
  const eyeMat = new THREE.MeshPhongMaterial({ map: irisTex, shininess: 90, specular: 0x666666 });
  const lidMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const lowMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const V = (a) => new THREE.Vector3(...a);
  const avg = list => list.reduce((s, p) => s.add(V(p)), new THREE.Vector3()).multiplyScalar(1 / list.length);
  const LID_T = Math.PI * 0.62;                           // cap size; its rotation sets the front edge height
  function lidGeo(r, color) {
    const geo = new THREE.SphereGeometry(r, 28, 18, 0, Math.PI * 2, 0, LID_T);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) col.set(color, i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  }
  for (const side of ['l', 'r']) {
    const E = F.eyes[side];
    const fwd = V(E.forward).normalize();
    let x = V(E.outer).sub(V(E.inner)); x.sub(fwd.clone().multiplyScalar(x.dot(fwd))).normalize();
    let y = new THREE.Vector3().crossVectors(fwd, x), outerSign = 1;
    if (y.dot(avg(E.lid_upper).sub(V(E.centre))) < 0) { x.negate(); y = new THREE.Vector3().crossVectors(fwd, x); outerSign = -1; }
    // the eye's own frame: +Z looks out, +Y up, +X toward the outer corner
    const frame = new THREE.Group(); frame.name = 'eye-' + side;
    frame.position.copy(V(E.centre));
    frame.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, fwd));
    const roll = new THREE.Group(); frame.add(roll);                     // eye-shape tilt (outer corner up/down)
    const ball = new THREE.Mesh(new THREE.SphereGeometry(E.radius * 0.97, 24, 16).rotateX(Math.PI / 2), eyeMat);
    frame.add(ball);
    // +X points to the outer corner unless the frame had to be flipped to keep +Y up: a tilt raises the outer corner
    const tiltSign = outerSign;
    const up = new THREE.Mesh(lidGeo(E.radius * 1.07, [1, 1, 1]), lidMat);
    const low = new THREE.Mesh(lidGeo(E.radius * 1.05, [1, 1, 1]), lowMat);
    low.geometry.rotateZ(Math.PI);                                       // its cap points down
    roll.add(up, low);
    for (const m of [ball, up, low]) { m.frustumCulled = false; m.castShadow = false; m.renderOrder = 1; }
    head.add(frame);
    eyes.push({ side, frame, roll, up, low, tiltSign, radius: E.radius });
  }
  /** Front edge of a lid at elevation `deg` (degrees above the eye's middle): rotate the cap about the eye's side axis. */
  const setLid = (m, deg, lower = false) => {
    const e = deg * Math.PI / 180, base = Math.PI / 2 - LID_T;           // unrotated front-edge elevation (upper cap)
    // rotating about X by +ρ lowers every front point by ρ: upper cap edge sits at base, the lower cap's at -base
    m.rotation.x = lower ? -(base + e) : base - e;
  };

  function paintIris(colorHex, irisK) {
    const c = rgb(colorHex), H = irisCanvas.height, x = irisCanvas.getContext('2d');
    // rows from the front pole (row 0) back: pupil, iris (darker rim, lighter fibres round the pupil), limbal ring, white
    const pupil = 0.2 * irisK, iris = 0.5 * irisK;
    for (let row = 0; row < H; row++) {
      const t = (row + 0.5) / H * Math.PI;                               // angle from the front
      let col;
      if (t < pupil) col = [12, 10, 12];
      else if (t < iris) {
        const k = (t - pupil) / (iris - pupil);
        const inner = mix(c, [255, 240, 200], 0.22), outer = mix(c, [0, 0, 0], 0.45);
        col = k < 0.75 ? mix(inner, c, k / 0.75) : mix(c, outer, (k - 0.75) / 0.25);
      } else if (t < iris + 0.05) col = mix([30, 26, 28], [226, 222, 214], (t - iris) / 0.05);
      else col = mix([236, 232, 226], [200, 186, 180], Math.min(1, (t - iris) / 1.4));   // whites shade toward the back
      x.fillStyle = css(col); x.fillRect(0, row, irisCanvas.width, 1);
    }
    // fibres: thin radial streaks across the iris (columns = round the pole)
    const r = rng(c[0] * 7 + c[1] * 13 + c[2]);
    for (let i = 0; i < 90; i++) {
      const xx = r() * irisCanvas.width, y0 = pupil / Math.PI * H, y1 = iris / Math.PI * H;
      x.strokeStyle = css(r() < 0.5 ? mix(c, [255, 255, 255], 0.35) : mix(c, [0, 0, 0], 0.35), 0.35);
      x.lineWidth = 1; x.beginPath(); x.moveTo(xx, y0 + r() * 3); x.lineTo(xx + (r() - 0.5) * 2, y1 - r() * 6); x.stroke();
    }
    irisTex.needsUpdate = true;
  }

  // ------------------------------------------------------------------------------------------------ face painting
  let baseKey = '', basePx = null;
  function base(skinHex) {
    if (baseKey !== skinHex) {
      g.globalCompositeOperation = 'copy'; g.drawImage(baseImg, 0, 0, S, S); g.globalCompositeOperation = 'source-over';
      const im = g.getImageData(0, 0, S, S);
      tintSkin(im.data, null, rgb(PAINTED_SKIN), skinHex || PAINTED_SKIN);
      basePx = im; baseKey = skinHex;
    }
    g.putImageData(basePx, 0, 0);
  }
  const sample = (p, dv = 0) => { const [x, y] = P([p[0], p[1] + dv]); const d = g.getImageData(Math.round(x), Math.round(y), 1, 1).data; return [d[0], d[1], d[2]]; };
  const list = k => (Array.isArray(U[k]?.[0]) ? U[k] : [U[k]]);

  /** Short hair strokes inside a band: `along` = point on the centre line at t, `dir` = stroke direction at t. */
  function strokes(n, r, fn, color, alpha, width) {
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const s = fn(r()); if (!s) continue;
      const [x0, y0, x1, y1] = s;
      g.strokeStyle = css(mix(color, [0, 0, 0], r() * 0.35), alpha * (0.6 + r() * 0.4));
      g.lineWidth = width * (0.7 + r() * 0.6);
      g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + (r() - 0.5) * width * 2, (y0 + y1) / 2, x1, y1); g.stroke();
    }
  }

  function brows(id, hairC) {
    const B = BROW_STYLES[id] || BROW_STYLES.straight, col = mix(hairC, [0, 0, 0], 0.15);
    for (const side of ['l', 'r']) {
      const a = P(U['brow_inner_' + side]), p = P(U['brow_peak_' + side]), b = P(U['brow_outer_' + side]);
      a[1] += B.inner * S; p[1] += (B.peak) * S; b[1] += B.outer * S;
      const pt = t => {                                    // quadratic through inner → peak → outer
        const q0 = lerp2(a, p, t), q1 = lerp2(p, b, t); return lerp2(q0, q1, t);
      };
      const W = 0.55 * cm * B.width;                        // brow height in px
      const prof = t => W * (t < 0.15 ? 0.75 + t / 0.15 * 0.25 : 1 - Math.max(0, t - 0.55) / 0.45 * 0.65);
      const r = rng((side === 'l' ? 11 : 29) + id.length * 97);
      // soft underlayer so the strokes read as one shape from afar
      g.save(); g.filter = `blur(${Math.max(1, W * 0.35)}px)`;
      g.fillStyle = css(col, 0.28 + B.soft * 0.25);
      g.beginPath();
      for (let i = 0; i <= 20; i++) { const t = i / 20, q = pt(t); g.lineTo(q[0], q[1] - prof(t) * 0.5); }
      for (let i = 20; i >= 0; i--) { const t = i / 20, q = pt(t); g.lineTo(q[0], q[1] + prof(t) * 0.5); }
      g.fill(); g.restore();
      // hairs: rooted along the band, pointing toward the outer end and a little up (inner hairs point up)
      const n = Math.round(260 * B.density);
      const dirOut = Math.sign(b[0] - a[0]);
      strokes(n, r, u => {
        const t = u, q = pt(t), h = prof(t), off = (r() - 0.5) * h;
        const ang = t < 0.18 ? -Math.PI / 2 + dirOut * 0.4 : Math.atan2((pt(Math.min(1, t + 0.05))[1] - q[1]), (pt(Math.min(1, t + 0.05))[0] - q[0])) - dirOut * 0.25;
        const len = h * (0.9 + (B.wild ? r() * 0.9 : r() * 0.4));
        const x0 = q[0], y0 = q[1] + off;
        return [x0, y0, x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len];
      }, col, 0.75 * (1 - B.soft * 0.4), Math.max(1.2, cm * 0.07));
    }
  }

  function eyeLines(shape, hairC) {
    const E = EYE_SHAPES[shape] || EYE_SHAPES.round, lash = mix(hairC, [10, 8, 10], 0.75);
    for (const side of ['l', 'r']) {
      const up = list('lid_upper_' + side).map(P), lo = list('lid_lower_' + side).map(P);
      const outerFirst = Math.abs(up[0][0] - P(U['eye_outer_' + side])[0]) < Math.abs(up.at(-1)[0] - P(U['eye_outer_' + side])[0]);
      const ordered = outerFirst ? [...up].reverse() : up;   // inner → outer
      // socket shading + crease above the lid
      g.save(); g.filter = `blur(${cm * 0.25}px)`;
      g.strokeStyle = css([90, 50, 40], 0.22 * (E.crease || 0.6)); g.lineWidth = cm * 0.35;
      g.beginPath(); ordered.forEach((q, i) => (i ? g.lineTo : g.moveTo).call(g, q[0], q[1] - cm * (0.35 + (E.crease || 0) * 0.1))); g.stroke();
      g.restore();
      // lash line: thicker toward the outer corner, a flick for sharp / upswept eyes
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (let i = 1; i < ordered.length; i++) {
        const k = i / (ordered.length - 1);
        g.strokeStyle = css(lash, 0.85); g.lineWidth = cm * (0.06 + 0.1 * k) * E.liner;
        g.beginPath(); g.moveTo(...ordered[i - 1]); g.lineTo(...ordered[i]); g.stroke();
      }
      if (E.wing) {
        const o = ordered.at(-1), pr = ordered.at(-2), dx = o[0] - pr[0], dy = o[1] - pr[1], L = Math.hypot(dx, dy) || 1;
        g.lineWidth = cm * 0.1 * E.liner; g.beginPath(); g.moveTo(...o);
        g.lineTo(o[0] + dx / L * cm * 0.45 * E.wing, o[1] + dy / L * cm * 0.45 * E.wing - cm * 0.22 * E.wing); g.stroke();
      }
      g.strokeStyle = css(lash, 0.3); g.lineWidth = cm * 0.05;
      g.beginPath(); lo.forEach((q, i) => (i ? g.lineTo : g.moveTo).call(g, q[0], q[1])); g.stroke();
    }
  }

  /** Beard area outlines from the landmarks (both sides), as canvas paths. */
  function beardPath(kind) {
    const pth = new Path2D(), J = s => list('jaw_' + s).map(P);   // jaw points chin → ear
    const chinB = P(U.chin_bottom), lipU = P(U.lip_upper), sub = P(U.subnasale);
    const cheek = s => { const c = lerp2(P(U['cheekbone_' + s]), P(U['mouth_corner_' + s]), 0.62); c[1] += cm * 0.35; return c; };
    const corner = s => { const c = P(U['mouth_corner_' + s]); return c; };
    const under = (q, k = 1) => [q[0], q[1] + cm * 0.9 * k];        // a little under the jaw line
    const jawR = J('r'), jawL = J('l');
    if (kind === 'full' || kind === 'short_beard' || kind === 'stubble') {
      const k = kind === 'short_beard' ? 0.55 : 1;
      const sbR = P(U.sideburn_top_r), sbL = P(U.sideburn_top_l);
      const chR = kind === 'short_beard' ? lerp2(cheek('r'), P(U.sideburn_bottom_r), 0.25) : cheek('r');
      const chL = kind === 'short_beard' ? lerp2(cheek('l'), P(U.sideburn_bottom_l), 0.25) : cheek('l');
      pth.moveTo(...sbR); pth.lineTo(...chR);
      pth.lineTo(...lerp2(corner('r'), P(U.nostril_r), 0.55)); pth.lineTo(sub[0], sub[1] + cm * 0.15);
      pth.lineTo(...lerp2(corner('l'), P(U.nostril_l), 0.55)); pth.lineTo(...chL); pth.lineTo(...sbL);
      for (let i = jawL.length - 1; i >= 0; i--) pth.lineTo(...under(jawL[i], k));
      pth.lineTo(chinB[0], chinB[1] + cm * 1.1 * k);
      for (const q of jawR) pth.lineTo(...under(q, k));
      pth.closePath();
    } else if (kind === 'goatee') {
      const cR = corner('r'), cL = corner('l');
      pth.moveTo(cR[0] - cm * 0.1, cR[1] - cm * 0.2); pth.lineTo(...lerp2(cR, P(U.nostril_r), 0.6)); pth.lineTo(sub[0], sub[1] + cm * 0.15);
      pth.lineTo(...lerp2(cL, P(U.nostril_l), 0.6)); pth.lineTo(cL[0] + cm * 0.1, cL[1] - cm * 0.2);
      pth.lineTo(cL[0] + cm * 0.15, cL[1] + cm * 1.0); pth.lineTo(chinB[0] - (cR[0] - cL[0]) * 0.25, chinB[1] + cm * 0.6);
      pth.lineTo(chinB[0] + (cR[0] - cL[0]) * 0.25, chinB[1] + cm * 0.6); pth.lineTo(cR[0] - cm * 0.15, cR[1] + cm * 1.0); pth.closePath();
    }
    if (kind === 'mustache' || kind === 'mutton_chops') {
      const cR = corner('r'), cL = corner('l');
      pth.moveTo(cR[0] + (cR[0] - cL[0]) * 0.12, cR[1] + cm * 0.45); pth.lineTo(...lerp2(cR, P(U.nostril_r), 0.8));
      pth.lineTo(sub[0], sub[1] + cm * 0.05); pth.lineTo(...lerp2(cL, P(U.nostril_l), 0.8));
      pth.lineTo(cL[0] - (cR[0] - cL[0]) * 0.12, cL[1] + cm * 0.45); pth.lineTo(lipU[0], lipU[1] + cm * 0.02); pth.closePath();
    }
    if (kind === 'mutton_chops') {
      for (const s of ['r', 'l']) {
        const sb = P(U['sideburn_top_' + s]), ch = cheek(s), jaw = J(s), mc = corner(s);
        pth.moveTo(...sb); pth.lineTo(...ch); pth.lineTo(mc[0] + (s === 'r' ? 1 : -1) * cm * 0.3, mc[1] + cm * 0.5);
        const half = jaw.slice(Math.floor(jaw.length * 0.35));
        for (const q of half) pth.lineTo(...under(q, 0.8));
        pth.closePath();
      }
    }
    return pth;
  }

  function facialHair(id, hairC) {
    if (!id || id === 'none') return;
    const layer = document.createElement('canvas'); layer.width = layer.height = S;
    const L = layer.getContext('2d');
    const path = beardPath(id);
    const r = rng(id.length * 131 + 7);
    // fill the area with hair strokes pointing down the face (outward-down on the cheeks)
    const box = { x0: S, y0: S, x1: 0, y1: 0 };
    for (const k of Object.keys(U)) for (const q of list(k)) { const [x, y] = P(q); box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x); box.y1 = Math.max(box.y1, y + cm * 1.5); }
    box.y0 = P(U.nose_tip)[1];
    const mid = P(U.mouth)[0], col = mix(hairC, [0, 0, 0], 0.1);
    L.lineCap = 'round';
    if (id === 'stubble') {
      for (let i = 0; i < 9000; i++) {
        const x = box.x0 + r() * (box.x1 - box.x0), y = box.y0 + r() * (box.y1 - box.y0);
        if (!L.isPointInPath(path, x, y)) continue;
        L.fillStyle = css(mix(col, [0, 0, 0], r() * 0.3), 0.35 + r() * 0.25); L.fillRect(x, y, 1.6, 1.6);
      }
      L.fillStyle = css(col, 0.12); L.fill(path);
    } else {
      L.fillStyle = css(mix(col, [0, 0, 0], 0.15), 0.55); L.fill(path);               // dense underlayer
      const n = id === 'full' ? 5200 : id === 'mustache' ? 2200 : id === 'goatee' ? 2000 : 3600;
      for (let i = 0; i < n; i++) {
        const x = box.x0 + r() * (box.x1 - box.x0), y = box.y0 + r() * (box.y1 - box.y0);
        if (!L.isPointInPath(path, x, y)) continue;
        const side = Math.sign(x - mid) || 1, spread = Math.min(1, Math.abs(x - mid) / (box.x1 - mid + 1));
        const ang = Math.PI / 2 - side * (0.15 + spread * 0.55) + (r() - 0.5) * 0.5;
        const len = cm * (id === 'full' ? 0.5 : 0.32) * (0.6 + r() * 0.8);
        L.strokeStyle = css(r() < 0.25 ? mix(col, [255, 255, 255], 0.18) : mix(col, [0, 0, 0], r() * 0.35), 0.6 + r() * 0.35);
        L.lineWidth = Math.max(1.1, cm * 0.06);
        L.beginPath(); L.moveTo(x, y); L.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); L.stroke();
      }
    }
    // keep the lips clear, feather the edges
    const cR = P(U.mouth_corner_r), cL = P(U.mouth_corner_l), lu = P(U.lip_upper), ll = P(U.lip_lower);
    L.globalCompositeOperation = 'destination-out';
    L.beginPath(); L.ellipse((cR[0] + cL[0]) / 2, (lu[1] + ll[1]) / 2, Math.abs(cR[0] - cL[0]) / 2 * 0.92, Math.abs(ll[1] - lu[1]) / 2 * 0.8 + 1, 0, 0, Math.PI * 2); L.fill();
    L.globalCompositeOperation = 'source-over';
    g.save(); g.filter = `blur(${cm * 0.03}px)`; g.drawImage(layer, 0, 0); g.restore();
  }

  /** Painted hairline on the skin under the hair layer's edge: short hairs in the hair colour along the landmark
   *  hairline, solid above it and fading down the forehead, so the gaps between the hair shell's strand tips show hair,
   *  not bare skin (the 'comb teeth' fringe, owner review 2026-11-23). density 0 = none (bald), < 1 = shaved / short. */
  function hairline(hairC, density) {
    if (!(density > 0)) return;
    const line = list('hairline').map(P), col = mix(hairC, [0, 0, 0], 0.12), r = rng(977);
    if (line.length < 2) return;
    const at = t => { const f = t * (line.length - 1), i = Math.min(line.length - 2, Math.floor(f)); return lerp2(line[i], line[i + 1], f - i); };
    const drop = cm * 0.55, up = cm * 2.2;
    // soft band: hair colour above the line, fading out just below it
    g.save(); g.filter = `blur(${cm * 0.18}px)`;
    for (let i = 0; i <= 60; i++) {
      const q = at(i / 60), gr = g.createLinearGradient(q[0], q[1] - up, q[0], q[1] + drop);
      gr.addColorStop(0, css(col, 0.9 * density)); gr.addColorStop(up / (up + drop), css(col, 0.55 * density)); gr.addColorStop(1, css(col, 0));
      g.fillStyle = gr; g.fillRect(q[0] - cm * 0.35, q[1] - up, cm * 0.7, up + drop);
    }
    g.restore();
    // single hairs crossing the line, pointing down and out from the middle of the forehead
    const mid = P(U.nose_bridge)[0];
    strokes(Math.round(1400 * density), r, u => {
      const q = at(u), side = Math.sign(q[0] - mid) || 1, y = q[1] - r() * up * 0.6;
      const ang = Math.PI / 2 - side * (0.25 + r() * 0.35), len = cm * (0.25 + r() * 0.45);
      return [q[0] + (r() - 0.5) * cm * 0.2, y, q[0] + Math.cos(ang) * len, y + Math.sin(ang) * len];
    }, col, 0.55 * density, Math.max(1, cm * 0.05));
  }
  /** How much painted hairline a hair style wants (shaved sides and buzz cuts get a lighter one). */
  const HAIRLINE = { bald: 0, buzz: 0.55, undercut: 0.6, mohawk: 0.35 };

  function marks(id, look) {
    if (!id || id === 'none') return;
    const r = rng(id.length * 53 + 3), cb = s => P(U['cheekbone_' + s]), nose = P(U.nose_bridge), tip = P(U.nose_tip);
    const dot = (x, y, rad, c, a) => { g.fillStyle = css(c, a); g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill(); };
    const freckleC = [150, 82, 52];
    if (id === 'freckles' || id === 'freckles_nose') {
      const spots = id === 'freckles' ? [lerp2(cb('l'), nose, 0.35), lerp2(cb('r'), nose, 0.35), lerp2(nose, tip, 0.5)] : [lerp2(nose, tip, 0.45)];
      const spread = id === 'freckles' ? cm * 1.5 : cm * 1.1;
      for (const c of spots) for (let i = 0; i < (id === 'freckles' ? 70 : 60); i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * spread;
        dot(c[0] + Math.cos(a) * d * 1.3, c[1] + Math.sin(a) * d * 0.6, cm * (0.03 + r() * 0.05), freckleC, 0.35 + r() * 0.3);
      }
    } else if (id === 'blush_soft') {
      for (const s of ['l', 'r']) { const c = lerp2(cb(s), P(U['mouth_corner_' + s]), 0.3), gr = g.createRadialGradient(c[0], c[1], 0, c[0], c[1], cm * 1.6);
        gr.addColorStop(0, 'rgba(220,90,90,0.28)'); gr.addColorStop(1, 'rgba(220,90,90,0)'); g.fillStyle = gr; g.fillRect(c[0] - cm * 2, c[1] - cm * 2, cm * 4, cm * 4); }
    } else if (id === 'scar' || id === 'scar_brow') {
      const [a, b] = id === 'scar'
        ? [lerp2(cb('l'), P(U.eye_outer_l), 0.2), lerp2(P(U.mouth_corner_l), cb('l'), 0.25)]
        : [[P(U.brow_peak_r)[0] - cm * 0.1, P(U.brow_peak_r)[1] - cm * 0.6], [P(U.brow_peak_r)[0] + cm * 0.25, P(U.lid_upper_r[3] || U.eye_r)[1] - cm * 0.25]];
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(120,50,45,0.45)'; g.lineWidth = cm * 0.2; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
      g.strokeStyle = 'rgba(235,190,175,0.85)'; g.lineWidth = cm * 0.09; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
      for (let i = 1; i < 4; i++) { const m = lerp2(a, b, i / 4), dx = b[1] - a[1], dy = a[0] - b[0], L = Math.hypot(dx, dy) || 1;
        g.strokeStyle = 'rgba(200,140,130,0.6)'; g.lineWidth = cm * 0.04; g.beginPath(); g.moveTo(m[0] - dx / L * cm * 0.15, m[1] - dy / L * cm * 0.15); g.lineTo(m[0] + dx / L * cm * 0.15, m[1] + dy / L * cm * 0.15); g.stroke(); }
    } else if (id === 'beauty_mark') {
      const c = P(U.mouth_corner_l); dot(c[0] + cm * 0.35, c[1] - cm * 0.55, cm * 0.09, [70, 40, 30], 0.85);
    } else if (id === 'warpaint') {
      const paint = rgb(look?.extras?.color || '#2a4a8a');
      g.lineCap = 'round';
      for (const s of ['l', 'r']) {
        const e = P(U['eye_outer_' + s]), c = cb(s), dir = Math.sign(e[0] - P(U['eye_inner_' + s])[0]);
        for (let i = 0; i < 3; i++) {
          g.strokeStyle = css(paint, 0.8); g.lineWidth = cm * (0.32 - i * 0.06);
          const y = c[1] - cm * 0.2 + i * cm * 0.45;
          g.beginPath(); g.moveTo(c[0] - dir * cm * 1.0, y - cm * 0.1); g.lineTo(c[0] + dir * cm * 1.3, y + cm * 0.15); g.stroke();
        }
      }
    } else if (id === 'star_mark') {
      const c = lerp2(P(U.eye_outer_r), cb('r'), 0.55), R = cm * 0.42;
      g.fillStyle = 'rgba(60,70,140,0.85)'; g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * 0.42 : R; g.lineTo(c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr); }
      g.closePath(); g.fill();
    }
  }

  // ------------------------------------------------------------------------------------------------ apply a look
  let shape = EYE_SHAPES.round, blinkT = 2 + Math.random() * 3, blink = 0, version = 0;
  async function set(look) {
    const v = ++version;
    const L = look || defaultLook(body);
    const skin = L.skin?.color || PAINTED_SKIN, hairC = rgb(L.hair?.color || '#3b2618');
    base(skin);
    if (v !== version) return;
    shape = EYE_SHAPES[L.eyes?.id] || EYE_SHAPES.round;
    // lids take the skin just above each eye (after tinting), a darker lash rim along the edge
    for (const e of eyes) {
      const sk = sample(U['eye_' + e.side], -0.035), rim = mix(hairC, [12, 10, 10], 0.7);
      for (const [m, edge] of [[e.up, rim], [e.low, mix(sk, rim, 0.35)]]) {
        const pos = m.geometry.attributes.position, col = m.geometry.attributes.color, R = e.radius;
        for (let i = 0; i < pos.count; i++) {
          // how close this vertex is to the cap's rim (the lid edge): 0 at the pole, 1 at the rim
          const yy = m === e.low ? -pos.getY(i) : pos.getY(i), th = Math.acos(Math.max(-1, Math.min(1, yy / (R * (m === e.up ? 1.07 : 1.05)))));
          const k = th / LID_T, c = k > 0.93 ? edge : k > 0.86 ? mix(sk, edge, (k - 0.86) / 0.07) : mix(sk, mix(sk, [0, 0, 0], 0.12), 1 - k);
          col.setXYZ(i, ...c.map(x => (x / 255) ** 2.2));
        }
        col.needsUpdate = true;
      }
      e.roll.rotation.z = e.tiltSign * shape.tilt * Math.PI / 180;
    }
    paintIris(L.eyes?.color || '#5a3a22', shape.iris);
    eyeLines(L.eyes?.id || 'round', hairC);
    hairline(hairC, HAIRLINE[L.hair?.id] ?? (L.hair?.id ? 1 : 0));
    brows(L.brows?.id || 'straight', hairC);
    facialHair(L.facialHair?.id, hairC);
    marks(L.extras?.id, L);
    faceTex.needsUpdate = true;
    applyLids(0);
  }
  function applyLids(close) {
    for (const e of eyes) {
      const up = shape.up + (shape.low + 4 - shape.up) * close;          // a blink brings the upper lid down to the lower
      setLid(e.up, up); setLid(e.low, shape.low, true);
    }
  }
  return {
    set,
    update(dt) {
      blinkT -= dt;
      if (blinkT <= 0) { blink = 0.16; blinkT = 2.5 + Math.random() * 3.5; }
      if (blink > 0) { blink = Math.max(0, blink - dt); const k = blink / 0.16; applyLids(Math.sin(k * Math.PI)); }
    },
    eyes: () => eyes.map(e => e.frame),
    dispose() {
      for (const e of eyes) { e.frame.removeFromParent(); for (const m of [e.up, e.low]) m.geometry.dispose(); e.frame.children[1]?.geometry?.dispose(); }
      eyeMat.dispose(); lidMat.dispose(); lowMat.dispose(); irisTex.dispose();
    },
  };
}
