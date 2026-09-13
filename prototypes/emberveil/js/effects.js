// effects.js — the one registry of every gameplay effect in Emberveil 2.
//
// Every id here is `<group>:<key>` and every entry owns two things: a plain-language
// `desc(value)` used in tooltips, and the hook functions the engine calls. Adding an
// effect later is one entry in this file — no other file needs to change.
//
// Groups
//   legendary:<id>   unique-item / set powers (items.json `legendaryEffects`)
//   affix:<stat>     item affix stats, including every `cond_*` conditional affix
//   skill:<key>      keys used by skills.json `effect` / talents / level upgrades
//   status:<type>    status effects (status-effects.json `statusMeta`)
//   champion:<id>    champion (blue elite) modifiers
//   named:<id>       named / super-unique enemy modifiers
//   spell:<key>      enemy-spell effect keys (enemy-spells.json)
//   phase:<key>      boss phase keys (boss-phases.json)
//
// Trait hooks (legendary / affix / champion / named) — `v` is the rolled value:
//   derive(v, d, hero)               once, when stats are derived
//   combatStart(v, C, self)          once per fight
//   roundStart(v, C, self)           each round, before turns
//   dmgOut(v, C, self, t, o) -> mult multiply damage this actor deals
//   dmgIn(v, C, self, src, o) -> mult multiply damage this actor takes
//   onAttack(v, C, self, t)          basic attack only, before the roll
//   onHit(v, C, self, t, o)          after damage lands
//   onCrit(v, C, self, t, o)         after a critical lands
//   onKill(v, C, self, t)            after this actor kills something
//   onDamaged(v, C, self, src, o)    after this actor is hurt
//   preLethal(v, C, self, o)         before a killing blow resolves (o.dealt is writable)
//
// Skill hooks — `c` is { C, caster, skill, eff, foes, allies, targets, target, dealt, crit, raw }:
//   merge(v, skill, hero)            rewrite the merged skill (costs, hit counts…)
//   gate(v, c) -> bool               false hides the skill from the AI this turn
//   pickTargets(v, c) -> array       override the target list
//   onCast(v, c)                     when the skill goes off, before damage
//   onBuff(v, c)                     per ally a buff/heal skill touches (c.target, c.dur)
//   dmgMult(v, c) -> mult            multiply this skill's damage
//   onHit(v, c)                      after each landed hit (c.target, c.dealt, c.crit)
//   onEnd(v, c)                      after every hit is resolved (c.totalDealt)
//
// Status entries carry `mech` (a one-line note on where the mechanic lives) plus optional
// tick(s, C, c) and the flags combat.js reads. Everything here is pure logic — no DOM.

const pct = v => `${Math.round(v * 100)}%`;
const n1 = v => (Number.isInteger(v) ? v : Math.round(v * 10) / 10);
const ni = v => Math.round(v); // for effects the engine itself rounds
const R = (C, c) => (typeof C.rng === 'function' ? C.rng() : Math.random());

export const EFFECTS = {};
function def(group, key, desc, spec = {}) {
  const id = `${group}:${key}`;
  EFFECTS[id] = { id, group, key, desc: typeof desc === 'function' ? desc : () => desc, ...spec };
  return EFFECTS[id];
}

// Small shared helpers the hooks use.
const alive = (C, side) => C.alive(side === 'enemy' ? C.enemies : C.heroes);
const foesOf = (C, self) => C.alive(self.isEnemy ? C.heroes : C.enemies);
const alliesOf = (C, self) => C.alive(self.isEnemy ? C.enemies : C.heroes);
const isUndead = t => /skeleton|ghoul|wraith|lich|undead|bone|shade|wight|zombie|revenant/i.test(t?.templateId || t?.id || '');
const isDemon = t => /demon|imp|fiend|hell|fel|archfiend|devil/i.test(t?.templateId || t?.id || '');
/** Bump a status-modifier bag on an actor. Read by Combat.addStatus. */
export function statusMod(actor, key, value, mode = 'add') {
  actor._sm = actor._sm || {};
  if (mode === 'max') actor._sm[key] = Math.max(actor._sm[key] || 0, value);
  else if (mode === 'mult') actor._sm[key] = (actor._sm[key] ?? 1) * value;
  else actor._sm[key] = (actor._sm[key] || 0) + value;
}

// ───────────────────────────── legendary (unique + set powers) ─────────────────────────────

def('legendary', 'mage_missile_aoe', 'Bolt spells bounce to a second enemy for 60% damage.');
def('legendary', 'crit_bleed_5', 'Critical hits make the target bleed (3 rounds, 8 a round).', {
  onCrit: (v, C, self, t) => { if (t.alive) C.addStatus(t, 'bleed', 3, 8, self); },
});
def('legendary', 'low_mana_shockwave', 'Casting below a quarter mana blasts every enemy (15 + half your INT).');
def('legendary', 'kill_party_heal', "Killing blows heal every ally for a tenth of the victim's max HP.", {
  onKill: (v, C, self, t) => { const h = Math.round((t.maxHp || 0) * 0.1); if (h > 0) for (const a of alliesOf(C, self)) C.healUnit(a, h, 'Iron Brigade', self, 'legendary:kill_party_heal'); },
});
def('legendary', 'speed_combat_init', '+8 initiative for the whole fight.', {
  combatStart: (v, C, self) => { self._legendaryInitBonus = (self._legendaryInitBonus || 0) + 8; },
});
def('legendary', 'cheat_death_once', 'Once a fight, a killing blow leaves you on 1 HP.', {
  preLethal: (v, C, self, o) => { if (self._cheatDeathUsed) return; self._cheatDeathUsed = true; o.dealt = Math.max(0, self.hp - 1); o.tags.push('cheated death'); },
});
def('legendary', 'burn_extend', 'Burns you set last 2 rounds longer.', {
  combatStart: (v, C, self) => { self.burnExtend = (self.burnExtend || 0) + 2; statusMod(self, 'burnDuration', 2); },
});
def('legendary', 'mana_on_attack', 'Every basic attack gives back 3 mana.', {
  onHit: (v, C, self, t, o) => { if (o.isAttack && self.maxMp) self.mp = Math.min(self.maxMp, (self.mp || 0) + 3); },
});
def('legendary', 'critical_armorpen', "Critical hits strip 30% of the target's armour for a round.", {
  onCrit: (v, C, self, t) => { t._tempArmorPen = Math.max(t._tempArmorPen || 0, 0.3); t._tempArmorPenRounds = 1; },
});
def('legendary', 'rally_on_kill', 'Killing an enemy rallies the whole party for a round.', {
  onKill: (v, C, self) => { for (const a of alliesOf(C, self)) C.addStatus(a, 'rally', 1, 0.15, self); },
});
def('legendary', 'echo_cast', 'A quarter of your spells echo for half damage.');
def('legendary', 'dragon_fury_breath', 'Killing blows breathe fire over every other enemy and set them alight.', {
  onKill: (v, C, self, t) => {
    const dmg = Math.round(20 + (self.derived?.STR || self.attrs?.STR || 10));
    for (const e of foesOf(C, self)) if (e !== t) { C.applyDamage(self, e, dmg, { magic: true, label: 'Dragon Breath', via: 'legendary:dragon_fury_breath', dtype: 'fire' }); C.addStatus(e, 'burn', 2, 6, self); }
  },
});

// ───────────────────────────── affixes: plain stats ─────────────────────────────
// These are summed by Loot.equipmentBonuses and read in rules.derive; registered here so
// every affix id in items.json resolves to an entry and gets a tooltip line + a test.

const plain = (stat, desc) => def('affix', stat, desc, { plainStat: true });
plain('str', v => `+${n1(v)} Strength`); plain('dex', v => `+${n1(v)} Dexterity`);
plain('int', v => `+${n1(v)} Intelligence`); plain('con', v => `+${n1(v)} Constitution`);
plain('hp', v => `+${n1(v)} max HP`); plain('mp', v => `+${n1(v)} max mana`);
plain('hit', v => `+${n1(v)} to hit`); plain('dodge', v => `+${n1(v)} dodge`);
plain('initiative', v => `+${n1(v)} initiative`); plain('dmg', v => `+${n1(v)} weapon damage`);
plain('armor', v => `+${n1(v)} armour`); plain('goldFind', v => `+${pct(v)} gold found`);
plain('manaRegen', v => `+${n1(v)} mana a round`); plain('mana_regen', v => `+${n1(v)} mana a round`);
plain('lifeSteal', v => `heals you for ${n1(v)}% of the damage you deal`);
plain('manaSteal', v => `gives back ${n1(v)}% of the damage you deal as mana`);
plain('magicResist', v => `+${n1(v)} magic resistance`); plain('magic_resist', v => `+${n1(v)} magic resistance`);
plain('critChance', v => `+${pct(v)} critical chance`); plain('crit_chance', v => `+${pct(v)} critical chance`);
plain('critDamage', v => `+${pct(v)} critical damage`); plain('crit_damage', v => `+${pct(v)} critical damage`);
plain('spellPower', v => `+${pct(v >= 1 ? v * 0.05 : v)} spell power`); plain('spell_power', v => `+${pct(v >= 1 ? v * 0.05 : v)} spell power`);
plain('magicFind', v => `+${pct(v)} chance of better loot`); plain('magic_find', v => `+${pct(v)} chance of better loot`);
plain('xpFind', v => `+${pct(v)} experience`);
plain('block_chance', v => `+${pct(v)} chance to block`); plain('block_power', v => `blocks ${n1(v)} more damage`);
plain('hpRegen', v => `+${n1(v)} HP a round`); plain('hp_regen', v => `+${n1(v)} HP a round`);
def('affix', 'barrier', v => `start each fight with a ${n1(v)} point barrier`, {
  derive: (v, d) => { d.barrier = (d.barrier || 0) + v; },
  combatStart: (v, C, self) => { C.addStatus(self, 'barrier', 99, v, self); const b = self.statuses.find(s => s.type === 'barrier'); if (b) { b.fromMagicShield = true; b.maxPower = Math.max(b.maxPower || 0, v); b.regen = self.derived?.barrierRegen || 0; } },
});
def('affix', 'barrierRegen', v => `your barrier rebuilds ${n1(v)} points a round`, { derive: (v, d) => { d.barrierRegen = (d.barrierRegen || 0) + v; } });
def('affix', 'barrier_regen', v => `your barrier rebuilds ${n1(v)} points a round`, { derive: (v, d) => { d.barrierRegen = (d.barrierRegen || 0) + v; } });
def('affix', 'cooldownReduction', v => `skills come back ${pct(v)} sooner`, { derive: (v, d) => { d.cooldownReduction = Math.min(0.7, (d.cooldownReduction || 0) + v); } });

// ───────────────────────────── affixes: conditional (cond_*) ─────────────────────────────

