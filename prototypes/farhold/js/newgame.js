// Farhold R16 — the title screen, as a flow rather than one long form.
//
// "I would also like to restructure the landing page. Have a Continue button, New game, Load game,
//  Settings, Exit game (if applicable, since its a browser game), and Back to playground button.
//  When starting a new game, start by naming your character and picking a class, and show a preview
//  of the class on the side. Have an optional 'Customize' button… Continuing from creating character
//  goes to Customize World. Display world settings on the side and on the other side display a map
//  of the starting planet. Allow changing the seed or options to affect the world generated. That's
//  the final step and then you start playing."
//
// So: four screens in one `<section id="boot">`, and one promise out of the whole thing.
//
//   const choice = await runTitle({ … });
//   // → { action: 'new' | 'load', seed, classId, name, avatar, world, save }
//
// `main.js`'s `boot()` is then "load the data, show the title, call `begin` once". It used to write
// `begin`'s twenty-seven-name argument list out in full at FOUR different call sites, which is a
// trap: adding an argument means remembering four places, and the bug js/save.js's own header
// records — three fields passed and silently dropped — is the same shape of mistake.
//
// WHAT READS THE FORM. Nothing outside this file, now. `begin` used to reach into the DOM for
// `#boot-seed`, `#boot-class`, `#boot-name` and the five knobs, which is why loading a save had to
// remember to override each of them one at a time. It takes `choice` instead.
//
// THE URL PARAMS STILL WORK, all of them, because twenty-odd Playwright specs are built on them:
// `?auto` skips the whole flow and starts immediately, `?load=<id|last>` goes straight into a save,
// and `?class=` `?seed=` `?name=` `?regions=` `?band=` `?density=` `?scale=` `?habitable=` preset
// whatever they name.

import { playtimeText } from './save.js';
import { CLASS_PETS } from './pets.js';
/**
 * R17 — THE THIRTY-FIRST CLASS IS THE ONE YOU BUILD.
 *
 * `installCustomClass` writes a synthetic entry into the three data objects this file already
 * holds, so "custom" is a class id like any other from the moment it is installed — main.js finds
 * it with `classData.classes.find(...)`, `createSkillBar` reads `skillData.classes.custom`, and the
 * body comes out of `classLooks.classes.custom`. There is no "if the class is custom" branch
 * anywhere downstream, which is the whole reason it was done this way.
 */
import { createBuild, installCustomClass } from './classbuild.js';
import { createClassBuilder } from './classbuild-ui.js';
import { renderSVG, normalizeAvatar } from '../../../avatar-2d/js/render.js';
import { openAppearance } from './appearance.js';

const $ = id => document.getElementById(id);

/** How big the preview map is generated at — the same size the run builds, so it is the same map. */
const PREVIEW = { width: 256, height: 128 };
/** Metres across one map cell at planet scale 1. Mirrors `M_PER_CELL_DEFAULT` in js/planet.js. */
const M_PER_CELL_DEFAULT = 640;

const SCREENS = ['boot-menu', 'boot-load-screen', 'boot-character', 'boot-world'];

function show(id) {
  for (const s of SCREENS) $(s)?.classList.toggle('hidden', s !== id);
  // put the keyboard somewhere useful on the screen that just appeared
  const first = $(id)?.querySelector('input, select, button, a');
  first?.focus?.({ preventScroll: true });
}

/**
 * CAN THIS PAGE ACTUALLY CLOSE ITSELF?
 *
 * "Exit game (if applicable, since its a browser game)" — and it mostly is not applicable.
 * `window.close()` is refused for any tab the user opened themselves; it only works on a window a
 * script opened, which is what `window.opener` tells us. A button that does nothing when clicked is
 * worse than no button, so the Exit button is only put on the screen when it will work. Everywhere
 * else "Back to playground" is the way out, which is the honest answer for a page in a tab.
 */
function canExit(params) {
  if (params.get('exit') === '1') return true;      // for a test, and for anyone who wants it anyway
  try { return !!window.opener; } catch { return false; }
}

