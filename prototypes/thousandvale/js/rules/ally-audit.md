# Ally-targeting audit (generated — tests/C/ally-audit.test.mjs)

Every skill, each talent node on its own, each druid-shape skill and each song finale, cast with the Tab target on a
hurt, poisoned party member 2.5 m away. **Reaches the ally** = what the plan promises a friend, all of which was
checked to land on that ally (and on nobody outside the party, and on nobody 120 m away). A row with nothing in it
is a skill that does nothing for friends (damage, control, personal buffs).

2301 casts, 548 of them do something for an ally.

| Cast | Reaches the ally |
|---|---|
| warrior/cleave | — |
| warrior/breaching_shove | — |
| warrior/warcry | — |
| warrior/warcry +rousing_cry | status |
| warrior/whirlwind | — |
| warrior/iron_resolve | — |
| warrior/groundbreaker | — |
| fighter/power_strike | — |
| fighter/riposte | — |
| fighter/riposte +last_parry | ward |
| fighter/duelist_stance | — |
| fighter/lunge | — |
| fighter/sweeping_guard | — |
| fighter/sweeping_guard +covering_sweep | barrier |
| fighter/masters_flurry | — |
| paladin/sanctified_blade | — |
| paladin/consecrate | heal |
| paladin/consecrate +moving_light | heal |
| paladin/consecrate +holy_bounds | heal |
| paladin/consecrate +wide | heal |
| paladin/consecrate +scorching_earth | heal |
| paladin/consecrate +blessed_stone | heal |
| paladin/consecrate +deepen | heal |
| paladin/consecrate +unwelcome | heal |
| paladin/consecrate +second_blessing | heal |
| paladin/consecrate +bulwark | heal |
| paladin/consecrate +cathedral | heal |
| paladin/consecrate +twin_ground | heal |
| paladin/consecrate +aegis | heal |
| paladin/oath_hammer | — |
| paladin/oath_hammer +warding_throw | barrier |
| paladin/martyrs_vow | barrier |
| paladin/martyrs_vow +lesser_vow | barrier |
| paladin/martyrs_vow +vow_of_thorns | barrier |
| paladin/martyrs_vow +answering_oath | barrier |
| paladin/martyrs_vow +cleansing_vow | barrier, cleanse |
| paladin/martyrs_vow +deepen | barrier |
| paladin/martyrs_vow +taunting_vow | barrier |
| paladin/martyrs_vow +shared_strength | barrier, heal |
| paladin/martyrs_vow +hunger | barrier |
| paladin/martyrs_vow +undying_vow | barrier |
| paladin/martyrs_vow +martyrs_ward | barrier, ward |
| paladin/shining_rebuke | — |
| paladin/daybreak_descent | heal |
| paladin/daybreak_descent +long_fall | heal |
| paladin/daybreak_descent +guarded_fall | heal |
| paladin/daybreak_descent +quick | heal |
| paladin/daybreak_descent +close_ranks | heal |
| paladin/daybreak_descent +morning_shield | barrier, heal |
| paladin/daybreak_descent +burst | heal |
| paladin/daybreak_descent +lift | heal |
| paladin/daybreak_descent +cleansing_dawn | cleanse, heal |
| paladin/daybreak_descent +hunger | heal |
| paladin/daybreak_descent +twin_descent | heal |
| paladin/daybreak_descent +morning_ring | heal |
| paladin/daybreak_descent +aegis | heal |
| ranger/aimed_shot | — |
| ranger/hunters_snare | — |
| ranger/multi_shot | — |
| ranger/quarry_call | — |
| ranger/quarry_call +blood_scent | heal |
| ranger/trackers_leap | — |
| ranger/rain_of_arrows | — |
| ranger/rain_of_arrows +covering_storm | status |
| rogue/eviscerate | — |
| rogue/poison_dart | — |
| rogue/sucker_punch | — |
| rogue/grave_mark | — |
| rogue/slip_away | — |
| rogue/slip_away +clean_break | cleanse |
| rogue/knife_storm | — |
| cleric/mend | heal |
| cleric/mend +quick_mend | heal |
| cleric/mend +purifying_mend | cleanse, heal |
| cleric/mend +quick | heal |
| cleric/mend +lingering_mend | heal, status |
| cleric/mend +mend_burst | heal |
| cleric/mend +deepen | heal |
| cleric/mend +steadying_hand | heal, status |
| cleric/mend +answered_call | heal |
| cleric/mend +echo | heal |
| cleric/mend +second_mend | heal |
| cleric/mend +emboldened | heal |
| cleric/mend +wellspring | heal |
| cleric/sunlance | — |
| cleric/sanctuary | heal |
| cleric/sanctuary +moving_sanctuary | heal |
| cleric/sanctuary +small_mercy | heal |
| cleric/sanctuary +wide | heal |
| cleric/sanctuary +searing_ground | heal |
| cleric/sanctuary +hushed_ground | heal |
| cleric/sanctuary +deepen | heal |
| cleric/sanctuary +shelter | heal |
| cleric/sanctuary +sanctified_rest | heal, revive |
| cleric/sanctuary +bulwark | heal |
| cleric/sanctuary +warding_light | barrier, heal |
| cleric/sanctuary +twin_sanctuary | heal |
| cleric/sanctuary +aegis | heal |
| cleric/guardian_light | — |
| cleric/guardian_light +clearing_light | cleanse |
| cleric/raise_the_fallen | heal, revive, status |
| cleric/raise_the_fallen +swift_return | heal, revive, status |
| cleric/raise_the_fallen +rising_ward | barrier, heal, revive, status |
| cleric/raise_the_fallen +quick | heal, revive, status |
| cleric/raise_the_fallen +raised_in_wrath | heal, revive, status |
| cleric/raise_the_fallen +shared_breath | heal, revive, status |
| cleric/raise_the_fallen +deepen | heal, revive, status |
| cleric/raise_the_fallen +cleansing_rise | cleanse, heal, revive, status |
| cleric/raise_the_fallen +pulse_of_return | heal, revive, status |
| cleric/raise_the_fallen +hunger | heal, revive, status |
| cleric/raise_the_fallen +undying_company | heal, revive, status |
| cleric/raise_the_fallen +grace_given | heal, revive, status |
| cleric/raise_the_fallen +wellspring | heal, revive, status |
| cleric/judgement | heal |
| cleric/judgement +wide_light | heal |
| cleric/judgement +shackling_light | heal |
| cleric/judgement +wide | heal |
| cleric/judgement +weighed | heal |
| cleric/judgement +lingering_dawn | heal |
| cleric/judgement +deepen | heal |
| cleric/judgement +three_columns | heal |
| cleric/judgement +sentence_passed | heal |
| cleric/judgement +hunger | heal |
| cleric/judgement +last_sentence | heal |
| cleric/judgement +standing_light | heal |
| cleric/judgement +conflagration | heal |
| bard/discord_note | — |
| bard/ballad_of_valour | — |
| bard/ballad_of_valour (finale) | status |
| bard/ballad_of_valour +marching_verse (finale) | status |
| bard/ballad_of_valour +rousing_verse (finale) | status |
| bard/ballad_of_valour +steel_chorus (finale) | status |
| bard/ballad_of_valour +steady_breath (finale) | status |
| bard/ballad_of_valour +encore (finale) | status |
| bard/ballad_of_valour +champions_verse (finale) | status |
| bard/ballad_of_valour +unbroken_march (finale) | status |
| bard/ballad_of_valour +double_time (finale) | status |
| bard/song_of_ruin | — |
| bard/air_of_mending | — |
| bard/air_of_mending (finale) | cleanse, heal |
| bard/air_of_mending +close_harmony (finale) | cleanse, heal |
| bard/air_of_mending +carrying_tune (finale) | cleanse, heal |
| bard/air_of_mending +soothing_finale (finale) | cleanse, heal |
| bard/air_of_mending +steady_voice (finale) | cleanse, heal |
| bard/air_of_mending +restful_verse (finale) | cleanse, heal |
| bard/air_of_mending +calm_breath (finale) | cleanse, heal |
| bard/air_of_mending +tending_hands | cleanse |
| bard/air_of_mending +tending_hands (finale) | cleanse, heal |
| bard/air_of_mending +warm_air (finale) | cleanse, heal |
| bard/quickstep_jig | — |
| bard/grand_finale | — |
| bard/grand_finale +standing_ovation | heal |
| bard/grand_finale +opus | heal |
| mage/frost_shard | — |
| mage/frost_nova | — |
| mage/frost_nova +rime_coat | barrier |
| mage/ice_lance | — |
| mage/spellrush | — |
| mage/spellrush +arcane_mantle | barrier |
| mage/spellrush +spell_ward | ward |
| mage/blizzard | — |
| mage/stillfrost | — |
| necromancer/marrow_lance | — |
| necromancer/raise_thrall | — |
| necromancer/raise_thrall +shared_grave | heal |
| necromancer/raise_thrall +second_rising | revive |
| necromancer/raise_thrall +undying_ranks | barrier |
| necromancer/corpse_pyre | — |
| necromancer/drain | heal |
| necromancer/drain +wide_draught | heal |
| necromancer/drain +long_draught | heal |
| necromancer/drain +pierce | heal |
| necromancer/drain +rot_draught | heal |
| necromancer/drain +mana_draught | heal |
| necromancer/drain +drain | heal |
| necromancer/drain +feast | heal |
| necromancer/drain +shared_cup | heal |
| necromancer/drain +bulwark | heal |
| necromancer/drain +unending | heal |
| necromancer/drain +soul_cup | heal |
| necromancer/drain +wellspring | heal |
| necromancer/toxic_cloud | — |
| necromancer/buried_march | — |
| necromancer/buried_march +army_commander | status |
| necromancer/buried_march +grave_tide | revive |
| warlock/gnawing_dark | — |
| warlock/bind_imp | — |
| warlock/bind_imp +fiend_returns | revive |
| warlock/curse | — |
| warlock/soul_pact | — |
| warlock/void_rift | — |
| warlock/abyss_gate | — |
| demon_hunter/hex_bolt | — |
| demon_hunter/tumbling_shot | — |
| demon_hunter/chain_hook | — |
| demon_hunter/unleash_hound | revive |
| demon_hunter/unleash_hound +pack_of_one | revive |
| demon_hunter/unleash_hound +guardian_hound | revive |
| demon_hunter/unleash_hound +quick | revive |
| demon_hunter/unleash_hound +blooded_hound | revive, status |
| demon_hunter/unleash_hound +shared_hide | barrier, revive |
| demon_hunter/unleash_hound +deepen | revive |
| demon_hunter/unleash_hound +blood_bond | link, revive |
| demon_hunter/unleash_hound +shared_kill | revive |
| demon_hunter/unleash_hound +hunger | revive |
| demon_hunter/unleash_hound +alpha_hide | revive, status |
| demon_hunter/unleash_hound +night_bond | revive |
| demon_hunter/unleash_hound +aegis | revive |
| demon_hunter/grudge_bolt | — |
| demon_hunter/night_hunt | — |
| demon_hunter/night_hunt +pack_returns | revive |
| scavenger/lucky_strike | — |
| scavenger/junk_toss | — |
| scavenger/scrounge | heal |
| scavenger/scrounge +keen_eye | heal |
| scavenger/scrounge +light_pockets | heal |
| scavenger/scrounge +sharing | heal |
| scavenger/scrounge +spare_bandage | cleanse, heal |
| scavenger/scrounge +deepen | heal |
| scavenger/scrounge +stocked | barrier, heal |
| scavenger/scrounge +pack_rat | heal |
| scavenger/scrounge +hunger | heal |
| scavenger/scrounge +second_wind | heal |
| scavenger/scrounge +never_wasted | heal |
| scavenger/scrounge +wellspring | heal |
| scavenger/caltrop_scatter | — |
| scavenger/pitch_bomb | — |
| scavenger/big_score | — |
| swashbuckler/flourish | — |
| swashbuckler/daring_leap | — |
| swashbuckler/mocking_parry | — |
| swashbuckler/mocking_parry +crowd_pleaser | status |
| swashbuckler/pinning_thrust | — |
| swashbuckler/matadors_turn | — |
| swashbuckler/grandeur | — |
| swashbuckler/grandeur +spotlight | status |
| dragon_knight/scale_rend | — |
| dragon_knight/flamethrower | — |
| dragon_knight/wyrmfall | — |
| dragon_knight/wyrm_temper | — |
| dragon_knight/wyrm_temper +hearth_scales | heal |
| dragon_knight/dragonscale | barrier |
| dragon_knight/dragonscale +thick_scales | barrier |
| dragon_knight/dragonscale +wing_buffet | barrier |
| dragon_knight/dragonscale +quick | barrier |
| dragon_knight/dragonscale +hoard_heat | barrier |
| dragon_knight/dragonscale +scale_shards | barrier |
| dragon_knight/dragonscale +deepen | barrier |
| dragon_knight/dragonscale +dragon_hide | barrier |
| dragon_knight/dragonscale +covering_wing | barrier |
| dragon_knight/dragonscale +impervious | barrier |
| dragon_knight/dragonscale +scales_wrath | barrier |
| dragon_knight/wyrm_ascendant | — |
| dragon_knight/wyrm_ascendant +scale_mantle | barrier |
| pyromancer/firebolt | — |
| pyromancer/fire_wall | — |
| pyromancer/ember_stride | — |
| pyromancer/ember_stride +fire_ward | ward |
| pyromancer/stoke_familiar | revive, status |
| pyromancer/stoke_familiar +bonfire | revive, status |
| pyromancer/stoke_familiar +clean_flame | cleanse, revive, status |
| pyromancer/stoke_familiar +quick | revive, status |
| pyromancer/stoke_familiar +feeding_flame | heal, revive, status |
| pyromancer/stoke_familiar +quick_kindling | revive, status |
| pyromancer/stoke_familiar +overheat | revive, status |
| pyromancer/stoke_familiar +fireguard | revive, status, ward |
| pyromancer/stoke_familiar +great_flame | revive, status |
| pyromancer/stoke_familiar +shared_blaze | revive, status |
| pyromancer/flashover | — |
| pyromancer/meteor | — |
| stormcaller/chain_bolt | — |
| stormcaller/thunderclap | — |
| stormcaller/storm_beam | — |
| stormcaller/storm_orbs | — |
| stormcaller/storm_orbs +shield_orbs | ward |
| stormcaller/bolt_step | — |
| stormcaller/tempest_eye | — |
| druid/thornlash | — |
| druid/thornlash +seedling | heal |
| druid/renew | status |
| druid/renew +blooming | heal, status |
| druid/renew +cleansing_sap | cleanse, status |
| druid/renew +quick | status |
| druid/renew +overgrowth | barrier, status |
| druid/renew +grafting | heal, status |
| druid/renew +deepen | status |
| druid/renew +heartwood | status |
| druid/renew +lifeblood | status |
| druid/renew +echo | status |
| druid/renew +second_flush | status |
| druid/renew +wild_sap | status, ward |
| druid/renew +wellspring | status |
| druid/briarback_shape | — |
| druid/renew @briarback | barrier |
| druid/call_wolf @briarback | status |
| druid/call_wolf | — |
| druid/call_wolf +thorny_pelts | status |
| druid/call_wolf +pack_mend | heal |
| druid/call_wolf +den_scent | status |
| druid/call_wolf +pack_bond | link |
| druid/call_wolf +alphas_call | revive |
| druid/call_wolf +wild_pack | status |
| druid/fenrunner_shape | — |
| druid/renew @fenrunner | cleanse, heal |
| druid/sporecap_shape | heal |
| druid/renew @sporecap | heal |
| druid/sporecap_shape +creeping_cap | heal |
| druid/sporecap_shape +deep_mycelium | heal |
| druid/sporecap_shape +thick_spores | heal |
| druid/sporecap_shape +rot_bloom | heal |
| druid/sporecap_shape +grove_wolves | heal |
| druid/sporecap_shape +spore_mana | heal |
| druid/sporecap_shape +final_bloom | heal |
| druid/sporecap_shape +fairy_ring | heal |
| oracle/omen_bolt | — |
| oracle/foresight | ward |
| oracle/foresight +twofold_sight | ward |
| oracle/foresight +clear_eyes | cleanse, ward |
| oracle/foresight +quick | ward |
| oracle/foresight +warning_pulse | ward |
| oracle/foresight +seers_barrier | barrier, ward |
| oracle/foresight +deepen | ward |
| oracle/foresight +calm_mind | ward |
| oracle/foresight +fated_strike | ward |
| oracle/foresight +echo | ward |
| oracle/foresight +perfect_foresight | status, ward |
| oracle/foresight +prophets_ward | ward |
| oracle/foresight +aegis | ward |
| oracle/prophecy | — |
| oracle/fate_thread | link, status |
| oracle/fate_thread +turned_thread | status |
| oracle/fate_thread +kindred_pace | link, status |
| oracle/fate_thread +quick | link, status |
| oracle/fate_thread +thin_thread | link, status |
| oracle/fate_thread +woven_mend | barrier, link, status |
| oracle/fate_thread +deepen | link, status |
| oracle/fate_thread +cut_the_thread | link, status |
| oracle/fate_thread +mirrored_pain | link, status |
| oracle/fate_thread +hunger | link, status |
| oracle/fate_thread +long_weave | link, status |
| oracle/fate_thread +lifeline | link, revive, status |
| oracle/fate_thread +aegis | link, status |
| oracle/turn_aside | — |
| oracle/turn_aside +warded_burst | ward |
| oracle/last_prophecy | status |
| oracle/last_prophecy +swift_end | status |
| oracle/last_prophecy +seers_calm | status |
| oracle/last_prophecy +stunning_vision | status |
| oracle/last_prophecy +all_paths | status, ward |
| oracle/last_prophecy +deepen | status |
| oracle/last_prophecy +fated_fall | status |
| oracle/last_prophecy +spoken_doom | status |
| oracle/last_prophecy +hunger | status |
| oracle/last_prophecy +ending_written | status |
| oracle/last_prophecy +retold | status |
| oracle/last_prophecy +crescendo | status |
| tactician/exploit_gap | — |
| tactician/rally | status |
| tactician/rally +hold_the_line | status |
| tactician/rally +second_breath | heal, status |
| tactician/rally +quick | status |
| tactician/rally +spirited_advance | status |
| tactician/rally +shield_wall | barrier, status |
| tactician/rally +deepen | status |
| tactician/rally +shared_line | link, status |
| tactician/rally +steady_ranks | cleanse, status |
| tactician/rally +echo | status |
| tactician/rally +standard | status |
| tactician/rally +undaunted | status |
| tactician/rally +wellspring | status |
| tactician/charge | — |
| tactician/reposition | — |
| tactician/reposition +out_of_danger | cleanse |
| tactician/seize_initiative | — |
| tactician/seize_initiative +tactical_ward | barrier |
| tactician/seize_initiative +change_of_plan | cleanse |
| tactician/seize_initiative +contingency | ward |
| tactician/battle_plan | status |
| tactician/battle_plan +opening_volley | status |
| tactician/battle_plan +supply_line | heal, status |
| tactician/battle_plan +quick | status |
| tactician/battle_plan +kill_box | status |
| tactician/battle_plan +screening_line | status |
| tactician/battle_plan +deepen | status |
| tactician/battle_plan +drill | status |
| tactician/battle_plan +flank_order | status |
| tactician/battle_plan +hunger | status |
| tactician/battle_plan +decisive_blow | status |
| tactician/battle_plan +last_order | status |
| tactician/battle_plan +conflagration | status |
| chronomancer/second_hand | — |
| chronomancer/quicken | status |
| chronomancer/quicken +brief_hour | status |
| chronomancer/quicken +slipstream | status |
| chronomancer/quicken +quick | status |
| chronomancer/quicken +temporal_ward | barrier, status |
| chronomancer/quicken +hour_of_need | cleanse, status |
| chronomancer/quicken +deepen | status |
| chronomancer/quicken +echo_of_you | status |
| chronomancer/quicken +overclock | status |
| chronomancer/quicken +echo | status |
| chronomancer/quicken +accelerando | status |
| chronomancer/quicken +stolen_moments | status |
| chronomancer/quicken +crescendo | status |
| chronomancer/entropy_field | — |
| chronomancer/rewind | — |
| chronomancer/rewind +undone | cleanse |
| chronomancer/rewind +stitched_time | barrier |
| chronomancer/rewind +shared_rewind | heal |
| chronomancer/stasis_lock | — |
| chronomancer/stop_the_clock | — |
| chronomancer/stop_the_clock +stillness_ward | barrier |
| monk/open_palm | — |
| monk/wind_step | — |
| monk/sweeping_heel | — |
| monk/inner_stillness | heal |
| monk/inner_stillness +quick_stillness | heal |
| monk/inner_stillness +moving_meditation | heal |
| monk/inner_stillness +clear_mind | cleanse, heal |
| monk/inner_stillness +iron_body | heal |
| monk/inner_stillness +deepen | heal |
| monk/inner_stillness +calm_aura | heal |
| monk/inner_stillness +stored_breath | heal |
| monk/inner_stillness +echo | heal |
| monk/inner_stillness +empty_hand | heal |
| monk/inner_stillness +perfect_balance | heal |
| monk/inner_stillness +wellspring | heal |
| monk/mountain_fist | — |
| monk/ninefold_staff | — |
| shaman/spirit_bolt | — |
| shaman/mending_post | heal |
| shaman/mending_post +carried_post | heal |
| shaman/mending_post +clinging_roots | heal |
| shaman/mending_post +quick | heal |
| shaman/mending_post +cleansing_post | cleanse, heal |
| shaman/mending_post +stone_bark | barrier, heal |
| shaman/mending_post +deepen | heal |
| shaman/mending_post +spirit_lure | heal |
| shaman/mending_post +spirit_spark | heal |
| shaman/mending_post +hunger | heal |
| shaman/mending_post +long_post | heal |
| shaman/mending_post +quickening_post | heal, status |
| shaman/mending_post +wellspring | heal |
| shaman/storm_post | — |
| shaman/storm_post +storm_bond | status |
| shaman/call_spirit | — |
| shaman/call_spirit +spirit_hide | status |
| shaman/call_spirit +bonded_spirits | link |
| shaman/call_spirit +rewaking | revive |
| shaman/warding_spirits | ward |
| shaman/warding_spirits +five_charges | ward |
| shaman/warding_spirits +thorned_wards | ward |
| shaman/warding_spirits +quick | ward |
| shaman/warding_spirits +calming_spirits | cleanse, ward |
| shaman/warding_spirits +spirit_bloom | status, ward |
| shaman/warding_spirits +deepen | ward |
| shaman/warding_spirits +recall | ward |
| shaman/warding_spirits +spirit_shield | ward |
| shaman/warding_spirits +echo | ward |
| shaman/warding_spirits +ward_burst | ward |
| shaman/warding_spirits +ancestors_hold | status, ward |
| shaman/warding_spirits +aegis | ward |
| shaman/great_post | heal |
| shaman/great_post +short_rite | heal |
| shaman/great_post +elders_blessing | heal, status |
| shaman/great_post +thunder_totem | heal |
| shaman/great_post +warding_ground | heal |
| shaman/great_post +deepen | heal |
| shaman/great_post +bears_totem | heal, status |
| shaman/great_post +pulling_post | heal |
| shaman/great_post +hunger | heal |
| shaman/great_post +old_ones_rise | heal |
| shaman/great_post +final_thunder | heal |
| shaman/great_post +conflagration | heal |
| witch_hunter/pinning_shot | — |
| witch_hunter/silver_edge | cleanse |
| witch_hunter/silver_edge +circle_of_silver | cleanse |
| witch_hunter/silver_edge +silver_lunge | cleanse |
| witch_hunter/silver_edge +quick | cleanse |
| witch_hunter/silver_edge +hallowed_silver | cleanse |
| witch_hunter/silver_edge +ward_breaker | cleanse |
| witch_hunter/silver_edge +shatter | cleanse |
| witch_hunter/silver_edge +interrupting_cut | cleanse |
| witch_hunter/silver_edge +blessed_steel | cleanse |
| witch_hunter/silver_edge +hunger | cleanse |
| witch_hunter/silver_edge +witchbane | cleanse |
| witch_hunter/silver_edge +silver_storm | cleanse |
| witch_hunter/silver_edge +crescendo | cleanse |
| witch_hunter/null_circle | — |
| witch_hunter/null_circle +purifying_ground | heal |
| witch_hunter/null_circle +warding_salt | ward |
| witch_hunter/writ_of_guilt | — |
| witch_hunter/iron_net | — |
| witch_hunter/purging_rite | cleanse |
| witch_hunter/purging_rite +narrow_rite | cleanse |
| witch_hunter/purging_rite +sweeping_rite | cleanse |
| witch_hunter/purging_rite +wide | cleanse |
| witch_hunter/purging_rite +silver_fire | cleanse |
| witch_hunter/purging_rite +quiet_rite | cleanse |
| witch_hunter/purging_rite +shatter | cleanse |
| witch_hunter/purging_rite +punish_magic | cleanse |
| witch_hunter/purging_rite +stolen_power | cleanse |
| witch_hunter/purging_rite +hunger | cleanse |
| witch_hunter/purging_rite +hunters_due | cleanse |
| witch_hunter/purging_rite +second_rite | cleanse |
| witch_hunter/purging_rite +aegis | cleanse |
| knight/shield_bash | — |
| knight/shield_bash +warded_bash | barrier |
| knight/guard_stance | link |
| knight/guard_stance +moving_guard | link |
| knight/guard_stance +close_guard | link |
| knight/guard_stance +quick | link |
| knight/guard_stance +edged_shield | link |
| knight/guard_stance +shield_bearer | barrier, link |
| knight/guard_stance +deepen | link |
| knight/guard_stance +iron_will | link |
| knight/guard_stance +steadfast | link |
| knight/guard_stance +echo | link |
| knight/guard_stance +draw_fire | link |
| knight/guard_stance +guard_toss | link |
| knight/guard_stance +wellspring | link |
| knight/sworn_ward | link |
| knight/sworn_ward +oath_of_mending | heal, link |
| knight/sworn_ward +long_oath | link |
| knight/sworn_ward +answering_steel | link |
| knight/sworn_ward +oath_armour | link |
| knight/sworn_ward +deepen | link |
| knight/sworn_ward +to_your_side | link |
| knight/sworn_ward +oath_ward | link, ward |
| knight/sworn_ward +hunger | link |
| knight/sworn_ward +not_today | link, status |
| knight/sworn_ward +oath_retort | link |
| knight/sworn_ward +aegis | link |
| knight/challenge | — |
| knight/rampart | — |
| knight/rampart +holy_rampart | heal |
| knight/rampart +bastion | ward |
| knight/unbroken_banner | status |
| knight/unbroken_banner +short_stand | status |
| knight/unbroken_banner +colour_guard | cleanse, status |
| knight/unbroken_banner +war_colours | status |
| knight/unbroken_banner +gilded | heal, status |
| knight/unbroken_banner +deepen | status |
| knight/unbroken_banner +carried_banner | status |
| knight/unbroken_banner +stand_firm | status |
| knight/unbroken_banner +hunger | status |
| knight/unbroken_banner +victory | status |
| knight/unbroken_banner +two_banners | status |
| knight/unbroken_banner +aegis | status |
| sorcerer/wild_bolt | — |
| sorcerer/arcane_burst | — |
| sorcerer/mana_rend | — |
| sorcerer/mana_rend +spilled_power | barrier |
| sorcerer/overchannel | — |
| sorcerer/overchannel +blood_ward | barrier |
| sorcerer/transmute | — |
| sorcerer/sixfold_ruin | — |
| sorcerer/sixfold_ruin +ruin_ward | barrier |
| runesmith/rune_hammer | — |
| runesmith/sunder | — |
| runesmith/sunder +salvage | barrier |
| runesmith/stoneskin | — |
| runesmith/stoneskin +runed_ward | ward |
| runesmith/forge_flame | — |
| runesmith/forge_flame +shared_forge | status |
| runesmith/warding_glyph | status |
| runesmith/warding_glyph +moving_glyph | status |
| runesmith/warding_glyph +wide_glyph | status |
| runesmith/warding_glyph +wide | status |
| runesmith/warding_glyph +repelling_glyph | status |
| runesmith/warding_glyph +healing_glyph | heal, status |
| runesmith/warding_glyph +deepen | status |
| runesmith/warding_glyph +marking_glyph | status |
| runesmith/warding_glyph +shelter_glyph | status |
| runesmith/warding_glyph +bulwark | status |
| runesmith/warding_glyph +glyph_strike | status |
| runesmith/warding_glyph +twin_glyph | status |
| runesmith/warding_glyph +aegis | status |
| runesmith/great_anvil | — |
| runesmith/great_anvil +anvil_ward | status |
| shadow_dancer/shade_cut | — |
| shadow_dancer/shadowstep | — |
| shadow_dancer/smoke | status |
| shadow_dancer/smoke +thrown_shroud | status |
| shadow_dancer/smoke +thick_shroud | status |
| shadow_dancer/smoke +quick | status |
| shadow_dancer/smoke +choking_smoke | status |
| shadow_dancer/smoke +from_the_dark | status |
| shadow_dancer/smoke +deepen | status |
| shadow_dancer/smoke +lost_track | status |
| shadow_dancer/smoke +cloud_step | status |
| shadow_dancer/smoke +echo | status |
| shadow_dancer/smoke +twin_clouds | status |
| shadow_dancer/smoke +soothing_dark | heal, status |
| shadow_dancer/smoke +wellspring | status |
| shadow_dancer/cutting_waltz | — |
| shadow_dancer/execute | — |
| shadow_dancer/host_of_shades | — |
| shadow_dancer/host_of_shades +shadow_ward | ward |
| tinker/clockwork_bolt | — |
| tinker/flask_grenade | — |
| tinker/deploy_sentry | — |
| tinker/pocket_watch | heal, ward |
| tinker/pocket_watch +mainspring | heal, ward |
| tinker/pocket_watch +shared_watch | heal, ward |
| tinker/pocket_watch +quick | heal, ward |
| tinker/pocket_watch +gear_shield | barrier, heal |
| tinker/pocket_watch +cleaning_oil | cleanse, heal, ward |
| tinker/pocket_watch +deepen | heal, ward |
| tinker/pocket_watch +double_winding | heal, ward |
| tinker/pocket_watch +ticking_bomb | heal, ward |
| tinker/pocket_watch +echo | heal, ward |
| tinker/pocket_watch +perpetual | heal, ward |
| tinker/pocket_watch +overwind | heal, ward |
| tinker/pocket_watch +wellspring | heal, ward |
| tinker/grapple_line | — |
| tinker/grapple_line +grapple_guard | barrier |
| tinker/spring_battery | status |
| tinker/spring_battery +short_charge | status |
| tinker/spring_battery +arc_field | status |
| tinker/spring_battery +capacitor | status |
| tinker/spring_battery +insulated | status |
| tinker/spring_battery +deepen | status |
| tinker/spring_battery +live_wire | status |
| tinker/spring_battery +static_bank | barrier, status |
| tinker/spring_battery +hunger | status |
| tinker/spring_battery +burst_cell | status |
| tinker/spring_battery +wound_tight | status |
| tinker/spring_battery +crescendo | status |
| priest/shadow_lance | — |
| priest/dawn_prayer | heal |
| priest/dawn_prayer +wide_prayer | heal |
| priest/dawn_prayer +morning_hush | heal |
| priest/dawn_prayer +quick | heal |
| priest/dawn_prayer +lingering_prayer | heal |
| priest/dawn_prayer +searing_prayer | heal |
| priest/dawn_prayer +deepen | heal |
| priest/dawn_prayer +blessed_company | heal, status |
| priest/dawn_prayer +answered | heal |
| priest/dawn_prayer +echo | heal |
| priest/dawn_prayer +twice_said | heal |
| priest/dawn_prayer +undead_dawn | heal |
| priest/dawn_prayer +wellspring | heal |
| priest/mark_the_killer | — |
| priest/vigil | status |
| priest/vigil +night_watch | status |
| priest/vigil +vigil_light | heal, status |
| priest/vigil +quick | status |
| priest/vigil +steeled_watch | status |
| priest/vigil +answering_dark | status |
| priest/vigil +deepen | status |
| priest/vigil +killers_debt | status |
| priest/vigil +calm_before | cleanse, status |
| priest/vigil +hunger | status |
| priest/vigil +dawn_rising | status |
| priest/vigil +debt_of_light | barrier, status |
| priest/vigil +aegis | status |
| priest/dread_hymn | status |
| priest/dread_hymn +wide_hymn | status |
| priest/dread_hymn +cold_dread | status |
| priest/dread_hymn +wide | status |
| priest/dread_hymn +haunting | status |
| priest/dread_hymn +steadying_verse | heal, status |
| priest/dread_hymn +deepen | status |
| priest/dread_hymn +despair | status |
| priest/dread_hymn +dark_refrain | status |
| priest/dread_hymn +bulwark | status |
| priest/dread_hymn +two_verses | status |
| priest/dread_hymn +unhinged | status |
| priest/dread_hymn +aegis | status |
| priest/twinlight | heal |
| priest/twinlight +cleansing_dawn | cleanse, heal |
| priest/twinlight +dusk_ward | barrier, heal |
| priest/twinlight +shared_light | heal, status |
| priest/twinlight +raising_light | heal, revive |
| priest/twinlight +deepen | heal |
| priest/twinlight +sunward | heal |
| priest/twinlight +lingering_dusk | heal |
| priest/twinlight +hunger | heal |
| priest/twinlight +final_light | heal |
| priest/twinlight +long_dusk | heal |
| priest/twinlight +crescendo | heal |
| enchanter/arcane_jolt | — |
| enchanter/drowse | — |
| enchanter/beguile | — |
| enchanter/beguile +mind_ward | ward |
| enchanter/lethargy | — |
| enchanter/phantasm | — |
| enchanter/phantasm +mirror_ward | barrier |
| enchanter/enthrall | — |
| enchanter/enthrall +thought_shield | barrier |
