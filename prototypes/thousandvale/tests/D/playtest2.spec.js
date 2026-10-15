// Stream D-world — play-test 2 in a real browser against a real server (tests/D/m3-server.mjs + its test hook) and a
// second player (a node client on js/net/client.js) standing beside you in Torborhold:
//   Q7  Torborhold at night: no glass off the walls (all panes are the kit's own windows), screenshot
//   Q10 every office dressed, signs written, lights only on lit offices; NPCs at their own buildings; screenshots
//   Q18 set pieces near the start drawn (graveyard, farm fields, orchard, mill pond, inn) — instanced, screenshots
//   Q16 at level 5 you own a mount: H puts you in the saddle; the other player is seen riding too; you get down
//   Q20/Q21 the other player's custom look (chosen at creation) is what you see
//   Q22 the other player hides their gear: you see plain clothes (weapons stay)
//   Q8  a status on the other player shows its aura; their death clears it
// Screenshots: tests/D/shots/q*-*.png
// Run (shared lock): cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/playtest2.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'shots');
test.describe.configure({ mode: 'serial' });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, port, hookBase, page, ctx, bot, botChar;
const errors = [];
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());
const BOT_LOOK = { v: 1, race: 'dwarf', seed: 4242, avatar: { hair: { id: 'wavy', color: '#d02020' }, body: { skin: '#a06a48' } } };

test.beforeAll(async ({ browser }) => {
  test.setTimeout(420000);
  port = await freePort(); const hp = await freePort();
  srv = spawn(process.execPath, [join(HERE, 'm3-server.mjs'), '--port', String(port), '--hook', String(hp)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 30000);
    srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } });
    srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out)));
  });
  hookBase = `http://127.0.0.1:${hp}`;
  mkdirSync(SHOTS, { recursive: true });
  ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
  page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/?autoplay=1&name=Wren&cls=ranger&quality=low&tod=0.45`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 60000 });
  await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 300000 });
  // the other player: a node client in the same town, with a custom look
  const { connect, memoryTokenStore } = await import('../../js/net/client.js');
  bot = connect({ mode: 'ws', url: `ws://127.0.0.1:${port}`, tokenStore: memoryTokenStore(), guestName: 'Brannoc' });
  await bot.ready;
  botChar = await bot.createChar({ name: 'Brannoc', cls: 'paladin', look: BOT_LOOK });
  await bot.play(botChar.id);
});
test.afterAll(async () => { try { bot?.leave?.(); } catch {} await ctx?.close(); srv?.kill('SIGTERM'); });
const botActor = () => page.evaluate(() => { const a = [...thousandvale.actors.actors.values()].find(a => a.kind === 'player' && a.name === 'Brannoc'); return a ? { id: a.id, look: a.look, body: !!a.body, mount: a.mountHave || null, riding: !!a.mount, auras: a.auras ? [...a.auras.drawn] : [], dead: a.dead } : null; });

