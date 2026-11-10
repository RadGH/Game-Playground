// The phone (Expansion 1 M4, docs/EXPANSION-1.md "Phone"): one layer styled as a phone — on a phone it IS the screen,
// on a desktop it is a phone-shaped panel. Apps: Garage (summon an owned vehicle), Wardrobe (change into owned clothes),
// Items (owned items + kits), Jobs (levels, upgrades, Start = a waypoint pin), Map, Achievements (+ a Jobs checklist
// tab), Settings. Opened with P, the controller's LB, or the phone button on the HUD; B / Esc goes back (an app -> the
// home screen -> closed). Controller + keyboard move the shared focus ring (nav.js).
//
// No scroller inside the page: the LAYER scrolls (.rl-phonelayer is the scroller, the phone grows with its list), the
// rule that keeps WebGL from blanking on Android Chromium (dom.js).
//
//   openPhone({ layers, nav, ctx, app? }) -> { close, show(app), get app }
//   ctx = { profile(), onProfile(fn) -> off, shop, jobs (registry jobTable), ach (achTable), vehicleName(id), thumb(id)?,
//           send(msg), toast(text), mode(), canSummon() -> null | why, summon(vehicleId), openMap(), openSettings(),
//           openWardrobe(), wornLook(), portrait(look), startJob(job) -> { name } | null, pinShop(kind) -> { name } | null,
//           clothName(id) }
import { el, esc } from './dom.js';
import { checklist, jobState, unlockedLevels, nextLevel, isRevealed } from '../../game/jobs/registry.js';
import { view as achView } from '../../game/achievements.js';
import { CLOTHING_SLOTS } from '../../game/profile.js';

