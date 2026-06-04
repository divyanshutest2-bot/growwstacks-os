#!/usr/bin/env bash
# GrowwStacks OS — Migration Apply Script
#
# Usage:
#   DATABASE_URL=postgres://... ./scripts/apply-migrations.sh
#
# After cloning, make executable once:
#   chmod +x ./scripts/apply-migrations.sh
#
# Applies migrations/0000_*.sql through migrations/0012_*.sql in numeric order.
# Aborts on the first error (ON_ERROR_STOP=1). Never hard-codes or prints
# the DATABASE_URL value — the human supplies it via the env var.

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo ""
  echo "Error: DATABASE_URL is not set."
  echo ""
  echo "Usage:"
  echo "  DATABASE_URL=postgres://user:pass@host/dbname ./scripts/apply-migrations.sh"
  echo ""
  echo "The connection string is never stored in this file — supply it in your own terminal."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="${SCRIPT_DIR}/../migrations"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "Error: migrations/ directory not found at expected path: $MIGRATIONS_DIR"
  exit 1
fi

# Collect migration files in numeric order (0000 through 0012).
# Using glob + sort to avoid bash-4 mapfile dependency (macOS ships bash 3.2).
MIGRATION_FILES=()
while IFS= read -r f; do
  MIGRATION_FILES+=("$f")
done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' | sort)

if [ ${#MIGRATION_FILES[@]} -eq 0 ]; then
  echo "Error: No .sql files found in $MIGRATIONS_DIR"
  exit 1
fi

APPLIED=0
FAILED=""

echo ""
echo "GrowwStacks OS — Applying migrations"
echo "Source: $MIGRATIONS_DIR"
echo "Files:  ${#MIGRATION_FILES[@]}"
echo "-------------------------------------------"

for MIGRATION_FILE in "${MIGRATION_FILES[@]}"; do
  FILENAME="$(basename "$MIGRATION_FILE")"
  echo "Applying $FILENAME ..."

  if psql "$DATABASE_URL" -f "$MIGRATION_FILE" -v ON_ERROR_STOP=1 --quiet; then
    echo "  ✓ Done"
    APPLIED=$((APPLIED + 1))
  else
    FAILED="$FILENAME"
    echo ""
    echo "FAILED: $FILENAME"
    echo "Aborting. Fix the migration above and re-run."
    exit 1
  fi
done

echo "-------------------------------------------"
echo "✓ $APPLIED migration(s) applied successfully."
echo ""
