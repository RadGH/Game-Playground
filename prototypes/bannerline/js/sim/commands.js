// Commands (interfaces.md §3): validation + effect. Every player action, human or AI, passes
// through applyCommand, so the AI can never do something a human could not.

import { q2 } from './mathx.js';
import { liveEnt } from './state.js';
import { buySend } from './economy.js';
import { seedStream } from './rng.js';
import { buyItem, sellItem, swapSlots, useItem, tollMax } from './items.js';
import { buyUpgrade } from './upgrades.js';
import { castPower } from './powers.js';
import { addStatus } from './statuses.js';
import { secToTicks } from './state.js';
import { castRefusal, castSkill, learnRefusal } from './skills.js';

const isNum = v => typeof v === 'number' && v === v && v !== Infinity && v !== -Infinity;
const SKILL_SLOTS = ['Q', 'W', 'E', 'D', 'R'];

export function applyCommand(ctx, cmd) {
  const { state, data } = ctx;
  const reject = (reason, p = cmd && cmd.p) => { ctx.emit('reject', { player: typeof p === 'number' ? p : -1, cmd: cmd && cmd.type, reason }); return reason; };
  if (cmd && cmd.sys === true) return applySystem(ctx, cmd, reject);
  if (!cmd || typeof cmd !== 'object' || typeof cmd.p !== 'number' || !state.players[cmd.p]) return reject('bad', -1);
  const p = state.players[cmd.p];
  if (state.result) return reject('over');
  // a mode's own command handlers come FIRST (Hunters vs Farmers has its own move/attack/surrender);
  // line war registers none, so it falls through to the switch below unchanged
  const own = ctx.mode && ctx.mode.commands && Object.prototype.hasOwnProperty.call(ctx.mode.commands, cmd.type) ? ctx.mode.commands[cmd.type] : null;
  if (own) { const why = own(ctx, p, cmd); return why ? reject(why) : null; }
  const hero = state.ents.find(e => e.id === p.heroEnt);
  const ord = k => { if (!hero || !hero.alive) return reject('dead'); hero._ord = { k, x: 0, z: 0, target: -1, dir: 0, speed: 0 }; return null; };

  switch (cmd.type) {
    case 'move': case 'amove': {
      if (!isNum(cmd.x) || !isNum(cmd.z)) return reject('bad');
      const r = ord(cmd.type); if (r) return r;
      hero._ord.x = q2(cmd.x); hero._ord.z = q2(cmd.z);
      if (cmd.type === 'move') hero.target = -1;
      return null;
    }
    case 'attack': {
      if (typeof cmd.target !== 'number') return reject('bad');
      const t = liveEnt(state, cmd.target);
      if (!t || t.team === p.team || !hero || t.field !== hero.field) return reject('bad');
      const r = ord('attack'); if (r) return r;
      hero._ord.target = t.id; hero.target = t.id;
      return null;
    }
    case 'stop': return ord('stop');
    case 'moveDir': {
      if (!isNum(cmd.dir) || !isNum(cmd.speed)) return reject('bad');
      const speed = Math.max(0, Math.min(3, Math.round(cmd.speed)));
      if (speed === 0) return ord('idle');
      const r = ord('dir'); if (r) return r;
      hero._ord.dir = ((Math.round(cmd.dir) % 16) + 16) % 16; hero._ord.speed = speed;
      return null;
    }
    case 'cast': {
      if (!SKILL_SLOTS.includes(cmd.slot)) return reject('bad');
      const why = castRefusal(ctx, p, cmd.slot);
      if (why) return reject(why);
      const x = isNum(cmd.x) ? q2(cmd.x) : null, z = isNum(cmd.z) ? q2(cmd.z) : null;
      castSkill(ctx, p, cmd.slot, x, z);
      return null;
    }
    case 'learn': {
      if (!SKILL_SLOTS.includes(cmd.slot)) return reject('bad');
      const why = learnRefusal(data, p, cmd.slot);
      if (why) return reject(why);
      p.skills.find(s => s.slot === cmd.slot).rank++;
      p.skillPts--;
      return null;
    }
    case 'talent': {
      if (cmd.choice !== 0 && cmd.choice !== 1) return reject('bad');
      if (p.talent >= 0) return reject('bad');
      if (p.level < data.heroes.ranks.talentLevel) return reject('level');
      p.talent = cmd.choice;
      return null;
    }
    case 'send': {
      if (typeof cmd.unit !== 'string') return reject('bad');
      const why = buySend(ctx, p, cmd.unit);
      return why ? reject(why) : null;
    }
    // ── items, Drill Yard, Sanctum (stream I: items.js, upgrades.js, powers.js) ──
    case 'buy': {   // { id }: one Outfitter item into the first free slot (hero within the Outfitter's radius)
      if (typeof cmd.id !== 'string') return reject('bad');
      const why = buyItem(ctx, p, cmd.id);
      return why ? reject(why) : null;
    }
    case 'sell': { const why = sellItem(ctx, p, cmd.slot); return why ? reject(why) : null; }        // { slot } at the Outfitter
    case 'swap': { const why = swapSlots(ctx, p, cmd.a, cmd.b); return why ? reject(why) : null; }   // { a, b } slots, anywhere
    case 'use': { const why = useItem(ctx, p, cmd.slot); return why ? reject(why) : null; }          // { slot } a consumable
    case 'upgradeUnit': {   // { id }: next Drill Yard level
      if (typeof cmd.id !== 'string') return reject('bad');
      const why = buyUpgrade(ctx, p, cmd.id);
      return why ? reject(why) : null;
    }
    case 'power': {   // { id, x, z }: buy + cast a Sanctum power at a point
      if (typeof cmd.id !== 'string' || !isNum(cmd.x) || !isNum(cmd.z)) return reject('bad');
      const why = castPower(ctx, p, cmd.id, cmd.x, cmd.z);
      return why ? reject(why) : null;
    }
    case 'toll': {
      const team = state.teams[p.team];
      if (team.toll.charges <= 0) return reject('cooldown');
      team.toll.charges--;
      if (team.toll.readyAt <= state.tick) team.toll.readyAt = state.tick + secToTicks(data['items-bl'].toll.cooldown);
      const field = state.teams[p.team].field, ticks = secToTicks(data['items-bl'].toll.stun);
      let n = 0;
      for (const e of state.ents) if (e.alive && !e._gone && e.field === field && e.team !== p.team) { addStatus(ctx, e, 'stun', { ticks, src: -1 }); n++; }
      ctx.emit('toll', { team: p.team, player: p.id, stunned: n });
      return null;
    }
    case 'surrender': {
      p.surrendered = true;
      state.result = { winner: 1 - p.team, reason: 'surrender', tick: state.tick };
      ctx.emit('result', { winner: state.result.winner, reason: 'surrender' });
      return null;
    }
    default: return reject('bad');
  }
}

