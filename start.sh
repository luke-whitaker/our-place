#!/bin/sh
# Run pending database migrations, then start the server
npx prisma migrate deploy --schema=./prisma/schema.prisma
node server.js
