-- Thousandvale schema v6 (stream A, owner feedback 8: W28 "completed" + W29 "my reports").
--   feedback.state     gains the value 'completed' (the fix is live). The column is plain text, so no constraint changes.
--   feedback.done_note the short changelog line shown to the player who sent the report ("how it was fixed"); kept apart
--                      from `note` (the admin's own note), so completing a report does not overwrite the review note.
--   feedback.done_at   when it was completed.
--   feedback.ref       a reply: the id of the sender's OWN earlier report this one follows up (its text starts "#<id>").
--   feedback_account   "my reports" lists by account.

ALTER TABLE feedback ADD COLUMN IF NOT EXISTS done_note text NOT NULL DEFAULT '';
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS done_at timestamptz;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS ref bigint;
CREATE INDEX IF NOT EXISTS feedback_account ON feedback (account_id, id DESC);
