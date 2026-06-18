#!/bin/sh
set -e

echo "Running database migrations..."
node dist/database/migrate.js

echo "Starting server..."
exec node dist/server.js
