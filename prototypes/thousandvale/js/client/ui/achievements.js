// Achievements and trophies (feedback #106, 2026-10-21) — the window (Y, the menu bar's cup, the pause menu) and the
// moment one is earned. The server keeps them (js/sim/achievements.js); this asks for the list (`ach {op:'list'}` ->
// `achList`) each time the window opens and shows `ach` / `trophy` as they land: a callout, a chat line you can click to
// open the window, and the reward ("posted to you") in words.
//
//   const A = createAchievementsWindow({ net, hud, chat })    A.panel, A.wire(net), A.state
// `chat.linkThing(kind, id)` (js/client/chat.js) puts a link to an earned achievement or trophy in the chat box.

import { createPanel, h } from '../ui-panel.js';

export function createAchievementsWindow({ net, hud, chat = null }) {
  const S = { list: null, trophies: [], points: 0, of: 0, tab: 'ach', got: 0 };
  const panel = createPanel({ id: 'achievements', title: 'Achievements', width: 520, cls: 'ach-panel centered', onOpen: () => { draw(); net()?.achievements?.(); } });

  const linkBtn = (kind, id) => (chat?.linkThing ? h('button.ghost.small.ach-link', { type: 'button', dataset: { tip: 'Put a link to it in the chat box' }, onclick: () => chat.linkThing(kind, id) }, 'Link') : null);
  const when = t => { if (!t) return ''; const d = new Date(t); return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };

  function draw() {
    panel.setTitle('Achievements', S.list ? `${S.points} of ${S.of} earned` : 'Loading…');
    const tabs = h('div.chips.ach-tabs', { role: 'tablist' }, ...[['ach', 'Achievements'], ['trophies', `Trophies${S.trophies.length ? ` (${S.trophies.length})` : ''}`]].map(([id, label]) =>
      h('button.chip', { type: 'button', role: 'tab', 'aria-checked': String(S.tab === id), dataset: { tab: id }, onclick: () => { S.tab = id; draw(); } }, label)));
    if (!S.list) { panel.fill(tabs, h('p.dim', {}, 'Asking the realm…')); return; }
    if (S.tab === 'trophies') {
      const shelf = S.trophies.length
        ? h('div.ach-shelf', {}, ...S.trophies.map(t => h('div.ach-trophy' + (t.kind === 'realmFirst' || t.kind === 'realmFirstEvent' ? '.first' : ''), { dataset: { id: t.id } },
          h('div.ach-cup', { 'aria-hidden': 'true' }, t.kind === 'realmFirst' || t.kind === 'realmFirstEvent' ? '★' : '🏆'),
          h('strong', {}, t.name, t.n > 1 ? h('small', {}, ` ×${t.n}`) : null), h('span.dim', {}, t.desc), h('span.dim.tiny', {}, when(t.at)), linkBtn('trophy', t.id))))
        : h('p.dim', {}, 'No trophies yet. Help bring down a world boss or break a siege — and be the first in the realm to do something for a Realm First.');
      panel.fill(tabs, shelf);
      return;
    }
    const cats = [...new Set(S.list.map(a => a.cat))];
    panel.fill(tabs, h('div.ach-list', {}, ...cats.map(c => h('section', {}, h('h4', {}, c, h('small.dim', {}, ` ${S.list.filter(a => a.cat === c && a.done).length}/${S.list.filter(a => a.cat === c).length}`)),
      ...S.list.filter(a => a.cat === c).map(a => h('div.ach-row' + (a.done ? '.done' : ''), { dataset: { id: a.id } },
        h('div.ach-mark', { 'aria-hidden': 'true' }, a.done ? '✓' : ''),
        h('div.ach-main', {}, h('strong', {}, a.name, a.first ? h('small.ach-first', { dataset: { tip: 'The first in the realm to earn this also gets a Realm First trophy.' } }, ' realm first') : null), h('span.dim', {}, a.desc),
          !a.done && a.of > 1 ? h('div.bar.ach-bar', {}, h('i', { style: `width:${Math.round(100 * Math.min(1, a.n / a.of))}%` }), h('span', {}, `${a.n} / ${a.of}`)) : null,
          a.reward ? h('span.ach-reward', {}, a.done ? `Reward: ${a.reward} (posted to you)` : `Reward: ${a.reward}`) : null),
        a.done ? h('div.ach-side', {}, h('span.dim.tiny', {}, when(a.done)), linkBtn('ach', a.id)) : null))))));
  }

  function wire(n) {
    n.on('achList', m => { S.list = m.list || []; S.trophies = m.trophies || []; S.points = m.points || 0; S.of = m.of || S.list.length; if (panel.isOpen) draw(); });
    n.on('ach', m => {
      S.got++;
      hud.callout?.(`Achievement: ${m.name}`, 'victory');
      hud.toast(`Achievement earned: ${m.name}${m.reward ? ` — ${m.reward} is in the post` : ''}`, 'good');
      chat?.systemLink?.(`Achievement earned: `, { kind: 'ach', id: m.id, label: m.name, desc: m.desc }, m.reward ? ` — your reward (${m.reward}) is in the post.` : '');
      if (panel.isOpen) net()?.achievements?.();
    });
    n.on('trophy', m => {
      hud.callout?.(m.kind === 'realmFirst' || m.kind === 'realmFirstEvent' ? m.name : `Trophy: ${m.name}`, 'victory');
      hud.toast(`Trophy${m.n > 1 ? ` (×${m.n})` : ''}: ${m.name}`, 'good');
      chat?.systemLink?.('Trophy: ', { kind: 'trophy', id: m.id, label: m.name, desc: m.desc }, m.n > 1 ? ` (×${m.n})` : '');
      if (panel.isOpen) net()?.achievements?.();
    });
  }
  /** The gallery's scene (js/client/gallery/scenes.js): the window with a made-up character's progress — a few earned, some under way, two trophies. */
  async function demo() {
    let d = null; try { d = await (await fetch(new URL('../../../data/rules/achievements.json', import.meta.url))).json(); } catch { /* none */ }
    const list = (d?.achievements || []).map((a, i) => ({ id: a.id, cat: a.cat || 'Other', name: a.name, desc: a.desc, of: a.n, n: Math.min(a.n, Math.round(a.n * [1, 0.4, 1, 0.1, 0.7][i % 5])), done: [0, 2].includes(i % 5) ? Date.now() - i * 86400000 : 0, reward: a.reward ? (a.reward.gold ? `${a.reward.gold} gold` : `a gift box (${a.reward.gift.minRarity} or better)`) : '', first: !!a.first }));
    S.list = list; S.points = list.filter(x => x.done).length; S.of = list.length;
    S.trophies = [{ id: 'worldboss:grim', kind: 'worldboss', name: 'Grimtallow, the Siege-Husk Felled', desc: 'Helped bring down Grimtallow, the Siege-Husk.', n: 3, at: Date.now() - 2 * 86400000 }, { id: 'realmFirst:lv20', kind: 'realmFirst', name: 'Realm First: Twenty', desc: 'The first in the realm to reach level 20.', n: 1, at: Date.now() - 86400000 }];
    panel.open(); draw();
  }
  return { panel, wire, draw, demo, get state() { return { ...S, list: S.list ? S.list.length : null, open: panel.isOpen }; } };
}
