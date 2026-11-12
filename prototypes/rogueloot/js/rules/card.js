// What an item card says, as data (game standards §5b). Pure, so node tests read exactly what the card shows.
//   - the first line under the name is how it is held (hands.js: One-handed / Two-handed / Main hand only / Off hand only)
//   - the SAME stat is one line: a base's 20 armour and an affix's +4 armour read "+24 Armour", with the split kept
//     beside it ("20 base + 4"). Weapon damage folds in flat and % damage, attack speed and quality; armour folds in
//     flat and % armour and quality; a shield's block folds in block chance and amount. Every other stat is already
//     summed across the implicit, the affixes and a unique's own rolls by items.js itemMods (one line per stat).
import { itemMods, weaponDamage, itemArmour } from './items.js';
import { handText } from './hands.js';

/** Stats a base's own line absorbs, by what the base carries. */
export const FOLDED = Object.freeze({ damage: ['physDamageFlat', 'physDamagePct', 'attackSpeed'], armour: ['armourFlat', 'armourPct'], block: ['blockChance', 'blockAmount'] });
const n1 = v => String(+(+v).toFixed(1));

/** -> { hand, lines: [{ key, text, split }], mods: { stat: { value, units } } } — `mods` holds only what the lines did not fold in. */
export function cardStats(data, it) {
  const b = data.bases[it.base] || {}, m = { ...itemMods(data, it) }, lines = [], q = it.quality || 0;
  const take = k => { const v = m[k]?.value || 0; delete m[k]; return v; };
  const wd = weaponDamage(data, it);
  if (wd) {
    const flat = take('physDamageFlat'), pc = take('physDamagePct'), as = take('attackSpeed');
    const split = [flat || pc || q ? `${b.damage.min}–${b.damage.max} base` : '', flat ? `+${n1(flat * (wd.hands === 2 ? 1.5 : 1))}` : '', pc ? `+${pc}%` : '', q ? `+${q}% quality` : ''].filter(Boolean).join(' ');
    lines.push({ key: 'damage', text: `${wd.min}–${wd.max} Damage`, split });
    lines.push({ key: 'speed', text: `${n1(wd.speed)} attacks a second`, split: as ? `${n1(b.damage.speed)} base +${as}%` : '' });
  }
  if (b.armour) {
    const flat = take('armourFlat'), pc = take('armourPct');
    lines.push({ key: 'armour', text: `+${itemArmour(data, it)} Armour`, split: flat || pc || q ? [`${b.armour} base`, flat ? `+${flat}` : '', pc ? `+${pc}%` : '', q ? `+${q}% quality` : ''].filter(Boolean).join(' ') : '' });
  }
  if (b.block) {
    const bc = take('blockChance'), ba = take('blockAmount');
    lines.push({ key: 'block', text: `${b.block.chance + bc}% Block · blocks ${b.block.amount + ba}`, split: bc || ba ? `${b.block.chance}% base${bc ? ` +${bc}%` : ''}${ba ? ` · ${b.block.amount} base +${ba}` : ''}` : '' });
  }
  return { hand: handText(data, b), lines, mods: m };
}
