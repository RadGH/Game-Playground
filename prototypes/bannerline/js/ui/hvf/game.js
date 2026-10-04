// Hunters vs Farmers — the playable mode on screen (stream H). One module that owns a whole HvF
// session: a setup card (role, format, AI, speed), the match (sim + clock + forest + actors + HUD +
// keyboard-and-mouse input + camera), the results card, and back.
//
//   const hvf = createHvfGame({ gfx, data, host, onExit });
//   hvf.openSetup();            // show the setup card (main.js calls this when the mode card is HvF)
//   hvf.start({ role, format, seed, ai, speed });   // straight into a match (tests)
//   hvf.frame(dt);              // every animation frame while hvf.active
//   hvf.end();                  // back out (restores the scene and viewports it borrowed)
//
// It reuses stream B's renderer (gfx) and RTS camera and stream A's createSim + local clock; it
// draws with js/view/hvf/{world,actors}.js and builds its DOM in js/ui/hvf/hud.js (css/hvf.css).
//
// Controls (keyboard + mouse):
//   right-click      move · on a tree: chop · on a visible enemy (hunter): attack · on a grave: revive
//                    · on a watchstone / snare (farmer): pull it up
//   1-9, 0, -, =     farmer: pick a building, then left-click to place (Shift keeps placing)
//   Q W E (R)        abilities / skills (aimed ones: then left-click a point)
//   G                farmer: send the army to a point
//   L / B            hunter: place a lodge / open the shop at a lodge
//   arrows / screen edge pan, wheel zoom, Space back to your character, Esc cancels / pauses

import { createRtsCamera } from '../../view/camera.js';
import { createLocalClock } from '../../clock.js';
import { createSim, TICK_MS } from '../../sim/sim.js';
import { createHvfWorld, groundY } from '../../view/hvf/world.js';
import { createHvfActors } from '../../view/hvf/actors.js';
import { createHvfHud, REASONS } from './hud.js';
import * as Q from '../../sim/modes/hvf/query.js';
import { KIND } from '../../sim/modes/hvf/mapgen.js';
import { cellOf } from '../../sim/modes/hvf/grid.js';
import { liveGrid } from '../../sim/modes/hvf/grid.js';

const BUILD_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'];
const AI_LEVELS = [['recruit', 'Recruit'], ['veteran', 'Veteran'], ['commander', 'Commander']];

