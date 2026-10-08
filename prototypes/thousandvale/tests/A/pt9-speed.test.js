// Lead, 2026-10-08 (found by C): "move speed on gear does NOTHING — the sheet shows a bonus, nothing in js/sim reads it, a
// card promising +18% move speed is false." Over REAL WebSockets: two characters send the very same inputs for the same
// ticks; the one in boots with the +18% power covers 18% more ground, the server tells its client the factor
// (`you.speedMul` / `moveMul`) so the predictor agrees, taking the boots off puts it back, the bonus is capped at +30%, a
// slow never goes under half, and a mount multiplies it. Also: a heal on a full bar (`hit n:0` + `over`) is nobody's miss
// and nobody's kill.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../../server/main.mjs';
import { connect } from '../../js/net/client.js';
import { nodeSafeWsFactory } from '../../tools/bot-client.mjs';
import { stepMove, MOVE } from '../../js/sim/movement.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(20); } return !!fn(); };

test('move speed on gear is real: same inputs, more ground; the client is told the same factor; capped; a mount stacks', { timeout: 60000 }, async () => {
  const port = 19600 + Math.floor(Math.random() * 300);
  const quiet = console.log; console.log = () => {};
  const out = process.stdout.write.bind(process.stdout); process.stdout.write = (c, ...a) => (typeof c === 'string' && c.startsWith('{"t":"') ? true : out(c, ...a));
  const S = await startServer({ port, host: '127.0.0.1', db: 'memory', build: 'dev', rules: 'auto', procs: 0, linger: 0, maxPerIp: 50, saveEvery: 60000, process: 't', env: 'dev', adminPort: 0, director: {}, unlimitedIp: [], feedbackFile: false, journalMs: 2000 });
  console.log = quiet;
  try {
    const W = S.world, P = W.province;
    const mk = async name => {
      const n = connect({ mode: 'ws', socketFactory: nodeSafeWsFactory('ws://127.0.0.1:' + port), build: 'dev' });
      n.you = []; n.on('you', m => n.you.push(m)); n.itemR = []; n.on('itemR', m => n.itemR.push(m)); n.hits = []; n.on('hits', m => n.hits.push(...m.l));
      await n.ready; const ch = await n.createChar({ name, cls: 'warrior' }); await n.play(ch.id); return n;
    };
    const plain = await mk('Plainfoot'), fast = await mk('Fleetfoot');
    await sleep(150);
    const op = () => W.online.get(plain.joined.you.char), of = () => W.online.get(fast.joined.you.char);
    assert.equal(fast.joined.you.speedMul, 1); assert.equal(fast.joined.you.moveMul, 1);
    // an open field in the wilds, side by side, nothing around to fight
    const copy = P.copies[0], gate = P.gate || W.gate;
    let spot = null;
    for (let k = 0; k < 400 && !spot; k++) { const x = gate.x + 60 + (k % 20) * 9, z = gate.z + 60 + Math.floor(k / 20) * 9; let ok = true; for (let d = 0; d <= 40 && ok; d += 2) ok = copy.walkable(x + d, z) && copy.walkable(x + d, z + 4) && Math.abs(copy.terrain.heightAt(x + d, z) - copy.terrain.heightAt(x, z)) < 3; if (ok) spot = { x, z }; }
    assert.ok(spot, 'a straight 40 m of walkable ground');
    for (const m of [...copy.entities.values()]) if (m.kind === 'monster' && Math.hypot(m.x - spot.x, m.z - spot.z) < 120) copy.remove(m);
    P.transfer(op(), copy, { x: spot.x, z: spot.z }, 'test'); P.transfer(of(), copy, { x: spot.x, z: spot.z + 4 }, 'test');
    await waitFor(() => plain.joined.room.id === copy.id && fast.joined.room.id === copy.id);
    await sleep(150);
    // boots with the +18% move speed power, worn through the real item message
    const rules = copy.rules;
    let boots = null;
    for (const b of ['cloth_shoes', 'leather_boots', 'boots']) { boots = rules.makeItem(of().entity, { base: b, rarity: 'legendary', level: 1 }); if (boots) break; }
    assert.ok(boots && boots.slot === 'feet', 'boots out of the rules');
    boots = JSON.parse(JSON.stringify(boots)); boots.legendaryEffectId = 'free_move'; boots.reqLevel = 1; boots.levelReq = 1;
    P.grant(of(), { items: [boots], gold: 0, reason: 'test' }); await sleep(100);
    const uid = of().char.bag.find(i => i.slot === 'feet' && i.legendaryEffectId === 'free_move').uid;
    fast.item('equip', uid);
    assert.ok(await waitFor(() => fast.itemR.some(m => m.op === 'equip')), 'the equip was answered');
    assert.equal(fast.itemR.find(m => m.op === 'equip').ok, true, JSON.stringify(fast.itemR));
    assert.ok(await waitFor(() => fast.you.some(y => y.speedMul > 1)), 'the client is told its new speed: ' + JSON.stringify(fast.you.slice(-3)));
    const told = fast.you.filter(y => y.speedMul != null).at(-1);
    assert.ok(Math.abs(told.speedMul - 1.18) < 1e-6 && Math.abs(told.moveMul - 1.18) < 1e-6, 'x1.18: ' + JSON.stringify(told));
    assert.ok(Math.abs(of().entity.speedMul - 1.18) < 1e-6);
    // the same inputs for the same ticks: 2 s of running east at 20 Hz (the plain run, no sprint bit)
    const run2s = async () => {
      const a0 = { x: op().entity.x, z: op().entity.z }, b0 = { x: of().entity.x, z: of().entity.z };
      for (let k = 0; k < 40; k++) { for (const n of [plain, fast]) n.input({ s: (n.seq = (n.seq || 0) + 1), dt: 50, mx: 1, mz: 0, yaw: 0, b: 0 }); await sleep(50); }
      for (const n of [plain, fast]) n.input({ s: (n.seq += 1), dt: 50, mx: 0, mz: 0, yaw: 0, b: 0 });
      await sleep(250);
      return [Math.hypot(op().entity.x - a0.x, op().entity.z - a0.z), Math.hypot(of().entity.x - b0.x, of().entity.z - b0.z)];
    };
    const [dPlain, dFast] = await run2s();
    assert.ok(dPlain > 8, 'the plain one ran: ' + dPlain.toFixed(2) + ' m');
    assert.ok(Math.abs(dPlain - MOVE.run * 2) < 0.6, 'at the run speed: ' + dPlain.toFixed(2) + ' vs ' + (MOVE.run * 2).toFixed(2));
    const ratio = dFast / dPlain;
    assert.ok(Math.abs(ratio - 1.18) < 0.02, `boots cover 18% more ground in the same ticks: ${dFast.toFixed(2)} m vs ${dPlain.toFixed(2)} m (x${ratio.toFixed(3)})`);
    // not rubber-banded: what the client's predictor works out with the factor it was TOLD is where the server put it
    const st = { x: 0, y: 0, z: 0, vy: 0, airborne: false, speedMul: told.speedMul };
    for (let k = 0; k < 40; k++) stepMove(st, { mx: 1, mz: 0, b: 0 }, 50, { heightAt: () => 0 });
    assert.ok(Math.abs(st.x - dFast) < 0.35, `prediction ${st.x.toFixed(2)} m, server ${dFast.toFixed(2)} m`);
    const self = fast.lastSelf || null; void self;
    // the cap: a +80% bonus is held to +30%; a -90% slow never goes under half; then back to the boots
    const u = of().entity.r.unit, real = u.derived.movePct;
    u.derived.movePct = 80; await sleep(400);
    assert.ok(Math.abs(of().entity.speedMul - 1.3) < 1e-6, 'capped at +30%: ' + of().entity.speedMul);
    u.derived.movePct = -90; await sleep(400);
    assert.ok(Math.abs(of().entity.speedMul - 0.5) < 1e-6, 'never under half: ' + of().entity.speedMul);
    u.derived.movePct = real; await sleep(400);
    assert.ok(Math.abs(of().entity.speedMul - 1.18) < 1e-6);
    // a mount multiplies what the feet do
    of().char.mounts = ['trail_horse']; of().mount = 'trail_horse'; of().entity.mount = 'trail_horse';
    await sleep(400);
    const horse = P.mountBook ? P.mountBook.get('trail_horse').speed : null;
    assert.ok(of().entity.speedMul > 1.18 * 1.2, 'riding in fast boots: x' + of().entity.speedMul.toFixed(3) + (horse ? ' (horse x' + horse + ')' : ''));
    if (horse) assert.ok(Math.abs(of().entity.speedMul - 1.18 * horse) < 1e-6);
    of().mount = null; of().entity.mount = null; await sleep(400);
    // boots off: back to 1, and the client hears it
    fast.item('unequip', uid, 'feet');
    assert.ok(await waitFor(() => Math.abs(of().entity.speedMul - 1) < 1e-6), 'back to x1 without the boots: ' + of().entity.speedMul);
    assert.ok(await waitFor(() => fast.you.filter(y => y.speedMul != null).at(-1).speedMul === 1));
    // a heal on a full bar: `hit n:0, over` — nobody's miss, nobody's kill, nobody thrown or put in a fight
    fast.meter(true); await sleep(150);
    const e = of().entity, hp0 = e.hp, hit0 = of().lastHitAt || 0;
    copy.event({ type: 'hit', s: op().entity.id, d: e.id, n: 0, over: 25, kind: 'heal', ab: 'mend' });
    await sleep(500);
    assert.equal(e.dead, false); assert.equal(e.hp, hp0); assert.equal(of().lastHitAt || 0, hit0, 'a heal is not being hit');
    const row = fast.hits.find(r => r[4] === 'mend');
    assert.deepEqual(row, [op().entity.id, e.id, 0, 1, 'mend', '', 25, 0], 'the meter sees a heal of 0 with 25 overheal — flag 1 (heal), not miss, not kill');
    plain.close(); fast.close();
  } finally { await S.stop(); }
});
