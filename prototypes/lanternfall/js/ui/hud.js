// The play HUD (docs/02 §11) drawn as pixel quads in screen space, edge-anchored so it holds together at
// 427x240, 512x288 and 640x360. Health + damage trail, oil + cost preview, XP line, status tags, wick
// slots (icon, cooldown sweep, charm pips, two burn-in pip rows), belt, boss bar with phase ticks,
// currencies, objective, pickup toasts, damage numbers (merged), interaction prompt, breath pips.
import { textQuads, measure } from '../render/font5x7.js';
import { compileWick, burnLevels } from '../spells/wick.js';

const C = { ink: [0.85, 0.83, 0.77, 1], dim: [0.55, 0.54, 0.5, 1], gold: [0.91, 0.72, 0.42, 1], health: [0.85, 0.26, 0.23, 1], healthBg: [0.1, 0.07, 0.09, 0.9], trail: [1, 0.82, 0.65, 1], oil: [0.79, 0.54, 0.18, 1], oilTop: [0.95, 0.77, 0.42, 1], frame: [0.04, 0.04, 0.05, 1], panel: [0.06, 0.07, 0.1, 0.72], red: [1, 0.35, 0.29, 1], heal: [1, 0.9, 0.69, 1] };
const hex = h => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1]; };

export function createHud(game) {
  const H = { trailHp: 1, numbers: [], toasts: [], combo: { n: 0, t: 0, total: 0 }, bossTrail: 1 };
  const bus = game.bus;
  bus.on('hit', h => {
    if (h.amount <= 0 && !h.dot) return;
    const mine = h.source === game.player || h.source?.team === 'player', toMe = h.target === game.player;
    if (!mine && !toMe) return;
    const now = game.time, key = h.target.id + '|' + (h.source?.id || '') + '|' + (h.via || '');
    const ex = H.numbers.find(n => n.key === key && now - n.t0 < 0.3);
    const flame = h.flame && h.flame !== 'physical' ? game.data.flames.byId[h.flame]?.color : null;
    if (ex) { ex.amount += h.amount; ex.t0 = now; ex.crit ||= h.crit; return; }
    H.numbers.push({ key, x: h.x, y: h.y, amount: h.amount, crit: h.crit, t0: now, born: now, color: toMe ? C.red : flame ? hex(flame) : C.ink, drift: ((h.target.id.length * 7 + H.numbers.length * 13) % 9) - 4 });
    if (H.numbers.length > 24) H.numbers.shift();
    if (mine) { if (now - H.combo.t > 1.5) { H.combo.n = 0; H.combo.total = 0; } H.combo.n++; H.combo.total += h.amount; H.combo.t = now; }
  });
  bus.on('heal', h => { if (h.target === game.player && h.amount >= 1) H.numbers.push({ key: 'heal' + game.tick, x: h.x, y: h.y, amount: h.amount, heal: true, t0: game.time, born: game.time, color: C.heal, drift: 0 }); });
  H.toast = (text, color = C.ink, big = false) => { const ex = H.toasts.find(t => t.text === text && game.time - t.t < 1.5); if (ex) { ex.n++; ex.t = game.time; return; } H.toasts.push({ text, color, t: game.time, n: 1, big }); if (H.toasts.length > 4) H.toasts.shift(); };
  bus.on('pickup', e => { if (e.kind === 'pennies') { const t = H.toasts.find(x => x.pennies && game.time - x.t < 3); if (t) { t.amount += e.amount; t.text = `+ ${t.amount} pennies`; t.t = game.time; } else H.toasts.push({ text: `+ ${e.amount} pennies`, color: C.gold, t: game.time, n: 1, pennies: true, amount: e.amount }); } else H.toast(`+ ${e.name || e.kind}${e.amount > 1 ? ' ×' + e.amount : ''}`, e.color || C.ink); });
  bus.on('unlock', e => H.toast(`NEW ${e.kind.toUpperCase()} — ${e.name || e.id}`, e.color || C.gold, true));
  bus.on('levelup', e => H.toast(`LEVEL ${e.level}`, C.gold, true));

  H.build = function (atlas, view, cam) {
    const q = [], W = view.w, Hh = view.h, p = game.player, hero = game.hero || {}, t = game.time;
    const rect = (x, y, w, h, c) => q.push({ x, y, w, h, tint: c });
    const text = (s, x, y, c = C.ink, sc = 1, align) => q.push(...textQuads(atlas, s, x, y, c, sc, { align }));
    // --- health, oil, xp (top-left) ---
    const hpF = Math.max(0, p.hp / p.maxHp); H.trailHp = H.trailHp > hpF ? Math.max(hpF, H.trailHp - 0.6 / 60) : hpF;
    rect(7, 5, 98, 8, C.frame); rect(8, 6, 96, 6, C.healthBg); rect(8, 6, 96 * H.trailHp, 6, C.trail); rect(8, 6, 96 * hpF, 6, hpF < 0.25 && (t * 2.4 % 1) < 0.5 ? [1, 0.45, 0.4, 1] : C.health);
    text(`${Math.round(p.hp)}/${Math.round(p.maxHp)}`, 108, 5, C.ink);
    const oilF = Math.max(0, p.oil / p.maxOil);
    rect(7, 14, 98, 6, C.frame); rect(8, 15, 96, 4, C.healthBg); rect(8, 15, 96 * oilF, 4, C.oil); rect(8, 15, 96 * oilF, 1, C.oilTop);
    const wick = hero.wicks?.[p.cast?.slot ?? 0];
    if (wick) { const plan = compileWick(wick, game.data, p.stats, { overcharge: p.cast?.charging ? p.cast.c : 1 }); const cost = Math.min(p.oil, plan.oil); if (!plan.perSecond) { const col = hex(game.data.flames.byId[wick.flame].color); rect(8 + 96 * (oilF - cost / p.maxOil), 15, 96 * cost / p.maxOil, 4, plan.oil > p.oil ? [1, 0.2, 0.2, 0.6] : [col[0], col[1], col[2], 0.55]); } }
    text(`${Math.round(p.oil)}/${Math.round(p.maxOil)}`, 108, 14, C.dim);
    if (hero.xp != null) { const need = hero.xpNext || 100; rect(8, 21, 96, 1, [0.2, 0.18, 0.12, 1]); rect(8, 21, 96 * Math.min(1, hero.xp / need), 1, C.gold); }
    // --- statuses ---
    let sx = 8; for (const [id, s] of Object.entries(p.statuses || {})) { if (s.t > 900) continue; const def = game.data.statuses?.byId[id]; const col = def?.color ? hex(def.color) : C.dim; const tag = (def?.tag || id.slice(0, 5)).toUpperCase(); rect(sx, 25, measure(tag) + 4, 9, [0, 0, 0, 0.55]); text(tag, sx + 2, 26, col); rect(sx, 34, (measure(tag) + 4) * Math.min(1, s.t / (def?.duration || 3)), 1, col); sx += measure(tag) + 7; }
    // --- wick slots (bottom-left) ---
    const slots = hero.unlocked?.wickSlots ?? 1;
    for (let k = 0; k < slots; k++) {
      const w = hero.wicks?.[k]; const x = 8 + k * 28, sel = (p.cast?.slot ?? 0) === k, y = Hh - 8 - 24 - (sel ? 2 : 0);
      const col = w ? hex(game.data.flames.byId[w.flame].color) : C.dim;
      rect(x - 1, y - 1, 26, 26, sel ? col : C.frame); rect(x, y, 24, 24, C.panel);
      if (w) {
        const g = atlas.index.glyphs?.[w.shape]?.[0]; if (g) q.push({ x: x + 6, y: y + 5, w: 12, h: 12, src: g, tint: col });
        const cd = p.cast?.cds?.[k] || 0, plan = compileWick(w, game.data, p.stats); if (cd > 0) { const f = Math.min(1, cd / plan.cooldown); rect(x, y, 24, 24 * f, [0, 0, 0, 0.55]); if (cd > 1) text(cd.toFixed(cd < 10 ? 1 : 0), x + 12, y + 9, C.ink, 1, 'center'); }
        (w.charms || []).forEach((c, j) => rect(x + 2 + j * 3, y + 2, 2, 2, C.gold));
        text(String(Math.round(plan.oil)), x + 2, y + 16, plan.oil > p.oil ? C.red : C.dim);
        const lv = burnLevels(hero.burn, w.flame, w.shape);
        for (let j = 0; j < 5; j++) { rect(x + 12 + j * 2, y + 18, 1, 1, j < lv.flame ? col : [0.25, 0.25, 0.28, 1]); rect(x + 12 + j * 2, y + 21, 1, 1, j < lv.shape ? col : [0.25, 0.25, 0.28, 1]); }
        if (sel && p.cast?.charging) { const c = p.cast.c, safe = 1.4, f = (c - 1); rect(x - 3, y + 24 - 24 * f, 2, 24 * f, c > safe ? [1, 0.25, 0.25, 1] : C.gold); rect(x - 4, y + 24 - 24 * (safe - 1), 4, 1, [1, 1, 1, 1]); }
      }
      text(String(k + 1), x + 12, Hh - 7, C.dim, 1, 'center');
    }
    // --- belt ---
    const belt = hero.belt || []; for (let k = 0; k < Math.min(4, belt.length); k++) { const x = 124 + k * 19, y = Hh - 8 - 16; rect(x - 1, y - 1, 18, 18, C.frame); rect(x, y, 16, 16, C.panel); const b = belt[k]; if (b) { text(b.label || '?', x + 8, y + 2, C.ink, 1, 'center'); text(String(b.count ?? ''), x + 15, y + 9, C.dim, 1, 'right'); } text('ZXCV'[k], x + 8, Hh - 7, C.dim, 1, 'center'); }
    // --- boss bar (top-centre) ---
    const boss = game.entities.find(e => e.kind === 'boss' && !e.dead && e.bossBar !== false);
    if (boss) {
      const bw = Math.min(240, W * 0.6), bx = (W - bw) / 2, by = 16, f = boss.hp / boss.maxHp; H.bossTrail = H.bossTrail > f ? Math.max(f, H.bossTrail - 0.4 / 60) : f;
      text(boss.name.toUpperCase(), W / 2, 4, C.gold, 1, 'center');
      rect(bx - 1, by - 1, bw + 2, 8, C.frame); rect(bx, by, bw, 6, C.healthBg); rect(bx, by, bw * H.bossTrail, 6, C.trail); rect(bx, by, bw * f, 6, boss.barColor || [0.95, 0.6, 0.25, 1]);
      for (const th of boss.phaseTicks || []) rect(bx + bw * th, by - 1, 1, 8, f < th ? [0.5, 0.5, 0.5, 1] : [1, 1, 1, 1]);
      if (boss.phaseTitle && t - boss.phaseTitleT < 2.5) text(boss.phaseTitle, W / 2, by + 9, C.ink, 1, 'center');
    } else H.bossTrail = 1;
    // --- currencies + objective (top-right under the minimap) ---
    const right = W - 8; let ry = 64;
    if (hero.currency) { text(`● ${fmtInt(hero.currency.pennies || 0)}`, right, ry, C.gold, 1, 'right'); if (hero.currency.pearls) text(`◆ ${hero.currency.pearls}`, right - measure(`● ${fmtInt(hero.currency.pennies || 0)}`) - 8, ry, [0.75, 0.91, 1, 1], 1, 'right'); ry += 10; }
    if (game.objective) for (const line of wrap('◇ ' + game.objective, 24).slice(0, 2)) { text(line, right, ry, C.ink, 1, 'right'); ry += 8; }
    // --- toasts ---
    let ty = 100; H.toasts = H.toasts.filter(x => t - x.t < (x.big ? 3.5 : 3));
    for (const x of H.toasts) { const a = Math.min(1, (3 - (t - x.t)) / 0.4); const s = x.text + (x.n > 1 && !x.pennies ? ` ×${x.n}` : ''); if (x.big) { text(s, W / 2, Hh * 0.28, [x.color[0], x.color[1], x.color[2], a], 2, 'center'); continue; } text(s, right, ty, [x.color[0], x.color[1], x.color[2], a], 1, 'right'); ty += 9; }
    // --- damage numbers (world -> screen) ---
    H.numbers = H.numbers.filter(n => t - n.born < 0.85);
    for (const n of H.numbers) { const age = t - n.t0, a = Math.min(1, (0.85 - (t - n.born)) / 0.25); const x = n.x - cam.x + n.drift * Math.min(1, age / 0.6), y = n.y - cam.y - 10 * Math.min(1, (t - n.born) / 0.6); const s = (n.heal ? '+' : '') + Math.max(1, Math.round(n.amount)); text(s, x, y - 8, [n.color[0], n.color[1], n.color[2], a], n.crit ? 2 : 1, 'center'); }
    if (H.combo.n >= 5 && t - H.combo.t < 1.5) text(`×${H.combo.n}`, p.x - cam.x + 12, p.y - cam.y - 30, H.combo.n >= 20 ? C.gold : C.ink);
    // --- interaction prompt ---
    if (game.prompt) { const pr = game.prompt; const s = `[${pr.key || 'E'}] ${pr.text}`; const x = pr.x - cam.x, y = pr.y - cam.y - 14; rect(x - measure(s) / 2 - 2, y - 2, measure(s) + 4, 11, [0, 0, 0, 0.6]); text(s, x, y, pr.refused ? [1, 0.54, 0.48, 1] : C.ink, 1, 'center'); }
    // --- breath pips ---
    if (p.headUnder && p.breath < (game.data.movement.swim.breath - 0.05)) { const f = p.breath / game.data.movement.swim.breath; for (let k = 0; k < 6; k++) { const on = k < Math.ceil(f * 6); rect(p.x - cam.x - 9 + k * 3, p.y - cam.y - 20, 2, 2, on ? (k === 0 && f < 0.2 ? C.red : [0.7, 0.85, 1, 1]) : [0.2, 0.25, 0.3, 0.6]); } }
    // --- build mode strip
    const Bm = game.builder; if (Bm?.on) { const P = { bp_plank: 'Plank', bp_brace: 'Brace', bp_crate: 'Crate' }; const s = `BUILD — [1] Plank 2  [2] Brace 2  [3] Crate 4 · scrap ${hero.scrap || 0} · wheel/T rotate · click place · G done`; rect(W / 2 - measure(s) / 2 - 3, Hh - 50, measure(s) + 6, 10, [0, 0, 0, 0.65]); text(s, W / 2, Hh - 49, C.gold, 1, 'center'); if (Bm.reason) text(Bm.reason, W / 2, Hh - 39, [1, 0.54, 0.48, 1], 1, 'center'); }
    // --- subtitle line (short, bottom centre) ---
    if (game.subtitle && t - game.subtitle.t < game.subtitle.dur) { const lines = wrap(`${game.subtitle.who ? game.subtitle.who.toUpperCase() + ': ' : ''}${game.subtitle.text}`, Math.floor(W * 0.6 / 6)); let y = Hh - 60 - lines.length * 9; for (const l of lines) { rect(W / 2 - measure(l) / 2 - 3, y - 2, measure(l) + 6, 10, [0, 0, 0, 0.62]); text(l, W / 2, y, game.subtitle.color || C.ink, 1, 'center'); y += 9; } }
    return q;
  };
  return H;
}
const fmtInt = n => Math.round(n).toLocaleString('en-US');
export function wrap(s, n) { const out = []; let line = ''; for (const w of s.split(' ')) { if ((line + ' ' + w).trim().length > n) { if (line) out.push(line); line = w; } else line = (line + ' ' + w).trim(); } if (line) out.push(line); return out; }
