// Turn-based auto-battle rebuilt from Emberveil's simulator: initiative order each round, CC gates, hero + enemy AI,
// skills with mp/cooldown/talents/upgrades, hit → block → armour curve → resistAll → dmgReduct → marked → barrier → HP,
// statuses (DoTs, stun/freeze/sleep/confused/dazed/blind/slow/marked/barrier/regen/sunder/curse/silence), passives,
// legendary effects, attack speed, revive. Pure logic: `round()` returns an event list the UI animates.
import { derive, mergeSkill, HEALER_CLASSES } from './rules.js';
const DOT = ['burn', 'poison', 'bleed'];
export class Combat {
  /** heroes: hero objects (with equipment); enemies: makeEnemy() instances; ctx: { skills, spells, loot, rng, act } */
  constructor(heroes, enemies, ctx) {
    this.heroes = heroes; this.enemies = enemies; this.ctx = ctx; this.rng = ctx.rng || Math.random; this.round_ = 0; this.over = false; this.result = null; this.log = []; this.order = [];
    for (const h of heroes) { h.derived = derive(h, ctx.loot); h.statuses = []; h.cooldowns = {}; h.dmgReduct = 0; h.dmgBuff = 0; h.buffs = []; h.alive = h.hp > 0; h.side = 'party'; h._cheatDeathUsed = false; h._legendaryInitBonus = 0; }
    for (const e of enemies) { e.statuses = []; e.cooldowns = {}; e.dmgReduct = 0; e.dmgBuff = 0; e.buffs = []; e.alive = true; e.side = 'enemy'; }
    for (const h of heroes) for (const id of h.derived.legendary) { if (id === 'speed_combat_init') h._legendaryInitBonus += 8; if (id === 'burn_extend') h.burnExtend = 2; }
  }
  alive(list) { return list.filter(c => c.alive); }
  has(c, type) { return c.statuses.some(s => s.type === type); }
  addStatus(c, type, duration = 2, power = 4, source = null) { if (type === 'stun' && c.stunImmune > 0) return false; if (['stun', 'freeze', 'sleep'].includes(type) && c.boss && this.rng() < 0.5) return false; const ex = c.statuses.find(s => s.type === type && !DOT.includes(type)); if (ex) { ex.duration = Math.max(ex.duration, duration); ex.power = Math.max(ex.power, power); return true; } if (DOT.includes(type) && c.statuses.filter(s => s.type === type).length >= 5) return false; c.statuses.push({ type, duration, power, source }); return true; }
  removeStatus(c, type) { c.statuses = c.statuses.filter(s => s.type !== type); }
  cleanse(c, what) { const bad = ['burn', 'poison', 'bleed', 'stun', 'freeze', 'sleep', 'confused', 'dazed', 'blind', 'slow', 'marked', 'sunder', 'curse', 'silence', 'disarm', 'root']; c.statuses = c.statuses.filter(s => !(what === 'all' || what === 1 ? bad.includes(s.type) : (Array.isArray(what) ? what : [what]).includes(s.type))); }
  emit(ev) { this.log.push(ev); this.events.push(ev); return ev; }
  // ---------- damage pipeline
  hitChance(att, tgt) { const raw = (att.derived?.hit ?? att.hit) - (tgt.derived?.dodge ?? tgt.dodge); let c = raw <= 95 ? raw : 95 + (raw - 95) * 0.2; const floor = tgt.boss ? 6 : tgt.champion ? 4 : 3; c = Math.max(5, Math.min(100 - floor, c)); if (this.has(att, 'blind')) c = Math.max(5, Math.round(c * 0.5)); if (this.has(att, 'dazed')) c = Math.max(5, c - 25); return c; }
  mitigate(tgt, raw, { magic = false, trueDmg = false, armorPen = 0, source = null } = {}) {
    let dmg = raw; const tags = [];
    if (!trueDmg && !magic) { const bc = tgt.derived?.blockChance ?? tgt.blockChance ?? 0; if (bc > 0 && this.rng() < bc) { dmg = tgt.isEnemy ? Math.round(dmg * 0.5) : Math.max(0, dmg - (tgt.derived?.blockPower ?? 0)); tags.push('blocked'); } }
    if (!trueDmg) { let ar = magic ? (tgt.derived?.magicResist ?? tgt.magicResist ?? 0) : (tgt.derived?.armor ?? tgt.armor ?? 0); const sunder = tgt.statuses.filter(s => s.type === 'sunder').reduce((s, x) => s + x.power, 0); ar = Math.max(0, ar * (1 - (source?._tempArmorPen || 0)) * (1 - armorPen) - sunder); const dr = Math.min(0.95, ar / (ar + 100)); dmg = Math.round(dmg * (1 - dr)); }
    if (tgt.derived?.resistAll) dmg = Math.round(dmg * (1 - tgt.derived.resistAll / 100));
    if (tgt.dmgReduct) dmg = Math.round(dmg * (1 - Math.min(0.9, tgt.dmgReduct)));
    if (this.has(tgt, 'marked')) dmg = Math.round(dmg * 1.3);
    return { dmg: Math.max(0, dmg), tags };
  }
  /** Apply damage to a target (after hit roll). Returns dealt. */
  applyDamage(src, tgt, amount, { magic = false, trueDmg = false, armorPen = 0, crit = false, label = null, noReflect = false } = {}) {
    if (!tgt.alive) return 0; if (tgt.reviveImmune) { this.emit({ type: 'immune', target: tgt }); return 0; }
    const { dmg, tags } = this.mitigate(tgt, amount, { magic, trueDmg, armorPen, source: src }); let left = dmg;
    for (const b of tgt.statuses.filter(s => s.type === 'barrier')) { const take = Math.min(b.power, left); b.power -= take; left -= take; if (left <= 0) break; } tgt.statuses = tgt.statuses.filter(s => !(s.type === 'barrier' && s.power <= 0 && !s.fromMagicShield));
    let dealt = left; if (dealt > 0 && !tgt.isEnemy && !tgt._cheatDeathUsed && tgt.derived?.legendary?.includes('cheat_death_once') && tgt.hp - dealt <= 0) { dealt = tgt.hp - 1; tgt._cheatDeathUsed = true; tags.push('cheated death'); }
    tgt.hp = Math.max(0, tgt.hp - dealt); if (dealt > 0) this.removeStatus(tgt, 'sleep');
    this.emit({ type: 'damage', source: src, target: tgt, amount: dealt, crit, magic, tags, label });
    if (src && src.alive && dealt > 0) {
      const d = src.derived; if (d) { if (d.lifeSteal) { const h = Math.floor(dealt * d.lifeSteal); if (h > 0) { src.hp = Math.min(src.maxHp, src.hp + h); this.emit({ type: 'heal', target: src, amount: h, label: 'life steal' }); } } if (d.manaSteal) src.mp = Math.min(src.maxMp, src.mp + Math.floor(dealt * d.manaSteal)); if (d.legendary?.includes('mana_on_attack')) src.mp = Math.min(src.maxMp, src.mp + 3); if (d.burnOnHit && this.rng() < d.burnOnHit) this.addStatus(tgt, 'burn', 3, Math.max(3, Math.floor(d.INT * 0.15)), src); if (crit && d.poisonOnCrit && this.rng() < d.poisonOnCrit) this.addStatus(tgt, 'poison', 3, Math.max(3, Math.floor(d.INT * 0.2)), src); if (crit && d.legendary?.includes('crit_bleed_5')) this.addStatus(tgt, 'bleed', 3, 8, src); if (crit && d.legendary?.includes('critical_armorpen')) { tgt._tempArmorPen = 0.3; tgt._tempArmorPenRounds = 1; } }
      const thorns = (tgt.derived?.thorns || 0) + (tgt.reflect || 0); if (thorns > 0 && !noReflect) { const r = Math.max(1, Math.round(dealt * thorns)); this.applyDamage(tgt, src, r, { trueDmg: true, label: 'thorns', noReflect: true }); }
    }
    if (tgt.hp <= 0 && tgt.alive) this.kill(src, tgt);
    return dealt;
  }
  kill(src, tgt) { tgt.alive = false; tgt.statuses = []; this.emit({ type: tgt.isEnemy ? 'kill' : 'down', source: src, target: tgt }); if (src?.alive && src.derived) { const d = src.derived; if (d.hpOnKill) src.hp = Math.min(src.maxHp, src.hp + d.hpOnKill); if (d.manaOnKill) src.mp = Math.min(src.maxMp, src.mp + d.manaOnKill); if (d.legendary?.includes('kill_party_heal')) for (const a of this.alive(this.heroes)) { const h = Math.round(tgt.maxHp * 0.1); a.hp = Math.min(a.maxHp, a.hp + h); } if (d.legendary?.includes('rally_on_kill')) for (const a of this.alive(this.heroes)) this.addStatus(a, 'rally', 1, 0.15); if (d.legendary?.includes('dragon_fury_breath')) for (const e of this.alive(this.enemies)) if (e !== tgt) { this.applyDamage(src, e, Math.round(20 + d.STR), { magic: true, label: 'Dragon Breath' }); this.addStatus(e, 'burn', 2, 6, src); } } if (tgt.isEnemy && this.has(tgt, 'curse')) { const o = this.rng() < 1 ? this.alive(this.enemies)[0] : null; if (o) this.addStatus(o, 'curse', 2, 20); } }
  rollDamage(c) { if (c.isEnemy) return c.dmg[0] + Math.floor(this.rng() * (c.dmg[1] - c.dmg[0] + 1)); const d = c.derived; return d.dmgMin + Math.floor(this.rng() * (d.dmgMax - d.dmgMin + 1)); }
  dmgBuffMult(c) { let m = 1 + (c.dmgBuff || 0); for (const s of c.statuses) if (s.type === 'rally') m += s.power || 0.15; if (this.has(c, 'curse')) m *= 1 - Math.max(...c.statuses.filter(s => s.type === 'curse').map(s => s.power)) / 100; return m; }
  /** Basic attack. */
  attack(att, tgt) {
    if (!tgt?.alive) return; const chance = this.hitChance(att, tgt); if (this.rng() * 100 >= chance) { this.emit({ type: 'miss', source: att, target: tgt }); return; }
    let raw = this.rollDamage(att) * this.dmgBuffMult(att); let crit = false; const cc = att.derived?.critChance ?? 5; if (this.rng() * 100 < cc) { crit = true; raw *= att.derived?.critDamage ?? 1.5; }
    const magic = att.isEnemy ? false : att.derived.cat === 'magic'; this.emit({ type: 'attack', source: att, target: tgt, crit });
    this.applyDamage(att, tgt, Math.round(raw), { magic, armorPen: att.derived?.armorPen || 0, crit });
    if (att.isEnemy && att.statusOnHit && tgt.alive) for (const so of att.statusOnHit) if (this.rng() < (so.chance ?? 0.5)) this.addStatus(tgt, so.type, so.duration ?? 2, so.power ?? 4, att);
    const w = att.equipment?.weapon; if (w && tgt.alive) { if (w.stunChance && this.rng() < w.stunChance) this.addStatus(tgt, 'stun', 1, 0, att); if (w.bleedChance && this.rng() < w.bleedChance) this.addStatus(tgt, 'bleed', 2, Math.max(3, Math.floor(att.derived.INT * 0.15)), att); if (w.burnChance && this.rng() < w.burnChance) this.addStatus(tgt, 'burn', 2, Math.max(3, Math.floor(att.derived.INT * 0.15)), att); }
    if (att.derived?.chainOnHit && this.rng() < att.derived.chainOnHit) { const o = this.alive(this.enemies).find(e => e !== tgt); if (o) this.applyDamage(att, o, Math.round(raw * 0.5), { magic: true, label: 'chain' }); }
  }
  // ---------- skills
  skillTargets(skill, caster, foes, allies) {
    const a = this.alive(foes); const primary = this.pickFoe(caster, a); if (!primary) return []; const aoe = skill.aoe || 'single'; const n = k => a.slice(0, Math.min(a.length, k));
    if (aoe === 'all' || aoe === 'row' || aoe === 'row2' || aoe === 'pierce_row') return a; if (aoe === 'group') return a.filter(e => e.group === primary.group); if (aoe === 'adjacent') return [primary, ...a.filter(e => e !== primary && e.group === primary.group)].slice(0, 2); if (aoe === 'adjacent2' || aoe === 'group2') return [primary, ...a.filter(e => e !== primary && e.group === primary.group)].slice(0, 4);
    if (aoe === 'chain' || aoe === 'chain3') return [primary, ...a.filter(e => e !== primary)].slice(0, skill.effect?.chainTargets || skill.effect?.targets || 3); if (aoe === 'random3' || aoe === 'random4') { const k = skill.effect?.targets || (aoe === 'random3' ? 3 : 4); const out = []; for (let i = 0; i < k; i++) out.push(a[Math.floor(this.rng() * a.length)]); return out; } if (aoe === 'multi3' || aoe === 'multi4') return Array(skill.effect?.bolts || (aoe === 'multi3' ? 3 : 4)).fill(primary); return [primary];
  }
  expectedTargets(skill, n) { const aoe = skill.aoe || 'single'; if (aoe === 'all' || aoe === 'row' || aoe === 'row2' || aoe === 'pierce_row') return n; if (['group2', 'random4', 'multi4', 'adjacent2'].includes(aoe)) return Math.min(n, 4); if (['group', 'chain', 'chain3', 'random3', 'multi3'].includes(aoe)) return Math.min(n, 3); if (aoe === 'adjacent') return Math.min(n, 2); return 1; }
  skillDamage(caster, skill) { const w = caster.equipment?.weapon; const mid = w?.dmg ? (w.dmg[0] + w.dmg[1]) / 2 : 1.5; const d = caster.derived; const magic = skill.type === 'magic' || skill.type === 'heal' || skill.damageCategory === 'magic'; const power = magic ? d.spellPower : Math.round(d.STR * 1.5) * 0.05; const mult = (skill.damageMult ?? 1) * 0.95 * (magic ? 0.78 : 1) * (1 + (skill.effect?.spellDmgBuff && caster.spellDmgBuff ? caster.spellDmgBuff : 0)) * (caster.spellDmgBuff && magic ? 1 + caster.spellDmgBuff : 1); return Math.round(mult * mid * (1 + power)) + (magic ? 0 : Math.round(mid * 0.1)); }
  skillHeal(caster, skill) { const w = caster.equipment?.weapon; const mid = w?.dmg ? (w.dmg[0] + w.dmg[1]) / 2 : 1.5; const base = skill.healStat && skill.healStat !== 'damage' ? caster.derived[skill.healStat.toUpperCase()] || 8 : mid; return Math.max(skill.healAmount || 0, Math.round((skill.healMult || 0) * base * (1 + caster.derived.spellPower) * (this.healMult || 1))); }
  cast(caster, skill, foes, allies) {
    const ev = this.emit({ type: 'skill', source: caster, skill: skill.id, name: skill.name, skillType: skill.type }); caster.mp -= skill.mpCost || 0; caster.cooldowns[skill.id] = (skill.cooldown || 2) + 1; const eff = skill.effect || {}; const legendary = caster.derived?.legendary || [];
    const magic = skill.type === 'magic' || skill.damageCategory === 'magic'; const aliveAllies = this.alive(allies);
    if (skill.type === 'heal') { const tgts = skill.target === 'party' ? aliveAllies : skill.target === 'self' ? [caster] : [this.mostHurt(aliveAllies) || caster]; for (const t of tgts) { const h = Math.min(this.skillHeal(caster, skill), t.maxHp - t.hp); t.hp += h; this.emit({ type: 'heal', source: caster, target: t, amount: h, label: skill.name }); if (eff.cleanse) this.cleanse(t, eff.cleanse); if (eff.hpRegen || eff.regenRounds) this.addStatus(t, 'regen', eff.regenRounds || eff.regenDur || 3, (eff.hpRegen || 3) * (eff.regenMult || 1)); } if (eff.mpRestore) caster.mp = Math.min(caster.maxMp, caster.mp + eff.mpRestore); if (eff.dmgBuff) this.buff(caster, { dmgBuff: eff.dmgBuff, duration: eff.duration || 2 }); return ev; }
    if (skill.type === 'revive') { const fallen = allies.filter(a => !a.alive); const tgts = eff.reviveAll ? fallen : fallen.slice(0, 1); for (const t of tgts) { t.alive = true; t.hp = Math.max(1, Math.floor(t.maxHp * (eff.reviveHp || 0.25))); t.statuses = []; if (eff.immune !== false) { t.reviveImmune = true; t.reviveImmuneRounds = eff.reviveImmuneRounds || 0; } this.emit({ type: 'revive', source: caster, target: t }); } return ev; }
    if (skill.type === 'buff' || skill.type === 'counter') {
      if (skill.target === 'enemy') { const t = this.pickFoe(caster, this.alive(foes)); if (t) { if (eff.tauntedBy) t.tauntedBy = caster; this.buff(t, { dodgeDebuff: eff.atkDebuff, dmgBuff: -(eff.dmgDebuff || 0), duration: eff.duration || eff.rounds || 2 }); this.emit({ type: 'taunt', source: caster, target: t }); } return ev; }
      const tgts = skill.target === 'party' ? aliveAllies : skill.target === 'self' || skill.type === 'counter' ? [caster] : [this.mostHurt(aliveAllies) || caster]; if (eff.targets > 1 && skill.target !== 'party') tgts.push(...aliveAllies.filter(a => !tgts.includes(a)).slice(0, eff.targets - 1));
      for (const t of tgts) { const dur = eff.duration || eff.rounds || 2; if (eff.dmgBuff) this.buff(t, { dmgBuff: eff.dmgBuff, duration: dur }); if (eff.dmgReduct) this.buff(t, { dmgReduct: eff.dmgReduct, duration: dur }); if (eff.reflect) this.buff(t, { reflect: eff.reflect, duration: dur }); if (eff.dodgeBuff) this.buff(t, { dodgeBuff: eff.dodgeBuff, duration: dur }); if (eff.critBuff) this.buff(t, { critBuff: eff.critBuff, duration: dur }); if (eff.spellDmgBuff) this.buff(t, { spellDmgBuff: eff.spellDmgBuff, duration: dur }); if (eff.tempHp) t.hp = Math.min(t.maxHp + eff.tempHp, t.hp + eff.tempHp); if (eff.taunt) t.taunting = dur; if (eff.stealth) t.stealth = dur;
        const barrier = eff.barrier != null ? (eff.barrier < 5 ? Math.round(eff.barrier * (caster.derived?.INT || 10) * 2) : eff.barrier) : eff.shield ? Math.round((eff.shield.conMult || 3) * (caster.derived?.CON || 10)) : 0; if (barrier) this.addStatus(t, 'barrier', eff.shield?.duration || dur, barrier); if (eff.armorBonus) this.buff(t, { armorBonus: eff.armorBonus, duration: dur }); if (eff.extraAction) t.extraActions = (t.extraActions || 0) + eff.extraAction; if (eff.healPct) { const h = Math.round(t.maxHp * eff.healPct); t.hp = Math.min(t.maxHp, t.hp + h); } if (eff.regenPct) this.addStatus(t, 'regen', dur, Math.round(t.maxHp * eff.regenPct)); if (eff.mpRegen) t.mp = Math.min(t.maxMp, t.mp + eff.mpRegen); if (eff.parryCount || skill.type === 'counter') t.parry = (t.parry || 0) + (eff.parryCount || 1); if (eff.cleanseParty || eff.cleanse) this.cleanse(t, 'all'); }
      if (eff.enemySkipRound) for (const e of this.alive(foes)) this.addStatus(e, 'stun', 1 + (eff.enemySkipExtra || 0) + (eff.enemySkipRounds || 0), 0); return ev;
    }
    // damage skills (melee / ranged / magic / zone / damage / debuff)
    let tgts = this.skillTargets(skill, caster, foes, allies); if (skill.type === 'zone') tgts = this.alive(foes); if (!tgts.length) return ev;
    const hits = skill.hits || skill.effect?.hits || 1; const falloff = { 1: 1, 2: 0.8, 3: 0.6 }[Math.min(3, new Set(tgts).size)] ?? 0.5; const stacks = eff.consumesFlairStacks ? (caster.flair || 0) : 0; if (eff.consumesFlairStacks) caster.flair = eff.keepStacks || 0;
    let baseDmg = this.skillDamage(caster, skill) * this.dmgBuffMult(caster) * falloff * (stacks ? Math.max(1, stacks) * (eff.stackDmgMult || 1) : 1); if (eff.buildsFlairStacks) caster.flair = (caster.flair || 0) + eff.buildsFlairStacks; let totalDealt = 0;
    for (const t of tgts) for (let h = 0; h < hits; h++) { if (!t.alive) continue; if (!eff.neverMiss && !(skill.type === 'magic') && this.rng() * 100 >= this.hitChance(caster, t)) { this.emit({ type: 'miss', source: caster, target: t, label: skill.name }); continue; }
      let raw = baseDmg; let crit = false; if (this.rng() * 100 < (caster.derived.critChance + (eff.critBonus || 0) * 100)) { crit = true; raw *= caster.derived.critDamage; } if (eff.executeThreshold && t.hp / t.maxHp <= eff.executeThreshold) raw *= eff.executeMult || 3; if (eff.bonusVsDemon && /demon|imp|hell|fiend/.test(t.templateId)) raw *= 1 + eff.bonusVsDemon; if (eff.bonusVsUndead && /skeleton|ghoul|wraith|undead|lich|bone/.test(t.templateId)) raw *= 1 + eff.bonusVsUndead; if (eff.damageVsStatus) for (const [st, b] of Object.entries(eff.damageVsStatus)) if (this.has(t, st)) raw *= 1 + b;
      const dealt = this.applyDamage(caster, t, Math.round(raw), { magic, armorPen: (eff.armorPen || 0) > 1 ? 0 : eff.armorPen || 0, crit, label: skill.name }); totalDealt += dealt;
      if (t.alive) for (const se of skill.statusEffects || []) if (this.rng() < (se.chance ?? 0.5)) this.addStatus(t, se.type, (se.duration ?? 2) + (DOT.includes(se.type) ? caster.burnExtend || 0 : 0), se.power ?? (DOT.includes(se.type) ? Math.max(3, Math.floor(caster.derived.INT * 0.15)) : 4), caster);
      if (t.alive && eff.armorReduce) this.addStatus(t, 'sunder', eff.armorReduceDuration || 3, eff.armorReduce); if (t.alive && eff.actionsLost) this.addStatus(t, 'stun', 1, 0); if (t.alive && eff.mpDrain && !t.isEnemy) t.mp = Math.max(0, t.mp - eff.mpDrain);
      if (eff.lifesteal && dealt > 0) { const hh = Math.round(dealt * eff.lifesteal); caster.hp = Math.min(caster.maxHp, caster.hp + hh); }
    }
    if (skill.type === 'zone' && skill.healMult) for (const a of aliveAllies) { const h = Math.min(Math.round(this.skillHeal(caster, skill)), a.maxHp - a.hp); a.hp += h; }
    if (skill.id === 'fate_weave' && totalDealt) { const t = this.mostHurt(aliveAllies); if (t) { const h = Math.min(totalDealt, t.maxHp - t.hp); t.hp += h; this.emit({ type: 'heal', source: caster, target: t, amount: h, label: 'Fate Weave' }); } }
    if (eff.mpOnHit) caster.mp = Math.min(caster.maxMp, caster.mp + eff.mpOnHit);
    if (magic && legendary.includes('low_mana_shockwave') && caster.mp <= caster.maxMp * 0.25) for (const e of this.alive(foes)) this.applyDamage(caster, e, Math.round(15 + caster.derived.INT * 0.5), { magic: true, label: 'Shockwave' });
    if (magic && legendary.includes('echo_cast') && this.rng() < 0.25 && tgts[0]?.alive) this.applyDamage(caster, tgts[0], Math.max(1, Math.round(baseDmg * 0.5)), { magic: true, label: 'Echo Cast' });
    if (legendary.includes('mage_missile_aoe') && ['magic_missile', 'fire_bolt', 'chaos_bolt', 'wild_bolt'].includes(skill.id)) { const o = this.alive(foes).find(e => e !== tgts[0]); if (o) this.applyDamage(caster, o, Math.max(1, Math.round(baseDmg * 0.6)), { magic: true, label: 'Arcane Bounce' }); }
    return ev;
  }
  buff(t, b) { const dur = b.duration || 2; t.buffs.push({ ...b, duration: dur }); this.recomputeBuffs(t); }
  recomputeBuffs(t) { t.dmgBuff = 0; t.dmgReduct = 0; t.reflect = 0; t.spellDmgBuff = 0; let dodge = 0, crit = 0, armor = 0; for (const b of t.buffs) { t.dmgBuff += b.dmgBuff || 0; t.dmgReduct = Math.max(t.dmgReduct, b.dmgReduct || 0); t.reflect = Math.max(t.reflect, b.reflect || 0); t.spellDmgBuff += b.spellDmgBuff || 0; dodge += b.dodgeBuff || 0; crit += b.critBuff || 0; armor += b.armorBonus || 0; } if (t.derived) { t.derived.dodge = t.derived.baseDodge ?? (t.derived.baseDodge = t.derived.dodge); t.derived.dodge = t.derived.baseDodge + dodge; t.derived.critChance = (t.derived.baseCrit ?? (t.derived.baseCrit = t.derived.critChance)) + crit; t.derived.armor = (t.derived.baseArmor ?? (t.derived.baseArmor = t.derived.armor)) + armor; } }
  mostHurt(list) { return [...list].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] || null; }
  pickFoe(att, foes) { if (!foes.length) return null; const awake = foes.filter(f => !this.has(f, 'sleep')); const pool = awake.length ? awake : foes; if (att.isEnemy) { if (att.tauntedBy?.alive) return att.tauntedBy; const taunting = pool.filter(h => h.taunting > 0); if (taunting.length) return taunting[0]; const comps = pool.filter(h => h.isCompanion); return comps[0] || pool[0]; } return pool[Math.floor(this.rng() * pool.length)]; }
  // ---------- AI
  usableSkills(h) { const S = this.ctx.skills; return (h.skills || []).map(id => S[id] ? { id, ...S[id] } : null).filter(Boolean).filter(s => s.type !== 'passive').map(s => mergeSkill(s, h)).filter(s => !(h.cooldowns[s.id] > 0) && (s.mpCost || 0) <= h.mp && !(this.has(h, 'silence') && (s.mpCost > 0 || s.type === 'magic' || s.type === 'heal'))); }
  heroAI(h) {
    const allies = this.heroes, foes = this.enemies; const sk = this.usableSkills(h); const aliveA = this.alive(allies); const isHealer = HEALER_CLASSES.includes(h.class);
    const rev = sk.find(s => s.type === 'revive'); if (rev && allies.some(a => !a.alive)) return this.cast(h, rev, foes, allies);
    const heals = sk.filter(s => s.type === 'heal' && s.target !== 'self').sort((a, b) => (b.healMult || 0) - (a.healMult || 0)); const hurt = this.mostHurt(aliveA); const frac = hurt ? hurt.hp / hurt.maxHp : 1;
    if (heals.length && (frac < 0.25 || (isHealer && frac < 0.65))) return this.cast(h, heals[0], foes, allies);
    const self = sk.find(s => s.type === 'heal' && s.target === 'self'); if (self && h.hp / h.maxHp < 0.4) return this.cast(h, self, foes, allies);
    const shield = sk.find(s => s.type === 'buff' && (s.effect?.barrier || s.effect?.shield || s.effect?.dmgReduct) && s.target !== 'enemy'); if (isHealer && shield && frac < 0.6 && !aliveA.some(a => a.statuses.some(s => s.type === 'barrier'))) return this.cast(h, shield, foes, allies);
    const dmg = sk.filter(s => ['melee', 'ranged', 'magic', 'damage', 'zone'].includes(s.type) && (s.damageMult ?? 1) > 0 || (s.statusEffects?.length && s.type === 'magic')); if (dmg.length) { const n = this.alive(foes).length; dmg.sort((a, b) => (b.damageMult || 0.5) * (b.hits || 1) * this.expectedTargets(b, n) - (a.damageMult || 0.5) * (a.hits || 1) * this.expectedTargets(a, n)); if ((dmg[0].mpCost || 0) === 0 || this.rng() < 0.8) return this.cast(h, dmg[0], foes, allies); }
    const buff = sk.find(s => s.type === 'buff' && s.target !== 'enemy' && !h.buffs.length); if (buff && this.round_ <= 2) return this.cast(h, buff, foes, allies);
    const any = sk.find(s => s.type !== 'buff' || s.target === 'enemy'); if (any && this.rng() < 0.5) return this.cast(h, any, foes, allies);
    return this.attack(h, this.pickFoe(h, this.alive(foes)));
  }
  enemyAI(e) {
    const foes = this.heroes, allies = this.enemies; const targets = this.alive(foes); if (!targets.length) return;
    if (e.role === 'healer' && !this.has(e, 'silence')) { const w = this.mostHurt(this.alive(allies)); if (w && w.hp / w.maxHp < 0.6) { const h = Math.max(8, Math.round(e.dmg[1] * 0.8)); w.hp = Math.min(w.maxHp, w.hp + h); this.emit({ type: 'heal', source: e, target: w, amount: h, label: 'mend' }); return; } }
    const spells = (e.spellList || []).map(id => this.ctx.spells[id]).filter(s => s && !(e.cooldowns[s.id] > 0)); if (spells.length && !this.has(e, 'silence') && this.rng() < (e.spellChance || 0)) { const sp = spells[Math.floor(this.rng() * spells.length)]; e.cooldowns[sp.id] = (sp.cooldown || 2) + 1; this.emit({ type: 'skill', source: e, skill: sp.id, name: sp.name, skillType: 'magic' }); const ef = sp.effect || {}; const tgts = sp.target === 'aoe' ? targets : sp.target === 'ally_lowest_hp' ? [this.mostHurt(this.alive(allies))] : [this.pickFoe(e, targets)];
      for (const t of tgts) { if (!t) continue; if (ef.heal) { t.hp = Math.min(t.maxHp, t.hp + ef.heal); this.emit({ type: 'heal', source: e, target: t, amount: ef.heal, label: sp.name }); continue; } if (ef.damage) { const scaled = Math.round(ef.damage * (e.dmg[1] / Math.max(1, e.dmg[1] / 0.3 / 1)) * 1) || ef.damage; this.applyDamage(e, t, Math.max(1, Math.round(ef.damage * this.spellScale(e))), { magic: sp.fxKind !== 'physical', label: sp.name }); } if (ef.status && t.alive) this.addStatus(t, ef.status.type || ef.status, ef.status.duration || 2, ef.status.power || 4, e); if (ef.statusEffect && t.alive) this.addStatus(t, ef.statusEffect.type, ef.statusEffect.duration || 2, ef.statusEffect.power || 4, e); if (ef.debuff && t.alive) this.addStatus(t, ef.debuff, 2, 4, e); }
      return; }
    this.attack(e, this.pickFoe(e, targets));
  }
  spellScale(e) { return Math.max(0.3, (e.dmg[1] / ((e.baseDmgMax || e.dmg[1] / 0.3) || 1))); }
  // ---------- rounds
  buildOrder() { const all = [...this.alive(this.heroes), ...this.alive(this.enemies)]; return all.map(c => ({ c, roll: ((c.derived?.initiative ?? (c.dodge + c.level)) + (c._legendaryInitBonus || 0) + this.rng() * 10) * (this.has(c, 'slow') ? 0.5 : 1) })).sort((a, b) => b.roll - a.roll).map(x => x.c); }
  tickStatuses() {
    for (const c of [...this.heroes, ...this.enemies]) { if (!c.alive) continue;
      for (const s of c.statuses) { if (DOT.includes(s.type)) { const amt = Math.max(1, s.power || 3); c.hp = Math.max(0, c.hp - amt); this.emit({ type: 'dot', target: c, status: s.type, amount: amt }); if (c.hp <= 0) { this.kill(s.source?.alive ? s.source : null, c); break; } } if (s.type === 'regen') { const amt = Math.max(1, s.power || 3); c.hp = Math.min(c.maxHp, c.hp + amt); this.emit({ type: 'heal', target: c, amount: amt, label: 'regen' }); } if (s.type === 'barrier' && s.fromMagicShield) s.power = Math.min(s.maxPower, s.power + (s.regen || 0)); }
      if (!c.alive) continue; for (const s of c.statuses) { s.duration--; if (s.type === 'stun' && s.duration <= 0) { c.stunCount = (c.stunCount || 0) + 1; c.stunImmune = Math.max(c.stunImmune || 0, 2 + c.stunCount - 1); } } c.statuses = c.statuses.filter(s => s.duration > 0 || (s.type === 'barrier' && s.fromMagicShield)); if (c.stunImmune > 0) c.stunImmune--;
      for (const b of c.buffs) b.duration--; c.buffs = c.buffs.filter(b => b.duration > 0); this.recomputeBuffs(c); if (c.taunting > 0) c.taunting--; if (c.stealth > 0) c.stealth--; if (c.parry > 0 && this.round_ > 1) c.parry = 0; if (c._tempArmorPenRounds > 0 && --c._tempArmorPenRounds === 0) c._tempArmorPen = 0; if (c.reviveImmuneRounds > 0) c.reviveImmuneRounds--; else if (c.reviveImmune && c.actedSinceRevive) c.reviveImmune = false;
      if (!c.isEnemy) { const d = c.derived; c.mp = Math.min(c.maxMp, c.mp + (d.manaRegen || 1)); if (d.hpRegen) c.hp = Math.min(c.maxHp, c.hp + d.hpRegen); }
      for (const k of Object.keys(c.cooldowns)) { c.cooldowns[k]--; if (c.cooldowns[k] <= 0) delete c.cooldowns[k]; }
    }
  }
  takeTurn(c) {
    if (!c.alive) return; if (c.reviveImmune) c.actedSinceRevive = true;
    if (this.has(c, 'stun')) return this.emit({ type: 'skip', target: c, why: 'stunned' }); if (this.has(c, 'freeze')) { this.removeStatus(c, 'freeze'); return this.emit({ type: 'skip', target: c, why: 'frozen' }); } if (this.has(c, 'sleep')) return this.emit({ type: 'skip', target: c, why: 'asleep' }); if (this.has(c, 'confused') && this.rng() < 0.5) return this.emit({ type: 'skip', target: c, why: 'confused' });
    if (c.isEnemy) this.enemyAI(c); else this.heroAI(c);
    const extra = (c.extraActions || 0) + ({ fast: 1, very_fast: 2 }[c.derived?.attackSpeed] || 0); c.extraActions = 0; for (let i = 0; i < extra && c.alive && this.alive(c.isEnemy ? this.heroes : this.enemies).length; i++) { this.emit({ type: 'extra', target: c }); if (c.isEnemy) this.enemyAI(c); else this.heroAI(c); }
  }
  /** One full round. Returns the events. */
  round() {
    this.events = []; if (this.over) return []; this.round_++; this.emit({ type: 'round', n: this.round_ });
    if (this.round_ > 1) this.tickStatuses(); if (this.checkEnd()) return this.events;
    for (const c of this.buildOrder()) { if (this.over) break; if (!c.alive) continue; this.takeTurn(c); if (this.checkEnd()) break; }
    if (this.round_ >= 50 && !this.over) { this.over = true; this.result = 'timeout'; this.emit({ type: 'end', result: 'timeout' }); }
    return this.events;
  }
  checkEnd() { if (this.over) return true; if (!this.alive(this.enemies).length) { this.over = true; this.result = 'win'; this.emit({ type: 'end', result: 'win' }); return true; } if (!this.alive(this.heroes).length) { this.over = true; this.result = 'lose'; this.emit({ type: 'end', result: 'lose' }); return true; } return false; }
  runAll() { const all = []; while (!this.over) all.push(...this.round()); return { result: this.result, rounds: this.round_, events: all }; }
}
export function fleeCheck(heroes, enemies, rng = Math.random) { const avgE = enemies.reduce((s, e) => s + Math.max(1, Math.round(e.xpValue / 8)), 0) / enemies.length; const avgP = heroes.reduce((s, h) => s + h.level, 0) / heroes.length; const dc = Math.round(Math.max(8, Math.min(28, 12 + avgE - avgP))); const best = Math.max(...heroes.filter(h => h.alive).map(h => h.derived?.DEX ?? h.attrs?.DEX ?? 8)); const roll = 1 + Math.floor(rng() * 20); return { ok: best + roll >= dc, dc, roll, best }; }
