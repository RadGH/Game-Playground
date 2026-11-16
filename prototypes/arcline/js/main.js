// Arcline — boot, screens and the city view's frame loop.
// Sim: fixed 1/30 s steps × game speed; creatures and shots are drawn between the last two steps (lessons H3);
// effects, weather and the orbital strike run in real time (research-boom-feel.md). See docs/ARCH.md.
import { loadTuning, tunePanel } from '../../../shared/tune.js';
import { installTooltips, registerTip } from '../../../shared/tooltip.js';
import { fmt } from '../../../shared/format.js';
import { bindLive, T, milestones } from './sim/tuning.js';
import { useCatalog, item, cat } from './sim/catalog.js';
import { generateWorld, BIOMES } from './sim/world.js';
import { newRegion, found, saveRegion, loadRegion } from './sim/region.js';
import { tick, census, solveLandValue } from './sim/city.js';
import { solvePower, solveWater } from './sim/networks.js';
import { isFlat } from './sim/terrain.js';
import * as B from './sim/build.js';
import { MapView, LEVEL } from './render/map.js';
import { Sprites } from './render/sprites.js';
import { Traffic } from './render/traffic.js';
import { toWorld, toScreen } from '../../../citykit/js/iso.js';
import { Horde, KINDS } from '../../../citykit/js/world/horde.js';
import { Defence, TURRETS } from '../../../citykit/js/world/defence.js';
import { Grid, T as TK } from '../../../citykit/js/world/field.js';
import { Fx } from '../../../citykit/js/world/fx.js';
import { Weather } from '../../../citykit/js/world/weather.js';
import { battleFx } from '../../../citykit/js/world/battlefx.js';
import * as snd from '../../../citykit/js/world/sound.js';
import { $, el, btn, toast, banner, sheet, topSheet, closeTopSheet } from './ui/dom.js';
import { buildHud, updateHud, openTray, showInfo, budgetSheet, money, dateText } from './ui/hud.js';
import { toolDefs, plan, apply } from './ui/tools.js';
import { updateGuide } from './ui/guide.js';

export const BUILD = '2026-11-16.1';
const STEP = 1 / 30;
const tuning = await loadTuning(new URL('../data/tuning.json', import.meta.url), { game: 'arcline' });
bindLive(tuning);
useCatalog(await (await fetch(new URL('../data/catalog.json', import.meta.url))).json());
installTooltips();

const app = {
  root: $('#screens'), settings: loadSettings(), mode: 'boot',   // the screens replace this layer's children; the city lives beside it
  r: null, world: null, worldSave: null, regionId: null,
  speed: 1, tool: 'query', tools: toolDefs(), selected: null,
  sim: null, last: performance.now(), acc: 0,
};
window.app = app;
// automated test browsers draw 3D in software: half-size pictures keep their screen walks fast (players get full size)
const sprites = new Sprites({ scale: navigator.webdriver ? 1 : 2 });
const view = new MapView($('#map'), sprites);
const fx = new Fx({ phone: matchMedia('(max-width: 700px)').matches });
const weather = new Weather({ onThunder: p => snd.play('thunder', { pan: p, gain: 0.7 }) });
const traffic = new Traffic();
tunePanel({ game: 'arcline', tuning });

// ships, nests, away earnings, transit, saves and the screens (?noopt runs the bare city for tests)
import * as shipsMod from './sim/ships.js';
import * as nestsMod from './sim/nests.js';
import * as awayMod from './sim/away.js';
import * as transitMod from './sim/transit.js';
import * as saveMod from './save.js';
import * as screensMod from './ui/screens.js';
const opt = {};
function loadOptional() { Object.assign(opt, { ships: shipsMod, nests: nestsMod, away: awayMod, transit: transitMod, save: saveMod, screens: screensMod }); }

// ------------------------------------------------------------------ settings
function loadSettings() { const d = { volume: 0.8, muted: false, shake: true, effects: 'full', weather: true, edgeScroll: false }; try { return { ...d, ...JSON.parse(localStorage.getItem('arcline.settings') || '{}') }; } catch { return d; } }
function saveSettings() { try { localStorage.setItem('arcline.settings', JSON.stringify(app.settings)); } catch { /* private window */ } }
app.onSettings = s => { app.settings = s; saveSettings(); fx.shakeScale = s.shake ? 1 : 0; snd.setMuted(s.muted); };
fx.shakeScale = app.settings.shake ? 1 : 0;

