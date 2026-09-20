import { test, expect } from '@playwright/test';
import fs from 'fs';

test.setTimeout(300000);

test('Bulk test all 105 Vidarbha mandis', async ({ page }) => {
  const coverage = JSON.parse(
    fs.readFileSync('tests/results/database-coverage.json', 'utf8')
  );

  const results = [];
  const districts = new Map();

  for (const mandi of coverage) {
    if (!districts.has(mandi.district)) {
      districts.set(mandi.district, []);
    }
    districts.get(mandi.district).push(mandi);
  }

  await page.goto('/mandi-prices');
  await page.waitForLoadState('domcontentloaded');

  const districtSelect = page.locator('#district-select');
  const mandiSelect = page.locator('#mandi-select');
  const cropSelect = page.locator('#crop-select');

  for (const [districtId, mandis] of districts) {
    console.log(`\n========== ${districtId} ==========`);

    await districtSelect.selectOption(districtId);

    await expect.poll(
      async () =>
        await mandiSelect.locator('option').evaluateAll(
          options => options.map(o => o.value).filter(Boolean)
        ),
      { timeout: 30000 }
    ).not.toHaveLength(0);

    for (const mandi of mandis) {
      const expectedData = mandi.status === 'DATA';

      const optionExists = await mandiSelect
        .locator(`option[value="${mandi.mandiId}"]`)
        .count();

      if (!optionExists) {
        results.push({
          district: districtId,
          mandi: mandi.mandi,
          mandiId: mandi.mandiId,
          expected: mandi.status,
          status: 'FAIL',
          reason: 'Mandi missing from UI'
        });

        console.log(`? ${mandi.mandi} - missing`);
        continue;
      }

      await mandiSelect.selectOption(mandi.mandiId);

      if (expectedData) {
        await expect
          .poll(
            async () =>
              await cropSelect.locator('option').evaluateAll(
                options => options.map(o => o.value).filter(Boolean)
              ),
            { timeout: 15000 }
          )
          .not.toHaveLength(0);
      } else {
        await page.waitForTimeout(1000);
      }

      const cropValues = await cropSelect.locator('option').evaluateAll(
        options => options.map(o => o.value).filter(Boolean)
      );

      if (expectedData) {
        if (cropValues.length > 0) {
          results.push({
            district: districtId,
            mandi: mandi.mandi,
            mandiId: mandi.mandiId,
            expected: 'DATA',
            status: 'PASS',
            reason: `${cropValues.length} crops available`
          });

          console.log(`? ${mandi.mandi} - ${cropValues.length} crops`);
        } else {
          results.push({
            district: districtId,
            mandi: mandi.mandi,
            mandiId: mandi.mandiId,
            expected: 'DATA',
            status: 'FAIL',
            reason: 'Expected data but no crops'
          });

          console.log(`? ${mandi.mandi} - expected crops`);
        }
      } else {
        if (cropValues.length === 0) {
          results.push({
            district: districtId,
            mandi: mandi.mandi,
            mandiId: mandi.mandiId,
            expected: 'NO_DATA',
            status: 'PASS',
            reason: 'No current data'
          });

          console.log(`? ${mandi.mandi} - no current data`);
        } else {
          results.push({
            district: districtId,
            mandi: mandi.mandi,
            mandiId: mandi.mandiId,
            expected: 'NO_DATA',
            status: 'CHECK',
            reason: `${cropValues.length} crops found`
          });

          console.log(`?? ${mandi.mandi} - ${cropValues.length} crops found`);
        }
      }
    }
  }

  fs.writeFileSync(
    'tests/results/mandi-bulk-results.json',
    JSON.stringify(results, null, 2)
  );

  const failed = results.filter(r => r.status === 'FAIL');

  console.log('\n================================');
  console.log(`Total tested: ${results.length}`);
  console.log(`Passed: ${results.filter(r => r.status === 'PASS').length}`);
  console.log(`Check: ${results.filter(r => r.status === 'CHECK').length}`);
  console.log(`Failed: ${failed.length}`);
  console.log('================================');

  expect(failed.length).toBe(0);
});
