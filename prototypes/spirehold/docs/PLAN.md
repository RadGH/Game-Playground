# Spirehold — plan and decisions

## Owner brief (2026-11-08, verbatim)
"Create a new city sim game that I can play for 40 hours and cotninue building bigger cities. Except I don't want to
micro manage the city. I just want to deal with the defense and defend against huge hordes of enemies and cast spells,
explosions, meteors using towers and mages to defend. I want D&D-style adventure parties who show up who you can send
on adventures of varying difficulty, giving rewards if successful or emptyhanded if failure. IT should be semi idle game
I can leave running on my other monitor and still make progress, but still have plenty of things to do. You decide the
rest and release to games.radgh.com whne complete."

## Decisions Claude made ("you decide the rest")
1. **Name** Spirehold. Medieval fantasy, top-down canvas view of a round walled city with roads out to the wilds.
2. **The city runs itself**: population grows toward a cap, taxes flow, city XP comes from kills and taxes; city levels
   widen the walls (more tower spots), unlock landmarks and towers. The only city choices are 9 optional landmark upgrades.
3. **Defence is the game**: tower spots on the wall ring; 9 tower kinds with 2 path choices at levels 10 and 30; damage
   doubles every 25 levels; court mages (7 schools) cast on their own; 8 player spells with mana and cooldowns.
4. **Sieges** ("Horde" is banned in player text): continuous waves; every 10th a siege with a named leader, every 25th a
   Great Siege. A breach falls back three waves instead of losing — idle-friendly. "Pushing on / Holding" toggle.
5. **Adventurers**: parties of 3–5 arrive at the tavern every few minutes and leave after 20; hire them; quest board of
   8 kinds × 10 ranks; the player picks length (5 min / 30 min / 2 h / 8 h) and party; odds shown in words and %, with
   reasons. Win → gold, lore, starshards, relic chance, XP. Lose → nothing; some hurt; a rare death on hopeless rank 3+.
   Heroes at home fight from the walls.
6. **Semi-idle**: runs in a visible window; time away (closed, minimised) pays 50% (up to 100% with research/relics/
   legacy), capped 12 h; quests use real clocks; apprentices auto-cast once researched; the optional Royal Steward spends
   gold.
7. **40 hours**: research (lore), relics (quests; levelled with starshards), then **found a new realm** from wave 100 —
   Crowns buy multiplying Legacy perks; 6 realms with their own foe mixes and bonuses unlock one by one.
8. Sound from the shared sfx library; fonts Cinzel + Spectral (credits rows added); no third-party art.
