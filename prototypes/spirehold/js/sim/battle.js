// Spirehold — the battle around the walls. Pure: no DOM, no clock; dt is passed in.
// B is the runtime battle (never saved). G is the save. Events for pictures and sound go into B.ev.

import { ENEMIES, BOSSES, TOWERS, SPELLS, SCHOOLS, REALMS, NAME_PARTS, CLASSES } from './data.js';
import { rng, hash, TAU } from './rand.js';
import {
  hpMul, wallDmgMul, goldMul, isSiege, isGreatSiege, wallRadius, slotsOf, towerStats, wallMax, wallRegen, bon,
  spellPower, manaMax, manaRegen, spellKnown, autoPower, mageDmg, goldBonus, advPower, TUNE, loreMul,
} from './rules.js';

const MAX_EV = 1500;
export const SPAWN_GAP = 270;      // spawn circle sits this far outside the wall (the edge of the default view)

export function createBattle(G, seed = 1) {
  const B = {
    t: 0, rnd: rng(hash('battle', seed, G.wave.n)), enemies: [], shots: [], ground: [], ev: [], pending: [],
    seq: 1, tcd: {}, mcd: {}, wardT: 0, breachT: 0, wave: null, gvT: 0, autoT: 0, cityXp: 0,
    stats: { gold: 0, lore: 0, kills: 0, dmg: 0 }, quality: 1, cap: 900,
  };
  startWave(G, B, G.wave.n);
  return B;
}
const ev = (B, e) => { if (B.ev.length < MAX_EV) B.ev.push(e); };
export const W = G => wallRadius(G);
export const spawnR = G => W(G) + SPAWN_GAP;
export function towerPos(G, slot) {
  const n = slotsOf(G); const a = slot / n * TAU - Math.PI / 2; const r = W(G);
  return { x: Math.cos(a) * r, y: Math.sin(a) * r, a };
}
export function magePos(G, i) {
  const n = Math.max(1, G.mages.length); const a = i / n * TAU - Math.PI / 2 + 0.4; const r = 30;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

// ---------------------------------------------------------------- waves
export function waveName(n) {
  if (isGreatSiege(n)) return 'Great Siege';
  if (isSiege(n)) return 'Siege';
  return 'Wave';
}
export function warlordName(seed, n) { const r = rng(hash('warlord', seed, n)); return `${r.pick(NAME_PARTS.warlordA)} ${r.pick(NAME_PARTS.warlordB)}`; }

/** What a wave holds: a list of spawns {at, type, a, boss, stack}. Same seed + n = same wave. */
export function buildWave(G, n) {
  const r = rng(hash('wave', G.seed, G.realm, n));
  const realm = REALMS[G.realm] || REALMS.greenvale;
  const mix = {};
  const gate = { gnasher: 1, ravager: 3, swarmling: 4, brute: 5, cinderling: 6, bonewalker: 7, shieldbearer: 9, hexcaller: 12, wyvern: 14, rimehulk: 15, ghast: 16, troll: 18, ram: 20 };
  for (const k in realm.mix) if (n >= (gate[k] || 1) || G.founded > 0 && n >= Math.ceil((gate[k] || 1) / 2)) mix[k] = realm.mix[k];
  if (!Object.keys(mix).length) mix.gnasher = 1;
  const great = isGreatSiege(n), siege = isSiege(n) || great;
  let count = Math.round((10 + n * 1.5 + Math.pow(n, 1.25) * 0.4) * (great ? 4 : siege ? 2 : 1) * TUNE.crowd);
  const dur = Math.min(40, 16 + n * 0.25) * (great ? 1.6 : 1);
  const fronts = 1 + Math.min(3, Math.floor(n / 12)) + (great ? 1 : 0);
  const frontA = Array.from({ length: fronts }, () => r() * TAU);
  // one front of a siege is the main thrust
  const list = [];
  // very large waves send packs as stacks so the field stays smooth (a stack is one body worth several foes)
  const stack = Math.max(1, Math.ceil(count / 700));
  while (count > 0) {
    const type = r.weighted(mix); const E = ENEMIES[type];
    const cost = Math.max(1, Math.round(E.hp / 45));
    const front = frontA[r.int(fronts)];
    const at = r() * dur;
    const groupN = E.group ? E.group : 1;
    for (let g = 0; g < groupN; g++) list.push({ at: at + g * 0.12, type, a: front + (r() - 0.5) * (0.9 + fronts * 0.15) + g * 0.02, stack });
    count -= cost * stack * (E.group ? 0.5 : 1);
  }
  if (siege) {
    const kinds = Object.keys(BOSSES).filter(k => G.realm !== 'greenvale' || k !== 'skytyrant' || n >= 30);
    const bossN = great ? 2 + Math.floor(n / 100) : 1;
    for (let i = 0; i < bossN; i++) list.push({ at: dur * (0.45 + 0.25 * i / bossN), type: kinds[(Math.floor(n / 10) + i) % kinds.length], a: frontA[i % fronts], boss: true, stack: 1, name: warlordName(G.seed, n * 10 + i) });
  }
  list.sort((x, y) => x.at - y.at);
  return { n, list, dur, siege, great, total: list.length };
}
export function startWave(G, B, n) {
  B.wave = { ...buildWave(G, n), idx: 0, t: 0, alive: 0, killed: 0, leaked: 0 };
  ev(B, { k: 'wave', n, siege: B.wave.siege, great: B.wave.great });
  const boss = B.wave.list.find(s => s.boss);
  if (boss) ev(B, { k: 'boss', name: boss.name, type: boss.type, n });
}

function spawn(G, B, s) {
  const E = s.boss ? BOSSES[s.type] : ENEMIES[s.type];
  // a crowded field: newcomers march in bundles (one body worth two) so the field stays smooth
  if (!s.boss && B.enemies.length > B.cap) s = { ...s, stack: s.stack * (B.enemies.length > B.cap * 2.5 ? 8 : B.enemies.length > B.cap * 1.5 ? 4 : 2) };
  const n = B.wave.n; const R = spawnR(G) + B.rnd() * 60;
  const weak = s.boss ? 1 : 1 / TUNE.crowd;
  const hp = E.hp * hpMul(n) * s.stack * (s.boss ? 1 + n / 40 : 1) * weak;
  const e = {
    id: B.seq++, type: s.type, boss: !!s.boss, name: s.name, a: s.a, r: R, x: Math.cos(s.a) * R, y: Math.sin(s.a) * R,
    hp, max: hp, sp: E.speed * (0.9 + B.rnd() * 0.2), size: E.size * (s.stack > 1 ? 1.25 : 1), stack: s.stack,
    wall: E.wall * wallDmgMul(n) * s.stack * weak, gold: E.gold * goldMul(n) * s.stack * (s.boss ? 1 + n / 30 : 1) * weak, res: E.res || {}, flying: !!E.flying,
    undead: !!E.undead, big: s.boss || E.hp >= 150, slowT: 0, slowF: 1, stunT: 0, burnT: 0, burnD: 0, stripT: 0, shatterT: 0, healT: 1 + B.rnd(),
    lane: B.rnd() * 16, da: (B.rnd() - 0.5) * 0.02, atWall: false, hitT: 0, wave: n, ward: 0, alive: true, look: E.look, color: E.color,
  };
  B.enemies.push(e); B.wave.alive++;
  return e;
}

// ---------------------------------------------------------------- damage
function resist(e, type) { const r = e.res[type] || 0; return e.stripT > 0 ? Math.min(0, r) : r; }
const ENEMIES_LORE = e => e.stack * Math.max(0.5, (e.boss ? 1 : (ENEMIES[e.type]?.gold || 1) / TUNE.crowd));
export function hurt(G, B, e, amt, type, src) {
  if (!e.alive || amt <= 0) return 0;
  let d = amt * (1 - resist(e, type));
  if (e.ward > 0) d *= 0.6;
  if (e.shatterT > 0 && e.stunT > 0) d *= 2;
  if (src && src.bigMul && e.big) d *= src.bigMul;
  if (src && src.airMul && e.flying) d *= src.airMul;
  if (src && src.undeadMul && e.undead) d *= src.undeadMul;
  e.hp -= d; e.hitT = 0.12; B.stats.dmg += d;
  if (B.bySrc) { const k = !src ? 'dot/ditch' : src.tower ? src.tower.type : src.mage ? 'mage' : src.spell ? 'spell' : src.guild ? 'guild' : 'other'; B.bySrc[k] = (B.bySrc[k] || 0) + d; }
  if (src && src.tower) { src.tower.dmg = (src.tower.dmg || 0) + d; }
  if (e.hp <= 0) kill(G, B, e, src);
  return d;
}
function kill(G, B, e, src) {
  e.alive = false; e.hp = 0; B.dead = (B.dead || 0) + 1;
  const gold = e.gold * goldBonus(G) * (1 + bon(G, 'kill'));
  const lore = (e.boss ? 25 : 0.12) * ENEMIES_LORE(e) * loreMul(e.wave) * (1 + bon(G, 'lore'));
  G.gold += gold; G.lore += lore; G.totals.gold += gold; G.totals.lore += lore; G.totals.kills += e.stack;
  B.stats.gold += gold; B.stats.lore += lore; B.stats.kills += e.stack; B.cityXp += e.gold;
  if (e.boss) { G.totals.bosses++; const sh = 1 + Math.floor(e.wave / 20); G.shards += sh; ev(B, { k: 'bossdown', name: e.name, x: e.x, y: e.y, shards: sh }); }
  if (src?.tower) src.tower.kills = (src.tower.kills || 0) + e.stack;
  if (src?.mage) src.mage.kills = (src.mage.kills || 0) + e.stack;
  if (src?.manaOnKill) G.mana = Math.min(manaMax(G), G.mana + 0.6);
  if (e.wave === B.wave.n) B.wave.killed++;
  ev(B, { k: 'die', x: e.x, y: e.y, type: e.type, look: e.look, color: e.color, size: e.size, boss: e.boss, gold });
}

// ---------------------------------------------------------------- queries
const alive = B => B.enemies;
function nearestTo(B, x, y, maxD, filt) {
  let best = null, bd = maxD * maxD;
  for (const e of B.enemies) { if (!e.alive || (filt && !filt(e))) continue; const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = e; } }
  return best;
}
function inRadius(B, x, y, rad, filt) {
  const out = []; const r2 = rad * rad;
  for (const e of B.enemies) { if (!e.alive || (filt && !filt(e))) continue; const dx = e.x - x, dy = e.y - y, er = rad + e.size * 0.6; if (dx * dx + dy * dy <= er * er) out.push(e); }
  return out;
}
/** The most crowded spot (sampled), for meteors and auto-cast. */
export function densest(B, rad = 70, filt = null) {
  const list = B.enemies.filter(e => e.alive && (!filt || filt(e)));
  if (!list.length) return null;
  let best = null, bn = -1;
  const samples = Math.min(list.length, 36);
  for (let i = 0; i < samples; i++) {
    const c = list[Math.floor(B.rnd() * list.length)]; let n = 0;
    for (const e of list) { const dx = e.x - c.x, dy = e.y - c.y; if (dx * dx + dy * dy < rad * rad) n += e.stack * (e.boss ? 8 : 1); }
    if (n > bn) { bn = n; best = c; }
  }
  return { x: best.x, y: best.y, n: bn };
}
function blast(G, B, x, y, rad, dmg, type, src = {}, opts = {}) {
  const hit = inRadius(B, x, y, rad, opts.air === false ? e => !e.flying : null);
  for (const e of hit) {
    if (opts.stun) { e.stunT = Math.max(e.stunT, opts.stun * (e.boss ? 0.3 : 1)); }
    if (opts.slow) { e.slowT = Math.max(e.slowT, opts.slowT || 2); e.slowF = Math.min(e.slowF, opts.slow); }
    if (opts.burn) { e.burnT = 3 * (1 + bon(G, 'burn')); e.burnD = Math.max(e.burnD, dmg * 0.25 * opts.burn * (1 + bon(G, 'burn'))); }
    if (opts.knock && !e.boss && !e.atWall) { e.r += opts.knock; }
    if (opts.shatter) e.shatterT = 3;
    hurt(G, B, e, dmg, type, src);
  }
  ev(B, { k: 'blast', x, y, r: rad, type, big: !!opts.big });
  return hit.length;
}

