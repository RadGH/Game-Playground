// Info cards for the build and other menus: what a building / tool / power is, and its numbers.
// PURE (no DOM): the page turns a card into a hover tooltip or a tap-to-read sheet (js/ui/infotip.js),
// node tests read it directly. Every number is worked out from the same data the sim reads
// (buildings*.json, military.json, buildings-faith.json), so a card can never disagree with the game.
// The words come from data/about.json.
//
//   kindCard(id, data, about)   → { title, text, stats: [[label, value]], notes: [] }
//   toolCard(id, data, about)   → same shape, for the Lines / Transport tools
//   powerCard(id, data, size)   → same shape, for a ruler power at one size (0, 1, 2)
//   cardHtml(card, esc)         → the HTML the tooltip and the sheet both show

const TICKS = 20;                 // sim ticks a second (js/sim/sim.js TICKS_PER_SEC)
const BEAUTY_REACH = 30;          // js/sim/town/town.js beautyAt
const NEED_WORD = { water: 'a well', market: 'a market', faith: 'a church', tavern: 'a tavern', health: 'a healer' };
const LEVEL_NAMES = ['tent', 'hut', 'cottage', 'house', 'townhouse', 'manor'];

const n1 = v => (Math.round(v * 10) / 10).toString();
const secs = s => s >= 60 ? `${n1(s / 60)} min` : `${n1(s)} s`;
const goodName = (data, g) => (data.goods?.[g]?.name || g).toLowerCase();
const icon = (data, g) => data.goods?.[g]?.icon || '';
/** "🪵 14 · 🪨 6" (or "free"). */
export function costText(data, cost) {
  const parts = Object.entries(cost || {}).filter(([, n]) => n > 0).map(([g, n]) => `${icon(data, g)} ${n} ${goodName(data, g)}`);
  return parts.length ? parts.join(' · ') : 'free';
}
const bag = (data, o) => Object.entries(o || {}).map(([g, n]) => `${n} ${goodName(data, g)}`).join(' + ');
const list = words => words.length < 2 ? words.join('') : words.slice(0, -1).join(', ') + ' and ' + words.at(-1);

