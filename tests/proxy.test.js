import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../api/neo.js";

// Lives outside api/ because Vercel turns every file in api/ into a function.

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.status = (code) => ((res.statusCode = code), res);
  res.setHeader = (key, value) => ((res.headers[key] = value), res);
  res.json = (obj) => ((res.body = obj), res);
  res.send = (text) => ((res.body = text), res);
  return res;
}

describe("api/neo proxy", () => {
  beforeEach(() => {
    process.env.AEGISNEO_API_KEY = "test-key";
    process.env.AEGISNEO_API_URL = "https://api.example.test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"ok":true}', { status: 200 })),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards allowed paths and params with the key attached", async () => {
    const res = mockRes();
    await handler({ method: "GET", query: { path: "asteroids", search: "Bennu", limit: "30" } }, res);
    expect(res.statusCode).toBe(200);
    const [url, init] = fetch.mock.calls[0];
    expect(url.toString()).toBe("https://api.example.test/api/v1/asteroids?search=Bennu&limit=30");
    expect(init.headers["x-api-key"]).toBe("test-key");
    expect(res.headers["Cache-Control"]).toContain("private");
    expect(res.headers.Vary).toBe("x-aegisneo-ticket");
  });

  it("rejects unknown parameters, so they can't be used to skip the cache", async () => {
    const res = mockRes();
    await handler({ method: "GET", query: { path: "asteroids", search: "Bennu", nocache: "123" } }, res);
    expect(res.statusCode).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("cuts over-long values and trims a key pasted with a stray newline", async () => {
    process.env.AEGISNEO_API_KEY = "  test-key\n";
    const res = mockRes();
    await handler({ method: "GET", query: { path: "asteroids", search: "x".repeat(500) } }, res);
    const [url, init] = fetch.mock.calls[0];
    expect(new URL(url).searchParams.get("search")).toHaveLength(64);
    expect(init.headers["x-api-key"]).toBe("test-key");
  });

  it("allows single asteroids and random picks, and never caches random picks", async () => {
    const one = mockRes();
    await handler({ method: "GET", query: { path: "asteroids/2101955" } }, one);
    expect(one.statusCode).toBe(200);
    const random = mockRes();
    await handler({ method: "GET", query: { path: "asteroids/random", hazardous: "true" } }, random);
    expect(random.statusCode).toBe(200);
    expect(random.headers["Cache-Control"]).toBe("no-store");
  });

  it("rejects unknown, unused or traversal paths without calling upstream", async () => {
    for (const path of ["", "health", "stats", "asteroids/../stats", "asteroids/a/b", "docs"]) {
      const res = mockRes();
      await handler({ method: "GET", query: { path } }, res);
      expect(res.statusCode).toBe(404);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects non-GET methods", async () => {
    const res = mockRes();
    await handler({ method: "POST", query: { path: "asteroids" } }, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe("GET");
  });

  it("fails clearly when the key is not configured", async () => {
    delete process.env.AEGISNEO_API_KEY;
    const res = mockRes();
    await handler({ method: "GET", query: { path: "asteroids" } }, res);
    expect(res.statusCode).toBe(500);
  });

  it("passes upstream errors through without caching them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"detail":"nope"}', { status: 401 })),
    );
    const res = mockRes();
    await handler({ method: "GET", query: { path: "asteroids" } }, res);
    expect(res.statusCode).toBe(401);
    expect(res.headers["Cache-Control"]).toBe("no-store");
  });

  it("returns 504 on a timeout and 502 when the API is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
      }),
    );
    const slow = mockRes();
    await handler({ method: "GET", query: { path: "asteroids" } }, slow);
    expect(slow.statusCode).toBe(504);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const down = mockRes();
    await handler({ method: "GET", query: { path: "asteroids" } }, down);
    expect(down.statusCode).toBe(502);
  });
});
