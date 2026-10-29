// Kestrel in Thousandvale (batch 1): screenshots in the REAL game under ?chars=kestrel.
//
// Boots the game's test server (prototypes/thousandvale/tests/D/m3-server.mjs, its own ports), opens the client with
// ?autoplay=1&chars=kestrel, lines up client-only characters beside you (real Thousandvale looks — avatarFor({race,
// cls, seed}) — with the held items swapped per shot), poses them with the game's own clip logic (emote / working /
// oneShot) and freezes the clip at a chosen moment (actor.freeze), then frames them with the debug fly camera.
//
//   cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock node avatar-3d/kestrel/kit/tools/tv-shots.mjs [scene ...] [--out dir] [--chibi]
//   scenes: crowd combat ride sit fish mine closeup all (default all)   --chibi = the same scenes with Chibi 2.5 (to compare)
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');
const TV = join(ROOT, 'prototypes', 'thousandvale');
const args = process.argv.slice(2);
const outI = args.indexOf('--out');
const OUT = outI >= 0 ? args[outI + 1] : join(HERE, '..', 'shots', 'tv-batch1');
const CHIBI = args.includes('--chibi');
let scenes = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
if (!scenes.length || scenes.includes('all')) scenes = ['crowd', 'combat', 'ride', 'sit', 'fish', 'mine', 'closeup'];
mkdirSync(OUT, { recursive: true });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

const port = await freePort(), hook = await freePort();
const srv = spawn(process.execPath, [join(TV, 'tests', 'D', 'm3-server.mjs'), '--port', String(port), '--hook', String(hook)], { cwd: TV, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
srv.stderr.on('data', d => { log += d; });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('server did not start\n' + log)), 60000);
  srv.stdout.on('data', d => { if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } });
  srv.on('exit', c => rej(new Error('server exited ' + c + '\n' + log)));
});
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', r => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
const url = `http://127.0.0.1:${port}/prototypes/thousandvale/?autoplay=1&name=Kestra&cls=warrior&quality=high&tod=0.42${CHIBI ? '' : '&chars=kestrel'}`;
await page.goto(url);
await page.waitForFunction(() => { const T = window.thousandvale; return T?.S?.selfId != null && T.actors.get(T.S.selfId)?.body; }, null, { timeout: 240000 });
await page.waitForTimeout(3000);
await page.evaluate(() => { thousandvale.tv.hud(false); thousandvale.tv.setTime(0.42); });

