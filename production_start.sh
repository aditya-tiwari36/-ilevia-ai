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
cd /app/ML_algorithm
python3 smart_home_pipeline.py production \
  > /app/logs/pipeline.log 2>&1 &
PYTHON_PID=$!
echo "[production_start.sh] Python PID: $PYTHON_PID"

# ── Start Express immediately so Railway port binding succeeds ───────────────
echo "[production_start.sh] Starting Express on port $PORT..."
cd /app
node server.js &
EXPRESS_PID=$!

# ── Wait for Python server to be ready (up to 120s) ─────────────────────────
echo "[production_start.sh] Waiting for Python ML server..."
for i in $(seq 1 120); do
  if curl -sf "http://localhost:${ML_PORT}/api/deep-metrics" > /dev/null 2>&1; then
    echo "[production_start.sh] ✅ Python ready after ${i}s"
    break
  fi
  sleep 1
  if [ "$i" -eq 120 ]; then
    echo "[production_start.sh] ⚠ Python not ready after 120s."
    echo "  Check /app/logs/pipeline.log"
  fi
done

# ── Wait for Express to keep container alive ─────────────────────────────────
wait $EXPRESS_PID
