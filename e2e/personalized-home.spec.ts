import { expect, test } from "@playwright/test";

test.use({ launchOptions: { executablePath: process.env.E2E_CHROMIUM_EXECUTABLE || undefined, args: ["--no-sandbox"] }, viewport: { width: 1440, height: 1100 } });

test.beforeEach(async ({ page }) => {
  const response = await page.request.get('/api/users');
  expect(response.ok()).toBeTruthy();
  const { users } = await response.json();
  const user = users.find((u: { login: string }) => u.login === 'LTaylor');
  expect(user).toBeTruthy();
  expect((await page.request.post('/api/session', { data: { userId: user.id } })).ok()).toBeTruthy();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'My Briefing', exact: true })).toBeVisible();
});

test.afterEach(async ({ page }) => { await page.request.delete('/api/session'); });

test('switching duties preserves period, pinned attention and the saved default', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await expect(page.getByRole('combobox', { name: 'Received period' })).toHaveValue('24');
  await page.screenshot({ path: '/tmp/anchor-personalized-home-desktop.png', animations: 'disabled', caret: 'initial' });
  const attention = page.getByRole('button', { name: /Need attention/ });
  const attentionText = (await attention.textContent())!;
  await page.getByRole('combobox', { name: 'Received period' }).selectOption('168');
  await page.getByRole('combobox', { name: 'Viewing as' }).selectOption('safety');
  await expect(page.getByRole('combobox', { name: 'Received period' })).toHaveValue('168');
  await expect(attention).toHaveText(attentionText);
  await expect(page.getByRole('region', { name: 'View controls' })).toContainText('Default: Watch Officer');
  await expect(page.getByRole('button', { name: 'My department', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('personal views/defaults survive reload and remain isolated by account', async ({ page }) => {
  await page.getByRole('button', { name: 'Manage views', exact: true }).click();
  await page.getByLabel('Personal view name').fill('Cyber watch');
  await page.getByRole('checkbox', { name: 'Cybersecurity', exact: true }).check();
  await page.getByRole('button', { name: 'Create personal view', exact: true }).click();
  const id = await page.getByRole('combobox', { name: 'Viewing as' }).inputValue();
  expect(id).toMatch(/^personal-/);
  await page.getByRole('button', { name: 'Set as default', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Viewing as' })).toHaveValue(id);
  await expect(page.getByRole('button', { name: 'Set as default', exact: true })).toBeDisabled();
  await page.request.delete('/api/session');
  const { users } = await (await page.request.get('/api/users')).json();
  const other = users.find((u: { login: string }) => u.login !== 'LTaylor');
  expect((await page.request.post('/api/session', { data: { userId: other.id } })).ok()).toBeTruthy();
  await page.goto('/');
  await expect(page.getByRole('combobox', { name: 'Viewing as' })).toHaveValue('watch');
  await expect(page.getByRole('combobox', { name: 'Viewing as' })).not.toContainText('Cyber watch');
});

test('source reader preserves search/period; permissions and mobile sizing are retained', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Received period' }).selectOption('168');
  await page.getByLabel('Search relevant messages').fill('Cybersecurity');
  await page.getByRole('button', { name: 'Read NAVADMIN 236/26', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Personalized message reader' })).toBeVisible();
  await page.getByRole('button', { name: 'Close message', exact: true }).click();
  await expect(page.getByLabel('Search relevant messages')).toHaveValue('Cybersecurity');
  await expect(page.getByRole('combobox', { name: 'Received period' })).toHaveValue('168');
  await expect(page.getByRole('button', { name: 'Acknowledge receipt', exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator('main').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My Briefing', exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/anchor-personalized-home-mobile.png', animations: 'disabled', caret: 'initial' });
});

test('old personalized preview link redirects to Home', async ({ page }) => {
  await page.goto('/personalized-preview');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'My Briefing', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Briefings', exact: true })).toHaveCount(0);
});
