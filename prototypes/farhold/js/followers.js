// Farhold R17 — the follower book: how many things may walk with you, and who they are.
//
//   "We should also add a Followers tab to the menu where you can manage your follower slots.
//    Everyone should start with three follower slots with an additional one unlocking at level 20
//    and 30. We can update 'The Kept Company' branch of the Perks menu instead of making your
//    summoning skill summon more, to instead increase your companion limit. Companions should also
//    be hireable at town… All companions should adjust to the player level automatically… Spells
//    that summon creatures should only summon one per type unless the spell itself has a different
//    limit, however, these spells should also update with 'The Kept Company' increasing their limit
//    (while still obeying your total follower limit). If you have 5 follower slots and hire 4
//    mercenaries, you can only summon one wolf."
//
// **THE BOOK IS NOT A SECOND LIST OF BODIES.** js/pets.js owns every companion in the world; this
// owns the RULES about them and reads its counts straight off that list. Two lists of the same
// thing is the fault this project keeps finding — a roster that says four and a field that holds
// three is worse than no roster at all.
//
//   import { createFollowers } from './followers.js';
//   const followers = createFollowers({ data, skillData, pets, getPlayer, log });
//   followers.limit();                      // 3 at level 1, 4 at 20, 5 at 30, + the perk arm
//   followers.board({ town, day });         // what a broker in this settlement is selling
//   await followers.hire('longshot', at);   // gold out, a body in
//   followers.dismiss(uid);                 // and they walk off
//   followers.tick(dt);                     // puts contracted mercenaries back after a load
//
// The gate is installed ON js/pets.js (`pets.setGate`), so there is no way to summon around it: a
// summoning skill, a hire and a class companion all go through `pets.summon` and all three ask.

/** What kind of thing a follower is. The only three there are. */
export const FOLLOWER_KINDS = {
  companion: { key: 'companion', name: 'Companion', note: 'Came with your class, or with the build you made.' },
  mercenary: { key: 'mercenary', name: 'Mercenary', note: 'Paid for. Walks with you until they fall or you let them go.' },
  summon: { key: 'summon', name: 'Summoned', note: 'Called up by a spell. Goes away when it dies and comes back on its own.' },
};

/**
 * THE `derived` KEYS THIS FILE READS, NAMED SO THAT SOMETHING CAN CHECK THEM.
 *
 * js/perks.js can be a plain data table only because its stat keys ARE `derived` field names, and
 * tests/round16-perks.test.js enforces that by parsing js/rpg.js's own declaration — a typo in a
 * perk is not a crash, it is a node that reads fine and does nothing for ever.
 *
 * `followerSlots` is read HERE rather than in js/rpg.js: rpg.js declares a starting value for every
 * stat its own formulas use, and the follower limit is not one of them (`rpg.derive` folds an
 * undeclared perk stat in regardless — `if (key in d) d[key] += value; else d[key] = value`). So
 * this list is the other half of that guard's answer, and a typo is still caught because a typo is
 * in neither file. js/rpg.js declaring it too would be tidier and is in the round-17 handoff.
 */
export const FOLLOWER_STATS = ['followerSlots', 'petSlots'];

/**
 * WHAT A FOLLOWER'S NUMBERS ARE AT A GIVEN OWNER LEVEL.
 *
 *   "All companions should adjust to the player level automatically."
 *
 * Here rather than in js/pets.js because js/pets.js imports Three.js and a node test cannot open
 * it — and this is exactly the arithmetic worth having a test over. `grown` is whatever the
 * follower's level upgrades have added by now (js/pets.js `applyUpgrades`), applied to the BASE
 * numbers rather than to the current ones: compounding a 1.16 damage bump on every re-cost would
 * have a level-40 mercenary hitting for thousands.
 */
export function scaleFollower({ def = null, level = 1, perLevel = 1.17, power = 1, health = 1, grown = null } = {}) {
  const g = grown || { dmgMult: 1, hpMult: 1, armorAdd: 0 };
  const scale = Math.pow(perLevel, Math.max(0, (level || 1) - 1));
  return {
    hp: Math.max(1, Math.round((def?.hp ?? 30) * scale * health * (g.hpMult ?? 1))),
    dmg: (def?.dmg ?? [4, 6]).map(v => Math.max(1, Math.round(v * scale * power * (g.dmgMult ?? 1)))),
    armor: Math.round((def?.armor ?? 0) * scale) + (g.armorAdd ?? 0),
  };
}

