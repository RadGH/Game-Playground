// Spirehold — the six sheets: Defend, City, Mages, Guild, Research, Realm.
// Each sheet is built once and then refreshed in place; it is rebuilt only when its shape changes (sig()).

import { TOWERS, LANDMARKS, SCHOOLS, RESEARCH, RELICS, RARITY, RARITY_COLOR, LEGACY, REALMS, CLASSES, RACES, TRAITS, LENGTHS, RANK_NAMES, DMG_INFO, SPELLS, SPELL_ORDER, CITY_TITLES } from '../sim/data.js';
import { researchEffect } from '../sim/research-fx.js';
import {
  towerStats, towerCost, towerUnlocked, branchDue, slotsOf, wallCost, wallMax, wallRegen, landmarkCost, popCap, taxRate, cityXpNeed, ringOf,
  mageSlots, mageHireCost, mageLvlCost, mageDmg, researchCost, researchOpen, legacyCost, crownsFor, bon, questOdds, oddsWord, questReward, advPower, advXpNeed, TAG_WORDS,
  spellKnown, PRESTIGE_WAVE, spellPower,
} from '../sim/rules.js';
import {
  buildTower, upgradeTower, chooseBranch, sellTower, upgradeWall, upgradeLandmark, hireMage, levelMage, dismissMage, buyResearch, buyLegacy, levelRelic, newRealm, realmOpen, cityTitle, maxAffordable,
  bestEmptySlot,
} from '../sim/game.js';
import { suggestParty, sendQuest, recallQuest, hire, hireCost, dismiss, revive, reviveCost, rosterCap, isFree, refreshBoard, rerollCost, relicLevelCost, lenOdds, questDuration } from '../sim/guild.js';
import { el, btn, fmt, pct, dur, toast, modal, tip } from './dom.js';

export const TABS = [
  { id: 'defend', label: 'Defend', ic: '🏰' }, { id: 'city', label: 'City', ic: '🏘' }, { id: 'mages', label: 'Mages', ic: '🔮' },
  { id: 'guild', label: 'Guild', ic: '⚔' }, { id: 'research', label: 'Research', ic: '📜' }, { id: 'realm', label: 'Realm', ic: '👑' },
];
const BULK = [1, 10, 100, Infinity];
const bulkName = b => b === Infinity ? 'Max' : '×' + b;

/** A buy button whose label and enabled state follow the game. */
function buyBtn(ups, label, cost, can, onBuy, cls = 'good') {
  const b = btn('', () => { const why = onBuy(); if (why) toast(why, 'bad'); }, cls);
  ups.push(() => { const c = cost(); const lab = typeof label === 'function' ? label() : label; b.textContent = c == null ? lab : `${lab} · ${c}`; b.disabled = !can(); });
  return b;
}
const live = (ups, fn, tag = 'span', attrs = {}) => { const e = el(tag, attrs); ups.push(() => { const v = fn(); if (e._v !== v) { e._v = v; e.innerHTML = v; } }); return e; };
const bulkRow = (app, ups) => { const row = el('div', { class: 'row wrap' }, el('span', { class: 'hint' }, 'Buy:')); for (const b of BULK) { const x = btn(bulkName(b), () => { app.bulk = b; app.sheetDirty = true; }, 'small'); ups.push(() => x.classList.toggle('on', app.bulk === b)); row.append(x); } return row; };
const goldTxt = v => `<span class="goldc">◉ ${fmt(v)}</span>`;
const loreTxt = v => `<span class="lorec">✎ ${fmt(v)}</span>`;
const shardTxt = v => `<span class="shardc">✦ ${fmt(v)}</span>`;
function bulkCost(n, costOf) { let s = 0; for (let i = 0; i < n; i++) s += costOf(i); return s; }
function affordN(budget, costOf, cap = 10000) { let n = 0, s = 0; while (n < cap) { const c = costOf(n); if (s + c > budget) break; s += c; n++; } return { n, s }; }

