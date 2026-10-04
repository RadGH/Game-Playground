// Campaign missions (PLAN §13, stream F): a mission is the ordinary line-war sim plus a SCRIPT that
// runs inside the sim, so it is deterministic, survives snapshots and needs nothing from the view.
//
//   createSim({ ...mission.config, campaign: mission }, data)   ->   state.campaign (plain data)
//   every tick: campaignTick(ctx)  (sim.js, after the mode's phases, before the end check)
//   the UI reads campaignInfo(state) and the events below.
//
// A mission (data/campaign/<id>.json):
//   { id, chapter, name, briefing: [lines], config: { format, map, players, rules },
//     player: 0,                                   the human's player id
//     winWhen: 'result' | 'objectives',            'objectives': all required objectives done = victory
//     timeLimit?: seconds,                         past it the mission is lost (unless already won)
//     objectives: [{ id, text, kind, args, optional?, after?: objective id (shown once that one is done) }],
//     stars: [objective ids]                       each done one is a star (winning is always the first)
//     script: [{ id, when: { at: seconds } | { done: objective id } | { tick: n }, do: [actions] }] }
//
// Objective kinds (all read sim state): sends n, income n, kills n, level n, learn n (skill ranks),
//   items n (Outfitter items carried), upgrades n (Drill Yard levels), powers n (Sanctum casts),
//   toll n (Toll of Iron rung), survive seconds, slay tag (every body a script spawned with that tag
//   is dead), win, winBefore seconds, bannersAtLeast n (own banners at the end), noHeroDeaths.
// Script actions: say { who, text } | wave { player, units: [[unit, count]], tag? } (free, sent at
//   once from that player's gate, adds no income) | grant { player, gold } | ai { player, difficulty }
//   | win | lose { reason }.
// Events: objective { id, text, optional }, say { who, text }, mission { outcome: 'won' | 'lost', stars }.

import { spawnUnit, sendTarget } from './economy.js';

const sec = s => Math.round(s * 20);

export function initCampaign(state, mission) {
  return {
    id: mission.id, player: mission.player ?? 0,
    done: [], fired: [], log: [], tags: [], tolls: 0, lastToll: null, powers: 0, lastPowerGold: 0,
    outcome: null, stars: 0,
  };
}

function me(state) { return state.players[state.campaign.player]; }
function myTeam(state) { return state.teams[me(state).team]; }

/** Progress of one objective: { done, have, need } (have/need for counting kinds). */
export function objectiveProgress(state, data, o) {
  const p = me(state), a = o.args || {};
  const count = (have, need) => ({ done: have >= need, have: Math.min(have, need), need });
  switch (o.kind) {
    case 'sends': return count(p.stats.sends, a.n);
    case 'income': return count(Math.floor(p.income), a.n);
    case 'kills': return count(p.stats.kills, a.n);
    case 'level': return count(p.level, a.n);
    case 'learn': return count(p.skills.reduce((s, k) => s + k.rank, 0), a.n);
    case 'items': return count((p.inv || []).filter(Boolean).length, a.n);
    case 'upgrades': return count(Object.values(p.upg || {}).reduce((s, v) => s + v, 0), a.n);
    case 'powers': return count(state.campaign.powers, a.n);
    case 'toll': return count(state.campaign.tolls, a.n);
    case 'survive': return count(Math.floor(state.tick / 20), a.seconds);
    case 'slay': {
      const t = state.campaign.tags.filter(x => x.tag === a.tag);
      const left = t.filter(x => state.ents.some(e => e.id === x.id && e.alive && !e._gone)).length;
      return { done: t.length > 0 && left === 0, have: t.length - left, need: t.length || 1 };
    }
    case 'win': return { done: !!state.result && state.result.winner === p.team, have: 0, need: 1 };
    case 'winBefore': return { done: !!state.result && state.result.winner === p.team && state.result.tick <= sec(a.seconds), have: 0, need: 1 };
    case 'bannersAtLeast': return { done: !!state.result && state.result.winner === p.team && myTeam(state).banners >= a.n, have: Math.ceil(myTeam(state).banners), need: a.n };
    case 'noHeroDeaths': return { done: !!state.result && state.result.winner === p.team && p.stats.deaths === 0, have: p.stats.deaths, need: 0 };
    default: throw new Error(`Unknown objective kind "${o.kind}"`);
  }
}

const END_KINDS = ['win', 'winBefore', 'bannersAtLeast', 'noHeroDeaths'];

