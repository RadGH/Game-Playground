// Knockabout online: the match snapshot as a small BINARY frame (server -> every device in the room, 30 a second).
//
// Why binary: the sim's snapshot is ~3 KB of JSON with 8 fighters (key names repeated per fighter). Sent 30 times a
// second that is ~90 KB/s per device. Packed like this it is ~0.6-0.8 KB: about a quarter, with no compression cost
// on the server. Values keep the sim's own rounding (positions to 1 cm, rotations to 0.001), so the renderer sees the
// same numbers it would see in couch play.
//
// The layout is fixed for everything the sim sends today, and anything it ADDS later still arrives: unknown fighter
// keys, unknown prop keys, odd grip refs and any change in the prop / hazard lists ride in a JSON tail at the end of
// the frame. tests/net-pack.test.js packs real matches and checks unpack(pack(snap)) equals the snapshot, so a sim
// change that this file does not understand shows up there, not as a silent glitch online.
//
//   const P = createPacker(firstSnapshot)      // server, once per match: remembers the prop / hazard order (the layout)
//   P.layout                                   // sent to the clients in the 'start' message
//   P.pack(snap, tick, events) -> Uint8Array
//   unpack(bytes, layout) -> { tick, snap, events }      // browser (and tests)
//
// Frame: header (16 bytes) · fighters (61 bytes each) · props (14 bytes each) · hazards (1 + 4n bytes each) · JSON tail.

const MAGIC = 0x4b, VERSION = 1;
const OUT = [null, 'ring', 'spikes', 'fire', 'crush'];
const KNOWN_F = new Set(['pid', 'team', 'bot', 'alive', 'down', 'downs', 'out', 'torso', 'head', 'hands', 'feet', 'grip', 'raise', 'face', 'daze', 'punch', 'held', 'goon']);
const KNOWN_P = new Set(['id', 'kind', 'p']);
const FBYTES = 61;
const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null, dec = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
const i16 = v => Math.max(-32767, Math.min(32767, Math.round(v)));
const u8 = v => Math.max(0, Math.min(255, Math.round(v)));
const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;

/** The prop + hazard order of a match (taken from its first snapshot). Plain JSON: it travels in 'start'. */
export function layoutOf(snap) {
  return { props: (snap.props || []).map(p => [p.id, p.kind]), hazards: (snap.hazards || []).map(h => h.id) };
}
const sameIds = (list, ids, key) => list.length === ids.length && list.every((x, i) => String(x[key]) === String(key === 'id' && Array.isArray(ids[i]) ? ids[i][0] : ids[i]));

