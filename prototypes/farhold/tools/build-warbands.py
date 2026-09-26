# Farhold R26 — writes data/warbands.json (the five enemy warbands). Run: python3 tools/build-warbands.py
# The JSON is what the game reads; this is only here so the stat curve and the looks can be re-rolled in one place.
import json
import os
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'warbands.json')

TPL = {
 'melee':  dict(role='brute', hp=70, dmg=[9,14], armor=8, speed=3.3, reach=2.8, aggroRange=28, attackEvery=1.8, xp=30, gold=16, pack=[2,3]),
 'rogue':  dict(role='skirmisher', hp=44, dmg=[7,11], armor=4, speed=4.8, reach=2.3, aggroRange=32, attackEvery=1.0, xp=26, gold=18, pack=[1,3], onHit='bleed'),
 'ranged': dict(role='archer', hp=40, dmg=[8,12], armor=3, speed=3.6, reach=3.0, aggroRange=38, attackEvery=2.1, xp=28, gold=15, pack=[1,3]),
 'caster': dict(role='caster', hp=42, dmg=[10,14], armor=3, speed=3.3, reach=3.6, aggroRange=32, attackEvery=2.2, xp=32, gold=18, pack=[1,2]),
 'leader': dict(role='leader', hp=120, dmg=[12,18], armor=10, speed=3.6, reach=3.0, aggroRange=32, attackEvery=1.7, xp=70, gold=45, pack=[1,1]),
}

def av(race, skin, body, face, outfit):
    a = {'body': dict(race=race, skin=skin, **body)}
    a.update(face); a.update(outfit)
    return a

W = []

# ---------------------------------------------------------------- goblins
G = dict(id='sootwick', race='goblin', nameRace='goblin', name='The Sootwick Gang', short='Sootwick',
  blurb='goblin cutpurses and hexers who strip anything left on the road', family='humanoid',
  levels=[1,16], prefers=['grass','jungle','desert','rock'], colour='#c8a040',
  mods=dict(hp=0.82, dmg=0.95, speed=1.08, armor=0.9))
gface = lambda **k: {'headShape':'round','ears':{'id':'big'},'nose':{'id':'long'},'eyes':{'id':'wide','color':'#e0c040'},'mouth':{'id':'grin'},'brows':{'id':'angry','color':'#2a2a2a'},'hair':{'id':'bald','color':'#111111'}, **k}
G['members'] = [
 dict(type='melee', id='sootwick_basher', name='Sootwick Basher', minLevel=1, maxLevel=12,
      look=av('goblin','#7fa86a',dict(height=0.05,width=0.55,headSize=0.65,round=0.35), gface(hair={'id':'spiky','color':'#2a2a2a'}),
        {'top':{'id':'rags','color':'#5a4a38'},'bottom':{'id':'shorts','color':'#4a3e30'},'shoes':{'id':'wraps','color':'#6a5a44'},'hat':{'id':'leather_cap','color':'#4a3a2a'},'decor':{'id':'belt_pouches','color':'#5a4632'},'held':{'id':'fh_mace','color':'#8a8a8a'},'offhand':{'id':'buckler','color':'#6a5030'}}),
      dropBases=['iron_mace','hammer','light_chest','light_boots','ring']),
 dict(type='rogue', id='sootwick_knifer', name='Sootwick Knifer', minLevel=1, maxLevel=13,
      look=av('goblin','#9db38a',dict(height=0.0,width=0.3,headSize=0.7,round=0.1), gface(eyes={'id':'slit','color':'#e0e040'}, mouth={'id':'fangs'}),
        {'top':{'id':'vest','color':'#3a3a30'},'bottom':{'id':'ragged','color':'#3a3228'},'shoes':{'id':'barefoot'},'accessory':{'id':'scarf_mask','color':'#2e2e28'},'hat':{'id':'bandana','color':'#6a2a1a'},'decor':{'id':'knife_rig','color':'#4a3a2a'},'held':{'id':'fh_dagger','color':'#b8c0c8'},'offhand':{'id':'fh_dagger','color':'#b8c0c8'}}),
      dropBases=['dagger','rapier','light_chest','light_gauntlets','ring']),
 dict(type='ranged', id='sootwick_slinger', name='Sootwick Slinger', minLevel=2, maxLevel=14, ranged={'range':30,'element':'physical'},
      look=av('goblin','#8aa05a',dict(height=0.0,width=0.35,headSize=0.65,round=0.2), gface(accessory={'id':'goggles','color':'#8a6a3a'}),
        {'top':{'id':'leather','color':'#4a4030','color2':'#2e2a20'},'bottom':{'id':'shorts','color':'#3e3428'},'shoes':{'id':'sandals','color':'#5a4632'},'hat':{'id':'goggles_up','color':'#8a6a3a'},'decor':{'id':'gear_pack','color':'#5a4a38'},'held':{'id':'crossbow','color':'#6a5030'}}),
      dropBases=['crossbow','shortbow','quiver','light_helm','ring']),
 dict(type='caster', id='sootwick_hexer', name='Sootwick Hexer', minLevel=3, maxLevel=15, ranged={'range':26,'element':'poison'}, onHit='poison',
      look=av('goblin','#a8b870',dict(height=0.0,width=0.25,headSize=0.75,round=0.05), gface(eyes={'id':'glow','color':'#9ede6a'}, extras={'id':'paint_dots','color':'#9ede6a'}, hair={'id':'hood_hair','color':'#2a2a2a'}),
        {'top':{'id':'robe','color':'#3a4a2a','color2':'#9ede6a'},'bottom':{'id':'ragged','color':'#2e3a22'},'shoes':{'id':'barefoot'},'hat':{'id':'hood','color':'#34422a'},'decor':{'id':'bone_charms','color':'#d8d0b0'},'held':{'id':'staff_skull','color':'#9ede6a'}}),
      dropBases=['staff','wand','cloth_chest','cloth_helm','necklace']),
 dict(type='leader', id='sootwick_ringleader', name='Sootwick Ringleader', minLevel=4, maxLevel=16, leads=['sootwick_basher','sootwick_slinger'],
      look=av('goblin','#7fa86a',dict(height=0.15,width=0.6,headSize=0.7,round=0.45), gface(eyes={'id':'angry','color':'#e0a040'}, extras={'id':'scar','color':'#9a5a4a'}, accessory={'id':'earrings','color':'#e0c040'}),
        {'top':{'id':'coat','color':'#6a2a1a','color2':'#c8a040'},'bottom':{'id':'baggy','color':'#3e3428'},'shoes':{'id':'boots','color':'#332a20'},'hat':{'id':'top_hat','color':'#2a2420'},'cape':{'id':'tattered_cape','color':'#5a2a1a'},'decor':{'id':'trophy_belt','color':'#5a4632'},'held':{'id':'cleaver','color':'#c0c6cc'},'offhand':{'id':'buckler','color':'#c8a040'}}),
      dropBases=['sword','battleaxe','medium_chest','medium_helm','gold_signet','necklace']),
]
W.append(G)

