// A HELD beam (owner feedback 10, Y20, report #19: "Storm Beam … a pulsing laser — several hits over a few seconds
// in a constant beam").
//
// The rules send a channelled beam as one thing that lasts (js/rules/cast-skills.js `startChannel`):
//
//   fx beam      { id, skill, el, x, z, yaw, len, w, ms, pulses, every, move? }     it starts
//   fx beamPulse { id, skill, n, of }                                               a pulse lands (damage follows)
//   fx spell     { id, ab, shape:'beam', x, z, to:{x,z}, len, w }                   that pulse's real line (a wall cuts it)
//   fx beamEnd   { id, skill, why: done|released|moved|dead }                       it stops
//
// and the client drew only the per-pulse flash. This draws ONE beam for the whole time: it leaves the caster's hand
// every frame (so it walks and turns with them), runs along the line the last pulse really struck, flares on every
// pulse with a bright front running down it, and goes the moment it ends or its caster dies or leaves.
//
// What it is made of (no glowing spheres): a soft sheath and a hot core — two crossed strips each, so it reads from
// above and from the side — and three jagged strands that are re-drawn twenty times a second, the same look as
// avatar-3d's lightning bolts. Additive. Every geometry and material is made ONCE per rig, rigs are pooled, and the
// first rig exists from boot so the warm-up compiles its two programs (`sample()`): a pulse writes vertex positions and
// uniforms, nothing is created, disposed or linked in play.
//
//   const beams = createBeams(scene, { camera, actors, groundY })
//   beams.onFx(ev)        // beam | beamPulse | beamEnd
//   beams.aim(ev)         // an `fx spell shape:'beam'` — true when a held beam took it (the caller skips its own flash)
//   beams.drop(casterId)  // the caster died / left
//   beams.update(dt)

import * as THREE from 'three';

/** Sheath colour, strand colour and core colour for an element. */
export const BEAM_COLOURS = {
  lightning: ['#4f66ff', '#ffe95a', '#f4f6ff'], storm: ['#4f66ff', '#ffe95a', '#f4f6ff'],
  fire: ['#ff5a10', '#ffb040', '#fff2c0'], ice: ['#3f9cff', '#aee6ff', '#ffffff'], frost: ['#3f9cff', '#aee6ff', '#ffffff'],
  holy: ['#ffd060', '#ffe9a8', '#ffffff'], arcane: ['#9b5cff', '#d8a8ff', '#ffffff'], shadow: ['#6a3ac0', '#b066ff', '#f0e0ff'],
  poison: ['#3aa020', '#9ef06a', '#f0ffe0'], nature: ['#3aa020', '#9ef06a', '#f0ffe0'], physical: ['#b0b0c0', '#e8e8f0', '#ffffff'],
};
export const beamColours = el => BEAM_COLOURS[String(el || '').toLowerCase()] || BEAM_COLOURS.arcane;

const STRANDS = 3, SEGS = 28, REDRAW_MS = 50, FADE_MS = 160, GRACE_MS = 700;

/**
 * The beam's state with no drawing in it — what a node test asks. One record per caster.
 *   start(ev, now) / pulse(ev, now) / aim(ev) / end(ev, now) / drop(id) / tick(now, alive)
 * A record: { id, skill, el, yaw, len, w, pulses, n, pulseAt, until, endAt (fading since), move }
 */