export async function runTitle({
  classData, classLooks, skillData, items, bestiary, balance, saves, params, settings, status = () => {},
  // R17 — data/classbuild.json. Left out (an old caller, or a test), the Custom option simply is
  // not offered and every one of the thirty presets works exactly as it did.
  classbuildData = null,
} = {}) {
  const classes = classData.classes;
  const select = $('boot-class');
  const CUSTOM_ID = classbuildData?.custom?.id || 'custom';

  /**
   * R17 — THE BUILD, AND THE BUILDER.
   *
   * `build` is the live point-buy object and it is also what a save carries (`player.build`), so
   * there is one of it and the builder edits it in place. The builder screen is made once, lazily,
   * the first time Custom is chosen — a player who never touches it never pays for it.
   *
   * `installCustomClass` runs on EVERY change rather than once at the end, because the class card,
   * the figure beside it and `classLooks.classes.custom` all read the installed class rather than
   * the build. Installing once at the end would have meant the card said one thing while the
   * preview showed another, which is exactly the kind of half-applied change this round is about.
   */
  let build = classbuildData ? createBuild(classbuildData) : null;
  let builder = null;
  function ensureBuilder() {
    if (builder || !classbuildData) return builder;
    builder = createClassBuilder({
      classData, skillData, classLooks, data: classbuildData, build,
      onChange: b => {
        build = b;
        installCustomClass({ classData, skillData, classLooks, data: classbuildData, build: b });
        drawClassCard();
      },
      onClose: () => { drawClassCard(); select.focus(); },
    });
    return builder;
  }

  // ---------------------------------------------------------------- the class picker
  // Filled whatever screen we end up on, and before any early return: `tests/round4.spec.js` counts
  // `#boot-class option` after the game has already started, and the picker also has to be right
  // the moment somebody opens the character step.
  //
  // R17 — and Custom is the FIRST entry, because it is the one that needs finding. It is an option
  // added here rather than an element in index.html, so the whole feature touches neither the page
  // nor style.css; the thirty presets below it are untouched and `?class=` still names any of them.
  function fillPicker() {
    const rows = classes.filter(c => c.id !== CUSTOM_ID).map(c => {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = `${c.name} — ${c.role}${c.pet ? ' (companions)' : ''}`;
      return o;
    });
    if (classbuildData) {
      const o = document.createElement('option');
      o.value = CUSTOM_ID;
      o.textContent = 'Custom — build your own class';
      rows.unshift(o);
    }
    select.replaceChildren(...rows);
  }
  fillPicker();
  const pickable = id => [...select.options].some(o => o.value === id);
  select.value = pickable(params.get('class')) ? params.get('class') : 'ranger';

  $('boot-seed').value = params.get('seed') || String(balance?.seed ?? 1);
  $('boot-name').value = params.get('name') || '';
  // the five world knobs, so a deep link shows what it is about to build
  const preset = (id, key, fallback) => { const v = params.get(key); if (v != null && $(id)) $(id).value = v; else if ($(id) && fallback != null) $(id).value = String(fallback); };
  preset('boot-regions', 'regions');
  preset('boot-band', 'band');
  preset('boot-density', 'density');
  preset('boot-scale', 'scale');
  if (params.has('habitable')) $('boot-habitable').checked = params.get('habitable') !== '0';

  /** Everything the form currently says, in the shape `begin` wants. */
  const readWorld = () => ({
    regionScale: Number($('boot-regions')?.value) || 2,
    bandWidth: Number($('boot-band')?.value) || 4,
    density: Number($('boot-density')?.value) || 1,
    planetScale: Number($('boot-scale')?.value) || 1,
    habitable: $('boot-habitable')?.checked ?? true,
  });
  const readSeed = () => Number($('boot-seed').value) || 1;

  /**
   * The character's look. It starts as the class's own — `class-looks.json` is where every class's
   * face has always come from — and Customize replaces it. Null means "whatever the class wears",
   * which is what every run before this change had.
   */
  let chosenAvatar = null;
  const classAvatar = () => classLooks.classes[select.value]?.avatar || null;
  const liveAvatar = () => chosenAvatar || classAvatar();

  function readName() {
    const typed = ($('boot-name').value || '').trim();
    return typed || classLooks.classes[select.value]?.name?.split(' ')[0] || 'Wayfarer';
  }

  const result = () => {
    /**
     * R17 — `?class=custom&auto` must not start a run with a class that does not exist.
     *
     * The deep links return before a single pixel of the flow is drawn, so nobody has been near the
     * builder — and `skillData.classes.custom` would be missing, which sends `createSkillBar` to
     * its ranger fallback with no explanation. Installing the default build first gives a whole,
     * playable custom class (every empty pick falls back to the cheapest thing of its own tier),
     * which is the honest answer to being asked for one without being told what it should be.
     */
    if (select.value === CUSTOM_ID && classbuildData && !skillData.classes?.[CUSTOM_ID]) {
      installCustomClass({ classData, skillData, classLooks, data: classbuildData, build });
    }
    return {
      action: 'new',
      seed: readSeed(),
      classId: select.value,
      name: readName(),
      avatar: liveAvatar(),
      world: readWorld(),
      save: null,
    };
  };

  // ---------------------------------------------------------------- the deep links
  //
  // Done before a single pixel of the new flow is drawn: `?auto` and `?load=` are how every existing
  // spec gets into the game, and neither should pay for a map preview it is never going to look at.
  /**
   * R17 — A SAVED CUSTOM CLASS HAS TO EXIST AGAIN BEFORE THE SAVE IS HANDED BACK.
   *
   * A save carries `classId: "custom"` and the build itself on `player.build`. `classData` does not
   * have a class called "custom" in a fresh session, so without this `begin()` would fall back to
   * `classData.classes[0]` — you would load your custom character as a warrior, with a warrior's
   * skill bar, and nothing at all would say so. Every path out of this file that returns a load
   * goes through here first.
   */
  function loaded(data) {
    const saved = data?.player?.build;
    if (saved && classbuildData) {
      build = saved;
      installCustomClass({ classData, skillData, classLooks, data: classbuildData, build: saved });
    }
    return { action: 'load', save: data, seed: data.seed, classId: data.classId, name: data.name, avatar: data.avatar || null, world: data.world || null };
  }

  const wanted = params.get('load');
  if (wanted) {
    const chosen = wanted === 'last' ? saves.lastId() : wanted;
    const data = chosen ? saves.read(chosen) : null;
    if (data) return loaded(data);
    status(`no save called ${wanted}`);
  }
  if (params.has('auto')) return result();

  // ---------------------------------------------------------------- the menu
  const cont = $('boot-continue');
  function refreshMenu() {
    const last = saves.available() ? saves.lastId() : null;
    const lastSave = last ? saves.read(last) : null;
    cont.hidden = !lastSave;
    // Load game is never greyed out: a menu item that cannot be clicked tells you nothing, and the
    // screen behind it says "no saved runs yet" far more clearly than a dead button does.
    const exit = $('boot-exit');
    if (exit) exit.hidden = !canExit(params);
  }

  return new Promise(resolve => {
    let finished = false;
    const finish = value => {
      if (finished) return;
      finished = true;
      window.removeEventListener('keydown', onKey, true);
      stopPreview();
      resolve(value);
    };

    // ------------------------------------------------------------ Escape goes back
    function onKey(e) {
      if (e.code !== 'Escape') return;
      // the settings panel owns Escape while it is up
      if (settings?.isOpen) { e.preventDefault(); e.stopImmediatePropagation(); settings.toggle(false); return; }
      if (document.getElementById('appearance') && !document.getElementById('appearance').classList.contains('hidden')) return;
      const at = SCREENS.find(s => !$(s)?.classList.contains('hidden'));
      if (!at || at === 'boot-menu') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      show(at === 'boot-world' ? 'boot-character' : 'boot-menu');
    }
    window.addEventListener('keydown', onKey, true);

    // ------------------------------------------------------------ menu buttons
    refreshMenu();
    $('boot-new').onclick = () => { drawClassCard(); show('boot-character'); };
    $('boot-load').onclick = () => { drawSaves(); show('boot-load-screen'); };
    $('boot-settings').onclick = () => settings?.toggle(true);
    cont.onclick = () => {
      const last = saves.lastId();
      const data = last ? saves.read(last) : null;
      if (!data) { refreshMenu(); return; }
      finish(loaded(data));
    };
    const exitBtn = $('boot-exit');
    if (exitBtn) exitBtn.onclick = () => {
      window.close();
      // If we are still here a moment later the browser refused, which it is entitled to do.
      setTimeout(() => { if (!window.closed) status('Your browser will not let a page close a tab you opened yourself — close it with the tab’s ×, or go back to the playground.'); }, 300);
    };
    for (const b of document.querySelectorAll('[data-boot-back]')) {
      b.onclick = () => show(b.dataset.bootBack || 'boot-menu');
    }

    // ------------------------------------------------------------ the save list, as a screen
    function drawSaves() {
      const box = $('boot-saves');
      box.replaceChildren();
      if (!saves.available()) {
        box.append(Object.assign(document.createElement('p'), { className: 'muted small', textContent: 'This browser will not let the page store saves.' }));
        return;
      }
      const list = saves.list();
      if (!list.length) {
        box.append(Object.assign(document.createElement('p'), { className: 'muted small', textContent: 'No saved runs yet. Start a new game and it will save itself as you play.' }));
        return;
      }
      for (const s of list) {
        const row = document.createElement('div');
        row.className = 'save-row';
        row.innerHTML = `<span class="save-name">${s.name || 'Wayfarer'}</span>
          <span class="muted small">level ${s.level} · seed ${s.seed} · ${playtimeText(s.playtime)}${s.place ? ' · ' + s.place : ''}</span>`;
        const load = document.createElement('button');
        load.textContent = 'Load';
        load.onclick = () => {
          const data = saves.read(s.id);
          if (data) finish(loaded(data));
        };
        const del = document.createElement('button');
        del.className = 'ghost';
        del.textContent = '×';
        del.title = 'Delete this save';
        del.onclick = () => { saves.remove(s.id); drawSaves(); refreshMenu(); };
        row.append(load, del);
        box.append(row);
      }
    }

    // ------------------------------------------------------------ step 1: the character
    /**
     * WHAT THE CLASS YOU ARE ABOUT TO PLAY ACTUALLY IS.
     *
     * Thirty entries in a dropdown, each one a name and two words of role, and the choice is locked
     * in for the whole run. Everything needed to answer "what does this one do" is already loaded —
     * `data/skills.json` describes every skill, `data/classes.json` has the weapon it starts holding
     * and what it may hold, and `pets.js` knows which classes bring a companion.
     */
    function drawClassCard() {
      const box = $('boot-class-card');
      /**
       * R17 — THE CUSTOM CLASS DRAWS ITS OWN CARD, AND THE CARD IS THE WAY IN.
       *
       * The card box is the one element on this screen that this file already owns outright, so the
       * builder writes its summary and its "Open the builder" button straight into it. That is the
       * entire hook: no new element in index.html, no new rule in style.css, and a player who picks
       * Custom out of the dropdown has the button in front of them without being told about it.
       */
      if (select.value === CUSTOM_ID && classbuildData) {
        const b = ensureBuilder();
        // installed before the card is drawn, so `classLooks.classes.custom` exists for the figure
        installCustomClass({ classData, skillData, classLooks, data: classbuildData, build });
        b?.card(box);
        drawFigure();
        return;
      }
      if (box) box.classList.remove('cb-card');
      const c = classes.find(x => x.id === select.value);
      if (box && c) {
        const unlock = skillData.unlockAt || [1];
        const kit = [];
        const starter = items.weaponBases?.[c.starter];
        if (starter) kit.push(`starts with a ${starter.name.toLowerCase()}`);
        if (c.weapons?.length) kit.push(`can hold ${c.weapons.join(', ')}`);
        if (c.armorTier) kit.push(`${c.armorTier} armour`);
        if (c.shield) kit.push('a shield');
        if (c.primaryAttr) kit.push(c.primaryAttr);
        const pet = c.pet || CLASS_PETS[c.id];
        const petDef = pet && (bestiary.pets || []).find(x => x.id === pet.id);
        const rows = (c.skills || []).map((id, i) => {
          const sk = skillData.skills?.[id];
          if (!sk) return '';
          const at = unlock[i] ?? unlock[unlock.length - 1];
          return `<li><b>${sk.name}</b><span>${sk.desc || ''}</span>`
            + `<i>${at > 1 ? `level ${at}` : 'from the start'}</i></li>`;
        }).join('');
        box.innerHTML = `<h4>${c.name} <span>${c.role}</span></h4>`
          + `<p class="cc-kit">${kit.join(' · ')}</p>`
          + `<ul class="cc-skills">${rows}</ul>`
          + (petDef ? `<p class="cc-pet">Brings a companion: ${petDef.name}`
            + `${pet.count > 1 ? ` ×${pet.count}` : ''}`
            + `${pet.extra ? `, and ${(bestiary.pets.find(x => x.id === pet.extra.id) || {}).name || 'another'}` : ''}.</p>` : '');
      }
      drawFigure();
    }

    /**
     * The figure beside the picker. avatar-2d's renderer is pure SVG with no Three.js behind it, so
     * a live preview that redraws on every keystroke costs nothing at all — and it is the same
     * catalogue `chibi2.js` builds the in-world body from, so this is genuinely what you will see
     * walking around, not an illustration of it.
     */
    function drawFigure() {
      const box = $('boot-figure');
      if (!box) return;
      const a = liveAvatar();
      box.innerHTML = a ? renderSVG(normalizeAvatar(a), { width: 190, height: 254 }) : '';
      const note = $('boot-figure-note');
      if (note) note.textContent = chosenAvatar ? 'Your own look' : 'The class as it comes';
    }

    select.onchange = () => {
      // Changing class after customising keeps the face you built — only the untouched look follows
      // the class, which is what somebody who has just spent two minutes on a face expects.
      drawClassCard();
    };
    $('boot-name').oninput = () => { /* nothing to redraw; the name is read when you press Next */ };

    $('boot-customize').onclick = async () => {
      const race = classLooks.classes[select.value]?.race || 'human';
      /**
       * The editor draws into the figure behind it as you work, which means Cancel has to put back
       * what was there BEFORE it opened — not "whatever the last onChange said", which is the change
       * you just backed out of. So the old value is kept here and restored on a null.
       */
      const before = chosenAvatar;
      const picked = await openAppearance({
        avatar: liveAvatar(), classAvatar: classAvatar(), race,
        onChange: a => { chosenAvatar = a; drawFigure(); },
      });
      chosenAvatar = picked || before;
      drawFigure();
      $('boot-customize').focus();
    };
    $('boot-appearance-reset').onclick = () => { chosenAvatar = null; drawFigure(); };

    $('boot-to-world').onclick = () => {
      /**
       * R17 — A HALF-BUILT CUSTOM CLASS CANNOT WALK OUT OF THE GATE.
       *
       * `buildRefusal` names the one thing that is short — an empty spell slot, an unattuned staff
       * — and the builder opens on the tab that can fix it rather than the player being bounced
       * with a message and left to guess. A preset class has nothing to check and goes straight on.
       */
      if (select.value === CUSTOM_ID && classbuildData) {
        const b = ensureBuilder();
        const refusal = b?.refusal;
        if (refusal) {
          status(refusal);
          b.show(refusal.toLowerCase().includes('spell') ? 'spells' : 'loadout');
          return;
        }
        installCustomClass({ classData, skillData, classLooks, data: classbuildData, build });
      }
      show('boot-world');
      schedulePreview();
    };

    // ------------------------------------------------------------ step 2: the world
    //
    // The map is built by js/worldpreview.js, in a worker, from the SAME `createWorld` the run uses.
    // Three of the five knobs do not change the map at all — planet size is metres per cell, levels
    // per zone is a band width and enemy density is a spawn rate — so only the seed, the zone count
    // and the habitable box start a new one. The caption says what the other three did.
    let worker = null, workerDead = false, reqId = 0, timer = null, lastKey = '';

    function stopPreview() {
      if (timer) clearTimeout(timer);
      timer = null;
      try { worker?.terminate(); } catch { /* already gone */ }
      worker = null;
    }

    function previewKey() {
      const w = readWorld();
      return `${readSeed()}|${w.regionScale}|${w.habitable ? 1 : 0}`;
    }

    function schedulePreview({ force = false } = {}) {
      captionWorld();
      const key = previewKey();
      if (!force && key === lastKey) return;
      lastKey = key;
      if (timer) clearTimeout(timer);
      $('boot-map-status').textContent = 'shaping the planet…';
      timer = setTimeout(() => runPreview(), 220);
    }

    function runPreview() {
      const w = readWorld();
      const opts = { seed: readSeed(), regionScale: w.regionScale, habitable: w.habitable, ...PREVIEW };
      const id = ++reqId;
      if (!worker && !workerDead) {
        try {
          worker = new Worker(new URL('./worldpreview-worker.js', import.meta.url), { type: 'module' });
          worker.onmessage = e => { if (e.data?.id === reqId) paint(e.data); };
          worker.onerror = () => { workerDead = true; worker = null; runPreview(); };
        } catch {
          workerDead = true;
        }
      }
      if (worker) { worker.postMessage({ id, opts }); return; }
      /**
       * NO WORKER, SO DO IT HERE — AT HALF SIZE.
       *
       * A browser can refuse a module worker (an old one, or a page opened straight off the disk).
       * The flow has to stay usable, so the same builder runs on the main thread at 128 x 64, which
       * is a tenth of the work and about a tenth of a second. It is the same world, drawn coarser,
       * and the caption says so rather than pretending.
       */
      import('./worldpreview.js').then(m => {
        const out = m.buildPreview({ ...opts, width: 128, height: 64 });
        if (id === reqId) paint({ ...out, coarse: true });
      }).catch(err => {
        $('boot-map-status').textContent = 'could not draw the map (' + (err?.message || err) + ') — the world itself is fine';
      });
    }

    function paint(data) {
      const canvas = $('boot-map');
      if (!canvas) return;
      if (!data?.ok) {
        $('boot-map-status').textContent = 'could not draw the map (' + (data?.error || 'unknown') + ') — the world itself is fine';
        return;
      }
      const ctx = canvas.getContext('2d');
      const src = document.createElement('canvas');
      src.width = data.width; src.height = data.height;
      src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.pixels), data.width, data.height), 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(src, 0, 0, canvas.width, canvas.height);

      const sx = canvas.width / data.width, sy = canvas.height / data.height;
      // the towns, so the map reads as a place people live in rather than a texture
      for (const n of data.nodes) {
        const x = (n.x + 0.5) * sx, y = (n.y + 0.5) * sy;
        const r = n.type === 'dungeon' ? 2.2 : Math.max(1.8, Math.min(4, 1.4 + (n.size || 1) * 0.5));
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = n.type === 'dungeon' ? '#c08ad0' : n.type === 'port' ? '#8fd3ff' : '#f2e6c8';
        ctx.strokeStyle = '#10141c';
        ctx.lineWidth = 1;
        ctx.fill(); ctx.stroke();
      }
      if (data.start) {
        const x = (data.start.x + 0.5) * sx, y = (data.start.y + 0.5) * sy;
        ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.strokeStyle = '#7fd8ff'; ctx.lineWidth = 2; ctx.stroke();
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.fillStyle = '#dff2ff';
        ctx.strokeStyle = '#05070d'; ctx.lineWidth = 3;
        const label = `You start at ${data.start.name}`;
        const tx = Math.min(canvas.width - ctx.measureText(label).width - 4, Math.max(4, x + 10));
        const ty = Math.min(canvas.height - 6, Math.max(14, y - 10));
        ctx.strokeText(label, tx, ty); ctx.fillText(label, tx, ty);
      }
      canvas.dataset.painted = String(Date.now());
      canvas.dataset.planet = data.planet?.name || '';

      const moved = data.movedSeed
        ? ` Seed ${readSeed()} had nowhere you could live, so the search stepped to ${data.systemSeed}.`
        : '';
      $('boot-map-status').textContent = '';
      $('boot-map-where').textContent = `${data.planet?.name || 'a world'}, around ${data.star?.name || 'its star'}`;
      $('boot-map-facts').textContent = `${data.towns} settlements · ${data.regions} zones · `
        + `${Math.round(data.land * 100)}% land${data.coarse ? ' · drawn coarse (no worker)' : ''}.${moved}`;
      captionWorld();
    }

    /** What the three knobs that do not change the map actually do. */
    function captionWorld() {
      const w = readWorld();
      const km = (n, cells) => Math.round(cells * M_PER_CELL_DEFAULT * w.planetScale / 1000);
      const box = $('boot-world-facts');
      if (!box) return;
      box.textContent = `${km(0, PREVIEW.width)} × ${km(0, PREVIEW.height)} km to walk · `
        + `${w.bandWidth} levels per zone · ${w.density === 1 ? 'normal' : w.density < 1 ? 'quiet' : 'busy'} spawns. `
        + 'Planet size, levels per zone and enemy density do not change the shape of the map.';
    }

    for (const id of ['boot-seed', 'boot-regions', 'boot-habitable', 'boot-band', 'boot-density', 'boot-scale']) {
      const node = $(id);
      if (!node) continue;
      node.addEventListener('input', () => schedulePreview());
      node.addEventListener('change', () => schedulePreview());
    }
    $('boot-reroll').onclick = () => {
      $('boot-seed').value = String(1 + Math.floor(Math.random() * 99999));
      schedulePreview();
    };

    $('boot-start').onclick = () => {
      $('boot-start').disabled = true;
      finish(result());
    };
  });
}