// ---------------------------------------------------------------- Defend
function defend(app, body, ups) {
  const G = app.G; const sel = app.sel;
  if (sel != null && sel >= 0 && sel < slotsOf(G)) {
    const t = G.towers.find(x => x.slot === sel);
    const nav = el('div', { class: 'row between' }, btn('‹ Prev', () => { app.sel = (sel - 1 + slotsOf(G)) % slotsOf(G); app.sheetDirty = true; }, 'small'), el('b', {}, `Spot ${sel + 1} of ${slotsOf(G)}`), btn('Next ›', () => { app.sel = (sel + 1) % slotsOf(G); app.sheetDirty = true; }, 'small'), btn('All towers', () => { app.sel = null; app.sheetDirty = true; }, 'small'));
    body.append(nav);
    if (!t) {
      body.append(el('p', { class: 'hint' }, 'An empty spot on the wall. Choose a tower to build here.'));
      for (const type in TOWERS) {
        const T = TOWERS[type]; const ok = towerUnlocked(G, type);
        const card = el('div', { class: 'card' + (ok ? '' : ' dim') }, el('h3', { style: `color:${T.color}` }, T.name), el('div', { class: 'meta' }, `${DMG_INFO[T.dmgType].name} · ${T.air ? 'hits flyers' : 'ground only'}`), el('div', {}, T.desc));
        if (ok) card.append(buyBtn(ups, 'Build', () => goldTxt(towerCost(type, 1, G)).replace(/<[^>]+>/g, ''), () => G.gold >= towerCost(type, 1, G), () => { const w = buildTower(G, sel, type); if (!w) app.sheetDirty = true; return w; }));
        else card.append(el('div', { class: 'meta' }, `Unlocks at city level ${T.unlock.city}.`));
        body.append(card);
      }
      return;
    }
    const T = TOWERS[t.type];
    const card = el('div', { class: 'card sel' });
    card.append(el('h3', { style: `color:${T.color}` }, `${T.name}`), live(ups, () => `Level <b>${t.lvl}</b>${t.br.filter(b => b != null).map((b, i) => ` · ${T.branches[i][b].name}`).join('')}`, 'div'));
    card.append(live(ups, () => { const s = towerStats(G, t); return `<div class="kv"><span>Damage</span><span>${fmt(s.dmg)} ${DMG_INFO[T.dmgType].name.toLowerCase()}${s.multishot > 1 ? ` × ${s.multishot}` : ''}${s.chains ? `, leaps ${s.chains}` : ''}${s.splash ? `, ${Math.round(s.splash)} wide` : ''}</span><span>Shots</span><span>${s.rate.toFixed(2)} a second</span><span>Range</span><span>${Math.round(s.range)}</span><span>Kills</span><span>${fmt(t.kills || 0)}</span><span>Dealt</span><span>${fmt(t.dmg || 0)} damage</span></div>`; }, 'div'));
    const due = branchDue(t);
    if (due >= 0) {
      card.append(el('p', { class: 'good' }, `Level ${due ? 30 : 10}: choose a path for this tower.`));
      T.branches[due].forEach((B, i) => card.append(el('div', { class: 'card' }, el('h3', {}, B.name), el('div', {}, B.desc), btn(`Choose ${B.name}`, () => { chooseBranch(G, sel, i); app.sheetDirty = true; }, 'primary'))));
    } else {
      card.append(bulkRow(app, ups));
      card.append(buyBtn(ups, () => { const n = app.bulk === Infinity ? Math.max(1, maxAffordable(G, t)) : app.bulk; return `Upgrade +${n}`; },
        () => { const n = app.bulk === Infinity ? Math.max(1, maxAffordable(G, t)) : Math.min(app.bulk, (t.br[0] == null ? 10 : t.br[1] == null ? 30 : 1e9) - t.lvl); return '◉ ' + fmt(bulkCost(Math.max(1, n), i => towerCost(t.type, t.lvl + 1 + i, G))); },
        () => G.gold >= towerCost(t.type, t.lvl + 1, G), () => upgradeTower(G, sel, app.bulk === Infinity ? 1e9 : app.bulk)));
      const next = [10, 30].find(l => t.lvl < l); if (next) card.append(el('div', { class: 'meta' }, `At level ${next} you choose a path. Every 25 levels after, damage doubles.`));
      else card.append(live(ups, () => { const m = [25, 50, 75, 100, 150, 200, 250, 300, 400, 500].find(l => t.lvl < l); return m ? `Damage doubles at level ${m}.` : ''; }, 'div', { class: 'meta' }));
    }
    card.append(el('div', { class: 'row end' }, btn('Sell (half back)', () => modal('Sell this tower?', (m, close) => { m.append(el('p', {}, `You get half of what it cost back.`), el('div', { class: 'row' }, btn('Keep it', close), btn('Sell', () => { sellTower(G, sel); close(); app.sheetDirty = true; }, 'danger'))); }), 'small danger')));
    body.append(card);
    return;
  }
  // overview
  const wall = el('div', { class: 'card' }, el('h3', {}, 'The Wall'));
  wall.append(live(ups, () => `Level <b>${G.wall.lvl}</b> · ${fmt(G.wall.hp)} / ${fmt(wallMax(G))} strength · mends ${fmt(wallRegen(G))} a second (three times faster with nobody at it)`, 'div', { class: 'meta' }));
  wall.append(buyBtn(ups, () => `Strengthen ${bulkName(app.bulk)}`, () => { const n = app.bulk === Infinity ? Math.max(1, affordN(G.gold, i => wallCost(G.wall.lvl + 1 + i)).n) : app.bulk; return '◉ ' + fmt(bulkCost(n, i => wallCost(G.wall.lvl + 1 + i))); }, () => G.gold >= wallCost(G.wall.lvl + 1), () => upgradeWall(G, app.bulk === Infinity ? 1e9 : app.bulk)));
  body.append(bulkRow(app, ups), wall);
  const steward = el('div', { class: 'card' }, el('h3', {}, 'Royal Steward'), el('div', { class: 'meta' }, 'Spends your gold for you on whichever tower or wall upgrade is cheapest, keeping a tenth back. Good for leaving the game running.'));
  const sb = btn('', () => { G.steward = !G.steward; }, ''); ups.push(() => { sb.textContent = G.steward ? 'Steward is ON — tap to stop' : 'Let the steward spend'; sb.classList.toggle('on', !!G.steward); });
  steward.append(sb); body.append(steward);
  const empty = slotsOf(G) - G.towers.length;
  body.append(el('div', { class: 'row between' }, el('h3', {}, `Towers ${G.towers.length}/${slotsOf(G)}`), empty ? el('span', { class: 'good' }, `${empty} empty — tap a + on the wall`) : null));
  for (const t of [...G.towers].sort((a, b) => a.slot - b.slot)) {
    const T = TOWERS[t.type];
    const row = el('div', { class: 'adv', onclick: () => { app.sel = t.slot; app.sheetDirty = true; } },
      el('div', { class: 'face', style: `background:${T.color}` }, String(t.slot + 1)),
      live(ups, () => `${T.name} <b>${t.lvl}</b><small>${branchDue(t) >= 0 ? '<span class="good">Choose a path!</span>' : `${fmt(towerStats(G, t).dmg)} a shot · ${fmt(t.kills || 0)} kills`}</small>`, 'div', { class: 'who' }));
    row.append(buyBtn(ups, '+1', () => branchDue(t) >= 0 ? null : '◉ ' + fmt(towerCost(t.type, t.lvl + 1, G)), () => branchDue(t) < 0 && G.gold >= towerCost(t.type, t.lvl + 1, G), () => upgradeTower(G, t.slot, 1), 'small good'));
    body.append(row);
  }
  if (empty) body.append(el('div', { class: 'row' }, btn('Build in the widest gap', () => { const s = bestEmptySlot(G); if (s !== null) { app.sel = s; app.sheetDirty = true; } }, 'primary')));
}

