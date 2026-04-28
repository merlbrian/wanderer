import { test, expect } from '@playwright/test';

test.describe('Characters list', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/characters');
  });

  test('loads the characters page', async ({ page }) => {
    await expect(page).toHaveURL('/characters');
  });

  test('shows Add Character button', async ({ page }) => {
    await expect(
      page.getByRole('link', { name: /Add Character|Authorize/i })
        .or(page.getByRole('button', { name: /Add Character|Authorize/i }))
    ).toBeVisible({ timeout: 8000 });
  });
});
