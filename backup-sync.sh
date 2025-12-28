#!/bin/bash
#
# Recomendo Ads Backup Sync Script
# Fetches all order data from the Cloudflare Worker and saves locally + commits to git
#
# Usage: ./backup-sync.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="$SCRIPT_DIR/backups"
WORKER_URL="https://recomendo-ads-checkout.markfrauenfelder.workers.dev"
ADMIN_PASSWORD="wired93"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Generate timestamp for filename
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.json"
LATEST_FILE="$BACKUP_DIR/latest.json"

echo "Fetching backup from Cloudflare Worker..."

# Fetch backup data from the worker
HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $ADMIN_PASSWORD" \
  "$WORKER_URL/admin/backup")

HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$HTTP_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
  echo "Error: Failed to fetch backup (HTTP $HTTP_CODE)"
  echo "$RESPONSE_BODY"
  exit 1
fi

# Check if we got valid JSON
if ! echo "$RESPONSE_BODY" | python3 -m json.tool > /dev/null 2>&1; then
  echo "Error: Invalid JSON response"
  echo "$RESPONSE_BODY"
  exit 1
fi

# Save timestamped backup
echo "$RESPONSE_BODY" | python3 -m json.tool > "$BACKUP_FILE"
echo "Saved: $BACKUP_FILE"

# Update latest.json
cp "$BACKUP_FILE" "$LATEST_FILE"
echo "Updated: $LATEST_FILE"

# Parse and display summary
ORDER_COUNT=$(echo "$RESPONSE_BODY" | python3 -c "import sys, json; d=json.load(sys.stdin); print(len(d.get('completedOrders', [])))")
CANCELLED_COUNT=$(echo "$RESPONSE_BODY" | python3 -c "import sys, json; d=json.load(sys.stdin); print(len(d.get('cancelledAds', [])))")
EDITED_COUNT=$(echo "$RESPONSE_BODY" | python3 -c "import sys, json; d=json.load(sys.stdin); print(len(d.get('editedAds', {})))")

echo ""
echo "Backup Summary:"
echo "  - Completed orders: $ORDER_COUNT"
echo "  - Cancelled ads: $CANCELLED_COUNT"
echo "  - Edited ads: $EDITED_COUNT"
echo ""

# Git commit if in a git repo
if [ -d "$SCRIPT_DIR/.git" ]; then
  cd "$SCRIPT_DIR"
  git add backups/

  # Check if there are changes to commit
  if git diff --cached --quiet; then
    echo "No changes to commit."
  else
    git commit -m "Backup: $TIMESTAMP - $ORDER_COUNT orders"
    echo "Changes committed to git."
  fi
else
  echo "Not a git repo - skipping git commit."
fi

echo ""
echo "Backup complete!"
