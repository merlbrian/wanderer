import { test, expect } from '@playwright/test';

test.describe('Maps list', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/maps');
  });

  test('shows the maps page', async ({ page }) => {
    await expect(page).toHaveURL('/maps');
  });

  test('shows a Create Map card', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Create Map' })).toBeVisible();
  });

  test('clicking Create Map opens the create modal', async ({ page }) => {
    await page.getByRole('link', { name: 'Create Map' }).click();
    await page.waitForURL('**/maps/new');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('Create Map');
  });
});
