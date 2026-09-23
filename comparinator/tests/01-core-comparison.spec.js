const { test, expect } = require('@playwright/test');
const { gotoApp, compare, readStats, pct } = require('./helpers');

test.describe('Core text comparison (TC-01 .. TC-10, TC-19 .. TC-27)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('TC-01 identical text is a full match', async ({ page }) => {
    await compare(page, 'Hello world', 'Hello world');
    const stats = await readStats(page);
    expect(stats.similarity).toBe('100.0%');
    expect(stats.accuracy).toBe('100.0%');
    expect(stats.different).toBe('0');
    expect(stats.missingAdded).toBe('0');

    // All rendered word tokens should be highlighted green, none red.
    await expect(page.locator('#resultA .token.different')).toHaveCount(0);
    await expect(page.locator('#resultB .token.different')).toHaveCount(0);
    await expect(page.locator('#resultA .token.same')).toHaveCount(2);
    await expect(page.locator('#resultB .token.same')).toHaveCount(2);
  });

  test('TC-02 completely different text scores very low', async ({ page }) => {
    await compare(page, 'Hello world', 'Goodbye moon');
    const stats = await readStats(page);
    expect(pct(stats.similarity)).toBeLessThanOrEqual(10);
    expect(pct(stats.accuracy)).toBeLessThanOrEqual(10);

    await expect(page.locator('#resultA .token.same')).toHaveCount(0);
    await expect(page.locator('#resultB .token.same')).toHaveCount(0);
    await expect(page.locator('#resultA .token.different')).toHaveCount(2);
    await expect(page.locator('#resultB .token.different')).toHaveCount(2);
  });

  test('TC-03 one word changed produces a single replacement', async ({ page }) => {
    await compare(page, 'The cat is blue', 'The cat is red');
    const stats = await readStats(page);
    expect(stats.similarity).toBe('60.0%');
    expect(stats.accuracy).toBe('75.0%');
    expect(stats.different).toBe('1');
    expect(stats.missingAdded).toBe('0');

    // "The cat is" green, "blue"/"red" red.
    await expect(page.locator('#resultA .token.same')).toHaveText(['The', 'cat', 'is']);
    await expect(page.locator('#resultA .token.different')).toHaveText(['blue']);
    await expect(page.locator('#resultB .token.same')).toHaveText(['The', 'cat', 'is']);
    await expect(page.locator('#resultB .token.different')).toHaveText(['red']);
  });

  test('TC-04 one word added to B', async ({ page }) => {
    await compare(page, 'The cat sleeps', 'The small cat sleeps');
    const stats = await readStats(page);
    expect(stats.similarity).toBe('75.0%');
    expect(stats.missingAdded).toBe('1');

    await expect(page.locator('#resultB .token.different')).toHaveText(['small']);
    await expect(page.locator('#resultA .token.different')).toHaveCount(0);
    await expect(page.locator('#resultA .token.same')).toHaveCount(3);
  });

  test('TC-05 one word missing from B', async ({ page }) => {
    await compare(page, 'The small cat sleeps', 'The cat sleeps');
    const stats = await readStats(page);
    expect(stats.similarity).toBe('75.0%');
    expect(stats.missingAdded).toBe('1');

    await expect(page.locator('#resultA .token.different')).toHaveText(['small']);
    await expect(page.locator('#resultB .token.different')).toHaveCount(0);
  });

  test('TC-06 multiple replacements keep the shared word green', async ({ page }) => {
    await compare(page, 'The quick brown fox', 'A slow red fox');
    const stats = await readStats(page);
    expect(stats.matching).toBe('1');
    expect(stats.different).toBe('3');

    await expect(page.locator('#resultA .token.same')).toHaveText(['fox']);
    await expect(page.locator('#resultB .token.same')).toHaveText(['fox']);
    await expect(page.locator('#resultA .token.different')).toHaveText(['The', 'quick', 'brown']);
    await expect(page.locator('#resultB .token.different')).toHaveText(['A', 'slow', 'red']);
  });

  test('TC-07 word order changed must not report 100% similarity', async ({ page }) => {
    await compare(page, 'one two three', 'three two one');
    const stats = await readStats(page);
    expect(stats.similarity).not.toBe('100.0%');
    expect(pct(stats.similarity)).toBeLessThan(100);
  });

  test('TC-08 empty A and B does not crash and stays in a sensible state', async ({ page }) => {
    await compare(page, '', '');
    const stats = await readStats(page);

    // No JS crash: stats render as valid, finite percentages, not NaN/undefined.
    expect(stats.similarity).toMatch(/^\d+(\.\d+)?%$/);
    expect(stats.accuracy).toMatch(/^\d+(\.\d+)?%$/);
    expect(stats.matching).toBe('0');
    expect(stats.different).toBe('0');
    expect(stats.missingAdded).toBe('0');

    await expect(page.locator('#resultA')).toContainText('Text A is empty.');
    await expect(page.locator('#resultB')).toContainText('Text B is empty.');
  });

  test('TC-09 A empty, B populated: accuracy is 0% and additions are reported', async ({ page }) => {
    await compare(page, '', 'Hello world');
    const stats = await readStats(page);
    expect(stats.accuracy).toBe('0.0%');
    expect(stats.missingAdded).toBe('2');
    await expect(page.locator('#resultB .token.different')).toHaveCount(2);
  });

  test('TC-10 A populated, B empty: accuracy is 0% and missing items are reported', async ({ page }) => {
    await compare(page, 'Hello world', '');
    const stats = await readStats(page);
    expect(stats.accuracy).toBe('0.0%');
    expect(stats.missingAdded).toBe('2');
    await expect(page.locator('#resultA .token.different')).toHaveCount(2);
  });

  test('TC-19 numbers: only the differing digit is flagged', async ({ page }) => {
    await compare(page, 'Version 2 is ready', 'Version 3 is ready');
    const stats = await readStats(page);
    expect(stats.different).toBe('1');
    await expect(page.locator('#resultA .token.different')).toHaveText(['2']);
    await expect(page.locator('#resultB .token.different')).toHaveText(['3']);
  });

  test('TC-20 repeated words: extra repetition is missing, alignment stays correct', async ({ page }) => {
    await compare(page, 'test test test', 'test test');
    const stats = await readStats(page);
    expect(stats.matching).toBe('2');
    expect(stats.missingAdded).toBe('1');
    await expect(page.locator('#resultA .token.same')).toHaveCount(2);
    await expect(page.locator('#resultA .token.different')).toHaveCount(1);
  });

  test('TC-21 repeated words with insertion does not crash and aligns consistently', async ({ page }) => {
    await compare(page, 'a b a b', 'a a b b');
    const stats = await readStats(page);
    expect(stats.matching).toBe('3');
    expect(stats.different).toBe('1');
    expect(stats.missingAdded).toBe('0');
  });

  test('TC-22 multiple spaces do not create false word differences', async ({ page }) => {
    await compare(page, 'Hello   world', 'Hello world');
    const stats = await readStats(page);
    expect(stats.similarity).toBe('100.0%');
    expect(stats.different).toBe('0');
  });

  test('TC-23 tabs and newlines do not create false word differences', async ({ page }) => {
    await compare(page, 'Hello\tworld\nagain', 'Hello world again');
    const stats = await readStats(page);
    expect(stats.similarity).toBe('100.0%');
    expect(stats.different).toBe('0');
  });

  test('TC-24 paragraph text stays accurate and readable', async ({ page }) => {
    const a = 'The quick brown fox jumps over the lazy dog.\n\nA second paragraph with more detail about the story.';
    const b = 'The quick brown fox leaps over the lazy dog.\n\nA second paragraph with extra detail about the story.';
    await compare(page, a, b);
    const stats = await readStats(page);

    expect(pct(stats.similarity)).toBeGreaterThan(50);
    expect(pct(stats.similarity)).toBeLessThan(100);
    await expect(page.locator('#resultA .token.same').first()).toBeVisible();
    await expect(page.locator('#resultA .token.different').first()).toBeVisible();
    // No overflow / mangled markup: results contain plain readable text.
    await expect(page.locator('#resultA')).toContainText('second paragraph');
  });

  test('TC-25 unicode characters match exactly', async ({ page }) => {
    await compare(page, 'café résumé', 'café résumé');
    const stats = await readStats(page);
    expect(stats.similarity).toBe('100.0%');
    expect(stats.accuracy).toBe('100.0%');
  });

  test('TC-26 identical emoji does not crash and matches', async ({ page }) => {
    await compare(page, 'Great job 👍', 'Great job 👍');
    const stats = await readStats(page);
    expect(stats.similarity).toBe('100.0%');
    expect(stats.matching).toBe('3');
  });

  test('TC-27 different emoji is detected and displayed safely', async ({ page }) => {
    await compare(page, 'Great job 👍', 'Great job 👎');
    const stats = await readStats(page);
    expect(stats.different).toBe('1');
    await expect(page.locator('#resultA .token.different')).toHaveText(['👍']);
    await expect(page.locator('#resultB .token.different')).toHaveText(['👎']);
  });
});
