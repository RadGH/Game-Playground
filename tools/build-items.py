#!/usr/bin/env python3
"""Builds items/data/items.json and items/data/materials.json from the lists below. Edit lists, re-run."""
import json
from collections import Counter
items=[]
def it(id,name,cat,sub,tags,aff=None,rarity='common',value=(1,10),mats=None,desc='',excl=None,dmg=None):
    d={"id":id,"name":name,"category":cat,"sub":sub,"tags":tags,"affinity":aff or {},"rarity":rarity,"value":list(value),"materials":mats or [],"desc":desc}
    if excl: d["exclusive"]=excl
    if dmg: d["damage"]=dmg
    items.append(d)
def rows(lst, cat, sub, mats, dmg=None):
    for row in lst:
        id,name,tags,aff,rar,val,desc=row[:7]; excl=row[7] if len(row)>7 else None
        it(id,name,cat,sub(tags) if callable(sub) else sub,tags,aff,rar,val,mats,desc,excl=excl,dmg=dmg)
M_WEAPON=["steel","iron","bronze","mithril","silver","bone","obsidian"]
# ---------- WEAPONS
rows([
 ("shortsword","shortsword",["blade","one-handed","common-arms"],{"human":2,"halfling":2,"goblin":1},"common",(15,40),"A plain double-edged blade a forearm long."),
 ("arming_sword","arming sword",["blade","one-handed","knightly"],{"human":3},"common",(30,80),"The knight's straight sword, cruciform hilt."),
 ("longsword","longsword",["blade","two-handed","versatile"],{"human":3,"elf":1},"common",(40,120),"Hand-and-a-half blade for cut and thrust."),
 ("greatsword","greatsword",["blade","two-handed","heavy"],{"human":2,"giant":1,"orc":1},"uncommon",(80,250),"Man-tall two-hander swung from the shoulder."),
 ("falchion","falchion",["blade","one-handed","chopping"],{"human":2,"orc":2},"common",(20,60),"Broad, heavy-tipped chopper."),
 ("scimitar","scimitar",["blade","one-handed","curved","slashing"],{"human":2,"fey":1},"common",(25,70),"Curved single-edged blade, quick in the draw."),
 ("sabre","sabre",["blade","one-handed","curved","cavalry"],{"human":2},"common",(30,90),"Cavalry sword with a knuckle-bow."),
 ("rapier","rapier",["blade","one-handed","thrusting","duelling"],{"human":2,"elf":2},"uncommon",(40,140),"Slender thrusting blade for the duelling floor."),
 ("gladius","gladius",["blade","one-handed","short","legion"],{"human":2},"common",(20,50),"Short stabbing sword of the old legions."),
 ("claymore","claymore",["blade","two-handed","highland"],{"human":2,"dwarf":1},"uncommon",(90,260),"Great sword with down-sloping quillons."),
 ("estoc","estoc",["blade","two-handed","thrusting","anti-armour"],{"human":2},"uncommon",(60,180),"Edgeless armour-piercing spike of a sword."),
 ("cutlass","cutlass",["blade","one-handed","curved","naval"],{"human":2,"goblin":1},"common",(20,60),"Short, thick sailor's sword."),
 ("dao","broad chopper",["blade","one-handed","chopping"],{"orc":2,"troll":1},"common",(20,55),"Wide single-edged cleaver of a sword."),
 ("leafblade","leaf blade",["blade","one-handed","elegant","ancient"],{"elf":3},"uncommon",(60,200),"Leaf-shaped elven blade, balanced for grace."),
 ("moonblade","moonblade",["blade","one-handed","elegant","magic","heirloom"],{"elf":3},"rare",(400,1500),"Slender curved elven sword that glows faintly at night.","elf"),
 ("cleaver_sword","war cleaver",["blade","two-handed","brutal","chopping"],{"orc":3,"troll":2},"common",(30,90),"More slab than sword; orcs like the weight.","orc"),
 ("bonesword","bone sword",["blade","one-handed","crude","gore"],{"orc":2,"goblin":2,"undead":2},"common",(5,25),"Sharpened femur of something large."),
 ("shard_blade","obsidian shard blade",["blade","one-handed","brittle","sharp"],{"goblin":2,"orc":1,"dragon":1},"uncommon",(30,90),"Volcanic glass edge; terrifyingly sharp, breaks easily."),
 ("grave_blade","grave blade",["blade","one-handed","cursed","cold"],{"undead":3},"rare",(200,900),"Black iron sword that drinks warmth.","undead"),
 ("carving_sword","carving sword",["blade","one-handed","kitchen","humble"],{"halfling":2},"common",(10,30),"Halfling 'sword': an overgrown carving knife with a good handle."),
 ("spring_sabre","spring-sabre",["blade","one-handed","tinker","gadget"],{"gnome":3},"rare",(150,500),"Sabre with a spring-loaded pommel that extends the reach a hand's width.","gnome"),
 ("giant_sword","giant's sword",["blade","huge","two-handed"],{"giant":3},"rare",(300,900),"A sword scaled for a giant; humans use it as a bridge.","giant"),
 ("dragonfang_sword","dragonfang sword",["blade","one-handed","fang","magic"],{"dragon":2,"human":1},"epic",(2000,8000),"A tooth of a great wyrm, hafted and edged."),
 ("hook_sword","hook sword",["blade","one-handed","hook","exotic"],{"human":1,"goblin":1,"fey":1},"uncommon",(40,120),"Hooked tip for catching blades and ankles."),
 ("sickle_sword","sickle sword",["blade","one-handed","curved","ancient"],{"human":1,"undead":2,"giant":1},"uncommon",(30,100),"Bronze-age crescent blade."),
 ("thorn_blade","thornblade",["blade","one-handed","fey","living","magic"],{"fey":3},"rare",(200,800),"Grown, not forged; still has leaves at the hilt.","fey"),
], "weapon","sword",M_WEAPON,"slash")
rows([
 ("dagger","dagger",["blade","small","concealable"],{"human":2,"goblin":2,"halfling":1},"common",(5,25),"Double-edged fighting knife."),
 ("dirk","dirk",["blade","small","long"],{"human":2,"dwarf":1},"common",(8,30),"Long, narrow dagger."),
 ("stiletto","stiletto",["blade","small","thrusting","assassin"],{"human":2,"goblin":1},"uncommon",(15,50),"Needle-pointed; finds gaps in mail."),
 ("kris","wave-bladed dagger",["blade","small","ritual","curved"],{"fey":2,"undead":1},"uncommon",(20,80),"Wavy blade for ceremony and spite."),
 ("skinning_knife","skinning knife",["blade","small","tool","hunting"],{"human":2,"orc":2,"elf":1},"common",(3,12),"Curved blade for hides."),
 ("rusty_shiv","rusty shiv",["blade","small","crude","filthy"],{"goblin":3},"common",(1,3),"Bit of metal, bit of rag. Goblin standard issue.","goblin"),
 ("bread_knife","bread knife",["blade","small","kitchen","humble"],{"halfling":3},"common",(2,8),"Serrated; also excellent against burglars."),
 ("boot_knife","boot knife",["blade","small","concealable"],{"human":2,"halfling":2},"common",(5,15),"Lives in the boot until needed."),
 ("sacrificial_knife","sacrificial knife",["blade","small","ritual","dark"],{"undead":2,"orc":1},"uncommon",(20,90),"Obsidian or black iron; stained."),
 ("carving_set","carving set",["blade","small","kitchen","set"],{"halfling":2,"human":1},"common",(10,30),"Matched knives in a leather roll."),
 ("main_gauche","parrying dagger",["blade","small","duelling","off-hand"],{"human":2,"elf":1},"uncommon",(20,70),"Broad guard for catching a rapier."),
 ("tusk_knife","tusk knife",["blade","small","orc","bone"],{"orc":3},"common",(3,15),"Boar tusk, edged; every orc child gets one.","orc"),
 ("letter_opener","letter opener",["blade","small","office","humble"],{"human":2,"gnome":1},"common",(1,5),"Dull enough to be polite, sharp enough to be rude."),
], "weapon","dagger",M_WEAPON,"pierce")
rows([
 ("hand_axe","hand axe",["axe","one-handed","tool"],{"dwarf":3,"human":2,"orc":2},"common",(8,30),"Fells trees or foes."),
 ("battleaxe","battleaxe",["axe","one-handed","war"],{"dwarf":3,"orc":2,"human":1},"common",(30,90),"Bearded head on a stout haft."),
 ("greataxe","greataxe",["axe","two-handed","heavy"],{"dwarf":2,"orc":3,"giant":1},"uncommon",(60,200),"Double-bitted two-hander."),
 ("throwing_axe","throwing axe",["axe","thrown","light"],{"dwarf":2,"human":1,"orc":1},"common",(6,20),"Balanced for a spin and a thud."),
 ("bearded_axe","bearded axe",["axe","one-handed","hooking"],{"dwarf":3},"common",(25,80),"The beard hooks shields aside."),
 ("runeaxe","runeaxe",["axe","one-handed","magic","runes","heirloom"],{"dwarf":3},"rare",(500,2000),"Dwarven axe with a grudge carved into the head.","dwarf"),
 ("mattock","war mattock",["axe","two-handed","mining","tool"],{"dwarf":3},"common",(20,60),"Pick on one side, adze on the other; deep-delvers' weapon of habit."),
 ("cleaver","butcher's cleaver",["axe","one-handed","kitchen","chopping"],{"halfling":2,"orc":1,"troll":1},"common",(4,15),"Kitchen tool that keeps turning up on battlefields."),
 ("stone_axe","stone axe",["axe","one-handed","crude","stone"],{"troll":3,"giant":2,"goblin":1},"common",(2,8),"Flint head bound to a branch."),
 ("executioner_axe","headsman's axe",["axe","two-handed","grim","ceremonial"],{"human":2,"undead":1},"uncommon",(80,300),"Crescent blade, black haft, one purpose."),
 ("woodcutter_axe","felling axe",["axe","two-handed","tool","wood"],{"human":2,"halfling":1,"dwarf":1},"common",(5,20),"Long haft, heavy head, for trees."),
 ("crescent_axe","crescent axe",["axe","one-handed","elf","elegant"],{"elf":2,"fey":1},"uncommon",(50,160),"Thin crescent head; elves who must use axes use this."),
], "weapon","axe",["steel","iron","bronze","stone","mithril"],"slash")
rows([
 ("warhammer","warhammer",["hammer","one-handed","armour-breaking"],{"dwarf":3,"human":2},"common",(30,90),"Flat face, back spike."),
 ("maul","maul",["hammer","two-handed","heavy"],{"dwarf":2,"giant":2,"orc":1},"uncommon",(50,160),"Sledge for the battlefield."),
 ("mace","mace",["mace","one-handed","blunt"],{"human":2,"dwarf":1},"common",(20,60),"Flanged head on a steel haft."),
 ("morningstar","morningstar",["mace","one-handed","spiked"],{"human":2,"orc":2},"common",(30,80),"Spiked ball on a haft."),
 ("flail","flail",["mace","one-handed","chain","awkward"],{"human":2,"orc":1},"uncommon",(30,90),"Ball on a chain; hits the wielder as often as the enemy."),
 ("club","club",["club","one-handed","crude","wood"],{"troll":3,"goblin":2,"giant":1},"common",(1,4),"Heavy stick."),
 ("great_club","great club",["club","two-handed","crude","huge"],{"troll":3,"giant":3},"common",(3,15),"Uprooted sapling, bark still on."),
 ("smiths_hammer","smith's hammer",["hammer","one-handed","tool","craft"],{"dwarf":3,"gnome":2,"human":1},"common",(5,20),"Forge hammer; dents skulls if it must."),
 ("forge_hammer","forgefather's hammer",["hammer","two-handed","magic","runes","heirloom"],{"dwarf":3},"epic",(3000,9000),"Said to have been quenched in a mountain's heart.","dwarf"),
 ("cudgel","knotted cudgel",["club","one-handed","crude","wood"],{"halfling":2,"human":1,"goblin":1},"common",(1,5),"Hedge-cut and knotted; a shepherd's argument."),
 ("bone_club","bone club",["club","one-handed","crude","gore"],{"orc":2,"troll":2,"undead":2},"common",(2,8),"Thighbone of something that lost."),
 ("wrench_hammer","wrench-hammer",["hammer","one-handed","tinker","tool"],{"gnome":3},"common",(10,40),"Gnomish tool that is somehow also a weapon.","gnome"),
 ("ceremonial_mace","ceremonial mace",["mace","ceremonial","regalia","gilded"],{"human":2,"dwarf":1},"rare",(300,1200),"Gilded and jewelled; carried before the throne."),
 ("war_pick","war pick",["hammer","one-handed","armour-breaking","spike"],{"dwarf":2,"human":2},"common",(25,70),"Single curved spike for punching plate."),
 ("rolling_pin","rolling pin",["club","one-handed","kitchen","humble"],{"halfling":3},"common",(1,3),"Oak. Has ended arguments.","halfling"),
], "weapon","blunt",["steel","iron","bronze","wood","stone","bone","mithril"],"blunt")
rows([
 ("spear","spear",["polearm","two-handed","reach","common-arms"],{"human":3,"orc":2,"elf":1,"goblin":2},"common",(5,25),"Point on a pole; the oldest weapon."),
 ("javelin","javelin",["polearm","thrown","light"],{"human":2,"orc":1,"elf":1},"common",(4,15),"Light throwing spear."),
 ("pike","pike",["polearm","two-handed","very-long","formation"],{"human":3,"dwarf":1},"common",(15,40),"Fifteen feet of ash and a point."),
 ("halberd","halberd",["polearm","two-handed","axe","hook"],{"human":3,"dwarf":2},"uncommon",(40,120),"Axe, spike and hook on a pole."),
 ("glaive","glaive",["polearm","two-handed","blade"],{"human":2,"elf":2},"uncommon",(40,110),"Single-edged blade on a pole."),
 ("trident","trident",["polearm","two-handed","three-pronged","sea"],{"human":1,"fey":1},"uncommon",(30,90),"Fish-spear grown up."),
 ("boar_spear","boar spear",["polearm","two-handed","hunting","crossbar"],{"human":2,"dwarf":2,"halfling":1},"common",(15,45),"Crossbar keeps the boar from running up the shaft."),
 ("moonglaive","moonglaive",["polearm","two-handed","elegant","elf"],{"elf":3},"rare",(300,1000),"Curved elven glaive, light as a reed.","elf"),
 ("pokey_stick","pokey stick",["polearm","two-handed","crude","goblin"],{"goblin":3},"common",(1,3),"A stick with a nail in it. Possibly several nails.","goblin"),
 ("bone_spear","bone spear",["polearm","two-handed","crude","gore"],{"orc":2,"troll":1,"undead":1},"common",(3,12),"Splintered bone lashed to a shaft."),
 ("lance","lance",["polearm","mounted","knightly"],{"human":3},"uncommon",(30,100),"Couched under the arm at the charge."),
 ("giant_spear","giant's spear",["polearm","huge"],{"giant":3},"rare",(200,700),"A ship's mast with a plough-blade tip.","giant"),
 ("war_scythe","war scythe",["polearm","two-handed","blade","peasant"],{"human":2,"undead":2,"halfling":1},"common",(10,40),"Farm scythe re-hafted straight; the dead favour it."),
 ("pitchfork","pitchfork",["polearm","two-handed","tool","peasant"],{"halfling":2,"human":2},"common",(1,5),"For hay. And for mobs."),
 ("hooked_pole","hooked pole",["polearm","two-handed","hook","tool"],{"goblin":2,"human":1},"common",(2,8),"Pulls riders down and fruit off trees."),
], "weapon","polearm",["steel","iron","bronze","wood","bone","mithril"],"pierce")
rows([
 ("shortbow","shortbow",["bow","ranged","two-handed","common-arms"],{"human":2,"elf":2,"halfling":2,"goblin":2},"common",(10,35),"Handy bow for hunting and skirmish."),
 ("longbow","longbow",["bow","ranged","two-handed","powerful"],{"human":3,"elf":2},"common",(25,80),"Man-tall yew stave; takes a lifetime of practice."),
 ("recurve_bow","recurve bow",["bow","ranged","two-handed","horn"],{"human":2,"orc":2,"elf":1},"uncommon",(40,120),"Horn and sinew laminate; short and strong."),
 ("composite_bow","composite bow",["bow","ranged","two-handed","horn","mounted"],{"human":2,"orc":2},"uncommon",(50,150),"Layered bow for the saddle."),
 ("flatbow","flatbow",["bow","ranged","two-handed","simple"],{"human":2,"halfling":1},"common",(12,40),"Wide, flat limbs; forgiving to make."),
 ("livingwood_bow","livingwood bow",["bow","ranged","two-handed","elf","magic","living"],{"elf":3},"rare",(500,2000),"Elven bow cut from a tree that agreed to it; still green.","elf"),
 ("moonbow","moonbow",["bow","ranged","two-handed","elf","magic","heirloom"],{"elf":3},"epic",(2000,7000),"Silver-limbed elven bow; the string sings.","elf"),
 ("hornbow","great hornbow",["bow","ranged","two-handed","horn","orc"],{"orc":3},"uncommon",(60,180),"Orcish bow of stacked auroch horn; pulls like a mule.","orc"),
 ("light_crossbow","light crossbow",["crossbow","ranged","two-handed","mechanical"],{"human":2,"dwarf":2,"gnome":2},"common",(30,90),"Stirrup-spanned; easy to learn."),
 ("heavy_crossbow","heavy crossbow",["crossbow","ranged","two-handed","mechanical","armour-piercing"],{"human":2,"dwarf":3},"uncommon",(80,240),"Windlass-spanned; punches plate."),
 ("hand_crossbow","hand crossbow",["crossbow","ranged","one-handed","concealable"],{"goblin":2,"gnome":2,"human":1},"uncommon",(60,180),"One-handed; poisoners' favourite."),
 ("repeating_crossbow","repeating crossbow",["crossbow","ranged","two-handed","mechanical","gnome","gadget"],{"gnome":3,"dwarf":1},"rare",(300,1000),"Gnomish magazine crossbow; jams when it matters.","gnome"),
 ("sling","sling",["ranged","one-handed","humble","stone"],{"halfling":3,"goblin":2,"human":1},"common",(1,5),"Leather cup and two cords; halflings are deadly with it."),
 ("staff_sling","staff sling",["ranged","two-handed","humble","stone"],{"halfling":2,"human":1},"common",(3,10),"Sling on a staff for heavier stones."),
 ("throwing_knives","throwing knives",["ranged","thrown","set","blade"],{"human":2,"goblin":2,"elf":1},"common",(10,30),"Set of six, balanced."),
 ("blowpipe","blowpipe",["ranged","two-handed","dart","poison","quiet"],{"goblin":3,"fey":2},"common",(3,12),"Reed and darts; the darts are the point."),
 ("bolas","bolas",["ranged","thrown","entangling"],{"human":1,"halfling":1,"orc":1},"common",(3,10),"Three weights on cords."),
 ("giant_sling","giant's sling",["ranged","huge","stone"],{"giant":3},"uncommon",(20,80),"Throws boulders. Do not stand downrange.","giant"),
 ("dragonbone_bow","dragonbone bow",["bow","ranged","two-handed","dragon","magic"],{"human":1,"elf":1,"orc":1},"epic",(3000,9000),"Rib of a wyrm, strung with its sinew."),
 ("net","weighted net",["ranged","thrown","entangling","sea"],{"human":2,"goblin":1},"common",(2,8),"Fishing net with lead weights; catches men too."),
 ("whip","whip",["ranged","one-handed","reach","leather"],{"human":2,"goblin":1,"fey":1},"common",(3,15),"Braided leather; loud, and reaches."),
 ("quiver","quiver",["container","ranged","arrows"],{"elf":3,"human":2,"orc":1},"common",(2,15),"Holds twenty arrows."),
 ("arrows","bundle of arrows",["ammo","ranged","consumable"],{"elf":3,"human":2,"orc":1,"goblin":1},"common",(1,5),"Twenty, fletched with goose."),
 ("bolts","bundle of bolts",["ammo","ranged","consumable","mechanical"],{"dwarf":3,"human":2,"gnome":2},"common",(1,6),"Twenty crossbow bolts."),
 ("sling_stones","pouch of sling stones",["ammo","ranged","consumable","stone"],{"halfling":3,"goblin":1},"common",(0,1),"River-smoothed, all the same weight."),
], "weapon",lambda t: "ranged",["wood","yew","horn","steel","bone","mithril","leather"],"pierce")
rows([
 ("quarterstaff","quarterstaff",["staff","two-handed","wood","humble"],{"human":2,"halfling":2,"elf":1},"common",(1,6),"Six feet of oak."),
 ("wizard_staff","wizard's staff",["staff","two-handed","focus","magic"],{"human":2,"elf":2,"undead":1},"uncommon",(80,400),"Carved, capped, and humming faintly."),
 ("wand","wand",["wand","one-handed","focus","magic"],{"human":2,"elf":2,"fey":2,"gnome":1},"uncommon",(50,300),"A foot of chosen wood with a core of something."),
 ("rod","rod of office",["rod","one-handed","focus","regalia"],{"human":2,"undead":1},"rare",(200,900),"Metal rod, jewelled head; command made solid."),
 ("orb","crystal orb",["focus","magic","crystal"],{"gnome":2,"human":1,"undead":1},"rare",(200,1000),"Fist-sized crystal sphere that clouds when watched."),
 ("bone_staff","bone staff",["staff","two-handed","focus","necromancy","dark"],{"undead":3},"rare",(150,600),"Spine of something, topped with its skull.","undead"),
 ("living_staff","living staff",["staff","two-handed","focus","nature","living"],{"elf":3,"fey":2},"rare",(150,600),"Still buds in spring."),
 ("calibrated_rod","calibrated rod",["rod","one-handed","tinker","gadget","focus"],{"gnome":3},"uncommon",(80,300),"Brass rod with dials; nobody but the maker knows what they do.","gnome"),
 ("war_totem","war totem",["staff","two-handed","tribal","orc","focus"],{"orc":3,"troll":1},"uncommon",(40,150),"Pole hung with skulls and feathers; the clan follows it.","orc"),
 ("shepherds_crook","shepherd's crook",["staff","two-handed","humble","tool"],{"halfling":2,"human":2},"common",(1,5),"Hook for sheep, also for ankles."),
 ("witch_broom","witch's broom",["staff","two-handed","fey","magic","household"],{"fey":2,"human":1},"rare",(50,400),"Birch twigs, ash handle, opinions."),
], "weapon","staff",["wood","bone","crystal","brass","silver"],"blunt")
# ---------- ARMOUR & CLOTHING
def armsub(t): return "shield" if "shield" in t else ("clothing" if "clothing" in t else ("head" if "head" in t else ("hands" if "hands" in t else ("legs" if "legs" in t else ("feet" if "feet" in t else "body")))))
rows([
 ("gambeson","gambeson",["armour","body","cloth","light"],{"human":3,"halfling":1},"common",(10,30),"Quilted linen; more protection than it looks."),
 ("leather_armour","leather armour",["armour","body","leather","light"],{"human":2,"elf":2,"halfling":2,"goblin":1},"common",(15,50),"Hardened hide over a shirt."),
 ("studded_leather","studded leather",["armour","body","leather","light"],{"human":2,"orc":1},"common",(25,70),"Leather with iron studs."),
 ("brigandine","brigandine",["armour","body","plates","medium"],{"human":3,"dwarf":1},"uncommon",(60,180),"Small plates riveted inside a cloth coat."),
 ("chainmail","chainmail hauberk",["armour","body","mail","medium"],{"human":3,"dwarf":3,"orc":1},"uncommon",(80,250),"Thousands of riveted rings."),
 ("scale_mail","scale mail",["armour","body","scales","medium"],{"human":2,"orc":2,"dragon":1},"uncommon",(70,200),"Overlapping metal scales on leather."),
 ("plate_armour","plate armour",["armour","body","plate","heavy"],{"human":3,"dwarf":2},"rare",(400,1500),"Full harness, fitted to the wearer."),
 ("half_plate","half plate",["armour","body","plate","heavy"],{"human":2,"dwarf":2},"uncommon",(200,600),"Breastplate, pauldrons and greaves over mail."),
 ("dwarven_plate","dwarven forge-plate",["armour","body","plate","heavy","dwarf","runes"],{"dwarf":3},"rare",(800,3000),"Dwarven plate, rune-stamped, heavier than it should be and lighter than it looks.","dwarf"),
 ("elven_mail","elven leafmail",["armour","body","mail","light","elf","elegant"],{"elf":3},"rare",(500,2000),"Rings fine as scale, quiet as cloth.","elf"),
 ("hide_armour","hide armour",["armour","body","hide","crude"],{"orc":3,"troll":2,"giant":1},"common",(10,40),"Thick beast hide, fur out."),
 ("bone_armour","bone armour",["armour","body","bone","crude","gore"],{"orc":2,"undead":2,"goblin":1},"uncommon",(20,80),"Ribs and plates of bone lashed together."),
 ("scrap_armour","scrap armour",["armour","body","crude","goblin","junk"],{"goblin":3},"common",(3,15),"Pot lids, buckles, a horseshoe. Rattles.","goblin"),
 ("robes","robes",["armour","body","cloth","mage"],{"human":2,"elf":2,"undead":2},"common",(5,40),"Layered cloth; protection is not the point."),
 ("padded_vest","padded waistcoat",["armour","body","cloth","light","halfling"],{"halfling":3},"common",(8,25),"Quilted, with pockets. Many pockets.","halfling"),
 ("clockwork_harness","clockwork harness",["armour","body","gnome","gadget","medium"],{"gnome":3},"rare",(400,1500),"Brass plates that adjust themselves, mostly.","gnome"),
 ("shroud","burial shroud",["armour","body","cloth","undead","dark"],{"undead":3},"common",(1,10),"Grave linen worn as a robe.","undead"),
 ("dragonscale_armour","dragonscale armour",["armour","body","scales","dragon","magic","heavy"],{"human":1,"dwarf":1},"epic",(4000,12000),"Scales of a slain wyrm; warm to the touch."),
 ("bark_armour","bark armour",["armour","body","wood","fey","nature","light"],{"fey":3,"elf":1,"troll":1},"uncommon",(20,80),"Plates of living bark; itches in spring.","fey"),
 ("giant_hide","giant's hide coat",["armour","body","hide","giant","heavy"],{"giant":3},"uncommon",(40,150),"Mammoth hide; a tent for anyone smaller.","giant"),
 ("helm","open helm",["armour","head","metal"],{"human":3,"dwarf":2,"orc":1},"common",(15,50),"Steel cap with cheek guards."),
 ("great_helm","great helm",["armour","head","metal","heavy"],{"human":3},"uncommon",(40,120),"Bucket helm with eye slits."),
 ("horned_helm","horned helm",["armour","head","metal","horns"],{"orc":2,"giant":1,"dwarf":1},"uncommon",(30,100),"Impractical and beloved."),
 ("leather_cap","leather cap",["armour","head","leather","light"],{"goblin":2,"halfling":2,"human":1},"common",(3,10),"Boiled leather skullcap."),
 ("coif","mail coif",["armour","head","mail"],{"human":2,"dwarf":2},"common",(20,60),"Hood of rings."),
 ("war_circlet","war circlet",["armour","head","elf","elegant","metal"],{"elf":3},"uncommon",(60,200),"Silvered band with a nasal; elves refuse full helms.","elf"),
 ("skull_helm","skull helm",["armour","head","bone","dark"],{"orc":2,"undead":2},"uncommon",(15,60),"A skull, hollowed and worn."),
 ("goggled_helm","goggled helm",["armour","head","gnome","gadget"],{"gnome":3},"uncommon",(40,150),"Leather cap with six lenses on arms.","gnome"),
 ("straw_hat","straw hat",["clothing","head","humble","halfling"],{"halfling":3,"human":2},"common",(0,2),"Wide brim for the fields."),
 ("hood","hood",["clothing","head","stealth"],{"elf":2,"human":2,"goblin":2,"undead":1},"common",(1,5),"Deep cowl; hides a face or a wound."),
 ("wizard_hat","pointed hat",["clothing","head","mage"],{"human":2,"gnome":1},"common",(3,20),"Tall, floppy, undeniably magical."),
 ("shield_round","round shield",["shield","wood","light"],{"human":2,"dwarf":2,"orc":2},"common",(8,30),"Linden boards, iron boss."),
 ("shield_kite","kite shield",["shield","wood","mounted"],{"human":3},"common",(15,50),"Tapered for the saddle."),
 ("shield_tower","tower shield",["shield","heavy","wall"],{"human":2,"dwarf":2,"giant":1},"uncommon",(40,120),"Door-sized; a wall you carry."),
 ("buckler","buckler",["shield","small","metal","duelling"],{"human":2,"halfling":2,"gnome":1},"common",(8,25),"Hand-sized steel disc."),
 ("oathshield","dwarven oathshield",["shield","heavy","dwarf","runes","metal"],{"dwarf":3},"rare",(200,800),"Steel-faced, rune-bordered; a clan's oaths are on it.","dwarf"),
 ("hide_shield","hide shield",["shield","hide","crude"],{"orc":2,"troll":2,"goblin":2},"common",(3,12),"Stretched hide on a frame."),
 ("pot_lid","pot lid",["shield","small","crude","junk","goblin"],{"goblin":3,"halfling":1},"common",(1,2),"A pot lid. A big one.","goblin"),
 ("leaf_shield","leaf shield",["shield","light","elf","elegant","wood"],{"elf":3},"uncommon",(40,150),"Leaf-shaped, lacquered; more art than wall.","elf"),
 ("gauntlets","gauntlets",["armour","hands","metal"],{"human":2,"dwarf":2},"common",(15,60),"Articulated steel hands."),
 ("bracers","bracers",["armour","hands","leather"],{"elf":2,"human":2,"orc":1},"common",(3,20),"Leather forearm guards; archers' friend."),
 ("greaves","greaves",["armour","legs","metal"],{"human":2,"dwarf":2},"common",(15,50),"Shin plates."),
 ("hobnailed_boots","hobnailed boots",["armour","feet","leather","heavy"],{"human":2,"dwarf":3,"orc":1},"common",(5,20),"Nails in the soles for grip and kicking."),
 ("soft_boots","soft boots",["armour","feet","leather","light","quiet"],{"elf":3,"halfling":1,"goblin":1},"common",(5,25),"Silent on leaves."),
 ("cloak","travelling cloak",["clothing","cloak","weather"],{"human":2,"elf":2,"halfling":2},"common",(3,20),"Wool, oiled against rain."),
 ("elven_cloak","grey-green cloak",["clothing","cloak","elf","stealth","magic"],{"elf":3},"rare",(200,800),"Elven weave that takes the colour of the woods.","elf"),
 ("fur_cloak","fur cloak",["clothing","cloak","hide","cold"],{"orc":2,"human":2,"giant":2},"common",(5,40),"Wolf or bear; smells of both."),
 ("tabard","tabard",["clothing","body","faction","heraldry"],{"human":3},"common",(2,15),"Sleeveless coat with a crest."),
 ("apron_leather","leather apron",["clothing","body","craft","smith"],{"dwarf":3,"gnome":2,"human":1},"common",(2,10),"Scorched in a hundred places."),
 ("belt","belt",["clothing","waist","leather"],{"human":2,"dwarf":2,"halfling":2},"common",(1,8),"Holds up trousers and hopes."),
 ("gloves_fine","fine gloves",["clothing","hands","cloth","noble"],{"human":2,"elf":2},"common",(3,25),"Kid leather, embroidered."),
 ("sash","sash",["clothing","waist","cloth","office"],{"human":2,"orc":1},"common",(1,10),"Coloured band of rank."),
], "armour",armsub,["steel","iron","leather","hide","bone","cloth","wood","mithril","dragonscale"])
# ---------- VESSELS
rows([
 ("goblet","goblet",["vessel","drinking","stemmed","feast"],{"dwarf":3,"human":2,"dragon":1},"common",(5,40),"Stemmed cup; the dwarven ones are the heaviest."),
 ("chalice","chalice",["vessel","drinking","ceremonial","religious"],{"human":2,"elf":1,"undead":1},"uncommon",(40,300),"Sacred cup for rites."),
 ("tankard","tankard",["vessel","drinking","ale","lidded"],{"dwarf":3,"halfling":2,"human":2},"common",(2,15),"Lidded ale mug; dwarves engrave their grudges on the lid."),
 ("mug","clay mug",["vessel","drinking","humble"],{"halfling":3,"human":2,"goblin":1},"common",(1,3),"Fired clay with a thumb-worn handle."),
 ("drinking_horn","drinking horn",["vessel","drinking","horn","feast"],{"orc":3,"giant":2,"dwarf":2},"common",(3,20),"Auroch horn, rimmed in metal."),
 ("flask","flask",["vessel","drinking","travel","spirits"],{"human":2,"dwarf":2,"halfling":1},"common",(2,12),"Pocket flask, dented."),
 ("waterskin","waterskin",["vessel","travel","humble"],{"human":2,"orc":2,"elf":1},"common",(1,3),"Goat bladder; tastes of goat."),
 ("ewer","ewer",["vessel","pouring","table","fine"],{"human":2,"elf":2},"common",(8,60),"Tall pouring jug."),
 ("cauldron","cauldron",["vessel","cooking","iron","large"],{"halfling":2,"human":2,"fey":2,"troll":1},"common",(10,40),"Three-legged iron pot."),
 ("kettle","kettle",["vessel","cooking","tea","humble"],{"halfling":3,"gnome":1},"common",(3,12),"Copper kettle, sings when ready."),
 ("teapot","teapot",["vessel","tea","humble","halfling"],{"halfling":3},"common",(3,15),"Chipped, loved, refilled hourly.","halfling"),
 ("amphora","amphora",["vessel","storage","wine","clay","ancient"],{"human":2,"elf":1},"common",(5,30),"Two-handled clay jar."),
 ("cask","ale cask",["vessel","storage","ale","wood","large"],{"dwarf":3,"halfling":2},"common",(5,25),"Oak barrel, banded."),
 ("skull_cup","skull cup",["vessel","drinking","gore","trophy","dark"],{"orc":3,"undead":2,"troll":1},"uncommon",(5,60),"Enemy's skull, sawn and silvered."),
 ("crystal_decanter","crystal decanter",["vessel","pouring","fine","crystal"],{"gnome":2,"elf":2,"human":1},"uncommon",(30,200),"Cut crystal; catches every candle."),
 ("mithril_goblet","mithril goblet",["vessel","drinking","mithril","fine","dwarf"],{"dwarf":3,"elf":1},"rare",(300,1200),"Never tarnishes; poison beads on it, they say.","dwarf"),
 ("censer","censer",["vessel","religious","incense","chain"],{"human":2,"undead":2,"elf":1},"uncommon",(20,120),"Pierced brass ball on chains, smoking."),
 ("reliquary","reliquary",["vessel","religious","relic","gilded"],{"human":2,"undead":1},"rare",(200,1500),"Gilded box holding a saint's knuckle."),
 ("gourd","gourd bottle",["vessel","drinking","humble","nature"],{"goblin":2,"halfling":1,"fey":2},"common",(1,2),"Dried gourd, stoppered with a cork."),
 ("pocket_still","pocket still",["vessel","gadget","gnome","spirits"],{"dwarf":1,"gnome":3},"rare",(100,400),"Gnomish device that turns anything into something drinkable. Anything.","gnome"),
 ("bowl_wood","wooden bowl",["vessel","eating","humble","wood"],{"halfling":3,"human":2,"troll":1},"common",(0,2),"Turned ash; a dent for every year."),
 ("platter","serving platter",["vessel","eating","table","feast"],{"human":2,"halfling":2,"dwarf":1},"common",(3,30),"Pewter or wood, big enough for a goose."),
 ("wine_bottle","wine bottle",["vessel","drinking","wine","glass"],{"human":2,"elf":2},"common",(1,4),"Green glass, wax-sealed."),
 ("bucket","bucket",["vessel","household","humble","wood"],{"human":2,"halfling":2,"goblin":1},"common",(0,2),"Oak staves, rope handle."),
 ("urn","funeral urn",["vessel","religious","ashes","dark","clay"],{"undead":2,"human":2,"elf":1},"uncommon",(10,100),"Holds someone."),
 ("ale_horn_giant","giant's drinking horn",["vessel","drinking","horn","giant","huge"],{"giant":3},"uncommon",(30,150),"A whole cask fits in it.","giant"),
 ("dew_cup","dew cup",["vessel","drinking","fey","nature","tiny"],{"fey":3},"uncommon",(5,80),"An acorn cap, silvered; holds one dewdrop.","fey"),
], "vessel",lambda t: t[1],["clay","wood","pewter","silver","gold","copper","brass","horn","bone","crystal","mithril","iron","glass"])
# ---------- REGALIA & JEWELRY & PERSONAL
rows([
 ("crown","crown",["regalia","head","gold","royal"],{"human":3,"dwarf":2,"dragon":2,"undead":1},"rare",(500,5000),"Gold circlet with points; heavier every year."),
 ("circlet","circlet",["regalia","head","silver","elegant"],{"elf":3,"human":1,"fey":2},"uncommon",(60,400),"Slim band of silver or living wood."),
 ("diadem","diadem",["regalia","head","jewelled","royal"],{"human":2,"elf":1,"dragon":1},"rare",(400,3000),"Jewelled band for a queen."),
 ("iron_crown","iron crown",["regalia","head","iron","grim","orc"],{"orc":3,"undead":2},"uncommon",(30,200),"Black iron, spiked; a warlord's."),
 ("bone_crown","crown of bone",["regalia","head","bone","dark","undead"],{"undead":3},"rare",(100,800),"Finger bones set in a ring of jaw.","undead"),
 ("scepter","scepter",["regalia","hand","gold","royal"],{"human":3,"dragon":1},"rare",(300,2500),"Gold rod topped with an orb."),
 ("signet","signet ring",["jewelry","ring","seal","office"],{"human":3,"dwarf":2,"elf":1},"uncommon",(30,300),"Carved seal ring; the family's word."),
 ("ring_plain","ring",["jewelry","ring"],{"human":2,"elf":2,"dwarf":2,"halfling":2},"common",(2,40),"Plain band."),
 ("ring_gem","gem ring",["jewelry","ring","jewelled"],{"human":2,"dragon":2,"dwarf":2},"uncommon",(40,600),"Stone in a claw setting."),
 ("amulet","amulet",["jewelry","neck","charm","magic"],{"human":2,"elf":2,"fey":2,"undead":1},"uncommon",(20,400),"Pendant with a purpose."),
 ("torc","torc",["jewelry","neck","metal","tribal"],{"human":2,"dwarf":2,"giant":2,"orc":1},"uncommon",(30,300),"Twisted metal neck-ring, open at the front."),
 ("brooch","brooch",["jewelry","cloak","pin"],{"human":2,"elf":2,"halfling":2},"common",(5,80),"Cloak pin, often the family crest."),
 ("earring","earring",["jewelry","ear"],{"human":1,"orc":2,"goblin":2,"fey":2},"common",(1,30),"Hoop or stud; goblins prefer bone."),
 ("bracelet","bracelet",["jewelry","wrist"],{"human":2,"elf":1,"orc":1},"common",(3,60),"Metal or beads."),
 ("tooth_necklace","necklace of teeth",["jewelry","neck","trophy","gore"],{"orc":3,"goblin":3,"troll":2},"common",(1,15),"Teeth on a cord; each one a story."),
 ("gear_brooch","gear brooch",["jewelry","cloak","gnome","tinker"],{"gnome":3},"common",(5,50),"Tiny moving gears; hypnotic at dinner.","gnome"),
 ("long_pipe","long pipe",["personal","pipe","halfling","comfort"],{"halfling":3,"dwarf":2,"human":1},"common",(2,40),"Churchwarden pipe, well cured."),
 ("beard_beads","beard beads",["personal","hair","dwarf","metal"],{"dwarf":3},"common",(3,60),"Rings and beads braided into the beard; rank in metal.","dwarf"),
 ("court_mask","court mask",["personal","mask","fey","ceremonial"],{"fey":3,"human":1},"uncommon",(20,300),"Feathered half-mask; the Courts never show a whole face."),
 ("death_mask","death mask",["personal","mask","undead","dark"],{"undead":3},"rare",(50,500),"Plaster cast of a face at the end.","undead"),
 ("medallion","medallion",["jewelry","neck","office","order"],{"human":2,"dwarf":1},"uncommon",(20,200),"Disc of office on a chain."),
 ("hoard_coin","hoard coin",["jewelry","coin","dragon","gold","ancient"],{"dragon":3},"uncommon",(10,100),"Coin from a dragon's bed, warm and slightly melted.","dragon"),
 ("purse","coin purse",["personal","container","coin","leather"],{"human":2,"halfling":2,"goblin":2},"common",(1,5),"Drawstring pouch; lighter than it should be."),
 ("locket","locket",["jewelry","neck","memory","keepsake"],{"human":3,"elf":1},"uncommon",(10,150),"Opens on a face or a lock of hair."),
 ("war_paint","pot of war paint",["personal","paint","orc","ritual"],{"orc":3,"goblin":1},"common",(1,5),"Red ochre and fat.","orc"),
 ("hairpin","silver hairpin",["jewelry","hair","elf","concealable"],{"elf":3,"human":1,"fey":1},"common",(3,40),"Also a fine stiletto."),
 ("nose_ring","nose ring",["jewelry","nose","orc","metal"],{"orc":3,"troll":1},"common",(1,10),"Iron or gold; rank by weight."),
 ("bell_collar","bell collar",["jewelry","neck","fey","bell"],{"fey":3},"uncommon",(5,60),"Tiny bells; the fey put them on cats and prisoners.","fey"),
], "regalia",lambda t: t[0],["gold","silver","iron","bronze","bone","wood","copper","mithril","crystal","leather"])
# ---------- LORE & WRITING
rows([
 ("tablet","clay tablet",["lore","writing","clay","ancient"],{"human":2,"giant":1,"undead":1},"common",(1,20),"Baked clay pressed with script."),
 ("stone_tablet","stone tablet",["lore","writing","stone","law","ancient"],{"dwarf":3,"giant":2,"human":1},"uncommon",(20,200),"Law or lineage cut in stone."),
 ("runestone","runestone",["lore","writing","stone","runes","magic"],{"dwarf":3,"giant":2,"human":1},"uncommon",(30,400),"Standing stone or hand-sized, runes cut deep."),
 ("scroll","scroll",["lore","writing","paper","spell"],{"human":2,"elf":2,"undead":2},"common",(2,100),"Rolled vellum, sealed."),
 ("tome","tome",["lore","book","heavy","spell"],{"human":2,"elf":2,"undead":2,"gnome":1},"uncommon",(30,600),"Leather-bound and chained shut for good reason."),
 ("ledger","ledger",["lore","book","trade","record"],{"human":2,"dwarf":2,"goblin":1},"common",(5,50),"Columns of debts and names."),
 ("map","map",["lore","paper","travel","navigation"],{"human":3,"halfling":1,"gnome":1},"common",(5,80),"Inked and annotated; some of it true."),
 ("wax_seal","wax seal",["lore","office","seal"],{"human":2},"common",(1,10),"Stamped wax; a promise or a threat."),
 ("sealed_letter","sealed letter",["lore","paper","secret"],{"human":2,"elf":1,"goblin":1},"common",(1,30),"Unopened. Maybe keep it that way."),
 ("songbook","songbook",["lore","book","music","elf"],{"elf":3,"halfling":2},"common",(5,60),"Elven verse, or halfling drinking songs; both dangerous."),
 ("grudge_book","book of grudges",["lore","book","dwarf","record","grim"],{"dwarf":3},"rare",(100,1000),"Every slight against the clan, in order, with interest.","dwarf"),
 ("recipe_book","recipe book",["lore","book","food","halfling"],{"halfling":3},"common",(3,40),"Family recipes, stains included.","halfling"),
 ("schematic","schematic",["lore","paper","gnome","tinker"],{"gnome":3,"dwarf":1},"uncommon",(10,200),"Blueprint for something that will probably explode.","gnome"),
 ("bark_scroll","bark scroll",["lore","writing","bark","elf","nature"],{"elf":3,"fey":2},"common",(2,30),"Birch bark, written in sap."),
 ("bone_tally","bone tally",["lore","writing","bone","count"],{"orc":2,"goblin":2,"troll":1},"common",(1,5),"Notched bone: kills, debts, days."),
 ("speaking_skull","speaking skull",["lore","bone","undead","magic","dark"],{"undead":3},"rare",(100,800),"A skull that remembers what it heard.","undead"),
 ("star_chart","star chart",["lore","paper","elf","navigation","sky"],{"elf":3,"gnome":1,"human":1},"uncommon",(20,200),"Elven chart of the wheeling stars."),
 ("prophecy","prophecy scroll",["lore","paper","religious","fate"],{"human":2,"fey":2,"undead":1},"rare",(50,900),"Vague enough to always come true."),
 ("hoard_ledger","hoard-ledger",["lore","book","dragon","record"],{"dragon":3},"rare",(100,2000),"A dragon's inventory of its hoard, every coin.","dragon"),
 ("wanted_poster","wanted poster",["lore","paper","crime"],{"human":2,"goblin":1},"common",(0,1),"Bad likeness, good reward."),
 ("deed","land deed",["lore","paper","law","property"],{"human":3,"halfling":2},"uncommon",(20,500),"Title to a field, a mill, or a lie."),
 ("journal","journal",["lore","book","personal","memory"],{"human":2,"elf":1,"gnome":1},"common",(2,30),"Someone's days, in their hand."),
 ("treaty","treaty",["lore","paper","law","faction"],{"human":2,"elf":2,"dwarf":2},"rare",(50,800),"Signed by two kings; kept by neither."),
 ("cipher_wheel","cipher wheel",["lore","gnome","secret","gadget"],{"gnome":3,"human":1},"uncommon",(20,150),"Two brass discs; turn to read the message.","gnome"),
 ("saga_stone","saga stone",["lore","stone","giant","memory","huge"],{"giant":3},"rare",(50,600),"A boulder carved with a giant's whole life.","giant"),
 ("moss_letter","moss letter",["lore","nature","fey","secret"],{"fey":3},"uncommon",(1,40),"Words grown in moss on a stone; gone by summer.","fey"),
 ("clan_roll","clan roll",["lore","paper","orc","record","war"],{"orc":3},"uncommon",(5,60),"Hide scroll of the clan's warriors and their kills.","orc"),
], "lore",lambda t: t[1],["clay","stone","vellum","paper","bone","bark","wood","leather"])
# ---------- TOOLS, INSTRUMENTS, HOUSEHOLD, RELIGIOUS, CONTAINERS
def toolcat(t):
    for c in ("instrument","religious","household","container"):
        if c in t: return c
    return "tool"
