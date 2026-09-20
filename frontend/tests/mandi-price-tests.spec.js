import { test, expect } from '@playwright/test';
import fs from 'fs';
process.loadEnvFile('.env');
import { createClient } from '@supabase/supabase-js';

test.setTimeout(600000);

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

const normalize = value =>
  String(value ?? '')
    .toLowerCase()
    .replace(/^apmc[-_ ]*/i, '')
    .replace(/[^a-z0-9]/g, '');

test('All available APMC -> latest available Mandi Price tests', async ({ page }) => {
  const coverage = JSON.parse(
    fs.readFileSync('tests/results/database-coverage.json', 'utf8')
  );

  const dataMandis = coverage.filter(mandi => mandi.status === 'DATA');

  console.log(`Testing ${dataMandis.length} APMCs with data`);

  const results = [];

  await page.goto('/mandi-prices');
  await page.waitForLoadState('domcontentloaded');

  const district = page.locator('#district-select');
  const mandi = page.locator('#mandi-select');
  const crop = page.locator('#crop-select');
  const date = page.locator('#date-select');

  let currentDistrict = '';

  for (const item of dataMandis) {
    console.log(`\n========== ${item.district} -> ${item.mandi} ==========`);

    try {
      const { data: aliases, error: aliasError } = await supabase
        .from('mandi_aliases')
        .select('source_mandi_id, source_mandi_name')
        .eq('district_id', item.district)
        .eq('canonical_mandi_id', item.mandiId);

      if (aliasError) {
        throw new Error(`Alias query error: ${aliasError.message}`);
      }

      const targetKeys = new Set([
        normalize(item.mandiId),
        normalize(item.mandi),
        ...(aliases ?? []).flatMap(alias => [
          normalize(alias.source_mandi_id),
          normalize(alias.source_mandi_name)
        ])
      ]);

      const { data: allRows, error } = await supabase
        .from('mandi_prices')
        .select(
          'crop_id,crop_name,price_date,min_price,max_price,modal_price,mandi_id,mandi_name'
        )
        .eq('district_id', item.district)
        .order('price_date', { ascending: false })
        .limit(1000);

      if (error) {
        throw new Error(`Supabase error: ${error.message}`);
      }

      const mandiRows = (allRows ?? []).filter(row => {
        const rowKeys = [
          normalize(row.mandi_id),
          normalize(row.mandi_name)
        ];

        return rowKeys.some(key => targetKeys.has(key));
      });

      if (!mandiRows.length) {
        throw new Error('No database records found for this mandi');
      }

      const latestDate = mandiRows
        .map(row => row.price_date)
        .sort()
        .reverse()[0];

      const availableCrops = [
        ...new Map(
          mandiRows.map(row => [
            row.crop_id,
            {
              id: row.crop_id,
              name: row.crop_name
            }
          ])
        ).values()
      ];

      console.log(`Latest DB date: ${latestDate}`);
      console.log(`Available crops: ${availableCrops.length}`);

      if (currentDistrict !== item.district) {
        currentDistrict = item.district;

        await district.selectOption(item.district);

        await expect(
          mandi.locator(`option[value="${item.mandiId}"]`)
        ).toBeAttached({ timeout: 30000 });
      }

      await mandi.selectOption(item.mandiId);

      await expect
        .poll(
          async () =>
            (
              await crop.locator('option').evaluateAll(options =>
                options.map(o => o.value).filter(Boolean)
              )
            ).length,
          { timeout: 30000 }
        )
        .toBeGreaterThan(0);

      const uiCrops = await crop.locator('option').evaluateAll(options =>
        options.map(o => o.value).filter(Boolean)
      );

      const testCrops = availableCrops
        .map(c => c.id)
        .filter(id => uiCrops.includes(id));

      if (!testCrops.length) {
        throw new Error(
          `No database crop is available in UI. DB=${availableCrops.map(c => c.id).join(',')}`
        );
      }

      let foundPrice = false;
      let selectedCrop = '';
      let selectedDate = latestDate;

      for (const cropId of testCrops) {
        const cropRows = mandiRows.filter(
          row =>
            row.crop_id === cropId &&
            row.min_price != null &&
            row.max_price != null &&
            row.modal_price != null
        );

        if (!cropRows.length) continue;

        const cropDates = [
          ...new Set(cropRows.map(row => row.price_date))
        ].sort().reverse();

        for (const availableDate of cropDates) {
          await crop.selectOption(cropId);
          await date.fill(availableDate);

          await page.getByRole('button', {
            name: 'Check Mandi Prices'
          }).click();

          await page.waitForTimeout(1500);

          const bodyText = await page.locator('body').innerText();

          const hasPrice =
            bodyText.includes('Minimum') &&
            bodyText.includes('Maximum') &&
            bodyText.includes('Modal');

          if (hasPrice) {
            foundPrice = true;
            selectedCrop = cropId;
            selectedDate = availableDate;
            break;
          }
        }

        if (foundPrice) break;
      }

      if (!foundPrice) {
        throw new Error(
          `No price displayed using ${testCrops.length} available crops`
        );
      }

      results.push({
        district: item.district,
        mandi: item.mandi,
        mandiId: item.mandiId,
        crop: selectedCrop,
        date: selectedDate,
        status: 'PASS'
      });

      console.log(
        `PASS - ${item.mandi} -> ${selectedCrop} -> ${selectedDate}`
      );

    } catch (error) {
      results.push({
        district: item.district,
        mandi: item.mandi,
        mandiId: item.mandiId,
        status: 'FAIL',
        reason: String(error.message || error)
      });

      console.log(
        `FAIL - ${item.mandi} - ${String(error.message || error)}`
      );
    }
  }

  fs.writeFileSync(
    'tests/results/mandi-price-results.json',
    JSON.stringify(results, null, 2)
  );

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log('\n================================');
  console.log(`Total tested: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('================================');

  expect(failed).toBe(0);
});
