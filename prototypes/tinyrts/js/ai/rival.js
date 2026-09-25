// Umbra: the rival AI commander. It plays by the player's rules — every action is a command sent
// through the same applyCommand() the player uses, and it only reads information the player
// could see with a scout (positions of buildings and units).
//
// Brain, in order each "think" (every 0.5–4 s depending on difficulty):
//   1. Keep drones topped up and power positive.
//   2. Rebuild anything from its build order that was destroyed.
//   3. Work through the style's build order (data/ai-templates.json).
//   4. Afterwards, loop "late" rules: more turrets when rich, more drills, more power.
//   5. Army: train toward the style's composition; push when army value beats a threshold that
//      drops over time; retreat damaged units; defend when the base is hit.
// Buildings are placed in zones relative to its Core (behind it, just in front, the turret line,
// the wall line), and every spot is checked with the same placement rules as the player, so it
// can't build on impossible terrain.

import { bdef } from '../sim/buildings.js';
import { checkPlacement, snapPlacement } from '../sim/placement.js';
import { canAfford } from '../sim/teams.js';
import { udef } from '../sim/units.js';
import { oreInArea } from '../sim/buildings.js';
import { M } from '../world/materials.js';

const ZONES = {
  back: [18, 75, -1],     // [from, to, side]: side -1 = behind the core
  mid: [16, 55, 1],
  front: [55, 95, 1],
  relayFront: [40, 85, 1],
  wallLine: [100, 116, 1],
  wide: [10, 220, 0],     // side 0 = either side, nearest first
  expand: [70, 200, 1],   // relay sites that push territory toward the enemy
};

export class RivalAI {
  constructor(game, team = 2, opts = {}) {
    this.game = game;
    this.team = team;
    const tpl = game.data['ai-templates'];
    this.diff = tpl.difficulty[opts.difficulty || 'normal'] || tpl.difficulty.normal;
    this.styleKey = opts.style === 'random' || !opts.style ? (game.rng.next() < 0.5 ? 'bastion' : 'swarm') : opts.style;
    this.style = tpl.styles[this.styleKey] || tpl.styles.bastion;
    game.teams[team].incomeMult = this.diff.income * (opts.incomeMult || 1);
    this.state = opts.state || {
      step: 0, thinkT: 2, stuckT: 0, built: [], lateIdx: 0, push: 'build', pushStart: 0, lastPush: 0,
      pushValue0: 0, massingSaid: false, siegeSaid: false, walls: 0, deployed: [], defendT: 0,
    };
  }

  save() { return { ...this.state, style: this.styleKey }; }

  get core() { return this.game.byId.get(this.game.teams[this.team].coreId); }
  get enemyCore() {
    const other = this.team === 2 ? 1 : 2;
    return this.game.byId.get(this.game.teams[other]?.coreId);
  }
  get dir() {
    const c = this.core, e = this.enemyCore;
    if (!c) return -1;
    if (e) return Math.sign(e.x - c.x) || -1;
    return c.x > this.game.world.w / 2 ? -1 : 1;
  }

  cmd(c) { c.team = this.team; return this.game.applyNow(c); }

  update(dt) {
    const s = this.state;
    if (!this.core || this.game.result) return;
    s.thinkT -= dt;
    if (s.thinkT > 0) return;
    s.thinkT = this.diff.think;
    this.think();
  }

  think() {
    const g = this.game, s = this.state, team = g.teams[this.team];
    this.keepDrones();
    this.keepPower();
    this.reactToFlyers();
    if (this.rebuild()) return;
    // Build order.
    if (s.step < this.style.order.length) {
      const step = this.style.order[s.step];
      const r = this.doStep(step);
      if (r === 'done') { s.step++; s.stuckT = 0; }
      else if (r === 'skip') { s.stuckT += this.diff.think; if (s.stuckT > 45) { s.step++; s.stuckT = 0; } }
      else if (r === 'wait') { s.stuckT += this.diff.think * 0.5; if (s.stuckT > 60) { s.step++; s.stuckT = 0; } }
      // Rich in crystal while waiting on something else: spend it anyway.
      if (team.res.c > 380) this.late();
    } else this.late();
    this.army();
  }

  keepDrones() {
    const g = this.game;
    const drones = g.units.filter((u) => u.team === this.team && u.type === 'drone').length;
    const queued = this.core.queue.filter((q) => q === 'drone').length;
    const want = Math.min(8, 3 + Math.floor(g.time / 90));
    if (drones + queued < want && g.teams[this.team].res.c > 60) this.cmd({ t: 'train', id: this.core.id, unit: 'drone' });
  }

