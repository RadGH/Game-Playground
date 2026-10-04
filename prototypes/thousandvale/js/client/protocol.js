// Thousandvale client — the ONE place that knows the wire format.
//
// Everything else in js/client/ talks in client events (see `decode`) and client intents (see the
// `encode*` helpers). When stream A's docs/protocol.md lands, or the shapes change, or snapshots go
// binary at M1, this is the only file that changes. Pure: no DOM, no three.js, so node tests read it.
//
// Provisional message set (docs/requests.md "D -> A"):
//   client -> server  hello · guest · resume · input · cast · target · chat · ping
//   server -> client  welcome · refuse · spawn · snap · hit · death · respawn · xp · chat · pong · notice

export const PROTOCOL_VERSION = 1;
export const CLIENT_BUILD = 'm0-client-1';

/** Simulation step the server runs at (ms). Input is sent once per step. */
export const TICK_MS = 50;
/** How far behind the newest snapshot other entities are drawn (ms). PLAN §8.3. */
export const INTERP_DELAY_MS = 130;

// --- client -> server -------------------------------------------------------------------------

export const encodeHello = () => ({ t: 'hello', v: PROTOCOL_VERSION, build: CLIENT_BUILD });
export const encodeGuest = (name, look) => ({ t: 'guest', name: cleanName(name), look: { race: look?.race || 'human', cls: look?.cls || 'warrior', seed: look?.seed | 0 } });
export const encodeResume = token => ({ t: 'resume', token: String(token || '') });
/** One movement step. mx/mz are a world-space move direction, length <= 1. */
export const encodeInput = (seq, mx, mz, yaw, run) => ({ t: 'input', seq, mx: q3(mx), mz: q3(mz), yaw: q3(yaw), run: run ? 1 : 0 });
export const encodeCast = (slot, target, aim, ct) => ({ t: 'cast', slot: slot | 0, target: target ?? null, aim: aim ? { x: q3(aim.x), z: q3(aim.z) } : null, ct: Math.round(ct) });
export const encodeTarget = id => ({ t: 'target', id: id ?? null });
export const encodeChat = (ch, text) => ({ t: 'chat', ch: ch || 'say', text: String(text || '').slice(0, 240) });
export const encodePing = c => ({ t: 'ping', c: Math.round(c) });

/** Names: letters, spaces, apostrophes and hyphens, 2–16 characters. Server re-checks. */
export function cleanName(s) {
  const n = String(s || '').replace(/[^A-Za-z' -]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return n.length >= 2 ? n : '';
}

const q3 = v => Math.round((Number(v) || 0) * 1000) / 1000;

// --- server -> client -------------------------------------------------------------------------

/**
 * Normalise one server message into a client event. Unknown types pass through as `{type:'unknown'}`
 * so a newer server never crashes an older tab. Every numeric field is coerced, so a NaN never
 * reaches the scene graph.
 */
export function decode(msg) {
  if (!msg || typeof msg !== 'object') return { type: 'unknown', raw: msg };
  const n = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
  switch (msg.t) {
    case 'welcome': return {
      type: 'welcome', token: msg.token || null, you: msg.you?.id ?? msg.you,
      tickMs: n(msg.tickMs, TICK_MS), serverTime: n(msg.serverTime ?? msg.time),
      world: msg.world || null, motd: msg.motd || '',
    };
    case 'refuse': return { type: 'refuse', reason: String(msg.reason || 'refused'), text: String(msg.text || '') };
    case 'spawn': return { type: 'spawn', ents: (msg.ents || [msg.ent]).filter(Boolean).map(e => ({
      id: e.id, kind: e.kind || 'monster', name: String(e.name || ''), level: n(e.level, 1),
      hpMax: n(e.hpMax, 100), hp: n(e.hp ?? e.hpMax, 100), look: e.look || null, creature: e.creature || null,
      family: e.family || null, x: n(e.x), y: n(e.y), z: n(e.z), yaw: n(e.yaw), cls: e.cls || null, hostile: e.hostile ?? (e.kind === 'monster'),
    })) };
    case 'snap': return {
      type: 'snap', tick: n(msg.tick), time: n(msg.time), ack: n(msg.ack, -1),
      you: msg.you ? { x: n(msg.you.x), y: n(msg.you.y), z: n(msg.you.z), vx: n(msg.you.vx), vz: n(msg.you.vz), hp: msg.you.hp == null ? null : n(msg.you.hp), hpMax: msg.you.hpMax == null ? null : n(msg.you.hpMax) } : null,
      ents: (msg.ents || []).map(e => ({ id: e.id, x: n(e.x), y: n(e.y), z: n(e.z), yaw: n(e.yaw), anim: e.anim || null, hp: e.hp == null ? null : n(e.hp), tgt: e.tgt ?? null })),
      gone: msg.gone || [],
    };
    case 'hit': return { type: 'hit', src: msg.src, dst: msg.dst, amount: n(msg.amt ?? msg.amount), crit: !!msg.crit, kind: msg.kind || 'physical', hp: msg.hp == null ? null : n(msg.hp) };
    case 'death': return { type: 'death', id: msg.id, by: msg.by ?? null };
    case 'respawn': return { type: 'respawn', id: msg.id, x: n(msg.x), y: n(msg.y), z: n(msg.z), hp: n(msg.hp, 0) };
    case 'xp': return { type: 'xp', amount: n(msg.amount), total: n(msg.total), level: n(msg.level, 1), next: n(msg.next, 100) };
    case 'cast': return { type: 'cast', src: msg.src, slot: n(msg.slot), target: msg.target ?? null };
    case 'chat': return { type: 'chat', ch: msg.ch || 'say', from: String(msg.from || ''), text: String(msg.text || ''), id: msg.id ?? null };
    case 'notice': return { type: 'notice', text: String(msg.text || ''), tone: msg.tone || 'info' };
    case 'pong': return { type: 'pong', c: n(msg.c), s: n(msg.s) };
    default: return { type: 'unknown', raw: msg };
  }
}