# ---------------------------------------------------------------- orcs
O = dict(id='ashtusk', race='orc', nameRace='orc', name='The Ashtusk Horde', short='Ashtusk',
  blurb='orc warbands that burn a road black and take what is left', family='humanoid',
  levels=[5,24], prefers=['grass','desert','rock','lava','tundra'], colour='#b8402a',
  mods=dict(hp=1.1, dmg=1.08, speed=1.0, armor=1.0))
oface = lambda **k: {'headShape':'square','ears':{'id':'pointed'},'nose':{'id':'wide'},'eyes':{'id':'angry','color':'#c83a2a'},'mouth':{'id':'tusks'},'brows':{'id':'thick','color':'#1a1a1a'},'hair':{'id':'mohawk','color':'#111111'}, **k}
O['members'] = [
 dict(type='melee', id='ashtusk_brute', name='Ashtusk Brute', minLevel=5, maxLevel=22,
      look=av('orc','#7fa86a',dict(height=0.85,width=0.95,headSize=0.45,round=0.3), oface(extras={'id':'warpaint','color':'#b8402a'}),
        {'top':{'id':'harness','color':'#3a2a20'},'bottom':{'id':'loincloth','color':'#4a3020'},'shoes':{'id':'wraps','color':'#5a4632'},'decor':{'id':'pauldrons','color':'#5a5e64'},'held':{'id':'fh_greataxe','color':'#8a8e94'}}),
      dropBases=['axe2h','battleaxe','medium_chest','heavy_gauntlets','ring']),
 dict(type='rogue', id='ashtusk_raider', name='Ashtusk Raider', minLevel=5, maxLevel=22,
      look=av('orc','#9db38a',dict(height=0.6,width=0.65,headSize=0.45,round=0.1), oface(hair={'id':'ponytail','color':'#1a1a1a'}, extras={'id':'war_stripe','color':'#2a2a2a'}),
        {'top':{'id':'leather','color':'#3a2e22','color2':'#b8402a'},'bottom':{'id':'pants','color':'#2e261e'},'shoes':{'id':'boots','color':'#2a2218'},'hat':{'id':'headband','color':'#b8402a'},'decor':{'id':'knife_rig','color':'#3a2e22'},'held':{'id':'fh_axe','color':'#a8b0b8'},'offhand':{'id':'fh_axe','color':'#a8b0b8'}}),
      dropBases=['battleaxe','dagger','light_chest','medium_boots','ring']),
 dict(type='ranged', id='ashtusk_spearthrower', name='Ashtusk Spearthrower', minLevel=6, maxLevel=23, ranged={'range':30,'element':'physical'},
      look=av('orc','#6e8f5a',dict(height=0.7,width=0.7,headSize=0.4,round=0.15), oface(hair={'id':'braids','color':'#1a1a1a'}),
        {'top':{'id':'fur_tunic','color':'#6a5238'},'bottom':{'id':'kilt','color':'#4a3020'},'shoes':{'id':'barefoot'},'cape':{'id':'fur_mantle','color':'#5a4632'},'decor':{'id':'trophy_belt','color':'#4a3a2a'},'held':{'id':'fh_javelin','color':'#8a6a44'}}),
      dropBases=['pathfinder_javelin','shortbow','quiver','medium_helm','necklace']),
 dict(type='caster', id='ashtusk_bonecaller', name='Ashtusk Bonecaller', minLevel=7, maxLevel=24, ranged={'range':28,'element':'fire'}, onHit='burn', glow='#ff7a3a',
      look=av('orc','#8a9a70',dict(height=0.55,width=0.55,headSize=0.5,round=0.2), oface(eyes={'id':'glow','color':'#ff7a3a'}, hair={'id':'bald','color':'#111111'}, extras={'id':'face_glyphs','color':'#ff7a3a'}),
        {'top':{'id':'rags','color':'#4a2a20'},'bottom':{'id':'ragged','color':'#3a2218'},'shoes':{'id':'wraps','color':'#5a4632'},'cape':{'id':'tattered_cape','color':'#3a1a14'},'decor':{'id':'bone_charms','color':'#e0d8c0'},'held':{'id':'staff_totem','color':'#ff9a4a'}}),
      dropBases=['staff','scepter','cloth_chest','cloth_helm','silver_amulet']),
 dict(type='leader', id='ashtusk_warchief', name='Ashtusk Warchief', minLevel=9, maxLevel=24, leads=['ashtusk_brute','ashtusk_spearthrower'],
      look=av('orc','#6e8f5a',dict(height=1.0,width=1.0,headSize=0.45,round=0.25), oface(extras={'id':'scar_cheek','color':'#8a4a3a'}),
        {'top':{'id':'chainmail','color':'#4a4e54','color2':'#b8402a'},'bottom':{'id':'greaves','color':'#3e4248'},'shoes':{'id':'heavy','color':'#33383e'},'hat':{'id':'horned_helm','color':'#4a4e54'},'cape':{'id':'fur_mantle','color':'#3a2a20'},'decor':{'id':'pauldrons','color':'#6a2a1a'},'held':{'id':'fh_maul','color':'#8a8e94'},'offhand':{'id':'round_shield','color':'#6a2a1a'}}),
      dropBases=['warhammer','axe2h','heavy_chest','heavy_helm','gold_signet','silver_amulet']),
]
W.append(O)

