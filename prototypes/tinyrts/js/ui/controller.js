// Turns keyboard + mouse input into selection changes, camera moves and game commands.
//
// Modes: select (default), place (a building ghost), paint (wall brush), dig (dig brush),
// salvage (drag a box), target (waiting for a click: attack-move, patrol, rally, blink, orbital).
// The command card (commandcard.js) decides what the grid keys do in the current context.

import { checkPlacement, snapPlacement } from '../sim/placement.js';
import { findLinkFor } from '../sim/network.js';
import { spanOk } from '../sim/construction.js';
import { M, S } from '../world/materials.js';
import { clamp } from '../core/util.js';

const GRID = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyZ', 'KeyX', 'KeyC', 'KeyV'];
export { GRID };

export class Controller {
  constructor(app) {
    this.app = app;
    this.mode = 'select';
    this.modeData = null;
    this.cardPath = null;       // null = auto by selection; 'build' | 'build:<cat>'
    this.brushSize = 4;
    this.drag = null;           // {x0, y0, x1, y1, button}
    this.paintDrag = null;
    this.lastClick = { t: 0, id: 0 };
    this.groups = {};
    this.lastGroupKey = { code: null, t: 0 };
    this.subgroup = 0;
    this.camDrag = null;
    this.idleDroneIdx = 0;
    this.edgePan = true;
    this.mouseCell = { x: 0, y: 0 };
  }

  get game() { return this.app.game; }
  get view() { return this.app.view; }
  get cam() { return this.app.camera; }

  reset() {
    this.mode = 'select'; this.modeData = null; this.cardPath = null; this.drag = null; this.paintDrag = null;
    this.groups = {}; this.view.selection.clear();
    this.view.ghost = null; this.view.brush = null; this.view.dragBox = null;
  }

  setMode(mode, data = null) {
    this.mode = mode; this.modeData = data;
    this.view.ghost = null; this.view.brush = null;
    this.paintDrag = null;
    this.app.hud?.refreshCard();
  }

  cancel() {
    // Esc chain: mode -> sub-card -> selection -> pause menu.
    if (this.mode !== 'select') { this.setMode('select'); return true; }
    if (this.cardPath && this.cardPath.startsWith('build:')) { this.cardPath = 'build'; this.app.hud?.refreshCard(); return true; }
    if (this.cardPath === 'build' && this.view.selection.size) { this.cardPath = null; this.app.hud?.refreshCard(); return true; }
    if (this.cardPath) { this.cardPath = null; this.app.hud?.refreshCard(); return true; }
    if (this.view.selection.size) { this.select([]); return true; }
    return false;
  }

  // ---------- selection ----------
  selected() {
    const out = [];
    for (const id of this.view.selection) { const e = this.game.byId.get(id); if (e && !e.dead) out.push(e); else this.view.selection.delete(id); }
    return out;
  }

  select(ents, add = false) {
    if (!add) this.view.selection.clear();
    for (const e of ents) this.view.selection.add(e.id);
    this.cardPath = null;
    this.subgroup = 0;
    if (this.mode === 'target' || this.mode === 'place' || this.mode === 'paint' || this.mode === 'dig' || this.mode === 'salvage') this.setMode('select');
    this.app.hud?.refreshCard();
    this.app.audio?.ui('select');
  }

  entityAt(wx, wy) {
    const g = this.game;
    let best = null, bd = Infinity;
    for (const u of g.units) {
      if (u.burrowed) continue;
      const pad = 2;
      if (wx < u.x - u.w / 2 - pad || wx > u.x + u.w / 2 + pad || wy < u.y - u.h - pad || wy > u.y + pad) continue;
      const d = Math.abs(wx - u.x) + Math.abs(wy - (u.y - u.h / 2));
      if (d < bd) { bd = d; best = u; }
    }
    if (best) return best;
    const w = g.world;
    const cx = Math.floor(wx), cy = Math.floor(wy);
    if (w.get(cx, cy) === M.FOOTPRINT) return g.byId.get(w.owner[w.idx(cx, cy)]) || null;
    for (const b of g.buildings) if (b.falling && wx >= b.x && wx <= b.x + b.w && wy >= b.fy && wy <= b.fy + b.h) return b;
    return null;
  }

