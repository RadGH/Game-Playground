// Frontier Foundry — the interface. This file is the conductor: it owns the clock, the screen
// routing, the keyboard and the save file, and hands everything else to a module.
//
//   title.js  → pick a galaxy seed and a landing site
//   surface.js → the 2D map, the camera and the mouse
//   build-tool.js / route-tool.js → the two things you do to the map
//   panel.js  → whatever is selected
//   hud.js    → the top bar, the feed, the banners
//   research-screen.js / map-screen.js / orbit-screen.js / codex-screen.js → the other four screens
//
// The engine (js/*.js) never learns any of this exists. It gets tick(dt) and public method calls.

import { loadData } from '../data.js';
import { Game } from '../game.js';
import { spawnWave } from '../combat.js';
import { completeResearch } from '../research.js';
import { universePlanets } from '../planets.js';

import { $, el, fill, num, clamp, countdown } from './dom.js';
import { iconsReady, preload, rawIcon } from './icons.js';
import { installTooltips } from '../../../../shared/tooltip.js';
import { Sound } from './sound.js';
import { Surface } from './surface.js';
import { Hud, openDialog, closeDialog } from './hud.js';
import { routeList } from './route-tool.js';
import { BuildTool } from './build-tool.js';
import { RouteTool } from './route-tool.js';
import { Panel } from './panel.js';
import { ResearchScreen } from './research-screen.js';
import { MapScreen } from './map-screen.js';
import { OrbitScreen } from './orbit-screen.js';
import { CodexScreen } from './codex-screen.js';
import { Title } from './title.js';
import * as Save from './save.js';

const SPEEDS = [0, 1, 2, 4];
const AUTOSAVE_EVERY = 3600;          // one in-game hour

class App {
  constructor(data) {
    this.data = data;
    this.settings = Save.loadSettings();
    this.speed = 1;
    this.screen = 'surface';
    this.game = null;
    this.galaxySeed = 7;
    this.starIndex = 0;
    this.lastAutosave = 0;
    this.accum = 0;
    this.lastFrame = performance.now();
    this.running = false;
  }

  // ------------------------------------------------------------------ boot
  async boot() {
    installTooltips();
    this.sound = await Sound.create(this.settings);
    addEventListener('pointerdown', () => this.sound.unlock(), { once: true });
    addEventListener('keydown', () => this.sound.unlock(), { once: true });

    this.surface = new Surface({
      canvas: $('map'), minimap: $('minimap'), sound: this.sound,
      onSelect: sel => this.panel.show(sel),
    });
    this.hud = new Hud({ game: null, surface: this.surface, sound: this.sound, onScreen: s => this.show(s) });
    this.buildTool = new BuildTool({ game: null, surface: this.surface, sound: this.sound, onMessage: (m, bad) => this.hint(m, bad) });
    this.routeTool = new RouteTool({ game: null, surface: this.surface, sound: this.sound, onMessage: (m, bad) => this.hint(m, bad) });
    this.panel = new Panel({ game: null, surface: this.surface, sound: this.sound, onMessage: (m, bad) => this.hint(m, bad) });
    this.panel.onRouteFrom = s => { this.routeTool.start(); this.routeTool.from = s; this.hint(`From ${s.def.name}. Now click the building it delivers TO.`); };
    this.panel.onBuildHere = (typeId, node) => { this.buildTool.pick(typeId); this.surface.jumpTo(node.x, node.y); };
    this.research = new ResearchScreen({ game: null, sound: this.sound, onJump: (x, y) => this.jump(x, y) });
    this.mapScreen = new MapScreen({ game: null, sound: this.sound, onJump: (x, y) => this.jump(x, y) });
    this.orbit = new OrbitScreen({ game: null, sound: this.sound, onMessage: (m, bad) => this.hint(m, bad), onLand: t => this.landOn(t) });
    this.codex = new CodexScreen({ game: null, sound: this.sound, onJump: (x, y) => this.jump(x, y) });

    this.title = new Title({
      data: this.data, sound: this.sound,
      onStart: opts => this.newGame(opts),
      onContinue: save => this.loadGame(save),
      onSettings: () => this.openMenu(true),
    });
    this.title.setSave(Save.read());
    this.title.survey();

    this._wireChrome();
    this._wireKeys();
    window.foundry = this.testHooks();
    preload([['ui', 'build'], ['bld', this.data.structure.landing_pod], ['unit', this.data.unit.builder]]);
    await iconsReady(3000);
    document.body.dataset.ready = '1';
    requestAnimationFrame(() => this.frame());
  }

