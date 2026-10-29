// The desk: one layout of machines that CSS arranges three ways (desktop desk, phone portrait stack, phone
// landscape). Same DOM everywhere — on a phone the machines that do not fit sit in ONE fixed-height drawer that pages
// (TOOLS · DIALS · TIME · LOG · MORE), never scrolls.
//
// The console grows (PLAN M2): data/console.json lists every machine; the ones not yet earned sit in the drawer bay as
// RESERVED plates under their group (FRONT / LOGISTICS / ARCANE / SPACE). A machineUnlocked event drops a crate down
// the freight lift and bolts the machine in.
import { MACHINES } from './machines/index.js';
import { machinePanel } from './machines/panel.js';
import { mountMenu } from './machines/menu.js';

export const PHONE_PAGES = [
  { id: 'tools', label: 'TOOLS' }, { id: 'dials', label: 'DIALS' }, { id: 'time', label: 'TIME' },
  { id: 'log', label: 'LOG' }, { id: 'more', label: 'MORE' },
];

export async function mountDesk(C, root) {
  const desk = document.createElement('main');
  desk.className = 'desk'; desk.dataset.page = 'tools';
  desk.innerHTML = `<div class="desk-lamp" aria-hidden="true"></div>`;
  root.append(desk);
  const M = {};
  const mount = async id => { const f = MACHINES[id]; if (!f) return null; const fn = await f(); return fn(C); };

  // order = reading order for the controller and for screen readers
  M.alarms = await mount('alarms');
  M.dayclock = await mount('dayclock');
  M.menu = mountMenu(C);
  C.scope = M.scope = await mount('scope');
  M.teletype = await mount('teletype');
  C.print = l => M.teletype.print(l);
  M.radio = await mount('radio');
  M.toolbank = await mount('toolbank');
  M.range = await mount('range');
  M.filter = await mount('filter');
  M.timedial = await mount('timedial');

  const top = document.createElement('div'); top.className = 'topright';
  top.append(M.dayclock.el, M.menu.el);
  const page = (id, ...els) => { const p = document.createElement('div'); p.className = 'page'; p.dataset.page = id; p.append(...els); return p; };

  // the drawer bay: grouped RESERVED plates / handles, one group a page
  const bay = machinePanel({ id: 'bay', title: 'DRAWER BAY' });
  bay.body.innerHTML = `<div class="bay-tabs" role="tablist"></div><div class="bay-slots"></div>`;
  const tabs = bay.body.querySelector('.bay-tabs'), slots = bay.body.querySelector('.bay-slots');
  let group = 'front';
  const machines = C.data.machines;
  const unlocked = new Set(machines.filter(m => m.unlock === 'start').map(m => m.id));
  for (const g of C.data.groups) {
    const t = document.createElement('button');
    t.type = 'button'; t.className = 'bay-tab'; t.dataset.group = g.id; t.setAttribute('role', 'tab'); t.textContent = g.label;
    t.addEventListener('click', () => showGroup(g.id, true));
    tabs.append(t);
  }
  function showGroup(g, byHand) {
    if (byHand && g !== group) C.room.play('lift');
    group = g;
    for (const t of tabs.children) { t.classList.toggle('on', t.dataset.group === g); t.setAttribute('aria-selected', String(t.dataset.group === g)); }
    slots.innerHTML = '';
    for (const m of machines.filter(x => x.place === 'drawer' && x.group === g)) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `bay-slot${unlocked.has(m.id) ? ' live' : ' reserved'}`; b.dataset.slot = m.id;
      b.innerHTML = unlocked.has(m.id)
        ? `<span class="slot-pull"></span><span class="slot-name">${m.name.toUpperCase()}</span><span class="slot-lamp"></span>`
        : `<span class="slot-screw l"></span><span class="slot-stencil">RESERVED</span><span class="slot-name">${m.name.toUpperCase()}</span><span class="slot-screw r"></span>`;
      b.setAttribute('aria-label', unlocked.has(m.id) ? `Open ${m.name}` : `${m.name}: reserved, arrives ${m.arrives}`);
      b.addEventListener('click', () => openDrawer(m.id));
      slots.append(b);
    }
  }
  showGroup('front');

  // the open drawer: slides up over the bottom of the scope (desktop) / fills the drawer (phone)
  const drawer = document.createElement('section');
  drawer.className = 'drawer'; drawer.hidden = true; drawer.setAttribute('aria-label', 'Open drawer');
  drawer.innerHTML = `<header class="drawer-head"><span class="drawer-group"></span><span class="drawer-name"></span><button type="button" class="drawer-close" aria-label="Close drawer">CLOSE ▾</button></header><div class="drawer-body"></div>`;
  drawer.querySelector('.drawer-close').addEventListener('click', () => closeDrawer());
  const drawerMachines = new Map();
  async function openDrawer(id) {
    const m = machines.find(x => x.id === id); if (!m) return;
    const g = C.data.groups.find(x => x.id === m.group);
    C.room.play('lift'); C.room.play('press');
    drawer.querySelector('.drawer-group').textContent = g.label;
    drawer.querySelector('.drawer-name').textContent = m.name.toUpperCase();
    const body = drawer.querySelector('.drawer-body'); body.innerHTML = '';
    if (unlocked.has(id)) {
      if (!drawerMachines.has(id)) drawerMachines.set(id, (await mount(id)) || placeholder(m));
      body.append(drawerMachines.get(id).el);
    } else {
      body.innerHTML = `<div class="reserved-plate"><i class="rivet tl"></i><i class="rivet tr"></i><i class="rivet bl"></i><i class="rivet br"></i><div class="rp-stencil">RESERVED</div><div class="rp-name">${m.name.toUpperCase()}</div><div class="rp-note">ARRIVES ${m.arrives.toUpperCase()}</div></div>`;
    }
    drawer.hidden = false; drawer.dataset.machine = id;
    desk.classList.add('drawer-open');
    C.state.set('drawer', id);
  }
  function closeDrawer() {
    if (drawer.hidden) return false;
    drawer.hidden = true; desk.classList.remove('drawer-open'); C.room.play('slapdown');
    C.state.set('drawer', null);
    return true;
  }
  function placeholder(m) {
    const p = machinePanel({ id: m.id, title: m.name.toUpperCase() });
    p.body.innerHTML = `<p class="placeholder-note">This machine is bolted in. Its workings arrive with a later shipment.</p>`;
    return { el: p.el };
  }

  // phone strip (mini knobs) + drawer handles
  const strip = document.createElement('div'); strip.className = 'strip';
  const deg = document.createElement('button'); deg.type = 'button'; deg.className = 'degauss mini'; deg.textContent = 'DGS'; deg.setAttribute('aria-label', 'Degauss');
  deg.addEventListener('click', () => M.scope.degauss());
  strip.append(M.range.mini.el, M.filter.mini.el, M.timedial.mini.el, deg);
  const handles = document.createElement('nav'); handles.className = 'handles'; handles.setAttribute('aria-label', 'Drawers');
  for (const p of PHONE_PAGES) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'handle'; b.dataset.page = p.id;
    b.innerHTML = `<span class="handle-pull"></span><span>${p.label}</span>`;
    b.addEventListener('click', () => showPage(p.id, true));
    handles.append(b);
  }
  function showPage(id, byHand) {
    if (byHand) C.room.play(desk.dataset.page !== id ? 'lift' : 'press');
    closeDrawer();
    desk.dataset.page = id;
    for (const b of handles.children) b.classList.toggle('on', b.dataset.page === id);
    C.state.set('page', id);
  }

  desk.append(M.alarms.el, top, M.scope.el,
    page('log', M.radio.el, M.teletype.el),
    page('tools', M.toolbank.el),
    page('dials', M.range.el, M.filter.el),
    page('time', M.timedial.el),
    page('more', bay.el),
    strip, handles, drawer);
  showPage('tools');

  async function deliver(id) {
    const m = machines.find(x => x.id === id);
    if (!m || unlocked.has(id)) return false;
    unlocked.add(id);
    C.room.play('lift'); setTimeout(() => C.room.play('crate'), 650);
    showGroup(m.group);
    const slot = slots.querySelector(`[data-slot="${id}"]`);
    if (slot) {
      const crate = document.createElement('span'); crate.className = 'crate'; crate.innerHTML = `<b>${m.name.toUpperCase()}</b><i>THIS SIDE UP</i>`;
      slot.append(crate);
      slot.classList.add('delivering');
      setTimeout(() => { showGroup(m.group); slots.querySelector(`[data-slot="${id}"]`)?.classList.add('arrived'); }, 1400);
    }
    C.print({ who: 'Quartermaster', text: `CRATE DELIVERED: ${m.name.toUpperCase()} — BOLTED INTO THE ${C.data.groups.find(g => g.id === m.group).label} BAY.`, red: true });
    return true;
  }

  return { el: desk, M, showPage, openDrawer, closeDrawer, deliver, unlocked, showGroup, get group() { return group; }, drawer, machine: (id) => drawerMachines.get(id) || null };
}
