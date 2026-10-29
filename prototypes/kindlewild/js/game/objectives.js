// Goals and stars for a challenge level. PURE. Each goal is either a WIN goal (must be completed:
// kill, grow, survive, dragon) or a KEEP goal (must never break: protect houses, keep people
// alive, keep lava out of a zone). Stars are extra conditions read at the end.
//
// level.goals: [{ type, ...params, text }]
//   kill    { tags|team|species, pct|count, by: [causes], within: secs }
//   grow    { species, count }
//   survive { secs }
//   dragon  { species? }              the dragon (or every one of `species`) is dead or has fled
//   protect { what: 'houses', min }   keep at least `min` houses standing
//   people  { min }                   keep at least `min` people alive
//   contain { material, zone: [x, y, r] }   none of that material may enter the zone
//   extinguish { secs }               no fire left on the map (checked from `secs` on)
// level.stars: [{ type: 'win' | 'housesLostMax' | 'peopleLostMax' | 'manaUsedMax' | 'timeMax' |
//                       'castsMax' | 'killedBy' | 'aliveMin', ...params, text }]
// level.timeLimit: secs — if win goals are not done by then, the level is lost (failText)

const TPS = 30;

export function createObjectives(s, level) {
  const sim = s.sim, w = sim.world, M = w.M;
  const goals = (level.goals || []).map((g) => ({ ...g, done: false, failed: false, progress: 0 }));
  const deaths = [];
  let peopleLost = 0;
  const startHouses = () => sim.village.housesStanding();
  let housesAtStart = null;
  let firstTick = true;
  sim.on('death', (e) => {
    deaths.push({ species: e.species, tags: e.tags, team: e.team, cause: e.cause, by: e.by, t: s.stats.ticks });
    if (e.c?.sp?.kind === 'person' && e.team === 'village') peopleLost++;
  });
  const matches = (g, sp, tags, team) => {
    if (g.species && !(Array.isArray(g.species) ? g.species : [g.species]).includes(sp)) return false;
    if (g.team && team !== g.team) return false;
    if (g.tags && !g.tags.some(t => tags.has ? tags.has(t) : tags.includes(t))) return false;
    return true;
  };
  function countAlive(g) {
    let n = 0;
    for (const c of sim.creatures.list) if (c.alive && matches(g, c.sp.id, c.sp.tags, c.team)) n++;
    return n;
  }
  function killsOf(g) {
    let n = 0;
    for (const d of deaths) {
      if (!matches(g, d.species, d.tags, d.team)) continue;
      if (d.cause === 'age' || d.cause === 'dawn') continue;
      if (g.by && !g.by.includes(d.by) && !g.by.includes(d.cause)) continue;
      if (g.within && d.t > g.within * TPS) continue;
      n++;
    }
    return n;
  }
  function allDeathsOf(g) { let n = 0; for (const d of deaths) if (matches(g, d.species, d.tags, d.team)) n++; return n; }
  function zoneHas(mat, [zx, zy, zr]) {
    const m = M.id[mat];
    for (let y = Math.max(0, zy - zr); y <= Math.min(w.H - 1, zy + zr); y += 1) for (let x = Math.max(0, zx - zr); x <= Math.min(w.W - 1, zx + zr); x += 1) {
      if ((x - zx) ** 2 + (y - zy) ** 2 > zr * zr) continue;
      if (w.mat[y * w.W + x] === m) return true;
    }
    return false;
  }

  const O = { goals, deaths };
  const startCount = {};   // for 'destroy': how much of the material was in the zone at the start
  const countIn = (mat, [zx, zy, zr]) => {
    const m = M.id[mat]; let n = 0;
    for (let y = Math.max(0, zy - zr); y <= Math.min(w.H - 1, zy + zr); y++) for (let x = Math.max(0, zx - zr); x <= Math.min(w.W - 1, zx + zr); x++) {
      if ((x - zx) ** 2 + (y - zy) ** 2 <= zr * zr && w.mat[y * w.W + x] === m) n++;
    }
    return n;
  };
  O.peopleLost = () => peopleLost;
  O.housesLost = () => Math.max(0, (housesAtStart ?? 0) - sim.village.housesStanding());

  O.update = function () {
    if (s.result) return;
    if (firstTick) { housesAtStart = startHouses(); firstTick = false; }
    const t = s.stats.ticks / TPS;
    for (const g of goals) {
      switch (g.type) {
        case 'kill': {
          const killed = killsOf(g);
          const total = g.count ?? Math.max(1, Math.ceil((countAlive(g) + allDeathsOf(g)) * (g.pct ?? 1)));
          g.progress = Math.min(1, killed / total);
          g.label = `${Math.min(killed, total)}/${total}`;
          if (killed >= total) g.done = true;
          break;
        }
        case 'grow': {
          const n = sim.creatures.counts[g.species] || 0;
          g.progress = Math.min(1, n / g.count);
          g.label = `${n} / ${g.count}`;
          if (n >= g.count) g.done = true;
          break;
        }
        case 'survive':
          g.progress = Math.min(1, t / g.secs);
          g.label = `${Math.max(0, Math.ceil(g.secs - t))}s`;
          if (t >= g.secs) g.done = true;
          break;
        case 'dragon': {
          // species: which boss (default the ashwing); two of them = both must be gone
          const sp = g.species || 'dragon';
          const alive = (sim.creatures.counts[sp] || 0) > 0;
          const seen = deaths.some(d => d.species === sp) || g.fled;
          g.done = !alive && (seen || g.fled);
          let hp = 0, max = 0;
          for (const c of sim.creatures.list) if (c.alive && c.sp.id === sp) { hp += c.hp; max += c.maxHp; }
          g.pool = Math.max(g.pool || 0, max);
          g.progress = max ? 1 - hp / g.pool : g.done ? 1 : 0;
          g.label = max ? `${Math.round(g.progress * 100)}%` : g.done ? 'gone' : '';
          break;
        }
        case 'protect': {
          const n = sim.village.housesStanding();
          g.progress = Math.min(1, n / Math.max(1, g.min));
          g.label = `${n} standing`;
          if (n < g.min) g.failed = true;
          break;
        }
        case 'people': {
          let n = 0;
          for (const c of sim.creatures.list) if (c.alive && c.sp.kind === 'person' && c.team === 'village') n++;
          g.progress = Math.min(1, n / Math.max(1, g.min));
          g.label = `${n} alive`;
          if (n < g.min) g.failed = true;
          break;
        }
        case 'contain':
          if (s.stats.ticks % 30 === 0 && zoneHas(g.material, g.zone)) g.failed = true;
          g.progress = g.failed ? 0 : 1;
          g.label = g.failed ? 'breached' : 'safe';
          break;
        case 'reach': {
          // travellers (spawned with this tag) who get inside the zone are safe and leave the map
          g.arrived = g.arrived || 0;
          const [zx, zy, zr] = g.zone;
          let left = 0;
          for (const c of sim.creatures.list) {
            if (!c.alive || c.tag !== g.tag) continue;
            if ((c.x - zx) ** 2 + (c.y - zy) ** 2 < zr * zr) { c.alive = false; sim.creatures.counts[c.sp.id]--; g.arrived++; sim.fire('arrived', { c, x: c.x, y: c.y }); }
            else left++;
          }
          g.progress = Math.min(1, g.arrived / g.count);
          g.label = `${g.arrived}/${g.count}`;
          if (g.arrived >= g.count) g.done = true;
          else if (t > 2 && left + g.arrived < g.count && !g.waiting) g.failed = true;
          break;
        }
        case 'guard': {
          let n = 0;
          for (const c of sim.creatures.list) if (c.alive && matches(g, c.sp.id, c.sp.tags, c.team) && (!g.tag || c.tag === g.tag)) n++;
          g.progress = Math.min(1, n / Math.max(1, g.min));
          g.label = `${n} left`;
          if (n < g.min && t > 1) g.failed = true;
          break;
        }
        case 'destroy': {
          const key = g.material + g.zone.join(',');
          if (startCount[key] == null) startCount[key] = countIn(g.material, g.zone);
          const now = countIn(g.material, g.zone), was = Math.max(1, startCount[key]);
          g.progress = Math.min(1, (was - now) / (was * (g.pct ?? 0.8)));
          g.label = `${Math.round(100 * (was - now) / was)}%`;
          if (g.progress >= 1) g.done = true;
          break;
        }
        case 'extinguish':
          g.progress = t < (g.secs ?? 0) ? 0 : w.stats.burning === 0 ? 1 : 0;
          if (t >= (g.secs ?? 0) && w.stats.burning === 0) g.done = true;
          g.label = `${w.stats.burning} burning`;
          break;
      }
    }
    const win = goals.filter(g => ['kill', 'grow', 'survive', 'dragon', 'extinguish', 'reach', 'destroy'].includes(g.type));
    const failed = goals.find(g => g.failed);
    if (failed) { finish(false, failed.failText || 'Failed: ' + failed.text); return; }
    if (level.timeLimit && t >= level.timeLimit && !win.every(g => g.done)) { finish(false, level.failText || 'Out of time'); return; }
    if (win.length && win.every(g => g.done)) finish(true);
  };

  sim.on('fled', (e) => { for (const g of goals) if (g.type === 'dragon' && (e.species || 'dragon') === (g.species || 'dragon') && !(sim.creatures.counts[g.species || 'dragon'] > 0)) g.fled = true; });

  function finish(won, reason) {
    const stars = [];
    if (won) {
      for (const st of level.stars || [{ type: 'win' }]) stars.push(starMet(st));
    }
    s.result = { won, reason: reason || (won ? 'Done' : 'Failed'), stars, starCount: stars.filter(Boolean).length, secs: s.stats.ticks / TPS, manaUsed: Math.round(s.stats.manaUsed) };
    sim.fire('result', s.result);
  }
  O.finish = finish;

  function starMet(st) {
    const t = s.stats.ticks / TPS;
    switch (st.type) {
      case 'win': return true;
      case 'housesLostMax': return O.housesLost() <= st.n;
      case 'peopleLostMax': return peopleLost <= st.n;
      case 'manaUsedMax': return s.stats.manaUsed <= st.n;
      case 'timeMax': return t <= st.secs;
      case 'castsMax': return (s.stats.casts[st.spell] || 0) <= st.n;
      case 'killedBy': { const g = { ...st, by: st.by }; return killsOf(g) >= (st.count ?? 1); }
      case 'reachedMin': return (goals.find(g => g.type === 'reach')?.arrived || 0) >= st.n;
      case 'aliveMin': return (sim.creatures.counts[st.species] || 0) >= st.n;
      default: return false;
    }
  }

  O.status = function () {
    return goals.map(g => ({ text: g.text, short: g.short, type: g.type, done: g.done, failed: g.failed, progress: g.progress, label: g.label, keep: ['protect', 'people', 'contain', 'guard'].includes(g.type) }));
  };
  O.starsPreview = () => (level.stars || []).map(st => ({ text: st.text, met: s.result ? null : starMet(st) }));
  return O;
}