const elemBonus = (stat, dtype, status, label) => def('affix', stat, v => `+${pct(v)} ${label}`, {
  dmgOut: (v, C, self, t, o) => (o.dtype === dtype && C.has(t, status) ? 1 + v : 1),
});
elemBonus('cond_fireDmgVsPoisoned', 'fire', 'poison', 'fire damage against poisoned enemies');
elemBonus('cond_coldDmgVsBurning', 'cold', 'burn', 'cold damage against burning enemies');
elemBonus('cond_lightningVsSlowed', 'lightning', 'slow', 'lightning damage against slowed enemies');
elemBonus('cond_poisonDmgVsBurning', 'poison', 'burn', 'poison damage against burning enemies');
def('affix', 'cond_magicDmgVsAnyStatus', v => `+${pct(v)} magic damage against anything already suffering`, {
  dmgOut: (v, C, self, t, o) => (o.magic && t.statuses?.length ? 1 + v : 1),
});
def('affix', 'cond_burnExtend', v => `burns you set last ${Math.round(v)} round${Math.round(v) === 1 ? '' : 's'} longer`, {
  combatStart: (v, C, self) => { self.burnExtend = (self.burnExtend || 0) + Math.round(v); statusMod(self, 'burnDuration', Math.round(v)); },
});
def('affix', 'cond_poisonStackPower', v => `your poison hits ${ni(v)} harder a round`, {
  combatStart: (v, C, self) => statusMod(self, 'poisonPower', v),
});
def('affix', 'cond_firstHitCritBonus', v => `+${pct(v)} critical chance on your first hit of a fight`, {
  combatStart: (v, C, self) => { self._firstHitLeft = 1; },
  critBonus: (v, C, self) => (self._firstHitLeft > 0 ? v * 100 : 0),
  onHit: (v, C, self) => { if (self._firstHitLeft > 0) self._firstHitLeft = 0; },
});
def('affix', 'cond_dmgBelowHpThresh', v => `+${pct(v)} damage while under a third of your health`, {
  dmgOut: (v, C, self) => (self.hp / self.maxHp <= 0.35 ? 1 + v : 1),
});
def('affix', 'cond_consecutiveHitDmg', v => `+${pct(v)} damage for each hit in a row on the same enemy (up to 5)`, {
  dmgOut: (v, C, self, t) => 1 + v * Math.min(5, self._streakTarget === t.id ? self._streak || 0 : 0),
  onHit: (v, C, self, t) => { if (self._streakTarget === t.id) self._streak = (self._streak || 0) + 1; else { self._streakTarget = t.id; self._streak = 1; } },
});
def('affix', 'cond_killInitBonus', v => `+${ni(v)} initiative for the rest of the fight after a kill`, {
  onKill: (v, C, self) => { self._legendaryInitBonus = (self._legendaryInitBonus || 0) + v; },
});
def('affix', 'cond_critArmorPen', v => `critical hits ignore ${pct(v)} of armour`, {
  critArmorPen: v => v,
});
def('affix', 'cond_afterSkillSpellPow', v => `+${pct(v)} spell power for a round after you use a skill`, {
  onCastDone: (v, C, self) => { self._spellPowBonus = v; self._spellPowRounds = 2; },
  roundStart: (v, C, self) => { if (self._spellPowRounds > 0 && --self._spellPowRounds <= 0) self._spellPowBonus = 0; },
});
def('affix', 'cond_ambushDmgFlat', v => `+${ni(v)} flat damage in the first round`, {
  dmgFlat: (v, C, self) => (C.round_ <= 1 ? v : 0),
});
def('affix', 'cond_extraSetPiece', () => 'counts as one extra piece of any set you wear', { lootOnly: true });
def('affix', 'cond_setThresholdReduce', () => 'set bonuses need one piece fewer', { lootOnly: true });
def('affix', 'cond_dotDmgReduce', v => `burn, poison and bleed on you hurt ${pct(v)} less`, { derive: (v, d) => { d.dotReduce = Math.min(0.9, (d.dotReduce || 0) + v); } });
def('affix', 'cond_thornsFlat', v => `returns ${ni(v)} damage to anything that hits you`, { derive: (v, d) => { d.thornsFlat = (d.thornsFlat || 0) + v; } });
def('affix', 'cond_physDmgReducePct', v => `${pct(v)} less damage from weapons`, {
  dmgIn: (v, C, self, src, o) => (o.magic ? 1 : 1 - v),
});
def('affix', 'cond_cheatDeath', () => 'once a fight, a killing blow leaves you on 1 HP', {
  preLethal: (v, C, self, o) => { if (self._cheatDeathUsed) return; self._cheatDeathUsed = true; o.dealt = Math.max(0, self.hp - 1); o.tags.push('cheated death'); },
});
def('affix', 'cond_magicDmgReducePct', v => `${pct(v)} less damage from spells`, {
  dmgIn: (v, C, self, src, o) => (o.magic ? 1 - v : 1),
});
def('affix', 'cond_combatStartBarrier', v => `start each fight behind a ${ni(v)} point barrier`, {
  combatStart: (v, C, self) => C.addStatus(self, 'barrier', 3, Math.round(v), self),
});
def('affix', 'cond_manaOnAttack', v => `+${ni(v)} mana whenever you hit something`, {
  onHit: (v, C, self) => { if (self.maxMp) self.mp = Math.min(self.maxMp, (self.mp || 0) + v); },
});
def('affix', 'cond_hpOnKill', v => `+${ni(v)} HP on a kill`, {
  onKill: (v, C, self) => C.healUnit(self, Math.round(v), 'kill', self, 'affix:cond_hpOnKill'),
});
def('affix', 'cond_skillMpCostReduce', v => `skills cost ${ni(v)} less mana`, { derive: (v, d) => { d.mpCostReduce = (d.mpCostReduce || 0) + v; } });
def('affix', 'cond_lowManaRegenBonus', v => `+${pct(v)} mana regeneration while low on mana`, {
  manaRegenMult: (v, C, self) => (self.mp / Math.max(1, self.maxMp) <= 0.3 ? 1 + v : 1),
});
def('affix', 'cond_manaOnCrit', v => `+${ni(v)} mana on a critical hit`, {
  onCrit: (v, C, self) => { if (self.maxMp) self.mp = Math.min(self.maxMp, (self.mp || 0) + v); },
});
def('affix', 'cond_partyHpOnKill', v => `your kills heal every ally ${ni(v)} HP`, {
  onKill: (v, C, self) => { for (const a of alliesOf(C, self)) C.healUnit(a, Math.round(v), 'kill', self, 'affix:cond_partyHpOnKill'); },
});
def('affix', 'cond_dmgVsUndead', v => `+${ni(v)}% damage against the undead`, {
  dmgOut: (v, C, self, t) => (isUndead(t) ? 1 + v / 100 : 1),
});
def('affix', 'cond_dmgVsDemon', v => `+${ni(v)}% damage against demons`, {
  dmgOut: (v, C, self, t) => (isDemon(t) ? 1 + v / 100 : 1),
});
def('affix', 'cond_goldOnEliteKill', v => `+${pct(v)} gold from champions, named enemies and bosses`, {
  onKill: (v, C, self, t) => { if (t.champion || t.named || t.boss) { C.bonusGold = (C.bonusGold || 0) + v; C.emit({ type: 'loot', source: self, target: t, goldBonus: v, via: 'affix:cond_goldOnEliteKill' }); } },
});
def('affix', 'cond_sustainedDmgBonus', v => `+${pct(v)} damage from the fourth round on`, {
  dmgOut: (v, C, self) => (C.round_ >= 4 ? 1 + v : 1),
});
def('affix', 'cond_speedOnFirstHit', v => `+${ni(v)} initiative once you land your first hit`, {
  onHit: (v, C, self) => { if (!self._speedOnHitUsed) { self._speedOnHitUsed = true; self._legendaryInitBonus = (self._legendaryInitBonus || 0) + v; } },
});
def('affix', 'cond_executeDmgPct', v => `+${pct(v)} damage to enemies under a quarter health`, {
  dmgOut: (v, C, self, t) => (t.hp / Math.max(1, t.maxHp) <= 0.25 ? 1 + v : 1),
});
def('affix', 'cond_manaShieldOnHit', v => `${pct(v)} of the damage you take comes out of mana instead`, {
  onDamaged: (v, C, self, src, o) => {
    const share = Math.min(self.mp || 0, Math.round(o.dealt * v)); if (share <= 0) return;
    self.mp -= share; self.hp = Math.min(self.maxHp, self.hp + share);
    C.emit({ type: 'heal', target: self, amount: share, label: 'mana ward', via: 'affix:cond_manaShieldOnHit' });
  },
});
def('affix', 'cond_bleedOnCrit', v => `${pct(v)} chance to make a critical hit bleed`, {
  onCrit: (v, C, self, t) => { if (t.alive && R(C) < v) C.addStatus(t, 'bleed', 3, Math.max(3, Math.round((self.derived?.STR || 10) * 0.3)), self); },
});
def('affix', 'cond_legendaryEffect', () => 'carries a legendary power', { lootOnly: true });

// ───────────────────────────── champion (blue elite) modifiers ─────────────────────────────

def('champion', 'regen', 'Regenerating: heals a twentieth of its health each round.', {
  spawn: e => { e.regenPct = Math.max(e.regenPct || 0, 0.05); },
  roundStart: (v, C, self) => { if (self.hp < self.maxHp) C.healUnit(self, Math.max(1, Math.round(self.maxHp * 0.05)), 'regenerates', self, 'champion:regen'); },
});
def('champion', 'aura_damage', 'Damage Aura: every other enemy hits 20% harder while it lives.', {
  auraDmg: () => 0.2,
});
def('champion', 'fast', 'Swift: acts half again as often.', { spawn: e => { e.initiative = Math.round((e.initiative || e.dodge + e.level) * 1.5); e.fastChampion = true; } });
def('champion', 'extra_strong', 'Extra Strong: hits 30% harder.', { spawn: e => { e.dmg = e.dmg.map(x => Math.round(x * 1.3)); } });
def('champion', 'tough', 'Tough: 30% more health.', { spawn: e => { e.maxHp = Math.round(e.maxHp * 1.3); e.hp = e.maxHp; } });
def('champion', 'cursed_aura', 'Cursed Aura: curses a random hero every round.', {
  roundStart: (v, C, self) => { const hs = foesOf(C, self); if (!hs.length) return; const t = hs[Math.floor(R(C) * hs.length)]; if (!C.has(t, 'curse')) C.addStatus(t, 'curse', 1, 15, self); },
});
def('champion', 'shielded', 'Shielded: takes half damage from everything.', { dmgIn: () => 0.5 });
def('champion', 'lifesteal', 'Lifesteal: heals for 30% of the damage it deals.', {
  spawn: e => { e.lifeSteal = Math.max(e.lifeSteal || 0, 0.3); },
  onHit: (v, C, self, t, o) => { if (o.dealt > 0) C.healUnit(self, Math.round(o.dealt * 0.3), 'lifesteal', self, 'champion:lifesteal'); },
});
def('champion', 'thorns', 'Thorns: returns 10 damage to anything that hits it.', {
  onDamaged: (v, C, self, src, o) => { if (src?.alive && !o.noReflect) C.applyDamage(self, src, 10, { trueDmg: true, label: 'Thorns', noReflect: true, via: 'champion:thorns', dtype: 'true' }); },
});
def('champion', 'inferno', 'Inferno: anything that hits it catches fire.', {
  onDamaged: (v, C, self, src) => { if (src?.alive && !C.has(src, 'burn')) C.addStatus(src, 'burn', 3, 6, self); },
});

// ───────────────────────────── named / super-unique modifiers ─────────────────────────────

