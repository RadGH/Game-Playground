// Play-test 2 Q2 — a right-click menu on any entity (players, town folk, beasts, corpses) and following.
//
//   right-click a friendly body in the world, or right-click the target frame / a party frame  -> the menu
//   (right-click an ENEMY still attacks it, as before; Shift + right-click opens the menu on it instead)
//   /follow [name]  (allies and neutrals only) — walks you behind them; any movement key or a click on the ground stops it
//
// Players: Target · Follow · Inspect · Whisper · Invite to party · Trade · Add/Remove friend. Town folk: Target · Talk ·
// Follow · Inspect. Beasts: Target · Attack / Follow · Loot (a corpse with loot) · Inspect. Entries come from pt2-core.js
// contextItems (tested); following asks the server once (`follow {id}` -> followR) and walks with controls.walkTo.

import { h, createPanel } from '../ui-panel.js';
import { contextItems, followRefusal, followStep, findByName, className } from './pt2-core.js';
import { send2 } from './net2.js';
import { SLOT_NAME, RARITY_NAME } from './inv-core.js';
import { rememberItems } from './item-card.js';

export function createContextMenu({ net, infoOf = () => null, hud, actors, controls, me, chat, social, friends, setTarget, onTalk, onLoot, isLootable, partyInfo, tradeAsk }) {
  const menu = h('div.name-menu.ent-menu', { role: 'menu', hidden: true });
  (document.getElementById('hud') || document.body).appendChild(menu);
  document.addEventListener('pointerdown', e => { if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true; }, true);
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { menu.hidden = true; e.stopImmediatePropagation(); } }, true);

  // ---- the menu ----
  function open(id, x, y) {
    const a = actors.get(id); if (!a) return false;
    const m = me(); if (!m) return false;
    const party = partyInfo?.() || null;
    const items = contextItems({ id: a.id, kind: a.kind, hostile: a.hostile, dead: a.dead, name: a.name, role: a.role, pet: a.pet, loot: isLootable?.(a.id) },
      { selfId: m.id, inParty: !!party, leader: !party || party.leader === m.char, isFriend: friends?.isFriend?.(a.name) });
    menu.replaceChildren(h('div.nm-title', {}, a.name, h('small', {}, ` ${a.kind === 'player' ? `${a.level} ${className(infoOf(a.id)?.cls || a.look?.cls)}` : a.role ? roleName(a.role) : a.level ? `level ${a.level}` : ''}`)));
    for (const it of items) {
      menu.append(h('button.nm-item' + (it.disabled ? '.off' : ''), { type: 'button', role: 'menuitem', disabled: !!it.disabled, title: it.why || null, dataset: { act: it.id },
        onclick: () => { menu.hidden = true; act(it.id, a); } }, it.label));
    }
    menu.hidden = false;
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.max(6, Math.min(window.innerWidth - r.width - 6, x + 4)) + 'px';
    menu.style.top = Math.max(6, Math.min(window.innerHeight - r.height - 6, y - 12)) + 'px';
    return true;
  }
  function act(what, a) {
    const n = net();
    switch (what) {
      case 'target': setTarget(a.id); break;
      case 'attack': setTarget(a.id); controls.attack(a.id); break;
      case 'follow': follow(a.id); break;
      case 'inspect': inspect(a.id); break;
      case 'whisper': chat.whisper(a.name); break;
      case 'invite': social.invite(a.name); break;
      case 'trade': tradeAsk(a.id, a.name); break;
      case 'friend': friends.add(a.name); break;
      case 'unfriend': friends.remove(a.name); break;
      case 'talk': onTalk(a.id); break;
      case 'loot': onLoot(a.id); break;
    }
    return n;
  }
  const roleName = r => String(r).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  // ---- follow ----
  const F = { id: null, lastGoal: null, asked: 0, name: '' };
  function follow(id) {
    const a = actors.get(id), m = me();
    const why = followRefusal(a ? { id: a.id, hostile: a.hostile, dead: a.dead, name: a.name } : null, m?.id);
    if (why) { hud.toast(why, 'warn'); return false; }
    F.id = id; F.name = a.name; F.lastGoal = null; F.asked = performance.now();
    send2.follow(net(), id);                       // the server's yes/no (followR); we start walking now
    hud.toast(`Following ${a.name}. Move to stop.`, 'info');
    hud.chat(`You are following ${a.name}.`, 'system');
    return true;
  }
  function stopFollow(why = null) {
    if (F.id == null) return;
    const name = F.name;
    F.id = null; F.lastGoal = null;
    controls.stop();
    if (why) hud.chat(why === true ? `You stop following ${name}.` : why, 'system');
  }
  // any movement key ends it (the controls also drop their walk goal on these)
  window.addEventListener('keydown', e => {
    if (F.id == null || (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) stopFollow(true);
  });
  /** Each frame in the world: steer toward a spot behind the leader. */
  function tick() {
    if (F.id == null) return;
    const m = me(), a = actors.get(F.id);
    if (!m) return;
    if (!a) { stopFollow(`${F.name} is out of sight — you stop following.`); return; }
    if (a.dead || m.dead) { stopFollow(true); return; }
    // somebody else set a walk goal (a click on the ground, an attack): that is "move", it ends the follow
    const g = controls.moveGoal;
    if ((F.lastGoal && g && g !== F.lastGoal) || controls.chasing != null) { stopFollow(true); return; }
    const s = followStep({ x: m.x, z: m.z }, { x: a.pos.x, z: a.pos.z });
    if (s.far) { stopFollow(`${F.name} is too far away — you stop following.`); return; }
    if (s.mx || s.mz) {
      const tx = a.pos.x - s.mx * 2.2, tz = a.pos.z - s.mz * 2.2;
      controls.walkTo(tx, tz); F.lastGoal = controls.moveGoal;
    } else if (F.lastGoal) { controls.stop(); F.lastGoal = null; }
  }
  /** /follow [name] (chat): the named player/NPC near you, else your target. */
  function followCommand(arg, targetId) {
    const list = [...actors.actors.values()].filter(x => x.id !== me()?.id && x.kind !== 'monster');
    const a = arg ? findByName(list, arg) : actors.get(targetId);
    if (!a) { hud.chat(arg ? `Nobody called ${arg} is near enough to follow.` : 'Follow whom? Target someone or type /follow Name.', 'bad'); return; }
    follow(a.id);
  }

  // ---- inspect ----
  const insp = createPanel({ id: 'inspect', title: 'Inspect', width: 320, cls: 'inspect-panel' });
  function inspect(id) {
    const a = actors.get(id); if (!a) return;
    const info = infoOf(id) || null;
    const gear = a.look?.gear || info?.gear || {};
    const rows = Object.entries(gear).filter(([, g]) => g);
    insp.setTitle(a.name, a.kind === 'player' ? `Level ${a.level} ${className(info?.cls || a.look?.cls)}` : a.role ? roleName(a.role) : `Level ${a.level || '?'}`);
    const facts = [];
    if (a.kind === 'monster') facts.push(h('p', {}, `${a.family || 'Creature'}${a.rank ? ` · ${roleName(a.rank)}` : ''}`), h('p', {}, `Health: ${Math.max(0, Math.round(a.hp))} / ${Math.round(a.hpMax)}`));
    if (a.kind === 'npc') facts.push(h('p', {}, a.pet ? 'A companion.' : 'One of the folk who live here.'));
    if (a.kind === 'player') {
      facts.push(h('h4', {}, 'Wearing'));
      facts.push(rows.length ? h('ul.insp-gear', {}, ...rows.map(([slot, g]) => h('li', { className: 'r-' + (g.rarity || 'normal') }, h('span', {}, SLOT_NAME[slot] || slot), h('b', {}, String(g.name || g.base || '').replace(/_/g, ' ')), h('em', {}, RARITY_NAME[g.rarity] || '')))) : h('p.dim', {}, 'Plain travelling clothes.'));
    }
    insp.fill(...facts);
    insp.open();
    // a player: ask the server for the whole picture (inspectR: name, clsName, level, look, equipment)
    if (a.kind === 'player') { inspId = id; const n = net(); if (typeof n?.inspect === 'function') n.inspect(id); }
  }
  let inspId = null;
  function onInspectR(r) {
    if (!r || !insp.isOpen) return;
    const a = actors.get(inspId);
    insp.setTitle(r.name || a?.name || 'Inspect', `Level ${r.level ?? a?.level ?? '?'} ${r.clsName || className(r.cls)}`);
    const rows = Object.entries(r.equipment || {}).filter(([, g]) => g);
    insp.fill(h('h4', {}, 'Wearing'), rows.length ? h('ul.insp-gear', {}, ...rows.map(([slot, g]) => h('li', { className: 'r-' + (g.rarity || 'normal'), dataset: g.uid != null ? { tipRender: 'item', tipItem: String(g.uid) } : {} },
      h('span', {}, SLOT_NAME[slot] || slot), h('b', {}, String(g.name || g.base || '').replace(/_/g, ' ')), h('em', {}, RARITY_NAME[g.rarity] || '')))) : h('p.dim', {}, 'Plain travelling clothes.'));
    rememberItems(rows.map(([, g]) => g));
  }

  function wire(n) {
    n.on('inspectR', onInspectR);
    n.on('followR', r => { if (r && r.ok === false && F.id === r.id) stopFollow(r.msg || 'You cannot follow them.'); });
    n.on('joined', () => { if (F.id != null) stopFollow(null); });
  }
  return { open, follow, stopFollow, tick, wire, followCommand, inspect, get following() { return F.id; }, get isOpen() { return !menu.hidden; }, menu };
}
