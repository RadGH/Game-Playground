// The entity store (PLAN §3.2). PURE.
//
// Every entity is a plain JSON-safe object keyed by an integer `id` that is never reused in a game. Common fields:
// { id, kind, type, base, x, y, hp, hpMax, team } with x, y as INTEGERS in 1/256 of a cell (team 0 = player, 1 = wild).
// Iteration is always in id order (§4.3), so `list(kind)` keeps each kind's array sorted by creation.

export const SUB = 256; // position units per cell

export function createEntities(nextId = 1) {
  const byId = new Map();
  const byKind = new Map();
  let next = nextId;
  const store = {
    /** Add an entity of `kind` with `fields`; returns it (with its new id). */
    add(kind, fields = {}) {
      const e = { id: next++, kind, type: fields.type ?? kind, base: 'home', x: 0, y: 0, hp: 1, hpMax: 1, team: 0, ...fields };
      e.kind = kind;
      byId.set(e.id, e);
      if (!byKind.has(kind)) byKind.set(kind, []);
      byKind.get(kind).push(e);
      return e;
    },
    remove(id) {
      const e = byId.get(id);
      if (!e) return null;
      byId.delete(id);
      const arr = byKind.get(e.kind);
      const i = arr.indexOf(e);
      if (i >= 0) arr.splice(i, 1);
      e.removed = true;
      return e;
    },
    get: (id) => byId.get(id),
    /** All entities of a kind, in id order (do not mutate the array). */
    list: (kind) => byKind.get(kind) || [],
    /** Every entity in id order. */
    all() { return [...byId.values()].sort((a, b) => a.id - b.id); },
    get size() { return byId.size; },
    get nextId() { return next; },
  };
  return store;
}

/** Cell position of an entity (floats). */
export const cellX = (e) => e.x / SUB;
export const cellY = (e) => e.y / SUB;
