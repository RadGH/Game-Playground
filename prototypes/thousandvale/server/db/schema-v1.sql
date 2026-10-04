-- Thousandvale schema v1 (stream A, M1): the faucet/sink log (PLAN §13). One row per hour, level band,
-- kind (faucet|sink) and reason; the server upserts its in-memory totals every minute.
CREATE TABLE IF NOT EXISTS economy_log (
  hour    timestamptz NOT NULL,
  band    integer NOT NULL,          -- level band: floor((level - 1) / 5)
  kind    text NOT NULL CHECK (kind IN ('faucet', 'sink')),
  reason  text NOT NULL,             -- kill, chest, overflow, destroy, ...
  gold    bigint NOT NULL DEFAULT 0,
  items   integer NOT NULL DEFAULT 0,
  count   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (hour, band, kind, reason)
);
