// Trade skills (key K, the ☰ menu, the HUD; owner 2026-11-25: "Move enchanting to its own menu, the player does trade
// skills, not the shrine"). The player's own window, usable anywhere but in the middle of a fight (the server says why
// it refuses). Its first trade is Enchanting — Smithing and Alchemy are parked for a later round, so no empty tabs.
//
//   Enchanting: your skill (level, the next point, what it gives now, the milestone perks), then LOOK, THEN COMMIT like
//   the shop (win-services.js pick kit): pick a magic-or-better item in your bag → the pane shows its card, what
//   breaking it teaches, and "Break it"; pick a piece of your gear → the pane shows its card, the enchantments you know
//   with what each would add (or why it cannot go on), and "Enchant — N gold".
//
//   app.openWindow('trade') → .ow-trade  ([data-pick="break:bag:…" | "put:gear:…" | "put:bag:…"], [data-opt], [data-commit])
import { openWin, esc, ask, findWin } from './kit.js';
import { tipAttrs, itemCardHtml } from './tip.js';
import { glyph, uiIcon } from './icons.js';
import { fmt } from '../../../../../shared/format.js';
import { itemCell, wirePick, dropGonePick, pickFoot, pickRef, cellTips, pickWatch } from './win-services.js';
import { affixTemplate, enchantRefusal, enchantPrice, enchantsOn, learnable } from '../../rules/inventory.js';
import { skillValue, xpToNext, enchantPower, enchantSlots } from '../../rules/skills-use.js';
import { enchantLine } from '../../rules/describe.js';
import { rollAffixValue } from '../../rules/farhold.js';
import { sheetOf } from '../../rules/sheet.js';

const ENCH_ITEM = it => it && (it.type === 'weapon' || it.type === 'armor' || it.type === 'accessory');
const pct = v => `${fmt(Math.round(v * 100))}%`;
const affixName = (rules, id) => affixTemplate(rules, id)?.name || 'An old enchantment';

/** The Enchanting skill card: level, progress to the next point, what it gives now, the milestone perks. */
function skillCard(app, c, sheet) {
  const def = app.rules.data.skillsUse.skills.enchanting;
  const max = app.rules.data.skillsUse.max;
  const v = skillValue(c, 'enchanting');
  const xp = c.skills?.enchanting?.xp || 0, need = xpToNext(app.rules, v);
  const share = v >= max ? 1 : Math.max(0, Math.min(1, xp / need));
  const perks = Object.entries(def.perks || {}).map(([at, p]) => {
    const have = v >= +at;
    const text = p.text.replace('{pct}', pct(p.value)).replace('{n}', fmt(p.value));
    return `<li class="ow-trade-perk${have ? ' is-have' : ''}" tabindex="0" ${tipAttrs('text', { title: p.name, kind: have ? 'You have it' : `At Enchanting ${at}`, text })}><b>${fmt(+at)}</b><span>${esc(p.name)}</span></li>`;
  }).join('');
  return `<section class="ow-trade-skill ow-card">
    <div class="ow-trade-skill-ico">${uiIcon('prof_enchanting', 56)}</div>
    <div class="ow-trade-skill-main">
      <div class="ow-trade-skill-head"><h3 ${tipAttrs('skill', { id: 'enchanting' })} tabindex="0">Enchanting</h3><span class="ow-trade-lvl">${fmt(v)} <small>/ ${fmt(max)}</small></span></div>
      <div class="ow-trade-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(share * 100)}"><i></i></div>
      <p class="ow-trade-next">${v >= max ? 'Mastered.' : `Next point: ${fmt(Math.round(xp))} / ${fmt(Math.round(need))} — breaking an item or enchanting one trains it.`}</p>
      <dl class="ow-trade-stats">
        <div><dt>Strength</dt><dd>${pct(enchantPower(app.rules, c))} of a fresh roll</dd></div>
        <div><dt>Per item</dt><dd>${fmt(enchantSlots(app.rules, c, sheet.enchantSlots || 0))} of yours</dd></div>
        <div><dt>Known</dt><dd>${fmt((c.enchant?.known || []).length)}</dd></div>
      </dl>
    </div>
    <ul class="ow-trade-perks">${perks}</ul>
  </section>`;
}