/**
 * THE ONE NUMBER THE PERK ARM AND THE AFFIX BOTH HAND OUT.
 *
 * R17 renamed the Kept Company arm's grant from `petSlots` to `followerSlots`, because the old key
 * meant "how many bodies one CAST puts down" and the new one means "how many things may follow
 * you". `petSlots` is still granted by an item affix (`cond_companionExtra` in js/effects.js, which
 * this round does not own), and an affix nobody reads is the exact fault this project keeps
 * finding — so both keys are read here and added together. When effects.js is renamed to match
 * (the patch is in research/round17-class-handoff.md) this quietly becomes one key and nothing
 * else has to change.
 */
export function followerBonus(derived = null, key = 'followerSlots') {
  return Math.round((derived?.[key] || 0) + (derived?.petSlots || 0));
}

/**
 * HOW MANY MAY FOLLOW YOU — three at level one, four at twenty, five at thirty.
 *
 * `rules` is `data/mercenaries.json`'s `slots` block, so the ladder is data and this is arithmetic.
 * The perk part is one derived stat: the Kept Company arm of the perk forest grants
 * `followerSlots`, and js/perks.js is the only place in the game that hands that number out.
 */
export function slotsForLevel(level = 1, derived = null, rules = null) {
  const R = rules || { base: 3, at: { 20: 1, 30: 1 }, perkStat: 'followerSlots', hardCap: 12 };
  let slots = R.base ?? 3;
  for (const [at, extra] of Object.entries(R.at || {})) {
    if ((level || 1) >= Number(at)) slots += extra;
  }
  slots += followerBonus(derived, R.perkStat || 'followerSlots');
  return Math.max(1, Math.min(R.hardCap ?? 12, slots));
}

/**
 * The per-type cap on a summon: one, unless the spell says otherwise, plus the perk arm.
 *
 * `spellCount` is the summoning skill's own `count` out of data/skills.json — "unless the spell
 * itself has a different limit". The Kept Company adds to this as well as to the total, which is
 * the second half of the user's sentence and the reason the arm is worth walking down at all.
 */
export function perTypeCapFor({ spellCount = 1, derived = null, rules = null } = {}) {
  const R = rules || { base: 1, perkStat: 'followerSlots' };
  const base = Math.max(R.base ?? 1, spellCount || 1);
  return Math.max(1, base + followerBonus(derived, R.perkStat || 'followerSlots'));
}

/**
 * THE ONE GATE. Pure, so the test can put five slots and four mercenaries in and ask for a wolf.
 *
 * `alive` is the live follower list — whatever js/pets.js is holding right now — as
 * `[{ defId, origin }]`. The total limit is checked first and applies to everything; the per-type
 * cap is checked second and applies only to summons, because hiring four Blades for Hire is four
 * separate contracts and paying for each of them is its own limit.
 */
export function admit({ defId, origin = 'summon', alive = [], limit = 3, perTypeCap = 1, name = null } = {}) {
  const total = alive.length;
  if (total >= limit) {
    return {
      ok: false,
      why: `You have ${total} of ${limit} follower slots filled. Dismiss somebody, or take another slot — one comes at level 20 and another at 30, and The Kept Company gives more.`,
    };
  }
  if (origin === 'summon') {
    const same = alive.filter(f => f.defId === defId).length;
    if (same >= perTypeCap) {
      return {
        ok: false,
        why: perTypeCap === 1
          ? `You already have ${name || 'one of those'}. One of each kind, until The Kept Company says otherwise.`
          : `You already have ${same} of those, and ${perTypeCap} is the limit.`,
      };
    }
  }
  return { ok: true, why: null };
}

/** A price, levelled. A broker charges more for somebody who can survive where you are going. */
export function priceOf(merc, level = 1, scaling = null) {
  const per = scaling?.pricePerLevel ?? 0.12;
  return Math.max(1, Math.round((merc?.price ?? 200) * (1 + per * Math.max(0, (level || 1) - 1))));
}

/**
 * Which mercenaries a broker in this settlement has on the board today.
 *
 * Deterministic from the settlement and the day, so walking out and back in does not reshuffle the
 * board — and it restocks on its own every `restockDays`, which is the only reason to come back.
 * A type is only offered where it makes sense: `minLevel` keeps a 900-gold caster off a level-2
 * village's board and `minTownSize` says how big a place has to be to support one.
 */
