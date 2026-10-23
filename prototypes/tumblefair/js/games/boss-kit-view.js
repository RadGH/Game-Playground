// The browser half of the round-8 boss kit (boss-kit.js is the pure half): what every boss game draws the same way.
//   const K = bossKit(ctx, { name: 'Golem', color: '#…' })
//   K.std(color, extra) / K.basic(color, extra)   materials, freed on dispose
//   K.mesh(geo, mat, x, y, z, parent)             a mesh added to parent (default ctx.group)
//   K.hp(value, max)                              the boss health bar (name + bar + number)
//   K.row(html)                                   the little row under the bar (pips, hints)
//   K.banner(text, cls, ms)                       a big word over the middle (cls: good | bad | warn)
//   K.puff(x, y, z, color, size)                  a quick expanding puff
//   K.rings(rows, opts)                           telegraph rings from state rows [id, x, z, r, left, total]
//   K.frame(dt, t)                                call from the view's frame (puffs, rings)
//   K.dispose()
// The CSS is js/games/boss-kit.css, linked once. Nothing on the HUD is tappable.
import { h } from '../client/gamehud.js';

export function bossKit(ctx, { name = 'Boss', color = '#e8434f' } = {}) {
  const { THREE, group } = ctx;
  if (!document.querySelector('link[data-boss-kit]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('./boss-kit.css', import.meta.url).href; l.dataset.bossKit = '1'; document.head.append(l); }
  const mats = [], geos = [];
  const std = (c, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...extra }); mats.push(m); return m; };
  const basic = (c, extra = {}) => { const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, depthWrite: false, ...extra }); mats.push(m); return m; };
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent = group) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const keep = g => { geos.push(g); return g; };

  // ---- HUD
  const hud = h('div', 'bk-hud'), banner = h('div', 'bk-banner');
  hud.innerHTML = `<div class="bk-hp"><b></b><span class="bk-bar"><i></i></span><em></em></div><div class="bk-row"></div>`;
  hud.querySelector('b').textContent = name; hud.style.setProperty('--boss', color);
  ctx.ui.append(hud, banner);
  const fill = hud.querySelector('.bk-bar i'), num = hud.querySelector('em'), rowEl = hud.querySelector('.bk-row');
  let lastHp = '', lastRow = '', bt = 0;
  const hp = (v, max) => { const s = `${v}/${max}`; if (s === lastHp) return; lastHp = s; fill.style.width = (100 * Math.max(0, v) / Math.max(1, max)).toFixed(1) + '%'; num.textContent = v; };
  const row = html => { if (html !== lastRow) { lastRow = html; rowEl.innerHTML = html; } };
  const showBanner = (text, cls = '', ms = 1400) => { banner.textContent = text; banner.className = 'bk-banner show ' + cls; clearTimeout(bt); bt = setTimeout(() => { banner.className = 'bk-banner'; }, ms); };

  // ---- puffs
  const fx = [], puffGeo = keep(new THREE.IcosahedronGeometry(0.6, 0));
  const puff = (x, y, z, c, size = 1) => { const p = mesh(puffGeo, basic(c, { opacity: 0.9 }), x, y, z); p.userData.size = size; fx.push({ p, t: 0 }); };

  // ---- telegraph rings: an outline that blinks near the end + a disc that fills up
  const ringGeo = keep(new THREE.RingGeometry(0.88, 1, 40).rotateX(-Math.PI / 2)), discGeo = keep(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2));
  const live = new Map();
  function rings(rows, { color = '#ff3b3b', fillColor = '#ffb04a', onAdd, onDrop } = {}) {
    for (const R of live.values()) R.seen = false;
    for (const row of rows) {
      const [id, x, z, r, left, total] = row; let R = live.get(id);
      if (!R) {
        R = { id, x, z, r, left, total, ring: mesh(ringGeo, basic(color, { opacity: 0.95 }), x, 0.07, z), fill: mesh(discGeo, basic(fillColor, { opacity: 0.5 }), x, 0.06, z) };
        R.ring.scale.setScalar(r); R.ring.renderOrder = 3; R.fill.renderOrder = 2; live.set(id, R); onAdd?.(R, row);
      }
      R.seen = true; R.left = Math.min(R.left, left); R.row = row;
    }
    for (const [id, R] of live) if (!R.seen) { onDrop?.(R); group.remove(R.ring, R.fill); R.ring.material.dispose(); R.fill.material.dispose(); live.delete(id); }
  }
  function frame(dt, t) {
    for (const R of live.values()) {
      R.left = Math.max(0, R.left - dt); const k = 1 - R.left / Math.max(0.01, R.total);
      R.fill.scale.setScalar(Math.max(0.01, k * R.r * 0.95));
      R.ring.material.opacity = k > 0.7 ? 0.5 + 0.5 * Math.abs(Math.sin(t * 18)) : 0.95;
    }
    for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t += dt; f.p.scale.setScalar(f.p.userData.size * (0.4 + f.t * 2.6)); f.p.material.opacity = Math.max(0, 0.9 - f.t * 1.8); if (f.t > 0.5) { group.remove(f.p); f.p.material.dispose(); fx.splice(i, 1); } }
  }
  function dispose() {
    clearTimeout(bt); hud.remove(); banner.remove();
    for (const R of live.values()) { R.ring.material.dispose(); R.fill.material.dispose(); }
    for (const f of fx) f.p.material.dispose();
    for (const m of mats) m.dispose(); for (const g of geos) g.dispose();
  }
  return { std, basic, mesh, keep, hp, row, banner: showBanner, puff, rings, live, frame, dispose, hud };
}
