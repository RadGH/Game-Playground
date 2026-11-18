// Mission grade S–D and what it pays. Owner: "I love mission ranks, and I think that should affect your rewards."
// Losing keeps what you picked up but pays nothing and has no grade (owner: "fail, keep loot, never too punishing").
// Pay is always shared in full with every player (never split, never cut for playing together).

export const GRADES = [
  { id: 'S', min: 90, pay: 1.5, crate: 2 },
  { id: 'A', min: 75, pay: 1.25, crate: 1 },
  { id: 'B', min: 55, pay: 1.0, crate: 0 },
  { id: 'C', min: 35, pay: 0.85, crate: 0 },
  { id: 'D', min: 0, pay: 0.7, crate: 0 },
];

/** Score parts (each 0..1) → points out of 100, with the reason for each so the results screen can show it. */
export function gradeParts(S) {
  const par = S.def.par || {};
  const mins = (S.time - (S.def.drop ?? 3)) / 60;
  const speed = par.time ? Math.max(0, Math.min(1, 1.5 - mins / (par.time / 60) * 0.5)) : 0.7;
  const pm = S.mechs.filter(m => m.team !== 'enemy');                       // players only (never a rival ace)
  const hpShare = pm.reduce((s, m) => s + Math.max(0, m.hp) / m.hpMax, 0) / Math.max(1, pm.length);
  const downs = pm.reduce((s, m) => s + (m.timesDown || 0), 0);
  const health = Math.max(0, hpShare - downs * 0.15);
  const opt = S.objectives.filter(o => o.optional);
  const bonus = opt.length ? opt.filter(o => o.done).length / opt.length : 1;
  const care = Math.max(0, 1 - (S.stats.collateral || 0) * 0.25);
  const parts = [
    { id: 'time', label: 'Time', value: speed, weight: 30 },
    { id: 'health', label: 'Damage taken', value: health, weight: 30 },
    { id: 'bonus', label: 'Bonus objectives', value: bonus, weight: 25 },
    { id: 'care', label: 'Protected areas', value: care, weight: 15 },
  ];
  return parts;
}

export function gradeOf(S) {
  const won = S.phase === 'won';
  const parts = gradeParts(S);
  const points = Math.round(parts.reduce((s, p) => s + p.value * p.weight, 0));
  const g = won ? GRADES.find(x => points >= x.min) : null;
  const basePay = (S.def.pay || 1000) + S.stats.score * (S.def.payPerScore || 4);
  return {
    won, points: won ? points : 0, grade: g?.id || null, parts,
    pay: won ? Math.round(basePay * g.pay) : 0,          // every player gets this full amount
    crates: won ? g.crate : 0, seed: S.seed,
    time: S.time, kills: S.stats.kills,
    perPlayer: S.players.map(p => ({ id: p.id, name: p.mech.name || '', bot: !!p.bot, mats: { ...p.mats }, loot: p.loot.slice(), kills: p.mech.kills, dealt: Math.round(p.mech.dealt), taken: Math.round(p.mech.taken) })),
  };
}
