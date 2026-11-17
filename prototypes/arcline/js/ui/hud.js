// The city screen's interface: top bar (money, people, next milestone, date, speed, ☰), a row below it (demand meters,
// power, water, alerts), the tool bar with trays of buildings, the info panel for a tapped building, and the budget.
// Top bar holds only what is always there (lessons rule 14); new indicators go on the row below.
import { $, el, btn, sheet, toast } from './dom.js';
import { fmt, pct } from '../../../../shared/format.js';
import { census, demand, monthBudget, nextMilestone, takeLoan, dailyNet, dayProgress, levelUp, designName, DAYS_PER_MONTH } from '../sim/city.js';
import { utilityStatus, demandInfo } from '../sim/advice.js';
import { POWER_REACH, PIPE_REACH } from '../sim/networks.js';
import { item, cat, unlocked, materials, lockText } from '../sim/catalog.js';
import { T, milestones } from '../sim/tuning.js';
import { GROUPS } from './tools.js';
import { moveProblem, moveFee } from '../sim/build.js';
import { priceOf } from '../sim/arms.js';
import { decorateCard } from './builder.js';
import { progress as researchProgress, TECH_BY_ID } from '../sim/research.js';

const MONTHS = ['Dawnmonth', 'Bloom', 'Highsun', 'Glow', 'Drift', 'Harvest', 'Duskfall', 'Frost', 'Deepnight', 'Thaw', 'Spark', 'Turn'];
const MAT_NAME = { metal: 'Metal', stone: 'Stone', crystal: 'Crystal', steel: 'Steel', concrete: 'Concrete', cells: 'Power cells' };
export const money = n => `${n < 0 ? '−' : ''}¢${fmt(Math.abs(Math.round(n)))}`;
/** A daily amount: whole credits from 100 up, one decimal below (a wall's upkeep is ¢0.02 a day; never show "¢0"). */
export const perDay = n => { const a = Math.abs(n), d = a >= 100 ? 0 : a >= 1 ? 1 : 2; return `${n < 0 ? '−' : ''}¢${fmt(Math.round(a * 10 ** d) / 10 ** d, { decimals: d })}`; };
export function dateText(day) { const d = Math.floor(day), y = Math.floor(d / 360) + 1, m = Math.floor((d % 360) / 30), dd = (d % 30) + 1; return `${dd} ${MONTHS[m]}, Year ${y}`; }

