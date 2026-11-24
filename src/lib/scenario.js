// Restores a scenario from a share link or a saved entry.
import { useSim } from "../store.js";
import { api } from "./api.js";
import { queryToScenario } from "./share.js";
import { pickTarget } from "./target.js";
import { COMPOSITIONS } from "../physics/impact.js";

export async function applyScenarioQuery(query, { launch = false } = {}) {
  const scenario = queryToScenario(query, COMPOSITIONS);
  if (!scenario) return false;
  // Loading a saved scenario mid-animation replaces the run, target included.
  useSim.getState().clearRun();
  if (scenario.asteroidId) {
    try {
      const asteroid = await api.get(scenario.asteroidId);
      useSim.getState().selectAsteroid(asteroid);
    } catch {
      // The object may have been removed from the catalog; keep the custom values.
    }
  }
  useSim.setState({
    diameterM: scenario.diameterM,
    velocityKms: scenario.velocityKms,
    angleDeg: scenario.angleDeg,
    azimuthDeg: scenario.azimuthDeg,
    composition: scenario.composition,
  });
  if (scenario.target) await pickTarget(scenario.target.lat, scenario.target.lon);
  if (launch && useSim.getState().target) useSim.getState().launch();
  return true;
}

const ASTEROID_ID = /^[A-Za-z0-9_-]{1,32}$/;

/**
 * A link from the AegisNEO Explorer ("Open in Impactor") carries just ?asteroid=<id>:
 * choose that asteroid with its real size and speed, and let the visitor pick the target.
 * Returns false when the link has no asteroid or the catalog does not have it.
 */
export async function applyAsteroidParam(search) {
  const id = new URLSearchParams(search).get("asteroid");
  if (!id || !ASTEROID_ID.test(id)) return false;
  try {
    useSim.getState().selectAsteroid(await api.get(id));
    return true;
  } catch {
    return false;
  }
}
