// Conversations: structured back-and-forth talk built on Lingo (templates, speakers, lexicon) and the memory system.
// A topic is a small script with roles (asker / answerer / third), requirements that must be satisfiable from real
// facts (memories, gear, meter stats), and lines whose variants carry conditions. The engine picks a topic whose
// requirements fit the party, casts the roles from whoever actually has the memory/gear, fills bindings, and speaks
// each line through Lingo so personality (prefix, tics, sliders) still applies.
//
//   const conv = new Conversations({ lingo, topics });
//   const lines = conv.talk(speakers, facts, { scene, turns: 4, tags: ['camp'] });
//   facts = { now, memoriesOf(id) → Memory[], gearOf(id) → [{ item, slot, kills, damage, delta, replaced, daysAgo }], statsOf(id) → { kills, damage, fights, downs, healing }, bagOf(id) → [{ item, daysAgo }], party: { rations, day, act, zone, vehicle }, relations?: RelationGraph }
import { Entity } from '../../lingo/js/lingo.js';
import { ageWords } from '../../lingo/js/memory.js';
export class Conversations {
  constructor({ lingo, topics }) { this.lingo = lingo; this.topics = topics.topics || topics; this.recent = []; this.registered = new Set(); }
  /** Which topics can run right now, with a cast and bindings for each. */
  eligible(speakers, facts, { tags = [] } = {}) {
    const out = []; for (const topic of this.topics) { if (tags.length && !tags.some(t => (topic.tags || []).includes(t))) continue; const cast = this.cast(topic, speakers, facts); if (cast) out.push({ topic, ...cast }); } return out;
  }
  /** Try every ordering of speakers for the answerer role; the first that satisfies the requirements wins. */
  cast(topic, speakers, facts) {
    const needThird = (topic.lines || []).some(l => l.role === 'third' && !l.optional); if (speakers.length < 2 || (needThird && speakers.length < 3)) return null;
    for (const answerer of speakers) { const others = speakers.filter(s => s !== answerer); for (const asker of others) { const third = others.find(s => s !== asker) || null; if (needThird && !third) continue; const b = this.bindingsFor(topic, { asker, answerer, third }, facts); if (b) return { asker, answerer, third, bindings: b }; } }
    return null;
  }
  /** Resolve requirements into bindings; null if any requirement fails. */
  bindingsFor(topic, roles, facts) {
    const b = { asker: roles.asker, answerer: roles.answerer, third: roles.third, party: facts.party || {} }; const lex = this.lingo.lexicon; const now = facts.now ?? 0; const ent = (id, type = 'thing', extra = {}) => { const e = lex.get(id); return new Entity(e || { id, type, forms: { sg: String(id).replace(/_/g, ' ') }, ...extra }, { lexicon: lex, count: extra.count || 1 }); };
    for (const req of topic.requires || []) {
      const who = roles[req.who || 'answerer']; if (!who) return null;
      // `bindingIs: { by: 'answerer' }` casts the other side of the memory: "the hero who was revived
      // thanks the one who revived them" needs the person in the memory's `by` binding to BE the
      // answerer, not just anybody. `minAgeHours` is the other half of `maxAgeHours`, for a callback
      // that should only come up once some days have gone by.
      if (req.memory) { const mems = (facts.memoriesOf?.(who.id) || []).filter(m => m.type === req.memory && (req.maxAgeHours == null || now - m.time <= req.maxAgeHours) && (req.minAgeHours == null || now - m.time >= req.minAgeHours) && (!req.bindingIs || Object.entries(req.bindingIs).every(([key, role]) => roles[role] && (m.bindings?.[key]?.id ?? m.bindings?.[key]) === roles[role].id)) && (!req.details || Object.entries(req.details).every(([k, v]) => m.details?.[k] === v)) && (!req.detailsNot || Object.entries(req.detailsNot).every(([k, v]) => m.details?.[k] !== v))); if (!mems.length) return null; const m = mems.sort((x, y) => y.time - x.time)[0]; b.memory = { ...m.details, when: ageWords(Math.max(0, now - m.time)).when, count: m.count }; for (const [k, v] of Object.entries(m.bindings || {})) { if (!v) continue; const id = v.id ?? v; b[k] = ent(id, k === 'foe' ? 'creature' : k === 'place' ? 'place' : k === 'item' ? 'item' : 'thing', { count: v.count || 1 }); } if (m.details?.itemName) b.itemName = m.details.itemName; }
      if (req.gear) { const gear = (facts.gearOf?.(who.id) || []).filter(g => (!req.gear.slot || g.slot === req.gear.slot) && (req.gear.minKills == null || (g.kills || 0) >= req.gear.minKills) && (req.gear.delta == null || (req.gear.delta === 'better' ? (g.delta || 0) > 0 : (g.delta || 0) < 0)) && (req.gear.maxDaysAgo == null || (g.daysAgo ?? 99) <= req.gear.maxDaysAgo) && (req.gear.replaced == null || !!g.replaced === req.gear.replaced) && (req.gear.rarity == null || g.item?.rarity === req.gear.rarity) && (req.gear.baseKey == null || [].concat(req.gear.baseKey).includes(g.item?.baseKey)) && (req.gear.unique == null || [].concat(req.gear.unique).includes(g.item?.uniqueId)) && (req.gear.effect == null || itemHasEffect(g.item, req.gear.effect))); if (!gear.length) return null; const g = gear.sort((x, y) => (y.kills || 0) - (x.kills || 0))[0]; b.weapon = ent(g.lexId || g.item?.baseKey || 'weapon', 'item', { forms: { sg: g.item?.name || 'weapon', pl: (g.item?.name || 'weapon') + 's' }, proper: !!g.item?.isUnique }); b.gear = { name: g.item?.name, kills: g.kills || 0, damage: g.damage || 0, delta: g.delta || 0, deltaAbs: Math.abs(Math.round(g.delta || 0)), replaced: g.replaced || 'the old one', daysAgo: g.daysAgo ?? 0, rarity: g.item?.rarity || 'normal', slot: g.slot }; }
      if (req.bag) { const bag = (facts.bagOf?.(who.id) || []).filter(x => req.bag.minDaysAgo == null || (x.daysAgo ?? 0) >= req.bag.minDaysAgo); if (!bag.length) return null; const x = bag[0]; b.bagItem = ent(x.item?.baseKey || 'item', 'item', { forms: { sg: x.item?.name || 'something', pl: (x.item?.name || 'things') } }); b.bag = { name: x.item?.name, daysAgo: x.daysAgo ?? 0, rarity: x.item?.rarity }; }
      if (req.stats) { const s = facts.statsOf?.(who.id) || {}; for (const [k, v] of Object.entries(req.stats)) { if (typeof v === 'number' && !((s[k] || 0) >= v)) return null; if (v === 'top') { const all = (facts.partyIds || []).map(id => facts.statsOf?.(id)?.[k] || 0); if (!(s[k] > 0) || (s[k] || 0) < Math.max(...all)) return null; } } b.stats = s; }
      if (req.party) { for (const [k, v] of Object.entries(req.party)) { const cur = (facts.party || {})[k]; if (typeof v === 'object' && v) { if (v.max != null && !(cur <= v.max)) return null; if (v.min != null && !(cur >= v.min)) return null; if ('is' in v && cur !== v.is) return null; } else if (cur !== v) return null; } }
      if (req.trait) { if (!(who.speech?.traits || []).includes(req.trait)) return null; } if (req.notTrait) { if ((who.speech?.traits || []).includes(req.notTrait)) return null; }
      if (req.relation) { if (!facts.relations) return null; const r = facts.relations.get(who.id, roles[req.relation.to || 'asker'].id); const op = r.opinion(); if (req.relation.min != null && op < req.relation.min) return null; if (req.relation.max != null && op > req.relation.max) return null; }
    }
    return b;
  }
  /** Generate a conversation. Returns [{ speaker, listener, role, text, speech, topic }]. */
  talk(speakers, facts, { scene = null, tags = [], turns = 6, rng = Math.random, avoidRecent = true } = {}) {
    let opts = this.eligible(speakers, facts, { tags }); if (avoidRecent) { const fresh = opts.filter(o => !this.recent.includes(o.topic.id)); if (fresh.length) opts = fresh; } if (!opts.length) return [];
    const weights = opts.map(o => (o.topic.weight || 1) * (1 + (o.topic.requires?.length || 0) * 0.5)); let r = rng() * weights.reduce((a, b) => a + b, 0); let pick = opts[0]; for (let i = 0; i < opts.length; i++) { r -= weights[i]; if (r <= 0) { pick = opts[i]; break; } }
    this.recent.push(pick.topic.id); if (this.recent.length > 8) this.recent.shift(); return this.perform(pick, { scene, rng, turns });
  }
  perform({ topic, asker, answerer, third, bindings }, { scene = null, rng = Math.random, turns = 6 } = {}) {
    const roles = { asker, answerer, third }; const out = []; let n = 0;
    for (const line of topic.lines || []) { if (n >= turns) break; const sp = roles[line.role]; if (!sp) { if (line.optional) continue; break; } const listener = roles[line.to] || (line.role === 'asker' ? answerer : asker);
      const variants = (line.variants || [line]).filter(v => v.t && this.condOk(v.cond, sp, listener, bindings)); if (!variants.length) { if (line.optional) continue; break; }
      const v = variants[Math.floor(rng() * variants.length)]; const ctx = { speaker: sp, listener, scene, ...bindings, self: sp, other: listener }; let res; try { res = this.speakLine(topic, v, ctx); } catch (e) { res = { text: `(${e.message})`, speech: '' }; }
      if (!res.text) continue; out.push({ speaker: sp, listener, role: line.role, text: res.text, speech: res.speech, topic: topic.id }); n++; }
    return out;
  }
  condOk(cond, sp, listener, b) { if (!cond) return true; try { return !!new Function('has', 'listenerHas', 'gear', 'memory', 'stats', 'party', 'bag', 'chance', 'return (' + cond + ')')(t => (sp.speech?.traits || []).includes(t), t => (listener?.speech?.traits || []).includes(t), b.gear || {}, b.memory || {}, b.stats || {}, b.party || {}, b.bag || {}, p => Math.random() < p); } catch { return false; } }
  /** Speak through Lingo so prefixes/tics/pronunciation apply: each variant is its own grammar symbol. */
  speakLine(topic, v, ctx) { const sym = 'conv_' + topic.id + '_' + hash(v.t); if (!this.registered.has(sym)) { this.lingo.grammar.add(sym, { id: sym + '#0', t: v.t, tags: v.tags || topic.tags || [], w: 1 }); this.registered.add(sym); } const out = this.lingo.speak(sym, ctx, { wrap: true }); return { text: out.text || '', speech: out.speech || out.text || '' }; }
}
/** Does this item carry a named property? Matches an affix stat (`cond_forageRation`) or a legendary power id. */
export function itemHasEffect(item, effect) {
  if (!item) return false; const want = [].concat(effect);
  if (want.includes(item.legendaryEffectId)) return true;
  return (item.affixes || []).some(a => want.includes(a.stat) || want.includes(a.legendaryId));
}
function hash(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
/** Build the facts object a game needs from plain records (memory banks, heroes with equipment, a Meter, loot log). */
export function factsFrom({ now = 0, day = 1, banks = {}, heroes = [], meter = null, lootLog = [], party = {}, relations = null }) {
  const byId = Object.fromEntries(heroes.map(h => [h.id, h])); const found = itemId => lootLog.find(l => l.itemId === itemId);
  return { now, party: { day, ...party }, relations, partyIds: heroes.map(h => h.id), memoriesOf: id => banks[id]?.memories || [],
    gearOf: id => { const h = byId[id]; if (!h) return []; return Object.entries(h.equipment || {}).filter(([, it]) => it).map(([slot, it]) => { const st = meter?.itemStats?.[it.id] || {}; const f = found(it.id); return { item: it, slot, kills: st.kills || 0, damage: st.damage || 0, delta: f?.delta ?? 0, replaced: f?.replaced || null, daysAgo: f ? day - f.day : 99, lexId: it.baseKey }; }); },
    bagOf: id => lootLog.filter(l => l.holder === id && !l.equipped).map(l => ({ item: l.item, daysAgo: day - l.day })),
    statsOf: id => { const s = { kills: 0, damage: 0, fights: 0, downs: 0, healing: 0 }; if (!meter) return s; for (const f of meter.fights) { let took = false; for (const r of f.records) { if (r.source === id && r.kind === 'damage') { s.damage += r.amount; took = true; if (r.killingBlow) s.kills++; } if (r.source === id && r.kind === 'heal') s.healing += r.amount; } if (took) s.fights++; } s.downs = (banks[id]?.memories || []).filter(m => m.type === 'wounded' && m.details?.down).length; return s; } };
}

// ---------------------------------------------------------------------------------------------- threads (multi-day)
/**
 * A thread is a conversation that continues over several rests. data/threads.json: { id, tags, requires (as topics), stages: [ { id, lines, after: { days?, nodes?, objective? }, reward? } ] }
 * `after` gates the NEXT stage: days since the previous stage, nodes travelled since it, and/or an objective the host reports as done
 * (objective: { type: 'kills'|'rest'|'shrine'|'town'|'equip'|'named'|'fight_unhurt'|'level'|'spend'|'gold', n }). Host keeps `state.threads` = { [id]: { stage, day, nodes, objectiveDone } }.
 */
export class Threads {
  constructor({ conv, threads }) { this.conv = conv; this.threads = threads.threads || threads; }
  /** Which threads can start (stage 0) or continue now. */
  due(speakers, facts, state = {}) {
    const out = []; for (const th of this.threads) { const st = state[th.id]; if (st?.done) continue; const stageIdx = st ? st.stage + 1 : 0; const stage = th.stages[stageIdx]; if (!stage) continue;
      if (st) { const a = stage.after || {}; if (a.days != null && (facts.party?.day ?? 0) - st.day < a.days) continue; if (a.nodes != null && (facts.party?.nodesTravelled ?? 0) - st.nodes < a.nodes) continue; if (a.objective && !st.objectiveDone) continue; }
      const cast = this.conv.cast({ ...th, lines: stage.lines, requires: stageIdx === 0 ? th.requires || [] : [] }, speakers, facts); if (!cast) continue; if (st && cast.answerer.id !== st.answerer) { const sp = speakers.find(s => s.id === st.answerer); const ask = speakers.find(s => s.id === st.asker) || speakers.find(s => s !== sp); if (!sp || !ask) continue; const b = this.conv.bindingsFor({ ...th, requires: [] }, { asker: ask, answerer: sp, third: speakers.find(s => s !== sp && s !== ask) || null }, facts); if (!b) continue; Object.assign(cast, { asker: ask, answerer: sp, third: speakers.find(s => s !== sp && s !== ask) || null, bindings: b }); }
      out.push({ thread: th, stage, stageIdx, ...cast }); }
    return out;
  }
  /** Play one due thread stage (if any) and update state. Returns { lines, thread, stage, reward, objective } or null. */
  play(speakers, facts, state = {}, { rng = Math.random, scene = null } = {}) {
    const due = this.due(speakers, facts, state); if (!due.length) return null; const pick = due[Math.floor(rng() * due.length)]; const lines = this.conv.perform({ topic: { ...pick.thread, id: pick.thread.id + '_' + pick.stage.id, lines: pick.stage.lines }, asker: pick.asker, answerer: pick.answerer, third: pick.third, bindings: pick.bindings }, { rng, scene, turns: 8 });
    const next = pick.thread.stages[pick.stageIdx + 1]; state[pick.thread.id] = { stage: pick.stageIdx, day: facts.party?.day ?? 0, nodes: facts.party?.nodesTravelled ?? 0, asker: pick.asker.id, answerer: pick.answerer.id, objective: next?.after?.objective || null, objectiveDone: false, done: !next };
    return { lines, thread: pick.thread, stage: pick.stage, reward: pick.stage.reward || null, objective: next?.after?.objective || null, answerer: pick.answerer, asker: pick.asker, done: !next };
  }
}
// ---------------------------------------------------------------------------------------------- variety generator
/** Multiply a topic set's variants with trait-conditioned openers and closers so the same line rarely repeats verbatim. */
export const OPENERS = { any: ['', '', '', 'Listen. ', 'Look, ', 'Honestly? ', 'Right. ', 'So. '], gruff: ['Hn. ', 'Bah. ', 'Listen here. '], jolly: ['Ha! ', 'Oh, this is good. ', 'Friends, friends. '], scholar: ['Consider: ', 'Observe. ', 'By my reckoning, '], cynical: ['Of course. ', 'Naturally. ', 'Here we go. '], pious: ['Light keep us. ', 'Gods willing, ', 'Bless it, '], nervous: ['Um. ', 'Right, so, ', 'Don\'t laugh, but '], pompous: ['As I said, ', 'Obviously, ', 'For the record: '], shy: ['…', 'Well… ', 'If you want my view, '] };
export const CLOSERS = { any: ['', '', '', ' That\'s all.', ' Anyway.', ' Make of it what you will.'], gruff: [' Enough talk.', ' Done.'], jolly: [' Ha!', ' Cheers to that.'], scholar: [' Note it down.', ' Quod erat.'], cynical: [' Not that it matters.', ' As if anyone listens.'], pious: [' Light willing.', ' Amen to it.'], nervous: [' Sorry.', ' Was that too much?'], pompous: [' Naturally.', ' You may thank me later.'], shy: [' …sorry.', ' Forget I said it.'] };
export function expandVariants(topics, { perLine = 2, seed = 1 } = {}) {
  let a = seed >>> 0; const rng = () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; const pick = arr => arr[Math.floor(rng() * arr.length)];
  const list = topics.topics || topics; let added = 0;
  for (const t of list) for (const line of t.lines || []) { const base = [...(line.variants || [])]; for (const v of base) { if (v.generated || !/^[A-Z{]/.test(v.t)) continue; for (let i = 0; i < perLine; i++) { const trait = pick(Object.keys(OPENERS).filter(k => k !== 'any')); const op = rng() < 0.5 ? pick(OPENERS[trait]) : pick(OPENERS.any); const cl = rng() < 0.4 ? pick(CLOSERS[trait]) : pick(CLOSERS.any); if (!op && !cl) continue; const text = (op ? op + v.t[0].toLowerCase() + v.t.slice(1) : v.t) + cl; const cond = [v.cond, op && OPENERS[trait].includes(op) ? `has('${trait}')` : null, cl && CLOSERS[trait].includes(cl) ? `has('${trait}')` : null].filter(Boolean).join(' && '); line.variants.push({ t: text, cond: cond || undefined, generated: true }); added++; } } }
  return added;
}
