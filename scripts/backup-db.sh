#!/usr/bin/env bash
# Sauvegarde logique PostgreSQL (format personnalisé, compressé), avec rétention locale.
#   DATABASE_URL=... BACKUP_DIR=./backups RETENTION_DAYS=14 ./scripts/backup-db.sh
# À exécuter depuis une machine distincte de la base (tâche planifiée), puis copier le fichier
# hors de l'hébergeur (stockage objet avec verrouillage, autre région).
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL requis}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$BACKUP_DIR/togomobile-$STAMP.dump"
# Prisma ajoute des paramètres (schema, connection_limit) que pg_dump ne connaît pas.
URL="${DATABASE_URL%%\?*}"
pg_dump --format=custom --compress=6 --no-owner --no-privileges --dbname="$URL" --file="$FILE.partial"
mv "$FILE.partial" "$FILE"
sha256sum "$FILE" > "$FILE.sha256"
find "$BACKUP_DIR" -name 'togomobile-*.dump*' -mtime +"$RETENTION_DAYS" -delete
echo "Sauvegarde : $FILE ($(du -h "$FILE" | cut -f1))"
