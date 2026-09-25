// Farhold — the Command Rod: point at your own people and tell them where to be.
//
//   "Add a Command Rod that once built can be scrolled to as the 4th item on the mousewheel and
//    allows you to select one or more NPCs and order them to a task."
//
// Everything underneath this already worked and had no way in. `js/colony.js` can `assign` a
// citizen to a job and `bind` them to a station; `js/work.js` takes units from any of three
// sources into one ledger; `js/town.js` can now walk a body to a point (`sendTo`). What did not
// exist was a player holding something and pointing it, which is the difference between a colony
// simulation and a colony you are running.
//
//   const rod = createCommand({ colony, folk, build, works, terrain, onLog });
//   rod.use(aim);                       // left click with the rod out: select, or give the order
//   rod.tick(dt, control);              // watch for arrivals
//   rod.status();                       // what the HUD draws
//
// Two clicks, deliberately: the first picks people, the second says where. That is the shape every
// player already knows, and it means the rod never needs a modifier key or a drag.
//
// Pure-ish: it owns no meshes. `folk` walks the bodies, `colony` keeps the assignments, and this
// only decides.

/** What an order can be, in the order they are tested against whatever you pointed at. */
export const ORDERS = {
  work: { name: 'Work here', verb: 'goes to work at' },
  haul: { name: 'Haul to here', verb: 'will carry to' },
  guard: { name: 'Stand watch here', verb: 'takes a post at' },
  move: { name: 'Go here', verb: 'sets off for' },
};

/**
 * EVERY DEPENDENCY MAY BE A FUNCTION, AND USUALLY IS.
 *
 * js/main.js builds its modules in one long sequence, and three of the four things this needs —
 * the build book, the works and the folk — do not exist yet at the line where the rod is created.
 * Two attempts at ordering produced two "Cannot access 'build' before initialization" crashes,
 * which is the third and fourth time this file has had a temporal-dead-zone bug and the kind
 * `node --check` cannot see, because a TDZ is perfectly good syntax.
 *
 * So the rod never holds a reference: it asks for one every time it needs it. `folk` in particular
 * is rebuilt from scratch every time you land on a new world, so holding the first one would have
 * been a bug even with the ordering right.
 */
const deref = v => (typeof v === 'function' ? v() : v);