// ---------------------------------------------------------------- towers
function towerTarget(G, B, p, range, air) {
  let best = null, br = 1e9; const r2 = range * range;
  for (const e of B.enemies) {
    if (!e.alive || (!air && e.flying)) continue;
    const dx = e.x - p.x, dy = e.y - p.y; if (dx * dx + dy * dy > r2) continue;
    const score = e.r - (e.boss ? 40 : 0); if (score < br) { br = score; best = e; }
  }
  return best;
}
function fireTower(G, B, t, p, st, target) {
  const T = st.T, fx = st.fx; const src = { tower: t, bigMul: fx.bigMul, airMul: fx.airMul, undeadMul: fx.undeadMul, manaOnKill: fx.manaOnKill };
  const crit = () => (B.rnd() < st.crit ? st.critMul : 1);
  const type = T.dmgType;
  switch (T.kind) {
    case 'arrow': case 'missile': {
      const targets = [target];
      if (st.multishot > 1) { for (const e of B.enemies) { if (targets.length >= st.multishot) break; if (e.alive && e !== target && (T.air || !e.flying) && Math.hypot(e.x - p.x, e.y - p.y) < st.range) targets.push(e); } }
      for (const tg of targets) B.shots.push({ k: T.kind, x: p.x, y: p.y, tg, speed: T.kind === 'arrow' ? 560 : 300, dmg: st.dmg * crit(), type, src, knock: fx.knock, strip: fx.strip, home: T.kind === 'missile' });
      break;
    }
    case 'bolt': {
      for (let m = 0; m < st.multishot; m++) {
        const ang = Math.atan2(target.y - p.y, target.x - p.x) + (m - (st.multishot - 1) / 2) * 0.12;
        const ex = p.x + Math.cos(ang) * st.range, ey = p.y + Math.sin(ang) * st.range;
        const hits = [];
        for (const e of B.enemies) {
          if (!e.alive) continue; const along = (e.x - p.x) * Math.cos(ang) + (e.y - p.y) * Math.sin(ang);
          if (along < 0 || along > st.range) continue; const off = Math.abs(-(e.x - p.x) * Math.sin(ang) + (e.y - p.y) * Math.cos(ang));
          if (off < e.size + 5) hits.push({ e, along });
        }
        hits.sort((a, b) => a.along - b.along);
        B.shots.push({ k: 'bolt', x: p.x, y: p.y, ex, ey, speed: 760, hits: hits.slice(0, st.pierce).map(h => h.e), dmg: st.dmg * crit(), type, src, stun: fx.stun });
      }
      break;
    }
    case 'shell': {
      B.shots.push({ k: 'shell', x: p.x, y: p.y, sx: p.x, sy: p.y, tx: target.x, ty: target.y, speed: 300, dmg: st.dmg * crit(), type, src, splash: st.splash, fx });
      break;
    }
    case 'frost': {
      B.shots.push({ k: 'frost', x: p.x, y: p.y, sx: p.x, sy: p.y, tx: target.x, ty: target.y, speed: 420, dmg: st.dmg, type, src, splash: st.splash, fx });
      break;
    }
    case 'flame': {
      const ang = Math.atan2(target.y - p.y, target.x - p.x); const cone = 0.35 * (fx.cone || 1);
      for (const e of B.enemies) {
        if (!e.alive || e.flying) continue; const dx = e.x - p.x, dy = e.y - p.y; const d = Math.hypot(dx, dy); if (d > st.range) continue;
        let da = Math.atan2(dy, dx) - ang; da = Math.atan2(Math.sin(da), Math.cos(da)); if (Math.abs(da) > cone) continue;
        e.burnT = 3 * (1 + bon(G, 'burn')); e.burnD = Math.max(e.burnD, st.dmg * 0.6 * (fx.burnMul || 1) * (1 + bon(G, 'burn'))); e.burnSpread = !!fx.spreadBurn;
        hurt(G, B, e, st.dmg, type, src);
      }
      ev(B, { k: 'flame', x: p.x, y: p.y, a: ang, len: st.range, cone });
      break;
    }
    case 'chain': {
      const hops = st.chains > 0 ? st.chains + 1 : 1; let cur = target; const pts = [{ x: p.x, y: p.y }]; const seen = new Set(); let d = st.dmg * crit();
      t._n = (t._n || 0) + 1; const stun = fx.stun && (!fx.stunEvery || t._n % fx.stunEvery === 0) ? fx.stun : 0;
      for (let i = 0; i < hops && cur; i++) {
        seen.add(cur); pts.push({ x: cur.x, y: cur.y });
        if (stun) cur.stunT = Math.max(cur.stunT, stun * (cur.boss ? 0.3 : 1));
        if (st.chains <= 0 && fx.splash) blast(G, B, cur.x, cur.y, 40, d * 0.5, type, src);
        hurt(G, B, cur, d, type, src); d *= 0.85;
        cur = nearestTo(B, cur.x, cur.y, 95, e => !seen.has(e));
      }
      ev(B, { k: 'bolt', pts, big: st.chains <= 0 });
      break;
    }
    case 'beam': {
      hurt(G, B, target, st.dmg * crit(), type, src);
      if (fx.splash) blast(G, B, target.x, target.y, 34, st.dmg * 0.5, type, src);
      G.wall.hp = Math.min(wallMax(G), G.wall.hp + wallMax(G) * (T.wallHeal || 0) * (fx.wallHeal || 1));
      ev(B, { k: 'beam', x: p.x, y: p.y, tx: target.x, ty: target.y, color: '#ffe38a' });
      break;
    }
    case 'meteor': {
      const spot = densest(B, st.splash, e => !e.flying) || { x: target.x, y: target.y };
      const n = fx.cluster || 1;
      for (let i = 0; i < n; i++) {
        const ox = n > 1 ? (B.rnd() - 0.5) * 140 : 0, oy = n > 1 ? (B.rnd() - 0.5) * 140 : 0;
        meteor(G, B, spot.x + ox, spot.y + oy, n > 1 ? st.splash * 0.6 : st.splash, st.dmg, src, { delay: 1.0 + i * 0.15, stun: fx.stun, burnGround: fx.burnGround });
      }
      break;
    }
  }
  ev(B, { k: 'shoot', tower: T.kind, x: p.x, y: p.y });
}
export function meteor(G, B, x, y, rad, dmg, src, o = {}) {
  const delay = o.delay ?? 1.1;
  ev(B, { k: 'meteor', x, y, r: rad, delay, big: rad > 80 });
  B.pending.push({ t: delay, fn: () => {
    blast(G, B, x, y, rad, dmg, 'fire', src, { air: false, stun: o.stun, burn: 1, big: true });
    if (o.burnGround) B.ground.push({ x, y, r: rad * 0.7, dps: dmg * 0.12, t: 5, type: 'fire' });
    ev(B, { k: 'impact', x, y, r: rad });
  } });
}
function towerSpecials(G, B, t, p, st, dt) {
  const fx = st.fx; const c = B.tcd[t.slot];
  if (fx.storm) {
    c.storm = (c.storm ?? fx.storm) - dt;
    if (c.storm <= 0) {
      c.storm = fx.storm; const spot = densest(B, 70, e => Math.hypot(e.x - p.x, e.y - p.y) < st.range * 1.2);
      if (spot) { if (t.type === 'shrine') { blast(G, B, spot.x, spot.y, 70, st.dmg * 4, 'holy', { tower: t, undeadMul: fx.undeadMul }); ev(B, { k: 'pillar', x: spot.x, y: spot.y }); } else { blast(G, B, spot.x, spot.y, 75, st.dmg * 2.5, 'physical', { tower: t }); ev(B, { k: 'arrowrain', x: spot.x, y: spot.y }); } }
    }
  }
  if (fx.nova) {
    c.nova = (c.nova ?? fx.nova) - dt;
    if (c.nova <= 0) { c.nova = fx.nova; blast(G, B, p.x, p.y, 95, st.dmg * 5, 'fire', { tower: t }, { air: false, burn: 1 }); ev(B, { k: 'nova', x: p.x, y: p.y, r: 95 }); }
  }
}