  boxSelect(x0, y0, x1, y1, add) {
    const g = this.game;
    const a = this.cam.screenToWorld(Math.min(x0, x1), Math.min(y0, y1));
    const b = this.cam.screenToWorld(Math.max(x0, x1), Math.max(y0, y1));
    const units = g.units.filter((u) => u.team === 1 && !u.dead && u.x + u.w / 2 >= a.x && u.x - u.w / 2 <= b.x && u.y >= a.y && u.y - u.h <= b.y);
    let pick = units.filter((u) => u.type !== 'drone');
    if (!pick.length) pick = units;
    if (!pick.length) pick = g.buildings.filter((bl) => bl.team === 1 && bl.x + bl.w >= a.x && bl.x <= b.x && bl.y + bl.h >= a.y && bl.y <= b.y);
    this.select(pick, add);
  }

  selectSameType(e, add = false) {
    const g = this.game, cam = this.cam;
    const inView = (x, y) => x >= cam.x && x <= cam.x + cam.viewW && y >= cam.y && y <= cam.y + cam.viewH;
    const list = e.kind === 'u'
      ? g.units.filter((u) => u.team === e.team && u.type === e.type && inView(u.x, u.y))
      : g.buildings.filter((b) => b.team === e.team && b.type === e.type && inView(b.x + b.w / 2, b.y + b.h / 2));
    this.select(list, add);
  }

  // ---------- per-frame input ----------
  update(frameDt) {
    const inp = this.app.input;
    const { wheel, ordered } = inp.drain();
    const cam = this.cam;
    if (!this.game) return;
    const m = inp.mouse;
    const wpos = cam.screenToWorld(m.x, m.y);
    this.mouseCell = { x: Math.floor(wpos.x), y: Math.floor(wpos.y) };
    this.view.alt = inp.alt;

    // Camera: arrows, edge pan, middle drag, wheel.
    const pan = (inp.shift ? 1400 : 600) * frameDt / cam.scale;
    if (inp.isDown('ArrowLeft')) cam.x -= pan;
    if (inp.isDown('ArrowRight')) cam.x += pan;
    if (inp.isDown('ArrowUp')) cam.y -= pan;
    if (inp.isDown('ArrowDown')) cam.y += pan;
    if (this.edgePan && this.app.settings.edgePan && m.inside && document.hasFocus() && !this.camDrag && !this.app.overHud) {
      const e = 6, sp = 500 * (this.app.settings.panSpeed || 1) * frameDt / cam.scale;
      if (m.x < e) cam.x -= sp; else if (m.x > cam.screenW - e) cam.x += sp;
      if (m.y < e) cam.y -= sp; else if (m.y > cam.screenH - e) cam.y += sp;
    }
    if (wheel && !this.app.overHud) cam.zoom(-Math.sign(wheel), m.x, m.y);
    if (this.camDrag) { cam.x = this.camDrag.cx - (m.x - this.camDrag.x) / cam.scale; cam.y = this.camDrag.cy - (m.y - this.camDrag.y) / cam.scale; }
    cam.clampPos();

    for (const ev of ordered) {
      if (ev.key) this.key(ev.key);
      else this.mouseEvent(ev.mouse);
    }

    // Live previews.
    this.updatePreview(wpos);
    if (this.drag && this.drag.button === 0 && this.mode === 'select') {
      this.drag.x1 = m.x; this.drag.y1 = m.y;
      const big = Math.abs(this.drag.x1 - this.drag.x0) + Math.abs(this.drag.y1 - this.drag.y0) > 6;
      this.view.dragBox = big ? { ...this.drag } : null;
    } else this.view.dragBox = null;
    if (this.paintDrag && (this.mode === 'paint' || this.mode === 'dig') && !inp.shift) this.paintTo(wpos.x, wpos.y);
  }

