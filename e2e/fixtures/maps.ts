import { Browser, Page } from '@playwright/test';
import path from 'path';

export async function newAuthPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    storageState: path.join(__dirname, '../.auth/user.json'),
  });
  return context.newPage();
}

export async function createTestMap(page: Page): Promise<string> {
  // Max 20 chars for name; use last 8 digits of timestamp for uniqueness
  const suffix = String(Date.now()).slice(-8);
  const slug = `e2e-${suffix}`;
  await page.goto('/maps/new');
  await page.getByPlaceholder('Name').fill(`E2E ${suffix}`);
  await page.getByPlaceholder('map-slug').fill(slug);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL('**/maps', { timeout: 10000 });
  return slug;
}

export async function deleteTestMap(page: Page, slug: string): Promise<void> {
  await page.goto('/maps');
  const deleteBtn = page.locator(`[id="delete-map-${slug}"]`);
  if (await deleteBtn.isVisible()) {
    page.once('dialog', dialog => dialog.accept());
    await deleteBtn.click();
    await page.waitForTimeout(500);
  }
}

export async function generateMapApiKey(page: Page, slug: string): Promise<string> {
  await page.goto(`/maps/${slug}/settings`);
  await page.getByRole('tab', { name: /Public Api/ }).click();
  await page.getByRole('button', { name: 'Generate' }).click();
  await page.waitForTimeout(500);
  const keyInput = page.locator('input[readonly]').first();
  return (await keyInput.inputValue()) ?? '';
}
