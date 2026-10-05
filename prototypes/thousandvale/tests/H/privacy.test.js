// Stream H: public/privacy.html (the page H wrote) says what server/privacy.json (stream A's machine-readable list,
// served at /privacy.json) says. Every "stored" entry has a row with the same data-privacy value, the dates agree, and
// the page makes no promise the server breaks (an "optional email" means the page may not say "we never ask for an email").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '../..');
const html = readFileSync(join(GAME, 'public/privacy.html'), 'utf8');
const json = JSON.parse(readFileSync(join(GAME, 'server/privacy.json'), 'utf8'));
const rows = new Map([...html.matchAll(/<tr data-privacy="([^"]+)">([\s\S]*?)<\/tr>/g)].map(m => [m[1], m[2].replace(/<[^>]+>/g, ' ')]));

test('every entry in server/privacy.json "stored" has a row on the page', () => {
  for (const s of json.stored) assert.ok(rows.has(s.what), `public/privacy.html has no row data-privacy="${s.what}" (add one, or update the name)`);
});

test('the rows keep the numbers the server promises (30 days of chat, SHA-256 key, scrypt, salted ban hash)', () => {
  assert.match(rows.get('Chat'), /30 days/);
  assert.match(json.stored.find(s => s.what === 'Chat').kept, /30 days/);
  assert.match(rows.get('Account key'), /SHA-256/);
  assert.match(rows.get('Username and password (claimed accounts only)'), /scrypt/);
  assert.match(rows.get('Network address'), /salted/);
  assert.match(rows.get('Email (optional)'), /optional|only if/i);
});

test('the page makes no promise the server breaks, and names every third party', () => {
  assert.doesNotMatch(html, /ask for an email|no email, no real name/i, 'claimed accounts may give an email: the page cannot say we never ask');
  assert.doesNotMatch(html, /fonts\.googleapis|Google Fonts/i, 'the fonts are vendored (css/fonts/): no Google Fonts on the page or in the promise');
  for (const t of json.thirdParties) assert.ok(html.includes(t.who), `third party ${t.who} named on the page`);
  assert.ok(html.includes('Last changed ' + json.updated) || html.includes(json.updated), 'the page date matches server/privacy.json "updated"');
});

test('the game page itself loads nothing from Google Fonts (the promise above is true)', () => {
  const page = readFileSync(join(GAME, 'index.html'), 'utf8');
  assert.doesNotMatch(page, /fonts\.googleapis|fonts\.gstatic/);
});
