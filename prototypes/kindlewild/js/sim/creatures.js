// Creatures: everything that walks, swims or flies. PURE (draw() takes the frame's pixel api).
//
// A creature is a small object (x, y, altitude z, hp, age, hunger, sex, state...). Every tick it
// feels the cell it stands on (fire lights it, lava kills it, deep water drowns it, frostfire
// stiffens it, poison gas hurts it), and every few ticks it THINKS: flee what it fears, eat when
// hungry (graze / hunt / village store), breed with a full belly, go raiding, guard, or wander.
// Data: data/creatures.json. People's jobs and houses: village.js (hooked in as sim.village).

import { BURN, WET, CHARGED, setCell, ignite } from './world.js';
import { spawn, burst, P } from './particles.js';
import { addGas, GAS } from './gas.js';
import { hexRgb } from './materials.js';

const TPS = 30;
const BUCKET = 8;

/** Turn creatures.json into fast lookups (frames as pixel lists). */
export function compileCreatures(json) {
  const out = {};
  for (const [id, s] of Object.entries(json.species)) {
    const sp = { id, ...s, tags: new Set(s.tags || []), hunts: new Set(s.hunts || []), fears: new Set(s.fears || []) };
    const pal = s.sprite.palette;
    const glow = s.sprite.glow || {};
    const frames = {};
    for (const key of ['walk', 'walk2', 'fly', 'fly2', 'young']) {
      const rows = s.sprite[key];
      if (!rows) continue;
      const px = [];
      const h = rows.length, w = Math.max(...rows.map(r => r.length));
      rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const ch = row[x];
          if (ch === '.' || ch === ' ') continue;
          const p = pal[ch];
          if (!p) throw new Error(`creatures: ${id} sprite uses '${ch}' with no colour`);
          const tint = p.startsWith('@') ? p.slice(1) : null;
          const rgb = tint ? [255, 0, 255] : hexRgb(p);
          px.push({ x: x - (w >> 1), y: y - h + 1, rgb, glow: glow[ch] || 0, tint });
        }
      });
      frames[key] = { px, w, h };
    }
    sp.frames = frames;
    sp.radius = Math.max(0.6, (s.sprite.w + s.sprite.h) / 5);
    sp.tintRgb = {};
    for (const [k, list] of Object.entries(s.tints || {})) sp.tintRgb[k] = list.map(hexRgb);
    sp.glowRgb = s.glows ? hexRgb(s.glows) : null;
    out[id] = sp;
  }
  return out;
}