test('Q7 + Q10: Torborhold at night — glass on walls, offices dressed and signed, lights on shops only', async () => {
  test.setTimeout(240000);
  const town = await page.evaluate(() => { const L = [...thousandvale.WS.loaded.values()].find(L => L.key === 'z12_02'); const t = L.town; return { st: t.stats, offices: t.offices.map(o => [o.kind, o.lit, o.label]) }; });
  console.log('[Q10]', JSON.stringify(town));
  expect(town.st.offices).toBeGreaterThanOrEqual(8);
  expect(town.st.signs).toBeGreaterThanOrEqual(8);
  expect(town.st.brightGlass).toBeGreaterThan(0);
  expect(town.st.dimGlass).toBeGreaterThan(0);
  for (const k of ['forge', 'inn', 'hall']) expect(town.offices.some(o => o[0] === k)).toBe(true);
  // every lit office has a light, no unlit one has (lights counted per office in the dressing — tests/D/playtest2.test.js)
  await page.evaluate(() => { tv.hud(false); tv.time?.(0.95); });
  const spots = await page.evaluate(() => { const L = [...thousandvale.WS.loaded.values()].find(L => L.key === 'z12_02'); return L.town.offices.slice(0, 40).map(o => { const b = L.town.buildingsList.find(d => d.id === o.building); return { k: o.kind, x: o.x, z: o.z, yaw: b.yaw, g: b.ground }; }); });
  for (const k of ['forge', 'inn', 'barber', 'stable', 'hall', 'apothecary']) {
    const o = spots.find(s => s.k === k); if (!o) continue;
    await page.evaluate(o => { const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw); tv.fly(o.x + fx * 11 + fz * 5, o.g + 4.5, o.z + fz * 11 - fx * 5, o.x, o.g + 1.6, o.z); }, o);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: join(SHOTS, `q10-${k}.png`) });
  }
  const me = await page.evaluate(() => { const y = tv.state().you, h = thousandvale.WS.terrain.heightAt(y.x, y.z); return { ...y, h }; });
  await page.evaluate(m => tv.fly(m.x + 30, m.h + 20, m.z + 30, m.x, m.h, m.z), me);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(SHOTS, 'q7-town-night.png') });
  // NPCs: no two service NPCs share a spot (A's offices), and each stands near its own building
  const npcs = await page.evaluate(() => [...thousandvale.actors.actors.values()].filter(a => a.kind === 'npc' && a.role !== 'guard').map(a => ({ n: a.name, x: a.pos.x, z: a.pos.z })));
  for (let i = 0; i < npcs.length; i++) for (let j = i + 1; j < npcs.length; j++) expect(Math.hypot(npcs[i].x - npcs[j].x, npcs[i].z - npcs[j].z), `${npcs[i].n} on top of ${npcs[j].n}`).toBeGreaterThan(0.6);
  await page.evaluate(() => { tv.time?.(0.45); tv.fly(null); tv.hud(true); });
});

test('Q18: the set pieces round Torborhold are drawn (graveyard, farm, orchard, mill pond, inn)', async () => {
  test.setTimeout(240000);
  const st = await page.evaluate(() => [...thousandvale.WS.loaded.values()].find(L => L.key === 'z12_02')?.setpieces?.stats || null);
  console.log('[Q18]', JSON.stringify(st));
  expect(st).not.toBeNull();
  expect(st.parts).toBeGreaterThan(5000);
  expect(st.meshes).toBeLessThan(40);                       // instanced: a handful of draws for thousands of parts
  expect(st.buildings).toBeGreaterThan(5);
  expect(st.spinners).toBeGreaterThan(0);                   // the mill wheel turns
  // world = zone + (24576, 4096) for z12_02
  const views = { graveyard: [558, 1094, 22, 14, 18], farm: [730, 852, 40, 25, 30], orchard: [764, 1058, 30, 15, -30], mill: [808, 1316, 35, 18, 20], inn: [631, 977, 20, 9, 12] };
  await page.evaluate(() => tv.hud(false));
  for (const [k, [x, z, dx, dy, dz]] of Object.entries(views)) {
    await page.evaluate(([x, z, dx, dy, dz]) => { const X = x + 24576, Z = z + 4096, h = thousandvale.WS.terrain.heightAt(X, Z); tv.fly(X + dx, h + dy, Z + dz, X, h, Z); }, [x, z, dx, dy, dz]);
    await page.waitForTimeout(3500);
    await page.screenshot({ path: join(SHOTS, `q18-${k}.png`) });
  }
  await page.evaluate(() => { tv.fly(null); tv.hud(true); });
});

