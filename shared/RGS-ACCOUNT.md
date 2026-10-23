# Shared accounts for games.radgh.com

One account for every game on games.radgh.com, made for Radley Sustaire's games. Signing in is **optional** in every
game: nothing here may stop someone playing. Thousandvale usernames and passwords work as they are (same password,
a separate save in each game).

Three files:

| File | What it is |
|---|---|
| `shared/rgs-account.js` | The client: who is signed in, sign in / up / out, game tickets, QR sign-in. No UI. |
| `shared/rgs-signin.js` | The sign-in box (`openSignIn`) and the top-bar account button (`accountButton`). Loads its own CSS. |
| `shared/rgs-signin.css` | Styles for both, scoped under `.rgs-signin` / `.rgs-acct`, dark, phone-friendly, very high z-index. |

Demo page: `shared/rgs-signin-demo.html`. The server is `~/claude/rads-game-server/api` (contract in its `docs/API.md`);
the account page (`/account/`, where a phone approves a QR sign-in) and the admin dashboard (`/admin/`) are in
`~/claude/rads-game-server/site/`.

## Using it in a game

```js
import { account } from '../../shared/rgs-account.js';
import { openSignIn, accountButton } from '../../shared/rgs-signin.js';

topBar.append(accountButton({ game: 'knockabout', gameName: 'Knockabout', onChange: u => applyName(u) }));
const user = await openSignIn({ game: 'knockabout', gameName: 'Knockabout' });   // user, or null for "Not now"

// tell your own game server who this is: it redeems the ticket with rgs-api
const ticket = await account.ticket('knockabout');   // null when signed out
socket.send({ type: 'hello', ticket });
```

## The client API (`account`)

| Call | Gives back |
|---|---|
| `account.api` | The API address in use (see "Which server" below). |
| `account.accountUrl` | `https://games.radgh.com/account/` (or `localStorage['rgs.account']` off the real host). |
| `account.known` | The last known user without asking (`undefined` before the first `user()` call). |
| `await account.user({ fresh })` | User or `null`. Cached; `fresh: true` asks again. Never throws — offline keeps what it knew. |
| `account.onChange(fn)` | `fn(user or null)` on every sign-in / sign-out, here or in another tab. Returns an "unsubscribe" function. |
| `await account.signIn(login, password)` | User. `login` is a username or an email. |
| `await account.signUp({ username, password, email })` | User, signed in at once. `email` is optional. |
| `await account.signOut()` | — |
| `await account.changePassword(old, password)` | — (error `tv_password` for Thousandvale accounts). |
| `await account.usernameFree(name)` | `{ name, free }`, or `null` when the server can't say. For "is this name free" while typing. |
| `await account.ticket(game)` | A one-time ticket string for that game's own server, or `null` when signed out. |
| `await account.pair(game)` | Starts a QR sign-in (below). |
| `await account.pairInfo(code)` | `{ game, check, state }` — for the phone. |
| `await account.approvePair(code)` / `denyPair(code)` | — the phone's Yes / No. |
| `await account.request(method, path, body)` | Any API call -> parsed JSON, same base URL / cookie / token / JSON header; throws `{ code, message, status }`. Cloud saves build on it. |
| `account.call(path, { method, body, signal })` | The same thing with an options object (the admin dashboard uses it). |
| `account.message(code)` | The plain-language sentence for an error code. |

Errors are `Error`s with `.code` (the server's code, `network` when it can't be reached), `.status`, and a `.message`
already written for players ("That username or password doesn't match.").

The user object is the server's: `{ id, username, email, name, admin, linked: { thousandvale }, created_at, … }`.

### QR sign-in

```js
const p = await account.pair('tumblefair');
// show p.url as a QR code and p.check (a short word) beside it
const user = await p.done;          // user when the phone said yes; null for no / expired / p.cancel()
p.result;                           // 'approved' | 'denied' | 'expired' | 'cancelled'
```

