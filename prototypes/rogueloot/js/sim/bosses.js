// Dungeon bosses (M15, ruling 46): phases by health, each phase its own mechanics from the bestiary
// (data/monsters.json `bosses`: phases[].at / .mechanics, mechanics{} with kind, cast, cooldown, telegraph, interrupt,
// effect text, counter), an enrage clock from the pull, health scaled by party size (`scaling`), fixed loot on top of
// personal drops. Pure. Mechanic kinds beyond the shared ability engine: adds (calls its family; numbers read from the
// effect text), buff (a self-buff like Frenzy), hazard / big_cast / cc (treated as telegraphed area casts).
import { addFx } from './status.js';

const NUM = /(\d+)\s+([a-z][a-z' -]+?)(?:s\b|\b)/i;
/** The boss's current phase index from its health (phases[].at = the health fraction the phase starts at). */
export function phaseOf(f) {
  const ph = f.def.raw?.phases || []; if (!ph.length) return -1;
  const frac = f.hp / f.maxHp; let i = 0;
  for (let k = 0; k < ph.length; k++) if (frac <= (ph[k].at ?? 1) + 1e-9) i = k;
  return i;
}
/** Abilities the shared engine can run, built from a phase's mechanic ids. */
export function phaseAbilities(f, i) {
  const raw = f.def.raw || {}, ids = raw.phases?.[i]?.mechanics || Object.keys(raw.mechanics || {});
  return ids.map(id => ({ id, ...(raw.mechanics?.[id] || {}) })).filter(m => m.kind).map(m => ({
    ...m, kind: m.kind === 'hazard' || m.kind === 'big_cast' || m.kind === 'cc' ? (m.telegraph?.shape && m.telegraph.shape !== 'none' ? 'ground' : 'bolt') : m.kind,
  }));
}
/** Called every step for a boss (from brain.js). Handles phase changes, enrage, adds, buffs. */
export function bossTick(w, f) {
  const raw = f.def.raw || {};
  if (f.state !== 'chase' && f.state !== 'attack') return;
  f.pulledAt ??= w.time;
  const i = phaseOf(f);
  if (i !== f.phase) {
    f.phase = i; f.abilities = phaseAbilities(f, i); f.abilityAt = {};
    w.events.push({ k: 'phase', s: f.id, n: i + 1, name: raw.phases?.[i]?.name || `Phase ${i + 1}` });
  }
  if (raw.enrage && !f.enraged && w.time - f.pulledAt > raw.enrage) { f.enraged = true; addFx(w, f, { id: 'enrage', kind: 'dmgUp', pct: 100, secs: 1e6, src: f.id }); w.events.push({ k: 'enrage', s: f.id }); }
}
/** The extra mechanic kinds the shared engine does not know. Returns true when handled. */
export function bossMechanic(w, f, t, ab, makeFoe) {
  if (ab.kind === 'adds') {
    const m = NUM.exec(ab.effect || ''), n = Math.min(10, m ? +m[1] : 3);
    const name = (m?.[2] || '').toLowerCase();
    const fam = Object.values(w.content.monsters).filter(x => x.family === f.def.family && !x.boss);
    const def = fam.find(x => name && x.name.toLowerCase().startsWith(name.split(' ').slice(-2).join(' ').replace(/s$/, ''))) || fam.find(x => x.role === 'swarm') || fam.find(x => x.role === 'brute') || fam[0];
    if (!def) return true;
    const spots = f.addSpots || [], start = (f.addTurn = (f.addTurn || 0) + 1) * 3;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, s = spots.length ? spots[(start + k) % spots.length] : null;
      const x = s ? s.x + (w.rng() - 0.5) * 1.2 : f.x + Math.cos(a) * 5, z = s ? s.z + (w.rng() - 0.5) * 1.2 : f.z + Math.sin(a) * 5;
      const o = makeFoe(w, def, f.level, x, z, { pack: f.pack || f.id }); for (const [id] of f.threat) o.threat.set(id, 2); o.state = 'chase'; o.owner = f.id;
    }
    w.events.push({ k: 'fability', s: f.id, sk: ab.name || 'Calls for help' });
    return true;
  }
  if (ab.kind === 'buff') {
    const pct = +(/(\d+)%/.exec(ab.effect || '')?.[1] || 50);
    addFx(w, f, { id: ab.id, kind: 'dmgUp', pct: Math.min(pct, 60), secs: 1e6, src: f.id });
    if (/armour\s*0\.(\d)/.test(ab.effect || '')) f.armour *= +('0.' + /armour\s*0\.(\d)/.exec(ab.effect)[1]);
    if (/attack speed/.test(ab.effect || '')) f.attackSpeed *= 1 + pct / 100;
    w.events.push({ k: 'fability', s: f.id, sk: ab.name || 'Frenzy' });
    return true;
  }
  return false;
}
/** Party-size health for a boss (its own `scaling` table instead of the shared one). */
export function bossScale(f, n) { const sc = f.def.raw?.scaling; return sc ? sc[Math.max(0, Math.min(sc.length - 1, n - 1))] : null; }
