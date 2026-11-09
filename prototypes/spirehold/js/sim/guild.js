// Spirehold — the adventurers' guild: parties who turn up, the quest board, quests that run in real time.
// Pure: `now` (ms since 1970) is always passed in.

import { CLASSES, RACES, TRAITS, NAME_PARTS, QUEST_KINDS, LENGTHS, RELICS, RANK_NAMES } from './data.js';
import { rng, hash } from './rand.js';
import { advPower, advXpNeed, questOdds, questReward, bon, touch, TUNE } from './rules.js';

const MIN = 60_000;
export const rosterCap = G => 6 + Math.round(bon(G, 'roster'));
export const boardSize = G => 3 + Math.round(bon(G, 'boards'));
export const isFree = (a, now) => !a.dead && !a.busy && (a.injuredUntil || 0) <= now;
export const fame = G => 1 + Math.floor(G.city.level / 2) + Math.floor((G.city.landmarks.tavern || 0) / 3) + Math.max(0, (G.guild.bestRank ?? -1) + 1);

export function makeAdventurer(G, r, lvl, cls = null) {
  const id = ++G.guild.seq;
  const race = r.pick(Object.keys(RACES)); const c = cls || r.pick(Object.keys(CLASSES));
  return { id, name: `${r.pick(NAME_PARTS.first)} ${r.pick(NAME_PARTS.last)}`, race, cls: c, lvl: Math.max(1, lvl), xp: 0, trait: r.pick(Object.keys(TRAITS)), quests: 0, wins: 0, injuredUntil: 0, busy: null, dead: false, party: null, look: r.int(1e6) };
}
/** A party walks in. Usually a front-liner and a healer, then whatever else. */
export function makeParty(G, now, seed) {
  const r = rng(hash('party', G.seed, seed));
  const size = 3 + r.int(3);
  const lvl = fame(G) + Math.round((r() - 0.4) * 3) + Math.floor((G.city.landmarks.tavern || 0) * 0.3);
  const roles = { tank: ['fighter', 'paladin', 'barbarian'], heal: ['cleric', 'druid', 'bard'], dmg: ['ranger', 'wizard', 'warlock', 'monk'], skill: ['rogue'] };
  const picks = [r.pick(roles.tank), r.pick(roles.heal)]; while (picks.length < size) picks.push(r.pick([...roles.dmg, ...roles.skill, ...roles.dmg]));
  const name = `The ${r.pick(NAME_PARTS.partyA)} ${r.pick(NAME_PARTS.partyB)}`;
  const members = picks.map(c => { const a = makeAdventurer(G, r, lvl + r.int(3) - 1, c); a.party = name; return a; });
  return { id: 'p' + seed, name, members, arrived: now, leaveAt: now + 20 * MIN };
}
export const hireCost = a => Math.round(40 * Math.pow(1.38, a.lvl - 1) * (a.trait === 'greedy' ? 1.2 : 1));

// ---------------------------------------------------------------- quest board
export function makeQuest(G, seed, rank) {
  const r = rng(hash('quest', G.seed, seed));
  const kinds = QUEST_KINDS.filter(k => (k.minRank || 0) <= rank);
  const K = r.pick(kinds); const place = r.pick(K.places);
  return { id: 'q' + seed, kind: K.id, title: r.pick(K.title).replace('{place}', place), place, rank, needs: K.needs.slice(), foe: K.foe };
}
export function fillBoard(G, now) {
  const g = G.guild; const best = g.bestRank ?? -1; const top = Math.min(9, best + 2);
  while (g.board.length < boardSize(G)) {
    const i = g.board.length; const seed = (g.qseq = (g.qseq || 0) + 1);
    // a spread: one safe, one at your level, one a stretch, then random
    const rank = Math.max(0, Math.min(top, i === 0 ? best - 1 : i === 1 ? best : i === 2 ? top : best - 2 + (seed % 4)));
    let q = makeQuest(G, seed, rank);
    for (let k = 1; k < 6 && g.board.some(b => b.title === q.title); k++) q = makeQuest(G, seed + k * 1000, rank);
    g.board.push(q);
  }
}
export function refreshBoard(G, now) { G.guild.board = []; G.guild.boardAt = now; fillBoard(G, now); }
export const rerollCost = G => Math.round(20 * Math.pow(1.6, Math.max(0, (G.guild.bestRank ?? -1) + 1)));

/** The best party for a quest from who is free: add whoever helps the odds most, up to five. */
export function suggestParty(G, quest, now, len = LENGTHS[0]) {
  const free = G.guild.roster.filter(a => isFree(a, now));
  const party = [];
  let cur = 0;
  while (party.length < 5) {
    let best = null, bo = cur;
    for (const a of free) { if (party.includes(a)) continue; const o = questOdds(G, { ...quest, lengthOdds: lenOdds(len) }, [...party, a]).odds; if (o > bo + 0.004) { bo = o; best = a; } }
    if (!best) break; party.push(best); cur = bo;
  }
  return party;
}
export const lenOdds = len => ({ short: 0, half: 0.02, long: 0.04, epic: 0.06 }[len.id] || 0);
export function questDuration(G, len, party) {
  const swift = party.filter(a => a.trait === 'swift').length * 0.1;
  return Math.round(len.secs * 1000 * Math.max(0.4, 1 - bon(G, 'questSpeed') - swift));
}

