// Saves (canon v2 §13, docs/10 §7): localStorage through shared/store.js, 3 slots + 1 backup each, a
// profile, size budgets (slot <= 64 KB). Prefab state persists, raw cells do not. Pure except for the
// injected store (so Node tests pass a Map-backed store).
export const SCHEMA = 1;
export const SLOT_BUDGET = 64 * 1024;
export const MIGRATIONS = []; // { from, to, up(save) }

export function migrate(save) {
  let s = structuredClone(save);
  while ((s.schema ?? 1) < SCHEMA) { const m = MIGRATIONS.find(m => m.from === s.schema); if (!m) throw new Error(`No migration from schema ${s.schema}`); s = m.up(s); s.schema = m.to; }
  if (s.schema > SCHEMA) throw new Error('This save is from a newer build.');
  return s;
}

/** Build the slot JSON from the live game (called at lamp-posts, Great Lamps, hub entry, shops). */
export function snapshot(game, extra = {}) {
  const h = game.hero;
  return {
    schema: SCHEMA, game: 'lanternfall', slot: game.slot ?? 1, updated: new Date().toISOString(), playtime: Math.round((game.playtime || 0) * 10) / 10,
    mode: game.mode, seed: game.seed, difficulty: game.difficultyId || 'lamplighter', ironWick: !!game.ironWick,
    hero: { ...h, stats: undefined },
    world: { act: game.act || 'act1', room: game.room?.room?.id, entry: game.lastEntry, lampPost: game.lampPost || null, lampsLit: Object.keys(game.flags).filter(k => k.startsWith('lamp_') && game.flags[k]), roomState: game.roomState || {}, fog: game.fog || {}, purse: game.purse || null, visitedRooms: Object.keys(game.visited || {}) }, // act maps are rebuilt from the seed, never saved (they were ~31 KB)
    bestiary: game.bestiary || {},
    story: { flags: game.flags, kindling: h.kindling || {}, npcs: game.npcState || {} },
    stats: game.stats || {},
    ledger: game.meter?.toJSON ? trimLedger(game.meter.toJSON()) : null,
    rng: { loot: game.rng.loot.state(), spell: game.rng.spell.state(), talk: game.rng.talk.state() },
    ...extra,
  };
}
function trimLedger(j) { if (j?.fights?.length > 50) j.fights = j.fights.slice(-50); return j; }

export function createSaves(store) {
  const S = {
    list() { return [1, 2, 3].map(n => { const s = safeParse(store.get(`slot${n}`)); return s ? { slot: n, name: s.hero?.name, class: s.hero?.class, level: s.hero?.level, act: s.world?.act, room: s.world?.room, playtime: s.playtime, updated: s.updated, difficulty: s.difficulty, lampsLit: (s.world?.lampsLit || []).length, deaths: s.stats?.deaths || 0 } : { slot: n, empty: true }; }); },
    write(n, save) {
      let json = JSON.stringify(save);
      if (json.length > SLOT_BUDGET && save.ledger) { save.ledger.fights = (save.ledger.fights || []).slice(-10); json = JSON.stringify(save); }
      if (json.length > SLOT_BUDGET) { save.ledger = null; json = JSON.stringify(save); }
      if (json.length > SLOT_BUDGET) return { ok: false, reason: `Save is ${Math.round(json.length / 1024)} KB, over the ${SLOT_BUDGET / 1024} KB budget.` };
      const prev = store.get(`slot${n}`); if (prev) store.set(`slot${n}.bak`, prev);
      const ok = store.set(`slot${n}`, json); if (ok === false) return { ok: false, reason: 'The browser refused to store the save (storage full?).' };
      return safeParse(store.get(`slot${n}`)) ? { ok: true, bytes: json.length } : { ok: false, reason: 'Save could not be read back.' };
    },
    load(n) { const raw = store.get(`slot${n}`); let s = safeParse(raw); if (!s) { s = safeParse(store.get(`slot${n}.bak`)); if (!s) return null; s._fromBackup = true; } return migrate(s); },
    remove(n) { store.remove?.(`slot${n}`); store.remove?.(`slot${n}.bak`); },
    profile() { return safeParse(store.get('profile')) || { schema: 1, marks: 0, classes: ['lamplighter', 'sluicewarden', 'tinker'], trials: {}, challenges: {}, modes: ['campaign'], stats: {}, tutorialsSeen: [], codex: {}, bests: {} }; },
    saveProfile(p) { return store.set('profile', JSON.stringify(p)); },
  };
  return S;
}
function safeParse(v) { if (v == null) return null; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch { return null; } }
