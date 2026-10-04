// Binary snapshots (docs/protocol.md §4). Pure; shared by the server sim (encode) and the client (decode).
//
// Server side: each AOI cell encodes its records ONCE per send tick (encodeRecord into a ByteWriter);
// a client's frame is a small header + the concatenation of its cells' record bytes (encodeClientSnap).
// Client side: decodeSnap(bytes, q) -> plain object.

import { F, SNAP_VERSION, KIND, ANIM_ID, NO_TARGET } from './protocol.js';

const TAU = Math.PI * 2;

/** A little-endian byte writer that grows. */
export class ByteWriter {
  constructor(cap = 256) { this.buf = new Uint8Array(cap); this.dv = new DataView(this.buf.buffer); this.n = 0; }
  need(k) {
    if (this.n + k <= this.buf.length) return;
    let cap = this.buf.length * 2; while (cap < this.n + k) cap *= 2;
    const nb = new Uint8Array(cap); nb.set(this.buf.subarray(0, this.n));
    this.buf = nb; this.dv = new DataView(nb.buffer);
  }
  u8(v) { this.need(1); this.dv.setUint8(this.n, v); this.n += 1; }
  u16(v) { this.need(2); this.dv.setUint16(this.n, v, true); this.n += 2; }
  i16(v) { this.need(2); this.dv.setInt16(this.n, v, true); this.n += 2; }
  u32(v) { this.need(4); this.dv.setUint32(this.n, v >>> 0, true); this.n += 4; }
  f32(v) { this.need(4); this.dv.setFloat32(this.n, v, true); this.n += 4; }
  bytes(b) { this.need(b.length); this.buf.set(b, this.n); this.n += b.length; }
  reset() { this.n = 0; }
  /** A copy of what was written. */
  out() { return this.buf.slice(0, this.n); }
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** Quantisers (exported so the server can compare "did the wire value change"). */
export const qPos = (m, q) => clamp(Math.round(m / q), 0, 0xFFFF);
export const qY = m => clamp(Math.round(m * 16), -32768, 32767);
export const qYaw = r => ((Math.round(((r % TAU) + TAU) % TAU / TAU * 256)) & 255);
export const qHp = (hp, max) => (max > 0 ? clamp(Math.round(hp / max * 65535), 0, 65535) : 0);

/**
 * Write one entity record. `mask` = F bits to include (F.FULL forces all fields).
 * The entity must expose: id, kind (name), x, y, z, yaw, hp, hpMax, animId, animSeq, state, target.
 */
export function encodeRecord(w, e, mask, q, ox = 0, oz = 0) {
  if (mask & F.FULL) mask = 0xFF;
  w.u16(e.id);
  w.u8(mask);
  if (mask & F.FULL) w.u8(KIND[e.kind] || 0);
  if (mask & F.POS) { w.u16(qPos(e.x - ox, q)); w.u16(qPos(e.z - oz, q)); }
  if (mask & F.Y) w.i16(qY(e.y));
  if (mask & F.YAW) w.u8(qYaw(e.yaw));
  if (mask & F.HP) w.u16(qHp(e.hp, e.hpMax));
  if (mask & F.ANIM) { w.u8(e.animId & 255); w.u8(e.animSeq & 255); }
  if (mask & F.STATE) w.u8(e.state & 255);
  if (mask & F.TARGET) w.u16(e.target ? e.target : NO_TARGET);
}

/**
 * One client's frame. chunks = array of Uint8Array record runs (its cells' buffers).
 * self = {x,y,z,vy} | null, vitals = {hp,hpMax,mp,mpMax} | null, left = [ids].
 */
export function encodeClientSnap({ tick, ack = 0, self = null, vitals = null, dead = false, left = [], chunks = [] }, w = new ByteWriter(512)) {
  w.reset();
  w.u8(1); w.u8(SNAP_VERSION);
  w.u32(tick); w.u32(ack);
  w.u8((self ? 1 : 0) | (vitals ? 2 : 0) | (dead ? 4 : 0));
  if (self) { w.f32(self.x); w.f32(self.y); w.f32(self.z); w.f32(self.vy || 0); }
  if (vitals) { w.u32(Math.max(0, Math.round(vitals.hp))); w.u32(Math.round(vitals.hpMax)); w.u32(Math.max(0, Math.round(vitals.mp))); w.u32(Math.round(vitals.mpMax)); }
  const nLeft = Math.min(left.length, 0xFFFF);
  w.u16(nLeft);
  for (let i = 0; i < nLeft; i++) w.u16(left[i]);
  for (const c of chunks) w.bytes(c);
  return w.out();
}

const KIND_BY_ID = Object.fromEntries(Object.entries(KIND).map(([k, v]) => [v, k]));
const ANIM_BY_ID = Object.fromEntries(Object.entries(ANIM_ID).map(([k, v]) => [v, k]));

/** Decode a snapshot frame. q = joined.room.q, origin = joined.room.origin (positions are sent relative to it). Throws on a malformed frame. */
export function decodeSnap(bytes, q, origin = null) {
  const ox = origin ? origin.x : 0, oz = origin ? origin.z : 0;
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 0;
  const need = k => { if (o + k > b.byteLength) throw new Error('snapshot: short frame'); };
  const u8 = () => { need(1); return dv.getUint8(o++); };
  const u16 = () => { need(2); const v = dv.getUint16(o, true); o += 2; return v; };
  const i16 = () => { need(2); const v = dv.getInt16(o, true); o += 2; return v; };
  const u32 = () => { need(4); const v = dv.getUint32(o, true); o += 4; return v; };
  const f32 = () => { need(4); const v = dv.getFloat32(o, true); o += 4; return v; };
  if (u8() !== 1) throw new Error('snapshot: not a snapshot');
  const ver = u8();
  if (ver !== SNAP_VERSION) throw new Error('snapshot: version ' + ver);
  const out = { tick: u32(), ack: u32(), self: null, vitals: null, dead: false, left: [], ents: [] };
  const sm = u8();
  if (sm & 1) out.self = { x: f32(), y: f32(), z: f32(), vy: f32() };
  if (sm & 2) out.vitals = { hp: u32(), hpMax: u32(), mp: u32(), mpMax: u32() };
  out.dead = !!(sm & 4);
  const nl = u16();
  for (let i = 0; i < nl; i++) out.left.push(u16());
  while (o < b.byteLength) {
    const r = { id: u16(), full: false };
    const m = u8();
    if (m & F.FULL) { r.full = true; r.kind = KIND_BY_ID[u8()] || 'object'; }
    if (m & F.POS) { r.x = ox + u16() * q; r.z = oz + u16() * q; }
    if (m & F.Y) r.y = i16() / 16;
    if (m & F.YAW) r.yaw = u8() / 256 * TAU;
    if (m & F.HP) r.hp = u16() / 65535;
    if (m & F.ANIM) { r.anim = ANIM_BY_ID[u8()] || 'idle'; r.animSeq = u8(); }
    if (m & F.STATE) r.state = u8();
    if (m & F.TARGET) { const t = u16(); r.target = t === NO_TARGET ? 0 : t; }
    out.ents.push(r);
  }
  return out;
}