  keepPower() {
    const p = this.game.teams[this.team].power;
    if (p.supply - p.draw < 2 && this.game.teams[this.team].res.c > 80) {
      const pending = this.game.buildings.some((b) => b.team === this.team && b.type === 'solar' && !b.done);
      if (!pending) this.place('solar', 'back');
    }
  }

  rebuild() {
    const s = this.state, g = this.game;
    for (const rec of s.built) {
      if (g.byId.has(rec.id)) { const b = g.byId.get(rec.id); rec.x = b.x; rec.y = b.y; continue; }
      // Wait a while after a loss, and never rebuild into a fight.
      if (!rec.lostAt) rec.lostAt = g.time;
      if (g.time - rec.lostAt < 20) continue;
      if (rec.x != null && g.units.some((u) => u.team !== this.team && u.team !== 0 && Math.abs(u.x - rec.x) < 50)) continue;
      if (!canAfford(g.teams[this.team], bdef(g, rec.type).cost)) return true; // save up for it
      const id = this.place(rec.type, rec.zone);
      if (id) { rec.id = id; rec.lostAt = 0; } else rec.lostAt = g.time; // no spot: try again later
      return true;
    }
    return false;
  }

  doStep(step) {
    const g = this.game, team = g.teams[this.team];
    if (step.b) {
      const def = bdef(g, step.b);
      if (!canAfford(team, def.cost)) return 'wait';
      if (step.b === 'relay' || step.zone === 'front') {
        // Front turrets need link coverage: build a relay first if needed.
        if (step.b !== 'relay' && !this.hasFrontRelay()) { this.place('relay', 'relayFront', true); return 'wait'; }
      }
      const id = this.place(step.b, step.zone, true);
      return id ? 'done' : 'skip';
    }
    if (step.wall) return this.buildWall(step.wall) ? 'done' : 'skip';
    if (step.train) {
      const fab = g.buildings.find((b) => b.team === this.team && b.type === 'fabricator' && b.done);
      if (!fab) return 'skip';
      const ud = udef(g, step.train);
      if (!canAfford(team, ud.cost)) return 'wait';
      const s = this.state;
      s.trained = s.trained || {};
      const key = 's' + s.step;
      const r = this.cmd({ t: 'train', id: fab.id, unit: step.train });
      if (r.ok) s.trained[key] = (s.trained[key] || 0) + 1;
      return (s.trained[key] || 0) >= step.n ? 'done' : 'wait';
    }
    if (step.research) {
      const lab = g.buildings.find((b) => b.team === this.team && b.type === 'lab' && b.done);
      if (!lab) return 'skip';
      if (team.research.done[step.research]) return 'done';
      const r = this.cmd({ t: 'research', id: lab.id, key: step.research });
      return r.ok ? 'done' : 'wait';
    }
    return 'done';
  }

  hasFrontRelay() {
    const c = this.core;
    return this.game.buildings.some((b) => b.team === this.team && b.type === 'relay' && Math.abs(b.x - c.x) > 30);
  }

  // Reactive rule: enemy flyers seen near our base and no Flak yet -> build one.
  reactToFlyers() {
    const g = this.game, c = this.core;
    if (!c || g.buildings.some((b) => b.team === this.team && b.type === 'flak')) return;
    const flyers = g.units.some((u) => u.team !== this.team && u.flying && u.type !== 'drone' && Math.abs(u.x - c.x) < 220);
    if (flyers && canAfford(g.teams[this.team], bdef(g, 'flak').cost)) {
      if (this.place('flak', 'mid', true)) this.intent('Umbra is building anti-air', c);
    }
  }

