// The creator (M7): make a person, or change someone who lives here. One screen on every device: the body stands in the top half and
// turns under a finger, the rows sit below it. Every row is the same thing, a name with ‹ and › either side, so a thumb, the arrow keys
// and a controller all do one job, and six rows a tab means nothing ever scrolls over the picture (a scroller blanks the canvas on phones).
// Tap the value of a long list and the whole list opens. It renders on the game's own renderer; there is no second context.
import { createChibi2Character, prepareChibi2 } from '../../../../avatar-3d/js/chibi2.js';
import { TABS, getPath, setPath, rowShown, designAvatar, fitRace, makerOf } from './design.js';
import { WEAR_NAMES } from './outfits.js';
import { el } from './shell.js';

const ANIMS = ['idle', 'wave', 'walk'], HOLD_MS = 420, REPEAT_MS = 130;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createCreator({ THREE, renderer, shell, voice, profileFor, randomOne, suggestName, lists, onDone, onCancel }) {
  // ---- the little stage
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
  scene.background = new THREE.Color('#b9d6e6');
  scene.add(new THREE.HemisphereLight('#f4f8ff', '#8a8878', 1.9));
  const sun = new THREE.DirectionalLight('#fff3df', 2.2); sun.position.set(2, 4, 3); scene.add(sun);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#e6dfcf' })); scene.add(floor);
  const pivot = new THREE.Group(); scene.add(pivot);
  let actor = null, yaw = 0, spin = 0, dist = 6, lookY = 1, tall = 1.6, wantHead = false, token = 0, timer = 0, building = null, shown = 0;

  // ---- the page
  const root = el('div', { class: 'od-creator', hidden: '' }), stage = el('div', { class: 'mk-stage' });
  const title = el('b', { class: 'mk-title', text: 'Make a person' });
  const tabsBox = el('div', { class: 'mk-tabs', role: 'tablist' }), rowsBox = el('div', { class: 'mk-rows' });
  const randomB = el('button', { type: 'button', class: 'mk-random', text: 'Random', on: { click: () => self.random() } });
  const backB = el('button', { type: 'button', class: 'mk-foot quiet', text: 'Back', on: { click: () => self.cancel() } });
  const doneB = el('button', { type: 'button', class: 'mk-foot go', text: 'Done', on: { click: () => self.done() } });
  const panel = el('div', { class: 'mk-panel' }, tabsBox, rowsBox, el('div', { class: 'mk-feet' }, backB, randomB, doneB));
  root.append(stage, el('div', { class: 'mk-head' }, title), panel);
  document.body.append(root);

  let C = null, tab = 0, focus = 0, nameIn = null, rowEls = [];
  const ctx = () => C;
  const rows = () => TABS[tab].rows.filter(r => rowShown(r, ctx()));
  const options = row => (typeof row.options === 'function' ? row.options(ctx()) : []);
  const rangeSteps = r => Math.round((r.max - r.min) / r.step);
  function value(row) {
    if (row.type === 'wear') return C.wear;
    if (row.path === '$household') return C.household;
    if (row.path === '$job') return C.job;
    return getPath(C.design, row.path, ctx());
  }
  function put(row, v) {
    if (row.type === 'wear') { C.wear = v; drawRows(); } else if (row.path === '$household') C.household = v;
    else if (row.path === '$job') { C.job = v; C.previewJob = jobWear(v); } else if (row.path === 'race') fitRace(C.design, v);
    else setPath(C.design, row.path, v, ctx());
    if (row.path === 'race' || row.path.endsWith('.top.id') || row.path.endsWith('.hat.id') || row.path === 'face.hair.id' || row.path === 'face.accessory.id') drawRows();
    if (row.path === 'voice.engine' || row.path.startsWith('voice.')) C.heard = false;
    C.moves++;
    refresh(row); rebuild();
  }
  const jobWear = v => (TABS[tab].id === 'home' && v !== 'auto' && v !== 'none' ? v : null);
  function step(row, by) {
    if (row.type === 'range') { const k = clamp(Math.round((value(row) - row.min) / row.step) + by, 0, rangeSteps(row)); put(row, +(row.min + k * row.step).toFixed(2)); return; }
    const list = options(row); if (!list.length) return;
    let i = list.findIndex(o => o.v === value(row));
    if (i < 0) i = by > 0 ? -1 : 0;
    put(row, list[(i + by + list.length) % list.length].v);
  }
  const shownText = row => {
    const v = value(row);
    if (row.type === 'range') return row.max > 2 ? String(v) : `${Math.round((v - row.min) / (row.max - row.min) * 100)}`;
    return options(row).find(o => o.v === v)?.name ?? (v == null ? 'None' : String(v));
  };
  function refresh(row) {
    const box = rowEls.find(e => e.row === row); if (!box) return;
    box.text.textContent = shownText(row);
    if (row.type === 'color') { const v = value(row); box.swatch.style.background = v || 'transparent'; box.text.textContent = v ? '' : 'Plain'; }
    if (row.type === 'range') box.fill.style.width = `${(value(row) - row.min) / (row.max - row.min) * 100}%`;
    if (row.type === 'wear') shownWear();
  }
  const shownWear = () => { title.textContent = `${C.editing ? 'Change' : 'Make'}: ${WEAR_NAMES[C.wear]} clothes`; };
  function chooser(row) {
    const list = el('div', { class: 'od-list mk-choose' }), box = shell.modal({ title: row.label, body: [list], buttons: [{ label: 'Close', quiet: true }] }), now = value(row);
    for (const o of options(row)) list.append(el('button', { class: 'od-big' + (o.v === now ? ' on' : ''), type: 'button', text: o.name || '', 'data-v': String(o.v), on: { click: () => { box.close(); C.moves++; put(row, o.v); } } }));
  }
  function holdable(b, by, row) {
    let t0 = 0, t1 = 0, held = false;
    const stop = () => { clearTimeout(t0); clearInterval(t1); };
    b.addEventListener('pointerdown', () => { held = false; t0 = setTimeout(() => { held = true; t1 = setInterval(() => step(row, by), REPEAT_MS); }, HOLD_MS); });
    for (const e of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(e, stop);
    b.addEventListener('click', () => { if (!held) step(row, by); held = false; });
  }
  function drawRows() {
    rowsBox.textContent = ''; rowEls = []; nameIn = null;
    rows().forEach((row, i) => {
      const line = el('div', { class: 'mk-row', 'data-key': row.path });
      line.append(el('span', { class: 'mk-label', text: row.label }));
      if (row.type === 'name') {
        nameIn = el('input', { class: 'mk-name', type: 'text', maxlength: '40', 'aria-label': 'Name', autocomplete: 'off', autocapitalize: 'words', on: { input: e => { C.design.name = e.target.value; C.named = true; } } });
        nameIn.value = C.design.name;
        line.append(nameIn, el('button', { type: 'button', class: 'mk-suggest', text: 'Suggest', on: { click: () => self.suggest() } }));
        rowEls.push({ row, line });
      } else if (row.type === 'action') {
        line.append(el('button', { type: 'button', class: 'mk-act', text: row.text, on: { click: () => self.sample() } }));
        rowEls.push({ row, line });
      } else {
        const text = el('span', { class: 'mk-text' }), swatch = el('i', { class: 'mk-swatch' }), fill = el('i', { class: 'mk-fill' });
        const val = el('button', { type: 'button', class: 'mk-val', 'aria-label': row.label, on: { click: () => { if (row.type === 'pick' || row.type === 'wear') { if (options(row).length > 5) chooser(row); else step(row, 1); } else step(row, 1); } } }, row.type === 'range' ? fill : null, row.type === 'color' ? swatch : null, text);
        const prev = el('button', { type: 'button', class: 'mk-prev', 'aria-label': `${row.label} back`, text: '‹' }), next = el('button', { type: 'button', class: 'mk-next', 'aria-label': `${row.label} next`, text: '›' });
        holdable(prev, -1, row); holdable(next, 1, row);
        line.append(prev, val, next);
        rowEls.push({ row, line, text, swatch, fill, val });
        refresh(row);
      }
      line.classList.toggle('pad-focus', C.padFocus && i === focus);
      rowsBox.append(line);
    });
  }
  function drawTabs() {
    tabsBox.textContent = '';
    TABS.forEach((t, i) => tabsBox.append(el('button', { type: 'button', role: 'tab', class: i === tab ? 'on' : '', 'data-tab': t.id, text: t.label, on: { click: () => self.tab(i) } })));
  }
  function frameBody() {
    const m = actor?.metrics(), head = wantHead;
    tall = m ? m.height : 1.6;
    lookY = head ? tall * 0.84 : tall * 0.5;
  }
  /** Coalesced: a held button fires ten times a second, and only the last look is worth baking. */
  function rebuild() { clearTimeout(timer); timer = setTimeout(apply, 50); }
  async function apply() {
    const me = ++token, av = designAvatar(C.design, C.previewJob ? 'work' : C.wear, C.previewJob);
    building = prepareChibi2(av, { anims: ANIMS, v25: true, v26: true, budget: 8, slice: () => new Promise(r => setTimeout(r, 0)) });
    await building; building = null;
    if (me !== token || !C) return;
    if (!actor) { actor = await createChibi2Character(av, { anims: ANIMS, v25: true, v26: true }); pivot.add(actor.group); } else await actor.setAvatar(av);
    shown++;
    frameBody();
  }
  // a finger on the picture turns them
  let drag = null;
  stage.addEventListener('pointerdown', e => { drag = e.clientX; try { stage.setPointerCapture(e.pointerId); } catch { /* not a live pointer */ } });
  stage.addEventListener('pointermove', e => { if (drag === null) return; yaw += (e.clientX - drag) * 0.012; drag = e.clientX; });
  const lift = () => { drag = null; };
  stage.addEventListener('pointerup', lift); stage.addEventListener('pointercancel', lift);

  function move(dy) { const n = rows().length; focus = (focus + dy + n) % n; C.padFocus = true; rowEls.forEach((r, i) => r.line.classList.toggle('pad-focus', i === focus)); if (rows()[focus].type === 'name' && document.activeElement !== nameIn) nameIn?.blur(); }
  function press() { const row = rows()[focus]; if (!row) return; if (row.type === 'name') self.suggest(); else if (row.type === 'action') self.sample(); else if ((row.type === 'pick' || row.type === 'wear') && options(row).length > 5) chooser(row); else step(row, 1); }
  addEventListener('keydown', e => {
    if (!C || document.querySelector('.modal')) return;
    if (/INPUT|TEXTAREA/.test(e.target?.tagName || '')) { if (e.code === 'Enter' || e.code === 'Escape') e.target.blur(); return; }
    const c = e.code; let used = true;
    if (c === 'ArrowUp' || c === 'KeyW') move(-1); else if (c === 'ArrowDown' || c === 'KeyS') move(1);
    else if (c === 'ArrowLeft' || c === 'KeyA') { const r = rows()[focus]; if (r && r.type !== 'name' && r.type !== 'action') step(r, -1); } else if (c === 'ArrowRight' || c === 'KeyD') { const r = rows()[focus]; if (r && r.type !== 'name' && r.type !== 'action') step(r, 1); }
    else if (c === 'KeyQ' || c === 'BracketLeft') self.tab((tab + TABS.length - 1) % TABS.length); else if (c === 'KeyE' || c === 'BracketRight' || c === 'Tab') self.tab((tab + 1) % TABS.length);
    else if (c === 'Enter' || c === 'Space') press(); else if (c === 'KeyR') self.random(); else if (c === 'KeyF') self.done(); else if (c === 'Backspace') self.cancel();
    else used = false;
    if (used) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  const pad = { keys: new Map() };
  function padFrame(t) {
    const g = [...(navigator.getGamepads?.() ?? [])].find(x => x?.connected !== false && x?.buttons); if (!g) { pad.keys.clear(); return; }
    const B = i => !!g.buttons[i]?.pressed, ax = g.axes[0] || 0, ay = g.axes[1] || 0;
    // a list is open and the menu walker has the pad: the press that closes it must not count here too
    if (document.querySelector('.modal')) pad.shut = t;
    if (t - (pad.shut ?? -1e9) < 250) { pad.keys.clear(); if (B(0)) pad.keys.set('a', Infinity); if (B(1)) pad.keys.set('b', Infinity); return; }
    const edge = (id, down, repeat, fn) => { const h = pad.keys.get(id); if (!down) { pad.keys.delete(id); return; } if (!h) { pad.keys.set(id, t + 380); fn(); } else if (repeat && t >= h) { pad.keys.set(id, t + 130); fn(); } };
    edge('u', B(12) || ay < -0.6, true, () => move(-1)); edge('d', B(13) || ay > 0.6, true, () => move(1));
    const side = by => { const r = rows()[focus]; if (r && r.type !== 'name' && r.type !== 'action') step(r, by); C.padFocus = true; };
    edge('l', B(14) || ax < -0.6, true, () => side(-1)); edge('r', B(15) || ax > 0.6, true, () => side(1));
    edge('lb', B(4), false, () => self.tab((tab + TABS.length - 1) % TABS.length)); edge('rb', B(5), false, () => self.tab((tab + 1) % TABS.length));
    edge('a', B(0), false, () => press()); edge('b', B(1), false, () => self.cancel()); edge('x', B(2), false, () => self.random()); edge('y', B(3), false, () => self.done());
  }

  const self = {
    get open() { return !!C; }, get design() { return C?.design ?? null; }, root, scene, camera,
    state: () => C && ({ tab: TABS[tab].id, focus, wear: C.wear, moves: C.moves, shown, name: C.design.name, race: C.design.race, household: C.household, job: C.job, rows: rows().map(r => r.path) }),
    /** Where Back goes. */
    back(v) { if (C) C.back = v; },
    /** Open it. `from` = a design to start from (edit), else a random person. households, jobs = [{ v, name }]. */
    start({ design, editing = null, households = [], jobs = [], household = null, job = 'auto' }) {
      C = { design: JSON.parse(JSON.stringify(design)), editing, wear: 'casual', households, jobs, household, job, lists, moves: 0, padFocus: false, named: false, heard: false, previewJob: null };
      tab = 0; focus = 0; yaw = 0.0; shown = 0;
      root.hidden = false; doneB.textContent = editing != null ? 'Save' : 'Done'; title.textContent = editing != null ? 'Change this person' : 'Make a person'; drawTabs(); drawRows(); self.tab(0); rebuild();
    },
    tab(i) { tab = i; focus = 0; if (C.previewJob !== jobWear(C.job)) { C.previewJob = jobWear(C.job); rebuild(); } wantHead = TABS[i].view === 'head'; for (const [k, b] of [...tabsBox.children].entries()) b.classList.toggle('on', k === i); drawRows(); frameBody(); },
    random() { const was = C.design.name; C.design = JSON.parse(JSON.stringify(randomOne())); if (C.named) C.design.name = was; C.moves++; drawRows(); rebuild(); },
    async suggest() { C.design.name = await suggestName(C.design.race, C.design.gender); C.named = true; C.moves++; if (nameIn) nameIn.value = C.design.name; },
    sample() {
      voice.unlock();
      const d = C.design, given = String(d.name).trim().split(/\s+/)[0] || 'me', p = { ...profileFor({ id: 1, race: d.race, gender: d.gender, age: d.age, voice: d.voice }) };
      C.sampled = (C.sampled ?? 0) + 1;
      return voice.speak(p, `Hello, I'm ${given}. Pleased to meet you.`, { engine: d.voice.engine ?? 'formant', priority: 3, speaker: 'creator' });
    },
    done() {
      if (!String(C.design.name).trim()) { shell.toast('They need a name.'); self.tab(0); return; }
      const c = C, cmd = makerOf(c.design, { household: c.household, job: c.job === 'auto' ? null : c.job });
      self.close(); onDone(cmd, c);
    },
    cancel() { const c = C; self.close(); onCancel(c); },
    close() { C = null; clearTimeout(timer); token++; root.hidden = true; if (actor) { pivot.remove(actor.group); actor.dispose(); actor = null; } },
    /** One frame. The town carries on behind this; nothing pauses. */
    frame(dt, now) {
      if (!C) return;
      padFrame(now);
      const w = innerWidth, h = innerHeight, wide = w > h, panelBox = panel.getBoundingClientRect();
      camera.aspect = w / h; camera.fov = 30;
      // far enough back that the whole body, or the whole head, fits the free part of the screen, whoever they are
      const free = wide ? 1 : Math.max(0.3, (h - panelBox.height - 56) / h), span = (wantHead ? 0.38 * tall + 0.25 : tall * 1.14) / free;
      dist = Math.max(span / (2 * Math.tan(15 * Math.PI / 180)), (wantHead ? 0.8 : 2) + 0.9) * (wide ? 1 : Math.max(1, 0.62 / (w / (h * free))));
      // the picture is centred in the part of the screen the panel leaves free
      if (wide) camera.setViewOffset(w, h, Math.round(panelBox.width / 2), 0, w, h); else camera.setViewOffset(w, h, 0, Math.round((panelBox.height - 40) / 2), w, h);
      const k = Math.min(1, dt * 6); spin += (yaw - spin) * k;
      pivot.rotation.y = spin;
      camera.position.set(0, lookY + (wantHead ? 0.05 : 0.2), dist); camera.lookAt(0, lookY, 0); camera.updateMatrixWorld();
      actor?.update(dt);
      renderer.render(scene, camera);
    },
  };
  return self;
}