/** Line up characters in front of the player. specs: [{ race, cls, seed, held?, offhand?, cape?, clip?, mode?, t?, mount?, tool?, rod? }] */
async function lineup(specs, { gap = 1.6, depth = 5, yaw = Math.PI } = {}) {
  return page.evaluate(async ({ specs, gap, depth, yaw }) => {
    const T = window.thousandvale, A = T.actors, p = T.S.predictor.pos;
    for (const id of [...A.actors.keys()].filter(k => String(k).startsWith('shot-'))) A.remove(id);
    const { avatarFor } = await import('/prototypes/thousandvale/js/client/looks.js');
    const ids = [];
    for (let i = 0; i < specs.length; i++) {
      const sp = specs[i];
      const av = structuredClone(await avatarFor({ race: sp.race || 'human', cls: sp.cls || 'warrior', seed: sp.seed || 1 + i }));
      for (const k of ['held', 'offhand', 'cape', 'hat', 'decor']) if (sp[k] !== undefined) av[k] = typeof sp[k] === 'string' ? { ...(av[k] || {}), id: sp[k] } : sp[k];
      if (sp.body) av.body = { ...av.body, ...sp.body };
      const x = p.x + (i - (specs.length - 1) / 2) * gap, z = p.z + depth;
      const id = 'shot-' + i;
      const a = A.add({ id, kind: 'player', name: sp.name || (sp.cls || '') + ' ' + (i + 1), level: 5, hp: 1, hpMax: 1, hostile: false, look: av, x, y: p.y, z, yaw });
      a.still = { x, y: p.y, z, yaw, speed: 0 };
      ids.push(id);
    }
    return ids;
  }, { specs, gap, depth, yaw });
}
const ready = ids => page.waitForFunction(ids => ids.every(id => window.thousandvale.actors.get(id)?.body), ids, { timeout: 240000 });
async function pose(ids, specs) {
  await page.evaluate(async ({ ids, specs }) => {
    const T = window.thousandvale, A = T.actors;
    const THREE = await import('three');
    const dual = await import('/avatar-3d/js/chibi2-motion-dual.js'), ang = await import('/prototypes/thousandvale/js/client/angling-view.js');
    ids.forEach((id, i) => {
      const a = A.get(id), sp = specs[i];
      if (sp.mount) A.setMount(id, sp.mount);
      if (sp.prof) T.profView.setWorking(id, { prof: sp.prof });
      if (sp.mode === 'emote') a.emote = sp.clip;
      else if (sp.mode === 'fish') a.fishing = sp.clip === 'fishReel' ? 'tug' : 'wait';
      else if (sp.clip && !sp.prof && !sp.mount) { a.oneShot = sp.clip; a.oneShotUntil = performance.now() + 1e9; }
      if (sp.rod && a.body) {
        const rod = new THREE.Mesh(ang.rodGeometry(), new THREE.MeshStandardMaterial({ color: '#8a6a3a' }));
        rod.position.set(...dual.ROD_MOUNT.position); rod.rotation.set(...dual.ROD_MOUNT.rotation);
        a.body.parts[dual.ROD_MOUNT.bone].add(rod);
      }
    });
  }, { ids, specs });
  await page.waitForTimeout(2500);
  await page.evaluate(({ ids, specs }) => ids.forEach((id, i) => { const b = window.thousandvale.actors.get(id)?.body; if (specs[i].t != null) b?.freeze?.(specs[i].t); }), { ids, specs });
  await page.waitForTimeout(500);
}
/** Camera: `from` and `at` relative to the line's centre (x across, y up, z toward the camera side). */
async function cam(from, at, depth = 5) {
  await page.evaluate(({ from, at, depth }) => {
    const T = window.thousandvale, p = T.S.predictor.pos;
    T.S.fly = { x: p.x + from[0], y: p.y + from[1], z: p.z + depth + from[2], lx: p.x + at[0], ly: p.y + at[1], lz: p.z + depth + at[2] };
  }, { from, at, depth });
  await page.waitForTimeout(1200);
}
const shot = name => page.screenshot({ path: join(OUT, (CHIBI ? 'chibi-' : '') + name + '.png') });

