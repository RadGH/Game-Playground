// PATCHWORK PAL on a screen. One SVG board in the sim's own units (160 x 120), so a tap is converted with the SVG's
// matrix and means the same on every screen: a gilded frame on purple wallpaper holding a stitched monster face (round,
// square or pear, in a pastel skin with two cloth patches and stitches). Show: the face with every part on and a gold
// ring pulsing round each. Place: the bare face (hung where the sim says, on Tricky), the part to place drawn big on a
// tray below ("Pin the HAT!"), and the parts YOU have already stuck on (only yours: nobody sees anyone else's until
// the gallery). Gallery: one small frame per player with their monster as they built it, faint rings where each part
// should have gone, their name and points; the best builder gets a ribbon.
import { esc, chip } from '../../client/gamehud.js';
import { createTunes } from '../../client/tunes.js';
import { BW, BH, HEAD, PARTS } from './sim.js';

const INK = '#1a0f26';
const O = (w = 1.2) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
/** Each part drawn round its own spot (0, 0); f = mirrored (the left-hand bolt, patch or bow). */
export const PART_SVG = {
  eyeL: () => `<circle r="7" fill="#fff" ${O()}/><circle cx="1.5" cy="1.5" r="3.4" fill="${INK}"/><circle cx="0.4" cy="0.2" r="1" fill="#fff"/>`,
  eyeR: () => `<circle r="6.2" fill="#fff" ${O()}/><circle cx="-1.2" cy="1.8" r="3" fill="${INK}"/><circle cx="-2" cy="0.8" r=".9" fill="#fff"/>`,
  nose: () => `<circle r="4.2" fill="#ff7a8a" ${O()}/><circle cx="-1.3" cy="-.4" r=".8" fill="${INK}"/><circle cx="1.3" cy="-.4" r=".8" fill="${INK}"/>`,
  grin: () => `<path d="M-12 -3 Q0 8 12 -3" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>${[-8, -4, 0, 4, 8].map(x => `<path d="M${x} ${-2 + Math.abs(x) * -0.16 + 3.6} l0 3.4" stroke="${INK}" stroke-width="1.1"/>`).join('')}`,
  hat: () => `<path d="M-16 6 Q0 1 16 6 Q0 10 -16 6 Z" fill="#3a2a5a" ${O()}/><path d="M-9 5 L2 -16 Q4 -19 7 -18 L9 5 Z" fill="#4a3478" ${O()}/><rect x="-8.5" y="1" width="17" height="3" fill="#ff8a1a"/>`,
  bolt: () => `<rect x="-6" y="-3" width="12" height="6" rx="1.5" fill="#b8c4cc" ${O()}/><rect x="-8" y="-4.5" width="3" height="9" rx="1" fill="#8a96a0" ${O(1)}/>`,
  patch: () => `<path d="M0 6 C-9 -1 -7 -8 -2.5 -6 C-1 -5.4 0 -4 0 -3 C0 -4 1 -5.4 2.5 -6 C7 -8 9 -1 0 6 Z" fill="#ff8fb8" ${O()}/><path d="M-4 -2 l1.5 1.5 M4 -2 l-1.5 1.5 M0 3 v-1.6" stroke="#fff" stroke-width=".9"/>`,
  bow: () => `<path d="M0 0 L-9 -6 Q-11 0 -9 6 Z M0 0 L9 -6 Q11 0 9 6 Z" fill="#ff7ab8" ${O()}/><circle r="2.6" fill="#ff4f9a" ${O(1)}/>`,
};
const partAt = (k, x, y, f, cls = '', s = 1) => `<g class="pw-part ${cls}" transform="translate(${x} ${y}) scale(${f ? -s : s} ${s})">${PART_SVG[k]()}</g>`;
/** The bare face (+ hang transform), in board units. */
function faceSvg(look, skins, hang) {
  const [cx, cy] = HEAD, skin = skins[look.skin], patch = skins[(look.patch + (look.patch === look.skin ? 1 : 0)) % skins.length];
  const body = look.shape === 'square' ? `<rect x="${cx - 32}" y="${cy - 34}" width="64" height="66" rx="16" fill="${skin}" ${O(1.6)}/>`
    : look.shape === 'pear' ? `<path d="M${cx - 22} ${cy - 30} Q${cx} ${cy - 40} ${cx + 22} ${cy - 30} Q${cx + 40} ${cy + 10} ${cx + 30} ${cy + 28} Q${cx} ${cy + 40} ${cx - 30} ${cy + 28} Q${cx - 40} ${cy + 10} ${cx - 22} ${cy - 30} Z" fill="${skin}" ${O(1.6)}/>`
      : `<ellipse cx="${cx}" cy="${cy}" rx="34" ry="35" fill="${skin}" ${O(1.6)}/>`;
  const st = look.stitch, px = cx - 26 + (st % 4) * 3, py = cy + 8 + (st % 3) * 3;
  const deco = `<path d="M${px} ${py} h12 v10 h-12 Z" fill="${patch}" ${O(1)}/><path d="M${cx + 10} ${cy - 30} l12 3 -2 9 -12 -3 Z" fill="${patch}" ${O(1)}/>
    <path d="M${cx - 2} ${cy - 34} q-4 6 0 12" fill="none" stroke="${INK}" stroke-width="1" stroke-dasharray="2 1.6"/>${[0, 1, 2].map(i => `<path d="M${cx - 5 + i * 0} ${cy - 31 + i * 4} h6" stroke="${INK}" stroke-width=".9"/>`).join('')}`;
  const tr = hang ? `transform="translate(${hang.dx} ${hang.dy}) translate(${cx} ${cy}) scale(${hang.s}) translate(${-cx} ${-cy})"` : '';
  return `<g ${tr}><path d="M${cx - 14} ${cy + 30} v14 h28 v-14" fill="${skin}" ${O(1.4)}/>${body}${deco}</g>`;
}
const frameSvg = () => `<rect x="2" y="2" width="${BW - 4}" height="${BH - 4}" rx="6" fill="#3a2460" stroke="#d9a52b" stroke-width="4"/><rect x="7" y="7" width="${BW - 14}" height="${BH - 14}" rx="4" fill="none" stroke="#8a5a10" stroke-width="1"/>`;

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null;
  const byPid = new Map(players.map(p => [p.pid, p]));
  ui.innerHTML = `
    <div class="pw-top"><span class="pw-title">Patchwork Pal</span><span class="pw-round"></span><span class="clock"><b>--</b></span></div>
    <div class="pw-banner"></div>
    <div class="pw-boardwrap"><svg class="pw-board" viewBox="0 0 ${BW} ${BH}" preserveAspectRatio="xMidYMid meet"></svg><div class="pw-hint"></div></div>
    <div class="pw-gallery"></div>
    <div class="pw-tray"><svg viewBox="-24 -24 48 48" class="pw-traypic"></svg><span class="pw-trayname"></span></div>
    <div class="pw-players">${players.map(p => chip(p, '<em class="sc">0</em><strong class="pw-st"></strong>')).join('')}</div>
    <p class="pw-note"></p>`;
  const $ = s => ui.querySelector(s);
  const svg = $('.pw-board'), tunes = createTunes({ volume: 0.2 });
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (me != null) ui.querySelector(`.pw-players [data-pid="${me}"]`)?.classList.add('me');
  let phase = '', round = -1, n = -1, mine = [], last = null;

  function board(g, extra = '') { svg.innerHTML = frameSvg() + (g.look ? faceSvg(g.look, init.skins, g.phase === 'show' ? null : g.hang) : '') + extra; }
  function paintPlace(g) {
    const pins = mine.map(m => partAt(m.k, m.p[0], m.p[1], m.f, 'stuck')).join('');
    board(g, pins);
    $('.pw-traypic').innerHTML = g.cur ? partAt(g.cur, 0, 0, g.cf, "", 1.25) : '';
    $('.pw-trayname').textContent = g.cur ? (placedNow(g) ? 'Stuck on!' : `the ${PARTS[g.cur].name}`) : '';
  }
  const placedNow = g => me != null && g.placed?.includes(me);
  svg.addEventListener('pointerdown', e => {
    const g = last; if (watching || !g || g.phase !== 'place' || placedNow(g) || mine.some(m => m.n === g.n)) return;
    const mtx = svg.getScreenCTM(); if (!mtx) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(mtx.inverse());
    if (pt.x < 0 || pt.x > BW || pt.y < 0 || pt.y > BH) return;
    const p = [Math.round(pt.x * 10) / 10, Math.round(pt.y * 10) / 10];
    mine.push({ n: g.n, k: g.cur, f: g.cf, p }); ctx.send('pin', { n: g.n, p }); ctx.sfx('pick'); tunes.fx('pop', 1.2);
    paintPlace({ ...g, placed: [...(g.placed || []), me] }); paintNote(g, true);
  });
  function gallery(g) {
    const G = g.gallery, list = players;
    const real = `<figure class="pw-pic real"><svg viewBox="0 0 ${BW} ${BH}">${frameSvg()}${faceSvg(g.look, init.skins, g.hang)}${g.parts.map(q => partAt(q.k, q.x, q.y, q.f)).join('')}</svg><figcaption>✨ The real pal</figcaption></figure>`;
    $('.pw-gallery').innerHTML = real + list.map(p => {
      const pins = G.pins[p.pid] || [], rings = g.parts.map(q => `<circle cx="${q.x}" cy="${q.y}" r="3.2" fill="none" stroke="#ffd23f" stroke-width="1" stroke-dasharray="1.5 1.2" opacity=".85"/>`).join('');
      const lines = g.parts.map((q, j) => pins[j] ? `<line x1="${pins[j][0]}" y1="${pins[j][1]}" x2="${q.x}" y2="${q.y}" stroke="${p.color}" stroke-width=".9" stroke-dasharray="2 1.2"/>` : '').join('');
      const parts = g.parts.map((q, j) => pins[j] ? partAt(q.k, pins[j][0], pins[j][1], q.f) : '').join('');
      const best = G.best.includes(p.pid) && players.length > 1;
      return `<figure class="pw-pic${p.pid === me ? ' me' : ''}${best ? ' best' : ''}" style="--seat:${p.color}"><svg viewBox="0 0 ${BW} ${BH}">${frameSvg()}${faceSvg(g.look, init.skins, g.hang)}${rings}${lines}${parts}</svg>
        <figcaption>${best ? '🎀 ' : ''}${esc(p.pid === me ? 'You' : p.name)} <b>+${G.gain[p.pid]}</b></figcaption></figure>`;
    }).join('');
    $('.pw-gallery').dataset.n = list.length + 1;
  }
  function enter(g) {
    if (g.phase === 'show') { mine = []; board(g, g.parts.map(q => `<g class="pw-ring"><circle cx="${q.x}" cy="${q.y}" r="9" fill="none" stroke="#ffd23f" stroke-width="1.4"/></g>` + partAt(q.k, q.x, q.y, q.f)).join('')); ctx.sfx('open'); tunes.fx('chime', 1); }
    if (g.phase === 'gallery') { gallery(g); if (me != null) ctx.sfx(g.gallery.best.includes(me) ? 'win' : g.gallery.gain[me] > 0 ? 'good' : 'bad'); }
    if (g.phase === 'end') { ctx.sfx('win'); tunes.stop(); }
  }
  function paintNote(g, justPlaced = false) {
    let t = '';
    if (g.phase === 'ready') t = 'A patchwork pal is coming… remember where every part goes!';
    else if (g.phase === 'show') t = 'Remember every part!';
    else if (g.phase === 'place') t = watching ? `${g.placed.length} of ${players.length} stuck on` : placedNow(g) || justPlaced ? 'Stuck! Waiting for the next part…' : `Tap ONCE where the ${PARTS[g.cur].name} goes — on the face!`;
    else if (g.phase === 'gallery') { const w = g.gallery.best.map(p => byPid.get(p)?.name); t = players.length > 1 && w.length ? `${w.join(' and ')} stitched it best!` : me != null ? `+${g.gallery.gain[me]} points` : ''; }
    else if (g.phase === 'end') {
      if (init.solo && me != null) { const s = g.scores[me], m = init.medals; t = `${s} of ${init.max} — ${s >= m[2] ? 'GOLD medal!' : s >= m[1] ? 'SILVER medal!' : s >= m[0] ? 'BRONZE medal!' : `bronze needs ${m[0]}`}`; }
      else t = 'What a lovely bunch of pals! Most points wins.';
    }
    $('.pw-note').textContent = t;
  }
  function paintChips(g) {
    for (const p of players) {
      const el = ui.querySelector(`.pw-players [data-pid="${p.pid}"]`); el.querySelector('.sc').textContent = g.scores[p.pid];
      const st = el.querySelector('.pw-st'); let t = '', cls = '';
      if (g.phase === 'place') { const ok = g.placed.includes(p.pid); t = ok ? 'stuck' : 'aiming…'; cls = ok ? 'in' : ''; }
      if (g.phase === 'gallery') { t = `+${g.gallery.gain[p.pid]}`; cls = g.gallery.best.includes(p.pid) ? 'best' : ''; }
      st.textContent = t; st.className = 'pw-st ' + cls;
    }
  }
  return {
    priv(d) { if (last?.phase === 'place' && d.pins && d.pins.length > mine.length) { mine = d.pins.map(q => ({ n: -1, ...q })); paintPlace(last); } },
    state(g) {
      last = g;
      if (g.phase !== phase || g.round !== round) { if (round === -1 && g.round >= 0) tunes.start('spooky'); phase = g.phase; round = g.round; enter(g); }
      if (g.phase === 'place') { if (g.n !== n) { n = g.n; ctx.sfx('tap'); } paintPlace(g); }
      if (g.phase !== 'place') n = -1;
      ui.dataset.phase = g.phase;
      $('.clock b').textContent = g.left;
      $('.clock').classList.toggle('hurry', g.phase === 'place' && g.left <= 2);
      $('.pw-round').textContent = g.phase === 'end' ? 'Final scores' : `Monster ${Math.max(0, g.round) + 1} of ${init.rounds}`;
      $('.pw-banner').textContent = g.phase === 'show' ? 'Remember the face!' : g.phase === 'place' ? `Pin the ${PARTS[g.cur].name.toUpperCase()}! (${g.n + 1} of ${g.count})` : g.phase === 'gallery' ? 'The gallery!' : '';
      $('.pw-hint').textContent = g.phase === 'place' && !watching && !placedNow(g) && !mine.some(m => m.n === g.n) ? 'Tap!' : '';
      paintChips(g); paintNote(g);
    },
    dispose() { tunes.dispose(); },
  };
}
