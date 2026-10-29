// The console's side of the commander's magic (PLAN M6). Main thread only — it never changes game state: it sends
// `arm` / `cast` / `disarm` (§3.3) and draws what the frames say.
//
//   installArcane(C) → C.arcane   (main.js calls it once the desk is up; safe to call again for a new game)
//
// A FIRE MISSION is two separate actions: pull a cartridge on the Spell Board (the sim turns the key itself — `arm`),
// then mark the target on the scope with the light pen and press FIRE (`cast`). While a cartridge is out the light
// pen is an AIMING tool: `aim` (tap a spot) or `aimline` (drag a line, for the line of fire and the stone ridge).
// This file adds those two pen tools (C.penTools), draws the target and the warnings on the glass (C.overlays), paints
// the spells' light into the WebGL scope (js/render/spellfx.js), and turns the mana events into teletype lines, the
// bunker shake and room sounds (C.eventHooks). Enter fires, Esc puts the cartridge back.

import { LINE_TOOLS } from './pen.js';
import { gridRef } from './view.js';
import { createSpellFx, drawSpellOverlay } from '../render/spellfx.js';

const AIM_TOOLS = new Set(['aim', 'aimline']);
// the spell and mana data load while the title is up, so starting a game never waits on them
const DATA_URL = new URL('../../data/', import.meta.url);
let DATA = null;
export function preloadArcane() { DATA ||= Promise.all(['spells.json', 'mana.json'].map((f) => fetch(new URL(f, DATA_URL)).then((r) => r.json()))); return DATA; }
preloadArcane();

