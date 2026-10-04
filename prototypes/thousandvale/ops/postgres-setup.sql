-- Thousandvale dev database: role `thousandvale` (no superuser), database `thousandvale_dev`.
-- Run as the postgres superuser through ops/postgres-setup.sh (which passes -v pw=...). Safe to re-run.
-- Postgres listens on 127.0.0.1 only (listen_addresses default 'localhost'); the stock Ubuntu pg_hba
-- line `host all all 127.0.0.1/32 scram-sha-256` lets the role in with its password, from this machine only.
\set ON_ERROR_STOP on

SELECT format('CREATE ROLE thousandvale LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 60', :'pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'thousandvale') \gexec

-- keep the password in step with ~/.config/thousandvale/dev.env on every run
SELECT format('ALTER ROLE thousandvale WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 60', :'pw') \gexec

SELECT 'CREATE DATABASE thousandvale_dev OWNER thousandvale ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'thousandvale_dev') \gexec

REVOKE ALL ON DATABASE thousandvale_dev FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE thousandvale_dev TO thousandvale;

\connect thousandvale_dev
-- PG15+ already keeps PUBLIC off the public schema; make the game role its owner so migrations work
ALTER SCHEMA public OWNER TO thousandvale;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
