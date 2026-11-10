// Rustwild combat numbers (Expansion 1 M8, docs/EXPANSION-1.md "M8"). A plain data module — not JSON, so the room
// (Node and the page's loopback) and the page import it the same way with no fetch. Pure: no DOM / three / Rapier.
// js/game/combat.js holds the rules that read it; js/game/jobs/combat.js is the room's referee.
//
// Balance (checked by tests/combat.test.js):
//   * the Ironback Tank clears Redcut Camp (2 turrets + generator, 590 hp) alone: 7-8 shells, ~13 s of firing, while
//     the two turrets need well over 30 s of standing still to wreck its 600 hp
//   * the Trail Jeep's driver has no gun at all: alone, a jeep cannot clear anything (a friend on the gun does — or the
//     Second gun mount upgrade puts a forward gun on the driver's side)
//   * enemy shots fly slowly and straight at where you ARE (no leading), so a moving vehicle dodges most of them

/** Player guns by shot kind (the `kind` vehicles.json seats fire; js/game/session.js draws them). */
export const WEAPONS = Object.freeze({
  pellet: { name: 'machine gun', dmg: 7, rate: 6, range: 110 },
  bolt: { name: 'bolt cannon', dmg: 34, rate: 2.5, range: 170 },
  shell: { name: 'main gun', dmg: 90, rate: 0.6, range: 330, splash: 7, splashDmg: 45 },
});

/**
 * Vehicles in the Rustwild: hit points and which seat fires what (must match vehicles.json — a test checks).
 * Any other vehicle that drives in gets DEFAULT_HP and no gun.
 */
export const COMBAT_VEHICLES = Object.freeze({
  tank: { hp: 600, guns: { 0: 'shell' }, r: 3.0 },
  hover_tank: { hp: 380, guns: { 0: 'bolt' }, r: 2.8 },
  trail_jeep: { hp: 220, guns: { 2: 'pellet' }, r: 2.3 },
  raider_buggy: { hp: 260, guns: { 2: 'pellet' }, r: 2.3 },
});
export const DEFAULT_HP = 160;
export const DEFAULT_RADIUS = 2.4;
export const FOOT_RADIUS = 1.0;

/** The combat job's upgrades (data/jobs.json `combat`) and what each one does to the PLAY. */
export const UPGRADES = Object.freeze({
  combat_armour: { hpScale: 1.5 },          // armour plating: the vehicle you drive has half as much again to lose
  combat_fast_guns: { rateScale: 1.5 },     // quick loader: every gun you fire shoots half as fast again
  combat_twin_gun: { driverGun: 'pellet' }, // second gun mount: the driver's side gets a forward machine gun (fire button)
  combat_repair: { heal: 0.6 },             // field repair kit: once per camp, put 60% back (even on a wreck)
});

/** Crash damage in the zone: a hit harder than `safe` m/s costs (v - safe) * perMs hp, at most `max` a crash. */
export const CRASH = Object.freeze({ safe: 9, perMs: 7, max: 90 });

/**
 * The raiders. `every` = seconds between shots (a buggy fires a `burst`), `range` = how far it shoots, `speed` = shot
 * speed (m/s — slow enough to see and dodge), `wind` = seconds of aiming before the first shot at a new target.
 */
export const FOES = Object.freeze({
  turret: { name: 'Scrap turret', hp: 160, r: 2.0, h: 7.2, shot: 'slug', dmg: 22, every: 2.4, range: 95, speed: 30, turn: 1.6, wind: 1.0 },
  drone: { name: 'Raider drone', hp: 60, r: 1.3, alt: 12, move: 13, shot: 'dart', dmg: 8, every: 1.4, range: 80, speed: 36, orbit: 28, wind: 0.8 },
  buggy: { name: 'Scrapper Buggy', hp: 140, r: 2.3, move: 15, turn: 1.8, shot: 'scrap', dmg: 6, burst: 3, gap: 0.2, every: 2.4, range: 70, speed: 55, keep: 22, leash: 260, wind: 0.9 },
  generator: { name: 'Camp generator', hp: 270, r: 2.5, h: 4.6 },
});
/** Shots the raiders fire (drawn by js/client/combat-fx.js; the room flies them and decides the hits). */
export const FOE_SHOTS = Object.freeze({
  slug: { r: 0.32, col: '#ff8a3a', life: 3.6 },
  dart: { r: 0.18, col: '#ff4fd0', life: 2.4 },
  scrap: { r: 0.12, col: '#ffd84a', life: 1.4 },
});

export const AGGRO = 140;         // metres from a camp's middle where its raiders notice you
export const WAKE = 340;          // a camp works only while someone is this close (else it sleeps: nothing moves)
export const RESPAWN_MS = 240_000; // a cleared camp comes back 4 minutes later (never while someone is in it)
export const HELP_MS = 180_000;   // you count as having helped clear a camp if you hit it in the last 3 minutes
export const WRECK_PATCH_MS = 40_000; // a wreck nobody sits in is patched up after this long

/**
 * The five camps (js/world/county CAMPS ids). Spots are metres from the camp's middle (+z = the track in). `title` is
 * what the job calls it; the fortress is the big one.
 */
export const CAMP_LAYOUTS = Object.freeze({
  camp_redcut: { tier: 1, title: 'Scrap camp', gen: [0, -6], foes: [['turret', -9, 3], ['turret', 9, -2]] },
  camp_saltpan: { tier: 2, title: 'Gun nest', gen: [0, -5], foes: [['turret', -10, 4], ['turret', 10, 4], ['turret', 0, -14], ['drone', 0, 0]] },
  camp_dustjaw: { tier: 2, title: 'Drone yard', gen: [2, -6], foes: [['turret', -8, -8], ['drone', -6, 6], ['drone', 6, 6], ['drone', 0, -12]] },
  camp_scrapper: { tier: 3, title: 'Buggy pack', gen: [0, -7], foes: [['turret', 9, 6], ['buggy', -8, 8], ['buggy', 8, -10], ['buggy', -10, -6]] },
  camp_ironbluff: { tier: 4, title: 'The fortress', fortress: true, gen: [0, -4], genHp: 420,
    foes: [['turret', -11, 6], ['turret', 11, 6], ['turret', -11, -12], ['turret', 11, -12], ['drone', -5, 9], ['drone', 5, 9], ['buggy', -14, -3], ['buggy', 14, -3]] },
});