def('named', 'tough', 'Tough: +8 armour.', { spawn: e => { e.armor += 8; } });
def('named', 'fast', 'Fast: acts twice a round.', { spawn: e => { e.extraActionsEachRound = (e.extraActionsEachRound || 0) + 1; } });
def('named', 'regen', 'Regenerating: heals a twentieth of its health each round.', { spawn: e => { e.regenPct = 0.05; } });
def('named', 'thorns', 'Thorns: returns a fifth of the damage it takes.', { spawn: e => { e.thorns = 0.2; } });
def('named', 'fiery', 'Fiery: sets you alight when it hits.', { spawn: e => { e.statusOnHit = [...(e.statusOnHit || []), { type: 'burn', chance: 0.6, duration: 2, power: Math.max(4, Math.round(e.dmg[1] * 0.3)) }]; } });
def('named', 'vampiric', 'Vampiric: heals for 30% of the damage it deals.', { spawn: e => { e.lifeSteal = 0.3; } });
def('named', 'cursed', 'Cursed: its hits curse you.', { spawn: e => { e.statusOnHit = [...(e.statusOnHit || []), { type: 'curse', chance: 0.5, duration: 2, power: 20 }]; } });
def('named', 'summoner', 'Summoner: brings two extra followers.', { encounterOnly: true });
def('named', 'colossal', 'Colossal: half again as big, and hits harder for it.', { spawn: e => { e.maxHp = Math.round(e.maxHp * 1.5); e.hp = e.maxHp; e.dmg = e.dmg.map(x => Math.round(x * 1.2)); e.big = true; } });

// ───────────────────────────── status effects ─────────────────────────────
// Combat.js reads these fields straight off the registry, so a new status is one entry:
//   dot / heal       ticks damage or healing each round (power = amount)
//   skip             chance the holder loses its turn (1 = always)
//   consumed         removed the moment it stops a turn
//   wakesOnDamage    removed when the holder is hurt
//   hitMult/hitFlat  changes the holder's chance to land a hit
//   dealtMult(s)     multiplies the damage the holder deals
//   takenMult(s,o)   multiplies the damage the holder receives
//   initMult         multiplies initiative
//   extraActions     extra turns a round
//   blockBonus       extra block chance
//   absorbNext       swallows the next hit whole
//   reflect(s,dealt) damage sent back to the attacker
//   noSpells / noWeapon / noDodge / drawsFire / share   behaviour switches

const st = (type, desc, spec) => def('status', type, desc, spec);
st('bleed', 'Bleeding: loses HP every round from an open wound.', { dot: true, stacks: true });
st('poison', 'Poisoned: loses HP every round, and doses stack.', { dot: true, stacks: true });
st('burn', 'Burning: takes fire damage every round and is more vulnerable to flame.', { dot: true, stacks: true, takenMult: (s, o) => (o.dtype === 'fire' ? 1.15 : 1) });
st('stun', 'Stunned: cannot act at all.', { skip: 1 });
st('haste', 'Hasted: takes an extra action each round.', { extraActions: 1 });
st('rally', 'Rallied: deals more damage while it lasts.', { dealtMult: s => 1 + (s.power || 0.15) });
st('barrier', 'Barrier: soaks up damage before health is touched.', { absorbs: true });
st('block', 'Blocking: much more likely to block an incoming hit.', { blockBonus: s => Math.min(0.75, (s.power || 25) / 100) });
st('deflect', 'Deflecting: the next hit that lands is turned aside completely.', { absorbNext: true });
st('enchant', 'Enchanted: the weapon carries a charge, adding 25% magic damage.', { dealtMult: s => 1 + (s.power || 0.25) });
st('slow', 'Slowed: acts later and less often.', { initMult: 0.5 });
st('taunt_totem', 'Taunt Totem: a totem pulls enemy attacks away from the party.', { drawsFire: true });
st('regen', 'Regenerating: recovers HP at the start of each round.', { heal: true });
st('marked', 'Marked: takes 30% more damage from everything.', { takenMult: s => 1 + (s.power ? s.power / 100 : 0.3) });
st('blind', 'Blinded: swings wildly and misses far more often.', { hitMult: 0.5 });
st('soulbind', 'Soul-Bound: shares half of every wound with whoever is bound to it.', { share: 0.5 });
st('curse', 'Cursed: deals noticeably less damage.', { dealtMult: s => 1 - Math.min(0.9, (s.power || 20) / 100) });
st('silence', 'Silenced: cannot cast anything.', { noSpells: true });
st('disarm', 'Disarmed: its weapon is gone, so its hits land at half strength.', { noWeapon: true, dealtMult: () => 0.5 });
st('root', 'Rooted: held fast — cannot dodge and loses any extra actions.', { noDodge: true, noExtra: true });
st('holy_burn', 'Holy Fire: sacred flame that burns twice as hot on the undead and demons.', { dot: true, holy: true, stacks: true });
st('freeze', 'Frozen: locked in ice for the round.', { skip: 1, consumed: true });
st('confused', 'Confused: half the time it does nothing at all.', { skip: 0.5 });
st('thorns', 'Thorns: hurts anything that hits it.', { reflect: (s, dealt) => s.power || 10 });
st('dazed', 'Dazed: much less likely to hit anything.', { hitFlat: -25 });
st('sleep', 'Asleep: out cold until something wakes it.', { skip: 1, wakesOnDamage: true });
st('sunder', 'Sundered: its armour is broken open.', { armorReduce: s => s.power || 0 });
st('fury', 'Furious: lashing out much harder than normal.', { dealtMult: s => 1 + (s.power || 20) / 100 });
st('weaken', 'Weakened: its blows have lost their strength.', { dealtMult: s => 1 - Math.min(0.9, (s.power || 20) / 100) });

// ───────────────────────────── enemy spell effect keys ─────────────────────────────

def('spell', 'damage', v => `deals ${n1(v)} damage`);
def('spell', 'status', v => `applies ${v.type}`);
def('spell', 'statuses', v => `applies ${v.map(s => s.type).join(' and ')}`);
def('spell', 'heal', v => `heals an ally ${n1(v)}`);
def('spell', 'selfHeal', v => `heals the caster ${n1(v)}`);
def('spell', 'windUp', v => `takes ${v.rounds} round${v.rounds === 1 ? '' : 's'} to build, and fizzles if it takes ${v.interruptThreshold} damage first`);
def('spell', 'stealable', v => (v === false ? 'cannot be snatched away' : 'can be snatched out of the air by anyone pilfering'));

// ───────────────────────────── boss phase keys ─────────────────────────────

def('phase', 'hpThreshold', v => `triggers below ${pct(v)} health`);
def('phase', 'name', v => `phase: ${v}`);
def('phase', 'onEnter', v => String(v));
def('phase', 'addSpells', v => `learns ${v.join(', ')}`);
def('phase', 'swapSpells', v => `swaps to ${v.join(', ')}`);
def('phase', 'addStatuses', v => `gains ${v.map(s => s.type).join(', ')}`);

// ───────────────────────────── skill effect keys (skills.json) ─────────────────────────────
// `inline: true` means the mechanic lives directly in combat.js cast()/mergeSkill(); the entry
// is still here so the key has a tooltip line and a test.

const S = (k, d, s = {}) => def('skill', k, d, s);
const inl = (k, d) => S(k, d, { inline: true });
const RANDSTAT = ['burn', 'poison', 'bleed', 'stun', 'slow', 'blind', 'confused', 'dazed', 'marked', 'freeze'];
const pickFrom = (C, list) => list[Math.floor(R(C) * list.length)];
const others = (c, t) => c.C.alive(c.foes).filter(x => x !== t);

// -- shape of the attack -----------------------------------------------------------------
inl('aoe', v => `hits ${v}`);
inl('damageMult', v => `deals ${pct(v)} weapon damage`);
inl('hits', v => `${v} hit${v > 1 ? 's' : ''}`);
inl('bolts', v => `${v} bolts`);
inl('targets', v => `${v} targets`);
inl('target', v => `aimed at ${v}`);
inl('duration', v => `lasts ${v} round${v === 1 ? '' : 's'}`);
inl('rounds', v => `lasts ${v} round${v === 1 ? '' : 's'}`);
inl('cooldown', v => `usable again after ${v} rounds`);
inl('mpCost', v => (v < 0 ? `costs ${-v} less mana` : `costs ${v} mana`));
inl('damageCategory', v => `counts as ${v} damage`);
inl('damageType', v => `${v} damage`);
inl('healStat', v => `healing scales with ${v}`);
S('damageStat', v => `damage scales with ${v}`, { inline: true });
S('strikeCount', v => `${v} strikes`, { merge: (v, s) => { s.hits = Math.max(s.hits || 1, v); } });
S('attackCount', v => `${v} attacks`, { merge: (v, s) => { s.hits = Math.max(s.hits || 1, v); } });
S('glaiveCount', v => `the glaive bounces between ${v} enemies`, { pickTargets: (v, c) => c.C.alive(c.foes).slice(0, v) });
S('chainCount', v => `chains to ${v} enemies`, { pickTargets: (v, c) => c.C.alive(c.foes).slice(0, v) });
S('chainTargets', v => `chains to ${v} enemies`, { pickTargets: (v, c) => c.C.alive(c.foes).slice(0, v) });
S('chainTarget', v => `chains to ${v} more`, { pickTargets: (v, c) => c.C.alive(c.foes).slice(0, 1 + v) });
S('pullToGroup', () => 'drags the target into the middle of its group, so the whole group is hit', { pickTargets: (v, c) => { const p = c.C.alive(c.foes)[0]; return p ? c.C.alive(c.foes).filter(e => e.group === p.group) : []; } });
S('split', v => `the damage is split ${v} ways`, { dmgMult: (v, c) => 1 / Math.max(1, v) });
S('chainDmgScale', v => `each link of the chain keeps ${pct(v)} of the damage`, { dmgMult: (v, c) => Math.pow(v, c.targetIndex || 0) });
S('chainMult', v => `each link of the chain keeps ${pct(v)} of the damage`, { dmgMult: (v, c) => Math.pow(v, c.targetIndex || 0) });
S('aoeReduction', v => `extra targets take ${pct(v)} of the damage`, { dmgMult: (v, c) => ((c.targetIndex || 0) > 0 ? v : 1) });
S('splash', v => `splashes ${pct(v)} of the damage onto everything else`, { onHit: (v, c) => { for (const o of others(c, c.target)) c.C.applyDamage(c.caster, o, Math.max(1, Math.round(c.dealt * v)), { magic: c.magic, label: c.skill.name + ' splash', via: 'skill:' + c.skill.id, dtype: c.dtype }); } });
S('partySplash', v => `${pct(v)} of it washes over the rest of the party as healing`, { onHit: (v, c) => { for (const a of c.C.alive(c.allies)) if (a !== c.caster) c.C.healUnit(a, Math.max(1, Math.round(c.dealt * v)), c.skill.name, c.caster, 'skill:' + c.skill.id); } });
S('splashOnKill', v => `a kill splashes ${pct(v)} of the damage onto everything else`, { onHit: (v, c) => { if (c.target.alive) return; for (const o of others(c, c.target)) c.C.applyDamage(c.caster, o, Math.max(1, Math.round(c.dealt * v)), { magic: c.magic, label: 'Overkill', via: 'skill:' + c.skill.id, dtype: c.dtype }); } });
S('excludeSelf', () => 'helps everyone but you', { inline: true });
S('selfFree', () => 'casting it on yourself costs you no turn', { onCast: (v, c) => { if (c.skill.target === 'self') c.caster.extraActions = (c.caster.extraActions || 0) + 1; } });
S('firstStrike', () => 'the party gets the jump on the enemy', { onCast: (v, c) => { for (const a of c.C.alive(c.allies)) a._legendaryInitBonus = (a._legendaryInitBonus || 0) + 50; } });
S('neverMiss', () => 'never misses', { inline: true });
S('variance', v => `damage swings by ${pct(v)}`, { dmgMult: (v, c) => 1 - v + R(c.C) * v * 2 });
S('varianceFloor', v => `never rolls below ${pct(v)} damage`, { dmgMult: (v, c) => v + R(c.C) * (1 - v) });
S('varianceCeiling', v => `can roll as high as ${pct(v)} damage`, { dmgMult: (v, c) => 1 + R(c.C) * (v - 1) });

