-- Thousandvale conservation check (stream H): run against a database restored from a backup (or a live one).
-- Fails (ERROR) if any item uid is held twice across all characters' bags and equipment, or if a character
-- has negative gold. Prints totals otherwise. (strict + silent: lax $.** visits each value twice — a false 'duplicate'.) Used by restore-drill.sh and the kill -9 chaos run.
\set ON_ERROR_STOP on
CREATE TEMP TABLE tv_uids AS
  SELECT c.id AS char_id, u #>> '{}' AS uid
  FROM characters c, LATERAL jsonb_path_query(coalesce(c.blob->'bag', '[]'::jsonb), 'strict $.**.uid', '{}', true) u
  UNION ALL
  SELECT c.id, u #>> '{}'
  FROM characters c, LATERAL jsonb_path_query(coalesce(c.blob->'equipment', '{}'::jsonb), 'strict $.**.uid', '{}', true) u;
SELECT count(*) AS characters, coalesce(sum(gold), 0) AS gold_total, (SELECT count(*) FROM tv_uids) AS items,
       (SELECT count(DISTINCT uid) FROM tv_uids) AS distinct_items FROM characters;
DO $$
DECLARE dup int; neg int;
BEGIN
  SELECT count(*) INTO dup FROM (SELECT uid FROM tv_uids GROUP BY uid HAVING count(*) > 1) d;
  SELECT count(*) INTO neg FROM characters WHERE gold < 0;
  IF dup > 0 THEN RAISE EXCEPTION 'conservation FAILED: % item uid(s) held twice', dup; END IF;
  IF neg > 0 THEN RAISE EXCEPTION 'conservation FAILED: % character(s) with negative gold', neg; END IF;
  RAISE NOTICE 'conservation ok';
END $$;
