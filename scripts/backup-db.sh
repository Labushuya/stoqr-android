#!/usr/bin/env bash
# backup-db.sh — PostgreSQL backup script for stoqr
# Usage: [BACKUP_DIR=...] [DB_CONTAINER=...] [RETENTION_DAYS=...] ./backup-db.sh
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration — override via environment variables
# ---------------------------------------------------------------------------
BACKUP_DIR="${BACKUP_DIR:-/opt/stoqr/backups}"
DB_CONTAINER="${DB_CONTAINER:-stoqr_postgres_1}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# ---------------------------------------------------------------------------
# Derived values
# ---------------------------------------------------------------------------
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
FILENAME="stoqr_backup_${TIMESTAMP}.sql.gz"
BACKUP_PATH="${BACKUP_DIR}/${FILENAME}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
fail() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------
command -v docker >/dev/null 2>&1 || fail "docker is not installed or not in PATH"

docker inspect --type container "${DB_CONTAINER}" >/dev/null 2>&1 \
  || fail "Container '${DB_CONTAINER}' not found or not running"

# ---------------------------------------------------------------------------
# Ensure backup directory exists (idempotent)
# ---------------------------------------------------------------------------
mkdir -p "${BACKUP_DIR}"
log "Backup directory: ${BACKUP_DIR}"

# ---------------------------------------------------------------------------
# Run pg_dump inside the container and pipe through gzip
# ---------------------------------------------------------------------------
log "Starting backup of container '${DB_CONTAINER}' -> ${FILENAME}"

# Use a temp file so a partial/failed dump does not leave a corrupt archive.
BACKUP_TMP="${BACKUP_PATH}.tmp"

if docker exec "${DB_CONTAINER}" \
       pg_dump \
         --username="${PGUSER:-postgres}" \
         --no-password \
         --format=plain \
         --clean \
         --if-exists \
       2>/dev/null \
   | gzip -c > "${BACKUP_TMP}"; then

  mv "${BACKUP_TMP}" "${BACKUP_PATH}"

  # Human-readable file size (fallback to bytes if stat options differ)
  SIZE="$(du -sh "${BACKUP_PATH}" 2>/dev/null | cut -f1 || stat -c '%s bytes' "${BACKUP_PATH}")"
  log "Backup succeeded: ${FILENAME} (${SIZE})"

else
  # Clean up temp file on failure
  rm -f "${BACKUP_TMP}"
  fail "pg_dump failed — backup not written"
fi

# ---------------------------------------------------------------------------
# Rotate old backups (delete files older than RETENTION_DAYS)
# ---------------------------------------------------------------------------
log "Removing backups older than ${RETENTION_DAYS} days from ${BACKUP_DIR}"

DELETED=0
while IFS= read -r -d '' old_file; do
  log "  Deleting: $(basename "${old_file}")"
  rm -f "${old_file}"
  (( DELETED++ )) || true
done < <(find "${BACKUP_DIR}" \
              -maxdepth 1 \
              -name 'stoqr_backup_*.sql.gz' \
              -mtime +"${RETENTION_DAYS}" \
              -print0)

if (( DELETED > 0 )); then
  log "Removed ${DELETED} expired backup(s)"
else
  log "No expired backups found"
fi

log "Done."
