import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const PORT       = parseInt(process.env.PORT  ?? "8080", 10);
const ML_PORT    = parseInt(process.env.ML_PORT ?? "5174", 10);
const ML_BASE    = `http://localhost:${ML_PORT}`;

// ── Shared file paths (must match vite.config.js exactly) ──────────────────
const mlDir           = path.resolve(__dirname, "ML_algorithm");
const commandsPath    = path.join(mlDir, "commands.json");
const logPath         = path.join(mlDir, "device_command_log.json");
const overridesPath   = path.join(mlDir, "override_events.json");
const rootOverridesPath = path.resolve(__dirname, "override_events.json");
const metricsPath     = path.join(mlDir, "smarthome_data", "model_metrics.csv");
const modelsDir       = path.join(mlDir, "smarthome_data", "models");

// ── Helpers (copied verbatim from vite.config.js) ──────────────────────────
async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch { return fallback; }
}

async function statOrNull(file) {
  try { return await fs.stat(file); } catch { return null; }
}

function parseCsvLine(line) {
  const cells = []; let current = ""; let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) { cells.push(current); current = ""; }
    else current += ch;
  }
  cells.push(current);
  return cells;
}

async function readMetrics() {
  try {
    const text = await fs.readFile(metricsPath, "utf8");
    const [headerLine, ...rows] = text.trim().split(/\r?\n/);
    const headers = parseCsvLine(headerLine);
    return rows.map(row => {
      const cells = parseCsvLine(row);
      return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
    });
  } catch { return []; }
}

async function listModels() {
  try { return (await fs.readdir(modelsDir)).filter(f => f.endsWith(".joblib")); }
  catch { return []; }
}

function buildDeviceState(commandsPayload, history) {
  const state = {};
  const apply = cmd => {
    if (!cmd?.device_id) return;
    state[cmd.device_id] ??= { device_id: cmd.device_id, params: {}, last_command: null, status: "Held" };
    state[cmd.device_id].last_command = cmd;
    if (cmd.is_valid === true && cmd.suppressed === false && !cmd.no_model) {
      state[cmd.device_id].params[String(cmd.parameter ?? "").replaceAll("_", " ")] = cmd.validated_value;
      state[cmd.device_id].status = "Executed";
      state[cmd.device_id].updated_at = cmd.timestamp;
    } else if (cmd.no_model) {
      state[cmd.device_id].status = "No Model";
    } else if (cmd.suppressed) {
      state[cmd.device_id].status = "Suppressed";
    }
  };
  Object.values(history ?? {}).flat().forEach(apply);
  (commandsPayload.commands ?? []).forEach(apply);
  return state;
}

// ── Sequential write queue for POST /api/overrides ─────────────────────────
// Prevents lost events when two sliders fire simultaneously (same race
// condition fixed in vite.config.js with _overrideWriteQueue).
let _overrideWriteQueue = Promise.resolve();

async function appendOverride(event) {
  _overrideWriteQueue = _overrideWriteQueue.then(async () => {
    const existing = await readJson(overridesPath, []);
    const next = [event, ...existing.filter(ev =>
      !(ev.timestamp === event.timestamp &&
        ev.device === event.device &&
        ev.parameter_changed === event.parameter_changed)
    )];
    await fs.mkdir(mlDir, { recursive: true });
    // Dual-write: ML_algorithm/ (Python reads this) + root (legacy path)
    await fs.writeFile(overridesPath, JSON.stringify(next, null, 2));
    await fs.writeFile(rootOverridesPath, JSON.stringify(next, null, 2));
    return next;
  });
  return _overrideWriteQueue;
}

// ── Express app ────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Serve built React app
app.use(express.static(path.join(__dirname, "dist")));

// GET /api/commands
app.get("/api/commands", async (req, res) => {
  const commands = await readJson(commandsPath, { generated_at: null, commands: [] });
  const history  = await readJson(logPath, {});
  const stat     = await statOrNull(commandsPath);
  res.json({ ...commands, history, file_mtime: stat?.mtime?.toISOString() ?? null });
});

// GET /api/command-history
app.get("/api/command-history", async (req, res) => {
  res.json(await readJson(logPath, {}));
});

