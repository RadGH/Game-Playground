// The Mana Gauge (PLAN M6): one big analogue meter for the HQ's mana store. A black needle is the store, a thin brass
// needle is the cap, the red band at the bottom is the reserve the store refills by itself (regen stops at its top —
// above it, mana only comes from refined crystal), and the tier marks I–IV are engraved where the cap opens each tier.
// A pale GHOST needle shows where the store will drop to if the armed spell fires. Lamps: REFINING, JARS WAITING,
// REGEN, TIER I–IV; a nixie readout of store / cap and the batteries.
//
// The face is a log scale (0 … the top tier's cap) so the first 25 mana and the last 5,000 are both readable.
// `gaugeFace()` builds the SVG; the Spell Board carries a small repeater of the same face.

import { machinePanel } from './panel.js';

const SWEEP = 240; // degrees, centred on straight up

/** Needle angle (degrees from straight up) for value v on a face whose top is `top`. Pure. */
export function gaugeAngle(v, top) {
  const k = Math.log(1 + Math.max(0, v)) / Math.log(1 + Math.max(1, top));
  return -SWEEP / 2 + SWEEP * Math.max(0, Math.min(1, k));
}

const rad = (deg) => ((deg - 90) * Math.PI) / 180;
const pt = (cx, cy, r, deg) => [cx + Math.cos(rad(deg)) * r, cy + Math.sin(rad(deg)) * r];
function arc(cx, cy, r, a0, a1) {
  const [x0, y0] = pt(cx, cy, r, a0), [x1, y1] = pt(cx, cy, r, a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** The SVG face. tiers: [{ cap, name }]. Returns { el, set({ store, cap, regenTo, ghost }) }. */
export function gaugeFace({ tiers, small = false }) {
  const top = tiers[tiers.length - 1].cap;
  const cx = 100, cy = 100, R = 82;
  const ticks = [];
  for (const v of [5, 10, 25, 50, 100, 200, 400, 800, 1500, 3000, 5000]) {
    if (v > top) continue;
    const a = gaugeAngle(v, top), [x0, y0] = pt(cx, cy, R, a), [x1, y1] = pt(cx, cy, R - 7, a);
    ticks.push(`<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" class="g-tick"/>`);
  }
  const marks = tiers.map((t) => {
    const a = gaugeAngle(t.cap, top), [x0, y0] = pt(cx, cy, R + 2, a), [x1, y1] = pt(cx, cy, R - 13, a), [lx, ly] = pt(cx, cy, R - 24, a);
    return `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" class="g-tier"/>` +
      `<text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" class="g-tier-label">${t.name}</text>` +
      (small ? '' : (() => { const [nx, ny] = pt(cx, cy, R + 11, a); return `<text x="${nx.toFixed(1)}" y="${(ny + 3).toFixed(1)}" class="g-num">${t.cap >= 1000 ? t.cap / 1000 + 'K' : t.cap}</text>`; })());
  }).join('');
  const el = document.createElement('div');
  el.className = 'gauge-face' + (small ? ' small' : '');
  el.innerHTML = `<svg viewBox="0 0 200 ${small ? 118 : 132}" role="img" aria-label="Mana gauge">
    <defs><radialGradient id="gface${small ? 's' : ''}" cx="50%" cy="70%" r="70%"><stop offset="0" stop-color="#f4ecd4"/><stop offset="1" stop-color="#cbbf98"/></radialGradient></defs>
    <path d="${arc(cx, cy, R + 14, -SWEEP / 2 - 6, SWEEP / 2 + 6)}" class="g-rim"/>
    <path d="${arc(cx, cy, R - 3, -SWEEP / 2, SWEEP / 2)}" class="g-face" style="fill:none"/>
    <path class="g-reserve" d=""/>
    <path class="g-fill" d=""/>
    ${ticks.join('')}${marks}
    <text x="100" y="${small ? 74 : 70}" class="g-title">MANA</text>
    <g class="g-needle g-cap" style="transform-origin:100px 100px"><line x1="100" y1="104" x2="100" y2="${100 - R + 4}"/></g>
    <g class="g-needle g-ghost" style="transform-origin:100px 100px"><line x1="100" y1="104" x2="100" y2="${100 - R + 10}"/></g>
    <g class="g-needle g-store" style="transform-origin:100px 100px"><polygon points="97.5,108 102.5,108 100.8,${100 - R + 8} 99.2,${100 - R + 8}"/></g>
    <circle cx="100" cy="100" r="7" class="g-hub"/><circle cx="100" cy="100" r="2.4" class="g-hub-pin"/>
  </svg>`;
  const $ = (s) => el.querySelector(s);
  const reserve = $('.g-reserve'), fill = $('.g-fill'), nStore = $('.g-store'), nCap = $('.g-cap'), nGhost = $('.g-ghost');
  let last = '';
  return {
    el, top,
    set({ store = 0, cap = 100, regenTo = 25, ghost = null }) {
      const key = [store, cap, regenTo, ghost].join(',');
      if (key === last) return; last = key;
      const a0 = -SWEEP / 2;
      reserve.setAttribute('d', arc(cx, cy, R - 3, a0, Math.max(a0 + 0.5, gaugeAngle(regenTo, top))));
      fill.setAttribute('d', arc(cx, cy, R - 3, gaugeAngle(regenTo, top), Math.max(gaugeAngle(regenTo, top) + 0.5, gaugeAngle(cap, top))));
      nStore.style.transform = `rotate(${gaugeAngle(store, top).toFixed(2)}deg)`;
      nCap.style.transform = `rotate(${gaugeAngle(cap, top).toFixed(2)}deg)`;
      nGhost.style.opacity = ghost == null ? '0' : '1';
      if (ghost != null) nGhost.style.transform = `rotate(${gaugeAngle(Math.max(0, ghost), top).toFixed(2)}deg)`;
      el.dataset.store = String(store); el.dataset.cap = String(cap); el.dataset.ghost = ghost == null ? '' : String(ghost);
    },
  };
}

export function mountGauge(C) {
  const { el, body } = machinePanel({ id: 'gauge', title: 'MANA GAUGE', cls: 'machine-gauge' });
  const tiers = C.arcane?.mana.tiers || [{ cap: 100, name: 'I' }, { cap: 400, name: 'II' }, { cap: 1500, name: 'III' }, { cap: 5000, name: 'IV' }];
  const face = gaugeFace({ tiers });
  body.innerHTML = `<div class="gg-side">
      <div class="gg-nixie" aria-label="Mana store"><span class="gg-store">0</span><i>/</i><span class="gg-cap">100</span></div>
      <div class="gg-lamps">
        <span class="gg-lamp" data-lamp="refining"><b></b>REFINING</span>
        <span class="gg-lamp" data-lamp="regen"><b></b>REGEN</span>
        <span class="gg-lamp" data-lamp="jars"><b></b>JARS <em class="gg-jars">0</em></span>
        <span class="gg-lamp" data-lamp="batt"><b></b>BATTERIES <em class="gg-batt">0</em></span>
      </div>
      <div class="gg-tiers">${tiers.map((t) => `<span class="gg-tier" data-tier="${t.tier}"><b></b>${t.name}</span>`).join('')}</div>
      <p class="gg-note">RED BAND REFILLS BY ITSELF. ABOVE IT, ONLY REFINED CRYSTAL.</p>
    </div>`;
  body.prepend(face.el);
  const $ = (s) => body.querySelector(s);
  function draw() {
    const h = C.arcane?.hud;
    if (!h) return;
    const A = C.arcane.aim, def = A.spell ? C.arcane.rows[A.spell] : null;
    face.set({ store: h.store, cap: h.cap, regenTo: h.regenTo, ghost: def ? h.store - def.cost : null });
    $('.gg-store').textContent = Math.floor(h.store);
    $('.gg-cap').textContent = h.cap;
    $('.gg-jars').textContent = h.jars;
    $('.gg-batt').textContent = h.batteries;
    const lamp = (k, on) => body.querySelector(`[data-lamp="${k}"]`).classList.toggle('on', !!on);
    lamp('refining', h.refining); lamp('regen', h.store < h.regenTo); lamp('jars', h.jars > 0); lamp('batt', h.batteries > 0);
    for (const t of body.querySelectorAll('.gg-tier')) t.classList.toggle('on', +t.dataset.tier <= h.tier);
  }
  const off = C.arcane?.on(draw);
  draw();
  return { el, draw, face, dispose: off };
}
