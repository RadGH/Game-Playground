// The Moment pop-up (PLAN §1, roast "about 2-4 a day"): one card, top of the screen, that goes by itself. It never pauses anything and never
// blocks a tap: it is not a modal. Say yes and you fade straight in; say nothing and the sim carries on without you.
//   const card = createMomentCard({ parent, el, news, onJump, household });   card.offer(moment)   card.jump()   card.state()
export const PER_DAY = 4, MIN_GAP_TICKS = 1800, SHOW_SECONDS = 14;

/** Does this Moment get to interrupt? Only the worst of what touches your household, or a town-stopper, and only a few a day. */
export function shouldPop(m, { household = null, shownToday = 0, sinceLast = Infinity, crewHome = false }) {
  if (shownToday >= PER_DAY || sinceLast < MIN_GAP_TICKS && m.pri < 10) return false;
  const mine = household != null && (m.hh ?? []).includes(household);
  if (mine) return m.pri >= 5;
  return m.pri >= 9 || (crewHome && m.pri >= 7);
}
/** "your brother is on shift": a member of your household on the call. */
export function stakeLine(m, members, firstName) {
  const crew = (m.crew ?? []).find(id => members.includes(id));
  return crew !== undefined ? `${firstName(crew)} is on shift.` : '';
}

export function createMomentCard({ parent, el, news, onJump, firstName, household, seconds = SHOW_SECONDS }) {
  const text = el('span'), sub = el('small'), yes = el('button', { type: 'button', class: 'od-mjump', text: 'Jump in', on: { click: () => self.jump() } }), no = el('button', { type: 'button', class: 'od-mno', 'aria-label': 'Not now', text: 'Not now', on: { click: () => self.hide() } });
  const root = el('div', { class: 'od-moment', hidden: '', role: 'status' }, el('div', { class: 'od-mtext' }, text, sub), el('div', { class: 'od-mbtns' }, yes, no));
  parent.append(root);
  let watching = null, shown = null, timer = 0, today = -1, count = 0, lastT = -1e9;
  const self = {
    get open() { return !!shown; },
    offer(m, tick, day) {
      if (day !== today) { today = day; count = 0; }
      const h = household(), members = h?.members ?? [], crewHome = (m.crew ?? []).some(id => members.includes(id));
      if (!shouldPop(m, { household: h?.id ?? null, shownToday: count, sinceLast: tick - lastT, crewHome })) return false;
      count++; lastT = tick;
      self.show(m, stakeLine(m, members, firstName));
      return true;
    },
    /** A scene is starting that you may want to see. The same card, a different button. */
    offerWatch(text0, run, extra = '') { watching = run; shown = { jump: -1 }; text.textContent = text0; sub.textContent = extra; sub.hidden = !extra; yes.textContent = 'Watch'; yes.hidden = false; root.hidden = false; clearTimeout(timer); timer = setTimeout(() => self.hide(), seconds * 1000); },
    show(m, extra = '') { watching = null; yes.textContent = 'Jump in'; shown = m; text.textContent = news().line(m); sub.textContent = extra; sub.hidden = !extra; yes.hidden = !(m.jump >= 0); root.hidden = false; clearTimeout(timer); timer = setTimeout(() => self.hide(), seconds * 1000); },
    hide() { shown = null; root.hidden = true; clearTimeout(timer); },
    jump() { const m = shown, w = watching; self.hide(); if (w) { watching = null; w(); return; } if (m && m.jump >= 0) onJump(m); },
    state: () => ({ open: !!shown, count, text: shown ? text.textContent : null, sub: shown ? sub.textContent : null, jump: shown?.jump ?? -1 }),
  };
  return self;
}