// -- damage modifiers --------------------------------------------------------------------
inl('bonusVsUndead', v => `+${pct(v)} against the undead`);
inl('bonusVsDemon', v => `+${pct(v)} against demons`);
S('dmgBuffVsUndead', v => `+${pct(v)} against the undead`, { dmgMult: (v, c) => (isUndead(c.target) ? 1 + v : 1) });
S('dmgBuffVsDemon', v => `+${pct(v)} against demons`, { dmgMult: (v, c) => (isDemon(c.target) ? 1 + v : 1) });
S('burnVsUndead', () => 'sets the undead alight on top of the damage', { onHit: (v, c) => { if (isUndead(c.target) && c.target.alive) c.C.addStatus(c.target, 'holy_burn', 3, 6, c.caster); } });
inl('damageVsStatus', v => Object.entries(v).map(([k, b]) => `+${pct(b)} against ${k}`).join(', '));
S('conditionBonus', v => `+${pct(v)} against anything already suffering`, { dmgMult: (v, c) => (c.target.statuses?.length ? 1 + v : 1) });
S('sunderAmp', v => `+${pct(v)} against sundered armour`, { dmgMult: (v, c) => (c.C.has(c.target, 'sunder') ? 1 + v : 1) });
S('dmgPerBleedStack', v => `+${pct(v)} for every bleed on the target`, { dmgMult: (v, c) => 1 + v * c.target.statuses.filter(s => s.type === 'bleed').length });
S('dmgScaling', v => `up to +${pct(v)} the more hurt you are`, { dmgMult: (v, c) => 1 + v * (1 - c.caster.hp / Math.max(1, c.caster.maxHp)) });
S('damageMultInt', v => `an extra ${pct(v)} for every 20 Intelligence`, { dmgMult: (v, c) => 1 + v * ((c.caster.derived?.INT || 10) / 20) });
S('stackBonusPerDeath', v => `+${pct(v)} for every enemy that has already fallen`, { dmgMult: (v, c) => 1 + v * (c.C.enemies.filter(e => !e.alive).length) });
S('corpseHpScale', v => `scales with the bodies on the floor (${pct(v)} each)`, { dmgMult: (v, c) => 1 + v * (c.C.enemies.filter(e => !e.alive).length) });
inl('executeThreshold', v => `finishes anything under ${pct(v)} health`);
inl('executeMult', v => `${v}× damage on a finisher`);
S('executeChance', v => `${pct(v)} chance to finish a badly hurt enemy outright`, { onHit: (v, c) => { const t = c.target; if (t.alive && t.hp / t.maxHp <= 0.2 && R(c.C) < v) c.C.applyDamage(c.caster, t, t.hp, { trueDmg: true, label: 'Execute', via: 'skill:' + c.skill.id, dtype: 'true' }); } });
inl('critBonus', v => `+${pct(v)} critical chance`);
S('critVsBleed', v => `+${pct(v)} critical chance against bleeding enemies`, { critBonus: (v, c) => (c.C.has(c.target, 'bleed') ? v * 100 : 0) });
S('critExtra', () => 'a critical hit lands twice', { onHit: (v, c) => { if (c.crit && c.target.alive) c.C.applyDamage(c.caster, c.target, Math.max(1, Math.round(c.dealt * 0.5)), { magic: c.magic, label: c.skill.name + ' (again)', via: 'skill:' + c.skill.id, dtype: c.dtype }); } });
inl('armorPen', v => (v > 1 ? `ignores ${v} armour` : `ignores ${pct(v)} armour`));
S('armorPenPct', v => `ignores ${pct(v)} armour`, { armorPen: v => v });
S('ignoreMR', () => 'ignores magic resistance', { armorPen: () => 1 });
S('magicPen', v => `ignores ${pct(v)} magic resistance`, { armorPen: v => v });
S('mrPen', v => `ignores ${pct(v)} magic resistance`, { armorPen: v => v });
S('dmg', v => `+${n1(v)} flat damage`, { dmgFlat: v => v });
S('dmgAmp', v => `the target takes ${pct(v)} more damage afterwards`, { onHit: (v, c) => { if (c.target.alive) c.C.addStatus(c.target, 'marked', 2, Math.round(v * 100), c.caster); } });

// -- statuses the skill applies ----------------------------------------------------------
inl('statusEffects', v => 'applies ' + v.map(s => `${s.type} (${pct(s.chance ?? 0.5)}, ${s.duration ?? 2} rounds)`).join(', '));
inl('stunChance', v => `${pct(v)} chance to stun`);
inl('bleedChance', v => `${pct(v)} chance to cause bleeding`);
inl('bleed', v => `causes bleeding for ${v.duration || 2} rounds`);
inl('slow', v => `slows for ${v.duration || 2} rounds`);
S('freezeChance', v => `${pct(v)} chance to freeze`, { onHit: (v, c) => { if (c.target.alive && R(c.C) < v) c.C.addStatus(c.target, 'freeze', 1, 0, c.caster); } });
S('confuse', v => `${pct(typeof v === 'number' ? v : 1)} chance to confuse`, { onHit: (v, c) => { if (c.target.alive && R(c.C) < (typeof v === 'number' ? v : 1)) c.C.addStatus(c.target, 'confused', 2, 0, c.caster); } });
S('skipTurnChance', v => `${pct(v)} chance the target loses its next turn`, { onHit: (v, c) => { if (c.target.alive && R(c.C) < v) c.C.addStatus(c.target, 'stun', 1, 0, c.caster); } });
S('suppressAbilities', () => 'stops the target casting anything', { onHit: (v, c) => { if (c.target.alive) c.C.addStatus(c.target, 'silence', typeof v === 'number' ? v : 2, 0, c.caster); } });
S('healingReduction', v => `healing on the target is ${pct(v)} weaker`, { onHit: (v, c) => { c.target._healReduce = Math.max(c.target._healReduce || 0, v); c.target._healReduceRounds = 3; } });
S('applyCurse', v => 'curses the target', { onHit: (v, c) => { if (c.target.alive) c.C.addStatus(c.target, 'curse', c.eff.curseDuration || c.eff.curseDur || 2, c.eff.cursePower || 20, c.caster); } });
S('curseDuration', v => `the curse lasts ${v} rounds`, { onHit: (v, c) => { if (c.target.alive) c.C.addStatus(c.target, 'curse', v, c.eff.cursePower || 20, c.caster); } });
S('curseDur', v => `the curse lasts ${v} rounds`, { onHit: (v, c) => { if (c.target.alive) c.C.addStatus(c.target, 'curse', v, c.eff.cursePower || 20, c.caster); } });
S('cursePower', v => `the curse saps ${n1(v)}% of their strength`, { onHit: (v, c) => { if (c.target.alive) c.C.addStatus(c.target, 'curse', c.eff.curseDuration || c.eff.curseDur || 2, v, c.caster); } });
S('curseSpreadCount', v => `the curse jumps to ${v} more enemies`, { onHit: (v, c) => { for (const o of others(c, c.target).slice(0, v)) c.C.addStatus(o, 'curse', 2, c.eff.cursePower || 20, c.caster); } });
S('dmgCurse', v => `the curse also eats away ${n1(v)} HP a round`, { onHit: (v, c) => { if (c.target.alive) { c.C.addStatus(c.target, 'curse', 2, 20, c.caster); c.C.addStatus(c.target, 'bleed', 2, Math.max(1, Math.round(v)), c.caster); } } });
S('addCorruptionStack', v => `adds ${n1(v)} stack${v === 1 ? '' : 's'} of corruption`, { onHit: (v, c) => { const t = c.target; t._corruption = (t._corruption || 0) + v; if (t.alive) c.C.addStatus(t, 'curse', 3, 10 * v, c.caster); } });
S('corruptionDetonate', () => 'blows the corruption stacks off the target', { onHit: (v, c) => { const t = c.target; const st = t._corruption || 0; if (!st) return; t._corruption = 0; c.C.applyDamage(c.caster, t, Math.round(st * 12 * (c.eff.detonateMult || 1)), { magic: true, label: 'Detonate', via: 'skill:' + c.skill.id, dtype: 'shadow' }); } });
S('detonateMult', v => `the blast hits ${v}× as hard`, { onHit: (v, c) => { const t = c.target; if (!t._corruption) return; const st = t._corruption; t._corruption = 0; c.C.applyDamage(c.caster, t, Math.round(st * 12 * v), { magic: true, label: 'Detonate', via: 'skill:' + c.skill.id, dtype: 'shadow' }); } });
S('minDebuffs', v => `always lands at least ${v} harmful effect${v > 1 ? 's' : ''}`, { onHit: (v, c) => { const t = c.target; if (!t.alive) return; let bad = t.statuses.filter(s => RANDSTAT.includes(s.type)).length; while (bad < v) { c.C.addStatus(t, pickFrom(c.C, RANDSTAT), 2, 4, c.caster); bad++; } } });
S('guaranteedDebuffPerStack', () => 'each stack lands a harmful effect for certain', { onHit: (v, c) => { const n = Math.max(1, c.caster.flair || 1); for (let i = 0; i < n && c.target.alive; i++) c.C.addStatus(c.target, pickFrom(c.C, RANDSTAT), 2, 4, c.caster); } });
S('randomStatus', () => 'lands a random harmful effect', { onHit: (v, c) => { if (c.target.alive) c.C.addStatus(c.target, pickFrom(c.C, RANDSTAT), c.eff.randomStatusDuration || 2, 4, c.caster); } });
S('randomStatusChance', v => `${pct(v)} chance of a random harmful effect`, { onHit: (v, c) => { if (c.target.alive && R(c.C) < v) c.C.addStatus(c.target, pickFrom(c.C, RANDSTAT), c.eff.randomStatusDuration || 2, 4, c.caster); } });
S('randomStatusDuration', v => `random effects last ${v} rounds`, { onHit: (v, c) => { if (c.target.alive) c.C.addStatus(c.target, pickFrom(c.C, RANDSTAT), v, 4, c.caster); } });
S('randomStatusRolls', v => `rolls ${v} random effects`, { onHit: (v, c) => { for (let i = 0; i < v && c.target.alive; i++) if (R(c.C) < (c.eff.randomStatusRollChance ?? 1)) c.C.addStatus(c.target, pickFrom(c.C, RANDSTAT), 2, 4, c.caster); } });
S('randomStatusRollChance', v => `each roll has a ${pct(v)} chance`, { onHit: (v, c) => { if (c.target.alive && R(c.C) < v) c.C.addStatus(c.target, pickFrom(c.C, RANDSTAT), 2, 4, c.caster); } });
S('randomElement', () => 'strikes with a random element', { onHit: (v, c) => { if (c.target.alive) c.C.addStatus(c.target, pickFrom(c.C, ['burn', 'freeze', 'poison']), 2, 5, c.caster); } });
S('elementalStatus', () => "leaves behind the spell's own element", { onHit: (v, c) => { if (c.target.alive) c.C.addStatus(c.target, ({ fire: 'burn', cold: 'freeze', lightning: 'stun', poison: 'poison', shadow: 'curse', holy: 'holy_burn' })[c.dtype] || 'burn', 2, 5, c.caster); } });
S('elementStatusGuaranteed', () => 'the element always takes hold', { onHit: (v, c) => { if (c.target.alive) c.C.addStatus(c.target, ({ fire: 'burn', cold: 'freeze', lightning: 'stun', poison: 'poison', shadow: 'curse', holy: 'holy_burn' })[c.dtype] || 'burn', 2, 6, c.caster); } });
S('elementStatusMult', v => `element effects bite ${v}× as hard`, { onCast: (v, c) => statusMod(c.caster, 'dotMult', v, 'mult') });
S('onHitStatus', v => `your attacks apply ${v.type || v} for a while`, { onCast: (v, c) => { c.caster.onHitStatus = { type: v.type || v, duration: v.duration || 2, power: v.power || 4, chance: v.chance ?? 1 }; c.caster.onHitStatusRounds = c.eff.duration || 3; } });

