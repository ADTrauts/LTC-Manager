#!/usr/bin/env bash
# Stage 0 supplemental logical backup for LTC Manager Dietary V1 staging.
# Uploads a custom-format pg_dump to S3-compatible object storage.
# Never prints connection secrets. Refuses database name ltc_manager.
#
# Required env:
#   DATABASE_URL or DIRECT_URL
#   BACKUP_S3_BUCKET
#   BACKUP_S3_ENDPOINT   (S3 API endpoint; for AWS may be omitted if AWS CLI default region works)
#   AWS_ACCESS_KEY_ID
#   AWS_SECRET_ACCESS_KEY
# Optional:
#   AWS_DEFAULT_REGION (default us-east-1)
#   BACKUP_RETENTION_DAYS (default 14)
#   BACKUP_PREFIX (default ltc-staging-dietary-v1)
set -euo pipefail

DB_URL="${DIRECT_URL:-${DATABASE_URL:-}}"
if [[ -z "$DB_URL" ]]; then
  echo "staging-logical-backup: FAIL — DATABASE_URL or DIRECT_URL required" >&2
  exit 1
fi

# Extract database name without printing the URL
DB_NAME="$(DB_URL="$DB_URL" node -e "
const u = process.env.DB_URL;
try {
  const name = new URL(u).pathname.replace(/^\\//, '').split('?')[0];
  if (!name) process.exit(2);
  process.stdout.write(name);
} catch { process.exit(2); }
")" || {
  echo "staging-logical-backup: FAIL — could not parse database name" >&2
  exit 1
}

if [[ "$DB_NAME" == "ltc_manager" ]]; then
  echo "staging-logical-backup: FAIL — refuses ltc_manager" >&2
  exit 1
fi

: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET required}"
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID required}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY required}"
AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_PREFIX="${BACKUP_PREFIX:-ltc-staging-dietary-v1}"

STAMP="$(date -u +%Y%m%dT%H%MZ)"
FILE="${BACKUP_PREFIX}-${DB_NAME}-${STAMP}.dump"
TMP="/tmp/${FILE}"

echo "staging-logical-backup: dumping database=${DB_NAME} stamp=${STAMP}"
pg_dump "$DB_URL" --format=custom --no-owner --file="$TMP"

DEST="s3://${BACKUP_S3_BUCKET}/${BACKUP_PREFIX}/${FILE}"
echo "staging-logical-backup: uploading to bucket=${BACKUP_S3_BUCKET} prefix=${BACKUP_PREFIX}"
if [[ -n "${BACKUP_S3_ENDPOINT:-}" ]]; then
  aws s3 cp "$TMP" "$DEST" --endpoint-url "$BACKUP_S3_ENDPOINT"
else
  aws s3 cp "$TMP" "$DEST"
fi

rm -f "$TMP"
echo "staging-logical-backup: PASS — object=${BACKUP_PREFIX}/${FILE} retention_days=${BACKUP_RETENTION_DAYS}"
# Retention deletion is operator-owned for Stage 0 (lifecycle rule preferred on the bucket).
