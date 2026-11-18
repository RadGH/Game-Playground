// The hangar's bays: the screen each station opens when your mech walks up to it (owner: "the hangar is a walkable hub,
// not menus" — the walking is the hub; each bay is one job, lessons 13). A bay is a sheet over the hangar with a head
// (Back, the bay's name, your wallet), tabs where the bay has more than one job, and its body. The hangar is paused
// underneath and resumes when the bay closes. Assembly (parts, weapons, chips, saved builds) and the paint bay live
// here; the dealer and workshop in shop.js.
import { fmt } from '../../../../shared/format.js';
import { ask, askText } from '../../../../shared/dialog.js';
import { composeMech } from '../../../../mechkit/js/bake-mech.js';
import { SLOTS } from '../sim/loadout.js';
import { rankOf } from '../sim/progress.js';
import { chipLoad } from '../sim/chips.js';
import { activeBuild, itemByUid, buildProblems, equip, fits, copyBuild, buildsUsing, chipIdsOf, MAX_BUILDS } from '../sim/inventory.js';
import { mechStats, RARITY } from '../sim/loadout.js';
import { itemCard, frameStats, SLOT_LABEL, PLACE_LABEL, esc } from './itemcard.js';
import { play as sound } from '../../../../citykit/js/world/sound.js';

export const BAY_INFO = {
  assembly: { name: 'Assembly bay', who: 'Ostrander' },
  dealer: { name: 'Parts dealer' },
  workshop: { name: 'Workshop' },
  paint: { name: 'Paint bay' },
};
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
export const click = () => sound('ui.click', { global: true, gain: 0.4 });
const RANK_ORDER = r => RARITY.findIndex(x => x.id === r);

/** Open a bay sheet. Returns { el, body, close, wallet() }. tabs = [[id, label]] or null. */
export function baySheet(screens, id, { title, tabs = null, tab = null, onTab = null, onClose = null } = {}) {
  const g = screens.g;
  const el = h('div', `of-pause of-bay of-bay-${id}`); el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', title);
  el.innerHTML = `<div class="of-bay-card">
    <header class="of-bay-head"><button type="button" class="of-btn of-bay-back" data-a="cancel">‹ Hangar</button><h2>${title}</h2><div class="of-wallet" aria-live="polite"></div></header>
    ${tabs ? `<nav class="of-tabs" role="tablist">${tabs.map(([t, label]) => `<button type="button" role="tab" class="of-tab${t === tab ? ' on' : ''}" aria-selected="${t === tab}" data-tab="${t}">${label}</button>`).join('')}</nav>` : ''}
    <div class="of-bay-body"></div></div>`;
  const body = el.querySelector('.of-bay-body');
  const wallet = () => {
    const s = g.save, rk = rankOf(s.xp);
    el.querySelector('.of-wallet').innerHTML = `<span class="of-rank">Rank ${rk.rank}</span><span>${fmt(s.credits, { decimals: 0 })} cr</span><span class="of-mat-scrap">Scrap ${fmt(s.mats.scrap, { decimals: 0 })}</span><span class="of-mat-alloy">Alloy ${fmt(s.mats.alloy, { decimals: 0 })}</span><span class="of-mat-exotic">Exotic ${fmt(s.mats.exotic, { decimals: 0 })}</span>`;
  };
  wallet();
  const close = () => { el.remove(); screens.pad.popLayer(); sound('ui.close', { global: true, gain: 0.4 }); onClose?.(); };
  el.querySelector('[data-a="cancel"]').addEventListener('click', close);
  el.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.querySelector('.gdlg-modal')) { e.preventDefault(); close(); } });
  el.querySelectorAll('.of-tab').forEach(b => b.addEventListener('click', () => {
    click(); el.querySelectorAll('.of-tab').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
    onTab?.(b.dataset.tab);
  }));
  document.body.append(el); screens.pad.pushLayer(el);
  sound('ui.open', { global: true, gain: 0.4 });
  return { el, body, close, wallet };
}

