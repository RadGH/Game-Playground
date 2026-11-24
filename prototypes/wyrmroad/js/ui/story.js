// Story scenes (data/story.json), ACTED OUT on the chapter's own street (owner #110: "the characters actually on screen
// moving around and interacting with each other" — js/render/stage.js): the heroes walk in, the scene's cast stands on
// its marks, everyone faces whoever talks, the speaker steps toward who they talk to and gestures, their mouth moves while
// the line is written, and the camera frames them above the speech box. The speech box keeps the speaker's portrait,
// a name plate and the line revealed quickly. Advance: A / Space / Enter / tap (the first press finishes the line).
// Skip: Esc / B / the Skip button. The last scene ends with the two-ending choice as two big buttons; the ending scene
// follows and the hero's ending is saved.
//
// ---------------------------------------------------------------------------------------------------------------------
// STAGE DIRECTIONS (for whoever writes story.json). A line is [speaker, text] or [speaker, text, direction] where
// direction is ONE object or a LIST of them. Every field is optional:
//
//   { "who": "grell",        who is directed — a speaker id, "hero" (the lead hero), "hero2".."hero4"; default: the
//                            line's speaker. Someone not on stage yet walks in (from "enter", default the right).
//     "to": 2,               walk somewhere first: metres from the stage centre (− = left), or a speaker id / "hero"
//                            (stand beside them), "mark" (back to their own place), "off" (walk off and leave)
//     "z": -0.8,             with a numeric "to": depth (− = up the street, + = toward the camera)
//     "anim": "point",       one gesture when they get there — any Chibi clip: talk point cheer shrug nod headShake
//                            laugh clap salute bowGreet wave kneel pray crossArms lookAround stretch drink, or a strike
//                            (slam, overhead, castPoint…). A boss with a creature body roars ("talk") or strikes ("attack").
//     "loop": "crossArms",   a pose held afterwards (crossArms kneel sitGround pray sleep lookAround…; "none" ends it)
//     "face": "hero",        who to look at: a speaker id, "hero", "camera", "left" or "right"
//                            (default: everyone looks at the speaker, the speaker at who they talk to)
//     "mood": "angry",       the face: neutral happy sad angry surprised afraid
//     "cam": "wide",         the camera: "speaker" (default), "two" (speaker + who they face), "wide" (everyone),
//                            "sky" (low, looking up to the wyrm on the horizon), "deep" (low, down into the dark behind
//                            the street — the Undermaw), "low" (the speaker from below, heroic), "pullback" (everyone,
//                            then slowly far back and up — endings), "orbit" (keeps drifting round), or a speaker id
//     "fx": "bell",          a story moment at `who` (one or a list): bell (rings at the street's Great Bell if it has
//                            one), lanternBreak (the lantern on the hero's belt shatters), rise, roar, fire / greenfire
//                            (a breath line across the stage), dawn (a warm sun climbs behind the stage and stays),
//                            flash, quake, heal, crown, chains, calm
//     "enter": "left",       which side someone not on stage yet walks in from
//     "exit": true,          walk off after this line (same as "to": "off")
//     "wait": 0.6 }          seconds before this direction starts
//
// Example: ["grell", "Rooks! Out, over the river!", [{ "anim": "point", "mood": "angry" }, { "who": "grell", "to": "off", "wait": 1.2 }]]
//
// A line with no direction: the speaker steps toward who they talk to and gestures (talk; point on "!", shrug on a
// hero's "?", a shake of the head on "No…"/"Stop…"), the listeners turn to them, and the camera frames them.
// GIANTS (js/render/stage.js GIANTS) stand behind the street facing it when the scene's cast or a direction names
// them: Ossmara (not on her own back or inside the lantern), the Lantern's voice as its flame ghost (inside the lantern,
// on the break road), the Undermaw (on the pit floor). Elsewhere they are voices: Ossmara's lines use the sky shot, the
// Undermaw's the deep shot, and the Lantern's voice is the lantern on the lead hero's belt, glowing on its lines. A
// giant's `anim` may also be rise (up out of the water/ground: it starts sunk), sleep (lies down into the land), fly
// (up and away), roar.
// A scene may also say WHERE it is staged: "stage": "docks" (any street theme in js/render/themes.js — also one that is
// not this chapter's) or { "theme": "docks", "at": 60, "z": 0 } (metres along that street). Default: the chapter's
// street, at its start for an intro and at its end (where its boss fell) for an outro or an ending. "cast" lists who is
// standing there when the scene opens (in order, from the centre outward to the right); speakers with "voice" (the
// wyrm) have no body — their lines use the "sky" shot.
// ---------------------------------------------------------------------------------------------------------------------
import { icon } from './icons.js';
import { esc } from './text.js';
import { keyLabel } from '../input/bindings.js';
import { choiceAt, applyChoice } from '../sim/route.js';

