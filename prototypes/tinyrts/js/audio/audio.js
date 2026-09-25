// Audio: every sound is synthesized with WebAudio from recipes in data/sfx.json, and the music is a
// small procedural synthwave sequencer. No audio files.
//
// Buses: master -> (sfx, ui, music). Sounds in the world are panned and attenuated by distance
// from the camera. A voice cap and per-sound throttling keep big fights from turning into noise.

import { Music } from './music.js';

const MAX_VOICES = 24;

export class Audio {
  constructor(app) {
    this.app = app;
    this.ctx = null;
    this.voices = 0;
    this.last = new Map();
    this.recipes = app.data.sfx?.sounds || {};
    this.noiseBuf = null;
    this.music = null;
    this.intensity = 0;
    this.unlocked = false;
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, { once: false, capture: true });
    window.addEventListener('keydown', unlock, { once: false, capture: true });
    window.addEventListener('blur', () => { if (this.app.settings.muteOnBlur && this.ctx) this.ctx.suspend(); });
    window.addEventListener('focus', () => { if (this.ctx && this.unlocked) this.ctx.resume(); });
  }

  unlock() {
    if (this.unlocked) { if (this.ctx?.state === 'suspended' && document.hasFocus()) this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.master.connect(this.comp); this.comp.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain(); this.sfxBus.connect(this.master);
    this.uiBus = this.ctx.createGain(); this.uiBus.connect(this.master);
    this.musicBus = this.ctx.createGain(); this.musicBus.connect(this.master);
    // Shared white noise buffer.
    const len = this.ctx.sampleRate * 1.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.unlocked = true;
    this.setVolumes(this.app.settings);
    this.music = new Music(this.ctx, this.musicBus, this.noiseBuf);
    this.music.start(this.app.game ? this.app.game.seed : 7, this.intensity);
  }

  setVolumes(s) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.master, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.sfx, t, 0.05);
    this.uiBus.gain.setTargetAtTime(s.sfx * 0.9, t, 0.05);
    this.musicBus.gain.setTargetAtTime(s.music * 0.55, t, 0.05);
  }

  // Play a recipe. pos = {x, y} in world cells (null = centered, full volume).
  play(name, pos = null, vol = 1) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const r = this.recipes[name];
    if (!r) return;
    const now = this.ctx.currentTime;
    const lt = this.last.get(name) || 0;
    if (now - lt < (r.throttle || 0.03)) return;
    if (this.voices >= MAX_VOICES && !r.ui) return;
    let pan = 0, gain = vol;
    if (pos && this.app.game) {
      const cam = this.app.camera;
      const cx = cam.x + cam.viewW / 2, cy = cam.y + cam.viewH / 2;
      const dx = pos.x - cx, dy = pos.y - cy;
      const half = cam.viewW / 2;
      pan = Math.max(-1, Math.min(1, dx / (half * 1.4)));
      const dist = Math.hypot(dx / half, dy / (cam.viewH / 2));
      gain *= dist < 1 ? 1 : Math.max(0, 1 - (dist - 1) * 0.8);
      if (gain < 0.04) return;
    }
    this.last.set(name, now);
    const out = this.ctx.createGain();
    out.gain.value = gain;
    let node = out;
    if (pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; out.connect(p); node = p; }
    node.connect(r.ui ? this.uiBus : this.sfxBus);
    let end = 0;
    for (const L of r.layers) end = Math.max(end, this.layer(L, out, now));
    this.voices++;
    setTimeout(() => { this.voices--; try { node.disconnect(); } catch (e) { /* ignore */ } }, (end - now) * 1000 + 60);
  }

  layer(L, out, now) {
    const c = this.ctx;
    const t0 = now + (L.delay || 0);
    const a = L.a || 0.005, d = L.d || 0.1;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, L.gain || 0.1), t0 + a);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    let src;
    if (L.noise) {
      src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.playbackRate.value = 0.8 + Math.random() * 0.4;
    } else {
      src = c.createOscillator();
      src.type = L.osc || 'sine';
      const jit = 1 + (Math.random() - 0.5) * 0.04;
      src.frequency.setValueAtTime(L.f0 * jit, t0);
      src.frequency.exponentialRampToValueAtTime(Math.max(20, (L.f1 ?? L.f0) * jit), t0 + a + d);
    }
    let n = src;
    if (L.filter) {
      const f = c.createBiquadFilter();
      f.type = L.filter.type;
      f.Q.value = L.filter.q || 0.8;
      f.frequency.setValueAtTime(L.filter.f0, t0);
      f.frequency.exponentialRampToValueAtTime(Math.max(30, L.filter.f1 ?? L.filter.f0), t0 + a + d);
      n.connect(f); n = f;
    }
    n.connect(env); env.connect(out);
    src.start(t0);
    src.stop(t0 + a + d + 0.05);
    return t0 + a + d + 0.05;
  }

  ui(kind) { this.play('ui-' + kind); }
  alert(cls) { this.play('alert-' + (cls || 'warn')); }

  attach(game) {
    const E = game.events;
    const P = (name, e, vol) => this.play(name, e && e.x != null ? { x: e.x, y: e.y } : null, vol);
    E.on('shot', (e) => P(e.kind === 'pulse' ? 'pulse' : e.kind, e, e.hollow ? 0.6 : 1));
    E.on('beam', (e) => { if (e.kind === 'beam') P('hum', e.segs[0] ? { x: e.segs[0][0], y: e.segs[0][1] } : null, 0.8); });
    E.on('blast', (e) => P(e.r > 20 ? 'bigboom' : 'boom', e, Math.min(1.2, 0.4 + e.r / 20)));
    E.on('clumpLand', (e) => P('rumble', e, Math.min(1.2, 0.3 + e.count / 200)));
    E.on('buildingDestroyed', (e) => P('bigboom', e));
    E.on('unitKilled', (e) => P(e.hollow ? 'squish' : 'unitDie', e, e.boss ? 1.5 : 1));
    E.on('built', (e) => { if (e.team === 1) P('built', e, 0.8); });
    E.on('placed', (e) => { if (e.team === 1) this.play('place'); });
    E.on('trained', (e) => { if (e.team === 1) P('train', e, 0.7); });
    E.on('bite', (e) => P('bite', e, 0.6));
    E.on('mined', (e) => { if (e.team === 1) P('mine', { x: e.x, y: e.y }, 0.6); });
    E.on('reflect', (e) => P('ping', e));
    E.on('intercept', (e) => P('pop', e));
    E.on('orbitalHit', (e) => P('orbital', { x: e.x, y: e.top }));
    E.on('ability', (e) => { if (e.key === 'orbital') P('warn', e); else P(e.key, e); });
    E.on('waveStart', (e) => { this.play('alarm'); this.setIntensity(e.boss ? 3 : 2); });
    E.on('waveCleared', () => { this.play('clear'); this.setIntensity(1); });
    E.on('researchDone', (e) => { if (e.team === 1) this.play('chime'); });
    E.on('aiIntent', (e) => { if (/attack/i.test(e.text)) this.setIntensity(2); });
    E.on('gameOver', (r) => { this.play(r.winner === 1 ? 'victory' : 'defeat'); this.setIntensity(0); });
    this.setIntensity(1);
    this.music?.reseed(game.seed);
  }

  setIntensity(level) {
    this.intensity = level;
    this.music?.setIntensity(level);
  }

  update() {
    // Versus: the music tracks whether armies are fighting near your base.
    const g = this.app.game;
    if (!g || !this.music) return;
    if (!this.app.game && this.intensity !== 0) this.setIntensity(0);
  }
}
