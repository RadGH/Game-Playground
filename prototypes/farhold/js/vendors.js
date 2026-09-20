// Farhold — traders move in, because of something you did.
//
// PURE JavaScript: no DOM, no Three.js. `data/colony.json`'s `vendors` block is the whole list.
//
//   import { createVendors } from './vendors.js';
//   const vendors = createVendors({ data: colonyJson });
//   const out = vendors.check(facts);       // once a game day
//   if (out?.offer) panel.show(out.offer);  // an OFFER, never an arrival
//   vendors.accept(offer.id, { colony });
//
// WHY THESE AND NOT A SHOP MENU.
//
//   "The town system should be similar to other games like Terraria with various vendors available."
//
// The rule worth borrowing is not the shop — Farhold has had one of those since js/town.js landed,
// with three categories, buyback and a gambler. It is that **a vendor is a person who decides to
// live at your place because of something you did.** So a vendor is not unlocked, not bought and
// not spawned: they turn up as an OFFER when three things are true at once, and the panel always
// says which of the three is short.
//
//   1. the CONDITION — a machine standing, a count met, gold turned over;
//   2. a FREE BED whose comfort clears what they want;
//   3. no offer already pending for them, and none already accepted.
//
// Gate 2 is the one that makes the housing system pay for itself in a single sentence: *"A
// Forge-Warden would set up here, but the only free bed is a bedroll in the open. Put a roof and a
// well over it."*
//
// A vendor is NOT a worker (§5.2). They occupy a bed, they eat, they pay RENT instead of tax, and
// they put exactly zero units on the work board — see the guard at the top of `colony._doWork`,
// which exists because an empty tag list means "will do anything" everywhere else in the game.

const clamp01 = n => Math.max(0, Math.min(1, n));

