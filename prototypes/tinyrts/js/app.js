// The browser app: owns the canvas, renderer, camera, input, loop, audio, HUD and menus, and holds
// the current Game (simulation). Menus are DOM overlays; the game view is the canvas.

import { Loop } from './core/loop.js';
import { Input } from './input/input.js';
import { Camera } from './render/camera.js';
import { Renderer } from './render/renderer.js';
import { EntityRenderer } from './render/entities.js';
import { Fx } from './render/fx.js';
import { registerSizes } from './render/sprites.js';
import { Game } from './sim/game.js';
import { Controller } from './ui/controller.js';
import { Hud } from './ui/hud.js';
import { Menus } from './ui/menus.js';
import { registerScreens } from './ui/screens.js';
import { Help } from './ui/help.js';
import { Audio } from './audio/audio.js';
import { loadSettings, saveSettings } from './ui/settings-store.js';
import { oreInArea } from './sim/buildings.js';
import { wallCellCost } from './sim/construction.js';
import { costText } from './ui/commandcard.js';
import { registerExtraScreens } from './ui/screens-extra.js';
import { registerCampaignScreens, installCampaign } from './ui/screens-campaign.js';
import { markSeen, resetProgress } from './ui/progress.js';
import { saveSuspend, loadSuspend, deleteSuspend, hasSuspend } from './ui/suspend.js';
import { snapshot, restore } from './sim/save.js';
import { Hints } from './ui/hints.js';
import { setHighContrast } from './render/sprites.js';
import { snapPlacement } from './sim/placement.js';
import * as placeMod from './sim/placement.js';
import * as wavesMod from './sim/waves.js';

const SPEEDS = [0.5, 1, 2];

export class App {
  constructor(data) {
    this.data = data;
    this.params = new URLSearchParams(location.search);
    this.debug = this.params.has('debug');
    this.settings = loadSettings();
    this.canvas = document.getElementById('view');
    this.renderer = new Renderer(this.canvas);
    this.camera = new Camera();
    this.input = new Input(this.canvas);
    this.fx = new Fx();
    this.fx.shake = (a) => this.camera.addShake(a * this.settings.shake);
    this.view = { selection: new Set(), ghost: null, brush: null, dragBox: null, showLinks: false, showRanges: false, alt: false, marker: null };
    this.entities = new EntityRenderer(this);
    this.renderer.layers.push({ world: (b, cam, g, a, dt) => this.entities.world(b, cam, g, a, dt), screen: (ctx, cam, g) => this.entities.screen(ctx, cam, g) });
    this.controller = new Controller(this);
    this.hud = null;
    this.menus = new Menus(this);
    this.help = new Help(this);
    this.hints = new Hints(this);
    this.audio = new Audio(this);
    this.simHelpers = { oreInArea };
    this._place = placeMod; this._waves = wavesMod; // debug/test access
    this.game = null;
    this.gameOpts = null;
    this.paused = false;
    this.speedIdx = 1;
    this.menuOpen = false;
    this.overHud = false;
    this.hasSuspend = false;
    this.smallScreen = window.innerWidth < 900 || (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches);
    this.loop = new Loop({ tick: (dt) => this.tick(dt), render: (a, dt) => this.render(a, dt) });
    registerSizes(data);
  }

  boot() {
    const onResize = () => { this.renderer.resize(); this.camera.resize(window.innerWidth, window.innerHeight); this.applyScale(); };
    window.addEventListener('resize', onResize);
    onResize();
    this.hud = new Hud(this);
    registerScreens(this, this.menus);
    registerExtraScreens(this, this.menus);
    registerCampaignScreens(this, this.menus);
    installCampaign(this);
    this.extraScreens?.(this, this.menus);
    window.addEventListener('blur', () => {
      if (this.game && !this.game.result && this.settings.pauseOnBlur && !this.menuOpen && !this.params.has('nopause')) this.setPaused(true);
    });
    document.body.classList.toggle('hc', !!this.settings.highContrast);
    setHighContrast(!!this.settings.highContrast);
    this.loop.start();
    hasSuspend().then((has) => { this.hasSuspend = has; if (has && this.menus.current?.name === 'title') this.menus.render(); });
    const quick = this.params.get('play');
    if (quick) this.startGame(this.quickOpts(quick));
    else this.showTitle();
  }

