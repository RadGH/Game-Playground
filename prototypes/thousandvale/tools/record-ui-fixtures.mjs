#!/usr/bin/env node
// Re-record the UI gallery's fixtures (play-test 5, T26 — stream G).
//
// The gallery (ui-gallery.html) mounts the game's REAL interface modules with no server: js/net/client.js runs on a fake
// socket that replays what a real server once said. This tool makes that recording:
//   1. starts a throw-away real server (tests/D/m3-server.mjs: stream A's startServer, memory database, test hooks) —
//      or uses one you point it at with --server ws://… --hook http://… (it must have the hooks: level / roll / give);
//   2. plays a character in a real browser with every WebSocket frame logged (both sockets, both directions);
//   3. builds a rich state (level 24 cleric, a full bag, gear worn, perks spent, three friends in a party, quests,
//      a shop, a trade, the map, the sheet …) and then opens each data-driven window once so its answer is on the tape;
//   4. writes js/client/gallery/fixtures/session.json  { recordedAt, handshake, boot[], replies{}, moments{}, snaps[] }
//      and two backdrop pictures of the 3D world (world.jpg, title.jpg) that sit behind the HUD in the gallery.
// Moments no server can be made to produce on demand (a bite, a crate, a revive offer…) live in fixtures/moments.json,
// written by hand in the protocol's own shapes (the same ones tests/D/pt5.spec.js plays) — this tool never touches it.
//
// Run (shared browser lock — one browser at a time on this machine):
//   cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock node prototypes/thousandvale/tools/record-ui-fixtures.mjs
// Options: --rebuild (no browser: cut session.json again from the last tape, fixtures/.wire.json)  --keep-shots (also save step screenshots to tests/G/shots/record-*.png)  --no-backdrop  --headed
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { connect, memoryTokenStore } from '../js/net/client.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = join(HERE, '..');
const OUT = join(GAME, 'js/client/gallery/fixtures');
const SHOTS = join(GAME, 'tests/G/shots');
const argv = process.argv.slice(2);
const flag = k => argv.includes(k);
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('[record]', ...a);
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

const ME = { name: 'Maren', cls: 'cleric' };
const FRIENDS = [{ name: 'Aldra', cls: 'warrior', look: { race: 'human', seed: 4411, v: 1 } }, { name: 'Brem', cls: 'ranger', look: { race: 'dwarf', seed: 77, v: 1 } }, { name: 'Sella', cls: 'mage', look: { race: 'elf', seed: 9102, v: 1 } }];

let srv = null, port, hookBase, wsUrl, httpBase;
async function startServer() {
  if (arg('--server')) { wsUrl = arg('--server'); hookBase = arg('--hook'); httpBase = wsUrl.replace(/^ws/, 'http') + '/prototypes/thousandvale/'; return; }
  port = await freePort(); const hk = await freePort();
  srv = spawn(process.execPath, [join(GAME, 'tests/D/m3-server.mjs'), '--port', String(port), '--hook', String(hk), '--event-first', '150000', '--event-announce', '8000'], { cwd: GAME, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server did not start:\n' + out)), 60000);
    srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } });
    srv.on('exit', c => rej(new Error('server exited ' + c + '\n' + out)));
  });
  wsUrl = `ws://127.0.0.1:${port}`; hookBase = `http://127.0.0.1:${hk}`; httpBase = `http://127.0.0.1:${port}/prototypes/thousandvale/`;
  log('server up', wsUrl);
}
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json()).catch(e => ({ ok: false, err: e.message }));

/** Runs in the page before anything else: every WebSocket frame, in order, with the socket it rode on. */
function tapSockets() {
  window.__wire = [];
  window.__mark = name => window.__wire.push({ at: Date.now(), mark: name });
  const b64 = buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); };
  const WS = window.WebSocket;
  let snaps = 0;
  window.WebSocket = class extends WS {
    constructor(url, p) {
      super(url, p);
      const sock = new URL(url).pathname.startsWith('/gw') ? 'gw' : 'game';
      this.__sock = sock;
      this.addEventListener('message', ev => {
        if (typeof ev.data === 'string') { window.__wire.push({ at: Date.now(), s: sock, d: 'in', m: ev.data }); if (ev.data.startsWith('{"t":"joined"')) snaps = 0; }
        else if (snaps < 3 || window.__wantSnap) { snaps++; window.__wantSnap = false; window.__wire.push({ at: Date.now(), s: sock, d: 'in', bin: b64(ev.data) }); }
      });
    }
    send(d) { if (typeof d === 'string') window.__wire.push({ at: Date.now(), s: this.__sock, d: 'out', m: d }); return super.send(d); }
  };
}

