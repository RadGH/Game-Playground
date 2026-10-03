// Farhold — the base economy, read off the systems that run it. Round 28.
//
//   "Improve building system and automation."
//
// Every piece of a base already knows its own state: js/refine.js knows what each bench is doing,
// js/mining.js what each drill is digging and why it is not going faster, js/stores.js what each
// pool holds, js/power.js what each grid makes and wants, js/logistics.js what is on the road. What
// nothing did was put them side by side — so a base of ten machines had no screen that said what it
// makes, what it eats, what is stuck, or WHY. Three of the reports this file reads were written for
// exactly that screen and never called (`stores.overview` — "everything the base overview panel
// wants (§8.9)", `stores.linkAdvice`, `grid.overview`), and a fourth (`grid.whatIf`) still is not.
//
// Four things, all pure and all askable from a node test:
//
//   * a FLOW METER — once a second it notes two things: what the machines have FINISHED (works'
//     own completion count, times each recipe's outputs and inputs) plus what the drills have
//     DELIVERED, and what the stores hold. The first is "made a minute", counted at the source, so
//     a cart in transit or you emptying a crate into your pack does not read as the base producing
//     or losing anything. The second is the stock trend, labelled as exactly that.
//   * RATED numbers — what each machine and drill turns out per minute while it runs.
//   * a DIAGNOSIS for anything that is not running, traced UPSTREAM: "no iron ore" is true and
//     useless when the reason is that the drill feeding it has no power. One word, one sentence,
//     and one thing to do about it.
//   * ALERTS — the diagnoses that have lasted, plus full stores, short grids and stuck loads, worst
//     first. The HUD pill and the Production tab both read this one list.
//
//   import { createProduction } from './production.js';
//   const prod = createProduction({ works, stores, grid, mining, logistics, materials, refining, nodeKinds });
//   prod.sample(elapsedSeconds);           // once a second
//   prod.alerts(); prod.flows(); prod.machines(); prod.diagnose(machineId);
//
// No DOM, no Three.js. js/production-ui.js draws it.

const WINDOW = 60;            // seconds of samples the meter keeps
const MACHINE_GRACE = 12;     // a machine has to be stuck this long before it is an alert
const FULL_AT = 0.9;          // a pool this full is an alert

const GOOD = new Set(['running', 'stocked']);

