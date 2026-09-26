// Barks, bubbles and subtitles (docs/01 §12.3, §12.7, §12.8; docs/05 §25; docs/10 §10.1). Listens to game bus
// events, asks the talk module (js/talk/lingo-bridge.js) for a line, throttles it by 01's one bark table
// (data/npcs.json `bark`), and publishes it three ways:
//   game.subtitle = { who, text, color, t, dur, italic, speakerId }   the HUD's bottom line
//   game.bubbles  = [{ speakerId, text, x, y, t, dur, color, enemy }] for a speech-bubble renderer (≤ 2 enemy bubbles)
//   bus 'talk.line' { speakerId, text, speech, x, y, priority, babble, gloss, narration, voiceOf, fx, phase, kind, seed, dur }
// and keeps the last 200 lines in game.talkLog (the Ledger's "Words" tab).
//
// Which moment fires which intent (05 §25 / 01 §12.3):
//   enemy.alert   talking enemy → enemy_opener (Knell / Drowned tag); rat or Unlit swarm → beast_snarl gloss, once per
//                 swarm; any other beast, the first of its kind this act → the Narrator's beast_snarl
//   player.hurt   the talking enemy that hit you → combat_taunt; an ally present → warning; Hush below 30% → hush_chirr hurt
//   hit           a talking enemy loses ≥ 20% of its health in one hit → combat_hurt
//   knockout      a Knell knocked out → combat_flee (the surrender)
//   kill          an ally present → combat_bark
//   player.die    the boss or the nearest talking enemy → combat_kill (bosses: their fixed kill line first)
//   cast.release  oil below 20% → Hush's hush_chirr oil
//   talk.request  { speakerId, intent, ctx, lineId?, x, y, priority }  any game system asking for a line
//   boss.line     { boss, slot, x, y }  a boss moment (fixed line first time, pool after)
// The player never speaks (01 §12.1): "hero" reactions go to an ally (Nell) or to Hush.
//
// Pre-render (R77): at room load, a few lines per talking spawn are drawn ahead and emitted as 'talk.prerender'
// { lines } so the voice bridge can synthesize them while nothing is happening; a bark in a fight is then a lookup.
// Pure (no DOM). update(dt) runs hub idle chatter for game.npcs = [{ id, x, y }] and prunes bubbles.

const PRIORITY = { story: 5, boss: 4, npc: 3, bark: 2, idle: 1 };

