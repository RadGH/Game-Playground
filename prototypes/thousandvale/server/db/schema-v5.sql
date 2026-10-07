-- Thousandvale schema v5 (stream A, play-test 5): feedback reports (T19), their review states (T21), admin accounts (T21).
--   accounts.admin   set ONLY by tools/make-admin.mjs (never by a client message); an admin may read reports and change
--                    their state, in the game and on the 127.0.0.1 admin page.
--   feedback         one row per suggestion / bug report. `client` = what the player's browser attached (location,
--                    character, recent log lines — sanitised and capped by the server), `server` = what the server knew
--                    (account, character, room, zone, position, …). `state`: new -> approved | declined | trashed.
--                    `gift` marks the report that earned its character the thank-you letter (one per character).
-- Deleting an account or a character keeps the report and drops the link (SET NULL).

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS admin boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS feedback (
  id          bigserial PRIMARY KEY,
  realm       text NOT NULL DEFAULT 'vale',
  created_at  timestamptz NOT NULL DEFAULT now(),
  account_id  bigint REFERENCES accounts(id) ON DELETE SET NULL,
  char_id     bigint REFERENCES characters(id) ON DELETE SET NULL,
  name        text,
  cls         text,
  level       integer,
  kind        text NOT NULL,                        -- 'suggestion' | 'bug'
  text        text NOT NULL,
  client      jsonb NOT NULL DEFAULT '{}'::jsonb,
  server      jsonb NOT NULL DEFAULT '{}'::jsonb,
  state       text NOT NULL DEFAULT 'new',          -- 'new' | 'approved' | 'declined' | 'trashed'
  state_at    timestamptz,
  state_by    text,
  note        text NOT NULL DEFAULT '',
  gift        boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS feedback_state ON feedback (state, id DESC);
CREATE INDEX IF NOT EXISTS feedback_char ON feedback (char_id);