const NOISE_OUT = new Set(['ping', 'in', 'hello', 'auth', 'guest', 'chars', 'play', 'enter', 'target', 'create']);
const NOISE_IN = new Set(['pong']);
const HANDSHAKE = new Set(['welcome', 'authed', 'charList', 'created', 'ticket']);
const EVENTS = new Set(['realm', 'zoneEvent', 'eventFrame', 'eventTrack', 'eventDone']);
/** The key a request is filed under (and looked up by in the gallery's fake socket): "shop:open", "map:get", "sheet". */
export const replyKey = m => [m.t, m.op, m.t === 'kits' ? m.cls : null].filter(Boolean).join(':');

function build(wire, recordedAt) {
  const J = e => { try { return JSON.parse(e.m); } catch { return null; } };
  const hs = { gw: {}, game: {} };
  const boot = [], replies = {}, moments = {}, snaps = [], asked = [];
  let phase = 'boot', mark = null, lastOut = null, joined = null, frames = null;
  for (const e of wire) {
    if (e.mark) { mark = e.mark; if (mark === 'ready') phase = 'windows'; lastOut = null; continue; }
    if (e.bin) { if (snaps.length < 3 || mark === 'snap') snaps.push({ s: e.s, bin: e.bin }); if (mark === 'snap') mark = null; continue; }
    const m = J(e); if (!m || !m.t) continue;
    if (e.d === 'out') { if (!NOISE_OUT.has(m.t)) { lastOut = { key: replyKey(m), at: e.at, req: m, in: [] }; if (phase !== 'boot') asked.push(lastOut); } continue; }
    if (NOISE_IN.has(m.t)) continue;
    if (HANDSHAKE.has(m.t)) { if (m.t === 'welcome') hs[e.s].welcome ||= m; else if (m.t === 'charList') hs.gw.charList = m; else if (m.t === 'created') hs.gw.created = m; else hs.gw[m.t] ||= m; continue; }
    if (m.t === 'joined' && !joined) { joined = m; continue; }
    if (m.t === 'ev') continue;                                   // combat events: nothing a window is built from
    if (m.t === 'partyFrames') { frames = { s: e.s, m }; continue; }   // two a second: only the last one matters
    if (EVENTS.has(m.t)) { (moments['recorded-event'] ||= []).push({ s: e.s, m }); if (phase !== 'boot') continue; }
    if (phase === 'boot') { if (m.t !== 'used' && m.t !== 'cookList' && m.t !== 'shopView') boot.push({ s: e.s, m }); continue; }   // a dialog is a scene, not part of standing in the world
    // the windows phase: an answer belongs to the request just before it (within 2.5 s) and to the step it happened in
    if (m.t === 'kitsR' && m.cls) { (replies['kits:' + m.cls] ||= []).push({ req: { t: 'kits', cls: m.cls }, in: [{ s: e.s, m }] }); continue; }
    if (lastOut && e.at - lastOut.at < 2500) lastOut.in.push({ s: e.s, m });
    if (mark) (moments[mark] ||= []).push({ s: e.s, m });
  }
  // only the last character sheet and the last party frames of the boot matter
  const lastSheet = boot.map(b => b.m.t).lastIndexOf('sheet');
  for (let i = boot.length - 1; i >= 0; i--) if (boot[i].m.t === 'sheet' && i !== lastSheet) boot.splice(i, 1);
  if (frames) boot.push(frames);
  // every request that got an answer, filed under its key (several asks of one kind — three shops — keep all their answers)
  // (a refusal — "too far away", "admins only" — is not a window; it is left out)
  for (const a of asked) if (a.in.length && a.in[0].m.ok !== false && a.req.t !== 'kits') (replies[a.key] ||= []).push({ req: a.req, in: a.in });
  // the title screen lists the character as it ended up (level 24), not as it was created
  const lv = [...boot].reverse().find(b => b.m.t === 'you' && b.m.level != null)?.m.level;
  if (lv && joined) for (const c of hs.gw.charList?.chars || []) if (c.id === joined.you.char) c.level = lv;
  // the character made during the recording is on the list the gallery's title screen shows
  if (hs.gw.created && hs.gw.charList && !hs.gw.charList.chars.some(c => c.id === hs.gw.created.char.id)) hs.gw.charList.chars.push(hs.gw.created.char);
  delete hs.gw.created;
  // nothing private goes into the repo: the account token and the room ticket are useless to the gallery
  if (hs.gw.authed) delete hs.gw.authed.token;
  if (hs.gw.ticket) hs.gw.ticket.ticket = 'gallery';
  return { recordedAt, recordedWith: 'tools/record-ui-fixtures.mjs', handshake: hs, joined, boot, replies, moments, snaps };
}