/** A turnable picture of a build (‹ › buttons and drag). Bakes one facing at a time, only when it's shown. */
export function mechPreview(g, cv, getBuild, { dir = 6 } = {}) {
  let d = dir, raf = 0, dragX = null;
  const draw = () => {
    raf = 0; if (!cv.isConnected) return;
    const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height);
    const b = getBuild();
    try { composeMech(ctx, g.mechArt.layersFor(b), d, d, { legs: ['idle', 0], upper: ['idle', 0] }, b.paint || 'maker', 0.25, { x: cv.width / 2, y: cv.height * 0.9, zoom: cv.height / 140, shadow: true }); } catch (e) { console.warn('[overdrive] preview', e); }
  };
  const redraw = () => { if (!raf) raf = requestAnimationFrame(draw); };
  const turn = k => { d = (d + k + 16) % 16; redraw(); };
  cv.addEventListener('pointerdown', e => { dragX = e.clientX; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => { if (dragX == null) return; const k = Math.trunc((e.clientX - dragX) / 28); if (k) { dragX += k * 28; turn(-k); } });
  cv.addEventListener('pointerup', () => { dragX = null; });
  redraw();
  return { redraw, turn };
}

// =====================================================================================================================
// Assembly bay: one saved build at a time — its places (8 frame parts, 4 weapons, firmware chips) on one side, the
// locker's parts that fit the chosen place on the other, the whole frame's numbers with what a swap would change.
export function openAssembly(screens, { onClose, onChange } = {}) {
  const g = screens.g, save = g.save;
  const sheet = baySheet(screens, 'assembly', { title: BAY_INFO.assembly.name, onClose });
  let place = 'w1', hover = null;
  const body = sheet.body;
  body.innerHTML = `
    <div class="of-asm-builds" role="group" aria-label="Saved builds"></div>
    <div class="of-asm">
      <section class="of-asm-left">
        <div class="of-asm-view"><button type="button" class="of-btn of-icon" data-turn="-1" aria-label="Turn left">‹</button><canvas width="300" height="300" aria-label="Your frame"></canvas><button type="button" class="of-btn of-icon" data-turn="1" aria-label="Turn right">›</button></div>
        <div class="of-asm-stats"></div>
        <ul class="of-asm-warn" aria-live="polite"></ul>
      </section>
      <section class="of-asm-places" aria-label="Parts on the frame"></section>
      <section class="of-asm-locker" aria-label="Parts that fit"><h3></h3><div class="of-asm-list"></div></section>
    </div>`;
  const B = () => activeBuild(save);
  const built = () => g.build(B());
  const pv = mechPreview(g, body.querySelector('canvas'), built);
  body.querySelectorAll('[data-turn]').forEach(b => b.addEventListener('click', () => pv.turn(+b.dataset.turn)));
  const changed = () => { g.saveNow(); onChange?.(); };

  const drawBuilds = () => {
    const row = body.querySelector('.of-asm-builds');
    row.innerHTML = save.builds.map(b => `<button type="button" class="of-btn of-chip${b.id === save.active ? ' on' : ''}" data-b="${b.id}" aria-pressed="${b.id === save.active}">${esc(b.name)}${buildProblems(g.build(b), g.P, g.C).errors.length ? ' <i class="of-dot-bad" aria-label="needs fixing"></i>' : ''}</button>`).join('')
      + `<span class="of-asm-bacts"><button type="button" class="of-btn of-small" data-ba="copy"${save.builds.length >= MAX_BUILDS ? ' disabled' : ''}>Copy</button><button type="button" class="of-btn of-small" data-ba="rename">Rename</button><button type="button" class="of-btn of-small of-danger" data-ba="delete"${save.builds.length <= 1 ? ' disabled' : ''}>Delete</button></span>`;
    row.querySelectorAll('[data-b]').forEach(b => b.addEventListener('click', () => { click(); save.active = b.dataset.b; changed(); drawAll(); }));
    row.querySelector('[data-ba="copy"]').addEventListener('click', async () => {
      const name = await askText({ title: 'Copy this build', text: 'A new saved build with the same parts. Change it without touching this one.', value: `${B().name} 2`, maxLength: 20, ok: 'Copy' });
      if (!name) return; const nb = copyBuild(save, B(), name.trim().slice(0, 20)); save.active = nb.id; changed(); drawAll();
    });
    row.querySelector('[data-ba="rename"]').addEventListener('click', async () => {
      const name = await askText({ title: 'Rename build', value: B().name, maxLength: 20, ok: 'Rename' });
      if (!name) return; B().name = name.trim().slice(0, 20) || B().name; changed(); drawBuilds();
    });
    row.querySelector('[data-ba="delete"]').addEventListener('click', async () => {
      if (!(await ask({ title: `Delete "${B().name}"?`, text: 'The parts stay in your locker.', ok: 'Delete', danger: true }))) return;
      save.builds = save.builds.filter(b => b !== B()); save.active = save.builds[0].id; changed(); drawAll();
    });
  };

  const placeItem = p => (p === 'chips' ? null : p.startsWith('w') ? itemByUid(save, B().weapons[+p.slice(1)]) : itemByUid(save, B().parts[p]));
  const drawPlaces = () => {
    const el = body.querySelector('.of-asm-places');
    const rows = [...SLOTS.map(s => [s, SLOT_LABEL[s]]), ['w0', PLACE_LABEL.w0], ['w1', PLACE_LABEL.w1], ['w2', PLACE_LABEL.w2], ['w3', PLACE_LABEL.w3]];
    const st = mechStats(built(), g.P, g.C), load = chipLoad(built().chips, g.C);
    el.innerHTML = `<h3>Frame</h3>${rows.slice(0, 8).map(r => row(r)).join('')}<h3>Weapons</h3>${rows.slice(8).map(r => row(r)).join('')}
      <h3>Firmware</h3><button type="button" class="of-place${place === 'chips' ? ' on' : ''}" data-p="chips"><small>Chips</small><b>${built().chips.length ? built().chips.map(c => g.C[c]?.name).join(', ') : 'None slotted'}</b><span class="of-fw"><i style="--v:${Math.min(100, load / Math.max(1, st.firmware) * 100)}%"></i>${load} / ${fmt(st.firmware, { decimals: 0 })}</span></button>`;
    function row([p, label]) {
      const it = placeItem(p), part = it && g.P[it.id];
      return `<button type="button" class="of-place${place === p ? ' on' : ''}" data-p="${p}" style="--rc:${it ? RARITY[RANK_ORDER(it.rarity)].colour : 'var(--of-faint)'}"><small>${label}</small><b>${part ? esc(part.name) : 'Empty'}</b></button>`;
    }
    el.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => { click(); place = b.dataset.p; drawPlaces(); drawLocker(); body.querySelector('.of-asm-locker').scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }));
  };

  const drawStats = (next = null) => {
    body.querySelector('.of-asm-stats').innerHTML = frameStats(g, built(), next);
    const pr = buildProblems(next || built(), g.P, g.C);
    body.querySelector('.of-asm-warn').innerHTML = [...pr.errors.map(e => `<li class="of-bad">${e}</li>`), ...pr.warnings.map(w => `<li>${w}</li>`)].join('');
  };

  /** The build as it would be with uid in place p (for the change preview). */
  const tryWith = (p, uid) => { const copy = JSON.parse(JSON.stringify(B())); equip({ ...save, builds: [copy] }, copy, p, uid, g.P, g.C); return g.build(copy); };

  const drawLocker = () => {
    const box = body.querySelector('.of-asm-locker'), list = box.querySelector('.of-asm-list');
    if (place === 'chips') return drawChips(box, list);
    const cur = placeItem(place);
    box.querySelector('h3').textContent = place.startsWith('w') ? PLACE_LABEL[place] : SLOT_LABEL[place];
    const others = save.items.filter(it => it !== cur && fits(g.P[it.id], place)).sort((a, b) => RANK_ORDER(b.rarity) - RANK_ORDER(a.rarity) || (g.P[a.id].name < g.P[b.id].name ? -1 : 1));
    list.innerHTML = (cur ? itemCard(g, cur, { tag: '<span class="of-tag">Fitted</span>', extra: place.startsWith('w') ? '<button type="button" class="of-btn of-small" data-rm>Take off</button>' : '' }) : '<p class="of-empty">Nothing fitted here.</p>')
      + (others.length ? others.map(it => itemCard(g, it, { vs: cur, extra: `<button type="button" class="of-btn of-small of-primary" data-fit="${it.uid}">Fit</button>${usedIn(it)}` })).join('') : `<p class="of-empty">No other parts for this place in your locker. The parts dealer and the workshop have more.</p>`);
    list.querySelectorAll('[data-fit]').forEach(b => {
      const uid = b.dataset.fit;
      b.addEventListener('click', () => { equip(save, B(), place, uid, g.P, g.C); sound('lever.pull', { global: true, gain: 0.5 }); changed(); drawAll(); });
      const card = b.closest('.of-item');
      const show = () => { hover = uid; drawStats(tryWith(place, uid)); }, hide = () => { if (hover === uid) { hover = null; drawStats(); } };
      card.addEventListener('pointerenter', show); card.addEventListener('pointerleave', hide); b.addEventListener('focus', show); b.addEventListener('blur', hide);
    });
    list.querySelector('[data-rm]')?.addEventListener('click', () => { equip(save, B(), place, null, g.P, g.C); changed(); drawAll(); });
  };
  const usedIn = it => { const u = buildsUsing(save, it.uid).filter(b => b !== B()); return u.length ? `<small class="of-used">Also in ${u.map(b => esc(b.name)).join(', ')}</small>` : ''; };

  const drawChips = (box, list) => {
    box.querySelector('h3').textContent = 'Firmware chips';
    const b = B(), st = mechStats(built(), g.P, g.C), load = chipLoad(built().chips, g.C);
    const fitted = (b.chips || []).map(u => save.chips.find(c => c.uid === u)).filter(Boolean);
    const spare = save.chips.filter(c => !(b.chips || []).includes(c.uid));
    const card = (c, act) => { const ch = g.C[c.id]; return `<article class="of-item of-chipcard" style="--rc:${ch.colour}"><header><b>${ch.name}</b><small>${ch.cost} firmware</small></header><p>${ch.text}</p>${act}</article>`; };
    list.innerHTML = `<p class="of-note">The CPU holds ${fmt(st.firmware, { decimals: 0 })} firmware; ${load} used. A better CPU holds more. Chips are made at the workshop and found in crates.</p>`
      + (fitted.length ? fitted.map(c => card(c, `<button type="button" class="of-btn of-small" data-unchip="${c.uid}">Remove</button>`)).join('') : '')
      + (spare.length ? `<h4>In your locker</h4>` + spare.map(c => { const fitsNow = load + g.C[c.id].cost <= st.firmware; return card(c, `<button type="button" class="of-btn of-small of-primary" data-chip="${c.uid}"${fitsNow ? '' : ' disabled'}>${fitsNow ? 'Slot' : 'Not enough firmware'}</button>`); }).join('') : '<p class="of-empty">No spare chips. Burn one at the workshop.</p>');
    list.querySelectorAll('[data-chip]').forEach(x => x.addEventListener('click', () => { (b.chips ||= []).push(x.dataset.chip); sound('lever.pull', { global: true, gain: 0.5 }); changed(); drawAll(); }));
    list.querySelectorAll('[data-unchip]').forEach(x => x.addEventListener('click', () => { b.chips = b.chips.filter(u => u !== x.dataset.unchip); changed(); drawAll(); }));
  };

  const drawAll = () => { drawBuilds(); drawPlaces(); drawStats(); drawLocker(); pv.redraw(); sheet.wallet(); };
  drawAll();
  return sheet;
}

