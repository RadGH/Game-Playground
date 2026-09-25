// Tutorial hints: a small panel at the top of the screen that walks the player through a step list,
// with a pulsing outline on the map showing where to act. Each step advances when its condition
// is met (checked twice a second). Other missions get a single opening tip.

import { oreInArea } from '../sim/buildings.js';
import { snapPlacement, checkPlacement } from '../sim/placement.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

const count = (g, type) => g.buildings.filter((b) => b.team === 1 && b.type === type).length;
const planOrWall = (g) => g.planCells[1].size + g.teams[1].stats.cellsBuilt;

// Find a good drill spot near the core (most crystal under it).
function drillSpot(g) {
  const core = g.byId.get(g.teams[1].coreId);
  if (!core) return null;
  const def = g.data.buildings.list.drill;
  let best = null, bo = 5;
  for (let dx = -80; dx <= 80; dx += 3) {
    const p = snapPlacement(g, 'drill', core.x + core.w / 2 + dx, core.y);
    if (!checkPlacement(g, 1, 'drill', p.x, p.y, { free: true }).ok) continue;
    const o = oreInArea(g, p.x, p.y, def.size[0], def.size[1], def.mine);
    if (o.c > bo) { bo = o.c; best = { x: p.x, y: p.y, w: def.size[0], h: def.size[1] }; }
  }
  return best;
}

const TUTORIAL = [
  { text: 'Welcome, Commander. Move the camera with the <b>arrow keys</b>, the screen edges, or by dragging with the <b>middle mouse button</b>. The <b>mouse wheel</b> zooms.', done: (g, h) => h.camMoved || h.t > 9 },
  { text: 'Crystal is the blue ore in the ground. Build a <b>Drill</b> on it: press <b>E</b> (Economy), then <b>Q</b> (Drill), and click inside the pulsing box.', box: (g) => drillSpot(g), done: (g) => count(g, 'drill') >= 1 },
  { text: 'Your <b>drones</b> fly over and build it. Drills dig ore out of the ground and pay you crystal. Build a <b>Pulse Turret</b> to the right of your Core: <b>W</b>, then <b>Q</b>.', box: (g) => { const c = g.byId.get(g.teams[1].coreId); return c ? { x: c.x + c.w + 30, y: c.y + c.h - 12, w: 14, h: 12 } : null; }, done: (g) => count(g, 'pulse') >= 1 },
  { text: 'Now a wall. Press <b>Q</b> (Walls), then <b>Q</b> (Panel), and <b>drag upward from the ground</b> in the box. Hold <b>Shift</b> for a straight line; <b>[</b> and <b>]</b> change the brush size.', box: (g) => { const c = g.byId.get(g.teams[1].coreId); if (!c) return null; const x = c.x + c.w + 64; return { x, y: g.world.surfaceY(x) - 24, w: 6, h: 24 }; }, done: (g) => planOrWall(g) >= 60 },
  { text: 'Drones build walls from the bottom up. Your own shots pass straight through your own walls — so turrets can shoot over <i>and</i> through them.', done: (g, h) => h.stepT > 8 },
  { text: 'Buildings must be <b>linked</b> to work: inside your Core\'s range, or a <b>Relay</b>\'s. Press <b>L</b> to see the network. Build a Relay (<b>E</b>, <b>A</b>) to reach further — or skip ahead.', done: (g, h) => count(g, 'relay') >= 1 || h.stepT > 20 },
  { text: 'The first wave comes when the timer (top right) runs out. Press <b>Shift+N</b> to call it early for bonus crystal.', done: (g) => g.waves && g.waves.n >= 1 },
  { text: 'Mites! They climb rock but can\'t climb your walls, so they chew through from the bottom. Drones patch the wall between waves.', done: (g) => g.waves && g.waves.cleared >= 1 },
  { text: 'Good. Add a second Drill and a <b>Solar Array</b> (<b>E</b>, <b>W</b>) — laser turrets use ⚡ power while firing. Keep the ⚡ number at the top positive.', done: (g) => count(g, 'solar') >= 1 || (g.waves && g.waves.cleared >= 2) },
  { text: 'Survive all 4 waves. Press <b>?</b> or <b>F1</b> any time for every key. Right-click cancels; <b>Esc</b> backs out or opens the menu.', done: () => false },
];

export class Hints {
  constructor(app) {
    this.app = app;
    this.el = el('div', 'hints');
    this.el.hidden = true;
    document.body.appendChild(this.el);
    this.steps = null;
  }

  start(game) {
    this.game = game;
    this.i = 0; this.t = 0; this.stepT = 0; this.acc = 0; this.camMoved = false;
    this.cam0 = { x: this.app.camera.x, y: this.app.camera.y };
    const m = game.opts.missionIndex != null ? game.data.campaign.missions[game.opts.missionIndex] : null;
    if (m && m.script === 'tutorial' && !game.opts.restoring) this.steps = TUTORIAL;
    else if (m && !game.opts.restoring) this.steps = [{ text: `<b>${m.name}.</b> ${m.objective}. ${m.briefing.split('\n').slice(-1)[0]}`, done: (g, h) => h.stepT > 14 }];
    else this.steps = null;
    this.render();
  }

  stop() { this.steps = null; this.el.hidden = true; this.app.view.hintBox = null; }

  render() {
    if (!this.steps || this.i >= this.steps.length) { this.el.hidden = true; this.app.view.hintBox = null; return; }
    const s = this.steps[this.i];
    const tutorial = this.steps === TUTORIAL;
    this.el.innerHTML = `<div class="hint-text">${s.text}</div><div class="hint-foot">${tutorial ? `<span class="c-dim">Tip ${this.i + 1}/${this.steps.length}</span>` : ''}<button class="hint-skip">${tutorial ? 'Hide tips' : 'OK'}</button></div>`;
    this.el.querySelector('.hint-skip').addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); this.stop(); });
    this.el.hidden = false;
    this.el.classList.remove('pop'); void this.el.offsetWidth; this.el.classList.add('pop');
  }

  update(dt) {
    if (!this.steps || !this.game || this.i >= this.steps.length) return;
    const cam = this.app.camera;
    if (Math.abs(cam.x - this.cam0.x) + Math.abs(cam.y - this.cam0.y) > 30) this.camMoved = true;
    this.t += dt; this.stepT += dt; this.acc += dt;
    const s = this.steps[this.i];
    if (this.acc > 0.5) {
      this.acc = 0;
      if (s.box) this.app.view.hintBox = s.box(this.game); else this.app.view.hintBox = null;
      if (s.done(this.game, this)) { this.i++; this.stepT = 0; this.app.audio?.ui('select'); this.render(); }
    }
  }
}
