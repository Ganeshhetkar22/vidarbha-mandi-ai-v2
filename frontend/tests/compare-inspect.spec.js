import { test } from '@playwright/test';

test('Inspect Compare Mandis page', async ({ page }) => {
  await page.goto('/compare-mandis?district=nagpur&crop=soybean');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(5000);

  console.log('\n===== PAGE TEXT =====');
  console.log((await page.locator('body').innerText()).substring(0, 12000));
  console.log('===== END =====');
});
