import { test, expect } from '@playwright/test';
import { createTestMap, deleteTestMap, newAuthPage } from '../fixtures/maps';

test.describe('Map settings', () => {
  let mapSlug: string;

  test.beforeAll(async ({ browser }) => {
    const page = await newAuthPage(browser);
    mapSlug = await createTestMap(page);
    await page.context().close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await newAuthPage(browser);
    await deleteTestMap(page, mapSlug);
    await page.context().close();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`/maps/${mapSlug}/settings`);
  });

  test('opens settings modal', async ({ page }) => {
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('Map Settings');
  });

  test('shows General tab by default', async ({ page }) => {
    await expect(page.getByText('Map systems layout')).toBeVisible();
  });

  test('can switch to Import/Export tab', async ({ page }) => {
    await page.getByRole('tab', { name: /Import/ }).click();
    await expect(page.getByRole('button', { name: /Export Settings/ })).toBeVisible();
  });

  test('can switch to Public Api tab', async ({ page }) => {
    await page.getByRole('tab', { name: /Public Api/ }).click();
    await expect(page.getByText('Public API')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate' })).toBeVisible();
  });
});
