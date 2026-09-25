// Sound for Emberveil 2, bolted on from the outside.
//
// The rule here was: do not touch stage.js, and add exactly one import and one call to main.js. So
// this module wraps the stage's own methods at runtime — every call still does what it did, and on
// the way through it also plays a sound. Nothing in the game has to know sound exists.
//
//   import { installSfx } from './sfx-bridge.js';
//   const sound = await installSfx({ stage, game });     // once, after the Stage is created
//
// What it hooks:
//   stage.attack / cast                → the swing or the spell going out
//   stage.impact / aoe / fx.impact     → what it sounds like when it lands (dots included)
//   stage.status / pulseStatus         → a status landing, and its per-round tick
//   stage.heal / reviveFx              → heals and resurrections
//   stage.down                         → a body hitting the ground (humanoid / beast / construct)
//   stage.setBackdrop                  → the ambience bed for wherever the party is standing
//   stage.camp / clearCamp             → the campfire loop
//   game.travel                        → a footstep on the road
//   the narrative panel                → loot, gold, level-ups, quests, misses, ambushes
//   clicks and hovers anywhere         → interface sounds
//
// Panning follows the character's x position on the stage, so a spell landing on the enemy line is
// audibly on the right. Loudness is handled entirely by sfx/js/sfx.js — every clip is measured and
// levelled when it is built, which is why a recorded punch and a synthesized fireball sit at the
// same volume here.
import { Sfx, busCap } from '../../../sfx/js/sfx.js';
import { makeStore } from '../../../shared/store.js';
import { elementName } from '../../../avatar-3d/js/spellfx.js';

/** Stage x positions run about ±3 world units; keep the pan short of the extremes. */
const PAN_SPREAD = 0.7, PAN_RANGE = 3;
const panOf = x => Math.max(-1, Math.min(1, (Number(x) || 0) / PAN_RANGE)) * PAN_SPREAD;

/**
 * Which ambience bed a scenery id wants. Tags come from assets/data/manifest.json, and the id is
 * matched by name when the manifest is not to hand.
 */
export const AMBIENCE_BY_TAG = [
  ['void', 'ambience.void'], ['cosmic', 'ambience.void'], ['abstract', 'ambience.void'],
  ['volcanic', 'ambience.fire'], ['hellscape', 'ambience.fire'], ['fire', 'ambience.fire'],
  ['cave', 'ambience.cave'], ['underground', 'ambience.cave'], ['tomb', 'ambience.cave'], ['dungeon', 'ambience.cave'],
  ['swamp', 'ambience.marsh'], ['fog', 'ambience.marsh'], ['abyss', 'ambience.marsh'],
  ['forest', 'ambience.forest'], ['thorns', 'ambience.forest'],
  ['settlement', 'ambience.town'], ['market', 'ambience.town'], ['urban', 'ambience.town'], ['throne', 'ambience.town'], ['hall', 'ambience.town'],
  ['mountain', 'ambience.mountain'], ['snow', 'ambience.mountain'], ['high', 'ambience.mountain'], ['crystal', 'ambience.mountain'],
];
const AMBIENCE_BY_NAME = [
  [/void|rift|cosmic|eternal/, 'ambience.void'],
  [/ember|hell|volcan|ash|forge/, 'ambience.fire'],
  [/cave|barrow|depths|crypt|mine|core/, 'ambience.cave'],
  [/marsh|swamp|bog|fen|mire/, 'ambience.marsh'],
  [/wood|forest|grove|thorn/, 'ambience.forest'],
  [/town|city|village|tavern|market|throne|nexus/, 'ambience.town'],
  [/mountain|peak|reach|dragon|snow|summit/, 'ambience.mountain'],
];

/** Death sounds pick a body type from what is actually standing there. */
const CONSTRUCT = /golem|construct|automaton|statue|effigy|sentinel|colossus|armou?r|idol/i;

/**
 * Lines the game writes into the narrative panel that deserve a sound. First match wins.
 * This is how loot, gold, level-ups and quest completions get stings without main.js knowing.
 */
