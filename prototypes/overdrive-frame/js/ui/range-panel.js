// The test range's meter panel: damage per second over the last 5 seconds (big), total, biggest hit, hit count, and
// the split by damage type. Reset clears it; Leave range calls onLeave. Numbers are rounded (lessons: no long decimals).
import { fmt } from '../../../../shared/format.js';
import { SHOT_COLOURS } from '../render/view.js';

const TYPE_NAMES = { kinetic: 'Kinetic', energy: 'Energy', explosive: 'Explosive', fire: 'Fire', electric: 'Electric' };
const n0 = v => fmt(Math.round(v || 0), { decimals: 0 });

export class RangePanel {
  /** @param {HTMLElement} root  @param {{ onReset: () => void, onLeave: () => void, rows?: number[] }} o  rows = target distances in metres */
  constructor(root, { onReset, onLeave, rows = [] }) {
    this.el = document.createElement('section'); this.el.className = 'of-range-panel'; this.el.setAttribute('aria-label', 'Test range meter');
    this.el.innerHTML = `
      <h2>Test range</h2>
      <div class="of-rp-dps"><b>0</b><span>damage / s</span></div>
      <dl class="of-rp-grid"><dt>Total</dt><dd data-k="total">0</dd><dt>Biggest hit</dt><dd data-k="max">0</dd><dt>Hits</dt><dd data-k="hits">0</dd></dl>
      <ul class="of-rp-types" aria-label="Damage by type"></ul>
      <p class="of-rp-hint">Targets mend 3 s after the last hit.${rows.length ? ` Rows at ${rows.map(r => `${r} m`).join(', ')}.` : ''}</p>
      <div class="of-rp-btns"><button type="button" class="of-btn" data-act="reset">Reset</button><button type="button" class="of-btn of-primary" data-act="leave">Leave range</button></div>`;
    this.el.querySelector('[data-act=reset]').addEventListener('click', () => onReset?.());
    this.el.querySelector('[data-act=leave]').addEventListener('click', () => onLeave?.());
    root.append(this.el);
    this.dps = this.el.querySelector('.of-rp-dps b'); this.types = this.el.querySelector('.of-rp-types');
    this.cells = Object.fromEntries([...this.el.querySelectorAll('[data-k]')].map(d => [d.dataset.k, d]));
  }

  /** s = { dps, total, max, hits, types: [{ dtype, total }] } */
  update(s) {
    this.dps.textContent = n0(s.dps);
    this.cells.total.textContent = n0(s.total); this.cells.max.textContent = n0(s.max); this.cells.hits.textContent = n0(s.hits);
    const sig = s.types.map(t => t.dtype + Math.round(t.total)).join();
    if (sig === this._sig) return; this._sig = sig;
    const top = Math.max(1, ...s.types.map(t => t.total));
    this.types.innerHTML = s.types.map(t => `<li><i style="width:${(t.total / top * 100).toFixed(0)}%;background:${SHOT_COLOURS[t.dtype] || '#c9ced6'}"></i><span>${TYPE_NAMES[t.dtype] || t.dtype}</span><b>${n0(t.total)}</b></li>`).join('');
  }

  dispose() { this.el.remove(); }
}
