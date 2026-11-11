// Rogueloot page: title -> game. Solo runs the room code in a Worker; online talks to the room server. Either way the
// page sends inputs and draws snapshots, predicting its own walking with the SAME rule the sim uses (js/sim/move.js).
import { createScene, buildArea as buildTestArea } from './scene.js';
import { createActors } from './actors.js';
import { createInput } from './input.js';
import { createTouch, isTouch } from './touch.js';
import { openSolo, openOnline, serverAvailable } from './link.js';
import { createMenu, openReport, news, credits, openWelcome } from './menu.js';
import { testField } from '../sim/area.js';
import { buildArea } from '../world/zone.js';
import { buildZoneView } from './zone-view.js';
import { walk, PLAYER_RADIUS, WALK_SPEED } from '../sim/move.js';
import { clearLine, flowTo, downhill } from '../sim/paths.js';
import { DT } from '../sim/world.js';
import { createHeroes } from './heroes.js';
import { createFoes } from './foes.js';
import { createHud } from './hud.js';
import { createFx } from './fx.js';
import { createSheetUI } from './sheet-ui.js';
import { createSkillsUI } from './skills-ui.js';
import { createTravelUI } from './travel-ui.js';
import { createGuideView } from './guide-view.js';
import { createTownUI } from './town-ui.js';
import { createPartyUI } from './party-ui.js';
import { activeStep, questKey } from '../sim/quests.js';
import { randomLook } from '../../../knockabout/js/client/look.js';
import { makeRng, hashStr } from '../sim/rng.js';
import { createGround } from './ground.js';
import { play, LOOT_SOUND, soundFor, ambience, setVolume, getVolume } from './sound.js';
import { maybeRate, tally } from './rate.js';
import { createPadNav } from './padnav.js';
import { loadContentAsync } from '../sim/content.js';
import { cleanCode } from '../net/protocol.js';
import { qrSvg, joinUrl } from '../../../tumblefair/js/client/qr.js';

