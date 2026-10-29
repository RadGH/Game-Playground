// Lodestar boot (M2): load the console data, show the bunker hatch, and on start mount the desk round the scope and
// open the line to the world. The main thread never changes game state — it sends commands and draws frames.
import { createState } from './console/state.js';
import { createView } from './console/view.js';
import { loadSettings, saveSettings, volumeOf } from './console/settings.js';
import { createRoom } from './audio/room.js';
import { mountTitle } from './console/title.js';
import { mountDesk } from './console/desk.js';
import { createWorldLink } from './console/link.js';
import { createPadNav } from './console/padnav.js';
import { installEye } from './eye.js';
import { createWhatsNew } from '../../../shared/whats-new.js';
import { compileData } from './sim/data.js';
import { gridRef } from './console/view.js';
import { installArcane } from './console/arcane.js'; // M6: spell aiming, spell effects, mana events
import { installDefence } from './console/defence.js'; // M4: walls on the pen, raids, THREAT, alarms + radio story

const data = await (await fetch(new URL('../data/console.json', import.meta.url))).json();
const settings = loadSettings();
const room = createRoom({ volume: volumeOf(settings), enabled: settings.volume > 0 });
const state = createState({ tool: null, range: data.range.default, filter: 'sight', rate: data.time.default, drawer: null, page: 'tools', buildType: null, inspect: null });
const news = createWhatsNew({ url: new URL('../data/changelog.json', import.meta.url), key: 'lodestar', title: "WHAT'S NEW" });
const app = document.getElementById('app');

const C = {
  data, settings, room, state, news, game: null, hud: null,
  setSetting(k, v) { settings[k] = v; saveSettings(settings); applySettings(); },
  modalClosed() {},
  quit,
  clockText() { const h = C.hud?.hour ?? 0, hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; },
  print: () => {},
  send: cmd => C.game?.link.send(cmd),
  rangeStep(d, sx, sy) { if (!C.game) return; C.game.anchor = sx != null ? [sx, sy] : null; C.game.desk.M.range.knob.step(d, 'code'); },
  // ---- the economy as the console knows it (M3): kept from the frames, read by the scope overlay and the ledger
  econ: null, onEcon: [],
  /** Load a ledger card into the BUILD switch: the ghost follows the pen until you place it or drop the switch. */
  armBuild(type) {
    if (!C.game) return;
    state.set('buildType', type);
    C.game.desk.M.toolbank.bank.set('build', 'code');
    if (matchMedia('(min-width: 900px) and (min-height: 560px)').matches) C.game.desk.closeDrawer();
    C.room.play('press');
    C.print({ who: 'Quartermaster', text: `${C.econ.data.B[type].name.toUpperCase()} LOADED — PICK A SPOT ON THE SCOPE.` });
  },
  openLedger(tab) {
    const d = C.game?.desk; if (!d || !d.unlocked.has('ledger')) return;
    Promise.resolve(d.openDrawer('ledger')).then(() => d.machine?.('ledger')?.show(tab));
  },
  inspect(id) { state.set('inspect', id); C.openLedger('inspect'); },
};

function applySettings() {
  room.setVolume(volumeOf(settings)); room.setEnabled(settings.volume > 0); room.hum(settings.hum);
  document.body.classList.toggle('no-crt', !settings.crt);
  document.body.dataset.quality = ['low', 'standard', 'high'][settings.quality];
  C.game?.scope.resize();
  C.game?.scope.renderer.setCrt?.(settings.crt); C.game?.scope.renderer.setQuality?.(['low', 'standard', 'high'][settings.quality]);
}
applySettings();

const title = mountTitle(C, app, { onStart: g => startGame(g) });

