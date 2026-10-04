-- Thousandvale schema v0 (stream A, M0). Applied by server/db/migrate.js inside one transaction.
-- PLAN §9.1: accounts + characters (key columns + JSON blob + version + lease/fence). Later versions add
-- char_journal, items (escrow), mail, market_listings, guilds, world_state, economy_log, chat_log, reports, bans.

CREATE TABLE IF NOT EXISTS accounts (
  id          bigserial PRIMARY KEY,
  token_hash  text NOT NULL UNIQUE,              -- sha256 hex of the guest token; the token itself is never stored
  name        text,                              -- name typed at guest creation (optional)
  username    text UNIQUE,                       -- set when the guest claims the account (M3)
  pass_hash   text,                              -- scrypt (M3)
  claimed     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_login  timestamptz
);

CREATE TABLE IF NOT EXISTS characters (
  id          bigserial PRIMARY KEY,
  account_id  bigint NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  realm       text NOT NULL DEFAULT 'vale',
  name        text NOT NULL,
  cls         text NOT NULL,
  level       integer NOT NULL DEFAULT 1,
  xp          bigint NOT NULL DEFAULT 0,
  gold        bigint NOT NULL DEFAULT 0,
  room        text,
  x           double precision,
  z           double precision,
  blob        jsonb NOT NULL DEFAULT '{}'::jsonb, -- every SAVE_FIELDS entry without a column (js/sim/save-fields.js)
  version     integer NOT NULL DEFAULT 0,         -- bumped by every save; a save names the version it read
  lease_owner text,                               -- "<process>:<boot nonce>" holding the character
  lease_fence bigint NOT NULL DEFAULT 0,          -- bumped on every take; a save names the fence it holds
  lease_until timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS characters_realm_name ON characters (realm, lower(name));
CREATE INDEX IF NOT EXISTS characters_account ON characters (account_id);
CREATE INDEX IF NOT EXISTS characters_lease_owner ON characters (lease_owner) WHERE lease_owner IS NOT NULL;
