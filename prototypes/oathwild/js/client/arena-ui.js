// The arena in the browser (brainstorm 2026-11-27 §2c-§2g): the match panel (wave x/5, enemies left, the breather's
// count-down, which gate the next pack comes from — lessons rule 67), markers at the screen's edge pointing at that gate
// and at every enemy you cannot see, a short banner when a wave starts / the match ends, the crowd and the gates
// (render/arena-draw.js) following the match, the bracket board as a thing you use in the court, and the arena's
// windows (win-arena.js: the board + the champions' ladder; win-arena-chest.js: your reward chest).
//
//   installArena(app)      once (main.js). app.arena = the last match view; app.arenaUi = { spots(), use(it) } (play.js)
import { placeOf } from './place.js';
import { esc } from './ui/kit.js';
import { glyph } from './ui/icons.js';
import { fmt } from '../../../../shared/format.js';

const WIN = { arena: 'arena', ladder: 'arena', arenaChest: 'arena-chest' };

export function installArena(app) {
  let el = null, edge = null, banner = null, bannerTimer = 0, raf = 0;
  const S = { view: null };
  app.arenaUi = {
    /** Things to use in the arena court (play.js interactables): the bracket board. */
    spots() {
      if (placeOf(app) !== 'arena') return [];
      const L = app.W.arena; if (!L) return [];
      return [{ kind: 'arena', id: 'board', name: 'the Bracket Board', r: 4.5, bias: -0.3, h: 2.2, text: 'Read the Bracket Board', x: L.board[0], z: L.board[1] }];
    },
    use() { app.act('arena-board'); },
    /** The match panel with a given view, wherever you are (the screen walk, tests/walk.mjs). */
    preview(view) { S.view = view; mount(); draw(); },
  };
  app.on('win', m => {
    const name = WIN[m.kind];
    if (!name) return;
    app.openWindow(name, m);
  });
  app.on('arena', m => {
    if (m.view) { S.view = m.view; app.arena = m.view; draw(); app.emit('arenaView', m.view); }
    if (m.event) onEvent(m);
  });
  app.on('screen', name => { if (name === 'play' && placeOf(app) === 'arena') mount(); else unmount(); });
  app.on('place', kind => { if (kind !== 'arena') unmount(); });

  function onEvent(m) {
    const av = app.worldView?.arena;
    if (m.event === 'wave') {
      flash(m.champion ? `${m.name}` : `Wave ${fmt(m.wave)} of ${fmt(m.of)}`, m.champion ? 'Champion bout' : m.boss ? `A boss comes out` : m.brute ? 'A brute comes out' : `${fmt(m.total)} to beat`);
      av?.cheer(0.8); app.sfx('quest.complete');
    } else if (m.event === 'pack') {
      av?.gate(m.gate, true); setTimeout(() => av?.gate(m.gate, false), 4500);
      av?.cheer(m.boss || m.brute || m.champion ? 0.9 : 0.5);
      const who = m.names?.length > 1 ? `${fmt(m.names.length)} × ${m.names[0]}` : m.names?.[0] || 'Something';
      app.play?.hud?.log(`${who} — out of ${m.gateName}.`, 'quest');
    } else if (m.event === 'breather') {
      flash('Breather', `${fmt(m.seconds)} s to the next wave${m.heal ? ' · water-bearers restore you' : ''}`); av?.cheer(0.6);
    } else if (m.event === 'won') { flash('Victory!', 'Your reward chest waits in the court'); av?.cheer(1); app.sfx('levelup'); }
    else if (m.event === 'lost') { flash('Defeat', 'Back to the court — your experience is kept'); av?.cheer(0.3); }
  }

  // ---------------------------------------------------------------- the panel
  function mount() {
    const hud = document.getElementById('hud'); if (!hud) return;
    if (!el || !hud.contains(el)) {
      el = document.createElement('section'); el.className = 'arena-panel'; el.setAttribute('aria-label', 'Arena match'); hud.append(el);
      edge = document.createElement('div'); edge.className = 'arena-edge'; edge.setAttribute('aria-hidden', 'true'); hud.append(edge);
      banner = document.createElement('div'); banner.className = 'arena-banner'; banner.hidden = true; hud.append(banner);
    }
    document.body.classList.add('in-arena');
    draw();
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function unmount() { document.body.classList.remove('in-arena'); el?.remove(); edge?.remove(); banner?.remove(); el = edge = banner = null; cancelAnimationFrame(raf); raf = 0; }
  function flash(title, sub) {
    if (!banner) return;
    banner.innerHTML = `<b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`;
    banner.hidden = false; banner.classList.remove('go'); void banner.offsetWidth; banner.classList.add('go');
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { if (banner) banner.hidden = true; }, 2600);
  }
  const gateName = id => S.view?.gates?.find(g => g.id === id)?.name || 'a gate';
  function draw() {
    if (!el) return;
    const v = S.view || { state: 'idle' };
    const chests = v.chests || [];
    if (v.state === 'idle' || !v.state) {
      el.dataset.state = 'idle';
      el.innerHTML = `<h4>${glyph('sword', 16)} The Arena</h4><p>${chests.length ? `<b class="ow-gold">${fmt(chests.length)} reward chest${chests.length > 1 ? 's' : ''}</b> by the board` : 'Pick a bracket at the board by the gate'}</p>`;
      return;
    }
    el.dataset.state = v.state;
    const left = `${fmt(v.left)} ${v.kind === 'champion' ? '' : v.left === 1 ? 'enemy left' : 'enemies left'}`.trim();
    let line = '';
    if (v.state === 'gather') line = `Gates open in <b>${fmt(Math.ceil(v.timer))} s</b>`;
    else if (v.state === 'breather') line = `Breather — next wave in <b>${fmt(Math.ceil(v.timer))} s</b>`;
    else if (v.state === 'won') line = '<b class="ow-good">Won!</b> Back to the court in a moment';
    else if (v.state === 'lost') line = '<b class="ow-bad">Everyone fell</b>';
    else if (v.kind === 'champion') line = v.champHp != null ? `<div class="hud-bar hud-hp sm arena-champ"><i class="hud-fill" style="width:${Math.round(100 * v.champHp / Math.max(1, v.champMax))}%"></i></div>` : '';
    else line = v.next ? `Next from <b>${esc(gateName(v.next.gate))}</b> in ${fmt(Math.ceil(v.next.in))} s` : (v.left ? 'Beat what is left' : '');
    const wave = v.kind === 'champion' ? 'Champion bout' : `Wave <b>${fmt(Math.max(1, v.wave))}</b> / ${fmt(v.of)}`;
    el.innerHTML = `<h4>${glyph('sword', 16)} ${esc(v.name || 'Match')}</h4>
      <div class="arena-row"><span>${wave}</span>${v.state === 'wave' || v.state === 'bout' ? `<span class="arena-left">${left}</span>` : ''}</div>
      <div class="arena-row arena-sub">${line}</div>
      ${v.kind !== 'champion' ? `<div class="arena-pips">${Array.from({ length: v.of || 5 }, (_, i) => `<i class="${i + 1 < v.wave || (i + 1 === v.wave && v.state === 'breather') || v.state === 'won' ? 'done' : i + 1 === v.wave ? 'now' : ''}${i === 2 ? ' brute' : ''}${i === 4 ? ' boss' : ''}"></i>`).join('')}</div>` : ''}`;
  }
  // the edge markers (every frame): the gate of the next pack, and every enemy of the match off screen
  function frame() {
    raf = requestAnimationFrame(frame);
    if (!edge || !app.play?.screenOf) return;
    const v = S.view;
    const marks = [];
    if (v && (v.state === 'wave' || v.state === 'gather' || v.state === 'breather')) {
      const gid = v.state === 'wave' && v.next ? v.next.gate : v.gate;
      const g = gid && v.gates?.find(x => x.id === gid);
      if (g) marks.push({ x: g.at[0], z: g.at[1], h: 3, cls: 'gate', text: g.name.replace(/^the /, '') });
    }
    if (v && (v.state === 'wave' || v.state === 'bout')) {
      const S2 = app.play.S;
      for (const id of v.foes || []) { const u = S2?.units?.get(id); if (u && !u.downed) marks.push({ x: u.x, z: u.z, h: 1.2, cls: 'foe' }); }
    }
    const W = innerWidth, H = innerHeight, pad = 34;
    const html = [];
    for (const m of marks.slice(0, 16)) {
      const p = app.play.screenOf(m.x, m.z, m.h);
      const on = p && p.x > pad && p.x < W - pad && p.y > pad && p.y < H - pad;
      if (on && m.cls === 'foe') continue;                       // seen: its own name plate shows it
      let x, y, ang;
      if (on) { x = p.x; y = p.y; ang = null; }
      else {
        // where it is relative to the camera's forward → a point on the screen's edge
        const cam = app.play.cam, f = cam?.forward?.() || { x: 0, z: -1 }, r = cam?.right?.() || { x: 1, z: 0 };
        const me = app.play.meState?.(); if (!me) continue;
        const dx = m.x - me.x, dz = m.z - me.z;
        const sx = dx * r.x + dz * r.z, sy = -(dx * f.x + dz * f.z);
        ang = Math.atan2(sy, sx);
        // the markers keep inside a box clear of the HUD's top row (hero panel, minimap, menu) and the bottom buttons
        const top = H < 800 ? 170 : 130, bottom = H < 800 ? 260 : 150;
        const cx = W / 2, cy = (top + H - bottom) / 2, hw = W / 2 - pad, hh = (H - bottom - top) / 2;
        const k = Math.min(hw / Math.max(1e-3, Math.abs(Math.cos(ang))), hh / Math.max(1e-3, Math.abs(Math.sin(ang))));
        x = cx + Math.cos(ang) * k; y = cy + Math.sin(ang) * k;
      }
      html.push(`<div class="arena-mark ${m.cls}${on ? ' on' : ''}" style="transform:translate(${Math.round(x)}px,${Math.round(y)}px)">${ang != null ? `<i style="transform:rotate(${Math.round(ang * 180 / Math.PI)}deg)"></i>` : ''}${m.text ? `<span>${esc(m.text)}</span>` : ''}</div>`);
    }
    const s = html.join('');
    if (edge.dataset.s !== s) { edge.dataset.s = s; edge.innerHTML = s; }
  }
}
