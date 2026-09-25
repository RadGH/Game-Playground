// Material table built from data/materials.json. Fast lookups by id use plain arrays so the
// cell simulation never touches objects in its inner loops.

export const M = {
  EMPTY: 0, BEDROCK: 1, ROCK: 2, DUST: 3, CRYSTAL: 4, FERRITE: 5, PANEL: 6, PLATE: 7, PRISM: 8,
  FOAM: 9, RUBBLE: 11, SLAG: 12, FOOTPRINT: 13,
};

// State codes (numbers so the inner loops stay fast).
export const S = { EMPTY: 0, STATIC: 1, LOOSE: 2, STRUCTURAL: 3, STICKY: 4, FOOTPRINT: 5 };
const STATE_CODE = { empty: 0, static: 1, loose: 2, structural: 3, sticky: 4, footprint: 5 };

export class Materials {
  constructor(json) {
    this.list = json.list;
    const n = 256;
    this.state = new Uint8Array(n);
    this.hp = new Uint8Array(n);
    this.maxSpan = new Uint8Array(n);
    this.reflect = new Uint8Array(n);
    this.built = new Uint8Array(n);
    this.gate = new Uint8Array(n);
    this.indestructible = new Uint8Array(n);
    this.byKey = {};
    this.resist = [];
    this.colors = [];
    for (const m of this.list) {
      this.state[m.id] = STATE_CODE[m.state];
      this.hp[m.id] = m.hp;
      this.maxSpan[m.id] = m.maxSpan || 0;
      this.reflect[m.id] = m.reflect ? 1 : 0;
      this.built[m.id] = m.built ? 1 : 0;
      this.gate[m.id] = m.gate ? 1 : 0;
      this.indestructible[m.id] = m.indestructible ? 1 : 0;
      this.resist[m.id] = m.resist || {};
      this.colors[m.id] = m.colors;
      this.byKey[m.key] = m;
    }
  }

  get(id) { return this.list[id]; }
  isSolid(id) { return id !== 0; }
  isLoose(id) { return this.state[id] === S.LOOSE; }
  isStatic(id) { return this.state[id] === S.STATIC; }
  isStructural(id) { return this.state[id] === S.STRUCTURAL; }
  resistance(id, type) { const r = this.resist[id][type]; return r === undefined ? 1 : r; }
}