export function buildHud(game) {
  const root = $('#city');
  root.querySelector('.hud')?.remove();
  const hud = el('div', { class: 'hud' });
  hud.innerHTML = `
    <header class="ac-top">
      <button type="button" class="ac-menubtn" data-tip="Menu (Esc)" aria-label="Menu">☰</button>
      <button type="button" class="ac-money" data-tip-render="payday"><span class="lbl">Credits</span><b id="h-money">—</b><small id="h-net"></small><span class="ac-daybar phone" aria-hidden="true"><i></i></span></button>
      <div class="ac-people" data-tip-render="people"><span class="lbl">People</span><b id="h-people">0</b><small id="h-wait"></small></div>
      <div class="ac-date" data-tip-render="payday"><span class="lbl" id="h-region">—</span><b id="h-date">—</b><span class="ac-daybar" role="progressbar" aria-label="Today, until the next pay day" aria-valuemin="0" aria-valuemax="100"><i></i></span></div>
      <div class="ac-speed seg" role="group" aria-label="Game speed">
        <button type="button" data-speed="0" data-tip="Pause (Space)">❚❚</button><button type="button" data-speed="1" class="on" data-tip="Normal speed (1)">1×</button><button type="button" data-speed="2" data-tip="Fast (2)">2×</button><button type="button" data-speed="4" data-tip="Fastest (3)">4×</button>
      </div>
    </header>
    <div class="ac-row2">
      <button type="button" class="ac-demand" id="h-demand" data-tip="What the city wants next: homes, shops and offices, industry. Tap for why." aria-label="Demand: homes, shops, industry">
        <span class="dm r"><i></i><em>R</em></span><span class="dm c"><i></i><em>C</em></span><span class="dm i"><i></i><em>I</em></span>
      </button>
      <button type="button" class="ac-chip" id="h-power" data-tip="Power made / used. Tap for details." aria-label="Power"><i></i> <b>—</b></button>
      <button type="button" class="ac-chip" id="h-water" data-tip="Water pumped / used. Tap for details." aria-label="Water"><i></i> <b>—</b></button>
      <div class="ac-mile" data-tip-render="milestone"><span id="h-mile-label">Next milestone</span><div class="bar"><i id="h-mile"></i></div></div>
      <button type="button" class="ac-commsbtn" id="h-comms" data-tip="Comms: ships overhead, the timetable, call a ship (C)">Comms <b hidden>0</b></button>
      <button type="button" class="ac-strikebtn" id="h-strike" hidden data-tip="Aim an orbital strike (F)">Orbital strike <b>0</b></button>
      <div class="ac-stock" id="h-stock" data-tip="Materials in store"></div>
      <div class="ac-alert" id="h-alert" hidden></div>
    </div>
    <div class="ac-sky" id="h-sky" aria-label="Ships overhead"></div>
    <aside class="ac-info" id="h-info" hidden></aside>
    <div class="ac-tray" id="h-tray" hidden></div>
    <div class="ac-toolchip" id="h-tool" hidden></div>
    <nav class="ac-tools" id="h-tools" aria-label="Build"></nav>
    <div class="ac-overlays seg" id="h-overlays" role="group" aria-label="Map views"></div>`;
  root.append(hud);
  // drawn glyphs, not emoji (one icon style per game, lessons 17)
  $('#h-power').firstChild.replaceWith(glyph('bolt')); $('#h-water').firstChild.replaceWith(glyph('drop'));

  // tool groups: a drawn icon over a short name; on a phone the row scrolls sideways with arrows + fades at the ends
  // that show only while there is more that way (owner 2026-11-17: "Refine the bottom menu on mobile")
  const tools = $('#h-tools'), tabs = el('div', { class: 'ac-tabs', role: 'toolbar', 'aria-label': 'Build' });
  for (const g of GROUPS) {
    const b = btn('', () => (g.action ? game[g.action]?.() : openTray(game, g.id)), 'ac-group', { 'data-group': g.id, 'aria-label': g.name, 'data-tip': g.key ? `${g.name} (${g.key})` : g.name });
    b.append(tabGlyph(g.id), el('span', { class: 'gl' }, g.name), el('span', { class: 'gs' }, g.short || g.name));   // gs = the phone's shorter name
    if (g.id === 'research') b.append(el('i', { class: 'ac-rdbar', 'aria-hidden': 'true' }, el('b')));
    tabs.append(b);
  }
  const arrow = (dir, label) => btn(dir < 0 ? '‹' : '›', () => tabs.scrollBy({ left: dir * tabs.clientWidth * 0.8, behavior: 'smooth' }), `ac-tabarrow ${dir < 0 ? 'l' : 'r'}`, { 'aria-label': label, tabindex: '-1' });
  tools.append(tabs, arrow(-1, 'More tabs to the left'), arrow(1, 'More tabs to the right'));
  const ends = () => { const m = tabs.scrollWidth - tabs.clientWidth; tools.classList.toggle('more-l', tabs.scrollLeft > 4); tools.classList.toggle('more-r', tabs.scrollLeft < m - 4); };
  tabs.addEventListener('scroll', ends, { passive: true }); new ResizeObserver(ends).observe(tabs); ends();
  // overlays: a column on a desktop; on a phone one "View" button that opens the list (it used to be a full row that
  // ran off the screen under the tool chip)
  const ov = $('#h-overlays');
  const viewBtn = btn('', () => ov.classList.toggle('open'), 'ac-viewbtn', { 'aria-label': 'Map view', 'aria-haspopup': 'true' });
  viewBtn.append(el('span', { class: 'lbl' }, 'View'), el('b', {}, 'City'));
  ov.append(viewBtn);
  for (const [id, label] of [[null, 'City'], ['pipes', 'Underground'], ['power', 'Power'], ['value', 'Land value'], ['traffic', 'Traffic']]) ov.append(btn(label, () => { game.setOverlay(id); ov.classList.remove('open'); viewBtn.querySelector('b').textContent = label; }, id === null ? 'on' : '', { 'data-overlay': id ?? '' }));
  hud.querySelector(".ac-menubtn").addEventListener('click', () => game.openMenu());
  hud.querySelector('.ac-money').addEventListener('click', () => budgetSheet(game));
  hud.querySelector('#h-strike').addEventListener('click', () => game.armStrike());
  hud.querySelector('#h-comms').addEventListener('click', () => game.openComms());
  hud.querySelector('#h-demand').addEventListener('click', () => demandSheet(game));
  hud.querySelector('#h-power').addEventListener('click', () => utilitySheet(game, 'power'));
  hud.querySelector('#h-water').addEventListener('click', () => utilitySheet(game, 'water'));
  game._util = {};   // last warning level per utility (a toast only when it changes)
  hud.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => game.setSpeed(+b.dataset.speed)));
  return hud;
}