// ---------------------------------------------------------------- City
function city(app, body, ups) {
  const G = app.G;
  body.append(el('div', { class: 'card' }, live(ups, () => `<h3>${G.name}, ${cityTitle(G)}</h3><div class="kv"><span>City level</span><span>${G.city.level}</span><span>People</span><span>${fmt(G.city.pop)} of ${fmt(popCap(G))}</span><span>Taxes</span><span class="goldc">${fmt(taxRate(G))} a second</span><span>All income</span><span class="goldc">about ${fmt(G.rates.gold)} gold a second</span><span>Lore</span><span class="lorec">about ${fmt(G.rates.lore)} a second</span><span>Tower spots</span><span>${slotsOf(G)}</span></div><div class="timer"><i style="width:${Math.min(100, G.city.xp / cityXpNeed(G.city.level) * 100)}%"></i></div><div class="meta">The city grows by itself as you defend it: every foe you beat and every coin of tax brings it closer to the next level. Wider walls (more tower spots) come at levels 4, 8, 13, 19, 26…</div>`, 'div')));
  body.append(el('h3', {}, 'Landmarks'), el('p', { class: 'hint' }, 'The only part of the city you look after. Each level gives its bonus again.'), bulkRow(app, ups));
  for (const id in LANDMARKS) {
    const L = LANDMARKS[id]; const open = G.city.level >= L.city;
    const card = el('div', { class: 'card' + (open ? '' : ' dim') }, el('h3', {}, L.name), el('div', {}, L.desc));
    if (!open) { card.append(el('div', { class: 'meta' }, `Built when the city reaches level ${L.city}.`)); body.append(card); continue; }
    card.append(live(ups, () => `Level <b>${G.city.landmarks[id] || 0}</b> · +${Math.round(L.per * 100 * (G.city.landmarks[id] || 0))}% ${statWord(L.stat)}`, 'div', { class: 'meta' }));
    card.append(buyBtn(ups, () => (G.city.landmarks[id] ? 'Improve ' : 'Build ') + bulkName(app.bulk), () => { const lv = G.city.landmarks[id] || 0; const n = app.bulk === Infinity ? Math.max(1, affordN(G.gold, i => landmarkCost(id, lv + i)).n) : app.bulk; return '◉ ' + fmt(bulkCost(n, i => landmarkCost(id, lv + i))); }, () => G.gold >= landmarkCost(id, G.city.landmarks[id] || 0), () => upgradeLandmark(G, id, app.bulk === Infinity ? 1e9 : app.bulk)));
    body.append(card);
  }
}
const STAT_WORDS = { gold: 'gold', pop: 'room for people', tower: 'tower damage', wall: 'wall strength', tavern: 'adventurer arrivals', mage: 'mage damage', lore: 'lore', spell: 'spell damage', quest: 'quest rewards' };
const statWord = s => STAT_WORDS[s] || s;

