#!/usr/bin/env bash
# Vérification de restauration : restaure une sauvegarde dans une base TEMPORAIRE, contrôle son contenu,
# puis supprime cette base. Ne touche jamais à la base d'origine.
#   ADMIN_URL=postgresql://user:pass@hote:5432/postgres ./scripts/restore-check.sh backups/togomobile-....dump
set -euo pipefail
FILE="${1:?Chemin de la sauvegarde requis}"
: "${ADMIN_URL:?ADMIN_URL requis (connexion permettant CREATE DATABASE)}"
[ -f "$FILE.sha256" ] && sha256sum --check --quiet "$FILE.sha256"
ADMIN="${ADMIN_URL%%\?*}"
TMP_DB="togomobile_restore_check_$(date +%s)"
BASE="${ADMIN%/*}"
cleanup() { psql "$ADMIN" -qc "DROP DATABASE IF EXISTS \"$TMP_DB\"" >/dev/null 2>&1 || true; }
trap cleanup EXIT
psql "$ADMIN" -qc "CREATE DATABASE \"$TMP_DB\""
START=$(date +%s)
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$BASE/$TMP_DB" "$FILE"
ELAPSED=$(( $(date +%s) - START ))
psql "$BASE/$TMP_DB" -tA <<'SQL'
SELECT 'migrations=' || count(*) FILTER (WHERE finished_at IS NOT NULL) FROM _prisma_migrations;
SELECT 'utilisateurs=' || count(*) FROM "User";
SELECT 'boutiques=' || count(*) FROM "Shop";
SELECT 'produits=' || count(*) FROM "Product";
SELECT 'medias=' || count(*) FROM "ProductMedia";
SELECT 'avis=' || count(*) FROM "Review";
SELECT 'ventes=' || count(*) FROM "Sale";
SELECT 'derniere_activite=' || coalesce(max("createdAt")::text, '-') FROM "AuditLog";
SQL
echo "Restauration vérifiée en ${ELAPSED}s (base temporaire supprimée)."