/** The card for a building kind. */
export function kindCard(id, data, about = {}) {
  const k = data.kinds?.[id];
  if (!k) return null;
  const stats = [], notes = [];
  const add = (label, value) => stats.push([label, value]);
  add('Cost', costText(data, k.cost));
  if (k.work) add('Build work', `${k.work} builder-seconds`);
  if (k.w && k.h) add('Size', `${k.w} × ${k.h} m`);

  // homes
  if (k.houses) add(k.home ? 'Houses' : 'Also houses', `${k.houses} people`);
  if (k.home) {
    const lv = k.level ?? LEVEL_NAMES.indexOf(id);
    const need = data.homes?.needs?.[id] || {};
    const wants = [...(need.cover || []).map(c => NEED_WORD[c] || c)];
    if (need.food) wants.push(`${need.food} kind${need.food > 1 ? 's' : ''} of food`);
    if (need.goods) wants.push(...Object.keys(need.goods).map(g => goodName(data, g)));
    if (need.safety) wants.push('safe streets');
    add('Home level', `${lv + 1} of ${LEVEL_NAMES.length}`);
    add('Tax', `up to ${(data.town?.taxPerHomeLevel ?? 2) * (lv + 1)} gold a day (normal taxes, all needs met)`);
    if (wants.length) add('Needs', list(wants));
    if (need.goods) add('Uses each day', Object.entries(need.goods).map(([g, n]) => `${n} ${goodName(data, g)}`).join(', ') + ' per household');
    const next = LEVEL_NAMES[lv + 1];
    if (next && data.kinds[next]) notes.push(`Grows into a ${data.kinds[next].name.toLowerCase()} (${data.kinds[next].houses} people) when its needs are met. Homes are built by the town; this one jumps the queue.`);
  }

  // work
  const j = k.job;
  if (j) {
    if (j.workers) add('Workers', String(j.workers));
    if (j.kind === 'craft') {
      add('Turns', `${bag(data, j.in)} → ${bag(data, j.out)}`);
      add('Each batch', secs(j.secs));
      const outN = Object.values(j.out || {}).reduce((a, b) => a + b, 0);
      add('Up to', `${n1(outN / j.secs * 60 * (j.workers || 1))} ${list(Object.keys(j.out).map(g => goodName(data, g)))} a minute (all workers)`);
    } else if (j.makes) {
      add('Makes', `${j.per} ${goodName(data, j.makes)} each trip (${secs(j.secs)} of work)`);
      add('Up to', `${n1(j.per / j.secs * 60 * (j.workers || 1))} ${goodName(data, j.makes)} a minute, not counting the walk`);
      if (j.kind === 'mine') notes.push('A richer seam (more stars) digs more each trip.');
    }
    if (j.radius) add(j.kind === 'firefight' ? 'Reach' : 'Work area', `${j.radius} m around it`);
    if (j.regrow) add('Crop regrows', `about ${secs(j.regrow / TICKS)} after harvest`);
  }
  if (k.storage) add(k.kingdom ? 'Stores' : k.depot ? 'Holds' : 'Own store', `${k.storage} goods${k.kingdom ? ' for the whole kingdom' : ''}`);

  // where it can go
  if (k.node) notes.push(`Must sit on a found ${k.node === 'granite' ? 'granite' : k.node} seam. Seams are found by scanning around towns and outposts, and by scouts.`);
  if (k.nearWater) notes.push('Must be built by water.');
  if (k.nearRock) notes.push('Must be built near rock.');
  if (k.depot) notes.push('Goods from mines near it wait here until a route carries them home.');

  // services, beauty, faith
  for (const [need, r] of Object.entries(k.cover || {})) add(`${about.covers?.[need] || need} reach`, `${r} m`);
  if (k.beauty) add('Beauty', `+${k.beauty} to homes within ${BEAUTY_REACH} m (less further out)`);
  if (k.faith) {
    add('Faith', `${k.faith.rate} a minute for each content person in reach`);
    add('Reach', `${k.faith.reach} m (homes in reach count as having a church)`);
    add('Faith store', `+${k.faith.cap}`);
  }
  if (k.scan) add('Scans', `resources within ${k.scan} m`);
  if (k.settlers) add('Settlers', `${k.settlers} people arrive to start it`);

  // military
  if (k.barracks) add('Guards', `+${k.barracks} to the town's guard limit`);
  if (typeof k.post === 'number') { add('Guards', `${k.post} stationed here`); add('Watches', `about ${Math.round((data.garrison?.wardR ?? 45) * 0.8)} m around it`); }
  const tw = k.tower && data.towers?.[k.tower];
  if (tw) {
    if (tw.shield) {
      add('Dome', `${tw.shield} m radius`);
      add('Soaks up', `${tw.absorb} damage, then recharges ${n1(tw.recharge)} a second`);
    } else {
      add('Damage', `${tw.dmg} every ${n1(tw.cd)} s (${n1(tw.dmg / tw.cd)} a second)`);
      add('Range', tw.minRange ? `${tw.minRange}–${tw.range} m` : `${tw.range} m`);
      if (tw.chain) add('Chains', `to ${tw.chain} enemies`);
      if (tw.pierce) add('Pierces', `${tw.pierce} enemies in a line`);
      if (tw.splash) add('Splash', `${tw.splash} m`);
      if (tw.burn) add('Burns', 'sets enemies alight');
      if (tw.bonusVs?.length) add('Strong against', list(tw.bonusVs));
      if (tw.crew) add('Crew', tw.crew === 'any' ? 'one guard' : `one ${tw.crew}${tw.bonus ? ` (×${tw.bonus} damage up high)` : ''}`);
    }
  }
  if (id === 'mage_guild' && data.guards?.mage) { const g = data.guards.mage; add('Mage', `${g.hp} health, ${g.dmg} damage every ${g.cd} s, range ${g.range} m, wage ${g.wage} gold a day`); }

  if (k.auto && !k.home) notes.push('Your town builds these on its own when it needs one. Placing one yourself jumps the queue.');
  if (k.landmark) notes.push('Earned through your kingdom\'s progress. One of a kind.');
  return { title: k.name, text: about.kinds?.[id] || '', stats, notes };
}

