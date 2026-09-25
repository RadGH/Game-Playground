// Free Play setup (with a live terrain preview), Settings, How to Play + Field Guide.

import { button, el } from './menus.js';
import { loadJSON, saveJSON } from './settings-store.js';
import { Materials, M } from '../world/materials.js';
import { World } from '../world/world.js';
import { generateTerrain, defaultBases } from '../world/terrain-gen.js';
import { MAP_SIZES } from '../sim/game.js';
import { hashString } from '../core/rng.js';
import { iconFor } from './icons.js';
import { HELP_GROUPS } from './help.js';
import { loadProgress } from './progress.js';

const FP_KEY = 'tinyrts.freeplay.v1';
const FP_DEFAULT = {
  tab: 'siege', size: 'medium', seed: '', style: 'rolling', difficulty: 'normal', waves: '10', start: 'normal',
  lanes: 'right', pace: 'normal', aiDifficulty: 'normal', aiStyle: 'random',
};
export const START_RES = { low: { c: 120, f: 20, a: 0 }, normal: { c: 200, f: 40, a: 0 }, high: { c: 500, f: 150, a: 30 } };

function picker(label, key, opts, st, onChange) {
  const row = el('div', 'opt-row');
  row.appendChild(el('span', 'opt-label', label));
  const seg = el('div', 'seg');
  for (const [val, text] of opts) {
    const b = el('button', 'seg-btn' + (st[key] === val ? ' on' : ''), text);
    b.addEventListener('click', (e) => { e.currentTarget.blur(); st[key] = val; onChange(); });
    seg.appendChild(b);
  }
  row.appendChild(seg);
  return row;
}