// ---------------------------------------------------------------- Mages
function mages(app, body, ups) {
  const G = app.G; const slots = mageSlots(G);
  if (!G.city.landmarks.academy) { body.append(el('div', { class: 'card' }, el('h3', {}, 'No Mage Academy yet'), el('p', {}, `Build the Mage Academy in the City tab (it appears at city level ${LANDMARKS.academy.city}). Each court mage casts on their own, all the time.`))); }
  else {
    body.append(el('p', { class: 'hint' }, `Court mages stand by the keep and cast by themselves. Room for ${slots}${slots < 9 ? ' (research Court Patronage for more)' : ''}.`));
    for (const m of G.mages) {
      const S = SCHOOLS[m.school];
      const card = el('div', { class: 'card' }, el('div', { class: 'row' }, el('div', { class: 'face', style: `background:${S.color};width:30px;height:30px;border-radius:50%` }), el('div', { class: 'grow' }, el('h3', {}, m.name), el('div', { class: 'meta' }, `${S.name} — ${S.desc}`))));
      card.append(live(ups, () => `Level <b>${m.lvl}</b> · ${fmt(mageDmg(G, m))} a cast every ${SCHOOLS[m.school].cd}s · ${fmt(m.kills || 0)} kills`, 'div', { class: 'meta' }));
      card.append(el('div', { class: 'row wrap' }, buyBtn(ups, () => `Train ${bulkName(app.bulk)}`, () => { const n = app.bulk === Infinity ? Math.max(1, affordN(G.gold, i => mageLvlCost(m.lvl + 1 + i)).n) : app.bulk; return '◉ ' + fmt(bulkCost(n, i => mageLvlCost(m.lvl + 1 + i))); }, () => G.gold >= mageLvlCost(m.lvl + 1), () => levelMage(G, m.id, app.bulk === Infinity ? 1e9 : app.bulk)),
        btn('Dismiss', () => modal(`Dismiss ${m.name}?`, (mm, close) => { mm.append(el('p', {}, 'Their training is lost.'), el('div', { class: 'row' }, btn('Keep', close), btn('Dismiss', () => { dismissMage(G, m.id); close(); app.sheetDirty = true; }, 'danger'))); }), 'small danger')));
      body.append(card);
    }
    if (G.mages.length) body.append(bulkRow(app, ups));
    if (G.mages.length < slots) {
      body.append(el('h3', {}, 'Hire a mage'));
      for (const id in SCHOOLS) {
        const S = SCHOOLS[id]; const locked = S.unlock && !(G.research[S.unlock] > 0);
        const card = el('div', { class: 'card' + (locked ? ' dim' : '') }, el('h3', { style: `color:${S.color}` }, S.name), el('div', {}, S.desc));
        if (locked) card.append(el('div', { class: 'meta' }, 'Unlocked by research: Astromancy.'));
        else card.append(buyBtn(ups, 'Hire', () => '◉ ' + fmt(mageHireCost(G.mages.length)), () => G.gold >= mageHireCost(G.mages.length), () => { const w = hireMage(G, id, Date.now()); if (!w) app.sheetDirty = true; return w; }));
        body.append(card);
      }
    }
  }
  // the player's own spells: what they do and whether apprentices cast them
  body.append(el('h3', { style: 'margin-top:10px' }, 'Your spells'));
  const auto = bon(G, 'autocast') > 0;
  body.append(el('p', { class: 'hint' }, auto ? 'Turn on "Apprentices cast it" and your spells are cast for you at the thickest crowd (a little weaker than your own aim).' : 'Research Spellwardens (Arcana) and apprentices will cast your spells for you while you are away.'));
  for (const id of SPELL_ORDER) {
    const S = SPELLS[id]; const known = spellKnown(G, id);
    const card = el('div', { class: 'card' + (known ? '' : ' dim') }, el('h3', {}, `${S.key}. ${S.name}`), el('div', {}, S.desc), el('div', { class: 'meta' }, `${S.mana} mana · ready again after ${S.cd}s${S.power ? ` · about ${fmt(spellPower(G) * S.power)} damage` : ''}`));
    if (!known) card.append(el('div', { class: 'meta' }, `Learn it in Research (${RESEARCH.find(r => r.id === S.unlock)?.branch}).`));
    else if (auto) { const b = btn('', () => { G.spells.auto[id] = !G.spells.auto[id]; }, 'small'); ups.push(() => { b.textContent = G.spells.auto[id] ? 'Apprentices cast it: ON' : 'Apprentices cast it: off'; b.classList.toggle('on', !!G.spells.auto[id]); }); card.append(b); }
    body.append(card);
  }
}

