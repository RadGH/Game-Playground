#!/usr/bin/env node
// Oathwild — the 1v1 / 1v2 / 1v3 balance sim (lessons rule 81: an action game is balanced per class BEFORE it ships).
//
//   node prototypes/oathwild/tools/sim-fights.mjs                 every base class at levels 1, 3, 5, 10 vs 1, 2, 3
//                                                                 same-level monsters of every kind in the level's region
//   … --class warrior          one class            … --levels 1,5      some levels      … --counts 1,2
//   … --basic                  weapon only (no spells)               … --nododge          the bot never dodges
//   … --dodge 0.5              share of monster tells the bot rolls out of (default 0.5: an average phone player)
//   … --detail                 one row per monster kind              … --bosses           also one boss vs one hero
//   … --json                   machine-readable rows
//
// The goal it is read against (data/combat.json `_goal`): a level-N hero using their abilities kills ONE level-N normal
// monster in ~6-10 s losing <= 35% health; two is a real fight they win; three is dangerous; weapon alone still wins
// 1v1, slowly. Same rules as the game (js/rules/combat.js) and the same bot as the tests (tests/rules/bot.mjs).
import { bootRules } from '../js/rules/boot.js';
import { buildCharacter, runFight } from '../tests/rules/bot.mjs';
import { PLANS } from '../tests/rules/plans.mjs';

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : null; };
const rules = await bootRules({ seed: 7 });
const C = rules.data.classes.classes;
const classes = opt('--class') ? String(opt('--class')).split(',') : Object.keys(PLANS).filter(k => C[k]?.tier === 'base');
const levels = opt('--levels') ? String(opt('--levels')).split(',').map(Number) : [1, 3, 5, 10];
const counts = opt('--counts') ? String(opt('--counts')).split(',').map(Number) : [1, 2, 3];
const basic = !!opt('--basic'), dodge = !opt('--nododge'), detail = !!opt('--detail'), json = !!opt('--json');
// gear: 'auto' (default) = plain kit of the level up to level 3 (a fresh hero who has not found magic gear yet — the case
// the owner played), a set of good magic finds from level 5; --gear normal | magic forces one
const gear = opt('--gear') ? String(opt('--gear')) : 'auto';
const gearAt = lvl => gear === 'auto' ? (lvl >= 5 ? 'magic' : 'normal') : gear;
const dodgeSkill = opt('--dodge') ? Number(opt('--dodge')) : 0.5;   // share of tells the bot rolls out of (an average phone player ~ half)

/** Every hostile normal monster kind a hero of `level` meets (the region whose levels hold it; 5 = both). */
export function kindsFor(level, { bosses = false } = {}) {
  const out = new Set();
  for (const r of Object.values(rules.data.regions.regions)) {
    if (level < r.levels[0] || level > r.levels[1]) continue;
    const rows = [...(r.roam || []).map(x => ({ id: x.id })), ...Object.values(r.camps || {}).flatMap(c => c.spawns)];
    for (const s of rows) {
      if (!!bosses !== (s.rank === 'boss')) continue;
      const m = rules.data.monsters.monsters[s.id];
      if (!m || (m.temper && m.temper !== 'hostile')) continue;
      out.add(s.id);
    }
  }
  return [...out];
}

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };
const pct = n => `${Math.round(n * 100)}%`;
const rows = [];
for (const cls of classes) {
  const plan = PLANS[cls];
  if (!plan) { console.log(`no plan for ${cls}`); continue; }
  for (const lvl of levels) {
    const ch = () => buildCharacter(rules, plan.slice(0, lvl), { seed: 3, gearLevel: lvl > 1 ? lvl : null, gearRarity: gearAt(lvl) });
    for (const n of counts) {
      const per = [];
      for (const id of kindsFor(lvl)) {
        const r = runFight(rules, [ch()], Array.from({ length: n }, () => ({ id, level: lvl })), { seed: 11, maxSeconds: 90, basic, dodge, dodgeSkill });
        const p = r.players[0];
        per.push({ id, won: r.won, seconds: r.fight ?? r.seconds, left: r.won ? p.hp / p.maxHp : 0, dodges: r.dodges || 0 });
      }
      const won = per.filter(x => x.won);
      const row = { cls, lvl, n, kinds: per.length, winRate: won.length / Math.max(1, per.length), ttk: median(won.map(x => x.seconds)), left: median(per.map(x => x.left)), worst: per.reduce((a, b) => (b.left < a.left ? b : a), per[0]), per };
      rows.push(row);
    }
    if (opt('--bosses')) for (const id of kindsFor(lvl, { bosses: true })) {
      const r = runFight(rules, [ch()], [{ id, level: lvl, rank: 'boss' }], { seed: 11, maxSeconds: 180, basic, dodge, dodgeSkill });
      rows.push({ cls, lvl, n: 'boss', boss: id, won: r.won, seconds: r.seconds, left: r.won ? r.players[0].hp / r.players[0].maxHp : 0 });
    }
  }
}
if (json) { console.log(JSON.stringify(rows.map(r => ({ ...r, per: detail ? r.per : undefined })), null, 1)); process.exit(0); }
console.log(`mode: ${gear} gear, ${basic ? 'weapon only' : 'abilities'}${dodge ? ` + rolls out of ${Math.round(dodgeSkill * 100)}% of tells` : ', no dodges'}  (won = share of monster kinds beaten; time = median seconds from the first blow to the last; left = median health left)`);
console.log(['class', 'lv', ...counts.map(n => `1v${n}: won  time  left`)].join('\t'));
for (const cls of classes) for (const lvl of levels) {
  const cells = counts.map(n => { const r = rows.find(x => x.cls === cls && x.lvl === lvl && x.n === n); return r ? `${pct(r.winRate).padStart(4)} ${String(Number.isFinite(r.ttk) ? r.ttk.toFixed(1) + 's' : '-').padStart(6)} ${pct(r.left).padStart(4)}` : ''; });
  console.log([cls.padEnd(8), lvl, ...cells].join('\t'));
  if (detail) for (const n of counts) { const r = rows.find(x => x.cls === cls && x.lvl === lvl && x.n === n); if (r) console.log(`    1v${n}: ` + r.per.map(p => `${p.id} ${p.won ? p.seconds + 's ' + pct(p.left) : 'LOST'}`).join(', ')); }
  for (const b of rows.filter(x => x.cls === cls && x.lvl === lvl && x.n === 'boss')) console.log(`    boss ${b.boss}: ${b.won ? `won ${b.seconds}s ${pct(b.left)} left` : `lost (${b.seconds}s)`}`);
}