// ---------------------------------------------------------------- shots in flight
function stepShots(G, B, dt) {
  const keep = [];
  for (const s of B.shots) {
    if (s.k === 'arrow' || s.k === 'missile') {
      if (!s.tg.alive) { if (s.home) { s.tg = nearestTo(B, s.x, s.y, 260); if (!s.tg) continue; } else continue; }
      const dx = s.tg.x - s.x, dy = s.tg.y - s.y, d = Math.hypot(dx, dy), step = s.speed * dt;
      if (d <= step + s.tg.size) {
        if (s.strip) s.tg.stripT = 4;
        if (s.knock && !s.tg.boss && !s.tg.atWall) s.tg.r += s.knock;
        hurt(G, B, s.tg, s.dmg, s.type, s.src); if (s.k === 'missile') ev(B, { k: 'spark', x: s.tg.x, y: s.tg.y, color: '#c070ff' });
        continue;
      }
      s.x += dx / d * step; s.y += dy / d * step; s.a = Math.atan2(dy, dx); keep.push(s);
    } else if (s.k === 'bolt') {
      const dx = s.ex - s.x, dy = s.ey - s.y, d = Math.hypot(dx, dy), step = s.speed * dt;
      s.done ||= new Set();
      for (const e of s.hits) { if (e.alive && !s.done.has(e.id) && Math.hypot(e.x - s.x, e.y - s.y) < step + e.size + 8) { s.done.add(e.id); hurt(G, B, e, s.dmg, s.type, s.src); if (s.stun) e.stunT = Math.max(e.stunT, s.stun * (e.boss ? 0.3 : 1)); } }
      if (d <= step) continue;
      s.x += dx / d * step; s.y += dy / d * step; s.a = Math.atan2(dy, dx); keep.push(s);
    } else if (s.k === 'shell' || s.k === 'frost' || s.k === 'fireball' || s.k === 'boulder' || s.k === 'firebolt') {
      const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy), step = s.speed * dt;
      if (d <= step) { landShot(G, B, s); continue; }
      s.x += dx / d * step; s.y += dy / d * step; s.a = Math.atan2(dy, dx);
      const tot = Math.hypot(s.tx - s.sx, s.ty - s.sy) || 1; s.p = 1 - (d - step) / tot; keep.push(s);
    }
  }
  B.shots = keep;
}
function landShot(G, B, s) {
  const fx = s.fx || {};
  if (s.k === 'shell') {
    const n = fx.cluster || 0;
    blast(G, B, s.tx, s.ty, s.splash, s.dmg, s.type, s.src, { air: false, knock: fx.knock, big: s.splash > 60 });
    for (let i = 0; i < n; i++) { const a = B.rnd() * TAU, r = s.splash * 0.9; B.pending.push({ t: 0.12 + i * 0.06, fn: () => blast(G, B, s.tx + Math.cos(a) * r, s.ty + Math.sin(a) * r, s.splash * 0.55, s.dmg * 0.4, s.type, s.src, { air: false }) }); }
    if (fx.burnGround) B.ground.push({ x: s.tx, y: s.ty, r: s.splash * 0.8, dps: s.dmg * 0.25, t: 4, type: 'fire' });
    if (fx.knock || s.splash > 60) ev(B, { k: 'shake', amt: s.splash > 60 ? 4 : 2 });
  } else if (s.k === 'frost') {
    const stun = fx.stun && B.rnd() < (fx.stunChance || 1) ? fx.stun : 0;
    blast(G, B, s.tx, s.ty, s.splash, s.dmg, 'frost', s.src, { slow: 0.5, slowT: 2.5, stun, shatter: fx.shatter });
    ev(B, { k: 'frost', x: s.tx, y: s.ty, r: s.splash });
  } else if (s.k === 'fireball' || s.k === 'firebolt') {
    blast(G, B, s.tx, s.ty, s.splash, s.dmg, 'fire', s.src, { burn: 1, big: s.k === 'fireball' });
  } else if (s.k === 'boulder') {
    blast(G, B, s.tx, s.ty, s.splash, s.dmg, 'physical', s.src, { stun: 1, air: false });
    ev(B, { k: 'shake', amt: 2 });
  }
}

