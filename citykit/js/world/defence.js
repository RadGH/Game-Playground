// Turrets: what each one does, how it picks a target and what it fires. Power + money upkeep only, no ammo (owner
// 2026-11-15). Every shot is a visible projectile or beam; damage goes through Horde.hurt / Horde.blast so a hit always
// lands on the creatures it touches. Effects and sounds are asked of the owner through callbacks, so this file is the
// same in the City Kit scene and in the game.
//
// Recipe ids match citykit/js/kit/defence.js; `dirs` 16 = the head's baked facing directions.

export const TURRETS = {
  pulse:  { recipe: 'tur-pulse', name: 'Pulse Gun', range: 6, every: 0.18, damage: 7, speed: 15, upkeep: 2, blurb: 'Cheap, rapid bolts' },
  arc:    { recipe: 'tur-arc', name: 'Arc Coil', range: 4, every: 1.1, damage: 26, chain: 5, hop: 1.8, upkeep: 4, blurb: 'Lightning that jumps between close creatures' },
  rail:   { recipe: 'tur-rail', name: 'Rail Lance', range: 11, every: 2.6, damage: 110, pierce: 0.35, upkeep: 6, blurb: 'Long, slow, goes straight through a line' },
  mortar: { recipe: 'tur-mortar', name: 'Mortar', range: 10, min: 2.5, every: 2.2, damage: 60, radius: 1.8, flight: 1.4, upkeep: 5, blurb: 'Lobbed shells for crowds' },
};

export class Defence {
  /** hooks: { muzzle(t) → {x,z,y}, onFire(t, kind, data), onImpact(kind, data) } */
  constructor(horde, hooks = {}) { this.horde = horde; this.turrets = []; this.shots = []; this.shells = []; this.hooks = hooks; this.powered = true; }
  add(kind, x, z) { const t = { kind, x, z, cool: Math.random() * TURRETS[kind].every, heading: -Math.PI / 4, target: null, recoil: 0 }; this.turrets.push(t); return t; }

  _pick(t) {
    const s = TURRETS[t.kind];
    let best = null, bd = Infinity;
    for (const c of this.horde.near(t.x, t.z, s.range)) {
      const d = Math.hypot(c.x - t.x, c.z - t.z);
      if (s.min && d < s.min) continue;
      // mortars want crowds: score by how many are near the creature
      const score = t.kind === 'mortar' ? d - this.horde.near(c.x, c.z, s.radius).length * 1.5 : d;
      if (score < bd) { bd = score; best = c; }
    }
    return best;
  }