async function main() {
  if (flag('--rebuild')) {
    const wire = JSON.parse(readFileSync(join(OUT, '.wire.json'), 'utf8'));
    const fx = build(wire, wire.find(e => e.at)?.at || Date.now());
    writeFileSync(join(OUT, 'session.json'), JSON.stringify(fx));
    log(`rebuilt session.json: boot ${fx.boot.length}, replies ${Object.keys(fx.replies).join(', ')}, moments ${Object.keys(fx.moments).join(' ')}`);
    return;
  }
  await startServer();
  mkdirSync(OUT, { recursive: true }); mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ headless: !flag('--headed'), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => log('page error:', e.message));
  await page.addInitScript(tapSockets);
  const step = async (name, fn) => { try { await page.evaluate(n => window.__mark(n), name); const r = await fn(); log('ok  ', name, r === undefined ? '' : JSON.stringify(r).slice(0, 160)); return r; } catch (e) { log('FAIL', name, String(e.message).split('\n')[0]); return null; } finally { if (flag('--keep-shots')) await page.screenshot({ path: join(SHOTS, `record-${name}.png`) }).catch(() => {}); } };
  const ev = (fn, a) => page.evaluate(fn, a);

  // ---------------------------------------------------------------- phase A: a rich character
  await page.goto(`${httpBase}?quality=low&fresh=1&tod=0.45&autoplay=1&name=${ME.name}&cls=${ME.cls}`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 180000 });
  log('in the world');
  await sleep(2500);
  const lv = await hook('/level', { name: ME.name, level: 24 }); log('level', JSON.stringify(lv));
  await hook('/roll', { name: ME.name, n: 26, level: 20, boost: 3 });
  await hook('/give', { name: ME.name, gold: 1850, items: 0 });
  await hook('/give', { name: ME.name, items: 3, kind: 'potion', id: 'healing_potion', itemName: 'Healing Potion', rarity: 'common' });
  await hook('/give', { name: ME.name, items: 2, kind: 'food', id: 'trail_bread', itemName: 'Trail Bread', rarity: 'common' });
  await sleep(1500);
  // wear the best-looking piece for every slot the rolled items cover
  await ev(async () => {
    const n = thousandvale.S.net, seen = new Set();
    for (const it of [...(n.joined.you.bag || [])].sort((a, b) => (b.level || 0) - (a.level || 0))) {
      const slot = it.slot || (it.type === 'weapon' ? 'weapon' : null); if (!slot || seen.has(slot) || (it.levelReq || 0) > 24) continue;
      seen.add(slot); n.item('equip', it.uid); await new Promise(r => setTimeout(r, 180));
    }
  });
  await sleep(800);
  // spend perk points: walk outward from the middle of the forest (the server refuses what does not connect)
  await ev(async () => {
    try {
      const [{ buildTvForest }, json] = await Promise.all([import(new URL('js/rules/perk-forest.js', location.href).href), fetch(new URL('data/rules/perks.json', location.href)).then(r => r.json())]);
      const F = buildTvForest(json), n = thousandvale.S.net;
      const have = new Set([F.start?.id]); const order = [];
      for (let i = 0; i < 40 && order.length < 15; i++) { const next = F.nodes.find(x => !have.has(x.id) && (F.neighbours.get(x.id) || []).some(y => have.has(y)) && (order.length % 3 !== 2 || x.arm !== F.byId.get(order[order.length - 1])?.arm)); if (!next) break; have.add(next.id); order.push(next.id); }
      for (const id of order) { n.perk('take', { id }); await new Promise(r => setTimeout(r, 120)); }
      return order.length;
    } catch (e) { return 'perks: ' + e.message; }
  }).then(r => log('perks', r));
  // talents: the first node of the first two tiers of the first two skills
  await ev(async () => {
    try {
      const T = window.tvui?.talents?.(); const n = thousandvale.S.net;
      const bar = (n.joined.you.bar || []).filter(b => b && b.id && !b.locked).slice(0, 3);
      let k = 0;
      for (const b of bar) { const tree = T?.source?.tree?.(b.id) || T?.src?.tree?.(b.id); for (const t of (tree?.tiers || []).slice(0, 2)) { const node = (t.nodes || [])[k++ % Math.max(1, (t.nodes || []).length)]; if (node) { n.talent('pick', { skill: b.id, tier: t.tier, node: node.id }); await new Promise(r => setTimeout(r, 120)); } } }
      return k;
    } catch (e) { return 'talents: ' + e.message; }
  }).then(r => log('talents', r));

  // three friends: real clients, a real party
  const bots = [];
  for (const f of FRIENDS) {
    try {
      const b = connect({ mode: 'ws', url: wsUrl, tokenStore: memoryTokenStore(), guestName: f.name });
      await b.ready; const ch = await b.createChar({ name: f.name, cls: f.cls, look: f.look }); await b.play(ch.id);
      b.on('partyInvite', m => b.partyOp('accept', { party: m.party ?? m.id }));
      b.on('tradeAsk', m => b.tradeOp('accept', { id: m.trade }));
      bots.push({ ...f, net: b, char: ch.id });
    } catch (e) { log('bot', f.name, 'failed:', e.message); }
  }
  await sleep(1500);
  await hook('/level', { name: 'Aldra', level: 23 }); await hook('/level', { name: 'Brem', level: 25 }); await hook('/level', { name: 'Sella', level: 22 });
  for (const b of bots) { await ev(n => thousandvale.S.net.partyOp('invite', { name: n }), b.name); await sleep(700); }
  for (const b of bots) await ev(n => thousandvale.S.net.friend('add', n), b.name);
  await sleep(1500);
  // an account (guild founding and mail need a claimed one) — a throw-away name on a throw-away server
  await ev(() => thousandvale.S.net.claim('maren_gallery', 'correct horse')); await sleep(1200);
  for (const b of bots) { try { b.net.claim(b.name.toLowerCase() + '_gallery', 'correct horse'); b.net.on('guildInvite', m => b.net.guild('accept', { id: m.guild ?? m.id })); } catch {} }
  await sleep(1200);
  await ev(() => thousandvale.S.net.guild('create', { name: 'Keepers of the Ford' })); await sleep(1500);
  for (const b of bots) { await ev(n => thousandvale.S.net.guild('invite', { name: n }), b.name); await sleep(900); }
  await ev(() => thousandvale.S.net.guild('motd', { text: 'Barrow run at eight bells. Bring potions.' })); await sleep(600);
  try { bots[0]?.net.mail('send', { to: ME.name, subject: 'For the road', body: 'Found some coin in the Scar. It is more use to a healer than to me. See you at the ford.', gold: 25 }); await sleep(600);
    bots[1]?.net.mail('send', { to: ME.name, subject: 'Group tonight?', body: 'The Barrow at eight bells. Bring potions.' }); await sleep(900); } catch (e) { log('mail', e.message); }
  // talk to the town: stand next to each of the folk, hear them out, take the first requests (the journal and the tracker fill up)
  const home = await ev(() => { const p = thousandvale.S.predictor.pos; return { x: p.x, z: p.z }; });
  const folk = await ev(() => { const S = thousandvale.S; return [...S.mirror.infos.entries()].filter(([, i]) => i.kind === 'npc' && (i.type === 'npc' || i.role)).map(([id, i]) => ({ id, role: i.role || '', name: i.name, x: S.mirror.ents.get(id)?.x, z: S.mirror.ents.get(id)?.z })).filter(n => n.x != null); });
  const beside = async n => { const r = await hook('/teleport', { name: ME.name, x: n.x + 1.3, z: n.z + 1.1 }); await sleep(900); return r; };
  await step('quests', async () => {
    let got = 0, heard = 0;
    for (const n of folk.slice(0, 18)) {
      if (got >= 6) break;
      await beside(n);
      const r = await ev(async id => {
        const net = thousandvale.S.net, seen = []; const off = net.on('used', u => seen.push(u));
        net.use(id); await new Promise(r => setTimeout(r, 700)); off();
        const u = seen.find(x => x.id === id && x.ok !== false); let took = 0;
        for (const q of (u?.offers || []).slice(0, 2)) { net.quest('accept', q.id, id); took++; await new Promise(r => setTimeout(r, 250)); }
        thousandvale.worldUi.closeDialog?.();
        return u ? { took } : null;
      }, n.id);
      if (r) { heard++; got += r.took; }
    }
    return { folk: folk.length, heard, got };
  });
  await hook('/teleport', { name: ME.name, x: home.x, z: home.z });
  await sleep(2500);
  await page.evaluate(() => { window.__wantSnap = true; window.__mark('snap'); });
  await sleep(600);
  await page.evaluate(() => window.__mark('ready'));

  // ---------------------------------------------------------------- phase B: one question per window
  const ask = (name, fn, wait = 900) => step(name, async () => { const r = await ev(fn); await sleep(wait); return r; });
  await ask('map', () => { thousandvale.S.net.map(); }, 2500);
  await ask('sheet', () => { thousandvale.S.net.sheet(); });
  await ask('friends', () => { thousandvale.S.net.friend('list'); });
  await ask('guild', () => { thousandvale.S.net.guild('roster'); });
  await ask('callboard', () => { thousandvale.S.net.callboard('list'); });
  await ask('mail', () => { thousandvale.S.net.mail('list'); });
  await ask('cook', () => { thousandvale.S.net.cook(); });
  await ask('kits', () => { thousandvale.S.net.kits('cleric'); thousandvale.S.net.kits('warrior'); thousandvale.S.net.kits('mage'); }, 1800);
  await ask('guild-roster', () => { thousandvale.S.net.guild('roster'); });
  await ask('account', () => { thousandvale.S.net.accountOp('info'); });
  await ask('settings', () => { thousandvale.S.net.settings(); });
  // shops: stand at the counter of up to four different traders
  await step('shop', async () => {
    const out = [], seenRole = new Set();
    for (const n of folk.filter(f => /merchant|smith|trader|armourer|provisioner|apothecary|bowyer|tailor|jeweller|stable/.test(f.role))) {
      if (seenRole.has(n.role) || out.length >= 4) continue; seenRole.add(n.role);
      await beside(n);
      await ev(id => { thousandvale.S.net.shop('open', { npc: id }); }, n.id); await sleep(1100);
      out.push(n.role);
    }
    return out;
  });
  // dialogs: the folk who still have something to say (requests on offer, an inn to call home, the barber's chair)
  await step('npc', async () => {
    const out = [];
    for (const n of folk.filter(f => /elder|reeve|innkeeper|barber|unbinder|healer|trainer|angler|fisher/.test(f.role + ' ' + (f.name || '').toLowerCase())).slice(0, 6)) {
      await beside(n);
      await ev(id => { thousandvale.S.net.use(id); }, n.id); await sleep(900);
      await ev(() => thousandvale.worldUi.closeDialog?.());
      out.push(n.role);
    }
    return out;
  });
  await hook('/teleport', { name: ME.name, x: home.x, z: home.z });
  await sleep(2500);
  // inspect a party member, then a trade with them (offer, lock)
  await step('inspect', async () => ev(async () => { const S = thousandvale.S; const p = [...S.mirror.infos.entries()].find(([id, i]) => i.kind === 'player' && id !== S.selfId); if (!p) return 'nobody'; S.net.inspect(p[0]); await new Promise(r => setTimeout(r, 800)); return p[1].name; }));
  await step('trade', async () => ev(async () => {
    const S = thousandvale.S, n = S.net; const p = [...S.mirror.infos.entries()].find(([id, i]) => i.kind === 'player' && id !== S.selfId); if (!p) return 'nobody';
    n.tradeOp('ask', { id: p[0] }); await new Promise(r => setTimeout(r, 1500));
    if (!n.trade) return 'no trade';
    const it = (n.joined.you.bag || []).filter(i => i.slot || i.type === 'weapon').slice(0, 2).map(i => i.uid);
    n.tradeOp('offer', { id: n.trade.id, items: it, gold: 120 }); await new Promise(r => setTimeout(r, 900));
    return { id: n.trade.id, items: it.length };
  }));
  const tradeBot = bots[0];
  if (tradeBot?.net.trade) { try { tradeBot.net.tradeOp('offer', { id: tradeBot.net.trade.id, items: [], gold: 45 }); await sleep(600); tradeBot.net.tradeOp('lock', { id: tradeBot.net.trade.id }); await sleep(900); } catch {} }
  await step('trade-end', async () => { await ev(() => thousandvale.S.net.tradeOp('cancel')); await sleep(700); });
  // a realm event (the director was told to start one ~150 s in)
  await step('event', async () => { const left = 150000 + 12000; const t0 = Date.now(); while (Date.now() - t0 < left) { const n = await ev(() => window.__wire.filter(e => e.m && /"t":"(realm|zoneEvent|eventFrame)"/.test(e.m)).length); if (n >= 3) break; await sleep(3000); } await sleep(4000); return ev(() => window.__wire.filter(e => e.m && /"t":"(realm|zoneEvent|eventFrame)"/.test(e.m)).length); });
  await page.evaluate(() => window.__mark('end'));

  // ---------------------------------------------------------------- backdrops: the 3D world with no interface on it
  if (!flag('--no-backdrop')) {
    try {
      await ev(() => { tv.hud(false); tv.view(8.5, 0.3); for (const e of document.querySelectorAll('.tv-panel, .tipbox, #toasts')) e.style.visibility = 'hidden'; });
      await sleep(6000);
      await page.screenshot({ path: join(OUT, 'world.jpg'), type: 'jpeg', quality: 82 });
      log('backdrop world.jpg');
    } catch (e) { log('backdrop failed:', e.message); }
  }
  const wire = await ev(() => window.__wire);
  // the raw tape too (git-ignored): `--rebuild` re-cuts session.json from it without another recording
  writeFileSync(join(OUT, '.wire.json'), JSON.stringify(wire));
  const recordedAt = wire.find(e => e.at)?.at || Date.now();
  const fx = build(wire, recordedAt);
  writeFileSync(join(OUT, 'session.json'), JSON.stringify(fx));
  log(`session.json: boot ${fx.boot.length} messages, replies ${Object.keys(fx.replies).map(k => `${k}×${fx.replies[k].length}`).join(', ')}, moments ${Object.keys(fx.moments).map(k => `${k}(${fx.moments[k].length})`).join(' ')}, snaps ${fx.snaps.length}`);
  for (const b of bots) { try { b.net.close(); } catch {} }

  if (!flag('--no-backdrop')) {
    try {
      const p2 = await ctx.newPage();
      await page.close();                                   // one 3D page at a time on a software renderer
      await p2.goto(`${httpBase}?quality=low&fresh=1&tod=0.45&cls=cleric`, { waitUntil: 'domcontentloaded', timeout: 180000 });
      await p2.waitForSelector('#loading.done', { timeout: 240000 });
      await p2.evaluate(() => { for (const s of ['#title > *', '#hud']) for (const e of document.querySelectorAll(s)) e.style.visibility = 'hidden'; });
      await sleep(5000);
      await p2.screenshot({ path: join(OUT, 'title.jpg'), type: 'jpeg', quality: 82 });
      log('backdrop title.jpg');
    } catch (e) { log('title backdrop failed:', e.message); }
  }
  await browser.close();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('[record] failed:', e); process.exitCode = 1; }).finally(() => { srv?.kill('SIGTERM'); setTimeout(() => process.exit(), 1500).unref(); });
}
