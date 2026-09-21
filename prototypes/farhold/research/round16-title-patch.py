#!/usr/bin/env python3
"""R16 — apply the title-flow patches to prototypes/farhold/js/main.js.

    python3 prototypes/farhold/research/round16-title-patch.py prototypes/farhold/js/main.js
    python3 tools/preload-modules.py prototypes/farhold/index.html

js/main.js belonged to another agent while js/newgame.js was being written, so the seven changes it
needs are here rather than in the file. Run it ONCE: every anchor is checked and it stops with the
anchor printed if one has moved, so a half-applied file is not possible.

What it does, in order: imports runTitle; adds the `settingsApply` forwarder so the settings panel
is built once at boot and the title screen can open the same one; replaces the second half of
`boot()` with a single `runTitle` + `begin` call; gives `begin` a `choice` argument instead of
reaching into the DOM for the form; hooks the real settings `apply`; reads the player's name and
customised look out of `choice` (falling back to the class, and to the save when loading); and puts
the look in the snapshot so it survives a reload.
"""
import io, sys

PATCHES = []

def P(old, new):
    PATCHES.append((old, new))

# ---------------------------------------------------------------- 1. the import
P("""import { createSaves, snapshot, restore, playtimeText, saveCarriesWorld } from './save.js';""",
  """import { createSaves, snapshot, restore, playtimeText, saveCarriesWorld } from './save.js';
import { runTitle } from './newgame.js';""")

# ---------------------------------------------------------------- 2. the settings forwarder
P("""const saves = createSaves();""",
  """const saves = createSaves();

/**
 * R16 — THE SETTINGS PANEL IS BUILT ONCE, AT BOOT, NOT INSIDE `begin`.
 *
 * The title screen has a Settings button now, and the panel it opens has to be the same panel the
 * game uses: `createSettings` appends a `<section id="settings">` and installs a capture-phase key
 * listener that rewrites every rebound key for the whole page, so a second one would double both.
 *
 * But `apply()` has to reach the camera, the scatter and the sound, none of which exist before
 * `begin` runs. So the panel is built at boot with a forwarder, and `begin` sets the real one on
 * the line where `createSettings` used to be called, then runs it once — which is exactly what
 * `createSettings` did for itself at the end of its constructor.
 */
let settingsApply = () => {};""")

# ---------------------------------------------------------------- 3. boot()'s body
OLD_BOOT_START = """  // all thirty classes now, each labelled with what it does and whether it brings companions
  const classes = classData.classes;"""
old_boot = None  # filled in below from the file

NEW_BOOT = """  /**
   * R16 — THE TITLE SCREEN IS ITS OWN MODULE NOW.
   *
   * "I would also like to restructure the landing page." It is four screens — menu, load, character,
   * world — and none of it belongs in here: js/newgame.js owns the markup, the class card, the save
   * list, the appearance editor and the map preview, and hands back the one object `begin` needs.
   *
   * The other half of the win is that `begin`'s argument list used to be written out IN FULL at four
   * separate call sites. Adding an argument meant remembering all four, and js/save.js's own header
   * records what happens when one of those gets missed — three fields passed and silently dropped.
   * There is one call site now, so there is nothing to keep in step.
   */
  const settings = createSettings({ apply: (v, key) => settingsApply(v, key) });
  const data = { items, balance, bestiary, talents, campaignData, classLooks, skillData, classData,
    craftData, encounterData, namegen, factionData, frameData, incidentData, wandererData,
    landmarkData, rewardData, resourceData, refiningData, powerData, structureData, colonyData,
    cropData, raidData, goodsData };

  status('');
  const choice = await runTitle({ classData, classLooks, skillData, items, bestiary, balance, saves, params, settings, status });
  await begin({ ...data, status, settings, choice, save: choice.save || null }).catch(err => {
    status('failed: ' + err.message);
    const start = $('boot-start');
    if (start) start.disabled = false;
    console.error(err);
  });
}"""

# ---------------------------------------------------------------- 4. begin's signature + form reads
P("""async function begin({ items, balance, bestiary, talents, campaignData, classLooks, skillData, classData, craftData, encounterData, namegen, factionData, frameData, incidentData, wandererData, landmarkData, rewardData, resourceData, refiningData, powerData, structureData: rawStructures, colonyData, cropData, raidData, goodsData, status, save }) {""",
  """async function begin({ items, balance, bestiary, talents, campaignData, classLooks, skillData, classData, craftData, encounterData, namegen, factionData, frameData, incidentData, wandererData, landmarkData, rewardData, resourceData, refiningData, powerData, structureData: rawStructures, colonyData, cropData, raidData, goodsData, status, settings, choice, save }) {""")

