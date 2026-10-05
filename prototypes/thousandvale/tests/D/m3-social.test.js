// Stream D — M3 social UI rules (js/client/social-core.js): chat parsing, channel gates, guild permissions
// against stream A's real guild rules, mail compose checks, friends/mail ordering, shortcuts vs bindings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CHANNELS, parseChatLine, tabOf, linePrefix, channelGate, guildPerms, sortRoster, sortFriends, mergeFriend,
  composeCheck, expiresText, attachText, hasAttachments, sortMail, claimCheck, guildNameCheck, defaultRole, mmss, popLeft,
  SHORTCUTS, PANEL_KEYS, MAIL_LIMITS, GUILD_FEE,
} from '../../js/client/social-core.js';
import { MAIL } from '../../js/sim/mail.js';
import { GUILD } from '../../js/sim/guilds.js';
import { CALLBOARD } from '../../js/sim/callboard.js';
import { CALLBOARD_LEVEL, PUBLIC_LEVEL } from '../../js/client/social-core.js';

test('chat: plain lines go to the active channel; slash channels and whispers parse', () => {
  assert.deepEqual(parseChatLine('hello'), { kind: 'send', ch: 'say', text: 'hello' });
  assert.deepEqual(parseChatLine('hello', { active: 'guild' }), { kind: 'send', ch: 'guild', text: 'hello' });
  assert.deepEqual(parseChatLine('/g gather at the gate'), { kind: 'send', ch: 'guild', text: 'gather at the gate' });
  assert.deepEqual(parseChatLine('/p'), { kind: 'switch', ch: 'party' });
  assert.deepEqual(parseChatLine('/world hi all'), { kind: 'send', ch: 'world', text: 'hi all' });
  assert.deepEqual(parseChatLine('/t WTS ring'), { kind: 'send', ch: 'trade', text: 'WTS ring' });
  assert.deepEqual(parseChatLine('/z anyone?'), { kind: 'send', ch: 'zone', text: 'anyone?' });
  assert.deepEqual(parseChatLine('/w Brem meet me at the well'), { kind: 'send', ch: 'w', to: 'Brem', text: 'meet me at the well' });
  assert.deepEqual(parseChatLine('/w Brem'), { kind: 'switch', ch: 'w', to: 'Brem' });
  assert.equal(parseChatLine('/r thanks').kind, 'error');                 // nobody to reply to yet
  assert.deepEqual(parseChatLine('/r thanks', { reply: 'Alda' }), { kind: 'send', ch: 'w', to: 'Alda', text: 'thanks' });
  assert.deepEqual(parseChatLine('hi', { active: 'w', whisperTo: 'Alda' }), { kind: 'send', ch: 'w', to: 'Alda', text: 'hi' });
  assert.equal(parseChatLine('hi', { active: 'w' }).kind, 'error');
  assert.deepEqual(parseChatLine('/invite Brem'), { kind: 'cmd', cmd: 'invite', arg: 'Brem', rest: 'Brem' });
  assert.deepEqual(parseChatLine('/motd raid at nine'), { kind: 'cmd', cmd: 'motd', arg: 'raid', rest: 'raid at nine' });
  assert.equal(parseChatLine('/ginv Brem').cmd, 'ginvite');
  assert.equal(parseChatLine('   ').kind, 'none');
});

test('chat: every channel A serves has a tab, tabs map back, prefixes read right', () => {
  for (const ch of ['say', 'party', 'guild', 'zone', 'trade', 'world', 'w']) assert.ok(CHANNELS.some(c => c.send === ch), ch);
  assert.equal(tabOf('w'), 'w'); assert.equal(tabOf('guild'), 'guild'); assert.equal(tabOf('system'), 'all');
  assert.equal(linePrefix({ ch: 'w', echo: true, to: 'Brem' }), 'To Brem');
  assert.equal(linePrefix({ ch: 'w', name: 'Alda' }), 'Alda whispers');
  assert.equal(linePrefix({ ch: 'guild', name: 'Alda' }), 'Guild] [Alda');
});