  late() {
    const g = this.game, team = g.teams[this.team], s = this.state;
    // More drills when the ones we have run dry.
    const drills = g.buildings.filter((b) => b.team === this.team && b.type === 'drill');
    const working = drills.filter((b) => !b.depleted).length;
    for (const d of drills) if (d.depleted) this.cmd({ t: 'salvage', ids: [d.id] });
    if (working < 3 && team.res.c > 60) { if (this.place('drill', 'ore', true)) return; }
    // Spend surplus on turrets.
    const hasFab = g.buildings.some((b) => b.team === this.team && b.type === 'fabricator' && b.done);
    if (team.res.c > (hasFab ? 450 : 260)) {
      // Next affordable turret from the style's late list.
      const list = this.style.late;
      for (let k = 0; k < list.length; k++) {
        const type = list[(s.lateIdx + k) % list.length];
        if (!canAfford(team, bdef(g, type).cost)) continue;
        this.place(type, g.rng.next() < 0.5 ? 'front' : 'mid', true);
        s.lateIdx += k + 1;
        break;
      }
    }
    // Ferrite starved: more drills on ferrite.
    if (team.res.f < 40 && team.res.c > 150 && working < 7) this.place('drill', 'ore', true);
    // Rich in crystal but no refinery: build one.
    if (team.res.c > 500 && !g.buildings.some((b) => b.team === this.team && b.type === 'refinery')) this.place('refinery', 'back', true);
    if (!g.buildings.some((b) => b.team === this.team && b.type === 'fabricator') && team.res.c > 150 && team.res.f > 60) this.place('fabricator', 'back', true);
    // Keep the wall standing: a second wall once rich.
    if (team.res.c > 400 && s.walls < 2) this.buildWall('plate');
  }

  army() {
    const g = this.game, team = g.teams[this.team], s = this.state;
    const units = g.units.filter((u) => u.team === this.team && u.type !== 'drone' && u.type !== 'commander');
    const value = units.reduce((n, u) => n + unitValue(g, u), 0);
    const fab = g.buildings.find((b) => b.team === this.team && b.type === 'fabricator' && b.done);
    // Train toward the composition once the build order has a fabricator.
    if (fab && fab.queue.length < 2 && s.step > this.style.order.findIndex((st) => st.b === 'fabricator')) {
      const counts = {};
      for (const u of units) counts[u.type] = (counts[u.type] || 0) + 1;
      let best = null, bestGap = 0;
      for (const [type, want] of Object.entries(this.style.army)) {
        const gap = want - (counts[type] || 0);
        if (gap > bestGap && canAfford(team, udef(g, type).cost) && team.pop + udef(g, type).pop <= team.popCap) { bestGap = gap; best = type; }
      }
      if (!best && team.res.c > 400) best = Object.keys(this.style.army)[g.rng.int(0, Object.keys(this.style.army).length - 1)];
      if (best && team.res.c > 120) this.cmd({ t: 'train', id: fab.id, unit: best });
      if (fab && !fab.rally) {
        const rx = this.core.x + this.core.w / 2 + this.dir * 70;
        this.cmd({ t: 'rally', ids: [fab.id], x: rx, y: g.world.surfaceY(Math.floor(rx)) - 1 });
      }
    }
    const cmdr = g.byId.get(team.commanderId);
    // Defend: base was hit recently and we're not pushing.
    const hit = team.lastAttackedAt && g.time - team.lastAttackedAt.t < 6 && Math.abs(team.lastAttackedAt.x - this.core.x) < 180;
    if (hit && s.push !== 'push') {
      const ids = units.concat(cmdr ? [cmdr] : []).map((u) => u.id);
      if (ids.length) this.cmd({ t: 'order', ids, order: { t: 'amove', x: team.lastAttackedAt.x, y: team.lastAttackedAt.y } });
      if (cmdr) this.cmd({ t: 'ability', id: cmdr.id, key: 'overcharge' });
      s.defendT = g.time;
    }
    const since = g.time - (s.lastPush || 0);
    const thresh = this.diff.pushValue * (this.style.pushMult || 1) * Math.max(0.45, 1 - (since / 600) * this.diff.pushDecay);
    if (s.push === 'build') {
      if (!s.massingSaid && value > thresh * 0.6 && g.time > this.diff.firstPush * 0.6) {
        s.massingSaid = true;
        this.intent('Umbra is massing an army', units[0]);
      }
      if (g.time > this.diff.firstPush && value >= thresh && units.length >= 3) {
        s.push = 'push'; s.pushStart = g.time; s.pushValue0 = value; s.siegeSaid = false;
        this.intent('Umbra attack incoming!', units[0]);
        this.sendPush(units, cmdr);
      }
    } else if (s.push === 'push') {
      // Keep pushing units forward; pull back the badly hurt; deploy siege walkers near the enemy wall.
      const e = this.enemyCore;
      for (const u of units) {
        if (u.hp < u.maxHp * this.diff.retreatAt && u.order.t !== 'move') {
          const rx = this.core.x + this.core.w / 2 + this.dir * 40;
          this.cmd({ t: 'order', ids: [u.id], order: { t: 'move', x: rx, y: g.world.surfaceY(Math.floor(rx)) - 1 } });
          continue;
        }
        if (u.order.t === 'idle' && !u.deployed) this.sendPush([u], null);
        if (u.type === 'siege' && !u.deployed && e) {
          const wallX = this.enemyFrontX();
          if (wallX !== null && Math.abs(u.x - wallX) < 175) {
            this.cmd({ t: 'order', ids: [u.id], order: { t: 'deploy' } });
            if (!s.siegeSaid) { s.siegeSaid = true; this.intent('Umbra Siege Walkers deploying', u); }
          }
        }
      }
      if (cmdr) {
        if (cmdr.order.t === 'idle') this.sendPush([], cmdr);
        const wallX = this.enemyFrontX();
        if (wallX !== null && Math.abs(cmdr.x - wallX) < 150 && Math.abs(wallX - (e ? e.x : 0)) > 70) {
          this.cmd({ t: 'ability', id: cmdr.id, key: 'orbital', x: wallX, y: g.world.surfaceY(Math.floor(wallX)) });
        }
      }
      if (value < s.pushValue0 * 0.25 || g.time - s.pushStart > 240) {
        s.push = 'build'; s.lastPush = g.time; s.massingSaid = false;
        const rx = this.core.x + this.core.w / 2 + this.dir * 60;
        const ids = units.filter((u) => !u.deployed).map((u) => u.id);
        if (ids.length) this.cmd({ t: 'order', ids, order: { t: 'move', x: rx, y: g.world.surfaceY(Math.floor(rx)) - 1 } });
        for (const u of units) if (u.deployed) this.cmd({ t: 'order', ids: [u.id], order: { t: 'deploy' } });
      }
    }
  }