export function createProduction({
  works = null, stores = null, grid = null, mining = null, logistics = null,
  materials = {}, refining = {}, nodeKinds = {},
} = {}) {
  const nameOf = id => materials?.[id]?.name || String(id || '').replace(/_/g, ' ');
  const fmt = n => {
    if (!Number.isFinite(n)) return '∞';
    const r = Math.round(n * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  };

  // ------------------------------------------------------------------ where a material comes from

  /** recipe ids that output each material, so "who makes iron ingot" is one lookup */
  const MAKERS = Object.create(null);
  for (const r of refining?.recipes || []) {
    for (const res of Object.keys(r.outputs || {})) (MAKERS[res] ||= []).push(r);
  }
  /** materials something in the ground holds — the answer for those is "dig it" */
  const DUG = new Set();
  for (const k of Object.values(nodeKinds || {})) for (const res of Object.keys(k?.resources || {})) DUG.add(res);

  // ------------------------------------------------------------------ the meter

  let samples = [];             // [{ at, totals }]
  /** key -> first time this problem was seen, so an alert can say how long and wait out a blip */
  const since = new Map();
  let lastAt = 0;

  function totals() {
    const out = Object.create(null);
    for (const p of stores?.pools?.() || []) {
      for (const [k, v] of Object.entries(p.totals || {})) out[k] = (out[k] || 0) + v;
    }
    return out;
  }

  /** Once a second. Returns the alerts so a caller can paint the pill off the same call. */
  function sample(at = 0) {
    lastAt = at;
    samples.push({ at, totals: totals(), completed: { ...(works?.completed || {}) }, carried: carried() });
    while (samples.length > 2 && samples[0].at < at - WINDOW) samples.shift();
    // age the problems: a key seen now keeps its first-seen time, a key not seen is forgotten
    const seen = new Set();
    for (const p of rawProblems()) {
      seen.add(p.key);
      if (!since.has(p.key)) since.set(p.key, at);
    }
    for (const k of [...since.keys()]) if (!seen.has(k)) since.delete(k);
    return alerts();
  }

  /** What each drill has delivered, ever, by material — so the meter can diff it. */
  function carried() {
    const out = Object.create(null);
    const res = new Map((mining?.drills || []).map(d => [d.entry?.id, d.resource]));
    for (const r of mining?.routes || []) {
      const k = res.get(r.fromId);
      if (k) out[k] = (out[k] || 0) + (r.carried || 0);
    }
    return out;
  }

  /**
   * Measured, per minute, over the window: `{ made: {res: n}, used: {res: n}, stock: {res: n} }`.
   * Empty until two samples at least five seconds apart.
   */
  function measured() {
    const out = { made: {}, used: {}, stock: {} };
    if (samples.length < 2) return out;
    const a = samples[0], b = samples[samples.length - 1];
    const span = b.at - a.at;
    if (span < 5) return out;
    const per = d => (d / span) * 60;
    const add = (bag, k, n) => { if (Math.abs(n) > 1e-9) bag[k] = (bag[k] || 0) + n; };
    for (const k of new Set([...Object.keys(a.totals), ...Object.keys(b.totals)])) {
      add(out.stock, k, per((b.totals[k] || 0) - (a.totals[k] || 0)));
    }
    for (const [id, nB] of Object.entries(b.completed || {})) {
      const n = nB - (a.completed?.[id] || 0);
      if (n <= 0) continue;
      const r = works?.recipes?.[id];
      for (const [k, q] of Object.entries(r?.outputs || {})) add(out.made, k, per(n * q));
      for (const [k, q] of Object.entries(r?.inputs || {})) add(out.used, k, per(n * q));
    }
    for (const [k, nB] of Object.entries(b.carried || {})) add(out.made, k, per(nB - (a.carried?.[k] || 0)));
    return out;
  }

  // ------------------------------------------------------------------ rated numbers

  /** What one machine turns out and eats per minute while it runs its head job, or null. */
  function rated(m) {
    const job = m?.queue?.[0];
    const recipe = job && works?.recipes?.[job.recipe];
    if (!recipe?.time) return null;
    const sp = works.speedOf?.(m.id)?.speed ?? (m.def?.speed ?? 1);
    // a machine that is not running right now is still rated at the speed it WOULD run at, so an
    // unpowered smelter does not read "0/min" — the badge already says it is stopped
    const speed = sp > 0 ? sp : (m.def?.speed ?? 1);
    const perMin = 60 / (recipe.time / speed);
    const makes = {}, eats = {};
    for (const [k, n] of Object.entries(recipe.outputs || {})) makes[k] = n * perMin;
    for (const [k, n] of Object.entries(works.inputsOf?.(recipe) || recipe.inputs || {})) eats[k] = n * perMin;
    return { recipe: recipe.id, recipeName: recipe.name, perMin, makes, eats, waste: recipe.waste || [], speed };
  }

  /** "6 iron ingot/min from 12 iron ore/min" — the line a station screen prints. */
  function ratedText(m) {
    const r = rated(m);
    if (!r) return '';
    const waste = new Set(r.waste);
    const out = Object.entries(r.makes).filter(([k]) => !waste.has(k)).map(([k, n]) => `${fmt(n)} ${nameOf(k).toLowerCase()}`);
    const ins = Object.entries(r.eats).map(([k, n]) => `${fmt(n)} ${nameOf(k).toLowerCase()}`);
    return `Makes ${out.join(' + ') || 'nothing'} a minute${ins.length ? ` from ${ins.join(' + ')}` : ''}, while it runs.`;
  }

  /** Every material the base touches: what it holds, what is rated in and out, what was measured. */
  function flows() {
    const rows = Object.create(null);
    const row = k => (rows[k] ||= { res: k, name: nameOf(k), stock: 0, ratedIn: 0, ratedOut: 0, made: 0, used: 0, trend: 0 });
    for (const [k, v] of Object.entries(totals())) row(k).stock = v;
    for (const m of works?.all?.() || []) {
      if (m.state !== 'running') continue;
      const r = rated(m);
      if (!r) continue;
      for (const [k, n] of Object.entries(r.makes)) row(k).ratedIn += n;
      for (const [k, n] of Object.entries(r.eats)) row(k).ratedOut += n;
    }
    for (const d of mining?.overview?.() || []) {
      if (d.limit !== 'digging' && d.limit !== 'hauling') continue;
      const delivered = d.route ? Math.min(d.digPerMinute, d.route.perMinute) : 0;
      if (delivered > 0) row(d.resource).ratedIn += delivered;
    }
    const me = measured();
    for (const [k, v] of Object.entries(me.made)) row(k).made = v;
    for (const [k, v] of Object.entries(me.used)) row(k).used = v;
    for (const [k, v] of Object.entries(me.stock)) row(k).trend = v;
    return Object.values(rows)
      .filter(r => r.stock > 0.05 || r.ratedIn > 0 || r.ratedOut > 0 || r.made > 0 || r.used > 0)
      .map(r => ({
        ...r,
        net: r.ratedIn - r.ratedOut,
        // how long until it runs out, if it is going down — the number that says "go and fix it now"
        runsOutIn: r.ratedOut > r.ratedIn && r.stock > 0 ? (r.stock / (r.ratedOut - r.ratedIn)) * 60 : null,
      }))
      .sort((a, b) => (b.ratedIn + b.ratedOut) - (a.ratedIn + a.ratedOut) || b.stock - a.stock);
  }

  // ------------------------------------------------------------------ why is it not running

  const poolOf = m => stores?.poolAt?.(m.x, m.z) || null;
  const otherPoolsHolding = (res, notId) => (stores?.pools?.() || [])
    .filter(p => p.id !== notId && (p.totals?.[res] || 0) >= 1)
    .map(p => ({ id: p.id, name: p.name, n: p.totals[res] }));

  /**
   * WHERE A SHORT MATERIAL SHOULD HAVE COME FROM, and what is wrong with that.
   *
   * Walks at most `depth` steps up the chain. The order of the answers is the order a player would
   * check: is something of mine already making it (and is IT stuck); is there some in another of my
   * stores that this one cannot reach; is it something you dig; who could make it.
   */
  function sourceOf(res, m, depth = 2, seen = new Set()) {
    const pool = poolOf(m);
    const out = [];
    seen.add(m?.id);

    // 1. a machine of mine is set to make it
    const makers = (works?.all?.() || []).filter(x => !seen.has(x.id) && x.queue?.some(j => works.recipes?.[j.recipe]?.outputs?.[res]));
    for (const x of makers) {
      const samePool = pool && poolOf(x)?.id === pool.id;
      if (!GOOD.has(x.state) && depth > 0) {
        const d = diagnose(x.id, depth - 1, seen);
        out.push(`The ${x.name} that makes it is stopped too: ${d.text.charAt(0).toLowerCase()}${d.text.slice(1)}`);
      } else if (!samePool) {
        out.push(`The ${x.name} makes it, but delivers to ${poolOf(x)?.name || 'your pack'}, which this cannot reach.`);
      } else {
        const r = rated(x);
        const need = rated(m)?.eats?.[res] || 0;
        if (r && need > (r.makes[res] || 0) * 1.05) out.push(`The ${x.name} makes ${fmt(r.makes[res] || 0)}/min and this eats ${fmt(need)}/min — it cannot keep up.`);
        else out.push(`The ${x.name} is making it now; it will turn up.`);
      }
    }

    // 2. a drill digs it
    for (const d of mining?.overview?.() || []) {
      if (d.resource !== res) continue;
      const to = d.route ? (stores?.pools?.() || []).find(p => p.id === d.route.to) : null;
      if (d.limit === 'power') out.push(`The drill on ${nameOf(res).toLowerCase()} has no power.`);
      else if (d.limit === 'seam') out.push(`The drill on ${nameOf(res).toLowerCase()} has worked its seam out.`);
      else if (d.limit === 'no route') out.push(`The drill on ${nameOf(res).toLowerCase()} has ${d.stock} piled up and no store to send it to.`);
      else if (pool && to && to.id !== pool.id) out.push(`The drill on ${nameOf(res).toLowerCase()} delivers to ${to.name}, not here.`);
      else if (d.limit === 'hauling') out.push(`The drill on ${nameOf(res).toLowerCase()} digs ${fmt(d.digPerMinute)}/min but its route carries only ${fmt(d.route?.perMinute || 0)}/min.`);
      else out.push(`A drill delivers ${fmt(Math.min(d.digPerMinute, d.route?.perMinute ?? Infinity))}/min of it here.`);
    }

    // 3. some sits in another of my stores
    const elsewhere = otherPoolsHolding(res, pool?.id);
    if (elsewhere.length) {
      const best = elsewhere.sort((a, b) => b.n - a.n)[0];
      const linked = (logistics?.links || []).some(l => l.from === best.id && l.to === pool?.id && (!l.only || l.only.includes(res)));
      out.push(linked
        ? `${fmt(best.n)} at ${best.name} is on a supply route here; it moves in loads of ${logistics.links.find(l => l.from === best.id)?.batch || 20}.`
        : `${fmt(best.n)} sits at ${best.name}, which is not joined to this. Link the two (Map, Supply), or plant a relay between them.`);
    }

    // 4. nothing of mine is on it — say where it comes from at all
    if (!out.length) {
      const recipes = MAKERS[res] || [];
      const machineNames = [...new Set(recipes.map(r => refining?.machines?.[r.machine]?.name || r.machine))];
      if (DUG.has(res) && recipes.length) out.push(`Nothing of yours makes it. Dig it (E on a seam, or a drill on one), or make it at a ${machineNames.join(' or ')}.`);
      else if (DUG.has(res)) out.push(`Nothing of yours digs it. E on a seam, or put a drill on one.`);
      else if (recipes.length) out.push(`Nothing of yours makes it. It is made at a ${machineNames.join(' or ')} (${recipes[0].name}).`);
      else out.push('Nothing in your base can make it.');
    }
    return out;
  }

  /**
   * One machine: `{ word, ok, text, fix, chain }`.
   *
   * `word` is the one-word badge (the machine's own state), `text` the plain sentence, `fix` the
   * one thing to do, and `chain` the upstream lines — empty when the fix is local.
   */
  function diagnose(id, depth = 2, seen = new Set()) {
    const m = works?.get?.(id);
    if (!m) return { word: 'gone', ok: false, text: 'That machine is not there any more.', fix: '', chain: [] };
    const word = m.enabled === false ? 'off' : m.state;
    const text = works.stateText?.(m) || m.state;
    const base = { word, ok: GOOD.has(m.state) && m.enabled !== false, text, fix: '', chain: [] };
    if (m.enabled === false) return { ...base, fix: 'Switch it back on.' };
    switch (m.state) {
      case 'running': return { ...base, fix: '' };
      case 'stocked': return { ...base, fix: '' };
      case 'idle':
        return { ...base, fix: m.queue.length ? '' : 'Pick something for it to make.' };
      case 'starved': {
        const res = m.starvedFor;
        if (!res || res === 'a rare element this world does not hold') return { ...base, fix: 'That recipe needs a world with a rare element in it.' };
        const wants = res === 'fuel' ? Object.keys(m.def?.fuels || {}) : [res];
        const chain = res === 'fuel'
          ? [`It burns ${wants.map(nameOf).join(', ')}.`, ...sourceOf(wants[wants.length - 1], m, depth, seen)]
          : sourceOf(res, m, depth, seen);
        return { ...base, chain, fix: chain[chain.length - 1] || '' };
      }
      case 'blocked': {
        const pool = poolOf(m);
        const pending = Object.keys(m.pending || works.recipes?.[m.queue?.[0]?.recipe]?.outputs || {});
        const res = pending[0];
        const chain = [];
        if (!pool) chain.push('Your pack is full. Empty it, or put a Storage Box beside the machine.');
        else {
          let free = 0, room = 0;
          for (const s of pool.members || []) { free += Math.max(0, (s.cap || 0) - Object.values(s.inv || {}).reduce((a, n) => a + n, 0)); room += res ? (stores.roomFor?.(s, res) || 0) : 0; }
          if (free > 1 && room < 1 && res) {
            chain.push(`The stores here have ${fmt(free)} free, but one material may fill at most a quarter of a store, and raw materials half of it — ${nameOf(res)} is at that line.`);
            chain.push('Another box beside it raises the line; a supply route out moves the surplus away.');
          } else {
            chain.push(`The stores here are full (${fmt(pool.cap ? 100 * (pool.cap - free) / pool.cap : 100)}%).`);
            chain.push('Build another box beside it, or a supply route that carries the surplus away.');
          }
        }
        return { ...base, chain, fix: chain[chain.length - 1] };
      }
      case 'unworked': {
        /**
         * js/refine.js checks labour BEFORE inputs (so a machine never eats ore nobody was there to
         * smelt), which means a cold furnace with no ore in reach reads only "unworked". Whoever
         * comes to work it would find nothing to put in it, so say that too, traced the same way.
         */
        const recipe = works.recipes?.[m.queue?.[0]?.recipe];
        const pool = poolOf(m);
        const short = Object.entries(works.inputsOf?.(recipe) || recipe?.inputs || {})
          .find(([k, n]) => (pool ? (stores.count?.(pool, k) || 0) : 0) < n)?.[0];
        const also = short && depth > 0
          ? [`It has no ${nameOf(short).toLowerCase()} in reach either.`, ...sourceOf(short, m, depth - 1, seen)]
          : [];
        return {
          ...base,
          chain: ['A tended machine runs only while somebody works it.', ...also],
          fix: 'Hold E at it, or give somebody a bed and a job (K, People). Set it First so they come here before anything else.',
        };
      }
      case 'unpowered':
        return { ...base, chain: ['No grid reaches it.'], fix: 'Build a generator, or a power pole that reaches from one.' };
      case 'shed': {
        const net = powerFor(m.id);
        const chain = net ? [`Its grid makes ${fmt(net.gen)} kW and is asked for ${fmt(net.use)} kW.`] : [];
        return { ...base, chain, fix: 'Another generator, fuel for the ones you have, or switch something off.' };
      }
      default: return base;
    }
  }

  function powerFor(unitId) {
    const u = grid?.get?.(unitId);
    if (!u || u.net === -1) return null;
    return (grid.overview?.() || []).find(n => n.id === u.net) || null;
  }

  /**
   * R28 — WHAT A POOL IS REFUSING, NOT HOW HEAVY IT IS.
   *
   * "Store at 90%" was the plan's test and it was the wrong one: js/stores.js caps ONE material at a
   * quarter of a store and all raw materials at half of it (`roomFor`), so a Storage Box can turn the
   * drill's ore away while it reads 40% full, and a box full of planks nobody needs is no problem at
   * all. So the question is asked per material, for the things actually ARRIVING here — what the
   * drills routed to this pool dig, what the machines standing in it make, what the supply routes
   * into it carry — and the answer says which of the two lines it hit.
   */
  function inboundTo(poolId) {
    const out = new Set();
    for (const d of mining?.overview?.() || []) if (d.route?.to === poolId && d.resource) out.add(d.resource);
    for (const m of works?.all?.() || []) {
      if (poolOf(m)?.id !== poolId) continue;
      const r = works.recipes?.[m.queue?.[0]?.recipe];
      for (const k of Object.keys(r?.outputs || {})) out.add(k);
    }
    for (const l of logistics?.links || []) {
      if (l.to !== poolId) continue;
      for (const k of l.only || Object.keys(stores?.pool?.(l.from)?.totals || {})) out.add(k);
    }
    return out;
  }

  function refusing(p) {
    const pool = stores?.pool?.(p.id);
    if (!pool) return [];
    const out = [];
    for (const res of inboundTo(p.id)) {
      let room = 0, free = 0;
      for (const s of pool.members || []) {
        if (s.cap <= 0) continue;
        room += stores.roomFor?.(s, res) || 0;
        free += Math.max(0, (s.cap || 0) - Object.values(s.inv || {}).reduce((a, n) => a + n, 0));
      }
      if (room >= 1) continue;
      const accepts = (pool.members || []).some(s => stores.accepts?.(s, res));
      out.push({
        res, name: nameOf(res),
        why: !accepts ? 'nothing here can hold it'
          : free >= 1 ? 'at the line one material may fill (a quarter of a store; raw materials half)'
          : 'full',
      });
    }
    return out;
  }

  // ------------------------------------------------------------------ the lists the screen draws

  function machines() {
    return (works?.all?.() || []).map(m => {
      const d = diagnose(m.id);
      const r = rated(m);
      const job = m.queue?.[0];
      return {
        id: m.id, name: m.name, type: m.type, x: m.x, z: m.z,
        state: m.enabled === false ? 'off' : m.state, ok: d.ok, text: d.text, fix: d.fix, chain: d.chain,
        recipe: r?.recipeName || '', rated: r ? ratedText(m) : '',
        keep: job?.keep || 0, queued: m.queue?.length || 0,
        enabled: m.enabled !== false, priority: m.priority ?? 1,
      };
    }).sort((a, b) => (a.ok - b.ok) || a.name.localeCompare(b.name));
  }

  function drills() {
    return (mining?.overview?.() || []).map(d => ({
      ...d,
      ok: d.limit === 'digging',
      fix: d.limit === 'power' ? 'It needs a generator in reach.'
        : d.limit === 'seam' ? 'The seam is worked out. Move the drill, or wait for it to come back.'
        : d.limit === 'no route' ? 'Build a store it can reach, or press Re-route.'
        : d.limit === 'hauling' ? (d.route?.direct ? 'The pile is full and the store will not take more.'
          : `Its route walks ${d.route?.metres} m. A store or relay closer to it removes the trip.`)
        : '',
    }));
  }

  function power() {
    return (grid?.overview?.() || []).map(n => ({
      ...n,
      ok: (n.satisfaction ?? 1) >= 0.99,
      text: `${fmt(n.use)} kW wanted of ${fmt(n.gen)} kW made`
        + (n.store ? ` · battery ${Math.round(100 * (n.charge || 0) / n.store)}%` : '')
        + (n.shed?.length ? ` · shed: ${n.shed.join(', ')}` : ''),
    }));
  }

  /** Every pool, how full, its five biggest piles, and which nearby pool one relay would join it to. */
  function storage() {
    const rows = (stores?.overview?.() || []).filter(p => p.cap > 0 || p.load > 0);
    return rows.map(p => {
      const near = rows
        .filter(q => q.id !== p.id && Math.hypot(q.x - p.x, q.z - p.z) < 160)
        .map(q => ({ q, advice: stores.linkAdvice?.(p.id, q.id) }))
        .filter(a => a.advice && !a.advice.joined)
        .sort((a, b) => a.advice.gap - b.advice.gap)[0] || null;
      return {
        id: p.id, name: p.name, stores: p.stores, relays: p.relays, cap: p.cap, load: p.load,
        fraction: p.cap > 0 ? p.load / p.cap : 0,
        top: Object.entries(p.totals || {}).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => ({ res: k, name: nameOf(k), n })),
        join: near ? { to: near.q.id, toName: near.q.name, text: near.advice.text } : null,
        refusing: refusing(p),
      };
    });
  }

  function links() {
    const pools = stores?.pools?.() || [];
    const name = id => pools.find(p => p.id === id)?.name || 'a store';
    const loads = logistics?.pending?.() || [];
    return (logistics?.links || []).map(l => ({
      id: l.id, from: l.from, to: l.to, fromName: name(l.from), toName: name(l.to),
      only: l.only ? [...l.only] : null, keep: l.keep || 0, batch: l.batch,
      /**
       * R28 — THE OTHER FLOOR ON THE SAME PILE. A keep-in-stock order on a machine at the sending
       * end holds its line there too, and the route leaves the higher of the two behind
       * (js/logistics.js `runLinks`). Both numbers are shown side by side so nobody has to guess why
       * a route is not carrying the ingots off.
       */
      held: Object.keys(pools.find(p => p.id === l.from)?.totals || {})
        .map(res => ({ res, name: nameOf(res), line: works?.keepLine?.(l.from, res) || 0 }))
        .filter(x => x.line > 0 && (!l.only || l.only.includes(x.res))),
      materials: Object.keys(pools.find(p => p.id === l.from)?.totals || {}).map(res => ({ res, name: nameOf(res) })),
      onRoad: loads.filter(x => x.from === name(l.from) && x.to === name(l.to)),
    }));
  }

  // ------------------------------------------------------------------ alerts

  /** Everything wrong right now, unaged. `key` is stable across samples so `since` can age it. */
  function rawProblems() {
    const out = [];
    for (const m of works?.all?.() || []) {
      if (m.enabled === false || !m.queue?.length) continue;
      if (!['starved', 'blocked', 'unworked', 'unpowered', 'shed'].includes(m.state)) continue;
      out.push({ key: `m:${m.id}:${m.state}:${m.starvedFor || ''}`, kind: 'machine', id: m.id, level: m.state === 'unworked' ? 'warn' : 'bad', grace: MACHINE_GRACE });
    }
    for (const d of mining?.overview?.() || []) {
      if (d.limit === 'digging') continue;
      if (d.limit === 'hauling' && d.stock < 190) continue;     // route-limited but still moving is a number, not an alert
      out.push({ key: `d:${d.id}:${d.limit}`, kind: 'drill', id: d.id, level: 'warn', grace: MACHINE_GRACE });
    }
    for (const p of stores?.overview?.() || []) {
      if (!(p.cap > 0)) continue;
      // a pool turning away something that is on its way in is the alert; a heavy one is only a
      // warning when it is nearly full outright (no material line left to explain it)
      const refused = refusing(p);
      if (refused.length) out.push({ key: `s:${p.id}:${refused.map(r => r.res).join(',')}`, kind: 'store', id: p.id, level: 'warn', grace: 0, refused });
      else if (p.load / p.cap >= FULL_AT) out.push({ key: `s:${p.id}`, kind: 'store', id: p.id, level: 'warn', grace: 0, refused: [] });
    }
    for (const n of grid?.overview?.() || []) {
      if ((n.use || 0) > 0 && (n.satisfaction ?? 1) < 0.85) out.push({ key: `p:${n.id}`, kind: 'power', id: n.id, level: 'bad', grace: 3 });
    }
    for (const l of logistics?.pending?.() || []) {
      if (l.waiting) out.push({ key: `l:${l.id}`, kind: 'load', id: l.id, level: 'warn', grace: 0 });
    }
    return out;
  }

  /** The aged, worded list, worst first. */
  function alerts() {
    const out = [];
    const mrows = new Map((works?.all?.() || []).map(m => [m.id, m]));
    const drows = new Map((mining?.overview?.() || []).map(d => [d.id, d]));
    const srows = new Map((stores?.overview?.() || []).map(p => [p.id, p]));
    const prows = new Map((grid?.overview?.() || []).map(n => [n.id, n]));
    const lrows = new Map((logistics?.pending?.() || []).map(l => [l.id, l]));
    let drillRows = null;
    for (const p of rawProblems()) {
      const age = lastAt - (since.get(p.key) ?? lastAt);
      if (age < p.grace) continue;
      let text = '', fix = '', at = null;
      if (p.kind === 'machine') {
        const m = mrows.get(p.id); const d = diagnose(p.id);
        text = `${m.name}: ${d.text}.`; fix = d.fix; at = { x: m.x, z: m.z };
      } else if (p.kind === 'drill') {
        // R28 review — the drill table once per call, not once per drill alert
        const d = drows.get(p.id); const row = (drillRows || (drillRows = drills())).find(x => x.id === p.id);
        text = `${d.name} (${d.resourceName}): ${d.limit}.`; fix = row?.fix || '';
      } else if (p.kind === 'store') {
        const s = srows.get(p.id);
        const r = p.refused?.[0];
        text = r
          ? `${s.name} will take no more ${r.name.toLowerCase()} — ${r.why} (${Math.round(100 * s.load / s.cap)}% full).`
          : `${s.name} is ${Math.round(100 * s.load / s.cap)}% full.`;
        fix = 'Another box beside it raises every line; a supply route out carries the surplus away.';
        at = { x: s.x, z: s.z };
      } else if (p.kind === 'power') {
        const n = prows.get(p.id);
        text = `A grid is short: ${fmt(n.use)} kW wanted, ${fmt(n.gen)} kW made.`; fix = 'Another generator, or fuel for the ones you have.';
      } else if (p.kind === 'load') {
        const l = lrows.get(p.id);
        text = l.text + '.'; fix = 'Make room at the far end.';
      }
      out.push({ key: p.key, kind: p.kind, id: p.id, level: p.level, age: Math.round(age), text, fix, at });
    }
    const rank = { bad: 0, warn: 1 };
    return out.sort((a, b) => rank[a.level] - rank[b.level] || b.age - a.age);
  }

  function summary() {
    const ms = works?.all?.() || [];
    const a = alerts();
    return {
      machines: ms.length,
      running: ms.filter(m => m.state === 'running').length,
      stocked: ms.filter(m => m.state === 'stocked').length,
      drills: (mining?.overview?.() || []).length,
      alerts: a.length,
      bad: a.filter(x => x.level === 'bad').length,
      text: a.length ? `${a.length} thing${a.length === 1 ? '' : 's'} at your base need${a.length === 1 ? 's' : ''} you` : '',
    };
  }

  return {
    sample, measured, flows, rated, ratedText, diagnose, sourceOf,
    machines, drills, power, storage, links, alerts, summary,
    get samples() { return samples.length; },
    reset() { samples = []; since.clear(); },
  };
}
