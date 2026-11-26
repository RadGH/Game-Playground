// How every spell and attack LOOKS in the game (owner 2026-11-26: "TRIPLE the amount of graphics used EVERYWHERE for
// ALL spells and attacks … Sunlance and cleave don't even do an attack animation … I want things to get blown apart
// by fireball explosions and smack things in a circle knocking down enemies around me"). docs/CASE-PALADIN.md is the
// recipe; this file is phases 0-7 of it, driven by the server's events and by your own key presses:
//   0 body      the hero animates ON THE KEY PRESS (prediction, no round trip) — render/moves.js picks the clip/move
//   1 wind-up   ≥ 0.25 s at the hands for every cast (instant ones too, touch too), then
//   2 release   the flash, motes and the bloom round the caster
//   3 travel    bolts start at the hand and stop where the server's bolt ends (render/fx.js); every line spell draws
//               a real beam/wave from the hand to its true end; meteors / lobs fly in on the spell's own delay
//   4 impact    repeated over the TRUE shape: 5-7 points across a swing's arc, 12 round a ring, 6-10 along a line, a
//               filled disc for ground spells — plus the `area` layer once at the real radius (kit.spread)
//   5 linger    the server's 'zone' events (fx.ground)
//   6 target    every body hit is pushed back and puffs up (moves.react), and gets its element's burst at the chest
//   7 shake     your hits 0.28 (crit 0.55), being hit 0.35, big areas 0.4 — only with Settings → Camera shake on;
//               a 55 ms freeze (90 on a crit) on your own big hits
// Throws, leaps, landings, charges and exploding balls ('knock' / 'leap' / 'land' / 'rush' / 'burst' events, js/rules/
// combat.js) get their dust, shockwaves and blasts here; the bodies' own flight is actors.js's. Every handler is safe
// when an event never comes (an older server): a leap without a 'land' still lands, a ball without a 'burst' still
// explodes where its bolt ended (fx.js).
//
//   const look = createSpellLook({ fx, actors, moves, heightAt, rowOf(spell, who), unitOf(id), handsOf(id), meId(), shakeOn() })
//   look.press(spell, row, { dir, at })   look.cast(e)   look.hit(e)   look.knock(e)   look.leap(e)   look.land(e)
//   look.rush(e)   look.burst(e)   look.attack(e) (a wand's basic: its own clip)   look.update(dt) → dt for the world (hit-stop)
import * as THREE from 'three';
import { targetKind, powerFrom } from '../../rules/spells.js';

/** The body move for a spell row (moves.js styles). Weapon spells swing; slams and novas crouch and slam. */
export function moveStyle(row, id = '') {
  if (!row) return 'cast';
  const shape = row.shape, weapon = ['melee', 'blend', 'ranged', 'blendRanged'].includes(powerFrom(row) || '') && (row.element || 'physical') === 'physical';
  const weaponish = ['melee', 'blend'].includes(powerFrom(row) || '');
  if (row.channel) return 'channel';
  if (shape === 'bolt') return 'shoot';
  if (shape === 'melee' && (row.reach || 3) > 6) return 'cast';     // a spray (Arcane Blast, Multi-Shot): push it out
  if (shape === 'melee') return /bash|shove|slam/.test(id) || (row.knock?.down && (row.arc || 2) < 2) ? 'bash' : 'swing';
  if (shape === 'around') {
    if (((row.repeats || 1) > 1 && weaponish) || /knives|whirl|blade|storm|waltz|flurry|spin/.test(id)) return 'spin';
    return 'slam';
  }
  // a charge / a leap: the body's run and jump arc are actors.js lunge() / leap() (started by the combat code)
  if (shape === 'dash') return 'rush';
  if (shape === 'leap') return 'leap';
  if (shape === 'beam') return weapon || (weaponish && (row.width || 0) >= 4) ? 'overhead' : 'cast';
  if (shape === 'ground') return 'ground';
  if (row.mult && row.radius) return 'slam';
  if (/war_cry|warcry|roar|shout|challenge|rally/.test(id)) return 'roar';
  return 'ground';
}

