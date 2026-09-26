// Full-screen map (docs/02 §13) and the minimap (§12). The map has two tabs: the Act map (the node graph with
// visited / known / locked nodes and your position) and the Room map (the current room drawn from its cells,
// with exits, lamp-posts and you). The minimap is a small canvas in the top-right corner, redrawn 4 times a
// second from the cell grid around the player (fog: only rooms you have been in are ever drawn).
import { el, btn, cap } from './menukit.js';

const TYPE_ICON = { hub: '⌂', lesson: '✎', fight: '⚔', puzzle: '⚙', event: '!', elite: '☠', flood: '≈', lamppost: '✚', boss: '♛', secret: '?' };

export const mapScreen = {
  id: 'map', title: 'Map',
  render(root, ctx, args, router) {
    const g = ctx.game, M = g?.actMaps; if (!M) { root.append(el('div', { class: 'lf-frame small' }, el('p', { text: 'No map yet.' }))); return; }
    let tab = args.tab || 'act';
    const frame = el('div', { class: 'lf-frame lf-map' }); root.append(frame);
    const draw = () => {
      const actId = g.act || 'act1', view = M.view(actId, { visited: Object.keys(g.visitedNodes || {}) });
      const here = M.nodeOf(g.room?.room?.id);
      const head = el('div', { class: 'lf-frame-head' }, el('h2', { class: 'lf-title', text: view.act.name }), btn('Act map', () => { tab = 'act'; draw(); }, { cls: tab === 'act' ? 'small primary' : 'small' }), btn('Room', () => { tab = 'room'; draw(); }, { cls: tab === 'room' ? 'small primary' : 'small' }), el('span', { class: 'grow' }), el('button', { class: 'lf-close', type: 'button', text: '✕', onclick: () => router.back() }));
      const body = el('div', { class: 'lf-frame-body' });
      if (tab === 'act') body.append(actGraph(view, here, g));
      else body.append(roomCanvas(g));
      frame.replaceChildren(head, body, el('p', { class: 'dim small', text: tab === 'act' ? 'Walk to a node through the doors of the last room. Hatched edges need a mechanic you have not found yet.' : 'Gold: lamp-posts. Green: exits. White: you.' }));
    };
    draw();
  },
  onKey(code) { if (code === 'KeyM') { document.querySelector('.lf-map .lf-close')?.click(); return true; } return false; },
};

function actGraph(view, here, g) {
  const nodes = view.nodes, climbed = view.act.climbed;
  // layers by longest path from the first node
  const layer = {}; layer[nodes[0].id] = 0; let changed = true;
  while (changed) { changed = false; for (const [a, b] of view.edges) if (layer[a] != null && (layer[b] == null || layer[b] < layer[a] + 1) && layer[b] !== layer[a] + 1) { layer[b] = layer[a] + 1; changed = true; if (layer[b] > 20) break; } }
  const byLayer = {}; for (const n of nodes) { const L = layer[n.id] ?? 0; (byLayer[L] ||= []).push(n); }
  const W = 640, H = 460, maxL = Math.max(...Object.keys(byLayer).map(Number));
  const pos = {}; for (const [L, list] of Object.entries(byLayer)) list.forEach((n, k) => { const y = 40 + (maxL ? (+L / maxL) : 0) * (H - 80); pos[n.id] = [W / 2 + (k - (list.length - 1) / 2) * 180, climbed ? H - y : y]; });
  const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'lf-actgraph');
  const mk = (t, a) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); svg.append(e); return e; };
  for (const [a, b, o] of view.edges) { const A = nodes.find(n => n.id === a), Bn = nodes.find(n => n.id === b); if (!A.known && !Bn.known) continue; if (o?.hidden && !Bn.visited) continue; mk('line', { x1: pos[a][0], y1: pos[a][1], x2: pos[b][0], y2: pos[b][1], stroke: o?.locked ? '#7a4ab0' : '#6b5a3c', 'stroke-width': 3, 'stroke-dasharray': o?.locked || o?.oneWay ? '6 5' : '' }); }
  for (const n of nodes) {
    if (!n.known) continue; const [x, y] = pos[n.id], cur = n.id === here;
    mk('circle', { cx: x, cy: y, r: cur ? 22 : 18, fill: n.visited ? '#2a2418' : '#141722', stroke: cur ? '#ffe6b0' : n.visited ? '#e8b96a' : '#555', 'stroke-width': cur ? 4 : 2 });
    const t = mk('text', { x, y: y + 6, 'text-anchor': 'middle', fill: n.visited ? '#e8b96a' : '#8e8a80', 'font-size': 18 }); t.textContent = TYPE_ICON[n.type] || '•';
    const l = mk('text', { x, y: y + 38, 'text-anchor': 'middle', fill: '#d9d3c4', 'font-size': 13, 'font-family': 'Spectral, serif' }); l.textContent = n.visited || cur ? n.name : cap(n.type);
    if (n.lampPost) { const s = mk('text', { x: x + 20, y: y - 12, fill: '#ffc46a', 'font-size': 13 }); s.textContent = '✚'; }
  }
  return svg;
}
function roomCanvas(g) {
  const G = g.grid, cv = document.createElement('canvas'); cv.width = G.W; cv.height = G.H; cv.className = 'lf-roommap';
  const c2 = cv.getContext('2d'), img = c2.createImageData(G.W, G.H), R = G.mats.ramps;
  for (let i = 0; i < G.n; i++) { const m = G.mat[i], o = i * 4; if (!m) { img.data.set([10, 12, 18, 255], o); continue; } const col = R[m][2 % R[m].length]; img.data.set([Math.min(255, col[0] * 2 + 10), Math.min(255, col[1] * 2 + 10), Math.min(255, col[2] * 2 + 14), 255], o); }
  c2.putImageData(img, 0, 0);
  for (const t of g.room.things) { if (t.t === 'lamp_post') { c2.fillStyle = '#ffc46a'; c2.fillRect(t.at[0] - 3, t.at[1] - 20, 6, 20); } if (t.t === 'exit') { c2.fillStyle = '#4fd06a'; c2.fillRect(...t.rect); } }
  c2.fillStyle = '#fff'; c2.fillRect(g.player.x - 4, g.player.y - 12, 8, 12);
  return cv;
}

