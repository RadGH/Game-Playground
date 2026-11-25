// Oathwild — the standard TOOLTIP TEXT MODEL (owner 2026-11-23: real numbers, standardised). Pure.
// The client's one tooltip renderer draws only what this returns; every number goes through
// shared/format.js (via the bridge). One printer per sentence (lessons rule 4).
//
// Every describe* returns the same shape:
//   { title, kind, icon, rank: { now, max } | null,
//     rows:    [{ label, value }]                 cost / cast / cooldown / range / area (spells), stats (items)
//     lines:   [string]                           what it does, with this character's live numbers
//     auras:   [{ name, text }]                   each status it applies, explained
//     how:     [string]                           "How it's worked out" with this character's numbers
//     compare: [{ label, now, then, diff, better }]   items: against what is worn (green/red)
//     next:    { title, lines, needs } | null     the next rank
//     needs:   [string]                           what is missing to take / use it (empty = fine)
//     ok:      bool }                             can it be taken / worn right now
//
//   describeSpell(rules, char, spellId, { rank, cls })
//   describeItem(rules, char, item, { slot })   (a wand / tome / staff / sceptre / focus: what its attack does, js/rules/casters.js)
//   describeAura(rules, unit, statusId)
//   describeTalent(rules, char, talentId)
//   describeNode(rules, char, cls, nodeId)
//   describeClass(rules, char, cls, { flags })
//   describeSkill(rules, char, skillId)
//   enchantLine(def, { ilvl, power, roll })     what a learned enchantment adds to an item ("+6% attack speed")
//   modLine(rules, key, value)                   one stat change as a sentence piece ("+5% maximum health")

import { fmt, fmtHp, fmtPctOf, fmtSign, fmtRange, fmtSecs, describeAffix, handText, cooldownPower, STATUS_POWER_SHARE, makeRng } from './farhold.js';
import { sheetOf, attrTotals, shieldBlock, farholdShieldBlock } from './sheet.js';
import { spellRow, targetKind } from './spells.js';
import { castRow, spellSources, classDef, nodeOf, nodeKey, nodeName, nodeMaxRank, levelForRank, nodeRefusal, modsForSpell, classRefusal, classPower, rankCapAt, pointsLeft, classRules, requirementGaps } from './classes.js';
import { talentDef, talentRefusal, rowLevel } from './talents.js';
import { canWear, itemNeeds, profSources, attrHave } from './proficiency.js';
import { itemWeight, durabilityOf, isBroken } from './inventory.js';
import { auraNumbers, iconOf, dispelKind, isBeneficial } from './auras.js';
import { skillValue, xpToNext } from './skills-use.js';
import { spellPowerRange, spellMultiplier, monsterDef } from './combat.js';
import { finishCaster, casterKind, attackCard, riderLine, casterForms } from './casters.js';

