#!/usr/bin/env bash
# Thousandvale Postgres setup (dev) — stream H. Safe to run more than once.
#  1. (no sudo) makes ~/.config/thousandvale/dev.env (mode 600) with a random password, once
#  2. (sudo)    runs ops/postgres-setup.sql as the postgres superuser: role thousandvale, db thousandvale_dev
#  3. (no sudo) checks the game role can connect over 127.0.0.1
# The password never goes on a command line other than psql's -v (visible only to root/self in ps for an instant)
# and is never stored in the repo or in ~/claude/secrets.
#   ops/postgres-setup.sh            # all three steps (step 2 asks for sudo)
#   ops/postgres-setup.sh --env-only # step 1 only
#   ops/postgres-setup.sh --check    # step 3 only
#   SUDO_FLAGS=-S ops/postgres-setup.sh < password-file   # non-interactive sudo (lead)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_DIR="$HOME/.config/thousandvale"
ENV_FILE="$ENV_DIR/dev.env"

make_env() {
  if [[ -f "$ENV_FILE" ]]; then echo "env: $ENV_FILE exists (kept)"; return; fi
  mkdir -p "$ENV_DIR"; chmod 700 "$ENV_DIR"
  local pw; pw="$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 32)"
  umask 077
  cat > "$ENV_FILE" <<ENV
# Thousandvale dev database (written by ops/postgres-setup.sh). Mode 600. Never commit, never copy to ~/claude/secrets.
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=thousandvale_dev
PGUSER=thousandvale
PGPASSWORD=$pw
DATABASE_URL=postgres://thousandvale:$pw@127.0.0.1:5432/thousandvale_dev
ENV
  chmod 600 "$ENV_FILE"
  echo "env: wrote $ENV_FILE"
}

run_sql() {
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  # the postgres user cannot read /home/radgh (drwxr-x---), so hand it a world-readable copy in /tmp
  # (the SQL holds no secret — the password arrives as a psql variable)
  local tmp; tmp="$(mktemp /tmp/thousandvale-pg-XXXXXX.sql)"
  cp "$HERE/postgres-setup.sql" "$tmp"; chmod 644 "$tmp"
  (cd /tmp && sudo ${SUDO_FLAGS:-} -u postgres psql -X -q -v ON_ERROR_STOP=1 -v pw="$PGPASSWORD" -f "$tmp") || { rm -f "$tmp"; exit 1; }
  rm -f "$tmp"
  echo "sql: role thousandvale + database thousandvale_dev ready"
}

check() {
  set -a; # shellcheck disable=SC1090
  source "$ENV_FILE"; set +a
  psql -X -At -c "select 'connected as ' || current_user || ' to ' || current_database() || ', superuser=' || (select rolsuper from pg_roles where rolname = current_user)"
}

case "${1:-}" in
  --env-only) make_env ;;
  --check) check ;;
  *) make_env; run_sql; check ;;
esac
