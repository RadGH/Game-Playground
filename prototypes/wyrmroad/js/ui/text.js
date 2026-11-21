// Every sentence the screens print about stats, items and spells — generated from the real numbers (lessons rules 3,
// 4: one printer per sentence) and every number through shared/format.js (rule 1). No ids reach the screen (rule 2).
import { fmt, hp as whole, pct } from '../../../../shared/format.js';
import { itemStats, bonusOf, baseOf, rarityOf, heroStats } from '../sim/items.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const STAT_NAMES = { power: 'Power', spell: 'Spell power', def: 'Defence', hp: 'Health', mp: 'Mana', crit: 'Crit chance',
  block: 'Block', regen: 'Health regen', mpRegen: 'Mana regen' };
export const STAT_ORDER = ['power', 'spell', 'def', 'hp', 'mp', 'crit', 'block', 'regen', 'mpRegen'];
export const SLOT_NAMES = { weapon: 'Weapon', offhand: 'Off hand', head: 'Head', chest: 'Chest', legs: 'Legs', feet: 'Feet', trinket: 'Trinket' };
export const CLASS_NAMES = { vanguard: 'Vanguard', duelist: 'Duelist', arcanist: 'Arcanist', warden: 'Warden' };
export const HAND_TEXT = { one: 'One-handed', two: 'Two-handed', main: 'Main hand only', off: 'Off hand only' };

/** One stat's amount with its unit: "+3% crit", "+1.2/s". sign: show + for gains. */
export function statAmount(k, v, { sign = true } = {}) {
  const s = sign && v > 0 ? '+' : v < 0 ? '−' : '';
  const a = Math.abs(v);
  if (k === 'crit' || k === 'block') return `${s}${fmt(a, { decimals: 1 })}%`;
  if (k === 'regen' || k === 'mpRegen') return `${s}${fmt(a, { decimals: 1 })}/s`;
  return `${s}${whole(a)}`;
}
/** "+24 Defence" */
export const statLine = (k, v) => `${statAmount(k, v)} ${STAT_NAMES[k] || 'Bonus'}`;

/** A legendary effect in plain words with its number. */
export function effectText(f) {
  if (!f) return '';
  switch (f.id) {
    case 'shockwave': return `Knock-down hits send out a shockwave: ${pct(f.dmg)} of your power to every enemy within ${fmt(f.r)} m`;
    case 'echo': return `${pct(f.chance)} chance that a hit strikes a second time`;
    case 'splitbolt': return `Fire Bolt splits into ${fmt(f.n)} bolts`;
    case 'blockheal': return `Every hit you block heals you ${pct(f.amount)} of your health`;
    case 'leech': return `Heals you ${pct(f.amount)} of the damage you deal`;
    case 'extralife': return 'One extra life in every chapter';
    default: return 'A special power';
  }
}

export const itemName = (ITEMS, it) => baseOf(ITEMS, it)?.name || 'Unknown item';
export const rarityName = (ITEMS, it) => rarityOf(ITEMS, it).name;
export const rarityColor = (ITEMS, it) => rarityOf(ITEMS, it).color;

/** The first line under an item's name: how it is held, or which slot it fills (game-standards §5b). */
export function holdLine(ITEMS, it) {
  const b = baseOf(ITEMS, it); if (!b) return '';
  if (b.slot === 'offhand') return `${HAND_TEXT.off}${b.offKind === 'blade' ? ' · second blade' : b.offKind === 'shield' ? ' · shield' : ''}`;
  if (b.hand) return HAND_TEXT[b.hand] || '';
  return SLOT_NAMES[b.slot];
}
export function classLine(ITEMS, it) {
  const b = baseOf(ITEMS, it); if (!b) return '';
  return b.cls.length >= 4 ? 'Any hero' : `${b.cls.map(c => CLASS_NAMES[c]).join(', ')} only`;
}

/**
 * An item card (html). opts.cls = the hero looking (other classes' gear greys out), opts.vs = the equipped item to
 * compare with (green/red differences on every line), opts.expand = show the bonus split "(20 +4)".
 */
export function itemCardHtml(ITEMS, it, { cls = null, vs = null, expand = false, price = null, priceLabel = 'Price', note = '' } = {}) {
  if (!it) return '<div class="wr-card wr-card-empty">Nothing here</div>';
  const b = baseOf(ITEMS, it), R = rarityOf(ITEMS, it);
  const usable = !cls || b.cls.includes(cls);
  const st = itemStats(ITEMS, it), bon = bonusOf(it), old = vs ? itemStats(ITEMS, vs) : null;
  const keys = STAT_ORDER.filter(k => (st[k] || 0) !== 0 || (old && (old[k] || 0) !== 0));
  const lines = keys.map(k => {
    const v = st[k] || 0, d = old ? Math.round((v - (old[k] || 0)) * 100) / 100 : 0;
    const split = expand && bon[k] ? ` <span class="wr-split">(${statAmount(k, v - bon[k], { sign: false })} ${bon[k] >= 0 ? '+' : '−'}${statAmount(k, Math.abs(bon[k]), { sign: false })})</span>` : '';
    const diff = old && d ? ` <span class="${d > 0 ? 'wr-up' : 'wr-down'}">${statAmount(k, d)}</span>` : '';
    return `<li class="${v ? '' : 'wr-gone'}">${v ? statLine(k, v) : `${STAT_NAMES[k]}`}${split}${diff}</li>`;
  }).join('');
  const eff = b.effect ? `<p class="wr-effect">${esc(effectText(b.effect))}</p>` : '';
  const effLost = vs && baseOf(ITEMS, vs)?.effect && !b.effect ? `<p class="wr-effect wr-down">Loses: ${esc(effectText(baseOf(ITEMS, vs).effect))}</p>` : '';
  return `<div class="wr-card${usable ? '' : ' wr-card-off'}" style="--rar:${R.color}">
    <div class="wr-card-head"><b class="wr-card-name">${esc(b.name)}</b><span class="wr-card-rar">${esc(R.name)}</span></div>
    <p class="wr-card-hold">${esc(holdLine(ITEMS, it))}</p>
    <ul class="wr-card-stats">${lines || '<li>No stats</li>'}</ul>${eff}${effLost}
    <p class="wr-card-foot"><span class="${usable ? '' : 'wr-down'}">${esc(classLine(ITEMS, it))}</span><span>${esc(b.set)} set${b.chapter != null ? `, chapter ${fmt(b.chapter + 1)}` : ''}</span></p>
    ${price != null ? `<p class="wr-card-price">${esc(priceLabel)} <b>${whole(price)} gold</b></p>` : ''}${note ? `<p class="wr-card-note">${esc(note)}</p>` : ''}
  </div>`;
}

