// The minimap: the ground painted once from the terrain's biome grid (the same data as the world), then each frame a
// 90 m circle around you, north up, with roads, your facing, the party, nearby enemies, people, shrines and quest
// objectives (lessons rule 67: every objective shows where it is — on screen, off screen and on a map: off the
// minimap's edge an objective sits on the rim pointing the way). The marked quest's next spot (play/quest-guide.js —
// the goal, or the travel point / shrine toward another region's goal) is a gold diamond, or a gold arrow on the rim;
// the other tracked quests' goals are pale rings / rim dots; travel points out of the region are small gates.
import { BIOMES } from '../../world/terrain.js';

const PAL = { meadow: '#7fae55', wildgrass: '#6a9a4c', forest: '#4a7638', field: '#cdb06a', village: '#b39b78', road: '#d8bd8c', trail: '#c2a77a', boardwalk: '#9a7650', water: '#4f93b8', shore: '#c9bb90', marsh: '#5f7f60', rock: '#8e877a' };

export function createMinimap(app, canvas) {
  const T = app.W.terrain, BG = T.biomeGrid;
  // one pixel per biome cell (4 m)
  const base = document.createElement('canvas'); base.width = BG.nx; base.height = BG.nz;
  const bx = base.getContext('2d');
  const img = bx.createImageData(BG.nx, BG.nz);
  const rgb = Object.fromEntries(Object.entries(PAL).map(([k, h]) => [k, [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]]));
  for (let i = 0; i < BG.ids.length; i++) { const c = rgb[BIOMES[BG.ids[i]]] || rgb.meadow; img.data.set([c[0], c[1], c[2], 255], i * 4); }
  bx.putImageData(img, 0, 0);
  bx.strokeStyle = 'rgba(240,220,170,.9)'; bx.lineWidth = 1;
  for (const r of T.roads) { bx.beginPath(); r.pts.forEach((p, i) => { const x = (p.x - BG.minX) / BG.cell, y = (p.z - BG.minZ) / BG.cell; if (i) bx.lineTo(x, y); else bx.moveTo(x, y); }); bx.stroke(); }
  const ctx = canvas.getContext('2d');
  const R = 90;               // metres from the middle to the edge
  const shrines = app.W.data.placements.shrines;
  return {
    base,
    /** `G` = { guide, others, points } from the HUD (quest-guide.js). */
    draw(S, G = {}) {
      const me = S.drawnMe; if (!me) return;
      const W = canvas.width, H = canvas.height, k = (W / 2) / R;
      ctx.save();
      ctx.clearRect(0, 0, W, H);
      ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); ctx.clip();
      ctx.imageSmoothingEnabled = false;
      const sx = (me.x - R - BG.minX) / BG.cell, sz = (me.z - R - BG.minZ) / BG.cell, sw = (2 * R) / BG.cell;
      ctx.fillStyle = '#26301f'; ctx.fillRect(0, 0, W, H);
      ctx.drawImage(base, sx, sz, sw, sw, 0, 0, W, H);
      const at = (x, z) => [W / 2 + (x - me.x) * k, H / 2 + (z - me.z) * k];
      const dot = (x, z, r, fill, stroke = 'rgba(0,0,0,.6)') => { const [px, py] = at(x, z); ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); };
      for (const s of shrines) if (Math.hypot(s.at[0] - me.x, s.at[1] - me.z) < R + 10) { const [px, py] = at(s.at[0], s.at[1]); ctx.fillStyle = (app.ws?.shrines || []).includes(s.id) ? '#9fe0ff' : '#8a9aa0'; ctx.fillRect(px - 3, py - 4, 6, 8); }
      for (const n of S.npcs || []) dot(n.x, n.z, 2.6, n.quest ? '#ffd76a' : '#f4ecd8');
      for (const u of S.units.values()) {
        if (u.id === S.meId || Math.hypot(u.x - me.x, u.z - me.z) > R) continue;
        if (u.info.k === 'monster') dot(u.x, u.z, u.info.rank === 'boss' ? 4 : 2.4, '#e2553f');
        else if (u.info.k === 'player') dot(u.x, u.z, 3.2, '#7fd0ff', '#fff');
      }
      // travel points out of this region: a small arch
      for (const p of G.points || []) {
        if (Math.hypot(p.at[0] - me.x, p.at[1] - me.z) > R - 4) continue;
        const [px, py] = at(p.at[0], p.at[1]);
        ctx.strokeStyle = '#2a1d0c'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(px, py + 2, 5, Math.PI, 0); ctx.lineTo(px + 5, py + 5); ctx.moveTo(px - 5, py + 2); ctx.lineTo(px - 5, py + 5); ctx.stroke();
        ctx.strokeStyle = '#f3e2b8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py + 2, 5, Math.PI, 0); ctx.lineTo(px + 5, py + 5); ctx.moveTo(px - 5, py + 2); ctx.lineTo(px - 5, py + 5); ctx.stroke();
      }
      // the other tracked goals: inside → a pale ring, outside → a dot on the rim
      for (const m of G.others || []) {
        const dx = m.at[0] - me.x, dz = m.at[1] - me.z, d = Math.hypot(dx, dz);
        ctx.strokeStyle = ctx.fillStyle = '#f4e2a0';
        if (d <= R - 6) { const [px, py] = at(m.at[0], m.at[1]); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, Math.max(4, (m.radius || 6) * k), 0, Math.PI * 2); ctx.stroke(); }
        else { ctx.beginPath(); ctx.arc(W / 2 + dx / d * (W / 2 - 8), H / 2 + dz / d * (H / 2 - 8), 3.5, 0, Math.PI * 2); ctx.fill(); }
      }
      // the marked quest: a gold diamond on its spot (its area as a faint ring), or a gold arrow on the rim
      const g = G.guide;
      if (g?.at) {
        const dx = g.at[0] - me.x, dz = g.at[1] - me.z, d = Math.hypot(dx, dz);
        if (d <= R - 8) {
          const [px, py] = at(g.at[0], g.at[1]);
          if ((g.radius || 0) * k > 8) { ctx.strokeStyle = 'rgba(255,207,74,.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px, py, g.radius * k, 0, Math.PI * 2); ctx.stroke(); }
          ctx.beginPath(); ctx.moveTo(px, py - 7); ctx.lineTo(px + 6, py); ctx.lineTo(px, py + 7); ctx.lineTo(px - 6, py); ctx.closePath();
          ctx.fillStyle = '#ffcf4a'; ctx.fill(); ctx.strokeStyle = '#3a2a10'; ctx.lineWidth = 1.5; ctx.stroke();
        } else {
          const a = Math.atan2(dz, dx), rr = W / 2 - 9;
          ctx.save(); ctx.translate(W / 2 + Math.cos(a) * rr, H / 2 + Math.sin(a) * rr); ctx.rotate(a);
          ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -6); ctx.lineTo(-2, 0); ctx.lineTo(-5, 6); ctx.closePath();
          ctx.fillStyle = '#ffcf4a'; ctx.fill(); ctx.strokeStyle = '#3a2a10'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
        }
      }
      // me: an arrow along where I face
      ctx.translate(W / 2, H / 2); ctx.rotate(-(S.meFacing || 0) + Math.PI);
      ctx.fillStyle = '#fff6d8'; ctx.strokeStyle = '#3a2a10'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = '#6b5332'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#e8c170'; ctx.font = 'bold 12px "Alegreya Sans", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('N', W / 2, 13);
    },
  };
}
