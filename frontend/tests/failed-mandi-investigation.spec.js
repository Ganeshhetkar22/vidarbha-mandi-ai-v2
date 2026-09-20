import { test, expect } from '@playwright/test';

test.setTimeout(600000);

test('Investigate failed mandi price cases', async ({ page }) => {
  const cases = [
    ['nagpur', 'nagpur'],
    ['nagpur', 'hingna'],
    ['nagpur', 'ramtek'],
    ['wardha', 'hinganghat'],
    ['gadchiroli', 'gadchiroli'],
    ['buldhana', 'nandura'],
    ['buldhana', 'shegaon'],
    ['buldhana', 'khamgaon'],
    ['buldhana', 'chikhli'],
    ['yavatmal', 'pusad']
  ];

  await page.goto('/mandi-prices');
  await page.waitForLoadState('domcontentloaded');

  const district = page.locator('#district-select');
  const mandi = page.locator('#mandi-select');
  const crop = page.locator('#crop-select');
  const date = page.locator('#date-select');

  for (const [districtId, mandiId] of cases) {
    console.log(`\n========== ${districtId} -> ${mandiId} ==========`);

    try {
      await district.selectOption(districtId);

      await expect(
        mandi.locator(`option[value="${mandiId}"]`)
      ).toBeAttached({ timeout: 30000 });

      await mandi.selectOption(mandiId);

      await expect.poll(
        async () =>
          (
            await crop.locator('option').evaluateAll(options =>
              options.map(o => o.value).filter(Boolean)
            )
          ).length,
        { timeout: 30000 }
      ).toBeGreaterThan(0);

      const crops = await crop.locator('option').evaluateAll(options =>
        options
          .map(o => ({
            value: o.value,
            text: (o.textContent || '').trim()
          }))
          .filter(o => o.value)
      );

      console.log(`Available crops: ${crops.length}`);

      const maxDate = await date.getAttribute('max');

      if (!maxDate) {
        throw new Error('No maximum date available');
      }

      await date.fill(maxDate);

      let foundPrice = false;

      for (const selectedCrop of crops) {
        await crop.selectOption(selectedCrop.value);

        await page.getByRole('button', {
          name: 'Check Mandi Prices'
        }).click();

        await page.waitForTimeout(1500);

        const bodyText = await page.locator('body').innerText();

        const hasPrice =
          bodyText.includes('Minimum') ||
          bodyText.includes('Maximum') ||
          bodyText.includes('Modal') ||
          bodyText.includes('Last Updated');

        if (hasPrice) {
          console.log(
            `PRICE FOUND -> ${selectedCrop.value} (${selectedCrop.text})`
          );
          foundPrice = true;
          break;
        }

        console.log(`No price -> ${selectedCrop.value}`);
      }

      console.log(
        foundPrice
          ? 'RESULT: PRICE AVAILABLE'
          : 'RESULT: NO PRICE FOUND FOR ANY CROP'
      );

    } catch (error) {
      console.log(
        `INVESTIGATION ERROR -> ${String(error.message || error)}`
      );
    }
  }
});
