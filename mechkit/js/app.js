// Mech Kit dress-up page: pick a part per slot, paint it, turn the legs and the aim separately, play every animation,
// and read every number — drawn with composeMech, exactly what Overdrive Frame draws.
import { installTooltips } from '../../shared/tooltip.js';
import { fmt, pct } from '../../shared/format.js';
import { TILE_W, TILE_H, PX_PER_HEIGHT, toScreen } from '../../citykit/js/iso.js';
import { MechBaker, mechLayers, composeMech, drawPart, DIRS, paintFor } from './bake-mech.js';
import { PARTS, LEG_ANIMS, UPPER_ANIMS, UPPER_KEYS, animAlt } from './rig.js';
import { MAKER, MAKER_LIST } from './data.js';
import { buildStats, randomBuild, WEAPON_SLOTS, FRAME_SLOTS, validBuild, weaponDps as dpsOf } from './stats.js';
import { createPadNav } from './padnav.js';

installTooltips();
const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const mb = new MechBaker({ scale: 3 });            // the game's own pictures
const S = mb.scale;
let _sharp = null;                                 // twice the detail, for close-ups (same composeMech, finer pictures)
const sharpMb = () => (_sharp ??= new MechBaker({ scale: S * 2 }));
/** Layers + the zoom factor to hand composeMech for a zoom given in game pixels. */
function view(build, sharp) { return sharp ? { ly: mechLayers(sharpMb(), build), k: 0.5 } : { ly: mechLayers(mb, build), k: 1 }; }

// ---------------------------------------------------------------------------------------------------------- data
const SLOT_LABEL = { head: 'Head', core: 'Core', arms: 'Arms', legs: 'Legs', booster: 'Booster', generator: 'Generator', cooling: 'Cooler', cpu: 'CPU (fire control)' };
const LEG_TYPE = { biped: 'Two legs', reverse: 'Bird legs', quad: 'Four legs', treads: 'Treads', hover: 'Hover' };
const CLASS = { light: 'Light', medium: 'Medium', heavy: 'Heavy' };
const TYPE = { kinetic: 'Kinetic', energy: 'Energy', explosive: 'Explosive', fire: 'Fire', electric: 'Electric' };
const LOCK = { none: 'No lock', aim: 'Free aim', homing: 'Homing', multi: 'Multi-lock' };
const KIND = {
  rifle: 'Rifle', mg: 'Machine gun', shotgun: 'Shotgun', 'laser-rifle': 'Laser rifle', pulse: 'Pulse gun', grenade: 'Grenade launcher', rivet: 'Rivet gun',
  flamer: 'Flamethrower', chain: 'Chain lightning', repair: 'Repair beam', railgun: 'Railgun', gatling: 'Gatling', 'laser-blade': 'Laser blade', pile: 'Pile driver',
  saw: 'Buzzsaw', shield: 'Shield', sniper: 'Sniper cannon', 'vertical-pod': 'Vertical missiles', 'swarm-pod': 'Homing swarm', 'missile-pod': 'Missile pod',
  mortar: 'Mortar', plasma: 'Plasma cannon', 'drone-bay': 'Drone bay', 'mine-layer': 'Mine layer', 'turret-deployer': 'Turret deployer',
};
const DIR_NAME = ['up', 'up, a bit right', 'up-right', 'right, a bit up', 'right', 'right, a bit down', 'down-right', 'down, a bit right', 'down', 'down, a bit left', 'down-left', 'left, a bit down', 'left', 'left, a bit up', 'up-left', 'up, a bit left'];
const partsOf = slot => Object.values(PARTS).filter(p => p.slot === slot);
const makerName = id => MAKER[id]?.short || id;
const makerDot = id => `<i class="dot" style="background:${MAKER[id]?.colours.primary}"></i>`;

const STARTER = { head: 'celerity-head-2', core: 'celerity-core-2', arms: 'celerity-arms-1', legs: 'celerity-legs-2', booster: 'celerity-booster-2', generator: 'celerity-generator-2', cooling: 'celerity-cooling-1', cpu: 'celerity-cpu-1',
  weapons: { armL: 'sliver-laser-blade', armR: 'glint-laser-rifle', shoulderL: 'hornet-swarm-pod', shoulderR: 'farsight-sniper-cannon' } };

const PRESETS = [
  { id: 'maker', name: 'Maker colours', paint: 'maker' },
  ...MAKER_LIST.map(m => ({ id: 'factory-' + m.id, name: m.short + ' factory', paint: { ...m.colours } })),
  { id: 'hazard', name: 'Hazard', paint: { primary: '#f2c230', secondary: '#1e2024', accent: '#e8432e', glow: '#ffb02e' } },
  { id: 'night', name: 'Night ops', paint: { primary: '#30353f', secondary: '#16181d', accent: '#c83434', glow: '#ff3b3b' } },
  { id: 'arctic', name: 'Arctic', paint: { primary: '#e9eff3', secondary: '#8ea4b5', accent: '#2d7dd2', glow: '#9fe6ff' } },
  { id: 'desert', name: 'Desert', paint: { primary: '#c8a66c', secondary: '#6f5639', accent: '#3d8b6a', glow: '#ffd27a' } },
  { id: 'crimson', name: 'Crimson ace', paint: { primary: '#b3202a', secondary: '#1d1d22', accent: '#f2c14e', glow: '#ff4f6a' } },
  { id: 'royal', name: 'Royal', paint: { primary: '#2a3f9e', secondary: '#e8e2d0', accent: '#d4a72c', glow: '#8fb4ff' } },
  { id: 'jungle', name: 'Jungle', paint: { primary: '#4f6b3a', secondary: '#2c3324', accent: '#c9a227', glow: '#b6ff5a' } },
  { id: 'synth', name: 'Synth', paint: { primary: '#2b1f3f', secondary: '#121018', accent: '#ff3fb4', glow: '#3ff0ff' } },
  { id: 'police', name: 'City patrol', paint: { primary: '#f1f3f5', secondary: '#1b2a4a', accent: '#2f6fd0', glow: '#ff4040' } },
];
const SWATCHES = ['#f1f3f5', '#aab3bd', '#5b6470', '#2b3038', '#16181d', '#b3202a', '#e8432e', '#f08a24', '#f2c230', '#c8a66c', '#6e7a48', '#3aa56a', '#4fb39a', '#2fb6d6', '#2f6fd0', '#2a3f9e', '#8a55d4', '#c23f7c'];
const GLOWS = ['#3ff0ff', '#7dff9a', '#ffb02e', '#ff6a2a', '#ff3b3b', '#ff4fd8', '#a77bff', '#ffffff'];

// ---------------------------------------------------------------------------------------------------------- state
const state = {
  build: clone(STARTER), paint: 'maker', preset: 'maker', makerFilter: null, open: null,
  legDir: 7, aimDir: 7, aimFollow: true, aimPointer: false, spin: false,
  legAnim: 'walk', upperAnim: 'idle', playing: true, lift: true, frameOffset: 0,
  zoom: 'fit', time: 0, only: '', markers: false, sharp: false,
  view: 'dress', sheetSlot: 'head', sheetMaker: null, sheetMode: 'mech', sheetTime: 0, lineupTime: 0,
};
function clone(b) { return JSON.parse(JSON.stringify(b)); }
const SAVE_KEYS = ['build', 'paint', 'preset', 'makerFilter', 'legDir', 'aimDir', 'aimFollow', 'legAnim', 'upperAnim', 'zoom', 'time', 'sharp', 'sheetSlot', 'sheetMaker', 'sheetMode', 'view'];
function save() { try { localStorage.setItem('mechkit:state', JSON.stringify(Object.fromEntries(SAVE_KEYS.map(k => [k, state[k]])))); } catch { /* private window */ } }
function load() {
  try {
    const s = JSON.parse(localStorage.getItem('mechkit:state') || 'null'); if (!s) return;
    for (const k of SAVE_KEYS) if (k in s) state[k] = s[k];
    if (validBuild(state.build, PARTS).some(p => /empty|not a|is a/.test(p))) state.build = clone(STARTER);
  } catch { /* private window or old data */ }
}