export function createPacker(first) {
  const layout = layoutOf(first);
  const propIndex = new Map(layout.props.map(([id], i) => [String(id), i]));
  let buf = new ArrayBuffer(4096);
  function grip(ref, tail, pid, hand) {
    if (ref == null) return 0;
    if (ref === 'w') return 1;
    const s = String(ref);
    if (s.startsWith('f:') && /^\d+$/.test(s.slice(2)) && +s.slice(2) < 0x4000) return 0x8000 | +s.slice(2);
    if (s.startsWith('p:') && propIndex.has(s.slice(2))) return 0x4000 | propIndex.get(s.slice(2));
    (tail.g ||= {})[pid + ':' + hand] = ref; return 0xffff;
  }
  function pack(snap, tick = 0, events = null) {
    const F = snap.fighters || [], Pr = snap.props || [], H = snap.hazards || [];
    const propsFit = sameIds(Pr, layout.props, 'id') && Pr.length < 255, hazFit = sameIds(H, layout.hazards, 'id') && H.length < 255;
    const tail = { m: { phase: snap.phase, round: snap.round, rounds: snap.rounds } };
    for (const k of Object.keys(snap)) if (!['t', 'timeLeft', 'fighters', 'props', 'hazards', 'events', 'phase', 'round', 'rounds'].includes(k)) tail.m[k] = snap[k];
    if (events && events.length) tail.e = events;
    if (!propsFit) tail.props = Pr;
    if (!hazFit) tail.hazards = H;
    let hazBytes = 0;
    if (hazFit) for (const h of H) hazBytes += 1 + (Array.isArray(h.s) ? h.s.length : 1) * 4;
    const nF = Math.min(F.length, 255);
    const fixed = 16 + nF * FBYTES + (propsFit ? Pr.length * 14 : 0) + hazBytes;
    // fighters first (they may add to the tail), then the tail is encoded
    if (buf.byteLength < fixed + 64) buf = new ArrayBuffer((fixed + 64) * 2);
    let dv = new DataView(buf), o = 16;
    for (let i = 0; i < nF; i++) {
      const f = F[i];
      dv.setUint16(o, f.pid & 0xffff, true); o += 2;
      dv.setUint8(o++, Number.isInteger(f.team) && f.team >= 0 && f.team < 255 ? f.team : 255);
      dv.setUint8(o++, (f.bot ? 1 : 0) | (f.alive ? 2 : 0) | (f.held ? 4 : 0) | (f.goon ? 8 : 0) | (f.punch?.[0] ? 16 : 0) | (f.punch?.[1] ? 32 : 0));
      dv.setUint16(o, Math.max(0, Math.min(65535, Math.round((f.down || 0) * 100))), true); o += 2;
      dv.setUint8(o++, u8(f.downs || 0));
      const oc = OUT.indexOf(f.out ?? null); dv.setUint8(o++, oc >= 0 ? oc : 255); if (oc < 0) (tail.o ||= {})[f.pid] = f.out;
      dv.setUint16(o, grip(f.grip?.[0], tail, f.pid, 0), true); o += 2;
      dv.setUint16(o, grip(f.grip?.[1], tail, f.pid, 1), true); o += 2;
      const T = f.torso || [0, 0, 0, 0, 0, 0, 1];
      for (let k = 0; k < 3; k++) { dv.setInt16(o, i16(T[k] * 100), true); o += 2; }
      for (let k = 3; k < 7; k++) { dv.setInt16(o, i16(T[k] * 32000), true); o += 2; }
      const pts = [f.head || T.slice(0, 3), f.hands?.[0] || T, f.hands?.[1] || T, f.feet?.[0] || T, f.feet?.[1] || T];
      for (const p of pts) for (let k = 0; k < 3; k++) { dv.setInt16(o, i16(p[k] * 100), true); o += 2; }
      dv.setUint8(o++, u8((f.raise?.[0] || 0) * 200)); dv.setUint8(o++, u8((f.raise?.[1] || 0) * 200));
      dv.setInt16(o, i16((f.face || 0) * 10000), true); o += 2;
      dv.setUint8(o++, u8((f.daze || 0) * 200));
      dv.setUint8(o++, f.head ? 0 : 1);           // 1 = this fighter had no head/hands/feet (a stand-in sim): drop them again
      let extra = null;
      for (const k of Object.keys(f)) if (!KNOWN_F.has(k) && f[k] !== undefined) (extra ||= {})[k] = f[k];
      if (extra) (tail.f ||= {})[f.pid] = extra;
    }
    if (propsFit) for (const p of Pr) {
      const q = p.p || [0, 0, 0, 0, 0, 0, 1];
      for (let k = 0; k < 3; k++) { dv.setInt16(o, i16(q[k] * 100), true); o += 2; }
      for (let k = 3; k < 7; k++) { dv.setInt16(o, i16(q[k] * 32000), true); o += 2; }
      let extra = null;
      for (const k of Object.keys(p)) if (!KNOWN_P.has(k) && p[k] !== undefined) (extra ||= {})[k] = p[k];
      if (extra) (tail.px ||= {})[p.id] = extra;
    }
    if (hazFit) for (const h of H) {
      if (Array.isArray(h.s)) { dv.setUint8(o++, h.s.length); for (const v of h.s) { dv.setFloat32(o, +v || 0, true); o += 4; } }
      else { dv.setUint8(o++, 255); dv.setFloat32(o, +h.s || 0, true); o += 4; }
    }
    const tailBytes = enc.encode(JSON.stringify(tail));
    if (buf.byteLength < o + tailBytes.length) { const nb = new ArrayBuffer((o + tailBytes.length) * 2); new Uint8Array(nb).set(new Uint8Array(buf, 0, o)); buf = nb; dv = new DataView(buf); }
    dv.setUint8(0, MAGIC); dv.setUint8(1, VERSION);
    dv.setUint32(2, tick >>> 0, true);
    dv.setFloat32(6, snap.t || 0, true);
    dv.setFloat32(10, Number.isFinite(snap.timeLeft) ? snap.timeLeft : NaN, true);
    dv.setUint8(14, nF);
    dv.setUint8(15, (propsFit ? 1 : 0) | (hazFit ? 2 : 0));
    new Uint8Array(buf, o, tailBytes.length).set(tailBytes);
    return new Uint8Array(buf.slice(0, o + tailBytes.length));
  }
  return { layout, pack };
}

