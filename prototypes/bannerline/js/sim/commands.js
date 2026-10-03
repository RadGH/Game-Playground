// Commands (interfaces.md §3): validation + effect. Every player action, human or AI, passes
// through applyCommand, so the AI can never do something a human could not.

import { q2 } from './mathx.js';
import { liveEnt } from './state.js';
import { buySend, buyMuster, buyPotion } from './economy.js';
import { SLOTS, buyItem, nextStepFor, cheapestNext, equipItem, unequipItem, sellItem, choosePick, tollMax } from './items.js';
import { addStatus } from './statuses.js';
import { secToTicks } from './state.js';
import { castRefusal, castSkill, learnRefusal } from './skills.js';

const isNum = v => typeof v === 'number' && v === v && v !== Infinity && v !== -Infinity;
const SKILL_SLOTS = ['Q', 'W', 'E', 'D', 'R'];

export function applyCommand(ctx, cmd) {
  const { state, data } = ctx;
  const reject = (reason, p = cmd && cmd.p) => { ctx.emit('reject', { player: typeof p === 'number' ? p : -1, cmd: cmd && cmd.type, reason }); return reason; };
  if (!cmd || typeof cmd !== 'object' || typeof cmd.p !== 'number' || !state.players[cmd.p]) return reject('bad', -1);
  const p = state.players[cmd.p];
  if (state.result) return reject('over');
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
    case 'deck': {
      const u = cmd.units;
      const roster = data.races.races[p.race].units;
      if (!Array.isArray(u) || u.length !== 4 || u.some(x => !roster.includes(x))) return reject('roster');
      p.deck = u.slice();
      return null;
    }
    case 'auto': {
      if (!(cmd.index >= 0 && cmd.index < 4) || (cmd.index | 0) !== cmd.index) return reject('bad');
      p.auto[cmd.index] = !!cmd.on;
      return null;
    }
    case 'muster': { const why = buyMuster(ctx, p); return why ? reject(why) : null; }
    case 'upgrade': {
      // the next shop step for a slot (omit = the cheapest unlocked one), equipped on arrival; the item
      // it replaces is traded in (the step ladder of PLAN §7.2). `slot` may be a name or an index.
      let slot = cmd.slot;
      if (typeof slot === 'number') slot = SLOTS[slot];
      if (slot != null && !SLOTS.includes(slot)) return reject('bad');
      const n = slot == null ? cheapestNext(state, data, p) : nextStepFor(state, data, p, slot);
      if (!n) return reject(slot == null ? 'gold' : 'maxGear');
      if (!n.unlocked) return reject('locked');
      const why = buyItem(ctx, p, { slot: n.slot, step: n.step, kind: cmd.kind, equip: true, replace: true });
      return why ? reject(why) : null;
    }
    case 'buy': {
      // a specific shop item into the bag (or worn with equip: true): slot, step, kind (armour tier)
      if (!SLOTS.includes(cmd.slot) || typeof cmd.step !== 'number') return reject('bad');
      if (cmd.kind != null && !['cloth', 'light', 'medium', 'heavy'].includes(cmd.kind)) return reject('bad');
      const why = buyItem(ctx, p, { slot: cmd.slot, step: cmd.step, kind: cmd.kind, equip: !!cmd.equip, replace: false });
      return why ? reject(why) : null;
    }
    case 'equip': { const why = equipItem(ctx, p, cmd.uid); return why ? reject(why) : null; }
    case 'unequip': { const why = unequipItem(ctx, p, cmd.slot); return why ? reject(why) : null; }
    case 'sell': { const why = sellItem(ctx, p, cmd.uid); return why ? reject(why) : null; }
    case 'pick': { const why = choosePick(ctx, p, cmd.index); return why ? reject(why) : null; }
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
    case 'oil': {
      if (!data.damage.types.includes(cmd.dmgType)) return reject('bad');
      const cost = data.econ.items.oil.cost;
      if (p.oil === cmd.dmgType) return reject('bad');
      if (p.gold < cost) return reject('gold');
      p.gold -= cost; p.oil = cmd.dmgType; p.stats.itemGold += cost;
      ctx.emit('oil', { player: p.id, dmgType: cmd.dmgType });
      return null;
    }
    case 'potion': { const why = buyPotion(ctx, p); return why ? reject(why) : null; }
    case 'drink': {
      if (!hero || !hero.alive) return reject('dead');
      if (p.belt <= 0) return reject('belt');
      if (state.tick < p.drinkAt) return reject('cooldown');
      p.belt--; p.drinkAt = state.tick + 20;
      const h = Math.min(hero.hpMax - hero.hp, hero.hpMax * data.econ.items.potion.heal);
      hero.hp += h;
      ctx.emit('heal', { src: hero.id, dst: hero.id, amount: Math.round(h * 10) / 10 });
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
