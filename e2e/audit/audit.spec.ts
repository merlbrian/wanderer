import { test, expect } from '@playwright/test';
import { createTestMap, deleteTestMap, newAuthPage } from '../fixtures/maps';

test.describe('Map audit log', () => {
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
    await page.goto(`/${mapSlug}/audit?period=1H&activity=`);
  });

  test('loads the audit page', async ({ page }) => {
    await expect(page.locator('#map-events-list')).toBeVisible();
  });

  test('shows period filter buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'HOUR' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'DAY' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'WEEK' })).toBeVisible();
  });

  test('can switch period filters', async ({ page }) => {
    await page.getByRole('button', { name: 'DAY' }).click();
    await expect(page.getByRole('button', { name: 'DAY' })).toHaveClass(/!text-white/);
  });

  test('shows activity type filter', async ({ page }) => {
    await expect(page.locator('select')).toBeVisible();
  });
});