let layers = mechLayers(mb, state.build);
function setBuild(b, why) {
  state.build = b; layers = mechLayers(mb, b);
  drawSlots(); drawStats(); save(); redraw();
  if (why) note(why);
  if (state.view === 'sheet') drawSheet();
}
function note(text) { $('#copied').textContent = text; }

// ---------------------------------------------------------------------------------------------------------- maker filter
function drawMakers() {
  const host = $('#makers'); host.replaceChildren();
  const chip = (id, label) => {
    const b = el('button', 'mk-chip' + (state.makerFilter === id ? ' on' : ''), (id ? makerDot(id) : '') + label);
    b.type = 'button'; b.setAttribute('aria-pressed', String(state.makerFilter === id));
    if (id) b.dataset.tip = `${MAKER[id].name}: ${MAKER[id].lookText} ${MAKER[id].leaning}`;
    b.addEventListener('click', () => { state.makerFilter = id; drawMakers(); drawSlots(); save(); });
    host.append(b);
  };
  chip(null, 'All makers');
  for (const m of MAKER_LIST) chip(m.id, m.short);
}

// ---------------------------------------------------------------------------------------------------------- slots
function choices(slot) {
  const ws = WEAPON_SLOTS.find(w => w.key === slot);
  let list = ws ? partsOf('weapon').filter(p => p.mount === ws.mount) : partsOf(slot);
  if (state.makerFilter) list = list.filter(p => p.maker === state.makerFilter);
  list.sort((a, b) => MAKER_LIST.findIndex(m => m.id === a.maker) - MAKER_LIST.findIndex(m => m.id === b.maker) || a.tier - b.tier || a.weight - b.weight);
  return ws ? [null, ...list] : list;
}
const current = slot => WEAPON_SLOTS.some(w => w.key === slot) ? (state.build.weapons[slot] || null) : state.build[slot];
function subline(p) {
  if (!p) return 'Empty';
  if (p.slot === 'weapon') return `${makerName(p.maker)} · ${KIND[p.kind]} · ${p.hand === 'two' ? 'Two-handed' : p.mount === 'shoulder' ? 'Shoulder' : 'One-handed'}`;
  if (p.slot === 'legs') return `${makerName(p.maker)} · ${LEG_TYPE[p.type]} · ${CLASS[p.class]}`;
  return `${makerName(p.maker)} · ${CLASS[p.class]}`;
}
function keyStat(p) {
  if (!p) return '';
  switch (p.slot) {
    case 'legs': return `carry ${fmt(p.carry)} t`;
    case 'generator': return `output ${fmt(p.output)}`;
    case 'cooling': return `${fmt(p.rate)} heat/s`;
    case 'cpu': return `${fmt(p.lockCount)} locks`;
    case 'booster': return `${fmt(p.thrust)} km/h`;
    case 'weapon': return `${fmt(Math.round(dpsOf(p)))} dps · ${fmt(p.weight)} t`;
    default: return `${fmt(p.ap)} AP · ${fmt(p.weight)} t`;
  }
}
function equip(slot, id) {
  const b = clone(state.build); let why = '';
  const ws = WEAPON_SLOTS.find(w => w.key === slot);
  if (ws) {
    b.weapons[slot] = id;
    const other = slot === 'armL' ? 'armR' : slot === 'armR' ? 'armL' : null;
    if (other && id && PARTS[id].hand === 'two' && b.weapons[other]) { why = `${PARTS[id].name} needs both hands: took ${PARTS[b.weapons[other]].name} off the other arm.`; b.weapons[other] = null; }
    else if (other && id && PARTS[b.weapons[other]]?.hand === 'two') { why = `Took ${PARTS[b.weapons[other]].name} off: it needs both hands.`; b.weapons[other] = null; }
  } else b[slot] = id;
  setBuild(b, why || ' ');
}
function cycle(slot, step) {
  const list = choices(slot), ids = list.map(p => p?.id ?? null);
  let i = ids.indexOf(current(slot)); if (i < 0) i = step > 0 ? -1 : 0;
  equip(slot, ids[(i + step + ids.length) % ids.length]);
}
function drawSlots() {
  const host = $('#slots'); host.replaceChildren();
  const row = (slot, label) => {
    const p = PARTS[current(slot)] || null;
    const r = el('div', 'mk-slot' + (state.open === slot ? ' open' : '')); r.dataset.slot = slot;
    const prev = el('button', null, '‹'); prev.type = 'button'; prev.setAttribute('aria-label', `Previous ${label.toLowerCase()}`); prev.addEventListener('click', () => cycle(slot, -1));
    const pick = el('button', 'mk-pick', `${p ? makerDot(p.maker) : '<i class="dot" style="background:#333"></i>'}<span class="lbl">${label}</span><b>${p ? p.name : 'Empty'}</b><small>${subline(p)}</small>`);
    pick.type = 'button'; pick.setAttribute('aria-expanded', String(state.open === slot)); pick.setAttribute('aria-label', `${label}: ${p ? p.name : 'empty'}. Choose another`);
    pick.addEventListener('click', () => { state.open = state.open === slot ? null : slot; drawSlots(); });
    const next = el('button', null, '›'); next.type = 'button'; next.setAttribute('aria-label', `Next ${label.toLowerCase()}`); next.addEventListener('click', () => cycle(slot, 1));
    r.append(prev, pick, next);
    if (state.open === slot) {
      const list = el('div', 'mk-list'); list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', label);
      for (const c of choices(slot)) {
        const b = el('button', (c?.id ?? null) === current(slot) ? 'on' : (c ? '' : 'none'),
          c ? `${makerDot(c.maker)}<span>${c.name}</span><small>${keyStat(c)}</small>` : '<i class="dot" style="background:#333"></i><span>Empty</span>');
        b.type = 'button'; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String((c?.id ?? null) === current(slot)));
        if (c) b.dataset.tip = partTip(c);
        b.addEventListener('click', () => { state.open = null; equip(slot, c?.id ?? null); });
        list.append(b);
      }
      if (choices(slot).length <= (WEAPON_SLOTS.some(w => w.key === slot) ? 1 : 0)) list.append(el('p', 'small muted', 'This maker makes none: pick All makers.'));
      r.append(list);
    }
    host.append(r);
  };
  host.append(el('h3', null, 'Frame'));
  for (const s of FRAME_SLOTS) row(s, SLOT_LABEL[s]);
  host.append(el('h3', null, 'Weapons'));
  for (const w of WEAPON_SLOTS) row(w.key, w.label);
}
function partTip(p) {
  const bits = [p.blurb || `${KIND[p.kind] || ''}`.trim()].filter(Boolean);
  if (p.slot === 'weapon') bits.push(`${TYPE[p.type]} · ${fmt(p.damage)} damage${p.salvo ? ` × ${p.salvo}` : p.pellets ? ` × ${p.pellets} pellets` : ''} · ${fmt(p.rate)} per second · ${fmt(p.range)} m`);
  bits.push(`Weight ${fmt(p.weight)} t · energy ${fmt(p.energy)}`);
  return bits.join('. ');
}

