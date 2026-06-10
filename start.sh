#!/bin/sh
set -e

# Railway mounts volumes owned by root (including an ext4 lost+found dir the
# app user can't read, which crashes Next.js's public/ scan). The container
# starts as root so we can hand the mount to the app user, then we re-exec
# this script as nextjs — migrations and the server never run as root.
if [ "$(id -u)" = "0" ]; then
  chown -R nextjs:nodejs /app/public/uploads
  exec su-exec nextjs "$0" "$@"
fi

echo "Running database migrations..."
node ./node_modules/prisma/build/index.js migrate deploy --schema=./prisma/schema.prisma

echo "Starting server..."
exec node server.js
