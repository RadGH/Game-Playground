// Expected drops per solo player-hour, straight from rarity.json's formulas (no randomness: expectations).
import fs from 'node:fs';
const R = JSON.parse(fs.readFileSync('/home/radgh/claude/playground/prototypes/rogueloot/data/rarity.json', 'utf8'));
const lerp = (keys, L) => {
  if (L <= keys[0][0]) return keys[0].slice(1);
  if (L >= keys.at(-1)[0]) return keys.at(-1).slice(1);
  for (let i = 1; i < keys.length; i++) if (L <= keys[i][0]) {
    const t = (L - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]);
    return keys[i - 1].slice(1).map((v, j) => v + (keys[i][j + 1] - v) * t);
  }
};
const HOUR = { normal: 150, champion: 6, rare: 2, boss: 0.5, chest: 2.5, lockedChest: 0.5 };
function rarityShares(L, kind) {
  const [n, m, ra, u, le] = lerp(R.rarityByLevel.keys, L);
  const mult = R.rarityMult[kind] || R.rarityMult.normal;
  let w = { normal: n, magic: m, rare: ra * mult.rare, unique: u * mult.unique, legendary: le * mult.legendary };
  if (mult.minRarity === 'magic') { w.magic += w.normal; w.normal = 0; }
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  for (const k in w) w[k] /= sum;
  return w;
}
const avgCount = (c) => c.reduce((a, w, i) => a + w * (i + 1), 0) / c.reduce((a, b) => a + b, 0);
const chestAvg = (c) => c.reduce((a, w, i) => a + w * i, 0) / c.reduce((a, b) => a + b, 0);
function hour(L) {
  const out = { items: 0, rare: 0, unique: 0, legendary: 0 };
  const add = (count, kind, guaranteedRares = 0) => {
    const s = rarityShares(L, kind);
    out.items += count;
    out.rare += count * s.rare + guaranteedRares;
    out.unique += count * s.unique;
    out.legendary += count * s.legendary;
  };
  for (const kind of ['normal', 'champion', 'rare', 'boss']) {
    const d = R.itemDrops[kind];
    const chance = lerp(d.chancePct, L)[0] / 100;
    const n = HOUR[kind] * chance * (avgCount(d.count) + (d.extra || 0));
    add(n, kind, (d.guaranteedRares || 0) * HOUR[kind]);
  }
  add(HOUR.chest * chestAvg(R.chests.chest.items), 'chest');
  add(HOUR.lockedChest * chestAvg(R.chests.lockedChest.items), 'lockedChest');
  return out;
}
console.log('L\titems/h\trares/h\tuniq/h\tleg/h\th per unique\th per legendary');
for (const L of [1, 3, 5, 8, 10, 15, 20, 30, 40, 50, 60]) {
  const h = hour(L);
  console.log(`${L}\t${h.items.toFixed(1)}\t${h.rare.toFixed(2)}\t${h.unique.toFixed(3)}\t${h.legendary.toFixed(3)}\t${(1 / h.unique).toFixed(1)}\t${(1 / h.legendary).toFixed(1)}`);
}
