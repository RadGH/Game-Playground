// Glow (PLAN M4/M6): the quarter-res `glow` field (one byte per 4×4 cells, world.g.glow) that marks magic. Nests grow
// faster near it and Glowfeeders hunt it. M6 FEEDS it; M4 owns the field itself (js/sim/defence/fields.js rebuilds it
// every few ticks by spreading every source outward), so M6 never writes the field while M4 is there:
//   * every spell that lands leaves a short-lived source: sim.defence.pulse('glow', x, y, level, spellTicks) with
//     level = spellBase + perMana × cost (× the spell's own `glow` factor);
//   * a working mana refinery and every battery (scaled by how charged the store is) are steady sources, handed to
//     M4 through sim.hooks.glow (fn → [{ x, y, level }]).
// With no defence module (a bare test sim) the same numbers go straight into the field, which then fades by
// decay/256 every `every` ticks — so "spells add Glow" holds either way.

export function createGlow(sim, cfg) {
  const g = sim.world.g;
  const QW = g.QW, QH = g.QH, F = g.glow;
  const m4 = () => typeof sim.defence?.pulse === 'function';
  let steady = [];
  (sim.hooks.glow ||= []).push(() => (m4() ? steady : []));

  /** Add `amount` of glow in a disc of `rq` quarter cells round cell (x, y), soft at the edge (no-M4 fallback). */
  function add(x, y, rq, amount) {
    const qx = Math.floor(x / 4), qy = Math.floor(y / 4), r = Math.max(1, Math.round(rq)), r2 = r * r;
    for (let dy = -r; dy <= r; dy++) {
      const yy = qy + dy;
      if (yy < 0 || yy >= QH) continue;
      for (let dx = -r; dx <= r; dx++) {
        const xx = qx + dx;
        if (xx < 0 || xx >= QW) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const q = yy * QW + xx;
        const v = F[q] + Math.round(amount * (1 - (d2 / (r2 + 1)) * 0.6));
        F[q] = v > cfg.max ? cfg.max : v;
      }
    }
  }

  /** A burst of glow where something magical happened (a spell landing, a battery bursting). */
  function burst(x, y, rCells, level) {
    level = Math.min(cfg.max, Math.round(level));
    if (level <= 0) return;
    if (m4()) sim.defence.pulse('glow', Math.round(x), Math.round(y), level, cfg.spellTicks);
    else add(x, y, Math.max(2, rCells / 4), level);
  }
  /** The glow a spell leaves where it lands. */
  function spell(def, x, y, rCells) { burst(x, y, rCells, (cfg.spellBase + cfg.perMana * def.cost) * (def.glow ?? 1)); }

  /** Every `every` ticks, with the steady sources [{ x, y, r, level }]: hand them to M4, or (no M4) add them and fade. */
  function step(sources) {
    steady = sources.map((s) => ({ x: s.x, y: s.y, level: Math.min(cfg.max, Math.round(s.level)) }));
    if (m4()) return;
    for (const s of sources) add(s.x, s.y, s.r, s.amount);
    const d = cfg.decay;
    for (let i = 0; i < F.length; i++) { const v = F[i]; if (v) F[i] = (v * d) >> 8; }
  }

  const at = (x, y) => F[Math.floor(y / 4) * QW + Math.floor(x / 4)] || 0;
  return { add, burst, spell, step, at, get steady() { return steady; } };
}
