#!/usr/bin/env bash
# Nightly database backup: pg_dump on the box, then upload off the box.
#
# Read this line before trusting it: this is a SNAPSHOT backup, so the most
# you can lose is everything written since the last run. At the default daily
# schedule that is up to 24 hours of production logs, sales orders and expense
# entries. Postgres can do better (continuous WAL archiving, point-in-time
# recovery) but not without more machinery than one free VM deserves. If a
# day's loss is unacceptable, run this hourly, or move the database to a
# managed provider that does PITR for you.
#
# Uploading off the box is the whole point. A dump sitting on the same
# instance is not a backup — it dies with the instance.
#
# Usage:  ./backup.sh            (reads .env beside this script)
# Cron:   see stoneos-backup.timer

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# shellcheck disable=SC1091
set -a; . ./.env; set +a

: "${POSTGRES_USER:?}" "${POSTGRES_DB:?}" "${STONEOS_DATA_DIR:?}"

BACKUP_DIR="${STONEOS_BACKUP_DIR:-$STONEOS_DATA_DIR/backups}"
RETAIN_DAYS="${STONEOS_BACKUP_RETAIN_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/stoneos-$STAMP.dump"

mkdir -p "$BACKUP_DIR"

log() { printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

# -Fc is the custom format: compressed, and pg_restore can do selective
# restores from it. Plain SQL cannot.
log "dumping $POSTGRES_DB"
docker compose exec -T postgres \
	pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$OUT.partial"

# Only becomes a real filename once the dump has fully succeeded, so a run
# killed halfway never leaves something that looks like a good backup.
mv "$OUT.partial" "$OUT"
SIZE="$(du -h "$OUT" | cut -f1)"
log "wrote $OUT ($SIZE)"

# A dump that pg_restore cannot read is not a backup. Listing the archive
# table of contents catches truncation and corruption now rather than during
# an emergency.
if ! docker compose exec -T postgres pg_restore --list /dev/stdin < "$OUT" > /dev/null 2>&1; then
	log "FAILED: $OUT is not a readable pg_restore archive"
	exit 1
fi
log "verified archive is readable"

# STONEOS_BACKUP_PAR_URL is an OCI Object Storage pre-authenticated request
# with object-write permission, ending in a slash. A PAR is used instead of
# the oci CLI on purpose: no SDK to install, no API signing key sitting on the
# box, and the URL can be revoked from the console on its own.
if [ -n "${STONEOS_BACKUP_PAR_URL:-}" ]; then
	log "uploading to object storage"
	if curl --fail --silent --show-error -X PUT \
		-T "$OUT" "${STONEOS_BACKUP_PAR_URL%/}/$(basename "$OUT")"; then
		log "uploaded $(basename "$OUT")"
	else
		# Loud, and a non-zero exit, so the systemd unit records a failure.
		# A silent upload failure is how you discover months later that the
		# only copies were on the box that just died.
		log "FAILED: upload did not succeed — local copy kept at $OUT"
		exit 1
	fi
else
	log "WARNING: STONEOS_BACKUP_PAR_URL is unset — this backup exists ONLY on this box"
fi

# Local pruning only. Remote copies are pruned by an Object Storage lifecycle
# rule, so a compromised box cannot delete its own backup history.
find "$BACKUP_DIR" -name 'stoneos-*.dump' -type f -mtime "+$RETAIN_DAYS" -print -delete |
	while read -r old; do log "pruned $old"; done

log "done"