  step(dt) {
    const h = this.horde;
    h._hash();   // targeting reads the spatial hash: never rely on the horde having stepped first
    for (const t of this.turrets) {
      const s = TURRETS[t.kind];
      t.cool -= dt; t.recoil = Math.max(0, t.recoil - dt * 6);
      if (!this.powered || (t.powered != null && t.powered <= 0)) continue;   // no power: the turret sits idle
      if (!t.target || t.target.hp <= 0 || !h.list.includes(t.target) || Math.hypot(t.target.x - t.x, t.target.z - t.z) > s.range) t.target = this._pick(t);
      const c = t.target; if (!c) continue;
      // turn the head toward where the target will be (lead for slow shots)
      const lead = t.kind === 'pulse' ? Math.hypot(c.x - t.x, c.z - t.z) / s.speed : t.kind === 'mortar' ? s.flight : 0;
      const ax = c.x + c.vx * lead, az = c.z + c.vz * lead;
      t.heading = Math.atan2(az - t.z, ax - t.x);
      if (t.cool > 0) continue;
      t.cool = s.every / Math.max(0.25, t.powered ?? 1); t.recoil = 1;   // a brownout slows the rate of fire
      const m = this.hooks.muzzle?.(t) || { x: t.x + 0.5, z: t.z + 0.5, y: 0.5 };
      if (t.kind === 'pulse') {
        const dx = ax - m.x, dz = az - m.z, l = Math.hypot(dx, dz) || 1;
        this.shots.push({ x: m.x, z: m.z, y: m.y, px: m.x, pz: m.z, py: m.y, vx: dx / l * s.speed, vz: dz / l * s.speed, life: s.range / s.speed + 0.1, dmg: s.damage, from: t });
        this.hooks.onFire?.(t, 'pulse', m);
      } else if (t.kind === 'arc') {
        const chain = [c]; let cur = c;
        for (let i = 1; i < s.chain; i++) {
          const next = h.near(cur.x, cur.z, s.hop).filter(o => !chain.includes(o)).sort((a, b) => Math.hypot(a.x - cur.x, a.z - cur.z) - Math.hypot(b.x - cur.x, b.z - cur.z))[0];
          if (!next) break; chain.push(next); cur = next;
        }
        const pts = [[m.x, m.z, m.y], ...chain.map(o => [o.x, o.z, 0.25])];
        this.hooks.onFire?.(t, 'arc', { muzzle: m, pts });
        chain.forEach((o, i) => { const died = h.hurt(o, s.damage * Math.pow(0.85, i), [t.x + 0.5, t.z + 0.5], 0.6); this.hooks.onImpact?.('arc-hit', { x: o.x, z: o.z, died, c: o }); });
      } else if (t.kind === 'rail') {
        const dx = ax - m.x, dz = az - m.z, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
        const ex = m.x + ux * s.range, ez = m.z + uz * s.range;
        // everything within `pierce` of the line takes the hit, in order, each a bit less
        const hits = h.list.filter(o => { const px = o.x - m.x, pz = o.z - m.z, along = px * ux + pz * uz; if (along < 0 || along > s.range) return false; return Math.abs(px * uz - pz * ux) < s.pierce + 0.2; })
          .sort((a, b) => ((a.x - m.x) * ux + (a.z - m.z) * uz) - ((b.x - m.x) * ux + (b.z - m.z) * uz));
        this.hooks.onFire?.(t, 'rail', { muzzle: m, end: { x: ex, z: ez, y: 0.3 } });
        hits.forEach((o, i) => { const died = h.hurt(o, s.damage * Math.pow(0.8, i), [m.x, m.z], 4); this.hooks.onImpact?.('rail-hit', { x: o.x, z: o.z, died, c: o, from: [m.x, m.z] }); });
      } else if (t.kind === 'mortar') {
        this.shells.push({ sx: m.x, sz: m.z, sy: m.y, tx: ax, tz: az, age: 0, flight: s.flight, top: 3.4, dmg: s.damage, radius: s.radius });
        this.hooks.onFire?.(t, 'mortar', m);
      }
    }
    // pulse bolts fly; they hit the first creature they touch
    this.shots = this.shots.filter(b => {
      b.px = b.x; b.pz = b.z; b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
      for (const o of h.near(b.x, b.z, 0.5)) {
        if (Math.hypot(o.x - b.x, o.z - b.z) < 0.18 + 0.16) { const died = h.hurt(o, b.dmg, [b.x - b.vx, b.z - b.vz], 0.8); this.hooks.onImpact?.('pulse-hit', { x: b.x, z: b.z, died, c: o, from: [b.x - b.vx * 0.1, b.z - b.vz * 0.1] }); return false; }
      }
      return b.life > 0;
    });
    // mortar shells arc and burst
    this.shells = this.shells.filter(s => {
      s.age += dt;
      if (s.age >= s.flight) { const r = h.blast(s.tx, s.tz, { radius: s.radius, damage: s.dmg, core: 0.5, edge: 0.25, push: 3, lift: 3, stun: 0.3 }); this.hooks.onImpact?.('mortar', { x: s.tx, z: s.tz, ...r, radius: s.radius }); return false; }
      return true;
    });
  }
  /** Where a mortar shell is now: {x, z, y} on its arc (for drawing). */
  static shellPos(s) {
    const k = Math.min(1, s.age / s.flight);
    return { x: s.sx + (s.tx - s.sx) * k, z: s.sz + (s.tz - s.sz) * k, y: s.sy + (0 - s.sy) * k + s.top * 4 * k * (1 - k), k };
  }
}