const $ = s => document.querySelector(s);
const store = { get(k, d) { try { const v = localStorage.getItem('rogueloot.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('rogueloot.' + k, JSON.stringify(v)); } catch { /* private */ } } };
const ONLINE = serverAvailable();
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
document.body.classList.toggle('no-server', !ONLINE);

const quality = store.get('quality', isTouch() ? 'low' : 'high');
const view = createScene($('#view'), { quality });
const actors = createActors(view, $('#tags'));
const content = await loadContentAsync(f => fetch(new URL('../../data/' + f, import.meta.url)).then(r => r.json()));
const foes = createFoes(view, $('#tags'), { content });
const fx = createFx(view);
const ground = createGround(view, $('#tags'), { onPick: (gid, x, z) => goAndDo(x, z, { t: 'act', do: 'pickup', gid }), onOpen: (id, x, z) => goAndDo(x, z, { t: 'act', do: 'open', id }) });
/** Walk to a spot and then send an action (click a drop or a chest from further away). Any manual move cancels it. */
function goAndDo(x, z, msg, reach = 2.6) {
  const me = actors.get(G.me); if (!me) return;
  if (Math.hypot(me.x - x, me.z - z) < reach + 0.2) { G.link?.send(msg); return; }
  G.goto = { x, z, msg, reach };
}
// ---- click to move (desktop, like the old action RPGs): walk round things on the same walk grid the monsters use ----
const pathW = { area: null, time: 0, _flows: new Map() };
const ray = new view.THREE.Raycaster(), plane = new view.THREE.Plane(new view.THREE.Vector3(0, 1, 0), 0), hitP = new view.THREE.Vector3();
function walkToward(a) {
  const g = G.goto;
  if (g.target) { const f = foes.get(g.target); if (!f || f.st === 'dead') { G.goto = null; return [0, 0]; } g.x = f.x; g.z = f.z; }
  const d = Math.hypot(g.x - a.x, g.z - a.z), reach = g.reach ?? 0.35;
  if (d <= reach) { if (g.msg) G.link.send(g.msg); if (g.use) setTimeout(() => travelUI.use(), 60); if (!G.mouseHeld || g.msg || g.use) G.goto = null; return [0, 0]; }
  let tx = g.x, tz = g.z;
  if (G.area && !clearLine(G.area, a.x, a.z, tx, tz, 0.4)) {
    if (pathW.area !== G.area) { pathW.area = G.area; pathW._flows = new Map(); }
    pathW.time = performance.now() / 1000;
    const n = downhill(pathW, flowTo(pathW, tx, tz, 1.5), a.x, a.z); if (n) { tx = n[0]; tz = n[1]; }
  }
  const l = Math.hypot(tx - a.x, tz - a.z) || 1; return [(tx - a.x) / l, (tz - a.z) / l];
}
const meleeReach = () => { const b = content.items?.bases?.[heroes.current()?.equip?.weapon?.base]; return b?.ranged ? 20 : 2.1; };
const heroes = createHeroes({ root: $('#heroes'), onChange: () => {}, items: content.items });
const sheetUI = createSheetUI({ onSkills: () => skillsUI.toggle(true), potions: content.potions, currency: content.currency, items: content.items, send: a => G.link?.send({ t: 'act', ...a }), getChar: () => heroes.current() });
const skillsUI = createSkillsUI({ content, send: a => G.link?.send({ t: 'act', ...a }), getChar: () => heroes.current() });
const sendAct = a => G.link?.send({ t: 'act', ...a });
const townUI = createTownUI({ content, send: sendAct, getChar: () => heroes.current() });
const guide = createGuideView(view);
const travelUI = createTravelUI({ view, content, labelRoot: $('#tags'), send: sendAct, getChar: () => heroes.current(), getMe: () => actors.get(G.me), getArea: () => G.area, getDifficulty: () => G.difficulty,
  onNpc: (id) => { if (id === 'stash') townUI.openStash(); else if (id === 'elder') { const q = activeStep(content, heroes.current() || {}, G.difficulty); if (q) showQuest(q.name, q.text); else showQuest('The coast is safe', 'For now. Rest in Brightwater, hero.'); } else sendAct({ do: 'shop', npc: id }); } });
const partyUI = createPartyUI({ content, send: sendAct, getChar: () => heroes.current(), zoneName: id => content.zones?.[id]?.name || id || '' });
const hud = createHud($('#fight'), { skills: content.skills, isTouch: isTouch(), onUse: id => useSkill(id), onTargetNext: () => targetNext(), onRelease: () => G.link?.send({ t: 'act', do: 'release' }), onBag: () => sheetUI.toggle(), onDrink: kind => G.link?.send({ t: 'act', do: 'drink', kind }),
  quest: ch => { const q = activeStep(content, ch, G.difficulty); if (!q) return null; const r = q.rule || {}; const n = ch[questKey(G.difficulty)]?.[q.id]?.n || 0; return { name: q.name, hint: guide.target?.hint || '', progress: r.kind === 'kill' ? `Defeat foes in ${content.zones?.[r.node]?.name || r.node}: ${n} / ${r.n}` : r.kind === 'boss' ? `Defeat ${content.monsters?.[r.boss]?.name || 'the boss'}` : r.kind === 'reach' ? `Reach ${content.zones?.[r.to]?.name || content.acts?.[0]?.nodes?.find(x => x.id === r.to)?.name || r.to}` : '' }; } });
const input = createInput();
const touch = createTouch($('#touch'), input);

// ---- title -----------------------------------------------------------------------------------------------------------

$('#news-slot').append(news.button({ label: "What's new" }));
$('#credits').onclick = () => credits.open();
const character = () => heroes.current();
const titleMsg = t => { $('#title-msg').textContent = t || ''; };

// ---- the game --------------------------------------------------------------------------------------------------------
const G = { link: null, lobby: null, me: null, host: null, isPublic: false, area: null, areaGroup: null, code: null, seq: 0, pending: [], acc: 0, lastSnap: 0, roster: new Map(), ping: null, retry: null };
const wantCode = cleanCode(new URLSearchParams(location.search).get('code'));
if (wantCode.length === 4 && ONLINE) $('#code').value = wantCode;

/** The online link: opened at load (so a seat kept for this browser is offered back at once) and reused for every game. */
function online() {
  if (G.lobby && G.lobby.alive) return G.lobby;
  const link = openOnline(); link.alive = true; link.on = onMessage;
  link.ready.catch(e => titleMsg(e.message));
  G.lobby = link;
  return link;
}
function start(link, first) {
  titleMsg('');
  if (!heroes.current()) { titleMsg('Create a hero first.'); return; }
  G.link = link; link.on = onMessage;
  link.ready.then(() => link.send(first)).catch(e => titleMsg(e.message));
}
const wantZone = new URLSearchParams(location.search).get('zone');
const diffOf = () => $('#difficulty').value || 'normal';
function refreshDifficulty() {
  const ch = heroes.current(), have = ch?.difficulties || ['normal'], T = content.difficulty?.tiers || {};
  $('#difficulty').innerHTML = Object.entries(T).filter(([id]) => have.includes(id)).map(([id, t]) => `<option value="${id}">${t.name}</option>`).join('');
  $('.diff-row').hidden = have.length < 2;
}
setInterval(refreshDifficulty, 1500); refreshDifficulty();
$('#solo').onclick = () => start(openSolo(), { t: 'create', difficulty: diffOf(), character: character(), ...(wantZone ? { zone: wantZone } : {}) });
$('#host').onclick = () => start(online(), { t: 'create', difficulty: diffOf(), public: $('#host-public').checked, character: character() });
$('#join').onclick = () => { const code = cleanCode($('#code').value); if (code.length !== 4) return titleMsg('Type the 4-letter code.'); start(online(), { t: 'join', code, character: character() }); };
$('#code').addEventListener('keydown', e => { if (e.key === 'Enter') $('#join').click(); });
$('#find').onclick = () => { const l = online(); G.link = l; l.ready.then(() => l.send({ t: 'list' })); };
if (ONLINE) online();

function onMessage(m) {
  if (m.t === 'err') { titleMsg(m.msg); if (G.me == null && G.link?.kind === 'solo') { G.link.close(); G.link = null; } return; }
  if (m.t === 'resume') { if (!G.me) start(online(), { t: 'join', code: m.code, character: character() }); return; }
  if (m.t === 'joined') return enterGame(m);
  if (m.t === 'snap') { if (m.area && G.area && m.area !== G.area.id) return; return onSnap(m); }
  if (m.t === 'area') { showArea(m.area, m.seed); townUI.close(); travelUI.closeMap(); return; }
  if (m.t === 'left') { actors.remove(m.id); return; }
  if (m.t === 'roster') { G.roster = new Map(m.players.map(p => [p.id, p])); partyUI.setRoster(m.players, G.me); G.host = m.host; G.isPublic = m.public; for (const p of m.players) actors.get(p.id)?.tag.classList.toggle('away', !!p.away); refreshInvite(); return; }
  if (m.t === 'list') return showList(m.rooms);
  if (m.t === 'nope') return hud.nope(m.msg);
  if (m.t === 'char') { const cur = heroes.current(); if (cur && m.character?.id === cur.id) { heroes.save({ ...cur, ...m.character }); sheetUI.refresh(); skillsUI.check(heroes.current()); if (townUI.open) townUI.refresh(); } return; }
  if (m.t === 'pong') { G.ping = performance.now() - m.at; return; }
  if (m.t === 'removed') { leaveGame(); titleMsg(m.msg); return; }
  if (m.t === 'closed') {
    if (G.lobby) G.lobby.alive = false;
    if (G.me && G.code) reconnect();
    else if (G.me) { leaveGame(); titleMsg('Lost the connection to the game.'); }
  }
}
/** The socket dropped mid-game: the server keeps our seat for 90 s, so keep knocking until we are back in it. */
function reconnect() {
  if (G.retry) return;
  const code = G.code, until = performance.now() + 85_000;
  banner('Reconnecting…');
  G.retry = setInterval(() => {
    if (G.lobby?.alive && G.me && G.link === G.lobby) return;
    if (performance.now() > until) { clearInterval(G.retry); G.retry = null; banner(null); leaveGame(); titleMsg('Lost the connection to the game.'); return; }
    const l = online(); G.link = l; l.ready.then(() => l.send({ t: 'join', code, character: character() })).catch(() => {});
  }, 2500);
}
function banner(text) { let b = $('#banner'); if (!b) { b = document.createElement('div'); b.id = 'banner'; document.body.append(b); } b.textContent = text || ''; b.hidden = !text; }
function showList(rooms) {
  const root = document.createElement('div'); root.className = 'modal';
  root.innerHTML = `<div class="panel"><h2>Find a game</h2>${rooms.length ? `<div class="menu-list">${rooms.map(r => `<button data-code="${r.code}">${esc(r.host)}'s game · ${r.players}/4 · ${esc(r.area)}${r.difficulty && r.difficulty !== 'normal' ? ' · ' + esc(content.difficulty.tiers[r.difficulty]?.name) : ''}</button>`).join('')}</div>` : '<p>No public games right now. Host one and tick “List it publicly”.</p>'}<div class="btns" style="margin-top:12px"><button data-close>Close</button></div></div>`;
  root.addEventListener('click', e => { const c = e.target.closest('[data-code]')?.dataset.code; if (c) { root.remove(); start(online(), { t: 'join', code: c, character: character() }); } else if (e.target === root || e.target.closest('[data-close]')) root.remove(); });
  document.body.append(root); root.querySelector('button')?.focus();
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let inviteEl = null;
async function openInvite() {
  inviteEl?.remove();
  inviteEl = document.createElement('div'); inviteEl.className = 'modal invite';
  const url = joinUrl(G.code);
  inviteEl.innerHTML = `<div class="panel"><h2>Invite friends</h2><div class="qr"></div><p class="code-big">${G.code}</p><p class="url">${esc(url)}</p>
    <div class="btns"><button class="copy">Copy link</button><button class="big-qr">Big QR</button></div><div class="host-only"></div><div class="btns" style="margin-top:12px"><button data-close class="primary">Done</button></div></div>`;
  inviteEl.addEventListener('click', e => { if (e.target === inviteEl || e.target.closest('[data-close]')) { inviteEl.remove(); inviteEl = null; } });
  document.body.append(inviteEl);
  const svg = await qrSvg(url).catch(() => ''); inviteEl?.querySelector('.qr') && (inviteEl.querySelector('.qr').innerHTML = svg);
  inviteEl.querySelector('.copy').onclick = e => { navigator.clipboard?.writeText(url).then(() => { e.target.textContent = 'Copied!'; }).catch(() => {}); };
  inviteEl.querySelector('.big-qr').onclick = () => inviteEl.classList.toggle('huge');
  refreshInvite();
}
function refreshInvite() {
  const box = inviteEl?.querySelector('.host-only'); if (!box) return;
  if (G.host !== G.me) { box.innerHTML = ''; return; }
  const others = [...G.roster.values()].filter(p => p.id !== G.me);
  box.innerHTML = `<label class="row"><input type="checkbox" class="pub" ${G.isPublic ? 'checked' : ''}> List this game publicly</label>${others.map(p => `<div class="who">${esc(p.name)}${p.away ? ' (away)' : ''} <button data-rm="${p.id}">Remove</button></div>`).join('')}`;
  box.querySelector('.pub').onchange = e => G.link.send({ t: 'host', public: e.target.checked });
  box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => G.link.send({ t: 'host', remove: b.dataset.rm }));
}
setInterval(() => { if (G.me && G.link?.kind === 'online' && G.link.alive) G.link.send({ t: 'ping', at: performance.now() }); }, 3000);

/** Draw an area (on joining, and every time the sim moves you to another one). */
function showArea(areaId, seed) {
  // leaving a zone or dungeon for the first time: ask how it was (once per place per device)
  const prev = G.area; if (prev?.zone && prev.id !== areaId && prev.id !== 'brightwater' && prev.id !== 'proving_meadow') maybeRate(prev.id, prev.name, { level: heroes.current()?.level, players: G.roster?.size || 1 });
  tally('zone', { z: areaId });
  G.area = content.zones?.[areaId] ? buildArea(content.zones[areaId]) : testField(seed);
  if (G.areaGroup) view.scene.remove(G.areaGroup);
  G.areaGroup = G.area.zone ? buildZoneView(view, G.area, { quality }) : buildTestArea(view, G.area);
  for (const id of [...foes.list.keys()]) { const f = foes.get(id); view.scene.remove(f.group); f.tag.remove(); foes.list.delete(id); }
  for (const id of [...actors.list.keys()]) if (id !== G.me) actors.remove(id);
  ground.clear(); G.goto = null; G.pending = []; G.jump = true; G.target = null;
  $('.hud-area').textContent = G.area.name + (G.difficulty && G.difficulty !== 'normal' ? ` · ${content.difficulty.tiers[G.difficulty]?.name}` : '');
  travelUI.enterArea(G.area);
  { const ch = heroes.current(); if (ch && G.area.id === 'brightwater' && ch.level <= 2 && !Object.keys(ch[questKey(G.difficulty)] || {}).length) openWelcome(ch, { touch: isTouch() }); }
  ambience(G.area.theme);
  // the town's people stand at their markers (Chibi 2.6 bodies, a look seeded from who they are)
  for (const m of G.area.markers || []) if (m.kind === 'npc') { const rng = makeRng(hashStr(m.id + ':' + areaId)); const a = actors.add('npc:' + m.id, { name: m.label || m.id, look: randomLook(rng) }); a.x = m.x; a.z = m.z; a.yaw = Math.atan2((G.area.spawn.x - m.x), (G.area.spawn.z - m.z)); a.npc = true; }
}
function enterGame(m) {
  tally('play', { solo: G.link?.kind === 'solo' ? 1 : 0 });
  if (G.retry) { clearInterval(G.retry); G.retry = null; banner(null); }
  const again = G.me === m.you && G.area;
  G.me = m.you; G.code = G.link.kind === 'online' ? m.code : null; G.host = m.host; G.pending = [];
  if (again) return;
  G.difficulty = m.difficulty || 'normal';
  showArea(m.area, m.seed);
  $('#title').hidden = true; $('#hud').hidden = false; $('#fight').hidden = false; document.body.classList.add('in-game');
  $('.hud-area').textContent = G.area.name + (G.difficulty && G.difficulty !== 'normal' ? ` · ${content.difficulty.tiers[G.difficulty]?.name}` : '');
  const codeEl = $('.hud-code'); codeEl.hidden = !G.code; codeEl.textContent = G.code ? `Code ${G.code}` : ''; codeEl.onclick = openInvite;
  touch.show(isTouch());
  if (G.code) history.replaceState(null, '', `?code=${G.code}`);
}
function leaveGame() {
  try { G.link?.send({ t: 'leave' }); } catch { /* closed */ }
  if (G.link?.kind === 'solo') G.link.close();
  G.link = null; G.me = null; G.code = null; G.area = null;
  for (const id of [...actors.list.keys()]) actors.remove(id);
  sheetUI.toggle(false); skillsUI.toggle(false);
  $('#title').hidden = false; $('#hud').hidden = true; $('#fight').hidden = true; document.body.classList.remove('in-game'); touch.show(false);
  for (const id of [...foes.list.keys()]) { const f = foes.get(id); view.scene.remove(f.group); f.tag.remove(); foes.list.delete(id); }
  ground.clear(); G.goto = null;
  history.replaceState(null, '', location.pathname);
}
function onSnap(s) {
  const now = performance.now();
  G.snap = s; G.snapPlayers = new Map(s.players.map(p => [p.id, p]));
  G.lastSnap = now;
  const seen = new Set();
  for (const p of s.players) {
    seen.add(p.id);
    let a = actors.get(p.id);
    if (!a) { a = actors.add(p.id, { name: p.name, look: (p.id === G.me ? heroes.current()?.look : null) || G.roster?.get(p.id)?.look || null, me: p.id === G.me }); a.x = p.x; a.z = p.z; a.yaw = p.yaw; if (p.id === G.me) view.snapTo(p.x, p.z); }
    if (p.id === G.me) {
      // reconcile: start from the server's answer, re-walk the inputs it has not applied yet
      const ghost = { x: p.x, z: p.z, yaw: p.yaw, r: PLAYER_RADIUS };
      G.pending = G.pending.filter(i => i.seq > p.seq);
      for (const i of G.pending) walk(G.area, ghost, i.mx, i.mz, DT, i.spd);
      const err = Math.hypot(ghost.x - a.x, ghost.z - a.z);
      if (err > 1.5) { a.x = ghost.x; a.z = ghost.z; } else if (err > 0.02) { a.x += (ghost.x - a.x) * 0.3; a.z += (ghost.z - a.z) * 0.3; }
    } else actors.push(p.id, p, now);
  }
  // companions (mercenaries now, pets later): Chibi 2.6 bodies like heroes, interpolated the same way
  for (const a of s.allies || []) {
    seen.add(a.id);
    let x = actors.get(a.id);
    if (!x) { const rng = makeRng(hashStr(a.id + (a.n || ''))); x = actors.add(a.id, { name: `${a.n} · ${content.mercs?.kinds?.[a.k]?.name || a.k}`, look: a.look || randomLook(rng) }); x.x = a.x; x.z = a.z; x.tag.classList.add('ally'); }
    actors.push(a.id, a, now); x.tag.classList.toggle('away', !!a.dead); x.group.visible = !a.dead;
  }
  for (const id of [...actors.list.keys()]) if (!seen.has(id) && !id.startsWith('npc:')) actors.remove(id);
  if (G.jump) { const me = actors.get(G.me), sp = s.players.find(p => p.id === G.me); if (me && sp) { me.x = sp.x; me.z = sp.z; view.snapTo(sp.x, sp.z); G.jump = false; } }
  foes.sync(s.foes || [], now);
  ground.syncChests(s.chests, G.me);
  partyUI.update(G.snapPlayers, G.area?.id);
  fx.syncShots(s.shots);
  G.meSnap = s.players.find(p => p.id === G.me) || null;
  if (G.meSnap) G.target = G.meSnap.tg ?? (G.pendingTarget || G.target);
  for (const e of s.events || []) onEvent(e, now);
  const tf = G.target && (foes.get(G.target) || null), tp = G.target && s.players.find(p => p.id === G.target);
  hud.update(G.meSnap, heroes.current(), tf && tf.st !== 'dead' ? { name: tf.name, lvl: tf.lvl, hp: tf.hp, mhp: tf.mhp, cast: tf.cast, rk: tf.rk } : tp ? { name: tp.name, lvl: tp.lvl, hp: tp.hp, mhp: tp.mhp } : null);
}
const worldAt = (x, z, y = 1.6) => { const v = new view.THREE.Vector3(x, y, z).project(view.camera); const c = view.renderer.domElement; return [(v.x * 0.5 + 0.5) * c.clientWidth, (-v.y * 0.5 + 0.5) * c.clientHeight]; };
function posOf(id) { const f = foes.get(id); if (f) return [f.x, f.z, (f.group.userData.height || 1.5)]; const a = actors.get(id); return a ? [a.x, a.z, 2] : null; }
function onEvent(e, now) {
  soundFor(e, id => posOf(id), actors.get(G.me), G.me);
  if (e.k === 'tele') { fx.tele(e, now); return; }
  if (e.k?.startsWith('trade') && partyUI.onEvent(e)) return;
  if (e.k === 'drop') { ground.add(e); if (e.what === 'shard') play('loot.uncommon'); else if (e.what === 'item') play(LOOT_SOUND[e.real] || 'loot.normal'); else if (e.what === 'gold') play('loot.common'); return; }
  if (e.k === 'gone') { const it = ground.items.get(e.gid); if (it && e.got) { const [x, y] = worldAt(it.x, it.z, 0.6); hud.float(x, y, e.got, 'gold'); } if (it && it.what === 'gold') play('loot.common'); ground.remove(e.gid); return; }
  if (e.k === 'chest') { play('ui.open'); return; }
  if (e.k === 'shop') { townUI.onShop(e); play('ui.open'); return; }
  if (e.k === 'stashed') { townUI.onStashed(e.item); return; }
  if (e.k === 'unstashed') { townUI.onUnstashed(e.uid); return; }
  if (e.k === 'sold') { play('loot.common'); return; }
  if (e.k === 'crafted') { play('loot.magic'); return; }
  if (e.k === 'salvaged') { play('ui.click'); return; }
  if (e.k === 'difficulty-unlocked') { banner2(`${e.name} unlocked!`); return; }
  if (e.k === 'quest-done') { banner2(`Quest complete: ${e.name}`); play('loot.rare'); return; }
  if (e.k === 'quest-new') { setTimeout(() => showQuest(e.name, e.text), 2400); return; }
  if (e.k === 'quest-progress') { hud.nope(`${e.n} / ${e.of}`); return; }
  if (e.k === 'die' && foes.get(e.t)?.rk === 'boss') { const f = foes.get(e.t); setTimeout(() => maybeRate('boss_' + (content.monsters[[...Object.keys(content.monsters)].find(k => content.monsters[k].name === f.name)]?.id || 'boss'), f.name, { level: heroes.current()?.level }), 3000); }
  if (e.k === 'phase') { banner2(e.name); play('ui.open'); return; }
  if (e.k === 'enrage') { banner2('Enraged!'); return; }
  if (e.k === 'burst' || e.k === 'area') { fx.burst?.(e); return; }
  if (e.k === 'waypoint') { banner2(`Waypoint found: ${e.name}`); play('ui.open'); return; }
  if (e.k === 'fability' || e.k === 'fcast') { const at = posOf(e.s); if (at && e.k === 'fability') { const [x, y] = worldAt(at[0], at[1], at[2] + 0.6); hud.float(x, y, e.sk, 'ab'); } return; }
  if (e.k === 'fx' && e.t === G.me) { hud.nope({ slow: 'Slowed!', stun: 'Stunned!', silence: 'Silenced!', dot: 'Poisoned!' }[e.kind] || ''); return; }
  if (e.k === 'dmg') {
    const at = posOf(e.t); if (!at) return;
    const [x, y] = worldAt(at[0], at[1], at[2]);
    const mine = e.s === G.me, onMe = e.t === G.me;
    const text = e.r === 'miss' ? 'Miss' : e.r === 'dodge' ? 'Dodge' : e.r === 'resist' ? 'Resist' : (e.r === 'block' ? `${e.n} (blocked)` : String(e.n));
    if (onMe && e.n > (G.meSnap?.mhp || 100) * 0.12) shake(0.25);
    if (mine || onMe || G.target === e.t) hud.float(x + (Math.random() * 30 - 15), y, text + (e.r === 'crit' ? '!' : ''), (onMe ? 'hurt' : 'deal') + (e.r === 'crit' ? ' crit' : '') + ' ty-' + e.ty);
    const f = foes.get(e.t); if (f && e.n > 0) f.hitAt = now;
  } else if (e.k === 'heal') { const at = posOf(e.t); if (at) { const [x, y] = worldAt(at[0], at[1], at[2]); hud.float(x, y, '+' + e.n, 'heal'); } }
  else if (e.k === 'swing') { const f = foes.get(e.s); if (f) f.swingAt = now; else actors.get(e.s)?.swing?.(); }
  else if (e.k === 'drink' && e.t === G.me) { const a = actors.get(G.me); if (a) { const [x, y] = worldAt(a.x, a.z, 2.2); hud.float(x, y, e.kind === 'mana' ? '💧' : '❤', e.kind === 'mana' ? 'xp' : 'heal'); } }
  else if (e.k === 'xp' && e.t === G.me) { const a = actors.get(G.me); if (a) { const [x, y] = worldAt(a.x, a.z, 2.3); hud.float(x, y - 20, `+${e.n} xp`, 'xp'); } }
  else if (e.k === 'level' && e.t === G.me) { banner2(`Level ${e.lvl}!`); tally('level', { l: e.lvl }); }
  else if (e.k === 'interrupt') { const at = posOf(e.t); if (at) { const [x, y] = worldAt(at[0], at[1], at[2] + 0.4); hud.float(x, y, 'Interrupted!', 'int'); } }
  else if (e.k === 'die' && e.t === G.target && foes.get(e.t)) { /* keep the target until it fades so the last number reads */ }
}
/** The quest text in a small card (the Elder's words, the quest log). */
function showQuest(name, text) {
  const el = document.createElement('div'); el.className = 'modal quest-card';
  el.innerHTML = `<div class="panel"><h2>${esc(name)}</h2><p>${esc(text)}</p><div class="btns"><button data-close class="primary">On my way</button></div></div>`;
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-close]')) el.remove(); }); document.body.append(el);
}
function openQuestLog() {
  const ch = heroes.current(); if (!ch) return; const steps = content.acts?.[0]?.mainQuests || [], cur = activeStep(content, ch, G.difficulty), Q = ch[questKey(G.difficulty)] || {};
  const el = document.createElement('div'); el.className = 'modal quest-card';
  el.innerHTML = `<div class="panel"><h2>Quests</h2>${steps.map(q => { const done = Q[q.id]?.done, now = cur?.id === q.id; return done || now ? `<div class="ql ${done ? 'done' : 'now'}"><b>${done ? '✔' : '◆'} ${esc(q.name)}</b>${now ? `<p>${esc(q.text)}</p>` : ''}</div>` : ''; }).join('')}<p class="sub">${esc(content.acts?.[0]?.story || '')}</p><div class="btns"><button data-close class="primary">Close</button></div></div>`;
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-close]')) el.remove(); }); document.body.append(el);
}
let shakeT = 0;
function shake(k) { shakeT = Math.max(shakeT, k); document.body.classList.add('hurt-flash'); setTimeout(() => document.body.classList.remove('hurt-flash'), 140); }
function banner2(text) { const b = document.createElement('div'); b.className = 'big-banner'; b.textContent = text; document.body.append(b); setTimeout(() => b.remove(), 2200); }

// ---- targeting + skills ---------------------------------------------------------------------------------------------
function setTarget(id) { G.target = id; G.pendingTarget = id; G.link?.send({ t: 'act', do: 'target', target: id }); }
const barOf = () => { if (G.meSnap?.sb) return G.meSnap.sb; const c = heroes.current(); return c?.bar?.length ? c.bar : ['sure_strike', 'spark', 'field_mend', 'shove', null, null]; };
function useSkill(id) {
  if (!G.me || !id) return;
  const sk = content.skills[id]; if (!sk) return;
  let t = G.target;
  if (sk.target === 'ground') { const me = actors.get(G.me); const at = !isTouch() && G.mouse ? G.mouse : (t && foes.get(t) ? { x: foes.get(t).x, z: foes.get(t).z } : null); G.link?.send({ t: 'act', do: 'use', skill: id, target: t, at }); return; }
  if (sk.target === 'enemy' && (!t || !foes.get(t) || foes.get(t).st === 'dead')) { t = nearestFoe(); if (t) setTarget(t); else { hud.nope('No enemy targeted.'); return; } }
  // a press in the last half second of the global cooldown is held and sent the moment it ends (spell queue)
  const left = sk.kind !== 'auto' && (sk.gcd ?? true) ? (G.meSnap?.gcd || 0) : 0;
  const msg = { t: 'act', do: 'use', skill: id, target: sk.target === 'ally' ? (G.target && actors.get(G.target) ? G.target : G.me) : t };
  const send = () => G.link?.send(msg);
  if (sk.target === 'enemy' && foes.get(t)) { const me = actors.get(G.me), f = foes.get(t), range = (sk.range > 0 ? sk.range : meleeReach()) - 0.4; if (me && Math.hypot(f.x - me.x, f.z - me.z) > range + 0.8) { G.goto = { target: t, reach: range, msg }; return; } }
  if (left > 0 && left < 0.5) { clearTimeout(G.queued); G.queued = setTimeout(send, left * 1000 + 30); return; }
  send();
}
function nearestFoe(exclude = null) {
  const me = actors.get(G.me); if (!me) return null;
  let best = null, bd = 30 * 30;
  for (const f of foes.list.values()) { if (f.st === 'dead' || f.id === exclude) continue; const d = (f.x - me.x) ** 2 + (f.z - me.z) ** 2; if (d < bd) { bd = d; best = f.id; } }
  return best;
}
/** Tab / Next: the nearest enemy that isn't the current one, cycling by distance. */
function targetNext() {
  const me = actors.get(G.me); if (!me) return;
  const live = [...foes.list.values()].filter(f => f.st !== 'dead' && (f.x - me.x) ** 2 + (f.z - me.z) ** 2 < 30 * 30).sort((a, b) => ((a.x - me.x) ** 2 + (a.z - me.z) ** 2) - ((b.x - me.x) ** 2 + (b.z - me.z) ** 2));
  if (!live.length) return;
  const i = live.findIndex(f => f.id === G.target);
  setTarget(live[(i + 1) % live.length].id);
}
// click / tap an enemy: target it and start swinging (one tap does what you mean); click the ground: clear
view.renderer.domElement.addEventListener('pointerdown', e => {
  if (!G.me) return;
  const id = foes.pick(e.clientX, e.clientY);
  // right mouse: the first skill on your bar, at whatever is under the cursor
  if (e.pointerType === 'mouse' && e.button === 2) { if (id) setTarget(id); const at = groundAt(e); if (at) G.mouse = at; useSkill(barOf()[0]); return; }
  if (id) {
    setTarget(id);
    if (e.pointerType === 'mouse') { G.link?.send({ t: 'act', do: 'use', skill: 'attack', target: id }); G.goto = { target: id, reach: meleeReach() }; }
    return;
  }
  if (e.pointerType === 'mouse' && e.button === 0) {
    const at = groundAt(e); if (!at) return;
    // a marker under the click (portal, exit, waypoint, NPC): walk there and use it
    const mk = travelUI.markerNear(at.x, at.z, 2.5);
    if (mk) { G.goto = { x: mk.x, z: mk.z, reach: 2.4, use: true }; G.useMarker = true; return; }
    G.mouseHeld = true; G.goto = { x: at.x, z: at.z, reach: 0.35 }; return;
  }
  // a fallen friend under the tap: revive
  for (const a of actors.list.values()) { if (a.id === G.me) continue; const snap = G.snapPlayers?.get(a.id); if (!snap?.dead) continue; const [x, y] = worldAt(a.x, a.z, 0.5); if ((x - e.clientX) ** 2 + (y - e.clientY) ** 2 < 50 * 50) { G.link?.send({ t: 'act', do: 'revive', target: a.id }); return; } }
});
view.renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
const groundAt = e => { const r = view.renderer.domElement.getBoundingClientRect(); ray.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -((e.clientY - r.top) / r.height * 2 - 1) }, view.camera); return ray.ray.intersectPlane(plane, hitP) ? { x: +hitP.x.toFixed(2), z: +hitP.z.toFixed(2) } : null; };
addEventListener('pointerup', () => { G.mouseHeld = false; });
view.renderer.domElement.addEventListener('pointermove', e => { if (G.mouseHeld && e.pointerType === 'mouse' && G.goto && !G.goto.target && !G.goto.msg) { const at = groundAt(e); if (at) { G.goto.x = at.x; G.goto.z = at.z; } } });
// where the mouse points on the ground (ground-targeted skills land there)
view.renderer.domElement.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; const r = view.renderer.domElement.getBoundingClientRect(); ray.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -((e.clientY - r.top) / r.height * 2 - 1) }, view.camera); if (ray.ray.intersectPlane(plane, hitP)) G.mouse = { x: +hitP.x.toFixed(2), z: +hitP.z.toFixed(2) }; });
addEventListener('keydown', e => {
  if (!G.me || e.target?.tagName === 'INPUT' || document.querySelector('.modal:not([hidden])')) return;
  if (e.code === 'Tab') { e.preventDefault(); targetNext(); }
  if (e.code === 'Space') { e.preventDefault(); const me = actors.get(G.me), n = me && ground.nearest(me.x, me.z, 6); if (n) goAndDo(n.x, n.z, n.kind === 'chest' ? { t: 'act', do: 'open', id: n.id } : { t: 'act', do: 'pickup', gid: n.id }); else travelUI.use(); }
  if (e.code === 'KeyJ' || e.code === 'KeyL') openQuestLog();
  if (e.code === 'KeyM') { if (travelUI.mapOpen) travelUI.closeMap(); else travelUI.openMap(false); }
  if (e.code === 'KeyT') sendAct({ do: 'travel', via: 'recall' });
  if (e.code === 'KeyC' || e.code === 'KeyI' || e.code === 'KeyB') sheetUI.toggle();
  if (e.code === 'KeyX') G.link?.send({ t: 'act', do: 'swap' });
  if (e.code === 'KeyQ' && !e.repeat) G.link?.send({ t: 'act', do: 'drink', kind: 'health' });
  if (e.code === 'KeyE' && !e.repeat) G.link?.send({ t: 'act', do: 'drink', kind: 'mana' });
  const n = /^Digit([1-6])$/.exec(e.code)?.[1];
  if (n) { const id = barOf()[+n - 1]; if (id) useSkill(id); }
  if (e.code === 'KeyK') skillsUI.toggle();
  if (e.code === 'KeyF') useSkill('attack');
  if (e.code === 'KeyR' && !e.repeat) { const me = actors.get(G.me); for (const a of actors.list.values()) { if (a.id !== G.me && G.snapPlayers?.get(a.id)?.dead && Math.hypot(a.x - me.x, a.z - me.z) < 3) { G.link?.send({ t: 'act', do: 'revive', target: a.id }); break; } } }
});
function fixedStep() {
  const a = actors.get(G.me); if (!a || !G.area) return;
  const mv = input.move();
  let [mx, mz] = view.screenToWorld(mv.x, mv.y);
  if (mv.x || mv.y) G.goto = null;
  else if (G.goto) { const v = walkToward(a); mx = v[0]; mz = v[1]; }
  G.seq++;
  G.link.send({ t: 'input', mx: +mx.toFixed(3), mz: +mz.toFixed(3), seq: G.seq });
  const spd = WALK_SPEED * (G.meSnap?.spd ?? 1);
  G.pending.push({ seq: G.seq, mx, mz, spd }); if (G.pending.length > 60) G.pending.shift();
  if (!G.meSnap?.dead) walk(G.area, a, mx, mz, DT, spd);
}