// ---------------------------------------------------------------- mages and adventurers
function stepMages(G, B, dt) {
  G.mages.forEach((m, i) => {
    const S = SCHOOLS[m.school]; if (!S) return;
    const c = B.mcd[m.id] = (B.mcd[m.id] ?? S.cd * B.rnd()) - dt; if (c > 0) return;
    B.mcd[m.id] = S.cd;
    const p = magePos(G, i); const dmg = mageDmg(G, m); const src = { mage: m };
    const first = B.enemies.reduce((b, e) => e.alive && (!b || e.r < b.r) ? e : b, null);
    if (!first) { B.mcd[m.id] = 0.5; return; }
    ev(B, { k: 'cast', x: p.x, y: p.y, color: S.color, mage: m.id });
    switch (S.spell) {
      case 'firebolt': B.shots.push({ k: 'firebolt', x: p.x, y: p.y, sx: p.x, sy: p.y, tx: first.x, ty: first.y, speed: 480, dmg, splash: S.radius, src }); break;
      case 'frostburst': { const s = densest(B, S.radius) || first; blast(G, B, s.x, s.y, S.radius, dmg, 'frost', src, { slow: S.slow, slowT: 3 }); ev(B, { k: 'frost', x: s.x, y: s.y, r: S.radius }); break; }
      case 'chain': { let cur = first; const pts = [p]; const seen = new Set(); let d = dmg; for (let k = 0; k <= S.chains && cur; k++) { seen.add(cur); pts.push({ x: cur.x, y: cur.y }); hurt(G, B, cur, d, 'lightning', src); d *= 0.88; cur = nearestTo(B, cur.x, cur.y, 100, e => !seen.has(e)); } ev(B, { k: 'bolt', pts }); break; }
      case 'missile': for (let k = 0; k < 2; k++) { const tg = B.enemies[Math.floor(B.rnd() * B.enemies.length)]; if (tg?.alive) B.shots.push({ k: 'missile', x: p.x, y: p.y, tg, speed: 320, dmg: dmg * 0.6, type: 'arcane', src, home: true }); } break;
      case 'smite': { blast(G, B, first.x, first.y, S.radius, dmg, 'holy', src); G.wall.hp = Math.min(wallMax(G), G.wall.hp + wallMax(G) * S.wallHeal); ev(B, { k: 'pillar', x: first.x, y: first.y, small: true }); break; }
      case 'boulder': { const s = densest(B, S.radius, e => !e.flying) || first; B.shots.push({ k: 'boulder', x: p.x, y: p.y, sx: p.x, sy: p.y, tx: s.x, ty: s.y, speed: 260, dmg, splash: S.radius, src }); break; }
      case 'meteor': { const s = densest(B, S.radius, e => !e.flying) || first; meteor(G, B, s.x, s.y, S.radius, dmg, src, { delay: 1.2 }); break; }
    }
  });
}
/** Adventurers at home man the walls: a volley every second from whoever is fit and not away. */
export function guildWallDps(G, now) {
  let s = 0;
  for (const a of G.guild.roster) { if (a.dead || a.busy || (a.injuredUntil || 0) > now) continue; s += advPower(a) * CLASSES[a.cls].wall * (1 + (a.trait === 'stalwart' ? 0.5 : 0)); }
  return s * 0.35 * Math.pow(1.06, G.city.level - 1) * (1 + bon(G, 'guildWall'));
}
function stepGuild(G, B, dt, now) {
  B.gvT -= dt; if (B.gvT > 0) return; B.gvT = 1;
  const dps = guildWallDps(G, now); if (dps <= 0) return;
  const atWall = B.enemies.filter(e => e.alive && e.r < W(G) + 160);
  if (!atWall.length) return;
  const n = Math.min(6, atWall.length);
  for (let i = 0; i < n; i++) { const e = atWall[Math.floor(B.rnd() * atWall.length)]; const a = B.rnd() * TAU; const wr = W(G); B.shots.push({ k: 'arrow', x: Math.cos(e.a + (B.rnd() - 0.5) * 0.3) * wr, y: Math.sin(e.a + (B.rnd() - 0.5) * 0.3) * wr, tg: e, speed: 520, dmg: dps / n, type: 'physical', src: { guild: true }, adv: true }); }
}