  sendPush(units, cmdr) {
    const e = this.enemyCore;
    if (!e) return;
    const tx = e.x + e.w / 2, ty = e.y + e.h - 1;
    const ids = units.map((u) => u.id).concat(cmdr ? [cmdr.id] : []);
    if (ids.length) this.cmd({ t: 'order', ids, order: { t: 'amove', x: tx, y: ty } });
  }

  // x of the enemy's frontmost structure facing us.
  enemyFrontX() {
    const g = this.game, e = this.enemyCore;
    if (!e) return null;
    const other = e.team;
    const d = this.dir; // toward the enemy
    let best = null;
    for (const b of g.buildings) {
      if (b.team !== other) continue;
      const x = b.x + b.w / 2;
      if (best === null || (x - best) * -d > 0) best = x;
    }
    return best;
  }

  intent(text, near) {
    this.game.events.emit('aiIntent', { text, team: this.team, x: near ? near.x : null, y: near ? near.y : null });
  }

  // Place a building in a zone. Returns the new id or 0.
  place(type, zone, record = false) {
    const g = this.game;
    let spot = zone === 'ore' ? this.oreSpot() : zone === 'ferrite' ? this.oreSpot(true) : this.zoneSpot(type, zone);
    if (!spot && zone === 'ferrite') spot = this.oreSpot();
    if (!spot && zone !== 'ore' && zone !== 'ferrite') {
      // Preferred zone is full or blocked (map edge, terrain): economy stays near the core,
      // turrets try the lines in front first.
      const turret = !!bdef(g, type).turret;
      const order = turret ? ['front', 'mid', 'wide'] : ['back', 'mid', 'wide'];
      for (const z of order) { if (z === zone) continue; spot = this.zoneSpot(type, z); if (spot) break; }
    }
    if (!spot && type !== 'relay' && zone !== 'ore' && zone !== 'ferrite') {
      // Out of room: grow the link network outward so the next attempt has space.
      const rs = this.expandSpot();
      if (rs) { const r = this.cmd({ t: 'build', type: 'relay', x: rs.x, y: rs.y }); if (r.ok) this.state.built.push({ id: r.id, type: 'relay', zone: 'expand' }); }
      return 0;
    }
    if (!spot) return 0;
    const r = this.cmd({ t: 'build', type, x: spot.x, y: spot.y });
    if (!r.ok) return 0;
    if (record) this.state.built.push({ id: r.id, type, zone });
    return r.id;
  }

