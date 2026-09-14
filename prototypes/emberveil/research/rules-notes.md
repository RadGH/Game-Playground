# Emberveil rules (condensed from src/game/formulas.js, balance.active.json, passives.js, xp.js, _aiTargeting.js, combatEnemyAI.js, _damagePipeline.js)

## Progression
- xpTable (cumulative, level L needs xpTable[L-1]): [0,120,320,600,960,1400,1920,2520,3200,3960,4800,5720,6720,7800,8960,10200,11520,12920,14400,15960,17640,19440,21360,23400,25560,27840,30240,32760,35400,38160]; maxLevel 30
- per level: +2 attribute points; talent point at levels 3,8,13,18,23,28; passive point every 5 levels; full heal on level-up
- creation: STR/DEX/INT/CON all 8, +8 free points (+2 per level above 1). No per-class base stats.
- hire cost = round(100*level*(1+0.10*(level-1))); party cap 4 heroes + companions separate
- catch-up xp mult = min(3, 1+0.5*(partyAvg-memberLvl)); xp global ×3, gold ×1.2

## Derived stats
maxHp = 50 + CON*10 (+passive/affix hp); maxMp = 30 + INT*8; hit = min(95, 70 + round(DEX*1.2)); dodge hero = min(40, 5 + round(DEX*0.8)), companion = min(15, 3+round(DEX*0.35)); initiative = DEX + level (+affix); crit% = min(75, 5 + passive + affix*100); critDmg = 1.5 + affix; spellPower = INT*0.025 (+affix); manaRegen/round = max(1, round(INT*0.3)) (+affix); armor = sum(item.armor); equipDmgBonus = sum(floor(avg(weapon dmg)*0.3))
Basic attack: primary = light?DEX : magic?INT : STR; spellBonus = magic ? floor(INT*0.25) : 0; min = max(1, round(primary*0.4 + equipBonus)) + spellBonus; max = max(3, round(primary + equipBonus*1.5)) + spellBonus
Skill dmg: weaponMid = mid(weapon dmg) ([1,2] fallback); powerBonus = magic ? INT*0.025+affixSP : round(STR*1.5)*0.05; mult = damageMult*0.95*(magic?0.78:1); base = round(mult*weaponMid*(1+powerBonus)) + (nonSpell ? round(weaponMid*0.1) : 0)
Heal = max(healAmount, round(healMult*weaponMid*(1+spellPower)))
Multi-target falloff by target count: 1→1.0, 2→0.8, 3→0.6, 4+→0.5
Hit roll: raw = hit - dodge; >95 soft cap 95+(raw-95)*0.2; clamp [5, 100-minMissFloor(3, elite 4, boss 6)]; blind ×0.5; dazed -25
Mitigation: physical: block (hero: dmg-blockPower; enemy ×0.5 on block) → armor DR = min(0.95, armor/(armor+100)) → resistAll% ; magic uses magicResist same curve; armorPen% then flat. Then dmgReduct buff, marked ×1.3, barrier pools, HP. Crit ×(1.5+critDmg affix). dmgBuff ×(1+buff).
Attack speed extra actions: fast +1, very_fast +2.
Statuses: bleed/poison/burn DoT max(1,power) per round (default power max(3, floor(INT*0.15))); stun skip turn (immunity 2+ rounds after); freeze 1 round; sleep skip, any damage wakes; confused 50% skip; dazed hit-25; blind hit×0.5; slow initiative×0.5; marked ×1.3 dmg taken; barrier absorb; regen heal; sunder armor -5 for 3 rounds; curse enemy dmg ×(1-pow/100); silence blocks mpCost>0 skills.

## Enemy scaling
global ×{hp .58, dmg .30, armor .85}; act mult {0:{.50,.75},1:{.85,.92},2:{1.15,1.10},3:{1.85,1.30},4:{2.15,1.45},5:{2.45,1.60},6:{2.60,1.65}}; boss hp damped 1+(m-1)*0.35; party-size enemy dmg mult {1:.40,2:.65,3:.85,4:1}; NG+ hp 4.5^ng, dmg 2.5^ng.
Rewards: gold = round(rand(gold)*(1+goldFind)*1.2); xp = round(xpValue*(1+xpFind)*3). Champions 5%: +50% hp +30% dmg, 1-2 modifiers.