// ---------------------------------------------------------------------------------------------------------- paint
function drawPaint() {
  const host = $('#presets'); host.replaceChildren();
  for (const pr of PRESETS) {
    const sw = pr.paint === 'maker' ? MAKER_LIST.map(m => m.colours.primary) : [pr.paint.primary, pr.paint.secondary, pr.paint.accent];
    const b = el('button', state.preset === pr.id ? 'on' : '', `<span class="sw3">${sw.map(c => `<i style="background:${c}"></i>`).join('')}</span>${pr.name}`);
    b.type = 'button'; b.setAttribute('aria-pressed', String(state.preset === pr.id));
    if (pr.paint === 'maker') b.dataset.tip = 'Each part in its own maker\'s factory paint: mixing makers looks patched together, on purpose';
    b.addEventListener('click', () => { state.preset = pr.id; state.paint = pr.paint === 'maker' ? 'maker' : { ...pr.paint }; drawPaint(); redraw(); save(); if (state.view === 'sheet') drawSheet(); });
    host.append(b);
  }
  const cols = $('#colours'); cols.replaceChildren();
  const P = state.paint === 'maker' ? null : state.paint;
  for (const [k, label, list] of [['primary', 'Primary', SWATCHES], ['secondary', 'Secondary', SWATCHES], ['accent', 'Accent', SWATCHES], ['glow', 'Lights', GLOWS]]) {
    const r = el('div', 'mk-colour'); r.append(el('span', null, label));
    const inp = el('input'); inp.type = 'color'; inp.setAttribute('aria-label', `${label} colour`);
    inp.value = P?.[k] || (k === 'glow' ? MAKER[PARTS[state.build.core].maker].colours.glow : paintFor('maker', PARTS[state.build.core].maker)[k]);
    inp.addEventListener('input', () => setColour(k, inp.value));
    const sw = el('div', 'mk-swatches');
    if (k === 'glow') { const own = el('button', 'own' + (!P?.glow ? ' on' : ''), 'Own'); own.type = 'button'; own.setAttribute('aria-label', 'Each maker\'s own light colour'); own.addEventListener('click', () => setColour('glow', null)); sw.append(own); }
    for (const c of list) {
      const b = el('button', (P?.[k] || '').toLowerCase() === c ? 'on' : ''); b.type = 'button'; b.style.background = c; b.setAttribute('aria-label', `${label} ${c}`);
      b.addEventListener('click', () => setColour(k, c)); sw.append(b);
    }
    r.append(inp, sw); cols.append(r);
  }
}
function setColour(k, c) {
  if (state.paint === 'maker') { const m = MAKER[PARTS[state.build.core].maker].colours; state.paint = { primary: m.primary, secondary: m.secondary, accent: m.accent, glow: null }; }
  state.paint = { ...state.paint, [k]: c }; state.preset = 'custom';
  drawPaint(); redraw(); save();
}
function randomPaint() {
  const pick = a => a[Math.floor(Math.random() * a.length)];
  if (Math.random() < 0.4) { const pr = pick(PRESETS.slice(1)); state.preset = pr.id; state.paint = { ...pr.paint }; }
  else { state.preset = 'custom'; state.paint = { primary: pick(SWATCHES), secondary: pick(SWATCHES.slice(2, 5)), accent: pick(SWATCHES.slice(5)), glow: Math.random() < 0.5 ? pick(GLOWS) : null }; }
  drawPaint(); redraw(); save();
}