export function boardFor({ mercenaries = [], townId = 0, townSize = 1, level = 1, day = 1, scaling = null } = {}) {
  const S = scaling || { restockDays: 3, offerCount: 4 };
  const window = Math.floor((day - 1) / (S.restockDays || 3));
  const eligible = mercenaries.filter(m => (m.minLevel ?? 1) <= level + 2 && (m.minTownSize ?? 1) <= townSize);
  if (!eligible.length) return [];
  // a plain hash of place and restock window: same town, same few days, same faces
  let h = ((Number(townId) || 0) * 2654435761 ^ (window + 1) * 40503) >>> 0;
  const next = () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
  const pool = [...eligible];
  const out = [];
  const want = Math.min(S.offerCount ?? 4, pool.length);
  while (out.length < want) out.push(pool.splice(Math.floor(next() * pool.length), 1)[0]);
  return out.map(m => ({ ...m, price: priceOf(m, level, scaling) }));
}

// ---------------------------------------------------------------------------------------------

export function createFollowers({
  data = null, skillData = null, pets = null,
  getPlayer = () => null,
  /**
   * WHERE A NEW FOLLOWER IS PUT DOWN.
   *
   * `js/pets.js` places a body at `at.x / at.z`, and the player's POSITION is not on the player —
   * it is on `control`, which is a different object. js/main.js's old hire passed `control` as the
   * OWNER for that reason, which then made `retune` read `control.level` (undefined) and left a
   * hired sword frozen at level 1 for the rest of the run. Owner and place are two arguments here,
   * so both are right.
   */
  getAt = () => null,
  log = null, rng = Math.random,
} = {}) {
  const D = data || {};
  const MERCS = D.mercenaries || [];
  const ABILITIES = D.abilities || {};
  const BY_ID = new Map(MERCS.map(m => [m.id, m]));

  /**
   * WHICH SPELL SUMMONS WHICH BODY, so the per-type cap can read the spell's own `count`.
   *
   * Built once off data/skills.json rather than typed out, for the same reason the spell tier list
   * is derived rather than committed: a second copy of a fact is a copy that goes stale.
   */
  const spellCountFor = new Map();
  for (const s of Object.values(skillData?.skills || {})) {
    if (s.shape === 'summon' && s.pet) spellCountFor.set(s.pet, Math.max(1, s.count || 1));
  }

  /**
   * A MERCENARY TYPE IS A PET DEF, and js/pets.js is told about it rather than data/enemies.json.
   *
   * enemies.json belongs to the bestiary and to Emberveil's build script; adding ten hireable
   * people to it would put ten more things in the enemy tables for every reader that walks them.
   * `pets.register` takes a def at runtime, so the ten types live in their own file and the pet
   * system treats them exactly like everything else it summons.
   */
  for (const m of MERCS) {
    pets?.register?.({
      id: m.id, name: m.name, kind: 'humanoid', family: 'human',
      role: m.role || 'brute',
      hp: m.hp, dmg: m.dmg, armor: m.armor,
      speed: m.speed, reach: m.reach, attackEvery: m.attackEvery,
      ranged: m.ranged || null, onHit: m.onHit || null, look: m.look || null,
      abilities: (m.abilities || []).map(a => ({ ...a })),
      upgrades: (m.upgrades || []).map(u => ({ ...u })),
      abilityBook: ABILITIES,
    });
  }

  /** The contracts, carried ON the player so js/save.js keeps them with everything else you own. */
  function contracts() {
    const p = getPlayer();
    if (!p) return [];
    if (!p.followers) p.followers = { contracts: [] };
    if (!Array.isArray(p.followers.contracts)) p.followers.contracts = [];
    return p.followers.contracts;
  }

  const derivedOf = () => getPlayer()?.derived || null;
  const levelOf = () => getPlayer()?.level || 1;

  function limit() { return slotsForLevel(levelOf(), derivedOf(), D.slots); }

  /** What js/pets.js is holding right now, in the shape `admit` wants. */
  function alive() {
    return (pets?.pets || [])
      .filter(p => p.dying == null)
      .map(p => ({ defId: p.defId, origin: p.origin || 'summon', name: p.name, uid: p.id }));
  }

  function perTypeCap(defId) {
    return perTypeCapFor({
      spellCount: spellCountFor.get(defId) || 1,
      derived: derivedOf(), rules: D.perType,
    });
  }

  /**
   * THE GATE, installed on js/pets.js so nothing can summon around it.
   *
   * Every way a follower enters the world — a summoning skill in js/main.js, a hire here, the class
   * companion at the start of a run — goes through `pets.summon`, and `pets.summon` asks this. That
   * is the whole of "If you have 5 follower slots and hire 4 mercenaries, you can only summon one
   * wolf": four contracts fill four of the five, and the fifth admits exactly one wolf.
   */
  function gate(defId, { origin = 'summon', name = null } = {}) {
    return admit({
      defId, origin, alive: alive(), limit: limit(),
      perTypeCap: perTypeCap(defId), name,
    });
  }
  pets?.setGate?.(gate);

  function say(text, kind = '') { if (log) log(text, kind); }

  /**
   * Hire somebody. Gold out, a body in, and a contract written down so a load puts them back.
   *
   * Refuses out loud rather than quietly: no money, no slot, or a board that has moved on. Every
   * refusal is a sentence the panel prints.
   */
  async function hire(mercId, { at = null, town = null } = {}) {
    const player = getPlayer();
    const merc = BY_ID.get(mercId);
    if (!player || !merc) return { ok: false, why: 'Nobody of that trade is here.' };
    const price = priceOf(merc, player.level || 1, D.scaling);
    const gate1 = gate(merc.id, { origin: 'mercenary', name: merc.name });
    if (!gate1.ok) return { ok: false, why: gate1.why };
    if ((player.gold || 0) < price) {
      return { ok: false, why: `${merc.name} wants ${price} gold up front and you have ${Math.floor(player.gold || 0)}.` };
    }
    player.gold -= price;
    const made = await pets.summon(merc.id, player, { count: 1, at: at || getAt() || player, origin: 'mercenary' });
    if (!made.length) {
      player.gold += price;                        // nothing walked out of the door, so nothing is owed
      return { ok: false, why: 'They changed their mind on the doorstep.' };
    }
    const unit = made[0];
    const contract = {
      uid: unit.id, mercId: merc.id, name: unit.name,
      price, hiredAtLevel: player.level || 1, town: town?.name || null,
    };
    contracts().push(contract);
    say(`${merc.name} takes your ${price} gold and falls in beside you.`, 'good');
    return { ok: true, contract, unit, price };
  }

  /** Let somebody go. A mercenary walks off; a summon is dismissed; a class companion stays. */
  function dismiss(uid) {
    const unit = (pets?.pets || []).find(p => p.id === uid);
    const list = contracts();
    const at = list.findIndex(c => c.uid === uid);
    if (at >= 0) list.splice(at, 1);
    if (!unit) return { ok: at >= 0, why: at >= 0 ? null : 'Nobody by that name follows you.' };
    if (unit.origin === 'companion') {
      return { ok: false, why: `${unit.name} came with you. They are not going anywhere.` };
    }
    pets.remove?.(uid);
    say(`${unit.name} goes their own way.`, '');
    return { ok: true, why: null };
  }

  /**
   * PUTTING CONTRACTED MERCENARIES BACK AFTER A LOAD.
   *
   * A save carries the contracts and not the bodies — the bodies are meshes, and the world they
   * stood in is rebuilt from its seed. So once a run is up, anybody under contract with no body is
   * summoned back beside you. Checked on a slow clock because it is an "is anything missing"
   * question and not a per-frame one.
   */
  let since = 0;
  function tick(dt = 0) {
    since += dt;
    if (since < 2) return;
    since = 0;
    const player = getPlayer();
    if (!player || !pets) return;
    const live = new Set((pets.pets || []).map(p => p.id));
    for (const c of contracts()) {
      if (live.has(c.uid)) continue;
      // a dead mercenary is js/pets.js's business — it revives them on its own clock. This is only
      // for a contract with no body at all, which means a load.
      if ((pets.waiting?.() || []).some(w => w.defId === c.mercId)) continue;
      if (!gate(c.mercId, { origin: 'mercenary', name: c.name }).ok) continue;
      pets.summon(c.mercId, player, { count: 1, at: getAt() || player, origin: 'mercenary' }).then(made => {
        if (made[0]) { made[0].name = c.name; c.uid = made[0].id; }
      }).catch(() => {});
    }
  }

  /** Everything the Followers screen draws. */
  function report() {
    const player = getPlayer();
    const level = player?.level || 1;
    const cap = limit();
    const list = (pets?.pets || []).filter(p => p.dying == null).map(p => ({
      uid: p.id,
      name: p.name,
      kind: FOLLOWER_KINDS[p.origin || 'summon'] || FOLLOWER_KINDS.summon,
      origin: p.origin || 'summon',
      defId: p.defId,
      level: p.level,
      hp: Math.ceil(p.hp), maxHp: p.maxHp,
      state: p.state,
      ranged: !!p.ranged,
      abilities: (p.abilities || []).map(a => a.name),
      learned: (p.learned || []).slice(),
      carrying: p.carrying || null,
      canDismiss: (p.origin || 'summon') !== 'companion',
    }));
    const next = level < 20 ? 20 : level < 30 ? 30 : null;
    return {
      level, limit: cap, used: list.length, free: Math.max(0, cap - list.length),
      followers: list,
      waiting: (pets?.waiting?.() || []).map(w => ({ name: BY_ID.get(w.defId)?.name || w.defId, left: Math.ceil(w.left) })),
      nextSlotAt: next,
      perType: perTypeCapFor({ spellCount: 1, derived: derivedOf(), rules: D.perType }),
      contracts: contracts().map(c => ({ ...c })),
      ladder: slotLadder(level, derivedOf()),
    };
  }

  /** The ladder as rows, so the screen can show what is earned and what is still to come. */
  function slotLadder(level = 1, derived = null) {
    const R = D.slots || { base: 3, at: { 20: 1, 30: 1 } };
    const rows = [{ what: 'Everybody starts with', n: R.base ?? 3, have: true }];
    for (const [at, extra] of Object.entries(R.at || {})) {
      rows.push({ what: `Level ${at}`, n: extra, have: (level || 1) >= Number(at) });
    }
    const perk = followerBonus(derived, R.perkStat || 'followerSlots');
    rows.push({ what: 'The Kept Company', n: perk, have: perk > 0, note: 'the green arm of the Perks forest' });
    return rows;
  }

  /** What a broker in this settlement is selling today. */
  function board({ town = null, day = 1 } = {}) {
    const player = getPlayer();
    return boardFor({
      mercenaries: MERCS,
      townId: town?.id ?? 0, townSize: town?.size ?? 1,
      level: player?.level || 1, day, scaling: D.scaling,
    }).map(m => {
      const gated = gate(m.id, { origin: 'mercenary', name: m.name });
      const gold = Math.floor(player?.gold || 0);
      return {
        ...m,
        afford: gold >= m.price,
        refusal: !gated.ok ? gated.why
          : gold < m.price ? `They want ${m.price} gold up front and you have ${gold}.`
            : null,
        rows: [
          ['Fights as', roleWords(m.role)],
          ['Health', `${Math.round((m.hp || 0) * Math.pow(D.scaling?.perLevel ?? 1.17, (player?.level || 1) - 1))}`],
          ['Hits for', `${m.dmg?.[0]}–${m.dmg?.[1]} before levelling, once every ${m.attackEvery}s`],
          ['Reach', m.ranged ? `ranged, about ${m.ranged.range} m` : `melee, ${m.reach} m`],
          ['Casts', (m.abilities || []).map(a => a.name).join(', ') || 'nothing — they just hit things'],
          ['Grows into', (m.upgrades || []).map(u => `level ${u.atLevel}: ${u.note}`).join(' · ') || 'no more than they are'],
        ],
      };
    });
  }

  return {
    limit, report, board, hire, dismiss, tick, gate, perTypeCap,
    contracts: () => contracts().map(c => ({ ...c })),
    types: () => MERCS.map(m => ({ ...m })),
    byId: id => BY_ID.get(id) || null,
  };
}

/** What a fighting role means in words. Shared shape with js/hire.js's own table. */
function roleWords(role) {
  return ({
    brute: 'Front line — walks in first and stays there.',
    guard: 'Front line — walks in first and stays there.',
    skirmisher: 'Skirmisher — works the flanks and goes for whatever is casting.',
    archer: 'Archer — hangs back and shoots over your shoulder.',
    caster: 'Caster — slow to start, and then the fight is over.',
    healer: 'Healer — keeps you standing rather than killing anything.',
  })[role] || 'Fights.';
}