# ---------------------------------------------------------------- beastkin
B = dict(id='thornmane', race='beast', nameRace='troll', name='The Thornmane Packs', short='Thornmane',
  blurb='beastkin hunting packs who run down anything that walks their ground', family='humanoid',
  levels=[9,28], prefers=['jungle','grass','tundra'], colour='#7aa84a',
  mods=dict(hp=1.05, dmg=1.05, speed=1.12, armor=0.9))
bface = lambda **k: {'headShape':'wide','ears':{'id':'pointed'},'nose':{'id':'snout'},'eyes':{'id':'slit','color':'#e0c040'},'mouth':{'id':'fangs'},'brows':{'id':'thick','color':'#3b2a1a'},'hair':{'id':'spiky','color':'#6b4a2a'}, **k}
B['members'] = [
 dict(type='melee', id='thornmane_mauler', name='Thornmane Mauler', minLevel=9, maxLevel=26,
      look=av('beast','#8d5524',dict(height=0.8,width=0.9,headSize=0.5,round=0.2), bface(hair={'id':'horns_hair','color':'#3b2a1a'}),
        {'top':{'id':'harness','color':'#3a2a1a'},'bottom':{'id':'loincloth','color':'#4a3a22'},'shoes':{'id':'hooves'},'cape':{'id':'fur_mantle','color':'#5a4a30'},'held':{'id':'fh_greataxe','color':'#8a8e94'}}),
      dropBases=['axe2h','battleaxe','medium_chest','heavy_boots','ring']),
 dict(type='rogue', id='thornmane_prowler', name='Thornmane Prowler', minLevel=9, maxLevel=26,
      look=av('beast','#a87a4a',dict(height=0.5,width=0.55,headSize=0.5,round=0.05), bface(),
        {'top':{'id':'tank','color':'#3a4a2a'},'bottom':{'id':'ragged','color':'#2e3a22'},'shoes':{'id':'barefoot'},'decor':{'id':'trophy_belt','color':'#4a3a2a'},'held':{'id':'fh_daggers','color':'#cfd8e0'}}),
      dropBases=['dagger','rapier','light_chest','runed_boots','ring']),
 dict(type='ranged', id='thornmane_tracker', name='Thornmane Tracker', minLevel=10, maxLevel=27, ranged={'range':34,'element':'physical'},
      look=av('beast','#c68642',dict(height=0.65,width=0.6,headSize=0.45,round=0.1), bface(hair={'id':'mohawk','color':'#3b2a1a'}),
        {'top':{'id':'leather','color':'#4a5238','color2':'#2e3422'},'bottom':{'id':'kilt','color':'#38402c'},'shoes':{'id':'wraps','color':'#5a4632'},'hat':{'id':'headband','color':'#7aa84a'},'held':{'id':'bow','color':'#6a5030'},'offhand':{'id':'quiver','color':'#5a4632'}}),
      dropBases=['bow','roadwarden_bow','quiver','light_helm','necklace']),
 dict(type='caster', id='thornmane_moonseer', name='Thornmane Moonseer', minLevel=11, maxLevel=28, ranged={'range':30,'element':'lightning'}, onHit='shock', glow='#9fd8ff',
      look=av('beast','#d8c8a8',dict(height=0.55,width=0.45,headSize=0.55,round=0.05), bface(eyes={'id':'glow','color':'#9fd8ff'}, hair={'id':'hood_hair','color':'#eeeeee'}, extras={'id':'lightning_arcs','color':'#9fd8ff'}),
        {'top':{'id':'robe','color':'#2a3a4a','color2':'#9fd8ff'},'bottom':{'id':'loincloth','color':'#2a3040'},'shoes':{'id':'barefoot'},'cape':{'id':'feather_mantle','color':'#d8d8c8'},'decor':{'id':'prayer_ribbons','color':'#9fd8ff'},'held':{'id':'staff_crook','color':'#c8e8ff'}}),
      dropBases=['staff','wand','orb','cloth_chest','silver_amulet']),
 dict(type='leader', id='thornmane_packlord', name='Thornmane Packlord', minLevel=13, maxLevel=28, leads=['thornmane_mauler','thornmane_tracker'],
      look=av('beast','#5c3a1e',dict(height=1.0,width=1.0,headSize=0.5,round=0.2), bface(hair={'id':'horns_hair','color':'#eeeeee'}, extras={'id':'war_stripe','color':'#eeeeee'}),
        {'top':{'id':'scale_plate','color':'#4a5a3a','color2':'#7aa84a'},'bottom':{'id':'kilt','color':'#3a2a1a'},'shoes':{'id':'hooves'},'cape':{'id':'fur_mantle','color':'#e0d8c8'},'decor':{'id':'bone_charms','color':'#e0d8c0'},'held':{'id':'fh_halberd','color':'#a8b0b8'}}),
      dropBases=['halberd','axe2h','scaled_chest','scaled_legs','gold_signet','necklace']),
]
W.append(B)

