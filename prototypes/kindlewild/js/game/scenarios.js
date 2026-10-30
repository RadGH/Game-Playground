// The smaller custom games. Each is a little rule set laid over the same world, attached to a session as s.run.
// PURE. A run offers: id, name, strip() (HUD line), goal() (chip text), panel(), collect() (Essence owed), state(),
// save() / load(o). s.finishRun({ won, title, text, score, label, essence }) ends it (modes.js).

import { ignite, BURN } from '../sim/world.js';

const TPS = 30;
const people = (sim) => sim.creatures.list.reduce((a, c) => a + (c.alive && c.sp.kind === 'person' ? 1 : 0), 0);
function essencePot(run) {
  run.owed = 0;
  run.collect = () => { const n = Math.floor(run.owed); run.owed -= n; return n; };
  return run;
}
const clock = (secs) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;

// ---------- Wildfire Watch ----------
export function attachWildfire(s, o) {
  const sim = s.sim, w = sim.world, M = w.M, D = s.data.gamemodes.wildfire[o.difficulty] || s.data.gamemodes.wildfire.fair;
  const rng = sim.rng;
  const treeCount = () => { let n = 0; for (let i = 0; i < w.N; i += 7) if (M.tree[w.mat[i]]) n++; return n; };
  const R = essencePot({ id: 'wildfire', name: 'Wildfire Watch', ticks: 0, fires: 0, start: 0, left: 1, next: 20 * TPS, gap: D.gap });
  function sparkFire() {
    // a burning tree, somewhere the wind can do something with it
    for (let k = 0; k < 120; k++) {
      const i = (rng() * w.N) | 0;
      if (!M.tree[w.mat[i]] || (w.flag[i] & BURN)) continue;
      const x = i % w.W, y = (i / w.W) | 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (w.inside(x + dx, y + dy)) ignite(w, (y + dy) * w.W + x + dx, true);
      const a = rng() * 6.283;
      w.wind.x = Math.cos(a); w.wind.y = Math.sin(a); w.wind.strength = 1 + Math.min(1.6, R.fires * 0.08);
      R.fires++;
      sim.fire('announce', { text: 'Smoke on the wind!', x, y });
      return;
    }
  }
  const prev = s.onStep;
  s.onStep = () => {
    prev?.(s);
    if (s.result) return;
    if (!R.start) { R.start = treeCount() || 1; }
    R.ticks++;
    if (--R.next <= 0) { sparkFire(); R.gap = Math.max(10, R.gap * 0.96); R.next = R.gap * TPS; }
    if (R.ticks % (30 * TPS) === 0) R.owed += 3 + R.ticks / (60 * TPS);
    if (sim.tick % 60 === 0) {
      R.left = treeCount() / R.start;
      const gone = sim.village.list.length && !sim.village.list.some(v => v.alive);
      if (gone || R.left < D.lose) s.finishRun({ won: false, title: gone ? 'The village is gone' : 'The forest is lost', text: `You held out for ${clock(R.ticks / TPS)} against ${R.fires} fires.`, score: Math.floor(R.ticks / TPS), label: clock(R.ticks / TPS), essence: 0 });
    }
  };
  Object.assign(R, {
    strip: () => `<span>Forest ${Math.round(R.left * 100)}%</span><span>Lost below ${Math.round(D.lose * 100)}%</span><span class="omen">${R.fires} fires</span>`,
    goal: () => `Save the forest · ${clock(R.ticks / TPS)}`,
    panel: () => ({ title: 'Wildfire Watch', rows: [`Forest left: ${Math.round(R.left * 100)}%. You lose below ${Math.round(D.lose * 100)}%, or if your village dies.`, `${R.fires} fires so far. They come faster and the wind gets stronger.`], tip: 'Rain puts fires out. Clearing a gap in the trees stops one in its tracks.' }),
    state: () => ({ type: 'wildfire', ticks: R.ticks, fires: R.fires, left: R.left }),
    save: () => ({ ticks: R.ticks, fires: R.fires, start: R.start, left: R.left, gap: R.gap, next: R.next, owed: R.owed }),
    load(q) { Object.assign(R, q); },
  });
  return R;
}

