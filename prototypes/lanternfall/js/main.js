// Boot and app flow (docs/10 §3): load data, the renderer, input, menus, saves, audio and talk; the title
// screen over a live Guild Hall; new game / load; walking the act map; lamp-posts, chests, shops, talk; death
// and respawn. Dev URLs still work: ?room=<id> (straight into a room with a test hero), ?spawn=a,b, ?bench=1,
// ?debug=1, ?class=<id>.
import { loadData, loadRoom, readJson, roomUrl } from './core/data.js';
import { createGame, enterRoom, findFloor } from './core/state.js';
import { tickGame } from './core/tick.js';
import { createLoop } from './core/loop.js';
import { createInput, bindingsFrom, ALIASES } from './core/input.js';
import { createCamera } from './render/camera.js';
import { createWebGL2Renderer } from './render/webgl2.js';
import { buildAtlas } from './render/sprites.js';
import { buildFrame } from './render/frame.js';
import { hexToRgb01 } from './core/math.js';
import { createBench } from './debug/bench.js';
import { spawnEnemy } from './ai/brain.js';
import { fontSprites } from './render/font5x7.js';
import { createHud } from './ui/hud.js';
import { createScreens } from './ui/screens.js';
import { createMinimap } from './ui/map.js';
import { loadSettings } from './ui/settings.js';
import { createSaves, snapshot } from './save/save.js';
import { makeStore } from '../../../shared/store.js';
import { createActMaps } from './modes/actmap.js';
import { setDifficulty, newHero, goToRoom, restAtLampPost, onKill, relightGreatLamp, onDeath, respawn, rekindleRoom, recordRoomState, giveNodeGifts } from './modes/campaign.js';
import { applyStats, grantXp } from './rpg/hero.js';
import { installLoot, pickupVisuals, spawnPickup } from './entities/pickups.js';
import { giveStartingGear, meleeWeapon, ensureInventory, refillFlask, drinkFlask } from './rpg/items.js';
import { rollLoot } from './rpg/loot.js';
import { createBuilder } from './entities/build.js';
import { Meter } from '../../../meters/js/meter.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('view');
const bootEl = document.getElementById('boot');
const LF = window.lanternfall = { ready: false, errors: [], warnings: [] };

