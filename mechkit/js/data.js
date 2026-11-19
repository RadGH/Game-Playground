// The Mech Kit's data files, loaded once (fetch + top-level await: no JSON import attributes — they broke live pages
// on Steam Deck browsers, see memory "no import attributes in browser code").
const load = async name => { const r = await fetch(new URL(`../data/${name}`, import.meta.url)); if (!r.ok) throw new Error(`${name}: ${r.status}`); return r.json(); };
export const [PARTS_JSON, MAKERS_JSON, LINES_JSON] = await Promise.all([load('parts.json'), load('makers.json'), load('lines.json')]);
export const MAKER_LIST = MAKERS_JSON.makers;
export const MAKER = Object.fromEntries(MAKER_LIST.map(m => [m.id, m]));
/** Frame lines (data/lines.json): a matching head / core / arms / booster / legs set per maker. */
export const LINE_LIST = LINES_JSON.lines;
export const LINE = Object.fromEntries(LINE_LIST.map(l => [l.id, l]));