// ------------------------------------------------------------------ playing a region
app.playRegion = async (worldSave, regionId) => {
  app.worldSave = worldSave; app.world = worldSave.world; app.regionId = regionId;
  app.pressure = worldSave.meta?.pressure ?? 1;
  const wr = app.world.regions[regionId];
  const saved = worldSave.regions?.[regionId];
  for (const [id, sv] of Object.entries(worldSave.regions || {})) if (sv?.founded && app.world.regions[id]) app.world.regions[id].city = { name: sv.name, people: sv.people?.total || 0 };
  app.r = saved ? loadRegion(saved) : newRegion(app.world, wr);
  app.r.pressureMul = app.pressure;   // the world's Calm / Normal / Fierce choice
  let away = null;
  if (saved && opt.away?.awayCatchUp && app.r.lastActive && app.r.founded) { opt.away.awayCatchUp(app.r, (Date.now() - app.r.lastActive) / 1000); away = opt.away.awaySummary(app.r); opt.away.clearAway(app.r); }
  enterCity();
  if (away?.length) sheet('While you were away', (m, close) => { m.append(el('ul', { class: 'shiplines' }, ...away.map(t => el('li', {}, t))), btn('Back to the city', close, 'primary')); });
};
function enterCity() {
  const r = app.r;
  opt.screens?.leaveScreens?.();
  app.mode = 'city'; app.root.replaceChildren(); app.root.hidden = true; $('#city').hidden = false;
  view.setRegion(r);
  buildHud(app);
  setupBattle();
  solvePower(r); solveWater(r); solveLandValue(r);
  if (!r.founded) startFounding();
  else { view.cam.x = r.core.x + 1.5; view.cam.z = r.core.z + 1.5; }
  view.cam.zoom = 1; app.setTool('query');
  updateHud(app);
}
function startFounding() {
  const r = app.r;
  // start the camera on the best land: the flattest dry spot near the middle
  let best = null;
  for (let tries = 0; tries < 400 && !best; tries++) { const x = Math.floor(r.size * (0.3 + Math.random() * 0.4)), z = Math.floor(r.size * (0.3 + Math.random() * 0.4)); if (isFlat(r.ter, x, z, 3, 3)) best = [x, z]; }
  if (best) { view.cam.x = best[0] + 1.5; view.cam.z = best[1] + 1.5; } else { view.cam.x = r.size / 2; view.cam.z = r.size / 2; }
  app.founding = true;
  banner('Choose a landing site', 'Tap flat, dry ground for the Colony Core', 4000);
}
function foundAt(x, z) {
  const r = app.r;
  if (!isFlat(r.ter, x, z, 3, 3)) { toast('The Core needs flat, dry ground — try another spot.', 'bad'); return; }
  found(r, x, z);
  const res = B.place(r, 'col-core', x, z);
  if (!res.ok) { toast(res.why || 'Can\'t land there', 'bad'); r.founded = false; return; }
  // a short street out of the core so the first homes have somewhere to go
  app.founding = false;
  view.ghost = null;
  setupBattle();
  if (opt.ships?.foundingDrop) landPods(opt.ships.foundingDrop(r)); else podRain(x + 1.5, z + 1.5, 14, 2.4);
  if (app.world) app.world.regions[app.regionId].city = { name: r.name, people: 0 };
  banner('Landfall', `${r.name} is founded. Lay roads and zone homes for the settlers.`, 3500);
  r.log.push({ day: r.day, text: 'Landfall: the Colony Core is down.' });
  afterBuild(); autosave();
}

// ------------------------------------------------------------------ battle (creatures + turrets)
function setupBattle() {
  const r = app.r;
  const grid = opt.nests?.makeField ? opt.nests.makeField(r) : simpleGrid(r);
  const handlers = battleFx({ fx, pan: (x, z) => (view.G(x, z).sx / Math.max(1, view.W)) * 2 - 1, onScreen: (x, z) => view._near(x, z, 0), deathSprite: c => deathSprite(c) });
  const horde = new Horde(grid, {
    onKill: (c, from) => handlers.onKill(c, from),
    onWallBroken: (x, z) => { handlers.onWallBroken(x, z); app.sim && (app.sim.fieldDirty = true); },
  });
  const defence = new Defence(horde, {
    muzzle: t => {
      const m = window.__buildForMuzzle?.(TURRETS[t.kind].recipe)?.userData?.muzzle?.(t.heading), base = r.ter.height[t.z * r.size + t.x] * LEVEL;
      return m ? { x: t.x + 0.5 + m.x, z: t.z + 0.5 + m.z, y: m.y + base } : { x: t.x + 0.5, z: t.z + 0.5, y: 0.55 + base };
    },
    onFire: (t, kind, d) => handlers.onFire(t, kind, d),
    onImpact: (kind, d) => handlers.onImpact(kind, d),
  });
  app.sim = { grid, horde, defence, handlers, strikes: [], pods: [], vehicles: [], spawnClock: 0, syncT: 0 };
  syncTurrets();
}
/** Fallback path map until nests.js lands: water blocks, walls chewable, the city is the goal. */
function simpleGrid(r) {
  const N = r.size, g = new Grid(N, N);
  for (let i = 0; i < N * N; i++) {
    const x = i % N, z = (i / N) | 0;
    if (r.ter.water[i] && !r.tiles.road[i]) g.set(x, z, TK.WATER);
    else if (r.tiles.wall[i]) g.set(x, z, TK.WALL, r.tiles.wallHp[i]);
    else if (r.tiles.lot[i] >= 0) g.set(x, z, TK.BUILDING, 400);
    else if (r.ter.water[i]) g.set(x, z, TK.BRIDGE);
  }
  g.solve(r.core ? [[r.core.x + 1, r.core.z + 1]] : [[N >> 1, N >> 1]]);
  return g;
}
function syncTurrets() {
  const d = app.sim.defence, r = app.r, old = new Map(d.turrets.map(t => [`${t.x},${t.z}`, t]));
  d.turrets = r.turrets.map(rt => { const o = old.get(`${rt.x},${rt.z}`); const t = o || d.add(rt.kind, rt.x, rt.z); t.kind = rt.kind; t.tier = rt.tier || 1; t.powered = rt.powered ?? 1; t.ref = rt; return t; }).filter(Boolean);
  d.turrets = [...new Set(d.turrets)];
}
function syncWallBroken(x, z) { const r = app.r, i = z * r.size + x; r.tiles.wall[i] = 0; r.tiles.wallHp[i] = 0; r.wallsChanged = true; app.sim.grid.solve(goalTiles()); }
function goalTiles() { const r = app.r; return r.core ? [[r.core.x + 1, r.core.z + 1]] : []; }
/** After the player builds: copy walls/buildings into the path map and re-solve. */
function syncGrid() {
  if (opt.nests?.makeField) { const g = opt.nests.makeField(app.r); app.sim.grid = g; app.sim.horde.grid = g; return; }
  const r = app.r, g = app.sim.grid, N = r.size;
  for (let i = 0; i < N * N; i++) {
    const x = i % N, z = (i / N) | 0;
    if (r.ter.water[i] && !r.tiles.road[i]) g.kind[i] = TK.WATER;
    else if (r.tiles.wall[i]) { g.kind[i] = TK.WALL; g.hp[i] = r.tiles.wallHp[i]; }
    else if (r.tiles.lot[i] >= 0) { g.kind[i] = TK.BUILDING; g.hp[i] = g.hp[i] || 400; }
    else g.kind[i] = r.ter.water[i] ? TK.BRIDGE : TK.LAND;
  }
  g.solve(goalTiles());
}
function deathSprite(c) {
  const k = KINDS[c.kind], rec = sprites.recipe(k.recipe); if (!rec) return null;
  const dir = 0; const s = sprites.facing(k.recipe, {}, dir, rec.dirs || 8, 'die', (rec.anims?.die?.frames || 1) - 1);
  return s && !s.failed ? { img: s.day, ax: s.ax, ay: s.ay, w: s.w, h: s.h, scale: 1 / sprites.scale } : null;
}
// muzzle points come from the turret models (built once each)
import('../../../citykit/js/kit/buildings.js').then(({ build }) => { const cache = {}; window.__buildForMuzzle = id => cache[id] ??= build(id, {}); });