/** The card for a Lines / Transport tool. */
export function toolCard(id, data, about = {}) {
  const stats = [], add = (l, v) => stats.push([l, v]);
  let title = id;
  const roads = { dirt: ['Dirt path', 'free'], gravel: ['Gravel road', '1 stone per 8 m'], stone: ['Paved road', '2 stone per 8 m'] };
  if (roads[id]) { title = roads[id][0]; add('Cost', roads[id][1]); }
  const wall = { wall_wood: 'wood', wall_stone: 'stone' }[id];
  if (wall) {
    const t = data.walls?.tiers?.[wall]; const W = data.walls || {};
    title = t?.name || id;
    if (t) {
      add('Cost', `${costText(data, t.cost)} a metre`);
      add('Height', `${t.tall} m`);
      add('Strength', `${t.hp} per metre`);
      add('Blows', t.melee >= 1 ? 'swords and claws hurt it fully' : `swords and claws do only ${Math.round(t.melee * 100)}%; blasts do full damage`);
    }
    if (W.towerEvery) add('Towers', `at corners and every ${W.towerEvery} m (archers stand on them)`);
    if (W.repairEvery) add('Repairs', 'free, once no enemy is near');
  }
  if (id === 'firebreak') { title = 'Firebreak'; add('Cost', 'free'); }
  if (id === 'track' && data.rail) {
    title = 'Track';
    add('Cost', `${costText(data, data.rail.cost)} per ${data.rail.per} m`);
  }
  if (id === 'flag') {
    title = '⚑ Attack flag';
    add('Cost', 'free');
    add('Flags', 'up to 3 at once');
    const G = data.garrison;
    if (G) add('Guards', `each town keeps ${G.base} + 1 per ${G.per} people + ${G.barracks} per barracks`);
    if (G?.levy) add('At war', `+${Math.round(G.levy * 100)}% of the town called up, recruited ${G.warRecruit ?? 4}× faster`);
    if (G?.keepHome) add('Stay home', `${Math.round(G.keepHome * 100)}% of guards keep watch`);
  }
  if (id === 'settler' && data.settler) {
    const s = data.settler;
    title = 'Settler wagon';
    add('Cost', `🪙 ${s.gold} gold`);
    add('Takes', `${s.people} people and ${bag(data, s.cargo)} from the nearest town`);
    add('Distance', `at least ${s.minGap} m from any town`);
  }
  return { title, text: about.tools?.[id] || '', stats, notes: [] };
}

/** The card for a ruler power at one size (0 small, 1 medium, 2 large). */
export function powerCard(id, data, size = 1) {
  const p = data.powers?.[id]; if (!p) return null;
  const at = v => Array.isArray(v) ? v[size] : v;
  const stats = [], add = (l, v) => stats.push([l, v]);
  const sizes = ['Small', 'Medium', 'Large'];
  add('Faith', `${at(p.cost)} (${sizes[size].toLowerCase()})`);
  if (p.r) add('Radius', `${at(p.r)} m`);
  if (p.dmg) add('Damage', String(at(p.dmg)));
  if (p.hit) add('Damage', String(at(p.hit)));
  if (p.bolts) add('Bolts', String(at(p.bolts)));
  if (p.chain) add('Jumps', `to ${at(p.chain)} enemies`);
  if (p.freeze) add('Freezes', `enemies for ${at(p.freeze)} s`);
  if (p.crater) add('Crater', `${at(p.crater)} m`);
  if (p.secs) add('Lasts', `${at(p.secs)} s`);
  if (p.power && !p.dmg) add('Force', String(at(p.power)));
  return { title: `${p.icon || ''} ${p.name}`.trim(), text: p.about || '', stats, notes: ['Bigger sizes cost more faith. Powers have no cooldown.'] };
}

/** HTML for a card. `esc` escapes text. */
export function cardHtml(card, esc = s => String(s)) {
  if (!card) return '';
  const rows = card.stats.map(([l, v]) => `<div class="tip-row"><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join('');
  return `<div class="tip-title">${esc(card.title)}</div>${card.text ? `<div class="info-text">${esc(card.text)}</div>` : ''}${rows ? `<hr>${rows}` : ''}${card.notes.length ? `<hr>${card.notes.map(t => `<div class="tip-sub">${esc(t)}</div>`).join('')}` : ''}`;
}