export const NARRATIVE_RULES = [
  { re: /\bLoot:\s/, sound: el => 'loot.' + rarityOf(el) },
  { re: /reaches level \d+/, sound: () => 'levelup' },
  { re: /Quest complete|Bounty complete|errand:|cleared\.\s*$|is open\b/, sound: () => 'quest.complete' },
  { re: /Something comes out of the dark|raiders are dead/, sound: () => 'night.ambush' },
  { re: /\bmisses\b/, sound: () => 'melee.miss' },
  { re: /\+\d+ gold|turns up a cache|gold\b.*\bspent/, sound: () => 'coin' },
  { re: /\bhas a name now\b|wipes .* down/, sound: () => 'equip' },
];
const RARITIES = ['legendary', 'epic', 'rare', 'magic', 'uncommon', 'normal', 'common'];
function rarityOf(node) {
  for (const r of RARITIES) if (node.querySelector && node.querySelector('.' + r)) return r;
  return 'normal';
}

/**
 * Install sound into a running game.
 * @param {object}  opts
 * @param {Stage}   opts.stage     the Emberveil stage (never modified on disk, only wrapped here)
 * @param {Game}    opts.game      the game state, for travel and zone lookups
 * @param {object} [opts.store]    a makeStore() instance; one is created if you do not pass one
 * @param {Document|HTMLElement} [opts.root]  where to look for the settings controls and the UI
 * @returns {Promise<object>} the bridge: { sfx, settings, dispose, ambienceFor }
 */
