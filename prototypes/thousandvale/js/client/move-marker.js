// Where you are heading (play-test 9, X2 / report S#50: "click-to-move shows a marker on the ground where you are
// heading"). A gold ring with four small chevrons pointing in at its middle and a pulse that closes on it, lying ON the
// ground where you clicked or tapped (tilted to the slope there). It follows `controls.moveGoal` and nothing else, so
// every way a goal ends ends the marker too: you arrive, you steer with the keys or a stick, auto-run starts, you attack,
// you die, Esc — and a new click moves it (the old one fades where it lay while the new one comes up).
//
// Also here, because it is the same drawing in another colour: `ping(x, z)` — a short-lived ring with a bobbing arrow
// over it, used for the gate a raid wave is walking in through (A's `eventTrack.gate {id, x, z}`).
//
// Two pooled meshes for the goal and two for pings, built once; ONE material (cloned for colour: a clone shares the
// compiled program), compiled in the boot warm-up through `sample()`. Nothing is created, disposed or linked in play.
//
//   const mark = createMoveMarker(scene, { groundY, goal: () => controls.moveGoal })
//   mark.update(dt)        mark.ping(x, z, { ms, colour })        mark.sample()        mark.stats

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** The interface's gold (css --gold-hi). */
export const MARK_GOLD = '#f1d595';
export const PING_RED = '#ff8a4a';
export const MARK = { radius: 0.72, lift: 0.08, fadeIn: 0.12, fadeOut: 0.35, pulseSec: 1.1, arriveAt: 0.5 };

/**
 * Pure: what the marker should do this frame. `goal` = the controls' move goal ({x, z} or null), `shown` = the goal the
 * marker is lying at now (or null). -> 'keep' | 'hide' | 'move' (a new spot: fade the old, raise the new) | 'show'.
 */
export function markerStep(goal, shown) {
  if (!goal) return shown ? 'hide' : 'keep';
  if (!shown) return 'show';
  return Math.hypot(goal.x - shown.x, goal.z - shown.z) > 0.05 ? 'move' : 'keep';
}
/** Pure: the ground's unit normal at (x, z) from four height samples `e` metres out. -> [nx, ny, nz]. */
export function groundNormal(groundY, x, z, e = 0.6) {
  const dx = (groundY(x - e, z) - groundY(x + e, z)) / (2 * e), dz = (groundY(x, z - e) - groundY(x, z + e)) / (2 * e);
  const l = Math.hypot(dx, 1, dz) || 1;
  return [dx / l, 1 / l, dz / l];
}

function flat(g) { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); n.deleteAttribute('normal'); return n; }
/** The marker, lying in the xz plane: a ring, a thin outer ring (the pulse scales the whole mesh), four chevrons. */
function markerGeometry(r = MARK.radius) {
  const parts = [];
  const ring = new THREE.RingGeometry(r * 0.78, r, 40);      // (a thin ring was lost on grass in the first screenshot) ring.rotateX(-Math.PI / 2); parts.push(flat(ring));
  const dot = new THREE.CircleGeometry(r * 0.14, 12); dot.rotateX(-Math.PI / 2); parts.push(flat(dot));
  for (let k = 0; k < 4; k++) {
    // a chevron pointing at the middle: a small triangle whose tip is nearer the centre
    const s = new THREE.Shape(); s.moveTo(0, r * 0.26); s.lineTo(r * 0.2, r * 0.64); s.lineTo(0, r * 0.52); s.lineTo(-r * 0.2, r * 0.64); s.closePath();
    const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2); g.rotateY(k * Math.PI / 2 + Math.PI / 4); parts.push(flat(g));
  }
  return mergeGeometries(parts);
}
function pulseGeometry(r = MARK.radius) { const g = new THREE.RingGeometry(r * 1.48, r * 1.62, 40); g.rotateX(-Math.PI / 2); return flat(g); }
/** The arrow that hangs over a ping: a shaft and a head pointing DOWN at the ground. */
function arrowGeometry() {
  const shaft = new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6); shaft.translate(0, 1.25, 0);
  const head = new THREE.ConeGeometry(0.3, 0.7, 8); head.rotateX(Math.PI); head.translate(0, 0.35, 0);
  return mergeGeometries([flat(shaft), flat(head)]);
}

