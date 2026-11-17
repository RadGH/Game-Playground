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
import { tick, census, solveLandValue, appeal, immigrationRate, dailyNet, dayProgress } from './sim/city.js';
import { solvePower, solveWater } from './sim/networks.js';
import { isFlat } from './sim/terrain.js';
import * as B from './sim/build.js';
import { turretStats, keyLine } from './sim/arms.js';
import * as RP from './sim/repair.js';
import * as UN from './sim/undo.js';
import { installBuilderTips, buildUndoButton, refreshUndo, refreshWall, showTurret, showWall, showGhost, bulkSheet } from './ui/builder.js';
import { MapView, LEVEL } from './render/map.js';
import { Sprites } from './render/sprites.js';
import { Traffic } from './render/traffic.js';
import { toWorld, toScreen, dirOfHeading } from '../../../citykit/js/iso.js';
import { Horde, KINDS } from '../../../citykit/js/world/horde.js';
import { Defence, TURRETS } from '../../../citykit/js/world/defence.js';
import { Grid, T as TK } from '../../../citykit/js/world/field.js';
import { Fx } from '../../../citykit/js/world/fx.js';
import { Weather } from '../../../citykit/js/world/weather.js';
import { battleFx } from '../../../citykit/js/world/battlefx.js';
import * as snd from '../../../citykit/js/world/sound.js';
import { mix } from '../../../citykit/js/world/mix.js';
import { Music, pickMood } from './audio/music.js';
import { $, el, btn, toast, banner, sheet, topSheet, closeTopSheet } from './ui/dom.js';
import { buildHud, updateHud, openTray, showInfo, budgetSheet, money, perDay, dateText } from './ui/hud.js';
import { toolDefs, plan, apply } from './ui/tools.js';
import { updateGuide } from './ui/guide.js';
import { openComms } from './ui/comms.js';
import { openResearch } from './ui/research.js';
import { TECH_BY_ID } from './sim/research-data.js';
import * as scheduleMod from './sim/schedule.js';
import * as statsMod from './sim/stats.js';
import { openStats } from './ui/stats.js';

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
installBuilderTips(app);   // the build trays' stat cards (report #81)
// automated test browsers draw 3D in software: half-size pictures keep their screen walks fast (players get full size)
const sprites = new Sprites({ scale: navigator.webdriver ? 1 : 2 });
const view = new MapView($('#map'), sprites);
const fx = new Fx({ phone: matchMedia('(max-width: 700px)').matches });
const weather = new Weather({ onThunder: p => snd.play('thunder', { pan: p, gain: 0.7, global: true }) });
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
function loadSettings() { const d = { volume: 0.8, musicVol: 0.5, sfxVol: 1, ambVol: 0.7, muted: false, shake: true, effects: 'full', weather: true, edgeScroll: false }; try { return { ...d, ...JSON.parse(localStorage.getItem('arcline.settings') || '{}') }; } catch { return d; } }
function saveSettings() { try { localStorage.setItem('arcline.settings', JSON.stringify(app.settings)); } catch { /* private window */ } }
app.onSettings = s => { app.settings = s; saveSettings(); fx.shakeScale = s.shake ? 1 : 0; mix.setLevels(s); };
fx.shakeScale = app.settings.shake ? 1 : 0;
mix.setLevels(app.settings);

// ------------------------------------------------------------------ sound: the zoom-aware mix + music
// Browsers allow audio only after a tap or key: the first one starts the Sound Lab, the mixer's ambient bed and the
// music; every later one wakes audio an iPhone suspended (lessons rule 30). The mix follows the view each frame
// (citykit/js/world/mix.js); the music's mood follows the game (js/audio/music.js pickMood).
let music = null, moodMem = {}, moodT = 0;
async function unlockAudio() {
  snd.resume();
  try { await snd.startSound(); } catch (e) { console.info('[arcline] sound unavailable', e?.message); return; }
  mix.setLevels(app.settings);
  if (!music && mix.ctx) { music = new Music({ ctx: mix.ctx, out: mix.musicOut, seed: (Math.random() * 2 ** 31) >>> 0 }); mix.onDuck((d, sec) => music.duck(d, sec)); music.start(); }
}
addEventListener('pointerdown', unlockAudio, { capture: true });
addEventListener('keydown', unlockAudio, { capture: true });
function audioFrame(real) {
  if (!mix.attached) return;
  const city = app.mode === 'city' && app.r, nt = city ? night() : 0;
  mix.setActive(!!city);
  if (city) {
    mix.setZoom(view.cam.zoom); mix.setNight(nt);
    mix.setWeather(app.settings.weather ? weather.on : {});
    mix.setCity(Math.sqrt(Math.min(1, app.r.lots.length / 220)));
    mix.locate((x, z) => { const g = view.G(x, z), W = view.W || 1, H = view.H || 1; return Math.hypot(Math.max(0, -g.sx, g.sx - W) / W, Math.max(0, -g.sy, g.sy - H) / H); });
  }
  mix.update(real);
  if (music && (moodT -= real) <= 0) {
    moodT = 0.5;
    const res = pickMood({ screen: city ? 'city' : 'title', night: nt, alert: !!(app.alert && performance.now() < app.alert.until), creatures: app.sim?.horde?.list.length || 0, now: performance.now() / 1000 }, moodMem);
    moodMem = res.memory; music.setMood(res.mood);
  }
}

