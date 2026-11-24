// The play HUD (DOM over the 3D view): your frame (health with barrier, mana, stamina, buffs and debuffs with timers),
// the party, the target frame, the action bar (icons, the key on every button for the device in use, cooldown sweeps,
// not-enough-mana dim), the XP bar and the glowing Level up button, the quest tracker, the minimap, the crosshair and
// the interact prompt under it, damage numbers and name tags, the log, the downed/respawn panel, and the window
// buttons. Text is only rewritten when it changes (lessons H3: a HUD rewriting itself every frame stutters).
// Bars that come and go float over the play area and never push it (rule 68). Corner buttons own their corner.
import { fmt, hp as fmtHp, secs } from '../../../../../shared/format.js';
import { castRow, spellSources } from '../../rules/classes.js';
import { xpToReach } from '../../rules/levels.js';
import { questLog } from '../../world/quests.js';
import { esc } from '../ui/kit.js';
import { tipAttrs } from '../ui/tip.js';
import { uiIcon, glyph, spellIcon } from '../ui/icons.js';
import { hintFor } from '../input/bindings.js';
import { createMinimap } from './minimap.js';

const set = (el, prop, v) => { if (el && el[prop] !== v) el[prop] = v; };
const width = (el, k) => { const v = `${Math.max(0, Math.min(1, k)) * 100}%`; if (el && el.style.width !== v) el.style.width = v; };

