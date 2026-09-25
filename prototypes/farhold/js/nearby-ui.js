// Farhold — the Nearby Activities panel. DOM only; js/nearby.js decides what is in it.
//
//   "Add a 'Nearby Activities' area below the minimap when walking around, similar to World of
//    Warcraft's quest log."
//
// WHY THIS IS A NODE POOL AND NOT `replaceChildren`.
//
// The panel is redrawn four times a second for as long as the player is walking, which is the whole
// run. Rebuilding five rows of six elements sixty times a minute is fifteen thousand elements an
// hour thrown away, every one of them dropping whatever the pointer was hovering and re-arming
// every tooltip. So the rows are built ONCE and only their text is written after that — the same
// pattern `js/hud.js` already uses twice, for the reticles (`this._ret`) and the skill slots
// (`this._skillSlots`). Farhold has no keyed DOM morph and does not need one for five rows.
//
// The `row.key !== a.id` guard means the two strings that do not change between frames — the glyph
// and the name — are not written at all on a steady row. What moves is the distance and the clock.

import { NEARBY_ICONS, mmss } from './nearby.js';

const $ = id => document.getElementById(id);
const ROWS = 5;

let pool = null;
let wired = false;
let open = true;

/** Build the five rows, once. `onLocate` is bound here and reads the row's live key. */
function buildPool(box, onLocate) {
  const rows = [];
  for (let i = 0; i < ROWS; i++) {
    const node = document.createElement('div');
    node.className = 'nb-row';
    node.hidden = true;

    const icon = document.createElement('i');
    icon.className = 'nb-icon';
    const name = document.createElement('span');
    name.className = 'nb-name';
    const go = document.createElement('button');
    go.className = 'nb-go';
    go.textContent = '⌖';
    go.title = 'Show it on the map';
    const where = document.createElement('span');
    where.className = 'nb-where';
    const clock = document.createElement('span');
    clock.className = 'nb-clock';

    node.append(icon, name, go, where, clock);
    box.append(node);
    const row = { node, icon, name, where, clock, go, key: null, at: null };
    // bound once, reads the row's CURRENT target — closing over the activity itself would go stale
    go.onclick = ev => { ev.stopPropagation(); if (row.at) onLocate?.(row.at); };
    rows.push(row);
  }
  return rows;
}

/**
 * Draw the list. Called at 4 Hz.
 *
 * `list` is whatever `nearbyList()` returned — it carries `total` and `more` on the array itself.
 */
export function drawNearby(list = [], { onLocate = null, hidden = false } = {}) {
  const box = $('nearby');
  if (!box) return;
  const rowBox = $('nearby-rows');
  if (!rowBox) return;

  if (!wired) {
    wired = true;
    const head = $('nearby-head');
    if (head) head.onclick = () => { open = !open; box.classList.toggle('shut', !open); $('nearby-caret').textContent = open ? '▾' : '▸'; };
  }
  if (!pool) pool = buildPool(rowBox, onLocate);

  // hidden while flying, underground, or when there is simply nothing going on
  box.classList.toggle('hidden', hidden || !list.length);
  if (hidden || !list.length) return;

  const count = $('nearby-count');
  if (count) count.textContent = String(list.total ?? list.length);

  for (let i = 0; i < ROWS; i++) {
    const row = pool[i];
    const a = list[i];
    // [hidden] rather than style.display — the page's own reset makes it win
    row.node.hidden = !a;
    if (!a) { row.key = null; row.at = null; continue; }
    row.at = a;
    if (row.key !== a.id) {
      row.key = a.id;
      row.icon.textContent = NEARBY_ICONS[a.kind] || '·';
      row.name.textContent = a.name;
      row.name.title = a.name;
      row.go.setAttribute('aria-label', `Show ${a.name} on the map`);
    }
    row.where.textContent = `${a.where} ${a.compass}`;
    row.clock.textContent = a.ttl != null ? `${mmss(a.ttl)} left` : (a.state || '');
    row.clock.className = 'nb-clock'
      + (a.ttl == null ? '' : a.ttl < 8 ? ' urgent' : a.ttl < 20 ? ' soon' : '');
  }

  const more = $('nearby-more');
  if (more) {
    more.textContent = list.more ? `${list.more} more — open the journal` : '';
    more.hidden = !list.more;
  }
}

/** For a world change: forget the pool so the next draw rebuilds it against the new page. */
export function resetNearby() { pool = null; wired = false; }
