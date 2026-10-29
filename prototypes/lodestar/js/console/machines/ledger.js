// The Build Ledger (PLAN M3): a rolodex of building cards with their costs stamped on, the stores tally, and the
// inspection card of whatever you tapped on the scope. It PAGES, never scrolls (game standards): three tabs, and the
// rolodex flips a page of cards at a time.
//   CARDS   — one card per building kind; PLACE raises the BUILD switch with that card loaded (the ghost follows the pen).
//   STORES  — what the base holds (and what is being carried), power, carriers, builders.
//   INSPECT — a building's lamps (POWER / INPUT / OUTPUT with the reason), what it makes, its keep-in-stock knob,
//             a depot's "keep here", and PULL DOWN.
// It reads C.econ (kept by main.js from the frames) and sends only §3.3 commands.
import { machinePanel } from './panel.js';
import { createKnob } from '../knob.js';
import { gridRef } from '../view.js';

export const KEEP_STEPS = [0, 25, 50, 100, 200, 400, 800, null];
export const KEEP_LABELS = ['OFF', '25', '50', '100', '200', '400', '800', '∞'];
export const HERE_STEPS = [0, 20, 50, 100, 200, 400];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => (n >= 10000 ? (n / 1000).toFixed(0) + 'k' : String(Math.floor(n)));

/** Plain words for what a building is doing right now (pure; also used by the eye and tests). */
export function statusLine(b, data) {
  const def = data.B[b.type];
  if (!b.built || b.built < 1) {
    const need = Object.entries(b.need || {}).filter(([r, n]) => (b.delivered?.[r] || 0) < n).map(([r, n]) => `${n - (b.delivered?.[r] || 0)} ${data.R[r].name.toLowerCase()}`);
    if (need.length) return `SITE — WAITING FOR ${need.join(', ').toUpperCase()}`;
    return `BUILDING — ${Math.round(100 * Math.min(1, (b.work || 0) / Math.max(1, def.work)))}%`;
  }
  const lit = ['power', 'input', 'output'].filter((k) => b.lamps?.[k]);
  if (lit.length) return `${lit[0].toUpperCase()}: ${String(b.lamps[lit[0]]).toUpperCase()}`;
  if (b.recipe) {
    const r = data.RECIPE[b.recipe];
    if (!b.batch) {
      const [res, n] = Object.entries(b.keep || {})[0] || [];
      if (res && n !== null && n !== undefined) return n === 0 ? 'SWITCHED OFF (KEEP-IN-STOCK OFF)' : `STOCKED — ${n} ${data.R[res].name.toUpperCase()} IN STORE`;
      return 'IDLE';
    }
    return `RUNNING — ${r.name.toUpperCase()}`;
  }
  if (b.type === 'hq') return 'IN SERVICE — SENSOR MAST, MAIN STORE, BUILDERS AND PORTERS';
  if (def.power?.supply) return b.running ? `RUNNING — ${def.power.supply} POWER` : 'STANDING BY (NOTHING NEEDS THE POWER)';
  return 'IN SERVICE';
}