try {
  const data = await loadData();
  LF.data = data; if (data.errors.length) LF.errors.push(...data.errors);
  const renderer = createWebGL2Renderer(canvas, { mats: data.mats });
  if (!renderer) throw new Error('WebGL2 is not available in this browser. Lanternfall needs a desktop browser with WebGL2.');
  data.sprites.sprites.font = fontSprites();
  const atlas = buildAtlas(data.sprites); renderer.setAtlas(atlas.rgba, atlas.w, atlas.h);
  const store = makeStore('lanternfall', 1);
  const saves = createSaves({ get: k => store.get(k), set: (k, v) => store.set(k, v), remove: k => store.remove?.(k) ?? store.set(k, null) });
  let settings = loadSettings();
  let profile = saves.profile();
  const input = createInput(bindingsFrom(data.bindings)); const cam = createCamera();
  const minimap = createMinimap(document.body);

  // ---------- the live game (null until new/load; the title shows the Guild Hall with no hero) ----------
  let game = null, hud = null, bench = null, audio = null, talk = null, barks = null, voices = null, score = null;
  // only rooms listed in rooms/index.json are fetched; anything else is a stand-in built by actmap.js (no 404s)
  const readRoomFile = async (act, id) => { const idx = data.roomIndex || (data.roomIndex = await readJson(roomUrl('index.json'))); if (!idx.rooms?.[id]) throw new Error(`room ${id} not authored`); return loadRoom(data, id); };
  let made = null; // the game being built (rooms load before attachGame makes it current, and must use ITS act maps + seed)
  const roomLoader = id => (made || game).actMaps.roomJson(id, readRoomFile);

  function fit() { const dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr); cam.fit(canvas.width, canvas.height); }
  addEventListener('resize', fit); fit();

  function makeGame(seed) {
    const g = createGame({ data, seed }); g.actMaps = createActMaps(data, seed); made = g; g.flags = {}; g.roomState = {}; g.visitedNodes = {}; g.bestiary = {};
    g.shake = t => cam.shake(t * ((settings.video?.screen_shake ?? 100) / 100)); g.cam = cam;
    g.meter = new Meter({ maxFights: 60 });
    g.hurtPlayer = (amount, info) => { const p = g.player; if (p.dead) return; p.hp = Math.max(info?.noKill ? 1 : 0, p.hp - amount); p.hurtT = 0.4; if (p.hp <= 0) g.bus.emit('player.die', { source: info?.kind || 'the Hollow' }); };
    g.onInteract = T => interactWith(g, T);
    g.say = (who, intent) => { try { say(who, intent); } catch { /* talk is optional */ } };
    g.onBossDead = (b, R) => { // XP, pennies, the boss table, then the Great Lamp is free to relight
      const act = +String(g.act).slice(3) || 1; grantXp(g.hero, Math.round((R.xp || 200) * act * (g.difficulty?.xp ?? 1)), data, g.bus); applyStats(g.hero, g.player, data);
      const pn = R.pennies || [50, 80]; g.hero.currency.pennies += Math.round((pn[0] + g.rng.loot.next() * (pn[1] - pn[0])) * act);
      try { const drops = rollLoot(`lt_boss_act${act}`, { data, level: g.hero.level, rng: g.rng.loot, act, lootFind: g.player.stats?.lootFind || 0, chest: true }) || []; drops.forEach((dr, k) => spawnPickup(g, dr, b.x + (k - drops.length / 2) * 8, b.y - 10)); } catch (e) { LF.warnings.push('boss loot: ' + e.message); }
      hud.toast(`${b.name} is out. Relight the lamp.`, [1, 0.85, 0.5, 1], true); saveNow();
    };
    g.bus.on('kill', e => { onKill(g, e.target); if (e.target.def) g.bestiary[e.target.def.id] = (g.bestiary[e.target.def.id] || 0) + 1; if (g.player.stats?.oilOnKill) g.player.oil = Math.min(g.player.maxOil, g.player.oil + g.player.stats.oilOnKill); });
    g.bus.on('player.die', e => { if (g.player.dead) return; g.player.dead = true; g.player.anim = 'dead'; const purse = onDeath(g); setTimeout(() => router.open('death', { by: typeof e.source === 'string' ? e.source : e.source?.name, purse }), 900); });
    g.bus.on('room.ready', e => { g.meter.startFight?.(`${e.act}/${g.actMaps.nodeOf(e.roomId) || e.roomId}/${e.roomId}`); const n = g.actMaps.nodeOf(e.roomId); if (n) { g.visitedNodes[n] = true; g.flags[`found_${n}`] = true; const gift = giveNodeGifts(g, n); if (gift?.say) say('narrator', null, gift.say); } const a = data.acts.byId?.[e.act]; if (a) g.objective = a.lamp ? `Relight ${a.lamp}` : null; score?.setAct?.(e.act, Object.keys(g.flags).filter(k => k.startsWith('lamp_act')).length); });
    return g;
  }
  function attachGame(g) {
    game = g; LF.game = g; hud = createHud(g); LF.hud = hud; g.builder ||= createBuilder(g);
    installLoot(g);
    renderer.setRoom(g.grid); cam.snap(g.player.x, g.player.y, g.grid); applyTheme();
    if (audio) audio.attach?.(g); if (voices) voices.attach?.(g); if (score && g.bus) g.bus.on('boss.phase', e => score.bossPhase?.(e.phase));
    if (talk) { barks?.destroy?.(); import('./talk/barks.js').then(m => { barks = m.createBarks({ game: g, talk }); }).catch(() => {}); }
  }
  let sky = null;
  function applyTheme() { const t = game.room.theme; sky = { top: hexToRgb01(t.sky?.top || '#10141d'), bottom: hexToRgb01(t.sky?.bottom || '#06080c'), sil: hexToRgb01(t.sky?.sil || '#161a24') }; }

  // ---------- new game / load / respawn ----------
  async function newGame(opts) {
    const g = makeGame(opts.seed ?? ((Math.random() * 2 ** 32) >>> 0));
    g.slot = opts.slot || 1; g.ironWick = !!opts.ironWick; setDifficulty(g, opts.difficulty || 'lamplighter');
    const hero = newHero(g, opts.classId || 'lamplighter', { name: opts.name || 'Wren' });
    ensureInventory(hero, data); try { giveStartingGear(hero, data, g.rng.loot); } catch (e) { LF.warnings.push('starting gear: ' + e.message); }
    applyStats(hero, g.player, data); g.player.hp = g.player.maxHp; g.player.oil = g.player.maxOil;
    const w = meleeWeapon(hero, data); if (w) g.player.melee.set = { ...g.player.melee.set, weapon: w };
    g.startRoom = 'a1_n01_r0'; await goToRoom(g, roomLoader, g.startRoom, 'w');
    attachGame(g); say('narrator', null, 'The Rain has not stopped for forty years. Go down, Lamplighter. Light them again.');
    return null;
  }
  async function loadSlot(n) {
    const s = saves.load(n); if (!s) return false;
    const g = makeGame(s.seed ?? 1); g.slot = n; g.ironWick = s.ironWick; setDifficulty(g, s.difficulty || 'lamplighter');
    newHero(g, s.hero.class, { name: s.hero.name }); g.hero = Object.assign(g.hero, s.hero); ensureInventory(g.hero, data);
    applyStats(g.hero, g.player, data); g.player.hp = g.player.maxHp; g.player.oil = g.player.maxOil;
    Object.assign(g.flags, s.story?.flags || {}); g.roomState = s.world?.roomState || {}; g.lampPost = s.world?.lampPost; g.visitedNodes = Object.fromEntries((s.world?.visited || []).map(v => [v, true]));
    if (s.world?.visitedNodes) g.visitedNodes = s.world.visitedNodes;
    if (s.rng) { g.rng.loot.setState(s.rng.loot); g.rng.spell.setState(s.rng.spell); }
    const w = meleeWeapon(g.hero, data); if (w) g.player.melee.set = { ...g.player.melee.set, weapon: w };
    g.startRoom = 'a1_n01_r0';
    await goToRoom(g, roomLoader, s.world?.lampPost?.room || s.world?.room || g.startRoom, s.world?.entry || 'w');
    if (g.lampPost) { const T = g.things.byId[g.lampPost.id]; if (T) { g.player.x = T.x + 10; g.player.y = T.y; } }
    attachGame(g); return true;
  }
  function saveNow() { if (!game?.hero) return; recordRoomState(game); const s = snapshot(game, {}); s.world.visitedNodes = game.visitedNodes; const r = saves.write(game.slot || 1, s); if (!r.ok) hud?.toast(r.reason, [1, 0.4, 0.4, 1]); return r; }
  LF.save = saveNow;

  // ---------- interactions ----------
  function say(speakerId, intent, fixedText) {
    let text = fixedText; if (!text && talk) { const l = talk.say?.(speakerId, intent, {}); text = l?.text; }
    if (!text || !game) return;
    const npc = data.npcs?.list?.find(n => n.id === speakerId) || data.npcs?.byId?.[speakerId];
    game.subtitle = { who: speakerId === 'narrator' ? '' : (npc?.name || speakerId), text, t: game.time, dur: Math.max(2.5, text.length * 0.06), color: speakerId === 'narrator' ? [0.8, 0.78, 0.7, 1] : undefined };
    game.bus.emit('talk.line', { speakerId, text, speech: text, x: game.player?.x, y: game.player?.y, narration: speakerId === 'narrator' });
  }
  async function interactWith(g, T) {
    const d = T.def;
    switch (T.t) {
      case 'lamp_post': { const r = restAtLampPost(g, T, null); refillFlask(g.hero, data); const w = saveNow(); hud.toast(w?.ok ? 'Rested. Saved at the lamp-post.' : 'Rested.', [1, 0.8, 0.5, 1]); g.atLampPost = true; break; }
      case 'rekindle': if (g.entities.some(e => e.kind === 'enemy' && !e.dead && e.brain?.state === 'attack')) { hud.toast('Not while you are fighting.'); break; } { const n = g.builder?.refundRoom(g.room.room.id); if (n) hud.toast(`+${n} scrap back`); } await rekindleRoom(g, roomLoader); renderer.setRoom(g.grid); break;
      case 'chest': { if (T.open) break; T.open = true; const drops = rollLoot(d.loot || `lt_${g.act}_chest`, { data, level: g.hero.level, rng: g.rng.loot, act: +String(g.act).slice(3) || 1, lootFind: g.player.stats?.lootFind || 0, chest: true }) || []; drops.forEach((dr, k) => spawnPickup(g, dr, T.x + (k - drops.length / 2) * 6, T.y - 6)); g.bus.emit('chest.open', { id: T.id }); break; }
      case 'shopkeeper': router.open('shop', { shopId: d.shop, line: talk?.say?.(data.shops?.byId?.[d.shop]?.keeper || d.npc, 'greet', {})?.text }); break;
      case 'npc': { const lines = []; for (const intent of d.intents || ['greet', 'smalltalk']) { const l = talk?.say?.(d.npc, intent, {}); if (l?.text) lines.push(l.text); } if (d.lines) lines.push(...d.lines); if (d.kindling) g.flags[`hint_${d.kindling}`] = true; router.open('dialogue', { speakerId: d.npc, name: data.npcs?.byId?.[d.npc]?.name || d.name || d.npc, lines: lines.length ? lines : ['…'] }); break; }
      case 'sign': router.open('dialogue', { name: 'A plaque', lines: [data.strings?.[d.text] || d.body || d.text || 'The words are worn away.'] }); break;
      case 'great_lamp': if (g.boss && !g.boss.dead) { hud.toast(`${g.boss.name} still guards the lamp.`); break; } if (!T.lit) { T.lit = true; T.litT = g.time; relightGreatLamp(g, d.act || g.act, null); saveNow(); hud.toast(`${data.acts.byId?.[g.act]?.lamp || 'The Great Lamp'} burns again`, [1, 0.85, 0.5, 1], true); say('narrator', null, 'Warm light runs down the district like water finding its level.'); } break;
    }
  }

  // ---------- menus ----------
  const ctx = {
    get game() { return game; }, data, hero: () => game?.hero, get profile() { return profile; }, get settings() { return settings; },
    saves: { list: () => saves.list().map(s => s.empty ? null : { ...s, playTime: s.playtime, lastPlayed: s.updated }), load: n => loadSlot(n), remove: n => saves.remove(n) },
    get meter() { return game?.meter; }, get act() { return game?.act; }, get atLampPost() { return !!game?.atLampPost; }, builderUnlocked: () => !!game?.hero?.unlocked?.mechanics?.includes('wick_builder'),
    canRekindle: () => !game ? 'No room.' : game.entities.some(e => e.kind === 'enemy' && !e.dead && e.brain?.state === 'attack') ? 'Not while you are fighting.' : true,
    inCombat: () => !!game?.entities.some(e => e.kind === 'enemy' && !e.dead && e.brain?.state === 'attack'),
    sound: id => audio?.cue?.(id),
    applySettings: s => { settings = s; audio?.apply?.(s); },
    where: () => game ? { act: String(game.act || 'act1').slice(3), actName: data.acts.byId?.[game.act]?.name, node: game.actMaps.nodes[game.actMaps.nodeOf(game.room.room.id)]?.name } : {},
    errors: LF.errors,
    actions: {
      newGame: opts => newGame(opts), loadSlot: n => loadSlot(n),
      resume: () => {}, rekindle: () => game && interactWith(game, { t: 'rekindle', def: {} }),
      returnToLampPost: async () => { if (!game) return; onDeath(game); await respawn(game, roomLoader); renderer.setRoom(game.grid); cam.snap(game.player.x, game.player.y, game.grid); },
      respawn: async () => { if (!game) return; if (game.ironWick) { saves.remove(game.slot); toTitle(); return; } await respawn(game, roomLoader); renderer.setRoom(game.grid); cam.snap(game.player.x, game.player.y, game.grid); },
      quitToTitle: () => toTitle(), openMap: () => router.open('map'),
      startMode: id => hud?.toast(`${id} opens in a later milestone — see docs/HANDOFF.md.`),
    },
    onPause: paused => { if (game) game.paused = paused; },
  };
  const router = createScreens({ root: document.getElementById('screens'), ctx }); LF.router = router; LF.ctx = ctx;
  async function toTitle() {
    router.closeAll(); const g = makeGame(1); newHero(g, 'lamplighter', {}); g.player.hidden = true; g.titleScreen = true;
    try { await goToRoom(g, roomLoader, 'a1_n01_r0', 'w'); } catch (e) { const json = await loadRoom(data, 'bench_flood'); enterRoom(g, json); }
    g.player.hidden = true; attachGame(g); hud = null; router.open('title');
  }

  // ---------- keys ----------
  const MENU_ACTIONS = { pause: 'pause', inventory: 'inventory', character: 'character', skills: 'skills', builder: 'wick_builder', wick_builder: 'wick_builder', ledger: 'ledger', journal: 'journal', map: 'map' };
  const menuCodes = new Map(); for (const [a, codes] of Object.entries(data.bindings?.keys?.play || {})) if (MENU_ACTIONS[ALIASES[a] || a]) for (const c of codes) menuCodes.set(c, MENU_ACTIONS[ALIASES[a] || a]);
  addEventListener('keydown', e => {
    if (router.isOpen()) return;
    const act = menuCodes.get(e.code);
    if (act && game?.hero && !game.titleScreen && !e.repeat) { e.preventDefault(); input.clear(); if (act === 'wick_builder' && !ctx.builderUnlocked()) { hud?.toast('The Wick builder opens at Candlemarket.'); return; } router.fromAction(act); return; }
    if (e.code === 'KeyH' && game?.hero && !e.repeat) { const r = drinkFlask(game.hero, game.player, data); if (r?.ok === false) hud?.toast(r.reason || 'The flask is empty.'); }
    if (input.onKey(e.code, true)) e.preventDefault();
  });
  addEventListener('keyup', e => { input.onKey(e.code, false); });
  addEventListener('blur', () => input.clear());
  canvas.addEventListener('mousedown', e => { if (!router.isOpen()) input.onKey('Mouse' + e.button, true); });
  addEventListener('mouseup', e => input.onKey('Mouse' + e.button, false));
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => { if (router.isOpen()) return; const c = e.deltaY > 0 ? 'WheelDown' : 'WheelUp'; input.onKey(c, true); setTimeout(() => input.onKey(c, false), 30); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('mousemove', e => { const r = canvas.getBoundingClientRect(); input.mouse.x = e.clientX - r.left; input.mouse.y = e.clientY - r.top; });

  // ---------- the loop ----------
  let exitCooldown = 0, changing = false;
  async function takeExit(x) {
    const to = game.actMaps.resolveExit(game.room.room.id, x, game.flags) ?? (x.to && !x.to.startsWith('@') ? { room: x.to, entry: x.entry } : null);
    if (!to) { game.pendingExit = null; exitCooldown = 30; return; }
    if (to.ending) { game.pendingExit = null; exitCooldown = 120; if (!game.flags.game_complete) { game.flags.game_complete = true; saveNow(); } hud?.toast('Six lamps burn. Far above, for the first time in forty years, the Rain thins.', [1, 0.85, 0.5, 1], true); say('narrator', null, 'Vessmere is lit, top to bottom. The Guild will argue for a year about who gets the credit. You know.'); return; }
    if (to.blocked) { hud?.toast(to.blocked === 'grapple' ? 'You would need a grapple to reach that.' : to.blocked === 'lamp' ? 'Relight the Great Lamp before you go on.' : 'The way is shut.'); game.pendingExit = null; exitCooldown = 60; return; }
    changing = true; const fade = document.querySelector('.fade'); fade.classList.add('on'); await new Promise(r => setTimeout(r, 250));
    try { await goToRoom(game, roomLoader, to.room, to.entry); renderer.setRoom(game.grid); cam.snap(game.player.x, game.player.y, game.grid); applyTheme(); game.atLampPost = false; LF.room = to.room; }
    catch (e) { console.error(e); LF.errors.push(String(e)); hud?.toast('That way is not built yet.'); }
    game.pendingExit = null; exitCooldown = 20; fade.classList.remove('on'); changing = false;
  }
  const fadeEl = document.createElement('div'); fadeEl.className = 'fade'; document.body.appendChild(fadeEl);
  let mmT = 0;
  const loop = createLoop({
    tick() {
      if (!game || game.paused || changing) return;
      const dpr = canvas.width / innerWidth;
      input.mouse.wx = cam.x + input.mouse.x * dpr / cam.scale; input.mouse.wy = cam.y + input.mouse.y * dpr / cam.scale;
      game.aim = { x: input.mouse.wx, y: input.mouse.wy };
      const intent = game.titleScreen ? { pressed: {} } : input.poll();
      const t0 = performance.now();
      tickGame(game, intent, cam.view());
      game.playtime = (game.playtime || 0) + 1 / 60;
      if (bench) bench.tick(performance.now() - t0);
      if (game.titleScreen) { cam.x += (Math.sin(game.time * 0.05) * 0.15); } else cam.update(game.player, game.grid, 1 / 60);
      if (exitCooldown > 0) { exitCooldown--; game.pendingExit = null; }
      if (game.pendingExit && !changing && !game.titleScreen) takeExit(game.pendingExit);
      barks?.update?.(1 / 60);
    },
    render(alpha, dt) {
      if (!game) return;
      if (bench) bench.frame(dt * 1000);
      const f = buildFrame(game, cam, atlas, alpha);
      const pv = pickupVisuals(game, alpha); if (pv) { f.additive.push(...(pv.additive || [])); f.lights.push(...(pv.lights || [])); f.sprites.push(...(pv.sprites || [])); }
      const x0 = Math.max(0, Math.floor(cam.x) - 1);
      const act = data.acts.byId?.[game.act]; const lit = game.flags?.[`lamp_${game.act}`];
      const ambC = hexToRgb01(lit ? act?.ambient?.lit || '#5a4a3a' : act?.ambient?.top || '#2a3348'), ambP = (lit ? act?.ambient?.litPower : act?.ambient?.power) ?? 0.5;
      renderer.render({
        cam: { x: cam.x + cam.shakeX, y: cam.y + cam.shakeY }, view: { w: cam.vw, h: cam.vh }, scale: cam.scale, time: game.time,
        lights: f.lights, sprites: f.sprites, overlays: f.overlays, additive: f.additive, ripple: game.ripples.h.subarray(x0, x0 + cam.vw + 2),
        ambient: { top: ambC.map(v => v * ambP * 0.9 + 0.04), bottom: ambC.map(v => v * ambP * 0.5 + 0.02), floor: act?.ambient?.floor ?? 0.08 }, sky, rain: { alpha: (game.rain?.density ?? 60) > 0 ? 1 : 0, wind: game.rain?.wind || 0 },
        bloom: (settings.video?.bloom ?? 35) / 100, hud: hud && !game.titleScreen ? hud.build(atlas, { w: cam.vw, h: cam.vh }, { x: cam.x, y: cam.y }) : [],
      });
      if ((mmT += dt) > 0.25) { mmT = 0; minimap.update(game.titleScreen || router.isOpen() ? null : game, cam.scale); }
    },
  });
  LF.loop = loop; LF.input = input; LF.cam = cam; LF.renderer = renderer;
  LF.player = () => { const p = game?.player; return p && { x: p.x, y: p.y, vx: p.vx, vy: p.vy, grounded: p.grounded, state: p.state, anim: p.anim, hp: p.hp, oil: p.oil, room: game.room?.room?.id }; };
  LF.step = n => { for (let k = 0; k < n; k++) { tickGame(game, input.poll(), cam.view()); cam.update(game.player, game.grid, 1 / 60); if (game.pendingExit) { const x = game.pendingExit; game.pendingExit = null; LF.lastExit = x; } } };
  LF.stepTimed = () => { const t0 = performance.now(); tickGame(game, input.poll(), cam.view()); if (bench) bench.tick(performance.now() - t0); cam.update(game.player, game.grid, 1 / 60); };
  LF.renderOnce = () => loop.stepRender();
  LF.newGame = newGame; LF.loadSlot = loadSlot; LF.takeExit = takeExit; LF.interact = T => interactWith(game, T);

  // ---------- start: dev room, or the title ----------
  if (params.get('room')) {
    const g = makeGame(+(params.get('seed') || 1)); setDifficulty(g, params.get('difficulty') || 'lamplighter');
    const hero = newHero(g, params.get('class') || 'lamplighter', {}); ensureInventory(hero, data);
    Object.assign(hero.unlocked, { wickSlots: 4, overcharge: true, gutter: true, mechanics: ['wick_builder', 'plank_kit', 'grapple', 'swimming'] });
    hero.wicks = [{ id: 'w1', flame: params.get('f1') || 'ember', shape: params.get('s1') || 'bolt', charms: (params.get('c1') || '').split(',').filter(Boolean) },
      { id: 'w2', flame: params.get('f2') || 'rime', shape: params.get('s2') || 'lob', charms: [] }, { id: 'w3', flame: params.get('f3') || 'spark', shape: params.get('s3') || 'ring', charms: [] }, { id: 'w4', flame: params.get('f4') || 'tide', shape: params.get('s4') || 'wave', charms: [] }];
    g.flags.swimming = params.has('swim');
    await goToRoom(g, roomLoader, params.get('room'), params.get('entry') || undefined);
    attachGame(g);
    bench = params.has('bench') ? createBench(g, cam) : null; LF.perf = { get bench() { return bench?.rec.report || null; } };
    if (params.get('spawn')) for (const [k, id] of params.get('spawn').split(',').entries()) { const x = g.player.x + 60 + k * 40; spawnEnemy(g, id, x, findFloor(g.grid, x, g.player.y - 60, g.grid.H) ?? g.player.y, { pack: 'test' }); }
    if (params.has('dummies')) { const { createActor } = await import('./entities/actor.js'); for (let k = 0; k < 4; k++) g.entities.push(createActor('dummy', { name: 'Training Dummy', x: g.player.x + 60 + k * 30, y: g.player.y - 20, w: 6, h: 11, hp: 200, color: [0.55, 0.45, 0.35], eyes: [1, 0.8, 0.4] })); }
  } else await toTitle();
  loop.start();
  bootEl.classList.add('gone'); LF.ready = true;

  // ---------- audio + talk load after the first frame (never blocking the game) ----------
  (async () => {
    try { const { createSfxBridge } = await import('./audio/sfx-bridge.js'); audio = await createSfxBridge({ game, settings }); LF.audio = audio; } catch (e) { LF.warnings.push('audio: ' + e.message); }
    try { const { createScore } = await import('./audio/score.js'); score = createScore({ sfx: audio, data: data.score, bus: game?.bus }); LF.score = score; } catch (e) { LF.warnings.push('score: ' + e.message); }
    try { const { createTalk } = await import('./talk/lingo-bridge.js'); talk = await createTalk({ data, seed: game?.seed || 1 }); LF.talk = talk; if (game) { const m = await import('./talk/barks.js'); barks = m.createBarks({ game, talk }); } } catch (e) { LF.warnings.push('talk: ' + e.message); }
    try { const { createVoiceBridge } = await import('./audio/voice-bridge.js'); voices = await createVoiceBridge({ game, settings, sfx: audio, npcs: data.npcs }); LF.voices = voices; } catch (e) { LF.warnings.push('voices: ' + e.message); }
  })();
} catch (e) {
  console.error(e); LF.errors.push(String(e.stack || e)); bootEl.classList.add('error'); bootEl.textContent = 'Lanternfall could not start:\n\n' + (e.stack || e);
}
