// Economy and station systems, plugged in through main.js's plug-in points (app.services, app.hooks):
//   Trade (goods market)   ui/trade.js        sim/economy.js
//   Research lab           ui/research-ui.js  sim/research.js
//   Workshop               ui/workshop.js     sim/craft.js (+ ui/reel.js)
//   Insurance              ui/insurance-ui.js sim/insurance.js
// Saved blueprints and the turret arc preview live in the Shipyard (ui/builder.js, ui/blueprints-ui.js).

import { market, remember } from '../sim/economy.js';
import { researchBonus, NODES, isDone } from '../sim/research.js';
import { PLANS } from '../sim/insurance.js';
import { cargoUsed } from '../sim/state.js';
import { num } from './dom.js';

// each screen loads when first opened; the paths are written out so the module checker (tools/game-reach.mjs) can follow them
const open = (load, fn) => (app, redraw) => load().then(m => m[fn](app, redraw)).catch(e => console.error(e));

export function initEconomy(app) {
  app.services.push(
    { id: 'trade', title: 'Trade', sub: app => { const n = Object.values(app.G.goods || {}).reduce((a, b) => a + b, 0); return n ? `Buy and sell goods — ${num(n)} in the hold` : 'Buy goods cheap, sell them where they are wanted'; }, open: open(() => import('./trade.js'), 'openTrade') },
    { id: 'research', title: 'Research lab', sub: app => { const d = NODES.filter(n => isDone(app.G, n.id)).length; return `Permanent upgrades — ${num(d)} of ${num(NODES.length)} done`; }, open: open(() => import('./research-ui.js'), 'openResearch') },
    { id: 'workshop', title: 'Workshop', sub: 'Craft parts from ore, re-roll bonuses', open: open(() => import('./workshop.js'), 'openWorkshop') },
    { id: 'insurance', title: 'Insurance', sub: app => (app.G.insurance ? `Covered: ${PLANS[app.G.insurance.plan].name}` : 'Not insured — cover your next loss'), cls: '', open: open(() => import('./insurance-ui.js'), 'openInsurance') },
  );
  // remember this station's prices every time you dock (the trade screen compares stations with them)
  app.hooks.dock.push(() => {
    const G = app.G; const sys = app.gal?.systems[G.system]; if (!sys) return;
    remember(G, market(G, sys), researchBonus(G).trade);
  });
  // research "Finer cutting": extra ore on every ore pickup (whole units; the fraction carries over)
  let carry = 0;
  app.hooks.event.push(e => {
    if (e.type !== 'pickup' || e.pickup?.kind !== 'ore' || !app.P) return;
    const G = app.G; const mul = researchBonus(G).mining; if (mul <= 1) return;
    carry += e.pickup.qty * (mul - 1);
    const whole = Math.floor(carry); if (!whole) return;
    carry -= whole;
    const room = Math.max(0, app.P.stats.cargo - cargoUsed(G)); const n = Math.min(room, whole);
    if (n > 0) { G.cargo[e.pickup.ore] = (G.cargo[e.pickup.ore] || 0) + n; G.stats.mined += n; }
  });
}
