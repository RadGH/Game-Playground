// Melee (docs/04 §3 + class movesets): light combo, charged heavy, air, plunge + pogo, running poke, the
// lantern touch on cells, hit-stop, oil from hits, shatter on frozen targets, non-lethal heavy. Pure.
import { dealDamage } from './damage.js';
import { applyElement, HARDNESS } from '../world/elements.js';
import { CLS } from '../world/materials.js';
const DT = 1 / 60;

export function createMelee(p, moveset) { p.melee = { set: moveset, move: null, phase: null, t: 0, combo: 0, comboT: 0, buffer: 0, hold: 0, hits: new Set(), airUsed: 0, touchT: 0 }; return p.melee; }

export function stepMelee(game, p, I) {
  const Mm = p.melee; if (!Mm) return;
  const S = game.data.movesets.shared, set = Mm.set;
  if (Mm.comboT > 0) Mm.comboT -= DT; else if (!Mm.move) Mm.combo = 0;
  if (Mm.buffer > 0) Mm.buffer -= DT; if (Mm.touchT > 0) Mm.touchT -= DT;
  if (p.grounded) Mm.airUsed = 0;
  if (I.pressed?.attack) Mm.buffer = S.buffer / 1000;
  // charging a heavy: hold attack on the ground
  if (!Mm.move && I.attack && p.grounded && !p.swimming) { Mm.hold += DT; if (Mm.hold >= S.heavyHold / 1000 && !Mm.charging) { Mm.charging = true; game.bus?.emit('melee.charge', {}); } }
  if (Mm.charging && !I.attack) { Mm.charging = false; Mm.hold = 0; Mm.buffer = 0; start(game, p, 'heavy'); return; }
  if (!I.attack && Mm.hold > 0 && !Mm.charging) Mm.hold = 0;
  // start a move
  if (!Mm.move && Mm.buffer > 0 && !Mm.charging && p.canAttack !== false) {
    let name;
    if (!p.grounded && !p.swimming) name = I.down ? 'plunge' : (Mm.airUsed < (set.moves.air.perAir || 1) ? 'air' : null);
    else if (Math.abs(p.vx) > 80 && Mm.combo === 0) name = 'run';
    else name = ['light1', 'light2', 'light3'][Mm.combo % 3];
    if (name && !(I.attack && p.grounded && Mm.hold > 0.12)) { Mm.buffer = 0; start(game, p, name); }
  }
  if (!Mm.move) return;
  const mv = set.moves[Mm.move]; Mm.t += DT * 1000 * (p.statuses?.chill ? 1 - 0.1 * p.statuses.chill.stacks : 1);
  if (Mm.phase === 'startup' && Mm.t >= mv.startup) { Mm.phase = 'active'; Mm.t = 0; if (mv.lunge) p.vx = p.facing * mv.lunge * 8; if (mv.carry) p.vx = p.facing * Math.max(Math.abs(p.vx), 60 + mv.carry * 3); }
  if (Mm.phase === 'active') {
    if (Mm.move === 'plunge') { p.vy = Math.max(p.vy, mv.fall); if (p.grounded) { Mm.phase = 'recovery'; Mm.t = 0; game.bus?.emit('melee.land', { x: p.x, y: p.y }); game.shake?.(0.1); } }
    hitWith(game, p, mv);
    if (Mm.move !== 'plunge' && Mm.t >= mv.active) { Mm.phase = 'recovery'; Mm.t = 0; }
  } else if (Mm.phase === 'recovery') {
    // cancels: dodge after 60%, jump after 80% (handled by player movement reading canCancel)
    p.meleeCancel = Mm.t >= mv.recovery * 0.6 ? 'dodge' : null; if (Mm.t >= mv.recovery * 0.8) p.meleeCancel = 'any';
    if (Mm.t >= mv.recovery) { Mm.move = null; Mm.phase = null; p.meleeCancel = null; }
  }
}

function start(game, p, name) {
  const Mm = p.melee, mv = Mm.set.moves[name]; if (!mv) return;
  Mm.move = name; Mm.phase = 'startup'; Mm.t = 0; Mm.hits = new Set(); Mm.cellsDone = false;
  if (name.startsWith('light')) { Mm.combo = (Mm.combo + 1) % 3; Mm.comboT = (mv.startup + mv.active + mv.recovery + game.data.movesets.shared.comboWindow) / 1000; }
  if (name === 'air') Mm.airUsed++;
  p.attackAnimT = (mv.startup + mv.active) / 1000;
  game.bus?.emit('melee.swing', { move: name, x: p.x, y: p.y });
}