export async function installSfx({ stage, game = null, store = null, root = document } = {}) {
  const prefs = store || makeStore('emberveil-sfx', 1);
  const saved = prefs.get('settings', {}) || {};

  // A sample pack is optional: if assets/ is missing, fall back to pure synthesis rather than
  // leaving the game silent.
  let sfx;
  try {
    sfx = await Sfx.create({ method: saved.method || 'hybrid', volume: saved.master == null ? 0.8 : saved.master });
  } catch (err) {
    console.warn('[sfx] catalog failed to load; the game runs silent:', err.message);
    return { sfx: null, dispose() {}, settings: null };
  }
  const hasPack = sfx.ids().some(id => sfx.sourceOf(id, 'library') === 'library');
  if (!saved.method && !hasPack) sfx.setMethod('synth');
  sfx.setBusVolume('sfx', saved.sfx == null ? 1 : saved.sfx);
  sfx.setBusVolume('ui', saved.ui == null ? 0.8 : saved.ui);
  sfx.setBusVolume('ambience', saved.ambience == null ? 0.6 : saved.ambience);
  sfx.setMuted(!!saved.muted);

  const save = () => prefs.set('settings', {
    method: sfx.method(), master: sfx.volume, muted: sfx.muted,
    sfx: sfx.busVolume('sfx'), ui: sfx.busVolume('ui'), ambience: sfx.busVolume('ambience'),
  });

  const undo = [];                 // every wrapper records how to put the original back
  const wrap = (obj, name, make) => {
    if (!obj || typeof obj[name] !== 'function') return;
    const orig = obj[name].bind(obj);
    obj[name] = make(orig);
    undo.push(() => { obj[name] = orig; });
  };

  // Stage methods call the effects layer internally. Both are wrapped (some of the game talks
  // straight to stage.fx), so a depth counter keeps one action from making two sounds.
  let depth = 0;
  const outer = fn => { depth++; try { return fn(); } finally { queueMicrotask(() => { depth--; }); } };
  const inner = () => depth === 0;

  const charPan = id => {
    const c = stage.chars?.get(id);
    return c ? panOf(c.group.position.x) : 0;
  };
  const cue = (id, opts) => { sfx.play(id, opts).catch(() => {}); };

  // ---- fighting ---------------------------------------------------------------------------

  wrap(stage, 'attack', orig => (id, targetId) => outer(() => {
    cue('melee.swing', { pan: charPan(id) });
    return orig(id, targetId);
  }));

  // hit() is only the flinch shake; the impact() call that follows it carries the sound, so this
  // wrapper deliberately stays quiet rather than hitting twice.
  wrap(stage, 'hit', orig => id => outer(() => orig(id)));

  wrap(stage, 'cast', orig => (sourceId, targetId, opts = {}) => outer(() => {
    const kind = opts.kind || 'magic';
    if (kind !== 'melee' && kind !== 'attack') {
      const el = elementName(opts.element || 'arcane');
      if (opts.flash !== false) cue('cast.start', { pan: charPan(sourceId) });
      cue('spell.' + el + '.launch', { pan: charPan(sourceId), at: opts.flash !== false ? 0.12 : 0 });
    }
    return orig(sourceId, targetId, opts);
  }));

  wrap(stage, 'impact', orig => (targetId, element = 'physical', crit = false) => outer(() => {
    impactSound(elementName(element), crit, charPan(targetId));
    return orig(targetId, element, crit);
  }));

  wrap(stage, 'aoe', orig => (ids = [], element = 'arcane', crit = false) => outer(() => {
    ids.forEach((id, i) => impactSound(elementName(element), crit, charPan(id), i * 0.05));
    return orig(ids, element, crit);
  }));

  wrap(stage, 'status', orig => (id, type, on = true) => outer(() => {
    if (on && !hasStatus(id, type)) cue('status.' + String(type).toLowerCase() + '.apply', { pan: charPan(id) });
    return orig(id, type, on);
  }));

  wrap(stage, 'pulseStatus', orig => (id, type) => outer(() => {
    cue('status.' + String(type).toLowerCase() + '.tick', { pan: charPan(id) });
    return orig(id, type);
  }));

  wrap(stage, 'heal', orig => id => outer(() => { cue('heal', { pan: charPan(id) }); return orig(id); }));
  wrap(stage, 'reviveFx', orig => id => outer(() => { cue('revive', { pan: charPan(id) }); return orig(id); }));

  wrap(stage, 'down', orig => id => outer(() => {
    const c = stage.chars?.get(id);
    const name = (c?.ch?.templateId || c?.ch?.name || '') + '';
    const kind = CONSTRUCT.test(name) ? 'construct' : c?.ctrl?.isCreature ? 'beast' : 'humanoid';
    cue('death.' + kind, { pan: charPan(id) });
    return orig(id);
  }));

  // Damage-over-time ticks and a few other effects go straight to the effects layer, so hook that
  // too — the depth counter keeps it silent when a stage method is already handling the sound.
  if (stage.fx) {
    wrap(stage.fx, 'impact', orig => (o = {}) => {
      if (inner()) impactSound(elementName(o.element || 'arcane'), !!o.crit, panOf(o.at?.x), 0, o.scale && o.scale < 0.8 ? 0.6 : 1);
      return orig(o);
    });
    wrap(stage.fx, 'cast', orig => (o = {}) => {
      if (inner()) cue('cast.start', { pan: panOf(o.at?.x) });
      return orig(o);
    });
    wrap(stage.fx, 'heal', orig => (o = {}) => { if (inner()) cue('heal', { pan: panOf(o.at?.x) }); return orig(o); });
    wrap(stage.fx, 'revive', orig => (o = {}) => { if (inner()) cue('revive', { pan: panOf(o.at?.x) }); return orig(o); });
  }

  function hasStatus(id, type) {
    try { return (stage.statusesOn(id) || []).includes(String(type).toLowerCase()); } catch { return false; }
  }
  function impactSound(el, crit, pan, at = 0, gain = 1) {
    if (el === 'physical') cue(crit ? 'melee.crit' : 'melee.hit', { pan, at, gain });
    else cue('spell.' + el + '.impact', { pan, at, gain, ...(crit ? {} : {}) });
  }

  // ---- place and time ----------------------------------------------------------------------

  const manifest = await loadManifest();
  /** The ambience loop for a scenery / zone id. Exported on the bridge so tests can check it. */
  function ambienceFor(id) {
    const tags = manifest?.scenery?.[id]?.tags || [];
    for (const [tag, sound] of AMBIENCE_BY_TAG) if (tags.includes(tag)) return sound;
    const name = String(id || '');
    for (const [re, sound] of AMBIENCE_BY_NAME) if (re.test(name)) return sound;
    return 'ambience.wind';
  }

  wrap(stage, 'setBackdrop', orig => (id, night = false) => {
    sfx.ambience(ambienceFor(id));
    return orig(id, night);
  });
  wrap(stage, 'camp', orig => (members, opts) => { sfx.play('camp.fire').catch(() => {}); return orig(members, opts); });
  wrap(stage, 'clearCamp', orig => () => { sfx.stopLoop('camp.fire'); return orig(); });

  if (game) wrap(game, 'travel', orig => (...a) => { cue('travel.step'); return orig(...a); });

  // ---- the narrative panel ------------------------------------------------------------------

  const narrative = root.getElementById ? root.getElementById('narrative') : root.querySelector('#narrative');
  let narrObserver = null;
  if (narrative) {
    narrObserver = new MutationObserver(records => {
      for (const rec of records) {
        for (const node of rec.addedNodes) {
          if (node.nodeType !== 1) continue;
          for (const part of [node, ...node.querySelectorAll('p, h4')]) {
            const text = part.textContent || '';
            const rule = NARRATIVE_RULES.find(r => r.re.test(text));
            if (rule) { cue(rule.sound(part)); break; }
          }
        }
      }
    });
    narrObserver.observe(narrative, { childList: true, subtree: true });
    undo.push(() => narrObserver.disconnect());
  }

  // ---- interface ------------------------------------------------------------------------------

  const doc = root.ownerDocument || root;
  const isButton = t => t && t.closest && t.closest('button, .tab, .card, a.card, summary, [role="button"]');
  let lastHover = 0, lastHoverEl = null;
  const onClick = e => {
    const b = isButton(e.target);
    if (!b || b.disabled) return;
    cue(b.matches('.tab, [data-tab]') ? 'ui.tab' : 'ui.click');
  };
  const onHover = e => {
    const b = isButton(e.target);
    if (!b || b === lastHoverEl || b.disabled) return;
    const now = performance.now();
    if (now - lastHover < 60) return;
    lastHover = now; lastHoverEl = b;
    cue('ui.hover');
  };
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('pointerover', onHover, true);
  undo.push(() => { doc.removeEventListener('click', onClick, true); doc.removeEventListener('pointerover', onHover, true); });

  // Dialogs opening and closing: <dialog> flips its `open` attribute, so watch for that.
  const dialogs = [...(root.querySelectorAll ? root.querySelectorAll('dialog') : [])];
  const dialogObs = new MutationObserver(recs => {
    for (const r of recs) cue(r.target.open ? 'ui.open' : 'ui.close');
  });
  for (const d of dialogs) dialogObs.observe(d, { attributes: true, attributeFilter: ['open'] });
  undo.push(() => dialogObs.disconnect());

  // ---- the Settings panel ---------------------------------------------------------------------

  const $ = id => (root.getElementById ? root.getElementById(id) : root.querySelector('#' + id));
  const settings = {
    method: $('sfx-method'), master: $('sfx-volume'), ui: $('ui-volume'), amb: $('ambience-volume'), mute: $('mute-sfx'),
  };
  if (settings.method) {
    settings.method.replaceChildren();
    for (const m of sfx.methods()) {
      const o = doc.createElement('option');
      o.value = m.id;
      o.textContent = `${m.name} — ${m.badge}`;
      settings.method.append(o);
    }
    settings.method.value = sfx.method();
    settings.method.onchange = () => { sfx.setMethod(settings.method.value); save(); };
  }
  const slider = (input, apply, read) => {
    if (!input) return;
    input.value = read();
    input.oninput = () => { apply(+input.value); save(); };
  };
  slider(settings.master, v => sfx.setVolume(v), () => sfx.volume);
  slider(settings.ui, v => sfx.setBusVolume('ui', v), () => sfx.busVolume('ui'));
  // The ambience bus is capped in sfx.js (a bed plays for a whole act, so it is mixed under the rest).
  // Move the slider's top end down to the cap as well, so it never offers a level it cannot give.
  if (settings.amb) settings.amb.max = String(busCap('ambience'));
  slider(settings.amb, v => sfx.setBusVolume('ambience', v), () => sfx.busVolume('ambience'));
  if (settings.mute) {
    settings.mute.checked = sfx.muted;
    settings.mute.onchange = () => { sfx.setMuted(settings.mute.checked); save(); };
  }

  // Warm up the sounds a fight needs, so the first hit of the first battle is not late.
  sfx.preload(['melee.swing', 'melee.hit', 'melee.crit', 'melee.miss', 'cast.start', 'heal',
    'spell.physical.impact', 'spell.arcane.impact', 'spell.fire.impact', 'ui.click', 'ui.hover'])
    .catch(() => {});

  return {
    sfx, settings, ambienceFor,
    /** Put every wrapped method back and stop every loop — used by tests and a clean teardown. */
    dispose() { for (const fn of undo.reverse()) { try { fn(); } catch { /* already gone */ } } sfx.stopAll(); },
  };
}

/** The shared asset manifest, for scenery tags. A miss is fine — names are matched instead. */
async function loadManifest() {
  try {
    const res = await fetch(new URL('../../../assets/data/manifest.json', import.meta.url).href);
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

export default installSfx;
