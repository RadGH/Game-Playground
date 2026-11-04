// Rival kingdoms. PURE, a sim system.
//
// Owner (2026-11-03): a fixed small number (the New World setting, 2-4). Each starts with a ROLLED
// stance — a split of a few allies, a few neutrals, a few enemies — and an opinion of you from -100
// to +100. Gifts and trade raise it; pressing on their borders, refusing their demands or using
// powers on their land lower it. Crossing a threshold flips the stance (with a warning first).
// Allies trade (the only trade there is) and share roads and rails; enemies send armies with
// catapults and sappers and demand tribute. Rivals grow by the same rules you do.
//
// How a rival grows: its towns are LEDGERS — population, food, gold — stepped by the same kind of
// numbers the player's towns run on, and drawn on the map as REAL cells in the rival's own style (a
// keep, then rings of houses stamped as the population grows), so you can see them, and burn them.
// A full cell-level rival town (the player's town system with its own stock) is parked; see the
// README.

import { makeRng, subSeed } from '../planet/noise.js';
import { cells as blueprint } from './town/blueprints.js';

const NAMES_A = ['Ash', 'Bright', 'Cold', 'Dun', 'Elder', 'Fair', 'Grey', 'High', 'Iron', 'Long', 'Mar', 'North', 'Oak', 'Red', 'Salt', 'Thorn', 'West', 'Wold'];
const NAMES_B = ['mere', 'ford', 'holm', 'reach', 'gard', 'wick', 'stead', 'crag', 'dale', 'march', 'fell', 'moor'];
const STYLES = [
  { color: [0.75, 0.2, 0.2], roof: 'roof_tile', wall: 'wall_stone' },
  { color: [0.2, 0.45, 0.8], roof: 'roof_slate', wall: 'keepstone' },
  { color: [0.3, 0.65, 0.3], roof: 'roof_thatch', wall: 'wall_wood' },
  { color: [0.75, 0.6, 0.2], roof: 'roof_plank', wall: 'wall_stone' },
];