/** The tab icons (one drawn style, lessons 17): 16×16, currentColor. */
const TAB_ICONS = {
  roads: '<path d="M5 1 2 15M11 1l3 14" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 2v2.5M8 7v2.5M8 12v2" stroke="currentColor" stroke-width="1.4"/>',
  zones: '<rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" fill="#56d678"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1" fill="#50a0ff"/><rect x="1.5" y="9" width="13" height="5.5" rx="1" fill="#ffbe46"/>',
  utilities: '<path d="M6 1 2 8h3l-1 6 4-7H5z" fill="currentColor"/><path d="M12 5c-1.4 2.6-3 4-3 6a3 3 0 0 0 6 0c0-2-1.6-3.4-3-6z" fill="currentColor" opacity=".75"/>',
  services: '<path d="M8 1.5 1.5 6v1.5h13V6zM3 8.5h2v4.5H3zm4 0h2v4.5H7zm4 0h2v4.5h-2zM1.5 14h13v1.5h-13z" fill="currentColor"/>',
  parks: '<circle cx="8" cy="6" r="4.6" fill="currentColor"/><path d="M7.2 9h1.6v6H7.2z" fill="currentColor"/><path d="M2 15h12" stroke="currentColor" stroke-width="1.4"/>',
  industry: '<path d="M1.5 15V7l4 2.5V7l4 2.5V3h3v12z" fill="currentColor"/>',
  defence: '<path d="M8 1 2 3.5v4.2C2 11.4 4.6 14 8 15c3.4-1 6-3.6 6-7.3V3.5z" fill="currentColor"/>',
  transit: '<rect x="3" y="1.5" width="10" height="10" rx="2.5" fill="currentColor"/><path d="M4 15l2-3m6 3-2-3" stroke="currentColor" stroke-width="1.4"/><rect x="4.6" y="3.5" width="6.8" height="3.4" rx="1" fill="#0b1220"/>',
  colony: '<path d="M8 1 13 8H3z" fill="currentColor"/><path d="M5 9h6v6H5z" fill="currentColor"/><path d="M8 1v-1" stroke="currentColor"/>',
  landmarks: '<path d="M7 1h2l1.4 14H5.6z" fill="currentColor"/><path d="M3 15h10" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="1.5" r="1.2" fill="currentColor"/>',
  research: '<path d="M6 1.5h4M7 1.5v4.2L2.6 13a1.2 1.2 0 0 0 1 1.8h8.8a1.2 1.2 0 0 0 1-1.8L9 5.7V1.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M4.4 10.5h7.2l1.2 2.6H3.2z" fill="currentColor"/>',
  tools: '<path d="M10.5 1.5a3.5 3.5 0 0 0-3.3 4.6L1.8 11.5a1.3 1.3 0 0 0 1.8 1.8L9 7.9a3.5 3.5 0 0 0 4.6-3.3l-2 1-1.5-1.5 1-2z" fill="currentColor"/>',
};
export function tabGlyph(id) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 16 16'); s.setAttribute('class', 'gi'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = TAB_ICONS[id] || '<circle cx="8" cy="8" r="5" fill="currentColor"/>'; return s;
}
export function glyph(kind) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 16 16'); s.setAttribute('class', 'gly'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = kind === 'bolt' ? '<path d="M9 1 3 9h4l-1 6 6-8H8z" fill="currentColor"/>' : kind === 'drop' ? '<path d="M8 1C6 5 3 7.5 3 10.5a5 5 0 0 0 10 0C13 7.5 10 5 8 1z" fill="currentColor"/>' : '<circle cx="8" cy="8" r="6" fill="currentColor"/>';
  return s;
}