export function createCommand({
  colony = null, folk = null, build = null, works = null, terrain = null,
  onLog = () => {}, range = 45,
} = {}) {
  /** Body ids, not citizen ids — the rod points at bodies and the citizen comes along behind. */
  let picked = [];
  let lastOrder = null;

  const theColony = () => deref(colony);
  const theFolk = () => deref(folk);
  const theBuild = () => deref(build);
  const theWorks = () => deref(works);

  const own = () => theFolk()?.own?.() || [];
  const bodyById = id => own().find(n => n.id === id) || null;
  const citizenOf = npc => {
    const col = theColony();
    return (npc?.citizenId ? col?.byId?.(npc.citizenId) : null)
      || (col?.citizens || []).find(c => c.body === npc?.id) || null;
  };

  /** The nearest of your own people to a world point, inside the rod's reach. */
  function nearest(x, z, r = 6) {
    let best = null, bestD = r;
    for (const npc of own()) {
      const d = Math.hypot(npc.x - x, npc.z - z);
      if (d < bestD) { bestD = d; best = npc; }
    }
    return best;
  }

  /** What is standing at a point that somebody could be told to work. */
  /** A store you can be told to carry to — `def.store` is what js/stores.js joins on. */
  function storeAt(x, z, r = 6) {
    for (const e of theBuild()?.entries || []) {
      const def = theBuild()?.defOf?.(e.key);
      if (!def?.store?.slots && !def?.pool) continue;
      if (Math.hypot(e.x - x, e.z - z) <= r) return e;
    }
    return null;
  }

  /** Somewhere to stand watch: a post with slots, or anything the defence category owns. */
  function postAt(x, z, r = 7) {
    for (const e of theBuild()?.entries || []) {
      const def = theBuild()?.defOf?.(e.key);
      if (!def?.post?.slots && def?.cat !== 'defence') continue;
      if (Math.hypot(e.x - x, e.z - z) <= r) return e;
    }
    return null;
  }

  function stationAt(x, z, r = 6) {
    const w = theWorks();
    for (const e of theBuild()?.entries || []) {
      if (!w?.machineDefs?.[e.key]) continue;
      if (Math.hypot(e.x - x, e.z - z) <= r) return e;
    }
    return null;
  }

  function select(npc, { add = false } = {}) {
    if (!npc) return picked.slice();
    if (!add) picked = [];
    if (!picked.includes(npc.id)) picked.push(npc.id);
    return picked.slice();
  }

  function selectAllNear(x, z, r = range) {
    picked = own().filter(n => Math.hypot(n.x - x, n.z - z) <= r).map(n => n.id);
    return picked.slice();
  }

  function clear() { picked = []; }

  /**
   * GIVE THE ORDER.
   *
   * What the order IS comes from what you pointed at, which is the whole reason this needs no menu:
   * a machine means work it, a store means haul to it, a defensive structure means stand watch
   * there, bare ground means go and stand there. `js/colony.js` gets the assignment so the citizen
   * keeps doing it while you are elsewhere; `js/town.js` walks the body so you can watch them go.
   */
  function order(x, z) {
    const people = picked.map(bodyById).filter(Boolean);
    if (!people.length) return { ok: false, why: 'Nobody is selected.' };

    /**
     * R18 — ALL FOUR ORDERS, which is what the header above already describes.
     *
     * `ORDERS` declares work/haul/guard/move and this computed `station ? 'work' : 'move'`, so
     * `haul` and `guard` could never be produced and `{ run: kind === 'guard' }` on the `sendTo`
     * call below was always false — nobody ever ran to a post. The header says it plainly: "a
     * machine means work it, a store means haul to it, a defensive structure means stand watch
     * there, bare ground means go and stand there." Three of the four were the same branch.
     *
     * Tested in the order the header lists them, and each asks the ledger what is actually standing
     * there rather than carrying its own idea of what a store or a post looks like.
     */
    const station = stationAt(x, z);
    const store = storeAt(x, z);
    const post = postAt(x, z);
    const kind = station ? 'work' : store ? 'haul' : post ? 'guard' : 'move';
    // …and it says WHICH thing it is walking to, whichever of the three it turned out to be
    const target = station || store || post;
    const where = target ? (target.name || target.key || 'it') : 'that spot';

    let done = 0;
    for (const npc of people) {
      // spread them out a little, or six people walk to the same square metre
      const spread = people.length > 1 ? 1.6 + done * 0.9 : 0;
      const a = (done / Math.max(1, people.length)) * Math.PI * 2;
      const tx = x + Math.cos(a) * spread, tz = z + Math.sin(a) * spread;
      theFolk()?.sendTo?.(npc, tx, tz, { run: kind === 'guard', name: where });
      const cit = citizenOf(npc);
      if (cit && station) {
        const out = theColony()?.assign?.(cit.id, { stationId: station.id });
        if (out && out.ok === false) onLog(`${npc.name}: ${out.why}`, 'warn');
      } else if (cit && !station) {
        // told to go and stand somewhere: let go of whatever station they were tied to, or they
        // will be counted as tending a bench they are nowhere near
        theColony()?.assign?.(cit.id, { stationId: null });
      }
      done++;
    }
    lastOrder = { kind, where, n: done, at: { x, z } };
    onLog(done === 1
      ? `${people[0].name} ${ORDERS[kind].verb} ${where}.`
      : `${done} of your people ${ORDERS[kind].verb.replace(/s$/, '')} ${where}.`, 'good');
    return { ok: true, kind, n: done, where };
  }

  /**
   * One click with the rod out. Aim at a person to pick them; aim at anything else to send whoever
   * is picked. Holding shift adds to the selection rather than replacing it.
   */
  function use(aim = {}, { add = false } = {}) {
    const { x, z } = aim;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return { ok: false, why: 'Point at something.' };
    const who = nearest(x, z, 4.5);
    if (who) {
      select(who, { add });
      onLog(picked.length === 1
        ? `${who.name}. Now point at where they should be.`
        : `${picked.length} selected.`, '');
      return { ok: true, picked: picked.length, selected: who.name };
    }
    if (!picked.length) {
      // nothing under the cursor and nobody picked: take everyone within the rod's reach, which is
      // what "select one or more" means when you are stood in the middle of your own holding
      const all = selectAllNear(x, z, range);
      if (!all.length) return { ok: false, why: 'None of your people are near enough to hear you.' };
      onLog(`${all.length} of your people are listening.`, '');
      return { ok: true, picked: all.length };
    }
    return order(x, z);
  }

  /** Watch for arrivals, so the log says they got there rather than leaving it a mystery. */
  function tick() {
    for (const npc of own()) {
      if (!npc.arrivedAt) continue;
      onLog(`${npc.name} is at ${npc.arrivedAt}.`, '');
      npc.arrivedAt = null;
    }
  }

  return {
    use, order, select, selectAllNear, clear, tick, nearest, stationAt,
    get selected() { return picked.slice(); },
    get count() { return picked.length; },
    /** What the HUD prints while the rod is out. */
    status() {
      const people = picked.map(bodyById).filter(Boolean);
      if (!people.length) {
        const n = own().length;
        return n
          ? `Command Rod — click one of your ${n} people, or click the ground to call everyone near.`
          : 'Command Rod — you have nobody yet. Recruit at a Town Hall.';
      }
      return people.length === 1
        ? `${people[0].name} selected. Click where they should be.`
        : `${people.length} selected. Click where they should be.`;
    },
    get lastOrder() { return lastOrder; },
  };
}