// ---------------------------------------------------------------- Guild
function guild(app, body, ups, now) {
  const G = app.G; const g = G.guild; const sub = app.guildTab || 'board';
  const free = g.roster.filter(a => isFree(a, now)).length;
  const tabs = el('div', { class: 'subtabs' });
  for (const [id, label] of [['board', `Quests`], ['away', `Away (${g.active.length})`], ['tavern', `Tavern (${g.visitors.length})`], ['roster', `Heroes ${g.roster.length}/${rosterCap(G)}`], ['log', 'Chronicle'], ...(g.fallen.length ? [['fallen', 'Fallen']] : [])]) tabs.append(btn(label, () => { app.guildTab = id; app.pick = null; app.sheetDirty = true; }, 'small' + (sub === id ? ' on' : '')));
  body.append(tabs);
  if (sub === 'board') {
    if (!g.roster.length) body.append(el('div', { class: 'card' }, el('h3', {}, 'No heroes yet'), el('p', {}, 'Adventuring parties stop at the tavern now and then. Hire some, then send them on quests from here.'), btn('Go to the tavern', () => { app.guildTab = 'tavern'; app.sheetDirty = true; }, 'primary')));
    body.append(el('div', { class: 'row between' }, el('span', { class: 'hint' }, `${free} heroes free. New quests every 30 minutes.`), buyBtn(ups, 'New quests', () => '◉ ' + fmt(rerollCost(G)), () => G.gold >= rerollCost(G), () => { if (G.gold < rerollCost(G)) return 'Not enough gold.'; G.gold -= rerollCost(G); refreshBoard(G, Date.now()); app.pick = null; app.sheetDirty = true; }, 'small')));
    for (const q of g.board) body.append(questCard(app, q, ups));
  } else if (sub === 'away') {
    if (!g.active.length) body.append(el('p', { class: 'hint' }, 'Nobody is out on a quest.'));
    for (const j of g.active) {
      const party = j.party.map(id => g.roster.find(a => a.id === id)).filter(Boolean);
      const len = LENGTHS.find(l => l.id === j.len);
      const card = el('div', { class: 'card' }, el('h3', {}, j.quest.title), el('div', { class: 'meta' }, `${RANK_NAMES[j.quest.rank]} rank · ${len.name} · odds ${Math.round(j.odds * 100)}% (${oddsWord(j.odds)})`), el('div', {}, party.map(a => `${a.name} (${CLASSES[a.cls].name} ${a.lvl})`).join(', ')));
      card.append(live(ups, () => { const n = Date.now(); const f = Math.min(1, (n - j.start) / (j.end - j.start)); return `<div class="timer"><i style="width:${f * 100}%"></i></div><div class="meta">Back in ${dur(j.end - n)} · if they win: ${goldTxt(j.reward.gold)} ${loreTxt(j.reward.lore)}${j.reward.shards ? ' ' + shardTxt(j.reward.shards) : ''}, relic chance ${Math.round(j.reward.relic * 100)}%</div>`; }, 'div'));
      card.append(el('div', { class: 'row end' }, btn('Call them home (no reward)', () => { recallQuest(G, j.id); app.sheetDirty = true; }, 'small')));
      body.append(card);
    }
  } else if (sub === 'tavern') {
    body.append(live(ups, () => `<p class="hint">Parties stop here on their travels and move on after a while. Next arrival in about ${dur(Math.max(0, g.nextVisitAt - Date.now()))}. Barracks: ${g.roster.length}/${rosterCap(G)}.</p>`, 'div'));
    if (!g.visitors.length) body.append(el('p', { class: 'hint' }, 'Nobody in the tavern right now.'));
    for (const p of g.visitors) {
      const card = el('div', { class: 'card' }, el('h3', {}, p.name), live(ups, () => `<div class="meta">Leaving in ${dur(p.leaveAt - Date.now())}</div>`, 'div'));
      for (const a of p.members) card.append(advRow(a, now, buyBtn(ups, 'Hire', () => '◉ ' + fmt(hireCost(a)), () => G.gold >= hireCost(a) && g.roster.length < rosterCap(G), () => { const w = hire(G, p.id, a.id); if (!w) app.sheetDirty = true; return w; }, 'small good')));
      const all = p.members.reduce((s, a) => s + hireCost(a), 0);
      card.append(buyBtn(ups, `Hire the whole party`, () => '◉ ' + fmt(all), () => G.gold >= all && g.roster.length + p.members.length <= rosterCap(G), () => { const w = hire(G, p.id, null); if (!w) app.sheetDirty = true; return w; }, 'primary'));
      body.append(card);
    }
  } else if (sub === 'roster') {
    if (!g.roster.length) body.append(el('p', { class: 'hint' }, 'No heroes yet. Hire some at the tavern.'));
    body.append(el('p', { class: 'hint' }, 'Heroes at home fight from the walls. Hurt heroes rest until they heal.'));
    for (const a of [...g.roster].sort((x, y) => y.lvl - x.lvl)) {
      body.append(advRow(a, now, a.busy ? null : btn('Let go', () => modal(`Let ${a.name} go?`, (m, close) => { m.append(el('p', {}, 'They leave the guild for good.'), el('div', { class: 'row' }, btn('Keep', close), btn('Let go', () => { dismiss(G, a.id); close(); app.sheetDirty = true; }, 'danger'))); }), 'small'), true));
    }
  } else if (sub === 'log') {
    if (!g.log.length) body.append(el('p', { class: 'hint' }, 'Stories of your heroes will be written here.'));
    for (const r of g.log.slice(0, 40)) body.append(reportCard(r));
  } else if (sub === 'fallen') {
    body.append(el('p', { class: 'hint' }, 'Heroes who did not come back. Starshards can bring one back.'));
    for (const a of g.fallen) body.append(advRow(a, now, buyBtn(ups, 'Bring back', () => '✦ ' + reviveCost(a), () => G.shards >= reviveCost(a) && g.roster.length < rosterCap(G), () => { const w = revive(G, a.id); if (!w) app.sheetDirty = true; return w; }, 'small')));
  }
}
export function reportCard(r) {
  const c = el('div', { class: 'card rel', style: `border-left-color:${r.won ? '#8aea7a' : '#ff6a5a'}` }, el('h3', {}, `${r.won ? 'Success' : 'Failed'}: ${r.title}`), el('div', { class: 'meta' }, `${RANK_NAMES[r.rank]} rank · ${r.party.join(', ')}`));
  for (const l of r.lines) c.append(el('div', { class: 'story' }, l));
  const bits = [];
  if (r.won) { bits.push(`◉ ${fmt(r.gold)} gold`, `✎ ${fmt(r.lore)} lore`); if (r.shards) bits.push(`✦ ${r.shards} starshards`); if (r.relic) bits.push(`Relic: ${RELICS[r.relic].name}`); }
  else bits.push('Came home empty-handed.');
  if (r.hurt.length) bits.push(`Hurt: ${r.hurt.join(', ')}`);
  if (r.fell.length) bits.push(`Lost: ${r.fell.join(', ')}`);
  if (r.levels.length) bits.push(...r.levels);
  c.append(el('div', { class: r.won ? 'good' : 'bad' }, bits.join(' · ')));
  return c;
}
function advRow(a, now, action, full = false) {
  const C = CLASSES[a.cls]; const hurt = (a.injuredUntil || 0) > now;
  const status = a.dead ? `Fell on ${a.fellOn}` : a.busy ? 'Away on a quest' : hurt ? `Hurt — rests ${dur(a.injuredUntil - now)}` : 'Ready';
  const who = el('div', { class: 'who', html: `<b>${a.name}</b> · ${RACES[a.race].name} ${C.name} <b>${a.lvl}</b><small>${TRAITS[a.trait].name}: ${TRAITS[a.trait].desc}${full ? ` · ${status} · ${a.wins}/${a.quests} quests won` : ''}</small>` });
  const row = el('div', { class: 'adv' + ((a.busy || hurt) && full ? ' off' : '') }, el('div', { class: 'face', style: `background:${C.color}` }, C.name[0]), who, action);
  tip(row, () => `Power ${fmt(advPower(a))} · good with ${C.tags.map(t => TAG_WORDS[t]).join(', ')} · role: ${C.role === 'tank' ? 'front line' : C.role === 'heal' ? 'healer' : C.role === 'skill' ? 'skills' : 'damage'}${full ? ` · ${fmt(a.xp)}/${fmt(advXpNeed(a.lvl))} xp` : ''}`);
  return row;
}
function questCard(app, q, ups) {
  const G = app.G; const now = Date.now();
  const open = app.pick?.q === q.id;
  const card = el('div', { class: 'card' + (open ? ' sel' : '') });
  card.append(el('h3', {}, q.title), el('div', { class: 'meta' }, `${RANK_NAMES[q.rank]} rank · needs someone good with `, ...q.needs.map(n => el('span', { class: 'pill' }, TAG_WORDS[n]))));
  if (!open) {
    const best = suggestParty(G, q, now); const o = best.length ? questOdds(G, q, best).odds : 0;
    card.append(el('div', { class: 'meta' }, best.length ? `Best party you have now: ` : 'Nobody free to send.', best.length ? el('span', { class: 'odds ' + (o >= 0.65 ? 'hi' : o >= 0.4 ? 'mid' : 'lo') }, `${Math.round(o * 100)}% — ${oddsWord(o)}`) : ''));
    card.append(btn('Plan this quest', () => { app.pick = { q: q.id, len: 'half', party: suggestParty(G, q, Date.now(), LENGTHS[1]).map(a => a.id) }; app.sheetDirty = true; }, best.length ? 'primary' : '', { disabled: !best.length || null }));
    return card;
  }
  const P = app.pick; const len = LENGTHS.find(l => l.id === P.len) || LENGTHS[0];
  const lrow = el('div', { class: 'row wrap' }, el('span', { class: 'hint' }, 'How long:'));
  for (const L of LENGTHS) lrow.append(btn(L.label, () => { P.len = L.id; app.sheetDirty = true; }, 'small' + (P.len === L.id ? ' on' : '')));
  card.append(lrow, el('div', { class: 'meta' }, 'Longer quests bring back much more, and a little more planning makes them a little safer.'));
  const party = () => P.party.map(id => G.guild.roster.find(a => a.id === id)).filter(Boolean);
  card.append(live(ups, () => {
    const p = party(); const r = questReward(G, q, len); const o = p.length ? questOdds(G, { ...q, lengthOdds: lenOdds(len) }, p) : null;
    return `<div class="kv"><span>Odds</span><span>${o ? `<b class="odds ${o.odds >= 0.65 ? 'hi' : o.odds >= 0.4 ? 'mid' : 'lo'}">${Math.round(o.odds * 100)}% — ${oddsWord(o.odds)}</b>` : 'pick a party'}</span><span>Takes</span><span>${dur(questDuration(G, len, p))}</span><span>If they win</span><span>${goldTxt(r.gold)} ${loreTxt(r.lore)} ${r.shards ? shardTxt(r.shards) : ''} · relic chance ${Math.round(r.relic * 100)}%</span><span>If they fail</span><span>Nothing. Some may come back hurt${q.rank >= 3 ? ', and on a hopeless try someone may not come back' : ''}.</span></div>${o && o.why.length ? `<div class="meta">${o.why.join(' · ')}</div>` : ''}`;
  }, 'div'));
  card.append(el('div', { class: 'row wrap' }, btn('Best party', () => { P.party = suggestParty(G, q, Date.now(), len).map(a => a.id); app.sheetDirty = true; }, 'small'), btn('Clear', () => { P.party = []; app.sheetDirty = true; }, 'small'), el('span', { class: 'hint' }, 'Tap heroes to add or remove (up to 5).')));
  for (const a of G.guild.roster) {
    const on = P.party.includes(a.id); const ok = isFree(a, now);
    const row = advRow(a, now, null);
    row.classList.toggle('picked', on); if (!ok) row.classList.add('off');
    row.addEventListener('click', () => { if (!ok) return; if (on) P.party = P.party.filter(x => x !== a.id); else if (P.party.length < 5) P.party.push(a.id); else toast('Five at most.', 'bad'); app.sheetDirty = true; });
    card.append(row);
  }
  card.append(el('div', { class: 'row' }, btn('Cancel', () => { app.pick = null; app.sheetDirty = true; }), btn('Send them', () => { const w = sendQuest(G, q.id, P.len, P.party, Date.now()); if (w) return toast(w, 'bad'); toast(`The party sets out: ${q.title}.`, 'good'); app.pick = null; app.sheetDirty = true; app.save?.(); }, 'primary')));
  return card;
}