export async function installArcane(C) {
  C.arcane?.dispose?.();
  const [spells, mana] = await preloadArcane();
  const rows = Object.fromEntries(spells.list.map((s) => [s.id, s]));
  LINE_TOOLS.add('aimline');
  C.penTools ||= {}; C.overlays ||= []; C.eventHooks ||= [];
  const listeners = new Set();
  const off = [];

  // ---- the sim's clock, smoothed between frames (so a falling meteor lands when the sim lands it)
  let lastTick = C.game.link.tick, lastAt = performance.now();
  const simNow = () => {
    const rate = C.game?.link.rate ?? 20;
    return lastTick + Math.min(0.3, (performance.now() - lastAt) / 1000) * rate;
  };
  const hud = () => C.econ?.hud?.mana || null;
  const hqAt = () => { for (const b of C.econ?.buildings.values() || []) if (b.type === 'hq') return [b.fp.cx, b.fp.cy]; const h = C.game?.link.debug.map.hq; return h ? [h.x, h.y] : [0, 0]; };

  const A = {
    spells, mana, rows,
    aim: { spell: null, target: null, eta: 0 },
    get hud() { return hud(); },
    on(f) { listeners.add(f); return () => listeners.delete(f); },
    changed() { for (const f of listeners) { try { f(); } catch (e) { console.error(e); } } },
    simNow,
    /** Client mirror of the sim's sight rule, for the red/green mark while aiming (the sim has the last word). */
    sightOf(x, y, mode = 'live') {
      const r = C.game?.scope.renderer;
      if (!r) return 'NO SCOPE';
      const sensors = C.econ?.hud?.sensors || [];
      const inSensor = sensors.some((s) => (x - s.x) * (x - s.x) + (y - s.y) * (y - s.y) <= s.r * s.r);
      if (mode === 'sensor') return inSensor ? null : 'OUT OF SENSOR RANGE';
      const f = r.fogAt(x, y);
      if (f === 2) return null;
      if (f === 0) return 'NEVER SEEN';
      if (!inSensor) return 'OUT OF SIGHT';
      if ((r.gasAt?.(x, y) || 0) >= (C.econ?.data.balance.sight.smokeBlocks ?? 90)) return 'SMOKE HIDES IT';
      return 'TOO DARK';
    },
    etaTo(id, x, y) {
      const def = rows[id]; if (!def) return 0;
      const [hx, hy] = hqAt();
      return Math.max(1, Math.round(def.travel.base + def.travel.perCell * Math.hypot(x - hx, y - hy)));
    },
    /** Pull a cartridge: the sim turns the key; the pen becomes the aiming tool. */
    arm(id) {
      const def = rows[id]; if (!def || !C.game) return;
      C.room.play('slap'); setTimeout(() => C.room.play('detent', { step: 5, count: 6 }), 160); setTimeout(() => C.room.play('detent', { step: 2, count: 6 }), 330);
      C.send({ t: 'arm', spell: id });
      A.aim.spell = id; A.aim.target = null; A.aim.eta = 0;
      const tb = C.game.desk.M.toolbank.bank;
      if (tb.value) tb.set(null, 'code');
      C.state.set('tool', def.shape === 'line' ? 'aimline' : 'aim');
      C.print({ who: 'Arcane', text: `${def.name.toUpperCase()} CARTRIDGE PULLED — ${def.shape === 'line' ? 'DRAW THE LINE' : 'MARK THE TARGET'} WITH THE LIGHT PEN, THEN FIRE.` });
      A.changed();
    },
    /** Put the cartridge back (the key springs back). */
    safe(quiet = false) {
      if (!A.aim.spell) return false;
      A.aim.spell = null; A.aim.target = null;
      if (hud()?.armed) C.send({ t: 'disarm' });
      if (AIM_TOOLS.has(C.state.get('tool'))) C.state.set('tool', null);
      if (!quiet) C.room.play('slapdown');
      A.changed();
      return true;
    },
    setTarget(t) {
      if (!A.aim.spell) return;
      A.aim.target = t;
      const mx = t.x2 != null ? (t.x + t.x2) / 2 : t.x, my = t.y2 != null ? (t.y + t.y2) / 2 : t.y;
      A.aim.eta = A.etaTo(A.aim.spell, mx, my);
      C.room.play('detent', { step: 4, count: 6 });
      A.changed();
    },
    /** FIRE: send the cast with the marked target. */
    fire() {
      const a = A.aim; if (!a.spell) { C.room.play('locked'); return false; }
      if (!a.target) { C.room.play('locked'); C.print({ who: 'Arcane', text: 'NO TARGET MARKED — USE THE LIGHT PEN ON THE SCOPE FIRST.' }); return false; }
      C.send({ t: 'cast', spell: a.spell, x: a.target.x, y: a.target.y, x2: a.target.x2, y2: a.target.y2 });
      C.room.play('press'); setTimeout(() => C.room.play('degauss'), 60);
      return true;
    },
    /** A cast that went out: the board is safe again. */
    fired() { A.aim.spell = null; A.aim.target = null; if (AIM_TOOLS.has(C.state.get('tool'))) C.state.set('tool', null); A.changed(); },
    dispose() { for (const f of off) f(); listeners.clear(); },
  };
  C.arcane = A;

  // ---- light pen: the two aiming tools
  C.penTools.aim = { click: ([x, y]) => A.setTarget({ x, y }) };
  C.penTools.aimline = { stroke: (pts) => { const a = pts[0], b = pts[pts.length - 1]; A.setTarget({ x: a[0], y: a[1], x2: b[0], y2: b[1] }); } };
  off.push(C.state.on('tool', (t) => { if (A.aim.spell && !AIM_TOOLS.has(t)) A.safe(true); }));

  // ---- the spells' light, painted into the WebGL scope
  const fx = createSpellFx({ simNow, hqAt, spells: () => hud()?.active || [] });
  fx.setRows(spells.list);
  const scopeApi = C.game.scope.renderer.scope;
  if (scopeApi?.addPainter) off.push(scopeApi.addPainter(fx.painter));
  A.fx = fx;

  // ---- marks on the glass
  const overlay = (ctx, o) => drawSpellOverlay(ctx, { toS: o.toS, ppc: o.ppc, now: simNow(), aim: A.aim, active: hud()?.active || [], rows, sightOf: A.sightOf });
  C.overlays.push(overlay);
  off.push(() => { const i = C.overlays.indexOf(overlay); if (i >= 0) C.overlays.splice(i, 1); });

  // ---- events → teletype, shake, sounds
  const where = (ev) => (ev.x == null ? '' : ` AT ${gridRef(ev.x, ev.y)}`);
  const shakeDesk = (big) => {
    // the shake goes on #app, not on the desk: the desk's own fade-in animation would restart (and blank it) if its animation changed
    const d = C.game ? document.getElementById('app') : null; if (!d) return;
    d.classList.remove('shake', 'shake-big'); void d.offsetWidth; d.classList.add(big ? 'shake-big' : 'shake');
    setTimeout(() => d.classList.remove('shake', 'shake-big'), big ? 900 : 450);
  };
  const onEvent = (ev) => {
    if (ev.tick != null) { lastTick = Math.max(lastTick, ev.tick); }
    fx.onEvent(ev, performance.now());
    const def = rows[ev.spell];
    switch (ev.e) {
      case 'spellCast':
        C.print({ who: 'Arcane', text: `${def.name.toUpperCase()} AWAY${where(ev)} — ${def.cost} MANA, LANDS IN ${(ev.eta / 20).toFixed(1)} S.` });
        A.fired();
        break;
      case 'spellLanded':
        if (ev.spell === 'meteor') { shakeDesk(true); C.room.play('crate'); setTimeout(() => C.room.play('hatch'), 40); setTimeout(() => C.room.play('degauss'), 200); }
        else if (ev.spell === 'lightning') { shakeDesk(false); C.room.play('degauss'); C.room.play('squelch'); }
        else C.room.play('press');
        if (ev.spell === 'lightning' && ev.hits) C.print({ who: 'Arcane', text: `LIGHTNING STRUCK ${ev.hits} ${ev.hits > 1 ? 'TARGETS' : 'TARGET'}${ev.water ? ' THROUGH THE WATER' : ''}.` });
        break;
      case 'combo':
        C.print({ who: 'High Command', text: `COMMENDATION — ${ev.name}: ${String(ev.text).toUpperCase()}`, red: true });
        C.room.play('bell');
        break;
      case 'batteryBurst':
        C.print({ who: 'Arcane', text: `A MANA BATTERY BURST${where(ev)} — ${ev.charge} MANA LOST.`, red: true });
        shakeDesk(true); C.room.play('crate');
        break;
      case 'clusterStripped':
        C.print({ who: 'Survey', text: `CRYSTAL CLUSTER${where(ev)} STRIPPED BARE — IT WILL NOT GROW BACK.`, red: true });
        break;
      case 'refused':
        if (ev.cmd === 'arm' && A.aim.spell) A.safe(true);
        if (ev.cmd === 'cast' || ev.cmd === 'arm') A.changed();
        break;
      default: break;
    }
    if (ev.e === 'spellArmed' || ev.e === 'spellDisarmed' || ev.e === 'spellEnded') A.changed();
  };
  C.eventHooks.push(onEvent);
  off.push(() => { const i = C.eventHooks.indexOf(onEvent); if (i >= 0) C.eventHooks.splice(i, 1); });
  // the frame tick (for the smooth clock) and the board's needles
  const onEcon = () => { const t = C.game?.link.tick; if (t != null && t !== lastTick) { lastTick = t; lastAt = performance.now(); } A.changed(); };
  C.onEcon.push(onEcon);
  off.push(() => { const i = C.onEcon.indexOf(onEcon); if (i >= 0) C.onEcon.splice(i, 1); });

  // ---- keys: Enter fires, Esc puts the cartridge back (before the desk's own Esc, which would open the menu)
  const key = (e) => {
    if (!A.aim.spell || document.querySelector('.modal')) return;
    if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); A.fire(); }
    else if (e.key === 'Escape') { if (C.game?.scope.pen.stroke) return; e.preventDefault(); e.stopImmediatePropagation(); A.safe(); }
  };
  addEventListener('keydown', key, true);
  off.push(() => removeEventListener('keydown', key, true));

  // window.gameEye.arcane — what the specs and Claude's game-eye read
  if (window.gameEye) {
    window.gameEye.arcane = () => ({ aim: { ...A.aim }, mana: hud(), tool: C.state.get('tool') });
    // screenshots only: stretch every flash, bolt and fireball (the world's and the spells') so a still can catch it
    window.gameEye.fxSlow = (k = 1) => { if (scopeApi?.opts) scopeApi.opts.fxSlow = k; fx.slow = k; return k; };
  }
  return A;
}
