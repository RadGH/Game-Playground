// Floating combat numbers + world-anchored labels, drawn as pooled DOM nodes over the canvas.
// Numbers go through shared/format.js `hp` so nothing ever reads "25.0200000001".

import { hp as fmtHp } from '../../../../shared/format.js';

export function createNumbers(layer) {
  const pool = [];
  const live = [];
  const MAX = 90;

  function node() {
    const n = pool.pop() || document.createElement('div');
    n.className = 'fnum';
    layer.appendChild(n);
    return n;
  }

  return {
    /** kind: 'dmg' | 'dmgTaken' | 'crit' | 'heal' | 'gold' | 'xp' | 'text' */
    spawn(wx, wy, wz, text, kind = 'dmg') {
      if (live.length >= MAX) { const old = live.shift(); old.el.remove(); pool.push(old.el); }
      const el = node();
      el.className = 'fnum ' + kind;
      el.textContent = typeof text === 'number' ? fmtHp(text) : text;
      live.push({ el, wx, wy, wz, t: 0, life: kind === 'crit' ? 1.1 : 0.85, dx: (Math.random() - 0.5) * 18 });
    },
    update(dt, project) {
      for (let i = live.length - 1; i >= 0; i--) {
        const f = live[i];
        f.t += dt;
        const k = f.t / f.life;
        if (k >= 1) { f.el.remove(); pool.push(f.el); live.splice(i, 1); continue; }
        const p = project(f.wx, f.wy, f.wz);
        if (!p || !p.visible) { f.el.style.opacity = '0'; continue; }
        const rise = 46 * (1 - (1 - k) * (1 - k));
        f.el.style.transform = `translate(${(p.x + f.dx * k).toFixed(1)}px, ${(p.y - rise).toFixed(1)}px) translate(-50%, -50%) scale(${k < 0.12 ? 0.6 + k * 4 : 1})`;
        f.el.style.opacity = String(k > 0.65 ? (1 - k) / 0.35 : 1);
      }
    },
    clear() { for (const f of live) { f.el.remove(); pool.push(f.el); } live.length = 0; },
  };
}