# ---------------------------------------------------------------- undead
U = dict(id='unburied', race='undead', nameRace='undead', name='The Unburied Legion', short='Unburied',
  blurb='a dead army that never stopped marching, and never stopped recruiting', family='undead',
  levels=[14,36], prefers=['toxic','void','rock','ice','tundra'], colour='#7ae0ff',
  mods=dict(hp=1.12, dmg=1.1, speed=0.95, armor=1.2))
uface = lambda **k: {'headShape':'long','ears':{'id':'normal'},'nose':{'id':'none'},'eyes':{'id':'hollow','color':'#7ae0ff'},'mouth':{'id':'stitched'},'brows':{'id':'none'},'hair':{'id':'bald','color':'#888888'},'extras':{'id':'undead_skin','color':'#8a94a0'}, **k}
U['members'] = [
 dict(type='melee', id='unburied_bonesoldier', name='Unburied Bonesoldier', minLevel=14, maxLevel=34,
      look=av('undead','#c9cfc3',dict(height=0.55,width=0.25,headSize=0.55,round=0), uface(),
        {'top':{'id':'chainmail','color':'#5a5e64','color2':'#2a4a48'},'bottom':{'id':'ragged','color':'#3a3e40'},'shoes':{'id':'boots','color':'#33383e'},'hat':{'id':'chain_coif','color':'#5a5e64'},'cape':{'id':'tattered_cape','color':'#2a4a48'},'held':{'id':'fh_sword','color':'#9aa4b0'},'offhand':{'id':'fh_heater_shield','color':'#2a4a48'}}),
      dropBases=['sword','heavy_chest','heavy_helm','medium_boots','ring']),
 dict(type='rogue', id='unburied_gravecreeper', name='Unburied Gravecreeper', minLevel=14, maxLevel=34, onHit='poison',
      look=av('undead','#9db38a',dict(height=0.4,width=0.1,headSize=0.5,round=0), uface(eyes={'id':'glow','color':'#9ede6a'}, mouth={'id':'fangs'}),
        {'top':{'id':'rags','color':'#2e3a30'},'bottom':{'id':'ragged','color':'#26302a'},'shoes':{'id':'barefoot'},'hat':{'id':'hood','color':'#26302a'},'accessory':{'id':'scarf_mask','color':'#1e2622'},'held':{'id':'fh_dagger','color':'#8ab09a'},'offhand':{'id':'fh_dagger','color':'#8ab09a'}}),
      dropBases=['dagger','rapier','light_chest','light_boots','ring']),
 dict(type='ranged', id='unburied_deadeye', name='Unburied Deadeye', minLevel=15, maxLevel=35, ranged={'range':36,'element':'physical'},
      look=av('undead','#d8d0c0',dict(height=0.6,width=0.15,headSize=0.5,round=0), uface(eyes={'id':'glow','color':'#7ae0ff'}),
        {'top':{'id':'leather','color':'#3a3e40','color2':'#2a4a48'},'bottom':{'id':'pants','color':'#2e3234'},'shoes':{'id':'boots','color':'#2a2e30'},'hat':{'id':'hood','color':'#2a3234'},'cape':{'id':'tattered_cape','color':'#1e2a2c'},'held':{'id':'bow','color':'#5a5048'},'offhand':{'id':'quiver','color':'#3a3430'}}),
      dropBases=['bow','crossbow','quiver','light_helm','necklace']),
 dict(type='caster', id='unburied_mournweaver', name='Unburied Mournweaver', minLevel=16, maxLevel=36, ranged={'range':30,'element':'shadow'}, onHit='curse', glow='#a060e0',
      look=av('undead','#b8a1d9',dict(height=0.6,width=0.1,headSize=0.55,round=0), uface(eyes={'id':'glow','color':'#a060e0'}, hair={'id':'long','color':'#eeeeee'}),
        {'top':{'id':'high_collar_robe','color':'#2a2238','color2':'#a060e0'},'bottom':{'id':'skirt','color':'#221c2e'},'shoes':{'id':'barefoot'},'hat':{'id':'circlet','color':'#8a8ea4'},'decor':{'id':'chained_tome','color':'#5a4a6a'},'held':{'id':'staff_skull','color':'#b080ff'}}),
      dropBases=['staff','wand','tome','cloth_chest','silver_amulet']),
 dict(type='leader', id='unburied_deathmarshal', name='Unburied Deathmarshal', minLevel=18, maxLevel=36, leads=['unburied_bonesoldier','unburied_deadeye'],
      look=av('undead','#a8b0a0',dict(height=0.8,width=0.35,headSize=0.5,round=0), uface(eyes={'id':'glow','color':'#7ae0ff'}),
        {'top':{'id':'plate','color':'#4a5058','color2':'#7ae0ff'},'bottom':{'id':'greaves','color':'#3e444c'},'shoes':{'id':'heavy','color':'#33383e'},'hat':{'id':'crown','color':'#8a8e94'},'cape':{'id':'cape','color':'#1e2a3a'},'decor':{'id':'rune_halo','color':'#7ae0ff'},'held':{'id':'fh_greatsword','color':'#9ab0c8'}}),
      dropBases=['greatsword','sword2h','plate_helm','heavy_chest','gold_signet','silver_amulet']),
]
W.append(U)

