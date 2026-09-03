#!/usr/bin/env bash
# Restore the database from a dump produced by backup.sh.
#
# THIS DESTROYS THE CURRENT CONTENTS of the target database. It is written to
# be run deliberately, by a person, reading the output.
#
#   ./restore.sh /mnt/stoneos-data/backups/stoneos-20260903T033000Z.dump
#
# Rehearse this. A backup you have never restored is a hypothesis, not a
# backup — restore into a scratch database (STONEOS_RESTORE_DB=stoneos_probe)
# every so often and confirm the row counts look like the business.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DUMP="${1:-}"
if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
	echo "usage: $0 <path-to-.dump>" >&2
	exit 2
fi

# shellcheck disable=SC1091
set -a; . ./.env; set +a
: "${POSTGRES_USER:?}" "${POSTGRES_DB:?}"

TARGET="${STONEOS_RESTORE_DB:-$POSTGRES_DB}"

echo
echo "  Restoring : $DUMP"
echo "  Into      : $TARGET"
if [ "$TARGET" = "$POSTGRES_DB" ]; then
	echo
	echo "  This is the LIVE database. Everything currently in it will be replaced."
fi
echo
read -r -p "  Type the database name to confirm: " CONFIRM
[ "$CONFIRM" = "$TARGET" ] || { echo "  Aborted."; exit 1; }

if [ "$TARGET" != "$POSTGRES_DB" ]; then
	docker compose exec -T postgres \
		psql -U "$POSTGRES_USER" -d postgres \
		-c "DROP DATABASE IF EXISTS \"$TARGET\";" -c "CREATE DATABASE \"$TARGET\";"
fi

# --clean --if-exists drops objects before recreating them, so this works
# against a database that already has a schema. Errors are reported but do not
# stop the restore: ownership and role-grant statements routinely fail
# harmlessly when the dump came from a differently-provisioned database.
docker compose exec -T postgres \
	pg_restore -U "$POSTGRES_USER" -d "$TARGET" --clean --if-exists --no-owner < "$DUMP"

echo
echo "  Restored. Sanity-check before trusting it:"
echo
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$TARGET" -c \
	"SELECT 'factory' t, count(*) FROM factory
	 UNION ALL SELECT 'raw_block', count(*) FROM raw_block
	 UNION ALL SELECT 'slab', count(*) FROM slab
	 UNION ALL SELECT 'expense', count(*) FROM expense
	 UNION ALL SELECT 'sales_order', count(*) FROM sales_order
	 UNION ALL SELECT 'inventory_movement', count(*) FROM inventory_movement;"

echo
echo "  If this was a real restore, re-run the Copilot role provisioning —"
echo "  role passwords are cluster-level and do not travel inside a dump:"
echo "      docker compose --profile tasks run --rm provision-roles"
