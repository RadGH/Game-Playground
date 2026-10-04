// Splitting big messages for data channels (peerjs.js). A WebRTC data channel refuses one message
// above its SCTP limit (64 KB in some browsers, 256 KB in others) and PeerJS throws from send(). A
// resync or rejoin snapshot of a late 3v3 is easily bigger. So a message whose JSON is over CHUNK
// characters goes as numbered frames on the RELIABLE, ORDERED channel and is put back together on
// the other side before anyone sees it. Pure: node tests drive it directly.
//
//   const frames = split(msg, id)        -> [msg] when small, else [{ k: 'chunk', id, i, n, d }, ...]
//   const join = createJoiner()          join(frame) -> the whole message once the last frame is in,
//                                        null while waiting, or `frame` itself when it is not a chunk

export const CHUNK = 16000;   // characters per frame; JSON escaping of the slice can at most double it, still under 64 KB

export function split(msg, id, size = CHUNK) {
  const text = JSON.stringify(msg);
  if (text.length <= size) return [msg];
  const n = Math.ceil(text.length / size), out = [];
  for (let i = 0; i < n; i++) out.push({ k: 'chunk', id, i, n, d: text.slice(i * size, (i + 1) * size) });
  return out;
}

export function createJoiner() {
  const parts = new Map();   // id -> { n, got, d: [] }
  return function join(f) {
    if (!f || f.k !== 'chunk') return f;
    let p = parts.get(f.id);
    if (!p) { p = { n: f.n, got: 0, d: new Array(f.n) }; parts.set(f.id, p); }
    if (p.d[f.i] == null) { p.d[f.i] = f.d; p.got++; }
    if (p.got < p.n) return null;
    parts.delete(f.id);
    return JSON.parse(p.d.join(''));
  };
}