# ---------------------------------------------------------------- giants
T = dict(id='stonehide', race='giant', nameRace='giant', name='The Stonehide Clans', short='Stonehide',
  blurb='giant clans come down off the high ground, a head taller than anything they hunt', family='humanoid',
  levels=[20,50], prefers=['ice','tundra','rock','grass'], colour='#a8c0d8',
  mods=dict(hp=1.5, dmg=1.25, speed=0.92, armor=1.1, reach=0.6))
tface = lambda **k: {'headShape':'square','ears':{'id':'normal'},'nose':{'id':'wide'},'eyes':{'id':'narrow','color':'#5a6a8a'},'mouth':{'id':'frown'},'brows':{'id':'thick','color':'#6b4a2a'},'hair':{'id':'braids','color':'#6b4a2a'},'facialHair':{'id':'braided_beard','color':'#6b4a2a'}, **k}
T['members'] = [
 dict(type='melee', id='stonehide_smasher', name='Stonehide Smasher', minLevel=20, maxLevel=50,
      look=av('giant','#b8a18a',dict(height=0.9,width=0.95,headSize=0.3,round=0.5), tface(hair={'id':'bald','color':'#6b4a2a'}),
        {'top':{'id':'fur_tunic','color':'#7a8ea4'},'bottom':{'id':'kilt','color':'#4a5668'},'shoes':{'id':'wraps','color':'#6a7a8a'},'decor':{'id':'bedroll_pack','color':'#5a4a38'},'held':{'id':'fh_maul','color':'#9aa4b0'}}),
      dropBases=['warhammer','hammer','heavy_chest','heavy_gauntlets','ring']),
 dict(type='rogue', id='stonehide_stalker', name='Stonehide Stalker', minLevel=20, maxLevel=50,
      look=av('giant','#9aa4b0',dict(height=0.75,width=0.65,headSize=0.25,round=0.15), tface(facialHair={'id':'stubble'}, hair={'id':'ponytail','color':'#888888'}),
        {'top':{'id':'leather','color':'#4a5668','color2':'#a8c0d8'},'bottom':{'id':'pants','color':'#3a4452'},'shoes':{'id':'boots','color':'#2e3440'},'cape':{'id':'travel_cloak','color':'#5a6a7a'},'held':{'id':'fh_spear','color':'#b8c8d8'}}),
      dropBases=['halberd','pathfinder_javelin','medium_chest','medium_boots','ring']),
 dict(type='ranged', id='stonehide_hurler', name='Stonehide Hurler', minLevel=21, maxLevel=50, ranged={'range':38,'element':'physical'},
      look=av('giant','#d98f6a',dict(height=0.85,width=0.8,headSize=0.3,round=0.35), tface(hair={'id':'long','color':'#a86a3a'}, facialHair={'id':'full','color':'#a86a3a'}),
        {'top':{'id':'rags','color':'#6a5a48'},'bottom':{'id':'loincloth','color':'#5a4a38'},'shoes':{'id':'barefoot'},'hat':{'id':'headband','color':'#a8c0d8'},'decor':{'id':'trophy_belt','color':'#4a3a2a'},'held':{'id':'fh_javelin','color':'#8a7a6a'}}),
      dropBases=['pathfinder_javelin','crossbow','quiver','medium_helm','necklace']),
 dict(type='caster', id='stonehide_frostsayer', name='Stonehide Frostsayer', minLevel=22, maxLevel=50, ranged={'range':32,'element':'ice'}, onHit='chill', glow='#9fe8ff',
      look=av('giant','#a8b8c8',dict(height=0.8,width=0.6,headSize=0.35,round=0.3), tface(eyes={'id':'glow','color':'#9fe8ff'}, hair={'id':'long','color':'#eeeeee'}, facialHair={'id':'long','color':'#eeeeee'}),
        {'top':{'id':'trim_robe','color':'#3a4a6a','color2':'#9fe8ff'},'bottom':{'id':'baggy','color':'#2e3a52'},'shoes':{'id':'wraps','color':'#6a7a8a'},'cape':{'id':'fur_mantle','color':'#e0e8f0'},'decor':{'id':'storm_rods','color':'#9fe8ff'},'held':{'id':'staff_crystal','color':'#bff0ff'}}),
      dropBases=['staff','orb','wand','cloth_chest','silver_amulet']),
 dict(type='leader', id='stonehide_mountainlord', name='Stonehide Mountainlord', minLevel=24, maxLevel=50, leads=['stonehide_smasher','stonehide_hurler'],
      look=av('giant','#9aa4b0',dict(height=1.0,width=1.0,headSize=0.3,round=0.4), tface(hair={'id':'braids','color':'#eeeeee'}, facialHair={'id':'braided_beard','color':'#eeeeee'}),
        {'top':{'id':'scale_plate','color':'#5a6a7a','color2':'#a8c0d8'},'bottom':{'id':'greaves','color':'#4a5668'},'shoes':{'id':'heavy','color':'#3a4452'},'hat':{'id':'horned_helm','color':'#8a9aaa'},'cape':{'id':'fur_mantle','color':'#e0e8f0'},'decor':{'id':'pauldrons','color':'#5a6a7a'},'held':{'id':'fh_greataxe','color':'#b8c8d8'},'offhand':{'id':'fh_tower_shield','color':'#4a5668'}}),
      dropBases=['axe2h','warhammer','heavy_chest','plate_helm','gold_signet','silver_amulet']),
]
W.append(T)

