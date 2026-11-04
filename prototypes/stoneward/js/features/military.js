// Guards, threats and the fight on screen (M6 + M7): the Guards tab (hire, post, patrol, hold, back
// to barracks), Info → Military (roster, the threat meter, known lairs, recent attacks), guards and
// monsters drawn on the map with health bars, shots and spells, the shield dome, lair markers, the
// raid warning banner, and dropping back to 1x when an attack starts (a setting).

import { hooks } from '../ui/hooks.js';

let picked = [];          // selected guard ids
let patrolPts = null;     // points while drawing a patrol loop
let mode = null;          // 'post' | 'patrol' | null
window.addEventListener('stoneward:pick-guard', e => { if (!picked.includes(e.detail)) picked = [e.detail]; });
const KIND_ICON = { watchman: '🛡', spearman: '🔱', archer: '🏹', crossbowman: '🎯', mage: '🔮' };

hooks.tabs.push({
  id: 'guards', label: 'Guards',
  render(ui) {
    const m = ui.app.stream?.town?.military;
    const G = ui.data.guards;
    const p = ui.panel('');
    const hire = document.createElement('div'); hire.className = 'groups';
    for (const [k, g] of Object.entries(G)) hire.append(ui.btn(`${KIND_ICON[k] || ''} ${g.name} 🪙${g.hire}`, async () => { const r = await ui.link().order({ t: 'hire', kind: k }); if (r?.error) ui.toast(r.error, 'bad'); else { ui.toast(`${g.name} hired.`, 'good'); picked = [r.id]; ui.refreshDock(); } }));
    p.append(hire);
    const list = document.createElement('div'); list.className = 'groups';
    const guards = m?.guards || [];
    for (const g of guards) {
      const b = ui.btn(`${KIND_ICON[g.kind] || '•'} ${g.mode}`, () => { picked = picked.includes(g.id) ? picked.filter(x => x !== g.id) : [...picked, g.id]; ui.refreshDock(); });
      b.classList.toggle('on', picked.includes(g.id));
      b.title = `${G[g.kind].name} · ${g.hp}/${g.max}`;
      list.append(b);
    }
    if (guards.length) p.append(list);
    if (picked.length) {
      const row = document.createElement('div'); row.className = 'row';
      row.append(
        ui.btn('Post here…', () => startPost(ui)),
        ui.btn('Draw patrol…', () => startPatrol(ui)),
        ui.btn('Hold', () => ui.link().order({ t: 'guard.hold', ids: picked })),
        ui.btn('Barracks', () => ui.link().order({ t: 'guard.home', ids: picked })),
        ui.btn('All', () => { picked = guards.map(g => g.id); ui.refreshDock(); }),
      );
      p.append(row);
    }
    p.append(ui.hint(mode === 'post' ? 'Tap where they should stand.' : mode === 'patrol' ? `Tap the points of the loop (${patrolPts?.length || 0} so far), then Done.` : guards.length ? 'Pick guards, then give them a post or a patrol. Enemies near their route call them on their own.' : 'Hire guards to keep the town safe. A barracks holds more.'));
    if (mode === 'patrol') p.append(ui.btn('Done', () => finishPatrol(ui)), ui.btn('Cancel', () => { mode = null; patrolPts = null; ui.setTool(null); ui.refreshDock(); }));
  },
});
function startPost(ui) {
  mode = 'post';
  ui.setTool({ feature: true, up: async (pt, e, tap) => { if (!tap) return; await ui.link().order({ t: 'guard.post', ids: picked, x: Math.floor(pt.x), y: Math.floor(pt.y) }); mode = null; ui.setTool(null); ui.refreshDock(); ui.toast('Posted.', 'good'); } });
  ui.refreshDock();
}
function startPatrol(ui) {
  mode = 'patrol'; patrolPts = [];
  ui.setTool({ feature: true, up: (pt, e, tap) => { if (!tap) return; patrolPts.push([Math.floor(pt.x), Math.floor(pt.y)]); ui.refreshDock(); } });
  ui.refreshDock();
}
async function finishPatrol(ui) {
  if (patrolPts?.length >= 2) { await ui.link().order({ t: 'guard.patrol', ids: picked, points: patrolPts }); ui.toast('On patrol.', 'good'); }
  mode = null; patrolPts = null; ui.setTool(null); ui.refreshDock();
}

