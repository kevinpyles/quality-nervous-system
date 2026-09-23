const { test, expect } = require('@playwright/test');
const { gotoApp, compare, readStats } = require('./helpers');

test.describe('Metrics and highlighting (TC-38 .. TC-45)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('TC-38 similarity matches the documented formula (matches / (matches+removals+additions))', async ({ page }) => {
    // "The cat is blue" vs "The cat is red": 3 matches, 1 removal, 1 addition -> 3/5 = 60%.
    await compare(page, 'The cat is blue', 'The cat is red');
    const stats = await readStats(page);
    expect(stats.similarity).toBe('60.0%');
  });

  test('TC-39 accuracy penalizes B when it is missing expected words from a longer A', async ({ page }) => {
    await compare(page, 'The small cat sleeps', 'The cat sleeps');
    const stats = await readStats(page);
    expect(stats.accuracy).toBe('75.0%');
  });

  test('TC-40 accuracy drops below 100% when B has all of A plus extra words', async ({ page }) => {
    await compare(page, 'The cat sleeps', 'The small cat sleeps');
    const stats = await readStats(page);
    expect(parseFloat(stats.accuracy)).toBeLessThan(100);
  });

  test('TC-41 matching word count', async ({ page }) => {
    await compare(page, 'one two three', 'one two three');
    const stats = await readStats(page);
    expect(stats.matching).toBe('3');
  });

  test('TC-42 replacement count', async ({ page }) => {
    await compare(page, 'one blue three', 'one red three');
    const stats = await readStats(page);
    expect(stats.different).toBe('1');
  });

  test('TC-43 missing/added count', async ({ page }) => {
    await compare(page, 'one two', 'one two three');
    const stats = await readStats(page);
    expect(stats.missingAdded).toBe('1');
  });

  test('TC-44 every aligned matching word renders green', async ({ page }) => {
    await compare(page, 'The cat sleeps quietly', 'The cat sleeps quietly');
    await expect(page.locator('#resultA .token.same')).toHaveCount(4);
    await expect(page.locator('#resultA .token.different')).toHaveCount(0);
    for (const el of await page.locator('#resultA .token.same').all()) {
      await expect(el).toHaveClass(/same/);
    }
  });

  test('TC-45 changed, missing, and added words render red', async ({ page }) => {
    await compare(page, 'The cat sleeps', 'The dog sleeps soundly');
    await expect(page.locator('#resultA .token.different')).toHaveCount(1); // "cat"
    await expect(page.locator('#resultB .token.different')).toHaveCount(2); // "dog", "soundly"
  });
});