// ---------------------------------------------------------------- the player's spells
export function canCast(G, B, id) {
  const S = SPELLS[id]; if (!S || !spellKnown(G, id)) return 'unknown';
  if ((G.spells.cd[id] || 0) > 0) return 'cooldown';
  if (G.mana < S.mana) return 'mana';
  return null;
}
export function castSpell(G, B, id, x, y, { auto = false } = {}) {
  const why = canCast(G, B, id); if (why) return why;
  const S = SPELLS[id];
  G.mana -= S.mana; G.spells.cd[id] = S.cd; G.totals.spells++;
  const pow = spellPower(G) * (S.power || 0) * (auto ? autoPower(G) : 1) * (1 + bon(G, 'd_' + S.dmgType)) * (S.dmgType === 'fire' && (id === 'meteor' || id === 'starfury') ? 1 + bon(G, 'meteor') : 1);
  const src = { spell: id };
  ev(B, { k: 'spell', id, x, y, auto });
  switch (id) {
    case 'fireball': B.shots.push({ k: 'fireball', x: 0, y: -20, sx: 0, sy: -20, tx: x, ty: y, speed: 640, dmg: pow, splash: S.radius, src }); break;
    case 'chain': { let cur = nearestTo(B, x, y, 220); const pts = [{ x: 0, y: -20 }]; const seen = new Set(); let d = pow; for (let k = 0; k < S.chains && cur; k++) { seen.add(cur); pts.push({ x: cur.x, y: cur.y }); hurt(G, B, cur, d, 'lightning', src); d *= 0.93; cur = nearestTo(B, cur.x, cur.y, 120, e => !seen.has(e)); } ev(B, { k: 'bolt', pts, big: true }); break; }
    case 'frostnova': blast(G, B, x, y, S.radius, pow, 'frost', src, { slow: S.slow, slowT: S.slowT }); ev(B, { k: 'frost', x, y, r: S.radius, big: true }); break;
    case 'meteor': meteor(G, B, x, y, S.radius, pow, src, { delay: S.delay, stun: S.stun, burnGround: true }); break;
    case 'quake': { const wr = W(G); for (const e of B.enemies) if (e.alive && !e.flying && e.r < wr + 260) { e.stunT = Math.max(e.stunT, S.stun * (e.boss ? 0.3 : 1)); hurt(G, B, e, pow, 'physical', src); } ev(B, { k: 'quake', r: wr + 260 }); ev(B, { k: 'shake', amt: 9 }); break; }
    case 'ward': B.wardT = S.ward; G.wall.hp = Math.min(wallMax(G), G.wall.hp + wallMax(G) * S.heal); ev(B, { k: 'ward' }); break;
    case 'barrage': { const near = B.enemies.filter(e => e.alive).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y)).slice(0, S.missiles); for (let k = 0; k < S.missiles && near.length; k++) B.shots.push({ k: 'missile', x: (B.rnd() - 0.5) * 30, y: (B.rnd() - 0.5) * 30, tg: near[k % near.length], speed: 280 + B.rnd() * 80, dmg: pow, type: 'arcane', src, home: true }); break; }
    case 'starfury': { for (let k = 0; k < S.meteors; k++) { const s = densest(B, S.radius, e => !e.flying) || { x: x + (B.rnd() - 0.5) * 300, y: y + (B.rnd() - 0.5) * 300 }; meteor(G, B, s.x + (B.rnd() - 0.5) * 60, s.y + (B.rnd() - 0.5) * 60, S.radius, pow, src, { delay: S.delay + k * 0.22, stun: 1, burnGround: true }); } ev(B, { k: 'shake', amt: 6 }); break; }
  }
  return null;
}
/** Where an apprentice aims a spell: the thickest crowd near the wall. */
export function autoTarget(G, B, id) {
  if (id === 'ward') return (G.wall.hp < wallMax(G) * 0.5 && B.enemies.some(e => e.alive && e.atWall)) ? { x: 0, y: 0 } : null;
  if (id === 'quake') { const n = B.enemies.filter(e => e.alive && !e.flying && e.r < W(G) + 260).length; return n >= 25 ? { x: 0, y: 0 } : null; }
  const s = densest(B, SPELLS[id].radius || 70, id === 'meteor' || id === 'starfury' ? e => !e.flying : null);
  if (!s) return null;
  if (s.n < (id === 'starfury' ? 30 : id === 'meteor' ? 8 : 3)) return null;
  return s;
}