## Passives (5 nodes per class, maxRank 3, +1 point per 5 levels)
nodes: toughness maxHp10 · devotion maxHp10 · mana_pool maxMp10 · regrowth hpRegen1 · mana_flow mpRegen1 · wisdom hp5+mp5 · iron_wall block5% · thorns reflect8% · resistance resistAll3% · aegis block3%+hp5 · vampirism lifesteal5% · killing_blow hpOnKill10 · soul_harvest mpOnKill8 · igniting burnOnHit15% · venomous poisonOnCrit25% · stormcharged chain50%dmg 10% · fleetfoot dodge4 · deadly_aim crit3 · assassin crit2+poisonOnCrit15%
trees: warrior toughness,iron_wall,thorns,vampirism,killing_blow · paladin devotion,iron_wall,resistance,thorns,killing_blow · ranger regrowth,fleetfoot,deadly_aim,stormcharged,killing_blow · rogue wisdom,fleetfoot,assassin,vampirism,venomous · cleric devotion,mana_pool,mana_flow,aegis,soul_harvest · bard mana_flow,wisdom,fleetfoot,vampirism,soul_harvest · mage mana_pool,mana_flow,igniting,stormcharged,soul_harvest · necromancer mana_pool,mana_flow,soul_harvest,vampirism,venomous · warlock mana_pool,soul_harvest,igniting,vampirism,thorns · demon_hunter fleetfoot,deadly_aim,vampirism,assassin,killing_blow · scavenger regrowth,fleetfoot,killing_blow,soul_harvest,vampirism · swashbuckler wisdom,fleetfoot,deadly_aim,venomous,vampirism · dragon_knight toughness,iron_wall,resistance,igniting,killing_blow · pyromancer mana_pool,mana_flow,igniting,vampirism,soul_harvest · stormcaller mana_pool,mana_flow,stormcharged,deadly_aim,soul_harvest · druid regrowth,mana_flow,thorns,resistance,venomous · oracle mana_pool,mana_flow,wisdom,resistance,soul_harvest · tactician wisdom,mana_flow,deadly_aim,aegis,killing_blow · chronomancer mana_pool,mana_flow,wisdom,stormcharged,resistance · tinker mana_pool,mana_flow,deadly_aim,igniting,vampirism · fallback toughness,regrowth,vampirism,fleetfoot,soul_harvest

## Talents/upgrades (skills.json): talents bought with talent points, merge additively; upgrades free at level, replace numbers. Default cooldown 2 rounds when absent. Toplevel keys: aoe,damageMult,damageStat,mpCost,statusEffects,healMult,healStat,cooldown,target,type.
AoE: single | adjacent (group first 2) | adjacent2/group2 (group first 4) | group (whole group) | row/row2/all (every enemy) | chain/chain3 (primary + chainTargets-1) | random3/random4 | multi3/multi4 (N rolls on primary) | pierce_row | single_overflow.

## Class unlocks: starters warrior,fighter,ranger,rogue,mage. act1: paladin,cleric,knight,shaman,tinker,priest; act2: necromancer,bard,druid,witch_hunter,shadow_dancer,enchanter; act3: demon_hunter,tactician; act4: chronomancer; win: oracle; level10 monk, 15 sorcerer, 20 stormcaller; kill_50 pyromancer; low_hp_boss warlock; dragon boss dragon_knight; gold1000 swashbuckler; rareItems 10 scavenger, 5 runesmith. (Prototype: all unlocked by default, with the original rule shown.)

## AI
Hero: revive if fallen ally & revive skill → healer & ally ≤40% → ally <25% → healer & ally <65% heal → healer & wounded & shield buff → highest damageMult*hits*expectedTargets skill → any buff → basic attack. Healers: cleric, druid, priest, oracle, paladin, bard, shaman. Prefer awake targets.
Enemy: healer role heals ally <60%; spell if rand<spellChance; targeting: taunted hero > taunting > companions first then heroes in party order.
Turn order each round: initiative + rand*10 (slow ×0.5). Round cap 50. Flee DC = clamp(12 + avgEnemyLvl - partyAvg, 8, 28) vs bestDEX + d20.
Out-of-combat auto-revive at 50% hp if any survivor has a revive skill.

## The original's real-time weapon layer is gone from this rebuild (round 20). Nothing in the data, the rewards, the balance file or the UI refers to it any more: the four road events that used to hand one out now roll a real item (`buildLoot`), and `tools/build-emberveil-data.mjs` strips it again on every rebuild.