let last = performance.now();
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (t - last) / 1000); last = t;
  G.fps = G.fps ? G.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05 : 30;
  if (input.take('menu')) menu.open();
  if (G.me && G.link) {
    G.acc += dt;
    while (G.acc >= DT) { G.acc -= DT; fixedStep(); }
    const me = actors.get(G.me); if (me) view.follow(me.x, me.z, dt);
    if (shakeT > 0 && !reduceMotion) { shakeT = Math.max(0, shakeT - dt); view.camera.position.x += (Math.random() - 0.5) * shakeT * 0.6; view.camera.position.y += (Math.random() - 0.5) * shakeT * 0.4; }
  }
  actors.update(dt, t - 110);
  foes.update(dt, t - 110, t, G.target, actors.get(G.me));
  fx.update(dt, t);
  ground.update(dt, t);
  travelUI.update(dt, t);
  { const ch = heroes.current(), me = actors.get(G.me); if (ch && G.area) guide.update(content, { ...ch, quests: ch[questKey(G.difficulty)] || {} }, G.area, activeStep(content, ch, G.difficulty), me, t); }
  padCombat();
  view.render();
}
requestAnimationFrame(frame);

const menu = createMenu([
  { label: 'Resume', act: () => {} , when: () => !!G.me },
  { label: 'Invite friends', when: () => !!G.code, act: () => openInvite() },
  { label: 'Character and bag (C)', when: () => !!G.me, act: () => sheetUI.toggle(true) },
  { label: 'Skills (K)', when: () => !!G.me, act: () => skillsUI.toggle(true) },
  { label: 'Map (M)', when: () => !!G.me, act: () => travelUI.openMap(false) },
  { label: 'Quests (J)', when: () => !!G.me, act: () => openQuestLog() },
  { label: 'Recall portal (T)', when: () => !!G.me, act: () => sendAct({ do: 'travel', via: 'recall' }) },
  { label: "What's new", act: () => news.open() },
  { label: 'Report a bug', act: () => openReport({ debug, shot }) },
  { label: `Graphics: ${quality === 'low' ? 'Low' : 'High'} (tap to switch, reloads)`, act: () => { store.set('quality', quality === 'low' ? 'high' : 'low'); location.reload(); } },
  { label: `Sound: ${Math.round(getVolume() * 100)}% (tap to change)`, act: () => { const v = getVolume(); setVolume(v >= 0.8 ? 0 : v >= 0.4 ? 0.8 : 0.4); location.reload(); } },
  { label: 'Credits', act: () => credits.open() },
  { label: 'Leave game', when: () => !!G.me, act: leaveGame },
]);
addEventListener('keydown', e => { if (e.key === 'Escape' && townUI.open) { townUI.close(); return; } if (e.key !== 'Escape' || document.querySelector('.modal:not([hidden])')) return; if (sheetUI.open) { sheetUI.toggle(false); return; } if (G.me && G.target) { setTarget(null); return; } menu.open(); });