// ---------------------------------------------------------------- Research
function research(app, body, ups) {
  const G = app.G; const sub = app.resTab || 'Masonry';
  const tabs = el('div', { class: 'subtabs' }); for (const b of ['Masonry', 'Arcana', 'Civics', 'Fellowship']) tabs.append(btn(b, () => { app.resTab = b; app.sheetDirty = true; }, 'small' + (sub === b ? ' on' : '')));
  body.append(tabs, el('p', { class: 'hint' }, 'Research is paid in lore, earned from every foe and every quest.'), bulkRow(app, ups));
  for (const r of RESEARCH.filter(x => x.branch === sub)) {
    const open = researchOpen(G, r); const rank = () => G.research[r.id] || 0;
    const card = el('div', { class: 'card' + (open ? '' : ' dim') }, el('h3', {}, r.name), el('div', {}, r.desc));
    if (!open) { card.append(el('div', { class: 'meta' }, 'Needs: ' + r.req.map(id => RESEARCH.find(x => x.id === id).name).join(', '))); body.append(card); continue; }
    card.append(live(ups, () => r.max === 1 ? (rank() ? '<span class="good">Learned</span>' : '') : `Rank <b>${rank()}</b> / ${r.max}`, 'div', { class: 'meta' }));
    card.append(live(ups, () => { const f = researchEffect(G, r); if (!f) return ''; return (r.max === 1 && !rank() ? '' : `Now: <b>${f.now}</b>`) + (f.next ? `${r.max === 1 && !rank() ? '' : '<br>'}${r.max === 1 ? 'Learn it' : 'Next rank'}: <span class="good">${f.next}</span>` : ''); }, 'div', { class: 'meta fxline' }));
    card.append(buyBtn(ups, () => rank() >= r.max ? 'Done' : r.max === 1 ? 'Learn' : `Study ${bulkName(app.bulk)}`, () => { if (rank() >= r.max) return null; const n = r.max === 1 ? 1 : app.bulk === Infinity ? Math.max(1, affordN(G.lore, i => researchCost(r, rank() + i), r.max - rank()).n) : Math.min(app.bulk, r.max - rank()); return '✎ ' + fmt(bulkCost(n, i => researchCost(r, rank() + i))); }, () => rank() < r.max && G.lore >= researchCost(r, rank()), () => { const w = buyResearch(G, r.id, app.bulk === Infinity ? 1e9 : app.bulk); if (!w) app.sheetDirty = true; return w; }));
    body.append(card);
  }
}

