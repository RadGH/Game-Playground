// window.gameEye — what Claude's game-eye MCP (and the Playwright specs) read and poke. Grows each milestone.
//   gameEye.state() → { screen, modal, drawer, page, tool, range, filter, pen, tick, rate, needles, lamps, view, focus }
//   gameEye.act('probe', x, y) · act('unlock', machineId) · act('hour', h) · act('smoke', x, y) · act('centre', x, y)
//   M3: state().econ = { stock, power, crew, buildings: [{id, type, built, lamps, recipe}], roads, known outcrops/deposits,
//   buildType, inspect }; act('step', n) runs n ticks now · act('cmd', {t, ...}) sends any §3.3 command ·
//   act('econ') the full console copy (buildings, roads, survey, hud) · act('build', type, x, y) · act('road', pts)
//   M7: state().econ.town = the Town Board's numbers (hud.town); buildings carry workers/jobs/residents/beds
import { gridRef } from './console/view.js';

export function installEye(C) {
  const topModal = () => [...document.querySelectorAll('.modal')].pop();
  const eye = {
    state() {
      const g = C.game;
      const base = { screen: g ? 'game' : 'title', modal: topModal()?.getAttribute('aria-label') || null, build: 'm3' };
      if (!g || !g.scope) return { ...base, screen: g ? 'loading' : 'title' };
      const p = g.scope.pen.pen, v = g.view;
      const f = C.padnav?.current;
      return {
        ...base,
        drawer: C.state.get('drawer'), page: C.state.get('page'), tool: C.state.get('tool'),
        range: { index: C.state.get('range'), ppc: C.data.range.detents[C.state.get('range')], chart: v.ppc < C.data.range.chartBelow },
        filter: C.state.get('filter'),
        pen: { x: +p.x.toFixed(2), y: +p.y.toFixed(2), grid: gridRef(p.x, p.y), src: p.src, sx: Math.round(p.sx), sy: Math.round(p.sy) },
        tick: g.link.tick, rate: g.link.rate,
        needles: { day: C.hud?.day ?? 0, hour: +(C.hud?.hour ?? 0).toFixed(2), daylight: C.hud?.daylight ?? 0 },
        lamps: g.desk.M.alarms.states(),
        view: { cx: +v.cx.toFixed(2), cy: +v.cy.toFixed(2), ppc: v.ppc, w: v.screen[0], h: v.screen[1] },
        focus: f ? { machine: f.closest('[data-machine]')?.dataset.machine || f.closest('.modal')?.getAttribute('aria-label') || null, label: f.getAttribute('aria-label') || f.textContent.trim().slice(0, 30), grabbed: C.padnav.grabbed === f } : null,
        machines: [...g.desk.unlocked], world: g.link.kind, renderer: g.scope.renderer.kind,
        seed: g.game.seed, size: g.link.size,
        econ: econ(C),
      };
    },
    act(name, ...a) {
      const g = C.game;
      if (!g || !g.scope) return null;
      switch (name) {
        case 'probe': return g.scope.probe(a[0], a[1]);
        case 'unlock': g.link.send({ t: 'debug.event', event: { e: 'machineUnlocked', machine: a[0] } }); return true;
        case 'hour': g.link.send({ t: 'debug.hour', hour: a[0] }); return true;
        case 'smoke': g.link.send({ t: 'debug.smoke', x: a[0], y: a[1] }); return true;
        case 'centre': g.scope.centreOn(a[0], a[1]); return true;
        case 'hq': { const m = g.link.debug?.map; return m ? { ...m.hq, fire: m.fire, outcrops: m.outcrops, lava: m.lava, lake: m.lake } : null; }
        case 'padMark': { const el = document.querySelector(a[0]); C.padnav.mark(el); return !!el; }
        case 'flush': g.desk.M.teletype.flush(); return true;
        case 'step': g.link.step(a[0] | 0); return true;
        case 'cmd': g.link.send(a[0]); return true;
        case 'build': g.link.send({ t: 'build', type: a[0], x: a[1], y: a[2], rot: 0 }); return true;
        case 'road': g.link.send({ t: 'drawRoad', pts: a[0], closed: false }); return true;
        case 'econ': { const E = C.econ; return { hud: E.hud, buildings: [...E.buildings.values()], roads: [...E.roads.values()], survey: E.survey }; }
        case 'roadAt': return g.scope.renderer.roadAt(a[0], a[1]);
        case 'movers': return g.scope.renderer.moversNow?.() || []; // M7: [x, y, kind, res] as drawn (kind 3 = settlers)
        default: return null;
      }
    },
  };
  window.gameEye = eye;
  function econ(C) {
    const E = C.econ; if (!E) return null;
    const h = E.hud || {};
    return {
      stock: h.stock || {}, produced: h.produced || {}, power: h.power || null, crew: h.crew || null, sites: h.sites ?? 0,
      buildings: [...E.buildings.values()].filter((b) => b.kind === 'building').map((b) => ({ id: b.id, type: b.type, built: b.built, x: Math.round(b.x), y: Math.round(b.y), lamps: b.lamps, recipe: b.recipe, workers: b.workers, jobs: b.jobs, residents: b.residents, beds: b.beds })),
      roads: [...E.roads.values()].map((v) => ({ id: v.id, len: Math.round(v.len), laid: Math.round(v.laid.reduce((a, [x, y]) => a + y - x, 0)), bridge: v.bridge })),
      outcrops: E.survey?.outcrops.length ?? 0, deposits: E.survey?.deposits.length ?? 0,
      buildType: C.state.get('buildType'), inspect: C.state.get('inspect'),
      town: h.town || null, // M7: pop, beds, jobs, workers, morale, factor, lamps, why…
    };
  }
  return eye;
}