# ---------------------------------------------------------------- R27 M10: bearers, helms, warlords, camps
#
# "Each warband has a place, a face and a pecking order." Everything below is DATA: js/warbands.js
# injects it at load (data/enemies.json is never written), js/actors.js reads `bearer`, `banner` and
# `leads`, js/sites.js reads `camp`, and tools/build-uniques.mjs owns the five uniques named here.

TPL['bearer'] = dict(role='brute', hp=95, dmg=[10,15], armor=9, speed=3.4, reach=2.9, aggroRange=30, attackEvery=1.8, xp=48, gold=30, pack=[1,1])

# the round-26 class helms (avatar-3d/js/chibi2-hats.js CLASS_HATS), on every leader and elite
HELMS = {
 'sootwick_ringleader':   ('war_helm', '#6a6e74'),
 'ashtusk_warchief':      ('war_helm', '#4a4e54'),
 'thornmane_packlord':    ('wolf_helm', '#6b5a44'),   # it had no hat at all before R27
 'unburied_deathmarshal': ('rune_helm', '#8a8e94'),
 'stonehide_mountainlord':('rune_helm', '#8a9aaa'),
}
for band in W:
    for m in band['members']:
        if m['id'] in HELMS:
            hid, col = HELMS[m['id']]
            m['look']['hat'] = {'id': hid, 'color': col}

# how tall a body of each race stands at scale 1, in metres, and how wide at the shoulder — what the
# instance doorway check reads (js/warbands.js `fitsRoom`). tests/round27-warcamps.spec.js measures
# the real built body against these.
BODY = {'goblin': (1.35, 0.8), 'orc': (1.95, 1.0), 'beast': (1.95, 1.0), 'undead': (1.85, 0.8), 'giant': (2.35, 1.1)}

