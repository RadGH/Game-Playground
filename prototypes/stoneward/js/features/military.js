// Defence on screen (M6 + M7, play-test 2): every town raises and runs its OWN guards (owner: "I
// don't want to micromanage people at all"), so there is no Guards tab any more. What is left for the
// player is the Army tab: plant up to three ATTACK FLAGS — the troops a town can spare gather and
// march out together, fight whatever is there, burn lairs and bandit camps, raid rival towns; a flag
// can be moved (they follow) or cleared (they come home). Also here: Info → Military (garrison, the
// threat meter, known lairs, recent attacks), guards and monsters on the map — every enemy carries
// red so it reads at a glance at any zoom — shots, shield domes, lair markers, the raid banner, and
// dropping back to 1x when an attack starts (a setting).

import { hooks } from '../ui/hooks.js';

let flagTool = null;      // { moving: flag id | null }
const near = (ui, x) => ui.near(x, ui.camera().cam.x, ui.app.world.W);

hooks.tabs.push({
  id: 'army', label: 'Army', tool: true,
  render(ui) {
    if (flagTool && !ui.camera()?.tool?.feature) flagTool = null;        // another tab took the tool
    const m = ui.app.stream?.town?.military;
    const p = ui.panel('');
    const flags = m?.flags || [];
    const gar = m?.garrison || [];
    const card = document.createElement('div'); card.className = 'card';
    card.innerHTML = `<b>Your guards</b><span>${gar.map(g => `${ui.esc(g.name)}: ${g.have} of ${g.want}${g.wards ? ` in ${g.wards} ward${g.wards > 1 ? 's' : ''}` : ''}${g.war ? ' · <span style="color:var(--red)">at war</span>' : ''}`).join(' · ') || 'none yet'}</span><span><small>About 1 in 10 people serve as guards. Each walks its own ward (a part of town, a farm or a far mine) and fights what comes there; archers man the wall towers. Barracks and guard posts add more. While a flag is up, towns call up extra and keep sending them.</small></span>`;
    p.append(card);
    const row = document.createElement('div'); row.className = 'row';
    row.append(ui.info(ui.btn(flagTool && !flagTool.moving ? 'Tap the map…' : '⚑ Plant an attack flag', () => startFlag(ui, null)), 'tool:flag'));
    if (flags.length) row.append(ui.btn('Clear all flags', async () => { await ui.link().order({ t: 'flag.clear' }); ui.toast('The troops come home.', 'good'); stopFlag(ui); }));
    p.append(row);
    for (const f of flags) {
      const c = document.createElement('div'); c.className = 'row';
      const what = { waiting: 'waiting for troops', gather: 'gathering', march: 'marching', fight: 'fighting' }[f.state] || f.state;
      const lbl = document.createElement('span'); lbl.textContent = `⚑ Flag ${f.id}: ${f.troops} troops, ${what}${f.sent ? ` · ${f.sent} sent as help` : ''}`;
      c.append(lbl, ui.btn('Show', () => ui.camera().flyTo(f.x, f.y, Math.max(2.5, ui.camera().cam.ppc), 700)), ui.btn(flagTool?.moving === f.id ? 'Tap where…' : 'Move', () => startFlag(ui, f.id)), ui.btn('Clear', async () => { await ui.link().order({ t: 'flag.clear', id: f.id }); ui.toast('Those troops come home.', 'good'); }));
      p.append(c);
    }
    p.append(ui.hint(flagTool ? (flagTool.moving ? 'Tap where the flag should go. The troops follow.' : 'Tap where your troops should attack: a lair, a bandit camp, a rival town or enemies on the move.') : 'A flag sends the guards your towns can spare, in one band, to fight there. Lairs and camps in its circle are burned once their defenders fall.'));
  },
});
function startFlag(ui, moving) {
  flagTool = { moving, feature: true };
  ui.setTool({
    feature: true,
    up: async (pt, e, tap) => {
      if (!tap) return;
      const r = moving ? await ui.link().order({ t: 'flag.move', id: moving, x: pt.x, y: pt.y }) : await ui.link().order({ t: 'flag.add', x: pt.x, y: pt.y });
      if (r?.error) ui.toast(r.error, 'bad');
      else if (moving) ui.toast('The flag moves; the troops follow.', 'good');
      else ui.toast(r?.warn || `Flag planted: ${r?.troops} troops will march out together.`, r?.warn ? 'bad' : 'good');
      stopFlag(ui);
    },
  });
  ui.refreshDock();
}
function stopFlag(ui) { flagTool = null; if (ui.camera()?.tool?.feature) ui.setTool(null); ui.refreshDock(); }
// tapping a planted flag: what it is doing, with Move and Clear
hooks.tap.push((p, ui) => {
  if (flagTool && !ui.camera()?.tool?.feature) flagTool = null;
  const m = ui.app.stream?.town?.military; if (!m?.flags?.length || flagTool) return false;
  const cam = ui.camera()?.cam; if (!cam) return false;
  const W = ui.app.world.W, r = Math.max(3, 14 / cam.ppc);
  const f = m.flags.find(f => Math.hypot(ui.near(f.x, p.x, W) - p.x, f.y - 3 - p.y) < r);
  if (!f) return false;
  const el = ui.sheet(`<b>⚑ Attack flag</b><br>${f.troops} troops · ${{ waiting: 'waiting for troops to spare', gather: 'gathering at the edge of town', march: 'marching', fight: 'fighting' }[f.state] || f.state}.<br><small>Anything hostile inside the circle is fought; a lair or camp there is burned once its defenders fall.</small>`, 9000);
  const row = document.createElement('div'); row.className = 'row';
  row.append(ui.btn('Move', () => { el.classList.add('hidden'); ui.app.openTabSet?.('army'); startFlag(ui, f.id); }), ui.btn('Clear', async () => { el.classList.add('hidden'); await ui.link().order({ t: 'flag.clear', id: f.id }); ui.toast('Those troops come home.', 'good'); }));
  el.append(row);
  return true;
});

