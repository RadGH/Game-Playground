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
      const i = document.createElement('i'); i.style.left = (p.at * 100).toFixed(1) + '%'; i.dataset.tip = p.name || ''; el.ticks.appendChild(i);
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
        // R4: the warning stays readable for the WHOLE wind-up — the line the caster just said (sent at the cast's start)
        // is held until the cast goes off; a boss cast with nothing said names the attack itself
        const ms = (ev.ms || 1000) + 700;
        if (lastSay.id === ev.id && performance.now() - lastSay.at < 500) holdCallout(ms);
        else if (ev.id === B.id) { callout(`${c.name}!`, 'cast', B.name); holdCallout(ms); }
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
      case 'fx':      // encounter fx (C's encounter.js): a boss shield phase (Grimtallow's "wall of blight")
        // play-test 6 U8 (C): `on:true` starts a ward (ms, pool), an update each second carries hp / max / left and NO `on`, `on:false` ends it (why)
        if (ev.kind === 'shield') { const on = 'on' in ev ? !!ev.on : true; wardBar(ev, on); shield(ev.id, on, on && ev.ms == null && ev.left != null ? { ...ev, ms: ev.left } : ev); }
        break;
      case 'say': {
        const who = ev.id === B.id ? B.name : actors.get(ev.id)?.name;
        callout(ev.text, ev.style || 'yell', who);
        lastSay.id = ev.id; lastSay.at = performance.now();
        break;
      }
    }
  }

  // --- shield phases: the bar turns to a barrier and says how to break it; a blue shell on the boss --------
  let shell = null;
  // play-test 6 (U8: "the ward seemed permanent"): a ward now has a LIFE (`ms`) and says how to break it (`text`, `have` /
  // `need`). The shell on the boss thins and flickers faster as its time runs out, a ring on the ground drains like a
  // clock, and the boss frame counts the seconds down.
  let wardRing = null, wardGeoAt = 0;
  const ward = { end: 0, ms: 0, need: 0, have: 0 };
  /** Share of a ward's life left, 0..1 (1 when it has no timer). Pure — exported for tests as wardLeft. */
  const leftOf = (now = performance.now()) => (ward.ms > 0 ? Math.max(0, Math.min(1, (ward.end - now) / ward.ms)) : 1);
  function dropWard() {
    for (const m of [shell, wardRing]) if (m) { m.parent?.remove(m); m.geometry.dispose(); m.material.dispose(); }
    shell = null; wardRing = null;
  }
  // U8 (D-UI): the ward's own bar on the boss frame — how much of it is left to break, and the seconds until it fades
  const W = { el: null, hp: 0, max: 0, end: 0, name: '' };
  function wardBar(ev, on) {
    if (!W.el) { W.el = document.createElement('div'); W.el.className = 'boss-ward'; W.el.hidden = true; W.el.innerHTML = '<i></i><span></span>'; el.root.querySelector('.boss-bar')?.after(W.el); }
    if (!on) {
      W.el.hidden = true; W.end = 0;
      const why = { broken: 'The ward shatters!', expired: 'The ward fades.', script: 'The ward falls!', reset: '' }[ev?.why];
      if (why && toast?.chat) toast.chat(`${B.name || 'The boss'}: ${why.toLowerCase().replace(/[!.]$/, '')}.`, 'event');
      return;
    }
    if (Number.isFinite(ev.pool)) { W.max = ev.pool; W.hp = ev.pool; }
    if (Number.isFinite(ev.max)) W.max = ev.max;
    if (Number.isFinite(ev.hp)) W.hp = ev.hp;
    const left = Number.isFinite(ev.left) ? ev.left : Number.isFinite(ev.ms) ? ev.ms : Number.isFinite(ev.until) ? ev.until - Date.now() : null;
    if (left != null) W.end = performance.now() + Math.max(0, left);
    if (ev.name) W.name = ev.name;
    W.el.hidden = false; paintWard();
  }
  function paintWard() {
    if (!W.el || W.el.hidden) return;
    const secs = W.end ? Math.max(0, Math.ceil((W.end - performance.now()) / 1000)) : null;
    const f = W.max > 0 ? Math.max(0, Math.min(1, W.hp / W.max)) : 1;
    W.el.firstChild.style.width = (f * 100).toFixed(1) + '%';
    const n = v => Math.max(0, Math.round(v)).toLocaleString();
    W.el.lastChild.textContent = `${W.name || 'Ward'}${W.max > 0 ? ` ${n(W.hp)} / ${n(W.max)}` : ''}${secs != null ? ` · fades in ${secs} s` : ''} — break it, or wait it out`;
  }
  function shield(id, on, ev = null) {
    if (B.id !== id && !actors.get(id)) return;
    if (B.id !== id) { const a = actors.get(id); B.name = a.name; el.name.textContent = a.name; el.title.textContent = ''; B.phases = []; show(id); }
    // a ward told to us another way (info.ward for someone who walked in late): the bar follows it too
    if (on && ev && (ev.ms || ev.total) && (!W.el || W.el.hidden)) wardBar({ ms: ev.ms, max: ev.max, hp: ev.hp, name: ev.name }, true);
    else if (!on && W.el && !W.el.hidden) wardBar(ev, false);
    const was = B.shielded;
    B.shielded = on;
    el.root.classList.toggle('shielded', on);
    if (on) {
      const ms = Number(ev?.ms) > 0 ? Number(ev.ms) : 0;
      if (ms && (!was || !ward.ms)) { ward.ms = Number(ev?.total) > ms ? Number(ev.total) : ms; ward.end = performance.now() + ms; }
      else if (!ms && !was) { ward.ms = 0; ward.end = 0; }
      ward.need = ev?.need | 0; ward.have = ev?.have | 0;
      if (!was) callout(ev?.text || `${B.name} is shielded — the barrier must fall first`, 'warn');
    } else if (was) callout(ev?.why === 'faded' ? `${B.name}'s ward gutters out.` : `${B.name}'s shield breaks!`, 'phase');
    const a = actors.get(id);
    if (!on || !a) { dropWard(); return; }
    if (shell && shell.parent === a.group) return;                 // the same ward, told again (a brazier lit): keep the drawing
    dropWard();
    const R = Math.max(1.2, a.height * 0.75);
    shell = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
    shell.scale.setScalar(R); shell.position.y = a.height * 0.5;
    a.group.add(shell);
    wardRing = new THREE.Mesh(new THREE.RingGeometry(R * 1.25, R * 1.5, 48), new THREE.MeshBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    wardRing.rotation.x = -Math.PI / 2; wardRing.position.y = 0.08; wardRing.userData.R = R; wardRing.renderOrder = 2;
    a.group.add(wardRing);
  }

  // --- call-out banners ---------------------------------------------------------------------------
  let calloutTimer = 0;
  const lastSay = { id: null, at: 0 };
  /** Keep the current call-out up for at least `ms` more (R4: a 3 s wind-up keeps its warning for 3 s, not 2.8 s at most). */
  function holdCallout(ms) { clearTimeout(calloutTimer); calloutTimer = setTimeout(() => el.callout.classList.remove('show'), Math.max(2800, ms)); }
  function callout(text, style = 'yell', who = null, quiet = false) {
    if (!text) return;
    el.callout.className = 'callout show ' + style;
    el.callout.textContent = text;
    clearTimeout(calloutTimer);
    calloutTimer = setTimeout(() => el.callout.classList.remove('show'), style === 'warn' || style === 'enrage' ? 3600 : 2800);
    if (!quiet) toast?.chat?.(who ? `${who}: ${text}` : text, style === 'emote' ? 'emote' : 'yell');
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
    if (shell) {
      const k = leftOf(wall);
      // thinner and more urgent as it runs down; the ground ring is the clock (redrawn ten times a second)
      shell.material.opacity = (0.1 + 0.16 * k) + Math.sin(wall / (120 + 220 * k)) * 0.06;
      if (wardRing && ward.ms > 0 && wall - wardGeoAt > 100) {
        wardGeoAt = wall; const R = wardRing.userData.R;
        wardRing.geometry.dispose(); wardRing.geometry = new THREE.RingGeometry(R * 1.25, R * 1.5, 48, 1, Math.PI / 2, Math.max(0.02, Math.PI * 2 * k));
        wardRing.material.color.setHex(k < 0.25 ? 0xffd070 : 0x9fe0ff);
      }
    }
    paintWard();
    if (B.shielded && B.id != null) {
      const secs = ward.ms > 0 ? Math.ceil(Math.max(0, ward.end - wall) / 1000) : null;
      el.pct.textContent = secs != null ? `Warded ${secs}s${ward.need ? ` · ${ward.have}/${ward.need}` : ''}` : 'Shielded';
    }
  }

  return { onEvent, update, callout, castOf: id => casts.get(id), get bossId() { return B.id; }, clear() { casts.clear(); el.root.hidden = true; B.id = null; setAura(null); dropWard(); B.shielded = false; el.root.classList.remove('shielded'); }, shield, wardLeft: leftOf, get ward() { return { ...ward, shielded: !!B.shielded, shell: !!shell, ring: !!wardRing }; } };
}