// -- damage over time tuning -------------------------------------------------------------
S('burnDmgMult', v => `your burns hurt ${v}× as much`, { onCast: (v, c) => statusMod(c.caster, 'burnMult', v, 'mult') });
S('burnMult', v => `your burns hurt ${v}× as much`, { onCast: (v, c) => statusMod(c.caster, 'burnMult', v, 'mult') });
S('burnDuration', v => `your burns last ${v} rounds longer`, { onCast: (v, c) => statusMod(c.caster, 'burnDuration', v) });
S('burnStackRate', v => `${pct(v)} chance to stack a second burn`, { onHit: (v, c) => { if (c.target.alive && R(c.C) < v) c.C.addStatus(c.target, 'burn', 2, 5, c.caster); } });
S('burnSpread', () => 'the fire jumps to another enemy', { onHit: (v, c) => { if (!c.C.has(c.target, 'burn')) return; const o = others(c, c.target)[0]; if (o) c.C.addStatus(o, 'burn', 2, 5, c.caster); } });
S('igniteZone', v => `leaves the ground burning for ${n1(v)} rounds`, { onEnd: (v, c) => { for (const e of c.C.alive(c.foes)) c.C.addStatus(e, 'burn', typeof v === 'number' ? v : 2, 4, c.caster); } });
S('poisonDmgMult', v => `your poison hurts ${v}× as much`, { onCast: (v, c) => statusMod(c.caster, 'poisonMult', v, 'mult') });
S('poisonMaxStacks', v => `poison can stack up to ${v} times`, { onCast: (v, c) => statusMod(c.caster, 'poisonMaxStacks', v, 'max') });
S('poisonPerTwoStacks', v => `every second poison stack adds another ${n1(v)}`, { onHit: (v, c) => { const n = c.target.statuses.filter(s => s.type === 'poison').length; if (n >= 2 && c.target.alive) c.C.addStatus(c.target, 'poison', 3, Math.max(1, Math.round(v * Math.floor(n / 2))), c.caster); } });
S('bleedStack', v => `adds ${v} more bleed${v > 1 ? 's' : ''}`, { onHit: (v, c) => { for (let i = 0; i < v && c.target.alive; i++) c.C.addStatus(c.target, 'bleed', 3, 5, c.caster); } });
S('hemorrhage', () => 'every bleed on the target bursts at once', { onHit: (v, c) => { const st = c.target.statuses.filter(s => s.type === 'bleed'); if (!st.length) return; const dmg = st.reduce((a, s) => a + (s.power || 3) * Math.max(1, s.duration), 0); c.target.statuses = c.target.statuses.filter(s => s.type !== 'bleed'); c.C.applyDamage(c.caster, c.target, dmg, { trueDmg: true, label: 'Hemorrhage', via: 'skill:' + c.skill.id, dtype: 'physical' }); } });
S('rebleedAfter', v => `the wound opens again ${v} rounds later`, { onHit: (v, c) => { c.target._rebleed = { rounds: v, power: 6, source: c.caster }; } });
S('dotDmgMult', v => `your lingering damage hurts ${v}× as much`, { onCast: (v, c) => statusMod(c.caster, 'dotMult', v, 'mult') });
S('dotPower', v => `lingering damage does ${n1(v)} a round`, { onCast: (v, c) => statusMod(c.caster, 'dotPower', v, 'max') });
S('dotDuration', v => `lingering damage lasts ${v} rounds longer`, { onCast: (v, c) => statusMod(c.caster, 'dotDuration', v) });
S('dotDurationMult', v => `lingering damage lasts ${v}× as long`, { onCast: (v, c) => statusMod(c.caster, 'dotDurationMult', v, 'mult') });
S('dotLifesteal', v => `you heal for ${pct(v)} of your lingering damage`, { onCast: (v, c) => { c.caster._dotLifesteal = Math.max(c.caster._dotLifesteal || 0, v); } });
S('regenBonus', v => `regeneration gives ${n1(v)} more a round`, { onCast: (v, c) => statusMod(c.caster, 'regenPower', v) });
S('slowMult', v => `slows last ${v}× as long`, { onCast: (v, c) => statusMod(c.caster, 'slowMult', v, 'mult') });
S('spreadOnDeath', () => 'when the target dies its afflictions spread', { onHit: (v, c) => { if (c.target.alive) return; const bad = (c.target._lastStatuses || []).filter(s => RANDSTAT.includes(s.type)); for (const o of others(c, c.target)) for (const s of bad) c.C.addStatus(o, s.type, s.duration || 2, s.power || 4, c.caster); } });
S('spreadToAdjacentGroup', () => 'it spreads to the rest of the target group', { onHit: (v, c) => { const bad = c.target.statuses.filter(s => RANDSTAT.includes(s.type)); for (const o of c.C.alive(c.foes)) if (o !== c.target && o.group === c.target.group) for (const s of bad) c.C.addStatus(o, s.type, s.duration || 2, s.power || 4, c.caster); } });

// -- armour / resistance shredding -------------------------------------------------------
inl('armorReduce', v => `strips ${n1(v)} armour`);
inl('armorReduceDuration', v => `armour stays stripped for ${v} rounds`);
S('armorDebuff', v => `strips ${n1(v)} armour`, { onHit: (v, c) => { if (c.target.alive) c.C.addStatus(c.target, 'sunder', c.eff.armorDebuffDur || 3, v, c.caster); } });
S('armorDebuffDur', v => `stripped armour stays off for ${v} rounds`, { onHit: (v, c) => { if (c.target.alive) c.C.addStatus(c.target, 'sunder', v, c.eff.armorDebuff || 5, c.caster); } });
S('armorDebuffOnHit', v => `every hit strips ${n1(typeof v === 'number' ? v : 5)} armour`, { onHit: (v, c) => { if (c.target.alive) c.C.addStatus(c.target, 'sunder', 2, typeof v === 'number' ? v : 5, c.caster); } });
S('mrDebuff', v => `strips ${n1(v)} magic resistance`, { onHit: (v, c) => { const t = c.target; t._mrDebuff = (t._mrDebuff || 0) + v; t._mrDebuffRounds = c.eff.mrDebuffDur || 3; } });
S('mrDebuffDur', v => `the magic resistance stays down for ${v} rounds`, { onHit: (v, c) => { const t = c.target; t._mrDebuff = (t._mrDebuff || 0) + (c.eff.mrDebuff || 5); t._mrDebuffRounds = v; } });
S('fireResistDebuff', v => `the target takes ${pct(v)} more fire damage`, { onHit: (v, c) => { c.target._fireVuln = Math.max(c.target._fireVuln || 0, v); c.target._fireVulnRounds = 3; } });
S('intDebuff', v => `saps ${pct(v)} of the target's Intelligence`, { onHit: (v, c) => { c.target._intDebuff = Math.max(c.target._intDebuff || 0, v); c.target._intDebuffRounds = c.eff.intDebuffDur || 3; } });
S('intDebuffDur', v => `the mind stays fogged for ${v} rounds`, { onHit: (v, c) => { c.target._intDebuff = Math.max(c.target._intDebuff || 0, c.eff.intDebuff || 0.2); c.target._intDebuffRounds = v; } });
inl('atkDebuff', v => `the target is ${pct(v)} less likely to hit`);
inl('dmgDebuff', v => `the target hits ${pct(v)} softer`);
inl('dodgeDebuff', v => `the target is ${n1(v)} easier to hit`);
S('dodgeDebuffDur', v => `it stays easier to hit for ${v} rounds`, { onBuff: (v, c) => { if (c.target.isEnemy) c.C.buff(c.target, { dodgeDebuff: c.eff.dodgeDebuff || 5, duration: v }); } });

