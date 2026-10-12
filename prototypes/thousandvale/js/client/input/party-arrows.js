// Input layer (play-test 10, Y36 — stream G2): where is my party? Every party member whose body is NOT on the screen
// gets a small arrow on the screen's edge pointing at them (their initial in it, the distance beside it). Someone you
// TRACK already has D-UI's big named arrow (ui/pt10.js) — this module stands down for them, so there are never two.
//
// It reads what D-UI's tracker already knows (`api.tracker().people()` — party frames at 2 Hz, the server's
// `whereabouts` for another room) and the camera through `api.project(x, y, z)`. No server message of its own.
// The geometry is pure (partyArrowsFor) so node can test it.
import { edgeArrow, metresText } from '../ui/pt10-core.js';

/** Inside this many pixels of the edge a body still counts as "on screen" (no arrow). */
export const ARROW_EDGE = 24;
/** Nearer than this (metres) and on your screen's side of the camera: no arrow — you can see them. */
export const ARROW_NEAR_M = 8;

/**
 * people  [{ char, name, self, placed, x, z, dist, online, tracked }]   (pt10-core partyPeople rows)
 * project (x, z) -> { x, y, behind } in screen pixels            size { w, h }      margin: how far in the arrows sit
 * -> [{ char, name, x, y, angle, dist }] — one per member who needs an arrow
 */
export function partyArrowsFor(people, project, { w, h }, { margin = 30, skipTracked = true } = {}) {
  const out = [];
  for (const p of people || []) {
    if (p.self || !p.placed || p.online === false || (skipTracked && p.tracked)) continue;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    let s = null; try { s = project(p.x, p.z); } catch { s = null; }
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
    let sx = s.x, sy = s.y;
    if (s.behind) { sx = w - sx; sy = h * 3; }             // behind the camera: the projection is mirrored — send it off the bottom
    const on = !s.behind && sx >= ARROW_EDGE && sx <= w - ARROW_EDGE && sy >= ARROW_EDGE && sy <= h - ARROW_EDGE;
    if (on || (Number.isFinite(p.dist) && p.dist < ARROW_NEAR_M && !s.behind)) continue;
    const e = edgeArrow(sx, sy, w, h, { margin, near: ARROW_EDGE });
    if (!e) continue;
    out.push({ char: p.char, name: p.name || '?', x: e.x, y: e.y, angle: e.angle, dist: Number.isFinite(p.dist) ? p.dist : null });
  }
  return out;
}

export function createPartyArrows({ api = {}, parent = null } = {}) {
  const root = document.createElement('div'); root.className = 'tv-partyarrows'; root.setAttribute('aria-hidden', 'true');
  (parent || document.getElementById('hud') || document.body).appendChild(root);
  const els = new Map();
  let acc = 0;
  function tick(dt = 0.016) {
    acc += dt; if (acc < 0.066) return; acc = 0;                 // 15 times a second is plenty for an edge marker
    const T = api.tracker?.(), me = api.self?.();
    let list = [];
    if (T?.people && me && api.project) {
      let people = []; try { people = T.people(); } catch { people = []; }
      if (people.length > 1) {
        const phone = document.documentElement.dataset.layout === 'phone';
        list = partyArrowsFor(people, (x, z) => api.project(x, null, z), { w: innerWidth, h: innerHeight }, { margin: phone ? 34 : 30 });
      }
    }
    const live = new Set();
    for (const a of list) {
      const k = String(a.char); live.add(k);
      let el = els.get(k);
      if (!el) { el = document.createElement('div'); el.className = 'tv-partyarrow'; el.dataset.char = k; el.innerHTML = '<i></i><b></b><span></span>'; root.appendChild(el); els.set(k, el); }
      el.style.transform = `translate(${Math.round(a.x)}px, ${Math.round(a.y)}px)`;
      el.children[0].style.transform = `rotate(${(a.angle * 180 / Math.PI).toFixed(1)}deg)`;
      const ini = (a.name[0] || '?').toUpperCase(); if (el.children[1].textContent !== ini) el.children[1].textContent = ini;
      const d = a.dist != null ? metresText(a.dist) : ''; if (el.children[2].textContent !== d) el.children[2].textContent = d;
      el.title = a.name;
    }
    for (const [k, el] of els) if (!live.has(k)) { el.remove(); els.delete(k); }
  }
  return { root, tick, get state() { return [...els.values()].map(e => ({ char: e.dataset.char, name: e.title, dist: e.children[2].textContent, at: e.style.transform })); } };
}