// ------------------------------------------------------------------ playing a region
app.playRegion = async (worldSave, regionId) => {
  app.worldSave = worldSave; app.world = worldSave.world; app.regionId = regionId;
  app.pressure = worldSave.meta?.pressure ?? 1;
  const wr = app.world.regions[regionId];
  const saved = worldSave.regions?.[regionId];
  // keep each city's whole saved summary (its border roads line new neighbours up and decide road links — #74)
  for (const [id, sv] of Object.entries(worldSave.regions || {})) if (sv?.founded && app.world.regions[id]) app.world.regions[id].city = { ...(worldSave.meta?.regions?.[id] || app.world.regions[id].city || {}), founded: true, name: sv.name, people: sv.people?.total || 0 };
  app.r = saved ? loadRegion(saved) : newRegion(app.world, wr);
  if (!saved) transitMod.seedEdgeRoads(app.world, app.r);   // a new region starts with a road wherever a neighbour's road meets the border
  // opened before a neighbour built its border road: lay that stub now, if the tiles are free (2026-11-17)
  const late = saved ? transitMod.lateEdgeRoads(app.world, app.r) : null;
  if (late?.laid) app.r.log.push({ day: app.r.day, text: `A road from ${late.from.join(' and ')} reached the border: a short road was laid to meet it.` });
  app.r.pressureMul = app.pressure;   // the world's Calm / Normal / Fierce choice
  let away = null;
  if (saved && opt.away?.awayCatchUp && app.r.lastActive && app.r.founded) { opt.away.awayCatchUp(app.r, (Date.now() - app.r.lastActive) / 1000); away = opt.away.awaySummary(app.r); opt.away.clearAway(app.r); }
  enterCity();
  if (late?.laid) toast(`${late.from.join(' and ')} built a road to your border: a ${fmt(T.edgeStub ?? 3)}-tile road now meets it.`, 'good');
  if (away?.length) sheet('While you were away', (m, close) => { m.append(el('ul', { class: 'shiplines' }, ...away.map(t => el('li', {}, t))), btn('Back to the city', close, 'primary')); });
};
/** Everything the city view keeps between frames belongs to ONE region: clear it before showing another, or the last
 *  city's cars, sparks, pods and alerts show up on the new map (owner report #75, 2026-11-16). */
function resetCityView() {
  traffic.reset();
  for (const k of ['parts', 'lights', 'rings', 'decals', 'bodies', 'beams', 'arcs']) if (Array.isArray(fx[k])) fx[k].length = 0;
  fx.trauma = 0; fx.flash = 0;
  Object.assign(app, { acc: 0, hitStop: 0, alert: null, aiming: false, drag: null, selected: null, hoverPoint: null, founding: false, _lastLots: null, _sig: null });
  view.ghost = null; view.hover = null; view._edgeList = null;
  $('#h-info') && ($('#h-info').hidden = true);
}
app.resetCityView = resetCityView;
function enterCity() {
  const r = app.r;
  opt.screens?.leaveScreens?.();
  resetCityView();
  app.mode = 'city'; app.root.replaceChildren(); app.root.hidden = true; $('#city').hidden = false;
  view.setRegion(r, app.world);
  opt.ships?.ensureShips?.(r);   // reads the merchant upgrades the city owns (arms.js) before the turrets are set up
  buildHud(app);
  buildUndoButton(app);   // the tool bar's Undo (Ctrl+Z), report #76
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
  const sm = app.worldSave?.meta?.startMoney; if (sm) r.money = sm;   // the world's difficulty (Easy 60,000 / Normal 35,000)
  const res = B.place(r, 'col-core', x, z);
  if (!res.ok) { toast(res.why || 'Can\'t land there', 'bad'); r.founded = false; return; }
  // a short street out of the core so the first homes have somewhere to go
  app.founding = false;
  view.ghost = null;
  setupBattle();
  if (opt.ships?.foundingDrop) landPods(opt.ships.foundingDrop(r)); else podRain(x + 1.5, z + 1.5, 14, 2.4);
  if (app.world) app.world.regions[app.regionId].city = { name: r.name, people: 0 };
  banner('Landfall', `${r.name} is founded. Lay roads and zone homes: people move in when there are homes and jobs.`, 3500);
  r.log.push({ day: r.day, text: 'Landfall: the Colony Core is down.' });
  afterBuild(); autosave();
}