/** The hitbox of a move for the player (world rect). */
export function hitbox(p, mv) {
  const [w, h] = mv.hitbox;
  if (mv.below) return { x: p.x - w / 2, y: p.y - 2, w, h };
  if (mv.around) return { x: p.x - w / 2, y: p.y - 6 - h / 2, w, h };
  const front = p.x + p.facing * 3;
  return { x: p.facing > 0 ? front : front - w, y: p.y - 7 - h / 2, w, h };
}

function hitWith(game, p, mv) {
  const Mm = p.melee, set = Mm.set, box = hitbox(p, mv);
  let hitsThisSwing = [...Mm.hits].length;
  for (const e of game.entities) {
    if (e.dead || Mm.hits.has(e.id) || e.kind === 'npc' || e.team === 'player' || e.intangible) continue;
    const ex = e.x - e.w / 2, ey = e.y - e.h;
    if (ex > box.x + box.w || ex + e.w < box.x || ey > box.y + box.h || ey + e.h < box.y) continue;
    Mm.hits.add(e.id);
    const roll = set.weapon.dmg[0] + (game.rng.spell.next()) * (set.weapon.dmg[1] - set.weapon.dmg[0]);
    let amount = roll * mv.dmg * (p.stats?.meleeMult || 1);
    if (e.statuses?.frozen) { amount *= Mm.move === 'heavy' ? 2 : 1.5; delete e.statuses.frozen; e.statuses.thawing = { stacks: 1, t: 4 }; game.bus?.emit('combo', { id: 'shatter', x: e.x, y: e.y - e.h / 2 }); }
    if (mv.subdue && e.tags?.includes('subduable') && e.hp - amount < 1) { amount = Math.max(0, e.hp - 1); e.knockedOut = true; e.statuses.knocked_out = { stacks: 1, t: 9999 }; game.bus?.emit('knockout', { target: e }); }
    const kbv = set.weapon.kb * mv.kb;
    const knock = mv.below ? { x: 0, y: -60 } : mv.launch ? { x: p.facing * 20, y: -200 } : mv.pull || kbv < 0 ? { x: -p.facing * (mv.pull || 30) * 4, y: -30 } : { x: p.facing * kbv, y: -Math.abs(kbv) * 0.25 };
    dealDamage(game, { source: p, target: e, amount, flame: 'physical', via: 'melee', viaName: `${set.weapon.name} — ${mv.name}`, knock, critChance: p.stats?.critChance ?? 0.05, critMult: p.stats?.critMult ?? 1.5, itemId: set.weapon.id, tags: ['melee', Mm.move] });
    e.poise = (e.poise ?? e.maxPoise ?? 30) - mv.poise; if (e.poise <= 0 && !e.dead) { e.statuses.staggered = { stacks: 1, t: 0.6 }; e.poise = e.maxPoise ?? 30; game.bus?.emit('stagger', { target: e }); }
    if (hitsThisSwing < game.data.movesets.shared.maxOilHits) { p.oil = Math.min(p.maxOil, p.oil + (set.oilOnHit || 1.5)); hitsThisSwing++; }
    game.freezeTicks = Math.max(game.freezeTicks, Mm.move === 'heavy' || Mm.move === 'light3' ? 5 : game.data.movesets.shared.hitStopTicks);
    if (mv.pogo && Mm.move === 'plunge') { p.vy = -Math.sqrt(2 * 900 * mv.pogo); Mm.phase = 'recovery'; Mm.t = mv.recovery * 0.5; p.airJumps = 0; p.dodgeAirUsed = false; game.bus?.emit('pogo', {}); }
  }
  // cells: heavy breaks soft cells; the lantern touches cells with the selected flame
  if (!Mm.cellsDone) {
    Mm.cellsDone = true; game.things?.poleHit(box); const g = game.grid;
    const breaks = mv.breaks ?? (Mm.move === 'heavy' ? set.heavyBreaks : 0);
    if (breaks) for (let y = Math.floor(box.y); y < box.y + box.h; y++) for (let x = Math.floor(box.x); x < box.x + box.w; x++) { if (!g.inside(x, y)) continue; const m = g.mat[y * g.W + x]; if (HARDNESS[m] !== undefined && HARDNESS[m] <= breaks && !(g.flags[y * g.W + x] & 16)) g.set(x, y, game.rng.spell.next() < 0.4 ? (m === 2 ? 20 : 0) : 0); }
    if (Mm.touchT <= 0 && p.lantern) { const w = game.hero?.wicks?.[p.cast?.slot ?? 0]; if (w) { applyElement(game, p.lantern.x + p.facing * 3, p.lantern.y + 2, 2, w.flame, { maxCells: 12 }); Mm.touchT = 0.5; } }
    if (mv.ignite) applyElement(game, p.lantern?.x ?? p.x, (p.lantern?.y ?? p.y - 16) + 2, 3, 'ember', { maxCells: 20 });
  }
}
