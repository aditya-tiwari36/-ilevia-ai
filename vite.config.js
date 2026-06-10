import react from "@vitejs/plugin-react";
import fs from "node:fs/promises";
import path from "node:path";
import { defineConfig } from "vite";

// Fix 1.4: Read ML_PORT from environment so both sides can be reconfigured
// without touching code. Default 5174 matches the Python MLApiServer default.
// If Vite auto-increments to 5174 (e.g. 5173 already taken), set ML_PORT=5175
// in the environment before starting both processes.
const ML_PORT = parseInt(process.env.ML_PORT ?? "5174", 10);
const ML_BASE_URL = `http://localhost:${ML_PORT}`;

const mlDir = path.resolve(process.cwd(), "ML_algorithm");
const rootDir = process.cwd();
const commandsPath = path.join(mlDir, "commands.json");
const logPath = path.join(mlDir, "device_command_log.json");
const overridesPath = path.join(mlDir, "override_events.json");
const rootOverridesPath = path.join(rootDir, "override_events.json");
const metricsPath = path.join(mlDir, "smarthome_data", "model_metrics.csv");
const modelsDir = path.join(mlDir, "smarthome_data", "models");

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function statOrNull(file) {
  try {
    return await fs.stat(file);
  } catch {
    return null;
  }
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      cells.push(current);
      current = "";
    } else current += ch;
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
  } catch {
    return [];
  }
}

async function listModels() {
  try {
    return (await fs.readdir(modelsDir)).filter(file => file.endsWith(".joblib"));
  } catch {
    return [];
  }
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

// P2-2: Sequential write queue for appendOverride.
// Without this, two concurrent POSTs (e.g. user adjusts two sliders rapidly)
// could both read the current array, then both write — last write wins and
// one override event is permanently lost. The queue serialises all appends.
let _overrideWriteQueue = Promise.resolve();

async function appendOverride(event) {
  // Enqueue: each call waits for the previous to fully complete.
  // Tail of the chain is reassigned so completed promises can be GC'd.
  _overrideWriteQueue = _overrideWriteQueue.then(async () => {
    const existing = await readJson(overridesPath, []);
    const next = [event, ...existing.filter(ev =>
      !(ev.timestamp === event.timestamp &&
        ev.device     === event.device &&
        ev.parameter_changed === event.parameter_changed)
    )];
    await fs.mkdir(mlDir, { recursive: true });
    // Write ML_algorithm/override_events.json (Python reads this)
    await fs.writeFile(overridesPath, JSON.stringify(next, null, 2));
    // Write root override_events.json (legacy path, keep in sync)
    await fs.writeFile(rootOverridesPath, JSON.stringify(next, null, 2));
    return next;
  });
  return _overrideWriteQueue;
}

function smartHomeJsonApi() {
  return {
    name: "smart-home-json-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, "http://localhost");

        if (url.pathname === "/api/commands" && req.method === "GET") {
          const commands = await readJson(commandsPath, { generated_at: null, commands: [] });
          const history = await readJson(logPath, {});
          const stat = await statOrNull(commandsPath);
          return send(res, 200, { ...commands, history, file_mtime: stat?.mtime?.toISOString() ?? null });
        }

        if (url.pathname === "/api/command-history" && req.method === "GET") {
          return send(res, 200, await readJson(logPath, {}));
        }

        if (url.pathname === "/api/overrides" && req.method === "GET") {
          const mlOverrides = await readJson(overridesPath, null);
          return send(res, 200, Array.isArray(mlOverrides) ? mlOverrides : await readJson(rootOverridesPath, []));
        }

        if (url.pathname === "/api/overrides" && req.method === "POST") {
          let raw = "";
          req.on("data", chunk => {
            raw += chunk;
          });
          req.on("end", async () => {
            try {
              const event = JSON.parse(raw);
              const events = await appendOverride(event);
              send(res, 201, { ok: true, event, count: events.length });
            } catch (error) {
              send(res, 400, { ok: false, error: error.message });
            }
          });
          return;
        }

        if (url.pathname === "/api/simulate" && req.method === "POST") {
          let raw = "";
          req.on("data", chunk => raw += chunk);
          req.on("end", async () => {
            try {
              const proxyRes = await fetch(`${ML_BASE_URL}/api/simulate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: raw
              });
              const data = await proxyRes.json();
              send(res, proxyRes.status, data);
            } catch (err) {
              send(res, 502, { error: "Python ML Server not reachable", details: err.message });
            }
          });
          return;
        }

        if (url.pathname === "/api/force-retrain" && req.method === "POST") {
          try {
            const proxyRes = await fetch(`${ML_BASE_URL}/api/force-retrain`, { method: "POST" });
            const data = await proxyRes.json();
            send(res, proxyRes.status, data);
          } catch (err) {
            send(res, 502, { error: "Python ML Server not reachable" });
          }
          return;
        }

        if (url.pathname === "/api/device-state" && req.method === "GET") {
          const commands = await readJson(commandsPath, { generated_at: null, commands: [] });
          const history = await readJson(logPath, {});
          return send(res, 200, {
            generated_at: commands.generated_at,
            devices: buildDeviceState(commands, history)
          });
        }

        if (url.pathname === "/api/model-status" && req.method === "GET") {
          let deepMetrics = {};
          try {
            const dRes = await fetch(`${ML_BASE_URL}/api/deep-metrics`);
            if (dRes.ok) deepMetrics = await dRes.json();
          } catch (e) {
            console.error("Could not fetch deep metrics from Python server");
          }

          const [metrics, models, commands, overrides, history] = await Promise.all([
            readMetrics(),
            listModels(),
            readJson(commandsPath, { generated_at: null, commands: [] }),
            readJson(overridesPath, []),
            readJson(logPath, {})
          ]);
          const latestMetric = metrics.at(-1);
          const available = metrics.filter(row => row.status === "OK");
          const missing = metrics.filter(row => row.status && row.status !== "OK");
          return send(res, 200, {
            models_loaded: models.length,
            models_available: available.length,
            models_missing: missing.length,
            missing_models: missing.slice(-12).map(row => ({ device_id: row.device_id, parameter: row.parameter, reason: row.reason || row.status })),
            last_training_time: latestMetric?.timestamp ?? null,
            last_prediction_time: commands.generated_at ?? null,
            last_retraining_time: deepMetrics.last_retraining_time ?? null,
            confidence_threshold: 0.7,
            suppression_threshold: 0.7,
            commands_processed: Object.values(history ?? {}).reduce((sum, entries) => sum + (Array.isArray(entries) ? entries.length : 0), 0),
            overrides_recorded: Array.isArray(overrides) ? overrides.length : 0,
            learning_events_generated: Array.isArray(overrides) ? overrides.length : 0,
            training_dataset_size: deepMetrics.total_training_samples ?? 0,
            feature_count: deepMetrics.feature_count ?? 0,
            global_accuracy_average: deepMetrics.global_accuracy_average ?? null,
            metrics_file: metricsPath,
            commands_file: commandsPath,
            overrides_file: overridesPath
          });
        }

        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), smartHomeJsonApi()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          motion: ["framer-motion"],
          charts: ["recharts"],
          icons: ["lucide-react"]
        }
      }
    }
  },
  server: {
    port: 5173
  }
});
