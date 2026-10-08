// "!" and "?" over the people who have something for YOU (play-test 8, W12: "Show quest markers (! and ?) above NPCs").
//
// The marks are per player, so they are not in an entity's shared `info`: stream A sends
//   questMarks { marks: { <entity id>: 'offer' | 'turnin' | 'later' | 'active' | null }, full? }
// — the whole map for the room on join (`full`), then patches. This file keeps that map and floats a glyph above each
// marked body:
//   offer   gold "!"   a quest or a job you can take now
//   turnin  gold "?"   you can hand one in here (or your current step is to talk to them)
//   later   grey "!"   they have one you cannot take yet
//   active  grey "?"   yours, not finished
// The glyph is a sprite that grows with distance (so it is the same few dozen pixels at 5 m and at 40 m), bobs a little,
// ignores fog, and hides behind walls like anything else. Four textures made once at boot, four sprite materials, a
// sprite per marked body taken from a small pool — nothing is compiled or allocated when a mark appears.
//
//   const marks = createQuestMarks(scene, { actors, camera })
//   marks.onMessage(msg)         // `questMarks` from the server
//   marks.update(dt)             // every frame
//   marks.list()                 // [{ id, x, z, mark }] for the minimap / map (D-UI)
//   marks.sprite(mark)           // the same glyph as a 64 px canvas (D-UI draws it on the minimap)

import * as THREE from 'three';

export const MARKS = ['offer', 'turnin', 'later', 'active'];
/** Glyph and colours per mark. Pure data — the node test and D-UI read it. */
export const MARK_LOOK = {
  offer: { glyph: '!', fill: '#ffd23a', edge: '#5a3a00', glow: 'rgba(255, 200, 40, 0.55)', label: 'Has a quest for you' },
  turnin: { glyph: '?', fill: '#ffd23a', edge: '#5a3a00', glow: 'rgba(255, 200, 40, 0.55)', label: 'Ready to hand in' },
  later: { glyph: '!', fill: '#b9bcc4', edge: '#2e3036', glow: 'rgba(160, 165, 175, 0.3)', label: 'Has a quest you cannot take yet' },
  active: { glyph: '?', fill: '#b9bcc4', edge: '#2e3036', glow: 'rgba(160, 165, 175, 0.3)', label: 'Your quest — not finished yet' },
};
/** Other spellings a server or an older message may use -> ours. */
const ALIAS = { ready: 'turnin', done: 'turnin', complete: 'turnin', available: 'offer', new: 'offer', '!': 'offer', '?': 'turnin', grey: 'later', gray: 'later', locked: 'later', progress: 'active', '!g': 'later', '?g': 'active' };
export const markOf = v => { const k = String(v ?? '').toLowerCase(); return MARKS.includes(k) ? k : ALIAS[k] || null; };

/** Pure: the next marks map after a message. `full` replaces everything; otherwise entries patch (null / '' removes). */
export function applyMarks(prev, msg) {
  const next = msg?.full ? new Map() : new Map(prev);
  const src = msg?.marks ?? (msg && msg.id != null ? { [msg.id]: msg.mark } : null);
  if (src && typeof src === 'object') for (const [id, v] of Object.entries(src)) { const m = markOf(v); const key = Number.isFinite(+id) ? +id : id; if (m) next.set(key, m); else next.delete(key); }
  return next;
}
/**
 * Pure: how tall (metres) the glyph is drawn at a distance, so it stays readable out to 40 m and is not a billboard at 3.
 * About 3.4 % of the distance, between 0.55 m and 1.7 m.
 */
export const markSize = dist => Math.max(0.55, Math.min(1.7, 0.034 * Math.max(0, dist) + 0.38));

