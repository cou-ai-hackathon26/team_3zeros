#!/usr/bin/env bash
# Database and document backup script per DEPLOYMENT §6
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/medi_waypoint}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
TARGET_DIR="${BACKUP_DIR}/${TIMESTAMP}"

mkdir -p "${TARGET_DIR}"

echo "[INFO] Starting Medi Waypoint backup at ${TIMESTAMP}..."

# 1. PostgreSQL application database dump
if command -v pg_dump >/dev/null 2>&1; then
    echo "[INFO] Dumping PostgreSQL database..."
    pg_dump "${DATABASE_URL:-postgres://medi:medi_secret@localhost:5432/medi_waypoint}" \
        --format=custom --file="${TARGET_DIR}/app_db.dump"
else
    echo "[WARN] pg_dump not found locally; skipping direct db dump."
fi

# 2. Archive media/documents if present
if [ -d "backend/media" ]; then
    echo "[INFO] Archiving local documents..."
    tar -czf "${TARGET_DIR}/media_documents.tar.gz" -C backend media
fi

# 3. Compute SHA256 checksums
echo "[INFO] Computing checksums..."
cd "${TARGET_DIR}"
sha256sum * > SHA256SUMS || shasum -a 256 * > SHA256SUMS

echo "[SUCCESS] Backup completed successfully at ${TARGET_DIR}"
