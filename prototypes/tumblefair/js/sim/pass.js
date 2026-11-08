// The Fair Pass (Expansion 1, M7): a sticker book, a fairgoer level and a daily challenge — something to work toward
// between matches that never changes how anyone plays (rewards are costumes, name-plate colours and coins, and coins
// only buy costumes). Pure: data in (data/stickers.json + data/pass.json), numbers out; the server keeps the state on
// the player's profile (js/sim/profiles.js `progress`), the room only reports what really happened (createPassMatch).
//
// State on a profile:  p.pass = { v, xp, st: { stat: count }, got: { stickerId: time }, daily: { day, id, n, done }, plate }
//
// STATS — every lifetime count a sticker or a daily challenge may name, and who writes it (createPassMatch below):
//   games, wins, coopWins, bossWins, trickyBeaten, cpuBeaten     a minigame ended (room endGame)
//   wins_<kind>                                                   a minigame won, per kind in js/games/tags.js
//   games_<season>, wins_<season>, matches_<season>               the same while a holiday is on (seasons.js ids)
//   matches, matchWins, teamWins, done_<mode>, quickDone, againDone   a match finished (room finish)
//   jackpots, mirrors, spins, ribbonsBought, ducks, duelsWon, cannon, bells, mud, shellFinds, shares   board events
//   dailies                                                       daily challenges finished
//   distinct, rated                                               worked out from the profile's "My games" list
// Match values (a sticker rule `{ match, n }`): tickets (most held at once), ribbons, wins, games, people (people — not
// CPUs — playing in it).
import { kindsOf } from '../games/tags.js';

export const PASS_V = 1;
export const newPass = () => ({ v: PASS_V, xp: 0, st: {}, got: {}, daily: null, plate: 'plain' });

/** Level from total XP: level L -> L+1 costs first + step*(L-1); `max` is the top. -> { level, into, need, max } */
export function levelOf(xp, L) {
  let level = 1, left = Math.max(0, Math.floor(xp || 0));
  while (level < L.max) {
    const need = L.first + L.step * (level - 1);
    if (left < need) return { level, into: left, need, max: false };
    left -= need; level++;
  }
  return { level, into: 0, need: 0, max: true };
}
/** Total XP needed to reach `level`. */
export function xpFor(level, L) { let t = 0; for (let l = 1; l < Math.min(level, L.max); l++) t += L.first + L.step * (l - 1); return t; }

/** The day a challenge belongs to: the UTC date, so every server and phone agrees. */
export const dayKey = t => new Date(t).toISOString().slice(0, 10);
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** Today's challenge: the same for everyone on the same day, from the date alone. */
export function dailyFor(day, list) {
  if (!list?.length) return null;
  const i = hash('tumblefair-daily:' + day) % list.length;
  // never the same challenge two days running (when there is a choice)
  const prev = new Date(Date.parse(day + 'T00:00:00Z') - 86400e3).toISOString().slice(0, 10);
  const j = hash('tumblefair-daily:' + prev) % list.length;
  return list[i === j && list.length > 1 ? (i + 1) % list.length : i];
}

/** Less XP for a minigame that was over in a few seconds (everyone dropped, a fluke) — never less than shortFloor. */
export function shortFactor(seconds, X) {
  if (!(seconds >= 0)) return 1;
  return Math.max(X.shortFloor, Math.min(1, seconds / X.shortSeconds));
}

/** Stats worked out from the profile instead of counted: different minigames played, minigames rated. */
export function derived(games) {
  const g = games || {};
  return { distinct: Object.values(g).filter(x => (x.n || 0) > 0).length, rated: Object.values(g).filter(x => x.v).length };
}
export function ruleValue(rule, st, match, der) {
  if (rule.match) return +(match?.[rule.match] || 0);
  return +((der && rule.stat in der ? der[rule.stat] : st?.[rule.stat]) || 0);
}
export const meets = (rule, st, match, der) => ruleValue(rule, st, match, der) >= rule.n;

/**
 * Apply what just happened to a pass. Mutates `pass`.
 *   delta: { add: { stat: n }, match: { key: value } (this player's values in the current match), xp }
 *   ctx:   { now, season (the room's holiday or null), stickers, data (pass.json), games (profile "My games") }
 * -> { xp, stickers: [ids], level, levelUp: [levels reached], rewards: [rows], coins, daily: id finished now | null }
 */