test('chat gates match the server: public channels need claimed + level 5', () => {
  assert.equal(PUBLIC_LEVEL, 5);
  assert.match(channelGate('world', { claimed: false, level: 9 }), /claimed/);
  assert.match(channelGate('trade', { claimed: true, level: 4 }), /level 5/);
  assert.equal(channelGate('zone', { claimed: true, level: 5 }), null);
  assert.equal(channelGate('guild', { guild: false }), 'You are not in a guild.');
  assert.equal(channelGate('say', {}), null);
  assert.equal(channelGate('w', {}), null);              // the server decides whispers (friends/party/guild always open)
});

test('guild permissions follow js/sim/guilds.js exactly (rank > 1 cannot; only below you; new rank stays below yours, 1..3)', () => {
  // the server's rule, restated from guilds.js promote/demote/kick
  const server = (me, them, op) => {
    if (op === 'kick') return !(me > 1 || them <= me);
    const to = them + (op === 'promote' ? -1 : 1);
    return !(me > 1 || them <= me || to <= me || to < 1 || to > 3);
  };
  for (let me = 0; me <= 3; me++) for (let them = 0; them <= 3; them++) {
    const p = guildPerms(me, them, false);
    for (const op of ['promote', 'demote', 'kick']) assert.equal(p[op], server(me, them, op), `rank ${me} ${op} rank ${them}`);
  }
  assert.equal(guildPerms(0, 1).lead, true); assert.equal(guildPerms(1, 2).lead, false);
  assert.equal(guildPerms(0, 0, true).kick, false);
  assert.equal(guildPerms(2, 3).invite, false); assert.equal(guildPerms(1, 3).invite, true);
  assert.equal(guildPerms(1, 9).motd, true); assert.equal(guildPerms(2, 9).motd, false);
  assert.equal(GUILD_FEE, GUILD.fee); assert.equal(GUILD.minLevel, PUBLIC_LEVEL);
  const r = sortRoster([{ name: 'b', rank: 2, online: false }, { name: 'a', rank: 2, online: true }, { name: 'z', rank: 0 }]);
  assert.deepEqual(r.map(x => x.name), ['z', 'a', 'b']);
  assert.equal(guildNameCheck('The Lantern Keepers'), null);
  assert.ok(guildNameCheck('x1'));
});

test('friends: online first, merge adds and updates', () => {
  const l = sortFriends([{ char: 1, name: 'Cara', online: false }, { char: 2, name: 'Bo', online: true }, { char: 3, name: 'Al', online: false }]);
  assert.deepEqual(l.map(f => f.name), ['Bo', 'Al', 'Cara']);
  let m = mergeFriend(l, { char: 3, name: 'Al', online: true, level: 6 });
  assert.equal(m.find(f => f.char === 3).online, true);
  m = mergeFriend(m, { char: 9, name: 'New', online: true });
  assert.equal(m.length, 4);
});

test('mail compose checks match the server limits (6 items, 1 gold postage, 60/500 letters)', () => {
  assert.equal(MAIL_LIMITS.items, MAIL.items); assert.equal(MAIL_LIMITS.postage, MAIL.postage);
  assert.equal(MAIL_LIMITS.subject, MAIL.subjectMax); assert.equal(MAIL_LIMITS.body, MAIL.bodyMax);
  assert.equal(composeCheck({ to: 'Brem', subject: 'hi', items: ['a'] }, { gold: 1 }).ok, true);
  assert.equal(composeCheck({ to: 'Brem', subject: 'hi', gold: 5 }, { gold: 5 }).ok, false);     // 5 + 1 postage
  assert.equal(composeCheck({ to: 'Brem', subject: 'hi', gold: 5 }, { gold: 6 }).cost, 6);
  assert.equal(composeCheck({ to: '', subject: 'x' }, { gold: 9 }).ok, false);
  assert.equal(composeCheck({ to: 'Alda', subject: 'x' }, { gold: 9, me: 'alda' }).ok, false);
  assert.equal(composeCheck({ to: 'B', items: [1, 2, 3, 4, 5, 6, 7] }, { gold: 9 }).ok, false);
  assert.equal(composeCheck({ to: 'B' }, { gold: 9 }).ok, false);                                  // empty letter
  assert.equal(composeCheck({ to: 'B', gold: 1.5 }, { gold: 9 }).ok, false);
});

