const { test, expect } = require('@playwright/test');
const { gotoApp, compare, readStats, toggleDarkMode } = require('./helpers');

test.describe('Compare/Reset controls and dark mode (TC-47, TC-50 .. TC-58, TC-69, TC-70)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('TC-47 Compare button populates results and stats', async ({ page }) => {
    await compare(page, 'Hello world', 'Hello world');
    await expect(page.locator('#summary')).toHaveClass(/show/);
    await expect(page.locator('#similarity')).toHaveText('100.0%');
    await expect(page.locator('#resultA')).not.toContainText('Run a comparison');
  });

  test('TC-50 Reset clears Text A', async ({ page }) => {
    await page.locator('#textA').fill('Hello world');
    await page.locator('#resetBtn').click();
    await expect(page.locator('#textA')).toHaveValue('');
  });

  test('TC-51 Reset clears Text B', async ({ page }) => {
    await page.locator('#textB').fill('Hello world');
    await page.locator('#resetBtn').click();
    await expect(page.locator('#textB')).toHaveValue('');
  });

  test('TC-52 Reset clears stats back to initial state', async ({ page }) => {
    await compare(page, 'Hello world', 'Goodbye moon');
    await page.locator('#resetBtn').click();

    const stats = await readStats(page);
    expect(stats.similarity).toBe('—');
    expect(stats.accuracy).toBe('—');
    expect(stats.wordCountA).toBe('0');
    expect(stats.wordCountB).toBe('0');
    expect(stats.matching).toBe('0');
    expect(stats.different).toBe('0');
    expect(stats.missingAdded).toBe('0');
  });

  test('TC-53 Reset clears result panels back to the placeholder', async ({ page }) => {
    await compare(page, 'Hello world', 'Hello world');
    await page.locator('#resetBtn').click();

    await expect(page.locator('#resultA')).toContainText('Run a comparison to see highlighted results.');
    await expect(page.locator('#resultB')).toContainText('Run a comparison to see highlighted results.');
    await expect(page.locator('#summary')).not.toHaveClass(/show/);
  });

  test('TC-54 Reset clears both comparison option checkboxes', async ({ page }) => {
    await page.locator('#ignoreCase').check();
    await page.locator('#ignorePunctuation').check();
    await page.locator('#resetBtn').click();

    await expect(page.locator('#ignoreCase')).not.toBeChecked();
    await expect(page.locator('#ignorePunctuation')).not.toBeChecked();
  });

  test('TC-55 Reset restores light theme', async ({ page }) => {
    await toggleDarkMode(page);
    await expect(page.locator('body')).toHaveClass(/dark/);

    await page.locator('#resetBtn').click();
    await expect(page.locator('body')).not.toHaveClass(/dark/);
    await expect(page.locator('#darkMode')).not.toBeChecked();
  });

  // The theme lives in a `--bg` custom property consumed by a gradient
  // background (not a plain background-color), so read that variable
  // directly rather than backgroundColor, which is always transparent.
  const readThemeBg = (page) =>
    page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--bg').trim());

  test('TC-56 dark mode ON adapts background and panel colors', async ({ page }) => {
    const before = await readThemeBg(page);
    await toggleDarkMode(page);
    await expect(page.locator('body')).toHaveClass(/dark/);
    const after = await readThemeBg(page);
    expect(after).not.toBe(before);
  });

  test('TC-57 dark mode OFF restores the light glassmorphism theme', async ({ page }) => {
    const light0 = await readThemeBg(page);

    await toggleDarkMode(page);
    const dark = await readThemeBg(page);
    expect(dark).not.toBe(light0);

    await toggleDarkMode(page);
    await expect(page.locator('body')).not.toHaveClass(/dark/);
    const light = await readThemeBg(page);
    expect(light).toBe(light0);
  });

  test('TC-58 dark mode keeps green/red highlights distinguishable', async ({ page }) => {
    await toggleDarkMode(page);
    await compare(page, 'The cat sleeps', 'The dog sleeps');

    const sameColor = await page.locator('#resultA .token.same').first().evaluate((el) => getComputedStyle(el).color);
    const diffColor = await page.locator('#resultA .token.different').first().evaluate((el) => getComputedStyle(el).color);
    expect(sameColor).not.toBe(diffColor);
  });

  test('TC-69 repeated Compare clicks do not duplicate output or corrupt stats', async ({ page }) => {
    await page.locator('#textA').fill('Hello world');
    await page.locator('#textB').fill('Hello there');
    const compareBtn = page.locator('#compareBtn');
    await compareBtn.click();
    await compareBtn.click();
    await compareBtn.click();

    const stats = await readStats(page);
    expect(stats.wordCountA).toBe('2');
    expect(stats.wordCountB).toBe('2');
    await expect(page.locator('#resultA .token')).toHaveCount(2);
    await expect(page.locator('#resultB .token')).toHaveCount(2);
  });

  test('TC-70 comparing again after editing B reflects only the latest text', async ({ page }) => {
    await compare(page, 'Hello world', 'Hello world');
    expect((await readStats(page)).similarity).toBe('100.0%');

    await page.locator('#textB').fill('Goodbye world');
    await page.locator('#compareBtn').click();

    const stats = await readStats(page);
    expect(stats.similarity).not.toBe('100.0%');
    const resultBText = await page.locator('#resultB').textContent();
    expect(resultBText).toContain('Goodbye world');
    expect(resultBText).not.toContain('Hello');
  });
});