/** Refresh numbers (called a few times a second). */
export function updateHud(game) {
  const r = game.r; if (!r || !$('#h-money')) return;
  const c = census(r), dm = demand(r);
  // phones: big balances shortened so the speed buttons stay on screen (360 px, owner rule 14) — the tip has the exact sum
  const narrow = innerWidth < 480, m = Math.round(r.money);
  $('#h-money').textContent = narrow && Math.abs(m) >= 1e6 ? `¢${(m / 1e6).toFixed(2)}M` : narrow && Math.abs(m) >= 1e5 ? `¢${Math.round(m / 1e3)}k` : money(r.money);
  // what the next pay day adds (money is paid once a game day — owner #85: "income per day")
  const net = r.budget ? dailyNet(r, r.budget) : 0;
  $('#h-net').textContent = `${net >= 0 ? '+' : ''}${perDay(net)}/day`; $('#h-net').className = net >= 0 ? 'good' : 'bad';
  const dp = Math.round(dayProgress(r) * 100);
  for (const b of document.querySelectorAll('.ac-daybar')) { b.firstChild.style.width = `${dp}%`; b.setAttribute('aria-valuenow', dp); }
  $('#h-people').textContent = fmt(r.people.total);
  $('#h-wait').textContent = r.people.arriving > 0 ? `+${fmt(r.people.arriving)} need homes` : '';
  $('#h-date').textContent = dateText(r.day); $('#h-region').textContent = r.name;
  for (const [k, cls] of [['R', 'r'], ['C', 'c'], ['I', 'i']]) { const v = dm[k], i = $(`.dm.${cls} i`); i.style.height = `${Math.round(Math.abs(v) * 100) / 2}%`; i.style.bottom = v >= 0 ? '50%' : `${50 - Math.abs(v) * 50}%`; i.className = v >= 0 ? 'up' : 'down'; }
  const pw = r.power || { supply: 0, demand: 0, share: 1 }, wt = r.waterNet || { supply: 0, demand: 0, share: 1 };
  $('#h-power b').textContent = `${fmt(Math.round(pw.supply))} / ${fmt(Math.round(pw.demand))}`;
  $('#h-water b').textContent = `${fmt(Math.round(wt.supply))} / ${fmt(Math.round(wt.demand))}`;
  utilityWarnings(game);
  const next = nextMilestone(r), ms = milestones(), prev = r.milestone ? ms[r.milestone - 1] : 0;
  $('#h-mile-label').textContent = next ? `Milestone ${r.milestone + 1}: ${fmt(next)} people` : 'Every milestone reached';
  $('#h-mile').style.width = next ? `${Math.max(2, Math.min(100, (r.people.total - prev) / (next - prev) * 100))}%` : '100%';
  const st = Object.entries(r.stock).filter(([, v]) => v >= 1).map(([k, v]) => `${MAT_NAME[k]} ${fmt(Math.floor(v))}`);
  $('#h-stock').textContent = st.join(' · '); $('#h-stock').hidden = !st.length;
  document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', +b.dataset.speed === game.speed));
  const alert = game.alertText?.(); const a = $('#h-alert'); a.hidden = !alert; if (alert) a.textContent = alert;
  // the R&D tab shows the research under way as a thin bar (and its name in the tip)
  const rdTab = document.querySelector('.ac-group[data-group="research"]');
  if (rdTab) { const a = r.research?.active, k = a ? researchProgress(r) : 0; rdTab.classList.toggle('busy', !!a); rdTab.querySelector('.ac-rdbar b').style.width = `${Math.round(k * 100)}%`; rdTab.dataset.tip = a ? `R&D (T): researching ${TECH_BY_ID[a.id]?.name}, ${Math.round(k * 100)}%` : 'R&D (T): research upgrades and new buildings'; }
  const ov = r.ships?.passing?.length || 0, cb = $('#h-comms b'); if (cb) { cb.hidden = !ov; cb.textContent = fmt(ov); }
  // the ships strip sits just under the second row, however many lines that row wraps to (phones: two or three)
  const row2 = $('.ac-row2'), sky = $('#h-sky'), topBar = $('.ac-top');
  // the second row starts under the top bar however tall it grows (three-line Credits, big text, narrow screens):
  // a fixed 64px let the bar cover R/C/I, Power and Water (owner report 2026-11-16)
  if (row2 && topBar && !topBar._watch) {
    const place = () => { const t = Math.round(topBar.getBoundingClientRect().bottom + 6); if (row2._top !== t) { row2._top = t; row2.style.top = `${t}px`; } };
    topBar._watch = new ResizeObserver(place); topBar._watch.observe(topBar); place();
  }
  if (row2 && sky) {
    const top = Math.round(row2.getBoundingClientRect().bottom + 6); if (sky._top !== top) { sky._top = top; sky.style.top = `${top}px`; }
    const below = sky.childElementCount ? Math.round(sky.getBoundingClientRect().bottom + 6) : top;   // toasts go under both
    if (game._hudBottom !== below) { game._hudBottom = below; document.documentElement.style.setProperty('--hud-bottom', `${below}px`); document.documentElement.classList.add('ac-in-city'); }
  }
  updateMoveButton(game);
}
/** The info panel's Move button counts down its free minute. */
function updateMoveButton(game) {
  const b = $('#h-move'), lot = game.selected; if (!b || !lot) return;
  const f = moveFee(lot);
  b.querySelector('small').textContent = f.free ? `Free for ${fmt(f.secondsLeft)} s` : f.cost ? money(f.cost) : 'Free';
}

