-- Thousandvale schema v4 (stream A, M3; H's ask): deleting an account takes everything about it with it.
-- `accounts` -> characters (CASCADE, v0) -> friends / guild_members / mail to them (CASCADE, v3) -> their escrowed items
-- (CASCADE here; was RESTRICT, which made such a delete fail), their chat lines (CASCADE here), and reports keep the
-- report but lose the link (SET NULL). Mail they SENT stays with the receiver (from_char SET NULL, v3).

ALTER TABLE items DROP CONSTRAINT IF EXISTS items_mail_id_fkey;
ALTER TABLE items ADD CONSTRAINT items_mail_id_fkey FOREIGN KEY (mail_id) REFERENCES mail(id) ON DELETE CASCADE;

-- chat lines of characters that no longer exist cannot be kept by a foreign key: drop them first
DELETE FROM chat_log c WHERE c.from_char IS NOT NULL AND NOT EXISTS (SELECT 1 FROM characters x WHERE x.id = c.from_char);
ALTER TABLE chat_log DROP CONSTRAINT IF EXISTS chat_log_from_char_fkey;
ALTER TABLE chat_log ADD CONSTRAINT chat_log_from_char_fkey FOREIGN KEY (from_char) REFERENCES characters(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS chat_log_from ON chat_log (from_char);

UPDATE reports r SET from_char = NULL WHERE from_char IS NOT NULL AND NOT EXISTS (SELECT 1 FROM characters x WHERE x.id = r.from_char);
UPDATE reports r SET about_char = NULL WHERE about_char IS NOT NULL AND NOT EXISTS (SELECT 1 FROM characters x WHERE x.id = r.about_char);
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_from_char_fkey;
ALTER TABLE reports ADD CONSTRAINT reports_from_char_fkey FOREIGN KEY (from_char) REFERENCES characters(id) ON DELETE SET NULL;
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_about_char_fkey;
ALTER TABLE reports ADD CONSTRAINT reports_about_char_fkey FOREIGN KEY (about_char) REFERENCES characters(id) ON DELETE SET NULL;

-- a guild whose last member is deleted goes too (guilds with no members are removed by the server as well)
DELETE FROM guilds g WHERE NOT EXISTS (SELECT 1 FROM guild_members m WHERE m.guild_id = g.id);