function shot() {
  try { view.render(); const src = view.renderer.domElement, k = Math.min(1, 900 / Math.max(src.width, src.height)); const c = document.createElement('canvas'); c.width = src.width * k; c.height = src.height * k; c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.72); } catch { return null; }
}
function debug() { return { screen: G.me ? 'game' : 'title', link: G.link?.kind || null, code: G.code, me: G.me, players: actors.list.size, quality, build: document.documentElement.dataset.build || 'dev' }; }

// Claude's game-eye MCP reads the game through this
window.gameEye = {
  state: () => {
    const me = actors.get(G.me);
    return { guide: guide.target ? { x: guide.target.x, z: guide.target.z, to: guide.target.to, hint: guide.target.hint } : null, area: G.area?.id || null, prompt: travelUI.current ? { kind: travelUI.current.kind, to: travelUI.current.to || travelUI.current.id } : null, waypoints: heroes.current()?.waypoints, ground: [...ground.items.values()].map(g => ({ gid: g.gid, what: g.what, r: g.real || g.r, name: g.name, x: +g.x.toFixed(1), z: +g.z.toFixed(1) })), chests: [...ground.chests.values()].map(c => ({ id: c.id, x: c.x, z: c.z, open: c.open })), gold: heroes.current()?.gold, target: G.target || null, foes: [...foes.list.values()].map(f => ({ id: f.id, name: f.name, x: +f.x.toFixed(1), z: +f.z.toFixed(1), hp: f.hp, mhp: f.mhp, st: f.st })), hero: heroes.current() && { level: heroes.current().level, xp: heroes.current().xp }, me2: G.meSnap && { hp: G.meSnap.hp, mhp: G.meSnap.mhp, mp: G.meSnap.mp, dead: !!G.meSnap.dead }, screen: G.me ? 'game' : 'title', link: G.link?.kind || null, code: G.code, host: G.host === G.me, ping: G.ping && Math.round(G.ping), reconnecting: !!G.retry, area: G.area?.id || null, me: me ? { x: +me.x.toFixed(2), z: +me.z.toFixed(2), yaw: +me.yaw.toFixed(2), moving: !!me.moving, bodyReady: !!me.body } : null, players: [...actors.list.values()].map(a => ({ id: a.id, x: +a.x.toFixed(2), z: +a.z.toFixed(2) })), server: G.snap ? G.snap.players.map(p => ({ id: p.id, x: p.x, z: p.z })) : null, fps: Math.round(G.fps || 0) };
  },
  health: () => ({ ok: true, errors: 0 }),
  screenOfPoint: (x, z) => { const [sx, sy] = worldAt(x, z, 0); return { x: sx, y: sy }; },
  screenOf: id => { const f = foes.get(id) || actors.get(id); if (!f) return null; const [x, y] = worldAt(f.x, f.z, 0.8); return { x, y }; },
  perf: () => ({ fps: Math.round(G.fps || 0), calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles, foes: foes.list.size, drawnFoes: [...foes.list.values()].filter(f => f.group.visible).length }),
};