  // ------------------------------------------------------------------ chrome
  _wireChrome() {
    for (const b of document.querySelectorAll('[data-screen]')) {
      b.addEventListener('click', () => this.show(b.dataset.screen));
    }
    for (const b of document.querySelectorAll('.spd')) {
      b.addEventListener('click', () => this.setSpeed(+b.dataset.speed));
    }
    $('btn-menu').addEventListener('click', () => this.openMenu());
    $('btn-route').addEventListener('click', () => this.routeTool.start());
    $('btn-routes').addEventListener('click', () => this.showRoutes());
    $('btn-grid').addEventListener('click', () => { this.surface.showGrid = !this.surface.showGrid; this.sound.ui('tab'); });
    $('menu-dialog').addEventListener('click', e => {
      const b = e.target.closest('[data-menu]');
      if (b) this.menuAction(b.dataset.menu);
    });
  }

  _wireKeys() {
    addEventListener('keydown', e => {
      const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
      if (!typing) this.surface.keys.add(e.key.toLowerCase() === ' ' ? 'space' : e.key.toLowerCase());
      if (typing) return;
      if ($('dlg').open || $('menu-dialog').open) {
        if (e.key === 'Escape') { closeDialog(); $('menu-dialog').close(); }
        return;
      }
      if (!this.game) return;
      switch (e.key.toLowerCase()) {
        case 'b': e.preventDefault(); this.show('surface'); this.openBuild(); break;
        case 'r':
          e.preventDefault();
          // R does double duty: it turns the ghost while you are placing, and starts the route tool
          // when you are not. That is the only sensible reading of "R" in both halves of the game.
          if (this.surface.mode === 'build') this.buildTool.rotate();
          else { this.show('surface'); this.routeTool.start(); }
          break;
        case 'q': this.show('research'); break;
        case 'm': this.show('map'); break;
        case 'n': this.hud.jumpNext(); break;
        case 'g': this.surface.showGrid = !this.surface.showGrid; break;
        case 'escape':
          if (this.surface.mode !== 'select') { this.buildTool.cancel(); this.routeTool.cancel(); }
          else if (this.surface.selection.length) this.surface.select([]);
          else this.openMenu();
          break;
        case ' ': e.preventDefault(); this.setSpeed(this.speed === 0 ? (this.lastSpeed || 1) : 0); break;
        case 'delete': case 'backspace': this.demolishSelected(); break;
        case '1': case '2': case '3': case '4': case '5': {
          const names = ['surface', 'research', 'map', 'orbit', 'codex'];
          this.show(names[+e.key - 1]);
          break;
        }
      }
    });
    addEventListener('keyup', e => this.surface.keys.delete(e.key.toLowerCase() === ' ' ? 'space' : e.key.toLowerCase()));
    addEventListener('blur', () => this.surface.keys.clear());
  }

  openBuild() {
    if (this.surface.mode === 'build') return this.buildTool.cancel();
    const first = $('bb-items')?.querySelector('.bb-item');
    if (first) first.click();
  }

  demolishSelected() {
    const s = this.surface.selection.find(x => x.kind === 'structure');
    if (!s || s.structure === this.game.hq()) return;
    if (s.structure.state === 'done') this.game.removeStructure(s.structure.id, { refund: 0.5 });
    else this.game.cancelBuild(s.structure.id);
    this.surface.select([]);
    this.sound.ui('close');
  }

  /** Every delivery run in one place, with what each is worth and a way to stop it. */
  showRoutes() {
    const body = el('div.dlg-body');
    const render = () => {
      fill(body, el('h3.ruled', { text: 'Delivery runs' }),
        el('p.tiny', { text: 'Throughput is what the run can move when the source keeps up. A run that says "out of fuel" needs refined fuel at one of its ends.' }),
        routeList(this.game, {
          onJump: t => { closeDialog(); this.jump(t.x + t.w / 2, t.y + t.h / 2); },
          onRemove: r => { this.game.removeRoute(r.id); render(); },
        }));
    };
    render();
    openDialog(body);
    this.sound.ui('open');
  }