// ------------------------------------------------------------------ battle (creatures + turrets)
function setupBattle() {
  const r = app.r;
  const grid = opt.nests?.makeField ? opt.nests.makeField(r) : simpleGrid(r);
  const handlers = battleFx({ fx, pan: (x, z) => (view.G(x, z).sx / Math.max(1, view.W)) * 2 - 1, onScreen: (x, z) => view._near(x, z, 0), deathSprite: c => deathSprite(c) });
  const horde = new Horde(grid, {
    onKill: (c, from) => { statsMod.noteKill(r); handlers.onKill(c, from); },
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
  d.turrets = r.turrets.map(rt => { const o = old.get(`${rt.x},${rt.z}`); const t = o || d.add(rt.kind, rt.x, rt.z); t.kind = rt.kind; t.tier = rt.tier || 1; t.stats = turretStats(r, rt.kind, t.tier); t.powered = rt.powered ?? 1; t.ref = rt; return t; }).filter(Boolean);   // t.stats: its Mk + range blueprint (arms.js)
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
  const n = rec.dirs || 8, dir = dirOfHeading(c.heading || 0, n, view.cam.rot); const s = sprites.facing(k.recipe, {}, dir, n, 'die', (rec.anims?.die?.frames || 1) - 1);   // falls the way it faced (#72)
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
  snd.play('meteor.fall', { pan: (view.G(x, z).sx / view.W) * 2 - 1, gain: 0.9, delay: 0.05, x, z });
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
      if (Math.floor(r.day) !== before) { onNewDay(Math.floor(r.day)); researchNews(); }
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
  if ((app._hudT = (app._hudT || 0) + real) > 0.2) { app._hudT = 0; updateHud(app); refreshUndo(app); refreshWall(app); if ((app._guideT = (app._guideT || 0) + 1) % 5 === 0) updateGuide(app); }
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
  statsMod.recordDay(r);   // one row of the Statistics history a day (sim/stats.js)
  if (day % 30 === 0) autosave();
  // ships + nests (modules from the parallel build)
  if (opt.ships?.shipsTick) for (const ev of opt.ships.shipsTick(r, 1) || []) onShipEvent(ev);
  if (opt.ships) for (const ev of scheduleMod.scheduleTick(r)) onShipEvent(ev);
  if (opt.nests?.siegeNests) for (const n of opt.nests.siegeNests(r, 1)?.cleared || []) toast('A nest near your turrets was destroyed.', 'good');
  if (opt.transit?.transitMonth && day % 30 === 0 && app.world) { const a = opt.transit.transitMonth(app.world, r, o => !!o.city?.founded); if (a?.people) toast(`${fmt(a.people)} people came over from your other cities.`, 'good'); }
}
function spawnTick(dt) {
  const N = opt.nests; if (!N?.nestsTick) return;
  const S = app.sim, days = dt / (T.dayLengthSec || 6);
  const res = N.nestsTick(app.r, days, { field: S.grid, alive: S.horde.list.length });
  for (const sp of res.spawns || []) S.horde.spawn(sp.kind, sp.x + 0.5, sp.z + 0.5);
  for (const ev of res.events || []) {
    if (ev.type === 'swarm-warning') { app.alert = { text: ev.text || `A swarm is coming from the ${ev.dir}`, until: performance.now() + Math.max(6, ev.inSec || 10) * 1000 }; banner('Swarm incoming', ev.text || `From the ${ev.dir}`, 2600); snd.play('quake.rumble', { gain: 0.35, pitch: 1.4, global: true }); }
    else if (ev.type === 'swarm') statsMod.noteSwarm(app.r);
    else if (ev.type === 'calm-over') toast(ev.text || 'The wildlife has noticed the colony.', 'bad');
    else if (ev.type === 'nest-spread') { app.r.log.push({ day: app.r.day, text: ev.text || 'A new nest has appeared.' }); if (ev.migrated) toast(ev.text || 'Wildlife from beyond the region has made a new nest.', 'bad'); }
  }
  // what the creatures broke: copy back into the city about once a second
  if ((S.syncT += dt) >= 1 || S.fieldDirty) {
    S.syncT = 0; S.fieldDirty = false;
    const out = N.syncField(app.r, S.grid);
    for (const ev of out.events || []) {
      statsMod.noteDamage(app.r, ev.type);   // the Defence tab's damage taken
      if (ev.type === 'turret-wrecked') toast('A turret was wrecked — tap its ghost to rebuild it.', 'bad');
      else if (ev.type === 'building-wrecked') toast(`${ev.name || 'A building'} was wrecked${RP.ghostAt(app.r, ev.x, ev.z) ? ' — tap its ghost to rebuild it' : ''}.`, 'bad');
      else if (ev.type === 'core-hit') { app.alert = { text: 'The Colony Core is under attack!', until: performance.now() + 5000 }; }
    }
    if (out.changed) { app.r.dirty = true; syncTurrets(); syncGrid(); }
    // walls heal themselves after a quiet spell while above half health (report #82)
    const r = app.r, d = r.day - (S.wallDay ?? r.day); S.wallDay = r.day; if (d > 0) RP.wallTick(r, d, S.grid);
  }
}
function onShipEvent(ev) {
  if (ev.type === 'ship-arrived') {
    const v = ev.ship?.kindName ? ev.ship : opt.ships.shipView(app.r, ev.ship);   // events carry the ship's view already
    const how = ev.why === 'request' ? ' — the ship you called' : ev.why === 'convoy' || ev.why === 'patrol' ? ' on its regular run' : '';
    toast(`${v.kindName || 'A ship'}: ${v.name} is passing overhead${how}. Open Comms (C) to answer.`); snd.play('spell.arcane.impact', { gain: 0.25, pitch: 1.4, global: true });
  }
  else if (ev.type === 'visit-missed') toast(`The ${ev.name.toLowerCase()} passed by: no Comms Array was listening.`, 'bad');
  else if (ev.type === 'comms-online') toast('Comms Array online: you can hear passing ships now.', 'good');
  else if (ev.type === 'comms-offline') toast('Comms Array has no power: ships can\'t reach you.', 'bad');
  else if (ev.type === 'landing' || ev.type === 'founding') { landPods(ev); if (ev.text) toast(ev.text, 'good'); }
  if (app.sim) syncTurrets();   // a part in a crate refits turrets (Mk II/III): they fire harder from now
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
        if (res.upgrade) { syncTurrets(); afterBuild(); }   // refits and tougher walls take effect at once
        for (const ev of res.events || []) onShipEvent(ev);
        drawSky(); updateHud(app);
      }, c.choice === 'refuse' ? '' : 'primary', { disabled: c.ok ? null : true });
      b.append(...[el('span', {}, c.label), c.unlocks ? el('small', { class: 'unlocks' }, c.unlocks) : null, c.cost ? el('small', { class: 'cost' }, c.cost) : null, !c.ok && c.why ? el('small', { class: 'why' }, c.why) : null].filter(Boolean));
      if (c.blurb) b.dataset.tip = c.blurb;
      m.append(b);
    }
  });
}
app.alertText = () => app.alert && performance.now() < app.alert.until ? app.alert.text : (app.r?.shutdown ? 'Out of money: services are off' : app.r?.people.arriving > 0 && census(app.r).homes <= app.r.people.total ? `${fmt(app.r.people.arriving)} people need homes — zone more` : null);

