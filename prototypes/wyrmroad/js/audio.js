// Sound: fight events → the shared sound library (sfx/js/sfx.js, real CC0 recordings). Built on the first tap or key
// press (phones allow sound only after one, and iPhone needs a nudge on later taps — lessons rule 30). One-shots only,
// except one ambience bed per chapter (game-standards §4: only ambience loops).
let sfx = null, starting = null, volume = 0.8, bed = null, wantBed = null;
const AMBIENCE = { millbrook: 'ambience.town', thornwood: 'ambience.forest', saltmere: 'ambience.wind', greyspire: 'ambience.cave', spine: 'ambience.mountain', crownhollow: 'ambience.storm' };
const LOOT = { common: 'loot.common', fine: 'loot.uncommon', rare: 'loot.rare', storied: 'loot.epic', legendary: 'loot.legendary' };
// every spell's own sound (owner #108: no crowd sounds; #113: spells never sound like a bow). A spell fx missing here
// gets a plain cast sound, and tests/ui/sound-map.test.mjs fails until it has one.
export const SPELL = { quake: 'quake.rumble', gale: 'blade.whirl', iron: 'status.barrier.apply', shadow: 'spell.shadow.launch', fan: 'spell.physical.launch',
  cuts: 'melee.swing', fire: 'spell.fire.launch', frost: 'spell.ice.launch', meteor: 'meteor.fall', heal: 'heal', smite: 'spell.holy.impact', sanctuary: 'spell.holy.launch' };
// every shot by how it looks: only the crossbow's bolt is a bow sound; magic sounds like magic (#113)
export const SHOT = { bolt: 'arrow.shot', spark: 'magic.missile', arcane: 'spell.arcane.launch', blade: 'spell.physical.launch', fire: 'spell.fire.launch',
  wyrmfire: 'spell.fire.launch', thorn: 'spell.nature.launch', lantern: 'spell.holy.launch', bluelamp: 'spell.ice.launch', hook: 'grapple.fire', chain: 'grapple.fire',
  arrow: 'arrow.shot', net: 'grapple.fire', glass: 'spell.arcane.launch' };   // a thrown road weapon ('thrown:…') whooshes
/** An area blow's landing by how it looks (fire, roots, glass…); anything else is a small blast. */
const zoneSound = look => (/fire|ember|molten|wyrm/.test(look || '') ? 'spell.fire.impact' : /root|thorn|nature/.test(look || '') ? 'spell.nature.impact'
  : /glass|frost|ice/.test(look || '') ? 'spell.ice.impact' : /quake|slam/.test(look || '') ? 'stone.crumble' : 'explosion.small');
// ids this game never plays: the cartoon fanfare becomes the grounded horn (#108) wherever a screen asks for it
const ALIAS = { 'quest.complete': 'victory.horn', 'crowd.cheer': 'victory.horn' };

export function initAudio() {
  if (sfx) { try { sfx.wake?.(); } catch { /* fine */ } return; }
  if (starting) return;
  starting = import('../../../sfx/js/sfx.js')
    .then(({ Sfx }) => Sfx.create({ method: 'hybrid', volume }))
    .then(s => { sfx = s; if (wantBed) ambience(wantBed); })
    .catch(e => console.info('[wyrmroad] no sound', e?.message));
}
export function setVolume(v) { volume = v; try { sfx?.setVolume?.(v); } catch { /* fine */ } }
export function play(id, opts) { try { sfx?.cue(ALIAS[id] || id, opts); } catch { /* a missing clip is not worth a crash */ } }

/** The chapter's ambience bed (null stops it). */
export function ambience(chapterId) {
  wantBed = chapterId;
  const id = chapterId ? AMBIENCE[chapterId] : null;
  if (!sfx || id === bed) return;
  try { sfx.ambience(id); } catch { /* fine */ }
  bed = id;
}

/** One frame's fight events. G = the view state (to find who did what), pan(x) → −1..1. */
export function soundEvents(G, events, pan = () => 0) {
  if (!sfx) return;
  const ent = id => G.heroes.find(h => h.id === id) || G.foes.find(f => f.id === id);
  let hits = 0;
  const once = new Set();           // one frame never plays the same sound twice (a five-blade fan, a spell + its own shot)
  const play1 = (id, p) => { if (once.has(id)) return; once.add(id); play(id, p); };
  for (const e of events) {
    const who = e.id != null ? ent(e.id) : null;
    const p = { pan: e.x != null ? pan(e.x) : who ? pan(who.x) : 0 };
    switch (e.type) {
      case 'move':
        if (e.kind === 'channel') play1('blade.whirl', p);    // one whirl per turn of a held spin (Iron Gale)
        else if ((e.kind === 'combo' || e.kind === 'heavy' || e.kind === 'dash' || e.kind === 'air' || e.kind === 'pickup') && !castsShot(G, who, e)) play1('melee.swing', p);
        break;
      case 'hit': if (hits++ < 3) play(e.crit ? 'melee.crit' : e.heavy ? 'fragment.crash.small' : 'melee.hit', p); break;
      case 'block': play('melee.block', p); break;
      case 'shieldblock': play('melee.block', p); break;
      case 'perfect': play('status.deflect.apply', p); break;
      case 'armor': play('status.block.apply', p); break;
      case 'throw': play('melee.swing', p); break;
      case 'land': if (e.hard) play('travel.step', p); break;
      case 'kill': play(e.boss ? 'death.construct' : who?.def?.body === 'creature' ? 'death.beast' : 'death.humanoid', p); break;
      case 'spell': play1(SPELL[e.fx] || 'cast.start', p); break;
      case 'zoneHit': play1(zoneSound(e.look), p); break;
      case 'shot': play1(SHOT[e.look] || 'spell.physical.launch', p); break;
      case 'crate': play1('crate.break', p); break;
      case 'food': play('heal', p); break;
      case 'gold': play('coin', p); break;
      case 'loot': play(LOOT[e.item?.rarity] || 'loot.common', p); break;
      case 'levelUp': play('levelup'); break;
      case 'boss': play('dragon.roar'); break;
      case 'go': play('ui.open'); break;
      case 'heroDown': play('death.humanoid', p); break;
      case 'revive': case 'respawn': play('revive', p); break;
      case 'breaker': play('explosion.small', p); break;
      case 'heal': break;
      case 'nomana': play('ui.error'); break;
      case 'pickup': play('equip', p); break;
      case 'quake': play('quake.rumble'); break;
      case 'chapterClear': play('victory.horn'); break;
    }
  }
}

/** A move that throws a shot (the Arcanist's staff casts) makes the shot's sound, not a sword swing. */
function castsShot(G, who, e) {
  if (!who || who.side !== 'hero') return false;
  const C = G.data?.classes?.classes?.[who.cls]; if (!C) return false;
  const mv = e.kind === 'combo' ? C.combo?.find(m => m.anim === e.anim && (m.shot || m.fan)) : C[e.kind];
  return !!(mv?.shot || mv?.fan);
}