export const APPS = [
  ['garage', 'Garage', '#e8a33c'], ['wardrobe', 'Wardrobe', '#c47bd6'], ['items', 'Items', '#6fb86a'],
  ['jobs', 'Jobs', '#5aa7e8'], ['map', 'Map', '#4fc1a6'], ['ach', 'Awards', '#f2c94c'], ['settings', 'Settings', '#9aa3ad'],
];
// tiny line drawings (24 x 24), white on the app colour
const ICON = {
  garage: '<path d="M3 15l2-6h14l2 6v4h-2.5a2 2 0 0 1-4 0h-5a2 2 0 0 1-4 0H3z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M6 9l1-3h10l1 3" fill="none" stroke="#fff" stroke-width="2"/>',
  wardrobe: '<path d="M8 3l-5 3 2 5 2-1v11h10V10l2 1 2-5-5-3a4 4 0 0 1-8 0z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>',
  items: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z M3 8l9 5 9-5 M12 13v8" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>',
  jobs: '<rect x="3" y="7" width="18" height="13" rx="2" fill="none" stroke="#fff" stroke-width="2"/><path d="M9 7V4h6v3 M3 12h18" fill="none" stroke="#fff" stroke-width="2"/>',
  map: '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z M9 3v15 M15 6v15" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>',
  ach: '<path d="M7 3h10v5a5 5 0 0 1-10 0z M7 5H3a4 4 0 0 0 4 4 M17 5h4a4 4 0 0 1-4 4 M12 13v4 M8 21h8l-1-4H9z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>',
  settings: '<circle cx="12" cy="12" r="3.2" fill="none" stroke="#fff" stroke-width="2"/><path d="M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M19 5l-2 2 M7 17l-2 2" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
};
const icon = id => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[id] || ''}</svg>`;
const gold = n => `<span class="rl-coin" aria-hidden="true"></span>${Number(n || 0).toLocaleString()}`;
const clock = () => { const d = new Date(); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
// jobs you can play now (M6+) and the line the Start button adds to the pin toast
const PLAYABLE = { farming: 'The farm\'s tractors wait in the yard — follow the pin.',
  survey: 'Buy a kit at a Supply store, Spawn its crate from Items, carry it somewhere that suits it, then report here.' };      // M10
// M7: the emergency + haul jobs — Start also takes a call at once (the room places it; the pin goes to the station
// where the job's vehicle waits, and on to the call once it comes in)
const CALLS = { fire: 'A fire truck waits at the fire station.', ambulance: 'An ambulance waits at the hospital.', patrol: 'A patrol car waits at the garage.',
  tow: 'A tow truck waits at the tow yard.', haul: 'Trucks and vans wait at the freight depot.',
  moon: 'Crater Crawlers wait at Greywatch Landing and the Rover Garage.' };     // M12: Start asks the room where to go first
const SLOT_NAMES = { hat: 'Hats', top: 'Tops', bottom: 'Bottoms', shoes: 'Shoes', cape: 'Scarves + packs', accessory: 'Glasses + more', decor: 'Extra gear' };

/** A vehicle picture: the real model's thumbnail when it comes, a colour card with its initials until then. */
export function vehiclePic(id, name, thumb) {
  const hue = [...String(id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  const initials = String(name || id).split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const span = `<span class="rl-vpic" data-vpic="${esc(id)}" style="--h:${hue}"><b>${esc(initials)}</b></span>`;
  if (thumb) Promise.resolve(thumb(id)).then(url => { if (!url) return; for (const e of document.querySelectorAll(`[data-vpic="${CSS.escape(id)}"]`)) if (!e.querySelector('img')) { e.innerHTML = `<img alt="" src="${url}">`; e.classList.add('pic'); } }).catch(() => {});
  return span;
}

export function openPhone({ layers, nav, ctx, app = 'home' }) {
  const node = el('div', 'rl-modal rl-phonelayer');
  const phone = el('div', 'rl-panel rl-phone'); node.append(phone);
  let cur = app, job = null, achTab = 'ach', closed = false;
  const rec = layers.push(node, { kind: 'phone', onBack: () => back() });
  node.addEventListener('click', e => { if (e.target === node) close(); });
  const off = ctx.onProfile(() => { if (!closed) draw(); });

  function back() {
    if (cur === 'job') { cur = 'jobs'; job = null; return draw(); }
    if (cur !== 'home') { cur = 'home'; return draw(); }
    close();
  }
  function close() { if (closed) return; closed = true; off?.(); rec.close(); }
  function show(a) {
    if (a === 'map') { close(); return ctx.openMap(); }
    if (a === 'settings') { close(); return ctx.openSettings(); }
    cur = a; draw();
  }

  // ------------------------------------------------------------------------------------------ the apps
  function home() {
    return `<div class="rl-ph-apps">${APPS.map(([id, name, color]) => `<button class="rl-ph-app" data-app="${id}" style="--ac:${color}"${id === 'garage' ? ' data-autofocus' : ''}><i>${icon(id)}</i><span>${esc(name)}</span></button>`).join('')}</div>
      <p class="rl-note center">Shops in every town: walk up to a door and press E.</p>
      <div class="rl-row center"><button class="rl-btn" data-back>Put the phone away</button></div>`;
  }
  function garage(P) {
    const why = ctx.canSummon();
    // M11: the landing pod is never called (it comes down from orbit); the rocket goes onto the Skyreach launch pad
    const rows = P.owned.vehicles.filter(id => id !== 'landing_pod').map(id => `<div class="rl-ph-row">${vehiclePic(id, ctx.vehicleName(id), ctx.thumb)}<span class="rl-ph-name"><b>${esc(ctx.vehicleName(id))}</b>${id === 'rocket' ? '<i>Stands on the Skyreach launch pad — call it from the launch site</i>' : ''}</span>
      <button class="rl-btn small${why ? '' : ' primary'}" data-summon="${esc(id)}"${why ? ' aria-disabled="true"' : ''}>Summon</button></div>`).join('');
    return `${why ? `<p class="rl-ph-warn">${esc(why)}</p>` : '<p class="rl-note">Summon puts it down beside you. Your last summoned one goes back if nobody is in it.</p>'}
      <div class="rl-ph-list">${rows}</div>
      <div class="rl-ph-foot"><p class="rl-note">Buy more at a Dealer — the garage in every town.</p><button class="rl-btn small" data-pinshop="dealer">Mark the nearest Dealer</button></div>`;
  }
  function wardrobe(P) {
    const look = ctx.wornLook();
    const by = {};
    for (const c of P.owned.clothes) { const [slot] = c.split(':'); (by[slot] ||= []).push(c); }
    const worn = new Set(CLOTHING_SLOTS.map(s => s + ':' + (look?.wear?.[s]?.id || '')));
    return `<div class="rl-ph-me"><img class="rl-face" src="${ctx.portrait(look)}" alt=""><div><b>Your clothes</b><p class="rl-note">Change into anything you own. Face, hair, skin and every colour are free.</p></div></div>
      <div class="rl-row"><button class="rl-btn primary" data-wardrobe data-autofocus>Change clothes</button></div>
      ${CLOTHING_SLOTS.filter(s => by[s]?.length).map(s => `<h3>${esc(SLOT_NAMES[s] || s)}</h3><div class="rl-ph-chips">${by[s].map(c => `<span class="rl-ph-chip${worn.has(c) ? ' on' : ''}">${esc(ctx.clothName(c))}${worn.has(c) ? ' · wearing' : ''}</span>`).join('')}</div>`).join('')}
      <div class="rl-ph-foot"><p class="rl-note">More clothes at an Outfitter in every town.</p><button class="rl-btn small" data-pinshop="outfitter">Mark the nearest Outfitter</button></div>`;
  }
  function items(P) {
    const list = [...P.owned.items.map(id => ['item', id]), ...P.owned.kits.map(id => ['kit', id])];
    const name = id => [...(ctx.shop.items || []), ...(ctx.shop.kits || [])].find(r => r.id === id)?.name || id.replace(/_/g, ' ');
    return list.length ? `<div class="rl-ph-list">${list.map(([k, id]) => `<div class="rl-ph-row"><span class="rl-ph-name"><b>${esc(name(id))}</b><i>${k === 'kit' ? 'Survey kit' : 'Item'}</i></span><button class="rl-btn small primary" data-spawn="${esc(id)}">Spawn</button></div>`).join('')}</div>`
      : `<div class="rl-ph-empty"><b>Nothing here yet</b><p class="rl-note">Items and survey kits are sold at the Supply store in every town. What you buy is yours for good, and Spawn puts it down beside you.</p></div>
        <div class="rl-ph-foot"><button class="rl-btn small" data-pinshop="supply" data-autofocus>Mark the nearest Supply store</button></div>`;
  }
  function jobsList(P) {
    const rows = checklist(P, ctx.jobs).map(r => {
      const j = ctx.jobs.get(r.id), st = jobState(P, r.id);
      return r.revealed
        ? `<button class="rl-ph-job" data-job="${esc(r.id)}"><span class="rl-ph-name"><b>${esc(r.name)}</b><i>${esc(j.where || '')}</i></span><span class="rl-ph-lvl">Level ${st.level}<small>${r.done}/${r.total} done</small></span></button>`
        : `<div class="rl-ph-job locked" aria-label="A job not found yet"><span class="rl-ph-name"><b>???</b><i>${esc(r.requires || '')}</i></span><span class="rl-ph-lvl">?</span></div>`;
    }).join('');
    return `<p class="rl-note">Every job pays gold for driving the right vehicle well. A level opens once you have done the one before it.</p><div class="rl-ph-list">${rows}</div>`;
  }
  function jobPage(P) {
    const j = ctx.jobs.get(job); if (!j || !isRevealed(P, j)) { cur = 'jobs'; return jobsList(P); }
    const st = jobState(P, j.id), open = new Set(unlockedLevels(P, j)), nx = nextLevel(P, j), done = new Set(st.done);
    const veh = (j.vehicles || []).map(v => ctx.vehicleName(v)).join(', ');
    return `<p class="rl-ph-blurb">${esc(j.blurb || '')}</p>
      <p class="rl-note"><b>Where:</b> ${esc(j.where || '')}${veh ? `<br><b>Drive:</b> ${esc(veh)}` : ''}</p>
      <div class="rl-row"><button class="rl-btn primary" data-start data-autofocus>Start${nx ? ` level ${nx}` : ''}</button></div>
      <h3>Levels</h3><div class="rl-ph-list">${j.levels.map(l => {
        const state = done.has(l.n) ? 'done' : open.has(l.n) ? 'open' : 'locked';
        const pr = l.n === nx ? ctx.jobProgress?.(j.id) : null;      // M6: the room's progress line for the level you are on
        return `<div class="rl-ph-level ${state}"><i>${state === 'done' ? '✓' : state === 'open' ? l.n : '–'}</i><span><b>${esc(l.title)}</b><small>${esc(state === 'locked' ? `Finish level ${l.n - 1} to open this` : l.goal)}</small>${pr?.text && pr.level === l.n ? `<small class="rl-ph-prog">${esc(pr.text)}</small>` : ''}</span></div>`;
      }).join('')}</div>
      ${j.upgrades.length ? `<h3>Upgrades</h3><div class="rl-ph-list">${j.upgrades.map(u => {
        const have = st.upgrades.includes(u.id), short = (P.gold || 0) < u.cost;
        return `<div class="rl-ph-row"><span class="rl-ph-name"><b>${esc(u.name)}</b><i>${esc(u.effect)}</i></span>${have ? '<span class="rl-ph-owned">Owned ✓</span>'
          : `<button class="rl-btn small${short ? '' : ' primary'}" data-upgrade="${esc(u.id)}"${short ? ' aria-disabled="true"' : ''}>${gold(u.cost)}</button>`}</div>`;
      }).join('')}</div>` : ''}`;
  }
  function achievements(P) {
    const tabs = `<div class="rl-ph-tabs"><button class="rl-pill${achTab === 'ach' ? ' on' : ''}" data-achtab="ach">Achievements</button><button class="rl-pill${achTab === 'jobs' ? ' on' : ''}" data-achtab="jobs">Jobs checklist</button></div>`;
    if (achTab === 'jobs') {
      const rows = checklist(P, ctx.jobs);
      return tabs + `<p class="rl-note">${rows.filter(r => r.done === r.total).length} of ${rows.length} jobs finished.</p><div class="rl-ph-list">${rows.map(r => `<div class="rl-ph-check${r.revealed ? '' : ' locked'}"><span class="rl-ph-name"><b>${esc(r.name)}</b>${r.revealed ? '' : `<i>${esc(r.requires || '')}</i>`}</span>
        <span class="rl-ph-pips" aria-label="${r.done} of ${r.total} levels done">${Array.from({ length: r.total }, (_, i) => `<i class="${i < r.done ? 'on' : ''}"></i>`).join('')}</span></div>`).join('')}</div>`;
    }
    const rows = achView(P, ctx.ach), got = rows.filter(r => r.earned).length;
    return tabs + `<p class="rl-note">${got} of ${rows.length} earned.</p><div class="rl-ph-list">${rows.map(r => `<div class="rl-ph-ach${r.earned ? ' got' : ''}${r.locked ? ' locked' : ''}"><i>${r.earned ? '★' : r.locked ? '?' : '☆'}</i><span class="rl-ph-name"><b>${esc(r.name)}</b><i>${esc(r.text)}${r.progress ? ` · ${Math.floor(r.progress.have).toLocaleString()} / ${r.progress.n.toLocaleString()}` : ''}</i></span></div>`).join('')}</div>`;
  }

  // ------------------------------------------------------------------------------------------ drawing
  const TITLES = { garage: 'Garage', wardrobe: 'Wardrobe', items: 'Items', jobs: 'Jobs', ach: 'Awards' };
  function draw() {
    if (closed) return;
    const P = ctx.profile();
    let body;
    if (!P) body = '<p class="rl-note">Your phone wakes up when you are in a game.</p>';
    else if (cur === 'home') body = home();
    else if (cur === 'garage') body = garage(P);
    else if (cur === 'wardrobe') body = wardrobe(P);
    else if (cur === 'items') body = items(P);
    else if (cur === 'jobs') body = jobsList(P);
    else if (cur === 'job') body = jobPage(P);
    else if (cur === 'ach') body = achievements(P);
    const title = cur === 'home' ? '' : cur === 'job' ? (ctx.jobs.get(job)?.name || 'Job') : TITLES[cur] || '';
    phone.dataset.screen = cur;
    phone.innerHTML = `<div class="rl-ph-status"><span>${clock()}</span><span class="rl-ph-gold">${P ? gold(P.gold) : ''}</span></div>
      ${cur === 'home' ? '<div class="rl-ph-hello"><b>Wayfare</b><span>County</span></div>' : `<div class="rl-ph-head"><button class="rl-btn small" data-back aria-label="Back">‹</button><h2>${esc(title)}</h2></div>`}
      <div class="rl-ph-body">${body}</div>`;
    nav.attach(phone, { keep: true });
  }

  phone.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('[data-back]')) return back();
    const a = t.closest('[data-app]'); if (a) return show(a.dataset.app);
    const sm = t.closest('[data-summon]');
    if (sm) { const why = ctx.canSummon(); if (why) return ctx.toast(why); const r = ctx.summon(sm.dataset.summon); if (r?.why) return ctx.toast(r.why); return close(); }
    if (t.closest('[data-wardrobe]')) { close(); return ctx.openWardrobe(); }
    const ps = t.closest('[data-pinshop]'); if (ps) { const s = ctx.pinShop(ps.dataset.pinshop); ctx.toast(s ? `Pin set: ${s.name}` : 'No shop like that on this map.'); return; }
    const spn = t.closest('[data-spawn]');
    if (spn) {
      // M10: a survey kit's crate goes down beside you (the room checks you own it); plain items come later
      if (!(ctx.shop.kits || []).some(r => r.id === spn.dataset.spawn) || !ctx.spawnKit) return ctx.toast('Putting items down comes with the first items you can buy.');
      const r = ctx.spawnKit(spn.dataset.spawn); if (!r || r.why) return ctx.toast(r?.why || 'Not here.');
      ctx.toast('Crate down beside you — carry it (E), load it into a vehicle, or hold E by it to set it up'); return close();
    }
    const jb = t.closest('[data-job]'); if (jb) { job = jb.dataset.job; cur = 'job'; return draw(); }
    if (t.closest('[data-start]')) {
      const j = ctx.jobs.get(job), s = ctx.startJob(j);
      // jobs with a referee in the room (js/net/jobs-core.js REFEREES) are playable; the rest say so
      if (!s && j.place === 'moon') return ctx.toast('Moon Work is on the Moon: launch the rocket from Skyreach and land at Greywatch.');     // M12
      if (!s) return ctx.toast('This job has no place on this map yet.');
      if (PLAYABLE[j.id]) return ctx.toast(`Pin set: ${s.name}. ${PLAYABLE[j.id]}`);
      if (CALLS[j.id]) { ctx.send({ t: 'job', id: j.id, step: 'start' }); return ctx.toast(`Pin set: ${s.name}. ${CALLS[j.id]}`); }
      return ctx.toast(`Pin set: ${s.name}. The job itself opens in a later update.`);
    }
    const up = t.closest('[data-upgrade]');
    if (up) {
      const u = ctx.jobs.get(job)?.upgrades.find(x => x.id === up.dataset.upgrade), P = ctx.profile();
      if (!u || !P) return;
      if ((P.gold || 0) < u.cost) return ctx.toast(`You need ${u.cost - (P.gold || 0)} more gold.`);
      if (up.dataset.sure !== '1') { up.dataset.sure = '1'; up.innerHTML = `Buy? ${gold(u.cost)}`; setTimeout(() => { if (up.isConnected) { up.dataset.sure = ''; up.innerHTML = gold(u.cost); } }, 3000); return; }
      return ctx.send({ t: 'upgrade', id: u.id });
    }
    const tb = t.closest('[data-achtab]'); if (tb) { achTab = tb.dataset.achtab; return draw(); }
  });
  draw();
  return { close, show, get app() { return cur; }, get closed() { return closed; }, el: node };
}
