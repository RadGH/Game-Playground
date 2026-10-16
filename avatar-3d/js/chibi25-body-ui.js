// Chibi 2.5 (part B): the BODY and OUTFIT controls of the Chibi 2.5 builder (avatar-3d/chibi25.html). The page imports
// this module if it exists and calls `mountBodyUi(section, { get, set })` once (CHIBI2.md "Chibi 2.5 contracts" 6):
// `get()` is the current look, `set(look)` rebuilds both characters. Every field is a `body.*` key from
// chibi25-body-options.js (read only by a 2.5 look) or a garment id; the lists come from the same tables a game reads.
import { CHIBI25_BODY_OPTIONS } from './chibi25-body-options.js';
import { CHIBI2_RACES, CHIBI2_RACE_IDS } from './chibi2-races.js';
import { TOP_STYLES, BOTTOM_STYLES, SHOE_STYLES } from './chibi2-body.js';
import { OUTFIT25 } from './chibi25-outfits.js';
import { PARTS } from '../../avatar-2d/js/parts/index.js';

const O = CHIBI25_BODY_OPTIONS;
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };

export function mountBodyUi(section, { get, set }) {
  const box = el('div', { className: 'c25-body-ui' });
  section.append(box);
  const update = fn => { const look = structuredClone(get()); look.body = look.body || {}; fn(look); set(look); draw(); };
  const field = (label, input, out = el('span')) => { const l = el('label', { className: 'field' }); l.append(label, input, out); box.append(l); return input; };
  const select = (rows, value, on) => {
    const s = el('select');
    for (const [v, t] of rows) s.append(el('option', { value: v, textContent: t }));
    s.value = value ?? rows[0][0]; s.onchange = () => on(s.value); return s;
  };
  const slider = (key, spec) => {
    const look = get(), v = Number.isFinite(look.body?.[key]) ? look.body[key] : (spec.default ?? 0.5);
    const r = el('input', { type: 'range', min: spec.min, max: spec.max, step: 0.05, value: v });
    const out = el('span', { textContent: (+v).toFixed(2) });
    r.oninput = () => { out.textContent = (+r.value).toFixed(2); };
    r.onchange = () => update(l => { l.body[key] = +r.value; });
    if (spec.note) r.title = spec.note;
    field(key[0].toUpperCase() + key.slice(1), r, out);
  };
  // a garment menu: the slot's every id, the 2.5 additions marked
  const garment = (slot, label, styles) => {
    const added = new Set(Object.keys(OUTFIT25[slot] || {}));
    const ids = [...new Set([...Object.keys(styles || {}), ...Object.keys(PARTS[slot] || {})])].filter(id => PARTS[slot]?.[id] || added.has(id));
    const name = id => (OUTFIT25[slot]?.[id]?.name || PARTS[slot]?.[id]?.name || id) + (added.has(id) ? ' (2.5)' : '');
    field(label, select(ids.map(id => [id, name(id)]), get()[slot]?.id, v => update(l => { l[slot] = { ...(l[slot] || {}), id: v }; })));
  };
  function draw() {
    box.textContent = '';
    const look = get(), b = look.body || {};
    box.append(el('p', { className: 'note', textContent: 'Body options are read only by the Chibi 2.5 character (right).' }));
    field('Race', select(CHIBI2_RACE_IDS.map(id => [id, CHIBI2_RACES[id].name]), b.race || 'human', v => update(l => {
      l.body.race = v;
      const tail = O.raceTails[v]?.[0];                       // a race's own tail first (beastkin: a wolf's)
      if (tail && (!l.body.tail || l.body.tail === 'none')) l.body.tail = tail;
    })));
    field('Body shape', select(O.shape.ids.map(id => [id, O.shape.names[id]]), b.shape || 'average', v => update(l => { l.body.shape = v; })));
    field('Posture', select(O.posture.ids.map(id => [id, O.posture.names[id]]), b.posture || 'neutral', v => update(l => { l.body.posture = v; })));
    for (const [key, spec] of Object.entries(O.sliders)) slider(key, spec);
    field('Tail', select(O.tail.ids.map(id => [id, O.tail.names[id]]), b.tail || 'none', v => update(l => { l.body.tail = v; })));
    const tc = el('input', { type: 'color', value: b.tailColor || look.hair?.color || '#6b4a2a' });
    tc.onchange = () => update(l => { l.body.tailColor = tc.value; });
    field('Tail colour', tc);
    box.append(el('h2', { textContent: 'Outfit' }));
    garment('top', 'Top', TOP_STYLES);
    garment('bottom', 'Bottom', BOTTOM_STYLES);
    garment('shoes', 'Shoes', SHOE_STYLES);
    garment('cape', 'Cape', null);
    for (const [slot, label] of [['top', 'Top colour'], ['bottom', 'Bottom colour'], ['shoes', 'Shoe colour'], ['cape', 'Cape colour']]) {
      const c = el('input', { type: 'color', value: look[slot]?.color || '#666666' });
      c.onchange = () => update(l => { l[slot] = { ...(l[slot] || {}), color: c.value }; });
      field(label, c);
    }
  }
  draw();
  // the robe strip and the outfit contact sheets (chibi25-body-sheet.html), each built only when asked for — they are
  // their own WebGL page in a frame, so nothing here touches this page's renderer or its blink / look demo
  const sheets = el('div', { className: 'c25-body-sheets' });
  sheets.append(el('h2', { textContent: 'Robe and outfit sheets' }));
  const frame = el('iframe', { title: 'Chibi 2.5 body sheet', loading: 'lazy' });
  Object.assign(frame.style, { width: '100%', height: '420px', border: '1px solid #c9d3cf', display: 'none', background: '#e8ece9' });
  const SHEETS = [
    ['Robe run, side on (Chibi 2 vs 2.5)', 'mode=robe&garment=robe&clip=run&frames=8&size=110'],
    ['Dress sprint', 'mode=robe&garment=dress&clip=sprint&frames=8&size=110'],
    ['Travel cloak run', 'mode=robe&garment=travel_cloak&clip=run&frames=8&size=110'],
    ['Class outfits (idle / walk / run / attack)', 'mode=outfits&set=classes&size=110&cols=1'],
    ['Thousandvale-only outfits', 'mode=outfits&set=tv&size=110&cols=1'],
    ['Body options', 'mode=bodies&size=100'],
  ];
  for (const [label, query] of SHEETS) {
    const row = el('div');
    const show = el('button', { type: 'button', textContent: label });
    show.onclick = () => { frame.style.display = 'block'; frame.src = 'chibi25-body-sheet.html?' + query; };
    const open = el('a', { href: 'chibi25-body-sheet.html?' + query, target: '_blank', textContent: ' open' });
    row.append(show, open); sheets.append(row);
  }
  sheets.append(frame);
  section.append(sheets);
  return { redraw: draw };
}