// -- buffs on the party ------------------------------------------------------------------
inl('dmgBuff', v => `+${pct(v)} party damage`);
inl('dmgReduct', v => `${pct(v)} less damage taken`);
inl('reflect', v => `reflects ${pct(v)} of what hits you`);
inl('dodgeBuff', v => `+${n1(v)} dodge`);
inl('critBuff', v => `+${n1(v)}% critical chance`);
inl('critChance', v => `+${pct(v)} critical chance`);
inl('spellDmgBuff', v => `+${pct(v)} spell damage`);
inl('armorBonus', v => `+${n1(v)} armour`);
inl('tempHp', v => `+${n1(v)} temporary HP`);
inl('barrier', v => `a barrier worth ${v < 5 ? v + '× your Intelligence' : v}`);
inl('shield', v => `a shield worth ${v.conMult ? v.conMult + '× your Constitution' : v}`);
inl('taunt', () => 'draws enemy attacks onto you');
inl('tauntedBy', () => 'forces the enemy to come for you');
inl('stealth', () => 'slips out of sight');
inl('thorns', v => `returns ${pct(v)} of the damage you take`);
inl('parryCount', v => `parries the next ${v} hit${v > 1 ? 's' : ''}`);
inl('extraAction', v => `${v} extra action${v > 1 ? 's' : ''}`);
inl('initiative', v => `+${n1(v)} initiative`);
S('dodgeBonus', v => `+${pct(v)} dodge`, { onBuff: (v, c) => c.C.buff(c.target, { dodgeBuff: Math.round(v * 100), duration: c.dur }) });
S('hitBonus', v => `+${n1(v)} to hit`, { onBuff: (v, c) => c.C.buff(c.target, { hitBuff: v, duration: c.dur }) });
S('hitBuff', v => `+${n1(v)} to hit`, { onBuff: (v, c) => c.C.buff(c.target, { hitBuff: v, duration: c.dur }) });
S('magicResistBonus', v => `+${n1(v)} magic resistance`, { onBuff: (v, c) => c.C.buff(c.target, { magicResistBonus: v, duration: c.dur }) });
S('attackSpeed', v => `swings ${pct(v)} faster`, { onBuff: (v, c) => { c.target.extraActions = (c.target.extraActions || 0) + 1; } });
S('extraActionDuration', v => `the extra actions keep coming for ${v} rounds`, { onBuff: (v, c) => { c.target.extraActionsEachRound = (c.target.extraActionsEachRound || 0) + 1; c.target.extraActionRounds = v; } });
S('stealthDur', v => `stays hidden for ${v} rounds`, { onBuff: (v, c) => { c.target.stealth = Math.max(c.target.stealth || 0, v); } });
S('drainBuff', v => `what you drain feeds you ${pct(v)} more damage`, { onEnd: (v, c) => { if (c.totalDealt > 0) c.C.buff(c.caster, { dmgBuff: v, duration: 2 }); } });
S('returnMult', v => `whatever you reflect comes back ${v}× as hard`, { onBuff: (v, c) => c.C.buff(c.target, { reflect: (c.eff.reflect || 0.2) * v, duration: c.dur }) });
S('elementImmunityParty', () => 'the whole party shrugs off fire, frost and poison', { onCast: (v, c) => { for (const a of c.C.alive(c.allies)) { a._immune = { ...(a._immune || {}), burn: true, freeze: true, poison: true }; a._immuneRounds = Math.max(a._immuneRounds || 0, c.eff.duration || 3); } } });
S('durationMult', v => `everything it puts up lasts ${v}× as long`, { merge: (v, s) => { if (s.effect?.duration) s.effect.duration = Math.round(s.effect.duration * v); if (s.duration) s.duration = Math.round(s.duration * v); for (const se of s.statusEffects || []) se.duration = Math.round((se.duration ?? 2) * v); } });
S('shieldDur', v => `the shield holds for ${v} rounds`, { onBuff: (v, c) => { const b = c.target.statuses.find(s => s.type === 'barrier'); if (b) b.duration = Math.max(b.duration, v); else c.C.addStatus(c.target, 'barrier', v, Math.round((c.caster.derived?.CON || 10) * 2), c.caster); } });
S('shieldMult', v => `the shield is ${v}× as strong`, { onBuff: (v, c) => { const b = c.target.statuses.find(s => s.type === 'barrier'); if (b) b.power = Math.round(b.power * v); else c.C.addStatus(c.target, 'barrier', c.dur, Math.round((c.caster.derived?.CON || 10) * 2 * v), c.caster); } });

// -- immunities and cleansing ------------------------------------------------------------
const immune = (key, types, label) => S(key, () => `immune to ${label}`, { onBuff: (v, c) => { c.target._immune = { ...(c.target._immune || {}) }; for (const t of types) c.target._immune[t] = true; c.target._immuneRounds = Math.max(c.target._immuneRounds || 0, c.dur || 3); } });
immune('immuneStun', ['stun'], 'stuns');
immune('immuneBleed', ['bleed'], 'bleeding');
immune('immuneBlind', ['blind'], 'blinding');
immune('immuneSlow', ['slow'], 'being slowed');
immune('immuneConfuse', ['confused'], 'confusion');
immune('immuneCC', ['stun', 'freeze', 'sleep', 'confused', 'root', 'dazed', 'silence', 'disarm'], 'anything that stops you acting');
S('immuneRound', v => `untouchable for ${v} round${v > 1 ? '' : ''}`, { onBuff: (v, c) => { c.target.reviveImmune = true; c.target.reviveImmuneRounds = Math.max(c.target.reviveImmuneRounds || 0, v); } });
inl('immune', () => 'untouchable for a moment after coming back');
inl('cleanse', v => (v === 'all' || v === 1 ? 'clears everything harmful' : Array.isArray(v) ? 'clears ' + v.join(' and ') : 'clears one harmful effect'));
inl('cleanseParty', () => 'clears harmful effects from the whole party');
S('cleanseOnActivate', () => 'clears your own afflictions the moment it goes off', { onCast: (v, c) => c.C.cleanse(c.caster, 'all') });

// -- healing and revival -----------------------------------------------------------------
inl('healMult', v => `heals for ${pct(v)} of the stat it scales with`);
inl('healAmount', v => `heals ${n1(v)}`);
inl('healPct', v => `heals ${pct(v)} of max health`);
inl('hpRegen', v => `+${n1(v)} HP a round`);
inl('regenPct', v => `regenerates ${pct(v)} of max health a round`);
inl('regenRounds', v => `regeneration runs for ${v} rounds`);
inl('regenDur', v => `regeneration runs for ${v} rounds`);
inl('regenMult', v => `regeneration is ${v}× as strong`);
inl('reviveHp', v => `brings the fallen back on ${pct(v)} health`);
inl('reviveAll', () => 'brings everyone back');
inl('reviveImmuneRounds', v => `the revived are untouchable for ${v} round${v > 1 ? 's' : ''}`);
S('partyHealPct', v => `heals the whole party ${pct(v)} of their health`, { onEnd: (v, c) => { for (const a of c.C.alive(c.allies)) c.C.healUnit(a, Math.round(a.maxHp * v), c.skill.name, c.caster, 'skill:' + c.skill.id); } });
S('partyRegen', () => 'the whole party regenerates', { onBuff: (v, c) => { for (const a of c.C.alive(c.allies)) c.C.addStatus(a, 'regen', c.eff.regenRounds || c.dur || 3, Math.max(1, c.eff.hpRegen || 3), c.caster); } });
S('splitHeal', () => 'the healing is shared out across the party', { onBuff: (v, c) => { const party = c.C.alive(c.allies); const each = Math.max(1, Math.round((c.healAmount || 10) / Math.max(1, party.length))); for (const a of party) if (a !== c.target) c.C.healUnit(a, each, c.skill.name, c.caster, 'skill:' + c.skill.id); } });
S('hpSacrifice', v => `costs you ${pct(v)} of your own health`, { onCast: (v, c) => { const cost = Math.max(1, Math.round(c.caster.maxHp * v)); c.caster.hp = Math.max(1, c.caster.hp - cost); c.C.emit({ type: 'dot', target: c.caster, status: 'sacrifice', amount: cost, via: 'skill:' + c.skill.id, dtype: 'shadow' }); } });
S('selfDamagePct', v => `costs you ${pct(v)} of your own health`, { onCast: (v, c) => { const cost = Math.max(1, Math.round(c.caster.maxHp * v)); c.caster.hp = Math.max(1, c.caster.hp - cost); c.C.emit({ type: 'dot', target: c.caster, status: 'sacrifice', amount: cost, via: 'skill:' + c.skill.id, dtype: 'shadow' }); } });

// -- mana and cooldowns ------------------------------------------------------------------
inl('mpRestore', v => `gives back ${n1(v)} mana`);
inl('mpOnHit', v => `+${n1(v)} mana a hit`);
inl('mpRegen', v => `+${n1(v)} mana a round`);
inl('mpDrain', v => `drains ${n1(v)} mana`);
inl('lifesteal', v => `heals you for ${pct(v)} of the damage`);
S('mpDrainDamage', v => `the drained mana burns them for ${pct(v)} as much again`, { onHit: (v, c) => { const drained = Math.min(c.target.mp || 0, c.eff.mpDrain || 10); if (drained <= 0) return; c.target.mp -= drained; c.C.applyDamage(c.caster, c.target, Math.round(drained * v), { magic: true, label: 'Mana Burn', via: 'skill:' + c.skill.id, dtype: 'arcane' }); } });
S('mpRestoreOnKill', v => `a kill gives back ${pct(v)} of your mana`, { onHit: (v, c) => { if (!c.target.alive) c.caster.mp = Math.min(c.caster.maxMp, c.caster.mp + Math.round(c.caster.maxMp * v)); } });
S('mpReturn', v => `refunds ${n1(v)} mana`, { onEnd: (v, c) => { c.caster.mp = Math.min(c.caster.maxMp, c.caster.mp + v); } });
S('refundOnKill', () => 'a kill refunds what the skill cost', { onHit: (v, c) => { if (!c.target.alive) c.caster.mp = Math.min(c.caster.maxMp, c.caster.mp + (c.skill.mpCost || 0)); } });
S('cdrOnKill', v => `a kill knocks ${n1(v)} round${v > 1 ? 's' : ''} off your cooldowns`, { onHit: (v, c) => { if (c.target.alive) return; for (const k of Object.keys(c.caster.cooldowns)) { c.caster.cooldowns[k] -= v; if (c.caster.cooldowns[k] <= 0) delete c.caster.cooldowns[k]; } } });
S('breathWeaponFree', () => 'Breath Weapon costs nothing', { onCast: (v, c) => { c.caster._freeSkills = { ...(c.caster._freeSkills || {}), breath_weapon: true }; }, merge: (v, s) => { if (s.id === 'breath_weapon') s.mpCost = 0; } });

// -- crowd control on the enemy side -----------------------------------------------------
inl('actionsLost', v => `the enemy loses ${v} action${v > 1 ? 's' : ''}`);
inl('enemySkipRound', () => 'the enemy loses a round');
inl('enemySkipExtra', v => `the enemy loses ${v} more round`);
inl('enemySkipRounds', v => `the enemy loses ${v} rounds`);
S('trapCount', v => `lays ${v} trap${v > 1 ? 's' : ''}`, { onCast: (v, c) => { for (const e of c.C.alive(c.foes).slice(0, v)) { c.C.addStatus(e, 'root', 2, 0, c.caster); c.C.addStatus(e, 'bleed', 2, 4, c.caster); } } });

// -- stacks, pilfering and odds and ends -------------------------------------------------
inl('buildsFlairStacks', v => `builds ${v} Flair`);
inl('consumesFlairStacks', () => 'spends all your Flair');
inl('keepStacks', v => `keeps ${v} Flair afterwards`);
inl('stackDmgMult', v => `${v}× damage for every stack spent`);
inl('maxStacks', v => `stacks up to ${v} times`);
S('stackingMode', v => (v === 'global' ? 'only one of these can be on a target at a time — a fresh one refreshes it' : 'each attacker gets their own stack'), { onCast: (v, c) => statusMod(c.caster, 'stackMode', v === 'global' ? 0 : 1, 'max') });
S('persistStacks', () => 'your stacks carry over between fights', { onCast: (v, c) => { c.caster._persistStacks = true; } });
S('requiresDeadEnemy', () => 'needs a body on the floor', { gate: (v, c) => c.C.enemies.some(e => !e.alive) });
S('pilferBuff', () => "steals one of the enemy's blessings — and the next spell they try to cast", { onCast: (v, c) => { c.caster._pilfering = (c.caster._pilfering || 0) + 1; }, onHit: (v, c) => { const b = (c.target.buffs || [])[0]; if (!b) return; c.target.buffs = c.target.buffs.filter(x => x !== b); c.C.recomputeBuffs(c.target); c.C.buff(c.caster, { ...b, duration: (c.eff.pilferBonusDuration || 0) + (b.duration || 2) }); } });
S('pilferCount', v => `steals ${v} blessings, and as many spells out of the air`, { onCast: (v, c) => { c.caster._pilfering = (c.caster._pilfering || 0) + v; }, onHit: (v, c) => { for (let i = 0; i < v; i++) { const b = (c.target.buffs || [])[0]; if (!b) break; c.target.buffs = c.target.buffs.filter(x => x !== b); c.C.recomputeBuffs(c.target); c.C.buff(c.caster, { ...b, duration: b.duration || 2 }); } } });
S('pilferBonusDuration', v => `stolen blessings last ${v} rounds longer`, { onHit: (v, c) => { for (const b of c.caster.buffs || []) b.duration += v; } });
S('pilferDamagePerBuff', v => `+${pct(v)} damage for every blessing you have stolen`, { dmgMult: (v, c) => 1 + v * (c.caster.buffs?.length || 0) });
S('unlocksCompanion', v => `unlocks the ${String(v).replace('pet_', '').replace(/_/g, ' ')} companion`, { unlock: v => v });

