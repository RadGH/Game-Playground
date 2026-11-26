// Your own hero, predicted (adapted from Thousandvale's client/predict.js for the 20 Hz world): every 50 ms step the
// browser moves the hero itself with the same speed and the same ground check the server uses (js/game/ground.js),
// remembers the step under its input number, and sends the input. When the server's snapshot says which input it has
// used (`ack`), the browser compares where the server put the hero with where it predicted for that input; a small
// difference shifts the prediction (and the steps since) and fades out on screen; a big one (a teleport, a respawn)
// snaps. The hero is DRAWN between the last two steps (lessons rule 28: no jitter at 144 Hz).
//
//   const P = createPredictor({ ground, combat })   P.reset(x, z)   P.step(dir{x,z}, opts) → { q, x, z }
//   P.reconcile(ack, sx, sz, { snap })   P.drawn(alpha) → { x, z }   P.decay(dt, rate)
//   P.rush(kind, dir{x,z}, metres, dt)   a leap or a charge that started with this step's cast: the next steps carry the
//                                        hero along it exactly as js/rules/combat.js startRush/stepRush do (no snap back)
//   P.busy()                             true while a dodge roll, leap or charge is moving the hero
export function createPredictor({ ground, combat }) {
  const swimMult = combat.swimMult ?? 0.6;
  const S = combat.stamina;
  const st = { q: 0, x: 0, z: 0, px: 0, pz: 0, ox: 0, oz: 0, hist: [], stamina: 0, dash: null, rush: null, dodgeWait: 0 };
  const dashSteps = dt => Math.max(1, Math.round((S.dodgeSeconds ?? 0.25) / dt));   // = combat.js dashSteps
  const dodgeWaitSteps = dt => dashSteps(dt) + Math.round((S.dodgeCooldown ?? 0) / dt);   // = combat.js dodgeWaitSteps
  const R = combat.rush || {};
  const rushSteps = (kind, len, dt) => Math.max(1, Math.round((kind === 'leap' ? (R.leapSeconds ?? 0.45) : len / (R.dashSpeed ?? 34)) / dt));   // = combat.js rushSteps
  return {
    state: st,
    reset(x, z) { st.x = st.px = x; st.z = st.pz = z; st.ox = st.oz = 0; st.hist.length = 0; st.dash = null; st.rush = null; st.dodgeWait = 0; },
    rush(kind, dir, len, dt) {
      const l = Math.hypot(dir.x, dir.z) || 1, n = rushSteps(kind, len, dt);
      st.rush = { dx: dir.x / l * len / n, dz: dir.z / l * len / n, steps: n, kind };
      st.dash = null;
      return n * dt;
    },
    busy: () => !!(st.rush || (st.dash && st.dash.steps > 0)),
    /** One 50 ms step. opts: speed (walk m/s), sneak, dodge, canMove, stamina, mounted, facingDir. */
    step(dir, o, dt) {
      st.q++;
      st.px = st.x; st.pz = st.z;
      let nx = st.x, nz = st.z;
      const dashing = (st.dash && st.dash.steps > 0) || !!st.rush;
      if (o.canMove && !dashing && (dir.x || dir.z)) {
        // o.speed = the server's own walking speed for me (combat.js moveSpeedOf: slows, buffs, the horse); swimming here
        let v = o.speed;
        if (o.sneak) v *= o.sneakMult ?? 0.55;
        const swimming = ground.swimming?.(st.x, st.z);           // the server checks the same ground each step
        if (swimming) v *= swimMult;
        const l = Math.hypot(dir.x, dir.z) || 1;
        nx += dir.x / l * v * dt; nz += dir.z / l * v * dt;
      }
      // the dodge roll, step for step as the server runs it (js/rules/combat.js): the way you move, or the crosshair
      if (st.dodgeWait > 0) st.dodgeWait--;
      if (o.dodge && o.canMove && !dashing && !(st.dodgeWait > 0) && !ground.swimming?.(st.x, st.z) && o.stamina >= S.dodge) {
        const d = dir.x || dir.z ? dir : o.facingDir;
        const l = Math.hypot(d.x, d.z) || 1;
        st.dash = { x: d.x / l, z: d.z / l, steps: dashSteps(dt) };
        st.dodgeWait = dodgeWaitSteps(dt);
        st.dodged = true;
      } else st.dodged = false;
      if (st.dash && st.dash.steps > 0) {
        const k = S.dodgeMetres / dashSteps(dt);
        nx += st.dash.x * k; nz += st.dash.z * k;
        if (--st.dash.steps <= 0) st.dash = null;
      }
      if (st.rush) { nx += st.rush.dx; nz += st.rush.dz; if (--st.rush.steps <= 0) st.rush = null; }
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