export function createSpellLook({ fx, actors, moves, heightAt, rowOf, unitOf, handsOf, meId, shakeOn = () => true }) {
  const kit = fx.kit;
  const safe = f => { try { return f(); } catch (err) { console.info('spell look:', err.message); return null; } };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const ground = (x, z, dy = 0) => V(x, heightAt(x, z) + dy, z);
  const predicted = new Map();      // my spell id -> time of my key press (the server's cast then skips the body + wind-up)
  const leaps = new Map();          // who -> { spell, landed }
  let stopLeft = 0, lastStop = -9;
  const now = () => performance.now() / 1000;
  const visualOf = (spell, row) => (kit ? kit.visualFor(spell, row ? { kind: targetKind(row), element: row.element || 'physical' } : null) : null);

  /** a wind-up at the caster's hands for `sec`, then its release (every cast, instant ones too) */
  function windup(who, spell, sec = 0.28) {
    const a = actors.get(who);
    if (!kit || !a) return;
    const w = safe(() => kit.windup(a.root, spell, { hands: handsOf(who) }));
    if (w) kit.wait(sec).then(() => safe(() => w.release()));
  }

  /** The body + wind-up of a cast (mine on the key press, others' when the server says). */
  function begin(who, spell, row) {
    const style = moveStyle(row, spell);
    moves.play(who, style, { reps: style === 'spin' ? row.repeats || 1 : 1, every: row.repeatEvery || 0.3 });
    if (style !== 'channel' && style !== 'rush' && style !== 'leap') windup(who, spell, style === 'swing' || style === 'bash' || style === 'spin' ? 0.22 : 0.3);
  }

  /** A spell's effects at its TRUE shape and size, from the server's cast event. */
  function draw(e, row, u) {
    if (!kit || !row) return;
    const spell = e.spell, vis = visualOf(spell, row), def = kit.visuals[vis.visual] || {};
    const d = e.dir ? { x: e.dir[0], z: e.dir[1] } : { x: Math.sin(u.drawFacing || 0), z: Math.cos(u.drawFacing || 0) };
    const feet = ground(u.x, u.z), reps = Math.max(1, row.repeats || 1), every = row.repeatEvery || 0.3;
    const later = (s, f) => (s > 0 ? kit.wait(s).then(() => safe(f)) : safe(f));
    const shape = row.shape;
    if (shape === 'melee' && (row.reach || 3) > 6) {
      // a long cone is a SPRAY, not a swing (Arcane Blast, Flame Wave, Multi-Shot): from the hand out to the reach —
      // a fan of real missiles for a missile visual, the visual's cone spray for the rest; impacts across the far arc
      const reach = row.reach, arc = row.arc || 1.2, hand = handPoint(e.who, u);
      for (let i = 0; i < reps; i++) later(i * every, () => {
        if (def.kind === 'missile') for (const q of shapeArc(feet, d, reach, arc, 7)) safe(() => kit.missile(hand.clone(), V(q[0], heightAt(q[0], q[2]) + 1.1, q[2]), vis, { speed: 40 }).then(p => kit.impact(p, vis, { scale: 0.7 })));
        else kit.impact(hand, vis, { dir: V(d.x, 0, d.z), radius: reach });
        kit.spread(vis, { shape: 'arc', at: feet, dir: d, radius: reach * 1.2, angle: arc, n: 6, every: 0.04, area: false });
      });
    } else if (shape === 'melee') {
      const reach = row.reach || 3, arc = Math.min(Math.PI * 2, row.arc || 1.6);
      for (let i = 0; i < reps; i++) later(i * every + 0.06, () => {
        kit.swing(feet, vis, { dir: d, radius: reach, angle: Math.max(1.2, arc), seconds: 0.2 });
        kit.spread(vis, { shape: 'arc', at: feet, dir: d, radius: reach, angle: arc, n: arc > 2.5 ? 7 : 5, every: 0.025 });
      });
    } else if (shape === 'around' || (shape === 'self' && row.mult && row.radius)) {
      const R = row.radius || 4;
      for (let i = 0; i < reps; i++) later(i * every, () => {
        if (def.sweep) kit.swing(feet, vis, { dir: d, radius: R * 0.85, angle: Math.PI * 2.2, seconds: 0.36, tail: 3 });
        kit.impact(V(feet.x, feet.y + 0.3, feet.z), vis, { radius: R, dir: V(d.x, 0, d.z) });
        kit.spread(vis, { shape: 'ring', at: feet, dir: d, radius: R, n: 12, every: 0.02, area: i === 0 });
      });
    } else if (shape === 'beam' && !row.channel) {
      const len = row.range || 15, hand = handPoint(e.who, u), end = ground(feet.x + d.x * len, feet.z + d.z * len, 1.1);
      for (let i = 0; i < reps; i++) later(i * every, () => {
        if (def.beam) kit.beam(hand, [end], vis, { seconds: 0.55 });
        kit.spread(vis, { shape: 'line', at: feet, dir: d, length: len, radius: (row.width || 2) / 2, n: Math.max(6, Math.min(10, Math.round(len / 2.5))), every: 0.03, area: false });
        kit.impact(end, vis, { radius: (row.width || 2) / 2 + 1, dir: V(d.x, 0, d.z) });
      });
    } else if (shape === 'ground') {
      const R = row.radius || 4, delay = row.delay || 0;
      const at = e.at ? ground(e.at[0], e.at[1]) : ground(feet.x + d.x * Math.min(12, row.range || 12), feet.z + d.z * Math.min(12, row.range || 12));
      const blast = () => {
        kit.impact(V(at.x, at.y + 0.3, at.z), vis, { radius: R, scale: Math.max(1, R / 5) });
        kit.spread(vis, { shape: 'disc', at, dir: d, radius: R, n: Math.max(7, Math.min(14, Math.round(R * 1.6))), every: 0.025 });
        if (R >= 4 && near(at, 30)) shake(0.4);
      };
      const tr = def.travel;
      if (tr && (tr.from === 'sky' || delay >= 0.3)) {
        const from = tr.from === 'sky' ? V(at.x - 4, at.y + 18, at.z - 3) : handPoint(e.who, u);
        const fly = Math.max(0.3, delay || 0.6);
        safe(() => kit.missile(from, at, vis, { speed: from.distanceTo(at) / fly, arc: tr.from === 'sky' ? 0 : 0.2 }).then(() => safe(blast)));
        for (let i = 1; i < reps; i++) later(fly + i * every, () => kit.impact(V(at.x, at.y + 0.3, at.z), vis, { radius: R }));
      } else for (let i = 0; i < reps; i++) later(delay + i * every, i === 0 ? blast : () => kit.spread(vis, { shape: 'disc', at, radius: R, n: 6, area: false }));
    } else if (shape === 'self' || shape === 'summon') {
      later(0.12, () => kit.impact(V(feet.x, feet.y + 0.9, feet.z), vis, { radius: Math.max(2, row.allies || row.radius || 2.5), target: actors.get(e.who)?.root || null }));
      if (def.aura && actors.get(e.who)) safe(() => kit.aura(actors.get(e.who).root, vis, { seconds: def.auraTime || 1.2 }));
    }
    // dashes and leaps: their 'rush' / 'leap' / 'land' events draw the path and the landing
  }

  /** points across the far end of an arc (the fan of a multi-shot) */
  function shapeArc(c, d, reach, arc, n) {
    const a0 = Math.atan2(d.x, d.z), out = [];
    for (let i = 0; i < n; i++) { const a = a0 + (i / (n - 1) - 0.5) * arc; out.push([c.x + Math.sin(a) * reach, 0, c.z + Math.cos(a) * reach]); }
    return out;
  }
  function handPoint(who, u) {
    const h = handsOf(who)?.[1];
    if (h) { const p = new THREE.Vector3(); h.getWorldPosition(p); return p; }
    return ground(u.x, u.z, 1.3);
  }
  const near = (p, m) => { const me = unitOf(meId()); return !!me && Math.hypot(me.x - p.x, me.z - p.z) < m; };
  function shake(s) { if (kit && shakeOn()) kit.shake(s); }
  function hitStop(sec) { const t = now(); if (t - lastStop < 0.18) return; lastStop = t; stopLeft = Math.max(stopLeft, sec); }

  return {
    moveStyle, rowOf, visualOf,
    /** My key press: the body moves and the hands light up NOW (the server's reply only adds the impacts). */
    press(spell, row) {
      const me = meId();
      if (!row || !me) return;
      predicted.set(spell, now());
      begin(me, spell, row);
    },
    /** A wand / tome / staff's basic attack: its own clip (a point-and-fire; a sceptre swings). */
    attack(e) {
      const style = e.shape === 'melee' ? 'swing' : e.shape === 'pool' || e.shape === 'ground' || e.shape === 'lob' ? 'ground' : e.shape === 'nova' ? 'slam' : e.shape === 'burst' ? null : 'wand';
      if (!style) return;
      const u = unitOf(e.who); if (u) { u.actedAt = u.swungAt = now(); }
      if (e.who === meId() && now() - (predicted.get('attack') || -9) < 0.4) return;
      moves.play(e.who, style);
    },
    /** My basic-attack key: swing at once (the server's hit / miss then doesn't swing again). */
    pressAttack(style = 'swing') {
      const me = meId(), u = unitOf(me); if (!u) return;
      if (now() - (u.swungAt || -9) < 0.45) return;
      u.swungAt = u.actedAt = now(); predicted.set('attack', now());
      moves.play(me, style);
    },
    cast(e) {
      const u = unitOf(e.who); if (!u) return;
      const row = rowOf(e.spell, e.who);
      u.actedAt = now();
      const mine = e.who === meId() && now() - (predicted.get(e.spell) || -9) < 1.2;
      if (mine) predicted.delete(e.spell); else begin(e.who, e.spell, row);
      if (row?.shape === 'leap') leaps.set(e.who, { spell: e.spell, at: e.at, row, t: now(), seen: false });
      draw(e, row, u);
    },
    /** A body hit: its element's burst at the chest (smaller for an area spell: the area itself is the show), the
     *  push-back + puff, shakes and the hit-stop. */
    hit(e) {
      const t = unitOf(e.to); if (!t) return;
      const from = unitOf(e.from);
      const row = e.spell ? rowOf(e.spell, e.from) : null;
      const area = row && (row.radius || row.explode || row.shape === 'around' || row.shape === 'ground' || (row.arc || 0) > 2);
      const big = !!(e.crit || e.spell);
      // (the push-back + puff on the body is actors.js flinch(), called from the same 'hit' event)
      if (e.from === meId()) { shake(e.crit ? 0.55 : big ? 0.32 : 0.2); if (big) hitStop(e.crit ? 0.09 : 0.055); }
      else if (e.to === meId()) shake(0.35);
      return { scale: area ? 0.55 : 1 };
    },
    /** A body thrown: dust where it leaves, a skid of dust along the way, a thud where it lands (bigger if knocked down). */
    knock(e) {
      if (!kit || !e.from || !e.to) return;
      const a = ground(e.from[0], e.from[1], 0.2), b = ground(e.to[0], e.to[1], 0.2);
      const air = e.air ?? Math.min(0.45, 0.3 + Math.hypot(b.x - a.x, b.z - a.z) * 0.03);
      safe(() => kit.impact(a, 'knock_land', { scale: 0.6 }));
      kit.wait(air).then(() => safe(() => {
        kit.impact(b, 'knock_land', { scale: e.down ? 1.15 : 0.8, dir: V(b.x - a.x, 0, b.z - a.z).normalize() });
        if (e.down && near(b, 18)) shake(0.15);
      }));
    },
    /** A hero jumps: dust and a ring at the take-off; the landing comes with 'land' (or, without one, after `air`). */
    leap(e) {
      if (!kit) return;
      const a = ground(e.from[0], e.from[1], 0.2);
      safe(() => kit.impact(a, 'knock_land', { scale: 1 }));
      const L = leaps.get(e.who) || { spell: e.spell }; L.seen = true; L.to = e.to; L.spell = e.spell || L.spell; leaps.set(e.who, L);
      const air = e.air ?? 0.45;
      kit.wait(air + 0.25).then(() => { const l = leaps.get(e.who); if (l && !l.landed) this.land({ who: e.who, spell: l.spell, at: e.to, radius: rowOf(l.spell, e.who)?.radius || 4 }); });
    },
    /** The leap lands: the spell's slam at its real radius, a ring of impacts, a strong shake near you. */
    land(e) {
      if (!kit) return;
      const l = leaps.get(e.who); if (l) { l.landed = true; leaps.delete(e.who); }
      const row = rowOf(e.spell, e.who), vis = visualOf(e.spell, row) || 'leap_slam', R = e.radius || row?.radius || 4;
      const at = ground(e.at[0], e.at[1]);
      moves.play(e.who, 'slam');
      safe(() => kit.impact(V(at.x, at.y + 0.3, at.z), vis, { radius: R }));
      safe(() => kit.spread(vis, { shape: 'ring', at, radius: R, n: 12, every: 0.02 }));
      if (near(at, 25)) shake(e.who === meId() ? 0.6 : 0.35);
    },
    /** A charge: footfalls and streaks along the path, the hit where it ends. */
    rush(e) {
      if (!kit) return;
      const row = rowOf(e.spell, e.who), vis = visualOf(e.spell, row) || 'charge_rush';
      const a = ground(e.from[0], e.from[1]), b = ground(e.to[0], e.to[1]);
      const len = Math.hypot(b.x - a.x, b.z - a.z), d = { x: (b.x - a.x) / (len || 1), z: (b.z - a.z) / (len || 1) };
      const secs = e.seconds ?? 0.35;
      safe(() => kit.spread(vis, { shape: 'line', at: a, dir: d, length: len, n: Math.max(5, Math.round(len / 2)), every: secs / Math.max(5, Math.round(len / 2)), area: false }));
      const body = actors.get(e.who)?.root; if (body) safe(() => kit.aura(body, vis, { seconds: secs + 0.2 }));
      kit.wait(secs).then(() => safe(() => { kit.impact(V(b.x, b.y + 0.4, b.z), vis, { radius: row?.splash || 2, dir: V(d.x, 0, d.z) }); if (near(b, 25)) shake(0.4); }));
    },
    /** An exploding ball bursts: the whole blast at the real radius. */
    burst(e) {
      if (!kit || !e.at) return;
      fx.noteBurst?.(e);
      const row = rowOf(e.spell, e.who), vis = visualOf(e.spell, row) || 'fireball', R = e.radius || row?.explode?.radius || 3;
      const at = ground(e.at[0], e.at[1]);
      safe(() => kit.impact(V(at.x, at.y + 0.9, at.z), vis, { radius: R, scale: Math.max(0.9, R / 4) }));
      safe(() => kit.spread(vis, { shape: 'ring', at, radius: R * 0.8, n: 10, every: 0.02 }));
      if (near(at, 35)) shake(e.who === meId() ? 0.6 : 0.4);
      if (e.who === meId()) hitStop(0.07);
    },
    /** dt for the world this frame: a hit-stop freezes it for a few hundredths of a second */
    update(dt) {
      if (stopLeft > 0) { stopLeft -= dt; return dt * 0.06; }
      return dt;
    },
  };
}