// ---------------------------------------------------------------- Info → Military
hooks.infoTabs.push({
  id: 'military', label: 'Military',
  render(ui, head) {
    const m = ui.app.stream?.town?.military; const p = ui.panel(''); p.append(head);
    if (!m) return;
    const t = m.threat;
    const card = document.createElement('div'); card.className = 'card';
    const lvl = Math.min(5, Math.ceil((t?.strength || 0) / 3));
    card.innerHTML = `<b>Threat ${'█'.repeat(lvl)}${'░'.repeat(5 - lvl)}</b><span>${t ? (t.inSecs > 0 ? `Next raid in about ${fmtSecs(t.inSecs)} · about ${t.strength} raiders${t.from ? ' · from the ' + t.from : ''}${t.toward ? ' · toward ' + ui.esc(t.toward) : ''}` : 'A raid is on now') : 'No raids planned'}</span><span>${m.guards.length} guards · ${m.enemies} enemies about · ${m.lairs.length} known lairs</span>`;
    p.append(card);
    const roster = {}; for (const g of m.guards) roster[g.kind] = (roster[g.kind] || 0) + 1;
    if (m.guards.length) { const c = document.createElement('div'); c.className = 'card'; c.innerHTML = `<b>Roster</b><span>${Object.entries(roster).map(([k, n]) => `${n} ${ui.data.guards[k].name.toLowerCase()}${n > 1 ? 's' : ''}`).join(' · ')}</span>`; p.append(c); }
    if (m.log.length) { const c = document.createElement('div'); c.className = 'card'; c.innerHTML = `<b>Recent attacks</b>${m.log.slice(0, 4).map(l => `<span>${ui.esc(l.text)}</span>`).join('')}`; p.append(c); }
  },
});
function fmtSecs(s) { return s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`; }

// ---------------------------------------------------------------- warnings, slowing down
let banner = null;
hooks.tick.push((msg, ui) => {
  for (const s of msg.events || []) {}
  const m = msg.town?.military;
  for (const e of msg.said || []) if (e.warn) showBanner(ui, e);
  if (msg.attack && ui.app.prefs.slowOnAttack && ui.app.speed > 1) ui.setSpeed?.(1);
});
// ---- enemies near your towns: a ⚔ pill in the top bar (tap to look at the next one) and arrows at
// the screen edge pointing at any that are off screen
let pill = null, pillIdx = 0;
hooks.tick.push((msg, ui) => {
  const near = ui.app.stream?.town?.military?.near || [];
  if (!pill) {
    pill = document.createElement('button'); pill.className = 'icon-btn enemy-pill hidden';
    pill.addEventListener('click', () => { const list = ui.app.stream?.town?.military?.near || []; if (!list.length) return; const [x, y] = list[pillIdx++ % list.length]; ui.camera()?.flyTo(x, y, Math.max(2.5, ui.camera().cam.ppc), 700); });
    document.querySelector('#btn-speed')?.before(pill);
  }
  pill.classList.toggle('hidden', !near.length);
  pill.textContent = '⚔ ' + near.length;
  pill.title = `${near.length} enemies near your towns — tap to look`;
});
hooks.screen.push((cam, out, ui, dpr, vw, vh) => {
  const near = ui.app.stream?.town?.military?.near || []; if (!near.length) return;
  const W = ui.app.world.W, m = 22 * dpr, s = 9 * dpr;
  for (const [x, y] of near) {
    const sx = (ui.near(x, cam.x, W) - cam.x) * cam.ppc * dpr, sy = (y - cam.y) * cam.ppc * dpr;
    if (Math.abs(sx) < vw / 2 - m && Math.abs(sy) < vh / 2 - m) continue;          // on screen: no arrow
    const k = Math.min((vw / 2 - m) / Math.max(1e-6, Math.abs(sx)), (vh / 2 - m - 60 * dpr) / Math.max(1e-6, Math.abs(sy)));
    const ex = vw / 2 + sx * k, ey = vh / 2 + sy * k, a = Math.atan2(sy, sx);
    // a short red arrow: three squares stepping toward the enemy
    for (let i = 0; i < 3; i++) { const d = (i - 1) * s * 0.9, sz = s * (1 - i * 0.25); out.push([ex + Math.cos(a) * d - sz / 2, ey + Math.sin(a) * d - sz / 2, sz, sz, 0.95, 0.2, 0.12, 0.9]); }
  }
});
function showBanner(ui, e) {
  banner?.remove();
  banner = document.createElement('div'); banner.className = 'banner-warn'; banner.textContent = '⚔ ' + e.text;
  banner.addEventListener('click', () => { ui.camera()?.flyTo(e.x, e.y, 2.5, 800); banner?.remove(); });
  document.querySelector('#hud').append(banner);
  setTimeout(() => banner?.remove(), 15000);
}

// ---------------------------------------------------------------- on the map
const SHOT = { arrow: [0.9, 0.85, 0.7], stone: [0.55, 0.5, 0.45], bolt: [0.7, 0.85, 1], magic: [0.8, 0.5, 1], flame: [1, 0.55, 0.2] };
hooks.sprites.push((cam, out, ui) => {
  const m = ui.app.stream?.town?.military; if (!m) return;
  const W = ui.app.world.W, MON = ui.data.monsters, G = ui.data.guards;
  for (const [id, guard, kind, x, y, hp] of m.units) {
    const sx = ui.near(x, cam.x, W);
    const def = guard ? G[kind] : MON[kind];
    const c = def?.color || [1, 1, 1], s = guard ? 1 : (def?.size || 1);
    if (def?.fly) { out.push([sx - s, y - 6 - s * 0.6, s * 2, s * 0.8, ...c, 1]); out.push([sx - s * 0.4, y - 6.5 - s * 0.6, s * 0.8, s * 1.2, ...c, 1]); out.push([sx - s * 0.6, y - 0.4, s * 1.2, 0.5, 0, 0, 0, 0.3]); }
    else if (guard) {
      out.push([sx - 0.5, y - 1.1, 1, 1.1, ...c, 1]); out.push([sx - 0.4, y - 2, 0.8, 0.9, 0.93, 0.78, 0.62, 1]);
      out.push([sx - 0.5, y - 2.3, 1, 0.4, 0.6, 0.6, 0.65, 1]);                 // a helmet
      if (picked.includes(id)) out.push([sx - 0.8, y + 0.1, 1.6, 0.35, 1, 0.85, 0.3, 1]);
    } else out.push([sx - s * 0.6, y - s * 1.1, s * 1.2, s * 1.1, ...c, 1]);
  }
});
hooks.overlay.push((cam, out, ui) => {
  const m = ui.app.stream?.town?.military; if (!m) return;
  const W = ui.app.world.W, MON = ui.data.monsters;
  // health bars on anyone hurt
  for (const [, guard, kind, x, y, hp] of m.units) {
    if (hp >= 1) continue;
    const sx = ui.near(x, cam.x, W), s = guard ? 1 : (MON[kind]?.size || 1), top = y - (MON[kind]?.fly ? 8 : s * 1.1 + 1.5);
    out.push([sx - 1, top, 2, 0.35, 0, 0, 0, 0.6]); out.push([sx - 1, top, 2 * hp, 0.35, guard ? 0.4 : 0.95, guard ? 0.9 : 0.3, 0.3, 0.9]);
  }
  // shots: a short streak travelling from shooter to target
  for (const [x0, y0, x1, y1, f, kind] of m.shots) {
    const c = SHOT[kind] || [1, 1, 1];
    const n = kind === 'bolt' || kind === 'flame' ? 6 : 2;
    for (let k = 0; k < n; k++) { const t = kind === 'bolt' || kind === 'flame' ? k / n : Math.min(1, f + k * 0.04); const dx = ((x1 - x0 + W * 1.5) % W) - W / 2; out.push([ui.near(x0 + dx * t, cam.x, W) - 0.3, y0 + (y1 - y0) * t - (kind === 'stone' ? Math.sin(t * Math.PI) * 6 : 0) - 0.3, 0.6, 0.6, ...c, 0.9]); }
  }
  // shield domes
  for (const [x, y, r, e] of m.shields) if (e > 0) for (let k = 0; k < 32; k++) { const a = k / 32 * Math.PI * 2; out.push([ui.near(x + Math.cos(a) * r, cam.x, W) - 0.4, y + Math.sin(a) * r * 0.7 - 0.4, 0.8, 0.8, 0.4, 0.9, 1, 0.35]); }
  // enemies stay visible zoomed out: a red marker that never gets smaller than a few pixels
  const ms = Math.max(1.2, 6 / cam.ppc);
  if (cam.ppc < 4) for (const [, guard, , x, y] of m.units) if (!guard) { const nx = ui.near(x, cam.x, W); out.push([nx - ms / 2, y - ms / 2 - 1, ms, ms, 0.95, 0.15, 0.1, 0.9]); }
  // where the next raid will come from, once it is announced: a pulsing red ring
  const th = m.threat;
  if (th?.sx != null) { const pr = 6 + Math.sin(performance.now() / 250) * 2 + 4 / cam.ppc; const nx = ui.near(th.sx, cam.x, W); for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2; out.push([nx + Math.cos(a) * pr * 2 - ms / 3, th.sy + Math.sin(a) * pr * 2 - ms / 3, ms / 1.5, ms / 1.5, 1, 0.25, 0.15, 0.85]); } }
  // known lairs: a dark marker with a red rim
  const s = Math.max(1, 3 / cam.ppc);
  if (ui.app.layers.lairs !== false) for (const [, , x, y] of m.lairs) { const nx = ui.near(x, cam.x, W); out.push([nx - 2.2 * s, y - 2.2 * s, 4.4 * s, 4.4 * s, 0.85, 0.2, 0.15, 0.85]); out.push([nx - 1.5 * s, y - 1.5 * s, 3 * s, 3 * s, 0.1, 0.05, 0.05, 0.95]); }
  // the patrol being drawn
  if (patrolPts) for (const [x, y] of patrolPts) out.push([ui.near(x, cam.x, W) - 1, y - 1, 2, 2, 1, 0.85, 0.3, 0.8]);
});
// tapping a lair (the dark square with a red rim) says what lives there (play-test 1: "unclickable,
// so I have no idea what they are")
hooks.tap.push((p, ui) => {
  const m = ui.app.stream?.town?.military; if (!m || ui.app.layers.lairs === false) return false;
  const cam = ui.camera()?.cam; if (!cam) return false;
  const W = ui.app.world.W, r = Math.max(3, 3 / cam.ppc * 2.5, 14 / cam.ppc);
  const hit = m.lairs.find(([, , x, y]) => Math.hypot(ui.near(x, p.x, W) - p.x, y - p.y) < r);
  if (!hit) return false;
  const [, kind] = hit, L = ui.data.lairs?.[kind] || {}, MON = ui.data.monsters || {};
  const who = [...new Set(L.spawn || [])].map(k => MON[k]?.name || k).join(', ');
  ui.sheet(`<b>${ui.esc(L.name || 'Lair')}</b><br>Home of ${ui.esc(who || 'monsters')}. ${L.night ? 'They come out at night' : `A pack comes out about every ${L.every || 5} days`} and goes for whatever is nearest and weakest.<br><small>Guards posted or patrolling nearby fight them off. Hide these marks in Info → Views.</small>`, 10000);
  return true;
});
hooks.keys.push((e, ui) => { if (e.code === 'KeyG') { ui.app.openTabSet?.('guards'); return true; } return false; });