// ---------------------------------------------------------------------------------------------------------- stats
function drawStats() {
  const st = buildStats(state.build, PARTS), host = $('#stats'); host.replaceChildren();
  const legs = PARTS[state.build.legs], core = PARTS[state.build.core];
  $('#build-name').textContent = `${MAKER[core.maker].short} ${core.name.replace(' Core', '')} on ${legs.name}`;
  const pr = $('#problems'); pr.classList.toggle('ok', !st.problems.length);
  pr.textContent = st.problems.length ? st.problems.join('. ') + '.' : 'Ready to sortie: every limit is met.';
  const group = (title, extra = '') => { const g = el('section', 'mk-sgroup'); g.append(el('h3', null, `<span>${title}</span><small>${extra}</small>`)); host.append(g); return g; };
  const row = (g, label, value, tipText, cls = '') => { const r = el('div', 'mk-row ' + cls, `<span>${label}</span><b>${value}</b>`); if (tipText) r.dataset.tip = tipText; r.tabIndex = 0; g.append(r); return r; };
  const bar = (g, v, max, cls = '') => { const b = el('div', 'mk-bar ' + cls); const i = el('i'); i.style.width = `${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%`; b.append(i); g.append(b); };
  const each = (key, unit = '') => FRAME_SLOTS.map(s => PARTS[state.build[s]]).concat(Object.values(state.build.weapons).map(id => PARTS[id])).filter(p => p && p[key]).map(p => `${p.name} ${fmt(p[key])}${unit}`).join(' · ');

  let g = group('Frame', `${fmt(st.cost)} credits`);
  row(g, 'Total weight', `${fmt(st.weight)} t`, `Every part: ${each('weight', ' t')}`);
  row(g, 'Load on the legs', `${fmt(st.upperWeight)} / ${fmt(st.carry)} t`, `Everything but the legs (${fmt(st.upperWeight)} t) against the legs' carry limit (${fmt(st.carry)} t). Over the limit slows every move.`, st.over > 0 ? 'bad' : '');
  bar(g, st.upperWeight, st.carry, st.over > 0 ? 'bad' : st.load > 90 ? 'warn' : '');
  row(g, 'Armour points', fmt(st.ap), `Damage the mech takes before it goes down. ${each('ap')}`);
  row(g, 'Stability', fmt(st.stability), 'How hard big hits stagger it: head + core + legs');
  const res = el('div', 'mk-res'); for (const [t, v] of Object.entries(st.res)) { const d = el('div', null, `<b>${pct(v / 100)}</b>${TYPE[t]}`); d.dataset.tip = `${TYPE[t]} damage taken is cut by ${v}% (armour parts, weighted by their armour points)`; res.append(d); }
  g.append(el('div', 'small muted', 'Damage resisted')); g.append(res);

  g = group('Movement', LEG_TYPE[st.move.type] || '');
  const mk = st.move.moveK, mkText = mk < 100 ? ` (slowed to ${mk}% by the load)` : mk > 100 ? ` (+${mk - 100}% from a light load)` : '';
  row(g, 'Walk speed', `${fmt(st.move.speed)} km/h`, `Legs ${fmt(legs.speed)} km/h${mkText}`, mk < 100 ? 'bad' : mk > 100 ? 'good' : '');
  row(g, 'Boost speed', `${fmt(st.move.boost)} km/h`, `Booster thrust ${fmt(PARTS[state.build.booster].thrust)} km/h × core booster feed ${core.boostEff}% × weight (${fmt(st.weight)} t)`);
  row(g, 'Quick boost', `${fmt(st.move.qbThrust)} km/h`, `A sharp dash: costs ${fmt(st.move.qbCost)} energy, ready again after ${fmt(st.move.qbCooldown)} s`);
  row(g, 'Quick boost cost', `${fmt(st.move.qbCost)} energy · ${fmt(st.move.qbCooldown)} s`);
  row(g, 'Boost energy', `${fmt(st.move.boostCost)} per s`, 'Energy used every second of boosting');
  if (st.move.type === 'hover') row(g, 'Hover time', `${fmt(st.move.hoverTime)} s`, 'Seconds it can hang in the air after a jump');
  row(g, 'Jump', `${fmt(st.move.jump)} m`, st.move.type === 'treads' ? 'Treads only hop on their thrusters' : 'Jump height');
  row(g, 'Turn speed', `${fmt(st.move.turn)}° per s`, 'How fast the legs turn to a new heading');

  g = group('Energy', `${fmt(st.energy.capacity)} stored`);
  const eo = st.energy.draw > st.energy.output;
  row(g, 'Draw / output', `${fmt(st.energy.draw)} / ${fmt(st.energy.output)}`, `Every part's energy load against the generator's output (${fmt(PARTS[state.build.generator].output)} × core supply ${core.supply}%). ${each('energy')}`, eo ? 'bad' : '');
  bar(g, st.energy.draw, st.energy.output, eo ? 'bad' : st.energy.draw / st.energy.output > 0.9 ? 'warn' : '');
  row(g, 'Energy stored', fmt(st.energy.capacity), 'The energy bar: boosting, quick boosts and energy weapons spend it');
  row(g, 'Recharge', `${fmt(st.energy.recharge)} per s`, `Refills after a ${fmt(st.energy.delay)} s pause`);
  row(g, 'Empty bar pause', `${fmt(st.energy.delay)} s`, 'How long the bar waits before refilling after it runs dry');

  g = group('Heat', st.heat.overheatIn ? `overheats in ${fmt(st.heat.overheatIn)} s` : 'never overheats');
  row(g, 'Heat while idle', `${fmt(st.heat.passive)} per s`, `Parts warm up on their own. ${each('heat')}`);
  row(g, 'Weapons at full fire', `${fmt(st.heat.fire)} per s`, 'Every weapon firing nonstop');
  row(g, 'Boosting', `${fmt(st.heat.boost)} per s`);
  row(g, 'Cooling', `${fmt(st.heat.rate)} per s`, `${PARTS[state.build.cooling].name} removes this much heat every second`, st.heat.overheatIn ? '' : 'good');
  row(g, 'Heat sink', fmt(st.heat.sink), `Heat it can hold before it overheats; then it shuts weapons off for ${fmt(st.heat.recovery)} s`);
  row(g, 'Overheat lockout', `${fmt(st.heat.recovery)} s`);

  g = group('Targeting', `${fmt(st.lock.firmware)} firmware`);
  row(g, 'Firmware capacity', fmt(st.lock.firmware), 'Room for firmware chips (upgrades) in the CPU');
  row(g, 'Lock time', `${fmt(st.lock.speed)} s`, 'Time to lock a target inside the aim circle');
  row(g, 'Locks at once', fmt(st.lock.count), 'Targets homing weapons can lock together');
  row(g, 'Lock range', `${fmt(st.lock.range)} m`);
  row(g, 'Scan range', `${fmt(st.lock.scan)} m`, 'How far the head spots enemies');

  g = group('Arms');
  row(g, 'Aim speed', fmt(st.arms.aim), 'How fast the arms track the aim point');
  row(g, 'Recoil control', fmt(st.arms.recoil), 'Higher = less kick and spread');
  row(g, 'Melee', `${st.arms.melee}%`, 'Melee damage from these arms');
  for (const [k, lab] of [['L', 'Left hand'], ['R', 'Right hand']]) { const v = st.arms['load' + k]; row(g, `${lab} load`, `${fmt(v)} / ${fmt(st.arms.handLoad)} t`, 'The weapon\'s weight against the arms\' hand load limit', v > st.arms.handLoad ? 'bad' : ''); }

  g = group('Weapons', `${fmt(st.firepower)} damage per s`);
  for (const w of st.weapons) {
    const p = PARTS[w.id];
    const c = el('div', 'mk-weapon');
    c.append(el('header', null, `<span>${w.name}</span><small>${w.label}</small>`));
    const line = (a, b, tipText, cls) => row(c, a, b, tipText, cls);
    c.append(el('div', 'small', `<span class="mk-type t-${w.type}">${TYPE[w.type]}</span> ${KIND[p.kind]} · ${p.hand === 'two' ? 'Two-handed' : p.mount === 'shoulder' ? 'Shoulder' : 'One-handed'}`));
    if (w.heal) line('Repair', `${fmt(w.heal)} AP per s`); else if (p.block && !p.damage) line('Blocks', `${p.block}% of a hit`); else line('Damage per s', fmt(w.dps), `${fmt(p.damage)} a hit${p.salvo ? ` × ${p.salvo} missiles` : p.pellets ? ` × ${p.pellets} pellets` : ''}, ${fmt(p.rate)} per s${p.mag ? `, ${fmt(p.mag)} a magazine, ${fmt(p.reload)} s reload` : ''}`);
    if (p.block && p.damage) line('Blocks', `${p.block}% of a hit`);
    line('Range', `${fmt(p.range)} m`);
    line('Aiming', LOCK[p.lock]);
    line('Ammo', p.ammo ? fmt(p.ammo) : `Energy · ${fmt(p.shotEnergy)} a shot`);
    line('Heat', `${fmt(w.heatPerSec)} per s`, `${fmt(p.heatPerShot)} a shot`);
    line('Weight', `${fmt(p.weight)} t`, null, w.tooHeavy ? 'bad' : '');
    g.append(c);
  }
  if (!st.weapons.length) g.append(el('p', 'small muted', 'No weapons fitted.'));
}

