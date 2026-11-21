// The chapter map: a painted map of the Wyrmroad — the road winding along a great stone wyrm's back from its tail
// (Millbrook) to its crown (Crownhollow). Six places you can pick (locked ones say what opens them), the details panel
// (name, line, suggested level, best time, cleared mark), the hero's own place, and the Peddler's cart. Start a chapter
// from here (its opening scene plays the first time), or open the bag, spells or Peddler.
import { icon } from './icons.js';
import { esc, CLASS_NAMES, timeText } from './text.js';
import { hp as n } from '../../../../shared/format.js';
import { openPeddler } from './peddler.js';
import { companionFor } from './looks.js';
import { COLORS } from './party.js';

const W = 1000, H = 560;
/** Where the Peddler's cart stands: beside the hero's current place, off the wyrm's back. */
const cartAt = (P, at) => { const p = P[Math.min(at, 5)]; return { x: p.x + (at >= 4 ? -96 : 96), y: p.y + (at >= 3 ? 40 : 26) }; };
const BODY = 'M70 470 C150 525 250 420 340 418 S500 505 590 392 S700 238 790 226 S880 214 905 182';
const AT = [0.05, 0.235, 0.43, 0.615, 0.79, 0.975];
const PLACE_ICON = ['map', 'nature', 'anchor', 'tower', 'scale', 'crown'];
const GLYPH = {   // the place markers, drawn in the map's own ink
  map: '<path d="M-8 6V-2l8-6 8 6v8zM-3 6V1h6v5"/>',
  nature: '<path d="M0-9-7 2h4l-5 6h16l-5-6h4zM0 8v3"/>',
  anchor: '<path d="M0-8v15M-6 1a6 6 0 0 0 12 0M-4-5h8"/><circle cx="0" cy="-9" r="1.6"/>',
  tower: '<path d="M-6 9V-3l6-6 6 6V9zM-2 9V3h4v6M-6-3h12"/>',
  scale: '<path d="M-8 4c3-8 13-8 16 0-5-3-11-3-16 0zM-6 8c2-4 10-4 12 0"/>',
  crown: '<path d="M-8 6-9-5l5 4 4-7 4 7 5-4-1 11z"/>',
};

let ptsCache = null;
function points() {
  if (ptsCache) return ptsCache;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', BODY); svg.append(p); svg.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden'; document.body.append(svg);
  const L = p.getTotalLength();
  ptsCache = AT.map(f => { const q = p.getPointAtLength(L * f); return { x: q.x, y: q.y }; });
  // little ridge plates along the spine
  ptsCache.ridges = Array.from({ length: 34 }, (_, i) => { const a = p.getPointAtLength(L * (0.02 + i * 0.0285)), b = p.getPointAtLength(Math.min(L, L * (0.02 + i * 0.0285) + 4)); return { x: a.x, y: a.y, ang: Math.atan2(b.y - a.y, b.x - a.x) }; });
  svg.remove();
  return ptsCache;
}

