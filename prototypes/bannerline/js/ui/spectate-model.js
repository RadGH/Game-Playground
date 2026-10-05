// Spectator mode, the part with no DOM (so node tests can run it beside a live sim): who can be
// followed, in what order F walks through them, and the numbers the spectator panel shows for each
// side. Everything here READS the sim's state and never writes to it — the spectator must not change
// the match (tests/spectate.test.js runs an AI-vs-AI match with and without these calls every tick
// and compares the state hashes).
//
//   linewarChars(state, data)        heroes, in F order: blue 1, red 1, blue 2, red 2, ...
//   linewarTeams(state, data)        per side: name + stat rows + its heroes
//   hvfChars(q)                      farmers and hunters, in F order (alternating sides)
//   hvfTeams(q)                      per side: farmer gold / income / hidden-ness, hunter level / kills / finds
//   nextChar(list, id, dir)          the next (dir 1) or previous (dir -1) character after `id`
//   unionBits(a, b)                  two packed vision bitsets OR'd together (the "both sides" fog)
//   FOG_MODES                        the fog choices the HvF spectator cycles through

import * as HQ from '../sim/modes/hvf/query.js';

export const LW_TEAM_NAMES = ['Blue banner', 'Red banner'];
export const FOG_MODES = [
  { id: 'farmers', label: 'Farmers’ fog', short: 'Farmers' },
  { id: 'hunters', label: 'Hunters’ fog', short: 'Hunters' },
  { id: 'both', label: 'Fog neither side sees', short: 'Both' },
  { id: 'off', label: 'No fog', short: 'Off' },
];

const r0 = (v) => Math.round(v || 0);
const r1 = (v) => (Math.round((v || 0) * 10) / 10).toFixed(1);

/** Alternate the sides: [a0, b0, a1, b1, ...] so F switches team on every press. */
function interleave(a, b) {
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) out.push(a[i]); if (b[i]) out.push(b[i]); }
  return out;
}

export function nextChar(list, id, dir = 1) {
  if (!list.length) return null;
  const i = list.findIndex((c) => c.id === id);
  if (i < 0) return (dir > 0 ? list[0] : list[list.length - 1]).id;
  return list[(i + dir + list.length) % list.length].id;
}

// ── Line War ─────────────────────────────────────────────────────────────────────────────────────

export function linewarChars(state, data) {
  const side = (t) => state.players.filter((p) => p.team === t).map((p) => {
    const e = state.ents.find((x) => x.id === p.heroEnt);
    const hero = data.heroes?.heroes?.[p.hero]?.name || p.hero;
    return { id: p.heroEnt, pid: p.id ?? state.players.indexOf(p), team: p.team, name: `${p.name} · ${hero}`, short: hero, alive: !!e && e.alive !== false };
  });
  return interleave(side(0), side(1));
}

export function linewarTeams(state, data) {
  const chars = linewarChars(state, data);
  return state.teams.map((t) => {
    const ps = state.players.filter((p) => p.team === t.id);
    const pids = new Set(ps.map((p) => state.players.indexOf(p)));
    let army = 0;
    for (const e of state.ents) if (e.kind === 'unit' && e.alive !== false && !e._gone && pids.has(e.owner)) army++;
    const gold = ps.reduce((a, p) => a + (p.gold || 0), 0), income = ps.reduce((a, p) => a + (p.income || 0), 0);
    const field = state.fields?.[t.field];
    return {
      team: t.id, name: LW_TEAM_NAMES[t.id] || `Side ${t.id + 1}`,
      stats: [
        ['Banners', `${Math.max(0, Math.ceil(t.banners))} / ${t.bannersMax}`, 'Banners left on this side’s Keep'],
        ['Gold', r0(gold), 'Gold in hand, all players on the side'],
        ['Income', `+${r0(income)}`, 'Gold paid every 10 s'],
        ['Army', army, 'This side’s units on the map right now'],
        ['At the gate', field ? field.waiting.length : 0, 'Enemy units waiting to walk into this side’s full field'],
      ],
      chars: chars.filter((c) => c.team === t.id).map((c) => {
        const p = state.players[c.pid];
        return { ...c, sub: `Lv ${p.level} · ${r0(p.gold)}g · +${r0(p.income)}${c.alive ? '' : ' · down'}` };
      }),
    };
  });
}

