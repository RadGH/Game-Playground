// Progress: population milestones and achievements. PURE, a sim system.
//
// Owner (2026-11-03): endless play; MILESTONES ARE POPULATION — each pays a chest of gold and goods
// and a unique LANDMARK to place. Special firsts (second town, first castle, first siege survived …)
// are achievements. Achievements are reported to the page as events; the page keeps them in the
// browser so they carry over to every world (and to the next landing after a defeat).

export function createProgress(sim, data) {
  const S = sim.state.progress ??= { reached: [], landmarks: [], got: [], counts: {} };
  const T = () => sim.state.town;
  const say = (text, kind, x, y) => sim.events.push({ t: 'say', text, kind, x, y });
  const achieve = id => {
    if (S.got.includes(id) || !data.achievements?.[id]) return;
    S.got.push(id);
    sim.events.push({ t: 'achieve', id, name: data.achievements[id].name, text: data.achievements[id].text });
  };

  function milestones() {
    const t = T(); if (!t?.towns?.length) return;
    const pop = t.people.length;
    for (const m of data.milestones || []) {
      if (pop < m.pop || S.reached.includes(m.pop)) continue;
      S.reached.push(m.pop);
      t.gold += m.gold;
      const keep = t.buildings.find(b => b.kind === 'keep' && b.state === 'up') || t.buildings.find(b => data.kinds[b.kind]?.kingdom && b.state === 'up');
      if (keep) for (const [g, n] of Object.entries(m.goods)) keep.store[g] = (keep.store[g] || 0) + n;
      if (m.landmark) S.landmarks.push(m.landmark);
      sim.events.push({ t: 'milestone', pop: m.pop, title: m.title, gold: m.gold, goods: m.goods, landmark: m.landmark ? data.kinds[m.landmark]?.name : null });
      say(`${m.pop} people! ${m.title}. A chest arrives${m.landmark ? ` and you may raise a ${data.kinds[m.landmark]?.name.toLowerCase()}` : ''}.`, 'good');
    }
    if (pop >= 1000) achieve('pop_1000');
  }

  function firsts() {
    const t = T(); if (!t) return;
    const kinds = data.kinds;
    if (t.buildings.some(b => kinds[b.kind]?.node && b.state === 'up')) achieve('first_mine');
    if (sim.state.routes?.list?.some(r => r.delivered > 0)) achieve('first_route');
    if ((t.towns?.length || 0) >= 2) achieve('second_town');
    if (sim.state.walls?.list?.length) achieve('first_walls');
    if (sim.state.walls?.list?.some(w => w.tier === 'thick')) achieve('castle');
    if (sim.state.military?.units?.some(u => u.side === 'guard')) achieve('first_guard');
    if (sim.state.rivals?.list?.some(r => r.stance === 'ally')) achieve('first_ally');
    if (sim.state.trains?.trains?.length || sim.state.trains?.list?.length) achieve('first_train');
    if (t.buildings.some(b => b.kind === 'manor' && b.state === 'up')) achieve('manor');
  }

  return {
    id: 'progress',
    step() {
      if (sim.tick % 100 === 61) { milestones(); firsts(); }
      // raids and sieges survived: the military system says when a raid's last raider is gone
      for (const e of sim.events) {
        if (e.t === 'attack') S.counts.raidOn = sim.tick;
        if (e.t === 'enemyDown' && e.kind === 'catapult') S.counts.catapultDown = true;
        if (e.t === 'power') achieve('first_power');
      }
      if (S.counts.raidOn && sim.tick - S.counts.raidOn > 600 && !(sim.state.military?.units || []).some(u => u.raid && u.side === 'enemy')) {
        S.counts.raidOn = 0;
        if (T()?.buildings?.some(b => b.kind === 'keep' && b.state === 'up')) achieve('raid_survived');
        if (S.counts.catapultDown) achieve('siege_survived');
      }
    },
    order(o) {
      if (o.t === 'landmark.place') {
        const i = S.landmarks.indexOf(o.kind);
        if (i < 0) return { error: 'Earn it at a population milestone first.' };
        const r = sim.order({ t: 'build', kind: o.kind, x: o.x, y: o.y, landmark: true });
        if (r && !r.error) S.landmarks.splice(i, 1);
        return r;
      }
      return null;
    },
    view() {
      const pop = T()?.people?.length || 0;
      const next = (data.milestones || []).find(m => !S.reached.includes(m.pop));
      return { reached: S.reached, next: next ? { pop: next.pop, title: next.title, landmark: data.kinds[next.landmark]?.name } : null, pop, landmarks: S.landmarks, got: S.got };
    },
  };
}
