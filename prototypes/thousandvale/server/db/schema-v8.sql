-- Thousandvale schema v8 (stream Market, round 11, owner report #25): the player market.
--   market_listings  one row per item on sale. The item itself waits in `items` (the escrow table, v3) with
--                    `listing_id` set — so `items.uid` (the PRIMARY KEY) still guarantees one item is never in a letter
--                    and a listing at once. A listing is bought, cancelled or expires in ONE transaction that moves the
--                    escrow row into a letter (mail kind 'market') and deletes the listing.
--   mail.kind        gains 'market' (a delivery from the market: taken anywhere, never expires, cannot be returned).
-- Deleting a character takes its listings with it (CASCADE), like the mail sent to it (v3/v4).

CREATE TABLE IF NOT EXISTS market_listings (
  id           bigserial PRIMARY KEY,
  realm        text NOT NULL DEFAULT 'vale',
  seller_char  bigint NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  seller_name  text NOT NULL,
  item_uid     text NOT NULL UNIQUE,
  name_lower   text NOT NULL DEFAULT '',        -- for search
  tab          text NOT NULL DEFAULT 'items',   -- 'gear' | 'items' (js/sim/bag-tabs.js tabOf)
  sub          text,                            -- gear: the worn slot (weapon, head …); items: the kind (material, fish …)
  rarity       text,
  lvl          integer NOT NULL DEFAULT 1,
  count        integer NOT NULL DEFAULT 1 CHECK (count >= 1),
  price        bigint NOT NULL CHECK (price >= 1),
  fee          bigint NOT NULL DEFAULT 0 CHECK (fee >= 0),
  listed_at    timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS market_seller ON market_listings (seller_char);
CREATE INDEX IF NOT EXISTS market_browse ON market_listings (realm, tab, price);
CREATE INDEX IF NOT EXISTS market_expires ON market_listings (expires_at);

ALTER TABLE items ADD COLUMN IF NOT EXISTS listing_id bigint REFERENCES market_listings(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS items_listing ON items (listing_id) WHERE listing_id IS NOT NULL;

ALTER TABLE mail DROP CONSTRAINT IF EXISTS mail_kind_check;
ALTER TABLE mail ADD CONSTRAINT mail_kind_check CHECK (kind IN ('player', 'return', 'system', 'market'));