export function createRivals(sim, data) {
  const { M } = sim;
  const S = sim.state.rivals ??= { list: [], placed: false, caravans: [], market: { sell: {}, buy: {} }, nextId: 1 };
  const T = () => sim.state.town;
  const W = sim.W;
  const wrapX = x => ((x % W) + W) % W;
  const dist = (ax, ay, bx, by) => { let dx = Math.abs(ax - bx); if (dx > W / 2) dx = W - dx; return Math.hypot(dx, ay - by); };
  const say = (text, kind, x, y) => sim.events.push({ t: 'say', text, kind, x, y });
  const stanceOf = o => o >= 40 ? 'ally' : o <= -40 ? 'enemy' : 'neutral';
  const PRICES = { log: 2, stone: 2, plank: 4, iron_ore: 4, coal: 3, iron: 9, tools: 18, weapons: 22, grain: 2, flour: 3, bread: 5, ale: 6, wool: 3, cloth: 9, furniture: 20, jewelry: 45, gold_ore: 12, crystal: 15, berries: 2, fish: 2, game: 3, vegetables: 2 };

  // ------------------------------------------------------------------ placing rivals (once, after you land)
  function place() {
    const t = T(); if (!t?.towns?.length) return;
    const home = t.towns[0];
    const n = Math.max(0, Math.min(4, sim.settings?.rivals ?? 3));
    const r = makeRng(subSeed(sim.macro.seed, 'rivals'));
    const m = sim.macro;
    // candidate spots: good land far from you and from each other
    const cands = [];
    for (let i = 0; i < m.site.length; i++) if (m.site[i] > 0.45) cands.push(i);
    const spots = [];
    const minFromYou = Math.min(W / 4, 900), minApart = Math.min(W / 6, 600);
    for (let tries = 0; tries < 4000 && spots.length < n; tries++) {
      const i = cands[(r() * cands.length) | 0]; if (i == null) break;
      const x = (i % m.mw + 0.5) * m.macroCell, y = (Math.floor(i / m.mw) + 0.5) * m.macroCell;
      if (dist(x, y, home.x, home.y) < minFromYou) continue;
      if (spots.some(s => dist(s.x, s.y, x, y) < minApart)) continue;
      spots.push({ x, y });
    }
    // stances: a split (owner) — shuffle [ally, neutral, enemy, …] across the rivals
    const pool = ['enemy', 'ally', 'neutral', 'enemy'].slice(0, spots.length);
    for (let k = pool.length - 1; k > 0; k--) { const j = (r() * (k + 1)) | 0; [pool[k], pool[j]] = [pool[j], pool[k]]; }
    spots.forEach((s, k) => {
      const stance = pool[k];
      const opinion = stance === 'ally' ? 55 : stance === 'enemy' ? -55 : 0;
      const name = 'Kingdom of ' + NAMES_A[(r() * NAMES_A.length) | 0] + NAMES_B[(r() * NAMES_B.length) | 0];
      const rv = { id: S.nextId++, name, style: k % STYLES.length, stance, opinion, temper: ['proud', 'greedy', 'calm'][(r() * 3) | 0], gold: 300, army: 0, towns: [{ x: Math.round(s.x), y: Math.round(s.y), pop: 30 + ((r() * 40) | 0), rings: 0 }], next: { act: 2 + r() * 2, demand: 3 + r() * 3, caravan: 1 + r() } };
      S.list.push(rv);
      for (const town of rv.towns) drawTown(rv, town, true);
    });
    S.placed = true;
    if (S.list.length) say(`Your scouts hear of ${S.list.length} other kingdom${S.list.length > 1 ? 's' : ''}.`, 'info');
  }

  // ------------------------------------------------------------------ drawing a rival town as real cells
  function stampAt(kindDef, x, y, seed) {
    for (const p of blueprint(kindDef, M, seed)) {
      const at = sim.cell(x + p.dx, y + p.dy); if (!at) continue;
      const { c, i } = at;
      if (M.liquid[c.mat[i]] || c.part[i]) continue;
      c.mat[i] = p.mat; c.tall[i] = p.tall; c.ground[i] = p.ground ?? c.ground[i]; c.hp[i] = 255; c.part[i] = 0;
      c.dirty = true; sim.store.markEdited(c);
    }
  }
  /** Stamp the keep (first time) and enough rings of houses for the population. */
  function drawTown(rv, town, first) {
    const st = STYLES[rv.style];
    if (first) stampAt({ shape: 'keep', w: 10, h: 9, tall: 9, wall: st.wall === 'wall_wood' ? 'wall_stone' : st.wall }, town.x - 5, town.y - 4, rv.id * 31);
    const want = Math.min(6, Math.floor(town.pop / 40));
    while (town.rings < want) {
      town.rings++;
      const R = 10 + town.rings * 9, n = 6 + town.rings * 4;
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2 + town.rings;
        const x = Math.round(town.x + Math.cos(a) * R), y = Math.round(town.y + Math.sin(a) * R * 0.8);
        const big = town.rings > 3 && k % 3 === 0;
        stampAt({ shape: 'house', w: big ? 6 : 4, h: big ? 5 : 4, tall: big ? 5 : 3, roof: st.roof }, x, y, rv.id * 997 + k + town.rings * 61);
      }
      // a road out to each side
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let d = 6; d < R + 6; d++) { const at = sim.cell(town.x + ox * d, town.y + oy * d); if (at && !at.c.mat[at.i] && !M.liquid[at.c.mat[at.i]]) { at.c.ground[at.i] = M.id.road_dirt; at.c.dirty = true; sim.store.markEdited(at.c); } }
    }
  }

  // ------------------------------------------------------------------ opinion and stance
  function shift(rv, by, why) {
    const before = stanceOf(rv.opinion);
    rv.opinion = Math.max(-100, Math.min(100, rv.opinion + by));
    const after = stanceOf(rv.opinion);
    // a warning when close to a line
    if (!rv.warned && ((before === 'neutral' && rv.opinion <= -30) || (before === 'ally' && rv.opinion <= 50))) { rv.warned = true; say(`${rv.name} is losing patience with you${why ? ' (' + why + ')' : ''}.`, 'bad'); }
    if (after !== before) {
      rv.warned = false; rv.stance = after;
      if (after === 'enemy') say(`${rv.name} has turned against you!`, 'bad');
      else if (after === 'ally') { say(`${rv.name} offers an alliance.`, 'good'); shareRoad(rv); }
      else say(`${rv.name} is now neutral toward you.`, 'info');
    }
  }
  /** Allies share roads: a dirt road is laid between their capital and your nearest town. */
  function shareRoad(rv) {
    const t = T(); if (!t?.towns?.length || rv.road) return;
    const home = t.towns.slice().sort((a, b) => dist(a.x, a.y, rv.towns[0].x, rv.towns[0].y) - dist(b.x, b.y, rv.towns[0].x, rv.towns[0].y))[0];
    const res = sim.town.nav.findLong(home.x, home.y + 12, rv.towns[0].x, rv.towns[0].y + 10, { offroad: 1, maxNodes: 80000 });
    if (!res) return;
    const pts = res.path;
    for (let k = 0; k + 1 < pts.length; k++) sim.town.layRoad(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], 'dirt');
    rv.road = true;
    say(`A road now joins you to ${rv.name}.`, 'good');
  }

  // ------------------------------------------------------------------ the day
  function daily() {
    const t = T(); if (!t?.towns?.length) return;
    const day = sim.tick / sim.dayTicks;
    for (const rv of S.list) {
      // growth: the same shape as yours — more people when fed and calm, slower when at war
      for (const town of rv.towns) {
        const rate = 0.06 * (rv.stance === 'enemy' ? 0.8 : 1) * (rv.temper === 'greedy' ? 1.15 : 1);
        town.pop = Math.round(town.pop * (1 + rate) + 2);
        drawTown(rv, town, false);
      }
      rv.gold += Math.round(rv.towns.reduce((a, x) => a + x.pop, 0) * 0.4);
      rv.army = Math.round(rv.towns.reduce((a, x) => a + x.pop, 0) / 25);
      // a new town once the capital is big
      if (rv.towns.length < 4 && rv.towns[0].pop > 160 * rv.towns.length) {
        const a = sim.rng() * Math.PI * 2, d = 220 + sim.rng() * 160;
        const x = Math.round(rv.towns[0].x + Math.cos(a) * d), y = Math.round(Math.max(60, Math.min(sim.H - 60, rv.towns[0].y + Math.sin(a) * d)));
        const at = sim.cell(x, y);
        if (at && !sim.M.liquid[at.c.mat[at.i]] && sim.M.walk[at.c.ground[at.i]]) { const nt = { x, y, pop: 25, rings: 0 }; rv.towns.push(nt); drawTown(rv, nt, true); say(`${rv.name} founded a new town.`, 'info', x, y); }
      }
      // border pressure: your towns close to theirs annoy them
      for (const mine of t.towns) for (const theirs of rv.towns) if (dist(mine.x, mine.y, theirs.x, theirs.y) < 300) shift(rv, -3, 'your towns crowd their border');
      // enemies march, and everyone may demand
      if (rv.stance === 'enemy' && day >= rv.next.act) { march(rv); rv.next.act = day + 2.5 + sim.rng() * 2; }
      if (rv.stance !== 'ally' && day >= rv.next.demand && !rv.demand) {
        const want = Math.round(40 + t.gold * 0.15);
        rv.demand = { gold: want, until: sim.tick + sim.dayTicks };
        say(`${rv.name} demands ${want} gold.`, 'bad');
        rv.next.demand = day + 3 + sim.rng() * 4;
      }
      if (rv.demand && sim.tick > rv.demand.until) { rv.demand = null; shift(rv, -15, 'you ignored their demand'); }
      // a little drift back toward where their temper sits
      if (rv.temper === 'calm' && rv.opinion < 0) shift(rv, 1);
    }
  }
  /** An enemy army: soldiers, sappers and a catapult, aimed at your weakest point. */
  function march(rv) {
    const mil = sim.military; const t = T(); if (!mil || !t?.towns?.length) return;
    const home = t.towns[0];
    const from = rv.towns[0];
    const a = Math.atan2(from.y - home.y, ((from.x - home.x + W * 1.5) % W) - W / 2);
    const sx = home.x + Math.cos(a) * 120, sy = Math.max(30, Math.min(sim.H - 30, home.y + Math.sin(a) * 120));
    const n = Math.max(3, Math.min(30, rv.army));
    for (let k = 0; k < n; k++) mil.addUnit('enemy', k % 6 === 5 ? 'sapper' : 'soldier', sx + (k % 6), sy + Math.floor(k / 6), { home: { x: sx, y: sy }, raid: true, rival: rv.id, focus: { x: home.x, y: home.y, t: sim.tick } });
    if (n >= 8) mil.addUnit('enemy', 'catapult', sx, sy + 6, { home: { x: sx, y: sy }, raid: true, rival: rv.id, focus: { x: home.x, y: home.y, t: sim.tick } });
    sim.events.push({ t: 'warn', text: `${rv.name} marches on you with ${n} soldiers${n >= 8 ? ' and a catapult' : ''}!`, x: sx, y: sy, eta: 0 });
    sim.events.push({ t: 'attack', x: sx, y: sy });
  }

  // ------------------------------------------------------------------ trade with allies (caravans really walk)
  function stepCaravans() {
    const t = T(); if (!t?.towns?.length) return;
    const day = sim.tick / sim.dayTicks;
    for (const rv of S.list) {
      if (rv.stance !== 'ally' || day < rv.next.caravan) continue;
      rv.next.caravan = day + 0.8 + sim.rng() * 0.6;
      const home = t.towns.slice().sort((a, b) => dist(a.x, a.y, rv.towns[0].x, rv.towns[0].y) - dist(b.x, b.y, rv.towns[0].x, rv.towns[0].y))[0];
      const res = sim.town.nav.findLong(rv.towns[0].x, rv.towns[0].y + 10, home.x, home.y + 10, { offroad: 2, maxNodes: 80000 });
      if (!res) continue;
      S.caravans.push({ id: S.nextId++, rival: rv.id, path: res.path, pi: 0, x: rv.towns[0].x, y: rv.towns[0].y + 10, town: home.id, back: false });
    }
    for (const c of S.caravans) {
      const tgt = c.path[c.pi]; if (!tgt) { arrive(c); continue; }
      let dx = tgt[0] + 0.5 - c.x; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
      const dy = tgt[1] + 0.5 - c.y, d = Math.hypot(dx, dy), spd = 0.12;
      if (d <= spd) { c.x = wrapX(tgt[0] + 0.5); c.y = tgt[1] + 0.5; c.pi++; } else { c.x = wrapX(c.x + dx / d * spd); c.y += dy / d * spd; }
    }
    S.caravans = S.caravans.filter(c => !c.done);
  }
  /** At your town: sell what you set to sell (above the amount to keep), buy what you asked for. */
  function arrive(c) {
    if (c.back) { c.done = true; return; }
    const rv = S.list.find(r => r.id === c.rival); const t = T();
    const keep = t.buildings.find(b => b.kind === 'keep' && b.town === c.town && b.state === 'up');
    if (!rv || !keep) { c.done = true; return; }
    let earned = 0, spent = 0, lines = [];
    const stock = sim.town.stock();
    for (const [g, keepAbove] of Object.entries(S.market.sell)) {
      const spare = Math.min(40, Math.max(0, (stock[g] || 0) - keepAbove)); if (!spare) continue;
      let left = spare;
      for (const b of t.buildings) { if (!left) break; if (b.state === 'up' && data.kinds[b.kind].kingdom && (b.store[g] || 0) > 0) { const k = Math.min(left, b.store[g]); b.store[g] -= k; left -= k; } }
      const n = spare - left, price = Math.round(n * (PRICES[g] || 2) * 0.9);
      earned += price; if (n) lines.push(`sold ${n} ${g.replace('_', ' ')}`);
    }
    for (const [g, want] of Object.entries(S.market.buy)) {
      const n = Math.min(30, Math.max(0, want - (stock[g] || 0))); if (!n) continue;
      const price = Math.round(n * (PRICES[g] || 2) * 1.2);
      if (t.gold + earned - spent < price) continue;
      keep.store[g] = (keep.store[g] || 0) + n; spent += price; lines.push(`bought ${n} ${g.replace('_', ' ')}`);
    }
    t.gold += earned - spent;
    if (lines.length) { say(`A caravan from ${rv.name} ${lines.join(', ')}.`, 'good', keep.x, keep.y); shift(rv, 2); }
    c.back = true; c.path = c.path.slice().reverse(); c.pi = 0;
  }

  // ------------------------------------------------------------------ the system
  function step() {
    if (!S.placed && sim.state.town?.towns?.length && sim.tick % 20 === 0) place();
    if (!S.placed) return;
    if (sim.tick % sim.dayTicks === sim.dayTicks - 3) daily();
    stepCaravans();
  }
  function order(o) {
    const rv = S.list.find(r => r.id === o.rival);
    const t = T();
    if (o.t === 'gift' && rv) { const g = Math.min(t.gold, o.gold ?? 50); if (g <= 0) return { error: 'No gold to give.' }; t.gold -= g; rv.gold += g; shift(rv, Math.round(g / 5)); return { opinion: rv.opinion }; }
    if (o.t === 'tribute' && rv?.demand) {
      if (o.pay) { if (t.gold < rv.demand.gold) return { error: 'Not enough gold.' }; t.gold -= rv.demand.gold; rv.gold += rv.demand.gold; shift(rv, 12); }
      else shift(rv, -20, 'you refused their demand');
      rv.demand = null; return { opinion: rv.opinion };
    }
    if (o.t === 'market') { S.market = { sell: o.sell || {}, buy: o.buy || {} }; return true; }
    if (o.t === 'rival.hurt' && rv) { shift(rv, -(o.by ?? 25), o.why || 'you attacked their land'); return { opinion: rv.opinion }; }
    return null;
  }
  /** Did something happen on a rival's land? (powers ask, to sour them) */
  function ownerAt(x, y) { for (const rv of S.list) for (const town of rv.towns) if (dist(x, y, town.x, town.y) < 30 + town.rings * 10) return rv; return null; }
  function view(rect) {
    return {
      list: S.list.map(r => ({ id: r.id, name: r.name, stance: r.stance, opinion: r.opinion, temper: r.temper, pop: r.towns.reduce((a, x) => a + x.pop, 0), towns: r.towns.map(x => [x.x, x.y, x.pop]), army: r.army, color: STYLES[r.style].color, demand: r.demand ? r.demand.gold : null, road: !!r.road })),
      caravans: S.caravans.map(c => [c.x, c.y]),
      market: S.market, prices: PRICES,
    };
  }
  return { id: 'rivals', step, order, view, ownerAt, shift: (id, by, why) => { const rv = S.list.find(r => r.id === id); if (rv) shift(rv, by, why); } };
}