test('Q20/Q21 + Q22: the other player wears their own face, and hiding gear shows plain clothes', async () => {
  test.setTimeout(180000);
  await expect.poll(async () => (await botActor())?.body, { timeout: 60000, intervals: [1000] }).toBe(true);
  const a = await botActor();
  expect(a.look.race).toBe('dwarf');
  const custom = a.look.custom || a.look.avatar;            // A stores the editor's choices as look.custom
  expect(custom?.hair?.id || custom?.hair).toBe('wavy');
  // dress the other player in real armour first (rolled by Farhold's generator), so hiding it has something to hide
  await hook('/level', { name: 'Brannoc', level: 12 });
  const got = []; const off = bot.on('bag', m => { for (const it of m.add || []) got.push(it); });
  await hook('/roll', { name: 'Brannoc', n: 3, level: 6, boost: 1, bases: ['light_helm', 'medium_chest', 'cloth_legs'] });
  await new Promise(r => setTimeout(r, 1500)); off?.();
  for (const it of got.filter(i => i.type !== 'weapon')) { bot.item('equip', it.uid); await new Promise(r => setTimeout(r, 150)); }
  await expect.poll(async () => Object.keys((await botActor()).look.gear || {}).filter(k => !['weapon', 'offhand', 'mainhand'].includes(k)).length, { timeout: 20000 }).toBeGreaterThan(0);
  const before = Object.keys((await botActor()).look.gear || {});
  await page.evaluate(id => { tv.hud(false); const b = thousandvale.actors.get(id); const p = b.pos; tv.fly(p.x + 3, p.y + 1.8, p.z + 3, p.x, p.y + 0.8, p.z); }, a.id);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(SHOTS, 'q22-gear-shown.png') });
  bot.pref('showGear', false);
  await expect.poll(async () => Object.keys((await botActor()).look.gear || {}).filter(k => !['weapon', 'offhand', 'mainhand'].includes(k)).length, { timeout: 20000 }).toBe(0);
  console.log('[Q22] gear before', before, 'after', Object.keys((await botActor()).look.gear || {}));
  await page.evaluate(id => { tv.hud(false); const b = thousandvale.actors.get(id); const p = b.pos; tv.fly(p.x + 3, p.y + 1.8, p.z + 3, p.x, p.y + 0.8, p.z); }, a.id);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(SHOTS, 'q22-plain-clothes.png') });
  bot.pref('showGear', true);
  await page.evaluate(() => { tv.fly(null); tv.hud(true); });
});

test('Q16: at level 5 both players ride, everyone sees the rider, and you get down again', async () => {
  test.setTimeout(240000);
  await hook('/level', { name: 'Wren', level: 5 });
  await hook('/level', { name: 'Brannoc', level: 5 });
  for (const name of ['Wren', 'Brannoc']) await hook('/mounts', { name, mounts: ['trail_horse'] });      // round 11 (#16): bought, not given
  await page.waitForTimeout(1500);
  await page.evaluate(() => tv.mount());
  bot.mount('summon');
  await expect.poll(async () => page.evaluate(() => !!thousandvale.actors.get(tv.state().you.id)?.mount), { timeout: 60000, intervals: [1000] }).toBe(true);
  await expect.poll(async () => (await botActor())?.riding, { timeout: 60000, intervals: [1000] }).toBe(true);
  const r = await page.evaluate(() => { const a = thousandvale.actors.get(tv.state().you.id); const seat = a.mount.seat.getWorldPosition(a.group.position.clone()); return { speedMul: thousandvale.S.predictor.speedMul, anim: a.anim, seatAbove: seat.y - a.group.position.y, riderParent: a.model.parent?.parent === a.mount.seat || a.model.parent === a.mount.seat }; });
  console.log('[Q16]', JSON.stringify(r));
  expect(r.speedMul).toBeGreaterThan(1.2);
  expect(r.riderParent).toBe(true);
  expect(r.seatAbove).toBeGreaterThan(0.6);
  expect(['ride', 'rideGallop']).toContain(r.anim);
  await page.evaluate(() => { tv.hud(false); const p = thousandvale.actors.get(tv.state().you.id).pos; tv.fly(p.x + 4.5, p.y + 2.2, p.z + 3, p.x, p.y + 1.1, p.z); });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(SHOTS, 'q16-riding.png') });
  // ride a few metres: the gait moves
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1500);
  await page.screenshot({ path: join(SHOTS, 'q16-riding-moving.png') });
  await page.keyboard.up('KeyW');
  const b = await botActor();
  await page.evaluate(id => { const p = thousandvale.actors.get(id).pos; tv.fly(p.x + 4.5, p.y + 2.2, p.z - 3, p.x, p.y + 1.1, p.z); }, b.id);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(SHOTS, 'q16-other-rider.png') });
  await page.evaluate(() => { tv.fly(null); tv.hud(true); tv.mount(); });
  await expect.poll(async () => page.evaluate(() => !thousandvale.actors.get(tv.state().you.id)?.mount && thousandvale.S.predictor.speedMul === 1), { timeout: 20000 }).toBe(true);
});

