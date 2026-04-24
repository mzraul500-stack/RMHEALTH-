#!/bin/bash
# =============================================================================
# RMHEALTH MEDICAL SYSTEM - ENTRYPOINT SCRIPT
# =============================================================================
# Production Medical API Startup Script
# Date: April 20, 2026

set -e

echo "=================================="
echo "RMHealth Medical System Starting"
echo "=================================="
echo "Date: $(date)"
echo "Container: $(hostname)"
echo "User: $(whoami)"
echo "Python: $(python --version)"
echo "=================================="

# Wait for database to be ready
echo "Waiting for PostgreSQL database..."
while ! pg_isready -h ${DB_HOST:-localhost} -p ${DB_PORT:-5432} -U ${POSTGRES_USER:-rmhealth_user} > /dev/null 2>&1; do
    echo "PostgreSQL is unavailable - sleeping"
    sleep 2
done
echo "PostgreSQL is ready!"

# Run database migrations if needed
echo "Running database migrations..."
python -c "
import asyncio
from api.database.init_db import init_database
asyncio.run(init_database())
print('Database initialization completed.')
"

# Create logs directory if it doesn't exist
mkdir -p logs

# Set proper file permissions for medical data security
chmod 750 logs uploads temp

echo "=================================="
echo "RMHealth Medical API Ready"
echo "HIPAA Compliance: ${HIPAA_ENABLED:-true}"
echo "Edge AI Enabled: ${EDGE_AI_ENABLED:-true}"
echo "Environment: ${DEVELOPMENT_MODE:-false}"
echo "=================================="

# Execute the main command
exec "$@"