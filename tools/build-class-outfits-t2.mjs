// Builds avatar-3d/data/class-outfits-t2.json (S18 tier-2 class armour): the per-class table below + stream C/E's themes.
// node tools/build-class-outfits-t2.mjs
import { writeFileSync, readFileSync } from 'node:fs';
const AT = JSON.parse(readFileSync('/home/radgh/claude/playground/prototypes/thousandvale/data/rules/armour-tiers.json'));
const CANON = { snowflake: 'frost', sunburst: 'sun', gear: 'cog' };
const G = '#d8b040', S = '#c8ccd8';
// [hat, top, topColor, color2, bottom, bColor, shoes, sColor, cape, capeColor, decor, decorColor, trim, emblem, emblemColor, held, offhand]
const R = {
  warrior:      ['war_helm', 'plate', '#8a9098', '#9a2a1a', 'greaves', '#6a6e76', 'heavy', '#5a5e66', 'cape', '#7a1a14', 't2_pauldrons', '#70747c', G, 'sword', '#e8402a', 'fh_longsword', 'fh_heater_shield'],
  fighter:      ['horned_helm', 'plate', '#b8bcc4', '#7a1a1a', 'greaves', '#8a8e96', 'heavy', '#7a7e86', 'cape', '#1a2a5a', 't2_pauldrons', '#8a8e98', '#c8a050', 'blood', '#d02020', 'fh_greatsword', 'none'],
  paladin:      ['great_helm', 'plate', '#e4e6ec', G, 'greaves', '#c8ccd4', 'heavy', '#b8bcc4', 'cape', '#f4efe2', 't2_vestments', '#f6f2e6', G, 'sun', '#f0b830', 'fh_sword', 'fh_heater_shield'],
  ranger:       ['hood', 'leather', '#3e5226', '#6a4a2a', 'pants', '#34422a', 'boots', '#4a3a2a', 'travel_cloak', '#2e4a24', 't2_harness', '#5a3e24', '#b89060', 'arrow', '#9ad050', 'bow', 'quiver'],
  rogue:        ['hood', 'strapped_leather', '#2a2a30', '#4a3a2a', 'leggings', '#24242a', 'boots', '#2a2420', 'tattered_cape', '#1e2a1e', 't2_harness', '#2e2a26', '#7a8a5a', 'drop', '#7ae040', 'fh_daggers', 'fh_dagger'],
  cleric:       ['circlet', 'trim_robe', '#f0ece0', G, 'pants', '#d8d0c0', 'boots', '#a08a6a', 'shoulder_cape', '#e8e0c8', 't2_vestments', '#f2eee2', G, 'cross', '#e8c040', 'fh_mace', 'fh_kite_shield'],
  bard:         ['feather_cap', 'doublet', '#8a2a4a', G, 'breeches', '#3a2a4a', 'boots', '#4a2a1a', 'half_cape', '#5a1a3a', 't2_harness', '#6a2a3a', G, 'note', '#f0d060', 'fh_rapier', 'none'],
  mage:         ['wizard', 'high_collar_robe', '#2a4a8a', '#a8d8ff', 'pants', '#1e2e5a', 'slippers', '#2a3a6a', 'none', '#2a4a8a', 't2_mantle', '#1e3a72', '#b8e4ff', 'frost', '#9fe0ff', 'staff_crystal', 'none'],
  necromancer:  ['hood', 'trim_robe', '#1e2a22', '#8ab878', 'pants', '#1a1e1a', 'boots', '#2a2a24', 'tattered_cape', '#141a14', 't2_mantle', '#22302a', '#c8d8b0', 'skull', '#b8f0a0', 'staff_skull', 'none'],
  warlock:      ['hood', 'high_collar_robe', '#3a1a4a', '#c070ff', 'pants', '#24122e', 'pointed', '#2a1a2a', 'cape', '#2a0e36', 't2_mantle', '#2e1440', '#d8a0ff', 'eye', '#c070ff', 'staff_skull', 'none'],
  demon_hunter: ['hood', 'strapped_leather', '#2a1a1a', '#8a2a1a', 'leggings', '#1e1414', 'boots', '#2a1a14', 'tattered_cape', '#3a0e0e', 't2_harness', '#3a1e18', '#c06040', 'claw', '#ff4a2a', 'fh_sabre', 'fh_sabre'],
  scavenger:    ['leather_cap', 'gambeson', '#6a5a3a', '#8a6a3a', 'pants', '#4a3e2a', 'boots', '#4a3424', 'travel_cloak', '#5a4a30', 't2_harness', '#5a4428', '#c0a060', 'coin', '#f0c840', 'fh_axe', 'buckler'],
  swashbuckler: ['tricorn', 'open_coat', '#1e3a6a', G, 'breeches', '#e8e0d0', 'boots', '#2a1a14', 'half_cape', '#8a1a1a', 't2_harness', '#2a2a3a', G, 'feather', '#f8f0e0', 'fh_rapier', 'fh_dagger'],
  dragon_knight:['dragon_helm', 'scale_plate', '#2a5a2a', '#e8742a', 'greaves', '#2a4a2a', 'heavy', '#24402a', 'cape', '#7a1e10', 't2_pauldrons', '#244a24', '#e8742a', 'flame', '#ff6a1a', 'fh_halberd', 'none'],
  pyromancer:   ['wizard', 'trim_robe', '#8a1e10', '#ffb040', 'pants', '#4a1a10', 'slippers', '#5a2a14', 'none', '#8a1e10', 't2_mantle', '#6a160c', '#ffb040', 'flame', '#ff8a1a', 'staff_crystal', 'none'],
  stormcaller:  ['hood', 'high_collar_robe', '#24305a', '#ffe860', 'pants', '#1a2244', 'boots', '#2a2a3a', 'cape', '#1a2448', 't2_mantle', '#1e2a52', '#ffe860', 'bolt', '#ffe84a', 'staff_totem', 'none'],
  druid:        ['wolf_helm', 'fur_tunic', '#5a4a2a', '#d8c8a8', 'leggings', '#3a4a2a', 'wraps', '#6a5a3a', 'none', '#3a5a2a', 't2_wildmantle', '#6a5634', '#d8cfa8', 'leaf', '#6ad040', 'staff_crook', 'none'],
  oracle:       ['circlet', 'high_collar_robe', '#e8e0f0', G, 'pants', '#c8c0d8', 'slippers', '#b8a8c8', 'shoulder_cape', '#d8c8f0', 't2_mantle', '#d0c4e8', G, 'eye', '#f0c040', 'orb', 'none'],
  tactician:    ['tricorn', 'coat', '#2a3a5a', G, 'breeches', '#d8d0c0', 'boots', '#2a2018', 'cape', '#5a1a1a', 't2_pauldrons', '#3a4a6a', G, 'crown', '#f0c840', 'fh_sword', 'none'],
  chronomancer: ['wizard', 'trim_robe', '#2a5a5a', '#f0d080', 'pants', '#1e3a3a', 'slippers', '#2a4a4a', 'none', '#2a5a5a', 't2_mantle', '#1e4a4a', '#f0d080', 'hourglass', '#f0d080', 'hourglass', 'none'],
  monk:         ['headband', 'gi', '#e8c060', '#7a2a1a', 'baggy', '#7a2a1a', 'wraps', '#e8dcc0', 'none', '#7a2a1a', 't2_harness', '#7a2a1a', G, 'fist', '#ffd060', 'none', 'none'],
  shaman:       ['bone_headdress', 'fur_tunic', '#4a3a2a', '#c8b890', 'kilt', '#5a4a2a', 'wraps', '#6a5a3a', 'none', '#4a3a2a', 't2_wildmantle', '#4e3c28', '#e8e0c8', 'moon', '#60e0d0', 'staff_totem', 'none'],
  witch_hunter: ['wide_brim', 'coat', '#2a2a2a', S, 'pants', '#1e1e1e', 'boots', '#2a1e14', 'travel_cloak', '#1e1e22', 't2_harness', '#2a2a2e', S, 'star', '#e8ecf8', 'crossbow', 'none'],
  knight:       ['plate_helm', 'surcoat', '#2a3a7a', G, 'greaves', '#a8acb4', 'heavy', '#9a9ea6', 'cape', '#1e2a6a', 't2_pauldrons', '#a0a4ac', G, 'shield', '#4a7aff', 'fh_longsword', 'fh_tower_shield'],
  sorcerer:     ['hood', 'high_collar_robe', '#5a1a5a', '#ff70c0', 'pants', '#3a1a3a', 'pointed', '#3a1a3a', 'none', '#5a1a5a', 't2_mantle', '#4a1048', '#ff9ad8', 'star', '#ff70d0', 'staff_orb', 'none'],
  runesmith:    ['rune_helm', 'plate', '#7a8088', '#7fe8ff', 'greaves', '#6a7078', 'heavy', '#5a6068', 'none', '#2a3a4a', 't2_pauldrons', '#6a7078', '#7fe8ff', 'rune', '#7fe8ff', 'fh_hammer', 'fh_heater_shield'],
  shadow_dancer:['hood', 'silks', '#1a1a2a', '#8a70ff', 'leggings', '#14141e', 'wraps', '#24243a', 'tattered_cape', '#14102a', 't2_harness', '#1e1a30', '#a090ff', 'moon', '#a890ff', 'fh_daggers', 'fh_dagger'],
  tinker:       ['goggles_up', 'smith_apron', '#6a4a2a', '#c8a050', 'pants', '#3a3028', 'boots', '#3a2a1a', 'none', '#6a4a2a', 't2_harness', '#5a3e22', '#d8b060', 'cog', '#e8b040', 'fh_hammer', 'none'],
  priest:       ['hood', 'trim_robe', '#e8e4d8', '#6a3a8a', 'pants', '#c8c0b0', 'slippers', '#a89a8a', 'cape', '#4a2a5a', 't2_vestments', '#ece6da', '#8a5ab0', 'cross', '#b080e0', 'fh_scepter', 'book'],
  enchanter:    ['circlet', 'high_collar_robe', '#6a2a7a', '#ffd0f8', 'pants', '#4a1e5a', 'pointed', '#3a1a4a', 'shoulder_cape', '#5a1e6a', 't2_mantle', '#5a1e6a', '#ffd0f8', 'eye', '#ff90f0', 'fh_wand', 'orb'],
};
const classes = {};
for (const [id, r] of Object.entries(R)) {
  let [hat, top, tc, c2, bottom, bc, shoes, sc, cape, cc, decor, dc, trim, emblem, ec, held, offhand] = r;
  // emblem / trim / glow follow stream C/E's armour-tiers.json (the class's theme): a preview and a dropped piece agree
  const th = AT.classes[id]?.theme, T = th && AT.themes[th];
  if (T) { emblem = CANON[T.emblem] || T.emblem; ec = T.glow; trim = T.trim; c2 = T.trim; }
  classes[id] = {
    theme: th || emblem, set: AT.classes[id]?.set || null,
    hat: hat === 'none' ? { id: 'none' } : { id: hat, color: decor === 't2_pauldrons' || /helm/.test(hat) ? dc : tc, color2: trim, emblem, emblemColor: ec },
    top: { id: top, color: tc, color2: c2, emblem, emblemColor: ec },
    bottom: { id: bottom, color: bc }, shoes: { id: shoes, color: sc },
    cape: cape === 'none' ? { id: 'none' } : { id: cape, color: cc },
    decor: { id: decor, color: dc, color2: trim },
    held: { id: held, color: '#c8d0d8' }, offhand: { id: offhand, color: '#8a8f98' },
  };
}
const doc = 'Tier-2 class outfits for Chibi 2 (Thousandvale play-test 4, S18, 2026-10-05). One per class (all 30 Farhold/Emberveil/Thousandvale classes), complete (every slot), so it never depends on the tier-1 table. Each carries an emblem (`top.emblem`/`emblemColor` on chest and back, `hat.emblem` on the helm brow; ids in avatar-3d/js/chibi2-armour2.js EMBLEM_IDS) and one of the five tier-2 decor kits (t2_pauldrons, t2_mantle, t2_harness, t2_vestments, t2_wildmantle; decor.color2 = trim). `theme`/`set` and the emblem, trim (color2) and glow (emblemColor) follow prototypes/thousandvale/data/rules/armour-tiers.json (stream C/E) so a class preview and a dropped themed piece agree. Read with class-outfits.js loadClassOutfits2(); `dressAs(avatar, t2[cls])` dresses a body; `tier2Dress(look, t2[cls], opts)` lays the tier-2 pieces over a gear-driven look. Every id survives the shared normaliser (tests/class-outfits-t2.test.js). Regenerate with `node tools/build-class-outfits-t2.mjs` (the hand-kept table lives there).';
writeFileSync('/home/radgh/claude/playground/avatar-3d/data/class-outfits-t2.json', JSON.stringify({ _doc: doc, slots: ['hat', 'top', 'bottom', 'shoes', 'cape', 'decor', 'held', 'offhand'], classes }, null, 1) + '\n');
console.log(Object.keys(classes).length);