// ------------------------------------------------------------------ tools + input
app.setTool = id => {
  app.tool = id; app.drag = null; view.ghost = null;
  const t = app.tools[id], chip = $('#h-tool');
  if (chip) {
    if (id === 'query') chip.hidden = true;
    else { chip.hidden = false; const kl = t.entry ? keyLine(app.r, t.entry) : ''; chip.replaceChildren(el('span', {}, `${t.name}${kl ? ' · ' + kl : ''}`), btn('Done', () => app.setTool('query'), 'small')); }
  }
  view.overlay = t?.overlay || app.overlay || null;
  $('#map').classList.toggle('building', id !== 'query');
};
app.setOverlay = id => { app.overlay = id; view.overlay = id; document.querySelectorAll('[data-overlay]').forEach(b => b.classList.toggle('on', (b.dataset.overlay || null) === id)); };
app.setSpeed = s => { app.speed = s; updateHud(app); };
app.openStats = tab => { if (app.mode !== 'city' || !app.r) return; const open = !!document.querySelector('.ac-statsheet'); if (topSheet()) closeTopSheet(); if (!open || tab) openStats(app, tab); };   // G again closes it
/** R&D (owner 2026-11-17): the research screen; focus = a tech id to show (a locked tray card opens it there). */
app.openResearch = (focus = null) => { if (app.mode !== 'city' || !app.r) return; openResearch(app, typeof focus === 'string' ? focus : null); };
/** Research that finished on a day tick: a toast, and turrets/walls refitted at once. */
function researchNews() {
  const list = app.r?.researchNews; if (!list?.length) return;
  app.r.researchNews = [];
  for (const n of list) { const t = TECH_BY_ID[n.id]; if (n.how === 'research' && t) { toast(`Research done: ${t.name}. ${t.what}`, 'good'); } }
  syncTurrets(); afterBuild();
}
app.openComms = () => { if (app.mode !== 'city' || !app.r) return; if (!opt.ships) { toast('Ships are off in this test mode.'); return; } openComms(app); };
app.onShipEvents = evs => { for (const ev of evs) onShipEvent(ev); };
app.refresh = () => { drawSky(); updateHud(app); };
/** Pick a placed building up: a ghost follows the pointer; tap to set it down (same checks as building it). */
app.startMove = lot => {
  const bad = B.moveProblem(lot); if (bad) { toast(bad, 'bad'); return; }
  const name = item(lot.id)?.name || 'building';
  app.tools.move = { name: `Move ${name}`, kind: 'point', move: lot, color: 'rgba(63,240,255,0.4)' };
  $('#h-info').hidden = true; app.setTool('move');
  toast(`Tap where the ${name} should go. Esc cancels.`);
};
app.bulldozeLot = lot => { const res = withUndo('Bulldoze', () => B.bulldoze(app.r, [[lot.x, lot.z]])); if (res.ok) { showInfo(app, null); toast('Cleared.'); } else toast(res.why, 'bad'); };
/** Run a build action so it can be undone for a minute with a full refund (report #76). → the action's result */
function withUndo(label, fn) { const snap = UN.snapshot(app.r), res = fn(); if (res?.ok) { UN.record(app.r, snap, label); afterBuild(); refreshUndo(app); } return res; }
app.undo = () => {
  if (app.mode !== 'city' || !app.r) return;
  app.drag = null; refreshGhost();
  const res = UN.undo(app.r);
  if (!res.ok) { toast(res.why, 'bad'); return; }
  afterBuild(); $('#h-info').hidden = true; app.picked = null; refreshUndo(app);
  const mats = Object.entries(res.mats || {}).map(([k, v]) => `${fmt(Math.round(v))} ${k === 'cells' ? 'Power cells' : k[0].toUpperCase() + k.slice(1)}`).join(', ');
  toast(`Undone: ${res.label}.${res.refund ? ` ${money(res.refund)} back${mats ? ` + ${mats}` : ''}.` : ''}`, 'good');
};
// turrets, walls and ghosts from the info panel (reports #73, #82)
app.bulldozeAt = (x, z) => { const res = withUndo('Bulldoze', () => B.bulldoze(app.r, [[x, z]])); $('#h-info').hidden = true; app.picked = null; res.ok ? toast('Cleared.') : toast(res.why, 'bad'); };
app.quoteRepairAt = (x, z) => B.quoteRepair(app.r, [[x, z]]);
app.repairAt = (x, z) => { const res = withUndo('Repair', () => B.repairWalls(app.r, [[x, z]])); res.ok ? toast(`Repaired for ${money(res.cost)}.`, 'good') : toast(res.why, 'bad'); refreshWall(app); };
app.rebuildGhost = g => { const name = RP.ghostName(g), res = withUndo(`Rebuild ${name}`, () => RP.rebuildGhost(app.r, g)); if (res.ok) { $('#h-info').hidden = true; app.picked = null; toast(`${name} rebuilt for ${money(res.cost)}.`, 'good'); } else toast(res.why || 'Can\'t rebuild it here', 'bad'); };
app.clearGhost = g => { app.r.ghosts = (app.r.ghosts || []).filter(o => o !== g); $('#h-info').hidden = true; app.picked = null; };
app.openBulkRepair = () => { if (app.mode === 'city' && app.r) bulkSheet(app); };
app.bulkRebuild = opts => { const res = withUndo('Bulk repair', () => RP.bulkRebuild(app.r, opts)); if (res.ok && app.picked) { $('#h-info').hidden = true; app.picked = null; } return res; };
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
  } else if (t.action === 'openBulkRepair') {
    // a ghost wall (dashed cyan) becoming solid again, with a turret ghost behind it
    dia('#5f7a58'); c.setLineDash([4, 3]); c.strokeStyle = '#7fe8ff'; c.lineWidth = 1.8;
    c.strokeRect(cx - 4, cy - 30, 22, 18); c.beginPath(); c.arc(cx + 7, cy - 34, 6, Math.PI, 0); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#c9ced6'; c.fillRect(cx - 26, cy - 14, 26, 12); c.fillStyle = '#8f98a4'; c.fillRect(cx - 26, cy - 4, 26, 4);
    c.strokeStyle = '#ffb02e'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx + 4, cy + 6); c.lineTo(cx + 20, cy - 6); c.stroke();
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
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), zoom: view.cam.zoom, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], cx: view.cam.x, cz: view.cam.z }; app.drag = null; pan = null; return; }
  const building = app.tool !== 'query' && !app.founding && !app.aiming;
  if (e.button === 2 || e.button === 1 || !building || e.pointerType === 'touch' && app.tool === 'query') pan = { x: e.offsetX, y: e.offsetY, cx: view.cam.x, cz: view.cam.z };
  if (building && e.button === 0) { const p = view.pick(e.offsetX, e.offsetY); if (p) app.drag = { a: [p[0], p[1]], b: [p[0], p[1]] }; pan = null; refreshGhost(); }
});
// Right-click while dragging a road, wall, line or zone cancels that drag: nothing is built (owner report #77). A second
// right-click then puts the tool away (the right-click on release below). Escape does the same, one step at a time.
// A second button pressed during a drag arrives as a mousedown (and as a pointermove with button 2), never a pointerdown.
function cancelDrag() {
  if (!app.drag) return false;
  app.drag = null; refreshGhost(); moved = 99;   // the release that ends this press is not a tap
  toast(`Cancelled. Right-click again or press Esc to put the ${app.tools[app.tool]?.name || 'tool'} away.`);
  return true;
}
cv.addEventListener('mousedown', e => { if (e.button === 2 && app.drag) { e.preventDefault(); cancelDrag(); } });
cv.addEventListener('pointermove', e => {
  if (e.button === 2 && (e.buttons & 2) && app.drag) cancelDrag();
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
  // right-click (without dragging) cancels the build/bulldoze tool, a move or an aimed strike (owner 2026-11-16)
  if (e.button === 2 && tap && !app.founding && (app.tool !== 'query' || app.aiming)) {
    app.drag = null; app.aiming = false; app.setTool('query'); refreshGhost();
    ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) pan = null; return;
  }
  if (app.founding && tap) { const p = view.pick(e.offsetX, e.offsetY); if (p) foundAt(p[0] - 1, p[1] - 1); }
  else if (app.aiming && tap) { const p = view.pick(e.offsetX, e.offsetY); if (p) { app.strikeSource = app.aiming; app.aiming = false; useStrikeAt(p[2], p[3]); } }
  else if (app.drag) {
    const t = app.tools[app.tool], moving = t?.move, res = withUndo(moving ? 'move' : t?.name || 'build', () => apply(app.r, t, app.drag.a, app.drag.b));
    if (res.ok) { snd.play('fragment.crash.small', { gain: 0.15, pitch: 1.6, global: true }); if (res.cost) toast(`${money(-res.cost)}`, ''); if (moving) { toast(res.cost ? `Moved for ${money(res.cost)}.` : 'Moved.', 'good'); app.setTool('query'); app.selected = moving; showInfo(app, moving); } }
    else if (res.why) toast(res.why, 'bad');
    app.drag = null; refreshGhost();
  }
  else if (tap && app.tool === 'query') {
    const p = view.pick(e.offsetX, e.offsetY);
    if (p) {
      const r = app.r, [x, z] = p, i = z * r.size + x, li = r.tiles.lot[i], tu = r.turrets.find(t => t.x === x && t.z === z), gh = RP.ghostAt(r, x, z);
      app.picked = null;
      // a building → its panel; else a turret, a wall or a ghost of something destroyed (reports #72, #73, #82)
      if (li >= 0) { app.selected = r.lots[li]; showInfo(app, app.selected); if (item(app.selected.id)?.comms) app.openComms(); }
      else if (tu) showTurret(app, tu);
      else if (r.tiles.wall[i]) showWall(app, x, z);
      else if (gh) showGhost(app, gh);
      else { app.selected = null; showInfo(app, null); }
    }
  }
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
  view.ghost = { tiles: p.tiles, ok: p.quote.ok, color: t.color, sprite: p.sprite && p.quote.ok !== undefined ? p.sprite : null, reach: p.reach || null, reachColor: t.reachColor };
  const price = t.move ? (p.quote.cost ? ' · ' + money(p.quote.cost) : ' · free') : p.quote.cost ? ' · ' + money(p.quote.cost) : '';
  const kl = t.entry && p.quote.ok ? keyLine(app.r, t.entry) : '';   // the key numbers while it's held (report #81)
  const tip = $('#h-tool span'); if (tip) tip.textContent = `${t.name}${price}${p.quote.ok ? '' : ' · ' + (p.quote.why || 'Can\'t build here')}${kl ? ' · ' + kl : ''}`;
}