export function applyProgress(pass, delta, ctx) {
  const { add = {}, match = null } = delta || {}, X = ctx.data.xp, L = ctx.data.levels;
  const out = { xp: Math.max(0, Math.round(delta?.xp || 0)), stickers: [], levelUp: [], rewards: [], coins: 0, daily: null };
  for (const [k, n] of Object.entries(add)) if (n > 0) pass.st[k] = (pass.st[k] || 0) + n;
  // the daily challenge: counts only what happens on its own day
  const day = dayKey(ctx.now);
  if (!pass.daily || pass.daily.day !== day) { const c = dailyFor(day, ctx.data.daily); pass.daily = c ? { day, id: c.id, n: 0, done: false } : null; }
  const ch = pass.daily && ctx.data.daily.find(c => c.id === pass.daily.id);
  if (ch && !pass.daily.done) {
    if (ch.rule.stat && add[ch.rule.stat] > 0) pass.daily.n += add[ch.rule.stat];
    if (ch.rule.match && match) pass.daily.n = Math.max(pass.daily.n, +(match[ch.rule.match] || 0));
    pass.daily.n = Math.min(pass.daily.n, ch.rule.n);
    if (pass.daily.n >= ch.rule.n) { pass.daily.done = true; out.daily = ch.id; out.coins += ch.coins || 0; out.xp += X.daily; pass.st.dailies = (pass.st.dailies || 0) + 1; }
  }
  // stickers (a holiday one only while that holiday is on)
  const der = derived(ctx.games);
  for (const s of ctx.stickers) {
    if (pass.got[s.id] || (s.season && s.season !== ctx.season)) continue;
    if (meets(s.rule, pass.st, match, der)) { pass.got[s.id] = ctx.now; out.stickers.push(s.id); out.xp += X.sticker; }
  }
  // XP, levels and what they unlock
  const before = levelOf(pass.xp, L).level;
  pass.xp += out.xp;
  const after = levelOf(pass.xp, L).level;
  for (let l = before + 1; l <= after; l++) { out.levelUp.push(l); for (const r of ctx.data.rewards) if (r.level === l) { out.rewards.push(r); if (r.coins) out.coins += r.coins; } }
  out.level = after;
  return out;
}
/** Anything worth telling the player about? */
export const noteworthy = o => !!o && (o.xp > 0 || o.stickers.length > 0 || o.levelUp.length > 0 || !!o.daily);

/** What the owner's phone is told (inside `me` and every `pass` message). */
export function passView(pass, { now, data, games }) {
  const p = pass || newPass(), lv = levelOf(p.xp, data.levels), day = dayKey(now);
  let daily = p.daily && p.daily.day === day ? { ...p.daily } : null;
  if (!daily) { const c = dailyFor(day, data.daily); daily = c ? { day, id: c.id, n: 0, done: false } : null; }
  return { xp: p.xp, level: lv.level, into: lv.into, need: lv.need, max: lv.max, got: { ...p.got }, st: { ...p.st, ...derived(games) }, daily, plate: plateOk(p, p.plate, data) ? p.plate : 'plain' };
}
/** May this pass wear this name-plate colour? */
export function plateOk(pass, id, data) { const pl = data.plates.find(x => x.id === id); return !!pl && levelOf(pass?.xp || 0, data.levels).level >= pl.level; }
/** The small public part shown on the player's chip: level and plate. */
export function badge(pass, data) {
  if (!pass) return { lv: 1 };
  const lv = levelOf(pass.xp, data.levels).level, plate = pass.plate && pass.plate !== 'plain' && plateOk(pass, pass.plate, data) ? pass.plate : null;
  return plate ? { lv, plate } : { lv };
}
/** Costumes this pass has unlocked (cosmetics with `pass: level`). */
export const passCostumes = (pass, cosmetics, data) => { const lv = levelOf(pass?.xp || 0, data.levels).level; return cosmetics.items.filter(c => c.pass && lv >= c.pass).map(c => c.id); };

/**
 * One match's reporter, owned by the room. It turns what happened (board events, minigame results, the final standings)
 * into stat counts for each PERSON in it (CPUs and the big screen earn nothing) and hands them to `profiles.progress`.
 *   createPassMatch({ profiles, member: pid -> member, send(member, obj), season: () => id|null, mode })
 *   .board(ev)  .game({ id, players, res, seconds, cpuSkill: pid -> skill|null })  .finish({ rows, teams, quick, again })
 *   .earned(pid) -> sticker ids won in this match
 */
