#!/usr/bin/env python3
"""
build-emberveil-sets.py - the class sets for prototypes/emberveil (round 22, E49).

One set per class. The four ported sets that already fit a class (Paladin's Oath, Cleric's Vigil,
Apprentice's Initiation, Shadow Adept) are tagged with that class; the other 26 classes get a new set
defined below. Each new set is 2 to 6 pieces, wearable by its class (weapons come from the class's own
weapon list), with bonuses at 2/3/4/6 pieces (a 5-piece set tops out at 5).

What a bonus may carry, so it actually works in the game:
  - plain stats that rules.derive() reads through loot.equipmentBonuses() (str, hp, critChance...)
  - `cond_*` / barrier keys only if js/effects.js gives them a `derive` hook (set bonuses never reach
    the combat hooks; those only read item affixes)
  - a threshold power: `thresholdPowers: {"4": "<legendary id>"}`, switched on by loot.legendaryEffects()
  - the set's full-set `legendaryEffect` (a registered `legendary:` id)
Combat `cond_*` properties go on a piece's fixedAffixes, where effects.actorFx() picks them up.

Safe to run more than once: sets marked "classSet": true are replaced, everything else is kept.
The file is written the way it was built (json indent=1, ASCII), so the diff is only the sets.

    python3 tools/build-emberveil-sets.py
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ITEMS = os.path.join(HERE, '..', 'prototypes', 'emberveil', 'data', 'items.json')
CLASSES = os.path.join(HERE, '..', 'prototypes', 'emberveil', 'data', 'classes.json')

# The ported sets that already suit a class: tag them instead of adding a second set for that class.
TAG_EXISTING = {
    'paladins_oath': ['paladin'],
    'clerics_vigil': ['cleric'],
    'apprentice_initiation': ['mage'],
    'shadow_adept': ['rogue'],
}

# Threshold ladder by set size (the task asked for 2/3/4/6; a 5-piece set's top step is 5).
LADDER = {2: [2], 3: [2, 3], 4: [2, 3, 4], 5: [2, 3, 4, 5], 6: [2, 3, 4, 6]}


def P(slot, base, name, fixed=None, rand=None):
    """One piece: slot, base item key, its own name, fixed affixes {stat: value}, random {stat: (min, max)}."""
    return {
        'slot': slot, 'baseItemId': base, 'name': name,
        'fixedAffixes': [{'stat': k, 'value': float(v)} for k, v in (fixed or {}).items()],
        'randomAffixes': [{'stat': k, 'min': float(a), 'max': float(b)} for k, (a, b) in (rand or {}).items()],
    }


def S(id, name, cls, tier, pieces, bonuses, legendary, powers=None, lore=''):
    size = len(pieces)
    steps = LADDER[size]
    assert len(bonuses) == len(steps), f'{id}: {len(bonuses)} bonus steps for a {size}-piece set'
    out = {
        'id': id, 'name': name, 'tier': tier, 'pieces': size, 'classes': [cls], 'classSet': True,
        'lore': lore, 'items': pieces, 'legendaryEffect': legendary, 'activationPieces': size,
        'partialBonuses': {str(t): {k: float(v) for k, v in b.items()} for t, b in zip(steps, bonuses)},
    }
    if powers:
        out['thresholdPowers'] = {str(k): v for k, v in powers.items()}
    return out


SETS = [
    S('vanguard_bloodforged', 'Bloodforged Vanguard', 'warrior', 'mid', [
        P('weapon', 'greatsword', 'Vanguard Greatblade', {'str': 6, 'cond_dmgBelowHpThresh': 0.15}, {'hp': (20, 40)}),
        P('head', 'heavy_helm', 'Vanguard Warhelm', {'str': 4, 'armor': 6}, {'con': (3, 6)}),
        P('chest', 'heavy_chest', 'Vanguard Hauberk', {'con': 5, 'armor': 10}, {'hp': (25, 45)}),
        P('legs', 'heavy_legs', 'Vanguard Greaves', {'str': 4, 'armor': 6}, {'initiative': (2, 4)}),
    ], [{'str': 6, 'armor': 6}, {'str': 9, 'hp': 30}, {'str': 13, 'hp': 50, 'critDamage': 0.15}],
        'rally_on_kill', lore='Worn by the first rank, the ones who are still standing when the line breaks.'),

    S('drillmasters_discipline', "Drillmaster's Discipline", 'fighter', 'low', [
        P('weapon', 'longsword', "Drillmaster's Blade", {'str': 4, 'hit': 3}, {'dex': (2, 4)}),
        P('hands', 'heavy_gauntlets', "Drillmaster's Grips", {'str': 3, 'cond_consecutiveHitDmg': 0.04}, {'armor': (2, 4)}),
        P('feet', 'heavy_boots', "Drillmaster's Treads", {'con': 3, 'armor': 3}, {'initiative': (1, 3)}),
    ], [{'str': 4, 'hit': 5}, {'str': 7, 'hit': 8, 'initiative': 3}],
        'speed_combat_init', lore='The same cut a thousand times, until the thousand-and-first is not a decision.'),

    S('longwatch_stalker', 'Longwatch Stalker', 'ranger', 'mid', [
        P('weapon', 'bow', 'Longwatch Recurve', {'dex': 6, 'cond_firstHitCritBonus': 0.2}, {'hit': (3, 6)}),
        P('head', 'light_helm', 'Longwatch Hood', {'dex': 4, 'hit': 3}, {'dodge': (2, 4)}),
        P('chest', 'light_chest', 'Longwatch Jerkin', {'dex': 5, 'armor': 4}, {'hp': (15, 30)}),
        P('feet', 'light_boots', 'Longwatch Striders', {'dex': 4, 'dodge': 3}, {'initiative': (2, 4)}),
    ], [{'dex': 6, 'hit': 5}, {'dex': 9, 'critChance': 0.04}, {'dex': 13, 'critChance': 0.07, 'critDamage': 0.2}],
        'critical_armorpen', lore='A watcher on the high road sees the ambush a day before it happens.'),

    S('tavern_choir', 'Tavern Choir', 'bard', 'low', [
        P('weapon', 'dagger', "Chorister's Knife", {'dex': 3, 'int': 3}, {'critChance': (0.02, 0.04)}),
        P('necklace', 'silver_amulet', "Chorister's Pitch-Pipe", {'int': 4, 'cond_partyHpOnKill': 4}, {'mp': (10, 20)}),
    ], [{'int': 5, 'mp': 20, 'cooldownReduction': 0.05}],
        'rally_on_kill', lore='Every road house has a song about the party. Most of them are rude.'),

    S('gravewrights_shroud', "Gravewright's Shroud", 'necromancer', 'mid', [
        P('weapon', 'staff', "Gravewright's Crook", {'int': 6, 'cond_hpOnKill': 8}, {'spellPower': (0.04, 0.08)}),
        P('head', 'cloth_helm', "Gravewright's Cowl", {'int': 4, 'mp': 15}, {'magicResist': (4, 8)}),
        P('chest', 'cloth_chest', "Gravewright's Winding", {'int': 5, 'armor': 3}, {'hp': (15, 30)}),
        P('legs', 'cloth_legs', "Gravewright's Wraps", {'int': 4, 'mp': 10}, {'manaRegen': (1, 3)}),
        P('ring', 'ring', "Gravewright's Knucklebone", {'int': 3, 'cond_dmgVsUndead': 15}, {'mp': (10, 20)}),
    ], [{'int': 6, 'mp': 20}, {'int': 9, 'spellPower': 0.08}, {'int': 13, 'spellPower': 0.14, 'hp': 30},
        {'int': 18, 'spellPower': 0.2, 'barrier': 20}],
        'curse_spreads', powers={4: 'kill_party_heal'}, lore='What is buried keeps a ledger. The shroud reads it aloud.'),

    S('pactbinders_regalia', "Pactbinder's Regalia", 'warlock', 'mid', [
        P('weapon', 'wand', "Pactbinder's Rod", {'int': 5, 'spellPower': 0.05}, {'critChance': (0.02, 0.04)}),
        P('chest', 'cloth_chest', "Pactbinder's Vestment", {'int': 5, 'hp': 20}, {'mp': (15, 25)}),
        P('ring', 'gold_signet', "Pactbinder's Seal", {'int': 3, 'cond_magicDmgVsAnyStatus': 0.1}, {'lifeSteal': (1, 3)}),
    ], [{'int': 6, 'spellPower': 0.06}, {'int': 9, 'spellPower': 0.12, 'lifeSteal': 3}],
        'low_mana_shockwave', lore='Signed in something that was not ink, by someone who read the small print.'),

    S('hellwardens_mark', "Hellwarden's Mark", 'demon_hunter', 'mid', [
        P('weapon', 'crossbow', "Hellwarden's Arbalest", {'dex': 5, 'cond_dmgVsDemon': 20}, {'hit': (3, 6)}),
        P('head', 'light_helm', "Hellwarden's Blindfold", {'dex': 3, 'cond_dmgVsUndead': 15}, {'magicResist': (4, 8)}),
        P('chest', 'light_chest', "Hellwarden's Coat", {'dex': 4, 'armor': 5}, {'hp': (15, 30)}),
        P('hands', 'light_gauntlets', "Hellwarden's Tally Gloves", {'dex': 3, 'critChance': 0.03}, {'initiative': (2, 4)}),
    ], [{'dex': 6, 'hit': 4}, {'dex': 9, 'critChance': 0.04}, {'dex': 12, 'critDamage': 0.2, 'magicResist': 10}],
        'strip_modifier', lore='Each notch on the gloves is a name something from below will not be using again.'),

    S('ragpickers_fortune', "Ragpicker's Fortune", 'scavenger', 'low', [
        P('weapon', 'dagger', "Ragpicker's Shiv", {'dex': 3, 'goldFind': 0.05}, {'critChance': (0.02, 0.03)}),
        P('hands', 'light_gauntlets', "Ragpicker's Mitts", {'dex': 3, 'cond_goldOnEliteKill': 0.25}, {'armor': (1, 3)}),
        P('necklace', 'necklace', "Ragpicker's Lucky Tooth", {'con': 3, 'goldFind': 0.05}, {'xpFind': (0.03, 0.06)}),
    ], [{'dex': 4, 'goldFind': 0.1}, {'dex': 6, 'goldFind': 0.2, 'xpFind': 0.05}],
        'road_cache', lore='Nothing on the road is lost. It is just waiting for the right pockets.'),

    S('corsairs_flourish', "Corsair's Flourish", 'swashbuckler', 'low', [
        P('weapon', 'rapier', "Corsair's Needle", {'dex': 4, 'cond_speedOnFirstHit': 4}, {'critChance': (0.02, 0.04)}),
        P('chest', 'light_chest', "Corsair's Frock Coat", {'dex': 3, 'dodge': 3}, {'hp': (10, 25)}),
        P('feet', 'light_boots', "Corsair's Deck Boots", {'dex': 3, 'initiative': 2}, {'dodge': (2, 4)}),
    ], [{'dex': 5, 'dodge': 4}, {'dex': 8, 'dodge': 6, 'critChance': 0.04}],
        'crit_bleed_5', lore='Half the fight is the bow before it. The other half is the bow after.'),

    S('wyrmsworn_panoply', 'Wyrmsworn Panoply', 'dragon_knight', 'endgame', [
        P('weapon', 'dragonfang_greatsword', 'Wyrmsworn Fang', {'str': 8, 'cond_executeDmgPct': 0.2}, {'critDamage': (0.1, 0.2)}),
        P('head', 'wyrmscale_helm', 'Wyrmsworn Crest', {'str': 5, 'armor': 8}, {'magicResist': (6, 12)}),
        P('chest', 'wyrmscale_chest', 'Wyrmsworn Scaleplate', {'con': 7, 'armor': 14}, {'hp': (40, 70)}),
        P('legs', 'dragonhide_legs', 'Wyrmsworn Tassets', {'str': 5, 'armor': 8}, {'con': (4, 7)}),
        P('hands', 'dragonclaw_gauntlets', 'Wyrmsworn Talons', {'str': 5, 'critChance': 0.03}, {'armor': (4, 8)}),
        P('ring', 'dragonheart_ring', 'Wyrmsworn Heartstone', {'str': 4, 'hp': 30}, {'magicResist': (5, 10)}),
    ], [{'str': 8, 'armor': 8}, {'str': 12, 'hp': 40, 'magicResist': 8}, {'str': 16, 'hp': 70, 'armor': 16},
        {'str': 24, 'hp': 110, 'critDamage': 0.3, 'armor': 24}],
        'dragon_fury_breath', powers={4: 'burn_extend'}, lore='Sworn to a dragon that is still alive, and still keeping count.'),

    S('cinderheart_vestments', 'Cinderheart Vestments', 'pyromancer', 'mid', [
        P('weapon', 'ember_focus', 'Cinderheart Brand', {'int': 6, 'cond_burnExtend': 1}, {'spellPower': (0.04, 0.08)}),
        P('head', 'cloth_helm', 'Cinderheart Hood', {'int': 4, 'mp': 15}, {'critChance': (0.02, 0.04)}),
        P('chest', 'cloth_chest', 'Cinderheart Robe', {'int': 5, 'hp': 20}, {'magicResist': (4, 8)}),
        P('legs', 'cloth_legs', 'Cinderheart Leggings', {'int': 4, 'armor': 2}, {'mp': (10, 20)}),
    ], [{'int': 6, 'spellPower': 0.06}, {'int': 9, 'spellPower': 0.1, 'mp': 25},
        {'int': 13, 'spellPower': 0.16, 'cond_dotDmgReduce': 0.2}],
        'burn_extend', lore='Scorched at the hem and never once on fire. The wearer is less lucky.'),

    S('tempest_crown', 'Tempest Crown', 'stormcaller', 'endgame', [
        P('weapon', 'dragontooth_wand', 'Tempest Rod', {'int': 7, 'spellPower': 0.08}, {'critChance': (0.03, 0.05)}),
        P('offhand', 'spellguard_orb', 'Tempest Eye', {'int': 5, 'magicResist': 8}, {'mp': (20, 35)}),
        P('head', 'cloth_helm', 'Tempest Crown', {'int': 6, 'initiative': 3}, {'spellPower': (0.03, 0.07)}),
        P('chest', 'dragonscale_cloth', 'Tempest Mantle', {'int': 6, 'hp': 35}, {'magicResist': (6, 12)}),
        P('necklace', 'silver_amulet', 'Tempest Lodestone', {'int': 5, 'cond_manaOnCrit': 6}, {'critDamage': (0.1, 0.2)}),
    ], [{'int': 7, 'critChance': 0.03}, {'int': 11, 'spellPower': 0.1}, {'int': 15, 'spellPower': 0.16, 'initiative': 5},
        {'int': 20, 'spellPower': 0.24, 'critDamage': 0.25}],
        'echo_cast', powers={4: 'mage_missile_aoe'}, lore='The storm does not answer. It repeats itself, louder.'),

    S('grovekeepers_bark', "Grovekeeper's Bark", 'druid', 'mid', [
        P('weapon', 'quarterstaff', "Grovekeeper's Staff", {'int': 5, 'hpRegen': 2}, {'con': (3, 5)}),
        P('head', 'medium_helm', "Grovekeeper's Antlers", {'con': 4, 'armor': 5}, {'mp': (10, 20)}),
        P('chest', 'medium_chest', "Grovekeeper's Barkmail", {'con': 5, 'cond_physDmgReducePct': 0.06}, {'hp': (20, 40)}),
    ], [{'int': 5, 'con': 5, 'hpRegen': 3}, {'int': 8, 'con': 8, 'hp': 35, 'hpRegen': 5}],
        'camp_mend', lore='Grown, not forged. It still sheds in the autumn.'),

    S('seers_veiled_sight', "Seer's Veiled Sight", 'oracle', 'low', [
        P('weapon', 'scepter', "Seer's Rod", {'int': 4, 'spellPower': 0.04}, {'mp': (10, 20)}),
        P('head', 'cloth_helm', "Seer's Veil", {'int': 3, 'cond_combatStartBarrier': 12}, {'dodge': (1, 3)}),
        P('chest', 'cloth_chest', "Seer's Stole", {'int': 3, 'magicResist': 5}, {'hp': (10, 20)}),
        P('necklace', 'necklace', "Seer's Scrying Bead", {'int': 3, 'dodge': 2}, {'manaRegen': (1, 2)}),
    ], [{'int': 4, 'dodge': 3}, {'int': 7, 'magicResist': 8}, {'int': 10, 'magicResist': 12, 'barrier': 15}],
        'cheat_death_once', lore='She saw the blow coming. She saw where she would be standing instead.'),

    S('marshals_campaign', "Marshal's Campaign", 'tactician', 'mid', [
        P('weapon', 'longsword', "Marshal's Baton-Blade", {'int': 4, 'str': 3}, {'initiative': (2, 4)}),
        P('offhand', 'kite_shield', "Marshal's Standard", {'con': 4, 'block_power': 10}, {'armor': (3, 6)}),
        P('head', 'medium_helm', "Marshal's Plumed Helm", {'int': 4, 'initiative': 2}, {'armor': (2, 5)}),
        P('chest', 'medium_chest', "Marshal's Field Coat", {'con': 4, 'armor': 6}, {'hp': (20, 35)}),
        P('ring', 'gold_signet', "Marshal's Seal of Orders", {'int': 3, 'cond_killInitBonus': 4}, {'cooldownReduction': (0.03, 0.06)}),
    ], [{'int': 5, 'initiative': 4}, {'int': 8, 'initiative': 6, 'armor': 8}, {'int': 11, 'initiative': 8, 'armor': 12},
        {'int': 15, 'initiative': 12, 'cooldownReduction': 0.1, 'armor': 16}],
        'rally_on_kill', powers={4: 'speed_combat_init'}, lore='Every order was written the night before. Most of them were right.'),

    S('hourglass_reliquary', 'Hourglass Reliquary', 'chronomancer', 'endgame', [
        P('weapon', 'wand', 'Reliquary Hand', {'int': 7, 'cooldownReduction': 0.04}, {'spellPower': (0.05, 0.1)}),
        P('head', 'cloth_helm', 'Reliquary Circlet', {'int': 6, 'initiative': 4}, {'mp': (20, 35)}),
        P('chest', 'dragonscale_cloth', 'Reliquary Robe of Hours', {'int': 6, 'hp': 35}, {'magicResist': (6, 12)}),
        P('ring', 'gold_signet', 'Reliquary Sand-Ring', {'int': 5, 'cond_afterSkillSpellPow': 0.12}, {'cooldownReduction': (0.03, 0.06)}),
    ], [{'int': 7, 'cooldownReduction': 0.05}, {'int': 11, 'initiative': 6, 'cooldownReduction': 0.08},
        {'int': 15, 'cooldownReduction': 0.12, 'cond_skillMpCostReduce': 3}],
        'echo_cast', lore='The glass runs both ways if you hold it right. Nobody holds it right twice.'),

    S('stillwater_wraps', 'Stillwater Wraps', 'monk', 'low', [
        P('weapon', 'quarterstaff', 'Stillwater Staff', {'dex': 4, 'dodge': 2}, {'str': (2, 4)}),
        P('hands', 'light_gauntlets', 'Stillwater Hand Wraps', {'dex': 3, 'cond_consecutiveHitDmg': 0.05}, {'critChance': (0.02, 0.03)}),
        P('feet', 'light_boots', 'Stillwater Sandals', {'dex': 3, 'dodge': 3}, {'hpRegen': (1, 2)}),
    ], [{'dex': 5, 'dodge': 5}, {'dex': 8, 'dodge': 7, 'hpRegen': 3}],
        'speed_combat_init', lore='Be the pond. Let the stone sink. Then hit the stone.'),

    S('spiritcallers_totems', "Spiritcaller's Totems", 'shaman', 'mid', [
        P('weapon', 'scepter', "Spiritcaller's Totem Rod", {'int': 5, 'manaRegen': 2}, {'spellPower': (0.03, 0.07)}),
        P('offhand', 'warded_focus', "Spiritcaller's Fetish", {'int': 4, 'cond_lowManaRegenBonus': 0.3}, {'mp': (15, 25)}),
        P('head', 'medium_helm', "Spiritcaller's Mask", {'con': 4, 'armor': 5}, {'magicResist': (4, 8)}),
        P('legs', 'medium_legs', "Spiritcaller's Leggings", {'con': 4, 'armor': 5}, {'hp': (15, 30)}),
    ], [{'int': 6, 'mp': 20}, {'int': 9, 'hpRegen': 4, 'manaRegen': 3}, {'int': 12, 'spellPower': 0.12, 'hp': 30}],
        'kill_party_heal', lore='The ancestors are always listening. They are not always on your side.'),

    S('inquisitors_brand', "Inquisitor's Brand", 'witch_hunter', 'mid', [
        P('weapon', 'crossbow', "Inquisitor's Crossbow", {'dex': 5, 'hit': 4}, {'critChance': (0.02, 0.04)}),
        P('head', 'medium_helm', "Inquisitor's Capotain", {'dex': 3, 'magicResist': 6}, {'armor': (2, 5)}),
        P('chest', 'medium_chest', "Inquisitor's Longcoat", {'con': 4, 'cond_magicDmgReducePct': 0.1}, {'hp': (20, 35)}),
    ], [{'dex': 6, 'magicResist': 8}, {'dex': 9, 'magicResist': 14, 'hit': 6}],
        'strip_modifier', lore='Every spell leaves a mark. The coat is stitched from what the marks remember.'),

    S('oathbound_bulwark', 'Oathbound Bulwark', 'knight', 'endgame', [
        P('weapon', 'longsword', 'Oathbound Sword', {'str': 6, 'hit': 4}, {'con': (3, 6)}),
        P('offhand', 'tower_shield', 'Oathbound Wall', {'con': 6, 'cond_physDmgReducePct': 0.08}, {'block_power': (10, 20)}),
        P('head', 'plate_helm', 'Oathbound Greathelm', {'con': 5, 'armor': 8}, {'magicResist': (5, 10)}),
        P('chest', 'runed_chest', 'Oathbound Cuirass', {'con': 6, 'armor': 12}, {'hp': (40, 70)}),
        P('legs', 'runed_legs', 'Oathbound Legplates', {'str': 4, 'armor': 8}, {'con': (3, 6)}),
        P('feet', 'runed_boots', 'Oathbound Sabatons', {'con': 4, 'armor': 6}, {'initiative': (1, 3)}),
    ], [{'str': 6, 'armor': 10}, {'con': 8, 'armor': 16, 'block_power': 12}, {'str': 10, 'con': 12, 'armor': 24},
        {'str': 16, 'con': 18, 'armor': 36, 'hp': 90, 'cond_thornsFlat': 10}],
        'cheat_death_once', powers={4: 'kill_party_heal'}, lore='The oath was to stand. It never said anything about winning.'),

    S('wildblood_mantle', 'Wildblood Mantle', 'sorcerer', 'low', [
        P('weapon', 'wand', 'Wildblood Wand', {'int': 4, 'cond_manaOnCrit': 4}, {'critChance': (0.02, 0.04)}),
        P('legs', 'cloth_legs', 'Wildblood Skirts', {'int': 4, 'mp': 15}, {'spellPower': (0.03, 0.05)}),
    ], [{'int': 6, 'critChance': 0.04, 'spellPower': 0.06}],
        'low_mana_shockwave', lore='Talent that came in the blood, and wants to go back out the same way.'),

    S('anvilsong_runes', 'Anvilsong Runes', 'runesmith', 'mid', [
        P('weapon', 'warhammer', 'Anvilsong Maul', {'str': 5, 'cond_sunderOnHit': 0.15}, {'armor': (2, 5)}),
        P('offhand', 'kite_shield', 'Anvilsong Rune-Shield', {'con': 4, 'block_power': 10}, {'barrier': (8, 15)}),
        P('head', 'heavy_helm', 'Anvilsong Helm', {'str': 4, 'armor': 6}, {'con': (2, 5)}),
        P('chest', 'heavy_chest', 'Anvilsong Forgeplate', {'con': 5, 'armor': 10}, {'hp': (25, 45)}),
        P('hands', 'heavy_gauntlets', 'Anvilsong Tongs', {'str': 4, 'armor': 4}, {'barrierRegen': (1, 3)}),
    ], [{'str': 6, 'armor': 8}, {'str': 9, 'barrier': 15}, {'str': 12, 'armor': 14, 'barrier': 25},
        {'str': 16, 'armor': 20, 'barrier': 35, 'barrierRegen': 4}],
        'critical_armorpen', powers={4: 'rally_on_kill'}, lore='Each rune was struck on the beat. Wear it long enough and you hear the song.'),

    S('duskveil_silks', 'Duskveil Silks', 'shadow_dancer', 'mid', [
        P('weapon', 'dagger', 'Duskveil Kiss', {'dex': 5, 'cond_bleedOnCrit': 0.25}, {'critChance': (0.02, 0.05)}),
        P('head', 'light_helm', 'Duskveil Mask', {'dex': 3, 'dodge': 3}, {'initiative': (2, 4)}),
        P('legs', 'light_legs', 'Duskveil Trousers', {'dex': 4, 'armor': 3}, {'hp': (15, 25)}),
        P('feet', 'light_boots', 'Duskveil Slippers', {'dex': 3, 'dodge': 3}, {'critDamage': (0.05, 0.12)}),
    ], [{'dex': 6, 'dodge': 5}, {'dex': 9, 'critChance': 0.05}, {'dex': 12, 'dodge': 8, 'critDamage': 0.25}],
        'crit_bleed_5', lore='The steps are the same as a dance. The partner does not get up after.'),

    S('cogwrights_harness', "Cogwright's Harness", 'tinker', 'low', [
        P('weapon', 'crossbow', "Cogwright's Repeater", {'dex': 3, 'int': 3}, {'hit': (2, 4)}),
        P('hands', 'medium_gauntlets', "Cogwright's Work Gloves", {'int': 3, 'cond_companionFury': 0.2}, {'armor': (2, 4)}),
        P('feet', 'medium_boots', "Cogwright's Spring-Boots", {'dex': 3, 'initiative': 2}, {'armor': (2, 4)}),
        P('ring', 'gold_signet', "Cogwright's Winding Key", {'int': 3, 'dex': 2}, {'cooldownReduction': (0.02, 0.05)}),
    ], [{'int': 4, 'dex': 4}, {'int': 6, 'dex': 6, 'initiative': 4}, {'int': 9, 'dex': 9, 'cond_thornsFlat': 6}],
        'companion_might', lore='Every buckle does two things. One of them is usually on purpose.'),

    S('lightbearers_cassock', "Lightbearer's Cassock", 'priest', 'endgame', [
        P('weapon', 'scepter', "Lightbearer's Censer", {'int': 7, 'cond_dmgVsUndead': 20}, {'spellPower': (0.05, 0.1)}),
        P('head', 'light_helm', "Lightbearer's Mitre", {'int': 5, 'magicResist': 8}, {'mp': (20, 35)}),
        P('chest', 'light_chest', "Lightbearer's Cassock", {'con': 6, 'hp': 35}, {'armor': (4, 8)}),
        P('legs', 'light_legs', "Lightbearer's Vestments", {'int': 5, 'hpRegen': 2}, {'magicResist': (5, 10)}),
        P('necklace', 'silver_amulet', "Lightbearer's Sunmedal", {'int': 5, 'cond_partyHpOnKill': 6}, {'manaRegen': (2, 4)}),
    ], [{'int': 7, 'hp': 25}, {'int': 11, 'hpRegen': 5}, {'int': 15, 'hp': 50, 'magicResist': 12},
        {'int': 20, 'hp': 80, 'cond_dotDmgReduce': 0.25}],
        'cheat_death_once', powers={4: 'kill_party_heal'}, lore='It glows faintly in the dark. That is not always a comfort to the ones in the dark.'),

    S('mesmers_silkwork', "Mesmer's Silkwork", 'enchanter', 'low', [
        P('weapon', 'wand', "Mesmer's Baton", {'int': 4, 'mp': 10}, {'spellPower': (0.03, 0.05)}),
        P('chest', 'light_chest', "Mesmer's Silk Coat", {'int': 3, 'dodge': 2}, {'hp': (10, 20)}),
        P('ring', 'ring', "Mesmer's Spiral Ring", {'int': 3, 'cond_manaShieldOnHit': 0.15}, {'mp': (10, 20)}),
    ], [{'int': 5, 'mp': 15}, {'int': 8, 'spellPower': 0.08, 'cooldownReduction': 0.05}],
        'mana_on_attack', lore='Look at the spiral. No, keep looking. There. Now you are on our side.'),
]


def main():
    with open(ITEMS, encoding='utf-8') as f:
        raw = f.read()
    data = json.loads(raw)
    classes = json.load(open(CLASSES, encoding='utf-8'))['classes']
    by_class = {c['id']: c for c in classes}
    bases = {**data['weaponBases'], **data['armorBases']}

    kept = [s for s in data['sets'] if not s.get('classSet')]
    for s in kept:
        if s['id'] in TAG_EXISTING:
            s['classes'] = TAG_EXISTING[s['id']]

    problems = []
    for s in SETS:
        cls = by_class.get(s['classes'][0])
        if not cls:
            problems.append(f"{s['id']}: unknown class {s['classes'][0]}")
            continue
        slots = [p['slot'] for p in s['items']]
        if len(set(slots) - {'ring'}) != len([x for x in slots if x != 'ring']):
            problems.append(f"{s['id']}: two pieces in one slot {slots}")
        for p in s['items']:
            b = bases.get(p['baseItemId'])
            if not b:
                problems.append(f"{s['id']}: no base {p['baseItemId']}")
                continue
            if b['type'] == 'weapon' and b.get('subtype') not in cls['weapons'] and p['baseItemId'] not in cls['weapons']:
                problems.append(f"{s['id']}: {cls['name']} cannot use {p['baseItemId']} ({b.get('subtype')})")
            if b['type'] == 'weapon' and b.get('twoHanded') and 'offhand' in slots:
                problems.append(f"{s['id']}: two-handed {p['baseItemId']} with an off-hand piece")
    covered = {c for s in kept + SETS for c in s.get('classes', [])}
    for c in by_class:
        if c not in covered:
            problems.append(f'no set for class {c}')
    if problems:
        print('\n'.join(problems))
        sys.exit(1)

    data['sets'] = kept + SETS
    out = json.dumps(data, indent=1, ensure_ascii=True)
    with open(ITEMS, 'w', encoding='utf-8') as f:
        f.write(out)
    sizes = {}
    for s in SETS:
        sizes[s['pieces']] = sizes.get(s['pieces'], 0) + 1
    print(f"{len(data['sets'])} sets ({len(SETS)} class sets, {len(TAG_EXISTING)} ported sets tagged); sizes {dict(sorted(sizes.items()))}")


if __name__ == '__main__':
    main()
