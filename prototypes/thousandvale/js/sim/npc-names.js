// NPC NAMES AND TITLES (stream A, play-test 4 S19: "an indicator above the name showing what they are — merchant type,
// barber, skill reset…; names are random/pointless, some just 'Townsfolk'"). Pure.
//
// One place every non-player character passes through when it is spawned (room.spawn): it gets
//   - a TITLE, the line drawn above its name (`info.title`): its shop kind's title (stream E's data/names/titles.json
//     `shops`), else its role's (`roles`), else the trade in its own name ("Cadoc the pedlar" -> "Pedlar"), else `fallback`;
//   - a real NAME when it only had a job for one ("Townsfolk", "Guard", "Smith"…, `placeholders`, or its own role):
//     given + family from data/names/torbor.json, seeded by the NPC's key (or role + where it stands), so the same
//     guard keeps the same name across restarts and copies. Quest NPCs (`npc.id`) are never renamed — quest text names them.
//
//   configureNpcNames({ titles, names })      once per server, from the province's data (both optional)
//   npcIdentity(spec) -> { name, title }       spec = a room.spawn spec ({ name, x, z, data: { npc, key, title? } })

const DEFAULT_TITLES = { shops: {}, roles: {}, placeholders: ['townsfolk', 'villager', 'npc'], fallback: 'Local' };
const DEFAULT_NAMES = { given: { f: ['Maud', 'Tamsin', 'Edda', 'Orla'], m: ['Corwin', 'Aled', 'Tobin', 'Wat'] }, family: ['Ashby', 'Harl', 'Reed', 'Pike'] };
/** Roles whose real name keeps the rank in front ("Sergeant Hollis"), the way a soldier or an official is addressed. */
const RANKS = new Set(['sergeant', 'captain', 'castellan', 'quartermaster', 'reeve', 'elder', 'foreman']);

let T = DEFAULT_TITLES, N = DEFAULT_NAMES, placeholders = new Set(DEFAULT_TITLES.placeholders);

export function configureNpcNames({ titles = null, names = null } = {}) {
  if (titles) { T = { ...DEFAULT_TITLES, ...titles }; placeholders = new Set((T.placeholders || []).map(s => String(s).toLowerCase())); }
  if (names && names.given && names.family) N = names;
}

const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const cap = s => String(s || '').replace(/^\w/, c => c.toUpperCase());

/** Is `name` just a job (or the NPC's own role) rather than a person's name? */
export function isPlaceholderName(name, role = null) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return true;
  if (role && (n === String(role).toLowerCase() || n === String(role).toLowerCase().replace(/-/g, ' '))) return true;
  if (placeholders.has(n)) return true;
  const title = role && T.roles[role] ? String(T.roles[role]).split(' — ')[0].toLowerCase() : null;
  return !!title && n === title;
}

/** A person's name for a nameless NPC, the same every time for the same `seed`. */
export function personName(seed, role = null) {
  const h = hash(String(seed));
  const fam = N.family[(h >>> 9) % N.family.length];
  if (role && RANKS.has(role)) return cap(role) + ' ' + fam;
  const sex = h & 1 ? 'f' : 'm';
  const pool = (N.given && (N.given[sex] || N.given.f)) || DEFAULT_NAMES.given.f;
  return pool[(h >>> 1) % pool.length] + ' ' + fam;
}

/** The trade written into a name: "Cadoc the pedlar" -> "Pedlar", "Nell Pike, eel-catcher" -> "Eel-catcher", "A thin grey dog" -> "Dog". */
function tradeIn(name) {
  const s = String(name || '').trim();
  let m = s.match(/,\s*([a-z][a-z -]+)$/i) || s.match(/\bthe\s+([a-z][a-z-]+)$/);
  if (m) return cap(m[1].trim());
  m = s.match(/^an?\s+.*?([a-z-]+)$/i);
  if (m) return cap(m[1]);
  return null;
}

/** The title above an NPC's name: shop kind, else role, else the trade in its name, else the fallback. Never empty. */
export function titleFor(npc, name, explicit = null) {
  if (explicit) return explicit;
  const n = npc || {};
  if (n.title) return n.title;
  if (n.shop && T.shops[n.shop]) return T.shops[n.shop];
  if (n.role && T.roles[n.role]) return T.roles[n.role];
  return tradeIn(name) || (n.role ? cap(String(n.role).replace(/[-_]/g, ' ')) : null) || T.fallback || 'Local';
}

/** { name, title } for a spawn spec. */
export function npcIdentity(spec) {
  const d = (spec && spec.data) || {};
  const npc = d.npc || (d.folk ? { role: d.folk.role } : null) || {};
  let name = spec.name;
  if (!npc.id && isPlaceholderName(name, npc.role)) {
    const seed = d.key || (d.traveller ? 'tr:' + d.traveller.group + ':' + (spec.name || '') + ':' + Math.round(spec.x || 0) : null) || `${npc.role || 'npc'}:${Math.round((spec.x || 0) * 2)}:${Math.round((spec.z || 0) * 2)}`;
    name = personName(seed, npc.role);
  }
  return { name, title: titleFor(npc, name, d.title || null) };
}