function drawGlyph(mark, size = 128) {
  const L = MARK_LOOK[mark], c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), m = size / 2;
  const halo = g.createRadialGradient(m, m, size * 0.08, m, m, size * 0.5);
  halo.addColorStop(0, L.glow); halo.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = halo; g.fillRect(0, 0, size, size);
  g.font = `900 ${Math.round(size * 0.86)}px Georgia, "Times New Roman", serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.lineWidth = size * 0.11; g.strokeStyle = L.edge; g.strokeText(L.glyph, m, m * 1.06);
  g.lineWidth = size * 0.035; g.strokeStyle = '#fff6c8'; if (mark === 'offer' || mark === 'turnin') g.strokeText(L.glyph, m, m * 1.06);
  g.fillStyle = L.fill; g.fillText(L.glyph, m, m * 1.06);
  return c;
}

export function createQuestMarks(scene, { actors, camera, pool = 24 } = {}) {
  const group = new THREE.Group(); group.name = 'quest-marks'; scene.add(group);
  const canvases = {}, mats = {};
  for (const k of MARKS) {
    canvases[k] = drawGlyph(k);
    const t = new THREE.CanvasTexture(canvases[k]); t.colorSpace = THREE.SRGBColorSpace;
    mats[k] = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false });
  }
  const free = [];
  for (let i = 0; i < pool; i++) { const s = new THREE.Sprite(mats.offer); s.visible = false; s.renderOrder = 6; group.add(s); free.push(s); }
  let marks = new Map();
  const shown = new Map();                       // entity id -> sprite
  const stats = { messages: 0, shown: 0 };
  let clock = 0, fullAt = -1e9;
  const _v = new THREE.Vector3();

  function release(id) { const s = shown.get(id); if (!s) return; s.visible = false; free.push(s); shown.delete(id); }
  return {
    group, stats, MARK_LOOK,
    onMessage(msg) { stats.messages++; if (msg?.full) fullAt = performance.now(); marks = applyMarks(marks, msg); for (const id of [...shown.keys()]) if (!marks.has(id)) release(id); },
    /** Set one mark by hand (specs, demos). */
    set(id, mark) { marks = applyMarks(marks, { marks: { [id]: mark } }); if (!marks.has(id)) release(id); },
    /** A room change: the old room's ids mean nothing now — unless the new room's whole map has only just arrived (it may come before `joined`). */
    roomChanged() { if (performance.now() - fullAt > 1500) this.clear(); },
    clear() { marks = new Map(); for (const id of [...shown.keys()]) release(id); },
    get(id) { return marks.get(id) || null; },
    /** Every marked body the client can place, for the minimap and the map. */
    list() { const out = []; for (const [id, mark] of marks) { const a = actors.get(id); if (a) out.push({ id, x: a.pos.x, z: a.pos.z, mark, name: a.name || '' }); } return out; },
    /** The glyph as a canvas (the same picture the world shows). */
    sprite(mark) { return canvases[markOf(mark)] || null; },
    update(dt) {
      clock += dt;
      for (const [id, mark] of marks) {
        const a = actors.get(id);
        if (!a || a.dead) { release(id); continue; }
        let s = shown.get(id);
        if (!s) { s = free.pop(); if (!s) continue; shown.set(id, s); s.visible = true; }
        if (s.material !== mats[mark]) s.material = mats[mark];
        const top = a.pos.y + (a.height || 1.7) + 0.55;
        _v.set(a.pos.x, top, a.pos.z);
        const d = camera ? camera.position.distanceTo(_v) : 10, h = markSize(d);
        // the name plate sits right above the head: lift the glyph clear of it, a little more the bigger it is drawn
        s.position.set(a.pos.x, top + h * 0.55 + Math.sin(clock * 2.4 + (typeof id === 'number' ? id : 0)) * 0.06, a.pos.z);
        s.scale.set(h, h, 1);
        s.visible = d < 140;
      }
      stats.shown = shown.size;
    },
    /** One sprite of each material for the boot warm-up (sprites share one program; this makes sure it is linked). */
    sample() { const g = new THREE.Group(); MARKS.forEach((k, i) => { const s = new THREE.Sprite(mats[k]); s.position.x = i; g.add(s); }); return g; },
  };
}