// ---------------------------------------------------------------- Realm: relics, legacy, a new realm, records
function realm(app, body, ups) {
  const G = app.G; const sub = app.realmTab || 'relics';
  const tabs = el('div', { class: 'subtabs' }); for (const [id, l] of [['relics', 'Relics'], ['found', 'New realm'], ['legacy', `Legacy (${G.crowns} 👑)`], ['records', 'Records']]) tabs.append(btn(l, () => { app.realmTab = id; app.sheetDirty = true; }, 'small' + (sub === id ? ' on' : '')));
  body.append(tabs);
  if (sub === 'relics') {
    const have = Object.keys(G.relics);
    body.append(el('p', { class: 'hint' }, `Relics are brought home by your heroes and kept forever, even in a new realm. A second copy, or starshards, makes one stronger. You have ${have.length} of ${Object.keys(RELICS).length}.`));
    for (const id of Object.keys(RELICS).sort((a, b) => RELICS[b].rar - RELICS[a].rar)) {
      const R = RELICS[id]; const lv = G.relics[id] || 0;
      const card = el('div', { class: 'card rel' + (lv ? '' : ' dim'), style: `border-left-color:${RARITY_COLOR[R.rar]}` }, el('h3', { style: `color:${RARITY_COLOR[R.rar]}` }, lv ? R.name : '???'), el('div', { class: 'meta' }, `${RARITY[R.rar]}${lv ? ` · level ${lv}` : ' · not found yet'}`), el('div', {}, R.desc));
      if (lv) card.append(buyBtn(ups, 'Strengthen', () => '✦ ' + relicLevelCost(G.relics[id]), () => G.shards >= relicLevelCost(G.relics[id]), () => levelRelic(G, id), 'small'));
      body.append(card);
    }
  } else if (sub === 'found') {
    const c = crownsFor(G);
    body.append(el('div', { class: 'card' }, el('h3', {}, 'Found a new realm'), el('p', {}, 'Your people set out to build again somewhere new. The city, its towers, mages, walls and research start over — but you keep every relic, your starshards, your guild of heroes, and you earn Crowns to spend on Legacy: bonuses that last forever. Each new realm brings new foes and a new bonus.'),
      live(ups, () => crownsFor(G) > 0 ? `<p class="good">Founding now earns <b>${crownsFor(G)} Crowns</b> (more the further you have pushed: best wave ${G.wave.best}).</p>` : `<p class="bad">Reach wave ${PRESTIGE_WAVE} first (best so far: ${G.wave.best}).</p>`, 'div')));
    for (const id in REALMS) {
      const R = REALMS[id]; const ok = realmOpen(G, id);
      const card = el('div', { class: 'card' + (ok ? '' : ' dim') }, el('h3', {}, R.name), el('div', {}, R.desc));
      if (!ok) card.append(el('div', { class: 'meta' }, `Opens after founding ${R.need} realm${R.need > 1 ? 's' : ''}.`));
      else card.append(buyBtn(ups, `Found a city in ${R.name}`, () => null, () => crownsFor(G) > 0, () => { app.confirmRealm(id); }, 'primary'));
      body.append(card);
    }
  } else if (sub === 'legacy') {
    body.append(el('p', { class: 'hint' }, 'Spend Crowns on bonuses that last through every realm you ever found.'));
    for (const l of LEGACY) {
      const rank = () => G.legacy[l.id] || 0;
      const card = el('div', { class: 'card' }, el('h3', {}, l.name), el('div', {}, l.desc), live(ups, () => `Rank <b>${rank()}</b> / ${l.max}`, 'div', { class: 'meta' }));
      card.append(buyBtn(ups, 'Buy', () => rank() >= l.max ? null : '👑 ' + legacyCost(l, rank()), () => rank() < l.max && G.crowns >= legacyCost(l, rank()), () => buyLegacy(G, l.id), 'small'));
      body.append(card);
    }
  } else {
    const T = G.totals;
    body.append(el('div', { class: 'card' }, live(ups, () => `<div class="kv"><span>Realm</span><span>${REALMS[G.realm].name} (${G.founded} founded before)</span><span>Played</span><span>${dur(G.playTime * 1000)}</span><span>Best wave here</span><span>${G.wave.best}</span><span>Best wave ever</span><span>${Math.max(G.bestEver || 0, G.wave.best)}</span><span>Walls breached</span><span>${G.wave.falls}</span><span>Foes beaten</span><span>${fmt(T.kills)}</span><span>Siege leaders</span><span>${fmt(T.bosses)}</span><span>Waves held</span><span>${fmt(T.waves)}</span><span>Spells cast</span><span>${fmt(T.spells)}</span><span>Quests won</span><span>${fmt(T.questsWon)} of ${fmt(T.quests)}</span><span>Gold earned</span><span>${fmt(T.gold)}</span><span>Lore earned</span><span>${fmt(T.lore)}</span></div>`, 'div')));
  }
}

