// Spirehold — what a research rank actually does, in numbers, for the Research cards.
// researchEffect(G, r) returns { now, next } strings measured with the game's own formulas
// (so they include relics, landmarks and Legacy), never a copy of them.
// It never changes G: it reads through a stand-in whose bonus table has this research at another rank.

import { RESEARCH } from './data.js';
import { bonuses, bon, wallMax, wallRegen, manaMax, manaRegen, popCap, autoPower, mageSlots, TUNE } from './rules.js';
import { ditchDps } from './battle.js';
import { rosterCap, boardSize } from './guild.js';

/** G as it would be with research `r` at rank `n`. Read-only: never write through it. */
export function atRank(G, r, n) {
  const have = G.research[r.id] || 0;
  const b = { ...bonuses(G) };
  for (const k in r.fx) b[k] = (b[k] || 0) + (n - have) * r.fx[k];
  const S = Object.create(G);
  for (const [k, v] of [['_rev', 0], ['_bonKey', 0], ['_bon', b], ['research', { ...G.research, [r.id]: n }]]) Object.defineProperty(S, k, { value: v, writable: true, enumerable: false });
  return S;
}

const num = n => { n = +n || 0; if (n >= 1e6) return n.toExponential(2).replace('e+', 'e'); if (n >= 100) return Math.round(n).toLocaleString('en-US'); if (n >= 10) return n.toFixed(1).replace(/\.0$/, ''); return n.toFixed(2).replace(/\.?0+$/, ''); };
const pc = v => num(v * 100) + '%';
const plus = v => '+' + pc(v);

/** One line per research: what the stat is with this many ranks. */
const SHOW = {
  rs_wall:    S => `${num(wallMax(S))} wall strength`,
  rs_mend:    S => `mends ${num(wallRegen(S))} wall strength a second (${pc(TUNE.wallRegen * (1 + bon(S, 'wallRegen')))} of full strength)`,
  rs_ditch:   S => bon(S, 'ditch') ? `${num(ditchDps(S, bon(S, 'ditch')))} damage a second to each foe at the wall` : 'no ditch',
  rs_towers:  S => `${plus(bon(S, 'tower'))} tower damage`,
  rs_range:   S => `${plus(bon(S, 'range'))} tower range`,
  rs_crit:    S => `${pc(bon(S, 'crit'))} extra chance a tower shot hits for double`,
  rs_cheap:   S => `tower upgrades ${pc(Math.min(0.45, bon(S, 'cheap')))} cheaper (45% at most)`,
  rs_spell:   S => `${plus(bon(S, 'spell'))} spell damage, ${num(manaRegen(S))} mana a second`,
  rs_mana:    S => `${num(manaRegen(S))} mana a second, ${num(manaMax(S))} mana at most`,
  rs_auto:    S => bon(S, 'autocast') ? `apprentices cast at ${pc(autoPower(S))} power` : 'nobody casts while you are away',
  rs_autopow: S => `apprentices cast at ${pc(autoPower(S))} power`,
  rs_mages:   S => S.city.landmarks.academy ? `${mageSlots(S)} court mage places` : `${num(bon(S, 'mageSlots'))} extra place${bon(S, 'mageSlots') === 1 ? '' : 's'} (open once you build the Mage Academy)`,
  rs_magepow: S => `${plus(bon(S, 'mage'))} court mage damage`,
  rs_tax:     S => `${plus(bon(S, 'gold'))} gold`,
  rs_homes:   S => `room for ${num(popCap(S))} people`,
  rs_scribes: S => `${plus(bon(S, 'lore'))} lore`,
  rs_away:    S => `earn ${pc(Math.min(1, TUNE.offlineEff + bon(S, 'offline')))} of your normal rate while away (up to ${TUNE.offlineCapHours} hours)`,
  rs_speed:   S => bon(S, 'speed3') ? '3x speed unlocked' : 'top speed 2x',
  rs_bounty:  S => `${plus(bon(S, 'kill'))} gold from kills`,
  rs_roster:  S => `room for ${rosterCap(S)} adventurers`,
  rs_odds:    S => `${plus(bon(S, 'odds'))} to every quest's chance of success`,
  rs_loot:    S => `${plus(bon(S, 'quest'))} quest rewards`,
  rs_heal:    S => `injuries last ${pc(Math.max(0.3, 1 - bon(S, 'healFast')))} as long, ${pc(Math.min(0.9, bon(S, 'safe')))} less chance to be hurt`,
  rs_train:   S => `${plus(bon(S, 'advXp'))} adventurer experience, ${plus(bon(S, 'guildWall'))} damage from the walls`,
  rs_parties: S => `${boardSize(S)} quests on the board`,
};

/** { now, next } for the card. `next` is null at the top rank. Spell lessons have nothing to measure. */
export function researchEffect(G, r) {
  const show = SHOW[r.id]; if (!show) return null;
  const n = G.research[r.id] || 0;
  return { now: show(atRank(G, r, n)), next: n < r.max ? show(atRank(G, r, n + 1)) : null };
}

export const RESEARCH_SHOWN = Object.keys(SHOW);
export { RESEARCH };
