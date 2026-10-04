// Protocol fuzz (PLAN §16): wrong types, huge strings, NaN-ish numbers, negative counts, other players'
// ids, random bytes, valid-but-out-of-order messages — the server stays up, a good client is unaffected,
// and a socket that keeps sending garbage is kicked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVirtualClock } from '../../js/net/clock.js';
import { CLIENT_MSGS, PROTOCOL_VERSION } from '../../js/net/protocol.js';
import { makeServer, joinAs, run, until } from './helpers.js';
import { ent as entOf_, roomOf as roomOf_ } from './helpers.js';
import { seedStream, next, int } from '../../js/sim/rng.js';

const VALUES = [null, true, false, 0, -1, -1e9, 1e300, 0.5, 65536, 2 ** 53, '', 'x'.repeat(300), '\u0000', '<script>', [], [1, 2], {}, { x: 1 }, { x: 'a', z: 1 }, { __proto__: { a: 1 } }];

function randomMsg(r, otherId) {
  const types = Object.keys(CLIENT_MSGS);
  const t = next(r) < 0.9 ? types[int(r, types.length)] : ['', 'admin', '__proto__', 'constructor', 'toString'][int(r, 5)];
  const o = { t };
  const spec = Object.prototype.hasOwnProperty.call(CLIENT_MSGS, t) ? CLIENT_MSGS[t] : null;
  const fields = spec ? Object.keys(spec.fields) : ['a'];
  for (const f of fields) if (next(r) < 0.8) o[f] = next(r) < 0.3 ? otherId : VALUES[int(r, VALUES.length)];
  if (next(r) < 0.1) o.extra = 1;
  return o;
}

test('fuzz: 5,000 hostile frames from one socket on each path; server keeps ticking, good client unaffected', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock });
  await srv.ready;
  const good = await joinAs(srv, clock, 'Steady');
  const victim = await joinAs(srv, clock, 'Victim');
  const r = seedStream(99, 'fuzz');
  let kicked = 0;
  for (const path of ['/gw', '/p/0']) {
    for (let round = 0; round < 25; round++) {
      const sock = srv.connect(path);
      let open = true;
      sock.onclose = () => { open = false; kicked++; };
      await run(clock, 20);
      for (let i = 0; i < 100 && open; i++) {
        const k = next(r);
        if (k < 0.1) sock.send(new Uint8Array([int(r, 256), int(r, 256), int(r, 256)]));
        else if (k < 0.2) sock.send('{"t":"in"' + 'x'.repeat(int(r, 40)));
        else if (k < 0.25) sock.send('x'.repeat(17000));
        else sock.send(JSON.stringify(randomMsg(r, victim.you)));
        if (i % 10 === 0) await run(clock, 10);
      }
      await run(clock, 50);
      sock.close();
    }
  }
  await run(clock, 500);
  const st = srv.world.status();
  assert.ok(st.bad >= 900, 'bad messages counted: ' + st.bad);
  assert.ok(st.kicks >= 40, 'abusive sockets kicked: ' + st.kicks);
  assert.equal(st.rulesErrors, 0);
  assert.equal(good.status, 'online');
  assert.equal(victim.status, 'online');
  // the good client still moves and is still seen
  const e = entOf_(srv, good), x0 = e.x;
  let s = 1000;
  for (let i = 0; i < 10; i++) { good.input({ s: ++s, dt: 50, mx: 1, mz: 0, yaw: 0, b: 0 }); await run(clock, 50); }
  assert.ok(e.x > x0 + 2);
  assert.ok(victim.mirror.ents.has(good.you));
  assert.equal(entOf_(srv, victim).dead, false);
  good.close(); victim.close(); await srv.stop();
});

test('order rules: game messages before enter, gateway messages before hello, are refused', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock });
  await srv.ready;
  const s = srv.connect('/p/0');
  const got = [];
  s.onmessage = ev => got.push(typeof ev.data === 'string' ? JSON.parse(ev.data) : 'bin');
  await run(clock, 20);
  s.send(JSON.stringify({ t: 'in', s: 1, dt: 50, mx: 1, mz: 0, yaw: 0, b: 0 }));
  s.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, build: 'dev' }));
  s.send(JSON.stringify({ t: 'say', text: 'hi' }));
  s.send(JSON.stringify({ t: 'enter', ticket: 'forged' }));
  await run(clock, 100);
  assert.equal(got[0].t, 'welcome');
  assert.ok(got.some(m => m.t === 'err' && m.code === 'ticket'), 'forged ticket refused');
  assert.equal(srv.world.status().bad, 2);
  await srv.stop();
});

test('handshake: wrong protocol version or build is refused with a reload message', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock });
  await srv.ready;
  for (const [v, build, code] of [[PROTOCOL_VERSION + 1, 'dev', 'version'], [PROTOCOL_VERSION, 'old', 'build']]) {
    const s = srv.connect('/gw');
    const got = []; let closed = false;
    s.onmessage = ev => got.push(JSON.parse(ev.data)); s.onclose = () => { closed = true; };
    await run(clock, 20);
    s.send(JSON.stringify({ t: 'hello', v, build }));
    await run(clock, 50);
    assert.equal(got[0].t, 'refuse'); assert.equal(got[0].code, code); assert.ok(/reload/i.test(got[0].msg));
    assert.ok(closed);
  }
  await srv.stop();
});

test('casting at another player\'s id or a missing id does not hurt them or crash', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock });
  await srv.ready;
  const a = await joinAs(srv, clock, 'Attacker'), b = await joinAs(srv, clock, 'Target');
  const eb = entOf_(srv, b);
  entOf_(srv, a).moveTo(eb.x + 1, eb.z);
  await run(clock, 100);
  for (let i = 0; i < 5; i++) { a.cast({ slot: 0, target: b.you }); a.cast({ slot: 0, target: 65000 }); a.cast({ slot: 99 }); await run(clock, 1000); }
  assert.equal(eb.hp, eb.hpMax, 'no friendly fire');
  a.close(); b.close(); await srv.stop();
});
