// What the 4x3 command card shows in the current context. Returns 12 slots (Q W E R / A S D F /
// Z X C V); each is null or {icon, label, cost, tip, enabled, why, active, run()}.
//
// Contexts: build root (nothing or only drones selected, or B), build category, army units,
// one building type.

import { GRID } from './controller.js';
import { canAfford } from '../sim/teams.js';
import { udef } from '../sim/units.js';

export function cardFor(app) {
  const c = app.controller;
  const g = app.game;
  const slots = {};
  if (!g) return slots;
  const sel = c.selected().filter((e) => e.team === 1);
  const team = g.teams[1];
  let path = c.cardPath;
  const armyUnits = sel.filter((e) => e.kind === 'u' && e.type !== 'drone');
  const drones = sel.filter((e) => e.kind === 'u' && e.type === 'drone');
  const blds = sel.filter((e) => e.kind === 'b');
  if (!path) {
    if (armyUnits.length) path = 'units';
    else if (blds.length) path = 'building';
    else path = 'build';
  }
  const B = g.data.buildings;

  if (path === 'build') {
    for (const [cat, info] of Object.entries(B.cats)) {
      slots[info.slot] = { icon: { kind: 'cat', type: cat }, label: info.name, tip: `<b>${info.name}</b><br>Open the ${info.name.toLowerCase()} menu.`, enabled: true, run: () => { c.cardPath = 'build:' + cat; app.hud.refreshCard(); } };
    }
    slots.KeyZ = { icon: { kind: 'tool', type: 'dig' }, label: 'Dig', tip: '<b>Dig</b><br>Paint an area; drones clear rock and dust there. Ore pays out. Use it for tunnels, moats, and dropping ledges on enemies.', enabled: true, active: c.mode === 'dig', run: () => c.setMode('dig') };
    slots.KeyX = { icon: { kind: 'tool', type: 'salvage' }, label: 'Salvage', tip: '<b>Salvage</b><br>Drag a box over your walls and buildings. Built walls refund 50%, unbuilt blueprints 100%.', enabled: true, active: c.mode === 'salvage', run: () => c.setMode('salvage') };
    const lb = team.lastBuild;
    if (lb) {
      const name = lb.kind === 'wall' ? wallByMat(g, lb.mat).name : B.list[lb.type].name;
      slots.KeyV = { icon: lb.kind === 'wall' ? { kind: 'wall', type: wallByMatKey(g, lb.mat) } : { kind: 'b', type: lb.type }, label: 'Repeat', tip: `<b>Repeat last build</b><br>${name}`, enabled: true, run: () => (lb.kind === 'wall' ? startPaint(app, wallByMatKey(g, lb.mat)) : startPlace(app, lb.type)) };
    }
    return slots;
  }
  if (path.startsWith('build:')) {
    const cat = path.slice(6);
    if (cat === 'walls') {
      for (const [key, w] of Object.entries(B.walls)) {
        const unlocked = g.isUnlocked(1, key);
        const costTxt = costPerCells(w);
        slots[w.slot] = {
          icon: { kind: 'wall', type: key }, label: w.name, cost: '',
          tip: `<b>${w.name}</b> <span class="c-dim">(wall)</span><div class="tt-cost">${costTxt}</div>${w.desc}<br><span class="c-dim">Drag to paint · Shift = straight line · [ ] brush size</span>`,
          enabled: unlocked, why: unlocked ? '' : 'Not available in this mission', active: c.mode === 'paint' && c.modeData?.key === key,
          run: () => startPaint(app, key),
        };
      }
    } else {
      for (const [key, d] of Object.entries(B.list)) {
        if (d.cat !== cat) continue;
        const unlocked = g.isUnlocked(1, key);
        const afford = canAfford(team, d.cost);
        slots[d.slot] = {
          icon: { kind: 'b', type: key }, label: d.name, cost: costText(d.cost),
          tip: buildingTip(g, key, d),
          enabled: unlocked, poor: unlocked && !afford, why: unlocked ? (afford ? '' : 'Not enough resources') : 'Not available in this mission',
          active: c.mode === 'place' && c.modeData?.type === key,
          run: () => startPlace(app, key),
        };
      }
    }
    slots.KeyV = { icon: { kind: 'tool', type: 'back' }, label: 'Back', tip: 'Back (Esc)', enabled: true, run: () => { c.cardPath = 'build'; c.setMode('select'); } };
    return slots;
  }
  if (path === 'units') {
    const units = armyUnits.concat(drones);
    const ids = units.map((u) => u.id);
    slots.KeyA = { icon: { kind: 'tool', type: 'amove' }, label: 'Attack', tip: '<b>Attack-move</b> (A, then click)<br>Move, fighting anything met on the way.', enabled: true, active: c.mode === 'target' && c.modeData?.kind === 'amove', run: () => c.setMode('target', { kind: 'amove', label: 'Attack-move' }) };
    slots.KeyS = { icon: { kind: 'tool', type: 'stop' }, label: 'Stop', tip: '<b>Stop</b> (S)', enabled: true, run: () => app.cmd({ t: 'order', ids, order: { t: 'stop' } }) };
    slots.KeyD = { icon: { kind: 'tool', type: 'hold' }, label: 'Hold', tip: '<b>Hold position</b> (D)<br>Stay put and shoot anything in range.', enabled: true, run: () => app.cmd({ t: 'order', ids, order: { t: 'hold' } }) };
    slots.KeyF = { icon: { kind: 'tool', type: 'patrol' }, label: 'Patrol', tip: '<b>Patrol</b> (F, then click)<br>Walk back and forth, fighting.', enabled: true, active: c.mode === 'target' && c.modeData?.kind === 'patrol', run: () => c.setMode('target', { kind: 'patrol', label: 'Patrol' }) };
    const cmdr = armyUnits.find((u) => u.type === 'commander');
    const siege = armyUnits.filter((u) => u.type === 'siege');
    const at = c.activeType();
    if (cmdr && (at === 'commander' || !siege.length)) {
      const ab = udef(g, 'commander').abilities;
      for (const [key, a] of Object.entries(ab)) {
        const ready = (cmdr.abil[key] || 0) - g.time;
        slots[a.slot] = {
          icon: { kind: 'ability', type: key }, label: a.name, cd: ready > 0 ? Math.ceil(ready) : 0,
          tip: `<b>${a.name}</b><br>${a.desc}<br><span class="c-dim">Cooldown ${a.cd} s</span>`,
          enabled: ready <= 0, why: ready > 0 ? `Ready in ${Math.ceil(ready)} s` : '',
          active: c.mode === 'target' && c.modeData?.kind === key,
          run: () => (a.target ? c.setMode('target', { kind: key, label: a.name }) : app.cmd({ t: 'ability', id: cmdr.id, key })),
        };
      }
    } else if (siege.length) {
      const dep = siege.some((u) => u.deployed);
      slots.KeyQ = { icon: { kind: 'tool', type: 'deploy' }, label: dep ? 'Undeploy' : 'Deploy', tip: '<b>Deploy / Undeploy</b> (Q)<br>Deployed: 190 range, can\'t move.', enabled: true, run: () => app.cmd({ t: 'order', ids: siege.map((u) => u.id), order: { t: 'deploy' } }) };
    }
    if (drones.length && !armyUnits.length) {
      slots.KeyV = { icon: { kind: 'tool', type: 'build' }, label: 'Build', tip: 'Open the build menu (B)', enabled: true, run: () => { c.cardPath = 'build'; app.hud.refreshCard(); } };
    }
    return slots;
  }
  if (path === 'building') {
    const at = c.activeType() || blds[0]?.type;
    const same = blds.filter((b) => b.type === at);
    const ids = same.map((b) => b.id);
    const d = B.list[at];
    if (!d) return slots;
    if (d.trains) {
      for (const ut of d.trains) {
        const ud = udef(g, ut);
        const unlocked = g.isUnlocked(1, ut);
        slots[ud.slot] = {
          icon: { kind: 'u', type: ut }, label: ud.name, cost: costText(ud.cost),
          tip: `<b>${ud.name}</b><div class="tt-cost">${costText(ud.cost)}${ud.pop ? ` · pop ${ud.pop}` : ''} · ${ud.train} s</div>${ud.desc}`,
          enabled: unlocked, poor: !canAfford(team, ud.cost), why: unlocked ? '' : 'Not available in this mission',
          run: () => {
            // Queue on the building with the shortest queue.
            const b = same.slice().sort((a, b2) => a.queue.length - b2.queue.length)[0];
            app.cmd({ t: 'train', id: b.id, unit: ut }, (r) => { if (!r.ok) app.hud.flash(r.reason); else app.audio?.ui('place'); });
          },
        };
      }
      slots.KeyV = { icon: { kind: 'tool', type: 'rally' }, label: 'Rally', tip: '<b>Set rally point</b> (V, then click)<br>Or right-click the ground with the building selected.', enabled: true, active: c.mode === 'target' && c.modeData?.kind === 'rally', run: () => c.setMode('target', { kind: 'rally', label: 'Rally point' }) };
    }
    if (at === 'lab') {
      const lab = same[0];
      const active = team.research.active[lab.id];
      for (const [key, r] of Object.entries(g.data.research.list)) {
        const done = team.research.done[key];
        const busy = Object.values(team.research.active).some((a) => a.key === key);
        const locked = g.tech && !g.tech.includes('research:' + key) && !g.tech.includes('research:*');
        slots[r.slot] = {
          icon: { kind: 'research', type: key }, label: r.name, cost: done ? 'done' : costText(r.cost),
          tip: `<b>${r.name}</b><div class="tt-cost">${costText(r.cost)} · ${r.time} s</div>${r.desc}`,
          enabled: !done && !busy && !active && !locked, done, poor: !canAfford(team, r.cost),
          why: done ? 'Researched' : busy ? 'In progress' : active ? 'This lab is busy' : locked ? 'Not available in this mission' : '',
          run: () => app.cmd({ t: 'research', id: lab.id, key }, (res) => { if (!res.ok) app.hud.flash(res.reason); }),
        };
      }
    }
    if (d.turret) {
      const modes = [['KeyQ', 'nearest', 'Nearest'], ['KeyW', 'strongest', 'Strongest'], ['KeyE', 'weakest', 'Weakest'], ['KeyR', 'air', 'Air first'], ['KeyA', 'core', 'Closest to Core']];
      for (const [slot, mode, name] of modes) {
        slots[slot] = { icon: { kind: 'target', type: mode }, label: name, tip: `<b>Target: ${name}</b>`, enabled: true, active: same.every((b) => b.targeting === mode), run: () => app.cmd({ t: 'targeting', ids, mode }) };
      }
    }
    if (d.toggle || d.mine || d.needsSky) {
      const on = same.every((b) => b.on);
      slots.KeyQ = { icon: { kind: 'tool', type: on ? 'on' : 'off' }, label: on ? 'Turn off' : 'Turn on', tip: '<b>On / Off</b> (Q)<br>Off: stops working and drawing power.', enabled: true, run: () => app.cmd({ t: 'toggle', ids }) };
    }
    if (at !== 'core') {
      const pending = c.salvageConfirm && c.salvageConfirm.t > performance.now();
      slots.KeyX = {
        icon: { kind: 'tool', type: 'salvage' }, label: pending ? 'Confirm' : 'Salvage',
        tip: '<b>Salvage</b> (X twice)<br>A drone takes it apart: 50% refund (100% if unfinished or a depleted drill).', enabled: true, active: pending,
        run: () => {
          if (pending) { app.cmd({ t: 'salvage', ids }); c.salvageConfirm = null; }
          else { c.salvageConfirm = { t: performance.now() + 2000 }; app.hud.flash('Press X again to salvage'); }
          app.hud.refreshCard();
        },
      };
    }
    if (drones.length) slots.KeyV = slots.KeyV || { icon: { kind: 'tool', type: 'build' }, label: 'Build', tip: 'Open the build menu (B)', enabled: true, run: () => { c.cardPath = 'build'; app.hud.refreshCard(); } };
    return slots;
  }
  return slots;
}