// =====================================================================================================================
// Paint bay: schemes (more unlock with rank) and your own colours, painted onto the build you're using.
export function openPaint(screens, { onClose, onChange } = {}) {
  const g = screens.g, save = g.save, rank = rankOf(save.xp).rank, PA = g.PAINTS;
  const sheet = baySheet(screens, 'paint', { title: BAY_INFO.paint.name, onClose });
  const B = () => activeBuild(save);
  sheet.body.innerHTML = `
    <div class="of-paint">
      <section class="of-paint-view"><div class="of-asm-view"><button type="button" class="of-btn of-icon" data-turn="-1" aria-label="Turn left">‹</button><canvas width="320" height="320" aria-label="Your frame in this paint"></canvas><button type="button" class="of-btn of-icon" data-turn="1" aria-label="Turn right">›</button></div><p class="of-note">Painting <b>${esc(B().name)}</b>. Each saved build keeps its own paint.</p></section>
      <section class="of-paint-pick"><h3>Schemes</h3><div class="of-schemes"></div><h3>Your own colours</h3><div class="of-custom"></div></section>
    </div>`;
  const pv = mechPreview(g, sheet.body.querySelector('canvas'), () => g.build());
  sheet.body.querySelectorAll('[data-turn]').forEach(b => b.addEventListener('click', () => pv.turn(+b.dataset.turn)));
  const cur = () => { const p = B().paint; return !p || p === 'maker' ? { scheme: 'maker' } : p; };
  const set = paint => { B().paint = paint; g.saveNow(); sound('steam.hiss', { global: true, gain: 0.3 }); onChange?.(); draw(); pv.redraw(); };
  const draw = () => {
    const c = cur();
    sheet.body.querySelector('.of-schemes').innerHTML = PA.schemes.map(s => {
      const locked = (s.rank || 0) > rank, on = (c.scheme || 'custom') === s.id;
      const sw = s.id === 'maker' ? '<i style="background:linear-gradient(90deg,#e4e8ee 25%,#e2a91c 25% 50%,#4fb39a 50% 75%,#6e7a48 75%)"></i>' : `<i style="background:${s.primary}"></i><i style="background:${s.secondary}"></i><i style="background:${s.accent}"></i>`;
      return `<button type="button" class="of-scheme${on ? ' on' : ''}" data-s="${s.id}" aria-pressed="${on}"${locked ? ' disabled' : ''}><span class="of-sw">${sw}</span><b>${s.name}</b>${locked ? `<small>Rank ${s.rank}</small>` : ''}</button>`;
    }).join('');
    sheet.body.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => {
      const s = PA.schemes.find(x => x.id === b.dataset.s);
      set(s.id === 'maker' ? 'maker' : { scheme: s.id, primary: s.primary, secondary: s.secondary, accent: s.accent, glow: s.glow });
    }));
    const base = c.scheme === 'maker' ? { primary: '#e4e8ee', secondary: '#2b3242', accent: '#1fb8e0', glow: null } : c;
    const rowsHtml = [['primary', 'Main plates', PA.swatches], ['secondary', 'Frame and joints', PA.swatches], ['accent', 'Stripes and trim', PA.swatches], ['glow', 'Lights', PA.glows]].map(([k, label, list]) =>
      `<div class="of-cust-row"><span>${label}</span><div class="of-sw-row">${list.map(col => `<button type="button" class="of-swatch${base[k] === col ? ' on' : ''}" data-k="${k}" data-c="${col}" style="--c:${col}" aria-label="${label}: ${col}"></button>`).join('')}${k === 'glow' ? `<button type="button" class="of-swatch of-sw-none${!base.glow ? ' on' : ''}" data-k="glow" data-c="" aria-label="Lights: each part's own">×</button>` : ''}</div></div>`).join('');
    sheet.body.querySelector('.of-custom').innerHTML = rowsHtml;
    sheet.body.querySelectorAll('.of-swatch').forEach(b => b.addEventListener('click', () => {
      const next = { ...base, scheme: 'custom' }; next[b.dataset.k] = b.dataset.c || null; set(next);
    }));
  };
  draw();
  return sheet;
}

export { h };