/** What a spell does, with its numbers (power = the caster's power, for "about 31 damage"). */
export function spellText(S, power = null, spellPower = null) {
  const dmg = m => (power ? `${fmt(m, { decimals: 2 })}× your power (about ${whole(m * power)})` : `${fmt(m, { decimals: 2 })}× your power`);
  const parts = [];
  if (S.aoe) {
    const a = S.aoe, where = a.at === 'self' ? `everyone within ${fmt(a.r)} m of you` : a.at === 'foe' ? `the nearest enemy up to ${fmt(a.ahead)} m ahead and anyone within ${fmt(a.r)} m of them` : `a circle ${fmt(a.r)} m wide ${fmt(a.ahead)} m in front of you`;
    if (a.dmg) parts.push(`Hits ${where} for ${dmg(a.dmg)}${a.delay ? ` after ${fmt(a.delay, { decimals: 2 })} s` : ''}${a.down ? ', knocking them down' : ''}`);
    else if (a.stun) parts.push(`Stuns ${where} for ${fmt(a.stun)} s`);
    if (a.dmg && a.stun) parts.push(`Stuns for ${fmt(a.stun)} s`);
    if (a.freeze) parts.push(`Freezes them for ${fmt(a.freeze)} s`);
  }
  if (S.shot) parts.push(`A bolt that flies up to ${fmt(S.shot.range)} m and hits for ${dmg(S.shot.dmg)}${S.shot.burst ? `, bursting over ${fmt(S.shot.burst)} m` : ''}${S.shot.down ? ', knocking down' : ''}`);
  if (S.fan) parts.push(`Throws ${fmt(S.fan.n)} blades in a fan, each up to ${fmt(S.fan.range)} m for ${dmg(S.fan.dmg)}`);
  if (S.step) parts.push(`Steps ${fmt(S.step.dist)} m forward through enemies, hitting each for ${dmg(S.step.dmg)} and stunning for ${fmt(S.step.stun)} s`);
  if (S.hits && S.dmg) parts.push(`${fmt(S.hits)} quick hits of ${dmg(S.dmg)} within ${fmt(S.reach)} m in front${S.lastDown ? '; the last knocks down' : ''}`);
  if (S.buff) {
    const B = S.buff, who = B.who === 'party' ? `you and every partner within ${fmt(B.r)} m` : 'you';
    if (B.power) parts.push(`${pct(B.power)} more power for ${who} for ${fmt(B.time)} s`);
    if (B.guard) parts.push(`${pct(B.guard)} less damage taken${B.steady ? ' and no flinching' : ''} for ${fmt(B.time)} s`);
  }
  if (S.heal) parts.push(`Heals you and every partner within ${fmt(S.heal.r)} m for ${pct(S.heal.amount)} of their health${spellPower ? ` + ${whole(spellPower * 0.5)}` : ' + half your spell power'}`);
  if (S.zone) parts.push(`Lights a circle ${fmt(S.zone.r)} m wide for ${fmt(S.zone.time)} s: partners inside heal ${pct(S.zone.heal * 2)} of their health a second, enemies inside are slowed ${pct(S.zone.slow)}`);
  if (S.steady) parts.push('You can’t be knocked about while it plays');
  return parts.join('. ') + '.';
}
export const spellCost = S => `${whole(S.mp)} mana · ${fmt(S.cd, { decimals: 1 })} s cooldown`;

/** The hero's sheet rows: [{ k, name, total, base, gear, text }] — every number from heroStats (the one stat function). */
export function sheetRows(CLASSES, ITEMS, hero, T = {}) {
  const s = heroStats(CLASSES, ITEMS, { cls: hero.cls, level: hero.level, gear: hero.gear });
  return STAT_ORDER.map(k => {
    const base = s.base[k] || 0, gear = s.gear[k] || 0, total = s[k] || 0;
    let what = '';
    if (k === 'def') what = `Takes ${pct(s.cut)} less damage`;
    else if (k === 'block') what = `A block stops ${pct(Math.min(0.95, (T.blockCut ?? 0.8) + s.blockCut))} of a hit`;
    else if (k === 'crit') what = `${pct(total / 100)} of hits deal extra damage`;
    else if (k === 'power') what = 'Sets the damage of every attack';
    else if (k === 'spell') what = 'Adds to heals';
    else if (k === 'regen') what = total ? `Heals ${statAmount(k, total, { sign: false })} while fighting` : 'Health comes back from food';
    else if (k === 'mpRegen') what = 'On top of the mana every hero gets back';
    return { k, name: STAT_NAMES[k], total, base, gear, text: what };
  });
}

export const timeText = secs => { const s = Math.max(0, Math.round(secs || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