// ---------------------------------------------------------------- the tick
export function stepBattle(G, B, dt, now = 0) {
  B.t += dt;
  const wr = W(G);
  // pending (meteor impacts, cluster bursts)
  if (B.pending.length) { const left = []; for (const p of B.pending) { p.t -= dt; if (p.t <= 0) p.fn(); else left.push(p); } B.pending = left; }

  // breach pause
  if (B.breachT > 0) { B.breachT -= dt; if (B.breachT <= 0) startWave(G, B, G.wave.n); return; }

  // spawn
  const Wv = B.wave; Wv.t += dt;
  while (Wv.idx < Wv.list.length && Wv.list[Wv.idx].at <= Wv.t) spawn(G, B, Wv.list[Wv.idx++]);

  // enemies
  let wallDps = 0; const ditch = bon(G, 'ditch'); const rimeWall = G.towers.some(t => t.br[1] === 1 && t.type === 'frost');
  const bosses = B.enemies.filter(e => e.alive && e.boss);
  for (const e of B.enemies) {
    if (!e.alive) continue;
    if (e.hitT > 0) e.hitT -= dt;
    if (e.stripT > 0) e.stripT -= dt; if (e.shatterT > 0) e.shatterT -= dt;
    if (e.burnT > 0) { e.burnT -= dt; hurt(G, B, e, e.burnD * dt, 'fire', null); if (!e.alive) { if (e.burnSpread) for (const n of inRadius(B, e.x, e.y, 30)) if (n.burnT <= 0) { n.burnT = 2; n.burnD = e.burnD * 0.6; } continue; } }
    else if (ENEMIES[e.type]?.regen && !e.boss) e.hp = Math.min(e.max, e.hp + e.max * ENEMIES[e.type].regen * dt);
    const E = e.boss ? BOSSES[e.type] : ENEMIES[e.type];
    if (E.healer) { e.healT -= dt; if (e.healT <= 0) { e.healT = 2.2; for (const n of inRadius(B, e.x, e.y, 60)) if (n !== e) n.hp = Math.min(n.max, n.hp + n.max * 0.06); ev(B, { k: 'heal', x: e.x, y: e.y }); } }
    if (E.summons && e.r > wr + 20) { e.sumT = (e.sumT ?? 3) - dt; if (e.sumT <= 0) { e.sumT = 3; for (let k = 0; k < 3; k++) spawn(G, B, { type: E.summons, a: e.a + (B.rnd() - 0.5) * 0.15, stack: 1, at: 0 }).r = e.r + 10; } }
    let mul = 1;
    for (const b of bosses) { if (b === e) continue; const BB = BOSSES[b.type]; if (!BB.rally && !BB.shield) continue; const dx = b.x - e.x, dy = b.y - e.y; if (dx * dx + dy * dy < 120 * 120) { if (BB.rally) mul = 1.3; if (BB.shield) e.ward = 0.5; } }
    if (e.ward > 0) e.ward -= dt;
    if (e.stunT > 0) { e.stunT -= dt; continue; }
    if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowF = 1; }
    const stopR = wr + 8 + e.size * 0.7 + e.lane;
    if (e.r > stopR) {
      e.r -= e.sp * e.slowF * mul * dt; e.a += e.da * dt; e.atWall = false;
      if (e.r <= stopR) { e.r = stopR; e.atWall = true; }
    } else e.atWall = true;
    if (e.atWall) {
      wallDps += e.wall * (rimeWall ? 0.5 : 1) * (e.slowT > 0 ? 0.7 : 1);
      if (ditch) hurt(G, B, e, ditchDps(G, ditch) * dt, 'physical', null);
    }
    e.x = Math.cos(e.a) * e.r; e.y = Math.sin(e.a) * e.r;
  }
  // tidy dead bodies (keep the list compact)
  if (B.dead) { B.enemies = B.enemies.filter(e => e.alive); B.dead = 0; }

  // ground fire
  if (B.ground.length) { for (const g of B.ground) { g.t -= dt; for (const e of inRadius(B, g.x, g.y, g.r, e => !e.flying)) hurt(G, B, e, g.dps * dt, 'fire', null); } B.ground = B.ground.filter(g => g.t > 0); }

  // walls
  const wmax = wallMax(G);
  if (B.wardT > 0) { B.wardT -= dt; wallDps = 0; }
  G.wall.hp = Math.min(wmax, G.wall.hp - wallDps * dt + wallRegen(G) * dt * (wallDps > 0 ? 1 : 3));
  B.wallDps = wallDps;
  if (G.wall.hp <= 0) { breach(G, B); return; }

  // towers
  for (const t of G.towers) {
    const p = towerPos(G, t.slot); const st = towerStats(G, t);
    const c = B.tcd[t.slot] || (B.tcd[t.slot] = { cd: B.rnd() / st.rate });
    towerSpecials(G, B, t, p, st, dt);
    c.cd -= dt; if (c.cd > 0) continue;
    const tg = towerTarget(G, B, p, st.range, st.T.air);
    if (!tg) { c.cd = 0.15; continue; }
    c.cd += 1 / st.rate; if (c.cd < 0) c.cd = 0;
    fireTower(G, B, t, p, st, tg);
  }
  stepMages(G, B, dt);
  stepGuild(G, B, dt, now);
  stepShots(G, B, dt);

  // mana + spell cooldowns + apprentices
  G.mana = Math.min(manaMax(G), G.mana + manaRegen(G) * dt);
  for (const id in G.spells.cd) if (G.spells.cd[id] > 0) G.spells.cd[id] = Math.max(0, G.spells.cd[id] - dt);
  if (bon(G, 'autocast')) {
    B.autoT -= dt;
    if (B.autoT <= 0) {
      B.autoT = 0.5;
      for (const id in G.spells.auto) {
        if (!G.spells.auto[id] || canCast(G, B, id)) continue;
        const reserve = id === 'ward' ? 0 : 0.15 * manaMax(G);
        if (G.mana - SPELLS[id].mana < reserve && id !== 'ward') continue;
        const at = autoTarget(G, B, id); if (at) { castSpell(G, B, id, at.x, at.y, { auto: true }); break; }
      }
    }
  }

  // next wave: everything spawned and the field mostly clear (or the clock ran long)
  const live = B.enemies.length;
  if (Wv.idx >= Wv.list.length && (live === 0 || (live < Math.max(4, Wv.total * 0.12) && Wv.t > Wv.dur + 8) || Wv.t > Wv.dur + 60)) {
    G.totals.waves++;
    ev(B, { k: 'cleared', n: Wv.n });
    if (G.wave.auto) G.wave.n++;
    G.wave.best = Math.max(G.wave.best, G.wave.n);
    startWave(G, B, G.wave.n);
  }
}
/** Spikes in the ditch: a flat sting that grows with the city, not with the foe (a % of health would beat any wave). */
export const ditchDps = (G, d) => d * 25 * Math.pow(1.12, G.city.level - 1) * (1 + bon(G, 'tower'));
export function breach(G, B) {
  ev(B, { k: 'breach', n: G.wave.n });
  for (const e of B.enemies) if (e.alive) ev(B, { k: 'flee', x: e.x, y: e.y });
  B.enemies = []; B.shots = []; B.pending = []; B.ground = [];
  G.wave.falls++;
  G.wave.n = Math.max(1, G.wave.n - 3);
  G.wall.hp = wallMax(G);
  B.breachT = 3;
}
export { TUNE };
