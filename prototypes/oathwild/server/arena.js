// Oathwild — the arena as a hosting option (brainstorm 2026-11-27 §2): a plug-in for one world room (server/world.js)
// whose place is the arena (js/world/arena-place.js). It runs matches with js/rules/arena-match.js (the same code the
// balance sim runs), opens the bracket board and the champions' ladder, hands out a reward chest per player
// (individual loot) and keeps each hero's arena record on the hero (shared heroes: owner answer 1).
//
//   const A = createArenaMode(api)     api: the room's own pieces (see world.js) — { rules, world, ws, W, players,
//                                      unitOf, say, err, broadcast, changed, extra, persist, log, meta, ground }
//   A.act(P, msg)    → true when it handled the message (arena-board, arena-ladder, arena-start, arena-title,
//                      arena-chest + the loot actions on a reward chest)
//   A.open(P, kind)  the board ('arena') or the ladder ('ladder') — an NPC service opens these
//   A.inputs()       the champion's input for this step (before the sim step)
//   A.step(events)   after the sim step: the match, its messages, the rewards
//   A.onJoin(P, u) · A.onLeave(P) · A.slow() · A.view(P) (the 'arena' message) · A.listing()
// Messages out: { t: 'arena', view } (the HUD: wave x/5, enemies left, the breather, where they come from — rule 67),
// { t: 'win', kind: 'arena' | 'ladder' | 'arenaChest', … } and 'say' lines.
import { createMatch, matchInputs, stepMatch, endMatch, matchView } from '../js/rules/arena-match.js';
import {
  brackets, bracketOf, bracketMark, rosterFor, champions, championOf, challengeRefusal, arenaRecord, recordClear,
  recordChampion, rewardShare, makeUnique, titleOf, nextChampion,
} from '../js/rules/arena.js';
import { refreshPlayer } from '../js/rules/combat.js';
import { addXp } from '../js/rules/levels.js';
import { createContainer, takeItem, takeGold, takeAll, isEmptyFor } from '../js/rules/loot.js';
import { onFloor } from '../js/world/arena-place.js';
import { hashStr } from '../js/rules/farhold.js';

const CHEST_METRES = 6;

