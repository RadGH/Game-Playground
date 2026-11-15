// Every sentence about a fighter, built from its real numbers (lessons rules 1-4: one printer per sentence, every
// number through shared/format.js, never an id on screen). Pure, so node tests can read every line.
import { fmt, secs, pct } from '../../../../shared/format.js';

const ROLE = { melee: 'Close fighter', caster: 'Caster', archer: 'Archer' };

/** [label, value, tip] rows for the pick screen. `mods` = gauntlet boons (optional). */
export function statRows(def, mods = null) {
  const m = mods || { hpMul: 1, dmgMul: 1, speedMul: 1, hasteMul: 1, cdCut: 0, leech: 0, armor: 0 };
  const rows = [
    ['Health', fmt(Math.round(def.hp * m.hpMul), { decimals: 0 })],
    ['Damage', `${fmt(Math.round(def.dmg * m.dmgMul), { decimals: 0 })} per ${def.kind === 'melee' ? 'hit' : def.kind === 'archer' ? 'arrow' : 'bolt'}`],
    ['Attack speed', `one every ${secs(def.swing / m.hasteMul)}`],
    def.kind === 'melee' ? ['Reach', `${fmt(def.reach, { decimals: 1 })} m`] : ['Range', `${fmt(def.range, { decimals: 0 })} m`],
    ['Move speed', `${fmt(def.speed * m.speedMul, { decimals: 1 })} m/s`],
    ['Style', ROLE[def.kind] || 'Fighter'],
  ];
  if (m.leech > 0) rows.push(['Heals', `${pct(m.leech)} of damage dealt`]);
  if (m.armor > 0) rows.push(['Damage taken', `−${pct(m.armor)}`]);
  return rows;
}

/** The special's one-line description, with its numbers. */
export function specialText(def, mods = null) {
  const sp = def.special, dk = mods?.dmgMul || 1, cd = sp.cd * (1 - (mods?.cdCut || 0));
  const dmg = v => fmt(Math.round(v * dk), { decimals: 0 });
  const every = `Every ${secs(cd)}.`;
  switch (sp.kind) {
    case 'heavy': return `${dmg(sp.dmg)} damage in a ${sp.arc}° sweep in front. A blow this big breaks a foe's swing. ${every}`;
    case 'blast': return `${dmg(sp.dmg)} damage in a ${fmt(sp.radius, { decimals: 1 })} m circle on your foe. It goes off ${secs(sp.time * sp.land)} after the mark appears. ${every}`;
    case 'block': return `Shield up for ${secs(sp.time)}: ${pct(sp.cut)} less damage from every hit. ${every}`;
    case 'volley': return `${sp.count} arrows in a fan, ${dmg(sp.dmg)} damage each. ${every}`;
    case 'scream': return `${dmg(sp.dmg)} damage to foes within ${fmt(sp.radius, { decimals: 1 })} m, and slows them ${pct(sp.slow)} for ${secs(sp.for)}. ${every}`;
    case 'roar': return `${dmg(sp.dmg)} damage to foes within ${fmt(sp.radius, { decimals: 1 })} m, and stuns them for ${secs(sp.stun)}. ${every}`;
    case 'lunge': return `Dashes ${fmt(sp.dash, { decimals: 1 })} m forward and strikes for ${dmg(sp.dmg)}. ${every}`;
    default: return every;
  }
}

/** "1:05" for a fight's length. */
export function clock(s) {
  const t = Math.max(0, Math.round(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