  quickOpts(kind) {
    const seed = Number(this.params.get('seed')) || 12345;
    const size = this.params.get('size') || 'medium';
    const style = this.params.get('style') || 'rolling';
    if (kind === 'versus') return { mode: 'versus', seed, mapSize: size, style, ai: { difficulty: this.params.get('ai') || 'normal', style: 'bastion' } };
    if (kind === 'sandbox') return { mode: 'siege', seed, mapSize: size, style, start: { c: 5000, f: 3000, a: 1000 }, waves: { total: 10, pace: 'long' }, commander: true };
    return { mode: 'siege', seed, mapSize: size, style, difficulty: this.params.get('diff') || 'normal', waves: { total: Number(this.params.get('waves')) || 10 }, commander: true };
  }

  applyScale() {
    const s = this.settings.scale;
    if (s && s !== 'auto') { this.camera.autoScale = false; this.camera.scale = Number(s); this.camera.clampPos(); }
    else if (!this.camera.autoScale && s === 'auto') { this.camera.autoScale = true; this.camera.resize(window.innerWidth, window.innerHeight); }
  }

  saveSettings() {
    saveSettings(this.settings);
    document.body.classList.toggle('hc', !!this.settings.highContrast);
    setHighContrast(!!this.settings.highContrast);
    this.fx.density = { low: 0.4, med: 1, high: 1.6 }[this.settings.particles] || 1;
    this.audio.setVolumes?.(this.settings);
    if (this.game) { this.game.settings.rebuildDuringWaves = !!this.settings.rebuildDuringWaves; this.game.emitHurt = !!this.settings.damageNumbers; }
    this.applyScale();
  }

  // ---------- screens ----------
  showTitle() {
    this.game = null;
    this.audio.setIntensity?.(0);
    this.renderer.attach(null);
    document.getElementById('hud').hidden = true;
    this.startAttract();
    this.menus.closeAll();
    this.menus.show('title');
  }

  resetProgress() { resetProgress(); }

  // A little fortified base for the title-screen battle.
  attractSetup(g) {
    g.waves.enabled = true;
    const core = g.byId.get(g.teams[1].coreId);
    const place = (type, dx) => { const p = snapPlacement(g, type, core.x + core.w / 2 + dx, core.y); g.applyNow({ t: 'build', team: 1, type, x: p.x, y: p.y }); };
    place('pulse', 30); place('mortar', 48); place('pulse', 66); place('flak', 84); place('arc', 100); place('lance', -34);
    const wx = core.x + core.w + 110;
    const cells = [];
    for (let x = wx; x < wx + 5; x++) { const gy = g.world.surfaceY(x); for (let y = gy - 18; y < gy; y++) cells.push([x, y]); }
    g.applyNow({ t: 'paint', team: 1, mat: 7, cells });
    for (const [x, y] of cells) g.world.set(x, y, 7, 1);
  }

