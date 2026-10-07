// THE SERVER'S GOLD NUMBERS (stream A, owner feedback 7 V2: "overhaul gold rewards and item pricing"). Pure.
//
// Every gold source and price the server itself applies reads its numbers from here, and here reads them from stream E's
// `data/provinces/economy.json` (E leads the economy; tools/sim-economy.mjs imports this module). E's own key names are
// read as E wrote them — `unit {base, perLevel}`, `quest {mult}`, `event {perLevel, mult}`, `roadChest {base, perLevel,
// spread}`, `treasure`, `fare {base, metresPerGold, crossProvinceMetres}`, `sell {factor, fish}`, `mounts [{id, price,
// level}]` — and the rest under the names in ECONOMY_DEFAULTS (`chest`, `mail`, `guild`, `shop`, `barber`, `bag`, `cook`,
// `gift`). DEFAULTS below are what the code used to hard-code, so a missing file or a missing key changes nothing.
//
//   configureEconomy(serverBlock)      once at start (province, gateway, a tool) — merged over the defaults
//   economy()                          the live numbers
//   questGold(rewardGold, level) · killGoldAt(level) · chestGold(level) · treasureGold(level) · roadChestGold(level, rnd)
//   eventGold(rewardGold, level, minutes, worldBoss) · lengthFactor(minutes) · travelFare(metres, crossProvince)
//
// What is NOT here, because it already is data owned by C/E: a kill's gold and an item's price (stream C's rules:
// `rules.price`, Farhold balance), retrain prices (C), fish prices (C's fishing.json x E's angling.json), crate contents
// (C's crates.json), shop rows, mounts, potions, barber prices (E's shops.json), quest `reward.gold` multipliers (E's quests).

export const ECONOMY_DEFAULTS = Object.freeze({
  quest: { goldBase: 3, goldPerLevel: 1, mult: 1 },           // quest gold = reward.gold x (goldBase + goldPerLevel x quest level) x mult
  road: { killGoldBase: 3, killGoldPerLevel: 1, chest: { base: 6, perLevel: 5, randPerLevel: 3 } },
  chest: { base: 5, perLevel: 4 },                            // a dungeon / vignette chest's gold
  treasure: { base: 20, perLevel: 10 },                       // a clue chain's cache
  event: { goldPerLevel: 0.15, mult: 1, shortMinutes: 4, lengthCap: 2.5, worldBossMult: 2 },
  travel: { base: 2, metresPerGold: 400, crossProvinceMetres: 4000 },
  mail: { postage: 1 },
  guild: { fee: 10 },
  shop: { sellFactor: 0.25, perItemLevel: 0.12, fallbackPrice: 15, rarityPrice: { normal: 1, common: 1, magic: 2, uncommon: 2, rare: 4, legendary: 10, set: 10, unique: 20 }, crateSell: 1, buyback: 12, restockMinutes: 30, fishFactor: 1 },
  mounts: {},                                                 // mount id -> { price, level } (E's `mounts` list): overrides the mount table
  barber: { hair: 5, hairColour: 4, beard: 4, eyes: 6, face: 10, skin: 12, body: 20, everything: 40, perLevel: 0.05 },
  bag: { overflowPerItem: 1 },                                // a drop that does not fit pays its value, at least this
  cook: { mealValue: 2 },
  gift: { feedbackMinRarity: 'rare' },                        // the thank-you gift box of a first feedback report
});

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function merge(base, over) {
  const out = {};
  for (const k of Object.keys(base)) out[k] = isObj(base[k]) ? merge(base[k], isObj(over && over[k]) ? over[k] : {}) : (over && over[k] !== undefined && typeof over[k] === typeof base[k] && (typeof over[k] !== 'number' || Number.isFinite(over[k])) ? over[k] : base[k]);
  if (isObj(over)) for (const k of Object.keys(over)) if (!(k in base) && !k.startsWith('_')) out[k] = over[k];
  return out;
}
let live = merge(ECONOMY_DEFAULTS, {});
/** Set the numbers (the `server` block of data/rules/economy.json, or the whole file). Unknown / wrong-typed values keep the default. */
export function configureEconomy(data = null) {
  const d = isObj(data) ? (isObj(data.server) ? { ...data, ...data.server } : data) : {};
  // stream E's names (data/provinces/economy.json) onto ours
  const o = { ...d };
  const put = (k, patch) => { o[k] = { ...(isObj(o[k]) ? o[k] : {}), ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) }; };
  if (isObj(d.unit)) { put('quest', { goldBase: d.unit.base, goldPerLevel: d.unit.perLevel }); put('road', { killGoldBase: d.unit.base, killGoldPerLevel: d.unit.perLevel }); }
  if (isObj(d.event) && d.event.perLevel !== undefined) put('event', { goldPerLevel: d.event.perLevel });
  if (isObj(d.roadChest)) put('road', { chest: { base: d.roadChest.base ?? ECONOMY_DEFAULTS.road.chest.base, perLevel: d.roadChest.perLevel ?? ECONOMY_DEFAULTS.road.chest.perLevel, randPerLevel: d.roadChest.spread ?? d.roadChest.randPerLevel ?? ECONOMY_DEFAULTS.road.chest.randPerLevel } });
  if (isObj(d.fare)) put('travel', d.fare);
  if (isObj(d.sell)) put('shop', { sellFactor: d.sell.factor, fishFactor: d.sell.fish });
  if (Array.isArray(d.mounts)) o.mounts = Object.fromEntries(d.mounts.filter(m => m && typeof m.id === 'string').map(m => [m.id, { ...(Number.isFinite(m.price) ? { price: m.price } : {}), ...(Number.isFinite(m.level) ? { level: m.level } : {}) }]));
  live = merge(ECONOMY_DEFAULTS, o);
  return live;
}
export const economy = () => live;

export const killGoldAt = level => live.quest.goldBase + live.quest.goldPerLevel * Math.max(1, level || 1);
export const questGold = (rewardGold, level) => Math.round((rewardGold || 0) * killGoldAt(level) * live.quest.mult);
export const roadKillGold = level => live.road.killGoldBase + live.road.killGoldPerLevel * Math.max(1, level || 1);
export const roadChestGold = (level, rnd = 0) => Math.round(level * live.road.chest.perLevel + live.road.chest.base + rnd * level * live.road.chest.randPerLevel);
export const chestGold = level => Math.round(level * live.chest.perLevel + live.chest.base);
export const treasureGold = level => Math.round(level * live.treasure.perLevel + live.treasure.base);
export const lengthFactor = minutes => Math.max(1, Math.min(live.event.lengthCap, (minutes || 0) / live.event.shortMinutes));
export const eventGold = (rewardGold, level, minutes = 0, worldBoss = false) => Math.round((rewardGold || 0) * (1 + live.event.goldPerLevel * (Math.max(1, level || 1) - 1)) * live.event.mult * lengthFactor(minutes) * (worldBoss ? live.event.worldBossMult : 1));
export const travelFare = (metres, crossProvince = false) => live.travel.base + Math.round((metres + (crossProvince ? live.travel.crossProvinceMetres : 0)) / live.travel.metresPerGold);
