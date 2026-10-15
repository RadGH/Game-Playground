// WHICH DATA FILE A PROVINCE READS (stream P, Expansion 1: "every Torbor-only assumption made per province"). Pure.
//
// Torbor Downs (HOME_PROVINCE) keeps every file where it always was — data/provinces/shops.json, carts.json, … — so its
// content and every test that reads those paths are unchanged. Any other province has its OWN copy beside it, named
// `<dir>/<province>-<file>` (data/provinces/vharlen-shops.json, data/quests/marks/vharlen-givers.json); names are
// `data/names/<province>.json`. Two kinds of file:
//
//   shared   rules and catalogues any province can use (shop kinds, schedules, travellers, economy, angling fish,
//            professions recipes, road events, …). A province without its own file uses the home one; a province WITH
//            its own file gets the home one with its own laid over it key by key (top level), so it names only the
//            blocks it changes. The home file's PLACED_KEYS (things that stand in Torbor's towns: `towns`, `anglers`,
//            `trainers`) are never lent to another province.
//   placed   things that stand on one province's map (offices, carts, guard posts, fishing pools, gathering nodes, the
//            map's town services, quest givers' marks). Only the province's own file; none = none.
//
//   provinceDataPath(prov, thing)                     -> where `thing` lives for `prov` (what a content tool writes)
//   await provinceData(readJson, prov, thing)         -> the data the server reads (null when there is none)
//   provinceDataSync(readJson, prov, thing)           -> the same with a synchronous reader (the content tools)
//   provinceArg(argv)                                 -> `--province=<id>` / `--province <id>` from a tool's argv (default home)

export const HOME_PROVINCE = 'torbor_downs';

/** thing -> [the home province's path, kind]. */
export const PROVINCE_DATA = Object.freeze({
  shops: ['data/provinces/shops.json', 'shared'],
  schedules: ['data/provinces/schedules.json', 'shared'],
  travellers: ['data/provinces/travellers.json', 'shared'],
  wanderers: ['data/provinces/wanderers.json', 'shared'],
  economy: ['data/provinces/economy.json', 'shared'],
  angling: ['data/provinces/angling.json', 'shared'],
  professions: ['data/provinces/professions.json', 'shared'],
  'road-events': ['data/provinces/road-events.json', 'shared'],
  rares: ['data/provinces/rares.json', 'shared'],
  sites: ['data/provinces/sites.json', 'shared'],
  archetypes: ['data/provinces/archetypes.json', 'shared'],
  mounts: ['data/provinces/mounts.json', 'shared'],
  names: ['data/names/torbor.json', 'shared'],
  offices: ['data/provinces/offices.json', 'placed'],
  carts: ['data/provinces/carts.json', 'placed'],
  guards: ['data/provinces/guards.json', 'placed'],
  'angling-pools': ['data/provinces/angling-pools.json', 'placed'],
  'professions-nodes': ['data/provinces/professions-nodes.json', 'placed'],
  'town-services': ['data/provinces/town-services.json', 'placed'],
  'setpiece-pins': ['data/provinces/setpiece-pins.json', 'placed'],
  refunds: ['data/provinces/refunds.json', 'placed'],
  givers: ['data/quests/marks/givers.json', 'placed'],
  hazards: ['data/provinces/hazards.json', 'placed'],      // [S] Expansion 1 §4: hot springs, geysers, lava vents, ashfall (tools/content-hazards.mjs)
});

/** Keys of a shared home file that describe Torbor's own towns: never lent to another province. */
export const PLACED_KEYS = Object.freeze({ shops: ['towns'], angling: ['anglers'], professions: ['trainers'] });

function entry(thing) {
  const e = PROVINCE_DATA[thing];
  if (!e) throw new Error('province-files: unknown data file ' + thing);
  return e;
}

/** Where `thing` lives for province `prov` (the home province: the old shared path). */
export function provinceDataPath(prov, thing) {
  const [home] = entry(thing);
  if (!prov || prov === HOME_PROVINCE) return home;
  if (thing === 'names') return `data/names/${prov}.json`;
  const i = home.lastIndexOf('/');
  return `${home.slice(0, i)}/${prov}-${home.slice(i + 1)}`;
}

/** Is `thing` lent from the home province when `prov` has none of its own? */
export const isShared = thing => entry(thing)[1] === 'shared';

function lend(thing, base) {
  if (!base || typeof base !== 'object' || Array.isArray(base)) return base;
  const drop = PLACED_KEYS[thing];
  if (!drop) return base;
  const out = { ...base };
  for (const k of drop) delete out[k];
  return out;
}
function combine(prov, thing, own, base) {
  if (!prov || prov === HOME_PROVINCE) return base;
  if (!isShared(thing)) return own;
  const lent = lend(thing, base);
  if (own == null) return lent ?? null;
  if (lent == null || typeof own !== 'object' || Array.isArray(own) || typeof lent !== 'object' || Array.isArray(lent)) return own;
  return { ...lent, ...own };
}

/** The data the server reads for `prov` (null when there is none). `readJson(path)` may throw for a missing file. */
export async function provinceData(readJson, prov, thing) {
  const opt = async f => { try { return await readJson(f); } catch { return null; } };
  const [home] = entry(thing);
  if (!prov || prov === HOME_PROVINCE) return opt(home);
  const own = await opt(provinceDataPath(prov, thing));
  return combine(prov, thing, own, isShared(thing) ? await opt(home) : null);
}

/** provinceData with a synchronous reader (the content tools). */
export function provinceDataSync(readJson, prov, thing) {
  const opt = f => { try { return readJson(f); } catch { return null; } };
  const [home] = entry(thing);
  if (!prov || prov === HOME_PROVINCE) return opt(home);
  const own = opt(provinceDataPath(prov, thing));
  return combine(prov, thing, own, isShared(thing) ? opt(home) : null);
}

/** The province a content tool works on: `--province=<id>` or `--province <id>` (default HOME_PROVINCE). */
export function provinceArg(argv = []) {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--province=')) return a.slice(11) || HOME_PROVINCE;
    if (a === '--province' && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  }
  return HOME_PROVINCE;
}

/** The name file of a province: the sheet's `names` ("vharlen" -> data/names/vharlen.json) wins, then the convention. */
export function namesPath(prov, sheet = null) {
  if (sheet && typeof sheet.names === 'string' && sheet.names) return sheet.names.includes('/') ? sheet.names : `data/names/${sheet.names.replace(/\.json$/, '')}.json`;
  return provinceDataPath(prov, 'names');
}

/**
 * Join the same data file of several provinces into one (fishing pools and gathering nodes are keyed by WORLD zone, so a
 * realm-wide system can hold every island's at once): arrays are concatenated, objects merged key by key, the rest is the
 * first one's. One file (or none): returned as it is.
 */
export function joinProvinceData(list) {
  const have = (list || []).filter(d => d && typeof d === 'object' && !Array.isArray(d));
  if (have.length <= 1) return have[0] || null;
  const out = { ...have[0] };
  for (const d of have.slice(1)) for (const [k, v] of Object.entries(d)) {
    if (k.startsWith('_')) continue;
    const cur = out[k];
    if (Array.isArray(cur) && Array.isArray(v)) out[k] = [...cur, ...v];
    else if (cur && v && typeof cur === 'object' && typeof v === 'object' && !Array.isArray(cur) && !Array.isArray(v)) out[k] = { ...cur, ...v };
    else if (cur === undefined) out[k] = v;
  }
  return out;
}
