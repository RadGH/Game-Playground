#!/usr/bin/env node
// The balance bot (M12, ruling 43): plays the REAL sim headless — a hero of each Path fights its way through a zone,
// drinks potions when hurt, picks up its loot, wears upgrades, spends points, learns skills, and starts a fresh game
// session (ruling 25) when the zone is cleared. Reports the numbers the plan's bands are about.
//   node tools/sim.mjs [--minutes 60] [--paths fighter,rogue,mage,healer] [--zone proving_meadow] [--seeds 3] [--json out.json]
// Targets (PLAN.md §0 rulings 37/38, data/rarity.json `expected`): ~30 min a level, deaths rare but real, rares about
// 1-3 an hour in Act 1, gear score near zone level - 2.
import { readFileSync, writeFileSync } from 'node:fs';
import { createWorld, addPlayer, setInput, step, act, DT } from '../js/sim/world.js';
import { loadContent } from '../js/sim/content.js';
import { newCharacter, STARTER_KIT, gainXp } from '../js/rules/character.js';
import { xpAtLevel } from '../js/rules/progression.js';
import { makeItem, canEquip, weaponDamage, itemArmour, itemMods } from '../js/rules/items.js';
import { makePotion } from '../js/rules/potions.js';
import { sheet } from '../js/rules/sheet.js';
import { makeRng } from '../js/sim/rng.js';
import { rankOf, costOf, atRank } from '../js/sim/skills.js';
import { clearLine, flowTo, downhill } from '../js/sim/paths.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const MINUTES = +arg('minutes', 60), SEEDS = +arg('seeds', 2), ZONE = arg('zone', 'proving_meadow'), START = +arg('level', 1);
const PATHS = arg('paths', 'fighter,rogue,mage,healer').split(',');
const content = loadContent(f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url))));
const D = content.items, S = content.skills;
const MAIN = { fighter: 'str', rogue: 'agi', mage: 'int', healer: 'spi', wanderer: 'str' };

function freshHero(rng, path) {
  const kit = Object.fromEntries(Object.entries(STARTER_KIT).map(([s, b]) => [s, makeItem(D, rng, 1, { base: b })]));
  const c = newCharacter({ name: path, kit }); c.belt = [makePotion(rng, 'health', 'minor', 3), makePotion(rng, 'mana', 'minor', 2)];
  c.wantPath = path;
  if (START > 1) { const g = gainXp(c, xpAtLevel(START)); delete g.levelled; return g; }
  return c;
}
const score = (ch, it) => { const st = sheet({ ...ch, equip: { ...ch.equip, [slotOf(it)]: it } }, D); return st.weapon.max + st.weapon.min + st.armour * 0.5 + st.maxHp * 0.3 + st.maxMana * 0.1 + (st.attrs[MAIN[ch.path || 'wanderer']] * 1.5); };
const slotOf = it => { const b = D.bases[it.base]; return b?.slot === 'ring' ? 'ring1' : b?.slot; };

