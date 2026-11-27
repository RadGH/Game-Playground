// The front desk: every socket lands here. It says hello (who is this player: a games.radgh.com account through a
// one-time ticket → `acct:<id>`, else the browser's lasting device id → `dev:<id>`), keeps each player's saved
// characters, lists and creates worlds (four-letter codes), opens a world from its save when someone joins and puts it
// away (saved) when it has been empty for a while, checks every frame against the protocol and its rate limits, and
// passes the rest to the world (server/world.js). Pure apart from what it is handed: server/main.mjs wires it,
// tests/net drive it with fake sockets and a memory store.
import { PROTOCOL, MAX_PLAYERS, EMPTY_WORLD_MS, AWAY_MS, parseFrame, createBuckets, cleanCode, newCode, cleanName, cleanLook } from '../js/net/protocol.js';
import { createWorldRoom } from './world.js';
import { createCharacter, blankCharacter, CHARACTER_VERSION } from '../js/rules/levels.js';
import { makeRng, hashStr } from '../js/rules/farhold.js';
import { pointsIn, regionName, homeRegion } from '../js/world/regions/index.js';

export const MAX_CHARS = 8, MAX_WORLDS_PER_PLAYER = 6, PUBLIC_LIST_MAX = 40;

// Regions (owner 2026-11-27; docs/BRAINSTORM-2026-11-27-regions.md §1): `places` = { regionId: { W, ground } } for every
// region but the home one (the home region is W / ground); `regionIndex` = data/regions/index.json. A world's home
// region is the room `code`; another region is the room `code~region`, saved as its own record, holding the world's
// quests, story flags, found shrines and places BY REFERENCE (the family share) so a quest started in one region
// counts in another. Travel (a travel point or a far shrine) moves a player's seat from one room to the other.
export function createHub({ rules, W, ground, arenaPlace = null, places = {}, regionIndex = null, store, now = () => Date.now(), build = 'dev', seed = Date.now(), randomToken, redeem = null, log = () => {} }) {
  const rooms = new Map();            // code -> world room (only the open ones)
  const emptySince = new Map();
  const awayTimers = new Map();       // key -> { code, at }
  let seedN = seed >>> 0;
  const rand = () => { seedN = (Math.imul(seedN, 1664525) + 1013904223) >>> 0; return seedN / 4294967296; };
  const token = randomToken || (() => { let s = ''; for (let i = 0; i < 24; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(rand() * 36)]; return s; });
  const keyOfToken = new Map();
  const stats = { sockets: 0, bad: 0, limited: 0, worldsMade: 0 };
  let open = 0;
  const conns = new Set();             // every open socket (the dev map editor's changes go to all of them: broadcast)
  const seats = new Map();             // key -> the socket's session (travel moves its room)
  const families = new Map();          // world code -> the share every region room of that world holds
  const HOME = homeRegion(regionIndex);
  const SHARED = ['quests', 'flags', 'playerFlags', 'shrines', 'found'];
  const roomKey = (code, region) => (!region || region === HOME ? code : `${code}~${region}`);
  const parentOf = key => String(key).split('~')[0];
  const isSub = key => String(key).includes('~');
  // which region each shrine stands in (null = the home region), for travel between regions and the travel window
  const shrineInfo = (() => {
    const map = new Map();
    for (const [rid, P] of Object.entries(places)) for (const sh of P.W.data.placements.shrines || []) map.set(sh.id, { region: rid, name: sh.name, regionName: regionName(regionIndex, rid) });
    for (const sh of W.data.placements.shrines || []) if (!map.has(sh.id)) map.set(sh.id, { region: null, name: sh.name, regionName: regionName(regionIndex, HOME) });
    return id => map.get(id) || null;
  })();
  function familyOf(code) {
    if (!families.has(code)) {
      const st = store.loadWorld(code)?.state || {};
      families.set(code, { quests: st.quests || {}, flags: st.flags || [], playerFlags: st.playerFlags || {}, shrines: st.shrines || [], found: st.found || [] });
    }
    return families.get(code);
  }

  // ---------------------------------------------------------------- saved players and worlds
  // the place a room stands in: the open world, or the arena (brainstorm 2026-11-27 §2a — its own hosting option)
  const placeFor = (kind, region = null) => (kind === 'arena' ? { W: arenaPlace.W, ground: arenaPlace.ground } : region && region !== HOME && places[region] ? places[region] : { W, ground });
  function profile(key) {
    const p = store.loadPlayer(key) || { key, name: null, chars: [], worlds: [] };
    p.chars = Array.isArray(p.chars) ? p.chars : [];
    p.worlds = Array.isArray(p.worlds) ? p.worlds : [];
    return p;
  }
  function saveChar(key, char) {
    const p = profile(key);
    const i = p.chars.findIndex(c => c.id === char.id);
    if (i >= 0) p.chars[i] = char; else p.chars.push(char);
    store.savePlayer(key, p);
  }
  function persist({ world, chars }) {
    if (world) store.saveWorld(world.meta.code, world);
    for (const { key, char } of chars || []) saveChar(key, char);
  }
  /** A region room's saves: its own record under `code~region`, and the world-wide parts written into the home record. */
  function persistRegion(code, key) {
    return ({ world, chars }) => {
      if (world) {
        store.saveWorld(key, { ...world, meta: { ...world.meta, region: key.split('~')[1], parent: code } });
        const home = store.loadWorld(code);
        if (home) { const fam = familyOf(code); home.state = { ...home.state }; for (const k of SHARED) home.state[k] = fam[k]; store.saveWorld(code, home); }
      }
      for (const { key: k, char } of chars || []) saveChar(k, char);
    };
  }
  function summary(c) {
    return { id: c.id, name: c.name, level: c.level, classes: Object.entries(c.classLevels || {}).map(([k, v]) => ({ cls: k, name: rules.data.classes.classes[k]?.name || k, level: v })), look: c.look, gear: Object.fromEntries(Object.entries(c.gear || {}).filter(([, v]) => v).map(([s, it]) => [s, { b: it.baseKey, s: it.subtype || null, two: !!it.twoHanded }])), background: c.background, gold: c.gold || 0, inWorld: whereIs(c.id) };
  }
  function whereIs(charId) { for (const [code, R] of rooms) for (const P of R.players.values()) if (P.char.id === charId) return parentOf(code); return null; }
  function worldRow(code, key = null) {
    const R = rooms.get(code);
    if (R) {
      // players in the world's other regions count too
      let players = R.size; const names = R.listing().names;
      for (const [k, S2] of rooms) if (isSub(k) && parentOf(k) === code) { players += S2.size; names.push(...S2.listing().names); }
      return { ...R.listing(), players, names, mine: !!key && (R.meta.owner === key) };
    }
    const rec = store.loadWorld(code);
    if (!rec) return null;
    const m = rec.meta;
    const kind = m.kind || 'world';
    return { code, name: m.name, public: !!m.public, players: 0, seats: MAX_PLAYERS, names: [], quests: Object.values(rec.state?.quests || {}).filter(q => q.done).length, mine: !!key && m.owner === key, updated: m.updated || null, kind, ...(kind === 'arena' ? { arena: { kind: 'arena', wins: rec.state?.arena?.wins | 0, matches: rec.state?.arena?.matches | 0, busy: null } } : {}) };
  }
  function worldList(key) {
    const p = profile(key);
    const out = [], seen = new Set();
    for (const code of p.worlds) { const r = worldRow(code, key); if (r) { out.push({ ...r, played: true }); seen.add(code); } }
    const pub = [];
    for (const code of new Set([...rooms.keys(), ...store.worldCodes()])) {
      if (seen.has(code) || isSub(code)) continue;
      const r = worldRow(code, key);
      if (r?.public) pub.push(r);
    }
    pub.sort((a, b) => b.players - a.players || String(b.updated || '').localeCompare(String(a.updated || '')));
    return [...out, ...pub.slice(0, PUBLIC_LIST_MAX)];
  }
  function roomOpts(code, region) {
    const P = placeFor('world', region);
    const rid = region && region !== HOME ? region : HOME;
    return {
      share: familyOf(code), region: rid === HOME ? null : rid, points: pointsIn(regionIndex, P.W, rid), shrineInfo,
      transfer: (key, where) => travel(key, code, where),
    };
  }
  function openRoom(code, region = null) {
    const key = roomKey(code, region);
    if (rooms.has(key)) return rooms.get(key);
    const home = store.loadWorld(code);
    if (!home) return null;
    if (home.meta.kind === 'arena') {
      if (!arenaPlace || key !== code) return null;
      const R = createWorldRoom({ rules, ...placeFor('arena'), meta: home.meta, state: home.state, log, persist, seed: home.state?.seed || hashStr(code), dev: build === 'dev' });
      rooms.set(code, R); log('world.open', { code }); return R;
    }
    if (key !== code && !places[region]) return null;
    const rec = key === code ? home : store.loadWorld(key);
    const meta = { ...home.meta, code };                 // a region room speaks as its world (same code, name)
    const R = createWorldRoom({ rules, ...placeFor('world', region), meta, state: rec?.state || null, log, persist: key === code ? persist : persistRegion(code, key), seed: hashStr(key), dev: build === 'dev', ...roomOpts(code, region) });
    rooms.set(key, R);
    if (!rec) R.save();
    log('world.open', { code: key });
    return R;
  }
  /** Move a player's seat to another region's room of the same world (a travel point or a far shrine). */
  function travel(key, code, { region = null, arrive = null, shrine = null }) {
    const S = seats.get(key);
    const from = S?.room;
    const P = from?.players.get(key);
    if (!P) return;
    const T = openRoom(code, region);
    if (!T) return;
    const char = P.char;
    from.leave(key, { quiet: true, text: `${char.name} travelled to ${regionName(regionIndex, region || HOME)}.` });
    const res = T.join({ key, char, send: P.send, arrive: arrive || shrine });
    if (res?.error) { const back = from.join({ key, char, send: P.send }); S.room = back?.error ? null : from; return; }
    S.room = T;
    emptySince.delete(roomKey(code, region));
    log('world.travel', { code, key, to: region || HOME });
  }

  // ---------------------------------------------------------------- sockets
  function accept(conn) {
    stats.sockets++; open++;
    conns.add(conn);
    const buckets = createBuckets(now);
    const S = { token: null, key: null, room: null, name: null };
    const send = obj => conn.send(JSON.stringify(obj));
    const fail = (code, msg) => send({ t: 'err', code, msg });
    function leaveRoom({ quiet = false } = {}) { if (S.room) { S.room.leave(S.key, { quiet }); S.room = null; } }

    async function hello(msg) {
      if (msg.v !== PROTOCOL) return send({ t: 'err', code: 'version', msg: 'This page is out of date. Reload it.' });
      S.token = msg.token && /^[A-Za-z0-9_-]{16,64}$/.test(msg.token) ? msg.token : token();
      let key = keyOfToken.get(S.token) || null;
      if (msg.ticket && redeem) {
        const user = await redeem(msg.ticket).catch(() => null);
        if (user?.id) { key = `acct:${user.id}`; S.name = user.username || user.name || null; }
      }
      if (!key) key = msg.device && /^[A-Za-z0-9_-]{8,64}$/.test(msg.device) ? `dev:${msg.device}` : `dev:${S.token}`;
      // first sign-in: a device's characters move onto the account if the account has none yet (game-standards §3)
      if (key.startsWith('acct:') && msg.device && /^[A-Za-z0-9_-]{8,64}$/.test(msg.device)) {
        const acct = profile(key), dev = store.loadPlayer(`dev:${msg.device}`);
        if (!acct.chars.length && dev?.chars?.length) { acct.chars = dev.chars; acct.worlds = [...new Set([...(acct.worlds || []), ...(dev.worlds || [])])]; store.savePlayer(key, acct); store.savePlayer(`dev:${msg.device}`, { ...dev, chars: [], movedTo: key }); log('profile.moved', { from: 'dev', to: key }); }
      }
      keyOfToken.set(S.token, key);
      S.key = key;
      seats.set(key, S);
      // back after a drop: the same hero, still standing where it was
      const away = awayTimers.get(key);
      send({ t: 'welcome', token: S.token, build, profile: { key: key.startsWith('acct:') ? 'account' : 'device', name: S.name }, back: away ? parentOf(away.code) : null });
    }

    async function message(frame) {
      const f = parseFrame(frame);
      if (f.bad) { stats.bad++; return; }
      const msg = f.msg;
      if (!buckets.take(msg.t)) { stats.limited++; if (msg.t !== 'in') fail('slow', 'Slow down a little.'); return; }
      if (msg.t === 'ping') return send({ t: 'pong', at: msg.at });
      if (msg.t === 'hello') { S.helloing = hello(msg).finally(() => { S.helloing = null; }); return S.helloing; }
      if (S.helloing) await S.helloing;            // only while a hello (an account ticket) is still being checked
      if (!S.key) return fail('hello', 'Say hello first.');
      if (S.room && (msg.t === 'in' || msg.t === 'act' || msg.t === 'devTp' || msg.t === 'devGear' || msg.t === 'devDummy' || msg.t === 'devKnock' || msg.t === 'devDown' || msg.t === 'devGold' || msg.t === 'devXp' || msg.t === 'devWeather' || msg.t === 'devArena')) return S.room.message(S.key, msg);   // devTp / devGear: the room ignores them outside dev builds
      switch (msg.t) {
        case 'chars': return send({ t: 'chars', list: profile(S.key).chars.map(summary) });
        case 'charNew': {
          const p = profile(S.key);
          if (p.chars.length >= MAX_CHARS) return fail('full', `You can keep ${MAX_CHARS} characters. Retire one to make room.`);
          const name = cleanName(msg.name);
          if (!name) return fail('name', 'Choose a name.');
          const look = cleanLook(msg.look);
          const id = `c${Math.floor(rand() * 1e9).toString(36)}${p.chars.length}`;
          const made = createCharacter(rules, { id, name, look, background: msg.background, attributes: msg.attributes || {}, cls: msg.cls }, makeRng(hashStr(id)));
          if (!made.ok) return fail('char', made.why);
          made.char.created = new Date(now()).toISOString();
          p.chars.push(made.char);
          store.savePlayer(S.key, p);
          log('char.new', { key: S.key, cls: msg.cls });
          return send({ t: 'chars', list: p.chars.map(summary), made: id });
        }
        case 'charDel': {
          const p = profile(S.key);
          if (whereIs(msg.id)) return fail('busy', 'That character is in a world right now.');
          p.chars = p.chars.filter(c => c.id !== msg.id);
          store.savePlayer(S.key, p);
          return send({ t: 'chars', list: p.chars.map(summary) });
        }
        case 'worlds': return send({ t: 'worlds', list: worldList(S.key) });
        case 'worldNew': {
          const p = profile(S.key);
          const mine = store.worldCodes().map(c => store.loadWorld(c)).filter(r => r?.meta.owner === S.key);
          if (mine.length >= MAX_WORLDS_PER_PLAYER) return fail('full', `You can own ${MAX_WORLDS_PER_PLAYER} worlds and arenas. Remove one first.`);
          const kind = msg.kind === 'arena' ? 'arena' : 'world';
          if (kind === 'arena' && !arenaPlace) return fail('arena', 'Arenas are not open on this server yet.');
          let code; do { code = newCode(rand); } while (rooms.has(code) || store.loadWorld(code));
          const name = cleanName(msg.name, 28) || (kind === 'arena' ? 'The Grand Arena' : 'A New Oath');
          const meta = { code, name, public: !!msg.public, owner: S.key, created: new Date(now()).toISOString(), players: [S.key], kind };
          const R = createWorldRoom({ rules, ...placeFor(kind), meta, state: null, log, persist, seed: hashStr(code), dev: build === 'dev', ...(kind === 'arena' ? {} : roomOpts(code, null)) });
          rooms.set(code, R);
          R.save();
          p.worlds = [code, ...p.worlds.filter(c => c !== code)];
          store.savePlayer(S.key, p);
          stats.worldsMade++;
          log('world.new', { code, public: !!msg.public, kind });
          return send({ t: 'worlds', list: worldList(S.key), made: code });
        }
        case 'worldDel': {
          const code = cleanCode(msg.code);
          const rec = code && store.loadWorld(code);
          if (!rec || rec.meta.owner !== S.key) return fail('owner', 'Only the person who made a world can remove it.');
          const subs = [...new Set([...rooms.keys(), ...store.worldCodes()])].filter(k => isSub(k) && parentOf(k) === code);
          if (rooms.get(code)?.size || subs.some(k => rooms.get(k)?.size)) return fail('busy', 'Someone is playing in that world right now.');
          rooms.delete(code); store.deleteWorld(code);
          for (const k of subs) { rooms.delete(k); store.deleteWorld(k); }
          families.delete(code);
          const p = profile(S.key); p.worlds = p.worlds.filter(c => c !== code); store.savePlayer(S.key, p);
          return send({ t: 'worlds', list: worldList(S.key) });
        }
        case 'join': {
          const code = cleanCode(msg.code);
          const p = profile(S.key);
          const char = p.chars.find(c => c.id === msg.char);
          if (code && !store.loadWorld(code) && !rooms.has(code)) return fail('noworld', 'No world with that code. Check the letters.');
          if (!char) return fail('nochar', 'Choose a character first.');
          // back where the hero last stood in this world: its region's room (home if that region is gone)
          // (a hero still standing in one of this world's rooms after a drop goes straight back into that room)
          const live = [...rooms.entries()].find(([k, R2]) => parentOf(k) === code && R2.players.get(S.key)?.char.id === char.id);
          const wasIn = live ? (isSub(live[0]) ? live[0].split('~')[1] : null) : char.where?.code === code && char.where.region && places[char.where.region] ? char.where.region : null;
          const R = live ? live[1] : code && (openRoom(code, wasIn) || openRoom(code));
          if (!R) return fail('noworld', 'No world with that code. Check the letters.');
          if (S.room && S.room !== R) leaveRoom();
          for (const [k, R2] of rooms) if (R2 !== R && R2.players.get(S.key)?.char.id === char.id) R2.leave(S.key, { quiet: true });
          awayTimers.delete(S.key);
          const res = R.join({ key: S.key, char: R.players.get(S.key)?.char.id === char.id ? R.players.get(S.key).char : char, send: d => conn.send(d) });
          if (res?.error) return fail('join', res.error);
          S.room = R;
          emptySince.delete(roomKey(code, wasIn));
          if (!p.worlds.includes(code)) { p.worlds = [code, ...p.worlds].slice(0, 30); store.savePlayer(S.key, p); }
          return;
        }
        case 'leave': leaveRoom(); return send({ t: 'left' });
        default: return;
      }
    }
    function close() {
      open--; conns.delete(conn);
      if (seats.get(S.key) === S) seats.delete(S.key);
      if (S.room && S.key) {
        // keep the hero in the world for a moment: a phone that slept or a reload comes straight back (game-standards §2)
        S.room.away(S.key);
        awayTimers.set(S.key, { code: [...rooms.entries()].find(([, R]) => R === S.room)?.[0] || S.room.meta.code, at: now() });
      }
      S.room = null;
    }
    return { message, close, get key() { return S.key; } };
  }

  /** One sim step for every open world; dropped players leave after AWAY_MS; empty worlds are saved and put away. */
  function step() {
    for (const [code, R] of rooms) {
      try { if (R.size) R.step(); }
      catch (e) { log('world.crash', { code, msg: String(e?.stack || e).slice(0, 800) }); try { R.save(); } catch { /* keep going */ } rooms.delete(code); continue; }
    }
    const t = now();
    for (const [key, a] of awayTimers) if (t - a.at > AWAY_MS) { awayTimers.delete(key); rooms.get(a.code)?.leave(key); }
    for (const [code, R] of rooms) {
      if (R.size) { emptySince.delete(code); continue; }
      if (!emptySince.has(code)) emptySince.set(code, t);
      else if (t - emptySince.get(code) > EMPTY_WORLD_MS) { R.save(); rooms.delete(code); emptySince.delete(code); log('world.close', { code }); }
    }
    for (const code of families.keys()) if (![...rooms.keys()].some(k => parentOf(k) === code)) families.delete(code);
  }
  function status() {
    let players = 0, stepMs = 0, steps = 0, maxStepMs = 0, bytesOut = 0;
    for (const R of rooms.values()) { players += R.size; stepMs += R.stats.stepMs; steps += R.stats.steps; maxStepMs = Math.max(maxStepMs, R.stats.maxStepMs); bytesOut += R.stats.bytesOut; }
    return { worlds: rooms.size, players, sockets: open, avgStepMs: steps ? Math.round(stepMs / steps * 1000) / 1000 : 0, maxStepMs: Math.round(maxStepMs * 100) / 100, bytesOut, ...stats };
  }
  function detail() { return [...rooms.values()].map(R => R.listing()); }
  /** One message to every connected page (title screen or in a world) — the dev map editor's live changes. */
  function broadcast(obj) { const d = JSON.stringify(obj); for (const c of conns) { try { c.send(d); } catch { /* gone */ } } }
  function shutdown() { for (const R of rooms.values()) { try { R.save(); } catch { /* keep going */ } } }
  return { accept, step, status, detail, shutdown, rooms, profile, openRoom, broadcast };
}
export { blankCharacter, CHARACTER_VERSION };