The phone opens `p.url` (the account page with `?pair=CODE`), signs in if it isn't already, sees "Sign in on
Tumblefair as X? Check that the other screen shows WORD" and presses Yes or No. `done` waits on the server in a loop
(each wait is up to ~25 seconds) until the answer comes or the code expires (5 minutes). `openSignIn` does all of this
itself, and draws a new code when one expires or the phone says no.

Note: `pair()` is async (it has to ask the server for a code first), so it is `await account.pair(game)`.

## Which server

- On `games.radgh.com` or any `*.games.radgh.com` page: `https://games.radgh.com/api`.
- Anywhere else (LAN dev): `localStorage['rgs.api']` if set, otherwise `<this page's host>:8600/api`.

The session is an HttpOnly cookie on games.radgh.com. Every sign-in also returns a token, which the client keeps in
`localStorage['rgs.session']` and sends as `Authorization: Bearer …` — that is what makes LAN dev work, where the
cookie does not apply. Every request uses `credentials: 'include'`, and POSTs always send `content-type: application/json`.

Off the real host the QR link the dev API hands out points at the dev API itself, which has no account page; set
`localStorage['rgs.account'] = 'http://<host>:<port>/account/'` to point it at a copy of the account page.

## The sign-in box

`openSignIn({ game, gameName, mode })` → `Promise<user | null>`.

- QR code ("Scan with your phone to sign in") + the check word, refreshed when it expires.
- Username-or-email + password form with `autocomplete` set so password managers fill it.
- "Create an account" (username, password, optional email) with a live "is this name free" line.
- "Thousandvale accounts work here too."
- "Not now", the × button, Esc, a click outside, and the browser's back button all close it with `null`.
- The root has the class `modal` and the close buttons carry `data-close`, so Tumblefair's controller menu navigation
  (`padnav.js`) walks it like its own sheets. Every control is a real `<button>` / `<input>`.
- Opening it pushes one history entry (so back closes it) and removes it again when it closes another way.

`accountButton({ game, gameName, onChange })` → an element: "Sign in" when signed out; the username with a menu
(Your account, Sign out) when signed in. `onChange` fires once for the first check and then on every change.

## Tests

- `tests/rgs-signin.spec.js` — the widget: button, sign in, wrong password, create account + name check, Not now /
  Esc / back / ×, phone width, another tab hearing a sign-in, QR sign-in end to end with a second phone browser
  (yes and no).
- `tests/rgs-site.spec.js` — the account page and admin dashboard from the RGS repo (skipped when it isn't here).
- Both run against `tests/support/rgs-mock-api.mjs`, an in-memory stand-in for the API contract. Run it by hand for
  dev: `node tests/support/rgs-mock-api.mjs --port 8609 --site ~/claude/rads-game-server/site` (accounts `radley`
  (admin), `tvhero` (Thousandvale), `plain`; password `password123`), then set `localStorage['rgs.api']` to
  `http://<host>:8609/api`.

## Cloud saves for browser-only games (`shared/rgs-cloudsave.js`)

`cloudSave({ game, keys, prefixes, canRestore, onRestore, onConflict })` copies named localStorage keys to the account
(table `playground.saves`, one row per game + slot) and back; full notes in the file's header. Used by Farhold
(`farhold`) and Emberveil 2 (`emberveil2`). Added 2026-10-23 with those two: `prefixes` (every key starting with a
prefix travels as one slot), `canRestore` (false during a run: downloads and conflict questions wait, and uploads are
held while the account is ahead), an `onConflict` answer other than 'cloud'/'local' means "decide later", times taken
from the server's `updated_at` (a device with a wrong clock no longer mistakes its own upload for a newer save), and
`statusLine(status)` / `agoText(iso)` for the one-line status. Test helpers for the real dev API:
`tests/support/rgs-dev-api.mjs` (reuses named test accounts — the API allows 6 sign-ups an hour per address).
