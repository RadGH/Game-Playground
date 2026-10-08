import { rulesEngine, kitsFor } from '../../js/rules/index.js';
import { kitDistance, KIT_MIN_DIFF, KIT_MAX_PER_HANDS } from '../../js/rules/starter-kits.js';
import { createCharacter } from '../../js/rules/character.js';
const e = rulesEngine(); let bad = 0;
for (const c of e.classes) {
  const k = kitsFor(c.id);
  const ws = k.weapons;
  const byH = {};
  for (const w of ws) (byH[w.sig.hands] ||= []).push(w.id);
  for (const [h, ids] of Object.entries(byH)) if (ids.length > KIT_MAX_PER_HANDS) { bad++; console.log('HANDS', c.id, h, ids.join(',')); }
  for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) if (kitDistance(ws[i].sig, ws[j].sig) < KIT_MIN_DIFF) { bad++; console.log('DUP', c.id, ws[i].id, ws[j].id, JSON.stringify(ws[i].sig), JSON.stringify(ws[j].sig)); }
  const ch = createCharacter(e, { id: 1, classId: c.id, level: 1, name: 'x' });
  for (const w of ws) for (const [n, it] of w.items.entries()) { if (n === 0) { ch.equipment.weapon = null; ch.equipment.offhand = null; } const why = e.rpg.equipRefusal(ch, it, { into: n ? 'offhand' : 'weapon' }); if (why) { bad++; console.log('REFUSED', c.id, w.id, it.name, why); } }
  if (process.argv[2] === c.id || process.argv[2] === 'all') { for (const w of ws) console.log(' ', w.id.padEnd(18), w.name.padEnd(34), '|', w.role, '|', w.diff); for (const a of k.armour) console.log('  A', a.id.padEnd(16), a.role, '|', a.diff, '|', JSON.stringify(a.items.find(i => i.slot === 'chest')?.affixes?.map(x => x.stat + ':' + x.value))); }
}
console.log('bad', bad);
