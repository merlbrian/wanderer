import { test, expect } from '@playwright/test';
import { createTestMap, deleteTestMap, generateMapApiKey, newAuthPage } from '../fixtures/maps';

test.describe('Public API smoke tests', () => {
  let mapSlug: string;
  let apiKey: string;

  test.beforeAll(async ({ browser }) => {
    const page = await newAuthPage(browser);
    mapSlug = await createTestMap(page);
    apiKey = await generateMapApiKey(page, mapSlug);
    await page.context().close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await newAuthPage(browser);
    await deleteTestMap(page, mapSlug);
    await page.context().close();
  });

  test('GET /api/map/systems returns 200 with valid api key', async ({ request }) => {
    const response = await request.get(`/api/map/systems?map_identifier=${mapSlug}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(response.status()).toBe(200);
  });

  test('GET /api/map/connections returns 200 with valid api key', async ({ request }) => {
    const response = await request.get(`/api/map/connections?map_identifier=${mapSlug}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(response.status()).toBe(200);
  });

  test('GET /api/map/systems returns 401 without api key', async ({ request }) => {
    const response = await request.get(`/api/map/systems?map_identifier=${mapSlug}`);
    expect([401, 403]).toContain(response.status());
  });
});