// keys: one table (lessons rule 34). W/A/S/D and arrows move the view; W is always UP the screen (lessons 26).
const KEYS = {
  KeyW: () => nudge(0, -1), ArrowUp: () => nudge(0, -1), KeyS: () => nudge(0, 1), ArrowDown: () => nudge(0, 1),
  KeyA: () => nudge(-1, 0), ArrowLeft: () => nudge(-1, 0), KeyD: () => nudge(1, 0), ArrowRight: () => nudge(1, 0),
  KeyQ: () => { view.cam.rot = (view.cam.rot + 3) & 3; }, KeyE: () => { view.cam.rot = (view.cam.rot + 1) & 3; },
  Space: () => app.setSpeed(app.speed ? 0 : 1), Digit1: () => app.setSpeed(1), Digit2: () => app.setSpeed(2), Digit3: () => app.setSpeed(4),
  KeyB: () => budgetSheet(app), KeyG: () => app.openStats(), KeyC: () => app.openComms(), KeyF: () => app.armStrike(), KeyR: () => openTray(app, 'roads'), KeyZ: () => openTray(app, 'zones'), KeyX: () => app.setTool('bulldoze'), KeyP: () => openTray(app, 'parks'), KeyT: () => app.openResearch(),
  Equal: () => { view.cam.zoom = clamp(view.cam.zoom * 1.2, 0.35, 3); }, Minus: () => { view.cam.zoom = clamp(view.cam.zoom / 1.2, 0.35, 3); },
  Escape: () => { if (closeTopSheet()) return; if (app.drag) { app.drag = null; refreshGhost(); return; } if (app.aiming) { app.aiming = false; return; } if (app.tool !== 'query') { app.setTool('query'); return; } $('#h-tray') && ($('#h-tray').hidden = true); app.openMenu(); },
};
function nudge(sx, sy) { const step = 120 / view.cam.zoom, [dx, dz] = toWorld(sx * step, sy * step, view.cam.rot); view.cam.x = clamp(view.cam.x + dx, 0, app.r.size); view.cam.z = clamp(view.cam.z + dz, 0, app.r.size); }
addEventListener('keydown', e => {
  if (app.mode !== 'city' || e.target.matches('input,textarea,select')) return;
  if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (!topSheet()) app.undo(); return; }   // undo (report #76) — plain Z opens the zones
  const f = KEYS[e.code]; if (f) { e.preventDefault(); f(); } });

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
  snd.play('meteor.fall', { pan: (view.G(x, z).sx / view.W) * 2 - 1, gain: 0.9, delay: Math.max(0, res.strike.fallSec - 2.15), x, z });
  drawSky();
}

