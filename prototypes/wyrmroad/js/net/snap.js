// Wyrmroad online snapshots. The server packs what changed in a room's brawl since the last snapshot; every browser
// applies it to its "latest" copy (a plain record per hero / foe / prop) and keeps a short history of those copies so
// the mirror (mirror.js) can draw everything ~100 ms behind the server clock, smoothly between two snapshots. The
// socket is ordered and never drops a frame, so a snapshot only carries changes: a foe that did not move is not sent.
// A player who joins or comes back gets one full snapshot first. Pure: the server, the browser and the tests import it.
//
// Positions go over the wire as whole hundredths (q); timers as tenths (d) — a blink timer to 0.1 s is plenty.
// The VIEW STATE fields (docs/ARCH.md) are exactly what these tables carry.

const q = v => (v == null || !Number.isFinite(v) ? 0 : Math.round(v * 100));
const d = v => (v == null || !Number.isFinite(v) ? 0 : Math.round(v * 10));
const r2 = v => Math.round(v * 100) / 100;
const roundDeep = o => {
  if (typeof o === 'number') return Number.isFinite(o) ? r2(o) : 0;
  if (Array.isArray(o)) return o.map(roundDeep);
  if (o && typeof o === 'object') { const out = {}; for (const [k, v] of Object.entries(o)) { if (v instanceof Set || typeof v === 'function') continue; out[k] = roundDeep(v); } return out; }
  return o;
};

// [wire key, property, kind] — q = hundredths, d = tenths, i = whole number, s = text, b = flag, j = JSON (sent when it changes)
export const H_FIELDS = [['p', 'pid', 's'], ['n', 'name', 's'], ['c', 'cls', 's'], ['L', 'level', 'i'], ['X', 'xp', 'i'],
  ['x', 'x', 'q'], ['y', 'y', 'q'], ['z', 'z', 'q'], ['f', 'dir', 'i'], ['s', 'state', 's'], ['a', 'anim', 's'],
  ['h', 'hp', 'i'], ['H', 'max', 'i'], ['m', 'mp', 'i'], ['M', 'mpMax', 'i'], ['l', 'lives', 'i'], ['k', 'pickup', 'j'],
  ['v', 'invT', 'd'], ['B', 'buffs', 'j'], ['S', 'spells', 'j'], ['C', 'cds', 'j'], ['r', 'reviveT', 'd'], ['w', 'downClock', 'd'],
  ['g', 'gold', 'i'], ['G', 'gear', 'j'], ['o', 'look', 'j'], ['t', 'ctrl', 's'], ['K', 'kills', 'i']];
export const F_FIELDS = [['k', 'kind', 's'], ['e', 'side', 's'], ['T', 'team', 'i'], ['n', 'name', 's'], ['b', 'boss', 'b'],
  ['x', 'x', 'q'], ['y', 'y', 'q'], ['z', 'z', 'q'], ['f', 'dir', 'i'], ['s', 'state', 's'], ['a', 'anim', 's'],
  ['h', 'hp', 'i'], ['H', 'max', 'i'], ['v', 'invT', 'd'], ['r', 'freezeT', 'd'], ['u', 'burnT', 'd']];
const PROP_KEYS = ['type', 'x', 'z', 'kind', 'pickup', 'holds', 'amount', 'broken'];
export const POS = new Set(['x', 'y', 'z']);

const enc = (v, k) => k === 'q' ? q(v) : k === 'd' ? d(v) : k === 'i' ? Math.round(v || 0) : k === 'b' ? (v ? 1 : 0) : k === 'j' ? JSON.stringify(v == null ? null : roundDeep(v)) : (v ?? '');
const dec = (v, k) => k === 'q' ? v / 100 : k === 'd' ? v / 10 : k === 'b' ? !!v : k === 'j' ? JSON.parse(v) : k === 's' ? (v === '' ? null : v) : v;
const zoneLook = z => z.def?.look || z.def?.fx || null;

/** A hero's cooldowns to tenths (the HUD's ring), without the spent ones. */
const cdsOf = h => { const o = {}; for (const [k, v] of Object.entries(h.cds || {})) if (v > 0) o[k] = Math.round(v * 10) / 10; return o; };
const buffsOf = (G, h) => (h.buffs || []).map(b => ({ ...b, left: Math.max(0, Math.round((b.until - G.t) * 10) / 10) }));

/** The server's packer for one room's brawl. pack(G) is the shared change list (it remembers what it sent);
 *  pack(G, { full: true }) is everything, for a player arriving now (it does not disturb the change list). */
