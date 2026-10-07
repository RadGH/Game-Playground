// Stream D-world — play-test 5 in a real browser against a real server (tests/D/m3-server.mjs):
//   T6/T22  a pair of daggers: held by the handle at rest and at the ready, and the swings alternate hands (screenshots)
//   T7      a two-hander in each hand: both drawn, both shouldered, the twin strikes play (screenshots)
//   T15/T16 every caster attack form and the sceptre's swing drawn through the client's own event handlers — with NO new
//           shader program linked while they play (the stutter this client had twice before)
//   T4      each class's revive on a fallen player, then the body getting up (`standUp`)
//   T25     a fish pool seen from 60 m, a cast, a bite, the tug, the catch held up — again with no new program
// The effects are driven through `tv.fxEvent` (the same path a server event takes), so this spec does not wait on the
// other streams' server work; tests/A and the e2e cover the wire.
// Screenshots: tests/D/shots/t*-*.png
// Run (shared lock): cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/playtest5.spec.js
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
let srv, port, page, ctx;
const errors = [];

test.beforeAll(async ({ browser }) => {
  test.setTimeout(480000);
  port = await freePort(); const hp = await freePort();
  srv = spawn(process.execPath, [join(HERE, 'm3-server.mjs'), '--port', String(port), '--hook', String(hp)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 30000);
    srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } });
    srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out)));
  });
  mkdirSync(SHOTS, { recursive: true });
  ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
  page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/?autoplay=1&name=Sable&cls=rogue&quality=low&tod=0.45`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 60000 });
  await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 300000 });
  await page.waitForFunction(() => !!thousandvale.actors.get(tv.state().you.id)?.body, null, { timeout: 60000 });
  await page.evaluate(() => { tv.hud(false); });
});
test.afterAll(async () => { await ctx?.close(); srv?.kill('SIGTERM'); });

/** Dress my own body in a worn set and wait for it. */
const wear = gear => page.evaluate(async gear => {
  const a = thousandvale.actors.get(tv.state().you.id);
  await thousandvale.actors.setLook(a.id, { ...a.look, gear });
  await new Promise(r => setTimeout(r, 400));
  return { hold: a.body.hold, anim: a.anim };
}, gear);
/** Swing `n` times, `gap` ms apart; -> the clip that played for each. */
const swings = (n, gap = 750, o = null) => page.evaluate(async ([n, gap, o]) => {
  const a = thousandvale.actors.get(tv.state().you.id), out = [];
  for (let i = 0; i < n; i++) { thousandvale.actors.playAttack(a.id, null, o); out.push(a.anim); await new Promise(r => setTimeout(r, gap)); }      // read at once: this VM's software GPU spends up to a second on a frame, longer than a strike
  return out;
}, [n, gap, o]);
const shot = name => page.screenshot({ path: join(SHOTS, name) });

test('T6 + T22: a pair of daggers is held by the handle and both hands strike', async () => {
  test.setTimeout(240000);
  const w = await wear({ weapon: { base: 'dagger', rarity: 'rare' }, offhand: { base: 'dagger', rarity: 'rare' } });
  expect(w.hold.right).toBe('dagger'); expect(w.hold.left).toBe('dagger'); expect(w.hold.dual).toBe(true);
  await page.evaluate(() => tv.view(3.0, 0.2, Math.PI));
  await page.waitForTimeout(2500);
  await shot('t22-daggers-idle-front.png');
  await page.evaluate(() => { const a = thousandvale.actors.get(tv.state().you.id); a.lastCombat = performance.now(); });
  await page.waitForTimeout(1200);
  await shot('t22-daggers-ready-front.png');
  // in every carrying pose the knife stands off the forearm (the grip bone is turned): measured on the live skeleton
  const off = await page.evaluate(() => {
    const a = thousandvale.actors.get(tv.state().you.id), P = a.body.parts, T = window.thousandvale.THREE || null, out = {};
    for (const s of ['R', 'L']) {
      const e = P['elbow' + s].getWorldPosition(P['elbow' + s].position.clone()), h = P['hand' + s].getWorldPosition(P['hand' + s].position.clone());
      const fore = h.clone().sub(e).normalize(), m = P['grip' + s].matrixWorld.elements;
      const w = fore.clone().set(-m[4], -m[5], -m[6]).normalize();
      out[s] = Math.round(Math.acos(Math.max(-1, Math.min(1, fore.dot(w)))) * 180 / Math.PI);
    }
    return out;
  });
  console.log('[T22] degrees between each dagger and its forearm at the ready:', JSON.stringify(off));
  expect(off.R).toBeGreaterThanOrEqual(25); expect(off.L).toBeGreaterThanOrEqual(25);
  const seq = await swings(5);
  console.log('[T6] dagger swings:', seq.join(' '));
  expect(seq.slice(0, 5)).toEqual(['dualStabR', 'dualStabL', 'dualStabR', 'dualStabL', 'dualFlurry']);
  // mid-strike pictures of each hand
  for (const [i, name] of [[0, 'main'], [1, 'off']]) {
    await page.evaluate(i => { const a = thousandvale.actors.get(tv.state().you.id); a.swingN = i; a.swingAt = 0; thousandvale.actors.playAttack(a.id, null); }, i);
    await page.waitForTimeout(190);
    await shot(`t6-daggers-${name}-hand.png`);
    await page.waitForTimeout(700);
  }
  // the server naming the off hand (C swings it on its own clock) plays the off hand's strike
  expect((await swings(1, 700, { hand: 'off', force: true }))[0]).toBe('dualStabL');
  // swords: cuts, and both together on the fifth
  const s2 = await wear({ weapon: { base: 'longsword', rarity: 'normal' }, offhand: { base: 'battleaxe', rarity: 'normal' } });
  expect(s2.hold.dual).toBe(true);
  await page.evaluate(() => { const a = thousandvale.actors.get(tv.state().you.id); a.swingN = 0; a.offSeen = false; a.swingAt = 0; });
  const seq2 = await swings(5);
  console.log('[T6] sword + axe swings:', seq2.join(' '));
  expect(seq2).toEqual(['dualSlashR', 'dualSlashL', 'dualSlashR', 'dualSlashL', 'dualCross']);
  await page.evaluate(() => { const a = thousandvale.actors.get(tv.state().you.id); a.swingN = 4; a.swingAt = 0; thousandvale.actors.playAttack(a.id, null); });
  await page.waitForTimeout(330);
  await shot('t6-sword-axe-both.png');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('T7: a two-hander in each hand — drawn, shouldered, and the twin strikes play', async () => {
  test.setTimeout(180000);
  const w = await wear({ weapon: { base: 'greatsword', rarity: 'rare' }, offhand: { base: 'axe2h', rarity: 'normal' } });
  expect(w.hold.dualTwo).toBe(true);
  await page.waitForTimeout(6500);                       // out of the ready stance: the idle carry
  await page.evaluate(() => tv.view(3.6, 0.2, Math.PI));
  await page.waitForTimeout(800);
  await shot('t7-two-twohanders-idle.png');
  await page.evaluate(() => { const a = thousandvale.actors.get(tv.state().you.id); a.swingN = 0; a.offSeen = false; a.swingAt = 0; });
  const seq = await swings(5, 1150);
  console.log('[T7] twin swings:', seq.join(' '));
  expect(seq).toEqual(['twinChopR', 'twinChopL', 'twinChopR', 'twinChopL', 'twinCrash']);
  await page.evaluate(() => { const a = thousandvale.actors.get(tv.state().you.id); a.swingN = 4; a.swingAt = 0; thousandvale.actors.playAttack(a.id, null); });
  await page.waitForTimeout(430);
  await shot('t7-twin-crash.png');
  // two staves (a caster with the perk): the second is a staff, not a shield
  const st = await wear({ weapon: { base: 'staff', rarity: 'normal' }, offhand: { base: 'staff', rarity: 'normal' } });
  expect(st.hold.left).toBe('staff');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('T15 + T16: every attack form and the sceptre swing draw, and link no new shader', async () => {
  test.setTimeout(240000);
  await wear({ weapon: { base: 'wand', rarity: 'normal' } });
  await page.evaluate(() => tv.view(13, 0.5, Math.PI * 0.8));
  await page.waitForTimeout(1500);
  await page.evaluate(() => tv.perf(true));
  const me = await page.evaluate(() => { const s = tv.state().you; return { id: s.id, x: s.x, z: s.z }; });
  const fire = (ev, wait, name) => page.evaluate(ev => tv.fxEvent(ev), ev).then(() => page.waitForTimeout(wait)).then(() => (name ? shot(name) : null));
  const at = { type: 'fx', kind: 'attack', id: me.id, x: me.x, z: me.z, yaw: 0, wk: 'staff', wt: 'staff' };
  await fire({ ...at, shape: 'beam', form: 'beam', el: 'holy', reach: 18 }, 110, 't15-form-beam.png');
  await page.waitForTimeout(700);
  await fire({ ...at, shape: 'cone', form: 'cone', el: 'fire', reach: 9, arc: 1.0 }, 190, 't15-form-cone.png');
  await page.waitForTimeout(700);
  await fire({ ...at, shape: 'nova', form: 'nova', el: 'ice', r: 5 }, 230, 't15-form-nova.png');
  await page.waitForTimeout(700);
  await fire({ ...at, shape: 'lob', form: 'lob', el: 'poison', to: { x: me.x, z: me.z + 10 }, ms: 500 }, 640, 't15-form-lob.png');
  await page.waitForTimeout(600);
  for (const [form, el] of [['burst', 'fire'], ['fork', 'lightning'], ['chain', 'lightning'], ['fan', 'arcane'], ['pool', 'ice'], ['seeking', 'shadow'], ['heavy', 'holy']]) {
    await fire({ type: 'fx', kind: 'bolt', basic: 1, form, id: me.id, el, from: { x: me.x, z: me.z }, to: { x: me.x + 1, z: me.z + 9 }, ms: 260 }, 380, form === 'burst' || form === 'fork' ? `t15-form-${form}.png` : null);
    await page.waitForTimeout(350);
  }
  await fire({ type: 'fx', kind: 'ward', id: me.id, amt: 20, el: 'arcane' }, 260, 't15-form-ward.png');
  await page.waitForTimeout(700);
  await page.evaluate(() => tv.view(6, 0.45, Math.PI * 0.8));
  await fire({ type: 'fx', kind: 'attack', shape: 'swing', id: me.id, x: me.x, z: me.z, yaw: 0, wk: 'melee', wt: 'scepter', el: 'fire', imbue: 1, reach: 2.6, arc: 1.7, hand: 'main', step: 0 }, 130, 't16-sceptre-swing.png');
  await page.waitForTimeout(900);
  const r = await page.evaluate(() => ({ fx: tv.fx5(), perf: tv.perf() }));
  console.log('[T15]', JSON.stringify({ forms: r.fx.forms, links: r.perf.stalls?.links ?? r.perf.links, newPrograms: r.perf.newProgramNames, busy: r.perf.stalls?.maxBusyMs }));
  expect(r.fx.forms.beams).toBeGreaterThanOrEqual(1); expect(r.fx.forms.fans).toBeGreaterThanOrEqual(1); expect(r.fx.forms.domes).toBeGreaterThanOrEqual(1);
  expect(r.fx.forms.arcs).toBe(1); expect(r.fx.forms.imbued).toBe(1); expect(r.fx.forms.forks).toBeGreaterThanOrEqual(2);
  expect(Object.keys(r.fx.forms.forms).length).toBeGreaterThanOrEqual(10);
  expect(r.perf.newProgramNames, 'no new shader program while the forms play').toEqual([]);
  await page.waitForTimeout(2500);
  expect((await page.evaluate(() => tv.fx5())).live, 'every pooled piece is put away').toBe(0);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('T4: each class\'s revive on a fallen player, then the body gets up', async () => {
  test.setTimeout(300000);
  const me = await page.evaluate(() => { const s = tv.state().you; return { id: s.id, x: s.x, z: s.z }; });
  // a fallen player four metres in front of me (a body on this screen only)
  await page.evaluate(([x, z]) => {
    const T = thousandvale, y = T.WS.terrain.heightAt(x, z) || 0;
    const a = T.actors.add({ id: 'fallen', kind: 'player', name: 'Orrin', level: 4, hp: 0, hpMax: 100, x, y, z, yaw: 2, look: { race: 'human', cls: 'knight', seed: 77, gear: { chest: { base: 'heavy_chest', rarity: 'normal' }, weapon: { base: 'longsword', rarity: 'normal' } } } });
    a.still = { x, y, z, yaw: 2, speed: 0 }; T.actors.setDead('fallen', true);
  }, [me.x + 0.5, me.z + 4]);
  await page.waitForFunction(() => !!thousandvale.actors.get('fallen')?.body, null, { timeout: 90000 });
  await page.evaluate(() => tv.view(9, 0.5, Math.PI * 0.75));
  await page.waitForTimeout(2500);
  await page.evaluate(() => tv.perf(true));
  const styles = [['raise_the_fallen', 'choir', 1600], ['second_dawn', 'sunburst', 0], ['green_return', 'bloom', 1400], ['oathbound_rise', 'aegis', 1400], ['unquiet_return', 'grave', 0], ['call_back_the_spirit', 'spirits', 2200]];
  for (const [skill, style, ms] of styles) {
    if (ms) {
      await page.evaluate(([id, skill, style, ms]) => tv.fxEvent({ type: 'fx', kind: 'reviveCast', id, on: skill === 'raise_the_fallen' ? ['fallen'] : 'fallen', ab: skill, style, ms }), [me.id, skill, style, ms]);
      await page.waitForTimeout(Math.round(ms * 0.7));
      await shot(`t4-revive-${style}-cast.png`);
      await page.waitForTimeout(Math.round(ms * 0.3) + 50);
    }
    await page.evaluate(([id, skill]) => tv.fxEvent({ type: 'fx', kind: 'revive', id: 'fallen', by: id, skill }), [me.id, skill]);
    await page.waitForTimeout(style === 'spirits' ? 420 : 200);
    await shot(`t4-revive-${style}.png`);
    await page.waitForTimeout(1500);
  }
  const r = await page.evaluate(() => ({ fx: tv.fx5().revives, perf: tv.perf() }));
  console.log('[T4]', JSON.stringify({ revives: r.fx, newPrograms: r.perf.newProgramNames }));
  expect(r.fx.lands).toBe(6); expect(Object.keys(r.fx.byStyle).sort()).toEqual(['aegis', 'bloom', 'choir', 'grave', 'spirits', 'sunburst']);
  expect(r.perf.newProgramNames, 'no new shader program while the revives play').toEqual([]);
  // …and the body gets up: off the ground, onto a knee, upright
  const first = await page.evaluate(() => { tv.view(4.5, 0.3, Math.PI * 0.75); thousandvale.actors.setHp('fallen', 60, 100); thousandvale.actors.setDead('fallen', false); return thousandvale.actors.get('fallen').anim; });
  const seen = [first];
  for (const [wait, name] of [[350, 'a'], [450, 'b'], [450, 'c']]) { await page.waitForTimeout(wait); seen.push(await page.evaluate(() => thousandvale.actors.get('fallen').anim)); await shot(`t4-standup-${name}.png`); }
  expect(seen[0]).toBe('standUp');
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => thousandvale.actors.get('fallen').anim)).toMatch(/idle|ready/);
  await page.evaluate(() => thousandvale.actors.remove('fallen'));
  expect(errors, errors.join('\n')).toEqual([]);
});

test('T25: a pool seen from the road, the cast, the bite, the tug and the catch', async () => {
  test.setTimeout(240000);
  await wear({ weapon: { base: 'longsword', rarity: 'normal' }, offhand: { base: 'shield', rarity: 'normal' } });
  const me = await page.evaluate(() => { const s = tv.state().you; return { id: s.id, x: s.x, z: s.z }; });
  await page.evaluate(() => tv.perf(true));
  // a pool nine metres ahead; first seen from 60 m back
  await page.evaluate(() => tv.fishDemo({ pool: 'demo-pool', dz: 9, tier: 2 }));
  await page.evaluate(([x, z]) => { const y = thousandvale.WS.terrain.heightAt(x, z) || 0; tv.fly(x + 12, y + 9, z - 52, x, y, z + 9); }, [me.x, me.z]);
  await page.waitForTimeout(3200);
  await shot('t25-pool-from-60m.png');
  const jumped = await page.waitForFunction(() => tv.fx5().angling.jumps >= 1, null, { timeout: 20000 }).then(() => true, () => false);
  expect(jumped, 'the pool\'s fish jumps').toBe(true);
  await page.evaluate(() => { tv.fly(null); tv.view(7, 0.35, Math.PI * 0.72); });
  await page.waitForTimeout(1200);
  const phase = async (name, o = {}) => page.evaluate(([name, o]) => { tv.fxEvent({ type: 'fx', kind: 'fish', id: tv.state().you.id, phase: name, x: tv.state().you.x, z: tv.state().you.z + 7, ...o }); return thousandvale.actors.get(tv.state().you.id).anim; }, [name, o]);
  const anim = () => page.evaluate(() => thousandvale.actors.get(tv.state().you.id).anim);
  expect(await phase('cast')).toBe('fishCast');
  await page.waitForTimeout(420); await shot('t25-cast-back.png');
  await page.waitForTimeout(330); await shot('t25-cast-flying.png');
  await page.waitForTimeout(2500); expect(await anim()).toBe('fishWait'); await shot('t25-waiting.png');
  const st = await page.evaluate(() => { const s = thousandvale.angling.lines.get(tv.state().you.id), a = thousandvale.actors.get(tv.state().you.id); return { rod: s.rod.parent === a.body.parts.handR, float: s.float.visible, line: s.line.visible, grip: a.body.parts.gripR.scale.x }; });
  expect(st.rod).toBe(true); expect(st.float).toBe(true); expect(st.line).toBe(true);
  expect(st.grip, 'the weapons are put away while fishing').toBeLessThan(0.01);
  await phase('bite'); await page.waitForTimeout(160); await shot('t25-bite.png');
  await phase('tug'); await page.evaluate(() => window.dispatchEvent(new CustomEvent('tv:fish', { detail: { state: 'tug', tension: 0.8 } })));
  await page.waitForTimeout(1500); expect(await anim()).toBe('fishReel'); await shot('t25-tug.png');
  expect(await phase('catch', { rarity: 'rare' })).toBe('fishShow');
  await page.waitForTimeout(300); await shot('t25-catch-flying.png');
  await page.waitForTimeout(700); await shot('t25-catch-held.png');
  await phase('end');
  await page.waitForTimeout(4500);
  const end = await page.evaluate(() => { const a = thousandvale.actors.get(tv.state().you.id); return { fx: tv.fx5(), perf: tv.perf(), anim: a.anim, grip: a.body.parts.gripR.scale.x }; });
  console.log('[T25]', JSON.stringify({ angling: end.fx.angling, lines: end.fx.lines, newPrograms: end.perf.newProgramNames, anim: end.anim }));
  expect(end.fx.lines, 'the line is wound in').toBe(0);
  expect(end.grip, 'the sword is back in the hand').toBeGreaterThan(0.9);
  expect(end.fx.angling.casts).toBe(1); expect(end.fx.angling.bites).toBe(1); expect(end.fx.angling.catches).toBe(1);
  expect(end.perf.newProgramNames, 'no new shader program while fishing').toEqual([]);
  await page.evaluate(() => thousandvale.angling.removePool('demo-pool'));
  expect(errors, errors.join('\n')).toEqual([]);
});

test('T23 slots (C\'s addendum): a cloak, a belt, a lantern and a worn torch are drawn, and the light lights', async () => {
  test.setTimeout(180000);
  await page.evaluate(() => { tv.view(3.4, 0.2, Math.PI * 0.2); tv.setTime?.(0.98); });
  const worn = gear => page.evaluate(async gear => {
    const a = thousandvale.actors.get(tv.state().you.id);
    await thousandvale.actors.setLook(a.id, { ...a.look, gear });
    await new Promise(r => setTimeout(r, 1500));
    const av = await (await import('./js/client/looks.js')).avatarFor(a.look);
    return { cape: av.cape?.id, decor: av.decor?.id, offhand: av.offhand?.id, light: !!a.torchLight, range: a.torchLight?.distance ?? null };
  }, gear);
  const a = await worn({ chest: { base: 'light_chest', rarity: 'normal' }, back: { base: 'travel_cloak', g5: 'g5_swallowtail', rarity: 'rare' }, waist: { base: 'leather_belt', g5: 'g5_girdle', rarity: 'normal' }, light: { base: 'hand_lantern', g5: 'g5_hexlantern', rarity: 'normal' } });
  console.log('[T23 slots] cloak + belt + lantern:', JSON.stringify(a));
  expect(a.cape).toBe('g5_swallowtail'); expect(a.decor).toBe('g5_girdle'); expect(a.light).toBe(true); expect(a.range).toBe(16);
  await shot('t23-cloak-belt-back.png');
  const b = await worn({ chest: { base: 'light_chest', rarity: 'normal' }, light: { base: 'hand_lantern', g5: 'g5_hexlantern', rarity: 'normal' } });
  expect(b.decor).toBe('g5_hexlantern');
  await page.evaluate(() => tv.view(3.4, 0.2, Math.PI));
  await page.waitForTimeout(800);
  await shot('t23-lantern-night.png');
  const c = await worn({ weapon: { base: 'longsword', rarity: 'normal' }, light: { base: 'pitch_torch', g5: 'g5_cresset', rarity: 'normal' } });
  console.log('[T23 slots] worn torch:', JSON.stringify(c));
  expect(c.offhand).toBe('g5_cresset'); expect(c.light).toBe(true); expect(c.range).toBe(10);
  await shot('t23-torch-offhand-night.png');
  const d = await worn({ weapon: { base: 'longsword', rarity: 'normal' }, offhand: { base: 'shield', rarity: 'normal' }, light: { base: 'pitch_torch', g5: 'g5_cresset', rarity: 'normal' } });
  expect(d.offhand).toBe('fh_heater_shield'); expect(d.decor).toBe('belt_torch');
  const e = await worn({ weapon: { base: 'longsword', rarity: 'normal' } });
  expect(e.light, 'the light goes out when the lantern comes off').toBe(false);
  await page.evaluate(() => tv.setTime?.(0.45));
  expect(errors, errors.join('\n')).toEqual([]);
});
