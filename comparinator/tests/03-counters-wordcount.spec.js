const { test, expect } = require('@playwright/test');
const { gotoApp, compare, readStats } = require('./helpers');

test.describe('Character counters and word counts (TC-30 .. TC-37)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('TC-30 character counters start at 0 / 10,000', async ({ page }) => {
    await expect(page.locator('#counterA')).toHaveText('0 / 10,000');
    await expect(page.locator('#counterB')).toHaveText('0 / 10,000');
  });

  test('TC-31 counter updates immediately while typing', async ({ page }) => {
    await page.locator('#textA').pressSequentially('a'.repeat(25));
    await expect(page.locator('#counterA')).toHaveText('25 / 10,000');
  });

  test('TC-32 counter visually warns near the limit', async ({ page }) => {
    await page.locator('#textA').fill('a'.repeat(9001));
    await expect(page.locator('#counterA')).toHaveText('9,001 / 10,000');
    await expect(page.locator('#counterA')).toHaveClass(/warn/);
    await expect(page.locator('#counterA')).not.toHaveClass(/limit/);
  });

  test('TC-33 exactly 10,000 characters is accepted and shown', async ({ page }) => {
    await page.locator('#textA').fill('a'.repeat(10000));
    await expect(page.locator('#counterA')).toHaveText('10,000 / 10,000');
    await expect(page.locator('#counterA')).toHaveClass(/limit/);
    await expect(page.locator('#textA')).toHaveValue('a'.repeat(10000));
  });

  test('TC-34 pasting more than 10,000 characters is restricted by the browser', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Clipboard permissions are most reliable on Chromium.');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const longText = 'b'.repeat(10500);
    await page.evaluate((t) => navigator.clipboard.writeText(t), longText);

    await page.locator('#textA').click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');

    const value = await page.locator('#textA').inputValue();
    expect(value.length).toBe(10000);
    await expect(page.locator('#counterA')).toHaveText('10,000 / 10,000');
  });

  test('TC-35 Word Count A stat reflects Compare results', async ({ page }) => {
    await compare(page, 'one two three four', 'one two three four');
    const stats = await readStats(page);
    expect(stats.wordCountA).toBe('4');
  });

  test('TC-36 Word Count B stat reflects Compare results', async ({ page }) => {
    await compare(page, 'one two', 'one two');
    const stats = await readStats(page);
    expect(stats.wordCountB).toBe('2');
  });

  test('TC-37 extra spaces do not inflate the word count', async ({ page }) => {
    await page.locator('#textA').fill('one   two');
    await expect(page.locator('#wordsAInline')).toHaveText('2 words');

    await compare(page, 'one   two', 'one   two');
    const stats = await readStats(page);
    expect(stats.wordCountA).toBe('2');
  });
});