export function createHvfGame({ gfx, data, host, onExit = () => {}, params = new URLSearchParams() }) {
  const THREE = gfx.THREE;
  const rules = data.hvf.rules;
  let m = null;                  // the running match
  let setupEl = null;
  const choice = { role: 'farmer', format: rules.defaultFormat, ai: 'veteran', speed: 1, seed: null };

  // ── setup card ─────────────────────────────────────────────────────────────────────────────────
  function openSetup() {
    end();
    setupEl?.remove();
    setupEl = document.createElement('div');
    setupEl.className = 'hvf-setup';
    host.append(setupEl);
    host.hidden = false;
    const draw = () => {
      const f = rules.formats[choice.format];
      setupEl.innerHTML = `<div class="card" data-ui>
        <header><button class="back" data-act="back">‹ Modes</button><h1>${rules.title}</h1><p>${rules.subtitle}</p></header>
        <h3>Play as</h3>
        <div class="roles">
          <button class="role ${choice.role === 'farmer' ? 'on' : ''}" data-role="farmer"><b>🌾 Farmer</b><span>Slip away from the Commons, find a hidden hollow, raise hens and sheep for gold, wall the door — and later send scarecrows after the hunters. You cannot attack.</span></button>
          <button class="role ${choice.role === 'hunter' ? 'on' : ''}" data-role="hunter"><b>🏹 Hunter</b><span>Wait out the head start in your kennel, then track the farmers by their animals: listen for bleating, follow strays, plant watchstones, build lodges. Strong early, weaker late.</span></button>
        </div>
        <div class="row"><label>Format <select data-k="format">${Object.keys(rules.formats).map((k) => `<option value="${k}" ${k === choice.format ? 'selected' : ''}>${k} — ${rules.formats[k].farmers} farmers v ${rules.formats[k].hunters} hunter${rules.formats[k].hunters > 1 ? 's' : ''}</option>`).join('')}</select></label>
          <label>AI <select data-k="ai">${AI_LEVELS.map(([v, n]) => `<option value="${v}" ${v === choice.ai ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label>Speed <select data-k="speed">${[[1, 'Normal'], [2, 'Fast ×2'], [4, 'Faster ×4']].map(([v, n]) => `<option value="${v}" ${v === choice.speed ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label>Seed <input data-k="seed" type="number" placeholder="random" value="${choice.seed ?? ''}"></label></div>
        <p class="info">${f.size} m forest · head start ${f.headStart} s · ${Math.round(f.clock / 60)} min clock · every other seat is an AI. <a href="hvf-map.html?format=${choice.format}" target="_blank">Preview forests</a></p>
        <button class="start" data-act="start">Start the hunt</button>
      </div>`;
    };
    draw();
    setupEl.onclick = (e) => {
      const r = e.target.closest('[data-role]'); if (r) { choice.role = r.dataset.role; draw(); return; }
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'back') { closeSetup(); onExit(); }
      if (a.dataset.act === 'start') { const sd = setupEl.querySelector('[data-k="seed"]').value; choice.seed = sd === '' ? null : Number(sd) >>> 0; closeSetup(); start(choice); }
    };
    setupEl.onchange = (e) => { const k = e.target.dataset.k; if (k === 'format') choice.format = e.target.value; if (k === 'ai') choice.ai = e.target.value; if (k === 'speed') choice.speed = Number(e.target.value); draw(); };
  }
  function closeSetup() { setupEl?.remove(); setupEl = null; }

  // ── match ────────────────────────────────────────────────────────────────────────────────────────
  function start(opts = {}) {
    end(); closeSetup();
    const o = { ...choice, ...opts };
    const f = rules.formats[o.format];
    const seed = o.seed != null ? o.seed >>> 0 : (Number(params.get('seed')) >>> 0) || ((Math.random() * 0xffffffff) >>> 0);
    const players = [];
    for (let i = 0; i < f.farmers; i++) players.push({ role: 'farmer', kind: 'ai', ai: { difficulty: o.ai }, name: `Farmer ${i + 1}`, colour: i });
    for (let i = 0; i < f.hunters; i++) players.push({ role: 'hunter', kind: 'ai', ai: { difficulty: o.ai }, name: `Hunter ${i + 1}` });
    const me = players.findIndex((p) => p.role === o.role);
    Object.assign(players[me], { kind: 'human', name: 'You' });
    delete players[me].ai;
    const sim = createSim({ mode: 'hvf', format: o.format, seed, players, rules: o.headStart != null ? { headStart: o.headStart } : {} }, data);
    const team = sim.state.players[me].team;

    // borrow the scene: hide what is there (line war's vale), keep the lights
    const scene = gfx.scene;
    const hidden = [];
    for (const c of scene.children) if (!c.isLight && c.visible) { c.visible = false; hidden.push(c); }
    const sceneWas = { background: scene.background, fog: scene.fog };
    scene.background = new THREE.Color(0x1d2620);
    scene.fog = new THREE.Fog(0x25302a, 90, 260);
    const vpsWas = gfx.viewports.slice();
    for (const v of vpsWas) gfx.removeViewport(v);

    const world = createHvfWorld(scene, sim.map);
    const actors = createHvfActors({ scene, map: sim.map, data, fogify: world.fogify, localTeam: team });
    const camera = createRtsCamera();
    camera.setBounds({ x0: 4, x1: sim.map.size - 4, z0: 4, z1: sim.map.size - 4 });
    const vp = { id: 'hvf', camera: camera.camera, rect: { x: 0, y: 0, w: 1, h: 1 }, layout(size) { this.rect = { x: 0, y: 0, w: size.w, h: size.h }; } };
    gfx.addViewport(vp);
    const clock = createLocalClock({ sim, tickMs: TICK_MS, speed: Number(params.get('speed')) || o.speed || 1 });

    host.hidden = false;
    const root = document.createElement('div');
    root.className = 'hvf-root';
    host.append(root);
    const overlay = document.createElement('div'); overlay.className = 'hvf-overlay'; root.append(overlay);

    m = { sim, me, team, world, actors, camera, vp, clock, root, overlay, opts: o, hidden, sceneWas, vpsWas,
      queue: [], placing: null, aim: null, ghost: null, ground: null, keys: new Set(), mouse: { x: 0, y: 0, inside: false }, over: false, overT: 1.5, bars: new Map(), paused: false };
    m.hud = createHvfHud({
      root, sim, player: me,
      onCmd: (c) => issue(c),
      onPlace: (kind) => setPlacing(kind),
      onAim: (spec) => setAim(spec),
      onMinimap: ({ x, z, button }) => { if (button === 2) issue({ type: 'move', x, z }); else camera.lookAt(x, z); },
      getCamBox: () => cameraBox(),
    });
    const startE = sim.state.ents.find((e) => e.id === sim.state.players[me].ent);
    camera.snapTo(startE.x, startE.z);
    m.hud.alert(o.role === 'farmer' ? `Find a hidden spot before the hunters are loose (${f.headStart} s). Hollows are off the trails behind briar or a single tree.` : `You wait in your kennel for ${f.headStart} s while the farmers hide. Listen for their animals.`, 'info', 7000);
    bindInput();
    window.hvf = api;
    return m;
  }

  function issue(c) { if (m && !m.over) m.queue.push({ p: m.me, ...c }); }
  const meEnt = () => m.sim.state.ents.find((e) => e.id === m.sim.state.players[m.me].ent);

  function setPlacing(kind) {
    if (!m) return;
    if (m.ghost) { m.world.group.remove(m.ghost); m.ghost = null; }
    m.aim = null;
    m.placing = kind;
    if (kind) {
      m.ghost = m.actors.ghostFor(kind);
      m.world.group.add(m.ghost);
      m.hud.setPlaceHint(`Place the <b>${data.hvf.buildings.kinds[kind].name}</b>: left-click · Shift keeps placing · right-click / Esc cancels`);
    } else m.hud.setPlaceHint(null);
  }
  function setAim(spec) {
    if (!m) return;
    setPlacing(null);
    const role = m.sim.state.players[m.me].role;
    if (spec.skill) {
      // instant abilities cast at once; aimed ones wait for a click
      if (role === 'farmer' || spec.skill === 'R') { issue({ type: 'cast', slot: spec.skill }); return; }
    }
    m.aim = spec;
    const what = spec.skill ? data.hvf.hunter.skills[spec.skill].name : spec.lodge ? 'Lodge' : spec.army ? 'Send the army' : spec.use === 'ward' ? 'Watchstone' : spec.use === 'flare' ? 'Flare' : '';
    m.hud.setPlaceHint(`<b>${what}</b>: left-click a point · right-click / Esc cancels`);
  }
  function fireAim(x, z) {
    const a = m.aim; if (!a) return;
    if (a.skill) issue({ type: 'cast', slot: a.skill, x, z });
    else if (a.lodge) issue({ type: 'lodge', x, z });
    else if (a.use) issue({ type: 'use', slot: a.slot, x, z });
    else if (a.army) {
      const ids = m.sim.state.ents.filter((e) => e.kind === 'army' && e.owner === m.me && e.alive).map((e) => e.id);
      if (ids.length) issue({ type: 'order', ids, kind: 'amove', x, z });
    }
    m.aim = null; m.hud.setPlaceHint(null);
  }

  /** Right-click: the most useful thing at the point. */
  function smartRight(x, z) {
    const s = m.sim.state, role = s.players[m.me].role, map = m.sim.map;
    const vis = (e) => Q.visibleEnt(m.sim, m.team, e);
    if (role === 'hunter') {
      const t = m.actors.pick(s, x, z, (e) => e.team === 0 && vis(e));
      if (t) { issue({ type: 'attack', target: t.id }); marker(x, z, 'attack'); return; }
    } else {
      const g = s.hvf.graves.find((gr) => gr.pid !== m.me && Math.hypot(gr.x - x, gr.z - z) < 1.8);
      if (g) { issue({ type: 'revive', target: g.pid }); marker(x, z, 'revive'); return; }
      const w = m.actors.pick(s, x, z, (e) => (e.kind === 'ward' || e.kind === 'snare') && vis(e));
      if (w) { issue({ type: 'pullup', target: w.id }); marker(x, z, 'revive'); return; }
    }
    const c = cellOf(map, x, z), k = liveGrid({ state: s, map }).cells[c];
    if (k === KIND.tree || (k === KIND.briar && role === 'hunter')) { issue({ type: 'chop', cell: c }); marker(x, z, 'chop'); return; }
    issue({ type: 'move', x, z }); marker(x, z, 'move');
  }
  function marker(x, z, kind) {
    const p = project(x, groundY(m.sim.map, x, z), z);
    const el = document.createElement('div'); el.className = 'hv-marker ' + kind; el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    m.overlay.append(el); setTimeout(() => el.remove(), 600);
  }
  const project = (x, y, z) => { const p = m.camera.project(x, y, z, m.vp.rect); return p; };
  function cameraBox() {
    const r = m.vp.rect;
    const pts = [[0, 0], [r.w, 0], [r.w, r.h - 150], [0, r.h - 150]].map(([x, y]) => m.camera.groundAt(x, y, r));
    return pts.every(Boolean) ? pts : null;
  }

  // ── input ──────────────────────────────────────────────────────────────────────────────────────
  function bindInput() {
    const r = m.root;
    const ui = (t) => t.closest && t.closest('[data-ui], button, select, input, canvas.hv-mini, .hv-result');
    m.onDown = (e) => {
      if (ui(e.target)) return;
      const g = groundAtClient(e.clientX, e.clientY); if (!g) return;
      if (e.button === 0) {
        if (m.placing) { issue({ type: 'build', kind: m.placing, x: g.x, z: g.z }); if (!e.shiftKey) setPlacing(null); return; }
        if (m.aim) { fireAim(g.x, g.z); return; }
        // left-click your Harvest Hall: nothing to open (the army panel is always shown) — look there
      } else if (e.button === 2) {
        if (m.placing || m.aim) { setPlacing(null); m.aim = null; m.hud.setPlaceHint(null); return; }
        smartRight(g.x, g.z);
      }
    };
    m.onMove = (e) => { m.mouse.x = e.clientX; m.mouse.y = e.clientY; m.mouse.inside = true; };
    m.onLeave = () => { m.mouse.inside = false; };
    m.onWheel = (e) => { if (ui(e.target)) return; e.preventDefault(); m.camera.zoomBy(e.deltaY > 0 ? 1 : -1); };
    m.onCtx = (e) => { if (!e.target.closest('.hv-mini')) e.preventDefault(); };
    m.onKey = (e) => {
      if (e.target.closest && e.target.closest('input, select, textarea')) return;
      const down = e.type === 'keydown';
      if (down) m.keys.add(e.code); else m.keys.delete(e.code);
      if (!down || e.repeat || m.over) return;
      const role = m.sim.state.players[m.me].role;
      if (e.code === 'Escape') { if (m.placing || m.aim) { setPlacing(null); m.aim = null; m.hud.setPlaceHint(null); } else if (m.hud.shopOpen) m.hud.toggleShop(false); else togglePause(); return; }
      if (e.code === 'Space') { e.preventDefault(); m.camera.centre(); return; }
      if (['KeyQ', 'KeyW', 'KeyE', 'KeyR'].includes(e.code)) { e.preventDefault(); setAim({ skill: e.code.slice(3) }); return; }
      if (role === 'farmer') {
        const i = BUILD_KEYS.indexOf(e.code);
        if (i >= 0 && data.hvf.buildings.order[i]) { setPlacing(data.hvf.buildings.order[i]); return; }
        if (e.code === 'KeyG') setAim({ army: true });
      } else {
        const i = BUILD_KEYS.indexOf(e.code);
        if (i >= 0 && i < 6) { m.hud.useSlot(i); return; }
        if (e.code === 'KeyL') setAim({ lodge: true });
        if (e.code === 'KeyB') m.hud.toggleShop();
      }
    };
    r.addEventListener('mousedown', m.onDown);
    window.addEventListener('mousemove', m.onMove);
    r.addEventListener('mouseleave', m.onLeave);
    r.addEventListener('wheel', m.onWheel, { passive: false });
    r.addEventListener('contextmenu', m.onCtx);
    window.addEventListener('keydown', m.onKey);
    window.addEventListener('keyup', m.onKey);
  }
  function unbindInput() {
    if (!m || !m.onDown) return;
    m.root.removeEventListener('mousedown', m.onDown);
    window.removeEventListener('mousemove', m.onMove);
    window.removeEventListener('keydown', m.onKey);
    window.removeEventListener('keyup', m.onKey);
  }
  function groundAtClient(cx, cy) {
    const canvas = gfx.renderer.domElement.getBoundingClientRect();
    return m.camera.groundAt(cx - canvas.left, cy - canvas.top, m.vp.rect);
  }
  function togglePause() {
    m.paused = !m.paused;
    m.clock.setPaused(m.paused);
    m.hud.alert(m.paused ? 'Paused — Esc to resume' : 'Resumed', 'info', 1200);
  }

  // ── per frame ──────────────────────────────────────────────────────────────────────────────────
  function frame(dt) {
    if (!m) return;
    const { sim, camera } = m;
    const s = sim.state;
    // camera: keys + screen edges
    let px = 0, py = 0;
    // arrows pan (Q W E R are abilities, so no WASD here)
    if (m.keys.has('ArrowLeft')) px -= 1;
    if (m.keys.has('ArrowRight')) px += 1;
    if (m.keys.has('ArrowUp')) py += 1;
    if (m.keys.has('ArrowDown')) py -= 1;
    if (m.mouse.inside && document.hasFocus?.()) {
      const W = innerWidth, H = innerHeight, e = 6;
      if (m.mouse.x < e) px -= 1; else if (m.mouse.x > W - e) px += 1;
      if (m.mouse.y < e) py += 1; else if (m.mouse.y > H - e) py -= 1;
    }
    m.ground = m.mouse.inside ? groundAtClient(m.mouse.x, m.mouse.y) : null;
    const meE = meEnt();
    camera.update(dt, { follow: meE && meE.alive ? { x: meE.x, z: meE.z } : null, pan: { x: px, y: py }, viewportH: m.vp.rect.h });

    // sim
    const events = m.clock.frame(dt * 1000, () => { const q = m.queue; m.queue = []; return q; });
    for (const ev of events) m.hud.onEvent(ev);

    // fog + world
    m.world.setFog(s.hvf.vision[m.team], s.hvf.explored[m.team]);
    m.world.syncChopped(s.hvf.chopped);
    const visible = (e) => Q.visibleEnt(sim, m.team, e);
    const remembered = m.team === 1 ? Q.seenBuildings(sim, 1) : [];
    m.actors.sync(s, m.clock.alpha, m.paused ? 0 : dt, visible, remembered);

    // placement ghost
    if (m.ghost && m.ground) {
      const def = data.hvf.buildings.kinds[m.placing], cell = sim.map.cell;
      const cx = Math.round(m.ground.x / cell - def.size[0] / 2), cz = Math.round(m.ground.z / cell - def.size[1] / 2);
      const x = (cx + def.size[0] / 2) * cell, z = (cz + def.size[1] / 2) * cell;
      m.ghost.position.set(x, groundY(sim.map, x, z), z);
      const why = Q.buildCheck(sim, m.me, m.placing, m.ground.x, m.ground.z);
      m.ghost.material.opacity = why ? 0.3 : 0.65;
      m.ghost.visible = true;
      m.hud.setPlaceHint(`Place the <b>${def.name}</b>${why ? ` — <span class="bad">${REASONS[why] || why}</span>` : ''} · left-click · Shift keeps placing · right-click cancels`);
    } else if (m.ghost) m.ghost.visible = false;

    // health bars over what you can see and is hurt (and always over characters)
    drawBars(visible);
    m.hud.update(dt, { visibleEnt: visible, remembered, placing: m.placing });

    if (sim.over && !m.over) {
      m.overT -= dt;
      if (m.overT <= 0) {
        m.over = true;
        m.hud.showResult(s.result, { onAgain: () => start({ ...m.opts, seed: null }), onBack: () => { end(); openSetup(); } });
      }
    }
  }

  function drawBars(visible) {
    const s = m.sim.state, seen = new Set();
    for (const e of s.ents) {
      if (!e.alive || e._gone) continue;
      const isChar = e.kind === 'farmer' || e.kind === 'hunter';
      if (!isChar && !(e.kind === 'army' || e.kind === 'building') ) continue;
      if (!isChar && e.hp >= e.hpMax - 0.5) continue;
      if (!visible(e)) continue;
      const h = e.kind === 'building' ? 4 : e.kind === 'hunter' ? 2.6 : 2.2;
      const p = m.camera.project(e.x, groundY(m.sim.map, e.x, e.z) + h, e.z, m.vp.rect);
      if (!p.visible) continue;
      seen.add(e.id);
      let b = m.bars.get(e.id);
      if (!b) { b = document.createElement('div'); b.className = 'hv-hp ' + (e.team === m.team ? 'mine' : 'foe') + (e.id === s.players[m.me].ent ? ' me' : ''); b.innerHTML = '<i></i>'; m.overlay.append(b); m.bars.set(e.id, b); }
      b.style.transform = `translate(${p.x.toFixed(0)}px, ${p.y.toFixed(0)}px)`;
      b.firstChild.style.width = Math.max(0, Math.min(100, e.hp / e.hpMax * 100)).toFixed(0) + '%';
    }
    for (const [id, b] of m.bars) if (!seen.has(id)) { b.remove(); m.bars.delete(id); }
  }

  function end() {
    if (!m) return;
    unbindInput();
    m.world.dispose(); m.actors.dispose();
    gfx.removeViewport(m.vp);
    for (const v of m.vpsWas) gfx.addViewport(v);
    for (const c of m.hidden) c.visible = true;
    gfx.scene.background = m.sceneWas.background; gfx.scene.fog = m.sceneWas.fog;
    m.hud.destroy(); m.root.remove();
    m = null;
    if (window.hvf === api) delete window.hvf;
  }

  // test hooks
  const api = {
    openSetup, start, frame, end,
    get active() { return !!m || !!setupEl; },
    get match() { return m; },
    state: () => m?.sim.state,
    issue,
    /** Run the sim forward right now (queued commands go in on the first tick). */
    fastForward(ticks) { if (!m) return 0; let n = 0; while (n < ticks && !m.sim.over) { const q = m.queue; m.queue = []; m.sim.step(q); for (const ev of m.sim.drainEvents()) m.hud.onEvent(ev); n++; } return n; },
    lookAt(x, z) { m?.camera.lookAt(x, z); },
    setFogOn(v) { m?.world.setFogOn(v); },
    probe() {
      gfx.render();
      const gl = gfx.renderer.getContext(), px = new Uint8Array(4), vals = [];
      const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
      for (let yi = 1; yi <= 10; yi++) for (let xi = 1; xi <= 10; xi++) { gl.readPixels(Math.floor(W * xi / 11), Math.floor(H * yi / 11), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); vals.push(0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2]); }
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      return { mean, sd: Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length), calls: gfx.info().calls };
    },
  };
  return api;
}