export function createVendors({ data = null, saved = null } = {}) {
  const LIST = data?.vendors || [];
  const JOB = data?.vendorJob || { key: 'vendor', name: 'Trader', rentPerDay: 14, restockDays: 3 };
  const BY_ID = new Map(LIST.map(v => [v.id, v]));

  /** vendorId -> { citizenId, day, stock, restockedDay } */
  const here = new Map(Object.entries(saved?.here || {}));
  /** Offers waiting on a yes or a no. */
  let pending = saved?.pending || [];
  /** Ones you turned away, and the day you did it — they ask again in a week, not every morning. */
  const refused = new Map(Object.entries(saved?.refused || {}));

  /**
   * Is this vendor's condition met, and if not, in words, what is short?
   *
   * Every clause reads something the game already tracks. Nothing here has its own counter, because
   * a second counter is a second thing that can be wrong.
   */
  function conditionOf(v, facts) {
    const need = v.needs || {};
    const keys = facts.keys || new Set();
    if (need.citizens && (facts.citizens || 0) < need.citizens) {
      return { ok: false, why: `${v.name} wants somewhere with people in it — ${need.citizens} of them. You have ${facts.citizens || 0}.` };
    }
    if (need.structure && !need.structure.some(k => keys.has(k))) {
      const names = need.structure.map(k => (facts.nameOf ? facts.nameOf(k) : k.replace(/_/g, ' '))).join(' or a ');
      return { ok: false, why: `Nothing here for ${v.name} to stand beside. Build a ${names}.` };
    }
    if (need.made) {
      for (const [res, n] of Object.entries(need.made)) {
        const got = facts.made ? facts.made(res) : 0;
        if (got < n) {
          const what = facts.nameOf ? facts.nameOf(res) : res.replace(/_/g, ' ');
          return { ok: false, why: `${v.name} wants to see the place working. Make ${n} ${what.toLowerCase()} — you are at ${Math.floor(got)}.` };
        }
      }
    }
    if (need.plots && (facts.plots || 0) < need.plots) {
      return { ok: false, why: `${v.name} wants fields to buy from. Lay ${need.plots} plots.` };
    }
    if (need.posted && (facts.posted || 0) < need.posted) {
      return { ok: false, why: `${v.name} will not live anywhere nobody is standing a watch. Put a guard in a post.` };
    }
    if (need.turnover && (facts.turnover || 0) < need.turnover) {
      return { ok: false, why: `${v.name} follows the money. Turn over ${need.turnover} gold of trade first — you are at ${Math.floor(facts.turnover || 0)}.` };
    }
    if (need.spent && (facts.spent || 0) < need.spent) {
      return { ok: false, why: `${v.name} arrives once there is enough money here to be worth losing. Spend ${need.spent} gold at this holding.` };
    }
    return { ok: true, why: null };
  }

  /** The best free bed, and whether it is good enough for this one. */
  function bedFor(v, facts) {
    const report = facts.housing?.report?.() || { spare: 0, best: null };
    if (!report.spare) return { ok: false, why: `${v.name} would set up here, but there is not a spare bed in the place.` };
    const best = report.best;
    const comfort = best?.comfort ?? 0;
    if (comfort + 1e-9 < (v.wants || 0)) {
      return {
        ok: false,
        why: `${v.name} would set up here, but the best free bed is ${describeBed(best)}. ${adviceFor(v.wants || 0)}`,
        comfort,
      };
    }
    return { ok: true, bed: best, comfort };
  }

  function describeBed(bed) {
    if (!bed) return 'nowhere at all';
    const c = bed.comfort || 0;
    const where = bed.house ? `a ${String(bed.house).toLowerCase()}` : 'a bed';
    if (c <= 0.05) return `${where} in the open`;
    if (c < 0.25) return `${where} with nothing around it`;
    if (c < 0.45) return `${where} with a little around it`;
    return `${where}, and they want better still`;
  }

  function adviceFor(want) {
    if (want <= 0.2) return 'A roof over it would do.';
    if (want <= 0.3) return 'Put a well and a hearth within reach of it.';
    return 'A proper house, with a well, a hearth and a privy in reach.';
  }

  /**
   * Once a game day: does anybody want to move in?
   *
   * Returns an OFFER, never an arrival — the same rule `colony.rollMigration` already follows, for
   * the same reason: a mouth you did not agree to is a mouth you did not budget for. The `blocked`
   * list comes back with it so the Traders tab can show all twelve, in residence first, each
   * blocked one saying exactly what is short.
   */
  function check(facts = {}) {
    const day = facts.day || 1;
    const rng = facts.rng || Math.random;
    const blocked = [];
    const ready = [];
    for (const v of LIST) {
      if (here.has(v.id)) continue;
      if (pending.some(o => o.vendor === v.id)) continue;
      const again = refused.get(v.id);
      if (again && day - again < 7) { blocked.push({ id: v.id, name: v.name, why: 'You sent them away. They will ask again in a few days.' }); continue; }
      const cond = conditionOf(v, facts);
      if (!cond.ok) { blocked.push({ id: v.id, name: v.name, why: cond.why }); continue; }
      const bed = bedFor(v, facts);
      if (!bed.ok) { blocked.push({ id: v.id, name: v.name, why: bed.why }); continue; }
      ready.push({ v, bed });
    }
    if (!ready.length) return { offer: null, blocked };
    // one at a time, oldest condition first, so a place that qualifies for four does not get four
    const takeIt = ready[Math.floor(rng() * ready.length) % ready.length];
    const v = takeIt.v;
    const offer = {
      id: `vend_${v.id}_${day}`,
      kind: 'vendor',
      vendor: v.id,
      name: v.name,
      role: v.role || 'merchant',
      sells: v.sells,
      buys: v.buys,
      rentPerDay: JOB.rentPerDay || 14,
      comfort: takeIt.bed.comfort,
      day,
      expiresIn: 24,
      text: `${v.name} has walked in and asked whether there is a bed going. ${v.blurb} They would pay ${JOB.rentPerDay || 14} gold a day for it.`,
    };
    pending.push(offer);
    return { offer, blocked };
  }

  /**
   * Say yes. They become a citizen with the `vendor` job — a bed, a mouth, and no work at all.
   */
  function accept(offerId, { colony = null } = {}) {
    const i = pending.findIndex(o => o.id === offerId);
    if (i < 0) return { ok: false, why: 'They have moved on.' };
    const [offer] = pending.splice(i, 1);
    const v = BY_ID.get(offer.vendor);
    if (!colony) return { ok: false, why: 'There is nowhere for them to live.' };
    if (colony.spareBeds() <= 0) return { ok: false, why: 'Somebody took the last bed while they were waiting.' };
    const person = colony.newCitizen({ job: 'vendor', name: null, from: 'the road' });
    person.vendor = v.id;
    person.vendorName = v.name;
    person.jobName = v.name;
    colony.welcome(person);
    here.set(v.id, { citizenId: person.id, day: offer.day, stock: null, restockedDay: offer.day });
    return { ok: true, vendor: v, citizen: person };
  }

  /** Say no. Free, and they ask again in about a week rather than every single morning. */
  function turnAway(offerId, { day = 1 } = {}) {
    const i = pending.findIndex(o => o.id === offerId);
    if (i < 0) return { ok: false, why: 'They have moved on.' };
    const [offer] = pending.splice(i, 1);
    refused.set(offer.vendor, day);
    return { ok: true, offer };
  }

  /** A vendor left, or you moved them on. */
  function remove(vendorId, { colony = null } = {}) {
    const rec = here.get(vendorId);
    if (!rec) return { ok: false, why: 'Nobody of that trade lives here.' };
    here.delete(vendorId);
    if (colony) {
      const i = colony.citizens.findIndex(c => c.id === rec.citizenId);
      if (i >= 0) colony.citizens.splice(i, 1);
      colony._assignBeds();
    }
    return { ok: true };
  }

  function expire(hours = 0) {
    for (let i = pending.length - 1; i >= 0; i--) {
      pending[i].expiresIn -= hours;
      if (pending[i].expiresIn <= 0) pending.splice(i, 1);
    }
  }

  /**
   * What is on their shelf.
   *
   * The gear half comes from js/town.js's existing shop machinery — one vendor is one `role`, and
   * `STOCK_BY_ROLE` already knows what a smith and a merchant carry. The MATERIALS shelf is the one
   * addition: priced off `data/resources.json`'s own `value` field at 2.2× to buy from them and
   * 0.45× to sell to them. Iron ore is value 2, so a Quartermaster sells it at 4 and buys at 1.
   * That is BUILDING_EXPANSION §1.18's rule — *"buying raw stock from towns: always possible,
   * always the expensive route"* — as one multiplier pair rather than a table.
   */
  function shelf(vendorId, { materials = {}, day = 1, allow = null } = {}) {
    const rec = here.get(vendorId);
    const v = BY_ID.get(vendorId);
    if (!rec || !v) return [];
    const M = data?.trade?.materialsShelf || { buyMultiplier: 2.2, sellMultiplier: 0.45 };
    const ids = allow || Object.keys(materials);
    return ids
      .filter(id => (materials[id]?.value || 0) > 0)
      .map(id => ({
        id, name: materials[id].name,
        buy: Math.max(1, Math.round(materials[id].value * M.buyMultiplier)),
        sell: Math.max(1, Math.round(materials[id].value * M.sellMultiplier)),
      }));
  }

  /** Every one of the twelve, in residence first, for the Traders tab. */
  function board(facts = {}) {
    const out = check0(facts);
    return LIST.map(v => {
      const rec = here.get(v.id);
      const block = out.blocked.find(b => b.id === v.id);
      const offer = pending.find(o => o.vendor === v.id);
      return {
        id: v.id, name: v.name, sells: v.sells, buys: v.buys, blurb: v.blurb,
        wants: v.wants, rentPerDay: JOB.rentPerDay || 14,
        state: rec ? 'here' : offer ? 'offered' : 'blocked',
        citizenId: rec?.citizenId || null,
        why: rec ? null : offer ? 'Waiting on your answer.' : (block?.why || null),
      };
    }).sort((a, b) => (a.state === 'here' ? -1 : 1) - (b.state === 'here' ? -1 : 1));
  }

  /** The same sweep as `check` but with no offer made — the board must not roll a new arrival. */
  function check0(facts) {
    const blocked = [];
    for (const v of LIST) {
      if (here.has(v.id)) continue;
      const cond = conditionOf(v, facts);
      if (!cond.ok) { blocked.push({ id: v.id, name: v.name, why: cond.why }); continue; }
      const bed = bedFor(v, facts);
      if (!bed.ok) blocked.push({ id: v.id, name: v.name, why: bed.why });
    }
    return { blocked };
  }

  return {
    list: LIST,
    get(id) { return BY_ID.get(id) || null; },
    check, accept, turnAway, remove, expire, shelf, board, conditionOf, bedFor,
    inResidence: () => [...here.keys()],
    pendingOffers: () => pending.slice(),
    rent: () => here.size * (JOB.rentPerDay || 14),
    toJSON() { return { v: 1, here: Object.fromEntries(here), pending, refused: Object.fromEntries(refused) }; },
    loadJSON(json) {
      here.clear(); refused.clear();
      for (const [k, val] of Object.entries(json?.here || {})) here.set(k, val);
      for (const [k, val] of Object.entries(json?.refused || {})) refused.set(k, val);
      pending = json?.pending || [];
      return here.size;
    },
  };
}
