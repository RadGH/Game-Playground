// Bodies too big to walk the road, and the wyrm in the sky. Pure — called from brawl.js / stage.js.
//
// BIG (enemies.json `backEdge: true`): Ossmara (wrath, maddened), the Undermaw, the Undermaw's Hand. They live behind the
// street's back edge (z = def.home, default −(DEPTH + 1.6)), glide along it toward their target and strike ACROSS the
// lanes with warned zones (circles, 'col' strips across the street, 'row' strips along it). Hidden = can't be hit. A move
// with `expose: { part, time }` brings a part down onto the road where its strike landed (a claw, a head, an eye, the
// heart): for `time` s the boss is at that spot (where the strike landed), can be hit, and does nothing else.
//   events: { type: 'expose', id, part, on: true, x, z, time } … { type: 'expose', id, part, on: false }
// The renderer draws the body at the back edge and the part where `expose` says.
//
// SKY (chapter `sky: { who, fire, every }`): during fights Ossmara passes over every `every` s and breathes a line of
// fire along one lane that hurts foes only, after a warning (zoneWarn with shape 'row', look 'skyfire_<fire>').
//   event: { type: 'sky', fire, x0, x1, z, delay } — the first pass also says the `sky_<fire>` story line.
// T.skyAlly = 0 turns it off (bots and the solo balance are checked without it).
import { stepMove, startMove, alive, hittable, DEPTH, clampViewX, addZone, bossHazards, viewHalf } from './brawl.js';
import { bossPhaseCheck, weighted } from './foes.js';

const sgn = v => (v < 0 ? -1 : 1);
export const isBig = def => !!def?.backEdge;

export function stepBig(G, f, dt) {
  const D = f.def, ai = f.ai;
  if (f.team === 1) bossHazards(G, f, dt);
  if (f.exposeAt && G.t >= f.exposeAt.t) { expose(G, f, f.exposeAt); f.exposeAt = null; }
  if (f.exposeT > 0) { f.exposeT -= dt; if (f.exposeT <= 0) hide(G, f); return; }
  if (f.state === 'move') { stepMove(G, f, dt); return; }
  if (f.state !== 'idle') { f.state = 'idle'; f.st = 0; }
  for (const k in ai.cd) if (ai.cd[k] > 0) ai.cd[k] -= dt;
  if (ai.wait > 0) ai.wait -= dt;
  const heroes = G.heroes.filter(h => alive(h) && h.state !== 'out');
  if (!heroes.length) { f.anim = 'idle'; return; }
  let t = heroes.find(h => h.id === ai.target);
  ai.think -= dt;
  if (!t || ai.think <= 0) { t = heroes[Math.floor(G.rand() * heroes.length)]; ai.target = t.id; ai.think = 2 + G.rand() * 2; }
  bossPhaseCheck(G, f);
  // glide along the back edge toward the target
  const dx = t.x - f.x;
  f.x = clampViewX(G, f.x + sgn(dx) * Math.min(Math.abs(dx), D.speed * dt), 1.5); f.dir = sgn(dx); f.z = f.homeZ;
  f.anim = Math.abs(dx) > 0.2 ? 'walk' : 'idle';
  if (ai.wait > 0) return;
  const ok = D.moves.filter(m => (m.phase || 0) <= ai.phase && (ai.cd[m.id] || 0) <= 0 && (!m.range || (Math.abs(dx) >= m.range[0] && Math.abs(dx) <= m.range[1])));
  if (!ok.length) return;
  const m = weighted(G, ok);
  ai.cd[m.id] = m.cd || 3; ai.wait = D.gap ?? 0.8;
  startMove(G, f, m, 'foe', { name: m.id });
}

function expose(G, f, { x, z = -DEPTH + 0.35, part, time }) {
  f.hidden = false; f.exposeT = time; f.part = part;
  // the part rests where its strike landed (a claw in the crater it made, a head at the end of its dive)
  f.x = clampViewX(G, x, 1); f.z = Math.max(-DEPTH + 0.3, Math.min(DEPTH - 0.3, z)); f.state = 'idle'; f.mv = null; f.st = 0;
  G.events.push({ type: 'expose', id: f.id, part, on: true, x: f.x, z: f.z, time });
}
function hide(G, f) {
  G.events.push({ type: 'expose', id: f.id, part: f.part, on: false });
  f.hidden = true; f.exposeT = 0; f.z = f.homeZ; f.part = null;
}

export function skyStep(G, dt) {
  const S = G.ch.sky;
  if (!S || !G.T.skyAlly || G.phase !== 'fight' || G.over) return;
  G.skyT = (G.skyT || 0) + dt;
  if (G.skyT < S.every) return;
  const foes = G.foes.filter(f => f.team === 1 && hittable(f));
  if (!foes.length) return;
  G.skyT = 0;
  skyPass(G, foes[Math.floor(G.rand() * foes.length)].z);
}

/** One fly-over: a warned line of fire along the lane at depth z, across the whole screen, on foes only. */
export function skyPass(G, z) {
  const S = G.ch.sky; if (!S) return;
  const T = G.T, half = viewHalf(G), heroes = G.heroes.filter(alive);
  const pw = heroes.length ? heroes.reduce((a, h) => a + h.stats.power, 0) / heroes.length : 20;
  const def = { dmg: T.skyDamage, kb: 4, up: 3, down: true, burn: 2, shape: 'row', len: half * 2, look: `skyfire_${S.fire}` };
  addZone(G, { id: 0, team: 0 }, { x: G.camX, z, r: 0.9, delay: T.skyDelay, def, pw, team: 0 });
  G.events.push({ type: 'sky', who: S.who, fire: S.fire, x0: G.camX - half, x1: G.camX + half, z, delay: T.skyDelay });
  const line = `sky_${S.fire}`;
  if (!G.said.has(line) && G.data.story.lines[line]) { G.said.add(line); G.events.push({ type: 'line', line }); }
}
