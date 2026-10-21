// Armory — the pure half: rows, filters, deep links, looks, flags. No three.js, no DOM, so
// armory/tests/armory.test.js can check all of it under node.
//
// A ROW is one catalog entry in the shape avatar-3d/data/gear-catalog.json uses (see that folder's
// gear-catalog.js): { id, kind, slot, field, gameSlot, type, archetype, hands, file, builder, name,
// element, form, tags, color, color2, new, round, games, items }. `prepareRows` adds `key` (unique on
// the page — an id may appear under two slots, e.g. a sword in the main hand and in the off hand).

export const KIND_LABEL = { weapon: 'Weapons', offhand: 'Off-hand', armour: 'Armour', hat: 'Headwear', accessory: 'Accessories' };
export const SLOT_LABEL = {
  weapon: 'Weapon', offhand: 'Off hand', head: 'Head', chest: 'Chest', legs: 'Legs', hands: 'Hands', feet: 'Feet',
  cape: 'Cape', necklace: 'Necklace', ring: 'Ring', light: 'Light', belt: 'Belt', decor: 'Kit / decoration', face: 'Face',
};
export const GAME_LABEL = { thousandvale: 'Thousandvale', farhold: 'Farhold', emberveil: 'Emberveil', bannerline: 'Bannerline' };
/** The game slot a row belongs to when the catalog does not say (older rows, the stop-gap list). */
const GAME_SLOT_OF = { held: 'weapon', offhand: 'offhand', hat: 'head', top: 'chest', bottom: 'legs', shoes: 'feet', cape: 'cape', decor: 'decor', accessory: 'face' };
const DEFAULT_COLOUR = { held: '#b9c2cc', offhand: '#8d97a3', hat: '#8a9098', top: '#7a5a3a', bottom: '#5a4a3a', shoes: '#4a3a2a', cape: '#7a2a2a', decor: '#b08a4a', accessory: '#d8b040' };
export const THIS_ROUND = 5;