export function sendQuest(G, questId, lengthId, advIds, now) {
  const g = G.guild; const qi = g.board.findIndex(q => q.id === questId); if (qi < 0) return 'That quest is gone.';
  const len = LENGTHS.find(l => l.id === lengthId) || LENGTHS[0];
  const party = advIds.map(id => g.roster.find(a => a.id === id)).filter(Boolean);
  if (!party.length) return 'Pick at least one adventurer.';
  if (party.some(a => !isFree(a, now))) return 'Someone in that party is not free.';
  const q = g.board[qi];
  const { odds } = questOdds(G, { ...q, lengthOdds: lenOdds(len) }, party);
  const reward = questReward(G, q, len);
  const job = { id: 'j' + (g.qseq = (g.qseq || 0) + 1), quest: q, len: len.id, party: party.map(a => a.id), start: now, end: now + questDuration(G, len, party), odds, reward, seed: hash(q.id, now) };
  for (const a of party) a.busy = job.id;
  g.active.push(job); g.board.splice(qi, 1); fillBoard(G, now);
  return null;
}
/** Call the party home early: no reward, nobody hurt. */
export function recallQuest(G, jobId) {
  const g = G.guild; const i = g.active.findIndex(j => j.id === jobId); if (i < 0) return;
  const job = g.active[i]; for (const id of job.party) { const a = g.roster.find(x => x.id === id); if (a) a.busy = null; }
  g.active.splice(i, 1);
}

// ---------------------------------------------------------------- results
const LINES = {
  tank: ['{n} held the line against {foe}.', '{n} took a blow meant for a friend and laughed it off.', '{n} kicked down the door and walked in first.'],
  heal: ['{n} kept everyone on their feet through the worst of it.', '{n} sang the fear out of the room.', '{n} patched up three wounds by lantern light.'],
  dmg: ['{n} landed the blow that ended it.', '{n} felled two of {foe} before they could shout.', '{n} lit the dark with a terrible spell.'],
  skill: ['{n} found the hidden door nobody else saw.', '{n} spotted the pit trap a step too late — and still got out.', '{n} picked the lock in under a minute.'],
};
const WIN = ['The {party} came home with full packs.', 'Bells rang as {party} rode back through the gate.', 'The {party} returned, tired and rich.'];
const LOSE = ['{foe} proved too much. The {party} limped home with nothing.', 'The {party} turned back at the last door, empty-handed.', 'Nothing to show for it but bruises.'];