// ------------------------------------------------------------------ menu, saving
app.openMenu = () => {
  sheet('Menu', (m, close) => {
    m.append(
      btn('Back to the city', close, 'primary'),
      btn('Save now', () => { autosave(true); close(); }),
      btn('Budget', () => { close(); budgetSheet(app); }),
      btn([el('span', {}, 'Statistics'), el('kbd', { class: 'ac-kbd', 'aria-hidden': 'true' }, 'G')], () => { close(); app.openStats(); }, 'ac-menu-stats'),
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
  try {
    app.r.lastActive = Date.now();
    // the city's picture for the world map (SimCity 4's region view); never let it stop a save
    let snap = null; if (app.r.founded && app.mode === 'city') { try { snap = view.snapshot(); } catch (e) { console.warn('[arcline] snapshot failed', e); } }
    const res = await opt.save.saveRegionTo(app.worldSave.meta?.id ?? app.worldSave.id, app.r, { snap }); if (res && res.ok === false) throw new Error(res.reason); if (say) toast('Saved.', 'good'); } catch (e) { console.warn('[arcline] save failed', e); toast(e?.message === 'full' ? 'Could not save: the browser storage is full. Delete an old world from Load world.' : 'Could not save this time.', 'bad'); }
}
async function leaveCity(to = 'map') {
  await autosave(); app.mode = 'world'; $('#city').hidden = true; document.documentElement.style.removeProperty('--hud-bottom'); document.documentElement.classList.remove('ac-in-city'); app._hudBottom = null; app.sim = null; app.root.hidden = false;
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
  audioFrame(real);
}

// ------------------------------------------------------------------ tooltips with live content
registerTip('payday', () => {
  const r = app.r; if (!r) return '';
  const net = r.budget ? dailyNet(r, r.budget) : 0, left = (1 - dayProgress(r)) * (T.dayLengthSec || 6) / Math.max(1, app.speed || 1);
  return `Taxes and upkeep are paid once a game day. Next pay day: ${net >= 0 ? '+' : ''}${perDay(net)}${app.speed ? ` in ${fmt(Math.ceil(left))} s` : ' (paused)'}. Tap Credits for the budget (B).`;
});
registerTip('people', () => {
  const r = app.r; if (!r) return ''; const c = census(r), a = appeal(r), p = a.parts, why = [];
  if (c.homes <= r.people.total) why.push('no free homes: zone more homes');
  if (p.jobs < -0.1) why.push('too few jobs: zone shops and industry');
  if (p.power < 1) why.push('not enough power');
  if (p.water < 1) why.push('not enough water');
  if (p.tax > 0) why.push('homes tax above 9%');
  if (p.scared) why.push('a wall was breached recently');
  if (r.shutdown) why.push('the city is broke');
  if (p.links > 0) why.push('linked to another city (more people come)');
  const rate = immigrationRate(r) * 30;
  return `${fmt(r.people.total)} people live here. Homes for ${fmt(c.homes)}, jobs for ${fmt(c.jobs)}. About ${fmt(Math.round(rate))} newcomers a month while there are free homes.${why.length ? ' ' + why.map(w => w[0].toUpperCase() + w.slice(1)).join('. ') + '.' : ''}`;
});
registerTip('milestone', () => { const r = app.r; if (!r) return ''; const ms = milestones(); return r.milestone < ms.length ? `Reach ${fmt(ms[r.milestone])} people to unlock milestone ${r.milestone + 1}.` : 'Every milestone reached.'; });

// ------------------------------------------------------------------ for Claude's game-eye and tests
window.gameEye = {
  state() {
    const r = app.r;
    return { mode: app.mode, build: BUILD, founding: !!app.founding, tool: app.tool, speed: app.speed, region: r ? { name: r.name, size: r.size, day: Math.floor(r.day), people: r.people.total, waiting: r.people.arriving, money: Math.round(r.money), lots: r.lots.length, milestone: r.milestone, turrets: r.turrets.length } : null,
      creatures: app.sim?.horde.list.length ?? 0, cam: { ...view.cam }, baking: sprites.queue.length, screens: opt.screens?.screenState?.() ?? null };
  },
  view, sprites, B, foundAt, setupBattle, afterBuild, podRain,
  vehicles: () => traffic.list.length,   // tests: a new region starts with none (#75)
  audio: () => ({ mix: mix.state(), music: music?.state() ?? null }),
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