export function createBeamBook() {
  const live = new Map();
  const yawOf = (x, z, to) => Math.atan2(to.x - x, to.z - z);
  return {
    live,
    start(ev, now) {
      const b = { id: ev.id, skill: ev.skill ?? null, el: ev.el || ev.element || 'arcane', yaw: +ev.yaw || 0, len: Math.max(1, +ev.len || 20), w: Math.max(0.2, +ev.w || 1),
        pulses: ev.pulses | 0, n: 0, pulseAt: -1e9, startAt: now, until: now + Math.max(200, +ev.ms || 2000) + GRACE_MS, endAt: 0, move: !!ev.move, why: null };
      live.set(ev.id, b);
      return b;
    },
    pulse(ev, now) { const b = live.get(ev.id); if (!b || b.endAt) return null; b.n = ev.n | 0 || b.n + 1; b.pulseAt = now; return b; },
    /** That pulse's own line: the facing and the length the rules really used (shorter at a dungeon wall). */
    aim(ev) {
      const b = live.get(ev.id); if (!b || b.endAt || ev.shape !== 'beam') return null;
      if (b.skill != null && ev.ab != null && ev.ab !== b.skill) return null;
      if (ev.to && Number.isFinite(ev.x) && Number.isFinite(ev.to.x)) { const L = Math.hypot(ev.to.x - ev.x, ev.to.z - ev.z); if (L > 0.5) { b.yaw = yawOf(ev.x, ev.z, ev.to); b.len = L; } }
      else if (Number.isFinite(ev.yaw)) b.yaw = ev.yaw;
      if (Number.isFinite(ev.len) && ev.len > 0.5) b.len = ev.len;
      return b;
    },
    end(ev, now) { const b = live.get(ev.id); if (!b) return null; if (!b.endAt) { b.endAt = now; b.why = ev.why || 'done'; } return b; },
    /** The caster died or left: gone at once, no fade. */
    drop(id) { return live.delete(id); },
    /** Once a frame. `alive(id)` = is that caster still standing on this screen? -> ids that were removed. */
    tick(now, alive = () => true) {
      const gone = [];
      for (const [id, b] of live) {
        if (!alive(id)) { live.delete(id); gone.push(id); continue; }
        if (!b.endAt && now > b.until) { b.endAt = now; b.why = 'timeout'; }       // a lost `beamEnd` cannot leave a beam burning
        if (b.endAt && now - b.endAt >= FADE_MS) { live.delete(id); gone.push(id); }
      }
      return gone;
    },
    /** 0..1: how bright the pulse flare is now (1 on the frame it lands, gone 0.3 s later). */
    flare(b, now) { return Math.max(0, 1 - (now - b.pulseAt) / 300); },
    /** 0..1: the beam's own opacity (quick in, fading out once ended). */
    fade(b, now) { return b.endAt ? Math.max(0, 1 - (now - b.endAt) / FADE_MS) : Math.min(1, (now - b.startAt) / 90); },
  };
}

