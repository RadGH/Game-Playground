#!/usr/bin/env bash
# Thousandvale — delete a player's account on request (the promise in public/privacy.html: within 7 days).
#   sudo ops/lib/delete-account.sh "<character name>"          shows the account and everything that goes with it, asks, deletes
#   sudo ops/lib/delete-account.sh "<character name>" --yes    no question (for a list of requests)
# Deletes the ACCOUNT that owns that character; every table that points at accounts/characters with ON DELETE CASCADE
# (characters, char_journal, and A's M3 tables — mail, friends, guild members, chat) goes with it in one transaction.
# KICK THE PLAYER FIRST if they are online (admin page, 127.0.0.1:8492) — a live session would try to save into a row that is gone.
# Backups age out on their own in 14 days. Logs the request (no personal data) to /var/lib/thousandvale/deletions.log.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "run with sudo" >&2; exit 1; }
NAME="${1:?character name}"; YES="${2:-}"
cd /
ACC="$(sudo -u thousandvale sh -c 'set -a; . /etc/thousandvale/env; psql -X -At -v n="$0" <<SQL
SELECT account_id FROM characters WHERE lower(name) = lower(:'"'"'n'"'"') LIMIT 1;
SQL' "$NAME")"
[[ -n "$ACC" ]] || { echo "no character named '$NAME'"; exit 1; }
sudo -u thousandvale sh -c 'set -a; . /etc/thousandvale/env; psql -X -v a="$0" <<SQL
SELECT id, username, claimed, created_at, last_login FROM accounts WHERE id = :a;
SELECT id, name, cls, level FROM characters WHERE account_id = :a ORDER BY id;
SQL' "$ACC"
if [[ "$YES" != --yes ]]; then read -r -p "delete account $ACC and all of the above? type DELETE: " ans; [[ "$ans" == DELETE ]] || { echo "kept"; exit 1; }; fi
sudo -u thousandvale sh -c 'set -a; . /etc/thousandvale/env; psql -X -v ON_ERROR_STOP=1 -v a="$0" <<SQL
BEGIN;
DELETE FROM accounts WHERE id = :a;
COMMIT;
SQL' "$ACC"
echo "$(date -u +%FT%TZ) deleted account $ACC on request" | sudo -u thousandvale tee -a /var/lib/thousandvale/deletions.log >/dev/null
echo "deleted."