// ───────────────────────────── the road weapons (round 14) ─────────────────────────────
// These touch the systems Emberveil 2 added on top of the original: travel legs, rations and
// exhaustion, the night-attack roll, rest, the damage meter's per-item kill counts, memories
// and feelings, named enemies and nemeses, companions and vehicles.
//
// World hooks (called by game.js through fireWorld / worldSum — see the dispatchers below):
//   legs(v, game, hero)                 extra node moves for today
//   nightChance(v, game, hero)          added to the night-attack chance (negative = safer)
//   exhaustionEase(v, game, hero)       share of the exhaustion penalty that is ignored
//   nemesisChance(v, game, hero)        added to the chance a beaten leader becomes a nemesis
//   onLeg(v, game, hero)                after every node move
//   onRest(v, game, hero, out)          during a night's rest (out is the rest report)
//   onWin(v, game, hero, ctx)           after a won fight (ctx: { enc, node, kills, weapon })

/** The weapon slot the effect is riding on (these are all weapon properties). */
const wpn = u => u?.equipment?.weapon || null;
const killsOf = (C, u) => (C?.ctx?.meter?.itemStats?.[wpn(u)?.id]?.kills) || 0;

// -- travel, supplies and the night watch ------------------------------------------------
def('affix', 'cond_forageRation', v => `after a won fight there is a ${pct(v)} chance of finding a day's food`, {
  onWin: (v, game, hero) => { if (game.rng() < v) { game.supplies.ration = (game.supplies.ration || 0) + 1; game.foraged = (game.foraged || 0) + 1; return { ration: 1 }; } },
});
def('affix', 'cond_nightWard', v => `a lit head keeps raiders off: night attacks are ${pct(v)} less likely`, {
  nightChance: v => -v,
});
def('affix', 'cond_extraLeg', v => `every ${ni(v)} days it finds a shortcut — one extra move that day`, {
  legs: (v, game) => (game.day % Math.max(1, Math.round(v)) === 0 ? 1 : 0),
});
def('affix', 'cond_roadFind', v => `${pct(v)} chance of turning up something worth taking on each move`, {
  onLeg: (v, game, hero) => {
    if (game.rng() >= v) return; const it = game.loot.generate(game.rng.pick(['dagger', 'ring', 'necklace', 'light_chest', 'sword']), 'magic', 'medium', { rng: game.rng });
    if (!it) return; game.inventory.push(it); game.logLoot(it, { holder: hero.id }); return { item: it };
  },
});
def('affix', 'cond_easeExhaustion', v => `a walking staff: going hungry costs you ${pct(v)} less`, { exhaustionEase: v => v });
def('affix', 'cond_watch', () => 'stands the night watch — no ambush at all, but the watcher eats an extra ration', {
  nightChance: (v, game) => ((game.supplies.ration || 0) > 0 ? -1 : 0),
  onRest: (v, game, hero, out) => { if ((game.supplies.ration || 0) > 0) { game.supplies.ration--; out.watch = (out.watch || 0) + 1; return { watch: true }; } },
});

// -- the damage meter: weapons that grow with their kill count ----------------------------
def('affix', 'cond_killGrowth', v => `+${pct(v)} damage for every ten kills on it (up to +25%)`, {
  dmgOut: (v, C, self) => 1 + Math.min(0.25, Math.floor(killsOf(C, self) / 10) * v),
});
def('affix', 'cond_critFromWounds', v => `+${n1(v)}% critical chance for every tenth of your health already spent`, {
  critBonus: (v, C, self) => v * Math.floor((1 - self.hp / Math.max(1, self.maxHp)) * 10),
});

// -- elemental brands: the second hit shows its own projectile and impact on the stage -----
const brand = (key, dtype, status, label, statusDesc) => def('affix', 'cond_brand' + key, v => `your hits strike again for ${pct(v)} ${label.toLowerCase()} damage${statusDesc ? ` and can ${statusDesc}` : ''}`, {
  onHit: (v, C, self, t, o) => {
    if (!o.isAttack || !t.alive || o.dealt <= 0) return; const extra = Math.max(1, Math.round(o.dealt * v));
    C.applyDamage(self, t, extra, { magic: true, label, via: 'affix:cond_brand' + key, dtype, noReflect: true });
    if (status && t.alive && R(C) < 0.35) C.addStatus(t, status, 2, Math.max(3, Math.round(extra * 0.5)), self);
  },
});
brand('Fire', 'fire', 'burn', 'Ember Brand', 'set the target alight');
brand('Ice', 'ice', 'slow', 'Rime Brand', 'slow the target');
brand('Shadow', 'shadow', 'curse', 'Veil Brand', 'curse the target');
brand('Holy', 'holy', 'holy_burn', 'Dawn Brand', 'burn the unclean');
brand('Lightning', 'lightning', 'dazed', 'Storm Brand', 'leave the target reeling');
brand('Nature', 'nature', 'poison', 'Bramble Brand', 'poison the target');
brand('Arcane', 'arcane', 'marked', 'Star Brand', 'mark the target');

// -- statuses the party did not used to see -----------------------------------------------
def('affix', 'cond_sunderOnHit', v => `${pct(v)} chance to break a target's armour open`, {
  onHit: (v, C, self, t, o) => { if (o.isAttack && t.alive && R(C) < v) C.addStatus(t, 'sunder', 2, 10, self); },
});

// -- named enemies and nemeses -------------------------------------------------------------
def('affix', 'cond_dmgVsNamed', v => `+${pct(v)} damage against champions, named enemies and bosses`, {
  dmgOut: (v, C, self, t) => (t?.champion || t?.named || t?.boss || t?.nemesis ? 1 + v : 1),
});
def('affix', 'cond_nemesisMark', v => `+${pct(v)} damage, but anyone who beats you takes it personally and comes back for more`, {
  dmgOut: (v, C, self) => 1 + v,
  nemesisChance: v => Math.min(0.6, v * 2),
});

// -- companions and vehicles ---------------------------------------------------------------
def('affix', 'cond_companionExtra', () => 'your companion gets a second go every round', {
  combatStart: (v, C, self) => { for (const a of alliesOf(C, self)) if (a.isCompanion) a.extraActionsEachRound = (a.extraActionsEachRound || 0) + 1; },
});
def('affix', 'cond_companionFury', v => `your companion starts every fight furious (+${pct(v)} damage)`, {
  combatStart: (v, C, self) => { for (const a of alliesOf(C, self)) if (a.isCompanion) C.addStatus(a, 'fury', 99, Math.round(v * 100), self); },
});
def('affix', 'cond_vehicleDmg', v => `+${pct(v)} damage while the party is travelling with a vehicle`, {
  dmgOut: (v, C, self) => (C.ctx?.vehicle && C.ctx.vehicle !== 'none' ? 1 + v : 1),
});

// -- memories and feelings -----------------------------------------------------------------
def('affix', 'cond_killMemory', () => 'every killing blow with it is remembered, and told again around the fire', {
  onWin: (v, game, hero, ctx) => {
    if (!(ctx.kills > 0)) return; const w = wpn(hero);
    game.remember({ type: 'deed', participants: [hero.id], bindings: { hero: { id: hero.id }, place: { id: game.zoneId } }, details: { what: `cut down ${ctx.kills === 1 ? 'one of them' : ctx.kills + ' of them'} with the ${w?.baseName || 'blade'}`, weapon: w?.name, itemName: w?.name, kills: ctx.kills } });
    return { memory: w?.name };
  },
});
def('affix', 'cond_guardBond', () => 'you put yourself between the party and the worst of it; they remember that', {
  dmgIn: () => 1.08,
  onWin: (v, game, hero) => { let n = 0; for (const o of game.party) if (o !== hero && o.alive) { game.relations.get(o.id, hero.id).apply('bravery_seen', { now: game.now }); n++; } return { liked: n }; },
});

// ───────────────────────────── the road weapons: legendary powers ─────────────────────────
def('legendary', 'camp_mend', 'A night beside it mends the party for 15% of their health.', {
  onRest: (v, game, hero, out) => { let healed = 0; for (const h of game.party) if (h.alive) { const g = Math.round(h.maxHp * 0.15); const before = h.hp; h.hp = Math.min(h.maxHp, h.hp + g); healed += h.hp - before; } out.healed = (out.healed || 0) + healed; return { healed }; },
});
def('legendary', 'forage_feast', 'A won fight yields two days of food, and the party remembers eating well.', {
  onWin: (v, game) => {
    game.supplies.ration = (game.supplies.ration || 0) + 2; game.foraged = (game.foraged || 0) + 2;
    game.remember({ type: 'meal', participants: game.partyIds(), bindings: { food: { id: 'trail_ration' }, place: { id: game.zoneId } }, details: { quality: 'good' } });
    return { ration: 2 };
  },
});
def('legendary', 'naming_kills', 'At fifty kills the blade earns a name, and the party never stops telling the story.', {
  onWin: (v, game, hero, ctx) => {
    const w = wpn(hero); if (!w) return; const kills = game.meter?.itemStats?.[w.id]?.kills || 0;
    if (kills < 50 || w.earnedName) return; const N = game.named();
    const syl = N.syllables?.human || ['Mor', 'Vel', 'Kar']; const suf = N.suffixes?.human || ['wick', 'gan'];
    w.earnedName = `${game.rng.pick(syl)}${game.rng.pick(suf)}`; w.name = `${w.earnedName}, ${w.baseName}`;
    game.remember({ type: 'deed', participants: game.partyIds(), bindings: { item: { id: w.baseKey }, place: { id: game.zoneId } }, details: { deed: `named the blade ${w.earnedName} after fifty kills`, itemName: w.name } });
    return { named: w.earnedName };
  },
});
def('legendary', 'road_cache', 'Every move turns up a small cache of coin.', {
  onLeg: (v, game) => { const g = 8 + Math.round(game.rng() * 14 * Math.max(1, game.act)); game.gold += g; return { gold: g }; },
});
def('legendary', 'companion_might', 'Your companion hits 40% harder, carries a quarter more health and starts every fight furious.', {
  combatStart: (v, C, self) => {
    for (const a of alliesOf(C, self)) if (a.isCompanion) {
      if (!a._mightApplied) { a._mightApplied = true; a.dmg = a.dmg.map(x => Math.round(x * 1.4)); a.maxHp = Math.round(a.maxHp * 1.25); a.hp = Math.min(a.maxHp, Math.round(a.hp * 1.25)); }
      C.addStatus(a, 'fury', 99, 25, self);
    }
  },
});
def('legendary', 'strip_modifier', 'The sight of it strips one trick from the biggest thing in the room.', {
  combatStart: (v, C, self) => {
    const boss = foesOf(C, self).filter(e => e.champion || e.named || e.boss).sort((a, b) => b.maxHp - a.maxHp)[0]; if (!boss) return;
    const list = boss.mods?.length ? boss.mods : boss.championMods; if (!list?.length) return;
    const gone = list.shift(); refreshFx(boss); C.emit({ type: 'status', source: self, target: boss, status: 'weaken', duration: 99, power: 10, label: `loses ${gone}`, via: 'legendary:strip_modifier' });
    C.addStatus(boss, 'weaken', 99, 10, self);
  },
});
def('legendary', 'hated_blade', 'It hits a quarter harder, and the party resents every swing.', {
  dmgOut: () => 1.25,
  onWin: (v, game, hero) => { let n = 0; for (const o of game.party) if (o !== hero && o.alive) { game.relations.get(o.id, hero.id).apply('cruelty_seen', { now: game.now }); n++; } return { disliked: n }; },
});
def('legendary', 'kill_ledger', 'It keeps its own count: +1% damage every five kills, up to +60%.', {
  dmgOut: (v, C, self) => 1 + Math.min(0.6, Math.floor(killsOf(C, self) / 5) * 0.01),
});
def('legendary', 'curse_spreads', 'A kill spills the curse over everything still standing.', {
  onKill: (v, C, self, t) => { for (const e of foesOf(C, self)) if (e !== t) { C.addStatus(e, 'curse', 2, 20, self); C.applyDamage(self, e, Math.round(8 + (self.derived?.INT || 10) * 0.4), { magic: true, label: 'Veil Spill', via: 'legendary:curse_spreads', dtype: 'shadow' }); } },
});
def('legendary', 'free_move', 'The road opens: one extra move every day.', { legs: () => 1 });
def('legendary', 'nemesis_hunter', 'Double damage to anything with a grudge, and killing one mends the whole party.', {
  dmgOut: (v, C, self, t) => (t?.nemesis || t?.named ? 2 : 1),
  onKill: (v, C, self, t) => { if (!(t.nemesis || t.named)) return; for (const a of alliesOf(C, self)) C.healUnit(a, a.maxHp, 'grudge settled', self, 'legendary:nemesis_hunter'); },
});
def('legendary', 'no_night_raids', 'Planted and lit, nothing comes near the camp at all — even with an empty larder.', {
  nightChance: () => -1,
});

