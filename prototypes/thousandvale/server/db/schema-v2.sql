-- Thousandvale schema v2 (stream A, M1.5): the save journal (PLAN §9.2). Small rows group-committed every
-- 2 s; a character blob records the last journal seq it contains, and older rows are pruned when it saves.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS journal_seq bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS char_journal (
  char_id  bigint NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  seq      bigint NOT NULL,
  kind     text NOT NULL,
  payload  jsonb NOT NULL DEFAULT '{}'::jsonb,
  at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (char_id, seq)
);
