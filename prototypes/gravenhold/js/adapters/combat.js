import { loadRulesData } from '../../../thousandvale/js/rules/data.js';
import { createEngine } from '../../../thousandvale/js/rules/engine.js';
import { createRoomContext } from '../../../thousandvale/js/rules/room.js';
import { attachField } from '../../../thousandvale/js/rules/field.js';
import { createCombat } from '../../../thousandvale/js/rules/cast.js';
import { createCharacter } from '../../../thousandvale/js/rules/character.js';
import { flatTerrain } from '../../../thousandvale/js/rules/terrain-flat.js';
import { spawnMonster, tickMonsters } from '../../../thousandvale/js/rules/monster-ai.js';

export async function createCombatRoom() {
  const data = await loadRulesData(async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Thousandvale data failed: ${url}`);
    return response.json();
  });
  const engine = createEngine(data, { seed: 41 });
  const room = createRoomContext({ id: 'gravenhold', seed: 41, engine });
  attachField(room, { terrain: flatTerrain({ size: 8 }) });
  room.combat = createCombat(room);
  const makeCharacter = (classId, id = 'hero') => createCharacter(engine, { id, classId, name: 'Wayfarer', x: 0, z: 0 });
  const hero = makeCharacter('warrior');
  room.field.add(hero, 'player');
  const def = engine.enemyDef('moor_hound') || engine.bestiary.enemies[0];
  const bossDef = engine.enemyDef('world_ossathra');
  const target = spawnMonster(room.field, def, 1, 0, -3, { id: 'practice_target' });
  room.combat.tickMonsters = dt => tickMonsters(room.field, dt);
  return { room, engine, hero, target, classes: engine.classes, skills: engine.skillData.skills, makeCharacter, spawn: (id,x,z,level=1) => spawnMonster(room.field, def, level, x, z, { id }), spawnBoss: (id,x,z,level) => spawnMonster(room.field,bossDef,level,x,z,{id,boss:true}), bossLook: data.tvMonsters?.monsters?.find(m=>m.id==='world_ossathra')?.look?.creature };
}
