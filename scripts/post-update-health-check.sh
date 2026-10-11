#!/bin/bash

APP_DIR="$1"
PREV_HEAD="$2"
BACKUP_BASE="$3"
PORT="${4:-7575}"
HEALTH_URL="http://localhost:${PORT}/health"
LOG_FILE="${APP_DIR}/logs/update-post-check.log"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

restart_app() {
  if command -v pm2 >/dev/null 2>&1; then
    pm2 restart ozanglive >/dev/null 2>&1 && return 0
    pm2 restart ecosystem.config.js >/dev/null 2>&1 && return 0
  fi
  return 1
}

log "Post-update health check started."
log "Using health endpoint: ${HEALTH_URL}"

sleep 3

if restart_app; then
  log "Application restart initiated."
else
  log "Warning: PM2 restart failed or PM2 not available."
fi

health_ok=false
for attempt in $(seq 1 10); do
  status=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 "$HEALTH_URL" || echo "000")
  if [ "$status" = "200" ]; then
    health_ok=true
    log "Health check passed on attempt ${attempt}."
    break
  fi
  log "Health check attempt ${attempt} failed (status ${status}). Retrying..."
  sleep 6
done

if [ "$health_ok" = true ]; then
  log "Post-update health check completed successfully."
  exit 0
fi

log "Health check failed after retries. Starting rollback..."

if command -v pm2 >/dev/null 2>&1; then
  pm2 stop ozanglive >/dev/null 2>&1 || true
fi

if [ -n "$PREV_HEAD" ]; then
  log "Rolling back to commit ${PREV_HEAD}..."
  git -C "$APP_DIR" reset --hard "$PREV_HEAD" >>"$LOG_FILE" 2>&1 || log "Warning: git reset failed."
else
  log "Warning: No previous commit hash available for rollback."
fi

log "Reinstalling dependencies after rollback..."
npm --prefix "$APP_DIR" install >>"$LOG_FILE" 2>&1 || log "Warning: npm install failed during rollback."

if [ -n "$BACKUP_BASE" ]; then
  db_dir="${APP_DIR}/db"
  if [ -f "${BACKUP_BASE}.db" ]; then
    log "Restoring database backup..."
    cp -f "${BACKUP_BASE}.db" "${db_dir}/streamflow.db" || log "Warning: Failed to restore database file."
    if [ -f "${BACKUP_BASE}.db-wal" ]; then
      cp -f "${BACKUP_BASE}.db-wal" "${db_dir}/streamflow.db-wal" || log "Warning: Failed to restore WAL file."
    fi
    if [ -f "${BACKUP_BASE}.db-shm" ]; then
      cp -f "${BACKUP_BASE}.db-shm" "${db_dir}/streamflow.db-shm" || log "Warning: Failed to restore SHM file."
    fi
  else
    log "Warning: Backup database file not found at ${BACKUP_BASE}.db"
  fi
fi

if restart_app; then
  log "Application restarted after rollback."
else
  log "Warning: PM2 restart failed after rollback."
fi

log "Rollback process finished."
exit 1
