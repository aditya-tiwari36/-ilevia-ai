# Ilevia AI — Smart Home Intelligence System

> Real-time ML-powered smart home automation with a continuous learning loop.

## Architecture

```
smart_home_pipeline.py (Python 3.12)
   ↕  file bus (ML_algorithm/)
vite.config.js middleware (Node / Vite dev server)
   ↕  HTTP
React frontend (port 5173)
```

**Critical:** Both processes share files under `Ilevia-ai/ML_algorithm/`:
- `ML_algorithm/commands.json` — Python **writes**, Vite **reads**
- `ML_algorithm/override_events.json` — Vite **writes**, Python **reads**
- `ML_algorithm/smarthome_data/` — models, metrics, log store

---

## Quick Start

### Option A — Automated (recommended)

```bash
chmod +x start.sh
./start.sh
# Opens at http://localhost:5173
```

For demo (retrains after every override, not every 10):

```bash
DEMO_MODE=1 ./start.sh
```

### Option B — Manual (two terminals)

**Terminal 1 — Python ML pipeline:**
```bash
cd Ilevia-ai/          # MUST run from repo root
export DEMO_MODE=1     # optional: lower retrain threshold
python3 smart_home_pipeline.py production
```

**Terminal 2 — Vite frontend:**
```bash
cd Ilevia-ai/
npm run dev
```

Open `http://localhost:5173`

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `ML_PORT` | `5174` | Port for the Python ML HTTP server. Set both envs to the same value if you need to change it. |
| `DEMO_MODE` | `0` | Set to `1` to lower the retrain threshold from 10 rows → 1 row, so the learning loop closes in a 30-minute demo. |
| `OWM_API_KEY` | *(none)* | OpenWeatherMap API key for live weather features. Degrades gracefully without it. |

---

## The Learning Loop (CTO Demo Flow)

1. **Python starts** → loads 17 RandomForest models from `ML_algorithm/smarthome_data/models/`
2. **Frontend polls** `/api/commands` every 5 seconds → devices update from AI predictions
3. **User adjusts a device** → override event written to `ML_algorithm/override_events.json`
4. **Python learning loop** → reads override events → appends to activity log → retrains models
5. **Next prediction cycle** → new models produce updated predictions
6. **Step 6 activates** in Learning Loop UI → `last_retraining_time` appears in Model Status

To trigger retraining immediately without waiting: click **"Force Retrain"** in the AI Console → Learning Loop tab.

---

## Troubleshooting

### "No simulation predictions" / amber warning in Simulation tab
Python ML server is not reachable on port 5174. Check:
```bash
curl http://localhost:5174/api/deep-metrics
```
If that fails, restart Python: `python3 smart_home_pipeline.py production`

### Devices not updating from AI
Check that `ML_algorithm/commands.json` is being updated:
```bash
watch -n 5 'cat ML_algorithm/commands.json | python3 -m json.tool | head -10'
```
If the file is stale, Python may be running from the wrong directory or crashed.

### Port conflict (5174 already in use)
```bash
ML_PORT=5175 ./start.sh
```

### Force a fresh retrain
```bash
# Via UI: AI Console → Learning Loop → "Force Retrain" button
# Via CLI:
curl -X POST http://localhost:5174/api/force-retrain
```

### Missing models (devices show "No Model")
11 of 18 device parameters currently have trained models. To train the missing ones,
run the demo pipeline with `activity_log_weather.csv` containing sufficient rows for:
`Bedroom_Fan_2`, `Kitchen_LED_1`, `Garden_LED_1`, `Entrance_LED_1`

---

## File Structure

```
Ilevia-ai/
├── smart_home_pipeline.py     # Python ML engine + HTTP server
├── start.sh                   # Startup script (run this)
├── vite.config.js             # Vite dev server + API middleware
├── src/                       # React frontend
│   ├── context/HomeContext.jsx
│   ├── hooks/useCommandsPoller.js
│   ├── services/
│   └── components/
├── ML_algorithm/              # ← SHARED FILE BUS (Python ↔ Vite)
│   ├── commands.json          # Python writes, frontend reads
│   ├── override_events.json   # Frontend writes, Python reads
│   ├── smarthome_data/
│   │   ├── models/            # 17 trained .joblib files
│   │   ├── model_metrics.csv
│   │   ├── encoders.joblib
│   │   └── activity_log_store.csv
│   └── activity_log_weather.csv  # seed training data
├── Smart_Home_IoT_Parameters-v2.csv  # device schema
└── activity_log_weather.csv   # seed training data (root copy)
```

---

## Production Deployment

> ⚠ **The current backend (Vite middleware) is dev-only.** For production:
> 1. Create a standalone Express or FastAPI server serving the same API endpoints
> 2. Build the frontend: `npm run build`
> 3. Serve `dist/` via nginx or Express static middleware
> 4. Run the Python ML server as a systemd service
