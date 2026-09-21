// Farhold — taking somebody on.
//
// Pure data and arithmetic: no DOM, no Three.js, nothing loaded. js/town.js re-exports it (a hired
// sword is one of the folk) and js/talkui.js draws what it returns, but the rules about what a
// mercenary costs and what they bring live here so the node tests can drive the real thing.
//
//   import { hireOffer } from './hire.js';
//   const offer = hireOffer(wanderer, { playerLevel, gold, pet });
//   panel.showOffer(offer, { accept, decline });

/**
 * HIRING SOMEBODY IS A CONVERSATION, NOT A KEYPRESS.
 *
 *   "I found a mercenary in town who joined me but it should have opened a dialog where they
 *    offered to join me and I was able to accept/deny. I had no idea it would just straight up hire
 *    them. It's a cool system but the dialog just needs improved so you can see something about the
 *    person before recruiting them."
 *
 * The mercenary captain in `data/wanderers.json` is placed on roads AND in settlements, which is
 * why one turned up in a town. Pressing E on them ran `gives: 'hire'` straight through: gold out,
 * a sellsword in, one line in the log. You never saw the price before paying it and you never saw
 * what you were buying.
 *
 * `hireOffer()` turns that record into something a panel can show — who they are, what they cost
 * against what you are carrying, and what they actually bring to a fight — and `js/talkui.js`
 * renders it with an accept and a deny. Pure data in, plain object out, so it is node-testable and
 * works for the road captain and anybody in a town alike.
 */

/** What a fighting role means in words, rather than a keyword nobody outside the data has read. */
export const HIRE_ROLE_WORDS = {
  brute: { name: 'Front line', note: 'Walks in first and stays there.' },
  guard: { name: 'Front line', note: 'Walks in first and stays there.' },
  skirmisher: { name: 'Skirmisher', note: 'Works the flanks and goes for whatever is casting.' },
  archer: { name: 'Archer', note: 'Hangs back and shoots over your shoulder.' },
  caster: { name: 'Caster', note: 'Slow to start, and then the fight is over.' },
  healer: { name: 'Healer', note: 'Keeps you standing rather than killing anything.' },
};

/** What the hired body is carrying, read off its look so the offer cannot lie about it. */
function armedWith(look) {
  const parts = look?.avatar?.parts || {};
  const words = [];
  if (parts.weapon) words.push(String(parts.weapon).replace(/_/g, ' '));
  if (parts.offhand) words.push(String(parts.offhand).replace(/_/g, ' '));
  const armour = parts.chest ? String(parts.chest).replace(/_/g, ' ') : null;
  if (!words.length && !armour) return null;
  return [words.join(' and '), armour].filter(Boolean).join(', over ');
}

/**
 * The offer a hireable person makes, as rows a panel can draw.
 *
 * `who` is a wanderer record (`js/wanderers.js`) or a town NPC; `pet` is the bestiary entry the
 * hire actually becomes (`data/enemies.json` pets, `sellsword`), so the numbers on the card are the
 * numbers that walk out of the door with you.
 */
export function hireOffer(who, { playerLevel = 1, gold = 0, pet = null } = {}) {
  if (!who) return null;
  const hire = who.hire || {};
  const price = hire.gold ?? 180;
  const level = who.level ?? playerLevel;
  const hp = hire.hp ?? pet?.hp ?? 320;
  const dmg = hire.dmg ?? pet?.dmg ?? [18, 30];
  const every = pet?.attackEvery ?? 1.5;
  const reach = pet?.reach ?? 2.6;
  const role = HIRE_ROLE_WORDS[pet?.role || who.role] || HIRE_ROLE_WORDS.brute;
  const perSecond = ((dmg[0] + dmg[1]) / 2) / (every || 1);
  const kit = armedWith(pet?.look);

  return {
    kind: 'hire',
    id: who.id ?? null,
    name: who.name || 'A hired sword',
    subtitle: [who.kindName, who.faction ? `of the ${who.faction}` : null].filter(Boolean).join(' '),
    blurb: who.blurb || null,
    // their own words, so the offer sounds like a person and not a price list
    lines: (who.lines || []).slice(0, 2),
    price, gold, afford: gold >= price,
    level,
    rows: [
      ['Fights as', `${role.name} — ${role.note}`],
      ['Level', `${level}`],
      ['Health', `${hp}`],
      ['Hits for', `${dmg[0]}–${dmg[1]}, once every ${every}s — about ${Math.round(perSecond)} damage a second`],
      ['Reach', reach > 6 ? `ranged, about ${reach} m` : `melee, ${reach} m — toe to toe`],
      ...(kit ? [['Carrying', kit]] : []),
    ],
    terms: 'Paid up front. They walk with you until they fall.',
    acceptText: `Take them on — ${price} gold`,
    declineText: 'Not today',
    /** Why you cannot, if you cannot. The panel prints this instead of lighting the button. */
    refusal: gold >= price ? null : `They want ${price} gold up front and you have ${gold}.`,
  };
}

/**
 * GUARDS FOR A TRIP, NOT FOR A LIFE. The Civilization Expansion §8.6.
 *
 * A route guard is neither a citizen nor a hired sword. They are hired for the run out of the
 * Armiger's contract list — which is precisely why the Armiger is the vendor who unlocks them — at
 * ten gold a guard a trip, and each one is 18% off the chance of the cart being taken.
 *
 * They are never a guarantee. If the ambush does fire they roll once against the raiders,
 * `survive = guards / (guards + 2)`, so two guards save a cart half the time and four save a wagon
 * two-thirds of the time. A guard you can buy your way out of trouble with is a tax, not a choice.
 */
export function guardContract({ carrier = null, guards = 0, data = null, danger = 0.35 } = {}) {
  const G = data?.guard || {};
  const per = G.routeGuardGold ?? 10;
  const max = carrier?.guardsMax ?? 0;
  const n = Math.max(0, Math.min(Math.floor(guards), max));
  const cut = G.routeGuardAmbushCut ?? 0.18;
  const before = Math.max(0.03, Math.min(0.7, 0.34 * danger));
  const after = Math.max(0.03, Math.min(0.7, 0.34 * danger * (1 - cut * n)));
  return {
    guards: n, max, gold: n * per, perGuard: per,
    survive: n > 0 ? Math.round((n / (n + 2)) * 100) / 100 : 0,
    riskBefore: Math.round(before * 100) / 100,
    riskAfter: Math.round(after * 100) / 100,
    text: n === 0
      ? `No guards. ${Math.round(after * 100)}% chance somebody takes it off you.`
      : `${n} guard${n === 1 ? '' : 's'}, ${n * per} gold the trip. Risk falls from ${Math.round(before * 100)}% to ${Math.round(after * 100)}%, and if it does happen they see them off about ${Math.round((n / (n + 2)) * 100)}% of the time.`,
  };
}

/**
 * What a hired sword standing a post at your holding costs you, against what a citizen guard does.
 *
 * §8.2, and the whole point is that it is a real choice rather than a better option: a citizen
 * guard is cheaper and wants a village around them; a hired sword is instant, needs no bed and
 * never gets hungry, and costs nearly twice as much every single day for ever.
 */
export function postedCost({ data = null, days = 1 } = {}) {
  const G = data?.guard || {};
  const citizen = (G.wagePerDay ?? 8) * days;
  const hired = (G.hireRetainerPerDay ?? 14) * days;
  return {
    citizen, hired, days,
    text: `A citizen on guard duty costs ${G.wagePerDay ?? 8} gold a day and a bed and two rations. A hired sword costs ${G.hireRetainerPerDay ?? 14} a day and nothing else at all.`,
  };
}