export const ELEMENT_NAME = Object.freeze({ physical: 'Physical', fire: 'Fire', ice: 'Frost', lightning: 'Lightning', arcane: 'Arcane', shadow: 'Shadow', holy: 'Holy', nature: 'Nature', poison: 'Poison' });
const KIND_TEXT = { bolt: 'Aimed bolt', ground: 'Placed on the ground', cone: 'In front of you', line: 'A line ahead', self: 'On yourself', beam: 'Held beam' };
const ATTR_NAME = { int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const deg = rad => Math.round(rad * 180 / Math.PI);
const r0 = v => Math.round(v);
const range2 = ([a, b]) => (r0(a) === r0(b) ? fmt(r0(a)) : fmtRange(a, b));
const metres = v => `${fmt(v, { decimals: 1 })} m`;
const pctN = v => fmtPctOf(v * 100);           // 0.25 -> "25%"
const blank = (extra = {}) => ({ title: '', kind: '', icon: null, rank: null, rows: [], lines: [], auras: [], how: [], compare: [], next: null, needs: [], ok: true, ...extra });

/** Stat change text, the one vocabulary for passives, talents, backgrounds and shapes. */
const STAT_TEXT = {
  str: v => `${fmtSign(v)} Strength`, dex: v => `${fmtSign(v)} Dexterity`, con: v => `${fmtSign(v)} Constitution`,
  int: v => `${fmtSign(v)} Intelligence`, wis: v => `${fmtSign(v)} Wisdom`, cha: v => `${fmtSign(v)} Charisma`,
  maxHp: v => `${fmtSign(v)} maximum health`, maxHpPct: v => `${fmtSign(v)}% maximum health`,
  maxMp: v => `${fmtSign(v)} maximum mana`, maxMpPct: v => `${fmtSign(v)}% maximum mana`,
  maxStaminaPct: v => `${fmtSign(v)}% maximum stamina`, staminaRegen: v => `${fmtSign(v)} stamina a second`,
  hpRegen: v => `${fmtSign(v)} health a second`, mpRegen: v => `${fmtSign(v)} mana a second`,
  armor: v => `${fmtSign(v)} armour`, armorPct: v => `${fmtSign(v)}% armour`, magicResist: v => `${fmtSign(v)} magic resistance`,
  dodge: v => `${fmtSign(v)}% dodge chance`, critChance: v => `${fmtSign(v)}% critical chance`, critDamage: v => `${fmtSign(v)}% critical damage`,
  blockChance: v => `${fmtSign(v)}% block chance (with a shield)`, blockPower: v => `${fmtSign(v)} damage stopped by each shield block`, resistAll: v => `${fmtSign(v)}% less damage taken`,
  meleePct: v => `${fmtSign(v)}% melee damage`, rangedPct: v => `${fmtSign(v)}% bow and thrown damage`, spellPct: v => `${fmtSign(v)}% spell damage`,
  healPct: v => `${fmtSign(v)}% healing`, petPct: v => `${fmtSign(v)}% companion damage and health`,
  firePct: v => `${fmtSign(v)}% Fire damage`, icePct: v => `${fmtSign(v)}% Frost damage`, lightningPct: v => `${fmtSign(v)}% Lightning damage`,
  arcanePct: v => `${fmtSign(v)}% Arcane damage`, shadowPct: v => `${fmtSign(v)}% Shadow damage`, holyPct: v => `${fmtSign(v)}% Holy damage`,
  naturePct: v => `${fmtSign(v)}% Nature damage`, poisonPct: v => `${fmtSign(v)}% Poison damage`, physicalPct: v => `${fmtSign(v)}% Physical damage`,
  movePct: v => `${fmtSign(v)}% move speed`, hastePct: v => `${fmtSign(v)}% attack speed`, cooldownPct: v => `${fmtSign(-v)}% spell cooldowns`,
  threatPct: v => `${fmtSign(v)}% threat`, carry: v => `${fmtSign(v)} kg carry weight`, priceCut: v => `${fmtSign(-v)}% shop prices`,
  lifeSteal: v => `${fmtSign(v)}% of weapon damage back as health`, thorns: v => `attackers take ${fmtPctOf(v * 100)} of their hit back`,
  enchantSlots: v => `${fmtSign(v)} enchantment slot on each item`,
};
export const STAT_TEXT_KEYS = Object.freeze(Object.keys(STAT_TEXT));
export function modLine(rules, key, value) {
  const f = STAT_TEXT[key];
  return f ? f(Math.round(value * 100) / 100) : '';
}
const modLines = (rules, mods = {}) => Object.entries(mods).map(([k, v]) => modLine(rules, k, v)).filter(Boolean);

// ---------------------------------------------------------------- statuses

/** One status as a sentence, from its numbers. `power` = the DoT base it would land with. */
function statusSentence(rules, id, over = {}, { power = 0, bonusSeconds = 0, strength = 1, stackMax = null } = {}) {
  const row = { ...(rules.statuses[id] || {}), ...over };
  const name = row.name || id;
  const secs = (row.seconds || 4) + bonusSeconds;
  const k = strength || 1;
  const parts = [];
  if (row.perSecond > 0) {
    const total = row.perSecond * power * secs;
    parts.push(`${fmtHp(total)} ${ELEMENT_NAME[row.element] || ''} damage over ${fmtSecs(secs)}`.replace('  ', ' '));
  }
  if (row.healPerSecond > 0) parts.push(`heals ${pctN(row.healPerSecond * secs * k)} of maximum health over ${fmtSecs(secs)}`);
  if (row.takeMore) parts.push(`takes ${pctN(row.takeMore * k)} more damage`);
  if (row.dealLess) parts.push(`deals ${pctN(row.dealLess * k)} less damage`);
  if (row.damage) parts.push(`deals ${pctN(row.damage * k)} more damage`);
  if (row.resist) parts.push(`takes ${pctN(Math.min(0.8, row.resist * k))} less damage`);
  if (row.haste) parts.push(`attacks ${pctN(row.haste * k)} faster`);
  if (row.move) parts.push(`moves ${pctN(row.move * k)} faster`);
  if (row.slow || row.slowPerStack) parts.push(`moves ${pctN(row.slow || row.slowPerStack)} slower${row.slowPerStack ? ' per stack' : ''}`);
  if (id === 'root') parts.push('cannot move');
  if (id === 'sleep') parts.push('cannot act until hit');
  if (id === 'fear') parts.push('runs away');
  if (id === 'silence') parts.push('cannot cast');
  if (id === 'stagger') parts.push('is stunned');
  const stacks = stackMax ? `, stacking up to ${fmt(stackMax)}` : '';
  const what = parts.length ? parts.join(', ') : 'is marked';
  return { name, text: `${name}: ${what} for ${fmtSecs(secs)}${stacks}.` };
}

// ---------------------------------------------------------------- spells

function shapePhrase(row) {
  switch (row.shape) {
    case 'bolt': return `to the first enemy it hits, up to ${metres(row.range || 34)} away${row.splash ? `, and half that to everything within ${metres(row.splash)} of it` : ''}`;
    case 'ground': return `to everything within ${metres(row.radius || 3)} of a spot up to ${metres(row.range || 20)} away`;
    case 'melee': return `to everything in a ${deg(row.arc || 1.6)}° arc ${metres(row.reach || 3)} in front of you`;
    case 'around': return `to everything within ${metres(row.radius || 3)} of you`;
    case 'beam': return `to everything in a ${metres(row.width || 1.6)} wide line ${metres(row.range || 20)} long`;
    case 'dash': return `as you dash up to ${metres(row.dash?.range || row.range || 10)}, to everything on the way`;
    default: return `to everything within ${metres(row.radius || 3)} of you`;
  }
}

/** The power range a spell's numbers start from, and how it is made, in words. */
function powerWords(rules, sheet, row) {
  const pr = spellPowerRange(rules, sheet, row);
  let src;
  if (row.powerFrom === 'blend') src = 'half your weapon, half your spell power';
  else if (row.powerFrom === 'blendRanged') src = 'half your bow, half your spell power';
  else if (row.mult && (row.element || 'physical') === 'physical') src = sheet.holdsRanged && row.shape === 'bolt' ? 'your bow' : 'your weapon';
  else if (row.healPower) src = 'your healing power (Wisdom)';
  else src = `spell power (${ATTR_NAME[row.school === 'song' ? 'cha' : rules.data.attributes.schoolAttr[row.element] || 'int']})`;
  return { range: pr, words: src };
}

/** Lines for one spell row (also used for a next-rank preview). */
function spellLines(rules, char, sheet, row) {
  const lines = [], auras = [], how = [];
  const el = ELEMENT_NAME[row.element] || 'Physical';
  const pw = powerWords(rules, sheet, row);
  const k = spellMultiplier(sheet, row);
  const hit = pw.range.map(v => v * k);
  const reps = row.repeats || 1, n = row.projectiles || 1;
  if (row.mult) {
    let s = `Deals ${range2(hit)} ${el} damage ${shapePhrase(row)}`;
    if (n > 1) s = `Looses ${fmt(n)} bolts in a fan, each dealing ${range2(hit)} ${el} damage to the first enemy it hits`;
    if (reps > 1) s += `, ${fmt(reps)} times over ${fmtSecs(reps * (row.repeatEvery || 0.5))}`;
    if (row.channel) s = `While held (up to ${fmtSecs(row.channel.seconds)}), deals ${range2(hit)} ${el} damage every ${fmtSecs(row.channel.every)} ${shapePhrase(row)}`;
    if (row.delay) s += `, landing ${fmtSecs(row.delay)} after you cast`;
    lines.push(s + '.');
    const parts = [`${cap(pw.words)} ${range2(pw.range)}`, `${fmtPctOf((row.mult || 0) * 100)} (${row.name}${row.rank > 1 ? ` rank ${row.rank}` : ''})`];
    const cdk = cooldownPower(row.cooldown);
    if (cdk !== 1) parts.push(`${fmt(cdk)} (its ${fmtSecs(row.cooldown)} cooldown)`);
    if ((row.classPower || 1) !== 1 && row.cls) parts.push(`${fmt(row.classPower)} (${classDef(rules, row.cls).name} level ${char.classLevels[row.cls]})`);
    const sch = sheet.school?.[row.element || 'physical'] || 0;
    if (sch) parts.push(`${fmt(1 + sch / 100)} (${fmtSign(sch)}% ${el})`);
    how.push(`${parts.join(' x ')} = ${range2(hit)} per hit, before armour.`);
    how.push(`Critical hits (${fmtPctOf(sheet.critChance + (row.critBonus || 0))} chance) deal ${fmtPctOf(sheet.critDamage)} more.`);
  }
  if (row.target === 'ally' && row.healPower) {
    const h = (pw.range).map(v => v * row.healPower * (row.classPower || 1));
    lines.push(`Restores ${range2(h)} health to the ally you aim at (or you), up to ${metres(row.range || 20)} away.`);
    how.push(`${pw.words} ${range2(pw.range)} x ${fmtPctOf(row.healPower * 100)}${(row.classPower || 1) !== 1 ? ` x ${fmt(row.classPower)} (class level)` : ''} = ${range2(h)}.`);
  }
  if (row.heal && row.shape !== 'beam') {
    const amt = sheet.maxHp * row.heal * (row.classPower || 1) * (1 + (sheet.mods?.healPct || 0) / 100);
    const who = row.target === 'ally' ? `the ally you aim at within ${metres(row.range || 8)} (or you)` : row.allies ? `you and allies within ${metres(row.allies)}` : 'you';
    lines.push(`Heals ${who} for ${fmtPctOf(row.heal * 100 * (row.classPower || 1))} of maximum health (${fmtHp(amt)} for you).`);
  }
  if (row.heal && row.shape === 'beam') lines.push(`Heals you for ${pctN(row.heal)} of the damage it deals.`);
  if (row.leech) lines.push(`Heals you for ${pctN(row.leech)} of the damage dealt.`);
  if (row.onHit?.heal) lines.push(`Each hit heals you for ${pctN(row.onHit.heal)} of maximum health (${fmtHp(sheet.maxHp * row.onHit.heal)}).`);
  if (row.onHit?.healAllies) lines.push(`Each hit heals you and allies within 12 m for ${pctN(row.onHit.healAllies)} of maximum health.`);
  if (row.barrier) lines.push(`Shields ${row.allies ? `you and allies within ${metres(row.allies)}` : 'you'} for ${pctN(row.barrier.share)} of maximum health (${fmtHp(sheet.maxHp * row.barrier.share)} for you) for ${fmtSecs(row.barrier.seconds || 10)}.`);
  if (row.selfBuff) lines.push(`For ${fmtSecs((row.selfBuff.seconds || 6) + (row.bonusSeconds || 0))}: ${statusSentence(rules, 'x', { ...row.selfBuff, name: row.selfBuff.name }, {}).text.replace(/^[^:]+: /, '').replace(/ for [\d.]+s\.$/, '')}.`);
  for (const b of row.buffs || []) {
    const st = statusSentence(rules, b.id, b, { bonusSeconds: row.bonusSeconds || 0 });
    lines.push(`Gives ${row.allies ? `you and allies within ${metres(row.allies)}` : 'you'} ${st.text}`);
  }
  if (row.place) {
    const p = row.place;
    const bits = [];
    if (p.strike?.mult) bits.push(`strikes up to ${fmt(p.strike.targets || 8)} enemies for ${range2(pw.range.map(v => v * p.strike.mult * (row.classPower || 1)))} ${el} damage`);
    if (p.heal) bits.push(`heals allies inside for ${pctN(p.heal * (row.classPower || 1))} of maximum health (${fmtHp(sheet.maxHp * p.heal * (row.classPower || 1))} for you)`);
    if (p.debuff) bits.push(`leaves enemies inside ${statusSentence(rules, p.debuff.id, p.debuff).name}`);
    if (p.buff) bits.push(`gives allies inside ${statusSentence(rules, p.buff.id, p.buff).name}`);
    lines.push(`Leaves a zone ${metres((p.radius || row.radius || 4) * 2)} across for ${fmtSecs((p.seconds || 6) + (row.bonusSeconds || 0))}: every ${fmtSecs(p.every || 1)} it ${bits.join(' and ')}.`);
    if (p.debuff) auras.push(statusSentence(rules, p.debuff.id, p.debuff));
  }
  for (const a of row.applies || []) {
    const sr = rules.statuses[a.id];
    if (!sr) continue;
    const power = avgOf(hit) * STATUS_POWER_SHARE * (row.statusMult || 1);
    const st = statusSentence(rules, a.id, a.over, { power, bonusSeconds: row.bonusSeconds || 0, strength: row.statusStrength || 1, stackMax: a.stackMax });
    auras.push(st);
    lines.push(`Leaves ${st.name}${a.stackMax ? ` (stacks up to ${fmt(a.stackMax)})` : ''}.`);
  }
  if (row.knock?.stagger) lines.push(`Stuns for ${fmtSecs(row.knock.stagger)} (less on bosses).`);
  if (row.knock?.push) lines.push(`Knocks targets back ${metres(row.knock.push)}.`);
  if (row.pullIn?.metres) lines.push(`Pulls targets up to ${metres(row.pullIn.metres)} toward you.`);
  if (row.taunt) lines.push(`Enemies within ${metres(row.taunt.radius || 6)} attack you for ${fmtSecs(row.taunt.seconds || 3)}.`);
  if (row.onHit?.taunt) lines.push(`Each enemy hit attacks you for ${fmtSecs(row.onHit.taunt)}.`);
  if (row.ricochet) lines.push(`Jumps to ${fmt(row.ricochet.bounces)} more enemies within ${metres(row.ricochet.range || 8)}, each jump ${pctN(row.ricochet.keep || 0.8)} of the last.`);
  if (row.pierce) lines.push(`Passes through ${fmt(row.pierce)} enemies.`);
  if (row.pen) lines.push(`Ignores ${pctN(Math.min(0.85, row.pen))} of the target's armour.`);
  if (row.critBonus) lines.push(`${fmtSign(row.critBonus)}% critical chance with this spell.`);
  if (row.execute) lines.push(`Deals ${pctN(row.execute.mult)} more damage to enemies below ${pctN(row.execute.below)} health.`);
  if (row.hpCost) lines.push(`Costs ${pctN(row.hpCost)} of your health (${fmtHp(sheet.maxHp * row.hpCost)}).`);
  if (row.revive) lines.push(`Brings a fallen ally within ${metres(row.range || 8)} back with ${pctN(row.revive.share)} of their health.`);
  if (row.pet || row.summon) {
    const id = row.pet || row.summon.def;
    const count = row.count || row.summon?.count || 1;
    const def = monsterDef(rules, id, { companion: true });
    if (def) {
      const pk = (row.petPower || 1) * (1 + (sheet.petPct || 0) / 100);
      const e = rules.rpg.makeEnemy(def, sheet.level, makeRng(1));
      lines.push(`Summons ${fmt(count)} ${def.name}${count > 1 ? 's' : ''} (${fmtHp(e.hp * pk)} health, hits for ${range2(e.dmg.map(v => v * pk))})${row.summon?.lifetime ? ` for ${fmtSecs(row.summon.lifetime)}` : ''}; casting it again calls them anew.`);
    }
  }
  if (row.form) {
    const f = row.form;
    const st = Object.entries(f.stats || {}).map(([k2, v]) => modLine(rules, k2 === 'thorns' ? 'thorns' : k2, k2 === 'thorns' ? v : v * 100)).filter(Boolean);
    lines.push(`Become a ${f.name}${f.body?.creature ? ` (a real ${f.body.creature})` : ''}: ${st.join(', ')}. Cast again to return to your own body.`);
    if (f.basic) {
      const base = f.basic.element && f.basic.element !== 'physical' ? sheet.spell.wis : sheet.melee;
      lines.push(`Your attack becomes ${f.basic.hits > 1 ? `${fmt(f.basic.hits)} bites` : 'a strike'} for ${range2(base.map(v => v * (f.basic.mult || 1)))} each${f.basic.status ? `, leaving ${statusSentence(rules, f.basic.status).name}` : ''}.`);
    }
    if (f.pack) {
      const def = monsterDef(rules, f.pack.pet, { companion: true });
      lines.push(`Taking the shape calls ${fmt(f.pack.count)} ${def?.name || 'companion'}${f.pack.count > 1 ? 's' : ''} for ${fmtSecs(f.pack.seconds)}.`);
    }
  }
  if (row.mods?.length) lines.push(`Changed by: ${row.mods.join(', ')}.`);
  return { lines, auras, how };
}
const avgOf = r => (r[0] + r[1]) / 2;

function spellRows(row, sheet) {
  const rows = [];
  rows.push({ label: 'Cost', value: row.mp ? `${fmt(row.mp)} mana` : 'No mana' });
  rows.push({ label: 'Cast', value: row.channel ? `Held, up to ${fmtSecs(row.channel.seconds)}` : row.delay ? `Lands after ${fmtSecs(row.delay)}` : 'Instant' });
  const cd = row.cooldown * (1 - (sheet.cooldownPct || 0) / 100);
  rows.push({ label: 'Cooldown', value: cd ? fmtSecs(cd) : 'None' });
  const kind = targetKind(row);
  rows.push({ label: 'Target', value: row.target === 'ally' ? 'An ally you aim at' : KIND_TEXT[kind] });
  if (row.range && kind !== 'self' && kind !== 'cone') rows.push({ label: 'Range', value: metres(row.range) });
  if (row.radius && (kind === 'ground' || kind === 'self')) rows.push({ label: 'Area', value: `${metres(row.radius)} radius` });
  return rows;
}

/**
 * A spell tooltip. `rank` previews a rank (default: the rank known, else 1); `cls` = the class whose
 * tree shows it (for class depth on a spell not known yet).
 */
export function describeSpell(rules, char, spellId, { rank = null, cls = null } = {}) {
  const sheet = sheetOf(rules, char);
  const known = spellSources(rules, char)[spellId];
  const r = rank || known?.rank || 1;
  const row = known && r === known.rank ? castRow(rules, char, spellId) : spellRow(rules, spellId, { rank: r, mods: modsForSpell(rules, char, spellId) });
  if (!row) return blank({ title: 'Unknown spell', ok: false });
  if (!row.cls) { row.cls = known?.cls || cls; row.classPower = row.cls ? classPower(rules, char, row.cls) : 1; }
  const body = spellLines(rules, char, sheet, row);
  const out = blank({
    title: row.name, kind: `${ELEMENT_NAME[row.element] || 'Physical'} spell`, icon: `spell_${spellId}`,
    rank: { now: r, max: row.maxRank }, rows: spellRows(row, sheet), ...body, ok: !!known,
  });
  if (r < row.maxRank) {
    const nextRow = spellRow(rules, spellId, { rank: r + 1, mods: modsForSpell(rules, char, spellId) });
    nextRow.cls = row.cls; nextRow.classPower = row.classPower;
    out.next = { title: `Rank ${r + 1}`, lines: spellLines(rules, char, sheet, nextRow).lines, rows: spellRows(nextRow, sheet), needs: null };
  }
  return out;
}

// ---------------------------------------------------------------- items

const RARITY_NAME = { normal: 'Common', magic: 'Magic', rare: 'Rare', legendary: 'Legendary', unique: 'Unique', set: 'Set piece' };
const SUBTYPE_NAME = { sword2h: 'Greatsword', axe2h: 'Greataxe', polearm: 'Polearm' };
const cap = s => String(s || '').replace(/^\w/, c => c.toUpperCase());

/** Sum an item's affixes by stat so a base and an affix of the same stat read as one line (game-standards §5b). */
function summedAffixLines(item) {
  const by = new Map();
  for (const a of item.affixes || []) {
    if (a.stat === 'proficiency' || a.id === 'legendary_effect' || a.stat === 'castElement' || farholdShieldBlock(a)) continue;   // a shield's built-in block: its Block rows say it   // the element: casterLines says it with Oathwild's numbers
    const k = a.stat;
    const cur = by.get(k);
    if (cur) cur.value += a.value; else by.set(k, { ...a });
  }
  return [...by.values()].map(affixLine).filter(Boolean);
}
const AFFIX_ATTR = { str: 'Strength', dex: 'Dexterity', int: 'Intelligence', con: 'Constitution', wis: 'Wisdom', cha: 'Charisma' };
/** One affix (with its value) as the item card's line: "+2 Strength", "+6% attack speed". */
const affixLine = a => (AFFIX_ATTR[a.stat] ? `${fmtSign(Math.round(a.value))} ${AFFIX_ATTR[a.stat]}` : cap(describeAffix(a) || '').replace(/\bintellect\b/gi, 'Intelligence'));

/**
 * What one of your learned enchantments would add to `item` (Trade skills window): the card's own line for a middle
 * roll at the item's level times your Enchanting strength — "+6% attack speed". `power` = enchantPower (skills-use.js),
 * `roll(def, ilvl)` = a middle roll (the caller passes inventory's rollAffixValue with a fixed 0.5).
 */
export function enchantLine(def, { ilvl = 1, power = 1, roll }) {
  if (!def) return '';
  try {
    const v = roll(def, ilvl) * power;
    return affixLine({ ...def, value: Math.round(v * 100) / 100 });
  } catch { return ''; }
}

export function describeItem(rules, char, item, { slot = null } = {}) {
  if (!item) return blank({ title: 'Nothing', ok: false });
  const ck = casterKind(item);
  if (ck) finishCaster(rules, item);                 // an older item learns its element and style (same id = same answer)
  const into = slot || (item.type === 'weapon' ? (ck === 'orb' ? 'offhand' : 'weapon') : item.slot);
  const need = itemNeeds(rules, item);
  const wear = canWear(rules, char, item, { slot: into });
  const rarity = item.setId ? 'set' : item.isUnique ? 'unique' : item.rarity || 'normal';
  const what = item.type === 'weapon' ? (SUBTYPE_NAME[item.subtype] || cap(item.subtype)) : item.type === 'accessory' ? cap(item.slot) : need?.label || cap(item.slot);
  const out = blank({ title: item.name, kind: `${RARITY_NAME[rarity] || 'Common'} ${what}`, icon: `item_${item.baseKey}`, ok: wear.ok });
  if (item.type === 'weapon' || item.isShield || item.isMagicShield) { const h = ck === 'tome' ? 'One-hand (main hand: its own attack; off hand: Echo)' : handText(item); if (h) out.rows.push({ label: 'Held', value: h }); }
  if (item.dmg && item.weaponCategory === 'magic') {
    const k = rules.data.attributes.base.magicWeaponShare;
    out.rows.push({ label: 'Spell power', value: `+${fmtRange(Math.round(item.dmg[0] * k), Math.round(item.dmg[1] * k))} (half its ${fmtRange(item.dmg[0], item.dmg[1])})` });
  } else if (item.dmg) out.rows.push({ label: 'Damage', value: fmtRange(item.dmg[0], item.dmg[1]) });
  if (item.castElement) out.rows.push({ label: 'Element', value: ELEMENT_NAME[item.castElement] || cap(item.castElement) });
  if (item.armor) {
    const extra = (item.affixes || []).filter(a => a.stat === 'armor').reduce((s, a) => s + a.value, 0);
    out.rows.push({ label: 'Armour', value: fmt(Math.round(item.armor + extra)) });
  }
  const blk = shieldBlock(rules, item);
  if (blk) {
    // the shield blocks by itself (no button; data/combat.json block): its own chance, and this hero's with it held
    const mine = sheetOf(rules, { ...char, gear: { ...char.gear, offhand: item } }).blockChance;
    out.rows.push({ label: 'Block chance', value: `${fmtPctOf(blk.chance, 0)}${mine > blk.chance ? ` (${fmtPctOf(mine, 1)} for you)` : ''}` });
    out.rows.push({ label: 'A block stops', value: `${fmtPctOf(blk.stops * 100, 0)} of the blow` });
    out.lines.push('Blocks by itself: physical blows from the front can be blocked while it is in your off hand.');
  }
  out.rows.push({ label: 'Weight', value: `${fmt(itemWeight(rules, item), { decimals: 1 })} kg` });
  const du = durabilityOf(rules, item);
  if (du != null) out.rows.push({ label: 'Durability', value: isBroken(rules, item) ? 'Broken — gives nothing until repaired' : `${fmt(du)} / ${fmt(rules.data.inventory.durability.max)}` });
  if (item.ilvl) out.rows.push({ label: 'Item level', value: fmt(item.ilvl) });
  if (need) {
    // every requirement on its own row with what you have (owner 2026-11-25: gear by attributes and training, hardly level)
    const have = attrTotals(rules, char);
    if (need.prof) out.rows.push({ label: 'Training', value: `${need.label}${profSources(rules, char, { item, slot: into })[need.prof] ? ' (you have it)' : ' (you lack it)'}` });
    if (need.attr) out.rows.push({ label: need.attr.name, value: `${fmt(need.attr.value)} or more (you have ${fmt(attrHave(need.attr, have))})` });
    if (need.level > 1) out.rows.push({ label: 'Level', value: `${fmt(need.level)} or more (you are ${fmt(char.level || 1)})` });
  }
  out.lines.push(...summedAffixLines(item).filter(l => !/^\+?[\d.]+ armou?r$/i.test(l)));
  for (const a of item.affixes || []) if (a.stat === 'proficiency') out.lines.push(`Grants ${rules.data.proficiency.names[a.grants]} training while worn (${a.name}).`);
  if (ck && ck !== 'pole') casterLines(rules, char, item, ck, out);
  if (!wear.ok) out.needs.push(wear.why);
  // compare against what is worn there
  const worn = char.gear?.[into];
  if (worn !== item) {
    const now = sheetOf(rules, char);
    const trial = { ...char, gear: { ...char.gear, [into]: item } };
    const then = sheetOf(rules, trial);
    const rows = [
      ['Health', 'maxHp', false], ['Mana', 'maxMp', false], ['Armour', 'armor', false], ['Dodge', 'dodge', false],
      ['Block chance', 'blockChance', false], ['Critical chance', 'critChance', false], ['Weapon damage', 'melee', true], ['Bow damage', 'ranged', true],
      ['Spell power', 'spellInt', true], ['Healing power', 'heal', true], ['Move speed', 'moveSpeed', false],
    ];
    const val = (s, key, isRange) => key === 'spellInt' ? avgOf(s.spell.int) : isRange ? (s[key] ? avgOf(s[key]) : null) : s[key];
    for (const [label, key, isRange] of rows) {
      const a = val(now, key, isRange), b = val(then, key, isRange);
      if (a == null || b == null || Math.round((b - a) * 10) === 0) continue;     // no "5.1 → 5.1 (+0)" rows
      out.compare.push({ label, now: fmt(a, { decimals: 1 }), then: fmt(b, { decimals: 1 }), diff: fmtSign(Math.round((b - a) * 10) / 10), better: b > a });
    }
    if (worn) out.how.push(`Compared with ${worn.name} (${into === 'weapon' ? 'main hand' : into}).`);
  }
  return out;
}

/**
 * What a magic item's attack (or rider) does for THIS hero, worked out on a trial sheet with the item in its hand —
 * the same plan the world sim fights with (js/rules/casters.js attackPlan), so the card is never a promise the
 * code does not keep.
 */
function casterLines(rules, char, item, ck, out) {
  const gear = { ...char.gear };
  const asMain = ck === 'wand' || ck === 'tome' || ck === 'staff' || ck === 'sceptre';
  if (asMain) { gear.weapon = item; if (item.twoHanded) delete gear.offhand; if (gear.offhand === item) delete gear.offhand; }
  else gear.offhand = item;
  const trial = sheetOf(rules, { ...char, gear });
  const plan = trial.caster;
  if (asMain && plan) {
    const card = attackCard(rules, plan, trial.spell.int, { sheet: trial });
    out.rows.push(...card.rows);
    out.lines.unshift(...card.lines);
    out.how.push(...card.how);
    if (card.status) {
      const power = avgOf(trial.spell.int) * Math.max(plan.mult, 0.3) * STATUS_POWER_SHARE;
      out.auras.push(statusSentence(rules, card.status, {}, { power }));
    }
  }
  // what it adds held in the OFF hand (an orb, a focus, or a tome)
  const { forms, cfg } = casterForms(rules);
  const riderKey = ck === 'tome' ? cfg.offhandTome : (ck === 'orb' || ck === 'focus') ? item.focusRider : null;
  const rider = riderKey ? { ...forms.riders[riderKey], key: riderKey } : null;
  if (rider) {
    const mainPlan = !asMain && plan ? plan : null;
    let line = riderLine(rules, rider, mainPlan ? trial.spell.int : null, mainPlan, { lead: ck === 'tome' ? 'In the off hand, beside a wand, tome or sceptre:' : 'Held in the off hand with a wand, tome or sceptre:' });
    if (!asMain && !plan) line += ' (You hold no wand, tome or sceptre right now.)';
    out.lines.push(line);
  }
}

// ---------------------------------------------------------------- auras

export function describeAura(rules, unit, id) {
  const st = unit.statuses?.[id];
  if (!st) return blank({ title: 'Gone', ok: false });
  const n = auraNumbers(rules, unit, st);
  const good = st.beneficial ?? isBeneficial(rules, id, st);
  const out = blank({ title: st.name || rules.statuses[id]?.name || id, kind: good ? 'Buff' : 'Debuff', icon: iconOf(rules, id) });
  out.rows.push({ label: 'Time left', value: fmtSecs(n.remaining) });
  if (n.stacks > 1) out.rows.push({ label: 'Stacks', value: fmt(n.stacks) });
  const dk = st.dispel || dispelKind(rules, id, st);
  out.rows.push({ label: 'Removed by', value: rules.data.auras.dispelKinds[dk] === 'Cannot be removed' ? 'Nothing (it runs out)' : `${rules.data.auras.dispelKinds[dk]} cures` });
  if (n.tick) out.lines.push(`Takes ${fmtHp(n.tick)} ${ELEMENT_NAME[st.element] || ''} damage a second (${fmtHp(n.tick * n.remaining)} more before it ends).`.replace('  ', ' '));
  if (n.healPerSecond) out.lines.push(`Heals ${fmtHp(n.healPerSecond)} health a second.`);
  if (n.takeMore) out.lines.push(`Takes ${pctN(n.takeMore)} more damage.`);
  if (n.dealLess) out.lines.push(`Deals ${pctN(n.dealLess)} less damage.`);
  if (n.damage) out.lines.push(`Deals ${pctN(n.damage)} more damage.`);
  if (n.resist) out.lines.push(`Takes ${pctN(Math.min(0.8, n.resist))} less damage.`);
  if (n.haste) out.lines.push(`Attacks ${pctN(n.haste)} faster.`);
  if (n.move) out.lines.push(`Moves ${pctN(n.move)} faster.`);
  if (n.slow) out.lines.push(`Moves ${pctN(n.slow)} slower.`);
  if (id === 'root') out.lines.push('Cannot move.');
  if (id === 'sleep') out.lines.push('Cannot act until hit.');
  if (id === 'silence') out.lines.push('Cannot cast.');
  if (id === 'stagger') out.lines.push('Stunned.');
  if (id === 'barrier') out.lines.push(`Absorbs the next ${fmtHp(unit.barrier || 0)} damage.`);
  if (id === 'form' && unit.form) out.lines.push(`In ${unit.form.name} shape.`);
  if (!out.lines.length) out.lines.push('Marked.');
  return out;
}

// ---------------------------------------------------------------- talents, nodes, classes, skills

export function describeTalent(rules, char, id) {
  const def = talentDef(rules, id);
  if (!def) return blank({ title: 'Unknown talent', ok: false });
  const have = char.talents?.[id] || 0;
  const ctx = { attrs: attrTotals(rules, char), profs: profSources(rules, char) };
  const why = talentRefusal(rules, char, id, ctx);
  const out = blank({ title: def.name, kind: `${def.cornerstone ? 'Cornerstone talent' : 'Talent'} · row ${def.row} (level ${rowLevel(rules, def.row)})`, icon: `talent_${id}`, rank: { now: have, max: def.ranks || 1 }, ok: !why });
  const per = def.grants?.mods || {};
  const shown = Math.max(1, have);
  out.lines.push(...modLines(rules, Object.fromEntries(Object.entries(per).map(([k, v]) => [k, v * shown]))));
  for (const p of def.grants?.prof || []) out.lines.push(`Lets you wear or wield ${rules.data.proficiency.names[p].toLowerCase()}.`);
  if (have && have < (def.ranks || 1)) out.next = { title: `Rank ${have + 1}`, lines: modLines(rules, Object.fromEntries(Object.entries(per).map(([k, v]) => [k, v * (have + 1)]))), needs: null };
  if (why && have < (def.ranks || 1)) out.needs.push(why);
  return out;
}

function changeLines(rules, node) {
  const ch = node.change || {};
  const out = [];
  if (ch.mult) out.push(`${fmtSign(Math.round((ch.mult - 1) * 100))}% to its damage and healing`);
  for (const [k, v] of Object.entries(ch.add || {})) {
    if (k === 'radius') out.push(`${fmtSign(v)} m to its area`);
    else if (k === 'repeats') out.push(`${fmtSign(v)} more strikes`);
    else if (k === 'projectiles') out.push(`${fmtSign(v)} more bolts`);
    else if (k === 'count') out.push(`${fmtSign(v)} more companions`);
    else if (k === 'pierce') out.push(`passes through ${fmt(v)} more enemies`);
    else if (k === 'splash') out.push(`splashes ${metres(v)} around the target`);
    else if (k === 'seconds') out.push(`${fmtSign(v)}s longer`);
    else if (k === 'pen') out.push(`ignores ${pctN(v)} more armour`);
    else if (k === 'critBonus') out.push(`${fmtSign(v)}% critical chance`);
    else if (k === 'leech') out.push(`heals you for ${pctN(v)} of the damage`);
    else if (k === 'repeatEvery') continue;
    else if (k === 'spread') continue;
    else if (k === 'status') out.push(`leaves ${statusSentence(rules, v).name}`);
    else if (k === 'statuses') out.push(`leaves ${v.map(s => statusSentence(rules, s.id, s).name).join(' and ')}`);
    else if (k === 'ricochet') out.push(`jumps to ${fmt(v.bounces)} enemies within ${metres(v.range || 8)}`);
    else if (k === 'form' && v.pack) out.push(`taking the shape calls ${fmt(v.pack.count)} wolves for ${fmtSecs(v.pack.seconds)}`);
  }
  return out;
}

export function describeNode(rules, char, cls, nodeId) {
  const def = classDef(rules, cls);
  const node = nodeOf(rules, cls, nodeId);
  if (!def || !node) return blank({ title: 'Unknown', ok: false });
  const have = char.nodes?.[nodeKey(cls, nodeId)] || 0;
  const max = nodeMaxRank(rules, node);
  const lvl = char.classLevels?.[cls] || 0;
  const why = have >= max ? null : nodeRefusal(rules, char, cls, nodeId);
  const pathName = node.path ? def.paths[node.path].name : null;
  const kindText = { spell: 'Spell', passive: 'Passive', prof: 'Training', mod: 'Spell modifier' }[node.kind];
  let out;
  if (node.kind === 'spell') {
    out = describeSpell(rules, char, node.spell, { rank: Math.max(1, have), cls });
    out.kind = `${def.name} ${kindText.toLowerCase()} · ${out.kind}`;
  } else {
    out = blank({ title: nodeName(rules, node), kind: `${def.name} ${kindText.toLowerCase()}`, icon: `node_${cls}_${nodeId}`, rank: max > 1 ? { now: have, max } : null });
    if (node.kind === 'passive') {
      const shown = Math.max(1, have);
      out.lines.push(...modLines(rules, Object.fromEntries(Object.entries(node.mods || {}).map(([k, v]) => [k, v * shown]))));
      if (have && have < max) out.next = { title: `Rank ${have + 1}`, lines: modLines(rules, Object.fromEntries(Object.entries(node.mods || {}).map(([k, v]) => [k, v * (have + 1)]))), needs: `${def.name} level ${levelForRank(rules, node, have + 1)}` };
    } else if (node.kind === 'prof') {
      for (const g of node.grants || []) { const a = rules.data.proficiency.attrNeeds?.armour?.[g], AN = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }; out.lines.push(`Lets you wear or wield ${rules.data.proficiency.names[g].toLowerCase()}${a?.base ? ` (it still needs ${fmt(a.base)} ${[].concat(a.stat).map(k => AN[k] || k).join(' or ')} or more, a little more on better pieces)` : ''}.`); }
    } else if (node.kind === 'mod') {
      const target = nodeOf(rules, cls, node.on);
      out.lines.push(`Changes ${nodeName(rules, target)}: ${changeLines(rules, node).join(', ')}.`);
      out.rows.push({ label: 'Needs', value: `${nodeName(rules, target)} rank ${fmt(node.needsRank || 1)}` });
    }
  }
  out.rows.unshift({ label: 'Opens at', value: `${def.name} level ${fmt(node.level)}` });
  out.rows.splice(1, 0, { label: 'Cost', value: node.free && !have ? 'Free with the level' : `${fmt(node.cost || 1)} ${def.name} point${(node.cost || 1) > 1 ? 's' : ''} a rank` });
  if (pathName) out.rows.push({ label: 'Path', value: pathName });
  if (node.choice) out.rows.push({ label: 'Choice', value: 'Only one of these can be taken' });
  if (max > 1) out.rows.push({ label: 'Rank allowed now', value: `${fmt(rankCapAt(rules, cls, node, lvl))} of ${fmt(max)}` });
  if (node.kind === 'spell' && out.next) out.next.needs = `${def.name} level ${levelForRank(rules, node, (have || 1) + 1)}`;
  out.rank = max > 1 || node.kind === 'spell' ? { now: have, max } : out.rank;
  out.needs = why ? [why] : [];
  out.ok = !why;
  return out;
}

