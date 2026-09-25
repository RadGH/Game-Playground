// Auto-battler: flat numbers, turn order party then enemies, spells with cooldowns, simple targeting.
// Pure logic (no DOM): runs a round at a time and emits events the UI turns into animation + dialog.
//   const c = new Combat(party, enemies, rules, rng); while (!c.over) { const events = c.round(); ... }
export const EV = { ATTACK: 'attack', SPELL: 'spell', HEAL: 'heal', DOWN: 'down', BLOODIED: 'bloodied', KILL: 'kill', MISS: 'miss', REGEN: 'regen', WIN: 'win', LOSE: 'lose', START: 'start' };
export class Combat {
  constructor(party, enemies, rules, rng = Math.random) { this.party = party; this.enemies = enemies; this.rules = rules; this.rng = rng; this.round_ = 0; this.over = false; this.result = null; this.cooldowns = new Map(); this.buffs = { partyDamage: 0, partyShield: 0, enemyMiss: 0 }; this.bloodied = new Set(); this.log = []; }
  alive(list) { return list.filter(c => c.hp > 0); }
  pick(list) { const a = this.alive(list); return a.length ? a[Math.floor(this.rng() * a.length)] : null; }
  weakest(list) { const a = this.alive(list); return a.sort((x, y) => x.hp - y.hp)[0] || null; }
  dmg(attacker, target, base) { const red = target.armour || 0; return Math.max(1, base - red - (target.side === 'party' ? this.buffs.partyShield : 0)); }
  hit(source, target, amount, kind = EV.ATTACK, extra = {}) {
    const before = target.hp; target.hp = Math.max(0, target.hp - amount); const ev = { type: kind, source, target, amount, ...extra }; this.log.push(ev); const out = [ev];
    if (target.hp === 0 && before > 0) { out.push({ type: target.side === 'party' ? EV.DOWN : EV.KILL, source, target }); if (target.side === 'party') this.bloodied.delete(target.id); }
    else if (target.side === 'party' && target.hp > 0 && target.hp <= target.maxHp / 2 && !this.bloodied.has(target.id)) { this.bloodied.add(target.id); out.push({ type: EV.BLOODIED, target }); }
    return out;
  }
  cd(id, spell) { return this.cooldowns.get(id + ':' + spell) || 0; }
  cast(caster, spellId, allies, foes) {
    const sp = this.rules.spells[spellId]; if (!sp) return []; this.cooldowns.set(caster.id + ':' + spellId, sp.cooldown + 1);
    const out = [{ type: EV.SPELL, source: caster, spell: sp, spellId }];
    const bonus = caster.side === 'party' ? this.buffs.partyDamage : 0;
    if (sp.kind === 'attack_all') for (const t of this.alive(foes)) out.push(...this.hit(caster, t, this.dmg(caster, t, sp.power + bonus), EV.SPELL, { spell: sp }));
    else if (sp.kind === 'attack_one') { const t = this.weakest(foes); if (t) { out.push(...this.hit(caster, t, this.dmg(caster, t, sp.power + bonus), EV.SPELL, { spell: sp })); if (sp.stun) t.stunned = 1; } }
    else if (sp.kind === 'drain') { const t = this.pick(foes); if (t) { const d = this.dmg(caster, t, sp.power); out.push(...this.hit(caster, t, d, EV.SPELL, { spell: sp })); caster.hp = Math.min(caster.maxHp, caster.hp + d); out.push({ type: EV.HEAL, source: caster, target: caster, amount: d }); } }
    else if (sp.kind === 'heal_one') { const t = this.weakest(allies); if (t) { const h = Math.min(sp.power, t.maxHp - t.hp); t.hp += h; out.push({ type: EV.HEAL, source: caster, target: t, amount: h }); } }
    else if (sp.kind === 'shield_all') { this.buffs.partyShield = sp.power; this.buffs.shieldRounds = 2; }
    else if (sp.kind === 'buff_all') { this.buffs.partyDamage = sp.power; this.buffs.buffRounds = 2; }
    else if (sp.kind === 'dodge_all') { this.buffs.enemyMiss = 1; }
    return out;
  }
  /** Should this party member cast now? healers cast when someone is hurt; casters cast when off cooldown and ≥2 foes or a boss. */
  wantsSpell(c, allies, foes) {
    if (!c.spell || this.cd(c.id, c.spell) > 0) return false; const sp = this.rules.spells[c.spell]; if (!sp) return false;
    if (sp.kind === 'heal_one') return allies.some(a => a.hp > 0 && a.hp <= a.maxHp * 0.6);
    if (sp.kind === 'shield_all' || sp.kind === 'dodge_all') return this.alive(foes).length >= 2 || this.round_ === 1;
    if (sp.kind === 'buff_all') return this.round_ <= 2 || this.alive(foes).length >= 3;
    return this.alive(foes).length >= 2 || this.alive(foes).some(f => f.tags?.includes('boss')) || this.rng() < 0.5;
  }
  actorTurn(c, allies, foes) {
    if (c.hp <= 0) return []; if (c.stunned) { c.stunned = 0; return [{ type: EV.MISS, source: c, reason: 'stunned' }]; }
    if (c.side === 'party' && this.wantsSpell(c, allies, foes)) return this.cast(c, c.spell, allies, foes);
    if (c.side === 'enemy' && c.spell && this.cd(c.id, c.spell) === 0 && this.rng() < 0.6) return this.cast(c, c.spell, allies, foes);
    if (c.side === 'enemy' && this.buffs.enemyMiss > 0) { this.buffs.enemyMiss--; return [{ type: EV.MISS, source: c, reason: 'veiled' }]; }
    const target = c.role === 'ranged' || c.role === 'caster' ? this.weakest(foes) : (this.rng() < 0.6 ? this.pick(foes) : this.weakest(foes)); if (!target) return [];
    const base = (c.damage || 1) + (c.side === 'party' ? this.buffs.partyDamage : 0);
    return this.hit(c, target, this.dmg(c, target, base));
  }
  /** One full round: every party member, then every enemy. Returns the event list. */
  round() {
    if (this.over) return []; this.round_++; const events = [];
    if (this.round_ === 1) events.push({ type: EV.START });
    for (const k of [...this.cooldowns.keys()]) this.cooldowns.set(k, Math.max(0, this.cooldowns.get(k) - 1));
    for (const c of this.party) { events.push(...this.actorTurn(c, this.party, this.enemies)); if (!this.alive(this.enemies).length) break; }
    if (this.alive(this.enemies).length) for (const e of this.enemies) { if (e.regen && e.hp > 0 && e.hp < e.maxHp) { e.hp = Math.min(e.maxHp, e.hp + e.regen); events.push({ type: EV.REGEN, source: e, amount: e.regen }); } events.push(...this.actorTurn(e, this.enemies, this.party)); if (!this.alive(this.party).length) break; }
    if (this.buffs.shieldRounds > 0 && --this.buffs.shieldRounds === 0) this.buffs.partyShield = 0;
    if (this.buffs.buffRounds > 0 && --this.buffs.buffRounds === 0) this.buffs.partyDamage = 0;
    if (!this.alive(this.enemies).length) { this.over = true; this.result = 'win'; events.push({ type: EV.WIN }); }
    else if (!this.alive(this.party).length) { this.over = true; this.result = 'lose'; events.push({ type: EV.LOSE }); }
    if (this.round_ > 40) { this.over = true; this.result = 'draw'; }
    return events;
  }
}
/** Numbers for an Item Vault entry (or a rolled item): { damage, armour, spell, kind } */
export function itemStats(item, rules) {
  const base = item.base || item; const tags = item.tags || base.tags || []; const cat = base.category, sub = base.sub; const out = { kind: 'junk' };
  if (cat === 'weapon') { const spell = rules.implementSpells[base.id]; if (spell && (sub === 'staff' || tags.includes('focus'))) return { kind: 'implement', spell, damage: 1 }; let d = rules.weaponDamage[sub] ?? 1; for (const [t, b] of Object.entries(rules.weaponTagBonus)) if (tags.includes(t)) d += b; if (item.enchant) d += 1; if (item.quality === 'masterwork') d += 1; if (item.quality === 'crude') d -= 1; return { kind: 'weapon', damage: Math.max(1, d) }; }
  if (cat === 'armour') { if (sub === 'shield') return { kind: 'shield', armour: 1 }; if (sub !== 'body') return { kind: 'wear', armour: 0 }; let a = tags.includes('heavy') ? 3 : tags.includes('medium') ? 2 : tags.includes('light') ? 1 : 0; if (item.enchant === 'Warding') a += 1; return { kind: 'armour', armour: a }; }
  if (rules.implementSpells[base.id]) return { kind: 'implement', spell: rules.implementSpells[base.id] };
  if (cat === 'alchemy' && tags.includes('healing')) return { kind: 'potion', heal: 4 };
  if (['regalia', 'vessel', 'lore', 'material', 'trophy', 'instrument', 'household'].includes(cat)) return { kind: 'treasure' };
  return out;
}
