// PIER PRESSURE on a screen: the end of a fairground pier (bunting, a striped kiosk roof) with one lane of sea per
// player below it — each lane has the player's chip on the boards, a line down to a bobber, and the deep water under
// it where shapes swim up. Fish and junk come up as dark silhouettes (a fish shape that wiggles; a boot, a kettle or a
// clump of weed that tumbles slowly) so reading the SHAPE is the skill. The script for each lane comes from the server
// (pier-pressure/sim.js) and is played on this device's own clock: little bobber twitches for the nibbles, a deep
// plunge with a "!" for the bite. One huge button (also Space / Enter / a controller's A) sends `tap { t }`, and the
// same rule the server uses (tapResult) gives instant feedback on your own lane. A landed fish jumps up onto the pier
// with its name and points. Halloween: a night pier, orange bunting, the fish's Halloween names.
import { esc, chip } from '../../client/gamehud.js';
import { tapResult, COUNT_S } from './sim.js';
import { BY_ID, fishName } from '../fish-species.js';

const FISH_SVG = `<svg viewBox="0 0 80 40" aria-hidden="true"><path d="M8 20 Q28 2 52 8 Q66 12 72 20 Q66 28 52 32 Q28 38 8 20 Z"/><path class="pp-tail" d="M10 20 L0 8 L2 20 L0 32 Z"/></svg>`;
const JUNK_SVG = {
  'soggy-boot': `<svg viewBox="0 0 60 60" aria-hidden="true"><path d="M18 4 H36 V36 Q54 36 56 46 V54 H14 Q10 54 12 46 Z"/></svg>`,
  'rusty-kettle': `<svg viewBox="0 0 60 60" aria-hidden="true"><path d="M20 10 Q30 2 40 10" fill="none" stroke-width="5"/><ellipse cx="30" cy="34" rx="20" ry="18"/><path d="M48 30 L60 20 L58 26 L50 38 Z"/></svg>`,
  'weed-tangle': `<svg viewBox="0 0 60 60" aria-hidden="true"><path d="M12 58 Q4 36 16 22 Q24 12 18 2 M26 58 Q22 34 32 20 Q38 10 32 0 M40 58 Q46 36 36 24 M50 58 Q58 40 48 26 Q42 16 50 6" fill="none" stroke-width="6" stroke-linecap="round"/></svg>`,
};
const SAY = { hook: 'Got it!', spook: 'Too soon!', dodge: 'Dodged!', snag: 'Snagged!', free: 'Free!', miss: 'Missed!', early: 'Wait…' };