export function createBarks({ game, talk, config = null, random = Math.random }) {
  const cfg = { perSpeaker: 4, perEnemy: 6, global: 1.5, perRoomIntent: 6, enemyBubbles: 2, idle: [12, 25], idleRadius: 160, onTime: { min: 1.6, perChar: 0.06, pad: 0.8 }, prerender: {}, chance: {}, bigHit: 0.2, hush: { hurtBelow: 0.3, oilBelow: 0.2, cooldown: 20 }, ...(talk?.npcs?.bark || {}), ...(config || {}) };
  const bus = game.bus;
  const now = () => game.time ?? 0;
  const last = { global: -1e9, speaker: new Map(), roomIntent: new Map(), hush: -1e9 };
  const cache = new Map();            // `${speakerId}|${intent}|${tag}` → pre-rendered lines
  const beastSeen = new Set();        // beast def ids noticed this act
  const swarmSpoke = new Set();       // gloss kinds that already sang this room
  const swarmSpeakers = new Map();    // kind → speaker info for the room's swarm voice
  const idleNext = new Map();         // npc id → time of next idle line
  let act = null;
  game.bubbles = game.bubbles || [];
  game.talkLog = game.talkLog || [];
  const offs = [];
  const on = (type, fn) => { if (bus?.on) offs.push(bus.on(type, p => { try { fn(p || {}); } catch (e) { console.warn('[barks]', type, e); } })); };

  const chance = key => random() < (cfg.chance?.[key] ?? 1);
  const onTime = text => Math.max(cfg.onTime.min, cfg.onTime.perChar * String(text).length + cfg.onTime.pad);
  const speakerOf = e => (e && e.kind !== 'player' && talk?.enemySpeaker) ? talk.enemySpeaker(e) : null;
  const where = e => e ? { x: e.x, y: e.y - (e.h || 10) } : {};

  /** 01 §12.8's limits. Story and boss lines skip them (they are still recorded). */
  function allowed(speakerId, intent, { enemy = false, priority = 'bark' } = {}) {
    const t = now();
    if (PRIORITY[priority] < PRIORITY.boss) {
      if (t - last.global < cfg.global) return false;
      if (t - (last.speaker.get(speakerId) ?? -1e9) < (enemy ? Math.max(cfg.perEnemy, cfg.perSpeaker) : cfg.perSpeaker)) return false;
      if (intent && t - (last.roomIntent.get(intent) ?? -1e9) < cfg.perRoomIntent) return false;
    }
    last.global = t; last.speaker.set(speakerId, t); if (intent) last.roomIntent.set(intent, t);
    return true;
  }

  /** A pre-rendered line if one is waiting, else a live one. */
  function draw(speakerId, intent, ctx = {}) {
    const key = `${speakerId}|${intent}|${[].concat(ctx.tag || []).join(',')}`;
    const q = cache.get(key); if (q && q.length) return q.shift();
    return talk?.say ? talk.say(speakerId, intent, ctx) : null;
  }

  const hexToRgb = h => { if (!h || typeof h !== 'string') return undefined; const n = parseInt(h.replace('#', ''), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, 1]; };
  /** What the subtitle shows: babble is glossed, never passed off as English (01 §12.6). */
  function display(line) {
    if (!line.gloss) return line.text;
    if (/^\[.*\]$/.test(line.text.trim())) return line.text;
    return `${line.name || 'It'} ${line.speakerId === 'npc_hush' ? 'chirrs' : 'murmurs'}: "${line.text}"`;
  }

  /** Publish a line: subtitle, bubble, log, bus. Returns the payload (or null). */
  function emit(line, { x = null, y = null, entity = null, priority = 'npc', subtitle = true } = {}) {
    if (!line || !line.text) return null;
    const t = now(); const text = display(line); const dur = onTime(text);
    const who = line.narration || line.gloss ? null : line.name;
    const pos = entity ? where(entity) : { x, y };
    if (subtitle) game.subtitle = { who, text, color: hexToRgb(line.color), t, dur, italic: !!(line.narration || line.gloss), speakerId: line.speakerId };
    if (!line.narration && pos.x != null && PRIORITY[priority] <= PRIORITY.npc) {
      game.bubbles.push({ speakerId: line.speakerId, text, x: pos.x, y: pos.y, entity, t, dur, color: line.color, enemy: !!line.enemy });
      const enemies = game.bubbles.filter(b => b.enemy);
      while (enemies.length > cfg.enemyBubbles) { const old = enemies.shift(); game.bubbles.splice(game.bubbles.indexOf(old), 1); }
    }
    game.talkLog.push({ t, speakerId: line.speakerId, who: line.name, text, act, narration: !!line.narration });
    if (game.talkLog.length > 200) game.talkLog.shift();
    const payload = { ...line, text, speech: line.gloss ? line.text.replace(/^\[|\]$/g, '').replace(/["“”]/g, '') : line.speech, x: pos.x, y: pos.y, priority: PRIORITY[priority] ?? 2, dur };
    bus?.emit?.('talk.line', payload);
    return payload;
  }

  /** Throttle, draw and emit in one go. */
  function bark(speakerId, intent, ctx = {}, { entity = null, enemy = false, priority = 'bark', subtitle = true } = {}) {
    if (!speakerId || !allowed(speakerId, intent, { enemy, priority })) return null;
    const line = draw(speakerId, intent, ctx); if (!line) return null;
    return emit(line, { entity, priority, subtitle });
  }

  function swarmSpeaker(kind, entity) {
    if (!swarmSpeakers.has(kind)) swarmSpeakers.set(kind, talk.enemySpeaker(entity));
    return swarmSpeakers.get(kind);
  }
  const allyId = () => (game.allies || []).map(a => a.npcId || a.id).find(id => talk?.npc?.(id)) || null;
  const hushHere = () => !!(game.flags?.hush || game.story?.hush || game.hush);
  function hush(tag) {
    if (!hushHere() || now() - last.hush < cfg.hush.cooldown) return null;
    const out = bark('npc_hush', 'hush_chirr', { tag }, { entity: game.hushBody || game.player, priority: 'npc' });
    if (out) last.hush = now();
    return out;
  }

  /** Draw a few lines ahead for everything that can talk in this room and tell the voice bridge. */
  function prerender() {
    const lines = []; let spawns = 0;
    for (const e of game.entities || []) {
      if (e.dead || e.kind === 'player') continue;
      const sp = speakerOf(e); if (!sp) continue;
      const jobs = sp.talks ? ['enemy_opener', 'combat_taunt', 'combat_hurt'] : (swarmSpeakers.has(sp.kind) ? [] : ['beast_snarl']);
      if (!sp.talks) swarmSpeakers.set(sp.kind, sp); else if (++spawns > 6) continue;
      for (const intent of jobs) {
        const n = cfg.prerender?.[intent] ?? 2; const key = `${sp.id}|${intent}|`; const q = cache.get(key) || [];
        for (let i = 0; i < n; i++) { const l = talk.say(sp.id, intent); if (l) { q.push(l); lines.push(l); } }
        cache.set(key, q);
      }
    }
    if (lines.length) bus?.emit?.('talk.prerender', { lines });
    return lines.length;
  }

  // ---------------------------------------------------------------- bus wiring
  on('room.enter', () => {
    const room = game.room || {}; const roomAct = room.act || room.json?.act || null;
    if (roomAct !== act) { beastSeen.clear(); act = roomAct; }
    talk?.newRoom?.({ place: room.place || room.json?.place || null, act: roomAct, lit: !!game.story?.lit?.[roomAct] });
    last.roomIntent.clear(); cache.clear(); swarmSpoke.clear(); swarmSpeakers.clear(); idleNext.clear(); game.bubbles.length = 0;
    prerender();
  });
  on('enemy.alert', ({ enemy }) => {
    const sp = speakerOf(enemy);
    if (sp?.talks) { if (chance('enemy_opener')) bark(sp.id, 'enemy_opener', {}, { entity: enemy, enemy: true }); return; }
    if (sp?.gloss) { if (swarmSpoke.has(sp.kind)) return; swarmSpoke.add(sp.kind); const s = swarmSpeaker(sp.kind, enemy); bark(s.id, 'beast_snarl', {}, { entity: enemy, enemy: true }); return; }
    const defId = enemy?.def?.id; if (!defId || beastSeen.has(defId) || !chance('beast_snarl')) return;
    beastSeen.add(defId);
    bark('narrator', 'beast_snarl', { foe: defId }, { priority: 'bark' });
  });
  on('player.hurt', ({ amount = 0, source }) => {
    const p = game.player;
    if (p && p.maxHp && p.hp / p.maxHp < cfg.hush.hurtBelow) hush('hurt');   // the warning first; a taunt can wait
    const sp = speakerOf(source);
    if (sp?.talks && chance('combat_taunt')) bark(sp.id, 'combat_taunt', {}, { entity: source, enemy: true });
    const ally = allyId(); if (ally && chance('ally_bark')) bark(ally, 'warning', {}, { entity: game.allies.find(a => (a.npcId || a.id) === ally) });
  });
  on('hit', ({ target, amount = 0 }) => {
    if (!target || target.kind === 'player' || target.dead) return;
    const sp = speakerOf(target); if (!sp?.talks) return;
    if (amount >= cfg.bigHit * (target.maxHp || target.hp || 1) && chance('combat_hurt')) bark(sp.id, 'combat_hurt', {}, { entity: target, enemy: true });
  });
  on('knockout', ({ target }) => { const sp = speakerOf(target); if (sp?.kind === 'knell') bark(sp.id, 'combat_flee', {}, { entity: target, enemy: true, priority: 'npc' }); });
  on('kill', ({ target }) => {
    if (!target || target.kind === 'player') return;
    const ally = allyId(); if (ally && chance('ally_bark')) bark(ally, 'combat_bark', {}, { entity: game.allies.find(a => (a.npcId || a.id) === ally) });
  });
  on('player.die', ({ source }) => {
    const boss = source?.bossId || game.boss?.id;
    if (boss) { const l = talk.bossLine?.(boss, 'kill'); if (l) emit(l, { entity: source, priority: 'boss' }); return; }
    let sp = speakerOf(source);
    if (!sp?.talks) { const p = game.player; let best = null, bd = 1e9; for (const e of game.entities || []) { if (e.dead || e.kind === 'player') continue; const s = speakerOf(e); if (!s?.talks) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; best = e; sp = s; } } source = best; }
    if (sp?.talks) bark(sp.id, 'combat_kill', {}, { entity: source, enemy: true, priority: 'npc' });
  });
  on('cast.release', () => { const p = game.player; if (p && p.maxOil && p.oil / p.maxOil < cfg.hush.oilBelow) hush('oil'); });
  on('talk.request', ({ speakerId, intent, ctx = {}, lineId, x = null, y = null, entity = null, priority = 'npc' }) => {
    if (lineId) { const l = talk?.line?.(lineId); if (l) emit(l, { x, y, entity, priority: priority === 'npc' ? 'story' : priority }); return; }
    if (PRIORITY[priority] >= PRIORITY.npc) { const l = talk?.say?.(speakerId, intent, ctx); if (l) emit(l, { x, y, entity, priority }); return; }
    bark(speakerId, intent, ctx, { entity, priority });
  });
  on('boss.line', ({ boss, slot, x = null, y = null, entity = null, flags }) => {
    const l = talk?.bossLine?.(boss, slot, { flags: flags || game.story?.flags }); if (l) emit(l, { x, y, entity, priority: 'boss' });
  });

  /** Per frame: hub idle chatter for game.npcs ({ id, x, y }) near the player, and old bubbles out. */
  function update() {
    const t = now();
    for (let i = game.bubbles.length - 1; i >= 0; i--) { const b = game.bubbles[i]; if (t - b.t > b.dur) game.bubbles.splice(i, 1); else if (b.entity) { b.x = b.entity.x; b.y = b.entity.y - (b.entity.h || 10); } }
    const p = game.player; if (!p || !game.npcs?.length) return;
    for (const n of game.npcs) {
      if (Math.hypot(n.x - p.x, n.y - p.y) > cfg.idleRadius || n.busy) continue;
      if (!idleNext.has(n.id)) { idleNext.set(n.id, t + cfg.idle[0] + random() * (cfg.idle[1] - cfg.idle[0])); continue; }
      if (t < idleNext.get(n.id)) continue;
      idleNext.set(n.id, t + cfg.idle[0] + random() * (cfg.idle[1] - cfg.idle[0]));
      const lit = !!game.story?.lit?.[act]; const intent = random() < 0.7 ? 'idle_chatter' : 'rain_talk';
      bark(n.id, intent, { tag: [act || 'act1', lit ? 'lit' : 'dark'] }, { x: n.x, y: n.y - 16, priority: 'idle' });
    }
  }

  return { emit, bark, update, prerender, allowed, cache, dispose() { for (const off of offs) off?.(); offs.length = 0; } };
}