# one standard-bearer per warband: the melee body, a helm, a polearm and the warband's banner
BEARER = {
 'sootwick':  dict(name='Sootwick Flag-Runner',    minLevel=4,  hat=('bone_headdress', '#c8a040'), held=('fh_spear', '#8a8a8a')),
 'ashtusk':   dict(name='Ashtusk Standard-Bearer', minLevel=8,  hat=('bone_headdress', '#e0d8c0'), held=('fh_halberd', '#8a8e94')),
 'thornmane': dict(name='Thornmane Totem-Bearer',  minLevel=12, hat=('bone_headdress', '#eeeeee'), held=('fh_spear', '#a8b0b8')),
 'unburied':  dict(name='Unburied Colour-Sergeant',minLevel=17, hat=('war_helm', '#5a5e64'), held=('fh_halberd', '#9aa4b0')),
 'stonehide': dict(name='Stonehide Stone-Herald',  minLevel=23, hat=('war_helm', '#6a7a8a'), held=('fh_spear', '#b8c8d8')),
}
for band in W:
    b = BEARER[band['id']]
    melee = next(m for m in band['members'] if m['type'] == 'melee')
    leader = next(m for m in band['members'] if m['type'] == 'leader')
    look = json.loads(json.dumps(melee['look']))
    look['hat'] = {'id': b['hat'][0], 'color': b['hat'][1]}
    look['held'] = {'id': b['held'][0], 'color': b['held'][1]}
    look.pop('offhand', None)
    look['cape'] = {'id': 'cape', 'color': band['colour']}
    bid = band['id'] + '_bearer'
    band['members'].append(dict(type='bearer', id=bid, name=b['name'], minLevel=b['minLevel'], maxLevel=band['levels'][1],
        look=look, banner=band['colour'], dropBases=list(leader['dropBases'][:4])))
    leader['bearer'] = bid
    band['bearer'] = bid

# the warlords: one named boss per warband, of its race, with phases and adds of its own members
WARLORD = {
 'sootwick':  dict(id='sootwick_gutterking', name='Sootwick Gutterking', levels=[6,16], scale=1.6, hat=('war_helm', '#c8a040'),
   phases=[(0.6, 'fleet', 'The Gutterking whistles through his teeth, and the gang comes running.'), (0.3, 'vicious', 'He stops grinning.')],
   spawns=('sootwick_basher', 2, [0.6, 0.3]), camp='Junkyard', walls='junk wall'),
 'ashtusk':   dict(id='ashtusk_overchief', name='Ashtusk Overchief', levels=[12,24], scale=1.9, hat=('bone_headdress', '#e0d8c0'),
   phases=[(0.5, 'frenzied', 'The Overchief roars, and the brutes come to it.'), (0.25, 'vicious', 'Blood in its tusks now. It will not stop.')],
   spawns=('ashtusk_brute', 2, [0.5, 0.25]), camp='Warcamp', walls='palisade and bone totems'),
 'thornmane': dict(id='thornmane_greatfang', name='Thornmane Greatfang', levels=[16,28], scale=1.9, hat=('wolf_helm', '#eeeeee'),
   phases=[(0.66, 'fleet', 'The Greatfang howls, and the ring answers.'), (0.33, 'vicious', 'It drops to all fours.')],
   spawns=('thornmane_mauler', 2, [0.66, 0.33]), camp='Den-Ring', walls='thorn ring and hide tents'),
 'unburied':  dict(id='unburied_gravemarshal', name='Unburied Gravemarshal', levels=[22,36], scale=2.0, hat=('plate_helm', '#6a7078'),
   phases=[(0.7, 'ironclad', 'The Gravemarshal raises its blade, and the ranks close.'), (0.4, 'leeching', 'It begins to drink the fight.'), (0.15, 'unyielding', 'It will not lie down.')],
   spawns=('unburied_bonesoldier', 2, [0.7, 0.4]), camp='Barrow-Fort', walls='barrow-fort'),
 'stonehide': dict(id='stonehide_peakking', name='Stonehide Peak-King', levels=[30,50], scale=1.7, hat=('great_helm', '#8a9aaa'),
   phases=[(0.6, 'unyielding', 'The Peak-King plants its feet like a mountain.'), (0.3, 'vicious', 'Stone cracks under it. It is done being patient.')],
   spawns=('stonehide_smasher', 2, [0.6, 0.3]), camp='Slab-Hold', walls='standing-slab ring'),
}
UNIQUE = {'sootwick': 'fh_gutterkings_shiv', 'ashtusk': 'fh_ashtusk_headtaker', 'thornmane': 'fh_moonhook',
          'unburied': 'fh_gravemarshals_oath', 'stonehide': 'fh_peakbreaker'}

def warlord_row(band, mods):
    w = WARLORD[band['id']]
    leader = next(m for m in band['members'] if m['type'] == 'leader')
    look = json.loads(json.dumps(leader['look']))
    look['hat'] = {'id': w['hat'][0], 'color': w['hat'][1]}
    look['cape'] = {'id': 'cape', 'color': band['colour']}
    L = w['levels'][0]
    h, wd = BODY[band['race']]
    drops = []
    for m in band['members']:
        for d in m['dropBases']:
            if d not in drops: drops.append(d)
    return dict(
        id=w['id'], name=w['name'], kind='humanoid', family=band['family'], role='boss', warband=band['id'], warlord=True,
        nameRace=band.get('nameRace') or band['race'], biomes=['any'], minLevel=w['levels'][0], maxLevel=w['levels'][1],
        arena=16, scale=w['scale'], bodyHeight=h, bodyWidth=wd,
        hp=round(640 * (1 + 0.05*(L-1)) * mods.get('hp',1)),
        dmg=[round(v * (1 + 0.04*(L-1)) * mods.get('dmg',1)) for v in (18, 27)],
        armor=round(16 * (1 + 0.04*(L-1)) * mods.get('armor',1)),
        speed=round(3.4 * mods.get('speed',1), 2), reach=round(3.2 + mods.get('reach',0), 2),
        aggroRange=46, attackEvery=1.7,
        xp=round(520 * (1 + 0.08*(L-1))), gold=round(320 * (1 + 0.05*(L-1))),
        dropBonus=3, dropRarity=2.0,
        phases=[dict(at=a, modifier=mo, say=say) for a, mo, say in w['phases']],
        spawns=dict(id=w['spawns'][0], count=w['spawns'][1], at=w['spawns'][2]),
        leads=list(leader['leads']), bearer=band['id'] + '_bearer',
        uniqueDrop=UNIQUE[band['id']],
        look={'avatar': look}, dropBases=drops,
    )

