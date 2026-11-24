// Your own hero, predicted (adapted from Thousandvale's client/predict.js for the 20 Hz world): every 50 ms step the
// browser moves the hero itself with the same speed and the same ground check the server uses (js/game/ground.js),
// remembers the step under its input number, and sends the input. When the server's snapshot says which input it has
// used (`ack`), the browser compares where the server put the hero with where it predicted for that input; a small
// difference shifts the prediction (and the steps since) and fades out on screen; a big one (a teleport, a respawn)
// snaps. The hero is DRAWN between the last two steps (lessons rule 28: no jitter at 144 Hz).
//
//   const P = createPredictor({ ground, combat })   P.reset(x, z)   P.step(dir{x,z}, opts) → { q, x, z }
//   P.reconcile(ack, sx, sz, { snap })   P.drawn(alpha) → { x, z }   P.decay(dt, rate)
export function createPredictor({ ground, combat }) {
  const S = combat.stamina;
  const st = { q: 0, x: 0, z: 0, px: 0, pz: 0, ox: 0, oz: 0, hist: [], stamina: 0 };
  return {
    state: st,
    reset(x, z) { st.x = st.px = x; st.z = st.pz = z; st.ox = st.oz = 0; st.hist.length = 0; },
    /** One 50 ms step. opts: speed (walk m/s), sprint, block, sneak, dodge, canMove, stamina, overloaded, mounted. */
    step(dir, o, dt) {
      st.q++;
      st.px = st.x; st.pz = st.z;
      let nx = st.x, nz = st.z;
      if (o.canMove && (dir.x || dir.z)) {
        let v = o.speed;
        if (o.sneak) v *= 0.55;
        if (o.sprint && !o.mounted && !o.overloaded && o.stamina > 0) v *= S.sprintMult;
        if (o.block) v *= 0.5;
        nx += dir.x * v * dt; nz += dir.z * v * dt;
      }
      if (o.dodge && o.canMove && o.stamina >= S.dodge) {
        const d = dir.x || dir.z ? dir : o.facingDir;
        const l = Math.hypot(d.x, d.z) || 1;
        nx += d.x / l * S.dodgeMetres; nz += d.z / l * S.dodgeMetres;
      }
      const p = ground.settle({ x: st.x, z: st.z }, { x: nx, z: nz });
      st.x = p.x; st.z = p.z;
      st.hist.push({ q: st.q, x: st.x, z: st.z });
      if (st.hist.length > 80) st.hist.splice(0, st.hist.length - 80);
      return { q: st.q, x: st.x, z: st.z };
    },
    reconcile(ack, sx, sz, { snap = false } = {}) {
      const i = st.hist.findIndex(h => h.q === ack);
      if (snap || i < 0) {
        if (snap || Math.hypot(sx - st.x, sz - st.z) > 4) { st.ox += st.x - sx; st.oz += st.z - sz; if (snap) { st.ox = st.oz = 0; } st.x = st.px = sx; st.z = st.pz = sz; st.hist.length = 0; }
        return 0;
      }
      const h = st.hist[i];
      const ex = sx - h.x, ez = sz - h.z, e = Math.hypot(ex, ez);
      st.hist.splice(0, i + 1);
      if (e < 0.02) return e;
      if (e > 6) { st.x = st.px = sx; st.z = st.pz = sz; st.hist.length = 0; st.ox = st.oz = 0; return e; }
      for (const k of st.hist) { k.x += ex; k.z += ez; }
      st.x += ex; st.z += ez; st.px += ex; st.pz += ez;
      st.ox -= ex; st.oz -= ez;                         // keep the drawn hero where it was; the offset fades
      return e;
    },
    drawn(alpha) { return { x: st.px + (st.x - st.px) * alpha + st.ox, z: st.pz + (st.z - st.pz) * alpha + st.oz }; },
    decay(dt, rate = 14) { const k = Math.exp(-dt * rate); st.ox *= k; st.oz *= k; if (Math.abs(st.ox) < 1e-3) st.ox = 0; if (Math.abs(st.oz) < 1e-3) st.oz = 0; },
  };
}