const SC = {
  async combat() {
    const specs = [
      { cls: 'knight', held: { id: 'fh_longsword', color: '#c8ccd6' }, offhand: { id: 'fh_heater_shield', color: '#8a3a2a' }, clip: 'attack', t: 0.42 },
      { cls: 'ranger', held: { id: 'bow', color: '#8a6a3a' }, offhand: 'none', clip: 'attack', t: 0.3 },
      { cls: 'warrior', held: { id: 'fh_greatsword', color: '#c8ccd6' }, offhand: 'none', clip: 'ready', mode: 'emote' },
      { cls: 'rogue', held: { id: 'fh_daggers', color: '#c8ccd6' }, offhand: 'none', clip: 'dualSlashR', t: 0.25 },
      { cls: 'mage', held: { id: 'staff_orb', color: '#6a4a2a' }, offhand: 'none', clip: 'attack', t: 0.35 },
      { cls: 'paladin', held: { id: 'fh_spear', color: '#c8ccd6' }, offhand: 'none', clip: 'attack', t: 0.2 },
    ];
    const ids = await lineup(specs); await ready(ids); await pose(ids, specs);
    await cam([1.5, 2.2, -4.6], [0, 1.1, 0]); await shot('combat-front');
    await cam([-6.5, 2.0, -1.5], [0, 1.1, 0]); await shot('combat-side');
    // the stand-still carry too (idle)
    await page.evaluate(ids => ids.forEach(id => { const a = window.thousandvale.actors.get(id); a.oneShot = null; a.emote = null; a.body.freeze(null); }), ids);
    await page.waitForTimeout(1500);
    await cam([1.5, 2.0, -4.2], [0, 1.0, 0]); await shot('carry-idle');
  },
  async crowd() {
    const t0 = Date.now();
    // batch 5: CROWD_N / CROWD_R pick the crowd (default the batch-1 one: 30 within 10 m)
    const N = +(process.env.CROWD_N || 30), RAD = +(process.env.CROWD_R || 10);
    await page.evaluate(([n, r]) => window.thousandvale.tv.crowd(n, r), [N, RAD]);
    // time until every crowd body near enough for a full body has one, then the frame rate with them walking
    await page.waitForFunction(() => { const A = window.thousandvale.actors; const c = [...A.actors.values()].filter(a => String(a.id).startsWith('crowd-') && a.lod !== 'far'); return c.length && c.every(a => a.body); }, null, { timeout: 300000, polling: 500 }).catch(() => {});
    const builtS = (Date.now() - t0) / 1000;
    const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 5000) requestAnimationFrame(f); else r(n / ((performance.now() - t) / 1000)); }; requestAnimationFrame(f); }));
    console.log('CROWD', JSON.stringify({ n: N, radius: RAD, builtS, fps: +fps.toFixed(1), lod: await page.evaluate(() => window.thousandvale.actors.lodStats), kestrelLow: await page.evaluate(() => [...window.thousandvale.actors.actors.values()].filter(a => String(a.id).startsWith('crowd-') && a.body?.lod === 1).length) }));
    await cam([0, 6, -9], [0, 0.8, 4]); await shot('crowd');
    await page.evaluate(() => window.thousandvale.tv.crowd(0));
  },
  async ride() {
    const specs = [{ cls: 'knight', mount: 'horse' }, { cls: 'ranger', race: 'elf', mount: 'horse', seed: 4 }, { cls: 'warrior', race: 'dwarf', mount: 'pony', seed: 9 }];
    const ids = await lineup(specs, { gap: 3.2 }); await ready(ids); await pose(ids, specs);
    await page.waitForTimeout(2000);
    await cam([-4.5, 2.2, -3.5], [0, 1.2, 0]); await shot('ride');
  },
  async sit() {
    const specs = [{ cls: 'bard', clip: 'sitGround', mode: 'emote' }, { cls: 'cleric', clip: 'drink', t: 0.6 }, { cls: 'monk', clip: 'cheer', t: 0.6 }, { cls: 'druid', clip: 'wave', mode: 'emote' }];
    const ids = await lineup(specs); await ready(ids); await pose(ids, specs);
    await cam([1, 1.8, -4], [0, 0.8, 0]); await shot('sit-emotes');
  },
  async fish() {
    const specs = [{ cls: 'ranger', clip: 'fishWait', mode: 'fish', rod: true }, { cls: 'rogue', clip: 'fishReel', mode: 'fish', rod: true, seed: 5 }];
    const ids = await lineup(specs, { gap: 2.4 }); await ready(ids); await pose(ids, specs);
    await cam([-3.5, 1.8, -3.5], [0, 1.1, 0]); await shot('fish');
  },
  async mine() {
    const specs = [{ cls: 'warrior', prof: 'mining', t: 0.3 }, { cls: 'druid', prof: 'logging', seed: 3, t: 0.3 }, { cls: 'bard', prof: 'smithing', seed: 6, t: 0.3 }];
    const ids = await lineup(specs, { gap: 2 }); await ready(ids); await pose(ids, specs);
    await cam([-3.5, 1.9, -3.8], [0, 0.9, 0]); await shot('work');
  },
  async closeup() {
    const specs = [{ cls: 'knight', held: { id: 'fh_longsword', color: '#c8ccd6' }, offhand: { id: 'fh_heater_shield', color: '#8a3a2a' }, clip: 'ready', mode: 'emote' }, { cls: 'ranger', race: 'elf', seed: 7, clip: 'idle', mode: 'emote' }];
    const ids = await lineup(specs, { gap: 1.1, depth: 3 }); await ready(ids); await pose(ids, specs);
    await cam([0.4, 1.6, -2.2], [0, 1.2, 0], 3); await shot('closeup');
  },
};
try {
  for (const s of scenes) { console.log('scene', s); await SC[s](); }
  const perf = await page.evaluate(() => ({ lod: window.thousandvale.actors.lodStats }));
  console.log(JSON.stringify(perf));
} finally {
  console.log('errors', errors.length ? errors.slice(0, 8).join('\n') : 'none');
  await browser.close(); srv.kill('SIGTERM');
}
