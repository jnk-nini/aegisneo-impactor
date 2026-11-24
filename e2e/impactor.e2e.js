import { expect, test } from "@playwright/test";

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const TICKET = `${b64({ alg: "HS256" })}.${b64({ username: "tester", role: "admin", exp: 4102444800 })}.signature`;

const APOPHIS = {
  neo_reference_id: "2099942",
  name: "99942 Apophis (2004 MN4)",
  estimated_diameter_km: 0.654,
  is_potentially_hazardous: true,
  close_approach_date: "2029-04-13",
  relative_velocity_km_h: 14832,
  miss_distance_km: 38000,
  absolute_magnitude: 19.09,
  is_featured: true,
};

async function mockApi(page) {
  await page.route("**/api/neo/asteroids/2099942", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(APOPHIS) }),
  );
  await page.route("**/api/neo/asteroids?*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ count: 1, matched: 1, total: 10, offset: 0, limit: 30, asteroids: [APOPHIS] }),
    }),
  );
  await page.route("**/api/neo/asteroids/random*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ count: 1, matched: 1, asteroids: [APOPHIS] }),
    }),
  );
  // NASA imagery is not what is being tested, and a test must not depend on it.
  await page.route("https://gibs.earthdata.nasa.gov/**", (route) => route.abort());
}

test("the page loads with the three steps and no JavaScript errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Choose an asteroid/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Launch impact/ })).toBeDisabled();
  expect(errors).toEqual([]);
});

test("searching finds an asteroid and selecting it fills in its real size", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await page
    .getByRole("searchbox")
    .or(page.getByPlaceholder(/Name, ID or year/))
    .first()
    .fill("apophis");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByText("99942 Apophis (2004 MN4)").first().click();
  await expect(page.getByLabel("Selected asteroid 99942 Apophis (2004 MN4)")).toBeVisible();
  await expect(page.getByLabel("Selected asteroid 99942 Apophis (2004 MN4)")).toContainText("654 m");
});

test("a link from the Explorer (?asteroid=ID) opens with that asteroid already chosen", async ({ page }) => {
  await mockApi(page);
  await page.goto(`/?asteroid=2099942#aegis_ticket=${TICKET}`);
  await expect(page.getByLabel("Selected asteroid 99942 Apophis (2004 MN4)")).toBeVisible();
  await expect(page).not.toHaveURL(/aegis_ticket/);
  await expect(page.locator(".aegis-pill")).toContainText("@tester");
  await expect(page.locator(".aegis-pill a")).toHaveAttribute("href", "https://aegisneo-hub.vercel.app/hub");
});

test("a malformed asteroid link is ignored", async ({ page }) => {
  await mockApi(page);
  await page.goto("/?asteroid=../stats");
  await expect(page.getByRole("heading", { name: /Choose an asteroid/ })).toBeVisible();
  await expect(page.getByLabel(/Selected asteroid/)).toHaveCount(0);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the hub badge is a dot at the top, away from the Launch button", async ({ page }) => {
    await mockApi(page);
    await page.goto(`/#aegis_ticket=${TICKET}`);
    const toggle = page.locator(".aegis-toggle");
    await expect(toggle).toBeVisible();
    expect((await toggle.boundingBox()).y).toBeLessThan(60);
    const launch = page.getByRole("button", { name: /Launch impact/ });
    const box = await launch.boundingBox();
    const topmost = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest("button")?.textContent ?? "",
      {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
      },
    );
    expect(topmost).toMatch(/Launch impact/);
  });

  test("nothing scrolls sideways", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Launch impact/ })).toBeVisible();
    const wide = await page.evaluate(
      () => document.documentElement.scrollWidth > (window.visualViewport?.width ?? innerWidth) + 1,
    );
    expect(wide).toBe(false);
  });
});
