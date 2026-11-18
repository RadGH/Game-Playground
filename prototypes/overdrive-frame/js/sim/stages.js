// Long missions (round 5 — PLAN: "a few 15+ min late game … checkpoint in long missions"): a mission may come in
// STAGES ({ id, label, objectives, waves, enemies }). When a stage's required objectives are done the next one starts
// on the same map (its waves count from that moment), and a CHECKPOINT is kept: the city's damage, what every player
// has picked up, the score. A lost mission can be flown again from its last checkpoint — solo, or by the host in a
// co-op room (the server and every browser build the same mission from the same checkpoint, so they still agree).
// Pure: mission.js calls these; the checkpoint is plain data (it crosses the co-op wire in the 'start' message).
import { worldState, setWorldState } from './world.js';
import { farSpots } from './ops.js';
import { makeRng } from './rng.js';

const fresh = list => (list || []).map(o => ({ ...o, progress: 0, done: false, failed: false }));
const shift = (waves, t) => (waves || []).map(w => ({ ...w, at: w.at + t, ...(w.until != null ? { until: w.until + t } : {}) }));

/** createMission: the first stage (or the checkpoint's), the wave list the mission actually runs. */
export function setupStages(S, checkpoint = null) {
  S.stage = 0; S.waves = (S.def.waves || []).slice(); S.doneObjectives = [];
  if (!S.def.stages?.length) return;
  if (checkpoint) restoreCheckpoint(S, checkpoint);
  else S.announceStage = true;                        // the first step says which stage this is (comms with event 'stage')
}

/** The required objectives are done: is there another stage? (true → it has started; mission.js then keeps fighting) */
export function nextStage(S) {
  const stages = S.def.stages; if (!stages || S.stage >= stages.length - 1) return false;
  S.doneObjectives.push(...S.objectives);
  S.stage++;
  startStage(S, S.time);
  S.checkpoint = makeCheckpoint(S);
  S.events.push({ type: 'checkpoint', stage: S.stage, label: stages[S.stage].label });
  return true;
}

function startStage(S, t0) {
  const st = S.def.stages[S.stage];
  S.objectives = fresh(st.objectives).map(o => ({ ...o, t0 }));          // survive / beat count from the stage's start
  S.waves.push(...shift(st.waves, t0));
  const R = makeRng((S.def.seed || 1) * 31 + S.stage * 977);
  for (const p of st.enemies || []) {
    const spots = p.place === 'far' ? farSpots(S, R, p.count || 1, { apart: 6, minFromStart: 0 }) : [{ x: p.x, z: p.z }];
    for (const sp of spots) { const e = S.spawn(p.kind, sp.x, sp.z, { warn: 1.2, elite: !!p.elite, force: true }); if (e && p.tag) e.tag = p.tag; }
  }
  S.events.push({ type: 'stage', stage: S.stage, label: st.label, of: S.def.stages.length });
}

/** Everything needed to fly the mission again from the start of the current stage. Plain JSON. */
export function makeCheckpoint(S) {
  return { stage: S.stage, label: S.def.stages[S.stage].label, world: worldState(S.world).map(([hp, st]) => [Math.round(hp), st]),
    players: S.players.map(p => ({ id: p.id, mats: { ...p.mats }, loot: p.loot.slice(), kills: p.mech.kills || 0, dealt: Math.round(p.mech.dealt || 0) })),
    stats: { ...S.stats }, revives: S.revives, done: S.doneObjectives.map(o => ({ id: o.id, label: o.label, optional: !!o.optional, done: o.done, failed: o.failed })) };
}

function restoreCheckpoint(S, cp) {
  S.stage = Math.max(0, Math.min(S.def.stages.length - 1, cp.stage | 0));
  setWorldState(S.world, cp.world);
  for (const q of cp.players || []) {
    const p = S.players.find(x => x.id === q.id); if (!p) continue;
    p.mats = { ...q.mats }; p.loot = q.loot.slice(); p.mech.kills = q.kills; p.mech.dealt = q.dealt;
  }
  Object.assign(S.stats, cp.stats || {}); S.revives = cp.revives || 0;
  S.doneObjectives = (cp.done || []).map(o => ({ ...o, progress: 0 }));
  S.waves = [];
  startStage(S, 0);                                   // its waves count from the (new) drop, like the first stage's
  S.objectives.forEach(o => { delete o.t0; });        // ...and so do its timers
  S.checkpoint = cp; S.fromCheckpoint = true;
  S.announceStage = true; S.events.length = 0;
}