// ═══════════════════════════ dispatchers (what the engine calls) ═══════════════════════════

/** Everything that is permanently attached to a fighter: legendary powers, conditional
 *  affixes, champion modifiers, named-enemy modifiers. Cached as `unit._fx` per fight. */
export function actorFx(unit) {
  const out = [];
  const add = (id, v) => { const e = EFFECTS[id]; if (e) out.push({ e, v }); };
  for (const id of unit.derived?.legendary || []) add('legendary:' + id, 1);
  const bag = {};
  for (const it of Object.values(unit.equipment || {})) for (const a of it?.affixes || []) if (typeof a.value === 'number' && String(a.stat).startsWith('cond_')) bag[a.stat] = (bag[a.stat] || 0) + a.value;
  for (const [k, v] of Object.entries(bag)) add('affix:' + k, v);
  for (const id of unit.championMods || []) add('champion:' + id, 1);
  for (const id of unit.mods || []) add('named:' + id, 1);
  return out;
}
export function refreshFx(unit) { unit._fx = actorFx(unit); return unit._fx; }

/** Everything the world hooks can see: the effects riding on a unit's *equipment* (weapons here),
 *  paired with the hero wearing them. Used by game.js for travel, rest, supplies and night attacks. */
export function worldFx(units) {
  const out = [];
  for (const u of units || []) {
    if (!u) continue;
    const ids = new Set(u.derived?.legendary || []);
    for (const it of Object.values(u.equipment || {})) if (it?.legendaryEffectId) ids.add(it.legendaryEffectId);
    for (const id of ids) { const e = EFFECTS['legendary:' + id]; if (e) out.push({ e, v: 1, unit: u }); }
    const bag = {};
    for (const it of Object.values(u.equipment || {})) for (const a of it?.affixes || []) if (typeof a.value === 'number' && String(a.stat).startsWith('cond_')) bag[a.stat] = (bag[a.stat] || 0) + a.value;
    for (const [k, v] of Object.entries(bag)) { const e = EFFECTS['affix:' + k]; if (e) out.push({ e, v, unit: u }); }
  }
  return out;
}
/** Run a world hook for every unit that carries it. Returns [{ id, hero, result }] for anything that fired. */
export function fireWorld(hook, game, units, ...args) {
  const fired = [];
  for (const { e, v, unit } of worldFx(units)) { const f = e[hook]; if (typeof f !== 'function') continue; try { const r = f(v, game, unit, ...args); if (r) fired.push({ id: e.id, hero: unit, result: r }); } catch { /* a broken weapon never breaks the road */ } }
  return fired;
}
/** Sum of a numeric world hook (night-attack chance, extra moves, exhaustion relief…). */
export function worldSum(hook, game, units, ...args) {
  let s = 0; for (const { e, v, unit } of worldFx(units)) { const f = e[hook]; if (typeof f !== 'function') continue; try { const r = f(v, game, unit, ...args); if (typeof r === 'number' && isFinite(r)) s += r; } catch { /* ignore */ } }
  return s;
}
/** Biggest value of a numeric world hook (things that do not stack, like exhaustion relief). */
export function worldMax(hook, game, units, ...args) {
  let m = 0; for (const { e, v, unit } of worldFx(units)) { const f = e[hook]; if (typeof f !== 'function') continue; try { const r = f(v, game, unit, ...args); if (typeof r === 'number' && isFinite(r)) m = Math.max(m, r); } catch { /* ignore */ } }
  return m;
}
/** Run a void hook on every effect attached to `self`. */
export function fireTrait(hook, C, self, ...args) {
  for (const { e, v } of self._fx || []) { const f = e[hook]; if (typeof f === 'function') { try { f(v, C, self, ...args); } catch (err) { C?.emit?.({ type: 'error', effect: e.id, hook, message: String(err) }); } } }
}
/** Product of every multiplier hook (1 when nothing applies). */
export function traitMult(hook, C, self, ...args) {
  let m = 1; for (const { e, v } of self._fx || []) { const f = e[hook]; if (typeof f === 'function') { const r = f(v, C, self, ...args); if (typeof r === 'number' && isFinite(r)) m *= r; } } return m;
}
/** Sum of every additive hook. */
export function traitSum(hook, C, self, ...args) {
  let s = 0; for (const { e, v } of self._fx || []) { const f = e[hook]; if (typeof f === 'function') { const r = f(v, C, self, ...args); if (typeof r === 'number' && isFinite(r)) s += r; } } return s;
}
/** Stat-time hooks: called from rules.derive with the summed equipment bonuses. */
export function applyDeriveEffects(hero, d, bonuses = {}) {
  for (const [k, v] of Object.entries(bonuses)) { const e = EFFECTS['affix:' + k]; if (e?.derive && typeof v === 'number') e.derive(v, d, hero); }
  return d;
}
/** Champion / named modifiers applied once at spawn. Returns the ids that stuck. */
export function applySpawnMods(unit, group, ids = []) {
  const kept = [];
  for (const id of ids) { const e = EFFECTS[`${group}:${id}`]; if (!e) continue; kept.push(id); if (e.spawn) e.spawn(unit); }
  if (group === 'champion') unit.championMods = kept; else unit.mods = kept;
  return kept;
}
export const CHAMPION_MODS = Object.keys(EFFECTS).filter(k => k.startsWith('champion:')).map(k => k.slice(9));
export const NAMED_MODS = Object.keys(EFFECTS).filter(k => k.startsWith('named:')).map(k => k.slice(6));

/** The effect entries a merged skill carries (its `effect` bag plus the top-level keys). */
export function skillFx(skill) {
  const out = []; const seen = new Set();
  const push = (k, v) => { const e = EFFECTS['skill:' + k]; if (e && !seen.has(k) && v !== undefined && v !== null && v !== false) { seen.add(k); out.push({ e, v }); } };
  for (const [k, v] of Object.entries(skill.effect || {})) push(k, v);
  for (const k of ['aoe', 'armorPen', 'bonusVsDemon', 'bonusVsUndead', 'buildsFlairStacks', 'consumesFlairStacks', 'damageStat', 'hits', 'lifesteal', 'requiresDeadEnemy', 'stackBonusPerDeath', 'statusEffects', 'maxStacks', 'stackingMode', 'damageCategory', 'damageType', 'healStat', 'cooldown', 'damageMult', 'healMult', 'healAmount', 'mpCost', 'target', 'duration']) push(k, skill[k]);
  return out;
}
export function runSkill(fx, hook, c) {
  for (const { e, v } of fx) { const f = e[hook]; if (typeof f === 'function') { try { f(v, c); } catch (err) { c.C?.emit?.({ type: 'error', effect: e.id, hook, message: String(err) }); } } }
}
export function skillMult(fx, hook, c) { let m = 1; for (const { e, v } of fx) { const f = e[hook]; if (typeof f === 'function') { const r = f(v, c); if (typeof r === 'number' && isFinite(r)) m *= r; } } return m; }
export function skillSum(fx, hook, c) { let s = 0; for (const { e, v } of fx) { const f = e[hook]; if (typeof f === 'function') { const r = f(v, c); if (typeof r === 'number' && isFinite(r)) s += r; } } return s; }
export function skillGate(fx, c) { for (const { e, v } of fx) if (typeof e.gate === 'function' && !e.gate(v, c)) return false; return true; }
export function skillTargetOverride(fx, c) { for (const { e, v } of fx) if (typeof e.pickTargets === 'function') { const r = e.pickTargets(v, c); if (Array.isArray(r) && r.length) return r; } return null; }
/** Called at the end of rules.mergeSkill so upgrade keys can rewrite the skill itself. */
export function applySkillMerge(skill, hero) {
  for (const { e, v } of skillFx(skill)) if (typeof e.merge === 'function') { try { e.merge(v, skill, hero); } catch { /* never break skill loading */ } }
  return skill;
}

/** Status metadata the combat loop reads (tick kinds, gates, multipliers). */
/** skills.json writes "confuse" where the engine calls the status "confused". */
export const STATUS_ALIAS = { confuse: 'confused' };
export function normalizeStatus(type) { return STATUS_ALIAS[type] || type; }
export function statusDef(type) { return EFFECTS['status:' + normalizeStatus(type)] || null; }
export const STATUS_IDS = Object.keys(EFFECTS).filter(k => k.startsWith('status:')).map(k => k.slice(7));

/** Plain-language line for any registry id. Falls back to the raw value so nothing is blank. */
export function describeId(id, value = 1) {
  const e = EFFECTS[id]; if (!e) return null;
  try { return e.desc(value); } catch { return e.id; }
}
export function describeAffixStat(stat, value) { return describeId('affix:' + stat, value); }
export function describeSkillKey(key, value) { return describeId('skill:' + key, value); }
export function describeLegendary(id) { return describeId('legendary:' + id, 1); }