// ---------------------------------------------------------------------------------------------------------- stage
const cv = $('#view'), ctx = cv.getContext('2d');
let raf = 0, t0 = performance.now(), lastFit = 3, pointer = null;
function redraw() { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); if (state.view === 'dress' && !state.sharp) prewarm(); }
function animFrame(A, now, offset) {
  const total = A.frames;
  if (!state.playing) return ((offset % total) + total) % total;
  const f = Math.floor(((now - t0) / 1000) * A.fps) + offset;
  if (!A.once) return ((f % total) + total) % total;
  const hold = Math.round(A.fps * 0.6), cycleLen = total + hold;
  return Math.min(total - 1, ((f % cycleLen) + cycleLen) % cycleLen);
}
function skyAndGround(c, W, H, gx, gy, zoom, t) {
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, mix('#7fa6c8', '#060914', t)); g.addColorStop(1, mix('#c6d4de', '#121829', t));
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // street tiles at the game's scale (one tile = 16 m), so the mech's 12 m reads at a glance
  const tw = TILE_W * S * zoom, th = TILE_H * S * zoom;
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
    const px = gx + (i - j) * tw / 2, py = gy + (i + j) * th / 2;
    if (py < -th || py > H + th || px < -tw || px > W + tw) continue;
    c.beginPath(); c.moveTo(px, py - th / 2); c.lineTo(px + tw / 2, py); c.lineTo(px, py + th / 2); c.lineTo(px - tw / 2, py); c.closePath();
    const centre = i === 0 && j === 0;
    c.fillStyle = mix(centre ? '#5f6874' : (i + j) % 2 ? '#525a65' : '#4b535d', '#151a26', t * 0.85); c.fill();
    c.strokeStyle = t > 0.5 ? 'rgba(63,240,255,0.10)' : 'rgba(0,0,0,0.18)'; c.lineWidth = 1; c.stroke();
  }
}
function paint(now) {
  if (state.view !== 'dress') return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // spin: legs walk round in a circle while the aim sweeps the other way
  if (state.spin) { const k = Math.floor((now - t0) / 700); state.legDir = ((k % DIRS) + DIRS) % DIRS; if (state.aimFollow) state.aimDir = state.legDir; else state.aimDir = (((-k * 1) % DIRS) + DIRS) % DIRS; drawDials(); }
  const LA = LEG_ANIMS[state.legAnim], UA = UPPER_ANIMS[state.upperAnim];
  const lf = animFrame(LA, now, state.frameOffset), uf = animFrame(UA, now, state.frameOffset);
  const alt = state.lift ? animAlt(state.legAnim, lf / LA.frames) : 0;
  const zoom = state.zoom === 'fit' ? lastFit : +state.zoom;   // screen px per baked px (1× = the game's own size)
  const gx = W / 2, gy = H * 0.7;
  ctx.imageSmoothingEnabled = zoom * (state.sharp ? 0.5 : 1) < 1.5;   // whole-number zooms stay crisp
  skyAndGround(ctx, W, H, gx, gy, zoom, state.time);
  if (state.aimPointer && pointer) state.aimDir = dirToward(pointer.x - gx, pointer.y - (gy - 0.45 * PX_PER_HEIGHT * S * zoom));
  const V = state.sharp ? view(state.build, true) : { ly: layers, k: 1 };
  const out = composeMech(ctx, V.ly, state.legDir, state.aimDir, { legs: [state.legAnim, lf], upper: [state.upperAnim, uf] }, state.paint, state.time, { x: gx, y: gy, zoom: zoom * V.k, alt, only: state.only || null });
  // muzzle flash on the first frame of a shot (the game draws these live, at the muzzle pixels composeMech returns)
  if (uf === 0 && /^fire/.test(state.upperAnim)) {
    const W2 = state.build.weapons, twoR = PARTS[W2.armR]?.hand === 'two', twoL = PARTS[W2.armL]?.hand === 'two';
    const keys = state.upperAnim === 'fire-shoulder' ? ['wShL', 'wShR'] : state.upperAnim === 'fire-L' ? [twoR ? 'wArmR' : 'wArmL'] : [twoL ? 'wArmL' : 'wArmR'];
    for (const key of keys) if (out.muzzles[key]) flash(ctx, ...out.muzzles[key], 10 * zoom);
  }
  if (state.markers) markers(ctx, out, zoom);
  if (state.zoom === 'fit') {
    const mechH = (gy - out.top) / zoom + 20, want = Math.max(1, Math.floor(Math.min(6, (H * 0.62) / mechH, (W * 0.72) / 105)));
    if (Math.abs(want - lastFit) > 0.05) { lastFit = want; }
  }
  $('#frame-label').textContent = `Legs ${lf + 1} of ${LA.frames} · upper ${uf + 1} of ${UA.frames}`;
  const L = out.legs;
  $('#facts').textContent = `Legs face ${DIR_NAME[state.legDir]}, aim ${DIR_NAME[state.aimDir]} · ${out.upper.layers.length + 1} layers · legs picture ${L.w}×${L.h} px · ${fmt(mb.stats.bakes)} pictures baked (${fmt(mb.stats.ms / 1000, { decimals: 1 })} s)`;
  if (state.playing || state.spin || state.aimPointer) raf = requestAnimationFrame(paint);
}
/** Bake the rest of the current animations in quiet moments, so playing them does not stutter (bakes stay lazy). */
let warmT = 0;
function prewarm() {
  window.cancelIdleCallback?.(warmT);   // not in every browser: then nothing is pre-baked
  const jobs = [];
  for (let f = 0; f < LEG_ANIMS[state.legAnim].frames; f++) jobs.push(() => layers.legs(state.legAnim, f, state.legDir));
  for (let f = 0; f < UPPER_ANIMS[state.upperAnim].frames; f++) jobs.push(() => layers.upper(state.upperAnim, f, state.aimDir));
  const step = (dl) => { while (jobs.length && dl.timeRemaining() > 8) jobs.shift()(); if (jobs.length) warmT = requestIdleCallback(step); };
  if (window.requestIdleCallback) warmT = requestIdleCallback(step);
}
function flash(c, x, y, r) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(255,255,230,1)'); g.addColorStop(0.35, 'rgba(255,200,90,0.9)'); g.addColorStop(1, 'rgba(255,120,30,0)');
  c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.restore();
}
function markers(c, out, zoom) {
  c.save(); c.lineWidth = 1.5; c.font = '11px system-ui'; c.textBaseline = 'middle';
  const cross = (x, y, col, label) => { c.strokeStyle = col; c.beginPath(); c.moveTo(x - 6, y); c.lineTo(x + 6, y); c.moveTo(x, y - 6); c.lineTo(x, y + 6); c.stroke(); c.fillStyle = col; c.fillText(label, x + 8, y); };
  cross(...out.hip, '#ffc54a', 'hip');
  cross(...out.ground, '#7dff9a', 'ground');
  const names = { wArmL: 'left arm', wArmR: 'right arm', wShL: 'left shoulder', wShR: 'right shoulder' };
  for (const [k, p] of Object.entries(out.muzzles)) cross(...p, '#ff6ad5', names[k] || k);
  c.restore();
}
/** Screen vector → nearest of the 16 screen directions (0 = up, clockwise). */
function dirToward(dx, dy) { const a = Math.atan2(dy, dx) + Math.PI / 2; return ((Math.round(a / (Math.PI * 2 / DIRS)) % DIRS) + DIRS) % DIRS; }
function mix(a, b, t) { const p = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16)); const A = p(a), B = p(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; }

// ---------- dials ----------
function drawDial(host, dir, label) {
  const c = host.querySelector('canvas'), g = c.getContext('2d'), w = c.width, r = w / 2 - 8;
  g.clearRect(0, 0, w, w);
  g.fillStyle = '#12151b'; g.beginPath(); g.arc(w / 2, w / 2, r + 4, 0, Math.PI * 2); g.fill();
  // the iso ground diamond inside, so "up the screen" reads as the map's north-east
  g.strokeStyle = '#2d3340'; g.lineWidth = 2; g.beginPath(); g.moveTo(w / 2, w / 2 - r * 0.45); g.lineTo(w / 2 + r * 0.9, w / 2); g.lineTo(w / 2, w / 2 + r * 0.45); g.lineTo(w / 2 - r * 0.9, w / 2); g.closePath(); g.stroke();
  for (let i = 0; i < DIRS; i++) {
    const a = -Math.PI / 2 + i * Math.PI * 2 / DIRS, big = i % 4 === 0;
    g.strokeStyle = i === dir ? '#ffc54a' : big ? '#8a93a3' : '#4a5160'; g.lineWidth = i === dir ? 5 : big ? 3 : 2;
    g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * (r - (big ? 10 : 6)), w / 2 + Math.sin(a) * (r - (big ? 10 : 6))); g.lineTo(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r); g.stroke();
  }
  const a = -Math.PI / 2 + dir * Math.PI * 2 / DIRS;
  g.strokeStyle = '#ffc54a'; g.lineWidth = 5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(w / 2, w / 2); g.lineTo(w / 2 + Math.cos(a) * (r - 14), w / 2 + Math.sin(a) * (r - 14)); g.stroke();
  g.fillStyle = '#ffc54a'; g.beginPath(); g.arc(w / 2, w / 2, 6, 0, Math.PI * 2); g.fill();
  host.setAttribute('aria-valuenow', String(dir)); host.setAttribute('aria-valuetext', `${label} ${DIR_NAME[dir]}`);
}
function drawDials() { drawDial($('#dial-legs'), state.legDir, 'Legs face'); drawDial($('#dial-aim'), state.aimDir, 'Aim'); }
function setLeg(d) { state.legDir = ((d % DIRS) + DIRS) % DIRS; if (state.aimFollow) state.aimDir = state.legDir; drawDials(); redraw(); save(); }
function setAim(d) { state.aimDir = ((d % DIRS) + DIRS) % DIRS; if (state.aimFollow) { state.aimFollow = false; $('#aim-follow').checked = false; } drawDials(); redraw(); save(); }
function wireDial(host, set, get) {
  const at = e => { const r = host.querySelector('canvas').getBoundingClientRect(); return dirToward(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)); };
  host.addEventListener('pointerdown', e => { host.setPointerCapture(e.pointerId); set(at(e)); });
  host.addEventListener('pointermove', e => { if (host.hasPointerCapture(e.pointerId)) set(at(e)); });
  host.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { set(get() + 1); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { set(get() - 1); e.preventDefault(); e.stopPropagation(); }
  });
}