  attractTick(g) {
    // Keep the show going: repair the base between waves, restart if it falls.
    if (g.result || !g.byId.get(g.teams[1].coreId)) { this.startAttract(); return; }
    if (g.tickNo % 300 === 0) for (const b of g.buildings) if (b.team === 1) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.2);
  }

  startAttract() {
    // A small live battle behind the title (siege with auto defenses), if the sim has what it needs.
    try {
      const g = new Game(this.data, { mode: 'siege', seed: 77 + Math.floor(Math.random() * 1000), mapSize: 'small', style: 'rolling', difficulty: 'normal', waves: { total: 999, firstDelay: 4, between: 6 }, instantBuild: true, commander: false, start: { c: 99999, f: 9999, a: 999 } });
      this.attract = g;
      this.attractSetup?.(g);
      this.renderer.attach(g, { teamTint: { 1: 0xffffe64e, 2: 0xff40abff }, surface: g.terrainInfo.surface });
      this.fx.attach(g, this.camera, this.settings);
      this.camera.setWorld(g.world.w, g.world.h);
      this.camera.autoScale = true; this.camera.resize(window.innerWidth, window.innerHeight);
      const core = g.byId.get(g.teams[1].coreId);
      this.camera.centerOn(core.x + 120, core.y - 20);
    } catch (e) { console.warn('attract failed', e); this.attract = null; }
  }

  startGame(opts) {
    const g = new Game(this.data, { ...opts, settings: { rebuildDuringWaves: !!this.settings.rebuildDuringWaves } });
    this.attachGame(g, opts);
  }

  attachGame(g, opts, view = null) {
    this.attract = null;
    this.gameOpts = opts;
    this.game = g;
    g.emitHurt = !!this.settings.damageNumbers;
    this.onGameCreated?.(g, opts);
    this.renderer.attach(g, { teamTint: { 1: 0xffffe64e, 2: 0xff40abff }, surface: g.terrainInfo.surface });
    this.fx.attach(g, this.camera, this.settings);
    this.fx.density = { low: 0.4, med: 1, high: 1.6 }[this.settings.particles] || 1;
    this.camera.setWorld(g.world.w, g.world.h);
    this.applyScale();
    this.controller.reset();
    document.getElementById('hud').hidden = false;
    this.hud.attach(g);
    this.audio.attach(g);
    const core = g.byId.get(g.teams[1].coreId);
    if (view) { this.camera.x = view.x; this.camera.y = view.y; this.camera.clampPos(); }
    else if (core) this.camera.centerOn(core.x + core.w / 2 + 70, core.y + core.h - this.camera.viewH * 0.12);
    this.hints.start(g);
    this.paused = false;
    this.speedIdx = SPEEDS.indexOf(this.settings.defaultSpeed) >= 0 && this.speedAllowed() ? SPEEDS.indexOf(this.settings.defaultSpeed) : 1;
    this.loop.speed = SPEEDS[this.speedIdx];
    g.events.on('gameOver', (r) => setTimeout(() => this.onGameOver(g), 1600));
    this.menus.closeAll();
  }

  onGameOver(g) {
    if (this.game !== g) return;
    this.hints.stop();
    this.setPaused(true);
    const extra = this.resultExtras?.(g) || {};
    this.menus.show('results', { game: g, noEsc: true, ...extra });
  }

  restart() {
    this.menus.closeAll();
    if (this.gameOpts) this.startGame(this.gameOpts);
  }

  quitToTitle() {
    this.setPaused(false);
    this.hints.stop();
    this.showTitle();
  }

  openPause() {
    if (!this.game || this.game.result) return;
    this.setPaused(true);
    this.menus.show('pause', { onBack: () => this.closePause() });
  }

  closePause() {
    this.menus.closeAll();
    this.setPaused(false);
  }

  onMenusClosed() {
    if (this.game && !this.game.result && this.paused && this._pausedByMenu) this.setPaused(false);
  }

  setPaused(p) {
    this.paused = p;
    this.loop.speed = p ? 0 : SPEEDS[this.speedIdx];
  }

  togglePause() { if (this.game && !this.game.result) this.setPaused(!this.paused); }

  speedAllowed() { return this.game && (this.game.mode === 'siege' || this.game.mode === 'versus' || this.game.mode === 'sandbox'); }
  changeSpeed(d, wrap = false) {
    if (!this.speedAllowed()) return;
    this.speedIdx = wrap ? (this.speedIdx + 1) % SPEEDS.length : Math.max(0, Math.min(SPEEDS.length - 1, this.speedIdx + d));
    if (!this.paused) this.loop.speed = SPEEDS[this.speedIdx];
    this.hud.flash(`Speed ×${SPEEDS[this.speedIdx]}`);
  }
  speedLabel() { return `×${SPEEDS[this.speedIdx]}`; }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().then(() => { try { navigator.keyboard?.lock?.(['Escape']); } catch (e) { /* ignore */ } }).catch(() => {});
    } else document.exitFullscreen?.();
  }

  canSuspend() { return !!this.game && !this.game.result; }

  async suspendAndQuit() {
    const g = this.game;
    const snap = snapshot(g);
    const ok = await saveSuspend({ snap, label: g.opts.label || g.mode, time: g.time, camera: { x: this.camera.x, y: this.camera.y }, savedAt: Date.now() });
    this.hasSuspend = ok;
    if (!ok) { this.hud.flash('Could not save (browser storage blocked)'); return; }
    this.quitToTitle();
  }

  async continueSuspended() {
    const rec = await loadSuspend();
    if (!rec) { this.hasSuspend = false; this.menus.render(); return; }
    try {
      const g = restore(this.data, rec.snap);
      await deleteSuspend();
      this.hasSuspend = false;
      this.attachGame(g, rec.snap.opts, rec.camera);
      this.hud.flash('Resumed');
    } catch (e) {
      console.error(e);
      this.hud?.flash('That save could not be loaded');
      await deleteSuspend(); this.hasSuspend = false; this.menus.render();
    }
  }

  async deleteSuspend() { await deleteSuspend(); this.hasSuspend = false; }

  // Send a command for the player (team 1). cb(result) is called after it is applied.
  cmd(c, cb) {
    if (!this.game || this.game.result) return;
    c.team = 1;
    const r = this.game.applyNow(c);
    if (!r.ok && r.reason && !cb) this.hud.flash(r.reason);
    if (cb) cb(r);
    this.hud.refreshCard();
    return r;
  }

  wallCost(mat, cells) {
    const per = wallCellCost(this.game, mat);
    const c = {};
    for (const k in per) c[k] = Math.ceil(per[k] * cells);
    return costText(c) || 'free';
  }

  // ---------- loop ----------
  tick(dt) {
    if (this.game && !this.game.result) this.game.tick();
    else if (this.game && this.game.result) this.game.tick(); // keep effects settling behind results
    else if (this.attract) { this.attract.tick(); this.attractTick?.(this.attract); }
  }

  render(alpha, frameDt) {
    if (this.game && !this.menuOpen) this.controller.update(frameDt);
    else this.input.drain();
    if (this.view.marker) { this.view.marker.t -= frameDt * 2; if (this.view.marker.t <= 0) this.view.marker = null; }
    this.camera.updateShake(frameDt, 1);
    if (this.paused) this.fx.update(0); else this.fx.update(frameDt * (this.loop.speed || 1));
    if (this.attract && !this.game) {
      this.camera.x += frameDt * 6;
      if (this.camera.x > this.attract.world.w - this.camera.viewW - 10) this.camera.x = 10;
      this.camera.clampPos();
    }
    this.renderer.render(this.camera, alpha, frameDt);
    if (this.game) {
      this.hud.update(frameDt);
      if (!this.paused) this.hints.update(frameDt);
      this._seenT = (this._seenT || 0) + frameDt;
      if (this._seenT > 3) { this._seenT = 0; markSeen([...new Set(this.game.units.filter((u) => u.hollow).map((u) => u.type))]); }
    }
    this.audio.update?.(frameDt);
    if (this.settings.showFps) { const c = this.renderer.ctx; c.fillStyle = '#ffe066'; c.font = '10px monospace'; c.fillText(`${this.loop.fps} fps`, window.innerWidth - 60, 44); }
  }
}
