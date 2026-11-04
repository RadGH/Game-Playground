// M9 on the page: the Powers dock tab, the faith counter in the top bar, aiming and casting, and
// the drawings for each power (rain streaks, a tornado funnel, a black hole's swirl, a falling
// meteor, lightning bolts, flying debris). The sim does all the work (js/sim/powers.js); this file
// only sends `{ t: 'power', id, size, x, y }` and draws what the sim's view says is happening.
//
// The world setting `powers: false` hides the tab and the faith counter (the sim refuses casts too).

import { hooks, ui } from '../ui/hooks.js';

const link = document.createElement('link');
link.rel = 'stylesheet'; link.href = new URL('../../css/powers.css', import.meta.url).href;
document.head.append(link);

const SIZES = [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']];
const store = {
  get(k, d) { try { const v = localStorage.getItem('stoneward.powers.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('stoneward.powers.' + k, JSON.stringify(v)); } catch { /* private window */ } },
};
const DEV = /[?&]dev\b/.test(location.search);

let V = null, seenAt = 0;                  // the sim's latest powers view, and when it came
let size = store.get('size', 'medium');
let pick = null, aim = null;               // the chosen power and where the finger is
let tool = null, panelRefs = null;
const fxSeen = new Map();                  // fx id → { ...fx, t0 } (bolts and flashes, drawn for a moment)
const actSeen = new Map();                 // active effect id → local time first seen (smooth meteors)
let shake = { x: 0, y: 0 };

const P = () => ui.data.powers || {};
const sizeIx = () => Math.max(0, SIZES.findIndex(s => s[0] === size));
const powersOn = () => ui.app.settings?.powers !== false;

// ------------------------------------------------------------------ the top bar
function faithPill() {
  let el = document.getElementById('st-faith');
  if (!el) {
    el = document.createElement('div'); el.className = 'stat'; el.id = 'st-faith'; el.title = 'Faith (pays for ruler powers)';
    document.getElementById('st-gold')?.after(el);
  }
  return el;
}

hooks.tick.push(m => {
  const v = m.town?.powers; if (!v) return;
  V = v; seenAt = performance.now();
  const on = powersOn() && v.on;
  const pill = faithPill();
  pill.classList.toggle('hidden', !on);
  pill.textContent = '✨ ' + v.faith;
  pill.classList.toggle('low', v.faith < 10);
  document.querySelector('#dock-tabs [data-tab="powers"]')?.classList.toggle('hidden', !on);
  // each bolt or flash is drawn once for a moment; the sim keeps sending it for 2 s, so remember it
  // until the sim drops it
  const ids = new Set();
  for (const f of v.fx || []) { ids.add(f.id); if (!fxSeen.has(f.id)) fxSeen.set(f.id, { ...f, t0: performance.now() }); }
  for (const id of fxSeen.keys()) if (!ids.has(id)) fxSeen.delete(id);
  if (panelRefs?.root.isConnected) updatePanel();
});

// ------------------------------------------------------------------ the Powers tab
hooks.tabs.push({ id: 'powers', label: 'Powers', tool: true, render: renderPanel });

function renderPanel() {
  const p = ui.panel('');
  const root = document.createElement('div'); root.style.cssText = 'display:contents';
  const head = document.createElement('div'); head.className = 'pw-head';
  const sizes = document.createElement('div'); sizes.className = 'pw-sizes';
  for (const [id, name] of SIZES) {
    const b = ui.btn(name, () => { size = id; store.set('size', id); updatePanel(); });
    b.dataset.size = id; sizes.append(b);
  }
  const grid = document.createElement('div'); grid.className = 'pw-grid';
  const buttons = {};
  for (const [id, pw] of Object.entries(P())) {
    const b = document.createElement('button');
    b.innerHTML = `<span class="ic">${pw.icon}</span><span class="nm">${ui.esc(pw.name)}</span><span class="st"></span>`;
    b.addEventListener('click', () => choose(pick === id ? null : id));
    buttons[id] = b; grid.append(b);
  }
  const hint = ui.hint(''); hint.classList.add('pw-hint');
  root.append(head, sizes, grid, hint);
  let fill = null;
  if (DEV) { fill = ui.btn('+✨', () => ui.link()?.order({ t: 'power.faith', n: 2000 })); fill.className = 'small pw-fill'; fill.title = 'Fill faith (test tool)'; }
  p.append(root);
  panelRefs = { root, head, sizes, buttons, hint, fill };
  updatePanel();
}

function updatePanel() {
  const R = panelRefs; if (!R) return;
  const s = sizeIx();
  const faith = V?.faith ?? 0;
  if (!powersOn()) { R.head.innerHTML = '<b>Ruler powers are off in this world.</b>'; return; }
  R.head.innerHTML = `<b>✨ ${faith} / ${V?.cap ?? '…'}</b><span class="grow"></span><span>${V?.churches ? `+${V.rate} a minute · ${V.churches} ${V.churches === 1 ? 'church' : 'churches'}` : 'Build a chapel for faith'}</span>`;
  if (R.fill) R.head.append(R.fill);
  for (const b of R.sizes.children) b.classList.toggle('on', b.dataset.size === size);
  const active = tool && ui.camera()?.tool === tool;
  if (!active && pick) pick = null;
  for (const [id, b] of Object.entries(R.buttons)) {
    const pw = P()[id], cost = pw.cost[s], wait = V?.cool?.[id] || 0;
    b.classList.toggle('on', pick === id);
    b.classList.toggle('cant', faith < cost && !wait);
    b.classList.toggle('cool', !!wait);
    b.querySelector('.st').textContent = wait ? `ready in ${wait}s` : `✨ ${cost} · ${pw.cool[s]}s rest`;
  }
  R.hint.textContent = pick ? `${P()[pick].name}: tap the map to cast it.` : 'Pick a power, then tap the map.';
}

function choose(id) {
  pick = id;
  if (!id) { if (ui.camera()?.tool === tool) ui.setTool(null); tool = null; updatePanel(); return; }
  tool = {
    feature: true,
    down: p => { aim = p; },
    move: p => { aim = p; },
    up: async p => {
      aim = null;
      const r = await ui.link()?.order({ t: 'power', id: pick, size, x: Math.floor(p.x), y: Math.floor(p.y) });
      if (r?.error) ui.toast(r.error, 'bad');
      else if (r) ui.toast(`${P()[id].name}!`, 'good');
    },
    cancel: () => { aim = null; },
  };
  ui.setTool(tool);
  ui.toast(P()[id].about);
  updatePanel();
}

// ------------------------------------------------------------------ drawing helpers
const near = x => ui.near(x, ui.camera().cam.x, ui.app.world.W);
/** A filled circle as horizontal strips. */
function disc(out, x, y, r, c, step = 1.5) {
  for (let dy = -r; dy < r; dy += step) {
    const w = Math.sqrt(Math.max(0, r * r - (dy + step / 2) ** 2));
    out.push([x - w, y + dy, w * 2, step, ...c]);
  }
}
function ring(out, x, y, r, n, s, c) {
  for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; out.push([x + Math.cos(a) * r - s / 2, y + Math.sin(a) * r - s / 2, s, s, ...c]); }
}
const hash = n => { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15; return (n >>> 0) / 4294967296; };

// Inside the lit scene (dims at night): rain, the tornado funnel, ordinary debris.
hooks.sprites.push((cam, out) => {
  if (!V) return;
  const t = performance.now() / 1000;
  for (const a of V.act || []) {
    const x = near(a.x), y = a.y;
    if (a.k === 'rain') {
      disc(out, x, y, a.r, a.wet ? [0.15, 0.2, 0.3, 0.1] : [0.12, 0.16, 0.24, 0.22], 2);
      if (a.wet) continue;
      const n = Math.min(500, Math.round(a.r * a.r * 0.35));
      for (let k = 0; k < n; k++) {
        const hx = hash(k * 2 + 1) * 2 - 1, hy = hash(k * 2 + 7);
        const fy = (((hy + t * (0.9 + hash(k) * 0.4)) % 1) * 2 - 1) * a.r;
        const half = Math.sqrt(Math.max(0, a.r * a.r - fy * fy));
        out.push([x + hx * half, y + fy - 1.5, 0.14, 1.5, 0.72, 0.82, 1, 0.55]);
      }
    } else if (a.k === 'tornado') {
      // a shadow, then a funnel of spinning rings, narrow at the ground and wide in the sky; the
      // front half of each ring is lighter than the back so it reads as turning
      disc(out, x, y, a.r * 0.9, [0, 0, 0, 0.28], 1);
      const levels = 18;
      for (let j = 0; j < levels; j++) {
        const z = j * 1.6, rr = 0.5 + Math.pow(j / levels, 1.6) * a.r * 2.2 + j * 0.08;
        const n = 8 + Math.round(rr * 2);
        const wob = Math.sin(t * 2 + j * 0.4) * j * 0.08;
        for (let k = 0; k < n; k++) {
          const ang = t * 8 - j * 0.35 + k / n * Math.PI * 2;
          const front = Math.sin(ang) > 0;
          const g = front ? 0.82 : 0.52;
          const s2 = 1.2 + j * 0.06;
          out.push([x + wob + Math.cos(ang) * rr - s2 / 2, y - z + Math.sin(ang) * rr * 0.32 - s2 / 2, s2, s2, g, g * 0.97, g * 0.92, 0.85 - j * 0.02]);
        }
      }
    } else if (a.k === 'firestorm') {
      disc(out, x, y, a.r, [0.5, 0.15, 0.05, 0.16], 2);
    }
  }
  // debris, dust and drops in flight: lifted by their height, with a shadow
  const ps = V.ps || [];
  for (let k = 0; k < ps.length; k += 8) {
    if (ps[k + 6]) continue;                                // glowing ones are drawn over the scene
    const x = near(ps[k]), y = ps[k + 1], z = ps[k + 2], kind = ps[k + 7];
    const s = kind === 6 ? 1.3 : kind === 3 ? 0.5 : 0.85;
    if (z > 1.2 && kind !== 6) out.push([x - s / 2, y - s * 0.2, s, s * 0.4, 0, 0, 0, 0.25]);
    out.push([x - s / 2, y - z - s / 2, s, s, ps[k + 3] / 255, ps[k + 4] / 255, ps[k + 5] / 255, kind === 6 ? 0.45 : 1]);
  }
});

// Over the scene (not darkened by night): glowing pieces, the black hole, meteors, bolts, the aim ring.
hooks.overlay.push((cam, out) => {
  // undo last frame's shake, then shake again while a quake is in view
  cam.x -= shake.x; cam.y -= shake.y; shake.x = shake.y = 0;
  if (!V || !ui.camera()) return;
  const now = performance.now(), t = now / 1000;
  const sinceTick = (now - seenAt) / 50;                    // sim ticks since the view came (at 1x)
  const live = new Set();
  for (const a of V.act || []) {
    live.add(a.id);
    const x = near(a.x), y = a.y;
    if (a.k === 'blackhole') {
      const grow = Math.min(1, (a.age + sinceTick) / 30);
      for (let arm = 0; arm < 3; arm++) for (let k = 0; k < 26; k++) {
        const d = a.core + (a.r * 1.1 - a.core) * (k / 26);
        const ang = -t * 2.6 + arm * 2.094 + d * 0.45;
        const al = (1 - k / 26) * 0.75 * grow;
        out.push([x + Math.cos(ang) * d - 0.8, y + Math.sin(ang) * d * 0.8 - 0.8, 1.6, 1.6, 0.22, 0.08, 0.36, al]);
      }
      ring(out, x, y, a.core * 1.15 * grow + 0.3, 28, 0.9, [0.62, 0.38, 1, 0.85]);
      disc(out, x, y, a.core * grow + 0.2, [0.01, 0, 0.03, 0.97], 0.75);
    } else if (a.k === 'meteor') {
      if (!actSeen.has(a.id)) actSeen.set(a.id, { at: now, age: a.age });
      const s0 = actSeen.get(a.id);
      const k = Math.min(1, (s0.age + (now - s0.at) / 50) / 30);
      const hx = x + 40 * (1 - k), hy = y - 70 * (1 - k);
      for (let j = 0; j < 14; j++) { const f = j / 14; out.push([hx + 40 * f * 0.25 - 1, hy - 70 * f * 0.25 - 1, 2 - f, 2 - f, 1, 0.75 - f * 0.4, 0.3, 0.9 - f * 0.8]); }
      out.push([hx - 1.6, hy - 1.6, 3.2, 3.2, 1, 0.95, 0.75, 1]);
      ring(out, x, y, a.r * (0.5 + 0.5 * k), 24, 0.6, [1, 0.4, 0.2, 0.25 + 0.5 * k]);
    } else if (a.k === 'earthquake') {
      const v = cam.ppc > 0.8 ? 0.35 * (a.s + 1) / Math.max(1, cam.ppc / 3) : 0;
      shake.x = (Math.random() - 0.5) * v; shake.y = (Math.random() - 0.5) * v;
    }
  }
  for (const id of actSeen.keys()) if (!live.has(id)) actSeen.delete(id);
  cam.x += shake.x; cam.y += shake.y;
  // glowing particles: cinders, fire balls, burning debris, sparks
  const ps = V.ps || [];
  for (let k = 0; k < ps.length; k += 8) {
    if (!ps[k + 6]) continue;
    const x = near(ps[k]), y = ps[k + 1], z = ps[k + 2], kind = ps[k + 7];
    const s = kind === 4 ? 1.6 : kind === 0 ? 0.45 : 0.7;
    if (kind === 4) out.push([x - s, y - z - s, s * 2, s * 2, 1, 0.45, 0.1, 0.35]);
    out.push([x - s / 2, y - z - s / 2, s, s, ps[k + 3] / 255, ps[k + 4] / 255, ps[k + 5] / 255, 1]);
  }
  // bolts and flashes, for a moment each
  for (const [id, f] of fxSeen) {
    const age = (now - f.t0) / 1000;
    if (age > 0.5) continue;
    const x = near(f.x), y = f.y;
    if (f.k === 'bolt') {
      // a jagged line from the sky down to the spot
      const x0 = x + (hash(f.id) - 0.5) * 24, y0 = y - 70, al = 1 - age / 0.5;
      let px = x0, py = y0;
      for (let s = 1; s <= 14; s++) {
        const k = s / 14;
        const nx = x0 + (x - x0) * k + (s < 14 ? (hash(f.id * 31 + s) - 0.5) * 5 : 0), ny = y0 + (y - y0) * k;
        const steps = Math.ceil(Math.hypot(nx - px, ny - py) / 0.6);
        for (let q = 0; q < steps; q++) { const qx = px + (nx - px) * q / steps, qy = py + (ny - py) * q / steps; out.push([qx - 0.35, qy - 0.35, 0.7, 0.7, 0.85, 0.92, 1, al]); }
        px = nx; py = ny;
      }
      disc(out, x, y, 3 + f.r * 2, [0.8, 0.88, 1, 0.35 * al]);
    } else if (f.k === 'flash') {
      const c = (f.rgb || [255, 220, 160]).map(v => v / 255);
      disc(out, x, y, f.r * (0.4 + age), [...c, 0.5 * (1 - age / 0.5)], 2);
    }
  }
  // where the power will land, while the finger is down
  if (aim && pick) {
    const pw = P()[pick], s = sizeIx();
    const r = pw.r?.[s] ?? 4;
    ring(out, near(aim.x), aim.y, r, Math.max(16, Math.round(r * 3)), Math.max(0.6, 2 / cam.ppc), [1, 0.85, 0.4, 0.8]);
    out.push([near(aim.x) - 0.5, aim.y - 0.5, 1, 1, 1, 0.9, 0.5, 1]);
  }
});

// keyboard: Escape already clears tools in main.js; P opens the tab
hooks.keys.push(e => {
  if (e.code !== 'KeyP' || !powersOn()) return false;
  document.querySelector('#dock-tabs [data-tab="powers"]')?.click();
  return true;
});
