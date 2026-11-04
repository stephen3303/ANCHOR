import { expect, test, type Page } from "@playwright/test";

function collectRenderErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /dropped segment|segment was dropped|could not validate|error occurred while attempting to validate instant/i.test(message.text())) errors.push(message.text());
  });
  return errors;
}

async function demoAccount(page: Page): Promise<string> {
  const response = await page.request.get("/api/users");
  expect(response.ok()).toBeTruthy();
  const { users } = await response.json();
  const account = users.find((user: { login: string }) => user.login === "LTaylor");
  expect(account, "Run migrations and npm run db:seed:users before browser tests").toBeTruthy();
  return account.id;
}

async function signIn(page: Page) {
  const userId = await demoAccount(page);
  const response = await page.request.post("/api/session", { data: { userId } });
  expect(response.ok()).toBeTruthy();
}

test("signed-out deep links redirect to the login route without dropped segments", async ({ page }) => {
  const errors = collectRenderErrors(page);
  for (const route of ["/templates", "/messages", "/profile"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "ANCHOR — Demo sign in" })).toBeVisible();
  }
  await page.waitForTimeout(500); // Let the dev-only navigation validator report.
  expect(errors).toEqual([]);
});

test("login, hard refresh, client navigation and logout render the workspace correctly", async ({ page }) => {
  const errors = collectRenderErrors(page);
  try {
    const userId = await demoAccount(page);
    await page.goto("/login");
    await page.getByRole("combobox", { name: "Account" }).selectOption(userId);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Welcome back, LT Taylor" })).toBeVisible();

    await page.goto("/templates");
    await expect(page.getByRole("heading", { name: "Message Templates", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Message Templates", exact: true })).toBeVisible();

    const navigation = page.getByRole("navigation", { name: "Main", exact: true });
    await navigation.locator('a[href="/messages"]').click();
    await expect(page).toHaveURL(/\/messages$/);
    await expect(page.getByRole("heading", { name: /^Messages/ })).toBeVisible();
    await navigation.locator('a[href="/profile"]').click();
    await expect(page.getByRole("heading", { name: "Profile & Settings" })).toBeVisible();

    await page.getByRole("button", { name: /LT Taylor/ }).click();
    await page.getByRole("button", { name: "Sign out / switch account" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "ANCHOR — Demo sign in" })).toBeVisible();
    expect((await (await page.request.get("/api/session")).json()).user).toBeNull();
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  } finally {
    await page.request.delete("/api/session");
  }
});

test("revoked cookies redirect before validation instead of hiding a page segment", async ({ page, context }) => {
  const errors = collectRenderErrors(page);
  await signIn(page);
  const cookie = (await context.cookies()).find((entry) => entry.name === "anchor_session");
  expect(cookie).toBeTruthy();
  await page.request.delete("/api/session");
  await context.addCookies([cookie!]); // Replay the revoked token, not a new login.
  await page.goto("/templates");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "ANCHOR — Demo sign in" })).toBeVisible();
  expect((await context.cookies()).some((entry) => entry.name === "anchor_session")).toBeFalsy();
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