rows([
 ("lantern","lantern",["tool","light","travel"],{"human":2,"gnome":2,"dwarf":2,"halfling":1},"common",(3,20),"Shuttered oil lantern."),
 ("torch","torch",["tool","light","cheap"],{"human":2,"orc":2,"goblin":2},"common",(0,1),"Pitch-soaked rag on a stick."),
 ("rope","rope",["tool","travel","hemp"],{"human":2,"halfling":1,"dwarf":1},"common",(1,5),"Fifty feet of hemp."),
 ("grappling_hook","grappling hook",["tool","climbing","thief"],{"goblin":2,"human":2,"halfling":1},"common",(3,12),"Three-pronged iron hook."),
 ("lockpicks","lockpicks",["tool","thief","set"],{"goblin":3,"halfling":2,"gnome":2},"uncommon",(10,60),"Roll of picks and tension bars."),
 ("pickaxe","pickaxe",["tool","mining","dwarf"],{"dwarf":3,"gnome":1,"human":1},"common",(3,15),"Iron pick on an ash haft."),
 ("shovel","shovel",["tool","digging","humble"],{"human":2,"halfling":2,"undead":1},"common",(1,5),"Digs graves as well as gardens."),
 ("travel_anvil","travelling anvil",["tool","craft","smith","heavy"],{"dwarf":3},"uncommon",(30,120),"Small anvil for field repairs; still heavy."),
 ("tongs","tongs",["tool","craft","smith"],{"dwarf":3,"gnome":1},"common",(2,8),"Long-handled forge tongs."),
 ("whetstone","whetstone",["tool","blade","maintenance"],{"human":2,"dwarf":2,"orc":2,"elf":1},"common",(1,3),"Keeps the edge honest."),
 ("spyglass","spyglass",["tool","gnome","optics","navigation"],{"gnome":3,"human":2},"rare",(80,400),"Brass tube with ground lenses."),
 ("compass","compass",["tool","navigation","gnome"],{"gnome":2,"human":2},"uncommon",(30,150),"Needle in a brass case."),
 ("pocket_clock","pocket clock",["tool","gnome","clock","gadget"],{"gnome":3,"human":1},"rare",(100,600),"Gnomish timepiece; loses an hour a day, gains it back at night.","gnome"),
 ("fishing_rod","fishing rod",["tool","fishing","humble"],{"halfling":3,"human":2},"common",(1,10),"Willow rod and horsehair line."),
 ("cooking_pot","cooking pot",["tool","cooking","household"],{"halfling":3,"human":2,"orc":1},"common",(2,10),"Blackened iron pot."),
 ("mortar_pestle","mortar and pestle",["tool","alchemy","cooking"],{"halfling":2,"human":2,"fey":2,"gnome":1},"common",(2,12),"Stone bowl for grinding herbs or bones."),
 ("loom_shuttle","weaver's shuttle",["tool","craft","cloth"],{"human":2,"elf":2,"fey":2},"common",(1,6),"Polished wood shuttle for the loom."),
 ("needle_case","needle case",["tool","craft","sewing","small"],{"halfling":2,"human":2},"common",(1,4),"Bone tube of needles."),
 ("spinning_wheel","spinning wheel",["tool","craft","cloth","household","large"],{"human":2,"halfling":2,"fey":2},"common",(10,40),"Turns wool to thread; fey tales attach to it."),
 ("bellows","bellows",["tool","craft","smith","fire"],{"dwarf":3,"gnome":1},"common",(3,15),"Leather bellows for the forge."),
 ("scythe","scythe",["tool","farm","blade","peasant"],{"halfling":2,"human":2,"undead":1},"common",(3,12),"Curved blade for hay; or for whoever comes."),
 ("hoe","hoe",["tool","farm","humble"],{"halfling":3,"human":2},"common",(1,4),"Turns soil and, at need, ankles."),
 ("saw","saw",["tool","craft","wood"],{"human":2,"halfling":2,"gnome":1},"common",(2,10),"Toothed blade; screams through oak."),
 ("chisel_set","chisel set",["tool","craft","stone","set"],{"dwarf":3,"gnome":2},"common",(5,30),"For runes and joints."),
 ("crowbar","crowbar",["tool","thief","iron"],{"goblin":2,"human":2,"dwarf":1},"common",(2,8),"Opens doors that disagree."),
 ("manacles","manacles",["tool","iron","law","chain"],{"human":2,"undead":1,"orc":1},"common",(5,25),"Iron cuffs on a chain; a key somewhere."),
 ("healers_kit","healer's kit",["tool","healing","set","travel"],{"human":2,"elf":2,"halfling":1},"uncommon",(15,80),"Bandages, needle, salves, and a small saw nobody wants used."),
 ("dice","bone dice",["tool","game","bone","gambling"],{"human":2,"goblin":2,"dwarf":2},"common",(0,3),"Two dice; one of them honest."),
 ("cards","deck of cards",["tool","game","paper","gambling"],{"human":3,"halfling":1,"gnome":1},"common",(1,5),"Fifty-two cards, or thereabouts."),
 ("gnome_multitool","folding multitool",["tool","gnome","gadget","set"],{"gnome":3},"uncommon",(30,150),"Knife, saw, spoon, tiny anvil. Springs open unasked.","gnome"),
 ("trap_bear","bear trap",["tool","hunting","iron","cruel"],{"human":2,"orc":2,"goblin":2},"uncommon",(10,40),"Jaws of iron; hungry for anything."),
 ("lute","lute",["instrument","music","string"],{"human":3,"elf":2,"halfling":2},"uncommon",(20,150),"Pear-bodied, six courses."),
 ("harp","harp",["instrument","music","string","elf"],{"elf":3,"human":1,"fey":2},"rare",(80,600),"Elven harp; tuned to the wind."),
 ("war_drum","war drum",["instrument","music","drum","war"],{"orc":3,"giant":2,"troll":1},"common",(5,40),"Hide over a hollowed log; hearts follow it."),
 ("war_horn","war horn",["instrument","horn","war","signal"],{"orc":2,"dwarf":2,"human":2,"giant":2},"uncommon",(20,120),"Auroch horn, bound in bronze."),
 ("flute","flute",["instrument","music","wind"],{"elf":2,"halfling":2,"fey":2},"common",(3,30),"Bone or reed; halflings play it at supper."),
 ("fiddle","fiddle",["instrument","music","string","halfling"],{"halfling":3,"human":2},"uncommon",(15,100),"Four strings and a bow; feet cannot resist it."),
 ("bagpipes","bagpipes",["instrument","music","wind","loud"],{"dwarf":2,"human":2},"uncommon",(20,120),"Goatskin bag and drones; a weapon in the wrong hands."),
 ("music_box","music box",["instrument","gnome","gadget","clock"],{"gnome":3},"rare",(60,400),"Wind it and it plays a tune nobody remembers writing.","gnome"),
 ("hand_bell","hand bell",["instrument","bell","religious","signal"],{"human":2,"undead":1,"fey":1},"common",(3,25),"Bronze bell; rings the hours or the dead."),
 ("bone_flute","bone flute",["instrument","music","wind","bone","dark"],{"undead":2,"goblin":2,"orc":1},"common",(1,10),"Carved from a shin; the tune is thin."),
 ("stone_drum","stone drum",["instrument","drum","giant","huge"],{"giant":3},"uncommon",(20,100),"Hollow boulder; heard three valleys away.","giant"),
 ("reed_pipes","reed pipes",["instrument","music","wind","fey","nature"],{"fey":3,"halfling":1},"common",(1,10),"Seven reeds bound with grass; dangerous to dance to."),
 ("candle","candle",["household","light","wax"],{"human":2,"halfling":2,"undead":1},"common",(0,1),"Tallow or beeswax."),
 ("blanket","wool blanket",["household","bedding","travel"],{"human":2,"halfling":2,"dwarf":1},"common",(1,6),"Scratchy, warm, smells of sheep."),
 ("hand_mirror","hand mirror",["household","mirror","fey","vanity"],{"fey":3,"elf":2,"human":2},"uncommon",(10,100),"Silvered glass; the fey use them as doors."),
 ("hourglass","hourglass",["household","time","glass"],{"human":2,"gnome":2,"undead":1},"uncommon",(10,80),"Sand for an hour."),
 ("iron_key","iron key",["household","key","lock"],{"human":2,"dwarf":2,"gnome":2},"common",(1,10),"Opens something. Somewhere."),
 ("chest","iron-bound chest",["container","storage","lock","large"],{"human":2,"dwarf":2,"dragon":1},"common",(10,60),"Oak chest with iron bands and a lock."),
 ("coffer","coffer",["container","storage","lock","small","coin"],{"human":2,"goblin":1,"dragon":2},"uncommon",(15,100),"Small strongbox for coin."),
 ("tapestry","tapestry",["household","art","cloth","wall"],{"human":3,"elf":2},"uncommon",(30,500),"Woven scene of a battle nobody won."),
 ("idol","idol",["religious","statue","stone","dark"],{"orc":2,"troll":2,"goblin":2,"undead":1},"uncommon",(5,200),"Squat carved god with too many teeth."),
 ("travel_shrine","travelling shrine",["religious","box","holy"],{"human":2,"dwarf":1,"elf":1},"uncommon",(20,200),"Folding altar with a painted saint."),
 ("prayer_beads","prayer beads",["religious","beads","holy"],{"human":3,"elf":1},"common",(1,20),"Wooden beads worn smooth."),
 ("holy_symbol","holy symbol",["religious","holy","pendant"],{"human":3,"dwarf":2},"common",(2,60),"Emblem of a god on a cord."),
 ("weeping_idol","weeping idol",["religious","statue","cursed","dark","fey"],{"fey":2,"undead":2},"rare",(50,600),"Stone figure that is damp every morning."),
 ("backpack","backpack",["container","travel","leather"],{"human":2,"halfling":2,"dwarf":2},"common",(2,10),"Leather pack with straps; everything smells of it."),
 ("satchel","satchel",["container","travel","leather","small"],{"human":2,"elf":2,"gnome":2},"common",(1,6),"Shoulder bag for maps and bread."),
 ("scabbard","scabbard",["container","blade","leather"],{"human":2,"elf":2,"dwarf":1},"common",(2,20),"Wood and leather sheath."),
 ("sack","sack",["container","humble","cloth"],{"goblin":3,"halfling":2,"human":2},"common",(0,1),"Holds loot, turnips, or a small halfling."),
 ("barrel","barrel",["container","storage","wood","large"],{"dwarf":2,"halfling":2,"human":2},"common",(2,10),"Oak, banded; a hiding place in a pinch."),
 ("cage","iron cage",["container","iron","cruel","large"],{"goblin":2,"orc":2,"human":1},"uncommon",(10,60),"For birds, prisoners, or halflings."),
 ("bird_cage","bird cage",["container","household","bird"],{"human":2,"elf":1,"gnome":1},"common",(2,15),"Wicker; the bird is extra."),
 ("rug","woven rug",["household","cloth","floor"],{"human":2,"halfling":2,"dwarf":1},"common",(3,60),"Warm underfoot; hides the stain."),
 ("bed_roll","bedroll",["household","bedding","travel"],{"human":2,"orc":2,"elf":2,"halfling":1},"common",(1,5),"Canvas and wool, rolled tight."),
 ("chamber_pot","chamber pot",["household","humble","clay"],{"halfling":2,"human":2},"common",(0,2),"Necessary."),
 ("broom","broom",["household","humble","wood"],{"halfling":3,"human":2},"common",(0,1),"Birch twigs; sweeps, occasionally flies."),
 ("cradle","cradle",["household","wood","child"],{"human":2,"halfling":2,"elf":1},"common",(3,20),"Rocks with a foot."),
 ("hearthstone","hearthstone",["household","stone","dwarf","home"],{"dwarf":3,"halfling":1},"uncommon",(5,50),"Carved flat stone from the family hearth; carried when the family moves.","dwarf"),
 ("knight_spurs","knight's spurs",["clothing","feet","human","knightly","office"],{"human":3},"uncommon",(20,120),"Gilt spurs; the whole point of the ceremony.","human"),
 ("guild_charter","guild charter",["lore","paper","law","human","faction","office"],{"human":3},"rare",(50,600),"Sealed permission to do what everyone was doing anyway.","human"),
 ("moss_poultice","moss poultice",["alchemy","healing","troll","nature","consumable"],{"troll":3,"goblin":1},"common",(1,6),"Troll remedy: bog moss and spit. Works on trolls.","troll"),
 ("toll_sign","bridge toll sign",["household","wood","troll","crude","sign"],{"troll":3},"common",(0,2),"Board reading TOLL in an unsteady hand; the troll is the sign.","troll"),
], "tool",lambda t: t[1],["iron","wood","brass","bone","leather","clay","glass","stone","silver","cloth"])
for d in items:
    if d["category"]=="tool": d["category"]=toolcat(d["tags"])