/** One bot life: returns its report. */
function play(path, seed) {
  const rng = makeRng(seed * 7919 + path.length);
  let ch = freshHero(rng, path), w = null, p = null, seq = 0, sessions = 0;
  const R = { path, seed, levelAt: { 1: 0 }, deaths: 0, kills: 0, drops: { normal: 0, magic: 0, rare: 0, unique: 0, legendary: 0 }, gold: 0, potions: 0, sessions: 0, gsAt: {}, timeouts: 0 };
  const newSession = () => { w = createWorld({ seed: seed * 1000 + sessions++, content, zone: ZONE }); p = addPlayer(w, 'bot', ch); R.sessions++; };
  newSession();
  const steps = MINUTES * 60 / DT; let lastLevel = ch.level, stuckT = 0, lastPos = [p.x, p.z];
  for (let i = 0; i < steps; i++) {
    const t = i * DT;
    // --- decisions every 4 steps (a person is not frame-perfect)
    if (i % 4 === 0) brain(t);
    setInput(w, 'bot', { ...move, seq: ++seq });
    step(w);
    for (const e of w.events) {
      if (e.k === 'die' && e.s === 'bot' && w.foes.has(e.t)) R.kills++;
      if (e.k === 'dmg' && e.s === 'bot') R.dealt = (R.dealt || 0) + e.n;
      if (e.k === 'dmg' && e.t === 'bot') R.taken = (R.taken || 0) + e.n;
      if (e.k === 'die' && e.t === 'bot') { R.deaths++; if (process.env.TRACE) console.log('death', (t / 60).toFixed(1), 'by', w.foes.get(e.s)?.def.id, 'attackers', [...w.foes.values()].filter(f => !f.dead && f.target === 'bot').length, 'at', p.x.toFixed(0), p.z.toFixed(0), 'level', ch.level, ch.path); }
      if (e.k === 'drop' && e.to === 'bot' && e.what === 'item') R.drops[e.real]++;
    }
    w.events.length = 0;
    if (w.charDirty.has('bot')) { ch = p.char; w.charDirty.clear(); }
    if (ch.level !== lastLevel) { lastLevel = ch.level; R.levelAt[ch.level] = +(t / 60).toFixed(1); R.gsAt[ch.level] = sheet(ch, D).gearScore; }
    // a session is over when nothing is left alive near enough to matter
    if (i % 200 === 0 && ![...w.foes.values()].some(f => !f.dead)) { ch = p.char; newSession(); }
    if (i % 100 === 0) { if (Math.hypot(p.x - lastPos[0], p.z - lastPos[1]) < 0.5 && !p.target) stuckT += 5; else stuckT = 0; lastPos = [p.x, p.z]; if (stuckT > 60) { R.timeouts++; ch = p.char; newSession(); stuckT = 0; } }
  }
  if (process.env.TRACE) console.log('rest', path, 'minutes', ((R.rest || 0) / 60).toFixed(1), 'for health', ((R.restHp || 0) / 60).toFixed(1));
  if (process.env.TRACE) console.log('dmg', path, 'dealt', Math.round(R.dealt), 'taken', Math.round(R.taken), 'skills', JSON.stringify(ch.skills), 'attrs', JSON.stringify(ch.attrs), 'pts', ch.attrPoints);
  R.final = { level: ch.level, xp: ch.xp, gold: ch.gold, gearScore: sheet(ch, D).gearScore, path: ch.path, skills: Object.keys(ch.skills || {}).length };
  return R;

  // ---- the bot's mind --------------------------------------------------------------------------------------------------
  var move;
  function brain(t) {
    move = { mx: 0, mz: 0 };
    if (p.dead) { act(w, 'bot', { do: 'release' }); return; }
    // housekeeping: path, points, skills, gear, identify
    if (!ch.path && ch.level >= 3) act(w, 'bot', { do: 'path', path });
    if (ch.unspent > 0) act(w, 'bot', { do: 'spend', attr: ch.unspent % 5 === 0 ? 'vit' : MAIN[ch.path || 'wanderer'], n: 1 });
    if (ch.skillPoints > 0 && ch.path) { const opts = Object.values(S).filter(s => s.owner === ch.path && (rankOf(ch, s) < (s.maxRank || 1)) && ch.level >= (s.reqLevel || 1) && (s.prereq || []).every(x => ch.skills?.[x] > 0)); opts.sort((a, b) => (b.kind === 'active') - (a.kind === 'active') || rankOf(ch, a) - rankOf(ch, b)); if (opts[0]) act(w, 'bot', { do: 'learn', skill: opts[0].id }); }
    for (const it of ch.bag || []) {
      if (it.base === 'potion') { act(w, 'bot', { do: 'belt', uid: it.uid }); continue; }
      if (it.ided === false) { act(w, 'bot', { do: 'identify', uid: it.uid }); continue; }
      const slot = slotOf(it); if (!slot) continue;
      if (!canEquip(D, ch, it, slot, sheet(ch, D).attrs).ok) continue;
      if (!ch.equip?.[slot] || score(ch, it) > score(ch, ch.equip[slot]) + 0.5) act(w, 'bot', { do: 'equip', uid: it.uid, slot });
    }
    // drop the junk when the bag is near full (it would sell in town)
    if ((ch.bag || []).length > 14) { const junk = ch.bag.find(i => i.base !== 'potion' && i.rarity === 'normal'); if (junk) p.char = ch = { ...ch, gold: ch.gold + 2, bag: ch.bag.filter(i => i !== junk) }; }
    // potions
    if (p.hp < p.maxHp * 0.35 && !(p.fx || []).some(f => f.kind === 'hot')) { if (act(w, 'bot', { do: 'drink', kind: 'health' }).ok) R.potions++; }
    if (p.res === 'mana' && p.mana < p.maxMana * 0.2 && !(p.fx || []).some(f => f.kind === 'mot')) act(w, 'bot', { do: 'drink', kind: 'mana' });
    // loot within reach
    for (const g of w.ground?.values() || []) if (g.owner === 'bot' && !g.gold && Math.hypot(g.x - p.x, g.z - p.z) < 3) { if (g.gold) R.gold += g.gold; act(w, 'bot', { do: 'pickup', gid: g.gid }); }
    // rest after a respawn or a hard fight: nothing hunting us and health low -> stand still and let it come back
    const hunted = [...w.foes.values()].some(f => !f.dead && f.target === 'bot' && (f.state === 'chase' || f.state === 'attack'));
    if (!hunted && (p.hp < p.maxHp * 0.6 || ((ch.path === 'mage' || ch.path === 'healer') && p.mana < p.maxMana * 0.3))) { R.rest = (R.rest || 0) + 4 * DT; if (p.hp < p.maxHp * 0.6) R.restHp = (R.restHp || 0) + 4 * DT; p.target = null; p.autoOn = false; return; }
    // fight: the target, else the nearest living foe, else loot, else wander toward the nearest foe anywhere
    let tg = p.target && w.foes.get(p.target);
    if (!tg || tg.dead) { tg = nearest([...w.foes.values()].filter(f => !f.dead && (f.state === 'chase' || f.state === 'attack') && f.target === 'bot')) || nearest([...w.foes.values()].filter(f => !f.dead)); if (tg) act(w, 'bot', { do: 'target', target: tg.id }); }
    const loot = nearest([...(w.ground?.values() || [])].filter(g => g.owner === 'bot' && !g.gold));
    const fighting = tg && (tg.state === 'chase' || tg.state === 'attack');
    if (loot && !fighting && Math.hypot(loot.x - p.x, loot.z - p.z) < 20) return goTo(loot.x, loot.z);
    if (!tg) return;
    const d = Math.hypot(tg.x - p.x, tg.z - p.z), reach = p.weapon.reach + tg.r + p.r - 0.3;
    const caster = ch.path === 'mage' || ch.path === 'healer';          // a Wanderer fights up close whatever it will become
    if (caster && d > 16) goTo(tg.x, tg.z); else if (!caster && d > reach) goTo(tg.x, tg.z);
    act(w, 'bot', { do: 'use', skill: 'attack', target: tg.id });
    // skills: heal self when low (healer / field mend), else the first usable damage skill on the bar
    const bar = (ch.bar?.length ? ch.bar : ['sure_strike', 'spark', 'field_mend', 'shove']).filter(Boolean);
    const heal = bar.find(id => S[id]?.effects?.some(e => e.do === 'heal' || e.do === 'hot' || e.do === 'shield'));
    if (heal && p.hp < p.maxHp * 0.55) { act(w, 'bot', { do: 'use', skill: heal, target: 'bot' }); return; }
    if (!caster && d > reach + 1) return;           // walk in before spending anything
    for (const id of bar) { const s = S[id]; if (!s || s.target === 'ally') continue; if (s.effects?.some(e => e.do === 'mark' || e.do === 'dot') && (tg.fx || []).some(f => String(f.id).startsWith(id + ':'))) continue; const r = act(w, 'bot', { do: 'use', skill: id, target: tg.id, at: { x: tg.x, z: tg.z } }); if (r.ok) break; }
  }
  function nearest(list) { let b = null, bd = Infinity; for (const x of list) { const d = Math.hypot(x.x - p.x, x.z - p.z); if (d < bd) { bd = d; b = x; } } return b; }
  function goTo(x, z) {
    // round cliffs and water on the walk grid, like a player's click-to-move
    if (!clearLine(w.area, p.x, p.z, x, z, 0.4)) { const n = downhill(w, flowTo(w, x, z, 2), p.x, p.z); if (n) { x = n[0]; z = n[1]; } }
    const dx = x - p.x, dz = z - p.z, l = Math.hypot(dx, dz) || 1; move = { mx: dx / l, mz: dz / l };
  }
}

