/**
 * SimulationEngine
 *
 * Abstraction layer for simulation variables.
 * Does NOT replace the real ML pipeline.
 * Instead, computes adjustment overlays on top of the real commands.json output,
 * demonstrating how the ML pipeline would react to different context inputs.
 */

import { weatherByLocation } from "../data/home.js";

/**
 * Generate simulated command adjustments by querying the REAL ML pipeline.
 * Returns an array of "delta" objects:
 * { device_id, parameter, simulated_value, reason, confidence }
 */
export async function generateSimulatedDeltas(params) {
  const { month, season, location, hour, occupancy, roomOccupancy } = params;
  const weather = weatherByLocation[location] ?? weatherByLocation["Mumbai"];

  try {
    const response = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        month, season, hour, occupancy, roomOccupancy,
        weather: {
          temp: weather.temp,
          humidity: weather.humidity,
          wind: weather.wind,
          condition: weather.condition,
          feels: weather.temp + 1,
          daylight: hour >= 6 && hour <= 18
        }
      })
    });

    if (!response.ok) {
      console.warn("Simulation API returned error:", response.status);
      return [];
    }

    const data = await response.json();
    return data.deltas || [];
  } catch (e) {
    console.error("Failed to fetch simulated deltas:", e);
    return [];
  }
}

export function simulatedDeltasToCommands(deltas, context = {}) {
  const timestamp = new Date().toISOString();
  return deltas
    .filter(delta => delta?.device_id)
    .map(delta => ({
      device_id: delta.device_id,
      device_type: "Simulation Service",
      parameter: delta.parameter,
      validated_value: delta.simulated_value,
      confidence: delta.confidence ?? 0.72,
      is_valid: true,
      suppressed: false,
      no_model: false,
      reason: delta.reason,
      timestamp,
      trigger: "Simulation_Service",
      simulation: true,
      context
    }));
}

/** Get month index (0–11) */
export function monthIndex(monthName) {
  return ["January","February","March","April","May","June",
          "July","August","September","October","November","December"]
    .indexOf(monthName);
}
