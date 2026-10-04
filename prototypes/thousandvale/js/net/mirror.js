// Client-side entity mirror (stream A): applies `info` + decoded snapshots into a table the renderer
// reads, keeping the last few timestamped samples per entity for interpolation (PLAN §7: draw others
// ~130 ms behind). Pure.
//
//   const m = createMirror({ tickMs: 50, keep: 10 })
//   net.on('joined', () => m.reset()); net.on('info', ents => m.info(ents)); net.on('snap', s => m.snap(s))
//   m.ents  Map id -> { id, info, kind, x, y, z, yaw, hp (0..1), anim, animSeq, state, target, samples, seenTick }
//   m.sample(id, tMs) -> { x, y, z, yaw } interpolated at server time tMs (clamped to the samples held)
//   m.on('enter' | 'leave' | 'anim', fn)

export function createMirror({ tickMs = 50, keep = 10 } = {}) {
  const ents = new Map(), infos = new Map();
  const listeners = { enter: [], leave: [], anim: [] };
  const fire = (k, a) => { for (const f of listeners[k]) f(a); };
  const m = {
    ents, infos, lastTick: 0,
    on(k, f) { listeners[k].push(f); return () => { const i = listeners[k].indexOf(f); if (i >= 0) listeners[k].splice(i, 1); }; },
    reset() { for (const e of ents.values()) fire('leave', e); ents.clear(); infos.clear(); m.lastTick = 0; },
    info(list) {
      for (const i of list) {
        infos.set(i.id, i);
        const e = ents.get(i.id); if (e) e.info = i;
      }
    },
    snap(s) {
      const t = s.tick * tickMs;
      m.lastTick = s.tick;
      for (const id of s.left) { const e = ents.get(id); if (e) { ents.delete(id); fire('leave', e); } }
      for (const r of s.ents) {
        let e = ents.get(r.id);
        if (r.full) {
          const isNew = !e;
          if (!e) { e = { id: r.id, samples: [] }; ents.set(r.id, e); }
          e.kind = r.kind; e.info = infos.get(r.id) || e.info || null;
          if (isNew) fire('enter', e);
        } else if (!e) continue;       // a delta for an id we never got in full: ignore
        if (r.x !== undefined) { e.x = r.x; e.z = r.z; }
        if (r.y !== undefined) e.y = r.y;
        if (r.yaw !== undefined) e.yaw = r.yaw;
        if (r.hp !== undefined) e.hp = r.hp;
        if (r.state !== undefined) e.state = r.state;
        if (r.target !== undefined) e.target = r.target;
        if (r.anim !== undefined && (r.anim !== e.anim || r.animSeq !== e.animSeq)) { e.anim = r.anim; e.animSeq = r.animSeq; fire('anim', e); }
        e.seenTick = s.tick;
        if (r.x !== undefined || r.yaw !== undefined || r.y !== undefined) {
          const S = e.samples;
          if (S.length && S[S.length - 1].t === t) S.pop();
          S.push({ t, x: e.x, z: e.z, y: e.y, yaw: e.yaw });
          if (S.length > keep) S.shift();
        }
      }
    },
    /** Interpolated pose at server time tMs. */
    sample(id, tMs) {
      const e = ents.get(id);
      if (!e) return null;
      const S = e.samples;
      if (!S.length) return { x: e.x, y: e.y, z: e.z, yaw: e.yaw };
      if (tMs <= S[0].t) return { ...S[0] };
      const last = S[S.length - 1];
      if (tMs >= last.t) return { x: last.x, y: last.y, z: last.z, yaw: last.yaw };
      let i = S.length - 2;
      while (i > 0 && S[i].t > tMs) i--;
      const a = S[i], b = S[i + 1], f = (tMs - a.t) / (b.t - a.t);
      let dy = (b.yaw ?? 0) - (a.yaw ?? 0);
      if (dy > Math.PI) dy -= Math.PI * 2; else if (dy < -Math.PI) dy += Math.PI * 2;
      return {
        x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f,
        y: a.y === undefined || b.y === undefined ? b.y : a.y + (b.y - a.y) * f,
        yaw: (a.yaw ?? 0) + dy * f,
      };
    },
  };
  return m;
}
