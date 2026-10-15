// Thousandvale — WHO A CARD TOUCHES, said exactly (play-test 5, T2). Pure: no engine, no data files.
//
//   "Audit every spell that mentions 'followers': does it include party members or not? It is unclear which
//    skills affect allies."
//
// Farhold is a one-player game, so its generated cards say "you and your followers" for everything friendly.
// Thousandvale has parties, and js/rules/cast-skills.js gives most of those effects to the party as well — so the
// card and the rule disagreed. Farhold's `describeSkill` is shared and is not edited; every card Thousandvale
// shows goes through `cardText` here instead, which restates the audience in ONE vocabulary:
//
//   you                 the caster
//   your followers      your own pets, summons and hired blades — never another player
//   party members       the other players in your party within 30 m
//   all allies          you + party members within 30 m + your followers (a party member's own pets count too)
//
// Each rule below names the piece of js/rules/cast-skills.js that carries it out; tests/C/playtest5-wording
// casts one skill per rule in a room with a follower, a party member, that member's pet, a far party member and a
// stranger, and fails if the people the card names are not exactly the people it lands on. A card that still
// holds one of Farhold's old phrases after the rewrite fails the same test.
//
// A card that uses a group word ends with a one-line key spelling it out.

export const ALLY_RANGE_M = 30;
export const WHO = Object.freeze({
  you: 'you',
  followers: 'your followers',
  party: 'party members',
  allies: 'all allies',
});
export const WHO_KEY = Object.freeze({
  allies: `All allies = you, party members within ${ALLY_RANGE_M} m and your followers (your own pets, summons and hired blades).`,
  followers: 'Your followers = your own pets, summons and hired blades, never other players.',
  party: `Party members = players in your party within ${ALLY_RANGE_M} m.`,
});

const TARGETED = 'you (or the party member you target)';

/**
 * [pattern, replacement, reader] — in order. `when(ctx)` gates a rule on the row / talent mod it describes.
 * The third column is documentation for the audit (which code makes the sentence true).
 */