/** Toll of Iron charges refill one at a time (cooldown each), up to the team's maximum. */
export function tollTick(ctx) {
  const { state, data } = ctx;
  for (const team of state.teams) {
    const max = tollMax(ctx, team);
    if (team.toll.charges > max) team.toll.charges = max;
    if (team.toll.charges < max && state.tick >= team.toll.readyAt) {
      team.toll.charges++;
      team.toll.readyAt = team.toll.charges < max ? state.tick + secToTicks(data['items-bl'].toll.cooldown) : state.tick;
    }
  }
}

/**
 * System commands (online play, js/net/lockstep.js): issued by the HOST inside a turn, so every peer
 * applies them at the same tick. Never sent by a player.
 *   { sys: true, type: 'takeover', player, difficulty }  a human seat becomes an AI (its machine left)
 *   { sys: true, type: 'release', player }              the AI hands the seat back (the human rejoined)
 */
function applySystem(ctx, cmd, reject) {
  const { state } = ctx;
  const p = state.players[cmd.player];
  if (!p) return reject('bad', -1);
  if (cmd.type === 'takeover') {
    if (p.kind === 'ai') return null;
    p.kind = 'ai';
    p.ai = { difficulty: cmd.difficulty || 'veteran', sendDone: -1, nextAt: state.tick, fund: 0, rng: seedStream((state.seed ^ (state.tick * 2654435761)) >>> 0, 'takeover' + p.id), takenOver: true };
    ctx.emit('takeover', { player: p.id, difficulty: p.ai.difficulty });
    return null;
  }
  if (cmd.type === 'release') {
    if (p.kind !== 'ai' || !p.ai || !p.ai.takenOver) return reject('bad', p.id);
    p.kind = 'human'; p.ai = null;
    ctx.emit('release', { player: p.id });
    return null;
  }
  return reject('bad', p.id);
}
