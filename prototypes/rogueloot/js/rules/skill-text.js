// Player text for skills and talents, built from the data so the numbers on screen can never disagree with the rules.
// Pure (node tests read it).
//   skillText(sk, rank, level, ch, skills)  a skill's description with {mult} {dmg} {secs} {dur} filled in
//   talentLines(t, rank, content)           a talent's effect lines at a rank: ['Firebolt: +12% damage', '+4% crit chance']
//   targetName(to, content)                 'Firebolt' | 'Fire skills' | 'Kindling skills' | 'Mage skills'
//   boostsOn(skillId, ch, content)          the learned talents changing one skill: [{ talent, rank, text }]
//   boostersOf(skillId, content, ch)        every talent of this hero's trees that could change one skill
import { atRank, synergyOf } from '../sim/skills.js';
import { modHits, ownsTree, talentOpen, isTalent } from '../sim/talents.js';

export const RES_NAME = { rage: 'Temper', energy: 'Energy', mana: 'Mana', health: '% health' };
const n1 = x => String(+(+x).toFixed(1));

/** Fill {mult} {dmg} {secs} {dur} from the numbers at this rank and level. Every placeholder gets a number: a second
 *  {dmg} takes the skill's next damage/heal/ward amount, {secs} reads a duration or an interrupt's lockout. */
export function skillText(sk, rank, level, ch = null, skills = null) {
  const r = atRank(sk, Math.max(1, rank)), all = [];
  const walk = es => { for (const e of es || []) { all.push(e); walk(e.effects); } }; walk(r.effects);
  const syn = ch && skills ? synergyOf(skills, ch, sk.id) : { damage: 1, heal: 1 };
  const w = all.find(e => e.do === 'weapon'), s = all.find(e => e.secs != null || e.lock != null), du = all.find(e => e.duration != null);
  const nums = all.filter(e => e.base).map(d => Math.round((d.base[0] + d.base[1] * level) * (d.do === 'heal' || d.do === 'hot' || d.do === 'shield' ? syn.heal : syn.damage)));
  let i = 0;
  return String(sk.desc || '').replace(/\{mult\}/g, w ? Math.round(w.mult * syn.damage * 100) + '%' : '')
    .replace(/\{dmg\}/g, () => nums.length ? nums[Math.min(i++, nums.length - 1)] : '')
    .replace(/\{secs\}/g, s ? n1(s.secs ?? s.lock) : '').replace(/\{dur\}/g, du ? n1(du.duration) : '');
}

const TYPE_NAME = { physical: 'Physical', fire: 'Fire', frost: 'Frost', storm: 'Storm', poison: 'Poison', shadow: 'Shadow', heal: 'Healing' };
/** Which skills a talent mod reaches, in words. */
export function targetName(to, content) {
  const S = content.skills;
  if (to.skill) return S[to.skill]?.name || 'a skill';
  if (to.skills) return to.skills.map(id => S[id]?.name).filter(Boolean).join(', ');
  if (to.owner) return `${content.paths?.[to.owner]?.name || content.specs?.[to.owner]?.name || 'Class'} skills`;
  if (to.tree) { const t = treeName(content, to.tree); return `${t} skills`; }
  if (to.type) return `${TYPE_NAME[to.type] || 'Your'} skills`;
  return 'Skills';
}
export function treeName(content, id) {
  for (const p of Object.values(content.paths || {})) if (p.tree?.id === id) return p.tree.name;
  for (const sp of Object.values(content.specs || {})) for (const t of sp.trees || []) if (t.id === id) return t.name;
  return 'Tree';
}
const MOD_TEXT = {
  damage: v => `+${v}% damage`, heal: v => `+${v}% healing`, duration: v => `+${v}% duration`, radius: v => `+${v}% area`,
  cost: v => `${v}% cheaper`, cooldown: v => `${v}% shorter cooldown`, cast: v => `${v}% faster cast`, crit: v => `+${v}% critical strike chance`,
};
const PASSIVE_TEXT = {
  crit: v => `+${v}% critical strike chance`, maxHp: v => `+${v} health`, resistAll: v => `+${v}% to all resistances`, moveSpeed: v => `+${v}% walking speed`,
  manaRegen: v => `+${v} mana a second`, spellPower: v => `+${v}% spell damage`, dodge: v => `+${v}% dodge`, castSpeed: v => `+${v}% casting speed`,
  meleePower: v => `+${v}% melee damage`, lifeOnHit: v => `+${v} health each time you hit`, attackSpeed: v => `+${v}% attack speed`, maxMana: v => `+${v} mana`,
  armourPct: v => `+${v}% armour`, healPower: v => `+${v}% healing done`, energyRegen: v => `+${v}% energy refill`, rageGen: v => `+${v}% temper gained`,
  rangedPower: v => `+${v}% ranged damage`, threat: v => `+${v}% threat`, hpRegen: v => `+${v} health a second`, critDamage: v => `+${v}% critical damage`,
  blockChance: v => `+${v}% block chance`, doubleGrip: () => 'Hold a two-handed melee weapon in each hand',
};
/** A talent's effect lines at rank r (r = 0 shows rank 1, for a talent not learned yet). */
export function talentLines(t, r, content) {
  const k = Math.max(1, r), out = [];
  for (const m of t.mods || []) out.push(`${targetName(m.to, content)}: ${MOD_TEXT[m.stat]?.(n1(m.perRank * k)) || ''}`);
  if (t.synergy) { const s = t.synergy; out.push(`${content.skills[s.skill]?.name || 'Skill'}: ${MOD_TEXT[s.stat]?.(n1(s.pctPerRank * k)) || ''}`); }
  if (t.passive) { const p = t.passive, v = (p.value || 0) + (p.perRank || 0) * (k - 1); out.push((PASSIVE_TEXT[p.stat] || (x => `+${x} ${p.stat}`))(n1(v))); }
  return out;
}
/** The learned talents that change one skill for this hero, with what each adds now. */
export function boostsOn(skillId, ch, content) {
  const S = content.skills, sk = S[skillId], out = []; if (!sk) return out;
  for (const [tid, r] of Object.entries(ch?.skills || {})) {
    const t = S[tid]; if (!(r > 0) || !isTalent(t) || !ownsTree(ch, t) || !talentOpen(ch, t)) continue;
    const bits = [];
    for (const m of t.mods || []) if (modHits(m.to, sk)) bits.push(MOD_TEXT[m.stat]?.(n1(m.perRank * r)));
    if (t.synergy?.skill === skillId) bits.push(MOD_TEXT[t.synergy.stat]?.(n1(t.synergy.pctPerRank * r)));
    if (bits.length) out.push({ talent: t, rank: r, text: bits.filter(Boolean).join(', ') });
  }
  return out;
}
/** Every talent in this hero's trees that can change one skill (learned or not) — the skill screen's "boosted by". */
export function boostersOf(skillId, content, ch) {
  const S = content.skills, sk = S[skillId]; if (!sk) return [];
  return Object.values(S).filter(t => isTalent(t) && ownsTree(ch, t) && ((t.mods || []).some(m => modHits(m.to, sk)) || t.synergy?.skill === skillId));
}
