import { rulesEngine, starterGear, validKit, kitsFor } from '../../../js/rules/index.js';
import { createCharacter } from '../../../js/rules/character.js';
import { sheetJob } from '../../../js/rules/estimate.js';
import { makeRng } from '../../../js/rules/rng.js';
const engine = rulesEngine();
export function dpsOf(cls, level, pack = null) {
  const gear = starterGear(cls, validKit(cls, pack ? { weapons: pack } : {}));
  // level-appropriate weapon of the same base so levels compare fairly
  const eq = {};
  for (const [slot, it] of Object.entries(gear)) eq[slot] = engine.makeItem({ base: it.catalogBase || it.baseKey, rarity: 'normal', level, rng: makeRng(9) }) || it;
  for (const [slot, it] of Object.entries(eq)) { const g = gear[slot]; if (g.castStyle) it.castStyle = g.castStyle; if (g.castElement && it.castElement !== g.castElement) { it.attune = g.castElement; } engine.finishItem(it, { fresh: false, convert: false }); }
  const u = createCharacter(engine, { id: 'd' + cls + level, classId: cls, level, rng: makeRng(3), gear: { equipment: eq } });
  const job = sheetJob(engine, u);
  let guard = 0; while (!job.step() && guard++ < 5000);
  const rows = job.rows();
  const basic = rows.find(r => r.slot === 0 || r.id === 'basic');
  const skills = rows.filter(r => r !== basic && !r.locked);
  return { cls, level, basic: Math.round(basic?.dps || 0), skills: skills.map(r => `${r.name}:${Math.round(r.dps || 0)}`), sum: Math.round(skills.reduce((a, r) => a + (r.dps || 0), 0) + (basic?.dps || 0)) };
}
if (process.argv[1].endsWith('dps.mjs')) for (const level of [5, 10, 20]) for (const cls of ['mage', 'stormcaller', 'pyromancer', 'starcaller']) { const r = dpsOf(cls, level); console.log(level, cls.padEnd(12), 'basic', String(r.basic).padStart(4), 'total', String(r.sum).padStart(5), r.skills.join(' ')); }