// ---------------------------------------------------------------------------------------------------------- stage controls
function fillSelect(sel, anims, value) {
  sel.replaceChildren(); for (const [k, a] of Object.entries(anims)) { const o = el('option', null, a.label); o.value = k; if (k === value) o.selected = true; sel.append(o); }
}
function drawOnly() {
  const sel = $('#only'), names = { core: 'Core', head: 'Head', booster: 'Booster', armL: 'Left arm', armR: 'Right arm', wArmL: 'Left arm weapon', wArmR: 'Right arm weapon', wShL: 'Left shoulder weapon', wShR: 'Right shoulder weapon' };
  sel.replaceChildren();
  for (const [k, label] of [['', 'Every layer'], ['legs', 'Legs'], ...UPPER_KEYS.map(k => [k, names[k]])]) { const o = el('option', null, label); o.value = k; if (k === state.only) o.selected = true; sel.append(o); }
}
$('#anim-legs').addEventListener('change', e => { state.legAnim = e.target.value; t0 = performance.now(); redraw(); save(); });
$('#anim-upper').addEventListener('change', e => { state.upperAnim = e.target.value; t0 = performance.now(); redraw(); save(); });
$('#play').addEventListener('click', togglePlay);
function togglePlay() {
  if (state.playing) { const LA = LEG_ANIMS[state.legAnim]; state.frameOffset = animFrame(LA, performance.now(), state.frameOffset); state.playing = false; }
  else { state.playing = true; t0 = performance.now(); }
  $('#play').firstChild.textContent = state.playing ? 'Pause ' : 'Play '; redraw();
}
$('#step-back').addEventListener('click', () => { if (state.playing) togglePlay(); state.frameOffset--; redraw(); });
$('#step-fwd').addEventListener('click', () => { if (state.playing) togglePlay(); state.frameOffset++; redraw(); });
$('#lift').addEventListener('change', e => { state.lift = e.target.checked; redraw(); });
$('#aim-follow').addEventListener('change', e => { state.aimFollow = e.target.checked; if (state.aimFollow) state.aimDir = state.legDir; drawDials(); redraw(); save(); });
$('#aim-pointer').addEventListener('change', e => { state.aimPointer = e.target.checked; if (state.aimPointer) { state.aimFollow = false; $('#aim-follow').checked = false; } redraw(); });
$('#spin').addEventListener('change', e => { state.spin = e.target.checked; redraw(); });
$('#markers').addEventListener('change', e => { state.markers = e.target.checked; redraw(); });
$('#sharp').addEventListener('change', e => { state.sharp = e.target.checked; redraw(); save(); });
$('#only').addEventListener('change', e => { state.only = e.target.value; redraw(); });
$('#time').addEventListener('input', e => { state.time = +e.target.value; $('#time-label').textContent = timeName(state.time); redraw(); save(); });
const timeName = t => t < 0.2 ? 'Noon' : t < 0.5 ? 'Dusk' : t < 0.8 ? 'Evening' : 'Night';
document.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => {
  state.zoom = b.dataset.zoom; document.querySelectorAll('[data-zoom]').forEach(x => x.classList.toggle('on', x === b)); redraw(); save();
}));
cv.addEventListener('pointermove', e => { const r = cv.getBoundingClientRect(); pointer = { x: e.clientX - r.left, y: e.clientY - r.top }; if (state.aimPointer) { drawDials(); } });
cv.addEventListener('pointerleave', () => { pointer = null; });
cv.addEventListener('pointerdown', e => { if (!state.aimPointer) return; const r = cv.getBoundingClientRect(); pointer = { x: e.clientX - r.left, y: e.clientY - r.top }; state.upperAnim = state.build.weapons.armR ? 'fire-R' : 'fire-L'; $('#anim-upper').value = state.upperAnim; t0 = performance.now(); });

// ---------------------------------------------------------------------------------------------------------- actions
$('#random').addEventListener('click', () => { setBuild(randomBuild(PARTS, Math.random, { maker: state.makerFilter }), 'A new random build.'); });
$('#random-paint').addEventListener('click', randomPaint);
$('#reset').addEventListener('click', () => setBuild(clone(STARTER), 'Back to the starter build.'));
$('#copy').addEventListener('click', async () => {
  const st = buildStats(state.build, PARTS);
  const data = { mechkit: 1, build: state.build, paint: state.paint, legDir: state.legDir, aimDir: state.aimDir, legAnim: state.legAnim, upperAnim: state.upperAnim, time: state.time,
    names: Object.fromEntries([...FRAME_SLOTS.map(s => [s, PARTS[state.build[s]]?.name]), ...WEAPON_SLOTS.map(w => [w.key, PARTS[state.build.weapons[w.key]]?.name || null])]),
    totals: { weight: st.weight, carry: st.carry, energy: `${st.energy.draw}/${st.energy.output}`, problems: st.problems } };
  const text = 'Mech Kit build:\n' + JSON.stringify(data, null, 1);
  const ok = await navigator.clipboard?.writeText(text).then(() => true, () => false);
  note(ok ? 'Copied. Paste it to Claude with what to change.' : 'Could not reach the clipboard: select and copy the text below.');
  if (!ok) { const pre = el('pre', 'small'); pre.textContent = text; $('#copied').append(pre); }
});

// ---------------------------------------------------------------------------------------------------------- views
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
function showView(v) {
  state.view = v; save();
  document.querySelectorAll('[data-view]').forEach(x => x.setAttribute('aria-selected', String(x.dataset.view === v)));
  $('#dress').hidden = v !== 'dress'; $('#sheet').hidden = v !== 'sheet'; $('#lineup').hidden = v !== 'lineup';
  if (v === 'dress') redraw(); else if (v === 'sheet') drawSheet(); else drawLineup();
}

