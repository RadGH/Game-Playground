// Round 21 (E35): the log follows new lines only while the reader is at the bottom.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNearBottom, appendAction, StickyScroll, STICK_SLACK } from '../js/scroll.js';

test('at the bottom, or within a few pixels of it, counts as the bottom', () => {
  assert.equal(isNearBottom({ scrollTop: 700, scrollHeight: 1000, clientHeight: 300 }), true);
  assert.equal(isNearBottom({ scrollTop: 700 - STICK_SLACK, scrollHeight: 1000, clientHeight: 300 }), true);
  assert.equal(isNearBottom({ scrollTop: 700 - STICK_SLACK - 1, scrollHeight: 1000, clientHeight: 300 }), false);
  assert.equal(isNearBottom({ scrollTop: 0, scrollHeight: 200, clientHeight: 300 }), true);    // too short to scroll
});

test('the decision: follow at the bottom, hold when scrolled up, remember while hidden', () => {
  assert.equal(appendAction({ scrollTop: 700, scrollHeight: 1000, clientHeight: 300 }), 'follow');
  assert.equal(appendAction({ scrollTop: 120, scrollHeight: 1000, clientHeight: 300 }, { stuck: false }), 'hold');
  // the reader is scrolling this very moment (its scroll event has not arrived): trust the measurement
  assert.equal(appendAction({ scrollTop: 120, scrollHeight: 1000, clientHeight: 300 }, { stuck: true, recentInput: true }), 'hold');
  // following, and the gap came from the layout (the panel shrank), not from the reader: keep following
  assert.equal(appendAction({ scrollTop: 0, scrollHeight: 253, clientHeight: 209 }, { stuck: true, recentInput: false }), 'follow');
  assert.equal(appendAction({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 }, { stuck: true }), 'follow');
  assert.equal(appendAction({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 }, { stuck: false }), 'hold');
  assert.equal(appendAction(null, { stuck: false }), 'hold');
});

/** A fake scroll box: each appended line is 20px tall. */
function fakeBox(clientHeight = 100) {
  const listeners = {};
  const box = {
    children: [], scrollTop: 0, clientHeight,
    get scrollHeight() { return Math.max(this.clientHeight, this.children.length * 20); },
    append(n) { this.children.push(n); },
    replaceChildren() { this.children = []; this.scrollTop = 0; },
    addEventListener(t, f) { listeners[t] = f; },
    scroll(to) { this.scrollTop = Math.max(0, Math.min(to, this.scrollHeight - this.clientHeight)); listeners.scroll?.(); },
  };
  return box;
}
const fakeButton = () => ({ hidden: true, textContent: '', addEventListener(t, f) { this.click = f; } });

test('StickyScroll: follows, holds exactly in place when scrolled up, counts and jumps', () => {
  const box = fakeBox(), btn = fakeButton(); const s = new StickyScroll(box, { button: btn });
  for (let i = 0; i < 20; i++) s.append('line' + i);
  assert.equal(box.scrollTop, box.scrollHeight);            // followed (the browser clamps; the fake does not)
  box.scroll(60);                                           // the reader goes back up
  assert.equal(s.stuck, false);
  for (let i = 0; i < 5; i++) s.append('more' + i);
  assert.equal(box.scrollTop, 60, 'the log did not move');
  assert.equal(btn.hidden, false); assert.match(btn.textContent, /^5 new lines/);
  btn.click();                                              // jump to latest
  assert.equal(s.stuck, true); assert.equal(btn.hidden, true);
  s.append('after'); assert.equal(box.scrollTop, box.scrollHeight);
});

test('StickyScroll: scrolling back to the bottom by hand hides the button and follows again', () => {
  const box = fakeBox(), btn = fakeButton(); const s = new StickyScroll(box, { button: btn });
  for (let i = 0; i < 20; i++) s.append(i);
  box.scroll(0); s.append('x'); assert.equal(btn.hidden, false);
  box.scroll(box.scrollHeight - box.clientHeight);
  assert.equal(s.stuck, true); assert.equal(btn.hidden, true);
});

test('a follow that happened while hidden is caught up once the box is visible, even without reveal()', () => {
  assert.equal(appendAction({ scrollTop: 0, scrollHeight: 253, clientHeight: 209 }, { stuck: true, pending: true }), 'follow');
  assert.equal(appendAction({ scrollTop: 0, scrollHeight: 253, clientHeight: 209 }, { stuck: true, pending: false, recentInput: true }), 'hold');
  // the real bug: opening lines written before the world screen was shown, then more lines arrive
  const box = fakeBox(0), btn = fakeButton(); const s = new StickyScroll(box, { button: btn });
  box.scrollTop = 0; box.clientHeight = 0;
  const realScroll = Object.getOwnPropertyDescriptor(box, 'scrollTop');
  let hiddenTop = 0; Object.defineProperty(box, 'scrollTop', { get() { return hiddenTop; }, set(v) { if (box.clientHeight) hiddenTop = v; }, configurable: true });   // a hidden box ignores scrollTop
  for (let i = 0; i < 12; i++) s.append('opening ' + i);
  assert.equal(box.scrollTop, 0);
  box.clientHeight = 100;                                   // the screen is shown; nobody called reveal()
  s.append('first line after showing');
  assert.equal(s.stuck, true, 'still following');
  assert.ok(box.scrollHeight - box.scrollTop - box.clientHeight <= STICK_SLACK, 'and actually at the bottom');
  assert.equal(btn.hidden, true);
  void realScroll;
});

test('StickyScroll: while hidden it keeps the last state and reveal() applies it', () => {
  const box = fakeBox(), btn = fakeButton(); const s = new StickyScroll(box, { button: btn });
  for (let i = 0; i < 20; i++) s.append(i);
  box.clientHeight = 0;                                     // a town screen covers the log
  s.append('while hidden'); assert.equal(s.stuck, true);
  box.clientHeight = 100; s.reveal(); assert.equal(box.scrollTop, box.scrollHeight);
});