// ---------------- trays (pick a building) ----------------
export function openTray(game, groupId) {
  const tray = $('#h-tray'); const same = tray.dataset.group === groupId && !tray.hidden;
  document.querySelectorAll('.ac-group').forEach(b => b.classList.toggle('on', !same && b.dataset.group === groupId));
  if (same) { tray.hidden = true; tray.dataset.group = ''; return; }
  tray.dataset.group = groupId; tray.hidden = false; tray.replaceChildren();
  const defs = game.tools;
  for (const [id, t] of Object.entries(defs)) {
    if (t.group !== groupId) continue;
    const e = t.entry, open = !e || unlocked(game.r, e);
    const mats = e ? materials(e) : {};
    const perTile = t.level || t.transit || t.wall || t.layer;
    const price = e?.cost != null ? money(priceOf(game.r, e)) + (perTile ? ' a tile' : '') + (Object.keys(mats).length ? ' + ' + Object.entries(mats).map(([k, v]) => `${v} ${MAT_NAME[k]}`).join(', ') : '') : '';
    const lock = open ? null : lockText(game.r, e);
    // a locked card says why; one R&D opens (a new park, or plans ahead of a milestone) opens R&D at that tech
    const card = btn('', () => { if (!open) { if (lock?.tech && game.openResearch) { tray.hidden = true; document.querySelectorAll('.ac-group').forEach(b => b.classList.remove('on')); game.openResearch(lock.tech); return; } toast(`${t.name}: ${lock?.text || 'locked'}`); return; } if (t.action) game[t.action](); else game.setTool(id); tray.hidden = true; document.querySelectorAll('.ac-group').forEach(b => b.classList.remove('on')); }, 'ac-tcard' + (open ? '' : ' locked'), { 'data-tool': id });
    const thumb = el('canvas', { class: 'thumb', width: 96, height: 72 });
    card.append(thumb, el('span', { class: 'nm' }, t.name), el('span', { class: 'pr' }, open ? price : lock?.short || 'Locked'));
    if (lock?.short === 'R&D') card.classList.add('rd');
    if (e?.blurb) card.dataset.tip = e.blurb + (open ? '' : ` ${lock?.text || ''}`);
    decorateCard(game, card, id, t);   // Mk name, key numbers on the card, the full stat card on hover/focus (#78, #81)
    tray.append(card);
    game.thumb(thumb, t);
  }
}

