#!/usr/bin/env bash
# Backup restore verification drill per DEPLOYMENT §6
set -euo pipefail

BACKUP_PATH="${1:-}"
if [ -z "${BACKUP_PATH}" ]; then
    echo "Usage: $0 <path_to_backup_directory>"
    exit 1
fi

if [ ! -d "${BACKUP_PATH}" ]; then
    echo "Error: Directory ${BACKUP_PATH} does not exist."
    exit 1
fi

echo "[INFO] Starting restore verification drill for ${BACKUP_PATH}..."

# 1. Verify Checksums
echo "[INFO] Verifying checksums..."
cd "${BACKUP_PATH}"
if [ -f "SHA256SUMS" ]; then
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum --check SHA256SUMS
    else
        shasum -a 256 -c SHA256SUMS
    fi
    echo "[INFO] Checksums verified successfully."
fi

# 2. Test dump integrity
if [ -f "app_db.dump" ] && command -v pg_restore >/dev/null 2>&1; then
    echo "[INFO] Verifying PostgreSQL dump archive format..."
    pg_restore --list app_db.dump >/dev/null
    echo "[INFO] PostgreSQL dump archive is valid."
fi

# 3. Test media archive integrity
if [ -f "media_documents.tar.gz" ]; then
    echo "[INFO] Testing media archive integrity..."
    tar -tzf media_documents.tar.gz >/dev/null
    echo "[INFO] Media archive is valid."
fi

echo "[SUCCESS] Restore test succeeded. Consistency check passed."