/** Each choice's icon (its colour is the matching .wr-choice-<id> rule in css/wyrmroad.css). */
const CHOICE_ICON = { free: 'breaker', hold: 'holy_light', bond: 'heart', seal: 'lock', crown: 'star', break: 'breaker' };
/** Act I's blurbs, for data that has none of its own (story-acts.json options carry `blurb`). */
const BLURB = { free: 'Let the wyrm rise. The bell-stones stop being chains, and the road is only a road.', hold: 'Keep the wyrm on the leash, with your own hand on it instead of his.' };

/** Play one story scene as its own screen (the map, results, the boss-scene flow): the same as app.go('story', …). */
export function playScene(app, scene, { chapter = null, heroId = null, heroes = null, then = null, afterEnding = null } = {}) {
  app.go('story', { scene, chapter, heroId: heroId ?? app.save?.lastHero, heroes, then, afterEnding });
}

const CPS = 70;                      // letters a second as a line appears

export function storyScreen(app, opts = {}) {
  const { data } = app;
  const lead = app.hero(opts.heroId) || app.hero(app.save.lastHero);
  const scene = data.story.scenes[opts.scene];
  const then = opts.then || (() => app.go('map', { heroId: lead?.id }));
  if (!scene) { then(); return; }
  const chapterId = opts.chapter || data.chapters.chapters.find(c => c.intro === opts.scene || c.outro === opts.scene)?.id || 'crownhollow';
  const chapter = data.chapters.chapters.find(c => c.id === chapterId);
  // the stage: the lead hero first, then anyone else in the party (opts.heroes: save heroes or bot heroes)
  const cast = [lead, ...(opts.heroes || []).filter(h => h && h !== lead && h.id !== lead?.id)].filter(Boolean)
    .map(h => ({ id: h.id, name: h.name, cls: h.cls, look: h.look, gear: h.gear }));
  const stage = app.render?.createStage && !app.view.stub
    ? app.render.createStage(app.view, { data, scene, chapter, where: chapter?.intro === opts.scene ? 'start' : 'end', heroes: cast })
    : null;
  if (!stage) { app.view.setChapter(chapterId); app.view.scenic(true); }
  app.audio.ambience(chapterId);

  let i = 0, shown = 0, t0 = performance.now(), choosing = false, done = false;
  app.padBusy = true;                  // the pad talks to the scene, not to the Skip button, until the choice
  app.ui.innerHTML = `<section class="wr-story" data-scene="${esc(opts.scene)}">
    <header class="wr-story-top"><p class="wr-story-place">${esc(scene.place)}</p><div class="wr-grow"></div>
      <button type="button" class="wr-btn wr-small" data-act="skip">${icon('next')}<span>Skip</span><kbd data-hint="skip"></kbd></button>
      <button type="button" class="wr-icon-btn" data-act="menu" aria-label="Menu">${icon('menu')}</button></header>
    <div class="wr-story-tap" data-act="next"></div>
    <div class="wr-story-box" data-act="next">
      <div class="wr-story-face"><div class="wr-portrait wr-portrait-story"></div></div>
      <div class="wr-story-words"><p class="wr-story-name"></p><p class="wr-story-text" aria-live="polite"></p>
        <p class="wr-story-more"><span class="wr-story-count"></span><span>${icon('next')}<kbd data-hint="next"></kbd></span></p></div>
    </div>
    <div class="wr-story-choice" hidden></div>
  </section>`;
  const root = app.ui.firstElementChild;
  const nameEl = root.querySelector('.wr-story-name'), textEl = root.querySelector('.wr-story-text'), face = root.querySelector('.wr-portrait-story');
  const hints = () => {
    const d = app.input.last;
    root.querySelector('[data-hint="next"]').textContent = d === 'pad' ? 'A' : d === 'touch' ? '' : 'Space';
    root.querySelector('[data-hint="skip"]').textContent = d === 'pad' ? 'B' : d === 'touch' ? '' : 'Esc';
  };
  hints(); const offDev = app.input.onDevice(hints);

  function speaker(id) {
    if (id === 'hero') return { name: lead?.name || 'You', spec: lead ? { look: app.heroLook(lead) } : null };
    const sp = data.story.speakers[id] || { name: 'Someone' };
    if (sp.boss) { const b = data.enemies.bosses[sp.boss]; return { name: sp.name, spec: b?.body === 'creature' ? { creature: b.look } : b ? { look: b.look } : null }; }
    if (sp.look) return { name: sp.name, spec: { look: sp.look } };
    return { name: sp.name, spec: null, voice: true };
  }
  function line() {
    const [who, text] = scene.lines[i];
    const sp = speaker(who);
    nameEl.textContent = sp.name; nameEl.classList.toggle('wr-voice', !!sp.voice);
    root.querySelector('.wr-story-box').classList.toggle('wr-story-voice', !!sp.voice);
    root.querySelector('.wr-story-count').textContent = `${i + 1} / ${scene.lines.length}`;
    face.innerHTML = sp.voice ? '<span class="wr-voice-mark"></span>' : '<span class="wr-portrait-wait"></span>';
    if (sp.spec) app.portrait(sp.spec, 192).then(url => { if (url && scene.lines[i]?.[0] === who) face.innerHTML = `<img src="${url}" alt="">`; });
    shown = 0; t0 = performance.now(); textEl.textContent = ''; textEl.dataset.full = text;
    stage?.line(i); safe();
  }
  /** Tell the stage which part of the canvas the place label and the speech box cover (it frames people above it). */
  function safe() {
    if (!stage) return;
    const H = innerHeight, top = root.querySelector('.wr-story-top')?.getBoundingClientRect(), box = root.querySelector(choosing ? '.wr-story-choice' : '.wr-story-box')?.getBoundingClientRect();
    stage.safe({ top: top ? top.bottom + 6 : 56, bottom: box && box.height ? H - box.top + 10 : H * 0.3 });
  }
  addEventListener('resize', safe);
  function next() {
    if (choosing || done) return;
    const full = textEl.dataset.full || '';
    if (shown < full.length) { shown = full.length; textEl.textContent = full; return; }
    app.audio.play('ui.click');
    if (++i < scene.lines.length) return line();
    finish();
  }
  function finish() {
    if (scene.choice) return choose();
    done = true; then();
  }
  function choose() {
    choosing = true;
    const c = scene.choice, box = root.querySelector('.wr-story-choice');
    box.innerHTML = `<p class="wr-choice-prompt">${esc(c.prompt)}</p><div class="wr-choice-row">${c.options.map(o => `<button type="button" class="wr-choice wr-choice-${esc(o.id)}" data-pick="${esc(o.id)}">${icon(CHOICE_ICON[o.id] || 'star')}<b>${esc(o.label)}</b><small>${esc(o.blurb || BLURB[o.id] || '')}</small></button>`).join('')}</div>`;
    box.hidden = false; root.querySelector('.wr-story-box').hidden = true; app.padBusy = false;
    stage?.wide(); safe();
    setTimeout(() => box.querySelector('button')?.focus({ preventScroll: true }), 40);
  }
  root.addEventListener('click', e => {
    const p = e.target.closest('[data-pick]');
    if (p) {
      const o = scene.choice.options.find(x => x.id === p.dataset.pick);
      // the road this opens: Act I's choice at the crown, Act II's at Bellwater or the Kiln (js/sim/route.js)
      if (lead) { applyChoice(lead.story, choiceAt(data, chapterId)?.key || 'act1', o.id); app.saveNow(); }
      app.audio.play('quest.complete');
      done = true;
      app.go('story', { scene: o.scene, chapter: chapterId, heroId: lead?.id, then: opts.afterEnding || (() => app.go('map', { heroId: lead?.id })) });
      return;
    }
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'menu') return app.openMenu();
    if (b.dataset.act === 'skip') { if (scene.choice) { i = scene.lines.length - 1; shown = 1e9; return choose(); } done = true; return then(); }
    next();
  });
  // keys + controller: A / Space / Enter next, Esc / B skip (the pad's menu nav is busy on this screen only while talking)
  const offKey = app.input.onKey(code => {
    if (document.querySelector('.wr-sheet, .modal') || choosing) return;
    if (code === 'Space' || code === 'Enter' || code === 'KeyJ') next();
    else if (code === 'Escape') root.querySelector('[data-act="skip"]').click();
  });
  const padR = app.input.pad(0), pads = [0, 1, 2, 3].map(k => (k ? app.input.pad(k) : padR));
  app.loop = dt => {
    const full = textEl.dataset.full || '';
    if (shown < full.length) { shown = Math.min(full.length, Math.floor((performance.now() - t0) / 1000 * CPS)); textEl.textContent = full.slice(0, shown); }
    if (!document.querySelector('.wr-sheet, .modal') && !choosing) for (const p of pads) { const r = p.read(); if (r.attack) next(); else if (r.jump) root.querySelector('[data-act="skip"]').click(); if (done) break; }
    if (done) return;            // a pad press just ended the scene: the next screen owns the view now (#123/#124)
    if (stage) { stage.reveal(shown); stage.update(dt); }
    else app.view.update(app.sceneG(chapterId), 1, dt);
  };
  line();
  if (stage) app.storyStage = stage;      // tests read where everyone stands (stage.cast())
  return () => { offKey(); offDev(); removeEventListener('resize', safe); for (const p of pads) p.release(); stage?.dispose(); if (app.storyStage === stage) app.storyStage = null; };
}
