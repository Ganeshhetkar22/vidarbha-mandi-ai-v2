import { test, expect } from '@playwright/test';

test.setTimeout(120000);

test('Test Nagpur Soyabean actual price', async ({ page }) => {
  await page.goto('/mandi-prices');
  await page.waitForLoadState('domcontentloaded');

  const district = page.locator('#district-select');
  const mandi = page.locator('#mandi-select');
  const crop = page.locator('#crop-select');
  const date = page.locator('#date-select');

  await district.selectOption('nagpur');

  await expect(
    mandi.locator('option[value="nagpur"]')
  ).toBeAttached();

  await mandi.selectOption('nagpur');

  await expect
    .poll(
      async () =>
        (await crop.locator('option').evaluateAll(options =>
          options.map(o => o.value).filter(Boolean)
        )).length,
      { timeout: 30000 }
    )
    .toBeGreaterThan(0);

  await crop.selectOption('soybean');

  // Try the latest available date
  await date.fill('2026-09-19');

  console.log('Selected date:', await date.inputValue());

  await page.getByRole('button', {
    name: 'Check Mandi Prices'
  }).click();

  await page.waitForTimeout(3000);

  const bodyText = await page.locator('body').innerText();

  console.log('\n===== PRICE RESULT =====');
  console.log(bodyText.substring(0, 8000));
  console.log('===== END RESULT =====');

  expect(bodyText).not.toContain(
    'Select a district, crop, and mandi to view current prices.'
  );
});