  zoneSpot(type, zone, pass = 0) {
    const g = this.game, c = this.core;
    const z = ZONES[zone] || ZONES.mid;
    const cx = c.x + c.w / 2;
    const def = bdef(g, type);
    const half = def.size[0] / 2;
    const sides = z[2] === 0 ? [1, -1] : [z[2]];
    const start = z[0] + half + c.w / 2 - (z[2] > 0 ? 12 : 0);
    for (let k = 0; k <= z[1] - z[0]; k += 3) {
      for (const side of sides) {
        const off = zone === 'front' || zone === 'relayFront' ? start + (z[1] - z[0]) - k : start + k;
        const x = cx + this.dir * side * off;
        if (x < 6 || x > g.world.w - 6) continue;
        const p = snapPlacement(g, type, x, g.world.surfaceY(Math.floor(x)) - def.size[1]);
        if (!checkPlacement(g, this.team, type, p.x, p.y).ok) continue;
        // Keep ore spots free for drills.
        if (type !== 'drill' && pass === 0) {
          const o = oreInArea(g, p.x, p.y, def.size[0], def.size[1], g.data.buildings.list.drill.mine);
          if (o.c + o.f > 25) continue;
        }
        return p;
      }
    }
    if (pass === 0) return this.zoneSpot(type, zone, 1);
    return null;
  }

  // The farthest valid relay spot from the core in the enemy's direction (linked, on flat ground).
  expandSpot() {
    const g = this.game, c = this.core, cx = c.x + c.w / 2;
    if (g.buildings.some((b) => b.team === this.team && b.type === 'relay' && !b.done)) return null;
    for (let off = 210; off >= 60; off -= 4) {
      const x = cx + this.dir * off;
      if (x < 8 || x > g.world.w - 8) continue;
      const p = snapPlacement(g, 'relay', x, g.world.surfaceY(Math.floor(x)) - 14);
      if (checkPlacement(g, this.team, 'relay', p.x, p.y).ok) return p;
    }
    return null;
  }

  oreSpot(ferriteOnly = false) {
    const g = this.game, c = this.core;
    const def = bdef(g, 'drill');
    const cx = c.x + c.w / 2;
    let best = null, bo = 5;
    for (let off = -110; off <= 110; off += 3) {
      const x = cx + off;
      if (x < 8 || x > g.world.w - 8) continue;
      const p = snapPlacement(g, 'drill', x, g.world.surfaceY(Math.floor(x)) - def.size[1]);
      const o = oreInArea(g, p.x, p.y, def.size[0], def.size[1], def.mine);
      const fNeed = this.game.teams[this.team].res.f < 120 ? 3 : 1.3;
      const val = ferriteOnly ? o.f : o.c + o.f * fNeed;
      if (val <= bo) continue;
      if (!checkPlacement(g, this.team, 'drill', p.x, p.y).ok) continue;
      bo = val; best = p;
    }
    return best;
  }

  // A wall across the lane in front of the turret line, with a Gate for our own army.
  buildWall(mat) {
    const g = this.game, c = this.core, team = g.teams[this.team];
    const matId = mat === 'plate' ? M.PLATE : M.PANEL;
    const cx = c.x + c.w / 2;
    const dist = ZONES.wallLine[0] + this.state.walls * 14 + c.w / 2;
    const gx = Math.round(cx + this.dir * dist);
    if (!canAfford(team, { c: 80, f: mat === 'plate' ? 30 : 0 })) return false;
    // Gate.
    const gp = snapPlacement(g, 'gate', gx, g.world.surfaceY(gx) - 16);
    const gr = this.cmd({ t: 'build', type: 'gate', x: gp.x, y: gp.y });
    if (!gr.ok) { this.state.walls++; return false; }
    this.state.built.push({ id: gr.id, type: 'gate', zone: 'wallLine' });
    // The gate is the whole wall at ground level (so our army can pass); a cap above it makes the
    // barrier taller than anything can jump.
    const cells = [];
    for (let x = gp.x; x < gp.x + 4; x++) for (let y = gp.y - 10; y < gp.y; y++) cells.push([x, y]);
    this.cmd({ t: 'paint', mat: matId, cells });
    this.state.walls++;
    return true;
  }
}

function unitValue(g, u) {
  const c = udef(g, u.type).cost || {};
  return (c.c || 0) + (c.f || 0) * 1.5 + (c.a || 0) * 3;
}

export function attachRival(game, opts = {}) {
  if (!game.teams[2]) return null;
  game.ai = new RivalAI(game, 2, opts);
  return game.ai;
}