function softTexture() {
  // bright along the middle, soft to nothing at the long edges, and a short taper at both ends (a DataTexture: no canvas,
  // so the module also loads where there is no document — the node tests build the whole spell runtime)
  const W = 64, H = 32, data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const across = 1 - Math.abs((y + 0.5) / H * 2 - 1), along = Math.min(1, (x + 0.5) / 5, (W - x - 0.5) / 9);
    const v = Math.pow(Math.max(0, across), 1.8) * Math.max(0, along), i = (y * W + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255; data[i + 3] = Math.round(255 * v);
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}
/** A strip one unit long along +z (from 0 to 1) and one unit wide, lying flat (`flat`) or standing on edge. */
function stripGeometry(flat) {
  const g = new THREE.PlaneGeometry(1, 1);      // x: length (uv.x), y: width (uv.y)
  g.rotateY(-Math.PI / 2);                      // length now along +z … -z; width along y
  if (flat) g.rotateZ(Math.PI / 2);             // width along x
  g.translate(0, 0, 0.5);
  return g;
}

export function createBeams(scene, { camera = null, actors = null, groundY = () => 0 } = {}) {
  const book = createBeamBook();
  const group = new THREE.Group(); group.name = 'held-beams'; scene.add(group);
  const tex = softTexture();
  const geoFlat = stripGeometry(true), geoEdge = stripGeometry(false);
  const softMat = () => new THREE.MeshBasicMaterial({ map: tex, color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const lineMat = () => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const rigs = new Map(), spare = [];          // caster id -> rig
  const stats = { rigs: 0, started: 0, pulses: 0, ended: 0 };
  const _o = new THREE.Vector3(), _c = new THREE.Vector3(), _side = new THREE.Vector3();

  function makeRig() {
    stats.rigs++;
    const g = new THREE.Group(); g.visible = false;
    const sheathM = softMat(), coreM = softMat(), frontM = softMat(), strandM = lineMat();
    const mk = (geo, mat, order) => { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = order; g.add(m); return m; };
    const sheath = [mk(geoFlat, sheathM, 4), mk(geoEdge, sheathM, 4)];
    const core = [mk(geoFlat, coreM, 5), mk(geoEdge, coreM, 5)];
    const front = [mk(geoFlat, frontM, 6), mk(geoEdge, frontM, 6)];
    // the strands: one ribbon each, (SEGS + 1) pairs of vertices re-written in place
    const strands = [];
    for (let s = 0; s < STRANDS; s++) {
      const geo = new THREE.BufferGeometry(), idx = [];
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEGS + 1) * 2 * 3), 3));
      for (let i = 0; i < SEGS; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      geo.setIndex(idx);
      const m = new THREE.Mesh(geo, strandM); m.frustumCulled = false; m.renderOrder = 6; g.add(m);
      strands.push({ m, pos: geo.attributes.position, pts: new Float32Array((SEGS + 1) * 2) });
    }
    group.add(g);
    return { g, sheath, core, front, strands, sheathM, coreM, frontM, strandM, redrawAt: 0, yaw: 0, len: 1, seed: 1 + rigs.size * 7.3 };
  }
  spare.push(makeRig());                         // exists from boot: the warm-up compiles its programs

  function take(id) {
    let r = rigs.get(id);
    if (!r) { r = spare.pop() || makeRig(); rigs.set(id, r); }
    return r;
  }
  function free(id) { const r = rigs.get(id); if (!r) return; r.g.visible = false; rigs.delete(id); spare.push(r); stats.ended++; }

  /** Where the beam leaves: the casting hand when the body is on show, else chest height just ahead of the body. */
  function origin(a, yaw, out) {
    const hand = !a.shape && a.lod !== 'far' ? a.body?.parts?.handR : null;
    if (hand && hand.isObject3D) { hand.getWorldPosition(out); if (Number.isFinite(out.y) && Math.hypot(out.x - a.group.position.x, out.z - a.group.position.z) < 3) return out; }
    return out.set(a.group.position.x + Math.sin(yaw) * 0.45, a.group.position.y + Math.max(0.6, (a.height || 1.6) * 0.62), a.group.position.z + Math.cos(yaw) * 0.45);
  }

  /** Re-draw the jagged strands in the rig's own frame (+z down the beam). `amp` = how wild, in metres. */
  function redraw(r, len, amp, width) {
    // the ribbons face the camera: their width runs along (beam direction x direction to the camera), in the rig's frame
    let sx = 1, sy = 0;
    if (camera) {
      _c.copy(camera.position).sub(r.g.position); const c = Math.cos(-r.yaw), s = Math.sin(-r.yaw);
      const lx = _c.x * c + _c.z * s, ly = _c.y;      // the camera in the rig's frame, across the beam (x) and up (y)
      const n = Math.hypot(lx, ly) || 1; sx = -ly / n; sy = lx / n;
    }
    for (let k = 0; k < r.strands.length; k++) {
      const st = r.strands[k], p = st.pos, turn = k * 2.1 + r.seed;
      for (let i = 0; i <= SEGS; i++) {
        const u = i / SEGS, z = u * len, ends = Math.min(1, u * 6, (1 - u) * 5);
        // a slow twist round the core plus a fresh kink each redraw; pinned at the hand and at the far end
        const a = turn + u * 9 + (Math.random() - 0.5) * 2.2, rad = (0.16 + Math.random() * amp) * ends;
        const x = Math.cos(a) * rad, y = Math.sin(a) * rad, w = width * (0.6 + 0.4 * ends) * 0.5;
        p.setXYZ(i * 2, x - sx * w, y - sy * w, z); p.setXYZ(i * 2 + 1, x + sx * w, y + sy * w, z);
      }
      p.needsUpdate = true;
    }
  }

  function draw(b, r, now, dt) {
    const a = actors?.get(b.id); if (!a) return false;
    // ease to the line the rules last struck along (a snap on every pulse reads as a stutter)
    let d = (b.yaw - r.yaw) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
    r.yaw = r.fresh ? b.yaw : r.yaw + d * Math.min(1, dt * 14);
    r.len = r.fresh ? b.len : r.len + (b.len - r.len) * Math.min(1, dt * 14);
    r.fresh = false;
    origin(a, r.yaw, _o);
    r.g.position.copy(_o); r.g.rotation.set(0, r.yaw, 0); r.g.visible = true;
    const flare = book.flare(b, now), fade = book.fade(b, now), hum = 0.5 + 0.5 * Math.sin(now / 38 + r.seed), len = Math.max(1, r.len);
    const [cs, cj, cc] = beamColours(b.el);
    r.sheathM.color.set(cs); r.strandM.color.set(cj); r.coreM.color.set(cc); r.frontM.color.set(cc);
    // the sheath: about as wide as the damage really reaches at its brightest part, soft outside it
    const sw = Math.min(3.2, Math.max(0.9, b.w * 0.9)) * (1 + 0.35 * flare);
    for (const m of r.sheath) m.scale.set(sw, sw, len);
    r.sheathM.opacity = (0.42 + 0.08 * hum + 0.3 * flare) * fade;
    const cw = (0.17 + 0.03 * hum) * (1 + 1.3 * flare);
    for (const m of r.core) m.scale.set(cw, cw, len);
    r.coreM.opacity = (0.7 + 0.3 * flare) * fade;
    // the pulse front: a short hot slug that runs the length of the beam in a quarter of a second
    const k = (now - b.pulseAt) / 250, fl = Math.min(len, 5);
    const on = k >= 0 && k < 1;
    for (const m of r.front) { m.visible = on; if (on) { m.position.z = k * (len - fl); m.scale.set(cw * 2.6, cw * 2.6, fl); } }
    r.frontM.opacity = on ? (1 - k * 0.6) * fade : 0;
    r.strandM.opacity = (0.7 + 0.3 * flare) * fade;
    if (now >= r.redrawAt) { r.redrawAt = now + REDRAW_MS; redraw(r, len, 0.26 + 0.4 * flare, 0.07 + 0.05 * flare); }
    return true;
  }

  return {
    book, stats, group,
    get count() { return book.live.size; },
    onFx(ev, now = performance.now()) {
      if (ev.kind === 'beam') { const b = book.start(ev, now); const r = take(ev.id); r.fresh = true; r.redrawAt = 0; stats.started++; return b; }
      if (ev.kind === 'beamPulse') { const b = book.pulse(ev, now); if (b) stats.pulses++; return b; }
      if (ev.kind === 'beamEnd') return book.end(ev, now);
      return null;
    },
    aim(ev) { return !!book.aim(ev); },
    drop(id) { if (book.drop(id)) free(id); },
    update(dt, now = performance.now()) {
      for (const id of book.tick(now, id => { const a = actors?.get(id); return !!a && !a.dead; })) free(id);
      for (const [id, b] of book.live) { const r = rigs.get(id); if (r && !draw(b, r, now, dt)) { book.drop(id); free(id); } }
    },
    /** One rig, lit, for the boot shader warm-up (warmup.js `extras`): a mapped and an unmapped additive basic material. */
    sample() {
      const g = new THREE.Group();
      const a = softMat(), b = lineMat(); a.opacity = b.opacity = 0.5;
      g.add(new THREE.Mesh(geoFlat, a), new THREE.Mesh(geoEdge, b));
      return g;
    },
    dispose() { scene.remove(group); tex.dispose(); geoFlat.dispose(); geoEdge.dispose(); },
  };
}
