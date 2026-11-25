// Talking to someone (server 'win' kind 'talk'): their name and title, what they say, and the answers as big buttons —
// quests in gold (offers, hand-ins, rewards, story choices), services plain, goodbye as a ghost button. Every choice
// goes to the server (act 'choose'); its reply comes back as a new 'talk' and redraws this window in place.
// A hand-in whose reward lets you choose one item shows the choices first, then sends the pick with the answer.
// kind 'close' (the server's "goodbye") closes it.
import { openWin, esc, findWin } from './kit.js';
import { glyph } from './icons.js';
import { fmt } from '../../../../../shared/format.js';

const KIND_CLASS = { offer: 'ow-talk-quest', accept: 'ow-talk-quest', turnin: 'ow-talk-quest', reward: 'ow-talk-quest', step: 'ow-talk-quest', choice: 'ow-talk-choice', service: 'ow-talk-service', bye: 'ow-talk-bye' };
const KIND_GLYPH = { offer: 'scroll', accept: 'check', turnin: 'check', reward: 'star', step: 'next', choice: 'next', service: 'coin', bye: 'back' };

export function open(app, opts = {}) {
  if (opts.kind === 'close' || !opts.npc) { findWin('talk')?.close(); return null; }
  app.talkingTo = opts.npc.id || null;          // the person turns to you and talks while this is open (play.js)
  const w = openWin({
    id: 'talk', title: opts.npc.name, sub: opts.npc.title || '', size: 'narrow', cls: 'ow-talk', onClose() { app.talkingTo = null; },
    render(body, tab, win) {
      const d = win.data.msg || opts;
      win.data.msg = d;
      const pickFor = win.data.pickFor;        // an option waiting for the player to choose a reward item
      let h = `<div class="ow-talk-lines">${(d.lines || []).map(l => `<p class="ow-talk-say">${esc(l)}</p>`).join('')}</div>`;
      if (d.rewards?.ok) {
        const bits = [];
        if (d.rewards.xp) bits.push(`${fmt(d.rewards.xp)} experience`);
        if (d.rewards.gold) bits.push(`${fmt(d.rewards.gold)} gold`);
        for (const it of d.rewards.items || []) bits.push(it.name);
        if (bits.length) h += `<p class="ow-talk-reward">${glyph('star', 18)}<span>You received ${esc(bits.join(', '))}.</span></p>`;
      }
      if (pickFor) {
        const q = app.W.book.quests[pickFor.split(':')[1]];
        h += `<div class="ow-talk-pick"><h3>Choose your reward</h3>${(q?.rewards?.pick || []).map((p, i) => `<button type="button" class="ow-btn ow-talk-opt ow-talk-quest" data-pick="${i}" ${i === 0 ? 'data-primary' : ''}>${glyph('star', 18)}<span>${esc(cap(p.label))}</span></button>`).join('')}
          <button type="button" class="ow-btn ow-talk-opt ow-talk-bye" data-unpick>${glyph('back', 18)}<span>Not yet</span></button></div>`;
      } else {
        h += `<div class="ow-talk-opts">${(d.options || []).map((o, i) => `<button type="button" class="ow-btn ow-talk-opt ${KIND_CLASS[o.kind] || ''}" data-opt="${esc(o.id)}" ${i === 0 ? 'data-primary' : ''}>${glyph(KIND_GLYPH[o.kind] || 'next', 18)}<span>${esc(o.text)}</span></button>`).join('')}</div>`;
      }
      body.innerHTML = h;
      body.querySelectorAll('[data-opt]').forEach(b => {
        b.onclick = () => {
          const id = b.dataset.opt;
          const [kind, qid] = id.split(':');
          if ((kind === 'turnin' || kind === 'reward') && app.W.book.quests[qid]?.rewards?.pick?.length) { win.data.pickFor = id; win.render(); return; }
          if (id === 'bye') { win.close(); app.act('choose', { npc: d.npc.id, option: 'bye' }); return; }
          app.act('choose', { npc: d.npc.id, option: id });
        };
      });
      body.querySelectorAll('[data-pick]').forEach(b => { b.onclick = () => { const id = win.data.pickFor; win.data.pickFor = null; app.act('choose', { npc: d.npc.id, option: id, pick: +b.dataset.pick }); }; });
      body.querySelector('[data-unpick]')?.addEventListener('click', () => { win.data.pickFor = null; win.render(); });
    },
  });
  // opened again with the server's next answer: show it
  w.data.msg = opts; w.data.pickFor = null; w.sub = opts.npc.title || '';
  w.render();
  return w;
}
const cap = s => String(s || '').replace(/^\w/, c => c.toUpperCase());