async function startGame(g) {
  // generate while the hatch swings open
  await new Promise(r => setTimeout(r, 30));
  // the world is the real sim in its worker (js/console/world-link.js)
  let link;
  try { link = await createWorldLink({ seed: g.seed, mapSize: g.mapSize, difficulty: g.difficulty }); }
  catch (e) { showFailure(e); return; }
  C.econ = { data: compileData(link.data), buildings: new Map(), roads: new Map(), walls: new Map(), survey: null, hud: null };
  const view = createView({ size: link.size, ppc: data.range.detents[state.get('range')] });
  C.view = view;
  C.game = { link, view, game: g, anchor: null, desk: null, scope: null };
  const desk = await mountDesk(C, app);
  C.game.desk = desk; C.game.scope = desk.M.scope;
  await installArcane(C); // M6
  await installDefence(C); // M4
  const hq = link.debug.map.hq; view.centre(hq.x, hq.y);
  desk.M.scope.setRange(state.get('range')); desk.M.scope.setFilter(state.get('filter'));
  link.setRate(data.time.detents[state.get('rate')]);
  title.hide();
  document.body.classList.add('in-game');
  room.hum(settings.hum);
  C.print({ who: 'Quartermaster', text: `POSTING CONFIRMED. SEED ${g.seed} · ${g.mapSize.toUpperCase()} MAP · ${g.difficulty.toUpperCase()}.` });
}

function showFailure(e) {
  console.warn('the world could not start', e);
  title.show();
  const m = document.createElement('div');
  m.className = 'modal boot-fail'; m.setAttribute('aria-label', 'The world could not start');
  m.innerHTML = `<div class="modal-panel"><p class="placeholder-note">THE SCOPE WILL NOT WARM UP: ${String(e.message || e).toUpperCase()}</p><button type="button" class="push" data-close>CLOSE</button></div>`;
  m.querySelector('[data-close]').addEventListener('click', () => m.remove());
  document.body.append(m);
}

function quit() {
  if (!C.game) return;
  C.game.desk.el.remove(); C.game.link.close?.(); C.game = null; C.hud = null;
  room.klaxon(false);
  document.body.classList.remove('in-game');
  state.set('tool', null); state.set('drawer', null); state.set('buildType', null); state.set('inspect', null);
  title.show();
}

// ---- state → world ----
state.on('range', i => {
  const g = C.game; if (!g) return;
  const a = g.anchor; g.anchor = null;
  g.view.zoomAt(data.range.detents[i], a?.[0] ?? g.view.screen[0] / 2, a?.[1] ?? g.view.screen[1] / 2);
  g.scope.pen.follow(); g.scope.setRange(i);
});
state.on('filter', f => C.game?.scope.setFilter(f));
state.on('rate', i => { const g = C.game; if (!g) return; g.link.setRate(data.time.detents[i]); g.scope.setPaused(data.time.detents[i] === 0); });
state.on('tool', t => { document.body.dataset.tool = t || ''; if (t !== 'build') state.set('buildType', null); });