export function open(app, opts = {}) {
  const fresh = !findWin('trade');
  const w = openWin({
    id: 'trade', title: 'Trade skills', sub: 'Enchanting', size: 'wide', cls: 'ow-trade ow-pickwin',
    render(body, tab, w) {
      const c = app.me?.char; if (!c) return '';
      const sheet = sheetOf(app.rules, c);
      const learnFrom = app.rules.data.inventory.enchanting.learnFrom;
      const breakable = (c.bag || []).filter(it => learnFrom.includes(it.rarity));
      const known = c.enchant?.known || [];
      const slots = enchantSlots(app.rules, c, sheet.enchantSlots || 0);
      const targets = [...Object.entries(c.gear || {}).filter(([, it]) => ENCH_ITEM(it)).map(([s, it]) => ({ it, ref: `gear:${s}` })), ...(c.bag || []).filter(ENCH_ITEM).map(it => ({ it, ref: `bag:${it.id}` }))];
      dropGonePick(w, [...breakable.map(it => `break:bag:${it.id}`), ...targets.map(t => `put:${t.ref}`)]);
      const tip = cellTips(app);
      body.innerHTML = `${skillCard(app, c, sheet)}
        <section class="ow-section"><h3>${glyph('trash', 18)} Break an item to learn</h3>
          ${breakable.length ? `<div class="ow-shop-grid">${breakable.map(it => {
            const L = learnable(app.rules, c, it);
            return itemCell(it, { ref: `bag:${it.id}`, pick: `break:bag:${it.id}`, sel: w.data.sel === `break:bag:${it.id}`, tip, disabled: !L.fresh.length, extra: `<span class="ow-wcell-note${L.fresh.length ? ' ow-good' : ''}">${L.fresh.length ? `${fmt(L.fresh.length)} new to learn` : 'Nothing new'}</span>` });
          }).join('')}</div>` : '<p class="ow-empty">Magic, rare and legendary items in your bag can be broken to learn what they carry. You have none right now.</p>'}
        </section>
        <section class="ow-section"><h3>${glyph('scroll', 18)} Enchantments you know <span class="ow-shop-n">${fmt(known.length)}</span></h3>
          ${known.length ? `<div class="ow-svc-known">${known.map(id => `<span class="ow-svc-chip">${esc(affixName(app.rules, id))}</span>`).join('')}</div>` : '<p class="ow-empty">None yet. Break a magic item to learn your first.</p>'}
        </section>
        <section class="ow-section"><h3>${glyph('enchant', 18)} Put one on your gear</h3>
          ${targets.length ? `<div class="ow-shop-grid">${targets.map(t => {
            const on = enchantsOn(t.it);
            return itemCell(t.it, { ref: t.ref, pick: `put:${t.ref}`, sel: w.data.sel === `put:${t.ref}`, tip, extra: `<span class="ow-wcell-note">${t.ref.startsWith('gear:') ? 'Worn · ' : ''}${fmt(on)} / ${fmt(slots)} of yours</span>` });
          }).join('')}</div>` : '<p class="ow-empty">Nothing to enchant: weapons, armour and jewellery take enchantments.</p>'}
        </section>`;
      const bar = body.querySelector('.ow-trade-bar');
      bar.querySelector('i').style.width = `${bar.getAttribute('aria-valuenow')}%`;
      wirePick(app, w, body);
    },
    foot(f, w) {
      const c = app.me?.char; if (!c) return;
      const k = w.data.sel, ref = pickRef(k);
      const it = ref ? app.itemRef(ref) : null;
      if (!it) { pickFoot(app, f, w, { empty: 'Pick an item to break or to enchant.' }); return; }
      if (k.startsWith('break:')) {
        const L = learnable(app.rules, c, it);
        const names = L.fresh.map(id => `<b>${esc(affixName(app.rules, id))}</b>`).join(', ');
        const more = `<div class="ow-pick-note">${L.fresh.length
          ? `<p>Breaking it destroys it and teaches you ${L.n > 1 ? `${fmt(L.n)} of these` : L.fresh.length > 1 ? 'one of these' : 'this'}: ${names}.</p>`
          : '<p class="ow-bad">You already know every enchantment it carries.</p>'}</div>`;
        pickFoot(app, f, w, {
          card: itemCardHtml(app, ref), more,
          act: { label: L.n > 1 ? `Break it — learn ${fmt(L.n)}` : 'Break it — learn 1', kind: 'danger', icon: glyph('trash', 18), disabled: !L.fresh.length, sub: L.fresh.length ? '' : 'Nothing new on it',
            run: async () => { if (await ask({ title: `Break ${it.name}?`, text: 'The item is destroyed and you learn an enchantment it carries.', ok: 'Break it', cancel: 'Keep it', danger: true })) app.act('disenchant', { item: it.id }); } },
        });
        return;
      }
      // put one on: the enchantments you know, each with what it would add or why it cannot go on
      const sheet = sheetOf(app.rules, c);
      const known = c.enchant?.known || [];
      const power = enchantPower(app.rules, c);
      const price = enchantPrice(app.rules, it);
      const roll = (def, ilvl) => rollAffixValue(def, ilvl, () => 0.5);
      if (w.data.opt && !known.includes(w.data.opt)) w.data.opt = null;
      const rows = known.map(id => {
        const why = enchantRefusal(app.rules, c, it, id, { sheet });
        const goldOnly = why && /^Enchanting costs/.test(why);
        const line = enchantLine(affixTemplate(app.rules, id), { ilvl: it.ilvl || 1, power, roll });
        const on = w.data.opt === id;
        return `<button type="button" class="ow-pick-opt${on ? ' is-sel' : ''}${why && !goldOnly ? ' is-no' : ''}" data-opt="${esc(id)}" aria-pressed="${on}">
          <span class="ow-pick-opt-dot" aria-hidden="true"></span>
          <span class="ow-pick-opt-text"><b>${esc(affixName(app.rules, id))}</b>${line ? `<small>About ${esc(line)}</small>` : ''}${why && !goldOnly ? `<small class="ow-bad">${esc(why)}</small>` : ''}</span>
        </button>`;
      }).join('');
      const more = `<div class="ow-pick-opts" role="radiogroup" aria-label="Your enchantments"><h4>Choose an enchantment</h4>${rows || '<p class="ow-dim">Learn one first: break a magic item.</p>'}</div>`;
      const why = w.data.opt ? enchantRefusal(app.rules, c, it, w.data.opt, { sheet }) : null;
      const act = known.length ? {
        label: `Enchant — ${fmt(price)} gold`, icon: glyph('enchant', 18),
        disabled: !w.data.opt || !!why,
        sub: !w.data.opt ? 'Choose an enchantment' : why ? (/^Enchanting costs/.test(why) ? `${fmt(price - (c.gold || 0))} gold short` : 'It cannot go on this') : '',
        run: () => app.act('enchant', { item: it.id, affix: w.data.opt }),
      } : null;
      pickFoot(app, f, w, { card: itemCardHtml(app, ref), more, act });
      f.querySelectorAll('[data-opt]').forEach(b => {
        b.onclick = () => {
          w.data.opt = b.dataset.opt; w.render();
          w.footEl?.querySelector('[data-commit]:not([disabled])')?.focus({ preventScroll: true });
        };
      });
    },
  });
  return pickWatch(app, w, fresh);
}
