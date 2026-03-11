#!/bin/sh
set -e

# Path to the SPA index.html
INDEX_HTML="/repo/apps/web/dist/index.html"

# If __SITE_NAME__ exists, we perform the one-time injection at startup
if grep -q "__SITE_NAME__" "$INDEX_HTML"; then
  echo "[entrypoint] Injecting runtime environment into $INDEX_HTML"
  
  # Prepare the injection script
  ENV_JSON="{\"PET_NAME\":\"${PET_NAME:-Pet}\",\"SITE_NAME\":\"${SITE_NAME:-ManlyCam}\"}"
  INJECT_SCRIPT="<script>window.__env__ = $ENV_JSON;</script>"
  
  # Replace __SITE_NAME__ placeholder globally
  sed -i "s/__SITE_NAME__/${SITE_NAME:-ManlyCam}/g" "$INDEX_HTML"
  
  # Inject the script block after <head>
  # Using a character like | to avoid escaping / in script tags
  sed -i "s|<head>|<head>\n    $INJECT_SCRIPT|g" "$INDEX_HTML"
else
  echo "[entrypoint] No placeholder found in $INDEX_HTML, skipping injection"
fi

# Run database migrations
echo "[entrypoint] Running database migrations..."
npx prisma migrate deploy --schema ./prisma/schema.prisma

# Execute the CMD
echo "[entrypoint] Starting server..."
exec "$@"
