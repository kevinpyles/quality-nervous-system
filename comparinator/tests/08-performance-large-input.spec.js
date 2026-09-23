const { test, expect } = require('@playwright/test');
const { gotoApp, readStats } = require('./helpers');

test.describe('Large input performance (TC-66 .. TC-68)', () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('TC-66 ~10,000 char identical comparison completes without freezing', async ({ page }) => {
    const sentence = 'The quick brown fox jumps over the lazy dog. ';
    const big = sentence.repeat(Math.ceil(10000 / sentence.length)).slice(0, 10000);

    await page.locator('#textA').fill(big);
    await page.locator('#textB').fill(big);
    await page.locator('#compareBtn').click();

    await expect(page.locator('#summary')).toHaveClass(/show/, { timeout: 30_000 });
    const stats = await readStats(page);
    expect(stats.similarity).toBe('100.0%');
  });

  test('TC-67 two unrelated ~10,000 char texts stay usable and produce results', async ({ page }) => {
    const wordsA = Array.from({ length: 2000 }, (_, i) => `alpha${i}`).join(' ').slice(0, 10000);
    const wordsB = Array.from({ length: 2000 }, (_, i) => `zulu${i}`).join(' ').slice(0, 10000);

    await page.locator('#textA').fill(wordsA);
    await page.locator('#textB').fill(wordsB);
    await page.locator('#compareBtn').click();

    await expect(page.locator('#summary')).toHaveClass(/show/, { timeout: 30_000 });
    const stats = await readStats(page);
    expect(stats.similarity).toMatch(/^\d+(\.\d+)?%$/);
    // Page must still respond to further interaction (not hung/frozen).
    await expect(page.locator('#compareBtn')).toBeEnabled();
  });

  test('TC-68 token-dense input (many single-letter words) is handled by the fallback without failure', async ({ page }) => {
    const dense = Array.from({ length: 4000 }, (_, i) => String.fromCharCode(97 + (i % 26))).join(' ');

    await page.locator('#textA').fill(dense);
    await page.locator('#textB').fill(dense);
    await page.locator('#compareBtn').click();

    await expect(page.locator('#summary')).toHaveClass(/show/, { timeout: 30_000 });
    const stats = await readStats(page);
    expect(stats.similarity).toBe('100.0%');
  });
});
