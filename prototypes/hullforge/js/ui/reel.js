// The rarity reel (ported from Voidwright's ui/reel.js): a vertical wheel of rarity-coloured rows that spins, slows
// and stops on the real result. Every row is drawn from the REAL odds of this roll (sim/craft.js reelStrip), so a 1%
// legendary shows on about 1 row in 100. Any click, key or controller button skips to the result.

import { el } from './dom.js';
import { RARITY } from '../data/blocks.js';
import { reelStrip } from '../sim/craft.js';
import { play } from '../core/audio.js';
import { fmt } from '../../../../shared/format.js';

const ROW = 46;          // px per row
const SHOW = 5;          // rows visible (the middle one is under the pointer)
const SPIN_MS = 2400;

/**
 * Spin the reel. Resolves when it has landed (or was skipped) and the result has shown for a moment.
 * @param {{ odds: {i:number,p:number}[], result: number, label: string, names?: string[], r: () => number, heading?: string }} o
 */
export function spinReel({ odds, result, label, names = [], r, heading = 'Rolling' }) {
  return new Promise(resolve => {
    const { strip, land } = reelStrip(odds, result, r);
    const rows = strip.map((i, k) => {
      const R = RARITY[i];
      const name = k === land ? label : names.length ? names[Math.floor(r() * names.length)] : '';
      return el('div', { class: 'reel-row', style: `--rc:${R.color}` }, el('b', {}, R.name), el('span', {}, name));
    });
    const track = el('div', { class: 'reel-track' }, ...rows);
    const legend = el('div', { class: 'reel-odds' }, ...odds.filter(o => o.p > 0.0005).map(o => { const pc = o.p * 100; return el('span', { style: `color:${RARITY[o.i].color}` }, `${RARITY[o.i].name} ${pc < 1 ? fmt(pc, { decimals: 1 }) : fmt(pc, { decimals: 0 })}%`); }));
    const shade = el('div', { class: 'reel-shade', role: 'dialog', 'aria-label': heading },
      el('div', { class: 'reel-box' }, el('h3', {}, heading),
        el('div', { class: 'reel-win', style: `height:${ROW * SHOW}px` }, track, el('div', { class: 'reel-pointer' })),
        legend, el('div', { class: 'hint reel-skip' }, 'Click or press any key to skip')));
    document.body.append(shade);
    const endY = (land - Math.floor(SHOW / 2)) * ROW;
    const t0 = performance.now(); let done = false, lastRow = -1, raf = 0;
    const padDown = () => { const p = [...(navigator.getGamepads?.() || [])].find(x => x?.connected); return !!p && p.buttons.some(b => b.pressed); };
    let padFresh = !padDown();
    const place = y => { track.style.transform = `translateY(${-y}px)`; };
    const finish = () => {
      if (done) return; done = true; cancelAnimationFrame(raf); place(endY);
      removeEventListener('keydown', onKey, true);
      rows[land].classList.add('won'); shade.classList.add('landed');
      play(result >= 4 ? 'legendary' : result >= 2 ? 'rare' : 'pickup');
      setTimeout(() => { shade.remove(); resolve(); }, 900);
    };
    const onKey = e => { e.preventDefault(); e.stopPropagation(); finish(); };
    addEventListener('keydown', onKey, true);
    shade.addEventListener('pointerdown', e => { e.preventDefault(); finish(); });
    const tick = now => {
      if (done) return;
      const k = Math.min(1, (now - t0) / SPIN_MS); const e = 1 - Math.pow(1 - k, 4);   // fast start, long slow stop
      const y = endY * e; place(y);
      const row = Math.floor(y / ROW + 0.5); if (row !== lastRow) { lastRow = row; play('pd', null, null, 0.35); }
      const pd = padDown(); if (!pd) padFresh = true; else if (padFresh) { finish(); return; }
      if (k >= 1) { finish(); return; }
      raf = requestAnimationFrame(tick);
    };
    place(0); raf = requestAnimationFrame(tick);
  });
}