function mapSvg(chapters, reached, done, sel, at) {
  const P = points();
  const ridge = P.ridges.map(r => { const nx = Math.sin(r.ang) * 30, ny = -Math.cos(r.ang) * 30; return `<path d="M${r.x + nx - Math.cos(r.ang) * 8} ${r.y + ny - Math.sin(r.ang) * 8} L${r.x + nx * 1.5} ${r.y + ny * 1.5} L${r.x + nx + Math.cos(r.ang) * 8} ${r.y + ny + Math.sin(r.ang) * 8}z"/>`; }).join('');
  return `<svg class="wr-map-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <defs>
      <linearGradient id="wrSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26324a"/><stop offset=".55" stop-color="#3d4a5e"/><stop offset="1" stop-color="#5b5a4e"/></linearGradient>
      <linearGradient id="wrStone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8c857a"/><stop offset="1" stop-color="#5d574f"/></linearGradient>
      <radialGradient id="wrGlow"><stop offset="0" stop-color="#ffd27a" stop-opacity=".9"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
      <pattern id="wrScales" width="18" height="12" patternUnits="userSpaceOnUse"><path d="M0 12a9 9 0 0 1 18 0" fill="none" stroke="#4a453f" stroke-width="1.4" opacity=".55"/></pattern>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#wrSky)"/>
    <g fill="#fff6dc">${Array.from({ length: 46 }, (_, i) => { const x = (i * 211.7) % W, y = 14 + ((i * 97.3) % 190), r = i % 7 === 0 ? 1.8 : 1.1; return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" opacity="${(0.35 + (i % 5) * 0.12).toFixed(2)}"/>`; }).join('')}</g>
    <circle cx="140" cy="86" r="34" fill="#f6e6b8" opacity=".9"/><circle cx="154" cy="78" r="30" fill="#2a3650" opacity=".85"/>
    <path d="M330 120 c30 -14 70 -14 100 0 M620 92 c24 -10 54 -10 78 0" stroke="#7a86a0" stroke-width="5" stroke-linecap="round" fill="none" opacity=".35"/>
    <path d="M0 300 L90 250 L170 290 L260 220 L350 280 L430 230 L520 290 L610 210 L700 260 L800 190 L880 240 L1000 200 V560 H0z" fill="#33394a" opacity=".75"/>
    <path d="M0 360 C120 330 220 380 330 350 S560 330 690 360 S900 330 1000 350 V560 H0z" fill="#46483f"/>
    <path d="M0 470 C140 450 300 480 470 460 S800 450 1000 470 V560 H0z" fill="#4f4c3c"/>
    <g fill="#6f8a5a" opacity=".55">${Array.from({ length: 26 }, (_, i) => { const x = 18 + i * 38 + (i % 3) * 7, y = 380 + (i % 4) * 34 + (i % 2) * 12; return `<path d="M${x} ${y} l-9 18 h18z"/>`; }).join('')}</g>
    <path d="${BODY}" fill="none" stroke="#2e2b28" stroke-width="86" stroke-linecap="round"/>
    <path d="${BODY}" fill="none" stroke="url(#wrStone)" stroke-width="74" stroke-linecap="round"/>
    <path d="${BODY}" fill="none" stroke="url(#wrScales)" stroke-width="70" stroke-linecap="round"/>
    <g fill="#6d665c" stroke="#2e2b28" stroke-width="2" stroke-linejoin="round">${ridge}</g>
    <g class="wr-map-head" transform="translate(918 172) rotate(-24)">
      <path d="M-30 -30 C10 -44 60 -30 78 -6 C60 10 40 22 -6 28 C-30 26 -40 0 -30 -30z" fill="url(#wrStone)" stroke="#2e2b28" stroke-width="4"/>
      <path d="M-12 -30 L-30 -70 L4 -36M14 -36 L10 -76 L32 -34" fill="#6d665c" stroke="#2e2b28" stroke-width="3" stroke-linejoin="round"/>
      <circle cx="26" cy="-10" r="16" fill="url(#wrGlow)"/><circle cx="26" cy="-10" r="5" fill="#ffe08a"/>
      <path d="M40 14 C52 10 64 8 74 0" stroke="#2e2b28" stroke-width="3" fill="none"/>
    </g>
    <path d="M70 470 C40 455 20 470 8 500" fill="none" stroke="#2e2b28" stroke-width="30" stroke-linecap="round"/>
    <path d="M70 470 C40 455 20 470 8 500" fill="none" stroke="#6d665c" stroke-width="20" stroke-linecap="round"/>
    <path d="${BODY}" fill="none" stroke="#e3cf9b" stroke-width="7" stroke-dasharray="14 10" stroke-linecap="round" opacity=".9"/>
    ${chapters.map((c, i) => {
      const p = P[i], locked = i > reached, isDone = done.includes(c.id), on = i === sel;
      return `<g class="wr-map-node${locked ? ' locked' : ''}${isDone ? ' done' : ''}${on ? ' sel' : ''}" transform="translate(${p.x} ${p.y})">
        ${on ? '<circle r="34" class="wr-map-halo"/>' : ''}
        <circle r="23" class="wr-map-disc"/>
        <g class="wr-map-glyph" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${locked ? '<rect x="-7" y="-1" width="14" height="10" rx="2"/><path d="M-4-1v-4a4 4 0 0 1 8 0v4"/>' : GLYPH[PLACE_ICON[i]]}</g>
        ${isDone ? '<g class="wr-map-check" transform="translate(17 -17)"><circle r="9"/><path d="m-4 0 3 3 5-6" fill="none" stroke-width="2.4" stroke-linecap="round"/></g>' : ''}
        ${i === at ? `<g class="wr-map-me" transform="translate(0 -40)"><path d="M0 14 L-10 -2 A11 11 0 1 1 10 -2z"/><circle cy="-5" r="4.5"/></g>` : ''}
      </g>`;
    }).join('')}
    <g class="wr-map-cart" transform="translate(${cartAt(P, at).x} ${cartAt(P, at).y})">
      <path d="M-24 -6h40l-6 14h-30z" fill="#8a5a32" stroke="#2e2b28" stroke-width="3" stroke-linejoin="round"/>
      <path d="M-22 -6c4-18 32-18 36 0" fill="#c9a24a" stroke="#2e2b28" stroke-width="3"/>
      <circle cx="-14" cy="12" r="6" fill="#3a2e24" stroke="#2e2b28" stroke-width="2"/><circle cx="8" cy="12" r="6" fill="#3a2e24" stroke="#2e2b28" stroke-width="2"/>
    </g>
  </svg>`;
}

export function mapScreen(app, opts = {}) {
  const { data } = app;
  const lead = app.hero(opts.heroId || app.party?.[0]?.heroId || app.save.lastHero);
  if (!lead) { app.go('title'); return; }
  const chapters = data.chapters.chapters;
  app.save.lastHero = lead.id;
  const st = { sel: Math.min(lead.story.reached, chapters.length - 1), companion: !!app.companion };
  const party = () => (app.party || []).map(s => ({ ...s, hero: s.bot || app.hero(s.heroId) })).filter(s => s.hero);

  app.ui.innerHTML = `<section class="wr-screen wr-map">
    <header class="wr-bar"><button type="button" class="wr-icon-btn" data-back aria-label="Back">${icon('back')}</button>
      <h2>The Wyrmroad</h2><div class="wr-grow"></div>
      <div class="wr-gold-pill">${icon('gold')}<b data-gold></b></div>
      <button type="button" class="wr-icon-btn" data-act="menu" aria-label="Menu">${icon('menu')}</button></header>
    <div class="wr-map-body">
      <div class="wr-map-frame"><div class="wr-map-art"></div><div class="wr-map-hits"></div></div>
      <aside class="wr-map-panel" aria-live="polite"></aside>
    </div>
    <footer class="wr-map-foot">
      <button type="button" class="wr-btn" data-act="bag">${icon('bag')}<span>Bag</span></button>
      <button type="button" class="wr-btn" data-act="spells">${icon('book')}<span>Spells</span></button>
      <button type="button" class="wr-btn" data-act="peddler">${icon('shop')}<span>Peddler</span></button>
    </footer>
  </section>`;
  const root = app.ui.firstElementChild;

  function draw() {
    const P = points();
    root.querySelector('[data-gold]').textContent = n(lead.gold);
    root.querySelector('.wr-map-art').innerHTML = mapSvg(chapters, lead.story.reached, lead.story.done, st.sel, lead.story.reached);
    root.querySelector('.wr-map-hits').innerHTML = chapters.map((c, i) => `<button type="button" class="wr-map-hit${i === st.sel ? ' on' : ''}" data-ch="${i}" style="left:${P[i].x / W * 100}%;top:${P[i].y / H * 100}%" aria-label="${esc(c.name)}${i > lead.story.reached ? ' (locked)' : ''}"><span>${esc(c.name)}</span></button>`).join('')
      + (() => { const { x, y } = cartAt(P, lead.story.reached); return `<button type="button" class="wr-map-hit wr-map-hit-cart" data-act="peddler" style="left:${x / W * 100}%;top:${y / H * 100}%" aria-label="The Peddler"><span>Peddler</span></button>`; })();
    panel();
  }
  function panel() {
    const i = st.sel, c = chapters[i], locked = i > lead.story.reached, isDone = lead.story.done.includes(c.id), best = lead.best?.[c.id];
    const low = lead.level < c.level, ps = party(), solo = ps.filter(s => !s.bot).length === 1;
    const comp = solo && st.companion ? companionFor(data, lead, i, app.save.heroes.length) : null;
    root.querySelector('.wr-map-panel').innerHTML = `
      <p class="wr-kicker">Chapter ${n(i + 1)}</p>
      <h3>${esc(c.name)}</h3><p class="wr-sub">${esc(c.sub)}</p>
      <ul class="wr-facts">
        <li class="${low ? 'wr-warn' : ''}">${icon('star')}<span>Suggested level ${n(c.level)}${low ? ` · you are ${n(lead.level)}` : ''}</span></li>
        <li>${icon('clock')}<span>${best ? `Best time ${timeText(best)}` : 'No best time yet'}</span></li>
        ${isDone ? `<li class="wr-good">${icon('check')}<span>Cleared</span></li>` : ''}
        ${c.ally && solo ? `<li>${icon('people')}<span>Grell fights beside a lone hero here</span></li>` : ''}
      </ul>
      <div class="wr-party">${ps.map((s, k) => `<span class="wr-chip" style="--pc:${s.color || COLORS[k]}">${esc(s.hero.name)} · level ${n(s.hero.level)} ${esc(CLASS_NAMES[s.hero.cls])}</span>`).join('')}
        ${comp ? `<span class="wr-chip wr-chip-bot">${esc(comp.name)} · level ${n(comp.level)} ${esc(CLASS_NAMES[comp.cls])} (companion)</span>` : ''}</div>
      ${locked ? `<p class="wr-locked">${icon('lock')}<span>Clear ${esc(chapters[i - 1].name)} to open this road.</span></p>` : `
        ${solo ? `<button type="button" class="wr-btn wr-toggle-btn${st.companion ? ' on' : ''}" data-act="companion" aria-pressed="${st.companion}">${icon('people')}<span>Bring a companion</span><i class="wr-switch"></i></button>` : ''}
        <button type="button" class="wr-btn wr-big wr-primary" data-act="start">${icon('play')}<span><b>${isDone ? 'Play again' : 'Set off'}</b><small>${esc(c.name)}</small></span></button>
        ${isDone || lead.story.reached > i ? `<button type="button" class="wr-btn wr-ghost" data-act="story">${icon('scroll')}<span>Hear the story again</span></button>` : ''}
        ${i === chapters.length - 1 && lead.story.ending ? `<p class="wr-ending">${icon('star')}<span>Your ending: ${lead.story.ending === 'free' ? 'you broke the last chain' : 'you took the lantern'}</span></p>` : ''}`}`;
  }
  function start() {
    const c = chapters[st.sel];
    const slots = (app.party || []).filter(s => !s.bot);
    const playParty = [...slots];
    if (slots.length === 1 && st.companion) playParty.push({ pid: 'bot', device: 'bot', color: COLORS[1], bot: companionFor(data, lead, st.sel, app.save.heroes.length) });
    const play = () => app.go('play', { chapter: c.id, party: playParty, leadId: lead.id });
    if (!lead.story.done.includes(c.id)) app.go('story', { scene: c.intro, chapter: c.id, heroId: lead.id, then: play });
    else play();
  }
  root.addEventListener('click', async e => {
    const ch = e.target.closest('[data-ch]');
    if (ch) { st.sel = +ch.dataset.ch; app.audio.play('ui.click'); draw(); root.querySelector(`[data-ch="${st.sel}"]`)?.focus({ preventScroll: true }); app.view.setChapter(chapters[st.sel].id); return; }
    const b = e.target.closest('[data-act], [data-back]'); if (!b) return;
    app.audio.play('ui.click');
    if (b.hasAttribute('data-back')) return app.go(app.save.heroes.length > 1 ? 'heroes' : 'title');
    switch (b.dataset.act) {
      case 'menu': app.openMenu(); break;
      case 'start': start(); break;
      case 'companion': st.companion = app.companion = !st.companion; panel(); root.querySelector('[data-act="companion"]')?.focus({ preventScroll: true }); break;
      case 'story': app.go('story', { scene: chapters[st.sel].intro, chapter: chapters[st.sel].id, heroId: lead.id, then: () => app.go('map', { heroId: lead.id }) }); break;
      case 'peddler': openPeddler(app, lead, { onChange: draw }); break;
      case 'bag': (await import('./inventory.js')).openInventory(app, lead, { onChange: draw }); break;
      case 'spells': (await import('./spells.js')).openSpells(app, lead); break;
    }
  });
  draw();
  app.view.setChapter(chapters[st.sel].id); app.view.scenic(true);
  app.audio.ambience(null);
  setTimeout(() => root.querySelector('[data-act="start"]')?.focus({ preventScroll: true }), 40);
}
