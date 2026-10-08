-- Thousandvale schema v7 (stream A, owner feedback 9: X6 "delete a character", X1 "signed in over the past 24 hours").
--   char_tombstones   a deleted character's NAME stays reserved until `free_at` (a day), so nobody takes a name its
--                     friends still know the minute it is gone. Rows past `free_at` are ignored and swept on the next delete.
--   accounts.last_login already exists (v0): it is now stamped every time an account ENTERS THE WORLD, and counted for
--   the message of the day; the index makes that count cheap.

CREATE TABLE IF NOT EXISTS char_tombstones (
  realm       text NOT NULL DEFAULT 'vale',
  name_lower  text NOT NULL,
  name        text NOT NULL,
  account_id  bigint,
  char_id     bigint,
  level       integer,
  cls         text,
  deleted_at  timestamptz NOT NULL DEFAULT now(),
  free_at     timestamptz NOT NULL,
  PRIMARY KEY (realm, name_lower)
);
CREATE INDEX IF NOT EXISTS accounts_last_login ON accounts (last_login);
