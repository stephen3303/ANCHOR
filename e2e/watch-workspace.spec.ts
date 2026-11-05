import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.use({ launchOptions: { executablePath: process.env.E2E_CHROMIUM_EXECUTABLE || undefined, args: ["--no-sandbox"] } });

// Sending acknowledgements and changing the command's link state are Message Admin duties.
const MESSAGE_ADMIN_TESTS = [
  'acknowledgement leaves task open; explicit task updates and notes retain attribution',
  'corrections expose both versions, mobile fits, and stale offline state stays visible',
];

test.beforeEach(async ({ page }, testInfo) => {
  const loginName = MESSAGE_ADMIN_TESTS.includes(testInfo.title) ? 'DHarper' : 'LTaylor';
  const response = await page.request.get('/api/users');
  expect(response.ok()).toBeTruthy();
  const { users } = await response.json();
  const account = users.find((u: { login: string }) => u.login === loginName);
  expect(account, 'Seed the demo database before running browser checks').toBeTruthy();
  const login = await page.request.post('/api/session', { data: { userId: account.id } });
  expect(login.ok()).toBeTruthy();
  await page.goto('/watch-turnover');
  await expect(page.getByRole('heading', { name: 'Reporting period', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Watch Brief', exact: true })).toHaveCount(0);
});

test.afterEach(async ({ page }) => {
  await page.request.delete('/api/session');
});

test('busy watch: time and type counts filter records; drawer preserves period, query and scroll', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: '7d', exact: true }).click();
  const period = await page.getByTestId('reporting-window').innerText();
  await page.getByRole('button', { name: /^NAVADMIN \d/ }).click();
  await expect(page.getByRole('combobox', { name: 'Message type', exact: true })).toHaveValue('NAVADMIN');
  await page.getByLabel('Search traffic').fill('Cybersecurity');
  await expect(page.getByRole('heading', { name: 'Message traffic · 3' })).toBeVisible();
  const source = page.locator('#watch-traffic').getByRole('button', { name: 'Cybersecurity Controls Update (Corrected Copy)', exact: true });
  await source.scrollIntoViewIfNeeded();
  const before = await source.evaluate(el => el.getBoundingClientRect().top);
  await source.click();
  const drawer = page.getByRole('dialog', { name: 'Watch source reader' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('heading', { name: 'Cybersecurity Controls Update (Corrected Copy)', exact: true })).toBeVisible();
  const originalEvent = page.waitForEvent('download');
  await drawer.getByRole('button', { name: 'Download original', exact: true }).click();
  const original = await originalEvent;
  expect(original.suggestedFilename()).toBe('navadmin-236-26-original.txt');
  expect(await readFile((await original.path())!, 'utf8')).toMatch(/13 NOV 2026/);
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(page.getByLabel('Search traffic')).toHaveValue('Cybersecurity');
  await expect(page.getByTestId('reporting-window')).toHaveText(period);
  expect(Math.abs(await source.evaluate(el => el.getBoundingClientRect().top) - before)).toBeLessThan(3);
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(page.getByLabel('Search traffic')).toHaveValue('');
  await expect(page.getByRole('combobox', { name: 'Message type', exact: true })).toHaveValue('all');
  expect(errors).toEqual([]);
});

test('acknowledgement leaves task open; explicit task updates and notes retain attribution', async ({ page }) => {
  await page.getByLabel('Action filter').selectOption('ack');
  const ack = page.getByTestId('watch-action').filter({ has: page.getByRole('heading', { name: 'Acknowledge NAVADMIN 236/26', exact: true }) });
  await ack.getByText('Action details & next step', { exact: true }).click();
  await ack.getByRole('button', { name: 'Acknowledge receipt', exact: true }).click();
  await expect(ack).toHaveCount(0);
  await page.getByLabel('Action filter').selectOption('task');
  const task = page.getByTestId('watch-action').filter({ has: page.getByRole('heading', { name: 'Implement cybersecurity controls', exact: true }) });
  await expect(task).toContainText('Open');
  await task.getByText('Action details & next step', { exact: true }).click();
  await task.getByLabel('Watch-reported task status').selectOption('Blocked');
  await task.getByLabel('Progress / blocker / completion evidence').fill('Awaiting confirmation from IT Chief.');
  await task.getByRole('button', { name: 'Save task update' }).click();
  await expect(task).toContainText('Blocked');
  await expect(task).toContainText('ITC Harper');
  await page.getByRole('button', { name: 'Add issue', exact: true }).click();
  await page.getByLabel('Outstanding issue', { exact: true }).fill('Pending connectivity confirmation');
  await page.getByLabel('Next step', { exact: true }).fill('Confirm alternate circuit');
  await page.getByRole('button', { name: 'Save issue', exact: true }).click();
  await expect(page.locator('#watch-notes')).toContainText('Pending connectivity confirmation');
  await page.locator('#watch-notes').getByText('Note details', { exact: true }).click();
  await expect(page.locator('#watch-notes')).toContainText('Updated by ITC Harper');
});

test('quiet period retains overdue older actions without package controls', async ({ page }) => {
  await page.getByRole('button', { name: 'Custom', exact: true }).click();
  await page.getByLabel('Start (UTC)', { exact: true }).fill('2026-11-05T19:00');
  await page.getByLabel('Watch starts / reporting end (UTC)', { exact: true }).fill('2026-11-06T19:00');
  await expect(page.getByRole('heading', { name: 'Message traffic · 0' })).toBeAttached();
  await page.getByLabel('Action filter').selectOption('overdue');
  const oldTask = page.getByTestId('watch-action').filter({ has: page.getByRole('heading', { name: 'Collect safety stand-down completion reports', exact: true }) });
  await expect(oldTask).toContainText('OVERDUE');
  await expect(oldTask).toContainText('Carryover');
  for (const name of ['Prepare package', 'Export JSON', 'Briefing builder', 'Print']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0);
  }

});

test('corrections expose both versions, mobile fits, and stale offline state stays visible', async ({ page }) => {
  const change = page.locator('details').filter({ has: page.locator('summary', { hasText: 'NAVADMIN 236/26 · CORRECTED' }) }).first();
  await change.locator('summary').first().click();
  await expect(change).toContainText('Action passage differs');
  await change.getByRole('button', { name: 'Earlier version', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('NAVADMIN 235/26');
  await page.getByRole('button', { name: 'Close source', exact: true }).click();
  await page.getByRole('link', { name: /pending sync/ }).first().click();
  await page.getByRole('switch', { name: 'Simulate EMCON / offline', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main', exact: true }).locator('a[href="/watch-turnover"]').click();
  await expect(page.getByRole('status').filter({ hasText: 'OFFLINE · cached demo' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'STALE' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  expect(await page.locator('main').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
});