// ---------- Rising Tide ----------
export function attachFlood(s, o) {
  const sim = s.sim, w = sim.world, D = s.data.gamemodes.flood[o.difficulty] || s.data.gamemodes.flood.fair;
  const rng = sim.rng, W = w.W, H = w.H;
  const mat = o.liquid === 'lava' ? 'lava' : 'water';
  const R = essencePot({ id: 'flood', name: 'Rising Tide', surge: 0, next: 50 * TPS, ticks: 0 });
  function surge() {
    R.surge++;
    const side = (rng() * 4) | 0, reach = 0.35 + Math.min(0.5, R.surge * 0.04), t0 = rng() * (1 - reach);
    const n = (side < 2 ? W : H), a = Math.round(t0 * n), b = Math.round((t0 + reach) * n);
    const pts = side === 0 ? [[a, 3], [b, 3]] : side === 1 ? [[a, H - 4], [b, H - 4]] : side === 2 ? [[3, a], [3, b]] : [[W - 4, a], [W - 4, b]];
    const amount = Math.min(240, (120 + R.surge * 14) * D.size);
    for (let d = 0; d < 5 + Math.min(10, R.surge); d++) {
      const off = side === 0 ? [0, d] : side === 1 ? [0, -d] : side === 2 ? [d, 0] : [-d, 0];
      s.terrainOp({ op: 'line', at: [pts[0][0] + off[0], pts[0][1] + off[1]], to: [pts[1][0] + off[0], pts[1][1] + off[1]], r: 2, mat, amount });
    }
    R.owed += 4 + R.surge;
    sim.fire('announce', { text: `${mat === 'lava' ? 'Lava' : 'Water'} is pouring in! Surge ${R.surge}`, x: (pts[0][0] + pts[1][0]) / 2, y: (pts[0][1] + pts[1][1]) / 2 });
    if (R.surge >= D.win) R.last = true;
  }
  const prev = s.onStep;
  s.onStep = () => {
    prev?.(s);
    if (s.result) return;
    R.ticks++;
    if (!R.last && --R.next <= 0) { surge(); R.next = D.gap * TPS; }
    if (sim.tick % 60 === 0) {
      if (!people(sim)) s.finishRun({ won: false, title: 'No one is left', text: `Your people lasted ${R.surge} surges.`, score: R.surge, label: `${R.surge} surges`, essence: 0 });
      else if (R.last && R.ticks > 0 && (R.quiet = (R.quiet || 0) + 1) > 30) s.finishRun({ won: true, title: 'They are safe', text: `Your people came through all ${R.surge} surges.`, score: R.surge, label: `${R.surge} surges`, essence: 30 + R.surge * 4 });
    }
  };
  Object.assign(R, {
    strip: () => `<span>Surge ${R.surge}/${D.win}</span><span>People ${people(sim)}</span>` + (R.last ? '<span class="omen">Hold on...</span>' : `<span class="omen">Next in ${Math.ceil(R.next / TPS)}s</span>`),
    goal: () => `Keep your people alive · ${R.surge}/${D.win} surges`,
    panel: () => ({ title: 'Rising Tide', rows: [`Survive ${D.win} surges with at least one person alive. Each one is bigger.`], tip: 'Raise Earth makes a bank. Sinkholes swallow a flood. Move your people by hand if you must.' }),
    state: () => ({ type: 'flood', surge: R.surge, people: people(sim) }),
    save: () => ({ surge: R.surge, next: R.next, ticks: R.ticks, last: !!R.last, quiet: R.quiet || 0, owed: R.owed }),
    load(q) { Object.assign(R, q); },
  });
  return R;
}

