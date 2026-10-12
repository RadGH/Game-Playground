-- Thousandvale schema v3 (stream A, M3 "Public play"). Applied once by server/db/migrate.js in one transaction.
-- PLAN §9.1 / §9.4 / §11: claimed accounts + session tokens, bans, friends, guilds, mail with escrowed items,
-- reports, the chat log (30 days), world state (boss timers).

-- ---- accounts: claim (username + scrypt hash, optional email for the reset stub), bans, mutes ----
ALTER TABLE accounts ALTER COLUMN token_hash DROP NOT NULL;      -- tokens live in account_tokens now
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email        text;  -- optional; only used for the reset stub
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS claimed_at   timestamptz;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS banned_until timestamptz;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS ban_reason   text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS reset_hash   text;   -- sha256 of a one-hour reset code (admin page shows the code)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS reset_until  timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_username_lower ON accounts (lower(username)) WHERE username IS NOT NULL;

-- One row per signed-in browser: the guest token, and every token a username/password login hands out.
-- Only the sha256 of a token is stored. Logout deletes the row.
CREATE TABLE IF NOT EXISTS account_tokens (
  token_hash  text PRIMARY KEY,
  account_id  bigint NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind        text NOT NULL DEFAULT 'guest' CHECK (kind IN ('guest', 'session')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_used   timestamptz
);
CREATE INDEX IF NOT EXISTS account_tokens_account ON account_tokens (account_id);
INSERT INTO account_tokens (token_hash, account_id, kind)
  SELECT token_hash, id, 'guest' FROM accounts WHERE token_hash IS NOT NULL
  ON CONFLICT DO NOTHING;

-- IP bans keep only a salted hash of the address (PLAN §11.7).
CREATE TABLE IF NOT EXISTS ip_bans (
  ip_hash    text PRIMARY KEY,
  until      timestamptz NOT NULL,
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---- friends (per character, one direction: my list) ----
CREATE TABLE IF NOT EXISTS friends (
  char_id    bigint NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  friend_id  bigint NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (char_id, friend_id)
);
CREATE INDEX IF NOT EXISTS friends_friend ON friends (friend_id);

-- ---- guilds: roster + ranks + chat + MOTD (roast: SIMPLIFY) ----
CREATE TABLE IF NOT EXISTS guilds (
  id         bigserial PRIMARY KEY,
  realm      text NOT NULL DEFAULT 'vale',
  name       text NOT NULL,
  motd       text NOT NULL DEFAULT '',
  ranks      jsonb NOT NULL DEFAULT '["Leader","Officer","Member","Recruit"]'::jsonb,
  created_by bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS guilds_realm_name ON guilds (realm, lower(name));
CREATE TABLE IF NOT EXISTS guild_members (
  guild_id   bigint NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  char_id    bigint NOT NULL UNIQUE REFERENCES characters(id) ON DELETE CASCADE,   -- one guild per character
  rank       integer NOT NULL DEFAULT 3 CHECK (rank BETWEEN 0 AND 3),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, char_id)
);

-- ---- mail: text + gold + escrowed items (PLAN §9.2: items live in `items` only while in escrow) ----
CREATE TABLE IF NOT EXISTS mail (
  id         bigserial PRIMARY KEY,
  realm      text NOT NULL DEFAULT 'vale',
  to_char    bigint NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  from_char  bigint REFERENCES characters(id) ON DELETE SET NULL,   -- null = the game (system mail)
  from_name  text NOT NULL,
  subject    text NOT NULL DEFAULT '',
  body       text NOT NULL DEFAULT '',
  gold       bigint NOT NULL DEFAULT 0 CHECK (gold >= 0),
  kind       text NOT NULL DEFAULT 'player' CHECK (kind IN ('player', 'return', 'system')),
  sent_at    timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,                                           -- null = keeps (returned mail)
  read_at    timestamptz,
  taken_at   timestamptz                                            -- gold + items collected
);
CREATE INDEX IF NOT EXISTS mail_to ON mail (to_char, sent_at DESC);
CREATE INDEX IF NOT EXISTS mail_expires ON mail (expires_at) WHERE expires_at IS NOT NULL AND taken_at IS NULL;
-- An item in escrow. uid is the PRIMARY KEY: the same item can never be in two letters at once.
CREATE TABLE IF NOT EXISTS items (
  uid        text PRIMARY KEY,
  mail_id    bigint REFERENCES mail(id) ON DELETE RESTRICT,
  item       jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS items_mail ON items (mail_id);

-- ---- reports, chat log (30 days), world state ----
CREATE TABLE IF NOT EXISTS reports (
  id         bigserial PRIMARY KEY,
  from_char  bigint,
  from_name  text,
  about_char bigint,
  about_name text NOT NULL,
  reason     text NOT NULL,
  text       text NOT NULL DEFAULT '',
  chat       jsonb NOT NULL DEFAULT '[]'::jsonb,     -- the reported player's recent lines, as the server saw them
  created_at timestamptz NOT NULL DEFAULT now(),
  handled_at timestamptz
);
CREATE TABLE IF NOT EXISTS chat_log (
  id        bigserial PRIMARY KEY,
  at        timestamptz NOT NULL DEFAULT now(),
  ch        text NOT NULL,
  from_char bigint,
  from_name text,
  to_key    text,                                     -- party/guild id, zone key, whisper target id
  text      text NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_log_at ON chat_log (at);
CREATE TABLE IF NOT EXISTS world_state (
  key        text PRIMARY KEY,                        -- e.g. 'event:world_grimtallow'
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
