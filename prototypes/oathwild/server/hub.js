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

export const MAX_CHARS = 8, MAX_WORLDS_PER_PLAYER = 6, PUBLIC_LIST_MAX = 40;

export function createHub({ rules, W, ground, store, now = () => Date.now(), build = 'dev', seed = Date.now(), randomToken, redeem = null, log = () => {} }) {
  const rooms = new Map();            // code -> world room (only the open ones)
  const emptySince = new Map();
  const awayTimers = new Map();       // key -> { code, at }
  let seedN = seed >>> 0;
  const rand = () => { seedN = (Math.imul(seedN, 1664525) + 1013904223) >>> 0; return seedN / 4294967296; };
  const token = randomToken || (() => { let s = ''; for (let i = 0; i < 24; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(rand() * 36)]; return s; });
  const keyOfToken = new Map();
  const stats = { sockets: 0, bad: 0, limited: 0, worldsMade: 0 };
  let open = 0;

  // ---------------------------------------------------------------- saved players and worlds
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
  function summary(c) {
    return { id: c.id, name: c.name, level: c.level, classes: Object.entries(c.classLevels || {}).map(([k, v]) => ({ cls: k, name: rules.data.classes.classes[k]?.name || k, level: v })), look: c.look, gear: Object.fromEntries(Object.entries(c.gear || {}).filter(([, v]) => v).map(([s, it]) => [s, { b: it.baseKey, s: it.subtype || null, two: !!it.twoHanded }])), background: c.background, gold: c.gold || 0, inWorld: whereIs(c.id) };
  }
  function whereIs(charId) { for (const [code, R] of rooms) for (const P of R.players.values()) if (P.char.id === charId) return code; return null; }
  function worldRow(code, key = null) {
    const R = rooms.get(code);
    if (R) return { ...R.listing(), mine: !!key && (R.meta.owner === key) };
    const rec = store.loadWorld(code);
    if (!rec) return null;
    const m = rec.meta;
    return { code, name: m.name, public: !!m.public, players: 0, seats: MAX_PLAYERS, names: [], quests: Object.values(rec.state?.quests || {}).filter(q => q.done).length, mine: !!key && m.owner === key, updated: m.updated || null };
  }
  function worldList(key) {
    const p = profile(key);
    const out = [], seen = new Set();
    for (const code of p.worlds) { const r = worldRow(code, key); if (r) { out.push({ ...r, played: true }); seen.add(code); } }
    const pub = [];
    for (const code of new Set([...rooms.keys(), ...store.worldCodes()])) {
      if (seen.has(code)) continue;
      const r = worldRow(code, key);
      if (r?.public) pub.push(r);
    }
    pub.sort((a, b) => b.players - a.players || String(b.updated || '').localeCompare(String(a.updated || '')));
    return [...out, ...pub.slice(0, PUBLIC_LIST_MAX)];
  }
  function openRoom(code) {
    if (rooms.has(code)) return rooms.get(code);
    const rec = store.loadWorld(code);
    if (!rec) return null;
    const R = createWorldRoom({ rules, W, ground, meta: rec.meta, state: rec.state, log, persist, seed: rec.state?.seed || hashStr(code), dev: build === 'dev' });
    rooms.set(code, R);
    log('world.open', { code });
    return R;
  }

  // ---------------------------------------------------------------- sockets
  function accept(conn) {
    stats.sockets++; open++;
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
      // back after a drop: the same hero, still standing where it was
      const away = awayTimers.get(key);
      send({ t: 'welcome', token: S.token, build, profile: { key: key.startsWith('acct:') ? 'account' : 'device', name: S.name }, back: away ? away.code : null });
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
      if (S.room && (msg.t === 'in' || msg.t === 'act' || msg.t === 'devTp' || msg.t === 'devGear' || msg.t === 'devDummy' || msg.t === 'devKnock' || msg.t === 'devDown' || msg.t === 'devGold' || msg.t === 'devXp')) return S.room.message(S.key, msg);   // devTp / devGear: the room ignores them outside dev builds
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
          if (mine.length >= MAX_WORLDS_PER_PLAYER) return fail('full', `You can own ${MAX_WORLDS_PER_PLAYER} worlds. Remove one first.`);
          let code; do { code = newCode(rand); } while (rooms.has(code) || store.loadWorld(code));
          const name = cleanName(msg.name, 28) || 'A New Oath';
          const meta = { code, name, public: !!msg.public, owner: S.key, created: new Date(now()).toISOString(), players: [S.key] };
          const R = createWorldRoom({ rules, W, ground, meta, state: null, log, persist, seed: hashStr(code), dev: build === 'dev' });
          rooms.set(code, R);
          R.save();
          p.worlds = [code, ...p.worlds.filter(c => c !== code)];
          store.savePlayer(S.key, p);
          stats.worldsMade++;
          log('world.new', { code, public: !!msg.public });
          return send({ t: 'worlds', list: worldList(S.key), made: code });
        }
        case 'worldDel': {
          const code = cleanCode(msg.code);
          const rec = code && store.loadWorld(code);
          if (!rec || rec.meta.owner !== S.key) return fail('owner', 'Only the person who made a world can remove it.');
          const R = rooms.get(code);
          if (R?.size) return fail('busy', 'Someone is playing in that world right now.');
          rooms.delete(code); store.deleteWorld(code);
          const p = profile(S.key); p.worlds = p.worlds.filter(c => c !== code); store.savePlayer(S.key, p);
          return send({ t: 'worlds', list: worldList(S.key) });
        }
        case 'join': {
          const code = cleanCode(msg.code);
          const R = code && openRoom(code);
          if (!R) return fail('noworld', 'No world with that code. Check the letters.');
          const p = profile(S.key);
          const char = p.chars.find(c => c.id === msg.char);
          if (!char) return fail('nochar', 'Choose a character first.');
          if (S.room && S.room !== R) leaveRoom();
          const other = whereIs(char.id);
          if (other && other !== code) { rooms.get(other)?.leave(S.key, { quiet: true }); }
          awayTimers.delete(S.key);
          const res = R.join({ key: S.key, char: R.players.get(S.key)?.char.id === char.id ? R.players.get(S.key).char : char, send: d => conn.send(d) });
          if (res?.error) return fail('join', res.error);
          S.room = R;
          emptySince.delete(code);
          if (!p.worlds.includes(code)) { p.worlds = [code, ...p.worlds].slice(0, 30); store.savePlayer(S.key, p); }
          return;
        }
        case 'leave': leaveRoom(); return send({ t: 'left' });
        default: return;
      }
    }
    function close() {
      open--;
      if (S.room && S.key) {
        // keep the hero in the world for a moment: a phone that slept or a reload comes straight back (game-standards §2)
        S.room.away(S.key);
        awayTimers.set(S.key, { code: S.room.meta.code, at: now() });
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
  }
  function status() {
    let players = 0, stepMs = 0, steps = 0, maxStepMs = 0, bytesOut = 0;
    for (const R of rooms.values()) { players += R.size; stepMs += R.stats.stepMs; steps += R.stats.steps; maxStepMs = Math.max(maxStepMs, R.stats.maxStepMs); bytesOut += R.stats.bytesOut; }
    return { worlds: rooms.size, players, sockets: open, avgStepMs: steps ? Math.round(stepMs / steps * 1000) / 1000 : 0, maxStepMs: Math.round(maxStepMs * 100) / 100, bytesOut, ...stats };
  }
  function detail() { return [...rooms.values()].map(R => R.listing()); }
  function shutdown() { for (const R of rooms.values()) { try { R.save(); } catch { /* keep going */ } } }
  return { accept, step, status, detail, shutdown, rooms, profile, openRoom };
}
export { blankCharacter, CHARACTER_VERSION };