// ---------- parts sheet ----------
const SHEET_SLOTS = [...FRAME_SLOTS.map(s => [s, SLOT_LABEL[s].replace(' (fire control)', '')]), ['armW', 'Arm weapons'], ['shoulderW', 'Shoulder weapons']];
let queue = [], qRaf = 0;
function enqueue(job) { queue.push(job); if (!qRaf) qRaf = requestAnimationFrame(runQueue); }
function runQueue() {
  qRaf = 0; const t = performance.now();
  while (queue.length && performance.now() - t < 40) { const j = queue.shift(); try { j(); } catch (e) { console.error(e); } }
  if (queue.length) qRaf = requestAnimationFrame(runQueue);
}
function drawSheet() {
  queue = [];
  const slots = $('#sheet-slots'); slots.replaceChildren();
  for (const [k, label] of SHEET_SLOTS) {
    const b = el('button', 'mk-chip' + (state.sheetSlot === k ? ' on' : ''), label); b.type = 'button'; b.setAttribute('aria-pressed', String(state.sheetSlot === k));
    b.addEventListener('click', () => { state.sheetSlot = k; save(); drawSheet(); }); slots.append(b);
  }
  const mk = $('#sheet-makers'); mk.replaceChildren();
  for (const id of [null, ...MAKER_LIST.map(m => m.id)]) {
    const b = el('button', 'mk-chip' + (state.sheetMaker === id ? ' on' : ''), (id ? makerDot(id) : '') + (id ? makerName(id) : 'All makers')); b.type = 'button';
    b.addEventListener('click', () => { state.sheetMaker = id; save(); drawSheet(); }); mk.append(b);
  }
  document.querySelectorAll('[data-sheetmode]').forEach(b => b.classList.toggle('on', b.dataset.sheetmode === state.sheetMode));
  const grid = $('#sheet-grid'); grid.replaceChildren();
  const slot = state.sheetSlot;
  let list = slot === 'armW' ? partsOf('weapon').filter(p => p.mount === 'arm') : slot === 'shoulderW' ? partsOf('weapon').filter(p => p.mount === 'shoulder') : partsOf(slot);
  if (state.sheetMaker) list = list.filter(p => p.maker === state.sheetMaker);
  let lastMaker = null;
  for (const p of list) {
    if (p.maker !== lastMaker) { lastMaker = p.maker; const h = el('div', 'mk-maker-head', `<h3>${makerDot(p.maker)}${MAKER[p.maker].name}</h3><p>${MAKER[p.maker].lookText}</p>`); grid.append(h); }
    const equipped = isEquipped(p);
    const card = el('article', 'mk-card' + (equipped ? ' on' : '')); card.dataset.id = p.id;
    const c = el('canvas'); c.setAttribute('aria-label', `${p.name} picture`); card.append(c);
    const body = el('div', 'body');
    body.append(el('h4', null, `${makerDot(p.maker)}${p.name}`), el('div', 'sub', subline(p)), el('div', 'nums', cardNums(p)));
    const b = el('button', equipped ? 'primary' : '', equipped ? 'Fitted' : 'Fit to my mech'); b.type = 'button';
    b.addEventListener('click', () => { fitFromSheet(p); });
    body.append(b); card.append(body); grid.append(card);
    enqueue(() => drawCard(c, p));
  }
}
function isEquipped(p) {
  if (p.slot !== 'weapon') return state.build[p.slot] === p.id;
  return Object.values(state.build.weapons).includes(p.id);
}
function fitFromSheet(p) {
  if (p.slot !== 'weapon') return equip(p.slot, p.id);
  const slot = p.mount === 'shoulder' ? (state.build.weapons.shoulderR === p.id ? 'shoulderL' : 'shoulderR') : 'armR';
  equip(slot, p.id);
}
function cardNums(p) {
  const n = (label, v) => `<span>${label} <b>${v}</b></span>`;
  const bits = [n('Weight', `${fmt(p.weight)} t`)];
  if (p.ap) bits.push(n('AP', fmt(p.ap)));
  if (p.slot === 'legs') bits.push(n('Carry', `${fmt(p.carry)} t`), n('Speed', `${fmt(p.speed)} km/h`));
  if (p.slot === 'booster') bits.push(n('Thrust', `${fmt(p.thrust)} km/h`), n('Dash cost', fmt(p.qbCost)));
  if (p.slot === 'generator') bits.push(n('Output', fmt(p.output)), n('Stored', fmt(p.capacity)));
  if (p.slot === 'cooling') bits.push(n('Cooling', `${fmt(p.rate)}/s`), n('Sink', fmt(p.sink)));
  if (p.slot === 'cpu') bits.push(n('Locks', fmt(p.lockCount)), n('Lock', `${fmt(p.lockSpeed)} s`));
  if (p.slot === 'weapon') bits.push(`<span><i class="mk-type t-${p.type}">${TYPE[p.type]}</i> <b>${p.heal ? `${fmt(p.heal)} repair` : p.block && !p.damage ? `${p.block}% block` : `${fmt(Math.round(dpsOf(p)))} damage`}</b> per s</span>`, n('Range', `${fmt(p.range)} m`));
  if (p.energy) bits.push(n('Power draw', fmt(p.energy)));
  return bits.join('');
}
function drawCard(c, p, opts = {}) {
  const dpr = Math.min(2, devicePixelRatio || 1), W = c.clientWidth || 210, H = c.clientHeight || 210;
  c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const t = opts.time ?? state.sheetTime;
  const gx = W / 2, gy = H * 0.8;
  const internal = !!p && ['generator', 'cooling', 'cpu'].includes(p.slot);
  if (opts.build || (state.sheetMode === 'mech' && !internal)) {
    const b = opts.build || withPart(state.build, p);
    const { ly, k } = view(b, true);
    // each slot is framed on what it changes: heads close up, boosters from behind, legs as the whole mech
    const slot = p?.slot === 'weapon' ? p.mount : p?.slot;
    const F = { head: [3.2, 0.3, 7], core: [2.4, 0.12, 7], arms: [2.3, 0.1, 6], booster: [2.4, 0.14, 13], shoulder: [2.3, 0.18, 6], arm: [2.2, 0.08, 6] }[slot];
    const dir = opts.dir ?? F?.[2] ?? 7;
    let zoom = Math.min(2.2, H / 125), y0 = gy;
    if (F) {
      zoom = F[0] * H / 210;
      const L = ly.legs('idle', 0, dir);
      y0 = H * 0.55 + (L.ay - L.hip[1]) * zoom * k + F[1] * PX_PER_HEIGHT * S * zoom;
    }
    skyAndGround(g, W, H, gx, y0, zoom, t);
    g.imageSmoothingEnabled = true;
    composeMech(g, ly, dir, dir, 0, opts.paint ?? state.paint, t, { x: gx, y: y0, zoom: zoom * k });
  } else {
    const L = sharpMb().icon(p.id);
    const zoom = Math.min(4, (W * 0.84) / L.w, (gy - 12) / Math.max(1, L.ay));
    skyAndGround(g, W, H, gx, gy, zoom * 2, t);
    drawPart(g, L, gx - (L.w / 2 - L.ax) * zoom, gy, zoom, state.paint, t);
  }
}
function withPart(build, p) {
  const b = clone(build);
  if (p.slot !== 'weapon') { b[p.slot] = p.id; return b; }
  if (p.mount === 'shoulder') b.weapons.shoulderR = p.id;
  else { b.weapons.armR = p.id; if (p.hand === 'two') b.weapons.armL = null; else if (PARTS[b.weapons.armL]?.hand === 'two') b.weapons.armL = null; }
  return b;
}
document.querySelectorAll('[data-sheetmode]').forEach(b => b.addEventListener('click', () => { state.sheetMode = b.dataset.sheetmode; save(); drawSheet(); }));
$('#sheet-time').addEventListener('input', e => { state.sheetTime = +e.target.value; drawSheet(); });