// ---- events → machines ----
const EVENT_LAMPS = { fire: ['fire', 'on'], baseAlarm: ['base', 'blink'] }; // RAID / HQ / CONVOY belong to M4 (js/console/defence.js)
const where = (ev) => ev.x != null ? ` AT ${gridRef(ev.x, ev.y)}` : '';
const resName = (r) => C.econ?.data.R[r]?.name.toUpperCase() || String(r).toUpperCase();
/** Plain words for the economy's events (the teletype's lines). */
function econLine(ev) {
  switch (ev.e) {
    case 'built': return ev.type === 'road' ? { who: 'Works', text: `${ev.name.toUpperCase()} LAID${where(ev)} — ${Math.round(ev.len / 2)} M.` } : ev.type === 'hq' ? null : { who: 'Works', text: `${ev.name.toUpperCase()} RAISED${where(ev)}.` };
    case 'placed': return { who: 'Works', text: `${C.econ.data.B[ev.type].name.toUpperCase()} STAKED OUT${where(ev)} — BUILDERS ON THEIR WAY.` };
    case 'roadPlanned': { const c = Object.entries(ev.cost || {}).map(([r, n]) => `${n} ${resName(r)}`).join(', '); return { who: 'Works', text: `ROAD MARKED: ${Math.round(ev.len / 2)} M${ev.bridge > 0 ? `, ${Math.round(ev.bridge / 2)} M OF IT BRIDGE (${c})` : ''}. CREWS LAYING IT.` }; }
    case 'destroyed': if ((ev.by && ev.by !== 'demolish' && ev.by !== 'clear') || ev.type === 'wall' || ev.type === 'gate') return null; return { // M4 tells raid losses and wall clears itself
       who: 'Works', text: `${String(ev.name || ev.type).toUpperCase()} ${ev.by === 'clear' ? 'CLEARED' : 'PULLED DOWN'}${where(ev)}.` };
    case 'jam': return { who: 'Foreman', text: `${C.econ.data.B[ev.type]?.name.toUpperCase() || ev.type}${where(ev)} — ${ev.lamp.toUpperCase()}: ${String(ev.why).toUpperCase()}.`, red: ev.lamp !== 'output' };
    case 'depleted': return ev.what === 'reach' ? null : { who: 'Survey', text: `${resName(ev.res)} ${ev.what === 'deposit' ? 'DEPOSIT' : 'OUTCROP'}${where(ev)} IS WORKED OUT.`, red: true };
    case 'deposit': return ev.layer === 'surface' ? null : { who: 'Survey', text: `THUMPER: ${resName(ev.res)} DEPOSIT FOUND${where(ev)} — ABOUT ${Math.round(ev.amt / 100) * 100} UNITS.`, red: true };
    case 'researchDone': return { who: 'Quartermaster', text: `NEW PLANS (${ev.name.toUpperCase()}): ${ev.unlocks.map((u) => C.econ.data.B[u].name.toUpperCase()).join(', ')} — ADDED TO THE BUILD LEDGER.`, red: true };
    case 'undone': return { who: 'Works', text: 'TAKEN BACK — EVERYTHING RETURNED TO THE STORES.' };
    default: return null;
  }
}
function onEvents(evs) {
  const M = C.game.desk.M;
  let surfaceSeen = 0;
  for (const ev of evs) {
    for (const f of C.eventHooks || []) f(ev); // later milestones' consoles (M6: spells)
    if (ev.e === 'refused') { M.teletype.print({ who: 'Quartermaster', text: String(ev.why).toUpperCase() }); C.game.scope.refused(ev.cmd); room.play('locked'); }
    else if (ev.e === 'radio') M.radio.say(ev);
    else if (ev.e === 'teletype') M.teletype.print(ev);
    else if (ev.e === 'machineUnlocked') C.game.desk.deliver(ev.machine);
    else if (ev.e === 'deposit' && ev.layer === 'surface') surfaceSeen++;
    else if (ev.e === 'placed' && state.get('tool') === 'build' && !keys.has('shift')) { M.teletype.print(econLine(ev)); M.toolbank.bank.set(null, 'code'); } // one placement per card (hold Shift to keep placing)
    else { const l = econLine(ev); if (l) M.teletype.print(l); }
    if (EVENT_LAMPS[ev.e]) { const [lamp, st] = EVENT_LAMPS[ev.e]; M.alarms.set(lamp, st, ev.x != null ? { x: ev.x, y: ev.y } : null); }
  }
  if (surfaceSeen && C.game.tickSeen > 40) M.teletype.print({ who: 'Survey', text: `${surfaceSeen} NEW OUTCROP${surfaceSeen > 1 ? 'S' : ''} ON THE ORE CHART.` });
}
/** Keep the console's copy of the economy from a frame. */
function ingestEcon(fr) {
  const E = C.econ;
  let changed = false;
  for (const b of fr.buildings || []) { E.buildings.set(b.id, b); changed = true; }
  for (const id of fr.gone || []) { if (E.buildings.delete(id)) changed = true; if (state.get('inspect') === id) state.set('inspect', null); }
  for (const v of fr.vectors || []) { (v.kind === 'wall' ? E.walls : E.roads).set(v.id, v); changed = true; } // M4: walls apart from roads
  for (const id of fr.vectorsGone || []) { E.roads.delete(id); E.walls?.delete(id); changed = true; }
  if (fr.survey) { E.survey = fr.survey; changed = true; }
  if (fr.hud) { E.hud = fr.hud; changed = true; }
  if (changed) for (const f of C.onEcon) f();
}