export const BUILDERS = { defend, city, mages, guild, research, realm };
/** What the sheet looks like structurally; a change rebuilds it. */
export function sheetSig(app, tab, now) {
  const G = app.G; const g = G.guild;
  switch (tab) {
    case 'defend': return `${app.sel}|${G.towers.map(t => t.slot + t.type + (branchDue(t) >= 0 ? 'b' : '') + t.br.join()).join()}|${slotsOf(G)}`;
    case 'city': return `${G.city.level}`;
    case 'mages': return `${G.mages.map(m => m.id).join()}|${mageSlots(G)}|${G.city.landmarks.academy ? 1 : 0}|${SPELL_ORDER.filter(id => spellKnown(G, id)).join()}|${bon(G, 'autocast')}|${G.research.mg_astro || 0}`;
    case 'guild': return `${app.guildTab}|${g.board.map(q => q.id).join()}|${g.active.map(j => j.id).join()}|${g.visitors.map(p => p.id + p.members.length).join()}|${g.roster.map(a => a.id + ':' + a.lvl + ':' + (a.busy ? 'b' : '') + ((a.injuredUntil || 0) > now ? 'h' : '')).join()}|${g.log.length}|${g.fallen.length}|${JSON.stringify(app.pick)}`;
    case 'research': return `${app.resTab}|${RESEARCH.map(r => researchOpen(G, r) ? 1 : 0).join('')}`;
    case 'realm': return `${app.realmTab}|${Object.keys(G.relics).join()}|${G.founded}`;
  }
  return '';
}
/** A green dot on a tab when there is something worth looking at. */
export function tabDot(app, tab, now) {
  const G = app.G;
  switch (tab) {
    case 'defend': return G.towers.some(t => branchDue(t) >= 0) || (G.towers.length < slotsOf(G) && G.gold >= 40);
    case 'guild': return G.guild.visitors.length > 0 && G.guild.roster.length < rosterCap(G) || (G.guild.board.length && G.guild.roster.some(a => isFree(a, now)) && G.guild.active.length < 1);
    case 'mages': return G.city.landmarks.academy && G.mages.length < mageSlots(G) && G.gold >= mageHireCost(G.mages.length);
    case 'research': return RESEARCH.some(r => researchOpen(G, r) && r.max === 1 && !(G.research[r.id]) && G.lore >= r.cost);
    case 'realm': return crownsFor(G) > 0 && G.founded === 0;
  }
  return false;
}
