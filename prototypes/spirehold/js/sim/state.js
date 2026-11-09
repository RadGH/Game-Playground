// Spirehold — the save: a new game, founding a new realm, save/load, export/import.
// Pure apart from the storage object passed in (localStorage in the browser, a Map-like in tests).

import { NAME_PARTS, REALMS, LEGACY, RESEARCH } from './data.js';
import { rng, hash } from './rand.js';
import { touch, bon, wallMax } from './rules.js';

export const SAVE_KEY = 'spirehold.save';
export const SAVE_VERSION = 1;

export function newGame({ seed = 1, now = Date.now(), name = null, realm = 'greenvale', legacy = {}, relics = {}, crowns = 0, founded = 0, keep = {} } = {}) {
  const r = rng(hash('city', seed));
  const G = {
    v: SAVE_VERSION, seed, name: name || r.pick(NAME_PARTS.city), realm, founded, crowns, legacy: { ...legacy }, relics: { ...relics },
    createdAt: now, lastSeen: now, playTime: 0, realmTime: 0,
    gold: 50, lore: 0, shards: keep.shards || 0,
    totals: { gold: 0, lore: 0, kills: 0, bosses: 0, quests: 0, questsWon: 0, spells: 0, waves: 0, ...(keep.totals || {}) },
    city: { level: 1, xp: 0, pop: 12, landmarks: {} },
    wall: { lvl: 1, hp: 0 },
    wave: { n: 1, best: 1, auto: true, falls: 0 },
    towers: [{ slot: 0, type: 'archer', lvl: 1, br: [null, null], kills: 0, dmg: 0 }],
    mages: [], mageSeq: 0,
    mana: 50, spells: { cd: {}, auto: {} },
    research: {},
    guild: { roster: keep.roster || [], visitors: [], board: [], active: [], log: [], nextVisitAt: now + 45_000, boardAt: now, seq: keep.advSeq || 0, fallen: keep.fallen || [] },
    rates: { gold: 0, lore: 0, xp: 0, kills: 0 },
    deeds: keep.deeds || {},
    news: [],
  };
  // Kept Notes: a share of research ranks carries into each new realm.
  if (keep.research) {
    const per = LEGACY.find(l => l.id === 'lg_keep').fx['keepLore'];
    const k = Math.min(0.5, (legacy.lg_keep || 0) * per);
    for (const rr of RESEARCH) { const v = keep.research[rr.id] || 0; const kept = rr.max === 1 ? (k > 0 && v ? 1 : 0) : Math.floor(v * k); if (kept) G.research[rr.id] = kept; }
  }
  touch(G);
  // Head Start: begin further in with the gold you would have earned getting there.
  const skip = Math.round(bon(G, 'startWave'));
  if (skip) { G.wave.n = 1 + skip; G.wave.best = G.wave.n; G.gold += Math.round(200 * Math.pow(1.25, skip / 2)); }
  G.wall.hp = wallMax(G);
  return G;
}

/** Found a new realm: everything resets except relics, legacy, crowns, shards, the guild roster and lifetime totals. */
export function foundRealm(G, { realm, crowns, seed, now = Date.now() }) {
  const roster = G.guild.roster.filter(a => !a.dead).map(a => ({ ...a, injuredUntil: 0, busy: null }));
  const N = newGame({
    seed, now, realm, legacy: G.legacy, relics: G.relics, crowns: G.crowns + crowns, founded: G.founded + 1,
    keep: { roster, shards: G.shards, totals: G.totals, research: G.research, advSeq: G.guild.seq, fallen: G.guild.fallen, deeds: G.deeds },
  });
  N.playTime = G.playTime; N.bestEver = Math.max(G.bestEver || 0, G.wave.best);
  N.realmsSeen = [...new Set([...(G.realmsSeen || [G.realm]), realm])];
  N.guild.log = [{ at: now, text: `The founders of ${G.name} set out for ${REALMS[realm].name}.` }];
  return N;
}

/** Remove runtime-only fields before writing. */
export function serialize(G) { return JSON.stringify(G); }
export function deserialize(text) {
  const G = JSON.parse(text);
  if (!G || typeof G !== 'object' || !G.city || !G.wave) throw new Error('not a Spirehold save');
  // fill anything a newer version added
  const d = newGame({ seed: G.seed || 1, now: G.lastSeen || Date.now() });
  for (const k of Object.keys(d)) if (G[k] === undefined) G[k] = d[k];
  for (const k of ['totals', 'city', 'wall', 'wave', 'guild', 'spells', 'rates']) G[k] = { ...d[k], ...G[k] };
  G.v = SAVE_VERSION; touch(G);
  return G;
}
export function save(G, store, key = SAVE_KEY) {
  try { const s = serialize(G); store.setItem(key, s); store.setItem(key + '.bak.' + (Math.floor(Date.now() / 600000) % 3), s); return true; } catch { return false; }
}
export function load(store, key = SAVE_KEY) {
  try { const s = store.getItem(key); return s ? deserialize(s) : null; } catch { return null; }
}
/** Text the player can copy somewhere safe. */
export const exportText = G => 'SPH1:' + btoa(unescape(encodeURIComponent(serialize(G))));
export function importText(text) {
  const t = String(text || '').trim();
  const body = t.startsWith('SPH1:') ? decodeURIComponent(escape(atob(t.slice(5)))) : t;
  return deserialize(body);
}
export { LEGACY };
