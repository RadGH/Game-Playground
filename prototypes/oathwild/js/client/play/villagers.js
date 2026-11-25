// Townsfolk (town round 2026-11-25; owner: "The town is motionless, create some townsfolk that walk around and do not
// have names besides Villager and do not interact"). Each villager walks the loop js/world/town.js planned for it
// (door → street → stall / fountain / shrine → another door…) on the wall clock, so every player in a world sees the
// same villager in about the same place without the server sending anything. They are drawn through the actors'
// Tabard bodies like the townspeople, but they are never units, never talk targets, never tapped and carry no name tag.
// They step aside when a hero stands in their way (drawn only).
//
//   const V = createVillagers({ plan, actors, heightAt, quality })
//   V.update(dt, hero)      every frame (hero = the drawn hero's { x, z })
//   V.list()                [{ id, x, z, moving }] (tests)
//   V.dispose()

const DRAW_R = 75;                                    // bodies only near the camera
const OUTFITS = [['cloth', 6], ['leather', 2], ['robe', 1]];

function rng(seed) { let a = seed >>> 0 || 1; return () => { a ^= a << 13; a ^= a >>> 17; a ^= a << 5; return ((a >>> 0) % 100000) / 100000; }; }
const pickW = (r, t) => { const tot = t.reduce((s, [, w]) => s + w, 0); let x = r() * tot; for (const [v, w] of t) if ((x -= w) <= 0) return v; return t[0][0]; };

/** A villager's loop as timed pieces: walk a → b, or wait at a spot (clip, facing). Same plan = same loop. */
export function villagerLoop(v) {
  const pts = v.route, out = [];
  let t = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    if (d > 0.05) { const dur = d / v.speed; out.push({ kind: 'walk', t0: t, t1: t + dur, a, b }); t += dur; }
    if (b.wait > 0) { out.push({ kind: 'wait', t0: t, t1: t + b.wait, at: b, clip: b.act === 'talk' ? 'talk' : 'idle', face: b.face }); t += b.wait; }
  }
  return { pieces: out, total: t };
}
/** Where a villager is at time `t` (seconds): { x, z, facing (actors' convention: look = (sin f, cos f)), moving, clip }. */
export function villagerAt(v, loop, t) {
  if (!loop.total) return { x: v.route[0].x, z: v.route[0].z, facing: 0, moving: false, clip: 'idle' };
  const tt = ((t + (v.seed % 997)) % loop.total + loop.total) % loop.total;
  let lo = 0, hi = loop.pieces.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (loop.pieces[m].t0 <= tt) lo = m; else hi = m - 1; }
  const p = loop.pieces[lo];
  if (p.kind === 'wait') {
    const prev = loop.pieces[lo - 1] || loop.pieces[loop.pieces.length - 1];
    const f = p.face ?? (prev?.kind === 'walk' ? Math.atan2(prev.b.x - prev.a.x, prev.b.z - prev.a.z) : 0);
    return { x: p.at.x, z: p.at.z, facing: f, moving: false, clip: p.clip };
  }
  const k = (tt - p.t0) / ((p.t1 - p.t0) || 1);
  return { x: p.a.x + (p.b.x - p.a.x) * k, z: p.a.z + (p.b.z - p.a.z) * k, facing: Math.atan2(p.b.x - p.a.x, p.b.z - p.a.z), moving: true, clip: 'walk' };
}

export function createVillagers({ plan, actors, heightAt, quality = 'medium', clock = () => Date.now() / 1000 }) {
  const count = { low: 4, medium: 10, high: 14 }[quality] ?? 10;
  const all = (plan?.villagers || []);
  // the same villagers in every town, thinned evenly by quality
  const keep = all.filter((v, i) => (i % 14) < count);
  const V = keep.map(v => {
    const r = rng(v.seed);
    const npc = { id: v.id, name: 'Villager', villager: true, body: { kind: 'tabard', sex: r() < 0.5 ? 'female' : 'male', age: r() < 0.18 ? 'old' : 'middle', outfit: pickW(r, OUTFITS) } };
    return { v, loop: villagerLoop(v), npc, side: 0, facing: 0, shown: false, x: v.route[0].x, z: v.route[0].z, moving: false };
  });
  const lerpAngle = (a, b, k) => { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };
  return {
    update(dt, hero) {
      const t = clock();
      for (const w of V) {
        const s = villagerAt(w.v, w.loop, t);
        // step aside for a hero standing in the way (only the drawing moves)
        const hx = hero.x - s.x, hz = hero.z - s.z, hd = Math.hypot(hx, hz);
        let want = 0;
        if (s.moving && hd < 1.4) { const side = Math.sign(Math.cos(s.facing) * hx - Math.sin(s.facing) * hz) || 1; want = -side * (1.4 - hd); }
        w.side += (want - w.side) * Math.min(1, dt * 4);
        const x = s.x + Math.cos(s.facing) * w.side, z = s.z - Math.sin(s.facing) * w.side;
        const near = Math.hypot(x - hero.x, z - hero.z) < DRAW_R;
        if (!near) { if (w.shown) { actors.drop('npc:' + w.v.id); w.shown = false; } continue; }
        const a = actors.npc(w.npc);
        a.villager = true;
        w.shown = true;
        const speed = s.moving ? Math.hypot(x - w.x, z - w.z) / Math.max(dt, 1e-3) : 0;
        w.facing = lerpAngle(w.facing, s.facing, Math.min(1, dt * 6));
        a.place(x, heightAt(x, z), z, w.facing);
        if (s.moving) actors.moveClip(a, Math.min(2.4, Math.max(0.6, speed)));
        else actors.playLoop(a, s.clip);
        w.x = x; w.z = z; w.moving = s.moving;
      }
    },
    list: () => V.map(w => ({ id: w.v.id, x: w.x, z: w.z, moving: w.moving, shown: w.shown })),
    dispose() { for (const w of V) if (w.shown) actors.drop('npc:' + w.v.id); },
  };
}
