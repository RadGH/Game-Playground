#!/usr/bin/env node
// Oathwild — print a character's numbers at every level, for tuning.
//
//   node prototypes/oathwild/tools/sim-levels.mjs                     every base class, levels 1-10
//   node prototypes/oathwild/tools/sim-levels.mjs --class paladin     one class (its round-1 plan)
//   node prototypes/oathwild/tools/sim-levels.mjs --plan warrior,warrior,cleric,…   your own plan
//   … --fight     also run the bot: damage a second against a dummy, and a level-matched fight
//   … --all       every round-1 class plan (base, advanced and specialty)
//
// Numbers come from the same rules the game runs (js/rules/sheet.js, combat.js); gear is a fresh
// magic set of the starting kinds at each level (what a player would have found by then).
import { bootRules } from '../js/rules/boot.js';
import { sheetOf } from '../js/rules/sheet.js';
import { buildCharacter, botInput, runFight } from '../tests/rules/bot.mjs';
import { PLANS, PLAN_SKILLS, MIXES } from '../tests/rules/plans.mjs';
import { createWorld, addPlayer, spawnMonster, step } from '../js/rules/combat.js';
import { fmt, fmtRange } from '../js/rules/farhold.js';

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : null; };
const rules = await bootRules({ seed: 7 });

let plans;
if (opt('--plan')) plans = { custom: String(opt('--plan')).split(',') };
else if (opt('--class')) plans = { [opt('--class')]: PLANS[opt('--class')] || MIXES[opt('--class')] };
else if (opt('--all')) plans = { ...PLANS, ...MIXES };
else plans = Object.fromEntries(Object.entries(PLANS).filter(([k]) => rules.data.classes.classes[k]?.tier === 'base'));
const fights = !!opt('--fight');

const FIGHT = lvl => lvl <= 2 ? [{ id: 'vale_wolf', level: lvl }]
  : lvl <= 5 ? [{ id: 'road_thug', level: lvl }, { id: 'bandit_crossbow', level: Math.max(1, lvl - 1) }]
    : [{ id: 'skeleton_warrior', level: lvl }, { id: 'drowned_brute', level: lvl - 1 }];

function dummyDps(char) {
  const w = createWorld(rules, { seed: 5 });
  const p = addPlayer(w, char, { at: [0, 0] });
  const m = spawnMonster(w, 'vale_wolf', char.level, [0, 2]);
  m.maxHp = m.hp = 1e9; m.dmg = [0, 0]; m.attackEvery = 1e6;
  let dmg = 0;
  for (let t = 0; t < 30; t += 0.05) for (const e of step(w, 0.05, { [p.id]: botInput(w, p) })) if ((e.t === 'hit' && e.from !== m.id) || e.t === 'tick') dmg += e.amount;
  return dmg / 30;
}

for (const [name, plan] of Object.entries(plans)) {
  if (!plan) { console.log(`no plan called ${name}`); continue; }
  console.log(`\n${name}: ${plan.join(' > ')}`);
  console.log(['Lv', 'classes', 'health', 'mana', 'stam', 'armour', 'weapon', 'spell(I/W/C)', 'heal', 'crit%', 'dodge%', 'move', 'carry', 'spells', ...(fights ? ['dps', 'fight'] : [])].join('\t'));
  for (let lvl = 1; lvl <= plan.length; lvl++) {
    const ch = buildCharacter(rules, plan.slice(0, lvl), { seed: 3, gearLevel: lvl > 1 ? lvl : null, skills: PLAN_SKILLS[name] || {} });
    const s = sheetOf(rules, ch);
    const cls = Object.entries(ch.classLevels).map(([c, n]) => `${rules.data.classes.classes[c].name} ${n}`).join(' ');
    const row = [lvl, cls, s.maxHp, s.maxMp, s.maxStamina, s.armor, fmtRange(...(s.ranged || s.melee)),
      ['int', 'wis', 'cha'].map(a => fmtRange(...s.spell[a])).join(' '), fmtRange(...s.heal), fmt(s.critChance), fmt(s.dodge), fmt(s.moveSpeed), `${fmt(s.carried)}/${fmt(s.carry)}`, ch.bar.length];
    if (fights) {
      row.push(fmt(Math.round(dummyDps(ch))));
      const r = runFight(rules, [ch], FIGHT(lvl), { seed: 9 });
      row.push(`${r.won ? 'won' : 'LOST'} ${fmt(r.seconds)}s ${r.players[0].hp}/${r.players[0].maxHp}`);
    }
    console.log(row.join('\t'));
  }
}