  updatePreview(wpos) {
    const g = this.game;
    if (this.mode === 'place') {
      const type = this.modeData.type;
      const p = snapPlacement(g, type, wpos.x, wpos.y);
      const chk = checkPlacement(g, 1, type, p.x, p.y);
      const def = g.data.buildings.list[type];
      const link = def.noLink ? null : chk.link || findLinkFor(g, 1, p.x, p.y, def.size[0], def.size[1]);
      this.view.ghost = { type, x: p.x, y: p.y, ok: chk.ok, reason: chk.reason, link };
      this.app.hud?.setCursorInfo(this.ghostInfo(type, p, chk));
    } else if (this.mode === 'paint' || this.mode === 'dig') {
      const cells = [];
      const sz = this.brushSize;
      const pts = this.paintDrag && this.app.input.shift ? this.linePoints(this.paintDrag.sx, this.paintDrag.sy, wpos.x, wpos.y) : [[wpos.x, wpos.y]];
      const seen = new Set();
      const w = g.world;
      const mat = this.mode === 'paint' ? this.modeData.mat : 0;
      for (const [px, py] of pts) {
        const x0 = Math.floor(px - sz / 2), y0 = Math.floor(py - sz / 2);
        for (let y = y0; y < y0 + sz; y++) for (let x = x0; x < x0 + sz; x++) {
          const key = y * 100000 + x;
          if (seen.has(key) || !w.inBounds(x, y)) continue;
          seen.add(key);
          const mm = w.get(x, y);
          let st;
          if (this.mode === 'paint') {
            if (mm !== M.EMPTY && w.mats.state[mm] !== S.LOOSE) st = 0;
            else st = spanOkPreview(w, x, y, mat) ? 1 : 2;
          } else st = (mm === M.EMPTY || mm === M.BEDROCK || mm === M.FOOTPRINT || w.mats.built[mm]) ? 0 : 1;
          cells.push([x, y, st]);
        }
      }
      const col = this.mode === 'dig' ? 'rgba(255,224,102,0.8)' : colorFor(g, mat);
      this.view.brush = { cells, color: col };
      const count = cells.filter((c) => c[2] === 1).length;
      if (this.mode === 'paint') {
        const cost = this.app.wallCost(mat, count);
        this.app.hud?.setCursorInfo(`${this.modeData.name} · brush ${sz} · ${count} cells · ${cost}${cells.some((c) => c[2] === 2) ? ' · <span class="c-bad">red = too far from support</span>' : ''}`);
      } else this.app.hud?.setCursorInfo(`Dig · brush ${sz} · drones clear terrain, ore pays out`);
    } else if (this.mode === 'salvage') {
      const d = this.drag && this.drag.button === 0 ? this.drag : null;
      if (d) {
        const a = this.cam.screenToWorld(d.x0, d.y0), b = this.cam.screenToWorld(this.app.input.mouse.x, this.app.input.mouse.y);
        this.view.brush = { cells: [], box: { x0: Math.floor(Math.min(a.x, b.x)), y0: Math.floor(Math.min(a.y, b.y)), x1: Math.floor(Math.max(a.x, b.x)), y1: Math.floor(Math.max(a.y, b.y)) }, boxColor: '#ffe066' };
      } else this.view.brush = null;
      this.app.hud?.setCursorInfo('Salvage: drag a box over walls/buildings (built walls refund 50%)');
    } else if (this.mode === 'target') {
      this.app.hud?.setCursorInfo(this.modeData.label + ' — click a target (right-click cancels)');
    } else this.app.hud?.setCursorInfo(null);
  }

  ghostInfo(type, p, chk) {
    const g = this.game;
    const def = g.data.buildings.list[type];
    let s = `<b>${def.name}</b>`;
    if (!chk.ok) s += ` · <span class="c-bad">${chk.reason}</span>`;
    if (def.mine) {
      const { oreInArea } = this.app.simHelpers;
      const o = oreInArea(g, p.x, p.y, def.size[0], def.size[1], def.mine);
      s += ` · ore below: <span class="c-crystal">${o.c} crystal</span> <span class="c-ferrite">${o.f} ferrite</span> (~${Math.round((o.c + o.f) * def.mine.interval / 60)} min)`;
    }
    if (def.needsSky) {
      let open = 0;
      for (let x = p.x; x < p.x + def.size[0]; x++) { let clear = true; for (let y = p.y - 1; y >= 0; y--) if (g.world.get(x, y) !== M.EMPTY) { clear = false; break; } if (clear) open++; }
      s += ` · sky ${Math.round((open / def.size[0]) * 100)}%`;
    }
    if (this.app.input.shift) s += ' · <span class="c-dim">Shift: keep placing</span>';
    return s;
  }