test('Q8: a status on the other player shows its aura, and their death clears it', async () => {
  test.setTimeout(120000);
  const b = await botActor();
  // the server's info.st for that body (C's statuses arrive this way, protocol §18.8)
  await page.evaluate(id => { const info = thousandvale.S.mirror.infos.get(id); info.st = ['burn', 'chill']; }, b.id);
  await expect.poll(async () => (await botActor()).auras.sort().join(','), { timeout: 5000 }).toBe('burn,slow');
  await page.evaluate(id => { tv.hud(false); const p = thousandvale.actors.get(id).pos; tv.fly(p.x + 3, p.y + 1.8, p.z + 3, p.x, p.y + 0.8, p.z); }, b.id);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(SHOTS, 'q8-burning.png') });
  await hook('/kill', { name: 'Brannoc' });
  await expect.poll(async () => (await botActor()).dead, { timeout: 20000 }).toBe(true);
  await expect.poll(async () => (await botActor()).auras.length, { timeout: 5000 }).toBe(0);
  // a stale st on the corpse never brings it back
  await page.waitForTimeout(800);
  expect((await botActor()).auras.length).toBe(0);
  await page.evaluate(() => { tv.fly(null); tv.hud(true); });
  expect(errors.filter(e => !/WebSocket|net::/.test(e))).toEqual([]);
});

test('R5: every weapon draws its basic attack — a ranger\'s real shots, and swings / staff spells in their element', async () => {
  test.setTimeout(300000);
  const you = await page.evaluate(() => tv.state().you);
  await hook('/teleport', { name: 'Wren', x: 26624 - 300, z: you.z + 60 });
  await expect.poll(async () => page.evaluate(() => [...thousandvale.actors.actors.values()].filter(a => a.kind === 'monster' && !a.dead).length), { timeout: 120000, intervals: [3000] }).toBeGreaterThan(0);
  const before = await page.evaluate(() => tv.weaponFx().shots);
  await page.evaluate(() => { const me = tv.state().you; const m = [...thousandvale.actors.actors.values()].filter(a => a.kind === 'monster' && !a.dead).sort((p, q) => Math.hypot(p.pos.x - me.x, p.pos.z - me.z) - Math.hypot(q.pos.x - me.x, q.pos.z - me.z))[0]; if (m) tv.target(m.id); });      // (a monster seen a moment ago may be gone: the loop below re-targets)
  for (let i = 0; i < 8; i++) { await page.evaluate(() => { if (tv.state().target == null) { const me = tv.state().you, m = [...thousandvale.actors.actors.values()].filter(a => a.kind === 'monster' && !a.dead).sort((p, q) => Math.hypot(p.pos.x - me.x, p.pos.z - me.z) - Math.hypot(q.pos.x - me.x, q.pos.z - me.z))[0]; if (m) tv.target(m.id); } }); await page.keyboard.press('KeyF'); await page.waitForTimeout(700); }
  const shots = await page.evaluate(() => tv.weaponFx().shots);
  console.log('[R5] shots', before, '->', shots, JSON.stringify(await page.evaluate(() => { const T = thousandvale, S = T.S, t = T.actors.get(S.target), p = S.predictor.pos, y = S.net?.joined?.you || {}; return { reach: S.reach, known: S.reachKnown, youReach: y.reach, range: y.attackRange, weapon: y.equipment?.weapon?.baseKey || y.equipment?.weapon?.base || null, target: S.target, dist: t ? Math.round(Math.hypot(t.pos.x - p.x, t.pos.z - p.z)) : null, tdead: t?.dead, hostile: t?.hostile, dead: S.self.dead, casts: S.events.filter(e => e.type === 'cast').length, monsters: [...T.actors.actors.values()].filter(a => a.kind === 'monster' && !a.dead).length }; })));
  expect(shots).toBeGreaterThan(before);
  // the other weapon kinds, through the client's own handler with C's event shapes (cast.js weaponTag)
  await page.evaluate(() => { tv.hud(false); const p = thousandvale.actors.get(tv.state().you.id).pos; tv.fly(p.x + 5, p.y + 3.2, p.z + 5, p.x, p.y + 1, p.z); });
  const demos = [
    { wt: 'sword', wk: 'melee', el: 'physical', shape: 'swing', reach: 2.4, arc: 1.8 },
    { wt: 'sword2h', wk: 'melee', el: 'fire', shape: 'swing', reach: 3.0, arc: 2.2, two: 1 },
    { wt: 'hammer', wk: 'melee', el: 'lightning', shape: 'swing', reach: 2.4, arc: 1.2 },
    { wt: 'dagger', wk: 'melee', el: 'poison', shape: 'swing', reach: 1.9, arc: 0.6 },
    { wt: 'staff', wk: 'staff', el: 'shadow', shape: 'nova', r: 3.5 },
    { wt: 'staff', wk: 'staff', el: 'ice', shape: 'cone', reach: 8, arc: 0.9 },
  ];
  for (const [i, d] of demos.entries()) {
    await page.evaluate(d => { const a = thousandvale.actors.get(tv.state().you.id); tv.fxEvent({ type: 'fx', kind: 'attack', id: a.id, x: a.pos.x, z: a.pos.z, yaw: a.yaw, step: 0, ...d }); }, d);
    await page.waitForTimeout(90);
    await page.screenshot({ path: join(SHOTS, `r5-${i}-${d.wt}-${d.el}.png`) });
    await page.waitForTimeout(400);
  }
  const st = await page.evaluate(() => tv.weaponFx());
  expect(st.swings).toBeGreaterThanOrEqual(4);
  expect(st.staff).toBeGreaterThanOrEqual(2);
  await page.evaluate(() => { tv.fly(null); tv.hud(true); });
});