// ---------- Cataclysm ----------
export function attachCataclysm(s, o) {
  const sim = s.sim, D = s.data.gamemodes.cataclysm[o.difficulty] || s.data.gamemodes.cataclysm.fair;
  const R = essencePot({ id: 'cataclysm', name: 'Cataclysm', left: D.secs * TPS, start: 0, now: 0 });
  s.mana.max = D.mana; s.mana.cur = D.mana; s.mana.regen = D.regen;
  const prev = s.onStep;
  s.onStep = () => {
    prev?.(s);
    if (s.result) return;
    if (!R.start) R.start = people(sim) || 1;
    R.left--;
    if (sim.tick % 15 === 0) R.now = people(sim);
    if (sim.tick % 15 === 0 && R.now === 0) { const secs = Math.floor(R.left / TPS); s.finishRun({ won: true, title: 'Nothing remains', text: `The kingdoms fell with ${clock(secs)} to spare.`, score: secs, label: `${clock(secs)} left`, essence: 40 + Math.floor(secs / 5) }); }
    else if (R.left <= 0) { const pct = Math.round((1 - R.now / R.start) * 100); s.finishRun({ won: false, title: 'They endured', text: `${R.now} people are still standing. You brought down ${pct}% of them.`, score: 0, label: `${pct}%`, essence: Math.floor(pct / 5) }); }
  };
  Object.assign(R, {
    strip: () => `<span>People left ${R.now}</span><span class="omen">${clock(Math.max(0, R.left / TPS))}</span>`,
    goal: () => `Bring them down · ${clock(Math.max(0, R.left / TPS))}`,
    panel: () => ({ title: 'Cataclysm', rows: [`Bring down every last person before the clock runs out. ${R.now} remain.`], tip: 'Wardens and mages fight back, and villages rebuild if you leave them be.' }),
    state: () => ({ type: 'cataclysm', left: R.left, people: R.now }),
    save: () => ({ left: R.left, start: R.start, now: R.now }),
    load(q) { Object.assign(R, q); },
  });
  return R;
}

// ---------- Wild Garden ----------
export function attachGarden(s) {
  const sim = s.sim, ladder = s.data.gamemodes.garden;
  const R = essencePot({ id: 'garden', name: 'Wild Garden', step: 0, kinds: 0, animals: 0, best: 0 });
  const count = () => {
    const seen = new Set();
    let n = 0;
    for (const c of sim.creatures.list) { if (!c.alive || c.sp.kind === 'person' || c.team === 'monster') continue; seen.add(c.sp.id); n++; }
    R.kinds = seen.size; R.animals = n;
  };
  const text = (g) => (g.species ? `${g.species} kinds alive at once` : `${g.animals} creatures in your garden`);
  const prev = s.onStep;
  s.onStep = () => {
    prev?.(s);
    if (s.result || sim.tick % 45) return;
    count();
    s.mana.regen = Math.min(8, 1 + R.kinds * 0.3 + R.animals * 0.01);
    const g = ladder[R.step];
    if (g && (g.species ? R.kinds >= g.species : R.animals >= g.animals)) {
      R.step++;
      const pay = 8 + R.step * 6;
      R.owed += pay;
      sim.fire('milestone', { text: text(g), essence: pay });
      if (R.step >= ladder.length) sim.fire('milestone', { text: 'Your garden is complete. Keep it going!', essence: 0 });
    }
  };
  Object.assign(R, {
    strip: () => `<span>Kinds ${R.kinds}</span><span>Creatures ${R.animals}</span>` + (ladder[R.step] ? `<span class="omen">Next: ${text(ladder[R.step])}</span>` : ''),
    goal: () => (ladder[R.step] ? text(ladder[R.step]) : 'Your garden is complete'),
    panel: () => ({ title: 'Wild Garden', rows: ladder.map((g, k) => `${k < R.step ? '✓' : '·'} ${text(g)}`), tip: 'Mana comes from living things. Grazers need grass, hunters need prey, and fish need water.' }),
    state: () => ({ type: 'garden', step: R.step, kinds: R.kinds, animals: R.animals }),
    save: () => ({ step: R.step, owed: R.owed }),
    load(q) { Object.assign(R, q); },
  });
  count();
  return R;
}
