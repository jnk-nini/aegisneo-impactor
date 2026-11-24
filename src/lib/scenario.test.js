import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSim } from "../store.js";
import { applyAsteroidParam } from "./scenario.js";
import { api } from "./api.js";

const BENNU = {
  neo_reference_id: "2101955",
  name: "101955 Bennu (1999 RQ36)",
  estimated_diameter_km: 0.49,
  relative_velocity_km_h: 21600,
};
const initial = useSim.getState();

describe("a link from the Explorer (?asteroid=ID)", () => {
  beforeEach(() => {
    useSim.setState(initial, true);
    vi.restoreAllMocks();
  });

  it("chooses that asteroid with its real size", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue(BENNU);
    expect(await applyAsteroidParam("?asteroid=2101955")).toBe(true);
    expect(get).toHaveBeenCalledWith("2101955");
    expect(useSim.getState().asteroid.name).toBe(BENNU.name);
    expect(useSim.getState().diameterM).toBeCloseTo(490, 6);
  });

  it("ignores a link without an asteroid or with a malformed one, without asking the API", async () => {
    const get = vi.spyOn(api, "get");
    for (const search of [
      "",
      "?d=100&v=20",
      "?asteroid=",
      "?asteroid=../stats",
      "?asteroid=" + "9".repeat(40),
    ]) {
      expect(await applyAsteroidParam(search)).toBe(false);
    }
    expect(get).not.toHaveBeenCalled();
    expect(useSim.getState().asteroid).toBeNull();
  });

  it("does nothing when the catalog does not have the asteroid", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new Error("not found"));
    expect(await applyAsteroidParam("?asteroid=1234")).toBe(false);
    expect(useSim.getState().asteroid).toBeNull();
  });
});