export function createCreatures(sim, species) {
  const w = sim.world, M = w.M, ID = M.id, W = w.W, H = w.H;
  const rng = sim.rng;
  const list = [];
  const counts = {};
  let nextId = 1;
  const BW = Math.ceil(W / BUCKET), BH = Math.ceil(H / BUCKET);
  const buckets = new Array(BW * BH).fill(null).map(() => []);
  const C = {
    list, counts, species,
    byId: new Map(),
    bornTotal: 0, deaths: [], killsBy: {},
  };

  // ---------- spawning ----------
  function add(spId, x, y, opts = {}) {
    const sp = species[spId];
    if (!sp) return null;
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    const c = {
      id: nextId++, sp, x: x + 0.5, y: y + 0.5, z: sp.flies ? (opts.z ?? sp.altitude ?? 6) : 0,
      vx: 0, vy: 0, kx: 0, ky: 0,
      hp: sp.hp * (opts.hpScale ?? 1), maxHp: sp.hp * (opts.hpScale ?? 1),
      age: opts.age ?? (sp.adultAt ? (opts.young ? 0 : sp.adultAt * TPS + rng() * sp.adultAt * TPS) : 0),
      hunger: rng() * 0.3, sex: rng() < 0.5 ? 0 : 1,
      cool: (sp.breed?.cooldown ?? 30) * TPS * (0.3 + rng() * 0.7),
      state: 'wander', tx: x, ty: y, think: rng() * 20 | 0, target: null,
      burning: 0, frozen: 0, hurtFlash: 0, atkCd: 0, rngCd: rng() * 30, healCd: 0,
      dir: rng() < 0.5 ? -1 : 1, moving: false, alive: true,
      tint: {}, village: opts.village ?? null, job: null, carry: null, home: opts.home ?? null,
      breathT: 0, breathCd: 60 + rng() * 120, dragonPhase: 'circle', orbitA: rng() * 6.28,
      team: opts.team || sp.team, lastHurtBy: null, born: sim.tick, reborn: 0, tag: opts.tag || null,
      fleeT: 0, eatT: 0, goal: opts.goal || null,
      leash: opts.leash || null,   // { x, y, r }: a nest guard only chases what comes inside r
      post: opts.post || null,     // { x, y }: a placed defender guards here (session.use creature:*)
    };
    for (const [k, l] of Object.entries(sp.tintRgb)) c.tint[k] = l[(rng() * l.length) | 0];
    list.push(c);
    C.byId.set(c.id, c);
    counts[spId] = (counts[spId] || 0) + 1;
    return c;
  }

  function remove(c) {
    c.alive = false;
    C.byId.delete(c.id);
    counts[c.sp.id]--;
  }

  // ---------- spatial hash ----------
  function rebuild() {
    for (const b of buckets) b.length = 0;
    for (const c of list) {
      if (!c.alive) continue;
      const bx = Math.min(BW - 1, Math.max(0, (c.x / BUCKET) | 0)), by = Math.min(BH - 1, Math.max(0, (c.y / BUCKET) | 0));
      buckets[by * BW + bx].push(c);
    }
  }
  function near(x, y, r, fn) {
    const b0x = Math.max(0, ((x - r) / BUCKET) | 0), b1x = Math.min(BW - 1, ((x + r) / BUCKET) | 0);
    const b0y = Math.max(0, ((y - r) / BUCKET) | 0), b1y = Math.min(BH - 1, ((y + r) / BUCKET) | 0);
    const r2 = r * r;
    for (let by = b0y; by <= b1y; by++) for (let bx = b0x; bx <= b1x; bx++) {
      for (const c of buckets[by * BW + bx]) {
        if (!c.alive) continue;
        const dx = c.x - x, dy = c.y - y;
        if (dx * dx + dy * dy <= r2) if (fn(c, dx * dx + dy * dy) === false) return;
      }
    }
  }
  function nearest(x, y, r, pred) {
    let best = null, bd = Infinity;
    near(x, y, r, (c, d2) => { if (d2 < bd && pred(c)) { bd = d2; best = c; } });
    return best;
  }
  C.near = near; C.nearest = nearest; C.add = add; C.remove = remove;

  // ---------- harm ----------
  function hurt(c, dmg, cause, by) {
    if (!c.alive || dmg <= 0) return;
    if (by === 'village') dmg *= sim.unitDamage ?? 1;   // the Sharper steel boost
    // per-species hide: resist { cause: multiplier } (0 = immune, 2 = takes double)
    if (c.sp.resist && c.sp.resist[cause] != null) { dmg *= c.sp.resist[cause]; if (dmg <= 0) return; }
    if (c.sp.boss) {
      // a dragon shrugs off fire and frost; lightning bites at full strength (owner 2026-10-29: the
      // half-strength bolt made Wings over Thornby too hard). A species' own `resist` row replaces
      // these defaults for that cause, so nothing is cut twice.
      const own = c.sp.resist || {};
      if ((cause === 'fire' || cause === 'lava') && own[cause] == null) dmg *= 0.1;
      if (cause === 'frost' && own.frost == null) dmg *= 0.3;
      if (cause === 'magic' && own.magic == null) dmg *= 0.55;
      const at = c.sp.enrageAt ?? 0.6, low = c.sp.noFlee ? 0 : 0.25;
      if (!c.enraged && c.hp - dmg < c.maxHp * at && c.hp - dmg > c.maxHp * low) enrage(c);
      // an elder wyrm has a second, worse fury (enrage2: { at, calls, firefall })
      else if (c.sp.enrage2 && c.enraged && !c.enraged2 && c.hp - dmg < c.maxHp * c.sp.enrage2.at && c.hp - dmg > 0) enrage(c, c.sp.enrage2);
    }
    if (inBarrier(c.x, c.y) && c.team !== 'monster' && cause !== 'hunger' && cause !== 'age') return;
    c.hp -= dmg;
    c.hurtFlash = 4;
    if (by) c.lastHurtBy = by;
    if (c.hp <= 0) die(c, cause, by);
  }
  C.hurt = hurt;
  function enrage(c, second) {
    if (second) c.enraged2 = true; else c.enraged = true;
    c.frozen = 0;
    c.leash = null;   // a hurt nest-guard leaves the nest and goes for the village
    sim.fire('dragon-enrage', { c, x: c.x, y: c.y, second: !!second });
    const [spId, n] = (second ? second.calls : c.sp.calls) || ['wyrmling', 2];
    // the call comes from inside the map even when the dragon is out over the edge
    // (the plain ashwing keeps its old two-at-its-flanks call, so Act I/II levels play as tuned)
    if (!second && !c.sp.calls) for (let k = 0; k < 2; k++) add('wyrmling', (c.x + (k ? 6 : -6)) | 0, (c.y - 4) | 0, { goal: c.goal });
    else {
      const cx = Math.max(8, Math.min(W - 9, c.x)), cy = Math.max(8, Math.min(H - 9, c.y));
      for (let k = 0; k < n; k++) add(spId, (cx + Math.cos(k * 6.28 / n) * 7) | 0, (cy + Math.sin(k * 6.28 / n) * 5) | 0, { goal: c.goal });
    }
    if (second?.firefall) c.firefallT = 30;
    sim.blast(c.x, c.y, 6, 0.6, { by: 'roar', quiet: true, fire: false, color: [255, 120, 40] });
  }
  // barrier domes (spells.js keeps the list on the world)
  function inBarrier(x, y) {
    const b = w.barriers;
    if (!b || !b.length) return false;
    for (const d of b) if ((x - d.x) ** 2 + (y - d.y) ** 2 < d.r * d.r) return true;
    return false;
  }
  C.inBarrier = inBarrier;
  const hostileToBarrier = (c) => c.team === 'monster' || c.sp.diet === 'hunt' && c.team === 'wild';

  function die(c, cause, by) {
    if (!c.alive) return;
    const x = c.x | 0, y = c.y | 0;
    remove(c);
    const ev = { c, species: c.sp.id, cause, by, x, y, team: c.team, tags: c.sp.tags };
    C.deaths.push(ev);
    if (by) C.killsBy[by] = (C.killsBy[by] || 0) + 1;
    sim.fire('death', ev);
    const i = y * W + x;
    // a little puff of the creature's own pixels
    if (!c.sp.boss) {
      const px = (c.sp.frames.walk || c.sp.frames.fly).px;
      const n = Math.min(10, px.length);
      for (let k = 0; k < n; k++) {
        const p = px[(rng() * px.length) | 0];
        const rgb = cause === 'fire' || cause === 'lava' ? [255, 120 + (rng() * 80 | 0), 30] : p.tint ? (c.tint[p.tint] || [200, 200, 200]) : p.rgb;
        spawn(sim.ps, { kind: P.spark, x: c.x + p.x, y: c.y + p.y, z: 1 + c.z, vx: (rng() - 0.5) * 0.6, vy: (rng() - 0.5) * 0.6, vz: 0.4 + rng() * 0.5, grav: 0.05, life: 26, rgb, glow: p.glow || (cause === 'fire' ? 0.8 : 0) });
      }
    }
    // the body: burnt ones leave ash, the rest bones (a big beast leaves a pile)
    if (c.sp.splits && c.maxHp > 8 && cause !== 'fire' && cause !== 'lava') {
      for (let k = 0; k < 2; k++) { const s = add(c.sp.id, x + (k ? 1 : -1), y, { hpScale: (c.maxHp / c.sp.hp) * 0.5 }); if (s) { s.kx = (k ? 0.4 : -0.4); sim.fire('split', { c, child: s }); } }
      burst(sim.ps, rng, c.x, c.y, 10, { kind: P.spark, life: 14, palette: [[180, 120, 255], [220, 190, 255]], glow: 0.6, speed: 0.4 });
      return;
    }
    if (c.sp.reborn && !c.tag && c.lives !== 0) {
      // a phoenix burns down to an egg of flame and comes back (as often as `lives` allows; unset = forever)
      sim.blast(x, y, 6, 1.4, { by: 'phoenix', fire: true, color: [255, 170, 60] });
      const team = c.team, hpScale = c.maxHp / c.sp.hp, lives = c.lives == null ? null : c.lives - 1;
      sim.api.later(() => { const p = add(c.sp.id, x, y, { team, hpScale }); if (p && lives != null) p.lives = lives; sim.api.discover('rebirth', x, y); sim.fire('reborn', { c: p, x, y }); }, 150);
      return;
    }
    if (c.sp.boss) {
      // a dragon falls out of the sky
      sim.blast(x, y, 12, 4, { by: 'dragon-fall', fire: true, crater: 6 });
      for (let k = 0; k < 14; k++) { const xx = x + ((rng() * 9) | 0) - 4, yy = y + ((rng() * 7) | 0) - 3; if (w.inside(xx, yy) && w.mat[yy * W + xx] === 0) setCell(w, yy * W + xx, ID.bones); }
      return;
    }
    if (w.inside(x, y) && w.mat[i] === 0 && !c.sp.flies && c.sp.kind !== 'spirit') {
      if (cause === 'fire' || cause === 'lava') { if (rng() < 0.5) setCell(w, i, ID.ashpile); }
      else if (rng() < (c.sp.tags.has('small') || c.sp.swarm ? 0.08 : 0.6)) setCell(w, i, ID.bones);
    }
    if (c.sp.kind === 'spirit') burst(sim.ps, rng, c.x, c.y, 12, { kind: P.mote, life: 30, rgb: c.sp.glowRgb || [200, 255, 230], glow: 1, speed: 0.3 });
  }

  // world events -> creatures
  // a reaction that makes a creature (bones + bog goo -> restless bones); monsters head for the nearest village
  sim.on('spawn', (e) => {
    const sp = species[e.species];
    if (!sp) return;
    const goal = sp.team === 'monster' && sim.village ? sim.village.nearestVillage(e.x, e.y) : null;
    const c = add(e.species, e.x | 0, e.y | 0, { goal });
    if (c) sim.fire('risen', { c, x: e.x, y: e.y });
  });
  sim.on('blast', (e) => {
    near(e.x, e.y, e.r * 1.2, (c, d2) => {
      const d = Math.sqrt(d2);
      const f = Math.max(0, 1 - d / (e.r * 1.2));
      if (c.sp.flies && c.z > 6 && e.by !== 'meteor') return;
      if (inBarrier(c.x, c.y) && !inBarrier(e.x, e.y)) return;
      const dmg = e.power * 26 * f * (e.frost ? 0.4 : 1);
      hurt(c, dmg, e.frost ? 'frost' : 'blast', e.by);
      if (e.frost) c.frozen = Math.max(c.frozen, c.sp.boss ? 30 : 120 * f + 30);
      const kick = e.power * 0.5 * f / (c.sp.boss ? 6 : c.sp.tags.has('big') ? 3 : 1);
      if (d > 0.01) { c.kx += (c.x - e.x) / d * kick; c.ky += (c.y - e.y) / d * kick; }
      if (!c.sp.flies && kick > 0.25) c.vz = Math.max(c.vz || 0, kick * 1.2);
      if (!c.sp.fireproof && c.sp.burns && !e.frost && f > 0.3 && rng() < 0.5) c.burning = 120;
    });
  });
  sim.on('lightning', (e) => {
    near(e.x, e.y, 3.5 * e.power, (c) => hurt(c, 55 * e.power, 'lightning', e.by));
  });
  sim.on('shock', (e) => {
    for (const c of list) {
      if (!c.alive || c.sp.flies) continue;
      const i = (c.y | 0) * W + (c.x | 0);
      if (e.cells.has(i)) { hurt(c, 40 * e.power, 'shock', 'lightning'); c.frozen = 30; }
    }
  });
  // projectiles (arrows, bolts, breath) land
  sim.on('land', (e) => {
    const ps = sim.ps;
    const k = e.i;
    const dmg = ps.dmg[k];
    if (!dmg) return;
    const team = ps.owner[k] === 1 ? 'village' : ps.owner[k] === 2 ? 'monster' : 'wild';
    let hit = false;
    near(e.x + 0.5, e.y + 0.5, 1.6, (c) => {
      if (hit || c.team === team) return;
      hurt(c, dmg, ps.kind[k] === P.bolt && ps.glow[k] > 0.5 ? 'magic' : 'arrow', team);
      hit = true;
    });
    if (ps.glow[k] > 0.5) burst(sim.ps, rng, e.x, e.y, 6, { kind: P.spark, life: 10, rgb: [ps.r[k], ps.g[k], ps.b[k]], glow: 1, speed: 0.4 });
  });

  // ---------- senses ----------
  function feelsDanger(c) {
    // look around for fire / lava (a few samples), and feared creatures
    const sp = c.sp;
    if (sp.fears.has('fire') && !sp.fireproof) {
      for (let k = 0; k < 6; k++) {
        const a = rng() * Math.PI * 2, r = 2 + rng() * 6;
        const x = (c.x + Math.cos(a) * r) | 0, y = (c.y + Math.sin(a) * r) | 0;
        if (!w.inside(x, y)) continue;
        const i = y * W + x;
        if ((w.flag[i] & BURN) || w.mat[i] === ID.lava || w.temp[i] > 130) return { x, y };
      }
    }
    if (sp.fears.size) {
      const threat = nearest(c.x, c.y, 12, (o) => o !== c && o.team !== c.team && fearOf(sp, o));
      if (threat) return { x: threat.x, y: threat.y, c: threat };
    }
    return null;
  }
  function fearOf(sp, o) {
    for (const t of sp.fears) if (o.sp.tags.has(t)) return true;
    if (sp.fears.has('monster') && o.team === 'monster') return true;
    return false;
  }
  function huntable(c, o) {
    if (o === c || !o.alive || o.team === c.team && c.team !== 'wild') return false;
    if (o.sp.id === c.sp.id) return false;
    if (o.sp.aquatic && !c.sp.flies && c.sp.id !== 'bear') return false;
    // village fighters take on monsters AND wild predators (wolves, bears) — they ignored wolves until
    // 2026-10-29, so Wolves at Bay could not be defended by the knights it hands you
    if (c.team === 'village') return o.team === 'monster' || (o.team === 'wild' && o.sp.diet === 'hunt');
    if (c.team === 'monster' && o.team === 'monster') return false;
    for (const t of c.sp.hunts) if (o.sp.tags.has(t)) return true;
    if (c.sp.hunts.has('person') && o.sp.kind === 'person') return true;
    return false;
  }

  function pickFood(c) {
    // grazers look for food cells close by
    let best = -1, bs = -1;
    for (let k = 0; k < 10; k++) {
      const a = rng() * Math.PI * 2, r = 1 + rng() * 9;
      const x = (c.x + Math.cos(a) * r) | 0, y = (c.y + Math.sin(a) * r) | 0;
      if (!w.inside(x, y)) continue;
      const i = y * W + x;
      const m = w.mat[i];
      if (w.flag[i] & BURN) continue;
      let s = M.food[m];
      if (m === 0 && (w.ground[i] === ID.grass || w.ground[i] === ID.meadow)) s = 1;
      if (m === ID.crop && w.flag[i] & 4 && c.sp.tags.has('livestock')) s = 6; // village crops are tasty
      if (s > bs) { bs = s; best = i; }
    }
    return bs > 0 ? best : -1;
  }

  function walkable(c, x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    if (w.barriers && w.barriers.length && hostileToBarrier(c) && !c.sp.flies && inBarrier(x, y) && !inBarrier(c.x, c.y)) return false;
    const i = (y | 0) * W + (x | 0);
    const m = w.mat[i];
    if (c.sp.flies) return true;
    if (c.sp.aquatic) return M.liquid[m] && m !== ID.lava;
    if (m === ID.lava && !c.sp.fireproof) return false;
    if (M.walk[m] === 0) {
      if (M.liquid[m]) return false;
      return false;
    }
    if (M.liquid[m] && w.life[i] > 22 && !c.sp.swims) return false; // deep water: walk round
    return true;
  }
  function speedAt(c) {
    if (c.sp.flies || c.sp.aquatic) return 1;
    const i = (c.y | 0) * W + (c.x | 0);
    const m = w.mat[i];
    let s = (m ? M.walk[m] : M.walk[w.ground[i]]) / 100;
    if (M.flag.road[w.ground[i]] && !m) s *= 1.25;
    if (m === ID.goo) s = 0.15;
    return Math.max(0.15, s);
  }

  // ---------- one creature, one tick ----------
  function stepOne(c) {
    const sp = c.sp;
    c.age++;
    if (!(sp.diet === 'village' && (c.village == null || !sim.village?.list[c.village]?.alive) && (sp.attack || sp.ranged || c.goal))) c.hunger += sp.hunger;
    if (c.cool > 0) c.cool -= w.blessAt ? (w.blessAt(c.x, c.y) ? 4 : 1) : 1;
    if (c.atkCd > 0) c.atkCd--;
    if (c.rngCd > 0) c.rngCd--;
    if (c.healCd > 0) c.healCd--;
    if (c.hurtFlash > 0) c.hurtFlash--;
    if (c.age > sp.life * TPS) { die(c, 'age'); return; }
    if (c.hunger > 1.2) { hurt(c, 0.05, 'hunger'); }
    // the ground under it
    const xi = c.x | 0, yi = c.y | 0;
    const i = yi * W + xi;
    const m = w.mat[i];
    const low = !sp.flies || c.z < 1.5;
    if (low) {
      if (m === ID.lava || m === ID.vent) {
        if (!sp.fireproof) { hurt(c, 6, 'lava'); if (rng() < 0.2) burst(sim.ps, rng, c.x, c.y, 4, { kind: P.ember, up: 0.6, grav: 0.04, life: 30, rgb: [255, 140, 40], glow: 1 }); if (c.alive && rng() < 0.3) sim.api.discover('cooked', xi, yi); }
      } else if (((w.flag[i] & BURN) || w.temp[i] > 150) && !sp.fireproof && sp.burns !== false) {
        if (!c.burning) { c.burning = 150; if (sp.kind === 'person') sim.fire('panic', { c }); }
      }
      if (M.liquid[m] && m !== ID.lava) {
        if (c.burning) { c.burning = 0; addGas(w, xi, yi, GAS.steam, 30); }
        if (w.life[i] > 22 && !sp.swims && !sp.aquatic) { hurt(c, 0.35, 'drown'); if (c.alive && c.hp < 3) sim.api.discover('drowned', xi, yi); }
        if (M.hurts[m]) hurt(c, M.hurts[m] * 0.08, 'acid');
        if (M.heals[m]) { if (sp.undead) hurt(c, 1.2, 'holy'); else c.hp = Math.min(c.maxHp, c.hp + M.heals[m] * 0.05); }
        if (w.flag[i] & CHARGED) hurt(c, 1.5, 'shock', 'lightning');
      } else if (sp.aquatic) {
        hurt(c, 0.4, 'dry');
      }
      if (m === ID.thorns) hurt(c, 0.08, 'thorns');
      if (m === ID.frostfire || w.temp[i] < 12) { const fiery = sp.tags.has('fiery'); if (!sp.fireproof || fiery) c.frozen = Math.max(c.frozen, 40); if (fiery) hurt(c, 0.5, 'frost'); }
      const gd = w.gasDens[(yi >> 1) * w.GW + (xi >> 1)];
      if (gd > 40 && w.gasKind[(yi >> 1) * w.GW + (xi >> 1)] === GAS.poison && !sp.undead) hurt(c, gd / 900, 'poison');
    }
    if (c.burning) {
      c.burning--;
      hurt(c, sp.boss ? 0.02 : 0.11, 'fire');
      if (!c.alive) return;
      if (rng() < 0.1 && low) ignite(w, i);
      if (rng() < 0.3) spawn(sim.ps, { kind: P.ember, x: c.x, y: c.y - 1, z: 1, vz: 0.15, grav: 0.01, life: 20, rgb: [255, 140 + (rng() * 80 | 0), 30], glow: 1 });
    }
    if (sp.ignites && rng() < sp.ignites) {
      if (low) ignite(w, i);
      // a burning flyer (a phoenix) drops sparks that light what they land on
      else if (sp.flies && !sp.breath) spawn(sim.ps, { kind: P.ember, x: c.x, y: c.y, z: c.z, vx: (rng() - 0.5) * 0.3, vy: (rng() - 0.5) * 0.3, vz: 0, grav: 0.03, life: 90, rgb: [255, 170, 50], glow: 1 });
    }
    // bees leave flowers behind; a rimeling freezes what it floats over
    if (sp.blooms && rng() < sp.blooms && m === 0 && (w.ground[i] === ID.grass || w.ground[i] === ID.meadow)) setCell(w, i, ID.flowers);
    if (sp.freezes) {
      w.temp[i] = Math.max(0, w.temp[i] - 20);
      if (w.flag[i] & BURN) { w.flag[i] &= ~BURN; if (m === ID.fire) setCell(w, i, 0); }
      if (m === ID.water && rng() < 0.05) setCell(w, i, ID.ice);
      w.touch(i);
    }
    // a hollow orb leaves seeds of nothing behind it (voids: chance a tick)
    if (sp.voids && rng() < sp.voids && m !== ID.vent && m !== ID.void) {
      const vx = (c.x + (rng() - 0.5) * 3) | 0, vy = (c.y + (rng() - 0.5) * 3) | 0;
      if (w.inside(vx, vy) && w.mat[vy * W + vx] !== ID.vent && !M.liquid[w.mat[vy * W + vx]]) setCell(w, vy * W + vx, ID.void);
    }
    // creatures of living flame (waterHurts: harm a tick) are hurt by water and by rain-soaked ground
    if (sp.waterHurts && low && ((M.liquid[m] && M.douses[m]) || (w.flag[i] & WET))) {
      hurt(c, sp.waterHurts, 'water', 'rain');
      if (rng() < 0.1) addGas(w, xi, yi, GAS.steam, 20);
    }
    // guards and fighters of a village eat from its store without walking home
    if (sp.diet === 'village' && (sp.attack || sp.ranged || sp.heal) && c.hunger > 0.6 && sim.village) {
      const v = sim.village.list[c.village];
      if (v && v.food > 0) { v.food -= 1; c.hunger = Math.max(0, c.hunger - 0.7); }
    }
    if (c.frozen > 0) c.frozen--;
    // a troll caught in daylight turns to stone
    if (sp.stoneAtDawn && w.clock > 0.22 && w.clock < 0.36 && sim.daylight() > 0.4 && rng() < 0.01) {
      remove(c);
      for (let dy = -2; dy <= 0; dy++) for (let dx = -1; dx <= 1; dx++) if (w.inside(xi + dx, yi + dy)) setCell(w, (yi + dy) * W + xi + dx, ID.boulder);
      sim.fire('death', { c, species: sp.id, cause: 'sunlight', x: xi, y: yi, team: c.team, tags: sp.tags });
      sim.api.discover('troll-stone', xi, yi);
      return;
    }
    // night spirits fade at day
    if (sp.night && sim.daylight() > 0.7 && rng() < 0.002) { die(c, 'dawn'); return; }

    // think
    if (--c.think <= 0) {
      c.think = 8 + (rng() * 10 | 0);
      think(c);
      if (!c.alive) return;
    }
    act(c);
    move(c);
  }

  function think(c) {
    const sp = c.sp;
    // in the middle of a meal: finish it
    if (c.state === 'eat' && c.eatCell != null && c.eatT > 0 && !c.burning) { c.think = 6; return; }
    // tower defense: a runner follows the flow field to the keep and nothing else
    if (c.runner && sim.td?.steer(c)) return;
    if (sp.flies && (sp.boss || sp.breath)) { dragonThink(c); return; }
    // burning: run about wildly (people head for water if they know some)
    if (c.burning) {
      c.state = 'panic';
      const a = rng() * Math.PI * 2;
      c.tx = c.x + Math.cos(a) * 8; c.ty = c.y + Math.sin(a) * 8;
      return;
    }
    const danger = feelsDanger(c);
    if (danger && !(c.state === 'attack' && c.target && danger.c === c.target && sp.attack)) {
      if (!sp.guard && !(sp.attack && danger.c && huntable(c, danger.c) && c.hp > c.maxHp * 0.4)) {
        c.state = 'flee';
        const dx = c.x - danger.x, dy = c.y - danger.y, d = Math.hypot(dx, dy) || 1;
        c.tx = c.x + dx / d * 14 + (rng() - 0.5) * 6; c.ty = c.y + dy / d * 14 + (rng() - 0.5) * 6;
        c.fleeT = 40;
        return;
      }
    }
    if (c.fleeT > 0) return;
    // travellers walk to their goal (a caravan, settlers heading for a gate)
    if (c.goal && c.team !== 'monster' && !sp.attack && !sp.ranged && !sp.guard) {
      c.state = 'travel'; c.tx = c.goal.x + (rng() - 0.5) * 4; c.ty = c.goal.y + (rng() - 0.5) * 4; return;
    }
    // villagers: the village decides
    if (sp.kind === 'person' && sim.village && c.village != null && !sp.attack && !sp.ranged && !sp.heal) {
      if (sim.village.think(c)) return;
    }
    // fighters: anything hostile nearby
    if (sp.attack || sp.ranged) {
      const range = sp.guard || c.team === 'village' ? 34 : sp.raider ? 60 : c.hunger > 0.7 ? 110 : 40;
      const hungry = sp.diet !== 'hunt' || c.hunger > 0.35;
      if (hungry) {
        // raiders go for people close by, but do not chase fleeing folk across the map when there are roofs to burn
        const r = sp.raider && sp.hunts.has('building') && sim.village?.nearestVillage(c.x, c.y) ? 14 : range;
        const prey = nearest(c.x, c.y, r, (o) => huntable(c, o));
        if (prey) { c.state = 'attack'; c.target = prey; return; }
      }
      if (sp.hunts.has('building') && sim.village) {
        const b = sim.village.nearestBuildingCell(c.x, c.y, 70);
        if (b) { c.state = 'smash'; c.tx = b.x + 0.5; c.ty = b.y + 0.5; c.targetCell = b; return; }
      }
      if (sp.hunts.has('crop')) {
        const f = pickFood(c);
        if (f >= 0 && w.mat[f] === ID.crop) { c.state = 'eat'; c.tx = f % W + 0.5; c.ty = (f / W | 0) + 0.5; c.eatCell = f; return; }
      }
      if (sp.raider && sim.village) {
        const v = sim.village.nearestVillage(c.x, c.y);
        if (v) { c.state = 'raid'; c.tx = v.x + (rng() - 0.5) * 10; c.ty = v.y + (rng() - 0.5) * 10; return; }
      }
      if (c.goal) { c.state = 'raid'; c.tx = c.goal.x + (rng() - 0.5) * 8; c.ty = c.goal.y + (rng() - 0.5) * 8; return; }
      // a defender the player set down holds that spot instead of walking home to the village
      if (c.post) {
        // guarding a flock: the post drifts with it, so a wandering flock keeps its guards (not villagers —
        // that pulled archers off a palisade into the cottages)
        if (rng() < 0.25) {
          let x = 0, y = 0, n = 0;
          near(c.post.x, c.post.y, 18, (o) => { if (o.alive && !o.sp.attack && !o.sp.ranged && o.sp.tags.has('livestock')) { x += o.x; y += o.y; n++; } });
          if (n >= 2) { c.post.x += (x / n - c.post.x) * 0.5; c.post.y += (y / n - c.post.y) * 0.5; }
        }
        if (Math.hypot(c.post.x - c.x, c.post.y - c.y) > 6 || rng() < 0.3) { c.state = 'patrol'; c.tx = c.post.x + (rng() - 0.5) * 8; c.ty = c.post.y + (rng() - 0.5) * 8; }
        return;
      }
      if (sp.guard && c.team === 'village' && sim.village) {
        const v = sim.village.nearestVillage(c.x, c.y);
        if (v && Math.hypot(v.x - c.x, v.y - c.y) > 16) { c.state = 'patrol'; c.tx = v.x + (rng() - 0.5) * 20; c.ty = v.y + (rng() - 0.5) * 20; return; }
      }
    }
    if (sp.heal && c.healCd <= 0) {
      const hurtOne = nearest(c.x, c.y, sp.heal.range, (o) => o.team === c.team && o.hp < o.maxHp * 0.8 && o !== c);
      if (hurtOne) { c.state = 'heal'; c.target = hurtOne; return; }
    }
    // eat
    if (sp.diet === 'graze' && c.hunger > 0.35) {
      const f = pickFood(c);
      if (f >= 0) { c.state = 'eat'; c.tx = f % W + 0.5; c.ty = (f / W | 0) + 0.5; c.eatCell = f; return; }
    }
    if (sp.diet === 'hunt' && c.hunger > 0.35) {
      const prey = nearest(c.x, c.y, 50, (o) => huntable(c, o));
      if (prey) { c.state = 'attack'; c.target = prey; return; }
    }
    if (tryBreed(c)) return;
    // herd: stay with your own kind
    if (sp.herd || sp.pack || sp.swarm) {
      let sx = 0, sy = 0, n = 0;
      near(c.x, c.y, 16, (o) => { if (o.sp === sp && o !== c) { sx += o.x; sy += o.y; n++; } if (n > 8) return false; });
      if (n) { sx /= n; sy /= n; if (Math.hypot(sx - c.x, sy - c.y) > 5) { c.state = 'herd'; c.tx = sx + (rng() - 0.5) * 6; c.ty = sy + (rng() - 0.5) * 6; return; } }
    }
    if (sp.plants && rng() < 0.4) {
      const x = (c.x + (rng() - 0.5) * 6) | 0, y = (c.y + (rng() - 0.5) * 6) | 0;
      if (w.inside(x, y) && w.mat[y * W + x] === 0 && !M.liquid[w.mat[y * W + x]]) { setCell(w, y * W + x, ID.seed); w.ground[y * W + x] = ID.grass; }
    }
    // wander
    c.state = 'wander';
    const a = rng() * Math.PI * 2, r = sp.drift ? 3 : 2 + rng() * 9;
    c.tx = c.x + Math.cos(a) * r; c.ty = c.y + Math.sin(a) * r;
    if (sp.aquatic || sp.kind === 'animal') {
      // stay in the water / stay on the map
      c.tx = Math.max(2, Math.min(W - 3, c.tx)); c.ty = Math.max(2, Math.min(H - 3, c.ty));
    }
  }

  /** Look for a mate (or breed with one close by). True if that is what the creature is doing now. */
  function tryBreed(c) {
    const sp = c.sp;
    if (!sp.breed || c.cool > 0 || c.hunger >= 0.55 || c.age <= sp.adultAt * TPS || !canBreed(c)) return false;
    if (sp.breed.solo) { breed(c, c); return true; }
    const mate = nearest(c.x, c.y, sp.kind === 'person' ? 30 : 18, (o) => o.sp === sp && o !== c && o.sex !== c.sex && o.cool <= 0 && o.age > sp.adultAt * TPS && o.hunger < 0.6 && o.village === c.village);
    if (!mate) return false;
    if (Math.hypot(mate.x - c.x, mate.y - c.y) < 2.2) { breed(c, mate); return true; }
    c.state = 'mate'; c.job = 'mate'; c.tx = mate.x; c.ty = mate.y;
    return true;
  }
  C.tryBreed = tryBreed;

  function canBreed(c) {
    const b = c.sp.breed;
    if (b.beds) return sim.village ? sim.village.hasBed(c) : false;
    if ((counts[c.sp.id] || 0) >= (b.cap ?? 100) * (w.popScale ?? 1)) return false;
    if (b.nearWater) {
      let wet = false;
      for (let k = 0; k < 6 && !wet; k++) { const x = (c.x + (rng() - 0.5) * 12) | 0, y = (c.y + (rng() - 0.5) * 12) | 0; if (w.inside(x, y) && w.mat[y * W + x] === ID.water) wet = true; }
      if (!wet) return false;
    }
    return true;
  }

  function breed(a, b) {
    const sp = a.sp;
    const [lo, hi] = sp.breed.litter;
    const n = lo + ((rng() * (hi - lo + 1)) | 0);
    const mother = a.sex === 1 ? a : b;
    for (let k = 0; k < n; k++) {
      const kid = add(sp.id, (mother.x + (rng() - 0.5) * 2) | 0, (mother.y + (rng() - 0.5) * 2) | 0, { young: true, village: mother.village, team: mother.team });
      if (!kid) continue;
      kid.hunger = 0.1;
      if (sp.kind === 'person') { kid.tint.hair = (rng() < 0.5 ? a : b).tint.hair; }
      C.bornTotal++;
      sim.fire('birth', { c: kid, species: sp.id, x: kid.x, y: kid.y });
    }
    const cd = sp.breed.cooldown * TPS;
    a.cool = cd * (0.8 + rng() * 0.4); b.cool = cd * (0.8 + rng() * 0.4);
    a.hunger += 0.15; b.hunger += 0.15;
    if (sp.kind !== 'monster') burst(sim.ps, rng, mother.x, mother.y - 2, 4, { kind: P.mote, life: 24, rgb: [255, 140, 200], glow: 0.8, speed: 0.15 });
  }

  // ---------- doing ----------
  function act(c) {
    const sp = c.sp;
    if (c.state === 'eat' && c.eatCell != null) {
      const ex = c.eatCell % W + 0.5, ey = (c.eatCell / W | 0) + 0.5;
      if (Math.hypot(ex - c.x, ey - c.y) < 1.6) {
        const m = w.mat[c.eatCell];
        if (M.food[m] || (m === 0 && (w.ground[c.eatCell] === ID.grass || w.ground[c.eatCell] === ID.meadow))) {
          if (++c.eatT > 20) {
            c.eatT = 0;
            c.hunger = Math.max(0, c.hunger - 0.3 * Math.max(1, M.food[m]));
            if (m) setCell(w, c.eatCell, m === ID.bush && rng() < 0.7 ? ID.bush : 0);
            else if (rng() < 0.3) { w.ground[c.eatCell] = ID.dirt; w.touch(c.eatCell); }
            if (sp.swarm || m === ID.crop) sim.fire('eaten', { x: ex, y: ey, by: sp.id, crop: m === ID.crop });
            c.eatCell = null; c.think = 0;
          }
        } else { c.eatCell = null; c.think = 0; }
        c.tx = c.x; c.ty = c.y;
      }
    }
    if ((c.state === 'attack' || c.state === 'heal') && c.target) {
      const t = c.target;
      if (!t.alive) { c.target = null; c.think = 0; return; }
      const d = Math.hypot(t.x - c.x, t.y - c.y);
      if (c.state === 'heal') {
        if (d < sp.heal.range) {
          t.hp = Math.min(t.maxHp, t.hp + sp.heal.amt); c.healCd = sp.heal.rate * TPS; c.target = null; c.state = 'wander'; c.think = 0;
          burst(sim.ps, rng, t.x, t.y - 1, 6, { kind: P.mote, life: 20, rgb: [140, 255, 190], glow: 1, speed: 0.2 });
          sim.fire('healed', { c: t });
        } else { c.tx = t.x; c.ty = t.y; }
        return;
      }
      if (sp.ranged && d < sp.ranged.range && d > 3 && c.rngCd <= 0 && (!t.sp.flies || t.z < 18)) {
        shoot(c, t);
        c.rngCd = sp.ranged.rate * TPS;
        c.tx = c.x; c.ty = c.y;
        return;
      }
      const reach = (sp.attack?.range ?? 1.6) + t.sp.radius * 0.5;
      if (sp.attack && d < reach && (!t.sp.flies || t.z < 3)) {
        c.tx = c.x; c.ty = c.y;
        if (c.atkCd <= 0) {
          c.atkCd = sp.attack.rate * TPS;
          hurt(t, sp.attack.dmg * (0.8 + rng() * 0.4), 'bite', c.team === 'village' ? 'village' : sp.id);
          if (sp.attack.knock && t.alive) { t.kx += (t.x - c.x) / (d || 1) * sp.attack.knock * 0.5; t.ky += (t.y - c.y) / (d || 1) * sp.attack.knock * 0.5; }
          if (sp.attack.fire && t.alive && !t.sp.fireproof) t.burning = 90;
          spawn(sim.ps, { kind: P.spark, x: t.x, y: t.y - 1, vx: (rng() - 0.5) * 0.4, vy: -0.2, life: 6, rgb: [255, 255, 255], glow: 0.4 });
          if (!t.alive && sp.diet === 'hunt') c.hunger = Math.max(0, c.hunger - 0.8);
        }
      } else if (!sp.ranged || d > sp.ranged.range * 0.8 || d <= 3 || t.sp.flies) {
        // a shooter holds its ground between shots and only walks up to get in range (report #9:
        // archers ran into the enemy every time the bow was reloading). Too close to shoot, or a flyer: still close in.
        c.tx = t.x; c.ty = t.y;
      }
    }
    if (c.state === 'smash' && c.targetCell) {
      const b = c.targetCell;
      const d = Math.hypot(b.x + 0.5 - c.x, b.y + 0.5 - c.y);
      if (d < (sp.attack?.range ?? 1.5) + 0.8) {
        c.tx = c.x; c.ty = c.y;
        if (c.atkCd <= 0) {
          c.atkCd = (sp.attack?.rate ?? 1) * TPS;
          const j = b.y * W + b.x;
          const m = w.mat[j];
          if (!m || !M.built[m]) { c.targetCell = null; c.think = 0; return; }
          if (sp.ignites || sp.attack?.fire) { ignite(w, j, true); }
          const smash = sp.smashes ?? 40;
          if (smash >= M.hard[m] || rng() < smash / (M.hard[m] * 4)) {
            setCell(w, j, M.blastTo[m] !== 255 ? M.blastTo[m] : 0);
            burst(sim.ps, rng, b.x + 0.5, b.y + 0.5, 4, { kind: P.debris, mat: 0, rgb: [M.r[m], M.g[m], M.b[m]], up: 0.6, grav: 0.06, life: 30, speed: 0.4 });
            sim.fire('smash', { x: b.x, y: b.y, by: sp.id });
          }
        }
      }
    }
  }

  function shoot(c, t) {
    const sp = c.sp, R = sp.ranged;
    if (R.kind === 'missile') {
      const col = R.color ? hexRgb(R.color) : [200, 120, 255];
      for (let k = 0; k < (R.count || 3); k++) missile(c.x + (rng() - 0.5) * 2, c.y - 3, 2 + k, t, R.dmg, c.team, col, k * 3);
      sim.fire('shoot', { c, kind: 'missile' });
      return;
    }
    const dist = Math.hypot(t.x - c.x, t.y - c.y);
    const speed = R.kind === 'bolt' ? 0.9 : 0.7;
    const T = Math.max(4, dist / speed);
    const col = R.color ? hexRgb(R.color) : [230, 220, 190];
    const owner = c.team === 'village' ? 1 : c.team === 'monster' ? 2 : 0;
    if (t.sp.flies && t.z > 2) {
      // at a flyer: the shot flies straight at it; a hit is decided when it gets there
      const T2 = Math.max(4, dist / speed);
      spawn(sim.ps, { kind: R.kind === 'bolt' ? P.bolt : P.spark, x: c.x, y: c.y - 2, z: 2, vx: (t.x - c.x) / T2, vy: (t.y - c.y) / T2, vz: (t.z - 2) / T2, life: T2, rgb: col, glow: R.kind === 'bolt' ? 1 : 0.1 });
      sim.api.later(() => {
        if (!t.alive) return;
        const miss = Math.hypot(t.vx || 0, t.vy || 0) * T2 * 0.5;
        if (sim.rng() < 0.75 - Math.min(0.5, miss * 0.05)) hurt(t, R.dmg, R.kind === 'bolt' ? 'magic' : 'arrow', c.team);
      }, Math.round(T2));
      sim.fire('shoot', { c, kind: R.kind });
      return;
    }
    const lead = T * 0.5;
    const tx = t.x + (t.vx || 0) * lead, ty = t.y + (t.vy || 0) * lead;
    const dx = (tx - c.x) / T, dy = (ty - c.y) / T;
    const g = 0.03, z0 = 2;
    const vz = (0.5 * g * T * T - z0) / T;
    spawn(sim.ps, { kind: R.kind === 'bolt' ? P.bolt : P.spark, x: c.x, y: c.y - 2, z: z0, vx: dx, vy: dy, vz, grav: g, life: T + 10, rgb: col, glow: R.kind === 'bolt' ? 1 : 0, dmg: R.dmg, owner, onLand: 1 });
    sim.fire('shoot', { c, kind: R.kind });
  }

  function move(c) {
    const sp = c.sp;
    if (!sp.flies && (c.z > 0 || c.vz)) {
      c.z = Math.max(0, c.z + (c.vz || 0)); c.vz = (c.vz || 0) - 0.08;
      if (c.z === 0) { if (c.vz < -1.2) hurt(c, -c.vz * 4, 'fall', c.lastHurtBy); c.vz = 0; }
    }
    let speed = sp.speed * (c.frozen > 0 ? 0.3 : 1) * (c.state === 'flee' || c.state === 'panic' ? 1.35 : 1) * (c.state === 'wander' ? 0.6 : 1);
    if (c.age < sp.adultAt * TPS) speed *= 0.8;
    // knock-back first
    if (Math.abs(c.kx) + Math.abs(c.ky) > 0.01) {
      const nx = c.x + c.kx, ny = c.y + c.ky;
      if (sp.flies || walkable(c, nx, ny) || M.liquid[w.mat[(ny | 0) * W + (nx | 0)]]) { c.x = Math.max(0.5, Math.min(W - 0.5, nx)); c.y = Math.max(0.5, Math.min(H - 0.5, ny)); }
      c.kx *= 0.8; c.ky *= 0.8;
    }
    if (c.fleeT > 0) c.fleeT--;
    if (w.barriers && w.barriers.length && hostileToBarrier(c) && !sp.flies) for (const b of w.barriers) {
      const bx = c.x - b.x, by = c.y - b.y, bd = Math.hypot(bx, by);
      if (bd < b.r) { c.kx += bx / (bd || 1) * 0.35; c.ky += by / (bd || 1) * 0.35; }
    }
    const dx = c.tx - c.x, dy = c.ty - c.y;
    const d = Math.hypot(dx, dy);
    c.moving = false;
    if (d < 0.3) { c.vx = 0; c.vy = 0; return; }
    const s = Math.min(d, speed * speedAt(c));
    let ux = dx / d, uy = dy / d;
    if (sp.hops && (sim.tick + c.id) % 12 > 6) return;
    let nx = c.x + ux * s, ny = c.y + uy * s;
    // stuck against something for a second: step aside for a while, then try again
    if ((sim.tick + c.id) % 30 === 0) {
      if ((c.team === 'monster' || sp.diet === 'hunt') && c.lastX != null && Math.hypot(c.x - c.lastX, c.y - c.lastY) < 0.6 && d > 4 && c.state !== 'eat' && c.state !== 'sleep') {
        const a = Math.atan2(dy, dx) + (rng() < 0.5 ? 1.6 : -1.6);
        c.tx = c.x + Math.cos(a) * 10; c.ty = c.y + Math.sin(a) * 10; c.think = 30; c.detourT = 0;
      }
      c.lastX = c.x; c.lastY = c.y;
    }
    if (c.detourT > 0) c.detourT--;
    if (!walkable(c, nx, ny) || c.detourT > 0) {
      // go round: keep turning to ONE side (remembered for a while) until the way is clear —
      // a wall-follower, so a villager behind a cottage walks round it instead of pushing on it
      if (!c.detourT) { c.detour = (c.id & 1) ? 1 : -1; }
      let ok = false;
      const base = Math.atan2(uy, ux);
      for (let k = c.detourT > 0 ? 0 : 1; k <= 8; k++) {
        const a = base + c.detour * k * 0.393;
        const tx = c.x + Math.cos(a) * s, ty = c.y + Math.sin(a) * s;
        if (walkable(c, tx, ty)) {
          nx = tx; ny = ty; ux = Math.cos(a); uy = Math.sin(a); ok = true;
          if (k > 0) c.detourT = Math.max(c.detourT, 24);
          break;
        }
      }
      if (!ok) {
        c.detour = -c.detour; c.detourT = 0;
        c.think = Math.min(c.think, 3); c.tx = c.x + (rng() - 0.5) * 8; c.ty = c.y + (rng() - 0.5) * 8; return;
      }
    }
    c.vx = nx - c.x; c.vy = ny - c.y;
    c.x = Math.max(0.5, Math.min(W - 0.5, nx));
    c.y = Math.max(0.5, Math.min(H - 0.5, ny));
    c.moving = true;
    if (Math.abs(ux) > 0.2) c.dir = ux < 0 ? -1 : 1;
  }

  // ---------- dragons and other fire-breathing flyers ----------
  function dragonThink(c) {
    const sp = c.sp;
    if (c.hp < c.maxHp * 0.25 && sp.boss && !sp.noFlee) {
      if (c.dragonPhase !== 'flee') { c.dragonPhase = 'flee'; sim.fire('dragon-flee', { c }); }
      const ex = c.x < W / 2 ? -30 : W + 30;
      c.tx = ex; c.ty = c.y - 20;
      return;
    }
    if (c.dragonPhase === 'flee') return;
    // a nest guard (leash) circles its nest and only goes for what comes close to it
    const L = c.leash;
    if (L) {
      if (c.target && (!c.target.alive || Math.hypot(c.target.x - L.x, c.target.y - L.y) > L.r)) c.target = null;
      if (!c.target || rng() < 0.08) c.target = nearest(L.x, L.y, L.r, (o) => huntable(c, o)) || null;
      if (!c.target) { c.orbitA += 0.4; c.dragonPhase = 'circle'; c.tx = L.x + Math.cos(c.orbitA) * 22; c.ty = L.y + Math.sin(c.orbitA) * 16; return; }
    }
    // pick something to burn
    if (!L && (!c.target || !c.target.alive || rng() < 0.08)) {
      let best = null;
      const v = sim.village ? sim.village.nearestVillage(c.x, c.y) : null;
      if (v && (rng() < 0.5 || sp.boss)) {
        const b = sim.village.nearestBuildingCell(v.x + (rng() - 0.5) * 20, v.y + (rng() - 0.5) * 20, 40);
        if (b) best = { x: b.x + 0.5, y: b.y + 0.5, alive: true, cell: true };
      }
      if (!best) { const prey = nearest(c.x, c.y, 80, (o) => huntable(c, o)); if (prey) best = prey; }
      c.target = best;
    }
    const t = c.target;
    if (!t) {
      c.orbitA += 0.4;
      const cx = c.goal ? c.goal.x : W / 2, cy = c.goal ? c.goal.y : H / 2;
      c.tx = cx + Math.cos(c.orbitA) * 30; c.ty = cy + Math.sin(c.orbitA) * 24;
      return;
    }
    const d = Math.hypot(t.x - c.x, t.y - c.y);
    if (c.breathCd <= 0 && d < sp.breath.range * 1.6) {
      c.dragonPhase = 'dive';
      // fly over the target, breathing
      const ax = (t.x - c.x) / (d || 1), ay = (t.y - c.y) / (d || 1);
      c.tx = t.x + ax * 22; c.ty = t.y + ay * 22;
      if (d < sp.breath.range) { c.breathT = sp.breath.duration * TPS; c.breathCd = sp.breath.rate * TPS * (c.enraged ? 0.6 : 1); sim.fire('roar', { c }); }
    } else {
      c.dragonPhase = 'circle';
      c.orbitA += 0.5;
      c.tx = t.x + Math.cos(c.orbitA) * 34; c.ty = t.y + Math.sin(c.orbitA) * 26;
    }
  }

  // an elder wyrm in its second fury calls burning stones down around what it hunts
  // (enrage2.firefall: { every: secs, count, radius }) — a short meteor shower from the spells
  function firefall(c) {
    const ff = c.sp.enrage2?.firefall;
    if (!ff || !sim.spells || --c.firefallT > 0) return;
    c.firefallT = ff.every * TPS;
    const t = c.target && c.target.alive ? c.target : { x: c.x, y: c.y };
    const x = Math.max(10, Math.min(W - 11, t.x)), y = Math.max(10, Math.min(H - 11, t.y));
    sim.spells.active.push({ kind: 'shower', x, y, r: ff.radius ?? 24, left: ff.count ?? 4, next: 20, level: 0 });
    sim.fire('firefall', { c, x, y });
  }

  function dragonStep(c) {
    const sp = c.sp;
    if (c.breathCd > 0) c.breathCd--;
    // flying with momentum: steer toward the target point
    const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy) || 1;
    const sp0 = sp.speed * (c.frozen > 0 ? 0.55 : 1) * (c.enraged ? 1.3 : 1);
    c.vx += (dx / d * sp0 - c.vx) * 0.06;
    c.vy += (dy / d * sp0 - c.vy) * 0.06;
    c.x += c.vx; c.y += c.vy;
    if (Math.abs(c.vx) > 0.03) c.dir = c.vx < 0 ? -1 : 1;
    c.moving = true;
    const alt = (sp.altitude ?? 10) * (c.frozen > 0 ? (sp.boss ? 0.75 : 0.4) : 1) * (c.breathT > 0 ? 0.7 : 1);
    c.z += (alt - c.z) * 0.05;
    if (c.dragonPhase === 'flee' && (c.x < -20 || c.x > W + 20 || c.y < -20 || c.y > H + 20)) {
      remove(c);
      sim.fire('fled', { c, species: sp.id });
      return;
    }
    c.x = Math.max(-25, Math.min(W + 25, c.x)); c.y = Math.max(-25, Math.min(H + 25, c.y));
    if (c.breathT > 0) {
      c.breathT--;
      const a = Math.atan2(c.vy, c.vx);
      const hx = c.x + Math.cos(a) * 3, hy = c.y + Math.sin(a) * 3;
      const n = sp.boss ? 5 : 3;
      for (let k = 0; k < n; k++) {
        const aa = a + (rng() - 0.5) * sp.breath.cone * 2;
        const s = 0.6 + rng() * 0.5;
        const life = sp.breath.range / s;
        spawn(sim.ps, { kind: P.flame, x: hx, y: hy, z: c.z, vx: Math.cos(aa) * s + c.vx, vy: Math.sin(aa) * s + c.vy, vz: -c.z / life, grav: 0.0001, life: life, rgb: rng() < 0.4 ? [255, 230, 120] : [255, 110 + (rng() * 60 | 0), 20], glow: 1.3 });
      }
      w.lights.push({ x: hx + Math.cos(a) * 8, y: hy + Math.sin(a) * 8, r: 255, g: 140, b: 40, rad: 26, ttl: 2, max: 2 });
      // breath scorches creatures under it
      near(hx + Math.cos(a) * 8, hy + Math.sin(a) * 8, 8, (o) => { if (o !== c && !o.sp.fireproof && !o.sp.flies) { o.burning = Math.max(o.burning, 100); hurt(o, 0.4, 'fire', sp.id); } });
    }
  }
  // flames from breath that land heat the ground (particles.js handles cells); hits on flyers:
  sim.particleHooks.fly = null;

  // ---------- homing missiles (mages, the Arcane Missiles spell) ----------
  const missiles = [];
  C.missiles = missiles;
  const enemyOf = (team) => (o) => o.alive && (team === 'monster' ? (o.team === 'village' || o.sp.tags.has('livestock')) : (o.team === 'monster' || (o.team === 'wild' && o.sp.diet === 'hunt')));
  function missile(x, y, z, target, dmg, team, rgb, delay = 0) {
    const a = rng() * Math.PI * 2;
    missiles.push({ x, y, z, vx: Math.cos(a) * 0.5, vy: Math.sin(a) * 0.5 - 0.3, target, dmg, team, rgb, ttl: 150, delay });
  }
  C.missile = missile;
  C.enemyOf = enemyOf;
  function stepMissiles() {
    for (let k = missiles.length - 1; k >= 0; k--) {
      const m = missiles[k];
      if (m.delay > 0) { m.delay--; continue; }
      if (--m.ttl <= 0) { missiles.splice(k, 1); continue; }
      if (!m.target || !m.target.alive) m.target = nearest(m.x, m.y, 30, enemyOf(m.team));
      let tx = m.x + m.vx * 5, ty = m.y + m.vy * 5, tz = 2;
      if (m.target) { tx = m.target.x; ty = m.target.y - 1; tz = m.target.sp.flies ? m.target.z : 1; }
      const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy) || 1;
      // steer: a curving dart that speeds up as it closes in
      const sp = Math.min(1.4, 0.55 + (150 - m.ttl) * 0.012);
      m.vx += (dx / d * sp - m.vx) * 0.22; m.vy += (dy / d * sp - m.vy) * 0.22;
      m.x += m.vx; m.y += m.vy; m.z += (tz - m.z) * 0.15;
      spawn(sim.ps, { kind: P.mote, x: m.x, y: m.y, z: m.z, life: 7, rgb: m.rgb, glow: 1.2 });
      if (m.target && Math.hypot(m.target.x - m.x, m.target.y - 1 - m.y) < 1.3 + m.target.sp.radius * 0.4) {
        hurt(m.target, m.dmg, 'magic', m.team === 'village' ? 'village' : m.team === 'player' ? 'missiles' : 'monster');
        burst(sim.ps, rng, m.x, m.y, 6, { kind: P.spark, life: 10, rgb: m.rgb, glow: 1.2, speed: 0.5 });
        w.lights.push({ x: m.x, y: m.y, r: m.rgb[0], g: m.rgb[1], b: m.rgb[2], rad: 8, ttl: 5, max: 5 });
        missiles.splice(k, 1);
      }
    }
  }

  // ---------- the tick ----------
  C.step = function () {
    rebuild();
    stepMissiles();
    for (let k = 0; k < list.length; k++) {
      const c = list[k];
      if (!c.alive) continue;
      if (c.held) { c.burning = 0; continue; }
      if (c.sp.flies && (c.sp.boss || c.sp.breath)) {
        c.age++;
        if (c.hurtFlash > 0) c.hurtFlash--;
        if (c.frozen > 0) c.frozen--;
        if (c.burning) c.burning--;
        if (--c.think <= 0) { c.think = 15; dragonThink(c); }
        dragonStep(c);
        if (c.alive && c.enraged2) firefall(c);
        continue;
      }
      if (c.sp.flies && !c.sp.breath) {
        // fliers that are not fire-breathers keep a hover height and use the normal brain
        c.z += ((c.sp.altitude ?? 4) + Math.sin((sim.tick + c.id * 7) * 0.08) * 0.8 - c.z) * 0.1;
      }
      stepOne(c);
    }
    // compact dead ones
    if (sim.tick % 30 === 0) {
      let j = 0;
      for (let k = 0; k < list.length; k++) if (list[k].alive) list[j++] = list[k];
      list.length = j;
    }
    if (C.deaths.length > 400) C.deaths.splice(0, C.deaths.length - 200);
  };

  // ---------- drawing ----------
  C.draw = function (api, tick) {
    // ground creatures first (sorted by y), then flyers
    const ground = [], air = [];
    for (const c of list) if (c.alive) (c.sp.flies && c.z > 2 ? air : ground).push(c);
    ground.sort((a, b) => a.y - b.y);
    air.sort((a, b) => a.z - b.z);
    for (const c of air) drawShadow(api, c);
    for (const c of ground) drawOne(api, c, tick);
    for (const c of air) drawOne(api, c, tick);
  };
  function frameOf(c, tick) {
    const F = c.sp.frames;
    const young = c.age < c.sp.adultAt * 30 && F.young;
    if (young) return F.young;
    if (c.sp.flies && F.fly) return ((tick + c.id * 3) >> 3) & 1 ? F.fly2 || F.fly : F.fly;
    if (c.moving && F.walk2) return ((tick + c.id) >> 2) & 1 ? F.walk2 : F.walk;
    return F.walk || F.fly;
  }
  function drawShadow(api, c) {
    const f = frameOf(c, 0);
    const k = Math.max(0.45, 0.75 - c.z * 0.01);
    for (const p of f.px) api.shade(c.x + p.x * c.dir + 1 + c.z * 0.15, c.y + p.y + c.z * 0.25 * 0 + 1, k);
  }
  function drawOne(api, c, tick) {
    const f = frameOf(c, tick);
    const lift = c.z * 0.7;
    const fl = c.hurtFlash > 0;
    for (const p of f.px) {
      let [r, g, b] = p.tint ? (c.tint[p.tint] || [200, 200, 200]) : p.rgb;
      if (fl) { r = 255; g = 255; b = 255; }
      else if (c.frozen > 0) { r = r * 0.5 + 90; g = g * 0.6 + 100; b = b * 0.4 + 150; }
      if (c.burning && ((tick + p.x * 3 + p.y) & 3) === 0) { r = 255; g = 150; b = 30; }
      api.px(c.x + p.x * c.dir, c.y + p.y - lift, r, g, b, p.glow + (c.burning ? 0.3 : 0));
    }
    if (c.sp.glowRgb) api.glow(c.x, c.y - lift - 1, c.sp.glowRgb[0] * 0.6, c.sp.glowRgb[1] * 0.6, c.sp.glowRgb[2] * 0.6);
    if (c.burning) api.glow(c.x, c.y - lift - 1, 255, 120, 30);
  }

  return C;
}
