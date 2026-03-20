#!/bin/bash

# Database Migration Script for OpenClaw Enterprise
# Usage: ./scripts/migrate.sh [up|down|status|create <name>]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
MIGRATIONS_DIR="${ROOT_DIR}/packages/db/migrations"

# Database configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-openclaw}"
DB_USER="${DB_USER:-postgres}"
export PGPASSWORD="${DB_PASSWORD:-postgres}"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if psql is available
check_psql() {
    if ! command -v psql &> /dev/null; then
        log_error "psql command not found. Please install PostgreSQL client."
        exit 1
    fi
}

# Run SQL command
run_sql() {
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -c "$1" 2>/dev/null
}

# Run SQL file
run_sql_file() {
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$1" 2>/dev/null
}

# Check if migrations table exists
check_migrations_table() {
    local result=$(run_sql "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'migrations');")
    if [ "$result" != "t" ]; then
        log_info "Creating migrations table..."
        run_sql "CREATE TABLE IF NOT EXISTS migrations (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE, executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);"
        log_success "Migrations table created"
    fi
}

# Get list of executed migrations
get_executed_migrations() {
    run_sql "SELECT name FROM migrations ORDER BY id;"
}

# Get list of pending migrations
get_pending_migrations() {
    local executed=$(get_executed_migrations)
    for migration in $(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
        local name=$(basename "$migration")
        if ! echo "$executed" | grep -q "^${name}$"; then
            echo "$migration"
        fi
    done
}

# Run up migration
migrate_up() {
    log_info "Running migrations..."
    check_migrations_table

    local pending=$(get_pending_migrations)
    if [ -z "$pending" ]; then
        log_info "No pending migrations"
        return 0
    fi

    for migration in $pending; do
        local name=$(basename "$migration")
        log_info "Applying migration: $name"

        if run_sql_file "$migration" > /dev/null; then
            run_sql "INSERT INTO migrations (name) VALUES ('$name');"
            log_success "Applied: $name"
        else
            log_error "Failed to apply: $name"
            exit 1
        fi
    done

    log_success "All migrations applied successfully"
}

# Run down migration (rollback)
migrate_down() {
    log_info "Rolling back last migration..."
    check_migrations_table

    local last=$(run_sql "SELECT name FROM migrations ORDER BY id DESC LIMIT 1;")
    if [ -z "$last" ]; then
        log_info "No migrations to rollback"
        return 0
    fi

    local down_file="${MIGRATIONS_DIR}/${last%.sql}.down.sql"
    if [ ! -f "$down_file" ]; then
        log_error "Down migration file not found: $down_file"
        exit 1
    fi

    log_info "Rolling back: $last"
    if run_sql_file "$down_file" > /dev/null; then
        run_sql "DELETE FROM migrations WHERE name = '$last';"
        log_success "Rolled back: $last"
    else
        log_error "Failed to rollback: $last"
        exit 1
    fi
}

# Show migration status
migrate_status() {
    log_info "Migration Status"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    check_migrations_table
    local executed=$(get_executed_migrations)

    echo ""
    echo "Applied migrations:"
    if [ -z "$executed" ]; then
        echo "  (none)"
    else
        for name in $executed; do
            echo "  ✓ $name"
        done
    fi

    echo ""
    echo "Pending migrations:"
    local pending=$(get_pending_migrations)
    if [ -z "$pending" ]; then
        echo "  (none)"
    else
        for migration in $pending; do
            local name=$(basename "$migration")
            echo "  ○ $name"
        done
    fi
    echo ""
}

# Create new migration
migrate_create() {
    local name="$1"
    if [ -z "$name" ]; then
        log_error "Please provide a migration name"
        echo "Usage: $0 create <name>"
        exit 1
    fi

    local timestamp=$(date +%Y%m%d%H%M%S)
    local filename="${timestamp}_${name}.sql"
    local up_file="${MIGRATIONS_DIR}/${filename}"
    local down_file="${MIGRATIONS_DIR}/${timestamp}_${name}.down.sql"

    mkdir -p "$MIGRATIONS_DIR"

    cat > "$up_file" <<EOF
-- Migration: $name
-- Up migration

EOF

    cat > "$down_file" <<EOF
-- Rollback: $name
-- Down migration

EOF

    log_success "Created migration:"
    log_info "  Up:   $up_file"
    log_info "  Down: $down_file"
}

# Main
main() {
    check_psql

    local command="${1:-up}"

    case "$command" in
        up)
            migrate_up
            ;;
        down)
            migrate_down
            ;;
        status)
            migrate_status
            ;;
        create)
            migrate_create "$2"
            ;;
        *)
            log_error "Unknown command: $command"
            echo "Usage: $0 [up|down|status|create <name>]"
            exit 1
            ;;
    esac
}

main "$@"
