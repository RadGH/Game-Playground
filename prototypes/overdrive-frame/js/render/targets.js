// Where the job is (owner report 2026-11-18: "I'm supposed to destroy the tank farms. I don't know what that looks like.
// There are no indicators. There is no minimap"): ONE list of the mission's targets, read by the edge arrows
// (view.js), the minimap and the full mission map (ui/minimap.js), so they always agree.
// → [{ x, z, kind, label, color, r }]  kinds: build (a building to bring down), target (a marked enemy), nest, mast,
//   core, exit (where a convoy is heading), extract, zone (a spot to hold).
export function objectiveTargets(S) {
  const out = [], O = S.ops;
  if (S.phase === 'extract' && S.def.extract) { const e = S.def.extract; out.push({ x: e.x, z: e.z, kind: 'extract', label: 'Dropship', color: '#5fffb0', r: e.r }); return out; }
  for (const o of S.objectives || []) {
    if (o.done || o.failed) continue;
    if (o.type === 'destroy' && o.lots) for (const id of o.lots) {
      const l = S.world.lots.find(x => x.id === id); if (!l || l.stage >= 3) continue;
      out.push({ x: l.x + l.w / 2, z: l.z + l.d / 2, kind: 'build', label: 'Target', color: '#ffb02e', r: Math.max(l.w, l.d) * 0.6, lot: l });
    }
    if (o.type === 'kill' && (o.tag || o.kind === 'nest' || S.kinds[o.kind]?.job === 'boss')) for (const e of S.enemies) {
      if (e.dead || e.state === 'warn') continue;
      if (o.tag ? e.tag === o.tag : e.kind === o.kind) out.push({ x: e.x, z: e.z, kind: o.kind === 'nest' ? 'nest' : 'target', label: o.kind === 'nest' ? 'Nest' : 'Target', color: '#ff4a3a', r: e.r + 0.3 });
    }
    if (o.type === 'survive' && o.r && o.x != null) out.push({ x: o.x, z: o.z, kind: 'zone', label: 'Hold here', color: '#3ff0ff', r: o.r });
    if (o.type === 'reach' && o.x != null) out.push({ x: o.x, z: o.z, kind: 'zone', label: 'Go here', color: '#3ff0ff', r: o.r });
  }
  if (O) {
    for (const m of O.plants || []) if (!m.done) out.push({ x: m.x, z: m.z, kind: 'mast', label: 'Mast', color: '#ffb02e', r: 0.6 });
    if (O.core && !O.core.home) out.push(O.core.carrier ? { x: S.def.extract?.x, z: S.def.extract?.z, kind: 'extract', label: 'Bring the core', color: '#3ff0ff', r: 1.2 } : { x: O.core.x, z: O.core.z, kind: 'core', label: 'Data core', color: '#3ff0ff', r: 0.5 });
    if (O.route && S.def.convoy) { const x = O.route.exit; out.push({ x: x.x, z: x.z, kind: 'exit', label: S.def.convoy.side === 'ally' ? 'Convoy goes here' : 'Trucks escape here', color: S.def.convoy.side === 'ally' ? '#3ff0ff' : '#ff5a3a', r: 1.4 }); }
  }
  return out.filter(t => Number.isFinite(t.x) && Number.isFinite(t.z));
}
