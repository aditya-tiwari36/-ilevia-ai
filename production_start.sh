#!/usr/bin/env bash
set -e

echo "[production_start.sh] Starting Ilevia AI services..."

mkdir -p /app/ML_algorithm/smarthome_data/models
mkdir -p /app/logs

export ML_PORT="${ML_PORT:-5174}"
export PORT="${PORT:-8080}"
export DEMO_MODE="${DEMO_MODE:-0}"

# ── Start Python ML server with better error capture ────────────────────────
echo "[production_start.sh] Starting Python ML server on port $ML_PORT..."
cd /app/ML_algorithm
python3 -u smart_home_pipeline.py production \
  > /app/logs/pipeline.log 2>&1 &
PYTHON_PID=$!
echo "[production_start.sh] Python PID: $PYTHON_PID"

# Give Python a moment to start and fail if it's going to
sleep 2
if ! kill -0 $PYTHON_PID 2>/dev/null; then
  echo "[production_start.sh] ❌ Python process died immediately!"
  echo "--- Last 50 lines of pipeline.log ---"
  tail -50 /app/logs/pipeline.log || echo "(log file empty)"
  exit 1
fi

# ── Start Express ──────────────────────────────────────────────────────────
echo "[production_start.sh] Starting Express on port $PORT..."
cd /app
node server.js &
EXPRESS_PID=$!

# ── Wait for Python server ─────────────────────────────────────────────────
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
    tail -50 /app/logs/pipeline.log || echo "(log file empty)"
  fi
done

wait $EXPRESS_PID