// ---------------------------------------------------------------- Info → Military
hooks.infoTabs.push({
  id: 'military', label: 'Military',
  render(ui, head) {
    const m = ui.app.stream?.town?.military; const p = ui.panel(''); p.append(head);
    if (!m) return;
    const t = m.threat;
    const card = document.createElement('div'); card.className = 'card';
    const lvl = Math.min(5, Math.ceil((t?.strength || 0) / 3));
    card.innerHTML = `<b>Threat ${'█'.repeat(lvl)}${'░'.repeat(5 - lvl)}</b><span>${t ? (t.inSecs > 0 ? `Next raid in about ${fmtSecs(t.inSecs)} · about ${t.strength} raiders${t.from ? ' · from the ' + t.from : ''}${t.toward ? ' · toward ' + ui.esc(t.toward) : ''}` : 'A raid is on now') : 'No raids planned'}</span><span>${m.guards.length} guards (your towns raise them) · ${m.enemies} enemies about · ${m.lairs.length} known lairs</span>`;
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
// ---- enemies near your towns: a ⚔ pill on the row under the top bar (never in the top bar — it pushed
// the speed button off an iPhone screen) (tap to look at the next one) and arrows at
// the screen edge pointing at any that are off screen
let pill = null, pillIdx = 0;
hooks.tick.push((msg, ui) => {
  const near = ui.app.stream?.town?.military?.near || [];
  if (!pill) {
    pill = document.createElement('button'); pill.className = 'enemy-pill hidden';
    pill.addEventListener('click', () => { const list = ui.app.stream?.town?.military?.near || []; if (!list.length) return; const [x, y] = list[pillIdx++ % list.length]; ui.camera()?.flyTo(x, y, Math.max(2.5, ui.camera().cam.ppc), 700); });
    document.querySelector('.where')?.append(pill);
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
  const blink = Math.sin(performance.now() / 160) > 0;
  for (const [id, guard, kind, x, y, hp, mode, , frozen] of m.units) {
    const sx = ui.near(x, cam.x, W);
    const def = guard ? G[kind] : MON[kind];
    const c = frozen ? [0.7, 0.9, 1] : def?.color || [1, 1, 1], s = guard ? 1 : (def?.size || 1);
    if (def?.fly) {
      // flyers are never hidden by buildings (no foot)
      out.push([sx - s - 0.3, y - 6.3 - s * 0.6, s * 2 + 0.6, s * 0.8 + 0.6, 0.95, 0.1, 0.08, 1]);
      out.push([sx - s, y - 6 - s * 0.6, s * 2, s * 0.8, ...c, 1]); out.push([sx - s * 0.4, y - 6.5 - s * 0.6, s * 0.8, s * 1.2, ...c, 1]); out.push([sx - s * 0.6, y - 0.4, s * 1.2, 0.5, 0, 0, 0, 0.3]);
    } else if (guard) {
      const up = mode === 'wall' ? 0 : 0;
      out.push([sx - 0.5, y - 1.1 - up, 1, 1.1, ...c, 1, y]); out.push([sx - 0.4, y - 2 - up, 0.8, 0.9, 0.93, 0.78, 0.62, 1, y]);
      out.push([sx - 0.5, y - 2.3 - up, 1, 0.4, 0.6, 0.6, 0.65, 1, y]);                 // a helmet
      out.push([sx - 0.45, y - 1.05, 0.9, 0.25, 0.25, 0.45, 0.9, 1, y]);                 // a blue sash: one of ours
    } else {
      // an enemy: a red outline and a red cap so it reads at a glance at any zoom (play-test 2)
      out.push([sx - s * 0.6 - 0.3, y - s * 1.1 - 0.3, s * 1.2 + 0.6, s * 1.1 + 0.6, 0.95, 0.1, 0.08, 1, y]);
      out.push([sx - s * 0.6, y - s * 1.1, s * 1.2, s * 1.1, ...c, 1, y]);
      out.push([sx - s * 0.35, y - s * 1.1 - 0.7, s * 0.7, 0.55, 1, 0.12, 0.1, 1, y]);
      if (blink && cam.ppc > 1.5) out.push([sx - 0.25, y - s * 1.1 - 1.6, 0.5, 0.5, 1, 0.2, 0.15, 1]);
    }
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
  if (cam.ppc < 3) for (const [, guard, , x, y] of m.units) if (!guard) { const nx = ui.near(x, cam.x, W); out.push([nx - ms / 2 - 0.4 / cam.ppc, y - ms / 2 - 1 - 0.4 / cam.ppc, ms + 0.8 / cam.ppc, ms + 0.8 / cam.ppc, 0, 0, 0, 0.7]); out.push([nx - ms / 2, y - ms / 2 - 1, ms, ms, 0.95, 0.15, 0.1, 0.95]); }
  // attack flags: a pole and a gold banner, the circle the troops fight in, and the gathering point
  const t2 = performance.now() / 1000;
  for (const f of m.flags || []) {
    const fx = ui.near(f.x, cam.x, W), sc = Math.max(1, 2.5 / cam.ppc);
    for (let k = 0; k < 40; k++) { const a = k / 40 * Math.PI * 2; out.push([fx + Math.cos(a) * f.r - 0.4 * sc, f.y + Math.sin(a) * f.r - 0.4 * sc, 0.8 * sc, 0.8 * sc, 1, 0.8, 0.3, 0.35]); }
    out.push([fx - 0.3 * sc, f.y - 7 * sc, 0.6 * sc, 7 * sc, 0.35, 0.25, 0.15, 1]);
    const wave = Math.sin(t2 * 4) * 0.4;
    out.push([fx + 0.3 * sc, f.y - 7 * sc, 3.2 * sc, 2 * sc + wave * sc, 0.95, 0.75, 0.2, 1]);
    out.push([fx + 0.3 * sc, f.y - 6 * sc, 3.2 * sc, 0.5 * sc, 0.8, 0.2, 0.15, 1]);
    if (f.state === 'gather' && f.gx != null) { const gx = ui.near(f.gx, cam.x, W); for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; out.push([gx + Math.cos(a) * 8 - 0.3, f.gy + Math.sin(a) * 8 - 0.3, 0.6, 0.6, 1, 0.85, 0.4, 0.4]); } }
  }
  // where the next raid will come from, once it is announced: a pulsing red ring
  const th = m.threat;
  if (th?.sx != null) { const pr = 6 + Math.sin(performance.now() / 250) * 2 + 4 / cam.ppc; const nx = ui.near(th.sx, cam.x, W); for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2; out.push([nx + Math.cos(a) * pr * 2 - ms / 3, th.sy + Math.sin(a) * pr * 2 - ms / 3, ms / 1.5, ms / 1.5, 1, 0.25, 0.15, 0.85]); } }
  // known lairs: a dark marker with a red rim
  const s = Math.max(1, 3 / cam.ppc);
  if (ui.app.layers.lairs !== false) for (const [, , x, y] of m.lairs) { const nx = ui.near(x, cam.x, W); out.push([nx - 2.2 * s, y - 2.2 * s, 4.4 * s, 4.4 * s, 0.85, 0.2, 0.15, 0.85]); out.push([nx - 1.5 * s, y - 1.5 * s, 3 * s, 3 * s, 0.1, 0.05, 0.05, 0.95]); }
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
  const el = ui.sheet(`<b>${ui.esc(L.name || 'Lair')}</b><br>Home of ${ui.esc(who || 'monsters')}. ${L.night ? 'They come out at night' : `A pack comes out about every ${L.every || 5} days`} and goes for whatever is nearest and weakest.<br><small>Plant an attack flag on it (Army tab) and your troops will burn it. Hide these marks in Info → Views.</small>`, 10000);
  const row = document.createElement('div'); row.className = 'row';
  row.append(ui.btn('⚑ Attack it', async () => { el.classList.add('hidden'); const r = await ui.link().order({ t: 'flag.add', x: hit[2], y: hit[3] }); ui.toast(r?.error || r?.warn || `Flag planted: ${r?.troops} troops march on it.`, r?.error || r?.warn ? 'bad' : 'good'); }));
  el.append(row);
  return true;
});
hooks.keys.push((e, ui) => { if (e.code === 'KeyG') { document.querySelector('#dock-tabs [data-tab="army"]')?.click(); return true; } return false; });
