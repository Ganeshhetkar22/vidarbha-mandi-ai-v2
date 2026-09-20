import { test, expect } from '@playwright/test';

const pages = [
  { name: 'Home', path: '/' },
  { name: 'Mandi Prices', path: '/mandi-prices' },
  { name: 'Compare Mandis', path: '/compare-mandis' },
  { name: 'Crop Analysis', path: '/crop-analysis' },
  { name: 'Price Prediction', path: '/price-prediction' },
  { name: 'Weather', path: '/weather' },
  { name: 'About', path: '/about' },
];

for (const pageInfo of pages) {
  test(`${pageInfo.name} page loads`, async ({ page }) => {
    await page.goto(pageInfo.path);
    await expect(page.locator('body')).not.toBeEmpty();
  });
}
