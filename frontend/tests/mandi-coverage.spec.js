import { test, expect } from '@playwright/test';
import fs from 'fs';

test.setTimeout(15 * 60 * 1000);

test('Full Vidarbha district → APMC → crop coverage', async ({ page }) => {
  const results = [];

  await page.goto('/mandi-prices');
  await page.waitForLoadState('domcontentloaded');

  const selects = page.locator('select');
  const districtSelect = selects.nth(0);
  const mandiSelect = selects.nth(1);
  const cropSelect = selects.nth(2);

  const districts = await districtSelect.locator('option').evaluateAll(options =>
    options
      .map(option => ({
        value: option.value,
        label: option.textContent?.trim()
      }))
      .filter(option => option.value)
  );

  console.log(`Found ${districts.length} districts`);

  for (const district of districts) {
    console.log(`\n========== ${district.label} ==========`);

    await districtSelect.selectOption(district.value);

    await expect
      .poll(
        async () =>
          await mandiSelect.locator('option').count(),
        { timeout: 15000 }
      )
      .toBeGreaterThan(1);

    const mandis = await mandiSelect.locator('option').evaluateAll(options =>
      options
        .map(option => ({
          value: option.value,
          label: option.textContent?.trim()
        }))
        .filter(option => option.value)
    );

    console.log(`APMCs found: ${mandis.length}`);

    for (const mandi of mandis) {
      try {
        await mandiSelect.selectOption(mandi.value);

        await expect
          .poll(
            async () => {
              const options = await cropSelect.locator('option').evaluateAll(options =>
                options
                  .map(option => ({
                    value: option.value,
                    label: option.textContent?.trim(),
                    disabled: option.disabled
                  }))
                  .filter(option => option.value && !option.disabled)
              );

              const noData = await page
                .getByText('No crops available for this mandi.', { exact: true })
                .count();

              return options.length > 0 || noData > 0;
            },
            { timeout: 15000 }
          )
          .toBeTruthy();

        const cropOptions = await cropSelect.locator('option').evaluateAll(options =>
          options
            .map(option => ({
              value: option.value,
              label: option.textContent?.trim(),
              disabled: option.disabled
            }))
            .filter(option => option.value && !option.disabled)
        );

        const noCropMessage = await page
          .getByText('No crops available for this mandi.', { exact: true })
          .count();

        const status =
          cropOptions.length > 0
            ? 'DATA'
            : noCropMessage > 0
              ? 'NO_DATA'
              : 'ERROR';

        results.push({
          district: district.label,
          districtValue: district.value,
          mandi: mandi.label,
          mandiValue: mandi.value,
          cropCount: cropOptions.length,
          crops: cropOptions.map(crop => crop.label),
          status
        });

        console.log(
          `${district.label} | ${mandi.label} | ${status} | crops: ${cropOptions.length}`
        );
      } catch (error) {
        results.push({
          district: district.label,
          districtValue: district.value,
          mandi: mandi.label,
          mandiValue: mandi.value,
          status: 'ERROR',
          message: String(error)
        });

        console.log(
          `${district.label} | ${mandi.label} | ERROR | ${String(error)}`
        );
      }
    }
  }

  fs.mkdirSync('tests/results', { recursive: true });

  fs.writeFileSync(
    'tests/results/mandi-coverage.json',
    JSON.stringify(results, null, 2),
    'utf8'
  );

  const summary = {
    districts: districts.length,
    totalMandis: results.length,
    withData: results.filter(r => r.status === 'DATA').length,
    noData: results.filter(r => r.status === 'NO_DATA').length,
    errors: results.filter(r => r.status === 'ERROR').length
  };

  console.log('\n========== FINAL SUMMARY ==========');
  console.log(JSON.stringify(summary, null, 2));

  expect(results.length).toBeGreaterThan(0);
});
