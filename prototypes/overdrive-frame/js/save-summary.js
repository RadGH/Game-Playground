// What an Overdrive Frame save holds, for the "which save to keep?" choice when signing in on a second device
// (shared/rgs-cloudsave.js describe hook; game-standards §3 conflict kit). playedAt is the time the GAME wrote when it
// last saved play (a mission, a purchase, a craft) — never "now", and 0 when not recorded (never marked Newer).
const fmt = n => Math.round(n || 0).toLocaleString('en-US');
const RARE = ['rare', 'prototype', 'experimental'];

export function describeSaves(values) {
  let s = null; try { s = JSON.parse(values?.save || 'null'); } catch { s = null; }
  if (!s || typeof s !== 'object') return { playedAt: 0, lines: ['No pilot saved'] };
  const grades = Object.values(s.grades || {}), best = ['S', 'A', 'B', 'C', 'D'].find(g => grades.includes(g));
  const items = Array.isArray(s.items) ? s.items : [], rare = items.filter(i => RARE.includes(i.rarity)).length;
  const lines = [
    `${s.callsign || 'Frame'}: ${fmt(s.credits)} credits, ${fmt(s.xp ?? s.credits)} experience`,
    `${fmt(s.played)} missions flown, ${grades.length} contracts cleared${best ? ` (best grade ${best})` : ''}`,
  ];
  if (s.v >= 2) lines.push(`${fmt(items.length)} parts (${rare} rare or better), ${(s.builds || []).length} saved builds`);
  lines.push(`Materials: ${fmt(s.mats?.scrap)} scrap, ${fmt(s.mats?.alloy)} alloy, ${fmt(s.mats?.exotic)} exotic`);
  return { playedAt: Number.isFinite(s.playedAt) ? s.playedAt : 0, lines };
}
