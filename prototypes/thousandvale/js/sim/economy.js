// Faucet/sink log (stream A, PLAN §13 "log faucets/sinks from M1"). Every gold or item gain/loss is
// added here with a reason and the character's level band; rows aggregate per hour, the world flushes
// them to the store (economy_log) every minute, and /status shows the last hour.
//
//   const E = createEconomyLog({ now })            now = wall-clock ms
//   E.add('faucet' | 'sink', reason, { gold, items }, level)
//   E.drain() -> rows [{ hour, band, kind, reason, gold, items, count }] (since the last drain)
//   E.lastHour() -> { faucet: {gold, items, byReason}, sink: {...} }

export const BAND_SIZE = 5;
export const bandOf = level => Math.floor((Math.max(1, level | 0) - 1) / BAND_SIZE);

export function createEconomyLog({ now = () => Date.now() } = {}) {
  let pending = new Map();         // key -> row (not flushed yet)
  const recent = [];               // { at, kind, reason, gold, items } for lastHour()
  const E = {
    add(kind, reason, { gold = 0, items = 0 } = {}, level = 1) {
      if (!gold && !items) return;
      const t = now();
      const hour = new Date(Math.floor(t / 3600000) * 3600000).toISOString();
      const band = bandOf(level);
      const key = hour + '|' + band + '|' + kind + '|' + reason;
      let r = pending.get(key);
      if (!r) { r = { hour, band, kind, reason, gold: 0, items: 0, count: 0 }; pending.set(key, r); }
      r.gold += gold; r.items += items; r.count++;
      recent.push({ at: t, kind, reason, gold, items });
      while (recent.length && recent[0].at < t - 3600000) recent.shift();
      if (recent.length > 100000) recent.splice(0, recent.length - 100000);
    },
    drain() { const rows = [...pending.values()]; pending = new Map(); return rows; },
    lastHour() {
      const t = now();
      const out = { faucet: { gold: 0, items: 0, byReason: {} }, sink: { gold: 0, items: 0, byReason: {} } };
      for (const r of recent) {
        if (r.at < t - 3600000) continue;
        const o = out[r.kind]; if (!o) continue;
        o.gold += r.gold; o.items += r.items;
        const b = o.byReason[r.reason] ||= { gold: 0, items: 0 };
        b.gold += r.gold; b.items += r.items;
      }
      return out;
    },
  };
  return E;
}