const title = id => String(id).replace(/^(fh|tv|g5|t2)_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

/** Catalog rows -> the rows the page works with. Never mutates the input. */
export function prepareRows(rows) {
  const seen = new Map();
  return (rows || []).filter(r => r && r.id && r.id !== 'none').map(r => {
    const slot = r.slot || 'held';
    const row = {
      ...r, slot, field: r.field || null,
      kind: r.kind || (slot === 'held' ? 'weapon' : slot === 'offhand' ? 'offhand' : slot === 'hat' ? 'hat' : ['top', 'bottom', 'shoes'].includes(slot) ? 'armour' : 'accessory'),
      gameSlot: r.gameSlot || GAME_SLOT_OF[slot] || slot,
      name: r.name || title(r.id), type: r.type || null, archetype: r.archetype || null,
      hands: r.hands ?? null, file: r.file || null, builder: r.builder || null,
      games: r.games || [], items: r.items || [], tags: r.tags || [],
      isNew: !!(r.new || r.isNew || r.round === THIS_ROUND),
    };
    let key = row.id;
    if (seen.has(key)) key = `${slot}${row.field ? '.' + row.field : ''}:${row.id}`;
    seen.set(key, true); row.key = key;
    return row;
  });
}

/** Counted values for each filter, in a stable order (most rows first, then by name). */
export function facets(rows) {
  const out = {};
  const count = (name, values) => { const m = out[name] || (out[name] = new Map()); for (const v of values) if (v != null && v !== '') m.set(v, (m.get(v) || 0) + 1); };
  for (const r of rows) {
    count('kind', [r.kind]); count('slot', [r.gameSlot]); count('type', [r.type]); count('archetype', [r.archetype]);
    count('game', r.games); count('hands', r.hands ? [String(r.hands)] : []);
  }
  return Object.fromEntries(Object.entries(out).map(([k, m]) => [k, [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).map(([value, n]) => ({ value, n }))]));
}

export const EMPTY_FILTER = { q: '', kind: '', slot: '', type: '', archetype: '', game: '', hands: '', isNew: false, flagged: false };

/** Rows that pass every active filter. `flags` is the flag book ({ [key]: { note } }). */
export function filterRows(rows, f = {}, flags = {}) {
  const words = String(f.q || '').toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter(r => {
    if (f.kind && r.kind !== f.kind) return false;
    if (f.slot && r.gameSlot !== f.slot) return false;
    if (f.type && r.type !== f.type) return false;
    if (f.archetype && r.archetype !== f.archetype) return false;
    if (f.game && !r.games.includes(f.game)) return false;
    if (f.hands && String(r.hands) !== String(f.hands)) return false;
    if (f.isNew && !r.isNew) return false;
    if (f.flagged && !flags[r.key]) return false;
    if (!words.length) return true;
    const hay = [r.id, r.name, r.kind, r.slot, r.gameSlot, r.type, r.archetype, r.file, r.builder, r.element, r.form, ...r.tags, ...r.games, ...r.items.map(i => i.base + ' ' + (i.name || ''))].join(' ').toLowerCase();
    return words.every(w => hay.includes(w));
  });
}

const KIND_ORDER = ['weapon', 'offhand', 'armour', 'hat', 'accessory'];
const SLOT_ORDER = ['weapon', 'offhand', 'head', 'chest', 'hands', 'legs', 'feet', 'cape', 'necklace', 'ring', 'belt', 'light', 'decor', 'face'];
const rank = (list, v) => { const i = list.indexOf(v); return i < 0 ? list.length : i; };
export const SORTS = {
  slot: (a, b) => rank(KIND_ORDER, a.kind) - rank(KIND_ORDER, b.kind) || rank(SLOT_ORDER, a.gameSlot) - rank(SLOT_ORDER, b.gameSlot) || String(a.type).localeCompare(String(b.type)) || a.name.localeCompare(b.name),
  name: (a, b) => a.name.localeCompare(b.name),
  file: (a, b) => String(a.file).localeCompare(String(b.file)) || a.id.localeCompare(b.id),
  new: (a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0) || a.name.localeCompare(b.name),
};

// ---------------------------------------------------------------- deep links
// armory/#id=fh_daggers&hand=both&anim=flurry&race=dwarf      one model, as it should be looked at
// armory/#kind=weapon&type=dagger&new=1                       a filtered grid
const VIEW_DEFAULTS = { hand: '', anim: 'idle', race: 'human', height: 'medium', build: 'medium', hair: 'short', quality: '1', alone: '', wire: '', speed: '1' };

export function parseHash(hash) {
  const p = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const filter = { ...EMPTY_FILTER };
  for (const k of ['q', 'kind', 'slot', 'type', 'archetype', 'game', 'hands']) filter[k] = p.get(k) || '';
  filter.isNew = p.get('new') === '1'; filter.flagged = p.get('flagged') === '1';
  const view = { ...VIEW_DEFAULTS };
  for (const k of Object.keys(VIEW_DEFAULTS)) if (p.has(k)) view[k] = p.get(k);
  return { id: p.get('id') || '', filter, view, sort: p.get('sort') || 'slot' };
}

export function formatHash({ id = '', filter = {}, view = {}, sort = 'slot' } = {}) {
  const p = new URLSearchParams();
  if (id) p.set('id', id);
  for (const k of ['q', 'kind', 'slot', 'type', 'archetype', 'game', 'hands']) if (filter[k]) p.set(k, filter[k]);
  if (filter.isNew) p.set('new', '1');
  if (filter.flagged) p.set('flagged', '1');
  if (sort && sort !== 'slot') p.set('sort', sort);
  if (id) for (const k of Object.keys(VIEW_DEFAULTS)) if (view[k] != null && String(view[k]) !== VIEW_DEFAULTS[k]) p.set(k, view[k]);
  const s = p.toString();
  return s ? '#' + s : '';
}

/** The row a link's `id` means: its page key, else the first row with that part id. */
export function findRow(rows, id) { return rows.find(r => r.key === id) || rows.find(r => r.id === id) || null; }

// ---------------------------------------------------------------- bodies and looks
export const HEIGHTS = { short: 0.1, medium: 0.5, tall: 0.9 };
export const BUILDS = { slim: 0.15, medium: 0.5, broad: 0.9 };
export const HAIR = ['none', 'short', 'long'];
const HAIR_ID = { none: 'bald', short: 'short', long: 'long' };

/** The plain body gear is shown on: shirt, shorts and foot wraps, empty hands. */
export function mannequin({ race = 'human', height = 'medium', build = 'medium', hair = 'short' } = {}) {
  return {
    body: { skin: '#e0b090', race, height: HEIGHTS[height] ?? 0.5, width: BUILDS[build] ?? 0.5, headSize: 0.5 },
    hair: { id: HAIR_ID[hair] || 'short', color: '#4a3020' }, eyes: { id: 'round', color: '#3a2a1a' },
    hat: { id: 'none' }, top: { id: 'tshirt', color: '#cdbf9f' }, bottom: { id: 'shorts', color: '#6b5a44' }, shoes: { id: 'wraps', color: '#8a7a62' },
    cape: { id: 'none' }, decor: { id: 'none' }, accessory: { id: 'none' }, held: { id: 'none' }, offhand: { id: 'none' },
  };
}

/**
 * The body a row is MEASURED against. A piece that replaces clothing (a chest piece replaces the shirt) is
 * compared with different plain clothes, so its own cloth is what counts; headwear is measured on a bald head,
 * because a hat changes how the hair under it is cut and that hair is not part of the hat.
 */
export function baselineFor(row, opts = {}) {
  const a = mannequin({ ...opts, hair: row.slot === 'hat' ? 'none' : (opts.hair || 'short') });
  if (row.slot === 'top' && !row.field && row.id === 'tshirt') a.top = { id: 'tank', color: '#cdbf9f' };
  if (row.slot === 'bottom' && row.id === 'shorts') a.bottom = { id: 'pants', color: '#6b5a44' };
  if (row.slot === 'shoes' && row.id === 'wraps') a.shoes = { id: 'barefoot', color: '#8a7a62' };
  return a;
}

/** Which hand choices make sense for a row. A weapon can always be tried in either hand — that is the point. */
export function handModes(row) {
  if (row.slot === 'held') return ['main', 'off', 'both'];
  if (row.slot === 'offhand') return ['off'];
  return [];
}
export const defaultHand = row => (row.slot === 'held' ? 'main' : row.slot === 'offhand' ? 'off' : '');

/** `{ slot, part }` for a row when the catalog reader has no `lookFor` of its own. */
export function plainLook(row, { color, color2, quality } = {}) {
  const part = { id: row.id, color: color || row.color || DEFAULT_COLOUR[row.slot] || '#a0a0a0' };
  if (color2 || row.color2) part.color2 = color2 || row.color2;
  if (quality != null && (row.slot === 'held' || row.slot === 'offhand')) part.quality = Number(quality);
  return { slot: row.slot, part: row.field ? { [row.field]: part } : part };
}

/**
 * `base` wearing `row`. `hand` puts a weapon in the main hand, the off hand or both. `lookFor` is the catalog
 * reader's own (optional). A row that rides a FIELD of a slot (gloves on `top.gloves`, a ring on
 * `accessory.ring`) is merged into the slot instead of replacing it.
 */
export function dress(base, row, { hand = '', color, color2, quality, lookFor = null } = {}) {
  const a = JSON.parse(JSON.stringify(base));
  const { slot, part } = (lookFor && lookFor(row, { color, color2, quality: quality == null ? undefined : Number(quality) })) || plainLook(row, { color, color2, quality });
  const put = s => { a[s] = row.field ? { ...(a[s] || {}), ...part } : { ...part }; };
  if (slot === 'held') {
    const mode = hand || 'main';
    if (mode === 'main' || mode === 'both') put('held');
    if (mode === 'off' || mode === 'both') put('offhand');
  } else put(slot);
  return a;
}

// ---------------------------------------------------------------- game items
/**
 * The in-game item rows a model is mapped to, with names looked up in the shared item data
 * (prototypes/emberveil/data/items.json — Farhold and Thousandvale both roll from it).
 */
export function itemRows(row, itemData) {
  const bases = { ...(itemData?.weaponBases || {}), ...(itemData?.armorBases || {}) };
  const out = [];
  const add = (game, base, given = {}) => {
    // a new model's item is injected by the game from a TEMPLATE base in the shared file (catalog `items[].template`)
    const own = bases[base], b = own || bases[given.template] || {};
    out.push({
      game, base, template: !own && bases[given.template] ? given.template : null,
      name: given.name || own?.name || (base === row.base ? row.name : title(base)),
      detail: [b.subtype || b.slot || given.type, b.tier, b.twoHanded ? 'two-handed' : '', b.weaponCategory, !own && bases[given.template] ? `built on the "${b.name}" base` : ''].filter(Boolean).join(' · '),
      known: !!(own || bases[given.template]), data: own || bases[given.template] || null,
    });
  };
  for (const it of row.items || []) add(it.game, it.base, it);
  if (row.base && !out.some(o => o.base === row.base)) for (const g of (row.games?.length ? row.games : ['thousandvale'])) add(g, row.base, { name: row.name, type: row.type });
  return out;
}

/** A plain item as Thousandvale's icon code expects one, for the first item mapped to this model. */
export function iconItem(row, itemData, game = 'thousandvale') {
  const rows = itemRows(row, itemData), hit = rows.find(r => r.game === game && r.data) || rows.find(r => r.data);
  if (!hit) return null;
  const item = { ...hit.data, baseKey: hit.base, baseName: hit.name, name: hit.name, rarity: 'normal', slot: hit.data.slot || (hit.data.type === 'weapon' ? 'weapon' : undefined) };
  // an injected item names its model the way the game does (`look.g5`); the template's own old look must not leak in
  if (hit.template) item.look = { g5: row.id };
  return item;
}

// ---------------------------------------------------------------- flags
/** The list handed to Claude: one entry per flagged model, with everything needed to find it. */
export function exportFlags(flags, rows, { page = 'armory/', now = new Date() } = {}) {
  const list = Object.entries(flags || {}).map(([key, f]) => {
    const r = findRow(rows, key);
    return {
      id: r?.id || key, key, name: r?.name || null, kind: r?.kind || null, slot: r?.gameSlot || null, type: r?.type || null, archetype: r?.archetype || null,
      file: r?.file || null, builder: r?.builder || null, note: f.note || '', flagged: f.at || null,
      link: page + formatHash({ id: key, view: f.view || {} }),
    };
  }).sort((a, b) => String(a.file).localeCompare(String(b.file)) || a.id.localeCompare(b.id));
  return { what: 'Armory flags — models the owner wants looked at', exported: now.toISOString(), count: list.length, flags: list };
}

// ---------------------------------------------------------------- formatting
export const cm = m => (m * 100 < 10 ? (m * 100).toFixed(1) : Math.round(m * 100)) + ' cm';
export const metres = m => (m < 1 ? cm(m) : m.toFixed(2) + ' m');
export const sizeText = s => `${metres(s.x)} wide × ${metres(s.y)} tall × ${metres(s.z)} deep`;
