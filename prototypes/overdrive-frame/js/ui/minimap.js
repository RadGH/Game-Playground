// The minimap and the mission map (owner report 2026-11-18: "There are no indicators. There is no minimap"). The city
// drawn as a small diamond turned the same way as the screen (up on the map = up on the screen): buildings, your frame,
// teammates, enemies, and the mission's targets from render/targets.js pulsing in their colour. The corner minimap is
// for wide screens; the mission map (Tab / M / controller View / the Map button) fills the screen on any device and
// doesn't pause the mission.
import { toScreen } from '../../../../citykit/js/iso.js';
import { objectiveTargets } from '../render/targets.js';
import { drawMapGround } from '../render/city-ground.js';   // round 7: a city layout's water, rails, parks

export class MiniMap {
  constructor(root) {
    this.small = document.createElement('canvas'); this.small.className = 'of-minimap-hud'; this.small.setAttribute('aria-hidden', 'true');
    this.big = document.createElement('div'); this.big.className = 'of-mapsheet'; this.big.hidden = true; this.big.setAttribute('role', 'dialog'); this.big.setAttribute('aria-label', 'Mission map');
    this.big.innerHTML = `<div class="of-mapsheet-card"><header><h2>Mission map</h2><button type="button" class="of-btn of-small" data-a="close">Close</button></header><canvas></canvas>
      <ul class="of-map-key"><li><i style="--c:#ffb02e"></i>You</li><li><i style="--c:#3ff0ff"></i>Team</li><li><i style="--c:#ff4a3a"></i>Enemies</li><li><i style="--c:#ffd34a" class="of-ring"></i>Targets</li><li><i style="--c:#5fffb0" class="of-ring"></i>Dropship</li></ul></div>`;
    this.bigCv = this.big.querySelector('canvas');
    this.big.querySelector('[data-a="close"]').addEventListener('click', () => this.toggle(false));
    this.big.addEventListener('click', e => { if (e.target === this.big) this.toggle(false); });
    root.append(this.small); document.body.append(this.big);   // the sheet over everything (the phone's touch buttons too)
    this.n = 0; this.cacheKey = '';
  }
  get open() { return !this.big.hidden; }
  toggle(on = !this.open) { this.big.hidden = !on; if (on) this.n = 0; }

  /** Called every frame by the HUD; redraws a few times a second. */
  frame(S, me, t) {
    if (!S?.world) return;
    if (this.n++ % 5) return;
    if (this.small.offsetParent) this._draw(this.small, S, me, t, 180, 120);
    if (this.open) { const r = this.big.querySelector('.of-mapsheet-card').getBoundingClientRect(); this._draw(this.bigCv, S, me, t, Math.max(200, r.width - 32), Math.max(160, Math.min(innerHeight * 0.7, r.width * 0.62))); }
  }

  _draw(cv, S, me, t, w, h) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
    const W = S.world, g = cv.getContext('2d');
    // fit the whole district's diamond into the canvas
    const c = [toScreen(0, 0, 0, 0), toScreen(W.w, 0, 0, 0), toScreen(W.w, W.h, 0, 0), toScreen(0, W.h, 0, 0)];
    const minX = Math.min(...c.map(p => p.sx)), maxX = Math.max(...c.map(p => p.sx)), minY = Math.min(...c.map(p => p.sy)), maxY = Math.max(...c.map(p => p.sy));
    const k = Math.min((w - 12) / (maxX - minX), (h - 12) / (maxY - minY)) * dpr;
    const ox = (cv.width - (maxX - minX) * k) / 2 - minX * k, oy = (cv.height - (maxY - minY) * k) / 2 - minY * k;
    const P = (x, z) => { const s = toScreen(x, z, 0, 0); return [ox + s.sx * k, oy + s.sy * k]; };
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = 'rgba(8, 11, 18, 0.82)'; g.beginPath(); c.forEach((p, i) => { const q = [ox + p.sx * k, oy + p.sy * k]; i ? g.lineTo(...q) : g.moveTo(...q); }); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(120, 140, 170, 0.5)'; g.lineWidth = dpr; g.stroke();
    const foot = (x, z, fw, fd) => { g.beginPath(); [[x, z], [x + fw, z], [x + fw, z + fd], [x, z + fd]].forEach((q, i) => (i ? g.lineTo(...P(...q)) : g.moveTo(...P(...q)))); g.closePath(); };
    drawMapGround(S.def.map, (x, z, fw, fd, col) => { foot(x, z, fw, fd); g.fillStyle = col; g.fill(); });
    for (const l of W.lots) { if (!l.solid && !l.recipe) continue; foot(l.x, l.z, l.w, l.d); g.fillStyle = l.stage >= 3 ? 'rgba(90, 80, 70, 0.55)' : l.natural ? 'rgba(70, 130, 70, 0.8)' : 'rgba(118, 130, 152, 0.85)'; g.fill(); }
    const pulse = 0.5 + 0.5 * Math.sin(t * 5), dot = (x, z, r, col) => { const [px, py] = P(x, z); g.fillStyle = col; g.beginPath(); g.arc(px, py, r * dpr, 0, Math.PI * 2); g.fill(); };
    // targets: the building itself lit, a pulsing ring on the rest
    for (const tg of objectiveTargets(S)) {
      if (tg.lot) { foot(tg.lot.x, tg.lot.z, tg.lot.w, tg.lot.d); g.fillStyle = tg.color; g.globalAlpha = 0.55 + 0.45 * pulse; g.fill(); g.globalAlpha = 1; }
      const [px, py] = P(tg.x, tg.z), rr = (5 + 3 * pulse) * dpr;
      g.strokeStyle = tg.color; g.lineWidth = 2 * dpr; g.beginPath(); g.ellipse(px, py, rr * 1.4, rr * 0.8, 0, 0, Math.PI * 2); g.stroke();
    }
    if (S.phase !== 'extract' && S.def.extract) { const [px, py] = P(S.def.extract.x, S.def.extract.z); g.strokeStyle = 'rgba(95,255,176,0.6)'; g.lineWidth = 1.5 * dpr; g.beginPath(); g.ellipse(px, py, 6 * dpr, 3.5 * dpr, 0, 0, Math.PI * 2); g.stroke(); }   // home, always
    for (const e of S.enemies) if (!e.dead && e.state !== 'warn' && !e.hidden) dot(e.x, e.z, e.boss ? 4 : (S.kinds[e.kind]?.radius || 0.1) > 0.2 ? 2.2 : 1.3, '#ff4a3a');
    for (const m of S.mechs) { if (m === me) continue; dot(m.x, m.z, 3, m.team === 'enemy' || (me && S.versus && m.team !== me.team) ? '#ff4a3a' : '#3ff0ff'); }
    for (const a of S.allies || []) if (!a.down && !a.arrived) dot(a.x, a.z, 2.6, '#3ff0ff');
    if (me) { dot(me.x, me.z, 5, '#ffb02e'); const [px, py] = P(me.x, me.z), [qx, qy] = P(me.x + Math.cos(me.aim) * 1.6, me.z + Math.sin(me.aim) * 1.6); g.strokeStyle = '#ffb02e'; g.lineWidth = 1.5 * dpr; g.beginPath(); g.moveTo(px, py); g.lineTo(qx, qy); g.stroke(); }
  }
  dispose() { this.small.remove(); this.big.remove(); }
}
