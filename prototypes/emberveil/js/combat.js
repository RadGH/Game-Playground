// Turn-based auto-battle rebuilt from Emberveil's simulator: initiative order each round, CC gates, hero + enemy AI,
// skills with mp/cooldown/talents/upgrades, hit → block → armour curve → resistAll → dmgReduct → marked → barrier → HP,
// statuses, passives, item affixes, legendary powers, champion and named modifiers, boss phases, attack speed, revive.
// Every effect id lives in js/effects.js; this file only calls the hooks. Pure logic: `round()` returns an event list.
import { derive, mergeSkill, HEALER_CLASSES, SKILL_MULT, checkBonus } from './rules.js';
import { EFFECTS, STATUS_ALIAS, refreshFx, fireTrait, traitMult, traitSum, skillFx, runSkill, skillMult, skillSum, skillGate, skillTargetOverride, statusDef } from './effects.js';
const DOT = ['burn', 'poison', 'bleed', 'holy_burn'];
const CC = ['stun', 'freeze', 'sleep', 'confused', 'dazed', 'blind', 'slow', 'marked', 'sunder', 'curse', 'silence', 'disarm', 'root', 'weaken'];
export class Combat {
  /** heroes: hero objects (with equipment); enemies: makeEnemy() instances; ctx: { skills, spells, loot, rng, act, bossPhases } */
  constructor(heroes, enemies, ctx) {
    this.heroes = heroes; this.enemies = enemies; this.ctx = ctx; this.rng = ctx.rng || Math.random; this.round_ = 0; this.over = false; this.result = null; this.log = []; this.events = []; this.order = [];
    for (const h of heroes) { h.derived = derive(h, ctx.loot); this.resetUnit(h); h.alive = h.hp > 0; h.side = 'party'; }
    for (const e of enemies) { this.resetUnit(e); e.alive = true; e.side = 'enemy'; e._phases = (ctx.bossPhases || {})[e.templateId]?.phases || null; e._phase = 0; }
    const ex = ctx.exhaustionMult ?? 1; if (ex < 1) for (const h of heroes) { h.derived.hit = Math.round(h.derived.hit * ex); h.derived.dodge = Math.round(h.derived.dodge * ex); h.derived.dmgMin = Math.max(1, Math.round(h.derived.dmgMin * ex)); h.derived.dmgMax = Math.max(1, Math.round(h.derived.dmgMax * ex)); }
    if (ctx.startBarrier) for (const h of heroes) h.statuses.push({ type: 'barrier', duration: 3, power: ctx.startBarrier });
    this.killsBy = {}; this.bonusGold = 0;
    for (const c of [...heroes, ...enemies]) fireTrait('combatStart', this, c);
  }
  /** Clear everything a previous fight left behind and rebuild the unit's effect list. */
  resetUnit(c) {
    c.statuses = []; c.cooldowns = {}; c.dmgReduct = 0; c.dmgBuff = 0; c.buffs = []; c._sm = {}; c._immune = null; c._immuneRounds = 0;
    c._cheatDeathUsed = false; c._legendaryInitBonus = 0; c._streak = 0; c._streakTarget = null; c._speedOnHitUsed = false; c._firstHitLeft = 0;
    c._spellPowBonus = 0; c._spellPowRounds = 0; c._healReduce = 0; c._mrDebuff = 0; c._fireVuln = 0; c._intDebuff = 0; c._corruption = 0; c._rebleed = null;
    c.extraActions = 0; if (!c.isEnemy) c.extraActionsEachRound = 0; c.taunting = 0; c.stealth = 0; c.parry = 0; c._tempArmorPen = 0; c._tempArmorPenRounds = 0; c.onHitStatus = null; c.onHitStatusRounds = 0;
    if (!c._persistStacks) c.flair = 0; c._freeSkills = null; c._dotLifesteal = 0; c.burnExtend = 0;
    refreshFx(c); return c;
  }
  alive(list) { return list.filter(c => c.alive); }
  has(c, type) { return c.statuses.some(s => s.type === type); }
  /** Statuses of `type` on `c`, newest last. */
  statusesOf(c, type) { return c.statuses.filter(s => s.type === type); }
  addStatus(c, type, duration = 2, power = 4, source = null) { type = STATUS_ALIAS[type] || type; const ok = this.addStatusInner(c, type, duration, power, source); if (ok) this.emit({ type: 'status', source, target: c, status: type, duration, power }); return ok; }
  addStatusInner(c, type, duration = 2, power = 4, source = null) {
    type = STATUS_ALIAS[type] || type;
    if (c._immune?.[type]) return false;
    if (type === 'stun' && c.stunImmune > 0) return false;
    if (['stun', 'freeze', 'sleep'].includes(type) && c.boss && this.rng() < 0.5) return false;
    const m = source?._sm || {};
    if (DOT.includes(type)) { duration += (m.dotDuration || 0) + (type === 'burn' ? (m.burnDuration || 0) : 0); duration = Math.round(duration * (m.dotDurationMult ?? 1)); power = Math.round(power * (m.dotMult ?? 1) * (type === 'burn' ? (m.burnMult ?? 1) : 1) * (type === 'poison' ? (m.poisonMult ?? 1) : 1)); power = Math.max(power, m.dotPower || 0) + (type === 'poison' ? (m.poisonPower || 0) : 0); }
    if (type === 'slow') duration = Math.round(duration * (m.slowMult ?? 1));
    if (type === 'regen') power += m.regenPower || 0;
    duration = Math.max(1, Math.round(duration)); power = Math.max(0, Math.round(power));
    const stacking = statusDef(type)?.stacks && m.stackMode !== 0;
    const ex = !stacking && c.statuses.find(s => s.type === type);
    if (ex) { ex.duration = Math.max(ex.duration, duration); ex.power = Math.max(ex.power, power); return true; }
    const cap = type === 'poison' ? Math.max(5, (source?._sm?.poisonMaxStacks) || 5) : 5;
    const sameSource = m.stackMode === 1 ? c.statuses.filter(s => s.type === type && s.source === source) : c.statuses.filter(s => s.type === type);
    if (stacking && sameSource.length >= cap) return false;
    c.statuses.push({ type, duration, power, source }); return true;
  }
  removeStatus(c, type) { c.statuses = c.statuses.filter(s => s.type !== type); }
  cleanse(c, what) { c.statuses = c.statuses.filter(s => !(what === 'all' || what === 1 ? CC.includes(s.type) || DOT.includes(s.type) : (Array.isArray(what) ? what : [what]).includes(s.type))); }
  emit(ev) { this.log.push(ev); this.events.push(ev); return ev; }
  /**
   * One place for every heal, so healing-reduction, whole-number health and the meter all agree.
   * `label` is what the player is told brought it back ("Mend", "life steal", "on kill") — the log
   * line reads "<name> recovers <n> health (<label>)", so keep it a plain reason, not a number.
   */
  healUnit(t, amount, label = 'heal', source = null, via = 'effect:heal') {
    if (!t?.alive || amount <= 0) return 0;
    const room = Math.max(0, Math.round(t.maxHp) - Math.round(t.hp));
    const want = Math.round(amount * (1 - Math.min(0.9, t._healReduce || 0)));
    const amt = Math.min(room, want);
    if (amt <= 0) return 0; t.hp = Math.min(t.maxHp, Math.round(t.hp) + amt);
    this.emit({ type: 'heal', source, target: t, amount: amt, label, via, overheal: Math.max(0, want - amt), resource: 'health', dtype: 'holy' }); return amt;
  }
  /**
   * The same thing for mana, so "X recovers 8 mana (on kill)" can be shown instead of the bar
   * quietly moving. Returns what actually went in.
   */
  gainMana(t, amount, label = 'mana', source = null, via = 'effect:mana') {
    if (!t?.alive || !(amount > 0) || t.maxMp == null) return 0;
    const amt = Math.min(Math.max(0, Math.round(t.maxMp) - Math.round(t.mp || 0)), Math.round(amount));
    if (amt <= 0) return 0; t.mp = Math.min(t.maxMp, Math.round(t.mp || 0) + amt);
    this.emit({ type: 'mana', source, target: t, amount: amt, label, via, resource: 'mana' }); return amt;
  }
  // ---------- damage pipeline
  /** Sum a status field across everything on a unit (multiplicative for mults). */
  statusMult(c, field, o = {}) { let m = 1; for (const s of c.statuses) { const f = statusDef(s.type)?.[field]; if (typeof f === 'function') { const r = f(s, o); if (typeof r === 'number' && isFinite(r)) m *= r; } } return m; }
  statusSum(c, field, o = {}) { let n = 0; for (const s of c.statuses) { const f = statusDef(s.type)?.[field]; if (typeof f === 'function') { const r = f(s, o); if (typeof r === 'number' && isFinite(r)) n += r; } } return n; }
  hitChance(att, tgt) {
    const dodge = this.has(tgt, 'root') ? 0 : (tgt.derived?.dodge ?? tgt.dodge);
    const raw = (att.derived?.hit ?? att.hit) + (att._hitBuff || 0) - dodge; let c = raw <= 95 ? raw : 95 + (raw - 95) * 0.2;
    const floor = tgt.boss ? 6 : tgt.champion ? 4 : 3; c = Math.max(5, Math.min(100 - floor, c));
    for (const s of att.statuses) { const d = statusDef(s.type); if (d?.hitMult) c = Math.max(5, Math.round(c * d.hitMult)); if (d?.hitFlat) c = Math.max(5, c + d.hitFlat); }
    return c;
  }
  mitigate(tgt, raw, { magic = false, trueDmg = false, armorPen = 0, source = null, dtype = null } = {}) {
    let dmg = raw; const tags = [];
    const deflect = tgt.statuses.find(s => statusDef(s.type)?.absorbNext);
    if (deflect && dmg > 0) { tgt.statuses = tgt.statuses.filter(s => s !== deflect); tags.push('deflected'); return { dmg: 0, tags }; }
    if (tgt.parry > 0 && dmg > 0 && !magic && !trueDmg) { tgt.parry--; tags.push('parried'); return { dmg: 0, tags }; }
    if (!trueDmg && !magic) { const bc = Math.min(0.95, (tgt.derived?.blockChance ?? tgt.blockChance ?? 0) + this.statusSum(tgt, 'blockBonus')); if (bc > 0 && this.rng() < bc) { dmg = tgt.isEnemy ? Math.round(dmg * 0.5) : Math.max(0, dmg - (tgt.derived?.blockPower ?? 0)); tags.push('blocked'); fireTrait('onBlocked', this, tgt, source); } }
    if (!trueDmg) {
      let ar = magic ? Math.max(0, (tgt.derived?.magicResist ?? tgt.magicResist ?? 0) - (tgt._mrDebuff || 0)) : (tgt.derived?.armor ?? tgt.armor ?? 0);
      const sunder = this.statusSum(tgt, 'armorReduce');
      ar = Math.max(0, ar * (1 - (tgt._tempArmorPen || 0)) * (1 - Math.min(1, armorPen)) - sunder);
      const dr = Math.min(0.95, ar / (ar + 100)); dmg = Math.round(dmg * (1 - dr));
    }
    if (tgt.derived?.resistAll) dmg = Math.round(dmg * (1 - tgt.derived.resistAll / 100));
    if (tgt.dmgReduct) dmg = Math.round(dmg * (1 - Math.min(0.9, tgt.dmgReduct)));
    dmg = Math.round(dmg * this.statusMult(tgt, 'takenMult', { dtype, magic }));
    if (dtype === 'fire' && tgt._fireVuln) dmg = Math.round(dmg * (1 + tgt._fireVuln));
    dmg = Math.round(dmg * traitMult('dmgIn', this, tgt, source, { magic, dtype }));
    return { dmg: Math.max(0, dmg), tags };
  }
  /** Apply damage to a target (after the hit roll). Returns what actually came off its HP. */
  applyDamage(src, tgt, amount, { magic = false, trueDmg = false, armorPen = 0, crit = false, label = null, noReflect = false, via = null, dtype = null, itemId = null, isAttack = false, noShare = false, isDot = false } = {}) {
    if (!tgt.alive) return 0; if (tgt.reviveImmune) { this.emit({ type: 'immune', target: tgt }); return 0; }
    const kind = dtype || (trueDmg ? 'true' : magic ? 'arcane' : 'physical');
    if (src && !isDot) { amount = Math.round(amount * traitMult('dmgOut', this, src, tgt, { crit, magic, dtype: kind, isAttack }) + traitSum('dmgFlat', this, src, tgt, { crit, magic, dtype: kind })); if (crit) armorPen = Math.min(1, armorPen + traitSum('critArmorPen', this, src, tgt)); }
    if (isDot && tgt.derived?.dotReduce) amount = Math.round(amount * (1 - tgt.derived.dotReduce));
    const { dmg, tags } = this.mitigate(tgt, Math.max(0, amount), { magic, trueDmg, armorPen, source: src, dtype: kind }); let left = dmg;
    for (const b of tgt.statuses.filter(s => s.type === 'barrier')) { const take = Math.min(b.power, left); b.power -= take; left -= take; if (left <= 0) break; }
    tgt.statuses = tgt.statuses.filter(s => !(s.type === 'barrier' && s.power <= 0 && !s.fromMagicShield));
    const o = { dealt: left, tags, magic, dtype: kind, crit };
    if (o.dealt > 0 && tgt.hp - o.dealt <= 0) fireTrait('preLethal', this, tgt, o);
    let dealt = o.dealt;
    const share = this.statusSum(tgt, 'share'); const bound = share && !noShare ? [...this.heroes, ...this.enemies].filter(x => x !== tgt && x.alive && this.has(x, 'soulbind')) : [];
    if (bound.length) { const moved = Math.round(dealt * share / bound.length) || 0; if (moved > 0) { dealt = Math.max(0, dealt - moved * bound.length); for (const b of bound) this.applyDamage(src, b, moved, { trueDmg: true, label: 'Soul Link', noReflect: true, noShare: true, via: 'status:soulbind', dtype: 'shadow' }); } }
    const hpBefore = tgt.hp; const absorbed = dmg - o.dealt; tgt.hp = Math.max(0, tgt.hp - dealt);
    if (dealt > 0) for (const s of tgt.statuses.slice()) if (statusDef(s.type)?.wakesOnDamage) this.removeStatus(tgt, s.type);
    if (tgt._windUp) tgt._windUp.taken += dealt;
    const overkill = Math.max(0, dealt - hpBefore);
    const record = { type: 'damage', source: src, target: tgt, amount: Math.min(dealt, hpBefore), rawAmount: amount, overkill, absorbed, crit, magic, tags, label, via: via || (label ? 'skill:' + label : 'attack'), viaName: label || (src?.equipment?.weapon?.name || (src?.isEnemy ? 'Attack' : 'Unarmed')), dtype: kind, itemId: itemId || (!label ? src?.equipment?.weapon?.id || null : null), killingBlow: hpBefore > 0 && tgt.hp === 0 };
    this.emit(record);
    if (src && src.alive && dealt > 0) {
      if (src.isEnemy && src.lifeSteal) this.healUnit(src, Math.round(dealt * src.lifeSteal), 'life steal', src, 'effect:lifesteal');
      const d = src.derived;
      if (d) {
        if (d.lifeSteal) this.healUnit(src, Math.floor(dealt * d.lifeSteal), 'life steal', src, 'effect:lifesteal');
        if (d.manaSteal) this.gainMana(src, Math.floor(dealt * d.manaSteal), 'mana steal', src, 'effect:manasteal');
        if (d.burnOnHit && this.rng() < d.burnOnHit) this.addStatus(tgt, 'burn', 3, Math.max(3, Math.floor(d.INT * 0.15)), src);
        if (crit && d.poisonOnCrit && this.rng() < d.poisonOnCrit) this.addStatus(tgt, 'poison', 3, Math.max(3, Math.floor(d.INT * 0.2)), src);
      }
      fireTrait('onHit', this, src, tgt, { dealt, crit, magic, dtype: kind, isAttack });
      if (crit) fireTrait('onCrit', this, src, tgt, { dealt, magic, dtype: kind });
      const thornsPct = (tgt.derived?.thorns || 0) + (tgt.reflect || 0) + (tgt.isEnemy ? tgt.thorns || 0 : 0);
      const thornsFlat = (tgt.derived?.thornsFlat || 0) + this.statusSum(tgt, 'reflect', dealt);
      const reflected = Math.round(dealt * thornsPct) + thornsFlat;
      if (reflected > 0 && !noReflect) this.applyDamage(tgt, src, Math.max(1, reflected), { trueDmg: true, label: 'Thorns', noReflect: true, via: 'thorns', dtype: 'true' });
    }
    if (dealt > 0 && tgt.alive) fireTrait('onDamaged', this, tgt, src, { dealt, magic, dtype: kind, noReflect });
    if (tgt.hp <= 0 && tgt.alive) this.kill(src, tgt); else this.checkPhase(tgt);
    return dealt;
  }
  /** Boss phase transitions: crossing an HP threshold swaps spells and hands out statuses. */
  checkPhase(e) {
    if (!e._phases?.length || !e.alive) return null; const pctHp = e.hp / e.maxHp;
    for (let i = e._phase; i < e._phases.length; i++) {
      const p = e._phases[i]; if (pctHp >= p.hpThreshold) continue; e._phase = i + 1;
      if (Array.isArray(p.swapSpells)) e.spellList = [...p.swapSpells]; else if (Array.isArray(p.addSpells)) e.spellList = [...(e.spellList || []), ...p.addSpells];
      for (const s of p.addStatuses || []) this.addStatus(e, s.type, s.duration ?? 2, s.power ?? 0, e);
      this.emit({ type: 'phase', target: e, name: p.name, text: p.onEnter || '', phase: e._phase });
      return p;
    }
    return null;
  }
  kill(src, tgt) {
    tgt._lastStatuses = tgt.statuses.map(s => ({ ...s })); tgt.alive = false; tgt.statuses = [];
    if (src && !src.isEnemy && tgt.isEnemy) this.killsBy[src.id] = (this.killsBy[src.id] || 0) + 1;
    this.emit({ type: tgt.isEnemy ? 'kill' : 'down', source: src, target: tgt });
    if (src?.alive && src.derived) { const d = src.derived; if (d.hpOnKill) this.healUnit(src, d.hpOnKill, 'on kill', src, 'passive:killing_blow'); if (d.manaOnKill) this.gainMana(src, d.manaOnKill, 'on kill', src, 'passive:soul_harvest'); }
    if (src?.alive) fireTrait('onKill', this, src, tgt);
    if (tgt.isEnemy && tgt._lastStatuses.some(s => s.type === 'curse')) { const o = this.alive(this.enemies)[0]; if (o) this.addStatus(o, 'curse', 2, 20); }
  }
  rollDamage(c) { if (c.isEnemy) return c.dmg[0] + Math.floor(this.rng() * (c.dmg[1] - c.dmg[0] + 1)); const d = c.derived; return d.dmgMin + Math.floor(this.rng() * (d.dmgMax - d.dmgMin + 1)); }
  dmgBuffMult(c) {
    let m = (1 + (c.dmgBuff || 0)) * this.statusMult(c, 'dealtMult');
    for (const a of this.alive(c.isEnemy ? this.enemies : this.heroes)) if (a !== c) m += traitSum('auraDmg', this, a);
    return Math.max(0, m);
  }
  /** Basic attack. */
  attack(att, tgt) {
    if (!tgt?.alive) return; fireTrait('onAttack', this, att, tgt);
    const chance = this.hitChance(att, tgt); if (this.rng() * 100 >= chance) { this.emit({ type: 'miss', source: att, target: tgt }); return; }
    let raw = this.rollDamage(att) * this.dmgBuffMult(att); let crit = false;
    const cc = (att.derived?.critChance ?? 5) + traitSum('critBonus', this, att, tgt);
    if (this.rng() * 100 < cc) { crit = true; raw *= att.derived?.critDamage ?? 1.5; }
    const magic = att.isEnemy ? false : att.derived.cat === 'magic'; this.emit({ type: 'attack', source: att, target: tgt, crit });
    this.applyDamage(att, tgt, Math.round(raw), { magic, armorPen: att.derived?.armorPen || 0, crit, isAttack: true });
    if (att.isEnemy && att.statusOnHit && tgt.alive) for (const so of att.statusOnHit) if (this.rng() < (so.chance ?? 0.5)) this.addStatus(tgt, so.type, so.duration ?? 2, so.power ?? 4, att);
    if (att.onHitStatus && tgt.alive && this.rng() < (att.onHitStatus.chance ?? 1)) this.addStatus(tgt, att.onHitStatus.type, att.onHitStatus.duration, att.onHitStatus.power, att);
    const w = att.equipment?.weapon; if (w && tgt.alive) { if (w.stunChance && this.rng() < w.stunChance) this.addStatus(tgt, 'stun', 1, 0, att); if (w.bleedChance && this.rng() < w.bleedChance) this.addStatus(tgt, 'bleed', 2, Math.max(3, Math.floor(att.derived.INT * 0.15)), att); if (w.burnChance && this.rng() < w.burnChance) this.addStatus(tgt, 'burn', 2, Math.max(3, Math.floor(att.derived.INT * 0.15)), att); }
    if (att.derived?.chainOnHit && this.rng() < att.derived.chainOnHit) { const o = this.alive(this.enemies).find(e => e !== tgt); if (o) this.applyDamage(att, o, Math.round(raw * 0.5), { magic: true, label: 'Chain', via: 'proc:stormcharged', dtype: 'lightning' }); }
  }
  // ---------- skills
  skillTargets(skill, caster, foes, allies) {
    const a = this.alive(foes); const primary = this.pickFoe(caster, a); if (!primary) return []; const aoe = skill.aoe || 'single';
    if (aoe === 'all' || aoe === 'row' || aoe === 'row2' || aoe === 'pierce_row') return a; if (aoe === 'group') return a.filter(e => e.group === primary.group); if (aoe === 'adjacent') return [primary, ...a.filter(e => e !== primary && e.group === primary.group)].slice(0, shotCount(skill, 2)); if (aoe === 'adjacent2' || aoe === 'group2') return [primary, ...a.filter(e => e !== primary && e.group === primary.group)].slice(0, shotCount(skill, 3));
    if (aoe === 'chain' || aoe === 'chain3') return [primary, ...a.filter(e => e !== primary)].slice(0, shotCount(skill, 3)); if (aoe === 'random3' || aoe === 'random4') { const k = shotCount(skill, aoe === 'random3' ? 3 : 4); const out = []; for (let i = 0; i < k; i++) out.push(a[Math.floor(this.rng() * a.length)]); return out; } if (aoe === 'multi3' || aoe === 'multi4') return Array(shotCount(skill, aoe === 'multi3' ? 3 : 4)).fill(primary); return [primary];
  }
  expectedTargets(skill, n) { const aoe = skill.aoe || 'single'; if (aoe === 'all' || aoe === 'row' || aoe === 'row2' || aoe === 'pierce_row') return n; if (['random3', 'random4', 'multi3', 'multi4', 'chain', 'chain3'].includes(aoe)) return Math.min(n, shotCount(skill, { random4: 4, multi4: 4 }[aoe] || 3)); if (['group2', 'adjacent2'].includes(aoe)) return Math.min(n, shotCount(skill, 3)); if (aoe === 'group') return Math.min(n, 3); if (aoe === 'adjacent') return Math.min(n, shotCount(skill, 2)); return 1; }
  skillDamage(caster, skill) {
    const w = caster.equipment?.weapon; const mid = w?.dmg ? (w.dmg[0] + w.dmg[1]) / 2 : 1.5; const d = caster.derived;
    const magic = skill.type === 'magic' || skill.type === 'heal' || skill.damageCategory === 'magic';
    const stat = skill.damageStat && d[String(skill.damageStat).toUpperCase()] ? d[String(skill.damageStat).toUpperCase()] : null;
    const spellPower = (d.spellPower + (caster._spellPowBonus || 0)) * (1 - (caster._intDebuff || 0));
    const power = magic ? spellPower : stat ? stat * 0.075 : Math.round(d.STR * 1.5) * 0.05;
    const mult = (skill.damageMult ?? 1) * SKILL_MULT.hero * (magic ? SKILL_MULT.magic : (caster.derived?.cat === 'heavy' ? SKILL_MULT.heavy : SKILL_MULT.light)) * (caster.spellDmgBuff && magic ? 1 + caster.spellDmgBuff : 1);
    return Math.round(mult * mid * (1 + power)) + (magic ? 0 : Math.round(mid * 0.1));
  }
  skillHeal(caster, skill) { const w = caster.equipment?.weapon; const mid = w?.dmg ? (w.dmg[0] + w.dmg[1]) / 2 : 1.5; const base = skill.healStat && skill.healStat !== 'damage' ? caster.derived[skill.healStat.toUpperCase()] || 8 : mid; return Math.max(skill.healAmount || 0, Math.round((skill.healMult || 0) * base * (1 + caster.derived.spellPower) * (this.healMult || 1))); }
  cast(caster, skill, foes, allies) {
    const ev = this.emit({ type: 'skill', source: caster, skill: skill.id, name: skill.name, skillType: skill.type });
    const cost = Math.max(0, (skill.mpCost || 0) - (caster.derived?.mpCostReduce || 0)); caster.mp -= caster._freeSkills?.[skill.id] ? 0 : cost;
    caster.cooldowns[skill.id] = Math.max(1, Math.round(((skill.cooldown || 2) + 1) * (1 - (caster.derived?.cooldownReduction || 0))));
    const eff = skill.effect || {}; const magic = skill.type === 'magic' || skill.damageCategory === 'magic'; const aliveAllies = this.alive(allies);
    const fx = skillFx(skill); const dtype = skillType(skill);
    const c = { C: this, caster, skill, eff, foes, allies, magic, dtype, targets: [], target: null, targetIndex: 0, dealt: 0, crit: false };
    runSkill(fx, 'onCast', c); fireTrait('onCastDone', this, caster, skill);
    if (skill.type === 'heal') {
      const tgts = skill.target === 'party' ? aliveAllies.filter(a => !(eff.excludeSelf && a === caster)) : skill.target === 'self' ? [caster] : [this.mostHurt(aliveAllies) || caster];
      for (const t of tgts) { const amount = this.skillHeal(caster, skill); const h = this.healUnit(t, amount, skill.name, caster, 'skill:' + skill.id);
        if (eff.cleanse) this.cleanse(t, eff.cleanse); if (eff.hpRegen || eff.regenRounds) this.addStatus(t, 'regen', eff.regenRounds || eff.regenDur || 3, (eff.hpRegen || 3) * (eff.regenMult || 1), caster);
        c.target = t; c.dur = eff.duration || eff.rounds || 2; c.healAmount = amount; runSkill(fx, 'onBuff', c); }
      if (eff.mpRestore) this.gainMana(caster, eff.mpRestore, skill.name, caster, 'skill:' + skill.id); if (eff.dmgBuff) this.buff(caster, { dmgBuff: eff.dmgBuff, duration: eff.duration || 2 });
      c.totalDealt = 0; runSkill(fx, 'onEnd', c); return ev;
    }
    if (skill.type === 'revive') { const fallen = allies.filter(a => !a.alive); const tgts = eff.reviveAll ? fallen : fallen.slice(0, 1); for (const t of tgts) { t.alive = true; t.hp = Math.max(1, Math.floor(t.maxHp * (eff.reviveHp || 0.25))); t.statuses = []; if (eff.immune !== false) { t.reviveImmune = true; t.reviveImmuneRounds = eff.reviveImmuneRounds || 0; } this.emit({ type: 'revive', source: caster, target: t }); c.target = t; c.dur = 2; runSkill(fx, 'onBuff', c); } return ev; }
    if (skill.type === 'buff' || skill.type === 'counter') {
      if (skill.target === 'enemy') { const t = this.pickFoe(caster, this.alive(foes)); if (t) { if (eff.tauntedBy) t.tauntedBy = caster; this.buff(t, { dodgeDebuff: (eff.atkDebuff || 0) + (eff.dodgeDebuff || 0), dmgBuff: -(eff.dmgDebuff || 0), duration: eff.duration || eff.rounds || eff.dodgeDebuffDur || 2 }); this.emit({ type: 'taunt', source: caster, target: t }); c.target = t; c.dur = eff.duration || eff.rounds || 2; runSkill(fx, 'onBuff', c); } return ev; }
      let tgts = skill.target === 'party' ? aliveAllies : skill.target === 'self' || skill.type === 'counter' ? [caster] : [this.mostHurt(aliveAllies) || caster];
      if (eff.excludeSelf) tgts = tgts.filter(t => t !== caster).length ? tgts.filter(t => t !== caster) : tgts;
      if (eff.targets > 1 && skill.target !== 'party') tgts.push(...aliveAllies.filter(a => !tgts.includes(a)).slice(0, eff.targets - 1));
      for (const t of tgts) { const dur = eff.duration || eff.rounds || 2;
        if (eff.dmgBuff) this.buff(t, { dmgBuff: eff.dmgBuff, duration: dur }); if (eff.dmgReduct) this.buff(t, { dmgReduct: eff.dmgReduct, duration: dur }); if (eff.reflect) this.buff(t, { reflect: eff.reflect, duration: dur }); if (eff.dodgeBuff) this.buff(t, { dodgeBuff: eff.dodgeBuff, duration: dur }); if (eff.critBuff) this.buff(t, { critBuff: eff.critBuff, duration: dur }); if (eff.critChance) this.buff(t, { critBuff: eff.critChance * 100, duration: dur }); if (eff.spellDmgBuff) this.buff(t, { spellDmgBuff: eff.spellDmgBuff, duration: dur }); if (eff.initiative) this.buff(t, { initiative: eff.initiative, duration: dur });
        if (eff.tempHp) t.hp = Math.min(t.maxHp + eff.tempHp, t.hp + eff.tempHp); if (eff.taunt) t.taunting = dur; if (eff.stealth) t.stealth = dur;
        const barrier = eff.barrier != null ? (eff.barrier < 5 ? Math.round(eff.barrier * (caster.derived?.INT || 10) * 2) : eff.barrier) : eff.shield ? Math.round((eff.shield.conMult || 3) * (caster.derived?.CON || 10)) : 0;
        if (barrier) this.addStatus(t, 'barrier', eff.shield?.duration || dur, barrier, caster);
        if (eff.armorBonus) this.buff(t, { armorBonus: eff.armorBonus, duration: dur }); if (eff.extraAction) t.extraActions = (t.extraActions || 0) + eff.extraAction;
        if (eff.healPct) this.healUnit(t, Math.round(t.maxHp * eff.healPct), skill.name, caster, 'skill:' + skill.id);
        if (eff.regenPct) this.addStatus(t, 'regen', dur, Math.round(t.maxHp * eff.regenPct), caster);
        if (eff.mpRegen) this.gainMana(t, eff.mpRegen, skill.name, caster, 'skill:' + skill.id);
        if (eff.parryCount || skill.type === 'counter') t.parry = (t.parry || 0) + (eff.parryCount || 1);
        if (eff.thorns) this.buff(t, { reflect: eff.thorns, duration: dur });
        if (eff.cleanseParty || eff.cleanse) this.cleanse(t, 'all');
        c.target = t; c.dur = dur; runSkill(fx, 'onBuff', c);
      }
      if (eff.enemySkipRound) for (const e of this.alive(foes)) this.addStatus(e, 'stun', 1 + (eff.enemySkipExtra || 0) + (eff.enemySkipRounds || 0), 0, caster);
      c.totalDealt = 0; runSkill(fx, 'onEnd', c); return ev;
    }
    // damage skills (melee / ranged / magic / zone / damage / debuff / trap)
    let tgts = skillTargetOverride(fx, c) || this.skillTargets(skill, caster, foes, allies); if (skill.type === 'zone') tgts = this.alive(foes); if (!tgts.length) { c.totalDealt = 0; runSkill(fx, 'onEnd', c); return ev; }
    c.targets = tgts;
    const hits = hitCount(skill); const falloff = { 1: 1, 2: 0.8, 3: 0.6 }[Math.min(3, new Set(tgts).size)] ?? 0.5;
    const consumes = eff.consumesFlairStacks ?? skill.consumesFlairStacks; const builds = eff.buildsFlairStacks ?? skill.buildsFlairStacks;
    const stacks = consumes ? (caster.flair || 0) : 0; if (consumes) caster.flair = eff.keepStacks || 0;
    let baseDmg = this.skillDamage(caster, skill) * this.dmgBuffMult(caster) * falloff * (stacks ? Math.max(1, stacks) * (eff.stackDmgMult || 1) : 1);
    if (builds) caster.flair = Math.min(eff.maxStacks ?? skill.maxStacks ?? 99, (caster.flair || 0) + builds);
    let totalDealt = 0;
    tgts.forEach((t, ti) => { for (let h = 0; h < hits; h++) { if (!t.alive) continue;
      c.target = t; c.targetIndex = ti; c.hitIndex = h;
      if (!eff.neverMiss && !(skill.type === 'magic') && this.rng() * 100 >= this.hitChance(caster, t)) { this.emit({ type: 'miss', source: caster, target: t, label: skill.name }); continue; }
      let raw = baseDmg * skillMult(fx, 'dmgMult', c) + skillSum(fx, 'dmgFlat', c);
      let crit = false; const critChance = caster.derived.critChance + (eff.critBonus || 0) * 100 + skillSum(fx, 'critBonus', c) + traitSum('critBonus', this, caster, t);
      if (this.rng() * 100 < critChance) { crit = true; raw *= caster.derived.critDamage; }
      if (eff.executeThreshold && t.hp / t.maxHp <= eff.executeThreshold) raw *= eff.executeMult || 3;
      const vsDemon = eff.bonusVsDemon ?? skill.bonusVsDemon, vsUndead = eff.bonusVsUndead ?? skill.bonusVsUndead;
      if (vsDemon && isDemonT(t)) raw *= 1 + vsDemon; if (vsUndead && isUndeadT(t)) raw *= 1 + vsUndead;
      if (eff.damageVsStatus) for (const [st, b] of Object.entries(eff.damageVsStatus)) if (this.has(t, st)) raw *= 1 + b;
      const penRaw = eff.armorPen ?? skill.armorPen ?? 0; const pen = (penRaw > 1 ? 0 : penRaw) + skillSum(fx, 'armorPen', c);
      const dealt = this.applyDamage(caster, t, Math.round(raw), { magic, armorPen: pen, crit, label: skill.name, via: 'skill:' + skill.id, dtype, itemId: caster.equipment?.weapon?.id || null });
      totalDealt += dealt; c.dealt = dealt; c.crit = crit; c.raw = raw;
      if (t.alive) for (const se of skill.statusEffects || eff.statusEffects || []) if (this.rng() < (se.chance ?? 0.5)) this.addStatus(t, se.type, (se.duration ?? 2) + (DOT.includes(se.type) ? caster.burnExtend || 0 : 0), se.power ?? (DOT.includes(se.type) ? Math.max(3, Math.floor(caster.derived.INT * 0.15)) : 4), caster);
      if (t.alive && eff.armorReduce) this.addStatus(t, 'sunder', eff.armorReduceDuration || 3, eff.armorReduce, caster);
      if (t.alive && eff.actionsLost) this.addStatus(t, 'stun', 1, 0, caster);
      if (t.alive && eff.mpDrain && !eff.mpDrainDamage) t.mp = Math.max(0, (t.mp || 0) - eff.mpDrain);
      if (t.alive && eff.stunChance && this.rng() < eff.stunChance) this.addStatus(t, 'stun', 1, 0, caster);
      if (t.alive && eff.bleedChance && this.rng() < eff.bleedChance) this.addStatus(t, 'bleed', 2, 5, caster);
      if (t.alive && eff.bleed) this.addStatus(t, 'bleed', eff.bleed.duration || 2, eff.bleed.power || 5, caster);
      if (t.alive && eff.slow) this.addStatus(t, 'slow', eff.slow.duration || 2, 0, caster);
      if (eff.lifesteal && dealt > 0) this.healUnit(caster, Math.round(dealt * eff.lifesteal), 'life steal', caster, 'skill:' + skill.id);
      if (skill.lifesteal && dealt > 0) this.healUnit(caster, Math.round(dealt * skill.lifesteal), 'life steal', caster, 'skill:' + skill.id);
      runSkill(fx, 'onHit', c);
    } });
    if (skill.type === 'zone' && skill.healMult) for (const a of aliveAllies) this.healUnit(a, this.skillHeal(caster, skill), skill.name, caster, 'skill:' + skill.id);
    if (skill.id === 'fate_weave' && totalDealt) { const t = this.mostHurt(aliveAllies); if (t) this.healUnit(t, totalDealt, 'Fate Weave', caster, 'skill:fate_weave'); }
    if (eff.mpOnHit) this.gainMana(caster, eff.mpOnHit, skill.name, caster, 'skill:' + skill.id);
    c.totalDealt = totalDealt; c.target = tgts[0]; runSkill(fx, 'onEnd', c);
    const legendary = caster.derived?.legendary || [];
    if (magic && legendary.includes('low_mana_shockwave') && caster.mp <= caster.maxMp * 0.25) for (const e of this.alive(foes)) this.applyDamage(caster, e, Math.round(15 + caster.derived.INT * 0.5), { magic: true, label: 'Shockwave', via: 'legendary:low_mana_shockwave', dtype: 'arcane' });
    if (magic && legendary.includes('echo_cast') && this.rng() < 0.25 && tgts[0]?.alive) this.applyDamage(caster, tgts[0], Math.max(1, Math.round(baseDmg * 0.5)), { magic: true, label: 'Echo Cast', via: 'legendary:echo_cast', dtype: 'arcane' });
    if (legendary.includes('mage_missile_aoe') && ['magic_missile', 'fire_bolt', 'chaos_bolt', 'wild_bolt'].includes(skill.id)) { const o = this.alive(foes).find(e => e !== tgts[0]); if (o) this.applyDamage(caster, o, Math.max(1, Math.round(baseDmg * 0.6)), { magic: true, label: 'Arcane Bounce', via: 'legendary:mage_missile_aoe', dtype: 'arcane' }); }
    return ev;
  }
  buff(t, b) { const dur = b.duration || 2; t.buffs.push({ ...b, duration: dur }); this.recomputeBuffs(t); }
  recomputeBuffs(t) {
    t.dmgBuff = 0; t.dmgReduct = 0; t.reflect = 0; t.spellDmgBuff = 0; let dodge = 0, crit = 0, armor = 0, hit = 0, mr = 0, init = 0;
    for (const b of t.buffs) { t.dmgBuff += b.dmgBuff || 0; t.dmgReduct = Math.max(t.dmgReduct, b.dmgReduct || 0); t.reflect = Math.max(t.reflect, b.reflect || 0); t.spellDmgBuff += b.spellDmgBuff || 0; dodge += (b.dodgeBuff || 0) - (b.dodgeDebuff || 0); crit += b.critBuff || 0; armor += b.armorBonus || 0; hit += b.hitBuff || 0; mr += b.magicResistBonus || 0; init += b.initiative || 0; }
    t._hitBuff = hit; t._initBuff = init;
    if (t.derived) { t.derived.dodge = (t.derived.baseDodge ?? (t.derived.baseDodge = t.derived.dodge)) + dodge; t.derived.critChance = (t.derived.baseCrit ?? (t.derived.baseCrit = t.derived.critChance)) + crit; t.derived.armor = (t.derived.baseArmor ?? (t.derived.baseArmor = t.derived.armor)) + armor; t.derived.magicResist = (t.derived.baseMr ?? (t.derived.baseMr = t.derived.magicResist)) + mr; }
    else { t.dodge = (t.baseDodge ?? (t.baseDodge = t.dodge)) + dodge; }
  }
  mostHurt(list) { return [...list].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] || null; }
  pickFoe(att, foes) {
    if (!foes.length) return null; const awake = foes.filter(f => !this.has(f, 'sleep')); const pool = awake.length ? awake : foes;
    if (att.isEnemy) { const totem = pool.find(h => this.has(h, 'taunt_totem')); if (totem) return totem; if (att.tauntedBy?.alive) return att.tauntedBy; const taunting = pool.filter(h => h.taunting > 0); if (taunting.length) return taunting[0]; const visible = pool.filter(h => !(h.stealth > 0)); const p2 = visible.length ? visible : pool; const comps = p2.filter(h => h.isCompanion); return comps[0] || p2[0]; }
    return pool[Math.floor(this.rng() * pool.length)];
  }
  // ---------- AI
  usableSkills(h) {
    const S = this.ctx.skills; const silenced = this.statusSum2(h, 'noSpells');
    return (h.skills || []).map(id => S[id] ? { id, ...S[id] } : null).filter(Boolean).filter(s => s.type !== 'passive').map(s => mergeSkill(s, h))
      .filter(s => !(h.cooldowns[s.id] > 0) && (h._freeSkills?.[s.id] || Math.max(0, (s.mpCost || 0) - (h.derived?.mpCostReduce || 0)) <= h.mp) && !(silenced && ((s.mpCost || 0) > 0 || s.type === 'magic' || s.type === 'heal')))
      .filter(s => skillGate(skillFx(s), { C: this, caster: h, skill: s, eff: s.effect || {}, foes: h.isEnemy ? this.heroes : this.enemies, allies: h.isEnemy ? this.enemies : this.heroes }));
  }
  /** True when any status on `c` sets the given behaviour switch. */
  statusSum2(c, flag) { return c.statuses.some(s => statusDef(s.type)?.[flag]); }
  heroAI(h) {
    const allies = this.heroes, foes = this.enemies; const sk = this.usableSkills(h); const aliveA = this.alive(allies); const isHealer = HEALER_CLASSES.includes(h.class);
    const rev = sk.find(s => s.type === 'revive'); if (rev && allies.some(a => !a.alive)) return this.cast(h, rev, foes, allies);
    const heals = sk.filter(s => s.type === 'heal' && s.target !== 'self').sort((a, b) => (b.healMult || 0) - (a.healMult || 0)); const hurt = this.mostHurt(aliveA); const frac = hurt ? hurt.hp / hurt.maxHp : 1;
    if (heals.length && (frac < 0.25 || (isHealer && frac < 0.65))) return this.cast(h, heals[0], foes, allies);
    const self = sk.find(s => s.type === 'heal' && s.target === 'self'); if (self && h.hp / h.maxHp < 0.4) return this.cast(h, self, foes, allies);
    const shield = sk.find(s => s.type === 'buff' && (s.effect?.barrier || s.effect?.shield || s.effect?.dmgReduct) && s.target !== 'enemy'); if (isHealer && shield && frac < 0.6 && !aliveA.some(a => a.statuses.some(s => s.type === 'barrier'))) return this.cast(h, shield, foes, allies);
    const dmg = sk.filter(s => ['melee', 'ranged', 'magic', 'damage', 'zone', 'trap', 'debuff'].includes(s.type) && (s.damageMult ?? 1) > 0 || (s.statusEffects?.length && s.type === 'magic')); if (dmg.length) { const n = this.alive(foes).length; dmg.sort((a, b) => (b.damageMult || 0.5) * hitCount(b) * this.expectedTargets(b, n) - (a.damageMult || 0.5) * hitCount(a) * this.expectedTargets(a, n)); if ((dmg[0].mpCost || 0) === 0 || this.rng() < 0.8) return this.cast(h, dmg[0], foes, allies); }
    const buff = sk.find(s => s.type === 'buff' && s.target !== 'enemy' && !h.buffs.length); if (buff && this.round_ <= 2) return this.cast(h, buff, foes, allies);
    const any = sk.find(s => s.type !== 'buff' || s.target === 'enemy'); if (any && this.rng() < 0.5) return this.cast(h, any, foes, allies);
    return this.attack(h, this.pickFoe(h, this.alive(foes)));
  }
  enemyAI(e) {
    const foes = this.heroes, allies = this.enemies; const targets = this.alive(foes); if (!targets.length) return;
    if (e._windUp) { const w = e._windUp; if (w.taken >= (w.interruptThreshold || 1e9)) { this.emit({ type: 'interrupt', source: e, skill: w.spell.id, name: w.spell.name }); e._windUp = null; } else if (--w.rounds > 0) { this.emit({ type: 'windup', source: e, skill: w.spell.id, name: w.spell.name, rounds: w.rounds }); return; } else { e._windUp = null; return this.resolveSpell(e, w.spell, targets, allies); } }
    if (e.role === 'healer' && !this.statusSum2(e, 'noSpells')) { const w = this.mostHurt(this.alive(allies)); if (w && w.hp / w.maxHp < 0.6) { this.healUnit(w, Math.max(8, Math.round(e.dmg[1] * 0.8)), 'mend', e, 'effect:mend'); return; } }
    const spells = (e.spellList || []).map(id => this.ctx.spells[id]).filter(s => s && !(e.cooldowns[s.id] > 0));
    if (spells.length && !this.statusSum2(e, 'noSpells') && this.rng() < (e.spellChance || 0)) {
      const sp = spells[Math.floor(this.rng() * spells.length)]; e.cooldowns[sp.id] = (sp.cooldown || 2) + 1;
      if (sp.windUp?.rounds) { e._windUp = { spell: sp, rounds: sp.windUp.rounds, interruptThreshold: sp.windUp.interruptThreshold, taken: 0 }; this.emit({ type: 'windup', source: e, skill: sp.id, name: sp.name, rounds: sp.windUp.rounds }); return; }
      return this.resolveSpell(e, sp, targets, allies);
    }
    this.attack(e, this.pickFoe(e, targets));
  }
  /** Resolve one enemy spell: damage, statuses (single or a list), healing and self-healing. */
  resolveSpell(e, sp, targets, allies) {
    // A spell that is not explicitly locked down can be snatched out of the air by anyone
    // who has a pilfer effect running (skills.json `pilferBuff` / `pilferCount`).
    if (sp.stealable !== false) { const thief = this.alive(e.isEnemy ? this.heroes : this.enemies).find(x => x._pilfering > 0); if (thief) { thief._pilfering--; this.gainMana(thief, Math.round((sp.effect?.damage || 10) / 2), 'snatched ' + sp.name, thief, 'effect:pilfer'); this.emit({ type: 'steal', source: thief, target: e, skill: sp.id, name: sp.name }); return; } }
    this.emit({ type: 'skill', source: e, skill: sp.id, name: sp.name, skillType: 'magic' });
    const ef = sp.effect || {}; const tgts = sp.target === 'aoe' ? targets : sp.target === 'self' ? [e] : sp.target === 'ally_lowest_hp' ? [this.mostHurt(this.alive(allies))] : [this.pickFoe(e, targets)];
    if (ef.selfHeal) this.healUnit(e, ef.selfHeal, sp.name, e, 'skill:' + sp.id);
    for (const t of tgts) {
      if (!t) continue;
      if (ef.heal) { this.healUnit(t, ef.heal, sp.name, e, 'skill:' + sp.id); continue; }
      if (ef.damage) this.applyDamage(e, t, Math.max(1, Math.round(ef.damage * this.spellScale(e) * (1 - (e._intDebuff || 0)))), { magic: sp.fxKind !== 'physical', label: sp.name, via: 'skill:' + sp.id, dtype: sp.fxKind === 'ice' ? 'cold' : sp.fxKind === 'nature' ? 'poison' : sp.fxKind || 'arcane' });
      const list = [...(ef.statuses || []), ...(ef.status ? [ef.status] : []), ...(ef.statusEffect ? [ef.statusEffect] : []), ...(ef.debuff ? [{ type: ef.debuff }] : [])];
      for (const s of list) { if (!t.alive) break; if (this.rng() < (s.chance ?? 1)) this.addStatus(t, s.type || s, s.duration || 2, s.power || 4, e); }
    }
  }
  spellScale(e) { return Math.max(0.3, (e.dmg[1] / ((e.baseDmgMax || e.dmg[1] / 0.3) || 1))); }
  // ---------- rounds
  buildOrder() { const all = [...this.alive(this.heroes), ...this.alive(this.enemies)]; return all.map(c => ({ c, roll: ((c.derived?.initiative ?? c.initiative ?? (c.dodge + c.level)) + (c._legendaryInitBonus || 0) + (c._initBuff || 0) + this.rng() * 10) * this.statusMult(c, 'initMult') })).sort((a, b) => b.roll - a.roll).map(x => x.c); }
  tickStatuses() {
    for (const c of [...this.heroes, ...this.enemies]) {
      if (!c.alive) continue;
      fireTrait('roundStart', this, c);
      if (!c.alive) continue;
      for (const s of c.statuses.slice()) {
        const d = statusDef(s.type); if (!d) continue;
        if (d.dot) { let amt = Math.max(1, s.power || 3); if (d.holy && (isUndeadT(c) || isDemonT(c))) amt *= 2;
          const before = c.hp; c.hp = Math.max(0, c.hp - Math.round(amt * (1 - (c.derived?.dotReduce || 0))));
          const done = before - c.hp;
          this.emit({ type: 'dot', target: c, status: s.type, amount: done, source: s.source || null, via: 'dot:' + s.type, viaName: s.type[0].toUpperCase() + s.type.slice(1).replace('_', ' '), dtype: s.type === 'burn' ? 'fire' : s.type === 'holy_burn' ? 'holy' : s.type, overkill: Math.max(0, Math.round(amt) - before), killingBlow: before > 0 && c.hp === 0 });
          if (s.source?.alive && s.source._dotLifesteal) this.healUnit(s.source, Math.round(done * s.source._dotLifesteal), 'drain', s.source, 'effect:dotLifesteal');
          if (c.hp <= 0) { this.kill(s.source?.alive ? s.source : null, c); break; }
        }
        if (d.heal) this.healUnit(c, Math.max(1, s.power || 3), 'regen', s.source || null, 'status:regen');
        if (s.type === 'barrier' && s.fromMagicShield) s.power = Math.min(s.maxPower ?? s.power, s.power + (s.regen || 0));
      }
      if (!c.alive) continue;
      if (c._rebleed) { if (--c._rebleed.rounds <= 0) { this.addStatus(c, 'bleed', 2, c._rebleed.power, c._rebleed.source); c._rebleed = null; } }
      for (const s of c.statuses) { s.duration--; if (s.type === 'stun' && s.duration <= 0) { c.stunCount = (c.stunCount || 0) + 1; c.stunImmune = Math.max(c.stunImmune || 0, 2 + c.stunCount - 1); } }
      c.statuses = c.statuses.filter(s => s.duration > 0 || (s.type === 'barrier' && s.fromMagicShield));
      if (c.stunImmune > 0) c.stunImmune--;
      for (const b of c.buffs) b.duration--; c.buffs = c.buffs.filter(b => b.duration > 0); this.recomputeBuffs(c);
      if (c.taunting > 0) c.taunting--; if (c.stealth > 0) c.stealth--; if (c.parry > 0 && this.round_ > 1) c.parry = 0;
      if (c._tempArmorPenRounds > 0 && --c._tempArmorPenRounds === 0) c._tempArmorPen = 0;
      if (c._immuneRounds > 0 && --c._immuneRounds === 0) c._immune = null;
      if (c._healReduceRounds > 0 && --c._healReduceRounds === 0) c._healReduce = 0;
      if (c._mrDebuffRounds > 0 && --c._mrDebuffRounds === 0) c._mrDebuff = 0;
      if (c._fireVulnRounds > 0 && --c._fireVulnRounds === 0) c._fireVuln = 0;
      if (c._intDebuffRounds > 0 && --c._intDebuffRounds === 0) c._intDebuff = 0;
      if (c.onHitStatusRounds > 0 && --c.onHitStatusRounds === 0) c.onHitStatus = null;
      if (c.extraActionRounds > 0 && --c.extraActionRounds === 0) c.extraActionsEachRound = Math.max(0, (c.extraActionsEachRound || 1) - 1);
      if (c.reviveImmuneRounds > 0) c.reviveImmuneRounds--; else if (c.reviveImmune && c.actedSinceRevive) c.reviveImmune = false;
      if (!c.isEnemy) { const d = c.derived; c.mp = Math.min(c.maxMp, Math.round(c.mp) + Math.round((d.manaRegen || 1) * traitMult('manaRegenMult', this, c))); if (d.hpRegen) c.hp = Math.min(c.maxHp, Math.round(c.hp) + Math.max(1, Math.round(d.hpRegen))); }
      else if (c.regenPct && c.hp < c.maxHp) this.healUnit(c, Math.max(1, Math.round(c.maxHp * c.regenPct)), 'regeneration', c, 'effect:regen');
      for (const k of Object.keys(c.cooldowns)) { c.cooldowns[k]--; if (c.cooldowns[k] <= 0) delete c.cooldowns[k]; }
    }
  }
  takeTurn(c) {
    if (!c.alive) return; if (c.reviveImmune) c.actedSinceRevive = true;
    for (const s of c.statuses) { const d = statusDef(s.type); if (d?.skip && this.rng() < d.skip) { if (d.consumed) this.removeStatus(c, s.type); return this.emit({ type: 'skip', target: c, why: s.type }); } }
    if (c.isEnemy) this.enemyAI(c); else this.heroAI(c);
    const hasteN = c.statuses.reduce((n, s) => n + (statusDef(s.type)?.extraActions || 0), 0);
    const rooted = this.statusSum2(c, 'noExtra');
    const extra = rooted ? 0 : (c.extraActions || 0) + ({ fast: 1, very_fast: 2 }[c.derived?.attackSpeed] || 0) + (c.extraActionsEachRound || 0) + hasteN;
    c.extraActions = 0;
    for (let i = 0; i < extra && c.alive && this.alive(c.isEnemy ? this.heroes : this.enemies).length; i++) { this.emit({ type: 'extra', target: c }); if (c.isEnemy) this.enemyAI(c); else this.heroAI(c); }
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
/**
 * How many shots a multi-shot skill fires (E23).
 *
 * `aoe: 'random3'` / `'multi3'` / `'chain'` only say the *shape*; a talent or level upgrade that
 * says "5 bolts instead of 3" writes `bolts` (or `targets`, or `chainTargets`) into the merged
 * skill, and that has to win over the number baked into the shape's name. Before this existed,
 * Magic Missile's "Missile Barrage" talent still fired three bolts.
 */
/**
 * How many times a skill strikes each target it picks. The merged skill's `effect.hits` is the
 * authority (mergeSkill seeds it from the skill's own `hits` so a talent has something to add to);
 * the top-level `hits` is only the fallback for a skill that was never merged.
 */
export function hitCount(skill) { const v = skill?.effect?.hits ?? skill?.hits ?? 1; const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(12, n) : 1; }
export function shotCount(skill, fallback = 3) {
  const e = skill?.effect || {};
  const v = e.bolts ?? skill?.bolts ?? e.targets ?? skill?.targets ?? e.chainTargets ?? e.chainCount ?? e.glaiveCount ?? fallback;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(12, n) : fallback;
}
const isUndeadT = t => /skeleton|ghoul|wraith|lich|undead|bone|shade|wight|zombie|revenant/i.test(t?.templateId || t?.id || '');
const isDemonT = t => /demon|imp|fiend|hell|fel|archfiend|devil/i.test(t?.templateId || t?.id || '');
export function fleeCheck(heroes, enemies, rng = Math.random) { const avgE = enemies.reduce((s, e) => s + Math.max(1, Math.round(e.xpValue / 8)), 0) / enemies.length; const avgP = heroes.reduce((s, h) => s + h.level, 0) / heroes.length; const dc = Math.round(Math.max(8, Math.min(28, 12 + avgE - avgP))); const best = checkBonus(Math.max(...heroes.filter(h => h.alive).map(h => h.derived?.DEX ?? h.attrs?.DEX ?? 8))); const roll = 1 + Math.floor(rng() * 20); return { ok: best + roll >= dc, dc, roll, best }; }

/** Feed one combat event into a damage meter. Shared by the live UI (js/main.js) and the
 *  headless simulator (tools/sim-emberveil.mjs) so both fill `meter.itemStats` the same way. */
export function recordEvent(meter, ev, t) {
  const nm = u => u?.short || u?.name || '?';
  if (ev.type === 'damage' || ev.type === 'dot') return meter.record({ t, source: ev.source?.id, sourceName: ev.source ? nm(ev.source) : (ev.type === 'dot' ? ev.status : '?'), target: ev.target.id, targetName: nm(ev.target), kind: 'damage', amount: ev.amount, overkill: ev.overkill || 0, absorbed: ev.absorbed || 0, crit: !!ev.crit, dtype: ev.dtype || 'physical', via: ev.via || 'attack', viaName: ev.viaName || ev.label || 'Attack', itemId: ev.itemId || null, killingBlow: !!ev.killingBlow, tags: ev.tags || [] });
  if (ev.type === 'miss') return meter.record({ t, source: ev.source?.id, sourceName: nm(ev.source), target: ev.target.id, targetName: nm(ev.target), kind: 'miss', amount: 0, via: ev.label ? 'skill:' + ev.label : 'attack', viaName: ev.label || 'Attack', tags: ['dodged'] });
  if (ev.type === 'status') return meter.record({ t, source: ev.source?.id || ev.target.id, sourceName: ev.source ? nm(ev.source) : 'effect', target: ev.target.id, targetName: nm(ev.target), kind: 'status', amount: 0, status: ev.status, duration: ev.duration, via: 'status:' + ev.status, viaName: ev.status });
  if (ev.type === 'down' || ev.type === 'kill') return meter.record({ t, source: ev.source?.id, sourceName: nm(ev.source), target: ev.target.id, targetName: nm(ev.target), kind: 'death', amount: 0, via: 'death', viaName: 'Death' });
  if (ev.type === 'heal' && ev.amount > 0) return meter.record({ t, source: ev.source?.id || ev.target.id, sourceName: ev.source ? nm(ev.source) : (ev.label || 'regen'), target: ev.target.id, targetName: nm(ev.target), kind: 'heal', amount: ev.amount, via: ev.via || (ev.label ? 'effect:' + ev.label : 'regen'), viaName: ev.label || 'Regen', dtype: 'holy' });
  return null;
}
export function skillType(skill) { const id = (skill.id || '') + ' ' + (skill.name || ''); if (skill.damageType) return skill.damageType; if (/fire|flame|burn|pyro|meteor|ignite|infern|cinder/i.test(id)) return 'fire'; if (/frost|ice|blizzard|cold|rime/i.test(id)) return 'cold'; if (/lightning|thunder|storm|static|tempest|spark|jolt/i.test(id)) return 'lightning'; if (/holy|smite|divine|consecrat|light|radiant|purge|silver/i.test(id)) return 'holy'; if (/shadow|void|soul|death|drain|corrupt|hellfire|bone|necro|curse/i.test(id)) return 'shadow'; if (/poison|venom/i.test(id)) return 'poison'; if (/bleed|rend|gash|cleave/i.test(id)) return 'physical'; return skill.type === 'magic' ? 'arcane' : 'physical'; }
