// Farhold — the chart you get when you press M with no ground under you.
//
// The ask: *"Pressing M for map while outside of a planet should instead open a galaxy map. It
// should start zoomed in all the way at the solar system level… You should be able to zoom out
// several levels to view adjacent stars, or the entire galaxy, all of these should have an
// indicator of where the player is and where any important pins have been placed. Let's also make
// it so you can travel to 'adjacent-ish' stars. This should calculate distance, and in the future we
// can implement a fuel system."*
//
// Four steps, from the ship out to the whole disc:
//
//   system        the star, its planets on their real orbits, the ship, and where you have pins
//   neighbourhood the current star and everything one lane away, with a jump distance on each
//   sector       a slice of the arm — a few dozen stars and the lanes between them
//   galaxy       all of it, with the player a bright ring somewhere out in an arm
//
// The chart is drawn on a canvas and knows nothing about Three.js: it is handed a plain snapshot
// each time it opens (`getState()`), so the node tests can drive every projection and every
// reachability rule without a browser.

import { el, panel, button } from '../../../shared/ui.js';
import { MARKER_LOOKS } from './markers.js';

export const CHART_LEVELS = ['system', 'neighbourhood', 'sector', 'galaxy'];

export const LEVEL_LABELS = {
  system: 'This system',
  neighbourhood: 'Nearby stars',
  sector: 'This arm',
  galaxy: 'The galaxy',
};

/**
 * How wide a slice of the galaxy each step shows, in map units (the galaxy itself spans −1…1).
 * `system` is not on this scale at all — it is drawn in AU.
 */
export const LEVEL_SPAN = { neighbourhood: 0.55, sector: 1.2, galaxy: 2.2 };

/**
 * A galaxy map unit is this many light years across. Nothing in the simulation depends on the
 * number; it exists so a jump can be quoted in something a person recognises, and so a future fuel
 * system has a cost to charge against.
 */
export const LY_PER_UNIT = 4000;

/** How far the drive will jump. Anything further has to be reached in hops. */
export const JUMP_RANGE = 0.18;

/** Distance between two stars on the chart, in light years. */
export function lightYears(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0)) * LY_PER_UNIT;
}

/** Can the drive make this jump in one go, and if not, why not. */
export function reachFrom(galaxy, from, to) {
  if (!from || !to) return { ok: false, why: 'Nothing selected.' };
  if (from.id === to.id) return { ok: false, why: 'You are already here.', here: true };
  const units = Math.hypot(from.x - to.x, from.y - to.y, (from.z || 0) - (to.z || 0));
  const ly = units * LY_PER_UNIT;
  const lane = (from.neighbours || []).includes(to.id);
  if (units <= JUMP_RANGE) {
    return { ok: true, ly, units, lane, why: lane ? 'A charted lane runs straight there.' : 'Inside the drive\'s range.' };
  }
  return {
    ok: false, ly, units, lane,
    why: `${Math.round(ly).toLocaleString()} light years — past the drive's ${Math.round(JUMP_RANGE * LY_PER_UNIT).toLocaleString()} ly reach. Jump to something closer first.`,
  };
}

/** Every star the drive could reach from here right now, nearest first. */
export function reachable(galaxy, from) {
  if (!galaxy || !from) return [];
  return galaxy.stars
    .filter(s => s.id !== from.id)
    .map(s => ({ star: s, ...reachFrom(galaxy, from, s) }))
    .filter(r => r.ok)
    .sort((a, b) => a.ly - b.ly);
}

/**
 * Project a star into canvas pixels for a given level. Pulled out of the drawing so a test can
 * check that the player really is in the middle of every view and that a star off the edge is
 * clipped rather than smeared onto the rim.
 */
export function projector({ level, centre, width, height, zoom = 1 }) {
  const span = (LEVEL_SPAN[level] ?? 2.2) / zoom;
  const scale = Math.min(width, height) / span;
  return {
    span, scale,
    to(star) {
      return [
        width / 2 + (star.x - centre.x) * scale,
        height / 2 + (star.y - centre.y) * scale,
      ];
    },
    /** Map-space point under a canvas pixel — for clicking a star. */
    from(px, py) {
      return { x: centre.x + (px - width / 2) / scale, y: centre.y + (py - height / 2) / scale };
    },
  };
}