// ---- keyboard ----
const keys = new Set();
C.keyDown = (k) => keys.has(k); // M4: Shift = a ruler-straight wall
const typingInto = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.getAttribute?.('role') === 'slider';
addEventListener('keydown', e => {
  room.unlock();
  if (!C.game || document.querySelector('.modal')) { if (e.key === 'Escape' && !document.querySelector('.modal') && C.game) C.game.desk.M.menu.open(); return; }
  if (typingInto(e)) return;
  const k = e.key.toLowerCase(), M = C.game.desk.M;
  if (k === 'shift') { keys.add(k); return; }
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys.add(k); e.preventDefault(); return; }
  if (e.repeat && !['q', 'e', '-', '=', '+'].includes(k)) return;
  if (k === 'q' || k === '-') C.rangeStep(-1);
  else if (k === 'e' || k === '=' || k === '+') C.rangeStep(1);
  else if (k === 'f') { const kn = M.filter.knob; kn.set((kn.index + 1) % data.filters.length, 'key'); }
  else if (/^[1-6]$/.test(k)) { const t = data.tools[+k - 1]; if (t) M.toolbank.bank.press(t.id, 'key'); }
  else if (k === ' ') { e.preventDefault(); const kn = M.timedial.knob; if (kn.index === 0) kn.set(C.game.lastRate || 1, 'key'); else { C.game.lastRate = kn.index; kn.set(0, 'key'); } }
  else if (k === ',') M.timedial.knob.step(-1, 'key');
  else if (k === '.') M.timedial.knob.step(1, 'key');
  else if (k === 'g') M.scope.degauss();
  else if (k === 'z' && (e.ctrlKey || e.metaKey || !e.shiftKey)) { C.send({ t: 'undo' }); }
  else if (k === 'escape') { if (C.game.scope.pen.back()) return; if (C.game.desk.closeDrawer()) return; if (state.get('tool')) { M.toolbank.bank.set(null, 'key'); return; } M.menu.open(); }
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
addEventListener('pointerdown', () => room.unlock(), { capture: true });

// ---- controller ----
C.padnav = createPadNav({
  sound: (s, o) => room.play(s, o),
  layerRoot: () => (C.game && !C.game.desk.drawer.hidden && matchMedia('(min-width: 900px) and (min-height: 560px)').matches) ? C.game.desk.drawer : null,
  back: () => {
    if (!C.game) return;
    const top = [...document.querySelectorAll('.modal')].pop();
    if (top) { (top.querySelector('[data-close]') || top).click(); return; }
    if (C.game.desk.closeDrawer()) return;
    if (state.get('tool')) C.game.desk.M.toolbank.bank.set(null, 'pad');
  },
  game: {
    penActive: () => !!C.game?.scope && !document.querySelector('.modal'),
    sticks(lx, ly, rx, ry, t) {
      const g = C.game; if (!g?.scope) return;
      const dt = Math.min(0.05, (t - (g.lastStick || t)) / 1000); g.lastStick = t;
      g.scope.pen.padMove(lx, ly, dt);
      if (rx || ry) { g.view.panDir(rx, ry, data.pen.panPadPx, dt); g.scope.pen.follow(); }
    },
    penDown: () => C.game?.scope.pen.padDown(),
    penUp: () => C.game?.scope.pen.padUp(),
    penBack: () => !!C.game?.scope.pen.back(),
    range: d => C.rangeStep(d),
    filter: () => { const kn = C.game?.desk.M.filter.knob; if (kn) kn.set((kn.index + 1) % data.filters.length, 'pad'); },
    menu: () => { if (!C.game) return; const top = document.querySelector('.menu-modal'); if (top) top.querySelector('[data-close]').click(); else C.game.desk.M.menu.open(); },
    toolbank: () => { const g = C.game; if (!g) return; if (matchMedia('(max-width: 899px), (max-height: 559px)').matches) g.desk.showPage('tools'); const b = g.desk.M.toolbank.el.querySelector('.toggle'); if (b) C.padnav.mark(b); },
  },
});

// ---- the frame loop ----
let last = performance.now();
function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(100, t - last); last = t;
  const g = C.game; if (!g || !g.scope) return;
  const fr = g.link.pump(dt);
  if (fr) {
    ingestEcon(fr);
    for (const f of C.frameHooks || []) f(fr); // later milestones' consoles (M4: the defence picture)
    g.scope.ingest(fr);
    if (fr.hud) { C.hud = fr.hud; g.desk.M.dayclock.set(fr.hud.day, fr.hud.hour); }
    if (fr.events?.length) onEvents(fr.events);
    g.tickSeen = fr.tick;
  }
  // held keys pan the scope: W / up = screen north
  if (keys.size) {
    const x = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    const y = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
    if (x || y) { g.view.panDir(x, y, data.pen.panKeyPx, dt / 1000); g.scope.pen.follow(); }
  }
  g.link.setView?.(g.view.rect());
  g.scope.frame(t);
}
requestAnimationFrame(loop);
installEye(C);
document.body.classList.add('ready');
