import { test as setup } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '.auth/user.json');

setup('authenticate as test user', async ({ page }) => {
  await page.goto('/dev/auto-login');
  await page.waitForURL('/maps');

  // Dismiss the new-version banner by syncing localStorage to the current app version.
  // The NewVersionUpdate hook shows a full-screen overlay when wandererLastVersion
  // doesn't match data-version — which is always true in a fresh browser context.
  const banner = page.locator('#new-version-banner');
  if (await banner.isVisible()) {
    const appVersion = await banner.getAttribute('data-version');
    if (appVersion) {
      await page.evaluate(v => localStorage.setItem('wandererLastVersion', v), appVersion);
    }
  } else {
    // Set it preemptively even if banner isn't visible yet
    const appVersion = await page
      .locator('#new-version-banner')
      .getAttribute('data-version')
      .catch(() => null);
    if (appVersion) {
      await page.evaluate(v => localStorage.setItem('wandererLastVersion', v), appVersion);
    }
  }

  await page.context().storageState({ path: authFile });
});
