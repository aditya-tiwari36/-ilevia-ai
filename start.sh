#!/usr/bin/env bash
# ============================================================================
# Ilevia AI Smart Home — Startup Script
# ============================================================================
# Starts BOTH the Python ML pipeline AND the Vite dev server in the correct
# order with the correct environment variables.
#
# Usage:
#   chmod +x start.sh
#   ./start.sh                    # normal run (retrain after 10 events)
#   DEMO_MODE=1 ./start.sh        # demo run   (retrain after 1 event)
#   ML_PORT=5175 ./start.sh       # custom ML port (if 5174 is taken)
# ============================================================================

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
ML_PORT="${ML_PORT:-5174}"
DEMO_MODE="${DEMO_MODE:-0}"
OWM_API_KEY="${OWM_API_KEY:-}"    # optional OpenWeatherMap key

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║       Ilevia AI Smart Home — Startup            ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  Repo dir  : $REPO_DIR"
echo "  ML port   : $ML_PORT"
echo "  Demo mode : $DEMO_MODE  (DEMO_MODE=1 lowers retrain threshold to 1 row)"
echo ""

# Ensure ML_algorithm/ shared directory exists
mkdir -p "$REPO_DIR/ML_algorithm"

# ── 1. Kill any previous instances ──────────────────────────────────────────
echo "[start.sh] Stopping any previous instances..."
pkill -f "smart_home_pipeline.py" 2>/dev/null || true
pkill -f "vite"                   2>/dev/null || true
sleep 1

# ── 2. Start Python ML server ────────────────────────────────────────────────
echo "[start.sh] Starting Python ML pipeline (port $ML_PORT)..."
export ML_PORT
export DEMO_MODE
cd "$REPO_DIR"
python3 smart_home_pipeline.py production ${OWM_API_KEY:+"$OWM_API_KEY"} \
  > "$REPO_DIR/logs/pipeline.log" 2>&1 &
PYTHON_PID=$!
echo "[start.sh] Python PID: $PYTHON_PID  (log: logs/pipeline.log)"

# Wait for ML server to be ready (polls /api/deep-metrics)
echo "[start.sh] Waiting for Python ML server to be ready..."
for i in $(seq 1 60); do
  if curl -sf "http://localhost:$ML_PORT/api/deep-metrics" > /dev/null 2>&1; then
    echo "[start.sh] ✅ Python ML server ready (${i}s)"
    break
  fi
  sleep 1
  if [ $i -eq 60 ]; then
    echo "[start.sh] ⚠  Python ML server not ready after 60s — Vite will start anyway."
    echo "           Check logs/pipeline.log for errors."
  fi
done

# ── 3. Start Vite dev server ─────────────────────────────────────────────────
echo "[start.sh] Starting Vite dev server (port 5173)..."
mkdir -p "$REPO_DIR/logs"
npm run dev --prefix "$REPO_DIR" \
  > "$REPO_DIR/logs/vite.log" 2>&1 &
VITE_PID=$!
echo "[start.sh] Vite PID: $VITE_PID  (log: logs/vite.log)"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Both processes running. Open:                  ║"
echo "║  http://localhost:5173                          ║"
echo "║                                                  ║"
echo "║  Press Ctrl+C to stop both processes.           ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── 4. Trap Ctrl+C and kill both ────────────────────────────────────────────
cleanup() {
  echo ""
  echo "[start.sh] Shutting down..."
  kill $PYTHON_PID 2>/dev/null || true
  kill $VITE_PID   2>/dev/null || true
  echo "[start.sh] Done."
}
trap cleanup INT TERM

wait