/** The star nearest a map-space point, within a pixel tolerance. */
export function starUnder(stars, point, proj, tolerancePx = 14) {
  let best = null, bd = Infinity;
  for (const s of stars) {
    const [sx, sy] = proj.to(s);
    const [px, py] = proj.to(point);
    const d = Math.hypot(sx - px, sy - py);
    if (d < bd) { bd = d; best = s; }
  }
  return best && bd <= tolerancePx ? best : null;
}

const CLASS_SIZE = {
  blackHole: 2.4, neutronStar: 2.2, whiteDwarf: 2.0, redDwarf: 2.4,
  redGiant: 4.6, blueGiant: 4.4, binaryPair: 3.6,
};

// ---------------------------------------------------------------------------- the screen

/**
 * getState() must return:
 *   { galaxy, starId, star, system, bodies, shipAu: {x, z}, markers, systemSeed }
 * `bodies` is `space.bodies` — each with `{ planet, position, radius, moon }` — or null when the
 * system view has nothing live to draw and the orbits are taken from the system data instead.
 */
export function createStarChart({ getState, onTravel = null, onClose = null } = {}) {
  const state = { open: false, level: 'system', zoom: 1, selected: null, world: null, centre: { x: 0, y: 0 } };

  const canvas = el('canvas', { class: 'chart-canvas' });
  const wrap = el('div', { class: 'chart-wrap' }, canvas);
  const side = el('div', { class: 'chart-side' });
  const title = el('div', { class: 'chart-title' });
  const steps = el('div', { class: 'chart-steps' });
  const root = el('div', { class: 'screen chart hidden' },
    el('div', { class: 'chart-top' }, title, steps,
      el('button', { class: 'screen-close', text: '×', onclick: () => toggle(false) })),
    el('div', { class: 'chart-body' }, wrap, side));
  document.body.append(root);

  // ---------------------------------------------------------------- level control
  function setLevel(level) {
    if (!CHART_LEVELS.includes(level)) return;
    state.level = level;
    state.zoom = 1;
    const s = getState();
    // recentre on the player whenever the step changes: you should never have to hunt for yourself
    if (s?.star) state.centre = { x: s.star.x, y: s.star.y };
    build();
    draw();
  }

  function stepLevel(dir) {
    const i = CHART_LEVELS.indexOf(state.level);
    setLevel(CHART_LEVELS[Math.max(0, Math.min(CHART_LEVELS.length - 1, i + dir))]);
  }

  // ---------------------------------------------------------------- the side panel
  function build() {
    const s = getState();
    if (!s) return;
    title.textContent = `${s.galaxy?.name || 'the galaxy'} · ${LEVEL_LABELS[state.level]}`;

    steps.replaceChildren(...CHART_LEVELS.map(k => {
      const b = el('button', {
        class: 'chip' + (k === state.level ? ' on' : ''),
        text: LEVEL_LABELS[k],
        title: k === 'system' ? 'The star you are in, its worlds and your ship.'
          : k === 'neighbourhood' ? 'Every star one jump away, with the distance.'
            : k === 'sector' ? 'A slice of the arm around you.' : 'The whole disc.',
      });
      b.onclick = () => setLevel(k);
      return b;
    }));

    const kids = [];
    if (state.level === 'system') {
      kids.push(panel('Here',
        el('div', { class: 'chart-name', text: s.star?.name || 'this star' }),
        el('p', { class: 'small muted', text: s.star?.className || '' }),
        el('p', { class: 'small', text: `${(s.system?.planets || []).length} worlds${countMoons(s.system) ? `, ${countMoons(s.system)} moons` : ''}` }),
      ));
      /**
       * WHAT THE CHART KNOWS ABOUT THE WORLD YOU PICKED.
       *
       * Everything here comes from the system data, which is what a survey would tell you: what kind
       * of world it is, its air, its gravity, its temperature, what is in the ground. The regions
       * and biomes of the surface are the part you only get once you have BEEN there — the chart
       * says so rather than inventing them, which is the seam a real scanning mechanic will slot
       * into later.
       */
      if (state.world?.planet) {
        const p = state.world.planet;
        const kids2 = [
          el('p', { class: 'muted small', text: state.world.moon ? `Moon of ${state.world.moon.name}` : (p.archetypeName || p.archetype || 'world') }),
          el('p', { class: 'small', text: `${((p.radius || 1) * 6371).toFixed(0)} km across · ${(p.gravity ?? 1).toFixed(2)} g` }),
          el('p', { class: 'small', text: p.atmosphere?.density > 0.08
            ? `${p.atmosphere.breathable ? 'Breathable' : 'Unbreathable'} air` : 'No air worth the name' }),
        ];
        if (p.temperature?.K) kids2.push(el('p', { class: 'small', text: `${Math.round(p.temperature.K - 273)}°C on average` }));
        if (p.orbit?.au) kids2.push(el('p', { class: 'small muted', text: `${p.orbit.au.toFixed(2)} AU out` }));
        const res = (p.resources || []).map(r => r.name || r.key);
        if (res.length) kids2.push(el('p', { class: 'small', text: `Resources: ${res.slice(0, 4).join(', ')}` }));
        const rare = (p.rareElements || []).map(r => r.name || r.key);
        if (rare.length) kids2.push(el('p', { class: 'small warn', text: `Rare: ${rare.join(', ')}` }));

        // the surface, once you have actually been down there
        const surface = s.surfaceOf?.(p);
        if (surface) {
          kids2.push(el('h4', { text: 'Surface' }));
          kids2.push(el('p', { class: 'small', text: `${surface.regions} named regions · ${surface.biomes} biomes · ${surface.towns} settlements` }));
          if (surface.top?.length) {
            kids2.push(el('p', { class: 'small muted', text: surface.top.map(b => `${b.name} ${b.share}%`).join(' · ') }));
          }
        } else {
          kids2.push(el('p', { class: 'small muted', text: 'The surface is unmapped. Land on it and the chart fills in.' }));
        }
        const mine = (s.markers || []).filter(m => m.planetId === p.id);
        if (mine.length) kids2.push(el('p', { class: 'small', text: `${mine.length} marker${mine.length > 1 ? 's' : ''} down there.` }));
        kids.push(panel(p.name, ...kids2));
      }

      const rows = (s.system?.planets || []).map(p => {
        const mine = (s.markers || []).filter(m => m.planetId === p.id);
        return el('div', { class: 'chart-row' + (mine.length ? ' marked' : '') },
          el('span', { class: 'chart-dot', style: `background:${p.giant ? '#d8b070' : '#8fb8d8'}` }),
          el('span', { class: 'chart-rowname', text: p.name }),
          el('span', { class: 'muted small', text: `${(p.orbit?.au ?? 0).toFixed(2)} AU` }),
          mine.length ? el('span', { class: 'chart-mark', text: mine.map(m => (MARKER_LOOKS[m.kind] || MARKER_LOOKS.pin).icon).join('') }) : null,
        );
      }).filter(Boolean);
      if (rows.length) kids.push(panel('Worlds', ...rows));
    } else {
      const from = s.star;
      const list = reachable(s.galaxy, from).slice(0, 12);
      kids.push(panel('In range',
        list.length
          ? el('div', { class: 'chart-list' }, ...list.map(r => {
            const row = el('div', { class: 'chart-row link' + (state.selected?.id === r.star.id ? ' on' : '') },
              el('span', { class: 'chart-dot', style: `background:${r.star.color}` }),
              el('span', { class: 'chart-rowname', text: r.star.name }),
              el('span', { class: 'muted small', text: `${Math.round(r.ly).toLocaleString()} ly` }),
            );
            row.onclick = () => { state.selected = r.star; build(); draw(); };
            return row;
          }))
          : el('p', { class: 'small muted', text: 'Nothing inside the drive\'s reach. Zoom out and pick a closer star first.' }),
      ));
    }

    /**
     * THE SURVEY.
     *
     * "In the 'Nearby Stars' or other views when a planet is selected, add a 'survey' panel to
     * reveal planets and their types in the star region, later we will implement a more detailed
     * scanning mechanic required to be able to view this info."
     *
     * For now the survey is free and tells you what is orbiting the star you picked, so choosing
     * where to jump is a decision rather than a coin toss. When scanning arrives it gates THIS
     * panel; everything else stays as it is.
     */
    if (state.selected && state.level !== 'system') {
      const survey = s.surveyOf?.(state.selected);
      const kids2 = [];
      if (!survey) {
        kids2.push(el('p', { class: 'muted small', text: 'Too far to read. Jump closer and it will resolve.' }));
      } else {
        kids2.push(el('p', { class: 'small muted', text: `${survey.planets.length} worlds${survey.moons ? `, ${survey.moons} moons` : ''}` }));
        for (const w of survey.planets) {
          kids2.push(el('div', { class: 'chart-row' },
            el('span', { class: 'chart-dot', style: `background:${w.color}` }),
            el('span', { class: 'chart-rowname', text: w.name }),
            el('span', { class: 'muted small', text: w.kind }),
            el('span', { class: 'muted small', text: w.band }),
          ));
        }
      }
      kids.push(panel(`Survey — ${state.selected.name}`, ...kids2));
    }

    if (state.selected) {
      const reach = reachFrom(s.galaxy, s.star, state.selected);
      const visited = (s.markers || []).filter(m => m.starName === state.selected.name);
      const kids2 = [
        el('p', { class: 'small muted', text: state.selected.className }),
        el('p', { class: 'small', text: reach.here ? 'You are here.' : `${Math.round(reach.ly).toLocaleString()} light years${reach.lane ? ' · charted lane' : ''}` }),
      ];
      if (visited.length) kids2.push(el('p', { class: 'small', text: `${visited.length} marker${visited.length > 1 ? 's' : ''} out here.` }));
      if (!reach.ok) kids2.push(el('p', { class: 'small warn', text: reach.why }));
      else if (onTravel) {
        kids2.push(button(`Jump to ${state.selected.name}`, () => {
          toggle(false);
          onTravel(state.selected, reach);
        }));
      }
      kids.push(panel(state.selected.name, ...kids2));
    }

    kids.push(panel('Getting around',
      el('p', { class: 'small muted', text: 'Mouse wheel zooms. Click a star to select it. M or Escape closes.' })));
    side.replaceChildren(...kids);
  }

  function countMoons(system) {
    return (system?.planets || []).reduce((a, p) => a + (p.moons?.length || 0), 0);
  }

  // ---------------------------------------------------------------- drawing
  function fit() {
    const w = Math.max(320, wrap.clientWidth), h = Math.max(240, wrap.clientHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    return { w: canvas.width, h: canvas.height, dpr };
  }

  function draw() {
    if (!state.open) return;
    const s = getState();
    if (!s) return;
    const { w, h } = fit();
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#05070e';
    ctx.fillRect(0, 0, w, h);
    if (state.level === 'system') drawSystem(ctx, w, h, s);
    else drawStars(ctx, w, h, s);
  }

  /** The system view: real orbit radii, the star in the middle, your ship where it actually is. */
  function drawSystem(ctx, w, h, s) {
    const planets = s.system?.planets || [];
    // The outermost orbit fills the frame. A floor of 1 AU used to be in here, which drew a red
    // dwarf's four worlds — none of them further out than 0.35 AU — as a knot in the middle of an
    // empty screen. A compact system should look compact, not small.
    const outer = Math.max(0.05, ...planets.map(p => p.orbit?.au || 0.05));
    const pad = 46;
    const scale = (Math.min(w, h) / 2 - pad) / (outer * 1.05) * state.zoom;
    const cx = w / 2, cy = h / 2;

    // the star
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 34);
    glow.addColorStop(0, s.star?.color || '#ffe9b0');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, 34, 0, Math.PI * 2); ctx.fill();
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center';
    ctx.fillText(s.star?.name || '', cx, cy + 48);

    // the habitable band, because it is the one thing on this screen worth planning around
    if (s.star?.habitable) {
      ctx.beginPath();
      ctx.arc(cx, cy, s.star.habitable.inner * scale, 0, Math.PI * 2);
      ctx.arc(cx, cy, s.star.habitable.outer * scale, 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(110, 210, 150, .07)';
      ctx.fill('evenodd');
    }

    const live = new Map();
    for (const b of s.bodies || []) if (!b.moon) live.set(b.planet.id, b);
    const labels = [];
    // where each body ended up on screen, so a click can find it again
    const hits = [];
    state._systemHits = hits;

    for (const p of planets) {
      const au = p.orbit?.au || 1;
      const r = au * scale;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(150, 180, 215, .18)'; ctx.lineWidth = 1;
      ctx.stroke();

      // where the world actually is right now, taken from the live scene when there is one
      const b = live.get(p.id);
      const angle = b ? Math.atan2(b.position.z, b.position.x) : ((p.seed ?? p.id) % 360) * Math.PI / 180;
      const px = cx + Math.cos(angle) * r, py = cy + Math.sin(angle) * r;
      const size = Math.max(3, Math.min(11, (p.radius || 1) * (p.giant ? 4.5 : 3)));
      hits.push({ px, py, r: size, planet: p, moon: null });
      ctx.beginPath(); ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fillStyle = p.giant ? '#d8b070' : p.atmosphere?.breathable ? '#8fe0a0' : '#8fb8d8';
      ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(5,7,14,.9)'; ctx.stroke();
      if (state.world?.planet === p) {
        ctx.beginPath(); ctx.arc(px, py, size + 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6; ctx.stroke();
      }

      // moons, as a tight ring of specks
      for (let i = 0; i < (p.moons?.length || 0); i++) {
        const ma = angle + (i + 1) * 1.7;
        const mx = px + Math.cos(ma) * (size + 6), my = py + Math.sin(ma) * (size + 6);
        hits.push({ px: mx, py: my, r: 3, planet: p.moons[i], moon: p });
        ctx.beginPath();
        ctx.arc(mx, my, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = '#c8d4e4'; ctx.fill();
        if (state.world?.planet === p.moons[i]) {
          ctx.beginPath(); ctx.arc(mx, my, 7, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4; ctx.stroke();
        }
      }

      // labels crowd badly on a tight system; drop one that would land on another
      if (labels.every(l => Math.hypot(l[0] - px, l[1] - py) > 34)) {
        labels.push([px, py]);
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = '#b8c8da'; ctx.textAlign = 'left';
        ctx.fillText(p.name, px + size + 5, py + 4);
      }

      // markers on this world
      const mine = (s.markers || []).filter(m => m.planetId === p.id);
      if (mine.length) {
        ctx.beginPath(); ctx.arc(px, py, size + 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1.4; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
        ctx.font = '700 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd24a';
        ctx.fillText(mine.map(m => (MARKER_LOOKS[m.kind] || MARKER_LOOKS.pin).icon).join(''), px, py - size - 8);
        ctx.textAlign = 'left';
      }
    }

    // the ship
    if (s.shipAu) {
      const px = cx + s.shipAu.x * scale, py = cy + s.shipAu.z * scale;
      ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.strokeStyle = '#6ad0ff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(px, py, 12, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(106,208,255,.5)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillStyle = '#9fd4ff'; ctx.textAlign = 'center';
      ctx.fillText('you', px, py - 17);
    }
  }

  /** Every star view: the same drawing at three spans. */
  function drawStars(ctx, w, h, s) {
    const galaxy = s.galaxy;
    if (!galaxy) return;
    const proj = projector({ level: state.level, centre: state.centre, width: w, height: h, zoom: state.zoom });
    const here = s.star;
    const inView = galaxy.stars.filter(st => {
      const [x, y] = proj.to(st);
      return x > -30 && y > -30 && x < w + 30 && y < h + 30;
    });
    const shown = new Set(inView.map(st => st.id));

    // lanes first, under everything
    ctx.lineWidth = 1;
    for (const lane of galaxy.lanes || []) {
      if (!shown.has(lane.a) && !shown.has(lane.b)) continue;
      const [ax, ay] = proj.to(galaxy.stars[lane.a]);
      const [bx, by] = proj.to(galaxy.stars[lane.b]);
      const mine = here && (lane.a === here.id || lane.b === here.id);
      ctx.strokeStyle = mine ? 'rgba(120, 200, 255, .45)' : 'rgba(110, 130, 170, .16)';
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }

    // the drive's reach, drawn as a ring you can see the edge of
    if (here) {
      const [hx, hy] = proj.to(here);
      ctx.beginPath(); ctx.arc(hx, hy, JUMP_RANGE * proj.scale, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(120, 220, 180, .30)'; ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]);
    }

    const systemsWithMarkers = new Map();
    for (const m of s.markers || []) systemsWithMarkers.set(m.starName, (systemsWithMarkers.get(m.starName) || 0) + 1);

    const label = state.level !== 'galaxy';
    for (const st of inView) {
      const [x, y] = proj.to(st);
      const size = (CLASS_SIZE[st.classKey] ?? 3) * (state.level === 'galaxy' ? 0.55 : 1);
      if (st.classKey === 'blackHole') {
        ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = '#05070e'; ctx.fill();
        ctx.strokeStyle = '#ffa23c'; ctx.lineWidth = 1.4; ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = st.color; ctx.fill();
      }
      if (systemsWithMarkers.has(st.name)) {
        ctx.beginPath(); ctx.arc(x, y, size + 5, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1.3; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
      }
      if (state.selected?.id === st.id) {
        ctx.beginPath(); ctx.arc(x, y, size + 9, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6; ctx.stroke();
      }
      if (label && (st.id === here?.id || state.level === 'neighbourhood' || size > 3.4)) {
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(200, 216, 235, .85)';
        ctx.textAlign = 'left';
        ctx.fillText(st.name, x + size + 4, y + 4);
      }
    }

    // …and you, last, brightest
    if (here && shown.has(here.id)) {
      const [x, y] = proj.to(here);
      ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.strokeStyle = '#6ad0ff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(106,208,255,.35)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillStyle = '#9fd4ff'; ctx.textAlign = 'center';
      ctx.fillText('you are here', x, y - 21);
    }
  }

  // ---------------------------------------------------------------- input
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (state.level === 'system') {
      state.zoom = Math.max(0.4, Math.min(4, state.zoom * (e.deltaY > 0 ? 0.85 : 1.18)));
      draw();
      return;
    }
    // out of the arm and into the galaxy, or the other way — the wheel steps the level itself,
    // which is what "zoom out several levels" means
    const next = e.deltaY > 0 ? 1 : -1;
    const i = CHART_LEVELS.indexOf(state.level);
    if ((next > 0 && i < CHART_LEVELS.length - 1) || (next < 0 && i > 0)) stepLevel(next);
  }, { passive: false });

  canvas.addEventListener('click', e => {
    const s = getState();
    /**
     * PICK A WORLD OUT OF THE SYSTEM VIEW.
     *
     * "In the galaxy map view allow selecting planets and moons in 'This System' view showing
     * similar to the world forge system, region map, biomes, etc."
     *
     * The side panel then shows what the chart actually knows about it — its archetype, its air,
     * its gravity, its temperature, its resources, and the regions and biomes of its surface once
     * you have been there, which is the "world forge" half.
     */
    if (state.level === 'system') {
      const hit = worldUnder(e, s);
      state.world = hit || null;
      build();
      draw();
      return;
    }
    if (!s?.galaxy) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = canvas.width / rect.width;
    const proj = projector({ level: state.level, centre: state.centre, width: canvas.width, height: canvas.height, zoom: state.zoom });
    const point = proj.from((e.clientX - rect.left) * dpr, (e.clientY - rect.top) * dpr);
    const hit = starUnder(s.galaxy.stars, point, proj, 16 * dpr);
    state.selected = hit || null;
    build();
    draw();
  });

  /** The world under a click on the system view, or null. */
  function worldUnder(e, s) {
    if (!state._systemHits) return null;
    const rect = canvas.getBoundingClientRect();
    const dpr = canvas.width / Math.max(1, rect.width);
    const px = (e.clientX - rect.left) * dpr, py = (e.clientY - rect.top) * dpr;
    let best = null, bd = Infinity;
    for (const hit of state._systemHits) {
      const d = Math.hypot(hit.px - px, hit.py - py);
      if (d < bd) { bd = d; best = hit; }
    }
    return best && bd <= Math.max(16 * dpr, (best.r || 6) + 10 * dpr) ? best : null;
  }

  window.addEventListener('resize', () => { if (state.open) draw(); });

  function toggle(open = !state.open) {
    state.open = open;
    root.classList.toggle('hidden', !open);
    if (open) {
      document.exitPointerLock?.();
      const s = getState();
      if (s?.star) state.centre = { x: s.star.x, y: s.star.y };
      state.selected = null;
      // "It should start zoomed in all the way at the solar system level."
      state.level = 'system';
      state.zoom = 1;
      build();
      draw();
    } else onClose?.();
    return open;
  }

  return {
    root, state, toggle, draw, setLevel, stepLevel,
    get isOpen() { return state.open; },
    select(star) { state.selected = star; build(); draw(); },
    tick() { if (state.open) draw(); },
    dispose() { root.remove(); },
  };
}