function runAction(ctx, act) {
  const { state, data, map } = ctx;
  const C = state.campaign;
  switch (act.do) {
    case 'say': C.log.push({ tick: state.tick, who: act.who || '', text: act.text }); if (C.log.length > 30) C.log.shift(); ctx.emit('say', { who: act.who || '', text: act.text }); break;
    case 'wave': {
      const p = state.players[act.player];
      const { field, gate } = sendTarget(state, map, p);
      let k = 0;
      for (const [uid, n] of act.units) {
        const u = data.derived.units[uid];
        for (let i = 0; i < n; i++) {
          const group = state.nextGroup++;
          for (let b = 0; b < u.bodies; b++, k++) {
            const e = spawnUnit(ctx, field.id, p.id, uid, { group, bodies: u.bodies, x: gate.x + ((k % 6) - 2.5) * 1.5, z: gate.z + Math.floor(k / 6) * 1.5, mk: 1 });
            if (act.tag) C.tags.push({ tag: act.tag, id: e.id });
          }
        }
        ctx.emit('wave', { player: p.id, field: field.id, units: [uid], scripted: true });
      }
      break;
    }
    case 'grant': state.players[act.player].gold += act.gold; break;
    case 'ai': { const p = state.players[act.player]; if (p.ai) p.ai.difficulty = act.difficulty; break; }
    case 'win': finish(ctx, me(state).team, 'objectives'); break;
    case 'lose': finish(ctx, 1 - me(state).team, act.reason || 'objectives'); break;
    default: throw new Error(`Unknown script action "${act.do}"`);
  }
}

function finish(ctx, winner, reason) {
  const { state } = ctx;
  if (state.result) return;
  state.result = { winner, reason, tick: state.tick };
  ctx.emit('result', { winner, reason });
}

function score(ctx, mission) {
  const { state, data } = ctx;
  const C = state.campaign;
  const won = !!state.result && state.result.winner === me(state).team;
  let stars = won ? 1 : 0;
  if (won) for (const id of mission.stars || []) { const o = mission.objectives.find(x => x.id === id); if (o && (C.done.includes(id) || objectiveProgress(state, data, o).done)) stars++; }
  C.outcome = won ? 'won' : 'lost'; C.stars = stars;
  // end-only objectives are judged now
  for (const o of mission.objectives) if (!C.done.includes(o.id) && END_KINDS.includes(o.kind) && objectiveProgress(state, data, o).done) { C.done.push(o.id); ctx.emit('objective', { id: o.id, text: o.text, optional: !!o.optional }); }
  ctx.emit('mission', { outcome: C.outcome, stars });
}

/** One tick of the mission script (sim.js calls it when state.campaign is set). */
export function campaignTick(ctx) {
  const { state, data } = ctx;
  const C = state.campaign;
  const mission = state.campaignMission;
  if (!C || !mission || C.outcome) return;
  // Toll of Iron rings are counted from the team's charges going down
  const toll = myTeam(state).toll;
  if (C.lastToll != null && toll.charges < C.lastToll) C.tolls++;
  C.lastToll = toll.charges;
  // Sanctum casts are counted from the gold spent on powers going up
  const pg = me(state).stats.powerGold || 0;
  if (pg > C.lastPowerGold) C.powers++;
  C.lastPowerGold = pg;
  // objectives (in order; `after` hides one until another is done)
  for (const o of mission.objectives) {
    if (C.done.includes(o.id) || END_KINDS.includes(o.kind)) continue;
    if (o.after && !C.done.includes(o.after)) continue;
    if (objectiveProgress(state, data, o).done) { C.done.push(o.id); ctx.emit('objective', { id: o.id, text: o.text, optional: !!o.optional }); }
  }
  // script
  for (const s of mission.script || []) {
    if (C.fired.includes(s.id)) continue;
    const w = s.when || {};
    const due = w.tick != null ? state.tick >= w.tick : w.at != null ? state.tick >= sec(w.at) : w.done != null ? C.done.includes(w.done) : false;
    if (!due) continue;
    C.fired.push(s.id);
    for (const a of s.do) runAction(ctx, a);
  }
  // mission end by objectives / time limit
  if (!state.result && mission.winWhen === 'objectives') {
    const req = mission.objectives.filter(o => !o.optional && !END_KINDS.includes(o.kind));
    if (req.length && req.every(o => C.done.includes(o.id))) finish(ctx, me(state).team, 'objectives');
  }
  if (!state.result && mission.timeLimit && state.tick >= sec(mission.timeLimit)) finish(ctx, 1 - me(state).team, 'time');
}

/** Called by sim.js right after the mode's checkResult, so a normal ending is scored too. */
export function campaignAfterResult(ctx) {
  const C = ctx.state.campaign;
  if (C && ctx.state.result && !C.outcome) score(ctx, ctx.state.campaignMission);
}

/** For the UI: objectives with progress, the last lines said, the outcome. */
export function campaignInfo(state, data) {
  const C = state.campaign, mission = state.campaignMission;
  if (!C) return null;
  const objectives = mission.objectives.filter(o => !o.after || C.done.includes(o.after)).map(o => {
    const pr = END_KINDS.includes(o.kind) ? { done: C.done.includes(o.id), have: 0, need: 1 } : objectiveProgress(state, data, o);
    const done = C.done.includes(o.id) || (!END_KINDS.includes(o.kind) && pr.done);
    return { id: o.id, text: o.text, optional: !!o.optional, star: (mission.stars || []).includes(o.id), done, have: pr.have, need: pr.need, counted: pr.need > 1 };
  });
  return { id: C.id, name: mission.name, objectives, log: C.log.slice(-6), outcome: C.outcome, stars: C.stars, maxStars: 1 + (mission.stars || []).length, timeLimit: mission.timeLimit || null };
}
