import { test, expect } from '@playwright/test';
import { createTestMap, deleteTestMap, newAuthPage } from '../fixtures/maps';

test.describe('Map canvas', () => {
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
    await page.goto(`/${mapSlug}`);
    await page.waitForLoadState('networkidle');
    // Dismiss any auto-opening dialogs (e.g. Track & Follow) via Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });

  test('loads the map canvas', async ({ page }) => {
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 10000 });
  });

  test('renders the ReactFlow viewport', async ({ page }) => {
    await expect(page.locator('.react-flow__viewport')).toBeVisible({ timeout: 10000 });
  });

  test('shows map minimap', async ({ page }) => {
    await expect(page.locator('.react-flow__minimap')).toBeVisible({ timeout: 10000 });
  });
});