// ---------------- info panel ----------------
export function showInfo(game, lot) {
  const box = $('#h-info'); if (!lot) { box.hidden = true; return; }
  const e = item(lot.id), r = game.r;
  const name = e?.name || zoneName(lot);
  const rows = [];
  if (lot.people) rows.push(['Homes', fmt(lot.people)]);
  if (lot.jobs) rows.push(['Jobs', fmt(lot.jobs)]);
  if (lot.params?.floors) rows.push(['Storeys', fmt(lot.params.floors)]);
  if ((lot.power ?? 0) > 0) rows.push(['Power made', fmt(lot.power)]); else if (lot.power) rows.push(['Power', (lot.powered ?? 0) >= 1 ? 'Connected' : (lot.powered ?? 0) > 0 ? `Short: ${pct(lot.powered)}` : 'Not connected']);
  if ((lot.water ?? 0) > 0) rows.push(['Water pumped', fmt(lot.water)]); else if (lot.kind === 'zoned') rows.push(['Water', lot.wet ? 'Connected' : 'None nearby']);
  const up = lot.kind === 'placed' ? (item(lot.id)?.upkeep ?? lot.upkeep) : lot.upkeep;
  if (up) rows.push(['Upkeep', `${perDay(up / DAYS_PER_MONTH)} a day`]);
  if (lot.value != null) rows.push(['Land value', pct(lot.value)]);
  if (lot.dry) rows.push(['Deposit', 'Used up — build on a new one']);
  if (lot.starved) rows.push(['Refinery', 'Waiting for raw material']);
  const canMove = !moveProblem(lot);
  const moveBtn = canMove ? btn('', () => game.startMove(lot), 'small ac-movebtn', { id: 'h-move', 'data-tip': 'Pick it up and set it down somewhere else: free for a minute after you build it, then 10% of its price.' }) : null;
  moveBtn?.append(el('span', {}, 'Move'), el('small', {}, ''));
  const comms = e?.comms ? btn('Open comms', () => game.openComms(), 'primary small') : null;
  box.replaceChildren(el('h3', {}, name), el('p', { class: 'dim' }, e?.blurb || zoneBlurb(lot)), el('dl', {}, ...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])),
    ...(lot.kind === 'zoned' ? [levelBox(r, lot)] : []),
    ...(comms ? [el('div', { class: 'row wide' }, comms)] : []),
    el('div', { class: 'row' }, moveBtn, lot.id !== 'col-core' ? btn('Bulldoze', () => { game.bulldozeLot(lot); }, 'danger small') : null, btn('Close', () => { box.hidden = true; game.selected = null; }, 'small')));
  box.hidden = false;
  updateMoveButton(game);
}
const zoneName = l => designName(l);   // the growth table's name for its size + level (catalog.json zones)
const zoneBlurb = l => l.zone === 'R' ? 'Homes for the people who land here.' : l.zone === 'C' ? 'Shops and offices: jobs, and somewhere to spend.' : 'Workshops and depots: jobs for your workers.';