test('mail display helpers', () => {
  const now = 1e12;
  assert.match(expiresText(now + 29.6 * 86400000, now), /30 days/);
  assert.match(expiresText(now + 5 * 3600000, now), /5 hours/);
  assert.equal(attachText({ items: [1, 2], gold: 15 }), '2 items, 15 gold');
  assert.equal(attachText({ items: [1] }), '1 item');
  assert.equal(hasAttachments({ items: [1], taken: false }), true);
  assert.equal(hasAttachments({ items: [1], taken: true }), false);
  assert.equal(hasAttachments({ items: [], gold: 0 }), false);
  const s = sortMail([{ id: 1, read: true, sentAt: 5 }, { id: 2, read: false, sentAt: 1 }, { id: 3, read: false, sentAt: 9 }]);
  assert.deepEqual(s.map(m => m.id), [3, 2, 1]);
});

test('accounts: claim form checks mirror the server (3–20 username chars, 8–128 password)', () => {
  assert.equal(claimCheck({ user: 'alda_77', pass: 'correct horse', pass2: 'correct horse' }), null);
  assert.ok(claimCheck({ user: 'al', pass: 'correct horse' }));
  assert.ok(claimCheck({ user: 'al da', pass: 'correct horse' }));
  assert.ok(claimCheck({ user: 'alda', pass: 'short' }));
  assert.ok(claimCheck({ user: 'alda', pass: 'correct horse', pass2: 'other one!' }));
  assert.ok(claimCheck({ user: 'alda', pass: 'correct horse', email: 'nope' }));
  assert.equal(claimCheck({ user: 'alda', pass: 'correct horse', email: 'a@b.co' }), null);
});

test('callboard: level gate matches the server; roles; countdown', () => {
  assert.equal(CALLBOARD_LEVEL, CALLBOARD.minLevel);
  assert.equal(defaultRole('paladin'), 'tank'); assert.equal(defaultRole('cleric'), 'healer'); assert.equal(defaultRole('pyromancer'), 'dps');
  assert.equal(mmss(61000), '1:01'); assert.equal(mmss(0), '0:00');
  assert.equal(popLeft({ until: 1000 + 15000, ms: 30000 }, 1000), 0.5);
  assert.equal(popLeft({ until: 0, ms: 30000 }, 5), 0);
});

test('shortcuts: every window hotkey is in the help overlay, and main.js binds PANEL_KEYS', () => {
  const listed = SHORTCUTS.flatMap(g => g.keys.map(k => k[0]));
  for (const code of Object.keys(PANEL_KEYS)) assert.ok(listed.includes(code.replace('Key', '')), `${code} missing from the help overlay`);
  const main = readFileSync(new URL('../../js/client/main.js', import.meta.url), 'utf8');
  assert.match(main, /PANEL_KEYS\[e\.code\]/);
  assert.match(main, /e\.code === 'F1'/);
  // no window key collides with movement/combat keys that controls.js reads
  const controls = readFileSync(new URL('../../js/client/controls.js', import.meta.url), 'utf8');
  for (const code of Object.keys(PANEL_KEYS)) assert.ok(!new RegExp(`'${code}'`).test(controls), `${code} is also a controls.js key`);
});

test('fonts are local: index.html loads no Google Fonts; fonts.css points at files that exist', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic/);
  assert.match(html, /css\/fonts\/fonts\.css/);
  assert.match(html, /public\/privacy\.html/);
  const css = readFileSync(new URL('../../css/fonts/fonts.css', import.meta.url), 'utf8');
  const files = [...css.matchAll(/url\(([^)]+)\)/g)].map(m => m[1]);
  assert.ok(files.length >= 4);
  for (const f of files) readFileSync(new URL('../../css/fonts/' + f, import.meta.url));     // throws if missing
  assert.match(css, /Cinzel/); assert.match(css, /Alegreya Sans/);
});