  hint(text, bad = false) {
    const node = $('map-hint');
    if (!text) { node.hidden = true; return; }
    node.hidden = false;
    node.className = 'map-hint' + (bad ? ' bad' : '');
    node.textContent = text;
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => { node.hidden = true; }, bad ? 3200 : 4200);
  }

  jump(x, y) { this.show('surface'); this.surface.jumpTo(x, y); }

  show(name) {
    if (!name) return;
    this.screen = name;
    for (const s of document.querySelectorAll('#screens > .screen')) s.hidden = s.id !== 'screen-' + name;
    for (const s of document.querySelectorAll('#screens > .screen')) s.classList.toggle('on', s.id === 'screen-' + name);
    for (const b of document.querySelectorAll('.navtab')) b.classList.toggle('on', b.dataset.screen === name);
    if (name === 'research') this.research.render();
    if (name === 'map') this.mapScreen.render();
    if (name === 'orbit') this.orbit.render();
    if (name === 'codex') this.codex.render();
    if (name === 'surface') this.surface.resize();
    this.sound?.ui('tab');
  }

  setSpeed(n) {
    if (n !== 0) this.lastSpeed = n;
    this.speed = n;
    for (const b of document.querySelectorAll('.spd')) b.classList.toggle('on', +b.dataset.speed === n);
    this.settings.speed = n;
    Save.saveSettings(this.settings);
  }

  // ------------------------------------------------------------------ starting and stopping
  newGame({ planet, planets, seed, difficulty, galaxySeed, starIndex }) {
    this.galaxySeed = galaxySeed ?? seed;
    this.starIndex = starIndex ?? 0;
    const game = Game.createSync({ data: this.data, planets, planet, seed, difficulty, size: 96 });
    this.attach(game);
    this.hint('The pod is down. Scan around it, put a drill on a patch, and get a smelter running before the first wave.');
  }

  loadGame(save) {
    if (!save?.game) return;
    this.galaxySeed = save.galaxySeed ?? 7;
    this.starIndex = save.starIndex ?? 0;
    const planets = this._providerFor(save.game.planet);
    const game = Game.fromJSON(save.game, { data: this.data, planets });
    this.attach(game);
    if (save.cam) Object.assign(this.surface.cam, save.cam);
    if (save.speed != null) this.setSpeed(save.speed);
    this.hint('Run restored.');
  }

  /** Rebuild the planet provider a save was started with, so probes and the rocket still have targets. */
  _providerFor(planet) {
    try {
      const { generateGalaxy } = this._universe.galaxy;
      const { generateSystem } = this._universe.system;
      const galaxy = generateGalaxy({ seed: this.galaxySeed, stars: 44 });
      const order = [...galaxy.stars].sort((a, b) => (b.lum ?? 0) - (a.lum ?? 0));
      const systems = [];
      for (const star of order) {
        if (systems.length >= 4) break;
        const sys = generateSystem(star, { seed: this.galaxySeed });
        if (sys.planets.some(p => p.landable !== false && !p.giant)) systems.push(sys);
      }
      const provider = universePlanets(systems, this.data.resources);
      if (provider.get(planet.id)) return provider;
      // the saved planet is not in the rebuilt list (a different build, or a hand-made save): fold it in
      const list = provider.list();
      return { list: () => [planet, ...list], get: id => (id === planet.id ? planet : provider.get(id)), generateMap: p => provider.generateMap(p) };
    } catch { return null; }
  }

  /** Land on the next world from a launched rocket's transfer. */
  landOn(transfer) {
    const planets = this.game.planets;
    const game = Game.land(transfer, { data: this.data, planets, size: 96 });
    this.attach(game);
    this.show('surface');
    this.hint(`Down on ${game.planet.name}. ${Object.keys(transfer.cargo || {}).length} kinds of cargo made the trip.`);
  }

  attach(game) {
    this.game = game;
    game.recordShots = true;
    document.body.classList.add('playing');
    this.surface.setGame(game);
    this.hud.setGame(game);
    this.buildTool.setGame(game);
    this.routeTool.setGame(game);
    this.panel.setGame(game);
    this.research.setGame(game);
    this.mapScreen.setGame(game);
    this.orbit.setGame(game);
    this.codex.setGame(game);
    this.lastAutosave = game.time;
    this.endShown = false;
    this.setSpeed(this.settings.speed ?? 1);
    this.show('surface');
    this.buildTool.renderBar(true);
    this.hud.update();

    game.on('notify', n => this.hud.toast(n));
    game.on('research:done', () => { this.research.onResearchDone(); this.sound.research(); this.buildTool.renderBar(true); });
    game.on('quest:done', () => this.sound.quest());
    game.on('structure:done', () => { this.sound.done(); this.buildTool.renderBar(true); });
    game.on('wave:started', () => this.sound.wave());
    game.on('victory', () => this.endCard(true));
    game.on('defeat', () => this.endCard(false));
    window.foundry = this.testHooks();
  }

  // ------------------------------------------------------------------ the clock
  frame() {
    requestAnimationFrame(() => this.frame());
    const now = performance.now();
    const real = Math.min(0.25, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (!this.game) return;

    if (this.speed > 0 && !this.game.won && !this.game.lost) {
      this.accum += real * this.speed;
      const steps = Math.min(24, Math.floor(this.accum));
      if (steps > 0) { this.game.tick(steps); this.accum -= steps; }
    }

    if (this.screen === 'surface') this.surface.frame();
    if (now - (this._hudAt || 0) > 220) {
      this._hudAt = now;
      this.hud.update();
      this.panel.refresh();
      if (this.screen === 'surface') this.buildTool.renderBar();
      if (this.screen === 'research') this.research.render();
      if (this.screen === 'orbit') this.orbit.render();
      if (this.screen === 'map') this.mapScreen.render();
    }
    if (this.settings.autosave !== false && this.game.time - this.lastAutosave >= AUTOSAVE_EVERY) {
      this.lastAutosave = this.game.time;
      this.save(true);
    }
  }

  // ------------------------------------------------------------------ menu, settings, saving
  save(quiet = false) {
    const packed = Save.pack(this.game, { galaxySeed: this.galaxySeed, starIndex: this.starIndex, cam: this.surface.cam, speed: this.speed });
    const ok = Save.write(packed);
    this.lastSave = packed;
    if (!quiet) this.hint(ok ? 'Saved.' : 'Could not save — this browser is refusing to store it.', !ok);
    return packed;
  }

  openMenu(settingsOnly = false) {
    this.renderSettings();
    const dlg = $('menu-dialog');
    dlg.querySelector('.menu-buttons').hidden = settingsOnly && !this.game;
    if (!dlg.open) dlg.showModal();
  }

  async menuAction(what) {
    const dlg = $('menu-dialog');
    switch (what) {
      case 'resume': dlg.close(); break;
      case 'save': this.save(); dlg.close(); break;
      case 'load': { const s = Save.read(); if (s) { this.loadGame(s); dlg.close(); } else this.hint('No save in this browser.', true); break; }
      case 'export': Save.exportFile(this.save(true)); break;
      case 'import': { const s = await Save.importFile(); if (s?.game) { this.loadGame(s); dlg.close(); } else this.hint('That file was not a Frontier Foundry save.', true); break; }
      case 'new': dlg.close(); document.body.classList.remove('playing'); this.game = null; this.title.setSave(Save.read()); break;
      case 'quit': this.save(true); location.href = '../../index.html'; break;
    }
  }

  renderSettings() {
    const box = $('settings-body');
    const s = this.settings;
    const apply = () => { Save.saveSettings(s); };
    const rows = [];
    const methods = this.sound.methods();
    if (methods.length) {
      const sel = el('select.small');
      for (const m of methods) sel.append(el('option', { value: m.id, text: m.name || m.id, selected: m.id === s.method }));
      sel.addEventListener('change', () => { s.method = sel.value; this.sound.setMethod(sel.value); apply(); });
      rows.push(el('label.setting', null, el('span', { text: 'Sound method' }), sel));
    }
    const slider = (label, key, fn) => {
      const inp = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(s[key]) });
      inp.addEventListener('input', () => { s[key] = +inp.value; fn(+inp.value); apply(); });
      return el('label.setting', null, el('span', { text: label }), inp);
    };
    rows.push(slider('Master volume', 'master', v => this.sound.setVolume(v)));
    rows.push(slider('Effects volume', 'effects', v => this.sound.setBus('sfx', v)));
    rows.push(slider('Interface volume', 'ui', v => this.sound.setBus('ui', v)));
    const mute = el('input', { type: 'checkbox', checked: s.muted });
    mute.addEventListener('change', () => { s.muted = mute.checked; this.sound.setMuted(mute.checked); apply(); });
    rows.push(el('label.setting', null, el('span', { text: 'Mute everything' }), mute));

    const density = el('select.small');
    for (const [v, t] of [[1, 'everything'], [2, 'routine and up'], [3, 'important only'], [4, 'urgent only']]) {
      density.append(el('option', { value: String(v), text: t, selected: +s.notifyDensity === v }));
    }
    density.addEventListener('change', () => { s.notifyDensity = +density.value; this.hud.minImportance = +density.value; $('feed-filter').value = density.value; this.hud.renderFeed(true); apply(); });
    rows.push(el('label.setting', null, el('span', { text: 'Message density' }), density));

    const spd = el('select.small');
    for (const v of SPEEDS) spd.append(el('option', { value: String(v), text: v === 0 ? 'paused' : v + '×', selected: +s.speed === v }));
    spd.addEventListener('change', () => { this.setSpeed(+spd.value); apply(); });
    rows.push(el('label.setting', null, el('span', { text: 'Speed on load' }), spd));

    const auto = el('input', { type: 'checkbox', checked: s.autosave !== false });
    auto.addEventListener('change', () => { s.autosave = auto.checked; apply(); });
    rows.push(el('label.setting', null, el('span', { text: 'Autosave each in-game hour' }), auto));

    if (!this.sound.ok) rows.push(el('p.tiny.warn', { text: 'No audio in this browser — everything else works.' }));
    fill(box, ...rows);
  }

  endCard(won) {
    if (this.endShown) return;
    this.endShown = true;
    const g = this.game;
    const card = el('div.endcard' + (won ? '.win' : '.lose'));
    const inner = el('div.inner');
    inner.append(el('h2', { text: won ? 'THE FRONTIER IS YOURS' : 'THE POD IS GONE' }));
    inner.append(el('p', {
      text: won
        ? `${g.space.beacons.length} beacons lit and a station in orbit.`
        : 'Without the landing pod there is no way off this world.',
    }));
    inner.append(el('p.tiny', {
      text: `${g.stats.built} built · ${g.research.done.length} research · ${g.stats.kills} kills · ${g.stats.wavesCleared} waves held · ${Math.round(g.time / 60)} minutes on the ground`,
    }));
    inner.append(el('div.row', null,
      el('button.primary', { text: 'New run', onClick: () => { card.remove(); this.menuAction('new'); } }),
      el('button', { text: 'Keep looking', onClick: () => card.remove() })));
    card.append(inner);
    document.body.append(card);
    this.setSpeed(0);
  }

  // ------------------------------------------------------------------ test hooks
  testHooks() {
    const app = this;
    return {
      get game() { return app.game; },
      app,
      surface: this.surface,
      hud: this.hud,
      show: n => app.show(n),
      jump: (x, y) => app.jump(x, y),
      save: () => app.save(true),
      debug: {
        /** Run the engine forward without waiting for the wall clock. */
        run(seconds = 60) { app.game.tick(seconds); return app.game.time; },
        /** Send a wave right now, whatever the threat clock says. */
        forceWave(opts = {}) { const w = spawnWave(app.game, opts); app.hud.update(); return w; },
        /** Reveal everything, for looking at the map in a test. */
        revealAll() { app.game.fog.explored.fill(1); app.game.fog.visible.fill(1); for (const n of app.game.map.nodes) n.scanned = true; app.surface.dirty.fog = 0; },
        /** Finish one research node outright (tests and screenshots, not a cheat the player can reach). */
        unlock(id) { const ok = completeResearch(app.game, id, { silent: true }); app.buildTool.renderBar(true); app.research.built = false; return ok; },
        /** Finish every research node. */
        unlockAll() { for (const t of app.data.techs) completeResearch(app.game, t.id, { silent: true }); app.buildTool.renderBar(true); app.research.built = false; },
        /** Drop resources into the pod. */
        give(res, n = 100) { const hq = app.game.hq(); hq.inv[res] = (hq.inv[res] || 0) + n; },
        /** Build something instantly, skipping the outline. */
        instant(type, x, y, opts = {}) { return app.game.place(type, x, y, { instant: true, ...opts }); },
        /** Finish every outline on the map. */
        finishBuilds() { for (const s of app.game.structures) if (s.state !== 'done') s.progress = (s.def.buildTime || 1) + 1; app.game.tick(1); },
        setSpeed: n => app.setSpeed(n),
        pick: t => app.buildTool.pick(t),
        buildTool: app.buildTool,
        routeTool: app.routeTool,
      },
    };
  }
}

// ---------------------------------------------------------------------------- go
const data = await loadData();
const app = new App(data);
// the save loader needs the universe modules; import them once and hand them over
app._universe = {
  galaxy: await import('../../../../universe/js/galaxy.js'),
  system: await import('../../../../universe/js/system.js'),
};
window.foundryApp = app;
await app.boot();