// ---------------- budget ----------------
export function budgetSheet(game) {
  const r = game.r;
  sheet('Budget', (m, close) => {
    const draw = () => {
      const b = monthBudget(r);
      m.querySelector('.bud')?.remove();
      const box = el('div', { class: 'bud' });
      const tax = z => {
        const out = el('b', {}, pct(r.taxes[z], 1));
        const s = el('input', { type: 'range', min: 0, max: 0.2, step: 0.005, value: r.taxes[z], 'aria-label': `${z} tax`, oninput: e => { r.taxes[z] = +e.target.value; out.textContent = pct(r.taxes[z], 1); draw(); } });
        return el('label', { class: 'taxrow' }, el('span', {}, { R: 'Homes', C: 'Shops & offices', I: 'Industry' }[z]), s, out);
      };
      box.append(el('h3', {}, 'Taxes'), el('p', { class: 'dim' }, 'Above 9% slows growth in that zone.'), tax('R'), tax('C'), tax('I'));
      const line = (k, v, cls = '') => el('div', { class: 'bl ' + cls }, el('span', {}, k), el('b', {}, money(v)));
      // per day: money is paid once a game day (owner #85), so the sheet shows what each pay day brings
      const D = DAYS_PER_MONTH, dayLine = (k, v, cls = '') => el('div', { class: 'bl ' + cls }, el('span', {}, k), el('b', {}, perDay(v / D)));
      const daily = dailyNet(r, b);
      box.append(el('h3', {}, 'Each day'), el('p', { class: 'dim' }, `Paid every game day (${fmt(T.dayLengthSec || 6)} s at normal speed).`),
        dayLine('Homes tax', b.income.R), dayLine('Shops & offices tax', b.income.C), dayLine('Industry tax', b.income.I), ...(b.income.grant ? [dayLine('Colony grant (fades as you grow)', b.income.grant)] : []),
        dayLine('Buildings upkeep', -b.upkeep.buildings), dayLine('Roads', -b.upkeep.roads), dayLine('Walls', -b.upkeep.walls), dayLine('Turrets', -b.upkeep.turrets), ...(b.upkeep.transit ? [dayLine('Transit', -b.upkeep.transit)] : []), ...(b.upkeep.policies ? [dayLine('Policies (R&D)', -b.upkeep.policies)] : []), dayLine('Loans', -b.upkeep.loans),
        el('div', { class: 'bl ' + (daily >= 0 ? 'good total' : 'bad total') }, el('span', {}, r.shutdown ? 'Balance (broke: upkeep unpaid)' : 'Balance'), el('b', {}, perDay(daily))));
      box.append(el('h3', {}, 'Loans'), el('p', { class: 'dim' }, r.loans.length ? r.loans.map(l => `${money(l.amount)}, ${l.left} months left`).join(' · ') : 'No loans.'),
        btn(`Take a loan of ${money(T.loanSize)}`, () => { if (takeLoan(r)) { toast(`Loan of ${money(T.loanSize)} taken.`, 'good'); draw(); } else toast('Three loans at once is the limit.', 'bad'); }, '', { disabled: r.loans.length >= 3 || null }));
      if (r.shutdown) box.append(el('p', { class: 'bad' }, 'The city is broke: upkeep is not being paid and services are off until the balance recovers.'));
      m.insertBefore(box, m.querySelector('.done'));
    };
    m.append(btn('Done', close, 'primary done'));
    draw();
  });
}

// ---------------- level up (owner report #84) ----------------
/** The info panel's "next level" box: a bar with the % and each need in plain words (green = met). */
function levelBox(r, lot) {
  const u = levelUp(r, lot);
  if (u.top) return el('div', { class: 'ac-level top' }, el('div', { class: 'hd' }, el('span', {}, `Level ${lot.tier}`), el('b', {}, 'Top level')));
  const pc = Math.round(u.progress * 100);
  return el('div', { class: 'ac-level' + (u.ready ? ' ready' : '') },
    el('div', { class: 'hd' }, el('span', {}, u.title), el('b', {}, `${pc}%`)),
    el('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': pc, 'aria-valuemin': 0, 'aria-valuemax': 100 }, el('i', { style: `width:${Math.max(2, pc)}%` })),
    u.ready ? el('p', { class: 'ok' }, u.kind === 'combine' ? 'Ready: it will combine with its plot soon.' : 'Ready: it will rebuild taller soon.') : null,
    el('ul', {}, ...u.needs.filter(n => !n.ok).concat(u.needs.filter(n => n.ok)).map(n => el('li', { class: n.ok ? 'ok' : 'no' }, el('span', { class: 'l' }, n.text), el('span', { class: 's' }, n.short)))));
}

// ---------------- power / water warnings + the pill sheets (owner report #80) ----------------
const UTIL = { power: { name: 'Power', unit: 'power', make: 'made', id: '#h-power', near: 'Power is nearly used up: build another Fusion Plant soon.', over: 'Not enough power: some buildings are switching off.' },
  water: { name: 'Water', unit: 'water', make: 'pumped', id: '#h-water', near: 'Water is nearly used up: build another Water Pump soon.', over: 'Not enough water: some buildings are going dry.' } };