// ---------- line-up ----------
/** A whole-maker build: class k (0 light … 2 heavy), the given legs, and that maker's own weapons. */
function makerBuild(mk, k, legsId) {
  const get = (slot, i) => { const l = partsOf(slot).filter(p => p.maker === mk); return l[Math.min(i, l.length - 1)].id; };
  const ws = partsOf('weapon').filter(p => p.maker === mk);
  const arm = ws.filter(p => p.mount === 'arm' && p.hand === 'one'), sh = ws.filter(p => p.mount === 'shoulder'), two = ws.filter(p => p.hand === 'two');
  const legs = legsId || get('legs', k);
  const b = { head: get('head', k), core: get('core', k), arms: get('arms', k), legs, booster: get('booster', k), generator: get('generator', k > 0 ? 1 : 0), cooling: get('cooling', k > 0 ? 1 : 0), cpu: get('cpu', k > 1 ? 1 : 0),
    weapons: { armL: arm[(k * 2) % arm.length]?.id || null, armR: arm[(k * 2 + 1) % arm.length]?.id || null, shoulderL: sh[k % sh.length]?.id || null, shoulderR: sh[(k + 1) % sh.length]?.id || null } };
  if (k === 2 && two.length) { b.weapons.armR = two[0].id; b.weapons.armL = null; }
  return b;
}
function lineupBuilds() {
  const out = [];
  for (const m of MAKER_LIST) {
    const legs = partsOf('legs').filter(p => p.maker === m.id);
    const used = new Set();
    for (let k = 0; k < 3; k++) {
      const l = legs.find(p => p.class === ['light', 'medium', 'heavy'][k] && p.type === 'biped' && !used.has(p.id)) || legs.find(p => p.type === 'biped' && !used.has(p.id)) || legs.find(p => !used.has(p.id)) || legs[0];
      used.add(l.id); out.push({ maker: m.id, title: `${['Light', 'Medium', 'Heavy'][k]} ${m.short}`, build: makerBuild(m.id, k, l.id) });
    }
    for (const l of legs) if (!used.has(l.id)) out.push({ maker: m.id, title: `${m.short} on ${l.name}`, build: makerBuild(m.id, 1, l.id) });
  }
  return out;
}
function drawLineup() {
  queue = [];
  const grid = $('#lineup-grid'); grid.replaceChildren();
  let last = null;
  for (const it of lineupBuilds()) {
    if (it.maker !== last) { last = it.maker; const m = MAKER[it.maker]; grid.append(el('div', 'mk-maker-head', `<h3>${makerDot(m.id)}${m.name}</h3><p>${m.lookText} ${m.leaning}</p>`)); }
    const st = buildStats(it.build, PARTS);
    const card = el('article', 'mk-card'); const c = el('canvas'); c.setAttribute('aria-label', `${it.title} picture`); card.append(c);
    const body = el('div', 'body');
    body.append(el('h4', null, `${makerDot(it.maker)}${it.title}`), el('div', 'sub', `${PARTS[it.build.legs].name} · ${LEG_TYPE[PARTS[it.build.legs].type]}`),
      el('div', 'nums', `<span>Weight <b>${fmt(st.weight)} t</b></span><span>AP <b>${fmt(st.ap)}</b></span><span>Speed <b>${fmt(st.move.speed)} km/h</b></span><span>Fire <b>${fmt(st.firepower)}/s</b></span>`));
    const b = el('button', '', 'Dress up this one'); b.type = 'button';
    b.addEventListener('click', () => { setBuild(clone(it.build), `Loaded the ${it.title}.`); showView('dress'); });
    body.append(b); card.append(body); grid.append(card);
    enqueue(() => drawCard(c, null, { build: it.build, paint: 'maker', time: state.lineupTime, dir: 7 }));
  }
}
$('#lineup-time').addEventListener('input', e => { state.lineupTime = +e.target.value; drawLineup(); });

// ---------------------------------------------------------------------------------------------------------- keys + pad
window.addEventListener('keydown', e => {
  if (e.target.matches('input[type=text], textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  document.body.classList.remove('pad');
  if (state.view !== 'dress') return;
  const inDial = e.target.closest?.('.mk-dial');
  switch (e.code) {
    case 'KeyA': setLeg(state.legDir - 1); break;
    case 'KeyD': setLeg(state.legDir + 1); break;
    case 'ArrowLeft': if (!inDial && !e.target.matches('input, select')) { setAim(state.aimDir - 1); e.preventDefault(); } break;
    case 'ArrowRight': if (!inDial && !e.target.matches('input, select')) { setAim(state.aimDir + 1); e.preventDefault(); } break;
    case 'KeyR': $('#random').click(); break;
    case 'KeyP': randomPaint(); break;
    case 'KeyC': $('#copy').click(); break;
    case 'Space': if (!e.target.matches('button, select, input')) { e.preventDefault(); togglePlay(); } break;
    default: return;
  }
});
window.addEventListener('pointerdown', () => document.body.classList.remove('pad'));
createPadNav({ back: () => { if (state.open) { state.open = null; drawSlots(); return true; } return false; } });
// the rest of the controller: right stick aims, bumpers turn the legs, X / Y / Start / Back are shortcuts
const held = new Map();
let padAimT = 0;
(function padLoop(t) {
  requestAnimationFrame(padLoop);
  const pad = [...(navigator.getGamepads?.() || [])].find(p => p && p.connected); if (!pad) return;
  const B = i => !!pad.buttons[i]?.pressed;
  const edge = (i) => { const was = held.get(i); held.set(i, B(i)); return B(i) && !was; };
  if ([0, 1, 2, 3, 4, 5, 8, 9, 12, 13, 14, 15].some(B)) document.body.classList.add('pad');
  if (state.view === 'dress') {
    if (edge(4)) setLeg(state.legDir - 1);
    if (edge(5)) setLeg(state.legDir + 1);
    if (edge(2)) $('#random').click();
    if (edge(3)) randomPaint();
    if (edge(9)) togglePlay();
    if (edge(8)) $('#copy').click();
    const rx = pad.axes[2] || 0, ry = pad.axes[3] || 0;
    if (Math.hypot(rx, ry) > 0.6 && t - padAimT > 60) { padAimT = t; const d = dirToward(rx, ry); if (d !== state.aimDir) setAim(d); document.body.classList.add('pad'); }
  } else for (const i of [2, 3, 4, 5, 8, 9]) edge(i);
})(0);

new ResizeObserver(redraw).observe(cv);

// ---------------------------------------------------------------------------------------------------------- start
load();
layers = mechLayers(mb, state.build);
fillSelect($('#anim-legs'), LEG_ANIMS, state.legAnim); fillSelect($('#anim-upper'), UPPER_ANIMS, state.upperAnim);
$('#aim-follow').checked = state.aimFollow; $('#sharp').checked = state.sharp; $('#time').value = state.time; $('#time-label').textContent = timeName(state.time);
document.querySelectorAll('[data-zoom]').forEach(x => x.classList.toggle('on', x.dataset.zoom === String(state.zoom)));
drawMakers(); drawSlots(); drawPaint(); drawStats(); drawOnly(); drawDials();
wireDial($('#dial-legs'), setLeg, () => state.legDir); wireDial($('#dial-aim'), setAim, () => state.aimDir);
$('#status').textContent = `${Object.keys(PARTS).length} parts from ${MAKER_LIST.length} makers`;
const askView = new URLSearchParams(location.search).get('view');
showView(['dress', 'sheet', 'lineup'].includes(askView) ? askView : state.view || 'dress');

// test hook
window.mechkit = { state, PARTS, MAKER, mb, get layers() { return layers; }, composeMech, mechLayers, setBuild, equip, buildStats, showView, redraw };