export function registerExtraScreens(app, menus) {
  // ---------- Free Play setup ----------
  menus.register('setup', (root, p, m) => {
    const st = { ...FP_DEFAULT, ...loadJSON(FP_KEY, {}) };
    if (!st.seed) st.seed = String(Math.floor(Math.random() * 99999));
    root.classList.add('wide');
    const render = () => {
      saveJSON(FP_KEY, st);
      root.innerHTML = '';
      root.appendChild(el('h2', '', 'Free Play'));
      const tabs = el('div', 'tabs');
      for (const [k, t] of [['siege', 'Siege'], ['versus', 'Versus']]) {
        const b = el('button', 'tab' + (st.tab === k ? ' on' : ''), t);
        b.addEventListener('click', () => { st.tab = k; render(); });
        tabs.appendChild(b);
      }
      root.appendChild(tabs);
      root.appendChild(el('p', 'tab-desc', st.tab === 'siege'
        ? 'Hold your base against waves from the Hollow. The Director reads your defense and sends what hurts it.'
        : 'Face an Umbra commander building its own base across the map. Destroy its Core before it destroys yours.'));
      const body = el('div', 'setup-body');
      const left = el('div', 'setup-opts');
      const again = () => render();
      left.appendChild(picker('Map size', 'size', [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']], st, again));
      left.appendChild(picker('Terrain', 'style', [['rolling', 'Rolling'], ['canyons', 'Canyons'], ['islands', 'Islands'], ['flat', 'Flat']], st, again));
      if (st.tab === 'siege') {
        left.appendChild(picker('Difficulty', 'difficulty', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard'], ['brutal', 'Brutal']], st, again));
        left.appendChild(picker('Waves', 'waves', [['10', '10'], ['20', '20'], ['30', '30'], ['endless', 'Endless']], st, again));
        left.appendChild(picker('Enemies from', 'lanes', [['right', 'Right'], ['both', 'Both sides'], ['under', 'Right + below']], st, again));
        left.appendChild(picker('Build time', 'pace', [['short', 'Short'], ['normal', 'Normal'], ['long', 'Long']], st, again));
      } else {
        left.appendChild(picker('AI difficulty', 'aiDifficulty', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard'], ['brutal', 'Brutal']], st, again));
        left.appendChild(picker('AI style', 'aiStyle', [['random', 'Random'], ['bastion', 'Bastion'], ['swarm', 'Swarm']], st, again));
      }
      left.appendChild(picker('Start with', 'start', [['low', 'Low'], ['normal', 'Normal'], ['high', 'High']], st, again));
      const seedRow = el('div', 'opt-row');
      seedRow.appendChild(el('span', 'opt-label', 'Seed'));
      const inp = el('input', 'seed-input');
      inp.type = 'text'; inp.value = st.seed; inp.maxLength = 24; inp.spellcheck = false;
      inp.addEventListener('change', () => { st.seed = inp.value.trim() || '1'; render(); });
      seedRow.appendChild(inp);
      seedRow.appendChild(button('Random', () => { st.seed = String(Math.floor(Math.random() * 99999)); render(); }, 'small'));
      left.appendChild(seedRow);
      body.appendChild(left);
      const right = el('div', 'setup-preview');
      const cv = el('canvas', 'preview-canvas');
      cv.width = 360; cv.height = 130;
      right.appendChild(cv);
      right.appendChild(el('div', 'c-dim preview-note', st.tab === 'versus' ? 'Your base: left · Umbra: right' : 'Your base: left · Hollow come from the ' + (st.lanes === 'both' ? 'left and right' : st.lanes === 'under' ? 'right and underground' : 'right')));
      body.appendChild(right);
      root.appendChild(body);
      drawPreview(app, cv, st);
      const row = el('div', 'menu-row');
      row.appendChild(button('Start', () => app.startGame(freeplayOpts(st)), 'primary'));
      row.appendChild(button('Back', () => m.back()));
      root.appendChild(row);
      const first = root.querySelector('.mbtn.primary'); if (first) first.focus({ preventScroll: true });
    };
    render();
  });

  // ---------- Settings ----------
  menus.register('settings', (root, p, m) => {
    const s = app.settings;
    let tab = p.tab || 'audio';
    root.classList.add('wide');
    const render = () => {
      root.innerHTML = '';
      root.appendChild(el('h2', '', 'Settings'));
      const tabs = el('div', 'tabs');
      for (const [k, t] of [['audio', 'Audio'], ['video', 'Video'], ['gameplay', 'Gameplay'], ['controls', 'Controls'], ['data', 'Data']]) {
        const b = el('button', 'tab' + (tab === k ? ' on' : ''), t);
        b.addEventListener('click', () => { tab = k; p.tab = k; render(); });
        tabs.appendChild(b);
      }
      root.appendChild(tabs);
      const body = el('div', 'settings-body');
      const slider = (label, key, min = 0, max = 1, step = 0.05, fmt = (v) => Math.round(v * 100) + '%') => {
        const row = el('div', 'opt-row');
        row.appendChild(el('span', 'opt-label', label));
        const r = el('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = s[key];
        const v = el('span', 'opt-val', fmt(s[key]));
        r.addEventListener('input', () => { s[key] = Number(r.value); v.textContent = fmt(s[key]); app.saveSettings(); });
        row.append(r, v);
        body.appendChild(row);
      };
      const toggle = (label, key, desc) => {
        const row = el('div', 'opt-row');
        row.appendChild(el('span', 'opt-label', label));
        const b = el('button', 'seg-btn' + (s[key] ? ' on' : ''), s[key] ? 'On' : 'Off');
        b.addEventListener('click', () => { s[key] = !s[key]; app.saveSettings(); render(); });
        row.appendChild(b);
        if (desc) row.appendChild(el('span', 'opt-desc c-dim', desc));
        body.appendChild(row);
      };
      const choice = (label, key, opts) => { body.appendChild(picker(label, key, opts, s, () => { app.saveSettings(); render(); })); };
      if (tab === 'audio') {
        slider('Master', 'master'); slider('Music', 'music'); slider('Sound effects', 'sfx');
        toggle('Mute when unfocused', 'muteOnBlur');
      } else if (tab === 'video') {
        choice('Pixel scale', 'scale', [['auto', 'Auto'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6'], ['8', '8']]);
        slider('Screen shake', 'shake');
        choice('Particles', 'particles', [['low', 'Low'], ['med', 'Medium'], ['high', 'High']]);
        toggle('Damage numbers', 'damageNumbers');
        toggle('High contrast', 'highContrast', 'Brighter team and warning colors');
        toggle('Show FPS', 'showFps');
      } else if (tab === 'gameplay') {
        toggle('Edge panning', 'edgePan');
        slider('Pan speed', 'panSpeed', 0.4, 2.5, 0.1, (v) => v.toFixed(1) + '×');
        toggle('Rebuild walls during waves', 'rebuildDuringWaves', 'Off: drones rebuild blueprint walls only between waves');
        toggle('Pause when unfocused', 'pauseOnBlur');
        choice('Default speed (Free Play)', 'defaultSpeed', [[0.5, '×0.5'], [1, '×1'], [2, '×2']]);
      } else if (tab === 'controls') {
        const list = el('div', 'controls-list');
        list.innerHTML = HELP_GROUPS.map(([t, kv]) => `<div class="grp"><h4>${t}</h4>${kv.map(([k, v]) => `<div class="kv"><b>${k}</b><span>${v}</span></div>`).join('')}</div>`).join('');
        body.appendChild(list);
        body.appendChild(el('p', 'c-dim', 'Keys follow physical positions, so the Q W E R grid stays in place on AZERTY or QWERTZ keyboards. Rebinding is on the backlog.'));
      } else if (tab === 'data') {
        const row = el('div', 'menu-col');
        row.appendChild(button('Reset campaign progress', () => m.show('confirm', { overlay: true, text: 'Erase all campaign progress, stars and best times?', yes: () => { app.resetProgress(); } }), 'danger'));
        row.appendChild(button('Delete suspended game', () => m.show('confirm', { overlay: true, text: 'Delete the saved, suspended game?', yes: () => { app.deleteSuspend?.(); } }), 'danger'));
        body.appendChild(row);
      }
      root.appendChild(body);
      const r = el('div', 'menu-row');
      r.appendChild(button('Back', () => m.back(), 'primary'));
      root.appendChild(r);
    };
    render();
  });

  // ---------- How to Play ----------
  menus.register('howto', (root, p, m) => {
    let page = p.page || 0;
    root.classList.add('wide');
    const pages = howtoPages(app);
    const render = () => {
      root.innerHTML = '';
      root.appendChild(el('h2', '', 'How to Play'));
      const nav = el('div', 'tabs small-tabs');
      pages.forEach((pg, i) => {
        const b = el('button', 'tab' + (i === page ? ' on' : ''), pg.title);
        b.addEventListener('click', () => { page = i; p.page = i; render(); });
        nav.appendChild(b);
      });
      root.appendChild(nav);
      const body = el('div', 'howto-body');
      pages[page].render(body);
      root.appendChild(body);
      const r = el('div', 'menu-row');
      if (page > 0) r.appendChild(button('◀ Prev', () => { page--; p.page = page; render(); }));
      if (page < pages.length - 1) r.appendChild(button('Next ▶', () => { page++; p.page = page; render(); }, 'primary'));
      r.appendChild(button('Back', () => m.back()));
      root.appendChild(r);
    };
    render();
  });
}

export function freeplayOpts(st) {
  const seed = /^\d+$/.test(st.seed) ? Number(st.seed) : hashString(st.seed);
  const start = START_RES[st.start] || START_RES.normal;
  if (st.tab === 'versus') {
    return { mode: 'versus', seed, mapSize: st.size, style: st.style, start, ai: { difficulty: st.aiDifficulty, style: st.aiStyle }, commander: true, label: `Versus · ${st.aiDifficulty} ${st.aiStyle}` };
  }
  const total = st.waves === 'endless' ? Infinity : Number(st.waves);
  return {
    mode: 'siege', seed, mapSize: st.size, style: st.style, difficulty: st.difficulty, start, commander: true,
    waves: { total, pace: st.pace, lanes: st.lanes, difficulty: st.difficulty }, label: `Siege · ${st.difficulty}`,
  };
}

function drawPreview(app, cv, st) {
  const [W, H] = MAP_SIZES[st.size];
  const mats = new Materials(app.data.materials);
  const world = new World(W, H, mats);
  const seed = /^\d+$/.test(st.seed) ? Number(st.seed) : hashString(st.seed);
  const bases = defaultBases(W, st.tab === 'versus');
  generateTerrain(world, { seed, style: st.style, bases });
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(cv.width, cv.height);
  const px = new Uint32Array(img.data.buffer);
  const sx = W / cv.width, sy = H / cv.height;
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
    const m = world.get(Math.floor(x * sx), Math.floor(y * sy));
    let c = 0xff1a0f0b;
    if (m === M.CRYSTAL) c = 0xfff5e846; else if (m === M.FERRITE) c = 0xff559ff5;
    else if (m === M.BEDROCK) c = 0xff2a1a1b; else if (m !== M.EMPTY) c = 0xff704f45;
    px[y * cv.width + x] = c;
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = '#4ee6ff';
  const b0 = bases[0];
  ctx.fillRect(b0.x / sx - 3, (b0.y || H / 2) / sy - 8, 6, 8);
  if (bases[1]) { ctx.fillStyle = '#ffab40'; ctx.fillRect(bases[1].x / sx - 3, (bases[1].y || H / 2) / sy - 8, 6, 8); }
  else { ctx.fillStyle = '#ff4fd8'; ctx.fillRect(cv.width - 5, 0, 5, cv.height); if (st.lanes === 'both') ctx.fillRect(0, 0, 5, cv.height); }
}

function howtoPages(app) {
  const txt = (html) => (body) => { body.innerHTML = html; };
  const d = app.data;
  return [
    { title: 'Basics', render: txt(`
      <p><b>Your Core</b> is your base. If it falls, you lose. It makes Drones, trickles <span class="c-crystal">+2 crystal/s</span>, links nearby buildings, and zaps anything close.</p>
      <p><b>Drones</b> build everything. Place a building and it goes up as a blueprint; drones fly over and construct it. They also build your painted walls <b>bottom-up</b>, dig, repair (for a little crystal) and salvage.</p>
      <p><b>Waves</b> of Hollow creatures come on a timer (top right). Between waves: build. During waves: hold. <b>Shift+N</b> calls the next wave early for bonus crystal.</p>
      <p><b>Camera:</b> arrow keys, screen edges, middle-drag, the minimap. Wheel zooms. <b>Home</b> jumps to your Core.</p>`) },
    { title: 'Building', render: txt(`
      <p>With nothing selected, the <b>command card</b> (bottom right) is your build menu. Keys follow its grid: <b>Q W E R / A S D F / Z X C V</b>.</p>
      <p><b>Q</b> Walls · <b>W</b> Turrets · <b>E</b> Economy · <b>R</b> Base · <b>Z</b> Dig · <b>X</b> Salvage · <b>V</b> Repeat last. So a Pulse Turret is <b>W</b> then <b>Q</b>, then click.</p>
      <p><b>Walls are painted.</b> Drag to paint cells; hold <b>Shift</b> for a straight line; <b>[ ]</b> change the brush. Red cells would reach too far from support and won't be built.</p>
      <p><b>Dig</b> (Z) clears rock and dust — for tunnels, moats, and dropping a ledge on the enemy. Ore you dig pays out.</p>
      <p>Buildings need <b>solid ground</b> (terrain, rubble or your walls — turrets can sit on walls) and must be inside your <b>link network</b>.</p>`) },
    { title: 'Economy', render: txt(`
      <p><span class="c-crystal">◆ Crystal</span> — everything. <span class="c-ferrite">▲ Ferrite</span> — Plate walls, machines, and ammo for Mortars, Railguns and Flak. <span class="c-alloy">⬢ Alloy</span> — refined from 2 crystal + 1 ferrite, for advanced stuff.</p>
      <p><b>Drills</b> mine ore in a 20 × 48 area under them. The ore <b>disappears from the ground</b> — careful what stands above it.</p>
      <p><span class="c-power">⚡ Power</span> is a rate: Core +10, Solar +3 (needs open sky), Reactor +20. Drills, factories and <b>laser turrets while firing</b> draw it. Batteries cover spikes. When power runs out the grid <b>browns out</b> and everything slows.</p>
      <p><b>Links:</b> buildings only work within 90 of the Core or 60 of a Relay, with a clear line through terrain. Press <b>L</b> to see the network.</p>`) },
    { title: 'Physics', render: txt(`
      <p>Everything is made of cells. Shots chip them away; blasts carve craters; loose dust and rubble slide into piles.</p>
      <p><b>The support rule:</b> stacking straight up is free. Every cell that reaches sideways or hangs below counts one step from the nearest cell resting on the ground (or pressed against terrain). Past its material's span — Panel 10, Plate 18, Prism 8, Foam 3 — it <b>breaks off and falls</b>.</p>
      <p>Falling chunks <b>crush</b> whatever they land on. Undermine a ledge over a swarm and watch.</p>
      <p>Buildings sit on whatever is under them. Chew out the wall under a turret and <b>the turret falls</b>. The Core never falls.</p>
      <p>Your own shots pass through your own walls. Blasts don't care whose wall it is.</p>`) },
    { title: 'Combat', render: txt(`
      <p><b>Damage types:</b> <b>Laser</b> (Pulse, Lance, most units) is instant and power-hungry — and bounces off <b>Prism</b> and a <b>Carapace's front</b>. <b>Kinetic</b> (Railgun) punches through lines of enemies and walls. <b>Blast</b> (Mortar, bombs) carves terrain. <b>Arc</b> chains between swarms. <b>Acid</b> eats walls.</p>
      <p><b>Prism walls</b> bounce enemy lasers back at whoever fired them — great against Glares and Umbra lasers. Your own lasers pass through your Prism.</p>
      <p><b>Flak</b> is anti-air and also shoots acid globs and bombs out of the sky.</p>
      <p>Select a turret to set its <b>targeting</b>: Nearest, Strongest, Weakest, Air first, Closest to Core.</p>`) },
    { title: 'Units', render: txt(`
      <p>Build a <b>Fabricator</b> (R, Q) to train Troopers, Lancers, Skimmers and Siege Walkers. Right-click the ground to set a <b>rally point</b>.</p>
      <p>Drag to select. <b>Right-click</b> moves or attacks; right-click an enemy wall to shoot it. <b>A</b> attack-move, <b>S</b> stop, <b>D</b> hold, <b>F</b> patrol. <b>Shift</b> queues orders. <b>Shift+1–0</b> saves a group, <b>1–0</b> recalls it.</p>
      <p>Your units walk through your own <b>Gates</b> — build one into any wall your army needs to cross.</p>
      <p>The <b>Commander</b> is free and comes back 30 s after falling: <b>Q</b> Overcharge nearby turrets, <b>W</b> Blink, <b>E</b> Orbital Lance (a beam from orbit that carves a trench).</p>
      <p>A <b>Research Lab</b> unlocks upgrades like tougher walls, faster drills and more population.</p>`) },
    { title: 'Enemies', render: txt(`
      <p><b>The Hollow</b> walk toward your Core and climb natural rock (slowly) — but they <b>can't climb your walls</b>, so they chew through them from the bottom. Pits slow them; they don't trap them.</p>
      <p><b>The Director</b> (Free Play) watches your defense and sends counters: all lasers → Carapaces; thick walls → Gnawers, Borers and Spitters; no anti-air → Wisps and Bombards. Every 5th wave is a surge, every 10th brings a boss.</p>
      <p><b>Borers</b> tunnel underground — watch for the pink tremor line on the surface and the minimap.</p>
      <p><b>Umbra</b> is a rival commander with your exact tools. It builds a base, masses an army, and pushes. You'll see it coming: "Umbra is massing an army".</p>`) },
    { title: 'Field Guide', render: (body) => fieldGuide(app, body) },
    { title: 'Keys', render: (body) => { body.innerHTML = `<div class="controls-list">${HELP_GROUPS.map(([t, kv]) => `<div class="grp"><h4>${t}</h4>${kv.map(([k, v]) => `<div class="kv"><b>${k}</b><span>${v}</span></div>`).join('')}</div>`).join('')}</div>`; } },
  ];
}

function fieldGuide(app, body) {
  const d = app.data;
  const seen = loadProgress().seen || {};
  const sec = (title, entries) => {
    const wrap = el('div', 'fg-sec');
    wrap.appendChild(el('h3', '', title));
    const grid = el('div', 'fg-grid');
    for (const e of entries) {
      const card = el('div', 'fg-card' + (e.locked ? ' locked' : ''));
      const cv = el('canvas'); cv.width = 36; cv.height = 36;
      if (!e.locked) cv.getContext('2d').drawImage(iconFor(e.icon, 36), 0, 0);
      card.appendChild(cv);
      card.appendChild(el('div', 'fg-text', e.locked ? '<b>???</b><br><span class="c-dim">Not met yet</span>' : `<b>${e.name}</b><br><span class="c-dim">${e.stats}</span><br>${e.desc}`));
      grid.appendChild(card);
    }
    wrap.appendChild(grid);
    body.appendChild(wrap);
  };
  const cost = (c) => !c ? '' : ['c', 'f', 'a'].filter((k) => c[k]).map((k) => `${c[k]}${{ c: '◆', f: '▲', a: '⬢' }[k]}`).join(' ');
  const wstat = (w) => !w ? '' : ` · ${w.dtype} ${w.dps ? w.dps + '/s' : w.dmg}${w.range ? ' r' + w.range : ''}`;
  sec('Buildings', Object.entries(d.buildings.list).map(([k, b]) => ({ icon: { kind: 'b', type: k }, name: b.name, stats: `${cost(b.cost) || 'free'} · ${b.hp} HP${wstat(b.weapon)}`, desc: b.desc })));
  sec('Units', Object.entries(d.units.list).map(([k, u]) => ({ icon: { kind: 'u', type: k }, name: u.name, stats: `${cost(u.cost) || 'free'} · ${u.hp} HP${wstat(u.weapon)}`, desc: u.desc })));
  sec('The Hollow', Object.entries(d.enemies.list).map(([k, u]) => ({ icon: { kind: 'e', type: k }, name: u.name, stats: `${u.hp} HP${u.bite ? ' · bite ' + u.bite.dmg : ''}${wstat(u.weapon)}`, desc: u.desc, locked: !seen[k] })));
}