/** Pills turn amber near the limit and red over it, with one toast each time the level gets worse. */
function utilityWarnings(game) {
  for (const kind of ['power', 'water']) {
    const st = utilityStatus(game.r, kind), b = $(UTIL[kind].id); if (!b) continue;
    b.classList.toggle('near', st.level === 'near'); b.classList.toggle('bad', st.level === 'over');
    const was = game._util?.[kind];
    if (game._util && was !== undefined && rank(st.level) > rank(was)) toast(UTIL[kind][st.level], st.level === 'over' ? 'bad' : '');
    if (game._util) game._util[kind] = st.level;
  }
}
const rank = l => ({ none: 0, ok: 0, near: 1, over: 2 }[l] ?? 0);
export function utilitySheet(game, kind) {
  const U = UTIL[kind];
  sheet(U.name, (m, close) => {
    const st = utilityStatus(game.r, kind), pc = st.supply > 0 ? Math.round(st.use / st.supply * 100) : (st.use ? 100 : 0);
    const head = st.level === 'over' ? `Using more ${U.unit} than you make: ${fmt(Math.round(-st.spare))} short.` : st.level === 'near' ? `Nearly at the limit: ${fmt(Math.round(st.spare))} spare.` : st.level === 'none' ? `No ${U.unit} yet.` : `${fmt(Math.round(st.spare))} spare.`;
    m.classList.add('ac-util', 'lv-' + st.level);
    m.append(el('p', { class: 'ac-util-head' }, head),
      el('div', { class: 'ac-meter' }, el('div', { class: 'bar' }, el('i', { style: `width:${Math.min(100, pc)}%` })), el('div', { class: 'nums' }, el('span', {}, `${fmt(Math.round(st.use))} used`), el('span', {}, `${pc}%`), el('span', {}, `${fmt(Math.round(st.supply))} ${U.make}`))));
    if (st.cutCount || st.turretsOff) {
      m.append(el('h3', {}, kind === 'power' ? 'Without full power' : 'Without full water'));
      const items = st.cut.map(c => el('li', {}, el('b', {}, c.count > 1 ? `${c.name} ×${fmt(c.count)}` : c.name), ` — ${c.why}`));
      if (st.cutLines > st.cut.length) items.push(el('li', { class: 'dim' }, `and ${fmt(st.cutCount - st.cut.reduce((a, c) => a + c.count, 0))} more`));
      if (st.turretsOff) items.push(el('li', {}, el('b', {}, `${fmt(st.turretsOff)} turret${st.turretsOff > 1 ? 's' : ''}`), ' — short of power: they fire slower or not at all'));
      m.append(el('ul', { class: 'shiplines' }, ...items));
    }
    m.append(el('h3', {}, 'To get more'));
    m.append(el('ul', { class: 'shiplines' }, ...st.builds.map(b => el('li', { class: b.open ? '' : 'dim' }, el('b', {}, b.name), ` — ${U.make === 'made' ? 'makes' : 'pumps'} ${fmt(b.makes)}, costs ${money(b.cost)}${b.open ? '' : ` (milestone ${b.unlock})`}`)),
      el('li', {}, kind === 'power' ? `Power travels along roads, lines, walls and buildings: anything more than ${POWER_REACH} tiles from them gets none.` : `Pipes carry water from a powered pump: buildings within ${PIPE_REACH} tiles of a pipe get it.`)));
    const row = el('div', { class: 'row' }, btn(kind === 'power' ? 'Show the power map' : 'Show the pipes', () => { close(); game.setOverlay?.(kind === 'power' ? 'power' : 'pipes'); }), btn('Done', close, 'primary'));
    m.append(row);
  });
}
export function demandSheet(game) {
  sheet('Demand', (m, close) => {
    const info = demandInfo(game.r);
    m.classList.add('ac-util');
    m.append(el('p', { class: 'dim' }, 'Zoned land grows when the city wants it. A full bar up means build more of it now.'));
    for (const z of ['R', 'C', 'I']) {
      const d = info[z], pc = Math.round(d.value * 100);
      m.append(el('div', { class: 'ac-dem ' + z.toLowerCase() },
        el('div', { class: 'hd' }, el('b', {}, d.name), el('span', { class: pc > 2 ? 'up' : pc < -2 ? 'down' : '' }, pc > 2 ? `wants more (${pc}%)` : pc < -2 ? `has too much (${pc}%)` : 'balanced')),
        el('div', { class: 'bar two' }, el('i', { style: pc >= 0 ? `left:50%;width:${pc / 2}%` : `right:50%;width:${-pc / 2}%` })),
        el('small', {}, `${fmt(d.have)} now · the city wants about ${fmt(d.want)} (${z === 'R' ? 'homes' : 'jobs'})`),
        el('ul', {}, ...d.reasons.map(t => el('li', {}, t)))));
    }
    m.append(btn('Done', close, 'primary'));
  });
}

export { MAT_NAME, MONTHS };