const runs = [];
const t0 = Date.now();
for (const path of PATHS) for (let s = 1; s <= SEEDS; s++) runs.push(play(path, s));
// ---- report ------------------------------------------------------------------------------------------------------------
const hours = MINUTES / 60;
console.log(`\nRogueloot balance bot — ${PATHS.join(', ')} · ${SEEDS} seed(s) each · ${MINUTES} min of play in ${ZONE} · ran in ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
const avg = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
for (const path of PATHS) {
  const rs = runs.filter(r => r.path === path);
  const lv = avg(rs.map(r => r.final.level)), dph = avg(rs.map(r => r.deaths)) / hours, kph = avg(rs.map(r => r.kills)) / hours;
  const rares = avg(rs.map(r => r.drops.rare + r.drops.unique + r.drops.legendary)) / hours;
  const lvlMins = []; for (const r of rs) for (const [L, m] of Object.entries(r.levelAt)) if (L > 1) lvlMins.push({ L: +L, m });
  console.log(`${path.padEnd(8)} level ${lv.toFixed(1)}  deaths/h ${dph.toFixed(1)}  kills/h ${kph.toFixed(0)}  rare+/h ${rares.toFixed(2)}  potions/h ${(avg(rs.map(r => r.potions)) / hours).toFixed(1)}  gold ${avg(rs.map(r => r.final.gold)).toFixed(0)}  gear score ${avg(rs.map(r => r.final.gearScore)).toFixed(1)}  sessions ${avg(rs.map(r => r.sessions)).toFixed(1)}  stuck-restarts ${avg(rs.map(r => r.timeouts)).toFixed(1)}`);
  const by = {}; for (const x of lvlMins) (by[x.L] ||= []).push(x.m);
  console.log('         reached level at (minutes): ' + Object.entries(by).map(([L, ms]) => `${L}:${avg(ms).toFixed(0)}`).join('  '));
}
const out = arg('json', null); if (out) writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), minutes: MINUTES, zone: ZONE, runs }, null, 1));
