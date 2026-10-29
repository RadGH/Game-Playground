// Stores and pools (PLAN §0.9, M3). PURE.
//
// A store is `ent.store` = { res: units } with a capacity `ent.cap` (all resources together). The HQ and every depot
// have a YARD RING; every building whose centre is inside a ring belongs to that ring's POOL, and rings that overlap
// join into one pool (union-find on distance <= r1 + r2). Inside a pool everything is shared — that is the only place
// goods move without someone carrying them (§0.9). A building with a store that is in no ring (a camp out by its
// outcrop, a pile of salvage) is a pool of its own. Pools are rebuilt only when something with a ring or a store is
// built or removed (`sim.poolsDirty`).
//
// Pool object: { id, members: [store ents, id order], owners: [ring ents], hq: bool, x, y (cells, of the first
// member), doors: [[x, y, entId]] }. `sim.poolOf.get(entId)` → pool for ANY building (store or not) that is in one.

import { SUB } from '../entities.js';

export function storeTotal(e) { let n = 0; for (const k in e.store) n += e.store[k]; return n; }
export function storeSpace(e) { return Math.max(0, e.cap - storeTotal(e)); }

export function createStores(sim) {
  const { ents } = sim;
  let pools = [];
  const poolOf = new Map();
  sim.poolOf = poolOf;
  sim.poolsDirty = true;

  const centre = (e) => [e.x / SUB, e.y / SUB];

  function rebuild() {
    sim.poolsDirty = false;
    pools = [];
    poolOf.clear();
    const owners = ents.list('building').filter((b) => b.built >= 1 && sim.data.B[b.type].ring);
    // union-find over overlapping rings
    const parent = owners.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    for (let i = 0; i < owners.length; i++) {
      const [ax, ay] = centre(owners[i]), ra = sim.data.B[owners[i].type].ring;
      for (let j = i + 1; j < owners.length; j++) {
        const [bx, by] = centre(owners[j]), rb = sim.data.B[owners[j].type].ring;
        const dx = ax - bx, dy = ay - by, rr = ra + rb;
        if (dx * dx + dy * dy <= rr * rr) { const a = find(i), b = find(j); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); }
      }
    }
    const groups = new Map();
    owners.forEach((o, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(o); });
    for (const list of groups.values()) {
      const p = { id: 'p' + list[0].id, members: list.slice(), owners: list.slice(), hq: list.some((o) => o.type === 'hq'), x: list[0].x / SUB, y: list[0].y / SUB };
      pools.push(p);
      for (const o of list) poolOf.set(o.id, p);
    }
    // every other building: inside a ring → that pool; else, if it has a store (or is a pile), a pool of its own
    const inRing = (b) => {
      const [x, y] = centre(b);
      for (const o of owners) {
        const [ox, oy] = centre(o), r = sim.data.B[o.type].ring;
        if ((x - ox) * (x - ox) + (y - oy) * (y - oy) <= r * r) return poolOf.get(o.id);
      }
      return null;
    };
    for (const b of [...ents.list('building'), ...ents.list('pile')]) {
      if (poolOf.has(b.id)) continue;
      const p = b.built >= 1 || b.kind === 'pile' ? inRing(b) : null;
      if (p && b.kind !== 'pile') { poolOf.set(b.id, p); continue; }
      if (b.store && (b.built >= 1 || b.kind === 'pile')) {
        const own = { id: 'p' + b.id, members: [b], owners: [], hq: false, x: b.x / SUB, y: b.y / SUB, own: true, kindPile: b.kind === 'pile' };
        pools.push(own); poolOf.set(b.id, own);
      }
    }
    pools.sort((a, b) => a.members[0].id - b.members[0].id);
    for (const p of pools) p.doors = p.members.map((m) => [m.door[0], m.door[1], m.id]);
    sim.events.push({ e: 'pools', tick: sim.tick, base: sim.base, n: pools.length });
  }

  const S = {
    get pools() { if (sim.poolsDirty) rebuild(); return pools; },
    rebuild,
    poolOf(id) { if (sim.poolsDirty) rebuild(); return poolOf.get(id) || null; },
    hqPool() { return S.pools.find((p) => p.hq) || null; },
    stock(p, r) { let n = 0; for (const m of p.members) n += m.store[r] || 0; return n; },
    space(p) { let n = 0; for (const m of p.members) n += storeSpace(m); return n; },
    cap(p) { let n = 0; for (const m of p.members) n += m.cap; return n; },
    /** Take up to n of r from a pool (members in id order). Returns what was taken. */
    take(p, r, n) {
      let got = 0;
      for (const m of p.members) {
        const have = m.store[r] || 0;
        if (!have) continue;
        const k = Math.min(have, n - got);
        m.store[r] = have - k; if (!m.store[r]) delete m.store[r];
        got += k;
        if (got >= n) break;
      }
      return got;
    },
    /** Put up to n of r into a pool, respecting capacity. Returns what fitted. */
    put(p, r, n) {
      let put = 0;
      for (const m of p.members) {
        const k = Math.min(storeSpace(m), n - put);
        if (k <= 0) continue;
        m.store[r] = (m.store[r] || 0) + k;
        put += k;
        if (put >= n) break;
      }
      return put;
    },
    /** The door of the pool nearest (x, y) (cells): [x, y, memberId]. */
    doorNear(p, x, y) {
      let best = p.doors[0], bd = Infinity;
      for (const d of p.doors) { const dd = (d[0] - x) * (d[0] - x) + (d[1] - y) * (d[1] - y); if (dd < bd) { bd = dd; best = d; } }
      return best;
    },
    /** Everything the base holds, summed over every store (not counting what is being carried). */
    baseStock() {
      const out = {};
      for (const b of [...ents.list('building'), ...ents.list('pile')]) {
        if (!b.store) continue;
        for (const k in b.store) out[k] = (out[k] || 0) + b.store[k];
      }
      return out;
    },
  };
  return S;
}