export function describeClass(rules, char, cls, { flags = [] } = {}) {
  const def = classDef(rules, cls);
  if (!def) return blank({ title: 'Unknown class', ok: false });
  const why = classRefusal(rules, char, cls, { flags, attrs: attrTotals(rules, char) });
  const lvl = char.classLevels?.[cls] || 0;
  const tierText = { base: 'Base class', advanced: 'Advanced class', specialty: 'Specialty class' }[def.tier];
  const out = blank({ title: def.name, kind: `${tierText} · ${def.role}`, icon: `class_${cls}`, rank: { now: lvl, max: def.maxLevel || classRules(rules).maxClassLevel }, ok: !why });
  out.lines.push(def.blurb);
  const g = def.growth;
  out.rows.push({ label: 'Each level', value: `${fmtSign(g.hp)} health, ${fmtSign(g.mp)} mana, ${fmt(classRules(rules).pointsPerLevel)} ${def.name} points` });
  const ag = Object.entries(g.attrs || {}).map(([k, v]) => `${rules.data.attributes.names[k]} +1 every ${fmt(Math.round(1 / v))} levels`);
  if (ag.length) out.rows.push({ label: 'Growth', value: ag.join(', ') });
  if (def.paths) out.rows.push({ label: 'Paths', value: Object.values(def.paths).map(p => p.name).join(' or ') });
  if (lvl) out.rows.push({ label: 'Points left', value: fmt(pointsLeft(rules, char, cls)) });
  if (def.requires && !lvl) {
    const gaps = requirementGaps(rules, char, def.requires, { flags, attrs: attrTotals(rules, char) });
    out.how.push(`Opens with: ${describeRequires(rules, def.requires)}.`);
    if (gaps.length) out.needs.push(`Still needs ${gaps.join(', ')}.`);
  }
  if (why && !out.needs.length) out.needs.push(why);
  return out;
}

