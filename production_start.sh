#!/usr/bin/env bash
set -e

echo "[production_start.sh] Starting Ilevia AI services..."

# Ensure shared directory exists (Railway volume may be freshly attached)
mkdir -p /app/ML_algorithm/smarthome_data/models
mkdir -p /app/logs

export ML_PORT="${ML_PORT:-5174}"
export PORT="${PORT:-8080}"
export DEMO_MODE="${DEMO_MODE:-0}"

# ── Start Python ML server in background ────────────────────────────────────
echo "[production_start.sh] Starting Python ML server on port $ML_PORT..."
cd /app
python3 smart_home_pipeline.py production \
  > /app/logs/pipeline.log 2>&1 &
PYTHON_PID=$!
echo "[production_start.sh] Python PID: $PYTHON_PID"

# ── Wait for Python server to be ready (up to 120s) ─────────────────────────
echo "[production_start.sh] Waiting for Python ML server..."
for i in $(seq 1 120); do
  if curl -sf "http://localhost:${ML_PORT}/api/deep-metrics" > /dev/null 2>&1; then
    echo "[production_start.sh] ✅ Python ready after ${i}s"
    break
  fi
  sleep 1
  if [ "$i" -eq 120 ]; then
    echo "[production_start.sh] ⚠ Python not ready after 120s — Express will start anyway."
    echo "  Check /app/logs/pipeline.log"
  fi
done

# ── Graceful shutdown ────────────────────────────────────────────────────────
cleanup() {
  echo "[production_start.sh] Shutting down..."
  kill -TERM "$PYTHON_PID" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM EXIT

# ── Start Express in foreground (Railway health-checks this process) ─────────
echo "[production_start.sh] Starting Express on port $PORT..."
node server.js