export function createPacker() {
  const lastH = new Map(), lastF = new Map(), lastP = new Map();
  let lastTop = '';
  function table(list, fields, last, full, view) {
    const out = [], seen = new Set();
    for (const e of list) {
      seen.add(e.id);
      const src = view ? view(e) : e;
      const rec = fields.map(([, p, k]) => enc(src[p], k));
      const prev = full ? null : last.get(e.id);
      const r = { i: e.id };
      if (!prev) fields.forEach(([w], j) => { r[w] = rec[j]; });
      else { let n = 0; fields.forEach(([w], j) => { if (rec[j] !== prev[j]) { r[w] = rec[j]; n++; } }); if (!n) continue; }
      if (!full) last.set(e.id, rec);
      out.push(r);
    }
    if (!full) for (const id of [...last.keys()]) if (!seen.has(id)) { out.push({ i: id, gone: 1 }); last.delete(id); }
    return out;
  }
  return {
    pack(G, { full = false, step = 0 } = {}) {
      const out = { k: step, cx: q(G.camX), qk: d(G.quakeT) };
      const top = JSON.stringify([G.phase, G.secI, G.over, G.outcome, G.ch.id]);
      if (full || top !== lastTop) { out.top = top; if (!full) lastTop = top; }
      const H = table(G.heroes, H_FIELDS, lastH, full, h => ({ ...h, cds: cdsOf(h), buffs: buffsOf(G, h) }));
      if (H.length) out.h = H;
      const F = table(G.foes, F_FIELDS, lastF, full);
      if (F.length) out.f = F;
      // props: few, rarely change — whole when they change
      const P = [], seenP = new Set();
      for (const p of G.props) {
        seenP.add(p.id);
        const o = {}; for (const k of PROP_KEYS) if (p[k] != null) o[k] = typeof p[k] === 'number' ? r2(p[k]) : p[k];
        const js = JSON.stringify(o);
        if (full || lastP.get(p.id) !== js) { P.push({ i: p.id, ...o }); if (!full) lastP.set(p.id, js); }
      }
      if (!full) for (const id of [...lastP.keys()]) if (!seenP.has(id)) { P.push({ i: id, gone: 1 }); lastP.delete(id); }
      if (P.length) out.p = P;
      // shots and zones: every one, each time (they live a few seconds at most)
      if (G.shots.length) out.s = G.shots.map(s => [s.id, q(s.x), q(s.y), q(s.z), s.dir, s.look || '', s.team]);
      if (G.zones.length) out.z = G.zones.map(z => [z.id, z.kind, q(z.x), q(z.z), q(z.r), q(z.t), q(z.delay || 0), z.team, q(z.life || 0), zoneLook(z) || '']);
      if (full) out.full = 1;
      return out;
    },
  };
}
/** Every event of a step, numbers rounded and object references left out (they only drive effects, sounds and the HUD). */
export const packEvents = evs => evs.map(roundDeep);

/** The browser's latest copy of the brawl (plain records by id), which snapshots are applied to. */
export function createLatest() {
  return { k: 0, camX: 0, quakeT: 0, phase: 'walk', secI: 0, over: false, outcome: null, chId: null, heroes: new Map(), foes: new Map(), props: new Map(), shots: [], zones: [] };
}
function applyTable(map, rows, fields, full) {
  if (full) { const ids = new Set((rows || []).map(r => r.i)); for (const id of [...map.keys()]) if (!ids.has(id)) map.delete(id); }
  for (const r of rows || []) {
    if (r.gone) { map.delete(r.i); continue; }
    let e = map.get(r.i); if (!e) { e = { id: r.i }; map.set(r.i, e); }
    for (const [w, p, k] of fields) if (w in r) e[p] = dec(r[w], k);
  }
}
/** Apply one snapshot to the latest copy L. */
export function applySnap(L, snap) {
  L.k = snap.k; L.camX = snap.cx / 100; L.quakeT = snap.qk / 10;
  if (snap.top) { const [phase, secI, over, outcome, chId] = JSON.parse(snap.top); Object.assign(L, { phase, secI, over, outcome, chId }); }
  applyTable(L.heroes, snap.h, H_FIELDS, snap.full);
  applyTable(L.foes, snap.f, F_FIELDS, snap.full);
  if (snap.full) { const ids = new Set((snap.p || []).map(r => r.i)); for (const id of [...L.props.keys()]) if (!ids.has(id)) L.props.delete(id); }
  for (const r of snap.p || []) { if (r.gone) { L.props.delete(r.i); continue; } const { i, ...o } = r; L.props.set(i, { id: i, ...o }); }
  L.shots = (snap.s || []).map(([id, x, y, z, dir, look, team]) => ({ id, x: x / 100, y: y / 100, z: z / 100, dir, look: look || null, team }));
  L.zones = (snap.z || []).map(([id, kind, x, z, r, t, delay, team, life, look]) => ({ id, kind, x: x / 100, z: z / 100, r: r / 100, t: t / 100, delay: delay / 100, team, life: life / 100, look: look || null }));
  return L;
}
/** A frozen copy of the latest state at server step k (what the mirror interpolates between). */
export function frameOf(L) {
  const cp = m => { const o = new Map(); for (const [id, e] of m) o.set(id, { ...e }); return o; };
  return { k: L.k, camX: L.camX, quakeT: L.quakeT, phase: L.phase, secI: L.secI, over: L.over, outcome: L.outcome, chId: L.chId,
    heroes: cp(L.heroes), foes: cp(L.foes), props: cp(L.props), shots: new Map(L.shots.map(s => [s.id, s])), zones: new Map(L.zones.map(z => [z.id, z])) };
}