// ------------------------------------------------------------------ pods, strikes
function podRain(x, z, n, spread = 3) { for (let i = 0; i < n; i++) app.sim.pods.push({ x: x + (Math.random() - 0.5) * spread * 2, z: z + (Math.random() - 0.5) * spread * 2, age: -Math.random() * 1.6, fall: 1.4 + Math.random() * 0.4 }); }
function updatePods(dt) {
  for (const p of app.sim.pods) { p.age += dt; if (p.age >= p.fall && !p.done) { p.done = true; app.sim.handlers.podLand(p.x, p.z); } }
  app.sim.pods = app.sim.pods.filter(p => !p.done);
}
app.castStrike = (x, z) => {
  app.sim.strikes.push({ x, z, age: 0, fall: 2.2 });
  snd.play('meteor.fall', { pan: (view.G(x, z).sx / view.W) * 2 - 1, gain: 0.9, delay: 0.05 });
};
function updateStrikes(dt) {
  for (const s of app.sim.strikes) {
    s.age += dt; const k = Math.min(1, s.age / s.fall);
    fx.light(s.x, s.z, 1 + 3 * k * k, 0.05, '#ff9a3a', 0.4 + k * 0.6);
    if (s.age >= s.fall && !s.done) { s.done = true; const res = app.sim.handlers.strike(app.sim.horde, s.x, s.z, { radius: s.radius || T.strikeRadius, damage: s.damage || T.strikeDamage, apply: opt.ships?.strikeImpact ? () => opt.ships.strikeImpact(app.r, app.sim.horde, s) : null }); app.hitStop = 0.07; toast(`Orbital strike: ${fmt(res.killed || 0)} creatures destroyed${res.cleared?.length ? `, ${res.cleared.length} nest${res.cleared.length > 1 ? 's' : ''} gone` : ''}.`, 'good'); }
  }
  app.sim.strikes = app.sim.strikes.filter(s => !s.done);
}
function drawStrikes(ctx) {
  for (const s of app.sim.strikes) {
    const k = Math.min(1, s.age / s.fall), e = k * k, g = view.G(s.x, s.z);
    const sx = g.sx + (1 - e) * view.W * 0.12, sy = g.sy - (1 - e) * view.H * 0.7;
    const rr = (s.radius || T.strikeRadius) * 32 * view.cam.zoom;
    ctx.save(); ctx.setLineDash([8, 6]); ctx.lineDashOffset = -performance.now() / 40;
    ctx.strokeStyle = `rgba(255,${120 - k * 80},60,${0.4 + k * 0.5})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rr * (1 - k * 0.6), rr * (1 - k * 0.6) / 2, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,200,120,0.35)'; ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rr, rr / 2, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; const halo = 30 + k * 30;
    const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, halo); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.15, '#ffd08a'); gr.addColorStop(0.5, 'rgba(255,140,50,0.4)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, sy, halo, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  if (app.aiming && app.hoverPoint) { const g = view.G(...app.hoverPoint), rr = T.strikeRadius * 32 * view.cam.zoom; ctx.save(); ctx.strokeStyle = 'rgba(255,190,90,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rr, rr / 2, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
}

// ------------------------------------------------------------------ the city frame
function night() { const r = app.r; if (!r) return 0; const t = (r.day / (T.dayNightDays || 4)) % 1; return clamp(0.5 - Math.cos(t * Math.PI * 2) * 0.75, 0, 1); }
function cityFrame(real) {
  const r = app.r, S = app.sim;
  app.hitStop = Math.max(0, (app.hitStop || 0) - real);
  if (!app.founding && app.speed > 0 && !app.hitStop && !topSheet()) {
    app.acc += real * app.speed; let n = 0;
    while (app.acc >= STEP && n++ < 10) {
      for (const c of S.horde.list) { c.px = c.x; c.pz = c.z; }
      for (const b of S.defence.shots) { b.ppx = b.x; b.ppz = b.z; }
      const days = STEP / (T.dayLengthSec || 6);
      const before = Math.floor(r.day);
      tick(r, days);
      if (Math.floor(r.day) !== before) onNewDay(Math.floor(r.day));
      spawnTick(STEP);
      S.horde.step(STEP); S.defence.step(STEP);
      app.acc -= STEP;
    }
    if (app.acc > STEP * 10) app.acc = 0;
  }
  if (r.dirty === false && app._lastLots !== r.lots.length) { app._lastLots = r.lots.length; }
  updatePods(real); updateStrikes(real);
  if (app.speed > 0 && !app.founding) traffic.update(r, real * Math.min(2, app.speed));
  fx.update(real);
  const nt = night();
  if (app.settings.weather) weather.update(real, view.W, view.H, nt); else weather.update(real, view.W, view.H, 0);
  sprites.work(sprites.queue.length > 40 ? 14 : 6);
  // test browsers draw 3D and 2D in software: redraw a few times a second there so screenshots aren't starved
  const sig = `${view.cam.x},${view.cam.z},${view.cam.zoom},${view.cam.rot},${app.tool},${!!view.ghost}`;   // a moved view always redraws at once
  if (navigator.webdriver && sig === app._sig && (app._drawT = (app._drawT || 0) + real) < 0.25) return; app._drawT = 0; app._sig = sig;
  view.draw({ night: nt, fx, weather: app.settings.weather ? weather : null, horde: S.horde, defence: S.defence, alpha: app.acc / STEP, pods: S.pods, vehicles: app.settings.effects === 'light' ? traffic.list.slice(0, 20) : traffic.list, strikeDraw: drawStrikes });
  if ((app._hudT = (app._hudT || 0) + real) > 0.2) { app._hudT = 0; updateHud(app); if ((app._guideT = (app._guideT || 0) + 1) % 5 === 0) updateGuide(app); }
}
function onNewDay(day) {
  const r = app.r;
  // turret power follows the grid
  for (const t of app.sim.defence.turrets) t.powered = t.ref?.powered ?? 1;
  // weather: each region's biome decides what shows up; a change every few days
  if (day % 3 === 0) {
    const W = (BIOMES[r.biome] || BIOMES.verdant).weather, rnd = Math.random;
    for (const k of ['rain', 'storm', 'aurora', 'stars', 'mist']) weather.set(k, rnd() < W[k] * 0.6);
  }
  if (day % 30 === 0) autosave();
  // ships + nests (modules from the parallel build)
  if (opt.ships?.shipsTick) for (const ev of opt.ships.shipsTick(r, 1) || []) onShipEvent(ev);
  if (opt.nests?.siegeNests) for (const n of opt.nests.siegeNests(r, 1)?.cleared || []) toast('A nest near your turrets was destroyed.', 'good');
  if (opt.transit?.transitMonth && day % 30 === 0 && app.world) { const a = opt.transit.transitMonth(app.world, r, o => !!o.city); if (a?.people) toast(`${fmt(a.people)} people came over from your other cities.`, 'good'); }
}
function spawnTick(dt) {
  const N = opt.nests; if (!N?.nestsTick) return;
  const S = app.sim, days = dt / (T.dayLengthSec || 6);
  const res = N.nestsTick(app.r, days, { field: S.grid, alive: S.horde.list.length });
  for (const sp of res.spawns || []) S.horde.spawn(sp.kind, sp.x + 0.5, sp.z + 0.5);
  for (const ev of res.events || []) {
    if (ev.type === 'swarm-warning') { app.alert = { text: ev.text || `A swarm is coming from the ${ev.dir}`, until: performance.now() + Math.max(6, ev.inSec || 10) * 1000 }; banner('Swarm incoming', ev.text || `From the ${ev.dir}`, 2600); snd.play('quake.rumble', { gain: 0.35, pitch: 1.4 }); }
    else if (ev.type === 'calm-over') toast(ev.text || 'The wildlife has noticed the colony.', 'bad');
    else if (ev.type === 'nest-spread') app.r.log.push({ day: app.r.day, text: ev.text || 'A new nest has appeared.' });
  }
  // what the creatures broke: copy back into the city about once a second
  if ((S.syncT += dt) >= 1 || S.fieldDirty) {
    S.syncT = 0; S.fieldDirty = false;
    const out = N.syncField(app.r, S.grid);
    for (const ev of out.events || []) {
      if (ev.type === 'turret-wrecked') toast('A turret was wrecked.', 'bad');
      else if (ev.type === 'building-wrecked') toast(`${ev.name || 'A building'} was wrecked.`, 'bad');
      else if (ev.type === 'core-hit') { app.alert = { text: 'The Colony Core is under attack!', until: performance.now() + 5000 }; }
    }
    if (out.changed) { app.r.dirty = true; syncTurrets(); syncGrid(); }
  }
}
function onShipEvent(ev) {
  if (ev.type === 'ship-arrived') { const v = opt.ships.shipView(app.r, ev.ship); toast(`${v.kindName}: ${v.name} is passing overhead.`); snd.play('spell.arcane.impact', { gain: 0.25, pitch: 1.4 }); }
  else if (ev.type === 'comms-online') toast('Comms Array online: you can hear passing ships now.', 'good');
  else if (ev.type === 'comms-offline') toast('Comms Array has no power: ships can\'t reach you.', 'bad');
  else if (ev.type === 'landing' || ev.type === 'founding') landPods(ev);
  drawSky();
}
function landPods(ev) {
  for (const p of ev.pods || [{ x: ev.x, z: ev.z, count: ev.count, delay: 0 }]) app.sim.pods.push({ x: p.x + 0.5, z: p.z + 0.5, age: -(p.delay || 0), fall: 1.4 + Math.random() * 0.4 });
}
/** The ships strip at the top of the map: each ship overhead with its kind and time left; tap to answer it. */
function drawSky() {
  const box = $('#h-sky'); if (!box || !opt.ships?.commsView) return;
  const cv = opt.ships.commsView(app.r);
  box.replaceChildren(...cv.ships.map(v => {
    const b = btn('', () => shipSheet(v.id), 'ac-ship ' + v.kind, { 'data-tip': v.text });
    b.append(el('span', { class: 'k' }, v.kindName), el('b', {}, v.name), el('span', { class: 'bar' }, el('i', { style: `width:${Math.round((1 - v.progress) * 100)}%` })));
    return b;
  }));
  const st = cv.strikes, sb = $('#h-strike');
  if (sb) { sb.hidden = !(st.charges > 0 || st.lance); sb.querySelector('b').textContent = st.lance ? (st.lance.ready ? 'Lance ready' : `${fmt(st.charges)}`) : fmt(st.charges); sb.classList.toggle('ready', st.ready); }
}
function shipSheet(id) {
  const sh = app.r.ships.passing.find(s => s.id === id); if (!sh) { toast('That ship has moved on.'); drawSky(); return; }
  const v = opt.ships.shipView(app.r, sh);
  sheet(v.name, (m, close) => {
    m.append(el('p', { class: 'dim' }, `${v.kindName} · leaves in ${fmt(v.secondsLeft)} s`), el('p', {}, v.text), el('ul', { class: 'shiplines' }, ...v.lines.map(t => el('li', {}, t))));
    for (const c of v.choices) {
      const b = btn('', () => {
        const res = opt.ships.answer(app.r, id, c.choice);
        close();
        if (!res.ok) { toast(res.why || 'Can\'t do that', 'bad'); return; }
        if (res.text) toast(res.text, 'good');
        for (const ev of res.events || []) onShipEvent(ev);
        drawSky(); updateHud(app);
      }, c.choice === 'refuse' ? '' : 'primary', { disabled: c.ok ? null : true });
      b.append(el('span', {}, c.label), c.cost ? el('small', { class: 'cost' }, c.cost) : null, !c.ok && c.why ? el('small', { class: 'why' }, c.why) : null);
      if (c.blurb) b.dataset.tip = c.blurb;
      m.append(b);
    }
  });
}
app.alertText = () => app.alert && performance.now() < app.alert.until ? app.alert.text : (app.r?.shutdown ? 'Out of money: services are off' : app.r?.people.arriving > 0 && census(app.r).homes <= app.r.people.total ? `${fmt(app.r.people.arriving)} settlers need homes — zone more` : null);

// ------------------------------------------------------------------ tools + input
app.setTool = id => {
  app.tool = id; app.drag = null; view.ghost = null;
  const t = app.tools[id], chip = $('#h-tool');
  if (chip) {
    if (id === 'query') chip.hidden = true;
    else { chip.hidden = false; chip.replaceChildren(el('span', {}, t.name), btn('Done', () => app.setTool('query'), 'small')); }
  }
  view.overlay = t?.overlay || app.overlay || null;
  $('#map').classList.toggle('building', id !== 'query');
};
app.setOverlay = id => { app.overlay = id; view.overlay = id; document.querySelectorAll('[data-overlay]').forEach(b => b.classList.toggle('on', (b.dataset.overlay || null) === id)); };
app.setSpeed = s => { app.speed = s; updateHud(app); };
app.bulldozeLot = lot => { const res = B.bulldoze(app.r, [[lot.x, lot.z]]); if (res.ok) { afterBuild(); showInfo(app, null); toast('Cleared.'); } else toast(res.why, 'bad'); };
app.thumb = (canvas, t) => {
  const e = t.name === 'Repair walls' ? { recipe: 'wall-straight', params: { tier: 2, damage: 1 } } : t.entry; const id = e?.recipe;
  if (!id || !sprites.has(id)) { drawToolGlyph(canvas.getContext('2d'), t); return; }
  const draw = () => { const pair = sprites.building(id, { ...(e.params || {}), seed: 1 }, 0, true); if (!pair) return requestAnimationFrame(draw); if (pair.failed) return; const c = canvas.getContext('2d'); const s = Math.min(canvas.width / pair.w, canvas.height / pair.h) * 0.92; c.clearRect(0, 0, canvas.width, canvas.height); c.drawImage(pair.day, (canvas.width - pair.w * s) / 2, (canvas.height - pair.h * s) / 2, pair.w * s, pair.h * s); };
  draw();
};
/** Small drawn pictures for tools that aren't a building (roads, zones, lines, bulldoze, level). */
function drawToolGlyph(c, t) {
  const W = 96, H = 72, cx = 48, cy = 40, hw = 34, hh = 17;
  const dia = (fill, y = cy, k = 1) => { c.fillStyle = fill; c.beginPath(); c.moveTo(cx, y - hh * k); c.lineTo(cx + hw * k, y); c.lineTo(cx, y + hh * k); c.lineTo(cx - hw * k, y); c.closePath(); c.fill(); };
  c.clearRect(0, 0, W, H); c.lineCap = 'round';
  if (t.level) {
    dia(['#50565e', '#454a52', '#3a3e45'][t.level - 1]);
    c.strokeStyle = t.level === 3 ? '#ffc850' : '#ebebe1'; c.lineWidth = t.level === 1 ? 1.5 : 2.5; c.setLineDash(t.level === 1 ? [4, 4] : []);
    c.beginPath(); c.moveTo(cx - hw / 2, cy - hh / 2); c.lineTo(cx + hw / 2, cy + hh / 2); c.stroke(); c.setLineDash([]);
    if (t.level >= 2) { c.strokeStyle = 'rgba(235,235,225,0.5)'; c.lineWidth = 1; for (const o of [-6, 6]) { c.beginPath(); c.moveTo(cx - hw / 2 + o, cy - hh / 2 - o / 2); c.lineTo(cx + hw / 2 + o, cy + hh / 2 - o / 2); c.stroke(); } }
  } else if (t.zone !== undefined) {
    dia('#5f7a58'); dia(t.color || 'rgba(200,200,200,0.4)', cy, 0.86);
    c.fillStyle = '#ffffffcc'; c.font = '700 18px system-ui'; c.textAlign = 'center'; c.fillText(t.zone ? ['', 'R', 'C', 'I'][t.zone] : '×', cx, cy + 6);
  } else if (t.layer === 'power') {
    dia('#5f7a58'); c.strokeStyle = '#c9ced6'; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(cx - 9, cy + 6); c.lineTo(cx, cy - 26); c.lineTo(cx + 9, cy + 6); c.moveTo(cx - 13, cy - 18); c.lineTo(cx + 13, cy - 18); c.stroke();
    c.strokeStyle = '#ffd34a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(2, cy - 10); c.quadraticCurveTo(cx - 20, cy - 8, cx - 13, cy - 18); c.moveTo(cx + 13, cy - 18); c.quadraticCurveTo(cx + 26, cy - 8, W - 2, cy - 12); c.stroke();
  } else if (t.layer === 'pipe') {
    dia('#3a2f2a'); c.strokeStyle = '#4ab0ff'; c.lineWidth = 7; c.beginPath(); c.moveTo(cx - hw / 2 - 6, cy - hh / 2 - 3); c.lineTo(cx + hw / 2 + 6, cy + hh / 2 + 3); c.stroke();
    c.strokeStyle = '#bfe3ff'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - hw / 2 - 4, cy - hh / 2 - 5); c.lineTo(cx + hw / 2 + 4, cy + hh / 2 + 1); c.stroke();
  } else if (t.transit) {
    dia('#5f7a58'); c.strokeStyle = '#8f98a4'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx, cy - 20); c.stroke();
    c.strokeStyle = '#b8c0cb'; c.lineWidth = 6; c.beginPath(); c.moveTo(6, cy - 4); c.lineTo(W - 6, cy - 34); c.stroke();
    c.strokeStyle = t.transit === 2 ? '#b77dff' : '#3ff0ff'; c.lineWidth = 2; c.beginPath(); c.moveTo(6, cy - 7); c.lineTo(W - 6, cy - 37); c.stroke();
  } else if (t.name === 'Bulldoze') {
    dia('#6b5a4a'); c.strokeStyle = '#ff6a5a'; c.lineWidth = 5; c.beginPath(); c.moveTo(cx - 12, cy - 12); c.lineTo(cx + 12, cy + 8); c.moveTo(cx + 12, cy - 12); c.lineTo(cx - 12, cy + 8); c.stroke();
  } else if (t.name === 'Level ground') {
    dia('#7a6650', cy + 6); dia('#9a8466', cy - 2, 0.7); dia('#b9a07c', cy - 9, 0.4);
  } else { dia('#556'); }
}
function afterBuild() { app.r.dirty = true; solvePower(app.r); solveWater(app.r); syncTurrets(); syncGrid(); updateHud(app); }

const cv = $('#map'); const ptrs = new Map(); let pan = null, pinch = null, moved = 0;
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  if (e.isPrimary) ptrs.clear();
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.offsetX, e.offsetY]); moved = 0;
  snd.startSound().then(() => snd.setMuted(app.settings.muted));
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), zoom: view.cam.zoom, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], cx: view.cam.x, cz: view.cam.z }; app.drag = null; pan = null; return; }
  const building = app.tool !== 'query' && !app.founding && !app.aiming;
  if (e.button === 2 || e.button === 1 || !building || e.pointerType === 'touch' && app.tool === 'query') pan = { x: e.offsetX, y: e.offsetY, cx: view.cam.x, cz: view.cam.z };
  if (building && e.button === 0) { const p = view.pick(e.offsetX, e.offsetY); if (p) app.drag = { a: [p[0], p[1]], b: [p[0], p[1]] }; pan = null; refreshGhost(); }
});
cv.addEventListener('pointermove', e => {
  const p = view.pick(e.offsetX, e.offsetY); view.hover = p ? [p[0], p[1]] : null; app.hoverPoint = p ? [p[2], p[3]] : null;
  if (!ptrs.has(e.pointerId)) { if (app.founding || app.tool !== 'query') refreshGhost(); return; }
  ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
  moved += Math.abs(e.movementX) + Math.abs(e.movementY);
  if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; view.cam.zoom = clamp(pinch.zoom * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d, 0.35, 3); const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; const [dx, dz] = toWorld((mid[0] - pinch.mid[0]) / view.cam.zoom, (mid[1] - pinch.mid[1]) / view.cam.zoom, view.cam.rot); view.cam.x = clamp(pinch.cx - dx, 0, app.r.size); view.cam.z = clamp(pinch.cz - dz, 0, app.r.size); return; }
  if (pan) { const [dx, dz] = toWorld((e.offsetX - pan.x) / view.cam.zoom, (e.offsetY - pan.y) / view.cam.zoom, view.cam.rot); view.cam.x = clamp(pan.cx - dx, 0, app.r.size); view.cam.z = clamp(pan.cz - dz, 0, app.r.size); return; }
  if (app.drag && p) { app.drag.b = [p[0], p[1]]; refreshGhost(); }
});
const up = e => {
  const tap = moved < 8 && ptrs.size === 1;
  if (app.founding && tap) { const p = view.pick(e.offsetX, e.offsetY); if (p) foundAt(p[0] - 1, p[1] - 1); }
  else if (app.aiming && tap) { const p = view.pick(e.offsetX, e.offsetY); if (p) { app.strikeSource = app.aiming; app.aiming = false; useStrikeAt(p[2], p[3]); } }
  else if (app.drag) { const res = apply(app.r, app.tools[app.tool], app.drag.a, app.drag.b); if (res.ok) { afterBuild(); snd.play('fragment.crash.small', { gain: 0.15, pitch: 1.6 }); if (res.cost) toast(`${money(-res.cost)}`, ''); } else if (res.why) toast(res.why, 'bad'); app.drag = null; refreshGhost(); }
  else if (tap && app.tool === 'query') { const p = view.pick(e.offsetX, e.offsetY); if (p) { const li = app.r.tiles.lot[p[1] * app.r.size + p[0]]; app.selected = li >= 0 ? app.r.lots[li] : null; showInfo(app, app.selected); } }
  ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) pan = null;
};
cv.addEventListener('pointerup', up);
cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); pan = pinch = null; app.drag = null; });
cv.addEventListener('wheel', e => { e.preventDefault(); view.cam.zoom = clamp(view.cam.zoom * Math.exp(-e.deltaY * 0.0015), 0.35, 3); }, { passive: false });
function refreshGhost() {
  if (app.founding) { const h = view.hover; if (!h) return; const x = h[0] - 1, z = h[1] - 1; view.ghost = { tiles: B.rectTiles(x, z, x + 2, z + 2), ok: isFlat(app.r.ter, x, z, 3, 3), sprite: { id: 'col-core', params: { upgrade: 1, seed: 1 }, x, z, w: 3, d: 3 } }; return; }
  const t = app.tools[app.tool]; if (!t || app.tool === 'query') { view.ghost = null; return; }
  const a = app.drag?.a || view.hover, b = app.drag?.b || view.hover; if (!a) { view.ghost = null; return; }
  const p = plan(app.r, t, a, b); if (!p) { view.ghost = null; return; }
  view.ghost = { tiles: p.tiles, ok: p.quote.ok, color: t.color, sprite: p.sprite && p.quote.ok !== undefined ? p.sprite : null };
  const tip = $('#h-tool span'); if (tip) tip.textContent = `${t.name}${p.quote.cost ? ' · ' + money(p.quote.cost) : ''}${p.quote.ok ? '' : ' · ' + (p.quote.why || 'Can\'t build here')}`;
}

// keys: one table (lessons rule 34). W/A/S/D and arrows move the view; W is always UP the screen (lessons 26).
const KEYS = {
  KeyW: () => nudge(0, -1), ArrowUp: () => nudge(0, -1), KeyS: () => nudge(0, 1), ArrowDown: () => nudge(0, 1),
  KeyA: () => nudge(-1, 0), ArrowLeft: () => nudge(-1, 0), KeyD: () => nudge(1, 0), ArrowRight: () => nudge(1, 0),
  KeyQ: () => { view.cam.rot = (view.cam.rot + 3) & 3; }, KeyE: () => { view.cam.rot = (view.cam.rot + 1) & 3; },
  Space: () => app.setSpeed(app.speed ? 0 : 1), Digit1: () => app.setSpeed(1), Digit2: () => app.setSpeed(2), Digit3: () => app.setSpeed(4),
  KeyB: () => budgetSheet(app), KeyF: () => app.armStrike(), KeyR: () => openTray(app, 'roads'), KeyZ: () => openTray(app, 'zones'), KeyX: () => app.setTool('bulldoze'),
  Equal: () => { view.cam.zoom = clamp(view.cam.zoom * 1.2, 0.35, 3); }, Minus: () => { view.cam.zoom = clamp(view.cam.zoom / 1.2, 0.35, 3); },
  Escape: () => { if (closeTopSheet()) return; if (app.aiming) { app.aiming = false; return; } if (app.tool !== 'query') { app.setTool('query'); return; } $('#h-tray') && ($('#h-tray').hidden = true); app.openMenu(); },
};
function nudge(sx, sy) { const step = 120 / view.cam.zoom, [dx, dz] = toWorld(sx * step, sy * step, view.cam.rot); view.cam.x = clamp(view.cam.x + dx, 0, app.r.size); view.cam.z = clamp(view.cam.z + dz, 0, app.r.size); }
addEventListener('keydown', e => { if (app.mode !== 'city' || e.target.matches('input,textarea,select')) return; const f = KEYS[e.code]; if (f) { e.preventDefault(); f(); } });

// ------------------------------------------------------------------ orbital strikes (charges bought from warships; the Lance)
app.armStrike = () => {
  const st = opt.ships?.strikeReady?.(app.r);
  if (!st?.ready) { toast(st?.lance?.why || 'No strike charges — buy them from a warship passing overhead.', 'bad'); return; }
  app.aiming = st.charges > 0 ? 'charge' : 'lance'; toast('Tap where the strike should land. Esc cancels.');
};
function useStrikeAt(x, z) {
  const res = opt.ships.useStrike(app.r, x, z, app.strikeSource || 'charge');
  if (!res.ok) { toast(res.why, 'bad'); return; }
  app.sim.strikes.push({ ...res.strike, age: 0, fall: res.strike.fallSec });
  snd.play('meteor.fall', { pan: (view.G(x, z).sx / view.W) * 2 - 1, gain: 0.9, delay: Math.max(0, res.strike.fallSec - 2.15) });
  drawSky();
}

// ------------------------------------------------------------------ menu, saving
app.openMenu = () => {
  sheet('Menu', (m, close) => {
    m.append(
      btn('Back to the city', close, 'primary'),
      btn('Save now', () => { autosave(true); close(); }),
      btn('Budget', () => { close(); budgetSheet(app); }),
      btn('Back to the world map', () => { close(); leaveCity(); }),
      btn('Settings', () => { close(); opt.screens?.openSettings?.(app); }),
      btn("What's new", () => { close(); opt.screens?.openWhatsNew ? opt.screens.openWhatsNew(app) : app.news?.open?.(); }),
      btn('Report a bug', () => { close(); opt.screens?.openReport?.(app); }),
      btn('Credits', () => { close(); opt.screens?.openCredits?.(app); }),
      btn('Quit to title', () => { close(); leaveCity('title'); }),
    );
  });
};
async function autosave(say = false) {
  if (!app.r || !opt.save?.saveRegionTo || !app.worldSave) return;
  try { app.r.lastActive = Date.now(); const res = await opt.save.saveRegionTo(app.worldSave.meta?.id ?? app.worldSave.id, app.r); if (res && res.ok === false) throw new Error(res.reason); if (say) toast('Saved.', 'good'); } catch (e) { console.warn('[arcline] save failed', e); toast(e?.message === 'full' ? 'Could not save: the browser storage is full. Delete an old world from Load world.' : 'Could not save this time.', 'bad'); }
}
async function leaveCity(to = 'map') {
  await autosave(); app.mode = 'world'; $('#city').hidden = true; app.sim = null; app.root.hidden = false;
  if (to === 'title') { opt.screens?.showTitle?.(app); return; }
  const id = app.worldSave?.meta?.id; const ws = id && opt.save?.loadWorld ? await opt.save.loadWorld(id) : app.worldSave;
  if (opt.screens?.showWorldMap && ws) opt.screens.showWorldMap(app, ws, { focus: app.regionId }); else opt.screens?.showTitle?.(app);
}
addEventListener('visibilitychange', () => { if (document.hidden && app.mode === 'city') autosave(); });

// ------------------------------------------------------------------ loop
function loop(now) {
  requestAnimationFrame(loop);
  const real = Math.min(0.1, (now - app.last) / 1000); app.last = now;
  if (app.mode === 'city' && app.r) cityFrame(real);
}

// ------------------------------------------------------------------ tooltips with live content
registerTip('people', () => { const r = app.r; if (!r) return ''; const c = census(r); return `${fmt(r.people.total)} people live here. Homes for ${fmt(c.homes)}. ${fmt(r.people.arriving)} on their way or waiting. Jobs: ${fmt(c.jobs)}.`; });
registerTip('milestone', () => { const r = app.r; if (!r) return ''; const ms = milestones(); return r.milestone < ms.length ? `Reach ${fmt(ms[r.milestone])} people to unlock milestone ${r.milestone + 1}.` : 'Every milestone reached.'; });

// ------------------------------------------------------------------ for Claude's game-eye and tests
window.gameEye = {
  state() {
    const r = app.r;
    return { mode: app.mode, build: BUILD, founding: !!app.founding, tool: app.tool, speed: app.speed, region: r ? { name: r.name, size: r.size, day: Math.floor(r.day), people: r.people.total, waiting: r.people.arriving, money: Math.round(r.money), lots: r.lots.length, milestone: r.milestone, turrets: r.turrets.length } : null,
      creatures: app.sim?.horde.list.length ?? 0, cam: { ...view.cam }, baking: sprites.queue.length, screens: opt.screens?.screenState?.() ?? null };
  },
  view, sprites, B, foundAt, setupBattle, afterBuild, podRain,
};

if (!new URLSearchParams(location.search).has('noopt')) loadOptional();
else Object.assign(opt, { save: saveMod });
const extras = Promise.allSettled([
  import('../../../shared/whats-new.js').then(({ createWhatsNew }) => { app.news = createWhatsNew({ url: new URL('../data/changelog.json', import.meta.url), key: 'arcline', title: "What's new" }); }),
]);
await extras;
app.padBusy = () => app.mode === 'city' && !topSheet();
app.build = BUILD;
app.mode = 'title';
if (opt.screens?.showTitle && !new URLSearchParams(location.search).has('dev')) opt.screens.showTitle(app);
else devStart();
requestAnimationFrame(loop);

/** Until the title screens land: start straight into a fresh world's best medium region (also used by tests: ?dev). */
function devStart() {
  const world = generateWorld({ seed: 4242, cells: 10 });
  const wr = world.regions.filter(r => r.span === 2).sort((a, b) => b.land - a.land)[0] || world.regions[0];
  app.playRegion({ id: 'dev', meta: { id: 'dev', name: 'Test world' }, world, regions: {} }, wr.id);
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
