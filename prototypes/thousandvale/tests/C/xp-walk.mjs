// Owner feedback 8 (W4): "mobs give more XP". The measurement, with the real tables: the level curve
// (rules xpForLevel), a real spawn of every camp type that stands at that level in data/provinces/torbor_downs.json
// with the real champion / rare roll, the engine's own killXpFor (grey-con and level-gap rules included), and the quest
// rewards written for that level (data/quests, share of a level x progression.json questMult). How a person spends an
// hour is stream E's ASSUME table (tools/sim-economy.mjs): 85 kills an hour grinding; 4 quests + 32 kills an hour questing.
//
//   node tests/C/xp-walk.mjs            prints before (killMult as committed in git) and after (working tree)
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadRulesData } from '../../js/rules/data.js';
import { createEngine } from '../../js/rules/engine.js';
import { createRoomContext } from '../../js/rules/room.js';
import { attachField } from '../../js/rules/field.js';
import { flatTerrain } from '../../js/rules/terrain-flat.js';
import { spawnMonster } from '../../js/rules/monster-ai.js';
import { xpForLevel } from '../../js/rules/farhold.js';

const ROOT = new URL('../../', import.meta.url);
const readJson = u => JSON.parse(readFileSync(u, 'utf8'));
export const HOUR = Object.freeze({ grindKills: 85, questKills: 32, quests: 4 });       // = tools/sim-economy.mjs ASSUME

/** The table for levels 1..`top`: `killMult` null = the data as it is on disk. */
export async function xpWalk({ killMult = null, early = null, top = 10, seed = 11, n = 400 } = {}) {
  const data = await loadRulesData(readJson);
  if (killMult != null) data.progression.xp.killMult = killMult;
  if (early === false) delete data.progression.xp.killEarly;      // the rule as it was before owner feedback 8
  const engine = createEngine(data, { seed });
  const room = createRoomContext({ id: 'xp', seed, engine });
  attachField(room, { terrain: flatTerrain() });
  const sheet = readJson(new URL('data/provinces/torbor_downs.json', ROOT));
  const campRows = Object.values(sheet.zones).flatMap(z => (z.camps || []).map(c => ({ type: c.type, lo: [].concat(c.level)[0], hi: [].concat(c.level).slice(-1)[0] })));
  const typesAt = L => { let rows = campRows.filter(c => c.lo <= L && c.hi >= L); for (let d = 1; !rows.length && d < 30; d++) rows = campRows.filter(c => c.lo <= L + d && c.hi >= L - d); return [...new Set(rows.map(c => c.type))].filter(t => engine.enemyDef(t)); };
  const chance = engine.affixes?.cfg?.chance || { champion: 0, rare: 0, minLevel: 99 };
  let s = seed * 7919 + 1; const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const rankOf = L => { if (L < (chance.minLevel ?? 2)) return 'normal'; const x = rng(); return x < chance.rare ? 'rare' : x < chance.rare + chance.champion ? 'champion' : 'normal'; };
  const questFiles = ['start', 'setpieces', 'province', ...Object.keys(sheet.zones).filter(z => z !== 'test')];
  const quests = questFiles.flatMap(f => { try { return readJson(new URL(`data/quests/${f}.json`, ROOT)).quests || []; } catch { return []; } }).filter(q => q.reward?.xp > 0 && !q.classes);
  const questMult = data.progression.xp.questMult ?? 1;
  const rows = [];
  for (let L = 1; L <= top; L++) {
    const span = xpForLevel(L + 1, engine.levelCap) - xpForLevel(L, engine.levelCap);
    const types = typesAt(L);
    let xp = 0;
    for (let i = 0; i < n; i++) {
      const def = engine.enemyDef(types[i % types.length]);
      const u = room.run(() => spawnMonster(room.field, def, L, 0, 0, { rank: rankOf(L) }));
      xp += engine.rpg.killXpFor({ level: L }, u, early === false ? engine.xpCfg : engine.xpCfgFor(u.level));
      room.run(() => room.field.remove?.(u));
    }
    const perKill = xp / n;
    let qs = quests.filter(q => (q.level || 1) === L);
    for (let d = 1; qs.length < 4 && d < 10; d++) qs = quests.filter(q => Math.abs((q.level || 1) - L) <= d);
    const perQuest = qs.reduce((a, q) => a + q.reward.xp, 0) / qs.length * span * questMult;
    const questHour = HOUR.quests * perQuest + HOUR.questKills * perKill;
    rows.push({
      level: L, span, perKill: +perKill.toFixed(1), killsToLevel: Math.round(span / perKill), grindMin: Math.round(span / (perKill * HOUR.grindKills) * 60),
      perQuest: Math.round(perQuest), questMin: Math.round(span / questHour * 60), killShare: +(HOUR.questKills * perKill / questHour).toFixed(2),
      grindVsQuest: +((perKill * HOUR.grindKills) / questHour).toFixed(2),
    });
  }
  return { killMult: data.progression.xp.killMult, early: data.progression.xp.killEarly || null, rows };
}
export function printWalk(w, title) {
  const lines = [`${title} (killMult ${w.killMult})`, 'level  xp-to-next  xp/kill  kills-to-level  minutes(grind)  minutes(quest)  kill-share-of-questing  grind/quest xp'];
  for (const r of w.rows) lines.push(`${String(r.level).padStart(5)}  ${String(r.span).padStart(10)}  ${String(r.perKill).padStart(7)}  ${String(r.killsToLevel).padStart(14)}  ${String(r.grindMin).padStart(14)}  ${String(r.questMin).padStart(14)}  ${String(Math.round(r.killShare * 100) + '%').padStart(22)}  ${String(Math.round(r.grindVsQuest * 100) + '%').padStart(14)}`);
  return lines.join('\n');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sum = (w, f) => w.rows.filter(r => r.level <= 9).reduce((a, r) => a + r[f], 0);
  const b = await xpWalk({ early: false, top: 12 }), a = await xpWalk({ top: 12 });
  console.log(printWalk(b, 'BEFORE'));
  console.log(`level 1 -> 10: ${sum(b, 'killsToLevel')} kills, ${sum(b, 'grindMin')} minutes killing, ${sum(b, 'questMin')} minutes questing`);
  console.log(printWalk(a, `AFTER (monsters up to level ${a.early?.until} pay x${a.early?.mult}, fading to x${a.killMult} at level ${a.early?.fadeTo})`));
  console.log(`level 1 -> 10: ${sum(a, 'killsToLevel')} kills, ${sum(a, 'grindMin')} minutes killing, ${sum(a, 'questMin')} minutes questing`);
}