export function createView(ctx) {
  const { ui, players, me, init, season } = ctx, watching = me == null, HW = season === 'halloween';
  const lanesInfo = [...players.map(p => ({ id: p.pid, p })), ...(init.cpu ? [{ id: init.cpu.id, p: { pid: init.cpu.id, name: init.cpu.name, seat: 3, color: '#8a8f9c', dark: '#4a4f5c', shape: 'circle', portrait: '' } }] : [])];
  ui.innerHTML = `
    <div class="pp-top"><span class="pp-title">Pier Pressure</span><span class="clock"><b>--</b></span></div>
    <div class="pp-pier"><div class="pp-sky"><i class="pp-bunting"></i></div>
      <div class="pp-deck">${lanesInfo.map(L => `<div class="pp-seat" data-id="${L.id}">${chip(L.p, '<em class="sc">0</em>')}${init.cpu && L.id === init.cpu.id ? '<small class="pp-cpu">CPU</small>' : ''}</div>`).join('')}</div>
      <div class="pp-sea">${lanesInfo.map(L => `<div class="pp-lane" data-id="${L.id}" style="--seat:${L.p.color}"><i class="pp-line"></i><i class="pp-bob"></i><b class="pp-bang">!</b><i class="pp-shape"></i><b class="pp-tangle"></b><span class="pp-pop"></span><span class="pp-say"></span></div>`).join('')}</div>
      <div class="pp-count"></div></div>
    <button class="pp-btn big-btn" type="button">CAST<small>tap · Space</small></button>
    <p class="pp-note"></p>`;
  const $ = s => ui.querySelector(s), btn = $('.pp-btn');
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'count';
  if (me != null) ui.querySelector(`.pp-seat[data-id="${me}"] .chip`)?.classList.add('me');
  const lane = new Map(lanesInfo.map(L => {
    const el = ui.querySelector(`.pp-lane[data-id="${L.id}"]`);
    return [String(L.id), { el, bob: el.querySelector('.pp-bob'), bang: el.querySelector('.pp-bang'), shape: el.querySelector('.pp-shape'), tangle: el.querySelector('.pp-tangle'), pop: el.querySelector('.pp-pop'), say: el.querySelector('.pp-say'), sc: ui.querySelector(`.pp-seat[data-id="${L.id}"] .sc`), row: null, vid: null }];
  }));
  // ---- the clock (this device's own, synced to the server's half-seconds)
  let phase = 'count', t0 = null, last = null, sentAt = -9, clickGuard = 0;
  const nowS = () => performance.now() / 1000;
  const myT = () => (t0 == null ? 0 : Math.min(init.play, nowS() - t0));
  function sync(el) { if (t0 == null) { t0 = nowS() - el; return; } if (el - myT() > 0.6) t0 = nowS() - el; }
  const nm = id => fishName(id, season);
  function say(id, text, cls = '') { const L = lane.get(String(id)); if (!L) return; L.say.textContent = text; L.say.className = 'pp-say ' + cls; void L.say.offsetWidth; L.say.classList.add('pop'); }
  function press() {
    if (watching || phase !== 'play') return;
    const t = myT(); sentAt = nowS();
    ctx.send('tap', { t: Math.round(t * 100) / 100 });
    btn.classList.remove('hit'); void btn.offsetWidth; btn.classList.add('hit');
    const L = lane.get(String(me)), row = L?.row;
    if (row && row[0] === 1 && row[6]) { const [, , from, arrive, fakes, bite, end] = row[6]; if (t >= from) { const r = tapResult({ junk: BY_ID[row[6][1]]?.junk, from, arrive, fakes, bite, end }, t); if (r !== 'hook' && r !== 'snag' && r !== 'late') say(me, SAY[r], r); } }
    ctx.sfx('tap');
  }
  btn.addEventListener('pointerdown', e => { e.preventDefault(); clickGuard = nowS(); press(); });
  btn.addEventListener('click', e => { e.preventDefault(); if (nowS() - clickGuard > 0.4) press(); });          // a controller's A (padnav) clicks
  const onKey = e => { if (e.repeat || !['Space', 'Enter', 'KeyA', 'ArrowDown'].includes(e.code)) return; e.preventDefault(); press(); };
  addEventListener('keydown', onKey);
  function label() {
    const row = lane.get(String(me))?.row; if (!row) return;
    const st = row[0];
    let html = 'CAST<small>tap · Space</small>', cls = '';
    if (phase !== 'play') { html = phase === 'count' ? 'GET READY' : 'TIME!'; cls = 'wait'; }
    else if (st === 1) { const v = row[6], T = myT(); html = !v || T < v[2] ? 'WAIT…<small>the line is sinking</small>' : 'HOOK!<small>junk? tap before it reaches you</small>'; cls = !v || T < v[2] ? 'wait' : 'go'; }
    else if (st === 2) { html = `TAP! ×${row[4]}<small>untangle the junk</small>`; cls = 'tangle'; }
    else if (st === 3) { html = '…'; cls = 'wait'; }
    if (btn.dataset.html !== html) { btn.innerHTML = html; btn.dataset.html = html; }
    btn.className = 'pp-btn big-btn ' + cls + (btn.classList.contains('hit') ? ' hit' : '');
  }
  return {
    state(g) {
      last = g; phase = g.phase; ui.dataset.phase = g.phase;
      if (g.phase !== 'count') sync(g.el || 0);
      $('.clock b').textContent = g.left; $('.clock').classList.toggle('hurry', g.phase === 'play' && g.left <= 10);
      $('.pp-count').textContent = g.phase === 'count' ? Math.max(1, g.left) : '';
      const best = Math.max(...Object.values(g.l).map(r => r[1]));
      for (const [id, row] of Object.entries(g.l)) {
        const L = lane.get(id); if (!L) continue;
        L.row = row; L.sc.textContent = row[1]; L.sc.closest('.chip')?.classList.toggle('lead', row[1] === best && best > 0);
        L.el.dataset.st = row[0];
        if (row[0] === 1 && row[6] && row[6][0] !== L.vid) { L.vid = row[6][0]; L.sp = row[6][1]; const sp = BY_ID[row[6][1]]; L.shape.innerHTML = sp?.junk ? JUNK_SVG[sp.id] || JUNK_SVG['soggy-boot'] : FISH_SVG; L.shape.dataset.kind = sp?.junk ? 'junk' : 'fish'; L.shape.style.setProperty('--len', (sp?.size || 0.5)); }
        L.tangle.textContent = row[0] === 2 ? `×${row[4]}` : '';
      }
      if (init.solo && g.phase === 'end') { const r = g.l[players[0].pid], c = g.l[init.cpu.id]; $('.pp-note').innerHTML = r && c ? (r[1] > c[1] ? `🏆 You beat ${esc(init.cpu.name)}!` : r[1] === c[1] ? `A tie with ${esc(init.cpu.name)}!` : `${esc(init.cpu.name)} wins this time.`) : ''; }
      label();
    },
    event(ev) {
      const id = ev.pid, L = lane.get(String(id)); if (!L && ev.e !== 'whistle') return;
      if (ev.e === 'hook') {
        const sp = BY_ID[ev.sp]; L.pop.innerHTML = `<i style="--c:${sp.color};--b:${sp.belly};--len:${sp.size}">${FISH_SVG}</i><b>${esc(nm(ev.sp))}</b><em>+${ev.pts}${ev.streak >= init.streak ? ' 🔥' : ''}</em>`;
        L.pop.classList.remove('go'); void L.pop.offsetWidth; L.pop.classList.add('go');
        if (id === me) ctx.sfx(ev.pts >= 6 ? 'win' : 'coins');
      } else if (ev.e === 'snag') { say(id, `${nm(ev.sp)}!`, 'snag'); if (id === me) ctx.sfx('bad'); }
      else if (ev.e === 'free') { say(id, SAY.free, 'free'); if (id === me) ctx.sfx('good'); }
      else if (ev.e === 'tug') { L.el.classList.remove('tug'); void L.el.offsetWidth; L.el.classList.add('tug'); }
      else if (ev.e === 'miss') { say(id, SAY.miss, 'miss'); if (id === me) ctx.sfx('out'); }
      else if (ev.e === 'spook') { if (id !== me || nowS() - sentAt > 0.8) say(id, SAY.spook, 'spook'); if (id === me) ctx.sfx('bad'); }
      else if (ev.e === 'dodge') { if (id !== me || nowS() - sentAt > 0.8) say(id, SAY.dodge, 'dodge'); if (id === me) ctx.sfx('good'); }
      else if (ev.e === 'early') say(id, SAY.early, 'early');
      else if (ev.e === 'cast') { L.el.classList.remove('cast'); void L.el.offsetWidth; L.el.classList.add('cast'); if (id === me) ctx.sfx('throw'); }
      else if (ev.e === 'whistle') ctx.sfx('win');
    },
    frame(dt, t) {
      const T = myT();
      for (const L of lane.values()) {
        const row = L.row; let show = false, y = 100, x = 50, rot = 0, bob = 0, bang = false, wig = 0;
        if (row && row[0] === 1 && row[6] && phase !== 'count') {
          const [, sp, from, arrive, fakes, bite, end] = row[6], junk = !!BY_ID[sp]?.junk;
          if (T >= from) {
            show = true;
            if (T < arrive) { const f = (T - from) / (arrive - from); y = 100 - (100 - 44) * f; x = 50 + Math.sin(T * (junk ? 1.2 : 4) + L.vid) * (junk ? 6 : 10) * (1 - f * 0.6); rot = junk ? Math.sin(T * 1.5 + L.vid) * 25 : Math.sin(T * 8) * 6; wig = junk ? 0 : 1; }
            else if (!junk) { y = 44 + Math.sin(T * 3) * 2; x = 50 + Math.sin(T * 2.2 + L.vid) * 8; rot = Math.sin(T * 9) * 8; wig = 1; if (fakes.some(f => T >= f && T < f + 0.18)) bob = 6; if (T >= bite && T <= end) { bob = 20 + Math.sin(T * 40) * 3; bang = true; y = 38; x = 50; } }
            else { y = 36; x = 52; rot = 20; bob = 10; }
          }
        } else if (row && row[0] === 2) { show = true; y = 34; x = 52; rot = Math.sin(t * 18) * 12; bob = 8 + Math.sin(t * 22) * 4; }
        L.shape.style.display = show ? '' : 'none';
        if (show) { L.shape.style.top = y + '%'; L.shape.style.left = x + '%'; L.shape.style.transform = `translate(-50%, -50%) rotate(${rot.toFixed(1)}deg) scale(var(--len))`; L.shape.classList.toggle('wig', !!wig); }
        L.bob.style.transform = `translate(-50%, ${(bob + Math.sin(t * 2 + (L.vid || 0)) * 2).toFixed(1)}px)`;
        L.bob.style.display = row && (row[0] === 1 || row[0] === 2) ? '' : 'none';
        L.el.querySelector('.pp-line').style.display = L.bob.style.display;
        L.bang.style.display = bang ? '' : 'none';
      }
      if (me != null && phase === 'play') label();
    },
    dispose() { removeEventListener('keydown', onKey); },
    _debug: { myT, get last() { return last; } },
  };
  void COUNT_S; void HW;
}