export function createMoveMarker(scene, { groundY = () => 0, goal = () => null } = {}) {
  const group = new THREE.Group(); group.name = 'move-marker'; scene.add(group);
  const base = new THREE.MeshBasicMaterial({ color: MARK_GOLD, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const geoMark = markerGeometry(), geoPulse = pulseGeometry(), geoArrow = arrowGeometry();
  const _up = new THREE.Vector3(0, 1, 0), _n = new THREE.Vector3();
  function make(colour, withArrow) {
    const root = new THREE.Group(); root.visible = false;
    const mat = base.clone(); mat.color.set(colour);
    const body = new THREE.Mesh(geoMark, mat), pulse = new THREE.Mesh(geoPulse, mat);
    body.renderOrder = pulse.renderOrder = 5; body.frustumCulled = pulse.frustumCulled = false;
    root.add(body, pulse);
    let arrow = null;
    if (withArrow) { arrow = new THREE.Mesh(geoArrow, mat); arrow.renderOrder = 5; arrow.frustumCulled = false; root.add(arrow); }
    group.add(root);
    return { root, mat, body, pulse, arrow, at: null, k: 0, want: 0, t: 0, until: 0 };
  }
  const goals = [make(MARK_GOLD, false), make(MARK_GOLD, false)], pings = [make(PING_RED, true), make(PING_RED, true)];
  let cur = null;                      // the goal marker that is up
  const stats = { shown: 0, moved: 0, hidden: 0, pings: 0 };

  function lay(it, x, z, scale = 1) {
    const y = groundY(x, z), n = groundNormal(groundY, x, z);
    it.root.position.set(x + n[0] * MARK.lift, y + MARK.lift, z + n[2] * MARK.lift);
    it.root.quaternion.setFromUnitVectors(_up, _n.set(n[0], n[1], n[2]));
    if (it.arrow) it.arrow.quaternion.copy(it.root.quaternion).invert();       // the arrow stays upright on a slope
    it.root.scale.setScalar(scale);
    it.at = { x, z }; it.t = 0;
  }
  function tick(it, dt) {
    it.t += dt;
    it.k += ((it.want ? 1 : 0) - it.k) * Math.min(1, dt / (it.want ? MARK.fadeIn : MARK.fadeOut) * 2.2);
    if (!it.want && it.k < 0.02) { it.k = 0; it.root.visible = false; it.at = it.want ? it.at : null; return; }
    it.root.visible = true;
    // the outer ring closes on the marker and fades as it does, once every `pulseSec`
    const p = (it.t % MARK.pulseSec) / MARK.pulseSec;
    it.pulse.scale.setScalar(1 - 0.42 * p);
    it.body.rotation.y = it.t * 0.6;
    if (it.arrow) it.arrow.position.y = 0.55 + Math.sin(it.t * 4) * 0.12;      // (in the ring's own scale: about 1.5 m over the ground — at 2.2 it hung out of sight above the gate)
    it.mat.opacity = it.k * (0.88 + 0.12 * Math.sin(it.t * 5));
  }

  return {
    group, stats,
    /** Every frame. */
    update(dt) {
      const g = goal(), step = markerStep(g, cur?.want ? cur.at : null);
      if (step === 'hide') { cur.want = 0; cur = null; stats.hidden++; }
      else if (step === 'show' || step === 'move') {
        if (cur) cur.want = 0;                                   // the old spot fades where it lies
        const next = goals.find(it => it !== cur && !it.want) || goals[0];
        lay(next, g.x, g.z); next.want = 1; next.k = Math.min(next.k, 0.2); cur = next;
        stats[step === 'show' ? 'shown' : 'moved']++;
      }
      for (const it of goals) if (it.want || it.k > 0) tick(it, dt);
      const now = performance.now();
      for (const it of pings) { if (it.want && now > it.until) it.want = 0; if (it.want || it.k > 0) tick(it, dt); }
    },
    /** A short-lived marker with an arrow over it (the gate a raid is coming through). */
    ping(x, z, { ms = 9000, colour = PING_RED, scale = 2.6 } = {}) {
      const it = pings.find(p => !p.want) || pings[0];
      it.mat.color.set(colour); lay(it, x, z, scale); it.want = 1; it.until = performance.now() + ms; stats.pings++;
      return it;
    },
    /** What is up now (specs): the goal marker's place and how solid it is. */
    state() { return { goal: cur ? { x: cur.at.x, y: cur.root.position.y, z: cur.at.z, opacity: +cur.mat.opacity.toFixed(2), visible: cur.root.visible } : null, visible: goals.filter(g => g.root.visible).length, pings: pings.filter(p => p.root.visible).length }; },
    /** One of each mesh, visible, for the boot shader warm-up. */
    sample() { const g = new THREE.Group(); const m = base.clone(); m.opacity = 0.5; g.add(new THREE.Mesh(geoMark, m), new THREE.Mesh(geoArrow, m)); return g; },
  };
}