// controller: A = attack (targets the nearest), X/Y/B/RB = skills 1-4, LB = next target (game standards §1)
let padPrev = {};
function padCombat() {
  if (!G.me || anyMenu()) return;
  const g = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null; if (!g) return;
  const now = { a: g.buttons[0]?.pressed, b: g.buttons[1]?.pressed, x: g.buttons[2]?.pressed, y: g.buttons[3]?.pressed, lb: g.buttons[4]?.pressed, rb: g.buttons[5]?.pressed, lt: g.buttons[6]?.pressed, rt: g.buttons[7]?.pressed, back: g.buttons[8]?.pressed };
  const tap = k => now[k] && !padPrev[k];
  if (tap('a') && travelUI.current && !(G.target && foes.get(G.target)?.st === 'attack')) { travelUI.use(); padPrev = now; return; }
  if (tap('a')) { const me = actors.get(G.me), n = me && ground.nearest(me.x, me.z, 3); if (n && !(G.target && foes.get(G.target)?.st === 'attack')) { goAndDo(n.x, n.z, n.kind === 'chest' ? { t: 'act', do: 'open', id: n.id } : { t: 'act', do: 'pickup', gid: n.id }); } else { if (!G.target || !foes.get(G.target)) { const t = nearestFoe(); if (t) setTarget(t); } useSkill('attack'); } }
  const bb = barOf(); if (tap('x')) useSkill(bb[0]); if (tap('y')) useSkill(bb[1]); if (tap('b')) useSkill(bb[2]); if (tap('rb')) useSkill(bb[3]);
  if (tap('lb')) targetNext();
  if (tap('lt')) G.link?.send({ t: 'act', do: 'drink', kind: 'health' }); if (tap('rt')) G.link?.send({ t: 'act', do: 'drink', kind: 'mana' });
  if (tap('back')) sheetUI.toggle();
  padPrev = now;
}

// controller in menus (game standards §1): the d-pad / stick walk a highlight, A presses, B goes back. While you are
// playing with no menu open, the pad drives the hero instead.
const anyMenu = () => !!document.querySelector('.modal:not([hidden]), .sheet-ui:not([hidden]), .skills-ui:not([hidden])');
createPadNav({ busy: () => !!G.me && !anyMenu(), back: () => { if (townUI.open) { townUI.close(); return true; } if (skillsUI.open) { skillsUI.toggle(false); return true; } if (sheetUI.open) { sheetUI.toggle(false); return true; } const m = [...document.querySelectorAll('.modal:not([hidden])')].pop(); if (m) { m.remove(); return true; } return false; } });