export function createArenaMode(api) {
  const { rules, world, ws, W, players, unitOf, say, err, broadcast, changed, extra, log, meta, ground } = api;
  const L = W.arena, AD = rules.data.arena;
  ws.arena = ws.arena && typeof ws.arena === 'object' ? ws.arena : {};
  ws.arena.matches = ws.arena.matches | 0;
  ws.arena.wins = ws.arena.wins | 0;
  ws.arena.log = Array.isArray(ws.arena.log) ? ws.arena.log : [];
  ws.arena.chests = ws.arena.chests && typeof ws.arena.chests === 'object' ? ws.arena.chests : {};   // charId -> [reward]
  let M = null, endAt = null, lastView = '', tickN = 0;

  // ---------------------------------------------------------------- reward chests (kept in the world save until opened)
  const boxId = r => `arena:${r.id}`;
  function chestFor(charId, r) {
    let c = extra.get(boxId(r));
    if (!c) {
      c = createContainer({ id: boxId(r), kind: 'reward', at: r.at, level: r.level, table: 'bag', eligible: [charId], seed: 1, name: 'your reward chest' });
      c.shares[charId] = { gold: r.gold, items: r.items, opened: true };
      c.reward = r;
      extra.set(c.id, c);
    }
    return c;
  }
  for (const [charId, list] of Object.entries(ws.arena.chests)) for (const r of list) chestFor(charId, r);
  function dropEmpty(charId) {
    const list = ws.arena.chests[charId] || [];
    ws.arena.chests[charId] = list.filter(r => { const c = extra.get(boxId(r)); if (c && isEmptyFor(c, charId)) { extra.delete(c.id); return false; } return true; });
    if (!ws.arena.chests[charId].length) delete ws.arena.chests[charId];
  }
  function giveChest(P, r) {
    const list = ws.arena.chests[P.char.id] = ws.arena.chests[P.char.id] || [];
    r.at = L.chestSpots[list.length % L.chestSpots.length];
    list.push(r);
    // the box reads straight from the saved reward (the same item objects), so a half-emptied chest saves as such
    const c = chestFor(P.char.id, r);
    r.gold = c.shares[P.char.id].gold; r.items = c.shares[P.char.id].items;
  }
  function chestView(P, c) {
    const s = c.shares[P.char.id] || { gold: 0, items: [] };
    const r = c.reward;
    return { t: 'win', kind: 'arenaChest', id: c.id, at: c.at, name: r.title, bracket: r.bracket, champion: r.champion || null, first: !!r.first, gold: s.gold, items: s.items, newTitle: r.newTitle || null, xp: r.xp || 0, left: (ws.arena.chests[P.char.id] || []).length };
  }
  function syncSaved(c, charId) { const s = c.shares[charId]; c.reward.gold = s.gold; c.reward.items = s.items; }

  // ---------------------------------------------------------------- the board and the ladder
  function boardView(P) {
    const rec = arenaRecord(P.char);
    return {
      t: 'win', kind: 'arena', busy: M ? matchView(M, world) : null, level: P.char.level, wins: rec.wins,
      brackets: brackets(rules).map(b => {
        const R = rosterFor(rules, b);
        return { id: b.id, name: b.name, levels: b.levels, mark: bracketMark(rules, P.char, b), clears: rec.clears[b.id] || 0, first: !rec.clears[b.id], kinds: R.normals.length, bosses: R.bosses.map(id => rules.data.monsters.monsters[id]?.name || id).slice(0, 4) };
      }),
      next: nextChampion(rules, P.char)?.id || null,
    };
  }
  function ladderView(P) {
    const rec = arenaRecord(P.char);
    return {
      t: 'win', kind: 'ladder', busy: M ? matchView(M, world) : null, rank: rec.rank, title: titleOf(rules, P.char), titles: rec.titles,
      champions: champions(rules).map(c => {
        const why = challengeRefusal(rules, P.char, c.id);
        const b = bracketOf(rules, c.needs);
        return { id: c.id, rank: c.rank, name: c.name, epithet: c.epithet, level: c.level, classes: [...new Set(c.plan)].map(k => rules.data.classes.classes[k]?.name || k), title: c.title, beaten: rec.beaten.includes(c.id), open: !why, why, needs: b ? `${b.name} (levels ${b.levels[0]}-${b.levels[1]})` : null, unique: makeUnique(rules, c.unique), greet: c.lines?.greet || '' };
      }),
    };
  }
  function open(P, kind) {
    if (kind === 'ladder') return P.send(JSON.stringify(ladderView(P)));
    return P.send(JSON.stringify(boardView(P)));
  }

  // ---------------------------------------------------------------- a match
  const inCourt = u => u && !onFloor(L, u.x, u.z, 2);
  function start(P, m) {
    if (M) return err(P, 'A match is already on. Wait for it to end.');
    const u = unitOf(P); if (!u || u.downed) return err(P, 'Get back on your feet first.');
    let kind = 'waves', bracket = null, champ = null;
    if (m.champion) {
      champ = championOf(rules, m.champion);
      if (!champ) return err(P, 'There is no such champion.');
      const why = challengeRefusal(rules, P.char, champ.id); if (why) return err(P, why);
      kind = 'champion';
    } else {
      bracket = bracketOf(rules, m.bracket);
      if (!bracket) return err(P, 'Pick a bracket on the board.');
    }
    const heroes = [...players.values()].map(Q => unitOf(Q)).filter(x => x && !x.downed);
    M = createMatch(rules, world, { kind, bracket, champion: champ?.id || null, heroes: heroes.map(x => x.id), seed: hashStr(`${meta.code}:${ws.arena.matches}:${world.t}`), place: L });
    M.by = P.char.name; M.no = ++ws.arena.matches;
    // everyone in the arena walks onto the sand by the Heroes' Gate, side by side, facing the middle
    heroes.forEach((x, i) => {
      const off = (i - (heroes.length - 1) / 2) * 2;
      const p = ground.standAt(L.heroAt[0] + off, L.heroAt[1]);
      x.x = p.x; x.z = p.z; x.mounted = false; x.safeUntil = world.t + AD.match.gather;
      const Q = [...players.values()].find(Q => Q.unitId === x.id); if (Q) Q.teleport = true;
    });
    const what = champ ? `${champ.name}, ${champ.epithet} (rank ${champ.rank})` : `the ${bracket.name} bracket (levels ${bracket.levels[0]}-${bracket.levels[1]})`;
    broadcast({ t: 'say', text: `${P.char.name} called ${what}. To the sand!`, kind: 'quest' });
    log('arena.start', { code: meta.code, kind, bracket: bracket?.id, champion: champ?.id, heroes: heroes.length });
    sendView(true);
  }
  function backToCourt(u, i = 0) {
    const s = W.data.placements.shrines[0];
    const p = ground.standAt(s.at[0] + 3 + (i % 3) * 1.6, s.at[1] + 4 + Math.floor(i / 3) * 1.6);
    if (u.downed) { u.downed = null; u.alive = true; u.statuses = {}; refreshPlayer(world, u.id, { full: true }); world.events.push({ at: Math.round(world.t * 100) / 100, t: 'respawned', who: u.id, at: [p.x, p.z] }); }
    u.x = p.x; u.z = p.z; u.safeUntil = world.t + 4;
    const Q = [...players.values()].find(Q => Q.unitId === u.id); if (Q) { Q.teleport = true; Q.meDirty = true; }
  }
  function finish(result) {
    const won = result === 'won';
    const heroes = [...M.heroes].map(id => world.units.get(id)).filter(Boolean);
    const entry = { no: M.no, kind: M.kind, bracket: M.bracket?.id || null, champion: M.champion?.id || null, won, heroes: heroes.map(u => u.char?.name).filter(Boolean), wave: M.wave, at: Math.round(ws.time) };
    ws.arena.log = [entry, ...ws.arena.log].slice(0, 12);
    if (won) ws.arena.wins++;
    for (const u of heroes) {
      const P = [...players.values()].find(Q => Q.unitId === u.id); if (!P) continue;
      const rec = arenaRecord(P.char); rec.matches++;
      if (!won) continue;
      if (M.kind === 'champion') {
        const c = M.champion;
        const was = rec.beaten.includes(c.id);
        const isNext = !was && !challengeRefusal(rules, P.char, c.id);
        const r = { id: `${M.no}_${P.char.id}`, kind: 'champion', champion: c.id, bracket: null, title: `${c.name}'s reward`, level: c.level, first: isNext, gold: AD.rewards.championGold + AD.rewards.championGoldPerLevel * c.level, items: [] };
        if (isNext) {
          const got = recordChampion(rules, P.char, c.id);
          const it = makeUnique(rules, c.unique); if (it) r.items.push(it);
          r.newTitle = got.title;
          broadcast({ t: 'say', text: `${P.char.name} beat ${c.name} and is now called ${got.title}.`, kind: 'level' });
        }
        const xp = Math.round(120 + 25 * c.level);
        const ax = addXp(rules, P.char, xp); r.xp = ax.added;
        giveChest(P, r);
        changed(P);
      } else {
        const b = M.bracket;
        const { first } = recordClear(rules, P.char, b.id);
        const share = rewardShare(rules, b, { first, heroLevel: P.char.level, seed: hashStr(`${meta.code}:${M.no}:${P.char.id}`) });
        giveChest(P, { id: `${M.no}_${P.char.id}`, kind: 'waves', bracket: b.id, title: `${b.name} bracket`, level: b.levels[1], first, gold: share.gold, items: share.items });
        changed(P, { refresh: false });
      }
    }
    if (won) broadcast({ t: 'say', text: M.kind === 'champion' ? `${M.champion.name} is beaten! Reward chests wait in the court.` : `The ${M.bracket.name} bracket is won! Reward chests wait in the court.`, kind: 'info' });   // (the log: the HUD's Victory banner says it on screen — rule 42)
    else broadcast({ t: 'say', text: 'Everyone fell. Back to the court — you keep the experience you earned.', kind: 'info' });
    log('arena.end', { code: meta.code, won, kind: M.kind, wave: M.wave });
    api.persist();
  }
  function close() {
    const heroes = [...M.heroes].map(id => world.units.get(id)).filter(Boolean);
    endMatch(world, M);
    heroes.forEach((u, i) => backToCourt(u, i));
    M = null; endAt = null;
    sendView(true);
  }

  function inputs() { return M ? matchInputs(world, M) : {}; }
  function step(events) {
    if (!M) return;
    // who is in the match: heroes standing on the sand (a late hero walking in joins; one who walked out has left)
    for (const P of players.values()) {
      const u = unitOf(P); if (!u) continue;
      if (onFloor(L, u.x, u.z) && !u.downed) M.heroes.add(u.id);
      else if (!u.downed && M.heroes.has(u.id) && M.state !== 'gather' && inCourt(u)) M.heroes.delete(u.id);
    }
    if (endAt != null) { if (world.t >= endAt) close(); return; }
    const out = stepMatch(world, M, world.dt || 0.05, events);
    for (const e of out) {
      if (e.t === 'arenaWave') broadcast({ t: 'arena', event: 'wave', wave: e.wave, of: e.of, total: e.total, brute: e.brute, boss: e.boss, champion: e.champion || null, name: e.name || null });
      else if (e.t === 'arenaPack') broadcast({ t: 'arena', event: 'pack', gate: e.gate, gateName: e.gateName, at: e.at, brute: e.brute, boss: e.boss, champion: e.champion || null, names: e.names });
      else if (e.t === 'arenaBreather') broadcast({ t: 'arena', event: 'breather', seconds: e.seconds, next: e.next });
      else if (e.t === 'arenaWon' || e.t === 'arenaLost') {
        const won = e.t === 'arenaWon';
        if (M.kind === 'champion') {
          const u = M.champUnit && world.units.get(M.champUnit);
          const line = won ? M.champion.lines?.lost : M.champion.lines?.won;
          if (line) broadcast({ t: 'say', text: `${M.champion.name}: "${line}"`, kind: 'chat' });
          if (u) u.safeUntil = world.t + 999;
        }
        finish(won ? 'won' : 'lost');
        broadcast({ t: 'arena', event: won ? 'won' : 'lost', kind: M.kind });
        // the monsters still out are taken away at once; heroes walk back to the court after a moment (or at once when lost)
        for (const id of M.alive) world.units.delete(id);
        M.alive.clear();
        endAt = world.t + (won ? AD.match.endPause : 2.5);
      }
    }
    if (M && ++tickN % 4 === 0) sendView();
  }
  function view() {
    const v = M ? matchView(M, world) : { state: 'idle' };
    if (M) { v.by = M.by; v.ending = endAt != null; v.name = M.kind === 'champion' ? `${M.champion.name}, ${M.champion.epithet}` : `${M.bracket.name} bracket`; v.levels = M.bracket?.levels || null; }
    v.gates = [...L.gates, L.champGate].map(g => ({ id: g.id, name: g.name, at: g.out }));
    return v;
  }
  function sendView(force = false) {
    const base = view();
    for (const P of players.values()) {
      const mine = (ws.arena.chests[P.char.id] || []).map(r => ({ id: boxId(r), at: r.at, title: r.title }));
      const s = JSON.stringify({ t: 'arena', view: { ...base, chests: mine } });
      if (force || s !== P.lastArena) { P.lastArena = s; P.send(s); }
    }
  }

  // ---------------------------------------------------------------- messages
  function act(P, m) {
    const u = unitOf(P);
    switch (m.a) {
      case 'arena-board': open(P, 'arena'); return true;
      case 'arena-ladder': open(P, 'ladder'); return true;
      case 'arena-start': start(P, m); return true;
      case 'arena-title': {
        const rec = arenaRecord(P.char);
        if (m.title && !rec.titles.includes(m.title)) { err(P, 'You have not earned that title.'); return true; }
        rec.title = m.title || null; changed(P, { refresh: false });   // lint-ok: a champion title (an honorific on the hero record), not an HTML title= tooltip
        say(P, m.title ? `You are now called ${m.title}.` : 'You no longer show a title.', 'good');
        P.send(JSON.stringify(ladderView(P)));
        return true;
      }
      case 'loot-open': case 'loot-take': case 'loot-gold': case 'loot-all': {
        const c = extra.get(m.id);
        if (!c || c.kind !== 'reward') return false;
        if (!c.eligible.includes(P.char.id)) { err(P, 'That chest is someone else\'s.'); return true; }
        if (!u || Math.hypot(u.x - c.at[0], u.z - c.at[1]) > CHEST_METRES + 2) { err(P, 'Walk to the reward chests in the court.'); return true; }
        if (m.a === 'loot-take') { const r = takeItem(rules, c, P.char.id, P.char, m.item); if (!r.ok) { err(P, r.why); return true; } }
        if (m.a === 'loot-gold') { const r = takeGold(c, P.char.id, P.char); if (r.ok) say(P, `+${r.gold} gold`, 'gold'); }
        if (m.a === 'loot-all') { const r = takeAll(rules, c, P.char.id, P.char); if (r.gold) say(P, `+${r.gold} gold`, 'gold'); }
        if (m.a !== 'loot-open') changed(P);
        syncSaved(c, P.char.id);
        P.send(JSON.stringify(chestView(P, c)));
        if (isEmptyFor(c, P.char.id)) { dropEmpty(P.char.id); sendView(true); }
        return true;
      }
      default: return false;
    }
  }
  function onJoin(P, u) {
    arenaRecord(P.char);
    // a hero saved on the sand (a match that ended while they were away) comes back in the court
    if (!M && u && onFloor(L, u.x, u.z, 4)) backToCourt(u);
    setTimeout0(() => sendView(true));
  }
  function onLeave(P) { if (M) { M.heroes.delete(P.unitId); } }
  // (the room calls sendView on the next step instead of a timer: rooms have no timers)
  let pendingSend = false;
  function setTimeout0(fn) { pendingSend = fn; }
  function slow() { if (pendingSend) { const f = pendingSend; pendingSend = false; f(); } if (!M) sendView(); }
  function listing() { return { kind: 'arena', wins: ws.arena.wins, matches: ws.arena.matches, busy: M ? (M.kind === 'champion' ? M.champion.name : `${M.bracket.name} bracket`) : null }; }

  /** dev builds: what is out falls now (packs still to come stay queued; a champion is downed). */
  function devClear() {
    if (!M) return;
    for (const id of [...M.alive]) { const m = world.units.get(id); if (m) { m.hp = 0; m.alive = false; world.units.delete(id); } M.alive.delete(id); }
    if (M.queue) M.queue.forEach(p => { p.due = Math.min(p.due, M.t); });
    const c = M.champUnit && world.units.get(M.champUnit);
    if (c && !c.downed) { c.hp = 0; c.alive = false; c.downed = { until: world.t + 99 }; }
  }
  return { devClear, act, open, inputs, step, onJoin, onLeave, slow, listing, view, get match() { return M; }, sendView, finishNow: () => { if (M) close(); } };
}
