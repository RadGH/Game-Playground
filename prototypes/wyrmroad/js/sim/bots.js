// Hero bots: the solo partner, a player who dropped out of an online room, and what the tests use to play whole
// chapters. Returns the same input object a player's controls produce. Pure (uses the brawl's own seeded rng).
import { nearestFoe, alive, spellReady, DEPTH } from './brawl.js';

const sgn = v => (v < 0 ? -1 : 1);

export function botInput(G, h) {
  const inp = { mx: 0, mz: 0 };
  if (!alive(h) || h.state === 'held') return inp;
  const b = h.bot || (h.bot = { gap: 0, blockT: 0 });
  const half = G.T.viewWidth / 2, seen = p => p.x > G.camX - half + 0.6 && p.x < G.camX + half - 0.6;   // the road only scrolls forward
  b.gap -= 1 / 60;
  // 1. a partner is down: go and pick them up
  const downed = G.heroes.find(o => o !== h && o.state === 'out');
  if (downed && !G.foes.some(f => f.team === 1 && f.state === 'move' && Math.abs(f.x - h.x) < 1.6)) return walkTo(h, downed.x - 0.6 * sgn(downed.x - h.x), downed.z, inp);
  // 2. hurt: food on the floor
  if (h.hp < h.max * 0.5) { const food = G.props.find(p => p.type === 'food' && seen(p)); if (food) return walkTo(h, food.x, food.z, inp); }
  // 3. a weapon on the floor and nothing in hand
  const wpn = !h.pickup && G.props.find(p => p.type === 'weapon' && seen(p) && Math.abs(p.x - h.x) < 4);
  if (wpn) { walkTo(h, wpn.x, wpn.z, inp); if (Math.abs(wpn.x - h.x) < 0.6 && Math.abs(wpn.z - h.z) < 0.5) inp.grab = true; return inp; }
  const t = nearestFoe(G, h);
  if (!t) {
    // nothing to fight: walk on (stay near the others) or smash the next crate
    const crate = G.props.find(p => p.type === 'crate' && seen(p) && p.x > h.x - 2);
    if (crate) { walkTo(h, crate.x - 1, crate.z, inp); if (Math.abs(crate.x - 1 - h.x) < 0.4 && Math.abs(crate.z - h.z) < 0.4) { inp.mx = 0.1; if (b.gap <= 0) { inp.attack = true; b.gap = 0.25; } } return inp; }
    if (G.phase === 'walk') { inp.mx = 1; inp.mz = h.z > 0.6 ? -0.5 : h.z < -0.6 ? 0.5 : 0; }
    return inp;
  }
  const dx = t.x - h.x, dz = t.z - h.z, adx = Math.abs(dx), adz = Math.abs(dz);
  const ranged = h.cls === 'arcanist';
  const want = ranged ? 4.5 : 1.15;
  // 4. block a wind-up coming at us now and then
  const threat = G.foes.find(f => f.team === 1 && f.state === 'move' && f.st < (f.mv?.t[0] || 0) * G.T.foeWindup * 0.8 && Math.abs(f.x - h.x) < (f.mv?.reach || 1.4) + 0.6 && Math.abs(f.z - h.z) < 0.7 && sgn(h.x - f.x) === f.dir);
  if (threat && G.rand() < 0.08) b.blockT = 0.5;
  if (b.blockT > 0) { b.blockT -= 1 / 60; h.dir = sgn(threat ? threat.x - h.x : dx); inp.block = true; return inp; }
  // 5. surrounded and taking hits: Breaker
  const near = G.foes.filter(f => f.team === 1 && alive(f) && Math.hypot(f.x - h.x, f.z - h.z) < 2.2).length;
  if (near >= 3 && h.state === 'hurt' && h.hp > h.max * 0.35) { inp.breaker = true; return inp; }
  // 6. spells when they are worth it
  for (const [i, id] of h.spells.entries()) {
    const S = G.data.classes.spells[id]; if (!S) continue;
    if (!spellReady(G, h, id).ok || b.gap > 0) continue;
    const heal = !!S.heal, buff = !!S.buff;
    const worth = heal ? G.heroes.some(o => alive(o) && o.hp < o.max * 0.6) : buff ? near >= 2 : (S.aoe?.at === 'self' ? near >= 2 : adz < 0.6 && adx < 8);
    if (worth && G.rand() < 0.05) { h.dir = sgn(dx); inp[i ? 'spell2' : 'spell1'] = true; b.gap = 0.5; return inp; }
  }
  // 7. line up and hit
  if (adz > 0.3) inp.mz = sgn(dz);
  if (adx > want + 0.3) inp.mx = sgn(dx);
  else if (adx < want - 0.5 && ranged) inp.mx = -sgn(dx);
  else if (adx < 0.6) inp.mx = -sgn(dx) * 0.4;
  if (adx <= want + 0.4 && adz < 0.5 && b.gap <= 0) {
    if (sgn(dx) !== h.dir) { inp.mx = sgn(dx) * 0.3; return inp; }
    const guarded = t.def?.shield && t.dir === -h.dir;
    if (guarded || (t.def?.heavy && G.rand() < 0.3)) inp.heavy = true; else inp.attack = true;
    b.gap = ranged ? 0.3 : 0.12 + G.rand() * 0.1;
  }
  if (Math.abs(h.z) > DEPTH - 0.2) inp.mz = -sgn(h.z);
  return inp;
}

function walkTo(h, x, z, inp) {
  if (Math.abs(x - h.x) > 0.25) inp.mx = sgn(x - h.x);
  if (Math.abs(z - h.z) > 0.2) inp.mz = sgn(z - h.z);
  return inp;
}
