// Hero bots: the solo partner, a player who dropped out of an online room, and what the tests use to play whole
// chapters. Returns the same input object a player's controls produce. Pure (uses the brawl's own seeded rng).
import { nearestFoe, alive, spellReady, DEPTH, inZone } from './brawl.js';

const sgn = v => (v < 0 ? -1 : 1);

export function botInput(G, h) {
  const inp = { mx: 0, mz: 0 };
  if (!alive(h) || h.state === 'held') return inp;
  const b = h.bot || (h.bot = { gap: 0, blockT: 0 });
  const half = G.T.viewWidth / 2, seen = p => p.x > G.camX - half + 0.6 && p.x < G.camX + half - 0.6;   // the road only scrolls forward
  b.gap -= 1 / 60;
  // spinning (Iron Gale): keep the button held while enemies are close and mana lasts, drifting toward them
  if (h.state === 'move' && h.mv?.channel) {
    const t = nearestFoe(G, h, 4);
    if (t && h.mp > 8) { inp[h.chanKey] = true; inp.mx = Math.abs(t.x - h.x) > 0.6 ? sgn(t.x - h.x) : 0; inp.mz = Math.abs(t.z - h.z) > 0.3 ? sgn(t.z - h.z) : 0; }
    return inp;
  }
  // 1. a partner is down: go and pick them up
  const downed = G.heroes.find(o => o !== h && o.state === 'out');
  if (downed && !G.foes.some(f => f.team === 1 && f.state === 'move' && Math.abs(f.x - h.x) < 1.6)) return walkTo(h, downed.x - 0.6 * sgn(downed.x - h.x), downed.z, inp);
  // 1b. standing in a warned enemy zone (or a burning patch): step out of it, the way a player would
  const danger = G.zones.find(z => z.team === 1 && !z.done && (z.kind === 'hazard' || (z.kind === 'aoe' && z.t < z.delay)) && inZone(z, h, 0.5));
  if (danger) {
    if (danger.shape === 'col') inp.mx = h.x >= danger.x ? 1 : -1;
    else if (danger.shape === 'row') inp.mz = h.z >= danger.z ? (h.z > DEPTH - 0.6 ? -1 : 1) : (h.z < -DEPTH + 0.6 ? 1 : -1);
    else { const dx = h.x - danger.x, dz = h.z - danger.z; inp.mx = Math.abs(dx) > 0.05 ? sgn(dx) : 1; inp.mz = Math.abs(dz) > 0.05 ? sgn(dz) : (h.z > 0 ? -1 : 1); if (Math.abs(h.z) > DEPTH - 0.4) inp.mz = -sgn(h.z); }
    if (danger.shape === 'col' && danger.r > 2) inp.dash = b.gap <= 0;
    return inp;
  }
  // 2. hurt: food on the floor
  if (h.hp < h.max * 0.5) { const food = G.props.find(p => p.type === 'food' && seen(p)); if (food) return walkTo(h, food.x, food.z, inp); }
  // 3. a weapon on the floor and nothing in hand
  const wpn = !h.pickup && G.props.find(p => p.type === 'weapon' && seen(p) && Math.abs(p.x - h.x) < 4);
  if (wpn) { walkTo(h, wpn.x, wpn.z, inp); if (Math.abs(wpn.x - h.x) < 0.6 && Math.abs(wpn.z - h.z) < 0.5) inp.grab = true; return inp; }
  // keep the same target unless another is clearly closer (two at the same distance made the bot step back and forth)
  let t = nearestFoe(G, h);
  const was = b.target && G.foes.find(f => f.id === b.target && alive(f) && f.team === 1 && f.state !== 'down' && f.state !== 'enter');
  if (t && was && was !== t && Math.abs(was.x - h.x) < Math.abs(t.x - h.x) + 1.5) t = was;
  // healers first (the loading-screen tip says so): a priest within reach beats the one in front
  const healer = G.foes.find(f => f.team === 1 && f.def?.ai === 'healer' && f.state !== 'enter' && f.state !== 'down' && alive(f) && f.invT <= 0 && Math.abs(f.x - h.x) < 7);
  if (healer && t && t !== healer && t.def?.heavy) t = healer;
  b.target = t?.id;
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
  // a shot flying at us in our lane: turn to it and block (a hook is jumped instead)
  const incoming = G.shots.find(s => s.team === 1 && Math.abs(s.z - h.z) < 0.6 && sgn(h.x - s.x) === sgn(s.vx) && Math.abs(h.x - s.x) < 3.2);
  if (incoming && b.blockT <= 0 && G.rand() < 0.35) { if (incoming.def.pull) { inp.jump = true; return inp; } b.blockT = 0.35; b.blockDir = -sgn(incoming.vx); }
  if (b.blockT > 0 && b.blockDir) { b.blockT -= 1 / 60; h.dir = b.blockDir; inp.block = true; if (b.blockT <= 0) b.blockDir = 0; return inp; }
  if (b.blockT > 0) { b.blockT -= 1 / 60; h.dir = sgn(threat ? threat.x - h.x : dx); inp.block = true; return inp; }
  // 5. surrounded and taking hits: Breaker
  const near = G.foes.filter(f => f.team === 1 && alive(f) && Math.hypot(f.x - h.x, f.z - h.z) < 2.2).length;
  if (near >= 3 && h.state === 'hurt' && h.hp > h.max * 0.35) { inp.breaker = true; return inp; }
  // 6. spells when they are worth it
  for (const [i, id] of h.spells.entries()) {
    const S = G.data.classes.spells[id]; if (!S) continue;
    if (!spellReady(G, h, id).ok || b.gap > 0) continue;
    const heal = !!S.heal, buff = !!S.buff;
    const worth = heal ? G.heroes.some(o => alive(o) && o.hp < o.max * 0.6) : (buff || S.channel) ? near >= 2 : (S.aoe?.at === 'self' ? near >= 2 : adz < 0.6 && adx < 8);
    if (worth && G.rand() < 0.05) { h.dir = sgn(dx); inp[i ? 'spell2' : 'spell1'] = true; inp[i ? 'spell2Held' : 'spell1Held'] = true; b.gap = 0.5; return inp; }
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
