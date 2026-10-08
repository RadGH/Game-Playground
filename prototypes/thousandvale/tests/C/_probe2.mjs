import { rulesEngine, kitsFor } from '../../js/rules/index.js';
import { profileOf, traitsOf } from '../../js/rules/farhold.js';
const e = rulesEngine();
const A = e.items.affixes;
console.log([...A.prefixes, ...A.suffixes].map(a => `${a.stat}:${a.min}-${a.max}`).join(' '));
const seen = new Set();
for (const c of e.classes) for (const w of kitsFor(c.id).weapons) { const m = w.items[0]; if (seen.has(w.main)) continue; seen.add(w.main); const p = profileOf(m); console.log(w.main.padEnd(13), (m.twoHanded ? '2h' : '1h'), m.subtype.padEnd(9), 'pat', (p.pattern || []).join('-').padEnd(28), 'reach', p.reach, 'every', p.every, 'traits', JSON.stringify(traitsOf(m)), m.ranged ? 'RANGED' : ''); }
console.log(Object.keys(e.items.weaponBases).filter(k => !seen.has(k) && (e.items.weaponBases[k].minAct ?? 1) <= 1 && !e.items.weaponBases[k].tvCatalog).join(' '));
const u = {}; for (const c of e.classes) { const ws = kitsFor(c.id).weapons; console.log(c.id.padEnd(14), c.armorTier.padEnd(6), ws.map(w => w.main + (w.off ? '+' + w.off : '') + (w.style ? ':' + w.style : '') + (w.spell ? ':' + w.spell : '') + (w.element ? '/' + w.element : '')).join(' | ')); }