export function story(job, party, won, r) {
  const out = [];
  const pick = role => party.find(a => CLASSES[a.cls].role === role);
  for (const role of ['tank', 'skill', 'heal', 'dmg']) { const a = pick(role); if (a && r() < 0.8) out.push(r.pick(LINES[role]).replace('{n}', `${a.name} the ${CLASSES[a.cls].name}`).replace('{foe}', job.quest.foe)); }
  const pname = party[0]?.party || 'party';
  out.push(r.pick(won ? WIN : LOSE).replace('{party}', pname.replace(/^The /, '')).replace('{foe}', cap(job.quest.foe)));
  return out;
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

export function rollRelic(G, rank, r, luck = 0) {
  const roll = r() + luck * 0.15;
  const rar = roll > 0.985 - rank * 0.004 && rank >= 6 ? 4 : roll > 0.9 - rank * 0.02 && rank >= 3 ? 3 : roll > 0.65 - rank * 0.03 && rank >= 1 ? 2 : 1;
  const pool = Object.keys(RELICS).filter(id => RELICS[id].rar === rar);
  return r.pick(pool);
}

/** Resolve every quest whose time is up. Returns the reports (also pushed to the guild log and G.news). */
export function resolveQuests(G, now) {
  const g = G.guild; const done = g.active.filter(j => j.end <= now); if (!done.length) return [];
  const reports = [];
  for (const job of done) {
    g.active.splice(g.active.indexOf(job), 1);
    const r = rng(job.seed);
    const party = job.party.map(id => g.roster.find(a => a.id === id)).filter(Boolean);
    for (const a of party) a.busy = null;
    const won = r() < job.odds;
    const rep = { at: job.end, title: job.quest.title, rank: job.quest.rank, won, party: party.map(a => a.name), lines: story(job, party, won, r), gold: 0, lore: 0, shards: 0, relic: null, hurt: [], fell: [], levels: [] };
    G.totals.quests++;
    const safe = Math.min(0.9, bon(G, 'safe'));
    if (won) {
      G.totals.questsWon++;
      const greed = 1 + party.filter(a => a.trait === 'greedy').length * 0.15 + party.reduce((s, a) => s + (RACES[a.race].bonus.gold || 0), 0);
      const scholar = 1 + party.filter(a => a.trait === 'scholar').length * 0.2;
      rep.gold = Math.round(job.reward.gold * greed); rep.lore = Math.round(job.reward.lore * scholar); rep.shards = job.reward.shards;
      G.gold += rep.gold; G.lore += rep.lore; G.shards += rep.shards; G.totals.gold += rep.gold; G.totals.lore += rep.lore;
      const luck = party.filter(a => a.trait === 'lucky').length + party.reduce((s, a) => s + (RACES[a.race].bonus.luck || 0) * 5, 0);
      if (r() < job.reward.relic * (1 + luck * 0.3)) { const id = rollRelic(G, job.quest.rank, r, luck); G.relics[id] = (G.relics[id] || 0) + 1; rep.relic = id; touch(G); }
      g.bestRank = Math.max(g.bestRank ?? -1, job.quest.rank);
      for (const a of party) { a.wins++; if (r() < 0.08 * (a.trait === 'reckless' ? 1.5 : 1) * (1 - safe)) { a.injuredUntil = now + 4 * MIN; rep.hurt.push(a.name); } }
    } else {
      for (const a of party) {
        const tr = TRAITS[a.trait] || {};
        const hurtP = 0.5 * (1 + (tr.hurt || 0)) * (tr.safe ? 1 - tr.safe : 1) * (1 - safe);
        if (r() < hurtP) { a.injuredUntil = now + Math.max(3 * MIN, (job.end - job.start) * 0.35) * Math.max(0.3, 1 - bon(G, 'healFast')); rep.hurt.push(a.name); }
        if (job.odds < 0.3 && job.quest.rank >= 3 && r() < 0.12 * (tr.safe ? 1 - tr.safe : 1) * (1 - safe)) { a.dead = true; a.fellAt = job.end; a.fellOn = job.quest.title; g.fallen.push({ ...a }); rep.fell.push(a.name); }
      }
      g.roster = g.roster.filter(a => !a.dead);
    }
    const xp = Math.round(job.reward.xp * (won ? 1 : 0.3) * (1 + bon(G, 'advXp')));
    for (const a of party) {
      if (a.dead) continue; a.quests++; a.xp += xp;
      while (a.xp >= advXpNeed(a.lvl)) { a.xp -= advXpNeed(a.lvl); a.lvl++; rep.levels.push(`${a.name} reached level ${a.lvl}`); }
    }
    g.log.unshift(rep); if (g.log.length > 60) g.log.length = 60;
    G.news.push({ k: 'quest', rep });
    reports.push(rep);
  }
  return reports;
}

// ---------------------------------------------------------------- the clock
export function stepGuild(G, now) {
  const g = G.guild;
  if (!g.board.length) fillBoard(G, now);
  if (now - (g.boardAt || 0) > 30 * MIN) { g.boardAt = now; g.board = g.board.slice(0, 0); fillBoard(G, now); }
  // visitors leave when their time is up; new ones walk in
  g.visitors = g.visitors.filter(p => p.leaveAt > now && p.members.length);
  if (now >= g.nextVisitAt) {
    const r = rng(hash('visit', G.seed, g.nextVisitAt));
    if (g.visitors.length < 2) { const p = makeParty(G, now, g.nextVisitAt); g.visitors.push(p); G.news.push({ k: 'party', name: p.name, n: p.members.length }); }
    const gap = 4 * MIN / (1 + (G.city.landmarks.tavern || 0) * 0.08 + bon(G, 'tavern') * 0);
    g.nextVisitAt = Math.max(now, g.nextVisitAt) + gap * (0.7 + r() * 0.6);
  }
  return resolveQuests(G, now);
}
export function hire(G, partyId, advId) {
  const g = G.guild; const p = g.visitors.find(v => v.id === partyId); if (!p) return 'They have gone.';
  const list = advId == null ? p.members.slice() : p.members.filter(a => a.id === advId);
  const cost = list.reduce((s, a) => s + hireCost(a), 0);
  if (G.gold < cost) return 'Not enough gold.';
  if (g.roster.length + list.length > rosterCap(G)) return 'The barracks are full. Let someone go or research Bigger Barracks.';
  G.gold -= cost;
  for (const a of list) { g.roster.push(a); p.members.splice(p.members.indexOf(a), 1); }
  if (!p.members.length) g.visitors.splice(g.visitors.indexOf(p), 1);
  return null;
}
export function dismiss(G, advId) { const g = G.guild; const a = g.roster.find(x => x.id === advId); if (!a || a.busy) return; g.roster.splice(g.roster.indexOf(a), 1); }
export const reviveCost = a => 10 + a.lvl * 4;
export function revive(G, advId) {
  const g = G.guild; const i = g.fallen.findIndex(a => a.id === advId); if (i < 0) return 'Not found.';
  const a = g.fallen[i]; const c = reviveCost(a); if (G.shards < c) return 'Not enough starshards.';
  if (g.roster.length >= rosterCap(G)) return 'The barracks are full.';
  G.shards -= c; g.fallen.splice(i, 1); g.roster.push({ ...a, dead: false, injuredUntil: 0, busy: null }); return null;
}
export const relicLevelCost = lv => Math.round(6 * Math.pow(1.7, lv));
export { RANK_NAMES, LENGTHS };
