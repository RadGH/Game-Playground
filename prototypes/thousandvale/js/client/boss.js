// Boss fight UI: the big health bar (phase ticks, a NEW bar per phase, "bar 2 of 3"), the boss's cast bar,
// the enrage clock and the enraged look, call-out banners, and small cast bars on any caster's nameplate.
//
// Fed by encounter events (docs/requests.md "D -> C + A"):
//   boss {id, name, title?, bars, phases:[{n, name, at}], enrageMs?, arena?}   / boss {id, end, won}
//   phase {id, n, name?, bar, hpMax?, reset?}   castbar {id, ab, name, ms, int?}   castX {id, ab, why}
//   enrage {id, soft?|hard?}   say {id, text, style}
// Without a `boss` event the bar still appears for any rank:'boss' monster that is fighting near you.
// DOM only; the 3D enrage aura is a sprite parented to the boss's actor group.

import * as THREE from 'three';

const $ = id => document.getElementById(id);

export function createBossUi({ actors, serverNow, toast } = {}) {
  const el = {
    root: $('boss'), name: $('boss-name'), title: $('boss-title'), fill: $('boss-fill'), lag: $('boss-lag'), ticks: $('boss-ticks'),
    pct: $('boss-pct'), bars: $('boss-bars'), phase: $('boss-phase'), enrage: $('boss-enrage'),
    cast: $('boss-cast'), castName: $('boss-cast-name'), castFill: $('boss-cast-fill'), castTime: $('boss-cast-time'),
    callout: $('callout'), vignette: $('vignette'),
  };
  const B = { id: null, name: '', bars: 1, bar: 1, phases: [], enrageAt: 0, enraged: false, soft: 0, lag: 1, lastHp: 1, ended: 0, phaseName: '' };
  const casts = new Map();          // entity id -> { name, start, end, int, el(nameplate bar) }
  let aura = null;

  function show(id) {
    if (B.id !== id) { B.lag = 1; B.lastHp = 1; }
    B.id = id; B.ended = 0;
    el.root.hidden = false; el.root.classList.remove('leaving', 'won');
    drawTicks();
  }
  function drawTicks() {
    el.ticks.innerHTML = '';
    for (const p of B.phases) {
      if (!(p.at > 0 && p.at < 1)) continue;
      const i = document.createElement('i'); i.style.left = (p.at * 100).toFixed(1) + '%'; i.title = p.name || ''; el.ticks.appendChild(i);
    }
    el.bars.innerHTML = '';
    if (B.bars > 1) for (let k = 1; k <= B.bars; k++) { const pip = document.createElement('b'); pip.className = k < B.bar ? 'done' : k === B.bar ? 'now' : ''; el.bars.appendChild(pip); }
  }

  function engage(ev) {
    B.name = ev.name || actors.get(ev.id)?.name || 'Boss';
    B.bars = Math.max(1, ev.bars | 0 || 1); B.bar = 1;
    B.phases = Array.isArray(ev.phases) ? ev.phases : [];
    B.enrageAt = ev.enrageMs ? serverNow() + ev.enrageMs : 0;
    B.enraged = false; B.soft = 0; B.phaseName = B.phases[0]?.name || '';
    el.name.textContent = B.name; el.title.textContent = ev.title || '';
    el.root.classList.remove('enraged');
    show(ev.id);
    callout(`${B.name} attacks!`, 'yell');
  }
  function end(won) {
    if (B.id == null) return;
    el.root.classList.add(won ? 'won' : 'leaving');
    if (won) callout(`${B.name} is defeated!`, 'victory');
    B.ended = performance.now();
    setAura(null);
  }

  function onEvent(ev) {
    const type = ev.type || ev.t;
    switch (type) {
      case 'boss': if (ev.end) { if (ev.id === B.id) end(!!ev.won); } else engage(ev); break;
      case 'phase': {
        if (ev.reset) { if (ev.id === B.id) { B.bar = 1; B.enraged = false; setAura(null); el.root.classList.remove('enraged'); end(false); } break; }
        if (B.id !== ev.id) { const a = actors.get(ev.id); if (!a) break; B.name = a.name; el.name.textContent = a.name; el.title.textContent = ''; B.phases = []; show(ev.id); }
        const ph = B.phases.find(p => p.n === ev.n);
        B.phaseName = ev.name || ph?.name || '';
        if (ev.hpMax) {                 // a NEW health bar
          B.bar = Math.max(B.bar + 1, (ev.bar | 0) + 1); B.bars = Math.max(B.bars, B.bar);
          B.lag = 1; el.root.classList.remove('newbar'); void el.root.offsetWidth; el.root.classList.add('newbar');
          const a = actors.get(ev.id); if (a) { a.hpMax = ev.hpMax; a.hp = ev.hpMax; }
        }
        if (ev.n > 0 || ev.name) {
          el.phase.textContent = B.phaseName ? `Phase ${ev.n + 1} — ${B.phaseName}` : `Phase ${ev.n + 1}`;
          el.phase.classList.remove('flash'); void el.phase.offsetWidth; el.phase.classList.add('flash');
          if (B.phaseName) callout(B.phaseName, 'phase');
        }
        drawTicks();
        break;
      }
      case 'castbar': {
        const now = serverNow();
        const c = { name: ev.name || ev.ab, start: now, end: now + (ev.ms || 1000), int: !!ev.int, ab: ev.ab };
        casts.set(ev.id, c);
        plateCast(ev.id, c);
        break;
      }
      case 'castX': {
        const c = casts.get(ev.id);
        if (c) { c.end = 0; c.cut = ev.why || 'interrupted'; c.cutAt = performance.now(); }
        if (ev.id === B.id) { el.cast.classList.add('cut'); el.castName.textContent = ev.why === 'done' ? el.castName.textContent : 'Interrupted!'; }
        break;
      }
      case 'enrage':
        if (ev.id !== B.id && !actors.get(ev.id)) break;
        if (ev.hard) { B.enraged = true; el.root.classList.add('enraged'); callout(`${ev.id === B.id ? B.name : actors.get(ev.id)?.name || B.name} is enraged!`, 'enrage'); setAura(ev.id); }
        else if (ev.soft) { B.soft = ev.soft; el.enrage.dataset.soft = ev.soft; }
        break;
      case 'say': {
        const who = ev.id === B.id ? B.name : actors.get(ev.id)?.name;
        callout(ev.text, ev.style || 'yell', who);
        break;
      }
    }
  }

  // --- call-out banners ---------------------------------------------------------------------------
  let calloutTimer = 0;
  function callout(text, style = 'yell', who = null) {
    if (!text) return;
    el.callout.className = 'callout show ' + style;
    el.callout.textContent = text;
    clearTimeout(calloutTimer);
    calloutTimer = setTimeout(() => el.callout.classList.remove('show'), style === 'warn' || style === 'enrage' ? 3600 : 2800);
    toast?.chat?.(who ? `${who}: ${text}` : text, style === 'emote' ? 'emote' : 'yell');
  }

  // --- nameplate cast bars --------------------------------------------------------------------------
  function plateCast(id, c) {
    const a = actors.get(id); if (!a?.plate) return;
    let bar = a.plate.root.querySelector('.plate-cast');
    if (!bar) { bar = document.createElement('div'); bar.className = 'plate-cast'; bar.innerHTML = '<i></i><span></span>'; a.plate.root.appendChild(bar); }
    bar.classList.toggle('int', c.int); bar.classList.remove('cut');
    bar.querySelector('span').textContent = c.name;
    bar.hidden = false;
    c.bar = bar;
  }

  // --- the enrage aura (a pulsing red glow on the boss) ----------------------------------------------
  function setAura(id) {
    if (aura) { aura.parent?.remove(aura); aura.material.dispose(); aura = null; }
    const a = id != null ? actors.get(id) : null; if (!a) return;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,60,30,0.85)'); grd.addColorStop(0.5, 'rgba(255,30,10,0.35)'); grd.addColorStop(1, 'rgba(255,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    aura.position.y = a.height * 0.55; aura.scale.setScalar(a.height * 2.4);
    a.group.add(aura);
  }

  function fmtTime(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

  function update(dt) {
    const now = serverNow(), wall = performance.now();
    // Auto-show for a fighting boss in view when the server sent no `boss` event.
    if (B.id == null || (B.ended && wall - B.ended > 4000)) {
      if (B.ended && wall - B.ended > 4000) { el.root.hidden = true; B.id = null; B.ended = 0; }
      for (const a of actors.actors.values()) if (a.rank === 'boss' && !a.dead && a.lastCombat && wall - a.lastCombat < 4000) { B.name = a.name; el.name.textContent = a.name; el.title.textContent = ''; B.phases = []; B.bars = 1; B.bar = 1; B.enrageAt = 0; show(a.id); break; }
    }
    if (B.id != null && !B.ended) {
      const a = actors.get(B.id);
      if (!a) { end(false); }
      else {
        const f = Math.max(0, Math.min(1, a.hp / (a.hpMax || 1)));
        el.fill.style.width = (f * 100).toFixed(2) + '%';
        B.lag += (f - B.lag) * (f < B.lag ? Math.min(1, dt * 1.6) : 1);
        el.lag.style.width = (B.lag * 100).toFixed(2) + '%';
        el.pct.textContent = a.dead ? 'Defeated' : (f * 100).toFixed(1) + '%';
        if (a.dead) end(true);
      }
      if (B.enrageAt) {
        const left = B.enrageAt - now;
        el.enrage.hidden = false;
        el.enrage.textContent = B.enraged ? 'ENRAGED' : `Enrage ${fmtTime(left)}`;
        el.enrage.classList.toggle('soon', left < 30000 && !B.enraged);
      } else {
        el.enrage.hidden = !B.enraged && !B.soft;
        el.enrage.textContent = B.enraged ? 'ENRAGED' : B.soft ? `Frenzy ×${B.soft}` : '';
      }
    }
    // Cast bars (boss frame + nameplates).
    for (const [id, c] of casts) {
      const k = c.end ? Math.max(0, Math.min(1, (now - c.start) / (c.end - c.start))) : 1;
      if (c.bar) { c.bar.querySelector('i').style.width = (k * 100).toFixed(1) + '%'; c.bar.classList.toggle('cut', !!c.cut); }
      if (id === B.id) {
        el.cast.hidden = false;
        if (!c.cut) { el.cast.classList.remove('cut'); el.castName.textContent = c.name; el.castTime.textContent = ((c.end - now) / 1000).toFixed(1) + 's'; }
        el.cast.classList.toggle('int', c.int);
        el.castFill.style.width = (k * 100).toFixed(1) + '%';
      }
      const done = c.cut ? wall - c.cutAt > 900 : now > c.end + 150;
      if (done) { if (c.bar) c.bar.hidden = true; if (id === B.id) el.cast.hidden = true; casts.delete(id); }
    }
    if (aura) aura.material.opacity = 0.65 + Math.sin(wall / 120) * 0.3;
  }

  return { onEvent, update, callout, castOf: id => casts.get(id), get bossId() { return B.id; }, clear() { casts.clear(); el.root.hidden = true; B.id = null; setAura(null); } };
}