export function createHud(app, play) {
  const root = document.getElementById('hud');
  root.innerHTML = `
  <div class="hud-me" data-hud="me">
    <div class="hud-name"><b class="hud-me-name"></b><span class="hud-me-level"></span></div>
    <div class="hud-bar hud-hp"><i class="hud-fill"></i><i class="hud-barrier"></i><span></span></div>
    <div class="hud-bar hud-mp"><i class="hud-fill"></i><span></span></div>
    <div class="hud-bar hud-st"><i class="hud-fill"></i><span></span></div>
    <div class="hud-auras" data-auras="me"></div>
  </div>
  <div class="hud-party"></div>
  <div class="hud-target" hidden>
    <div class="hud-name"><b class="hud-tg-name"></b><span class="hud-tg-level"></span></div>
    <div class="hud-bar hud-hp"><i class="hud-fill"></i><span></span></div>
    <div class="hud-auras" data-auras="target"></div>
  </div>
  <button type="button" class="hud-menu" data-act="menu" aria-label="Menu">${uiIcon("menu", 26)}</button>
  <div class="hud-mini"><canvas width="168" height="168" aria-label="Minimap"></canvas><div class="hud-mini-place"></div></div>
  <div class="hud-tracker"></div>
  <div class="hud-cross" aria-hidden="true"><i></i><i></i><i></i><i></i><b></b></div>
  <div class="hud-prompt" hidden></div>
  <div class="hud-cast" hidden><i></i><span></span></div>
  <div class="hud-bottom">
    <button type="button" class="hud-levelup" data-act="levelup" hidden></button>
    <div class="hud-xp"><i></i><span></span></div>
    <div class="hud-bar-row"><div class="hud-slots"></div></div>
  </div>
  <div class="hud-wins"></div>
  <div class="hud-log" aria-live="polite"></div>
  <div class="hud-down" hidden></div>
  <div class="hud-plates" aria-hidden="true"></div>
  <div class="hud-nums" aria-hidden="true"></div>
  <div class="hud-net" hidden></div>`;
  const $ = s => root.querySelector(s);
  const el = {
    meName: $('.hud-me-name'), meLevel: $('.hud-me-level'), hp: $('.hud-me .hud-hp .hud-fill'), barrier: $('.hud-me .hud-barrier'), hpT: $('.hud-me .hud-hp span'),
    mp: $('.hud-me .hud-mp .hud-fill'), mpT: $('.hud-me .hud-mp span'), st: $('.hud-me .hud-st .hud-fill'), stT: $('.hud-me .hud-st span'),
    meAuras: $('[data-auras="me"]'), party: $('.hud-party'), target: $('.hud-target'), tgName: $('.hud-tg-name'), tgLevel: $('.hud-tg-level'),
    tgHp: $('.hud-target .hud-fill'), tgHpT: $('.hud-target .hud-hp span'), tgAuras: $('[data-auras="target"]'),
    tracker: $('.hud-tracker'), prompt: $('.hud-prompt'), cast: $('.hud-cast'), slots: $('.hud-slots'), xp: $('.hud-xp i'), xpT: $('.hud-xp span'),
    levelup: $('.hud-levelup'), wins: $('.hud-wins'), log: $('.hud-log'), down: $('.hud-down'), plates: $('.hud-plates'), nums: $('.hud-nums'), cross: $('.hud-cross'),
    net: $('.hud-net'), miniPlace: $('.hud-mini-place'),
  };
  root.querySelector('[data-act="menu"]').onclick = () => app.openWindow('menu', { where: 'play' });
  el.levelup.onclick = () => app.openWindow('levelup');
  for (const n of root.querySelectorAll('button')) n.style.pointerEvents = 'auto';
  const minimap = createMinimap(app, root.querySelector('.hud-mini canvas'));

  // ---- window buttons (bottom right; on phones they live in the ☰ menu)
  const WINS = [['bag', 'bag', 'Bag'], ['sheet', 'sheet', 'Character'], ['classes', 'skills', 'Classes'], ['talents', 'perks', 'Talents'], ['spellbook', 'journal', 'Spellbook'], ['quests', 'callboard', 'Quests'], ['map', 'map', 'Map']];
  function drawWins() {
    el.wins.innerHTML = WINS.map(([id, ic, name]) => `<button type="button" class="hud-win-btn" data-win="${id}" ${tipAttrs('text', { title: name, text: hintFor(app.bindings, id, app.device) ? `Key: ${hintFor(app.bindings, id, app.device)}` : name })} aria-label="${name}">${uiIcon(ic, 24)}<span class="hud-key">${esc(hintFor(app.bindings, id, app.device))}</span></button>`).join('');
    for (const b of el.wins.querySelectorAll('[data-win]')) b.onclick = () => app.openWindow(b.dataset.win);
  }
  drawWins();

  // ---- the action bar (8 slots): the key on each for the device in use (rule 18)
  let barKey = '';
  function drawBar() {
    const c = app.me?.char; if (!c) return;
    const bar = [...(c.bar || [])]; while (bar.length < 8) bar.push(null);
    const k = JSON.stringify([bar, app.device, app.bindings]);
    if (k === barKey) return;
    barKey = k;
    const known = spellSources(app.rules, c);
    el.slots.innerHTML = bar.map((s, i) => {
      const hint = hintFor(app.bindings, `slot${i + 1}`, app.device);
      if (!s) return `<button type="button" class="hud-slot empty" data-slot="${i}" aria-label="Empty slot ${i + 1}"><span class="hud-key">${esc(hint)}</span></button>`;
      const src = known[s];
      return `<button type="button" class="hud-slot" data-slot="${i}" data-spell="${esc(s)}" ${tipAttrs('spell', { id: s })} aria-label="Spell ${i + 1}">${spellIcon(s, 44, { cls: src?.cls })}<i class="hud-cd"></i><b class="hud-cd-t"></b><span class="hud-key">${esc(hint)}</span></button>`;
    }).join('');
    for (const b of el.slots.querySelectorAll('[data-slot]')) {
      b.addEventListener('pointerdown', e => { e.preventDefault(); if (!b.dataset.spell) { app.openWindow('spellbook', { slot: +b.dataset.slot }); return; } play.slotDown(+b.dataset.slot, 'touch'); });
      b.addEventListener('pointerup', () => play.slotUp(+b.dataset.slot));
      b.addEventListener('pointerleave', () => play.slotUp(+b.dataset.slot, { cancel: false }));
    }
  }

  // ---- auras row
  function drawAuras(box, list, unitId) {
    const rows = list || [];
    const k = rows.map(a => `${a.id}:${a.s}:${a.k}`).join('|');
    if (box.dataset.k !== k) {
      box.dataset.k = k;
      box.innerHTML = rows.slice(0, 14).map(a => `<span class="hud-aura ${a.k}" ${tipAttrs('aura', { unit: unitId, id: a.id })}><b>${esc(abbr(a.n))}</b>${a.s > 1 ? `<i>${fmt(a.s)}</i>` : ''}<small></small></span>`).join('');
    }
    [...box.children].forEach((n, i) => { const a = rows[i]; if (a) set(n.querySelector('small'), 'textContent', a.r > 3600 ? '' : a.r >= 60 ? `${Math.ceil(a.r / 60)}m` : `${Math.ceil(a.r)}`); });
  }
  const abbr = n => { const w = String(n || '').split(/\s+/); return (w.length > 1 ? w[0][0] + w[1][0] : String(n).slice(0, 2)).toUpperCase(); };

  // ---- damage numbers and name tags (pools of DOM nodes moved with transforms)
  const nums = [];
  function number(x, y, z, text, kind) {
    if (!app.settings.numbers) return;
    let n = nums.find(m => !m.busy);
    if (!n) { if (nums.length > 40) n = nums.reduce((a, b) => (a.t > b.t ? a : b)); else { const d = document.createElement('div'); d.className = 'hud-num'; el.nums.append(d); n = { d }; nums.push(n); } }
    n.busy = true; n.t = 0; n.x = x; n.y = y; n.z = z; n.dx = (Math.random() - 0.5) * 30;
    n.d.className = `hud-num ${kind}`; n.d.textContent = text; n.d.hidden = false;
  }
  const plates = new Map();
  function plate(id) {
    let p = plates.get(id);
    if (!p) { const d = document.createElement('div'); d.className = 'hud-plate'; d.innerHTML = '<b></b><i><s></s></i>'; el.plates.append(d); p = { d, name: d.querySelector('b'), bar: d.querySelector('s'), barBox: d.querySelector('i'), k: '' }; plates.set(id, p); }
    return p;
  }

  // ---- log
  const logLines = [];
  // The message log: newest at the bottom, each line fades after LOG_FADE_MS and leaves at LOG_GONE_MS; the panel
  // hides when empty. A place that is also a shrine is announced once (the server says "Found: X" and "Shrine found: X").
  const LOG_FADE_MS = 12000, LOG_GONE_MS = 14000;
  function drawLog() {
    const now = performance.now();
    while (logLines.length && now - logLines[0].at > LOG_GONE_MS) logLines.shift();
    el.log.innerHTML = logLines.map(l => `<p class="${l.kind}${now - l.at > LOG_FADE_MS ? ' old' : ''}">${esc(l.text)}</p>`).join('');
    el.log.hidden = !logLines.length;
  }
  function log(text, kind = 'info') {
    const now = performance.now();
    const named = t => (t.match(/^(?:Shrine found|Found): ([^.]+)/) || [])[1];
    const name = named(text);
    if (name && logLines.some(l => now - l.at < 4000 && named(l.text) === name && l.text.length >= text.length)) return;
    if (name) for (let i = logLines.length - 1; i >= 0; i--) if (now - logLines[i].at < 4000 && named(logLines[i].text) === name) logLines.splice(i, 1);
    logLines.push({ text, kind, at: now });
    if (logLines.length > 6) logLines.shift();
    drawLog();
    setTimeout(drawLog, LOG_FADE_MS + 50); setTimeout(drawLog, LOG_GONE_MS + 50);
  }

  let slow = 0, lastTrack = '';
  const hud = {
    root, number, log, drawBar, minimap, drawWins,
    /** Every frame. `S` = the play state (units, me, target …), `cam` = the camera. */
    update(dt, S, project) {
      const me = S.meUnit, c = app.me?.char;
      // name tags + damage numbers follow the 3D world every frame
      for (const n of nums) {
        if (!n.busy) continue;
        n.t += dt;
        const p = project(n.x, n.y + 2.1 + n.t * 1.2, n.z);
        if (!p || n.t > 1.1) { n.busy = false; n.d.hidden = true; continue; }
        n.d.style.transform = `translate(${Math.round(p.x + n.dx * n.t)}px, ${Math.round(p.y)}px) translate(-50%, -50%) scale(${n.t < 0.12 ? 1.35 - n.t * 2.5 : 1})`;
        n.d.style.opacity = String(Math.min(1, (1.1 - n.t) * 2.5));
      }
      const seen = new Set();
      if (app.settings.names !== false) {
        const placed = [];
        for (const t of S.tags) {
          const p = project(t.x, t.y + t.h + 0.35, t.z);
          if (!p) continue;
          let y = p.y;
          for (const q of placed) if (Math.abs(q.x - p.x) < 90 && Math.abs(q.y - y) < 18) y = q.y - 18;   // declutter: stack instead of overlap
          placed.push({ x: p.x, y });
          seen.add(t.id);
          const P = plate(t.id);
          const k = `${t.name}|${t.cls}`;
          if (P.k !== k) { P.k = k; P.name.textContent = t.name; P.d.className = `hud-plate ${t.cls}`; }
          P.barBox.hidden = t.hp == null;
          if (t.hp != null) width(P.bar, t.hp);
          P.d.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
          P.d.hidden = false;
        }
      }
      for (const [id, P] of plates) if (!seen.has(id)) { P.d.hidden = true; if (!S.units.has(id) && !String(id).startsWith('npc:')) { P.d.remove(); plates.delete(id); } }
      minimap.draw(S);
      slow += dt;
      if (slow < 0.066) return;                         // text and bars ~15 times a second
      slow = 0;
      if (!me || !c) return;
      set(el.meName, 'textContent', c.name);
      set(el.meLevel, 'textContent', `Level ${c.level}`);
      width(el.hp, me.hp / Math.max(1, me.mh)); width(el.barrier, (S.barrier || 0) / Math.max(1, me.mh));
      set(el.hpT, 'textContent', `${fmtHp(me.hp)} / ${fmtHp(me.mh)}`);
      width(el.mp, me.mp / Math.max(1, me.mm)); set(el.mpT, 'textContent', `${fmtHp(me.mp)} / ${fmtHp(me.mm)}`);
      width(el.st, me.st / Math.max(1, me.ms)); set(el.stT, 'textContent', `${fmtHp(me.st)} / ${fmtHp(me.ms)}`);
      drawAuras(el.meAuras, S.auras.get(me.id), me.id);
      // party
      const party = [...S.units.values()].filter(u => u.info.k === 'player' && u.id !== me.id);
      const pk = party.map(u => u.id).join(',');
      if (el.party.dataset.k !== pk) { el.party.dataset.k = pk; el.party.innerHTML = party.map(u => `<div class="hud-pm" data-id="${esc(u.id)}"><b>${esc(u.info.n)}</b><span></span><div class="hud-bar hud-hp sm"><i class="hud-fill"></i></div></div>`).join(''); }
      for (const u of party) { const n = el.party.querySelector(`[data-id="${CSS.escape(u.id)}"]`); if (!n) continue; width(n.querySelector('.hud-fill'), u.hp / Math.max(1, u.info.mh)); set(n.querySelector('span'), 'textContent', u.downed ? 'Fallen' : `Level ${u.info.lv}`); n.classList.toggle('down', !!u.downed); }
      // target
      const tg = S.target && S.units.get(S.target);
      el.target.hidden = !tg;
      if (tg) {
        set(el.tgName, 'textContent', tg.info.n);
        set(el.tgLevel, 'textContent', `Level ${tg.info.lv}${tg.info.rank && tg.info.rank !== 'normal' ? ` · ${{ boss: 'Boss', champion: 'Champion', elite: 'Elite' }[tg.info.rank] || ''}` : ''}`);
        el.target.className = `hud-target ${tg.hostile ? 'foe' : 'friend'} ${tg.info.rank || ''}`;
        width(el.tgHp, tg.hp / Math.max(1, tg.info.mh)); set(el.tgHpT, 'textContent', `${fmtHp(tg.hp)} / ${fmtHp(tg.info.mh)}`);
        drawAuras(el.tgAuras, S.auras.get(tg.id), tg.id);
      }
      // action bar: cooldowns + mana
      drawBar();
      const known = spellSources(app.rules, c);
      for (const b of el.slots.querySelectorAll('[data-spell]')) {
        const id = b.dataset.spell, cd = S.cooldowns[id] || 0;
        let row = null; try { row = known[id] ? castRow(app.rules, c, id) : null; } catch { row = null; }
        const total = row?.cooldown || 1;
        b.querySelector('.hud-cd').style.height = `${Math.min(1, cd / total) * 100}%`;
        set(b.querySelector('.hud-cd-t'), 'textContent', cd > 0.05 ? (cd >= 10 ? fmt(Math.ceil(cd)) : secs(cd)) : '');
        b.classList.toggle('nomana', !!row && me.mp < row.mp);
        b.classList.toggle('aiming', S.aimingSlot === +b.dataset.slot);
      }
      // xp and level up
      const next = xpToReach(app.rules, c.level + 1), prev = xpToReach(app.rules, c.level);
      width(el.xp, next ? (c.xp - prev) / Math.max(1, next - prev) : 1);
      set(el.xpT, 'textContent', next ? `${fmt(c.xp)} / ${fmt(next)} experience` : 'Highest level for now');
      const pend = app.me?.pending || 0;
      el.levelup.hidden = !pend;
      if (pend) set(el.levelup, 'innerHTML', `${glyph('level', 18)}<span>Level up${pend > 1 ? ` (${pend})` : ''}</span><span class="hud-key">${esc(hintFor(app.bindings, 'levelup', app.device))}</span>`);
      // quest tracker: tracked quests, else the main quest + the newest active ones
      if (app.ws && app.W) {
        const wsLike = { quests: app.ws.quests || {}, flags: app.ws.flags || [], playerFlags: { [c.id]: app.ws.my || [] } };
        const L = questLog(app.W.book, wsLike, { playerId: c.id, level: c.level, flags: app.me?.flags || [] });
        const tracked = app.settings.tracked;
        const list = [...L.ready, ...L.active].filter(q => !tracked?.length || tracked.includes(q.id)).slice(0, 4);
        const k = JSON.stringify(list.map(q => [q.id, q.progress, q.steps.find(s => s.current)?.text, q.status]));
        if (k !== lastTrack) {
          lastTrack = k;
          el.tracker.innerHTML = list.length ? `<h4>Quests</h4>${list.map(q => `<div class="hud-q ${q.kind}"><b>${esc(q.title)}</b><span>${esc(q.status === 'ready' ? `Return to ${q.turnIn?.name || 'the quest giver'}` : q.steps.find(s => s.current)?.text || '')}</span>${q.progress ? `<em>${esc(q.progress)}</em>` : ''}</div>`).join('')}` : '';
          S.questMarkers = [...L.ready, ...L.active].map(q => q.marker && { ...q.marker, title: q.title, main: q.kind === 'main' }).filter(Boolean);
        }
      }
      // place name under the minimap
      const place = S.placeName || '';
      set(el.miniPlace, 'textContent', place);
      // interact prompt (under the crosshair, never on it)
      const it = S.interact;
      el.prompt.hidden = !it;
      if (it) set(el.prompt, 'innerHTML', `<span class="hud-key">${esc(hintFor(app.bindings, 'interact', app.device) || 'Tap')}</span> ${esc(it.text)}${it.progress != null ? `<i style="--k:${Math.round(it.progress * 100)}%"></i>` : ''}`);   // lint-ok: a computed progress number
      // channel / revive bar
      // downed panel
      const down = me.downed;
      el.down.hidden = !down;
      if (down) {
        const left = S.downLeft ?? 0;
        set(el.down, 'innerHTML', `<h3>You have fallen</h3><p>${left > 0 ? `A friend can bring you back for ${fmt(Math.ceil(left))} more seconds.` : 'Nobody came in time.'}</p><button type="button" class="ow-btn ow-primary" data-act="respawn">${glyph('shrine', 18)} Wake at the shrine</button><p class="ow-dim">It costs a little gold and wear on your gear.</p>`);
        const b = el.down.querySelector('[data-act="respawn"]'); if (b) { b.style.pointerEvents = 'auto'; b.onclick = () => app.act('respawn'); }
      }
      // connection
      const st = app.net?.state;
      el.net.hidden = st === 'open';
      if (st !== 'open') set(el.net, 'textContent', 'Connection lost — reconnecting…');
    },
    crosshair(kind) { el.cross.className = `hud-cross ${kind || ''}`; },
    castBar(name, k) { el.cast.hidden = k == null; if (k != null) { set(el.cast.querySelector('span'), 'textContent', name); el.cast.querySelector('i').style.width = `${Math.round(k * 100)}%`; } },
    destroy() { root.innerHTML = ''; minimap.destroy?.(); },
  };
  return hud;
}