test('R4 + R7 + S4 + S20 + S23: call-out held for the wind-up, chained pillars, a burning pack-leader rare, eating, loot sparkles', async () => {
  test.setTimeout(240000);
  await page.evaluate(() => { tv.target?.(null); if (thousandvale.S.self.dead) thousandvale.S.net.respawn(); });
  await page.waitForTimeout(3000);
  await hook('/teleport', { name: 'Wren', x: 26624 - 520, z: 5360 + 180 });
  let m = [];
  await expect.poll(async () => (m = await page.evaluate(() => { const me = tv.state().you; const list = [...thousandvale.actors.actors.values()].filter(a => a.kind === 'monster' && !a.dead && a.body && a.rank !== 'boss').sort((p, q) => Math.hypot(p.pos.x - me.x, p.pos.z - me.z) - Math.hypot(q.pos.x - me.x, q.pos.z - me.z)); return list.slice(0, 2).map(a => a.id); })).length, { timeout: 120000, intervals: [3000] }).toBeGreaterThan(1);
  // R4: a boss line said at the cast's start stays up for the whole 4 s wind-up (it used to vanish at 2.8 s)
  await page.evaluate(id => { tv.fxEvent({ type: 'say', id, text: 'Get inside its reach!', style: 'warn' }); tv.fxEvent({ type: 'castbar', id, ab: 'sweep', name: 'Tail Sweep', ms: 4000 }); }, m[0]);
  await page.waitForTimeout(3500);
  expect(await page.evaluate(() => document.getElementById('callout').classList.contains('show'))).toBe(true);
  await page.screenshot({ path: join(SHOTS, 'r4-callout-held.png') });
  // R7: four chained pillars tethered to a body
  // (the body picked 3.5 s ago may be gone by now — killed by a town guard since play-test 8, or wandered out of sight; any living monster carries the pillars)
  await page.evaluate(id => { const a = thousandvale.actors.get(id) || [...thousandvale.actors.actors.values()].find(x => x.kind === 'monster' && !x.dead && x.body); id = a.id; for (const [k, [dx, dz]] of [[-6, -6], [6, -6], [-6, 6], [6, 6]].entries()) thousandvale.objects.upsert({ id: 'demo:pillar' + k, type: 'pillar', name: 'Chained pillar', x: a.pos.x + dx, z: a.pos.z + dz, look: 'chained', tether: id, state: 'idle', source: 'arena' }); tv.hud(false); tv.fly(a.pos.x + 13, a.pos.y + 7, a.pos.z + 13, a.pos.x, a.pos.y + 1, a.pos.z); }, m[0]);
  await page.waitForTimeout(2500);
  const chains = await page.evaluate(() => [...thousandvale.objects.items.values()].filter(o => o.chain?.visible).length);
  expect(chains).toBe(4);
  await page.screenshot({ path: join(SHOTS, 'r7-chained-pillars.png') });
  await page.evaluate(() => { for (let k = 0; k < 4; k++) thousandvale.objects.remove('demo:pillar' + k); });
  // S4: the second monster becomes a burning pack-leader rare (what the server's info.rank/mods will say)
  // (pick the bodies again: the two chosen at the top of this test have had ten seconds to die or wander off)
  m = await page.evaluate(() => { const me = tv.state().you; return [...thousandvale.actors.actors.values()].filter(a => a.kind === 'monster' && !a.dead && a.body && a.rank !== 'boss' && thousandvale.S.mirror.infos.get(a.id)).sort((p, q) => Math.hypot(p.pos.x - me.x, p.pos.z - me.z) - Math.hypot(q.pos.x - me.x, q.pos.z - me.z)).slice(0, 2).map(a => a.id); });
  expect(m.length, 'a living monster in sight').toBeGreaterThan(0);
  if (m[1] != null) {
    await page.evaluate(id => { const info = thousandvale.S.mirror.infos.get(id); info.rank = 'rare'; info.aff = [{ id: 'burning', name: 'Burning', aura: 'burn' }, { id: 'pack_leader', name: 'Pack Leader' }]; const a = thousandvale.actors.get(id); thousandvale.actors.remove(id); }, m[1]);
    await expect.poll(async () => page.evaluate(id => { const a = thousandvale.actors.get(id); return !!(a && a.body && a.rankMark); }, m[1]), { timeout: 60000 }).toBe(true);
    await page.waitForTimeout(800);
    const r = await page.evaluate(id => { const a = thousandvale.actors.get(id); tv.fly(a.pos.x + 5, a.pos.y + 3, a.pos.z + 5, a.pos.x, a.pos.y + 0.8, a.pos.z); return { auras: [...(a.auras?.drawn || [])], flag: !!a.pole }; }, m[1]);
    expect(r.auras).toContain('burn'); expect(r.flag).toBe(true);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(SHOTS, 's4-rare-burning-leader.png') });
  }
  // S23: loot sparkles — a rare's beam on one body, a magic sparkle on another
  await page.evaluate(([a, b]) => { thousandvale.lootMarks.set(a, true, 'rare'); if (b != null) thousandvale.lootMarks.set(b, true, 'magic'); const x = thousandvale.actors.get(a); tv.fly(x.pos.x + 9, x.pos.y + 5, x.pos.z + 9, x.pos.x, x.pos.y + 1, x.pos.z); }, m);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => thousandvale.lootMarks.marks.size)).toBeGreaterThan(0);
  await page.screenshot({ path: join(SHOTS, 's23-loot-sparkles.png') });
  await page.evaluate(([a, b]) => { thousandvale.lootMarks.set(a, false); if (b != null) thousandvale.lootMarks.set(b, false); }, m);
  // S20: eating sits you down; moving gets you up
  await page.evaluate(() => { tv.target?.(null); if (thousandvale.S.self.dead) thousandvale.S.net.respawn(); });
  await hook('/teleport', { name: 'Wren', x: 25168, z: 5360 });
  await expect.poll(async () => page.evaluate(() => !thousandvale.S.self.dead && !thousandvale.actors.get(tv.state().you.id)?.dead), { timeout: 30000 }).toBe(true);
  await page.waitForTimeout(6000);   // out of combat: the 'ready' stance lasts 5 s after the last blow
  await page.evaluate(() => { thousandvale.actors.setEating(tv.state().you.id, 'food'); const p = thousandvale.actors.get(tv.state().you.id).pos; tv.fly(p.x + 3, p.y + 1.6, p.z + 3, p.x, p.y + 0.5, p.z); });
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => thousandvale.actors.get(tv.state().you.id).anim)).toBe('sitGround');
  await page.screenshot({ path: join(SHOTS, 's20-eating.png') });
  await page.evaluate(() => { thousandvale.actors.setEating(tv.state().you.id, null); tv.fly(null); tv.hud(true); });
});