# ---------- ALCHEMY, MATERIALS, TROPHIES, FOOD
def misccat(t):
    for c in ("material","trophy","food"):
        if c in t: return c
    return "alchemy"
rows([
 ("vial","glass vial",["alchemy","glass","container"],{"human":2,"gnome":2,"fey":1},"common",(1,3),"Stoppered glass."),
 ("potion_healing","healing draught",["alchemy","potion","healing","consumable"],{"human":2,"elf":2,"halfling":1},"uncommon",(30,120),"Red, bitter, works."),
 ("potion_unknown","unlabelled potion",["alchemy","potion","mystery","consumable"],{"goblin":2,"gnome":2,"fey":2},"uncommon",(5,100),"Could be anything. Goblins drink it to find out."),
 ("poison_vial","vial of poison",["alchemy","poison","consumable","assassin"],{"goblin":3,"fey":1,"undead":1},"uncommon",(20,150),"Green, viscous, quiet."),
 ("antidote","antidote",["alchemy","potion","consumable"],{"human":2,"elf":2,"gnome":1},"uncommon",(20,100),"Milky; drink fast."),
 ("alchemists_fire","alchemist's fire",["alchemy","explosive","consumable","gnome"],{"gnome":3,"goblin":2},"rare",(50,200),"Clay pot of something that hates air."),
 ("herb_bundle","herb bundle",["alchemy","herb","nature","consumable"],{"elf":2,"halfling":2,"fey":2},"common",(1,8),"Dried herbs tied with twine."),
 ("gloomcap","gloomcap",["alchemy","fungus","cave","consumable"],{"goblin":3,"troll":2,"dwarf":1},"common",(1,6),"Glows faintly; eat only if desperate or goblin."),
 ("smoke_bomb","smoke pellet",["alchemy","consumable","stealth","gnome"],{"gnome":2,"goblin":2},"uncommon",(10,40),"Crush and vanish, coughing."),
 ("ink_pot","ink pot",["alchemy","writing","glass"],{"human":2,"elf":2,"gnome":2},"common",(1,5),"Oak-gall ink."),
 ("salve","healing salve",["alchemy","healing","consumable","herb"],{"elf":2,"halfling":2,"human":2},"common",(3,20),"Green paste; smells of mint and worse."),
 ("troll_blood","vial of troll blood",["alchemy","gore","troll","healing","dark"],{"troll":1,"goblin":2,"undead":1},"rare",(30,300),"Regrows things. Not always the right things."),
 ("iron_ingot","iron ingot",["material","metal","iron"],{"dwarf":3,"human":2,"orc":1},"common",(3,8),"Bar of pig iron."),
 ("steel_ingot","steel ingot",["material","metal","steel"],{"dwarf":3,"human":2},"uncommon",(10,30),"Folded and quenched."),
 ("mithril_ingot","mithril ingot",["material","metal","mithril","precious"],{"dwarf":3,"elf":2},"epic",(500,3000),"Light as wood, hard as steel, rarer than either."),
 ("gold_bar","gold bar",["material","metal","gold","precious"],{"dragon":3,"dwarf":2,"human":2},"rare",(200,1000),"Stamped bar."),
 ("ruby","ruby",["material","gem","red","precious"],{"dragon":3,"dwarf":2},"rare",(100,1500),"Blood-red stone."),
 ("sapphire","sapphire",["material","gem","blue","precious"],{"elf":2,"human":2,"dragon":2},"rare",(100,1500),"Deep blue stone."),
 ("emerald","emerald",["material","gem","green","precious"],{"elf":3,"fey":2,"dragon":1},"rare",(100,1500),"Green as new leaves."),
 ("uncut_gem","uncut gemstone",["material","gem","raw"],{"dwarf":3,"goblin":2},"uncommon",(20,300),"Rough stone; a cutter would know."),
 ("pearl","pearl",["material","gem","sea","white"],{"human":2,"fey":2},"uncommon",(30,400),"From the deep; fey trade in them."),
 ("amber_insect","amber with an insect",["material","gem","amber","nature"],{"elf":2,"fey":2,"gnome":1},"uncommon",(10,120),"Something small is trapped forever."),
 ("obsidian_shard","obsidian shard",["material","stone","black","sharp"],{"orc":2,"goblin":2,"dragon":1},"common",(1,5),"Volcanic glass."),
 ("silk_bolt","bolt of silk",["material","cloth","fine"],{"elf":3,"human":2,"fey":1},"uncommon",(40,300),"Twenty yards of the good stuff."),
 ("wool_bolt","bolt of wool",["material","cloth","humble"],{"human":2,"halfling":2,"dwarf":1},"common",(5,25),"Twenty yards of the warm stuff."),
 ("wolf_pelt","wolf pelt",["material","hide","trophy","animal"],{"orc":2,"human":2,"elf":1},"common",(3,20),"Grey, thick, one hole."),
 ("bear_pelt","bear pelt",["material","hide","trophy","animal"],{"human":2,"giant":2,"orc":1},"uncommon",(20,80),"Enough to carpet a hall."),
 ("dragon_scale","dragon scale",["material","scale","dragon","precious","fire"],{"dragon":3,"dwarf":1},"epic",(300,2000),"One scale, dinner-plate sized, warm."),
 ("timber","seasoned timber",["material","wood"],{"human":2,"halfling":2,"elf":1},"common",(1,6),"Oak planks, dry."),
 ("coal_sack","sack of coal",["material","fuel","dwarf"],{"dwarf":3,"gnome":2,"human":1},"common",(1,4),"Burns hot and dirty."),
 ("salt_block","block of salt",["material","food","trade"],{"human":2,"dwarf":1},"common",(2,10),"Worth more than it looks, far from the sea."),
 ("enemy_skull","enemy skull",["trophy","bone","gore"],{"orc":3,"goblin":2,"troll":2,"undead":1},"common",(0,5),"Grinning still."),
 ("drake_fang","drake fang",["trophy","fang","dragon","gore"],{"orc":2,"human":2,"dragon":1},"uncommon",(20,200),"As long as a forearm."),
 ("antlers","stag antlers",["trophy","horn","nature","elf"],{"elf":3,"human":2,"fey":1},"common",(5,40),"Twelve points; hung over the door."),
 ("captured_banner","captured banner",["trophy","cloth","war","faction"],{"human":2,"orc":2,"dwarf":2},"uncommon",(10,200),"Someone else's colours, torn."),
 ("giant_toenail","giant's toenail",["trophy","gore","giant","huge"],{"goblin":2,"halfling":1},"uncommon",(5,50),"Used as a shield by goblins."),
 ("pressed_wing","pressed fey wing",["trophy","fey","dark","cruel"],{"goblin":2,"undead":1},"rare",(20,300),"Kept between the pages of a book. The fey remember who."),
 ("scalp_string","string of scalps",["trophy","gore","cruel","orc"],{"orc":3,"goblin":1},"common",(0,10),"Braided; counts more than fingers do."),
 ("broken_crown","broken crown",["trophy","regalia","ruin","gold"],{"undead":2,"orc":2,"dragon":2},"rare",(50,800),"Cut in two; the halves argue."),
 ("loaf","loaf of bread",["food","staple","consumable"],{"halfling":3,"human":2},"common",(0,1),"Crusty."),
 ("cheese_wheel","wheel of cheese",["food","consumable","halfling"],{"halfling":3,"human":2,"dwarf":1},"common",(2,10),"Waxed; rolls well downhill."),
 ("honeycake","honeycake",["food","sweet","consumable","halfling"],{"halfling":3,"fey":2},"common",(0,2),"Sticky. Worth it."),
 ("smoked_eel","smoked eel",["food","fish","consumable"],{"human":2,"halfling":2,"goblin":1},"common",(1,3),"Chewy and strong."),
 ("ale_keg","keg of ale",["food","drink","ale","consumable"],{"dwarf":3,"halfling":2,"human":2,"orc":1},"common",(5,20),"Dark and heavy, the way the dwarves brew."),
 ("cinderwine","cinderwine",["food","drink","spirits","consumable","fire"],{"orc":2,"dragon":1,"dwarf":1},"uncommon",(10,60),"Burns twice."),
 ("waybread","waybread",["food","travel","consumable","elf","magic"],{"elf":3},"uncommon",(5,40),"One thin cake keeps a traveller a day.","elf"),
 ("dried_meat","dried meat",["food","travel","consumable"],{"orc":3,"human":2,"dwarf":2},"common",(1,3),"Salt and leather; ask not the animal."),
 ("rat_kebab","rat on a stick",["food","consumable","goblin","crude"],{"goblin":3,"troll":1},"common",(0,1),"Goblin street food.","goblin"),
 ("grave_dirt","jar of grave dirt",["alchemy","dark","undead","component"],{"undead":3,"fey":1},"uncommon",(5,60),"For those who need to sleep in it.","undead"),
 ("clockwork_nut","clockwork nut",["food","consumable","gnome","gadget"],{"gnome":3},"common",(1,5),"A nut. With a spring in it. Do not ask.","gnome"),
 ("apple_pie","apple pie",["food","sweet","consumable","halfling","home"],{"halfling":3,"human":1},"common",(1,3),"Cooling on a sill somewhere, briefly."),
 ("mead","jug of mead",["food","drink","honey","consumable"],{"halfling":2,"human":2,"giant":2,"dwarf":1},"common",(2,8),"Honey wine; giants drink it by the barrel."),
 ("moon_dew","vial of moon dew",["food","drink","fey","magic","consumable"],{"fey":3,"elf":1},"rare",(20,200),"Tastes of a night you have forgotten.","fey"),
 ("whole_ox","roast ox",["food","consumable","feast","giant","huge"],{"giant":3,"orc":2},"uncommon",(20,60),"A giant's snack; a village's feast."),
 ("mushroom_stew","mushroom stew",["food","consumable","cave","dwarf"],{"dwarf":2,"goblin":2,"troll":1},"common",(0,2),"Cave mushrooms, salt, patience."),
], "alchemy",lambda t: t[1],[])
for d in items:
    if d["category"]=="alchemy": d["category"]=misccat(d["tags"])
