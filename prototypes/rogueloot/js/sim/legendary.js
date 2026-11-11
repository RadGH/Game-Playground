// Legendary powers (ruling 18: "legendary powers only" — the loot chase). Pure. Fable designed 22 powers
// (data/legendaries.json); each one reshapes ONE skill (rule.type) or a basic action. A power is live while the item
// that carries it is worn, identified and not broken. Most powers rewrite the skill row at cast time (shape, extra
// effects, longer dots); a few hook the moment something happens (kills, crits, damage dealt, potions).
export function powersOf(w, p) {
  const out = [];
  for (const it of Object.values(p.char?.equip || {})) {
    if (!it?.power || it.ided === false || (it.dur && it.dur[0] <= 0)) continue;
    const pw = w.content.items?.powers?.[it.power]; if (pw) out.push(pw);
  }
  return out;
}
const forSkill = (w, p, id) => powersOf(w, p).filter(pw => pw.skill === id);
const walk = (es, f) => { for (const e of es || []) { f(e); walk(e.effects, f); } };
const clone = o => JSON.parse(JSON.stringify(o));

/** The skill row as this hero's legendary powers change it. Returns { row, ctx } (ctx: extra rules for this cast). */
export function shapeSkill(w, p, sk, row) {
  const pws = forSkill(w, p, sk.id); if (!pws.length) return { row, ctx: {} };
  row = clone(row); const ctx = { powers: pws.map(x => x.id) };
  for (const pw of pws) {
    const R = pw.rule;
    switch (R.type) {
      case 'skillShape': walk(row.effects, e => { if (e.do === 'area' && e.shape === 'cone') { e.shape = 'circle'; e.at = 'self'; walk(e.effects, x => { if (x.do === 'weapon') x.mult *= R.damageMult || 1; }); } }); break;
      case 'skillAdd': if (R.stun) row.effects.push({ do: 'debuff', kind: 'stun', secs: R.stun }); if (R.knockback) row.effects.push({ do: 'pull', dist: -R.knockback }); row.cd = (row.cd || 0) + (R.cooldownAdd || 0); break;
      case 'skillAllyBuff': row.effects.push({ do: 'buff', stat: 'armour', pct: R.buff?.armourPct || 20, secs: R.buff?.seconds || 8, who: 'party' }); break;
      case 'skillDot': walk(row.effects, e => { if (e.do === 'dot') e.secs = (e.secs || 5) * (R.durationMult || 1); }); break;
      case 'skillLeaveGround':
        if (R.enemyDebuff) row.effects.push({ do: 'zone', shape: 'circle', size: R.radius || 3, secs: R.seconds || 3, at: 'self', effects: [{ do: 'debuff', kind: 'damageDown', pct: Math.abs(R.enemyDebuff.hitChancePct || 40), secs: 1.2 }] });
        if (R.dps) { const b = row.effects.find(e => e.base); if (b) row.effects.push({ do: 'zone', shape: 'circle', size: R.radius || 2, secs: R.seconds || 3, effects: [{ do: 'damage', type: R.dps.element || 'fire', base: b.base.map(v => v * (R.dps.pctOfHit || 20) / 100) }] }); ctx.zoneAtTarget = true; }
        break;
      case 'skillCondition': if (row.cond === R.relax || row.cond === R.relax + 'Bonus') { delete row.cond; ctx.frontMult = R.frontMult ?? 0.6; } break;
      case 'skillMultiHit': { const extra = []; walk(row.effects, e => { if (e.do === 'weapon') { e.mult *= R.damageMult || 0.65; for (let i = 1; i < (R.hits || 2); i++) extra.push({ ...e }); } }); row.effects.push(...extra); break; }
      case 'skillShareBuff': ctx.shareCoat = { range: R.range || 6, durationMult: R.durationMult || 0.5 }; break;
      case 'skillRefund': ctx.refund = { kind: R.resource || 'energy', onKill: R.onKill || 0, onCrit: R.onCrit || 0 }; break;
      case 'skillSelfShield': row.effects.push({ do: 'shieldPct', pct: R.pctMaxHealth || 15, secs: R.seconds || 6 }); break;
      case 'skillChain': ctx.chain = { count: R.count || 2, range: R.range || 6, mult: R.damageMult || 0.5 }; break;
      case 'skillRate': ctx.wardPerMana = R.absorbPerMana || 2; break;
      case 'skillHealFromDamage': ctx.healFrom = { range: R.range || 12, pct: R.pct || 40 }; break;
      case 'skillHot': { const h = row.effects.find(e => e.do === 'heal'); if (h) row.effects.push({ do: 'hot', base: h.base.map(v => v * (R.pct || 30) / 100 / (R.seconds || 6)), secs: R.seconds || 6 }); break; }
      case 'skillArea': walk(row.effects, e => { if (e.do === 'area' || e.do === 'zone') e.size = (e.size || 4) * (R.radiusMult || 1.5); }); break;
      case 'skillTauntArea': row.effects.push({ do: 'area', shape: 'circle', size: R.range || 8, at: 'self', effects: [{ do: 'taunt' }] }); break;
      case 'skillCleanse': walk(row.effects, e => { if (e.do === 'zone' || e.do === 'area') (e.effects ||= []).push({ do: 'cleanse' }); }); break;
      case 'skillCharges': ctx.charges = R.charges || 2; ctx.chargeOnKill = !!(R.refundOnKill || R.refundOnKillWithin); break;
    }
  }
  return { row, ctx };
}
/** Basic-action powers. */
export function leechPct(w, p) { return powersOf(w, p).filter(pw => pw.rule.type === 'autoAttackLeech').reduce((s, pw) => s + (pw.rule.pct || 0), 0); }
export function potionRefund(w, p) { return powersOf(w, p).filter(pw => pw.rule.type === 'potionRefundChance').reduce((s, pw) => s + (pw.rule.pct || 0), 0); }
