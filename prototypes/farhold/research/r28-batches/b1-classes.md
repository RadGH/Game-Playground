# Round 28 — batch b1 (Frontline): CLASSES.md lines

(Warrior is the engine agent's reference class and is not repeated here.)

## Fighter — Disciplined Duelist · STR · signature: stances and counters · tags: `riposted`, `duel` ("Called Out")
1. **Precise Strike** (`power_strike`) — 190% melee, ignores 40% armour; a crit Marks the target.
2. **Riposte** — 1.2 s window: the next melee hit is negated and answered for 250% + 0.8 s stun; unused, half the cooldown comes back.
3. **Duelist's Stance** — cycles Open (+20% dmg, +15% speed, −15% armour) / Closed (+50% armour, −10% dmg). Talents ride the switch (onEnter / onExit / follower buff).
4. **Lunge** — dash that stops at the first body for +50%; Open: 11 m range, Closed: 0.6 s stun.
5. **Sweeping Guard** — 180° sweep that tags Riposted, then a 1.5 s frontal guard (60% less); each hit taken makes the next sweep +10% (cap 50%).
6. **Master's Flurry** — 6 strikes on the lowest-health enemy, then a 160% finisher that knocks 4 m; Open: 8 strikes, Closed: 30% less damage taken during it.

## Paladin — Holy Warrior · STR · signature: heal by hitting, protect with your own health · tag: `seared`
1. **Sanctified Blade** — holy melee, +50% vs undead/fiends, each hit heals 1.5%.
2. **Blessed Earth** (`consecrate`) — ring of holy damage + a 6 s zone that strikes 6 enemies a second and heals you and followers 2% a pulse.
3. **Oath Hammer** — thrown hammer that comes back (80% on the return), marks Seared, heals 1% per hit.
4. **Martyr's Vow** — pay 15% health: you and every follower get a 25% barrier for 8 s.
5. **Shining Repulse** (`shining_rebuke`) — 5 m holy blast, knock 5 m + 1 s stun, +50% vs undead/fiends.
6. **Daybreak Descent** — leap to the follower nearest your aim; 220% landing, knock 3 m, followers heal 15%, a small blessed zone where you land.

## Knight — Sworn Tank · STR · shield · signature: takes hits FOR others · tags: —
1. **Rim Strike** (`shield_bash`) — 1 s stun and a 3 s taunt on each target.
2. **Sworn Guard** (`guard_stance`) — 8 s: 50% less from the front, −20% speed; the nearest follower is linked and you take 40% of its damage.
3. **Sworn Ward** — 12 s link: any hit on the follower above 20% of its health is taken by you instead. (One link at a time: Guard and Ward replace each other.)
4. **Challenge** — 10 m ring, taunts everything 4 s and pulls ranged enemies 4 m in.
5. **Rampart** — a 6 m wall 5 m ahead for 8 s that blocks movement and ranged hits and taunts what is near it.
6. **Unbroken Banner** — 12 s: you and followers cannot drop below 1 health, allies in 10 m take 20% less, everything in 10 m attacks you; when it ends everyone heals 20%.

## Runesmith — Rune-Forged Bulwark · STR · signature: runes · tag: `rent` · counter: `rune`
1. **Rune Hammer** — arcane melee, adds a Rune (3 runes detonate for 150% and knock 2 m).
2. **Rend Plate** (`sunder`) — marks Rent: targets take 15% more from every source for 8 s.
3. **Runeskin** (`stoneskin`) — 6 s: 40% less damage, melee attackers take 15% back.
4. **Forge Flame** — 12 s: attacks deal +40% as fire and burn; every 4th attack bursts 3 m.
5. **Warding Glyph** — a 12 s zone at your feet: allies take 25% less and gain a 2%/s barrier (cap 15%).
6. **The Great Anvil** — falls 1 s later for 350% + 2 s stun and stays 10 s; every Rune Hammer hit near it rings it for 120% and adds runes.

## Dragon Knight — Draconic Warrior · STR · signature: Wyrm Temper · tags: —
1. **Scale Rend** — melee whose element/status follows the temper (burn / chill / shock).
2. **Wyrm's Breath** (`flamethrower`) — 10 ticks over 2.2 s; Frost Breath stuns 0.3 s a tick, Storm Breath copies Shocked to 2 neighbours.
3. **Wyrmfall** — leap 14 m, 200% landing in the temper's element, knock 3 m.
4. **Wyrm Temper** — cycles Fire (+15% dmg) / Frost (+25% armour) / Storm (+15% speed); leaving one bursts 4 m for 60%.
5. **Dragonscale** — 25% barrier for 8 s, melee attackers take 40% back.
6. **Wyrm Ascendant** — 10 s: attacks deal +15% in the temper's element, apply its status and splash 3 m.