/** The requirement list in words ("Warrior 3, Cleric 1, Strength 14"). */
export function describeRequires(rules, req) {
  const out = [];
  for (const [c, n] of Object.entries(req.classes || {})) out.push(`${classDef(rules, c)?.name} ${fmt(n)}`);
  for (const [k, n] of Object.entries(req.attrs || {})) out.push(`${rules.data.attributes.names[k]} ${fmt(n)}`);
  for (const [k, n] of Object.entries(req.skills || {})) out.push(`${rules.data.skillsUse.skills[k].name} ${fmt(n)}`);
  for (const t of req.talents || []) out.push(`the ${rules.data.talents.talents[t].name} talent`);
  for (const f of req.flags || []) out.push('something found in the world');
  if (req.characterLevel) out.push(`character level ${fmt(req.characterLevel)}`);
  return out.join(', ');
}

export function describeSkill(rules, char, id) {
  const def = rules.data.skillsUse.skills[id];
  if (!def) return blank({ title: 'Unknown skill', ok: false });
  const v = skillValue(char, id);
  const out = blank({ title: def.name, kind: def.round > 1 ? 'Skill (opens in a later round)' : 'Skill', icon: `skill_${id}`, rank: { now: v, max: rules.data.skillsUse.max } });
  out.lines.push(def.blurb);
  const xp = char.skills?.[id]?.xp || 0;
  if (v < rules.data.skillsUse.max && def.round === 1) out.rows.push({ label: 'Next point', value: `${fmt(Math.round(xp))} / ${fmt(Math.round(xpToNext(rules, v)))}` });
  for (const [at, perk] of Object.entries(def.perks || {})) {
    const text = perk.text.replace('{pct}', pctN(perk.value)).replace('{n}', fmt(perk.value));
    out.lines.push(`${v >= +at ? 'Have' : `At ${at}`}: ${perk.name} — ${text}`);
  }
  return out;
}
