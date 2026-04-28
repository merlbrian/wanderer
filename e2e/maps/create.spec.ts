import { test, expect } from '@playwright/test';

const suffix = String(Date.now()).slice(-8);
const TEST_MAP_NAME = `E2E ${suffix}`;
const TEST_MAP_SLUG = `e2e-${suffix}`;

test.describe('Map creation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/maps/new');
  });

  test('shows the create map modal', async ({ page }) => {
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('Create Map');
  });

  test('create map form has required fields', async ({ page }) => {
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByPlaceholder('Name')).toBeVisible();
    await expect(dialog.getByPlaceholder('map-slug')).toBeVisible();
    await expect(dialog.getByPlaceholder('Public description')).toBeVisible();
  });

  test('creates a map and redirects to maps list', async ({ page }) => {
    const dialog = page.getByRole('dialog');

    await dialog.getByPlaceholder('Name').fill(TEST_MAP_NAME);
    await dialog.getByPlaceholder('map-slug').fill(TEST_MAP_SLUG);
    await dialog.getByRole('button', { name: 'Create' }).click();

    await expect(page).toHaveURL('/maps', { timeout: 10000 });
    await expect(page.getByText(TEST_MAP_NAME).first()).toBeVisible();
  });
});