export function mountLedger(C) {
  const { el, body } = machinePanel({ id: 'ledger', title: 'BUILD LEDGER', cls: 'machine-ledger' });
  body.innerHTML = `
    <div class="lg-tabs" role="tablist">
      <button type="button" class="lg-tab" data-tab="cards" role="tab">CARDS</button>
      <button type="button" class="lg-tab" data-tab="stores" role="tab">STORES</button>
      <button type="button" class="lg-tab" data-tab="inspect" role="tab">INSPECT</button>
    </div>
    <div class="lg-page lg-cards" data-page="cards">
      <button type="button" class="lg-flip" data-flip="-1" aria-label="Previous cards">◀</button>
      <div class="lg-rolodex"></div>
      <button type="button" class="lg-flip" data-flip="1" aria-label="Next cards">▶</button>
    </div>
    <div class="lg-page lg-stores" data-page="stores"><div class="lg-tally"></div><div class="lg-needles"></div></div>
    <div class="lg-page lg-inspect" data-page="inspect"></div>`;
  const D = C.econ.data;
  const cards = D.raw.buildings.list.filter((b) => b.id !== 'hq');
  let tab = 'cards', page = 0, per = 3, lastKey = '';
  const rolodex = body.querySelector('.lg-rolodex');
  const tally = body.querySelector('.lg-tally'), needles = body.querySelector('.lg-needles');
  const insp = body.querySelector('[data-page=inspect]');

  function show(t) {
    tab = t; lastKey = '';
    for (const b of body.querySelectorAll('.lg-tab')) { b.classList.toggle('on', b.dataset.tab === t); b.setAttribute('aria-selected', String(b.dataset.tab === t)); }
    for (const p of body.querySelectorAll('.lg-page')) p.hidden = p.dataset.page !== t;
    draw(true);
  }
  for (const b of body.querySelectorAll('.lg-tab')) b.addEventListener('click', () => { C.room.play('press'); show(b.dataset.tab); });
  for (const b of body.querySelectorAll('.lg-flip')) b.addEventListener('click', () => {
    const pages = Math.max(1, Math.ceil(cards.length / per));
    page = (page + +b.dataset.flip + pages) % pages; C.room.play('detent', { step: page, count: pages }); draw(true);
  });

  const costText = (cost) => Object.entries(cost || {}).map(([r, n]) => `${n} ${D.R[r].name.toUpperCase()}`).join(' · ') || 'FREE';

  function cardHtml(def) {
    const hud = C.econ.hud || {};
    const open = (hud.unlocked || []).includes(def.id);
    const node = def.unlock && (hud.research || []).find((n) => n.id === def.unlock);
    const stock = hud.stock || {}, committed = hud.committed || {};
    const short = Object.entries(def.cost || {}).filter(([r, n]) => (stock[r] || 0) - (committed[r] || 0) < n).map(([r]) => D.R[r].name.toUpperCase());
    const sel = C.state.get('buildType') === def.id;
    const m = `${def.size[0] / 2}×${def.size[1] / 2} M`;
    const extras = [def.power?.draw ? `DRAWS ${def.power.draw} POWER` : '', def.power?.supply ? `MAKES ${def.power.supply} POWER` : '', def.ring ? `YARD RING ${def.ring / 2} M` : '', def.sight ? `SIGHT ${def.sight / 2} M` : ''].filter(Boolean).join(' · ');
    const lock = !open ? `<div class="lg-lock">PLANS ARRIVE WITH ${esc(node?.name || 'RESEARCH').toUpperCase()}${node ? ' — ' + node.parts.map((p) => `${fmt(p.have)}/${p.need} ${D.R[p.res].name.toUpperCase()}`).join(', ') : ''}</div>` : '';
    return `<article class="lg-card${open ? '' : ' locked'}${sel ? ' sel' : ''}" data-card="${def.id}">
      <header><b>${esc(def.name.toUpperCase())}</b><i>${m}</i></header>
      <p class="lg-about">${esc(def.about || '')}</p>
      <p class="lg-extra">${esc(extras)}</p>
      <div class="lg-stamp${short.length ? ' short' : ''}" title="${short.length ? 'The stores cannot spare: ' + short.join(', ') : 'Cost'}">${esc(costText(def.cost))}</div>
      ${lock || `<button type="button" class="lg-place" data-place="${def.id}" aria-label="Place ${esc(def.name)}">${sel ? 'LOADED ✓' : 'PLACE'}</button>`}
    </article>`;
  }

  function drawCards() {
    const w = rolodex.clientWidth || 300;
    per = Math.max(1, Math.min(4, Math.floor((w + 8) / 250)));
    const pages = Math.max(1, Math.ceil(cards.length / per));
    if (page >= pages) page = pages - 1;
    rolodex.style.setProperty('--per', per);
    rolodex.innerHTML = cards.slice(page * per, page * per + per).map(cardHtml).join('') + `<span class="lg-pageno">${page + 1}/${pages}</span>`;
    for (const b of rolodex.querySelectorAll('[data-place]')) b.addEventListener('click', () => C.armBuild(b.dataset.place));
  }

  function drawStores() {
    const hud = C.econ.hud || {};
    const stock = hud.stock || {}, carried = hud.carried || {};
    tally.innerHTML = D.raw.resources.list.filter((r) => r.kind !== 'arcane' || stock[r.id]).map((r) => `
      <div class="lg-res" style="--rc:${r.colour}"><i></i><span>${esc(r.short)}</span><b>${fmt(stock[r.id] || 0)}</b>${carried[r.id] ? `<small>+${fmt(carried[r.id])}</small>` : ''}</div>`).join('');
    const p = hud.power || { supply: 0, demand: 0 }, c = hud.crew || {};
    const short = p.demand > p.supply;
    needles.innerHTML = `
      <div class="lg-needle${short ? ' short' : ''}"><span>POWER</span><b>${fmt(p.supply)} / ${fmt(p.demand)}</b></div>
      <div class="lg-needle"><span>PORTERS</span><b>${c.porter?.busy ?? 0} / ${c.porter?.n ?? 0}</b></div>
      <div class="lg-needle"><span>CARTS</span><b>${c.cart?.busy ?? 0} / ${c.cart?.n ?? 0}</b></div>
      <div class="lg-needle"><span>BUILDERS</span><b>${c.builder?.busy ?? 0} / ${c.builder?.n ?? 0}</b></div>
      <div class="lg-needle"><span>SITES</span><b>${hud.sites ?? 0}</b></div>`;
  }

  let keepKnob = null, keepFor = null, armed = false;
  function drawInspect(full) {
    const id = C.state.get('inspect');
    const b = id ? C.econ.buildings.get(id) : null;
    if (!b) { insp.innerHTML = `<p class="lg-empty">TAP A BUILDING ON THE SCOPE (NO SWITCH UP) TO READ ITS CARD HERE.</p>`; keepKnob = null; keepFor = null; return; }
    const def = D.B[b.type];
    if (!def) { insp.innerHTML = `<p class="lg-empty">A PILE OF SALVAGE — THE PORTERS WILL TAKE IT IN.</p>`; return; }
    const lamps = ['power', 'input', 'output'].map((k) => `<span class="lg-lamp${b.lamps?.[k] ? ' lit' : ''}" title="${esc(b.lamps?.[k] || '')}"><i></i>${k.toUpperCase()}</span>`).join('');
    const status = statusLine(b, D);
    // M7: who works or lives here (the town staffs itself — this is a readout, not a control)
    const town = b.beds ? ` · ${b.residents || 0}/${b.beds} LIVE HERE` : b.jobs ? ` · CREW ${b.workers ?? b.jobs}/${b.jobs}` : '';
    const ihead = `<div class="lg-ihead"><b>${esc(def.name.toUpperCase())}</b><i>${gridRef(Math.round(b.fp.cx), Math.round(b.fp.cy))}</i>${lamps}</div>`;
    const head = `${ihead}<div class="lg-status">${esc(status + town)}</div>`;
    if (!full && keepFor === b.id && insp.querySelector('.lg-ihead')) { insp.querySelector('.lg-ihead').outerHTML = ihead; insp.querySelector('.lg-status').textContent = status + town; paintStore(b); return; }
    keepFor = b.id; armed = false;
    const recipes = (def.recipes || []).map((rid) => `<button type="button" class="lg-recipe${b.recipe === rid ? ' on' : ''}" data-recipe="${rid}">${esc(D.RECIPE[rid].name.toUpperCase())}</button>`).join('');
    insp.innerHTML = `${head}<div class="lg-irow">${b.built >= 1 && def.recipes?.length > 1 && !def.autoRecipe ? `<div class="lg-recipes">${recipes}</div>` : ''}<div class="lg-keep"></div><div class="lg-istore"></div>${b.type === 'hq' ? '' : '<button type="button" class="lg-pull" data-pull>PULL DOWN</button>'}</div>`;
    for (const x of insp.querySelectorAll('[data-recipe]')) x.addEventListener('click', () => { C.send({ t: 'setRecipe', id: b.id, recipe: x.dataset.recipe }); C.room.play('press'); });
    insp.querySelector('[data-pull]')?.addEventListener('click', (e) => {
      if (!armed) { armed = true; e.currentTarget.textContent = 'SURE? PRESS AGAIN'; e.currentTarget.classList.add('armed'); C.room.play('press'); return; }
      C.send({ t: 'demolish', id: b.id }); C.room.play('slapdown'); C.state.set('inspect', null);
    });
    const kh = insp.querySelector('.lg-keep');
    keepKnob = null;
    if (b.recipe && b.built >= 1) {
      const [res, n] = Object.entries(b.keep || {})[0] || [];
      const idx = Math.max(0, KEEP_STEPS.indexOf(n === undefined ? null : n));
      keepKnob = createKnob({ name: `KEEP ${D.R[res].name.toUpperCase()} IN STOCK`, id: 'keep', labels: KEEP_LABELS, index: idx < 0 ? 7 : idx, mini: true, sound: (s, o) => C.room.play(s, o),
        onChange: (i) => C.send({ t: 'setKeep', id: b.id, res, n: KEEP_STEPS[i] }) });
      kh.innerHTML = `<span class="lg-klabel">KEEP ${esc(D.RECIPE[b.recipe] ? D.R[res].short : '')}</span>`;
      kh.append(keepKnob.el);
    } else if (def.ring && b.type !== 'hq') {
      const [res, n] = Object.entries(b.keepHere || {})[0] || [D.raw.resources.list[0].id, 0];
      const resKnob = createKnob({ name: 'KEEP HERE: WHICH', id: 'here-res', labels: D.raw.resources.list.map((r) => r.short), index: D.resIndex[res], mini: true, sound: (s, o) => C.room.play(s, o),
        onChange: (i) => { const r = D.raw.resources.list[i].id; C.send({ t: 'setKeep', id: b.id, res: Object.keys(b.keepHere || {})[0] || r, n: 0 }); C.send({ t: 'setKeep', id: b.id, res: r, n: HERE_STEPS[amtKnob.index] }); } });
      const amtKnob = createKnob({ name: 'KEEP HERE: HOW MUCH', id: 'here-n', labels: HERE_STEPS.map(String), index: Math.max(0, HERE_STEPS.indexOf(n)), mini: true, sound: (s, o) => C.room.play(s, o),
        onChange: (i) => C.send({ t: 'setKeep', id: b.id, res: D.raw.resources.list[resKnob.index].id, n: HERE_STEPS[i] }) });
      kh.innerHTML = `<span class="lg-klabel">KEEP HERE</span>`;
      kh.append(resKnob.el, amtKnob.el);
    }
    paintStore(b);
  }
  function paintStore(b) {
    const box = insp.querySelector('.lg-istore'); if (!box) return;
    const items = Object.entries(b.store || {}).filter(([, n]) => n > 0);
    const pool = b.poolHq ? 'SHARES THE HQ STORE' : b.pool && b.store ? `HOLDS ${fmt(items.reduce((a, [, n]) => a + n, 0))}/${b.cap}` : b.pool ? 'SHARES A DEPOT STORE' : '';
    box.innerHTML = `<span>${esc(pool)}</span>${items.slice(0, 4).map(([r, n]) => `<b>${fmt(n)} ${esc(D.R[r].short)}</b>`).join('')}`;
  }

  function draw(full = false) {
    if (el.closest('.drawer')?.hidden || !el.isConnected) return;
    const hud = C.econ.hud || {};
    const key = tab + '|' + JSON.stringify([hud.stock, hud.unlocked?.length, hud.committed, C.state.get('buildType'), page, tab === 'stores' ? [hud.crew, hud.power, hud.carried] : 0]);
    if (tab === 'cards') { if (full || key !== lastKey) drawCards(); }
    else if (tab === 'stores') { if (full || key !== lastKey) drawStores(); }
    else drawInspect(full);
    lastKey = key;
  }
  C.onEcon.push(() => draw(false));
  C.state.on('inspect', () => { if (tab === 'inspect') draw(true); });
  C.state.on('buildType', () => { if (tab === 'cards') draw(true); });
  new ResizeObserver(() => { if (tab === 'cards') draw(true); }).observe(rolodex);
  show('cards');
  return { el, show, get tab() { return tab; }, draw, get page() { return page; } };
}