materials={
 "_doc":"Material groups for variants. Each: id, adj (name prefix), value multiplier, tags, affinity. qualities: prefix + value multiplier + weight. enchant_prefix: names for magical variants with the tags they add.",
 "materials":[
  {"id":"iron","adj":"iron","value":1.0,"tags":["metal","common"],"affinity":{"dwarf":2,"human":2}},
  {"id":"steel","adj":"steel","value":1.6,"tags":["metal"],"affinity":{"dwarf":3,"human":3}},
  {"id":"bronze","adj":"bronze","value":0.9,"tags":["metal","ancient"],"affinity":{"giant":2,"human":1}},
  {"id":"silver","adj":"silvered","value":2.5,"tags":["metal","precious","holy"],"affinity":{"elf":3,"human":1,"fey":1}},
  {"id":"gold","adj":"gilded","value":4.0,"tags":["metal","precious"],"affinity":{"dragon":3,"dwarf":2,"human":1}},
  {"id":"mithril","adj":"mithril","value":12.0,"tags":["metal","precious","light","magic"],"affinity":{"dwarf":3,"elf":3}},
  {"id":"copper","adj":"copper","value":0.8,"tags":["metal"],"affinity":{"gnome":3}},
  {"id":"brass","adj":"brass","value":1.1,"tags":["metal","tinker"],"affinity":{"gnome":3}},
  {"id":"pewter","adj":"pewter","value":0.7,"tags":["metal","humble"],"affinity":{"halfling":2,"human":1}},
  {"id":"wood","adj":"wooden","value":0.5,"tags":["wood","humble"],"affinity":{"halfling":2,"elf":1,"troll":2}},
  {"id":"yew","adj":"yew","value":1.4,"tags":["wood","bow"],"affinity":{"elf":3,"human":2}},
  {"id":"livingwood","adj":"livingwood","value":6.0,"tags":["wood","magic","living"],"affinity":{"elf":3,"fey":2}},
  {"id":"bone","adj":"bone","value":0.4,"tags":["bone","crude","gore"],"affinity":{"orc":3,"undead":3,"goblin":2}},
  {"id":"horn","adj":"horn","value":0.9,"tags":["horn"],"affinity":{"orc":2,"giant":2,"dwarf":1}},
  {"id":"stone","adj":"stone","value":0.3,"tags":["stone","crude"],"affinity":{"troll":3,"giant":3,"goblin":1}},
  {"id":"obsidian","adj":"obsidian","value":1.5,"tags":["stone","sharp","brittle"],"affinity":{"orc":2,"goblin":2,"dragon":1}},
  {"id":"crystal","adj":"crystal","value":3.0,"tags":["crystal","magic"],"affinity":{"gnome":2,"fey":2,"elf":1}},
  {"id":"leather","adj":"leather","value":0.6,"tags":["leather"],"affinity":{"human":2,"elf":2,"halfling":2}},
  {"id":"hide","adj":"hide","value":0.4,"tags":["hide","crude"],"affinity":{"orc":3,"troll":2}},
  {"id":"cloth","adj":"cloth","value":0.4,"tags":["cloth"],"affinity":{"human":2,"halfling":2}},
  {"id":"clay","adj":"clay","value":0.2,"tags":["clay","humble"],"affinity":{"halfling":2,"human":2,"goblin":1}},
  {"id":"glass","adj":"glass","value":1.2,"tags":["glass","fragile"],"affinity":{"gnome":2,"elf":1}},
  {"id":"dragonscale","adj":"dragonscale","value":15.0,"tags":["scale","magic","fire"],"affinity":{"dragon":3}},
  {"id":"vellum","adj":"vellum","value":1.0,"tags":["paper"],"affinity":{"human":2,"elf":2}},
  {"id":"paper","adj":"paper","value":0.5,"tags":["paper"],"affinity":{"human":2,"gnome":2}},
  {"id":"bark","adj":"bark","value":0.3,"tags":["paper","nature"],"affinity":{"elf":2,"fey":2}}
 ],
 "qualities":[
  {"id":"crude","adj":"crude","value":0.5,"weight":3,"tags":["crude"],"affinity":{"goblin":3,"troll":3,"orc":2}},
  {"id":"worn","adj":"worn","value":0.7,"weight":4,"tags":["old"]},
  {"id":"plain","adj":"","value":1.0,"weight":8,"tags":[]},
  {"id":"fine","adj":"fine","value":1.8,"weight":3,"tags":["fine"],"affinity":{"elf":2,"human":2,"dwarf":2}},
  {"id":"masterwork","adj":"masterwork","value":4.0,"weight":1,"tags":["masterwork"],"affinity":{"dwarf":3,"elf":2,"gnome":2}},
  {"id":"ancient","adj":"ancient","value":3.0,"weight":1,"tags":["ancient","lore"],"affinity":{"undead":2,"giant":2,"dragon":2,"elf":1}}
 ],
 "enchant_prefix":["Flaming","Frost","Venomous","Shadowed","Blessed","Cursed","Thundering","Vampiric","Keen","Warding","Whispering","Mending","Hungering","Sunlit","Moonlit","Runed"],
 "enchant_tags":{"Flaming":["fire"],"Frost":["ice","cold"],"Venomous":["poison"],"Shadowed":["dark","stealth"],"Blessed":["holy"],"Cursed":["cursed","dark"],"Thundering":["storm"],"Vampiric":["dark","blood"],"Keen":["sharp"],"Warding":["protect"],"Whispering":["fey","secret"],"Mending":["heal"],"Hungering":["dark","cursed"],"Sunlit":["holy","light"],"Moonlit":["elf","magic"],"Runed":["dwarf","runes"]}
}
# ---- materials narrowed by category + tags (a cloth apron is never dragonscale, tongs are never cloth); affinity bumps
METALS=["steel","iron","bronze","mithril"]
MAT_WORDS=("iron","steel","bronze","mithril","silver","gold","gilt","copper","brass","pewter","wood","wooden","yew","livingwood","bone","horn","stone","obsidian","crystal","leather","hide","cloth","clay","glass","dragonscale","vellum","paper","bark","silk","wool","tooth","teeth","fang","skull","scale","fey wing","moss","straw","wax","bread","reed")
for d in items:
    t=set(d["tags"]); cat=d["category"]; sub=d["sub"]; name=d["name"].lower()
    if any(w in name for w in MAT_WORDS) or "consumable" in t: d["materials"]=[]; continue
    if cat=="weapon":
        if sub=="ranged":
            if "crossbow" in t: d["materials"]=["wood","steel","iron","brass"]
            elif "bow" in t: d["materials"]=["wood","yew","horn","livingwood"]
            elif "ammo" in t or "container" in t or "humble" in t or "entangling" in t or "leather" in t: d["materials"]=[]
            elif "blade" in t: d["materials"]=METALS
            else: d["materials"]=["wood"]
        elif sub=="staff": d["materials"]=["wood","bone","crystal","brass","silver","livingwood"] if "focus" in t else ["wood"]
        elif "crude" in t or "kitchen" in t or "humble" in t: d["materials"]=["iron","wood"] if "kitchen" in t else ["stone","bone","wood"]
        else: d["materials"]=METALS
    elif cat=="armour":
        if "cloth" in t or "mage" in t or sub=="clothing": d["materials"]=["cloth"] if "leather" not in t and "hide" not in t else ["leather","hide"]
        elif "leather" in t: d["materials"]=["leather","hide"]
        elif "hide" in t: d["materials"]=["hide"]
        elif "wood" in t: d["materials"]=["wood","livingwood"]
        elif "scales" in t: d["materials"]=["steel","bronze","dragonscale"]
        elif sub=="shield": d["materials"]=["wood","steel","iron","hide","bone","mithril"]
        elif "junk" in t or "crude" in t: d["materials"]=["iron","bone","wood"]
        elif "gadget" in t: d["materials"]=["brass","steel","copper"]
        else: d["materials"]=METALS+(["dragonscale"] if d["rarity"] in("epic","legendary") else [])
    elif cat=="vessel":
        if "cooking" in t: d["materials"]=["iron","copper","clay"]
        elif "storage" in t: d["materials"]=["wood","clay"]
        elif "religious" in t: d["materials"]=["brass","silver","gold"]
        elif "humble" in t: d["materials"]=["clay","wood","pewter"]
        elif "gadget" in t: d["materials"]=["brass","copper"]
        else: d["materials"]=["pewter","silver","gold","copper","wood","horn","glass","crystal","mithril"]
    elif cat=="regalia":
        if "personal" in t: d["materials"]=["wood","bone","silver","leather"]
        elif "gore" in t or "trophy" in t: d["materials"]=[]
        else: d["materials"]=["gold","silver","bronze","copper","iron","mithril"]
    elif cat=="lore":
        d["materials"]=[m for m in ("clay","stone","vellum","paper","bark","bone") if m in t] or (["vellum","paper"] if ("book" in t or "paper" in t or "writing" in t) else [])
    elif cat=="tool": d["materials"]=[] if ("set" in t or "gadget" in t or "game" in t) else ["iron","steel","wood","brass"]
    elif cat=="household": d["materials"]=["wood","clay","iron","glass"] if "cloth" not in t else ["cloth"]
    elif cat=="container": d["materials"]=["wood","leather","iron"] if "cloth" not in t else ["cloth"]
    elif cat=="instrument": d["materials"]=["wood","bone","brass","horn","silver"] if "gadget" not in t else ["brass"]
    elif cat=="religious": d["materials"]=["wood","brass","silver","gold","bone","stone"]
    else: d["materials"]=[]
    if ("crude" in t or "stone" in t or "gore" in t) and "troll" not in d["affinity"]: d["affinity"]["troll"]=2
    if ("gold" in t or "precious" in t or "fire" in t or "hoard" in t or "royal" in t or "jewelled" in t or "gem" in t) and "dragon" not in d["affinity"]: d["affinity"]["dragon"]=2
ids=[i["id"] for i in items]; assert len(ids)==len(set(ids)), [x for x in ids if ids.count(x)>1]
json.dump({"_doc":"Item catalog. Fields: id, name (singular), category, sub, tags (blade, one-handed, kitchen, gore, magic…), affinity {race: 0..3; missing = rare for that race}, exclusive (only that race), rarity common|uncommon|rare|epic|legendary, value [min,max] silver marks, materials (allowed material ids from materials.json; empty = none), desc, damage (weapons). Built by tools/build-items.py; games extend this file or load their own.","items":items},open('items/data/items.json','w'),indent=1,ensure_ascii=False)
json.dump(materials,open('items/data/materials.json','w'),indent=1,ensure_ascii=False)
print('items', len(items), dict(Counter(i['category'] for i in items)), 'exclusives', sum(1 for i in items if 'exclusive' in i))
