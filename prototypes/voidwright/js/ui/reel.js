// The rarity reel (report #62): a vertical wheel of rarity-coloured rows that spins, slows and stops on the real
// result. Used by crafting, drone building and sealed caches (ui/workshop.js). The rows come from sim/reel.js, which
// draws every row from the real odds of that roll — a 1% legendary shows on about 1 row in 100.
// Tap, click or any key / controller button skips to the result.

import { el } from './dom.js';
import { RARITY_BY_ID } from '../data/types.js';
import { reelStrip } from '../sim/reel.js';
import { play } from '../core/audio.js';
import { fmt } from '../../../../shared/format.js';

const UNIQUE = { id: 'unique', name: 'Named unique', color: '#ffe27a' };
const rarityOf = id => id === 'unique' ? UNIQUE : RARITY_BY_ID[id] || RARITY_BY_ID.common;
const ROW = 46;          // px per row
const SHOW = 5;          // rows visible (odd: the middle one is under the pointer)
const SPIN_MS = 2600;

/**
 * Spin the reel. Resolves when it has landed (or was skipped) and the result has been shown for a moment.
 * @param {{ odds: {id:string,p:number}[], result: string, label: string, names?: string[], r: () => number, heading?: string }} o
 *   result = the rarity id rolled ('unique' for a named unique); label = the real item's name for the landing row;
 *   names = flavour names for the other rows (random parts of the same pool).
 */
export function spinReel({ odds, result, label, names = [], r, heading = 'Rolling…' }) {
  return new Promise(resolve => {
    const { strip, land } = reelStrip(odds, result, r);
    const rows = strip.map((id, i) => {
      const R = rarityOf(id);
      const name = i === land ? label : names.length ? names[Math.floor(r() * names.length)] : '';
      return el('div', { class: 'reel-row', style: `--rc:${R.color}` }, el('b', {}, R.name), el('span', {}, name));
    });
    const track = el('div', { class: 'reel-track' }, ...rows);
    const legend = odds.filter(o => o.p > 0).map(o => { const R = rarityOf(o.id); const pc = o.p * 100; return `<span style="color:${R.color}">${R.name} ${pc < 1 ? (pc < 0.1 ? '<0.1' : fmt(pc, { decimals: 1 })) : fmt(pc, { decimals: 0 })}%</span>`; }).join(' · ');
    const shade = el('div', { class: 'reel-shade', role: 'dialog', 'aria-label': heading },
      el('div', { class: 'reel-box' }, el('h3', {}, heading),
        el('div', { class: 'reel-win', style: `height:${ROW * SHOW}px` }, track, el('div', { class: 'reel-pointer' })),
        el('div', { class: 'reel-odds', html: legend }),
        el('div', { class: 'hint reel-skip' }, 'Tap to skip')));
    document.body.append(shade);
    const endY = (land - Math.floor(SHOW / 2)) * ROW;
    const t0 = performance.now(); let done = false, lastRow = -1, raf = 0;
    const padDown = () => { const p = [...(navigator.getGamepads?.() || [])].find(x => x?.connected); return !!p && p.buttons.some(b => b.pressed); };
    const padAtStart = padDown();   // the button that started the roll is still held — wait for a fresh press
    let padFresh = !padAtStart;
    const place = y => { track.style.transform = `translateY(${-y}px)`; };
    const finish = () => {
      if (done) return; done = true; cancelAnimationFrame(raf); place(endY);
      removeEventListener('keydown', onKey, true);
      rows[land].classList.add('won'); shade.classList.add('landed');
      setTimeout(() => { shade.remove(); resolve(); }, 900);
    };
    const onKey = e => { e.preventDefault(); e.stopPropagation(); finish(); };
    addEventListener('keydown', onKey, true);
    shade.addEventListener('pointerdown', e => { e.preventDefault(); finish(); });
    const tick = now => {
      if (done) return;
      const k = Math.min(1, (now - t0) / SPIN_MS); const e = 1 - Math.pow(1 - k, 4);   // fast start, long slow stop
      const y = endY * e; place(y);
      const row = Math.floor(y / ROW + 0.5); if (row !== lastRow) { lastRow = row; play('pd', null, null, null, 0.35); }
      const pd = padDown(); if (!pd) padFresh = true; else if (padFresh) { finish(); return; }
      if (k >= 1) { finish(); return; }
      raf = requestAnimationFrame(tick);
    };
    place(0); raf = requestAnimationFrame(tick);
  });
}

/** The reel's rarity id for a finished item: named uniques get their own row. */
export const reelResult = item => item?.unique ? 'unique' : item?.rarity || 'common';
