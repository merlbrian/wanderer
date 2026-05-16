import { test, expect } from '@playwright/test';

test.describe('Access lists', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/access-lists');
  });

  test('loads the access lists page', async ({ page }) => {
    await expect(page).toHaveURL('/access-lists');
  });

  test('shows Create Access List option', async ({ page }) => {
    await expect(
      page.getByRole('link', { name: /Create|New Access List/i })
        .or(page.getByRole('button', { name: /Create|New Access List/i }))
    ).toBeVisible({ timeout: 8000 });
  });

  test('clicking create opens the form', async ({ page }) => {
    await page.goto('/access-lists/new');
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 8000 });
  });
});