  linePoints(x0, y0, x1, y1) {
    // Shift: straight horizontal or vertical line from the drag start.
    if (Math.abs(x1 - x0) >= Math.abs(y1 - y0)) y1 = y0; else x1 = x0;
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / Math.max(1, this.brushSize / 2)));
    const pts = [];
    for (let k = 0; k <= n; k++) pts.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]);
    return pts;
  }

  paintTo(wx, wy) {
    const pd = this.paintDrag;
    const pts = [];
    const d = Math.hypot(wx - pd.lx, wy - pd.ly);
    const n = Math.max(1, Math.ceil(d / Math.max(1, this.brushSize / 2)));
    for (let k = 1; k <= n; k++) pts.push([pd.lx + (wx - pd.lx) * k / n, pd.ly + (wy - pd.ly) * k / n]);
    if (d < 0.5 && pd.started) return;
    pd.lx = wx; pd.ly = wy; pd.started = true;
    this.sendBrush(pts);
  }

  sendBrush(pts) {
    const sz = this.brushSize;
    const cells = [];
    for (const [px, py] of pts) {
      const x0 = Math.floor(px - sz / 2), y0 = Math.floor(py - sz / 2);
      for (let y = y0; y < y0 + sz; y++) for (let x = x0; x < x0 + sz; x++) cells.push([x, y]);
    }
    if (this.mode === 'paint') this.app.cmd({ t: 'paint', mat: this.modeData.mat, cells });
    else if (this.mode === 'dig') this.app.cmd({ t: 'dig', cells });
  }

  // ---------- mouse ----------
  mouseEvent(e) {
    const g = this.game, cam = this.cam;
    if (e.type === 'down' && e.button === 1) { this.camDrag = { x: e.x, y: e.y, cx: cam.x, cy: cam.y }; return; }
    if (e.type === 'up' && e.button === 1) { this.camDrag = null; return; }
    const wp = cam.screenToWorld(e.x, e.y);
    if (e.type === 'down' && this.app.overHud) return;

    if (this.mode === 'place') {
      if (e.type === 'down' && e.button === 0) {
        const gh = this.view.ghost;
        if (gh) {
          this.app.cmd({ t: 'build', type: gh.type, x: gh.x, y: gh.y }, (r) => { if (r.ok) this.app.audio?.ui('place'); else this.app.hud.flash(r.reason); });
          if (!e.shift && !this.app.input.shift) { this.cardPath = null; this.setMode('select'); }
        }
      } else if (e.type === 'down' && e.button === 2) this.setMode('select');
      return;
    }
    if (this.mode === 'paint' || this.mode === 'dig') {
      if (e.type === 'down' && e.button === 0) {
        this.paintDrag = { sx: wp.x, sy: wp.y, lx: wp.x, ly: wp.y, started: false };
        if (!this.app.input.shift) { this.sendBrush([[wp.x, wp.y]]); this.paintDrag.started = true; }
      } else if (e.type === 'up' && e.button === 0 && this.paintDrag) {
        if (this.app.input.shift || e.shift) this.sendBrush(this.linePoints(this.paintDrag.sx, this.paintDrag.sy, wp.x, wp.y));
        this.paintDrag = null;
        this.app.audio?.ui('place');
      } else if (e.type === 'down' && e.button === 2) this.setMode('select');
      return;
    }
    if (this.mode === 'salvage') {
      if (e.type === 'down' && e.button === 0) this.drag = { x0: e.x, y0: e.y, x1: e.x, y1: e.y, button: 0 };
      else if (e.type === 'up' && e.button === 0 && this.drag) {
        const a = cam.screenToWorld(this.drag.x0, this.drag.y0);
        this.app.cmd({ t: 'salvageArea', x0: Math.floor(a.x), y0: Math.floor(a.y), x1: Math.floor(wp.x), y1: Math.floor(wp.y) });
        this.drag = null; this.view.brush = null;
        if (!this.app.input.shift) this.setMode('select');
      } else if (e.type === 'down' && e.button === 2) { this.drag = null; this.setMode('select'); }
      return;
    }
    if (this.mode === 'target') {
      if (e.type === 'down' && e.button === 0) {
        this.issueTarget(this.modeData.kind, wp, e.shift || this.app.input.shift);
        if (!(e.shift || this.app.input.shift) || this.modeData.kind === 'blink' || this.modeData.kind === 'orbital') this.setMode('select');
      } else if (e.type === 'down' && e.button === 2) this.setMode('select');
      return;
    }
    // Select mode.
    if (e.type === 'down' && e.button === 0) this.drag = { x0: e.x, y0: e.y, x1: e.x, y1: e.y, button: 0 };
    if (e.type === 'up' && e.button === 0 && this.drag) {
      const d = this.drag; this.drag = null;
      const big = Math.abs(e.x - d.x0) + Math.abs(e.y - d.y0) > 6;
      if (big) this.boxSelect(d.x0, d.y0, e.x, e.y, e.shift);
      else {
        const ent = this.entityAt(wp.x, wp.y);
        const now = performance.now();
        if (ent && this.lastClick.id === ent.id && now - this.lastClick.t < 350 && ent.team === 1) this.selectSameType(ent);
        else if (ent) {
          if (e.shift && ent.team === 1) {
            if (this.view.selection.has(ent.id)) { this.view.selection.delete(ent.id); this.app.hud?.refreshCard(); }
            else this.select([ent], true);
          } else this.select([ent]);
        } else if (!e.shift) this.select([]);
        this.lastClick = { t: now, id: ent ? ent.id : 0 };
      }
    }
    if (e.type === 'down' && e.button === 2) this.smartOrder(wp, e.shift || this.app.input.shift);
  }

  smartOrder(wp, queue) {
    const sel = this.selected().filter((s) => s.team === 1);
    const units = sel.filter((s) => s.kind === 'u');
    const blds = sel.filter((s) => s.kind === 'b');
    const target = this.entityAt(wp.x, wp.y);
    if (units.length) {
      const ids = units.map((u) => u.id);
      const w = this.game.world, cx = Math.floor(wp.x), cy = Math.floor(wp.y);
      const cm = w.get(cx, cy);
      if (target && target.team !== 1) {
        this.app.cmd({ t: 'order', ids, order: { t: 'attack', target: target.id }, queue });
        this.marker(wp, '#ff5a6e');
      } else if (cm && w.mats.built[cm] && w.team[w.idx(cx, cy)] !== 1 && w.team[w.idx(cx, cy)] !== 0) {
        this.app.cmd({ t: 'order', ids, order: { t: 'attackCell', x: cx, y: cy }, queue });
        this.marker(wp, '#ff5a6e');
      } else {
        this.app.cmd({ t: 'order', ids, order: { t: 'move', x: wp.x, y: wp.y }, queue });
        this.marker(wp, '#6dff9e');
      }
      this.app.audio?.ui('order');
    } else if (blds.length) {
      const rallyable = blds.filter((b) => this.game.data.buildings.list[b.type].trains);
      if (rallyable.length) { this.app.cmd({ t: 'rally', ids: rallyable.map((b) => b.id), x: wp.x, y: wp.y }); this.marker(wp, '#4ee6ff'); }
    }
  }

  marker(wp, col) { this.view.marker = { x: wp.x, y: wp.y, t: 1, col }; }

  issueTarget(kind, wp, queue) {
    const sel = this.selected().filter((s) => s.team === 1);
    const ids = sel.filter((s) => s.kind === 'u').map((u) => u.id);
    if (kind === 'amove' || kind === 'patrol') {
      this.app.cmd({ t: 'order', ids, order: { t: kind, x: wp.x, y: wp.y }, queue });
      this.marker(wp, kind === 'amove' ? '#ff5a6e' : '#ffe066');
    } else if (kind === 'rally') {
      this.app.cmd({ t: 'rally', ids: sel.filter((s) => s.kind === 'b').map((b) => b.id), x: wp.x, y: wp.y });
      this.marker(wp, '#4ee6ff');
    } else if (kind === 'blink' || kind === 'orbital') {
      const cmdr = sel.find((u) => u.type === 'commander');
      if (cmdr) this.app.cmd({ t: 'ability', id: cmdr.id, key: kind, x: wp.x, y: wp.y });
    }
  }

  // ---------- keyboard ----------
  key(k) {
    const app = this.app;
    const code = k.code;
    if (app.help?.open && code !== 'Escape' && code !== 'F1' && !(code === 'Slash' && k.shift)) return;
    if (code === 'Escape') {
      if (app.help?.open) { app.help.toggle(false); return; }
      if (!this.cancel()) app.openPause();
      return;
    }
    if (code === 'F1' || (code === 'Slash' && k.shift)) { app.help?.toggle(); return; }
    if (code === 'KeyP' || code === 'Pause') { app.togglePause(); return; }
    if (k.repeat && !code.startsWith('Arrow')) return;
    if (k.ctrl && code === 'KeyZ') { app.cmd({ t: 'undo' }, (r) => { if (!r.ok) app.hud?.flash(r.reason); }); return; }
    if (k.shift && code === 'KeyN') { app.cmd({ t: 'callWave' }); return; }
    if (code === 'Home') { this.jumpToCore(); return; }
    if (code === 'Space') { app.hud?.jumpToAlert(); return; }
    if (code === 'KeyL' && !this.cardKeyFor(code)) { this.view.showLinks = !this.view.showLinks; return; }
    if (code === 'KeyG' && !this.cardKeyFor(code)) { this.view.showRanges = !this.view.showRanges; return; }
    if (code === 'KeyB') { this.cardPath = 'build'; if (this.mode !== 'select') this.setMode('select'); app.hud?.refreshCard(); return; }
    if (code === 'BracketLeft') { this.brushSize = [2, 4, 6, 8][Math.max(0, [2, 4, 6, 8].indexOf(this.brushSize) - 1)]; return; }
    if (code === 'BracketRight') { this.brushSize = [2, 4, 6, 8][Math.min(3, [2, 4, 6, 8].indexOf(this.brushSize) + 1)]; return; }
    if (code === 'Equal' || code === 'NumpadAdd') { app.changeSpeed(1); return; }
    if (code === 'Minus' || code === 'NumpadSubtract') { app.changeSpeed(-1); return; }
    if (code === 'Backquote') { if (k.shift) this.selectArmy(); else this.selectIdleDrone(); return; }
    if (code === 'Tab') { this.cycleSubgroup(); return; }
    if (code.startsWith('Digit')) { this.groupKey(code.slice(5), k); return; }
    if (code === 'Backslash' && app.debug) { this.view.debug = !this.view.debug; return; }
    if (GRID.includes(code)) { app.hud?.pressSlot(code); return; }
  }

  cardKeyFor(code) { return false; }

  jumpToCore() {
    const core = this.game.byId.get(this.game.teams[1].coreId);
    if (core) this.cam.centerOn(core.x + core.w / 2, core.y);
  }

  selectIdleDrone() {
    const drones = this.game.units.filter((u) => u.team === 1 && u.type === 'drone');
    const idle = drones.filter((u) => !u.job);
    const list = idle.length ? idle : drones;
    if (!list.length) return;
    this.idleDroneIdx = (this.idleDroneIdx + 1) % list.length;
    const d = list[this.idleDroneIdx];
    this.select([d]);
    this.cam.centerOn(d.x, d.y);
  }

  selectArmy() {
    this.select(this.game.units.filter((u) => u.team === 1 && u.type !== 'drone'));
  }

  cycleSubgroup() {
    const types = [...new Set(this.selected().map((e) => e.type))];
    if (types.length < 2) return;
    this.subgroup = (this.subgroup + 1) % types.length;
    this.app.hud?.refreshCard();
  }

  activeType() {
    const types = [...new Set(this.selected().map((e) => e.type))];
    return types[this.subgroup % Math.max(1, types.length)] || null;
  }

  groupKey(n, k) {
    const now = performance.now();
    if (k.shift || k.ctrl) {
      this.groups[n] = [...this.view.selection];
      this.app.hud?.flash(`Group ${n} set (${this.groups[n].length})`);
      return;
    }
    const ids = (this.groups[n] || []).filter((id) => this.game.byId.has(id));
    if (!ids.length) return;
    const doubleTap = this.lastGroupKey.code === n && now - this.lastGroupKey.t < 400;
    this.lastGroupKey = { code: n, t: now };
    this.select(ids.map((id) => this.game.byId.get(id)));
    if (doubleTap) {
      const e = this.game.byId.get(ids[0]);
      if (e) this.cam.centerOn(e.kind === 'b' ? e.x + e.w / 2 : e.x, e.y);
    }
  }
}

function spanOkPreview(world, x, y, mat) {
  // Preview is optimistic about cells below that are also in the brush — check real support only
  // for cells touching existing structure or terrain; free-floating cells show as buildable if the
  // column below reaches something within the brush (drones build bottom-up).
  const below = world.get(x, y + 1);
  if (below !== M.EMPTY) return spanOk(world, x, y, mat);
  // Look down a little for ground (the brush will fill the gap bottom-up).
  for (let k = 2; k <= 10; k++) if (world.get(x, y + k) !== M.EMPTY) return true;
  const l = world.get(x - 1, y), r = world.get(x + 1, y);
  if (l !== M.EMPTY || r !== M.EMPTY) return spanOk(world, x, y, mat);
  return false;
}

function colorFor(game, mat) {
  const c = game.mats.colors[mat]?.[0] || '#ffffff';
  return c;
}

export { clamp };
