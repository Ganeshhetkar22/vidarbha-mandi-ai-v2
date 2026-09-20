import { test, expect } from '@playwright/test';

test('District → APMC → Crop availability coverage', async ({ page }) => {
  const results = [];

  await page.goto('/mandi-prices');
  await page.waitForLoadState('networkidle');

  // Get the selector elements on the page.
  const selects = page.locator('select');
  const count = await selects.count();

  console.log(`Found ${count} select elements`);

  for (let i = 0; i < count; i++) {
    const options = await selects.nth(i).locator('option').allTextContents();
    console.log(`Select ${i}:`, options);
  }

  expect(count).toBeGreaterThan(0);
});