/** bytes: ArrayBuffer | Uint8Array. Returns null for a frame that is not a snapshot. */
export function unpack(bytes, layout) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u.length < 16 || u[0] !== MAGIC || u[1] !== VERSION) return null;
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const tick = dv.getUint32(2, true), t = r2(dv.getFloat32(6, true)), tl = dv.getFloat32(10, true), nF = dv.getUint8(14), fl = dv.getUint8(15);
  const propsFit = !!(fl & 1), hazFit = !!(fl & 2);
  let o = 16;
  const raw = [];
  for (let i = 0; i < nF; i++) {
    const f = { pid: dv.getUint16(o, true) }; o += 2;
    const team = dv.getUint8(o++); f.team = team === 255 ? null : team;
    const b = dv.getUint8(o++);
    f.bot = !!(b & 1); f.alive = !!(b & 2);
    f.down = dv.getUint16(o, true) / 100; o += 2;
    f.downs = dv.getUint8(o++);
    const oc = dv.getUint8(o++);
    const g0 = dv.getUint16(o, true), g1 = dv.getUint16(o + 2, true); o += 4;
    const T = []; for (let k = 0; k < 3; k++) { T.push(dv.getInt16(o, true) / 100); o += 2; } for (let k = 0; k < 4; k++) { T.push(r3(dv.getInt16(o, true) / 32000)); o += 2; }
    const pts = []; for (let j = 0; j < 5; j++) { const p = []; for (let k = 0; k < 3; k++) { p.push(dv.getInt16(o, true) / 100); o += 2; } pts.push(p); }
    const raise = [r2(dv.getUint8(o++) / 200), r2(dv.getUint8(o++) / 200)];
    const face = r2(dv.getInt16(o, true) / 10000); o += 2;
    const daze = r2(dv.getUint8(o++) / 200);
    const noBody = dv.getUint8(o++) === 1;
    raw.push({ f, b, oc, g: [g0, g1], T, pts, raise, face, daze, noBody });
  }
  const props = [];
  if (propsFit) for (const [id, kind] of layout?.props || []) {
    const q = []; for (let k = 0; k < 3; k++) { q.push(dv.getInt16(o, true) / 100); o += 2; } for (let k = 0; k < 4; k++) { q.push(r3(dv.getInt16(o, true) / 32000)); o += 2; }
    props.push({ id, kind, p: q });
  }
  const hazards = [];
  if (hazFit) for (const id of layout?.hazards || []) {
    const n = dv.getUint8(o++);
    if (n === 255) { hazards.push({ id, s: f32r(dv.getFloat32(o, true)) }); o += 4; }
    else { const s = []; for (let k = 0; k < n; k++) { s.push(f32r(dv.getFloat32(o, true))); o += 4; } hazards.push({ id, s }); }
  }
  let tail = {};
  if (o < u.length) { try { tail = JSON.parse(dec.decode(u.subarray(o))); } catch { tail = {}; } }
  const propIds = (layout?.props || []).map(p => p[0]);
  const gref = (g, pid, hand) => g === 0 ? null : g === 1 ? 'w' : g === 0xffff ? tail.g?.[pid + ':' + hand] ?? null : g & 0x8000 ? 'f:' + (g & 0x3fff) : g & 0x4000 ? 'p:' + propIds[g & 0x3fff] : null;
  const fighters = raw.map(({ f, b, oc, g, T, pts, raise, face, daze, noBody }) => {
    const out = { pid: f.pid, team: f.team, bot: f.bot, alive: f.alive, down: f.down, downs: f.downs, out: oc === 255 ? tail.o?.[f.pid] ?? null : OUT[oc] ?? null, torso: T };
    if (!noBody) { out.head = pts[0]; out.hands = [pts[1], pts[2]]; out.feet = [pts[3], pts[4]]; }
    out.grip = [gref(g[0], f.pid, 0), gref(g[1], f.pid, 1)];
    out.raise = raise; out.face = face; out.daze = daze;
    out.punch = [b & 16 ? 1 : 0, b & 32 ? 1 : 0];
    out.held = b & 4 ? 1 : 0;
    if (b & 8) out.goon = true;
    if (tail.f?.[f.pid]) Object.assign(out, tail.f[f.pid]);
    return out;
  });
  if (tail.px) for (const p of props) if (tail.px[p.id]) Object.assign(p, tail.px[p.id]);
  const snap = { t, ...(tail.m || {}), fighters, props: propsFit ? props : tail.props || [], hazards: hazFit ? hazards : tail.hazards || [], events: [] };
  if (Number.isFinite(tl)) snap.timeLeft = r2(tl);
  return { tick, snap, events: tail.e || [] };
}
// float32 -> the short decimal it most likely was (the sim rounds hazard states to a few places)
function f32r(v) { const s = Math.round(v * 1e4) / 1e4; return Math.abs(s - v) < 1e-5 ? s : v; }