// GET /api/overrides
app.get("/api/overrides", async (req, res) => {
  const mlOverrides = await readJson(overridesPath, null);
  res.json(Array.isArray(mlOverrides) ? mlOverrides : await readJson(rootOverridesPath, []));
});

// POST /api/overrides
app.post("/api/overrides", async (req, res) => {
  try {
    const event  = req.body;
    const events = await appendOverride(event);
    res.status(201).json({ ok: true, event, count: events.length });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// POST /api/simulate  →  proxy to Python
app.post("/api/simulate", async (req, res) => {
  try {
    const proxyRes = await fetch(`${ML_BASE}/api/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body)
    });
    res.status(proxyRes.status).json(await proxyRes.json());
  } catch (err) {
    res.status(502).json({ error: "Python ML Server not reachable", details: err.message });
  }
});

// POST /api/force-retrain  →  proxy to Python
app.post("/api/force-retrain", async (req, res) => {
  try {
    const proxyRes = await fetch(`${ML_BASE}/api/force-retrain`, { method: "POST" });
    res.status(proxyRes.status).json(await proxyRes.json());
  } catch (err) {
    res.status(502).json({ error: "Python ML Server not reachable" });
  }
});

// GET /api/deep-metrics  →  proxy to Python
// Required by /api/model-status internally; also called directly by the
// frontend's slow-poll in some builds.
app.get("/api/deep-metrics", async (req, res) => {
  try {
    const proxyRes = await fetch(`${ML_BASE}/api/deep-metrics`);
    res.status(proxyRes.status).json(await proxyRes.json());
  } catch (err) {
    res.status(502).json({ error: "Python ML Server not reachable" });
  }
});

// GET /api/device-state
app.get("/api/device-state", async (req, res) => {
  const commands = await readJson(commandsPath, { generated_at: null, commands: [] });
  const history  = await readJson(logPath, {});
  res.json({ generated_at: commands.generated_at, devices: buildDeviceState(commands, history) });
});

// GET /api/model-status
app.get("/api/model-status", async (req, res) => {
  let deepMetrics = {};
  try {
    const dRes = await fetch(`${ML_BASE}/api/deep-metrics`);
    if (dRes.ok) deepMetrics = await dRes.json();
  } catch { /* Python not ready yet — non-fatal */ }

  const [metrics, models, commands, overrides, history] = await Promise.all([
    readMetrics(), listModels(),
    readJson(commandsPath, { generated_at: null, commands: [] }),
    readJson(overridesPath, []),
    readJson(logPath, {})
  ]);

  const latestMetric = metrics.at(-1);
  const available    = metrics.filter(r => r.status === "OK");
  const missing      = metrics.filter(r => r.status && r.status !== "OK");

  res.json({
    models_loaded:            models.length,
    models_available:         available.length,
    models_missing:           missing.length,
    missing_models:           missing.slice(-12).map(r => ({ device_id: r.device_id, parameter: r.parameter, reason: r.reason || r.status })),
    last_training_time:       latestMetric?.timestamp ?? null,
    last_prediction_time:     commands.generated_at ?? null,
    last_retraining_time:     deepMetrics.last_retraining_time ?? null,
    confidence_threshold:     0.7,
    suppression_threshold:    0.7,
    commands_processed:       Object.values(history ?? {}).reduce((s, e) => s + (Array.isArray(e) ? e.length : 0), 0),
    overrides_recorded:       Array.isArray(overrides) ? overrides.length : 0,
    learning_events_generated:Array.isArray(overrides) ? overrides.length : 0,
    training_dataset_size:    deepMetrics.total_training_samples ?? 0,
    feature_count:            deepMetrics.feature_count ?? 0,
    global_accuracy_average:  deepMetrics.global_accuracy_average ?? null,
    metrics_file:             metricsPath,
    commands_file:            commandsPath,
    overrides_file:           overridesPath
  });
});

// SPA fallback — serve index.html for any unknown route
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`[server.js] Express listening on port ${PORT}`);
  console.log(`[server.js] ML backend expected at ${ML_BASE}`);
});
