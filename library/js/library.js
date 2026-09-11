// Character/item/party LIBRARY: blueprints shared between every experiment and prototype on this origin.
//   import { Library } from '/library/js/library.js';
//   const lib = await Library.open();                 // loads defaults (library/data/defaults.json) + browser-saved entries (localStorage)
//   lib.list('character'); lib.get(id); lib.put({ kind: 'character', name, data, tags }); lib.remove(id)
//   const hero = lib.stamp(id);                        // deep copy for a game: leveling up in the game never touches the library
//   lib.export(); lib.import(json); await lib.syncToClaude();   // POST to /api/library/sync (tools/serve.py) → library/synced/library.json
// Entry: { id, kind: 'character'|'item'|'party'|'npc', name, data, tags: [], source: 'default'|'user'|'game', createdAt, updatedAt, notes }
// 'data' for characters is the shared character JSON ({ schema, name, avatar, voice, speech, entry, race, pronouns }).
const KEY = 'playground:library:v1';
export const KINDS = ['character', 'item', 'party', 'npc'];

export class Library {
  constructor(defaults = []) { this.defaults = defaults.map(e => ({ ...e, source: 'default' })); this.user = []; this.load(); }
  static async open(base = defaultBase()) { let defaults = []; try { defaults = (await (await fetch(base + 'data/defaults.json')).json()).entries || []; } catch (e) { console.warn('library defaults not loaded', e); } return new Library(defaults); }
  load() { try { this.user = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { this.user = []; } }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.user)); } catch (e) { console.warn('library save failed', e); } }
  /** All entries; user entries shadow defaults with the same id. */
  all() { const seen = new Set(); const out = []; for (const e of [...this.user, ...this.defaults]) { if (seen.has(e.id)) continue; seen.add(e.id); out.push(e); } return out; }
  list(kind, { tags = [] } = {}) { return this.all().filter(e => (!kind || e.kind === kind) && tags.every(t => (e.tags || []).includes(t))); }
  get(id) { return this.all().find(e => e.id === id) || null; }
  has(id) { return !!this.get(id); }
  /** Add or update. Returns the stored entry. */
  put(entry) {
    const now = Date.now(); const id = entry.id || slug(entry.name || entry.kind) + '_' + now.toString(36);
    const e = { tags: [], notes: '', ...entry, id, kind: KINDS.includes(entry.kind) ? entry.kind : 'character', source: entry.source && entry.source !== 'default' ? entry.source : 'user', createdAt: entry.createdAt || now, updatedAt: now };
    const i = this.user.findIndex(x => x.id === id); if (i >= 0) this.user[i] = e; else this.user.push(e); this.save(); return e;
  }
  remove(id) { this.user = this.user.filter(e => e.id !== id); this.save(); }
  /** Deep copy of an entry's data for use in a game; the library stays untouched. */
  stamp(id) { const e = this.get(id); if (!e) return null; return JSON.parse(JSON.stringify({ ...e.data, libraryId: e.id, libraryName: e.name })); }
  /** Save a character from a game as a fresh blueprint: strips game-only fields (hp, level, inventory…). */
  putCharacter(character, { name, tags = [], source = 'game', notes = '' } = {}) {
    const data = JSON.parse(JSON.stringify(character)); for (const k of ['hp', 'maxHp', 'level', 'xp', 'inventory', 'weapon', 'armour', 'implement', 'gold', 'status', 'libraryId', 'libraryName', 'gameId']) delete data[k];
    return this.put({ kind: character.kind === 'npc' ? 'npc' : 'character', name: name || data.name, data, tags: [...new Set([...(data.race ? [data.race] : []), ...(data.speech?.traits || []), ...tags])], source, notes });
  }
  export() { return { schema: 1, exportedAt: new Date().toISOString(), entries: this.all() }; }
  exportUser() { return { schema: 1, exportedAt: new Date().toISOString(), entries: this.user }; }
  /** Merge entries from an export (user entries win over defaults; incoming replaces same id). */
  import(json) { const list = json?.entries || (Array.isArray(json) ? json : []); let n = 0; for (const e of list) { if (!e || !e.kind || !e.data) continue; this.put({ ...e, source: e.source === 'default' ? 'user' : (e.source || 'user') }); n++; } return n; }
  /** Send the whole library to the dev server so Claude can read it from library/synced/library.json. */
  async syncToClaude(extra = {}) { const body = { ...this.export(), ...extra }; const r = await fetch('/api/library/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error('sync failed: ' + r.status); return r.json(); }
  /** Send any JSON to library/synced/inbox/<name>-<time>.json (e.g. a saved game, a party, feedback). */
  static async sendToClaude(name, obj) { const r = await fetch('/api/inbox/' + encodeURIComponent(name), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) }); if (!r.ok) throw new Error('send failed: ' + r.status); return r.json(); }
  /** Pull what the server has (what Claude last saw / wrote) and merge it in. */
  async pullFromServer() { const r = await fetch('/api/library/sync'); if (!r.ok) return 0; const j = await r.json(); return this.import(j); }
}
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'entry'; }
function defaultBase() { return new URL('../', import.meta.url).href; }
