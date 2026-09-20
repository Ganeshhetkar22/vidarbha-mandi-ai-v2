import { test, expect } from '@playwright/test';

test.setTimeout(120000);

test('Compare Mandis - Nagpur Soybean', async ({ page }) => {
  await page.goto('/compare-mandis?district=nagpur&crop=soybean');
  await page.waitForLoadState('domcontentloaded');

  await expect(page.getByText('Selected Crop: Soybean')).toBeVisible({
    timeout: 30000
  });

  await expect(page.getByText('19 Sept 2026')).toBeVisible({
    timeout: 30000
  });

  const rows = page.locator('tbody tr');

  await expect(rows).toHaveCount(2);

  await expect(rows.nth(0)).toContainText('Nagpur');
  await expect(rows.nth(1)).toContainText('Savner');

  const bodyText = await page.locator('body').innerText();

  expect(bodyText).toContain('₹5,465');
  expect(bodyText).toContain('₹5,328');
  expect(bodyText).toContain('₹5,000');
  expect(bodyText).toContain('₹5,621');
  expect(bodyText).toContain('₹5,340');

  console.log('Compare Mandis verified successfully.');
});