P("""  const structureData = alignCatalogue(rawStructures, resourceData);
  const seed = save ? save.seed : (Number($('boot-seed').value) || 1);
  const classId = save ? save.classId : $('boot-class').value;
  const lowQuality = params.get('quality') === 'low';""",
  """  const structureData = alignCatalogue(rawStructures, resourceData);
  /**
   * R16: what the player chose, from js/newgame.js. `begin` used to read `#boot-seed`, `#boot-class`,
   * `#boot-name` and the five knobs straight out of the DOM, which is why loading a save had to
   * override each of them one at a time and why the round-10 bug — a run saved at Small reloading at
   * Full — was possible at all. It is handed one object now, and a save wins over it field by field.
   */
  const pick = choice || {};
  const seed = save ? save.seed : (Number(pick.seed) || 1);
  const classId = save ? save.classId : (pick.classId || 'ranger');
  const lowQuality = params.get('quality') === 'low';""")

P("""  const worldOpts = save?.world || {
    regionScale: Number(params.get('regions')) || Number($('boot-regions')?.value) || 2,
    bandWidth: Number(params.get('band')) || Number($('boot-band')?.value) || 4,
    density: Number(params.get('density')) || Number($('boot-density')?.value) || 1,
    planetScale: Number(params.get('scale')) || Number($('boot-scale')?.value) || 1,
    // On by default: a first hour on a locked-biome rock with nobody on it is a poor first hour.
    habitable: params.has('habitable')
      ? params.get('habitable') !== '0'
      : ($('boot-habitable')?.checked ?? true),
  };""",
  """  const worldOpts = save?.world || pick.world || {
    regionScale: Number(params.get('regions')) || 2,
    bandWidth: Number(params.get('band')) || 4,
    density: Number(params.get('density')) || 1,
    planetScale: Number(params.get('scale')) || 1,
    // On by default: a first hour on a locked-biome rock with nobody on it is a poor first hour.
    habitable: params.has('habitable') ? params.get('habitable') !== '0' : true,
  };""")

# ---------------------------------------------------------------- 5. the settings hook
P("""  const settings = createSettings({
    apply: (v, key) => {""",
  """  settingsApply = (v, key) => {""")

P("""      if ((!key || key === 'fov') && camera?.isPerspectiveCamera && camera.fov !== v.fov) {
        camera.fov = v.fov;
        camera.updateProjectionMatrix();
      }
    },
  });""",
  """      if ((!key || key === 'fov') && camera?.isPerspectiveCamera && camera.fov !== v.fov) {
        camera.fov = v.fov;
        camera.updateProjectionMatrix();
      }
  };
  // the panel was built at boot (see `settingsApply` at the top of this file) and has already
  // applied what it remembered to a forwarder that did nothing; run the real one over it now
  settingsApply(settings.all(), null);""")

# ---------------------------------------------------------------- 6. name + the look
P("""  const look = classLooks.classes[classId];
  const playerName = save?.name || ($('boot-name').value || '').trim() || look?.name?.split(' ')[0] || 'Wayfarer';
  const player = rpg.createPlayer({ name: playerName, classId, avatar: look?.avatar || null });""",
  """  const look = classLooks.classes[classId];
  /**
   * R16 — THE FACE THE PLAYER BUILT, IF THEY BUILT ONE.
   *
   * Farhold has only ever had one look per class: `class-looks.json`'s entry, the same body for
   * every ranger anyone ever played. The appearance editor (js/appearance.js) hands back a whole
   * avatar in the shared character schema, and a save carries it (js/save.js), so the order is:
   * what this save was wearing, then what was built on the title screen, then the class's own.
   *
   * It is `baseLook`, not `look.avatar`, everywhere below — `applyGearLook()` rebuilds the body from
   * this every time a piece of armour changes, so reading the class look there would put the class
   * face back on the first equip.
   */
  const baseLook = save?.avatar || pick.avatar || look?.avatar || null;
  const playerName = save?.name || (pick.name || '').trim() || look?.name?.split(' ')[0] || 'Wayfarer';
  const player = rpg.createPlayer({ name: playerName, classId, avatar: baseLook });""")

P("""  function applyGearLook() {
    const next = JSON.parse(JSON.stringify(look?.avatar || {}));""",
  """  function applyGearLook() {
    // R16: the player's own look if they customised one, the class's if they did not — see baseLook
    const next = JSON.parse(JSON.stringify(baseLook || {}));""")

# ---------------------------------------------------------------- 7. the save carries it
P("""      id: saveId, name: player.name, seed, classId, player, control,""",
  """      id: saveId, name: player.name, seed, classId, player, control,
      // R16: the appearance, so a customised character comes back looking like themselves
      avatar: baseLook,""")


def main(path):
    s = io.open(path, encoding='utf-8').read()
    # the boot body: everything from the class dropdown to the end of boot()
    i = s.index(OLD_BOOT_START)
    j = s.index("  if (params.has('auto')) $('boot-start').click();\n}")
    j += len("  if (params.has('auto')) $('boot-start').click();\n}")
    s = s[:i] + NEW_BOOT + s[j:]
    for old, new in PATCHES:
        if s.count(old) != 1:
            raise SystemExit(f'anchor found {s.count(old)} times:\n{old[:120]}')
        s = s.replace(old, new, 1)
    io.open(path, 'w', encoding='utf-8').write(s)
    print('patched', path)


if __name__ == '__main__':
    main(sys.argv[1])