const RULES = [
  // ---- heals
  [/the most-hurt of you and your followers/g, 'the most-hurt ally', 'followers.js onHealPulse -> allies(owner)'],
  [/\b[Hh]eals you for (\d+(?:\.\d+)?)% of your maximum health/g, (m, n, ctx) => (ctx.aimed ? `Heals ${TARGETED} for ${n}% of maximum health` : m), 'castPlan self/around/ground: allyTargetOf'],
  [/Every follower heals (\d+(?:\.\d+)?)% of its maximum health/g, 'Every other ally heals $1% of their maximum health', 'afterCast healPets -> allies(ch) except you'],
  [/heals your nearest follower/g, 'heals your nearest follower', 'env.healNearestPet -> your own followers'],
  [/(heal(?:s|ing)) you and your followers/g, '$1 all allies', 'healAllies / placed heal -> allies(ch)'],
  [/you and your followers/g, 'all allies', 'allies(ch)'],
  // ---- mends and statuses
  [/Gives you (Mending[^.]*)\. Everything following you is mended with you\./g, (m, a, ctx) => (ctx.pets
    ? `Gives all allies ${a.replace(/your maximum/g, 'maximum')}.`
    : `Gives ${TARGETED} ${a.replace(/your maximum/g, 'maximum')}. Your followers are mended too.`), 'castPlan self status: regen -> the target + your followers; with pets -> allies(ch)'],
  [/Everything following you is mended with you\./g, (m, ctx) => (ctx.pets ? 'All allies are mended with you.' : 'Your followers are mended with you.'), 'castPlan self status regen'],
  [/Everything following you gets the same\./g, 'All allies get the same.', 'castPlan self status with pets -> allies(ch)'],
  [/Your followers get the same/g, 'All allies get the same', 'talent: status with pets -> allies(ch)'],
  [/your followers get the same/g, 'all allies get the same', 'talent: status with pets -> allies(ch)'],
  [/[Yy]ou and every follower:/g, 'all allies:', 'afterCast selfBuff pets -> allies(ch)'],
  // ---- barriers, wards, cleanses
  [/You and every follower get a (barrier|ward)/g, 'All allies get a $1', 'afterCast barrier/ward pets -> allies(ch)'],
  [/you and every follower get a (barrier|ward)/g, 'all allies get a $1', 'afterCast barrier/ward pets -> allies(ch)'],
  [/\bYou get a barrier worth (\d+(?:\.\d+)?)% of your maximum health/g, (m, n, ctx) => (ctx.single?.barrier ? `You (or the party member you target) get a barrier worth ${n}% of maximum health` : m), 'afterCast barrier without pets: allyTargetOf, worth THEIR health'],
  [/\bYou get a (barrier|ward)/g, (m, k, ctx) => (ctx.single?.[k] ? `You (or the party member you target) get a ${k}` : m), 'afterCast barrier/ward without pets: allyTargetOf'],
  [/(Removes|removes) (\d+) harmful status(es)? from you and every follower/g, '$1 $2 harmful status$3 from every ally', 'afterCast cleanse pets -> allies(ch)'],
  [/(Removes|removes) (\d+) harmful status(es)? from you(?! \()/g, (m, a, n, es, ctx) => (ctx.single?.cleanse ? `${a} ${n} harmful status${es || ''} from ${TARGETED}` : m), 'afterCast cleanse: allyTargetOf'],
  // ---- links, leaps, swaps
  [/Links the follower nearest your aim to you/g, 'Links the party member you target (else the ally nearest you) to you', 'afterCast link: allyTargetOf, else nearest of allies(ch)'],
  [/beside the follower nearest your aim/g, 'beside the party member you target, else your follower nearest your aim', 'dash to ally: allyAlong'],
  [/to the follower nearest your aim/g, 'to the party member you target, else your follower nearest your aim', 'dash to ally: allyAlong'],
  [/the aimed follower or enemy \(not a boss\)/g, 'the aimed enemy (not a boss), else your aimed follower', 'dash swap: enemy first, else your own follower (players are never moved)'],
  [/the follower or enemy you aim at/g, 'the enemy you aim at (not a boss), else your follower', 'dash swap'],
  [/A follower swapped with/g, 'Your follower swapped with', 'dash swap allyBarrier'],
  // ---- orders, empowers
  [/Orders your followers to/g, `Orders your followers — and your party members' followers within ${ALLY_RANGE_M} m — to`, 'afterCast command (not petOnly): Fo.order(you) + each party player'],
  [/also empowers? your followers' next attack/g, m => `${m} and each party member's next skill`, 'afterCast empowerNext.pets'],
  // ---- things that really are only your own followers (the code reads `owner === you`): say "your"
  [/Revives every fallen follower at once/g, 'Revives all your own fallen followers at once', 'afterCast revive -> Fo.reviveAll(you) (players: only a revive skill, T4)'],
  [/Every follower within (\d+) m moves with you/g, 'Each of your followers within $1 m moves with you', 'Fo.bringAlong(you)'],
  [/with every follower\./g, 'with each of your followers.', 'Fo.bringAlong(you)'],
  [/for each follower alive/g, 'for each of your followers alive', 'env.followers() -> owner === you'],
  [/every follower ability's cooldowns?/g, "your followers' ability cooldowns", 'Fo.cutAbilities(you)'],
  [/attack your follower\b/g, 'attack your follower', 'petTaunt'],
  [/\bfollowers within (\d+) m get/g, 'your followers within $1 m get', 'afterCast selfBuff petsShare -> petsOf(you)'],
  // ---- perk / item text
  [/\b[Yy]our companions\b/g, m => (m[0] === 'Y' ? 'Your followers' : 'your followers'), 'effects.js petPower / pets: your own followers'],
  [/\beach companion\b/g, 'each of your followers', 'cast.js onKill post.petHeal -> room.followers.heal(you)'],
  [/\beach of your companions\b/g, 'each of your followers', 'cast.js onKill post.petHeal'],
  [/(?<!class )\bcompanion damage\b/g, 'follower damage', 'effects.js petPower'],
];

/** Farhold phrases that must never survive on a Thousandvale card (the audit's leftovers check). */
export const LEGACY_PHRASES = [
  /you and your followers/i, /you and every follower/i, /Everything following you/i, /Every follower heals/i,
  /the follower nearest your aim/i, /every fallen follower/i, /\bcompanions\b/i, /aimed follower or enemy/i,
];

/** What the row (or the talent mod laid over it) says about single-target friendly effects. */
function contextOf(row) {
  const r = row || {};
  const kind = r.kind ?? r.shape;
  return {
    pets: !!r.pets,
    aimed: typeof r.heal === 'number' ? (kind === 'self' || kind === 'around' || kind === 'ground') : (r.heal && typeof r.heal === 'object' ? kind === 'self' : !row),
    single: {
      barrier: !!(r.barrier && typeof r.barrier === 'object' && !r.barrier.pets),
      ward: !!(r.ward && !r.ward.pets),
      cleanse: !!(r.cleanse && !r.cleanse.pets),
    },
  };
}

/** Restate who a Farhold-written sentence touches. `row` = the skill row or talent mod it describes (optional). */
export function whoText(text, row = null) {
  if (!text) return text || '';
  const ctx = contextOf(row);
  let out = String(text);
  for (const [rx, rep] of RULES) {
    out = typeof rep === 'function' ? out.replace(rx, (...a) => rep(...a.slice(0, a.findIndex(x => typeof x === 'number')), ctx)) : out.replace(rx, rep);
  }
  return out;
}

/** The one-line key for the group words a card uses ('' when it uses none). */
export function whoKey(text) {
  const t = String(text || '');
  const parts = [];
  if (/\ball allies\b|\ballies\b|\bally\b/i.test(t)) parts.push(WHO_KEY.allies);
  else if (/\bfollowers?\b/i.test(t.replace(/follower slots?/gi, ''))) parts.push(WHO_KEY.followers);
  if (!parts.length && /party member/i.test(t)) parts.push(WHO_KEY.party);
  return parts.join(' ');
}

const pct = v => `${Math.round(v * 100)}%`;
const secs = v => `${+(+v).toFixed(1)}s`;
const resName = id => String(id || 'resource').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

/**
 * The sentences for a row's Thousandvale-only block (`row.tv`), written from its numbers. `statuses` = the
 * engine's status table (a returning body's Mending is described from the row it really gets).
 */
export function tvSentences(row, statuses = {}) {
  const out = [];
  const rv = row?.tv?.revive;
  if (rv) {
    const range = rv.range ?? ALLY_RANGE_M;
    const back = rv.share >= 1 ? 'full health' : `${pct(rv.share)} health`;
    const mana = rv.mp ? (rv.mp >= 1 ? ' and full mana' : ` and ${pct(rv.mp)} mana`) : '';
    out.push(rv.mass
      ? `Raises every fallen party member within ${range} m at ${back}${mana}.`
      : `Raises the fallen party member you target (else the nearest within ${range} m) at ${back}${mana}.`);
    const a = rv.apply || {};
    if (a.status) {
      const st = { ...(statuses[a.status.id] || {}), ...a.status };
      const total = st.healPerSecond && st.seconds ? ` (heals ${pct(st.healPerSecond * st.seconds)} of maximum health over ${secs(st.seconds)})` : '';
      out.push(`They return with ${st.name || a.status.id}${total}.`);
    }
    if (a.barrier) out.push(`They return with a barrier worth ${pct(a.barrier.share)} of their maximum health for ${secs(a.barrier.seconds ?? 8)}.`);
    if (a.debuff) {
      const d = a.debuff;
      const bits = [d.dealLess ? `deal ${pct(d.dealLess)} less damage` : null, d.takeMore ? `take ${pct(d.takeMore)} more damage` : null].filter(Boolean).join(' and ');
      out.push(`They return ${d.name || 'weakened'} for ${secs(d.seconds ?? 10)}: they ${bits}.`);
    }
    out.push(rv.castTime > 0 ? `${secs(rv.castTime)} cast: moving cancels it and nothing is spent.` : 'Instant.');
    out.push(rv.combat ? 'Can be cast in combat.' : 'Cannot be cast while a monster is attacking you.');
    out.push('The fallen player chooses whether to stand up.');
  }
  if (row?.tv?.touch) out.push(`A touch: the party member must be within ${row.tv.touch} m of you, or it lands on you.`);
  if (row?.shape === 'ground' && typeof row.heal === 'number' && row.heal > 0) {
    out.push('With a party member targeted it is planted at their feet.');
  }
  return out;
}

/**
 * Round 11 (the Star Blade): Starlight spent on more than damage, and Starlight from hits taken (js/rules/cast-skills.js
 * applyPoints / hurtGain). These follow the generated text (they qualify its "Spends all your Starlight").
 */
export function tvAfterSentences(row) {
  const out = [];
  const pts = row?.tv?.points;
  if (pts) {
    const res = resName(row?.resource?.id);
    const bits = [];
    if (pts.barrier) bits.push(`adds ${pct(pts.barrier)} of maximum health to the barrier`);
    if (pts.answer) bits.push(`makes each answering strike ${pct(pts.answer)} stronger`);
    if (pts.hold) bits.push(`holds the root ${secs(pts.hold)} longer`);
    if (bits.length) out.push(`Each ${res} spent ${bits.length > 1 ? `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}` : bits[0]}.`);
    if (pts.atMax?.stun) out.push(`Spending 5: ${row.counter?.answer ? 'the answering strikes also stun' : 'it also stuns what it hits'} for ${secs(pts.atMax.stun)}.`);
  }
  const hg = row?.tv?.hurtGain;
  if (hg) out.push(`${hg.fromLevel > 1 ? `From level ${hg.fromLevel}, every` : 'Every'} hit you take gains ${hg.n ?? 1} ${resName(hg.id)} (once every ${secs(hg.every ?? 1)} at most).`);
  return out;
}

/** A whole Thousandvale card for a skill row: Farhold's generated text, audience restated, TV sentences added, key appended. */
export function cardText(row, text, { statuses = {}, key = true } = {}) {
  const tv = tvSentences(row, statuses);
  let body = whoText(text, row);
  // owner #1: a resource that only builds from a level says so where the card says what it gains
  const from = row?.resource?.fromLevel;
  if (from > 1) body = body.replace(/\bGains ([\d.]+) ([A-Z][\w ]*?) (for each|when)/, (m, n, name, per) => `From level ${from}, gains ${n} ${name} ${per}`);
  if (tv.length) body = `${tv.join(' ')} ${body}`.trim();
  const after = tvAfterSentences(row);
  if (after.length) body = `${body} ${after.join(' ')}`.trim();
  const k = key ? whoKey(body) : '';
  return k ? `${body} ${k}` : body;
}

/**
 * Who the FRIENDLY part of a row lands on, for the bar: `who` is a code, `targets` the plain words (D-UI's field).
 *   self       only you              ally       the party member you target, else you
 *   allies     all allies            followers  only your own followers
 *   null       nothing friendly (an attack)
 */
export function whoOf(row, { allyEffects, aimsAtAlly } = {}) {
  if (!row) return { who: null, targets: '' };
  if (row.tv?.revive) return row.tv.revive.mass ? { who: 'party', targets: `every fallen party member within ${row.tv.revive.range ?? ALLY_RANGE_M} m` } : { who: 'ally', targets: 'a fallen party member (the one you target, else the nearest)' };
  const aims = aimsAtAlly ? aimsAtAlly(row) : false;
  const group = allyEffects ? allyEffects(row).size > 0 : false;
  if (aims && group && hasGroup(row)) return { who: 'allies', targets: 'the party member you target (or you), and all allies' };
  if (aims) return { who: 'ally', targets: 'you or the party member you target' };
  if (group) return { who: 'allies', targets: 'all allies' };
  if (row.selfBuff?.petsOnly || (row.command && row.command.petOnly) || row.howl || (row.revive && !row.tv?.revive)) return { who: 'followers', targets: 'your followers' };
  const kind = row.kind ?? row.shape;
  if (kind === 'self' || row.selfBuff || row.form) return { who: 'self', targets: 'you' };
  return { who: null, targets: '' };
}
const hasGroup = row => !!(row.healPets || row.pets || row.selfBuff?.pets || row.barrier?.pets || row.ward?.pets || row.cleanse?.pets || row.place?.heal || row.place?.buff || row.burst?.heal || row.healAllies || row.onHit?.healAllies);

/** For the audit table: every rule and the code that makes it true. */
export const WORDING_RULES = RULES.map(([rx, rep, reader]) => ({ pattern: String(rx), reader }));
