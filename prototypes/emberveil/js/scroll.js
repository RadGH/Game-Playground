// Scroll lock for the narrative log (round 21, E35).
//
// Before this, every new line forced the log to the bottom, so reading back up during a fight was
// impossible: the next hit yanked you down again. The rule now:
//
//   - if you are at the bottom (or within a few pixels of it) when a line arrives, the log follows it;
//   - if you have scrolled up, the log stays exactly where you are, however many lines arrive;
//   - while you are up there and new lines have come in, a small "jump to latest" button shows the
//     count; clicking it, or scrolling back down yourself, hides it and the log follows again.
//
// The decision is measured just before each line is added (not remembered from the last scroll
// event), so a wheel scroll that lands a moment before a line cannot be overridden. When the log is
// hidden (a town screen is covering it) nothing can be measured, so the last known state is used and
// reveal() puts things right once it is visible again.

/** Within this many pixels of the bottom counts as "at the bottom". */
export const STICK_SLACK = 8;

/** Is a scroll box at (or within `slack` pixels of) its bottom? Takes plain numbers, so it tests without a DOM. */
export function isNearBottom({ scrollTop = 0, scrollHeight = 0, clientHeight = 0 } = {}, slack = STICK_SLACK) {
  return scrollHeight - scrollTop - clientHeight <= slack;
}

/**
 * What to do with a line that is about to be added.
 * @param {{scrollTop:number, scrollHeight:number, clientHeight:number}} box  measured BEFORE the append
 * @param {{stuck?: boolean, slack?: number}} state  `stuck` = the last known answer, used while hidden
 * @returns {'follow'|'hold'}
 */
export function appendAction(box, { stuck = true, slack = STICK_SLACK, pending = false, recentInput = false } = {}) {
  if (!box || !box.clientHeight) return stuck ? 'follow' : 'hold';   // hidden: nothing to measure
  // Only the reader can unstick the log. While following, a gap at the bottom that the reader did not
  // make — the panel shrank when the map and tabs were laid out, or a follow happened while the box was
  // hidden and could not scroll (a hidden element ignores scrollTop) — is not "scrolled up".
  // A wheel/touch/key/pointer on the box in the last moment is, even if its scroll event has not arrived yet.
  if (stuck && (pending || !recentInput)) return 'follow';
  return isNearBottom(box, slack) ? 'follow' : 'hold';
}
/** How long after a wheel, touch, key or pointer press on the log the reader counts as "scrolling right now". */
export const INPUT_WINDOW_MS = 400;

/** Wire a scrolling list to the rule above. `button` is the optional "jump to latest" element. */
export class StickyScroll {
  constructor(box, { button = null, slack = STICK_SLACK } = {}) {
    this.box = box; this.button = button; this.slack = slack;
    this.stuck = true; this.unread = 0; this.pending = false; this.inputAt = -Infinity;
    box.addEventListener('scroll', () => this.onScroll(), { passive: true });
    // what a reader does to scroll: the wheel, a finger, the keyboard, a press on the scrollbar
    for (const type of ['wheel', 'touchstart', 'touchmove', 'keydown', 'pointerdown']) box.addEventListener(type, () => { this.inputAt = Date.now(); }, { passive: true });
    // the log changes size when the panels around it are laid out or the window is resized: stay pinned
    if (typeof ResizeObserver !== 'undefined') { this._ro = new ResizeObserver(() => { if (this.stuck && this.box.clientHeight) this.toBottom(); }); this._ro.observe(box); }
    if (button) button.addEventListener('click', () => this.jump());
    this.paint();
  }
  /** Has the reader touched the scroll in the last moment? */
  recentInput() { return Date.now() - this.inputAt < INPUT_WINDOW_MS; }
  /** Add a node the way the rule says. Returns the node. */
  append(node) {
    const act = appendAction(this.box, { stuck: this.stuck, slack: this.slack, pending: this.pending, recentInput: this.recentInput() });
    this.box.append(node);
    if (act === 'follow') { this.stuck = true; this.unread = 0; this.toBottom(); }
    else { this.stuck = false; this.unread++; }
    this.paint();
    return node;
  }
  /** The reader scrolled. Ignored while the box is hidden (it reports zero sizes then). */
  onScroll() {
    if (!this.box.clientHeight) return;
    if (this.pending && this.stuck) { this.toBottom(); this.paint(); return; }   // catching up a follow made while hidden, not the reader
    this.stuck = isNearBottom(this.box, this.slack);
    if (this.stuck) this.unread = 0;
    this.paint();
  }
  /** Scroll to the end. On a hidden box this does nothing, so remember to do it once it can be seen. */
  toBottom() { this.box.scrollTop = this.box.scrollHeight; this.pending = !this.box.clientHeight; }
  /** "Jump to latest": go to the bottom and follow again. */
  jump() { this.stuck = true; this.unread = 0; this.toBottom(); this.paint(); }
  /** Empty the log (a new run) and start following again. */
  clear() { this.box.replaceChildren(); this.stuck = true; this.unread = 0; this.pending = false; this.paint(); }
  /** The box was hidden and is visible again: follow if we were following, otherwise offer the button. */
  reveal() { if (this.stuck) this.toBottom(); this.paint(); }
  paint() {
    const b = this.button; if (!b) return;
    const show = !this.stuck && this.unread > 0 && !!this.box.clientHeight;
    b.hidden = !show;
    if (show) { const label = `${this.unread} new line${this.unread === 1 ? '' : 's'} ↓`; if (b.textContent !== label) b.textContent = label; }
  }
}