export function startPlace(app, type) {
  app.controller.setMode('place', { type });
  app.controller.cardPath = 'build:' + app.game.data.buildings.list[type].cat;
  app.hud.refreshCard();
}

export function startPaint(app, key) {
  const w = app.game.data.buildings.walls[key];
  app.controller.setMode('paint', { key, mat: w.mat, name: w.name });
  app.controller.cardPath = 'build:walls';
  app.hud.refreshCard();
}

export function costText(cost) {
  if (!cost) return '';
  const parts = [];
  if (cost.c) parts.push(`<span class="c-crystal">◆${cost.c}</span>`);
  if (cost.f) parts.push(`<span class="c-ferrite">▲${cost.f}</span>`);
  if (cost.a) parts.push(`<span class="c-alloy">⬢${cost.a}</span>`);
  return parts.join(' ');
}

function costPerCells(w) {
  const parts = [];
  if (w.cost.c) parts.push(`<span class="c-crystal">◆${w.cost.c}</span>`);
  if (w.cost.f) parts.push(`<span class="c-ferrite">▲${w.cost.f}</span>`);
  let s = parts.join(' ') + ` / ${w.cells} cells`;
  if (w.alloyPer) s += ` + <span class="c-alloy">⬢1</span> / ${w.alloyPer}`;
  return s;
}

function buildingTip(g, key, d) {
  let s = `<b>${d.name}</b><div class="tt-cost">${costText(d.cost)}`;
  if (d.power) s += ` · <span class="c-power">⚡${d.power > 0 ? '+' : ''}${d.power}</span>`;
  if (d.build) s += ` · ${d.build} s`;
  s += '</div>';
  if (d.weapon) {
    const w = d.weapon;
    const dmg = w.dps ? `${w.dps}/s beam` : `${w.dmg}${w.burst ? '×' + w.burst : ''} × ${w.rate}/s`;
    s += `<span class="c-dim">${w.dtype} · ${dmg} · range ${w.minRange ? w.minRange + '–' : ''}${w.range}${w.air && w.ground ? ' · air+ground' : w.air ? ' · air only' : ' · ground only'}</span><br>`;
  }
  s += d.desc;
  return s;
}

function wallByMat(g, mat) { return Object.values(g.data.buildings.walls).find((w) => w.mat === mat); }
function wallByMatKey(g, mat) { return Object.entries(g.data.buildings.walls).find(([, w]) => w.mat === mat)?.[0]; }

export { GRID };