# ---------------------------------------------------------------- stats
def stats(band, m):
    t = TPL[m['type']]
    mods = band['mods']
    L = m['minLevel']
    hpk = (1 + 0.09*(L-1)) * mods.get('hp',1)
    dk = (1 + 0.06*(L-1)) * mods.get('dmg',1)
    d = dict(id=m['id'], name=m['name'], kind='humanoid', family=band['family'], role=t['role'], type=m['type'],
             warband=band['id'], biomes=['any'], minLevel=m['minLevel'], maxLevel=m['maxLevel'], pack=t['pack'])
    if 'leads' in m: d['leads'] = m['leads']
    if 'bearer' in m: d['bearer'] = m['bearer']        # R27 M10 — the leader's standard-bearer
    if 'banner' in m: d['banner'] = m['banner']        # R27 M10 — the bearer carries the colours
    d['hp'] = round(t['hp']*hpk)
    d['dmg'] = [round(v*dk) for v in t['dmg']]
    d['armor'] = round(t['armor']*(1+0.07*(L-1))*mods.get('armor',1))
    d['speed'] = round(t['speed']*mods.get('speed',1), 2)
    d['reach'] = round(t['reach'] + mods.get('reach',0), 2)
    d['aggroRange'] = t['aggroRange']
    d['attackEvery'] = t['attackEvery']
    d['xp'] = round(t['xp']*(1+0.08*(L-1)))
    d['gold'] = round(t['gold']*(1+0.05*(L-1)))
    onHit = m.get('onHit', t.get('onHit'))
    if onHit: d['onHit'] = onHit
    if 'ranged' in m: d['ranged'] = m['ranged']
    if 'glow' in m: d['glow'] = m['glow']
    d['look'] = {'avatar': m['look']}
    d['dropBases'] = m['dropBases']
    return d

out = {
 '_doc': "Farhold R26 — the enemy WARBANDS: the five Chibi 2 races a player cannot be (avatar-3d/js/chibi2-races.js), each an enemy faction of humanoid NPCs drawn as that race's body (`look.avatar.body.race`). js/warbands.js injects every member into the bestiary at load (data/enemies.json is untouched) and gives each zone at most one warband: a zone is HELD when its middle level sits inside the warband's `levels` and a seeded roll under `claimShare` says so (the starting zone is never held). Inside a held zone that warband's members make up `spawnShare` of what the spawner puts down; outside it they never spawn. `type` is the job in the fight (melee / rogue / ranged / caster / leader) and `role` is the existing AI it runs on (brute / skirmisher / archer / caster / leader) — a rogue is a skirmisher that is quick, light and makes you bleed. Stats are level-1 values like the bestiary's, compounded by balance.json enemies.perLevel. `prefers` lists World Forge biome families a warband is three times as likely to claim. `nameRace` is the Name Forge language a rare of theirs is named in. R27 M10: a sixth member, the standard-bearer (`type: bearer`, carries `banner` in the warband colour; the leader names it in `bearer`); leaders, bearers and warlords wear the round-26 class helms; `warlords` are five named bosses (installed into bestiary.bosses) with `phases`, `spawns` of their own members, `scale` 1.6-2.2 and `bodyHeight`/`bodyWidth` for the instance-door check; each warband row names its `warlord`, its `unique` (data/uniques.json), its `drops` (the war-chest's list) and its `camp`. Original names only.",
 'claimShare': 0.55,
 'spawnShare': 0.65,
 'warbands': [],
 # R27 M10 — one named boss per warband (js/warbands.js installWarbands puts them in bestiary.bosses)
 'warlords': [],
}
for band in W:
    members = band['members']
    mods = band.pop('mods')
    wl = warlord_row(band, mods)                       # R27 M10 — reads the members' looks and drops
    band.pop('members')
    band['members'] = [m['id'] for m in members]
    band['defs'] = [stats({**band, 'mods': mods}, m) for m in members]
    # R27 M10 — the warband's place, face and loot
    band['warlord'] = wl['id']
    band['unique'] = UNIQUE[band['id']]
    band['drops'] = wl['dropBases']
    band['camp'] = dict(name=WARLORD[band['id']]['camp'], walls=WARLORD[band['id']]['walls'], kind='warcamp_' + band['id'])
    out['warlords'].append(wl)
    out['warbands'].append(band)
json.dump(out, open(OUT,'w'), indent=1)
print('ok', sum(len(b['defs']) for b in out['warbands']), 'members,', len(out['warlords']), 'warlords')