export function createPassMatch({ profiles, member, send, season = () => null, mode = 'board' }) {
  const M = new Map(), got = new Map();
  const ms = pid => { let v = M.get(pid); if (!v) M.set(pid, v = { tickets: 0, ribbons: 0, wins: 0, games: 0, people: 0 }); return v; };
  const person = pid => { const m = member(pid); return m && !m.cpu && !m.display && m.token ? m : null; };
  function give(pid, add = {}, xp = 0, extra = {}) {
    const m = person(pid); if (!m || !profiles?.progress) return null;
    const out = profiles.progress(m.token, { add, match: ms(pid), xp }, { season: season() });
    if (!out) return null;
    if (out.stickers.length) got.set(pid, [...(got.get(pid) || []), ...out.stickers]);
    if (noteworthy(out) || extra.final) send(m, { t: 'pass', ...out, ...extra, ...(extra.final ? { match: got.get(pid) || [] } : {}), view: profiles.passView(m.token), coinsNow: profiles.view(profiles.get(m.token)).coins });
    return out;
  }
  const BOARD_STAT = { jackpot: 'jackpots', chance: 'spins', ribbon: 'ribbonsBought', duck: 'ducks', cannon: 'cannon', pit: 'mud' };
  function board(ev) {
    if (!ev || ev.ev === 'turn' || ev.ev === 'ask') return;
    const adds = new Map(), bump = (pid, k) => { if (pid == null) return; const a = adds.get(pid) || {}; a[k] = (a[k] || 0) + 1; adds.set(pid, a); };
    if (ev.ev === 'fx') {
      const k = BOARD_STAT[ev.kind];
      if (k && !(ev.kind === 'pit' && !ev.d)) bump(ev.pid, k);
      if (ev.kind === 'swap' && ev.with != null) { bump(ev.pid, 'mirrors'); bump(ev.with, 'mirrors'); }   // the Hall of Mirrors (a ghost has no `with`)
      if (ev.kind === 'duel' && ev.winner != null) bump(ev.winner, 'duelsWon');
      if (ev.kind === 'striker' && ev.item) bump(ev.pid, 'bells');
      if (ev.kind === 'shell' && ev.right) bump(ev.with, 'shellFinds');
      if (ev.kind === 'pact' && ev.picks && !ev.picks[0] && !ev.picks[1]) { bump(ev.pid, 'shares'); bump(ev.with, 'shares'); }
    }
    const moved = new Set(adds.keys());
    for (const [pid, n] of Object.entries(ev.tickets || {})) { const v = ms(+pid); if (n > v.tickets) { v.tickets = n; moved.add(+pid); } }
    for (const [pid, n] of Object.entries(ev.ribbons || {})) { const v = ms(+pid); if (n !== v.ribbons) { v.ribbons = n; moved.add(+pid); } }
    for (const pid of moved) give(pid, adds.get(pid) || {});
  }
  function game({ id, players, res, seconds, cpuSkill = () => null }) {
    const X = profiles?.passData?.xp; if (!X) return;
    const s = season(), people = players.filter(pid => person(pid)).length, alone = players.length === 1;
    const groupOf = pid => (res.order || []).findIndex(g => g.includes(pid));
    for (const pid of players) {
      if (!person(pid)) continue;
      const won = res.coop ? !!res.coop.success : !alone && (res.order?.[0] || []).includes(pid);
      const add = { games: 1 };
      if (s) add[`games_${s}`] = 1;
      if (won) { add.wins = 1; for (const k of kindsOf(id)) add[`wins_${k}`] = 1; if (s) add[`wins_${s}`] = 1; }
      if (res.coop?.success) { add.coopWins = 1; if (kindsOf(id).includes('boss')) add.bossWins = 1; }
      if (!res.coop) {                                         // placed above a computer player
        const me = groupOf(pid), beaten = players.filter(q => cpuSkill(q) && me >= 0 && groupOf(q) > me);
        if (beaten.length) add.cpuBeaten = 1;
        if (beaten.some(q => cpuSkill(q) === 'tricky')) add.trickyBeaten = 1;
      }
      const v = ms(pid); v.games++; if (won) v.wins++; v.people = Math.max(v.people, people);
      give(pid, add, (X.played + (won ? X.won : 0)) * shortFactor(seconds, X));
    }
  }
  function finish({ rows, teams = null, quick = false, again = false }) {
    const X = profiles?.passData?.xp; if (!X) return;
    const s = season(), people = rows.filter(r => person(r.pid)).length;
    for (const r of rows) {
      if (!person(r.pid)) continue;
      const won = r.place === 1 && rows.length > 1;
      const add = { matches: 1, [`done_${mode}`]: 1 };
      if (s) add[`matches_${s}`] = 1;
      if (won) add.matchWins = 1;
      if (won && teams) add.teamWins = 1;
      if (quick) add.quickDone = 1;
      if (again) add.againDone = 1;
      const v = ms(r.pid); v.people = Math.max(v.people, people); if (typeof r.ribbons === 'number') v.ribbons = r.ribbons;
      give(r.pid, add, X.matchDone + (won ? X.matchWon : 0), { final: true });
    }
  }
  return { board, game, finish, earned: pid => got.get(pid) || [], stats: pid => ({ ...ms(pid) }) };
}
