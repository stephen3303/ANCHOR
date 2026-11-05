import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  const { users } = await (await page.request.get("/api/users")).json();
  const user = users.find((entry: { login: string }) => entry.login === "LTaylor");
  expect(user, "Seed the demo user before running browser checks").toBeTruthy();
  expect((await page.request.post("/api/session", { data: { userId: user.id } })).ok()).toBeTruthy();
}

async function longContent(page: Page) {
  await page.goto("/templates");
  await page.getByRole("button", { name: "Create template", exact: true }).click();
  await page.getByRole("textbox", { name: "Template name", exact: true }).fill("Unsaved scrolling fixture");
  await page.getByRole("textbox", { name: "Plaintext template", exact: true }).fill(Array.from({ length: 25 }, (_, index) => `{{ Variable ${index} }}`).join("\n"));
  await page.getByRole("button", { name: "Detect and configure variables", exact: true }).click();
  await expect.poll(() => page.getByRole("main").evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(1000);
}

async function expectViewportLocked(page: Page) {
  await expect.poll(() => page.evaluate(() => ({
    y: window.scrollY,
    x: window.scrollX,
    extraHeight: document.documentElement.scrollHeight - window.innerHeight,
    extraWidth: document.documentElement.scrollWidth - window.innerWidth,
  }))).toEqual({ y: 0, x: 0, extraHeight: 0, extraWidth: 0 });
  const footer = await page.getByRole("contentinfo").boundingBox();
  expect(footer).not.toBeNull();
  expect(Math.abs(footer!.y + footer!.height - page.viewportSize()!.height)).toBeLessThanOrEqual(1);
}

test.afterEach(async ({ page }) => { await page.request.delete("/api/session"); });

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 740 }]) {
  test(`content and navigation scroll without moving the footer (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await signIn(page);
    await longContent(page);
    const main = page.getByRole("main");
    const footerBefore = await page.getByRole("contentinfo").boundingBox();
    const headerBefore = await page.getByRole("banner").boundingBox();
    const box = (await main.boundingBox())!;
    await page.mouse.move(box.x + 8, box.y + 40);
    await page.mouse.wheel(0, 900);
    await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await main.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await page.mouse.wheel(0, 5000);
    await page.evaluate(() => window.scrollTo(10000, 10000));
    await expectViewportLocked(page);
    expect(await page.getByRole("contentinfo").boundingBox()).toEqual(footerBefore);
    expect(await page.getByRole("banner").boundingBox()).toEqual(headerBefore);

    if (viewport.width < 1024) await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
    const navigation = page.getByRole("navigation", { name: "Main", exact: true });
    await expect.poll(async () => (await navigation.boundingBox())?.x).toBe(0);
    const list = navigation.locator("ul");
    const navBox = (await list.boundingBox())!;
    const mainTop = await main.evaluate((element) => element.scrollTop);
    await page.mouse.move(navBox.x + 8, navBox.y + 40);
    await page.mouse.wheel(0, 600);
    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await list.evaluate((element) => { element.scrollTop = 0; });
    await page.mouse.wheel(0, -3000);
    await expectViewportLocked(page);
    expect(await main.evaluate((element) => element.scrollTop)).toEqual(mainTop);
    expect(await page.getByRole("contentinfo").boundingBox()).toEqual(footerBefore);
    if (viewport.width < 1024) {
      const nav = (await page.getByRole("navigation", { name: "Main", exact: true }).boundingBox())!;
      expect(nav.y + nav.height).toBeLessThanOrEqual(footerBefore!.y);
    }
  });
}

test("session errors stay inside the viewport instead of pushing the footer below it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page); await longContent(page);
  await page.route("**/api/session", (route) => route.request().method() === "GET"
    ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Simulated session service failure" }) })
    : route.continue());
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("Simulated session service failure", { exact: true })).toBeVisible();
  await expectViewportLocked(page);
  await page.getByRole("main").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expectViewportLocked(page);
});

test("printing releases viewport constraints so long content is not clipped", async ({ page }) => {
  await signIn(page); await longContent(page);
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("contentinfo")).toBeHidden();
  expect(await page.evaluate(() => getComputedStyle(document.body).overflowY)).toBe("visible");
  expect(await page.getByRole("main").evaluate((element) => getComputedStyle(element).overflowY)).toBe("visible");
  expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(true);
});

test("short sign-in viewports scroll their own pane and keep all controls reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 260 });
  await page.goto("/login");
  const pane = page.getByTestId("sign-in-pane");
  await expect(page.getByRole("heading", { name: "ANCHOR — Demo sign in", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeInViewport();
  expect(await pane.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => ({ y: scrollY, height: document.documentElement.scrollHeight - innerHeight }))).toEqual({ y: 0, height: 0 });
});