// ── Hunters vs Farmers ───────────────────────────────────────────────────────────────────────────

export function hvfChars(q) {
  const s = q.state;
  const side = (role) => s.players.filter((p) => p.role === role).map((p) => {
    const pid = s.players.indexOf(p), e = s.ents.find((x) => x.id === p.ent);
    return { id: p.ent, pid, team: p.team, role, name: p.name, short: p.name, alive: !!e && e.alive && !p.ghost && !p.out, colour: p.colour };
  });
  return interleave(side('farmer'), side('hunter'));
}

export function hvfTeams(q) {
  const s = q.state;
  const chars = hvfChars(q);
  // farmers
  let gold = 0, income = 0, animals = 0, strays = 0, buildings = 0, army = 0, hidden = 0, up = 0, lost = 0;
  const farmerRows = [];
  for (const c of chars.filter((x) => x.role === 'farmer')) {
    const fi = HQ.farmerInfo(q, c.pid), p = s.players[c.pid];
    gold += fi.gold; income += fi.income; strays += fi.strays; lost += p.stats?.animalsLost || 0;
    for (const n of Object.values(fi.animals)) animals += n;
    for (const n of Object.values(fi.buildings)) buildings += n;
    const seen = !!fi.ent && fi.ent.alive && HQ.visibleEnt(q, HQ.HUNTERS, fi.ent);
    if (!fi.ghost) { up++; if (!seen) hidden++; }
    farmerRows.push({ ...c, seen, sub: `${r0(fi.gold)}g · +${r1(fi.income)}/s · ${fi.ghost ? 'down' : seen ? 'SEEN' : 'hidden'}` });
  }
  for (const e of s.ents) if (e.kind === 'army' && e.alive && !e._gone) army++;
  const found = HQ.seenBuildings(q, HQ.HUNTERS).length;
  // hunters
  let kills = 0, wards = 0, lodges = 0, levels = 0, nh = 0;
  const hunterRows = [];
  for (const c of chars.filter((x) => x.role === 'hunter')) {
    const hi = HQ.hunterInfo(q, c.pid), p = s.players[c.pid];
    kills += p.stats?.kills || 0; wards += hi.wards.length; lodges += hi.lodges.length; levels += hi.level; nh++;
    hunterRows.push({ ...c, sub: `Lv ${hi.level} · ${p.stats?.kills || 0} kills · ${hi.out ? 'out' : hi.alive ? 'hunting' : `back in ${Math.ceil(hi.respawnIn)} s`}` });
  }
  const clk = HQ.clock(q);
  return [
    { team: HQ.FARMERS, name: 'Farmers', stats: [
      ['Hidden', `${hidden} / ${up}`, 'Farmers on their feet that no hunter can see right now'],
      ['Gold', r0(gold), 'Gold in hand, every farmer'],
      ['Income', `+${r1(income)}/s`, 'Gold per second, every farmer'],
      ['Animals', `${animals}${strays ? ` (${strays} strays)` : ''}`, 'Animals alive; strays wander far and leave tracks'],
      ['Buildings', buildings, 'Farm buildings standing'],
      ['Army', army, 'Scarecrows and crow flocks'],
    ], chars: farmerRows },
    { team: HQ.HUNTERS, name: 'Hunters', stats: [
      ['Farms found', `${found} / ${buildings}`, 'Farm buildings the hunters have seen at least once'],
      ['Kills', kills, 'Farmers caught'],
      ['Animals taken', lost, 'Farm animals the hunters killed'],
      ['Level', nh ? r1(levels / nh) : '-', 'Average hunter level'],
      ['Watchstones', wards, 'Watchstones planted'],
      ['Lodges', lodges, 'Lodges standing (respawn points)'],
      [clk.released ? 'Loose' : 'Released in', clk.released ? 'yes' : `${Math.ceil(clk.releaseIn)} s`, 'The hunters wait in the kennel during the head start'],
    ], chars: hunterRows },
  ];
}

/** Two packed bitsets (32 cells per int) OR'd: the cells at least one side sees / has seen. */
export function unionBits(a, b) {
  const n = Math.max(a.length, b.length), out = new Int32Array(n);
  for (let i = 0; i < n; i++) out[i] = (a[i] | 0) | (b[i] | 0);
  return out;
}