/** The minimap canvas (DOM, top-right). update() redraws from the grid around the player. */
export function createMinimap(parent) {
  const cv = document.createElement('canvas'); cv.width = 96; cv.height = 54; cv.className = 'lf-minimap'; parent.append(cv);
  const c2 = cv.getContext('2d'); const img = c2.createImageData(96, 54);
  return {
    el: cv,
    update(game, scale = 3) {
      if (!game?.grid || !game.player) { cv.hidden = true; return; } cv.hidden = !!game.hideMinimap;
      const G = game.grid, p = game.player, zoom = 4, x0 = Math.round(p.x - 48 * zoom), y0 = Math.round(p.y - 27 * zoom);
      for (let y = 0; y < 54; y++) for (let x = 0; x < 96; x++) {
        const wx = x0 + x * zoom, wy = y0 + y * zoom, o = (y * 96 + x) * 4;
        if (wx < 0 || wy < 0 || wx >= G.W || wy >= G.H) { img.data.set([6, 7, 10, 200], o); continue; }
        const m = G.mat[wy * G.W + wx], c = G.mats.cls[m];
        img.data.set(c === 1 || c === 2 ? [70, 76, 92, 230] : c === 3 ? [40, 80, 140, 230] : [14, 16, 24, 200], o);
      }
      c2.putImageData(img, 0, 0);
      c2.fillStyle = '#ffe6b0'; c2.fillRect(47, 25, 2, 3);
      for (const t of game.room.things) { const mx = (((t.at?.[0] ?? t.rect?.[0]) - x0) / zoom) | 0, my = (((t.at?.[1] ?? t.rect?.[1]) - y0) / zoom) | 0; if (mx < 0 || my < 0 || mx > 95 || my > 53) continue; if (t.t === 'lamp_post') { c2.fillStyle = '#ffc46a'; c2.fillRect(mx, my - 3, 2, 3); } if (t.t === 'exit') { c2.fillStyle = '#4fd06a'; c2.fillRect(mx, my, 2, 3); } }
      for (const e of game.entities) if (e.kind === 'enemy' && !e.dead) { const mx = ((e.x - x0) / zoom) | 0, my = ((e.y - y0) / zoom) | 0; if (mx >= 0 && my >= 0 && mx < 96 && my < 54) { c2.fillStyle = '#ff5a4a'; c2.fillRect(mx, my - 1, 1, 1); } }
      const css = Math.max(1, Math.round(scale / (window.devicePixelRatio || 1) * 1.2)); cv.style.width = 96 * css + 'px'; cv.style.height = 54 * css + 'px';
    },
  };
}
export const screens = [mapScreen];
