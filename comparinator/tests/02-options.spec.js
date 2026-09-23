const { test, expect } = require('@playwright/test');
const { gotoApp, compare, readStats, pct } = require('./helpers');

test.describe('Ignore case / Ignore punctuation options (TC-11 .. TC-18, TC-46, TC-48, TC-49)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('TC-11 ignore case OFF treats differently-cased words as different', async ({ page }) => {
    await compare(page, 'Hello World', 'hello world', { ignoreCase: false });
    const stats = await readStats(page);
    expect(stats.similarity).toBe('0.0%');
    await expect(page.locator('#resultA .token.same')).toHaveCount(0);
  });

  test('TC-12 ignore case ON makes case-only differences match', async ({ page }) => {
    await compare(page, 'Hello World', 'hello world', { ignoreCase: true });
    const stats = await readStats(page);
    expect(stats.similarity).toBe('100.0%');
    expect(stats.accuracy).toBe('100.0%');
    await expect(page.locator('#resultA .token.different')).toHaveCount(0);
  });

  test('TC-13 mixed case partial match: ignore case ON matches every word', async ({ page }) => {
    await compare(page, 'Hello WORLD Again', 'hello world Again', { ignoreCase: true });
    const stats = await readStats(page);
    expect(stats.similarity).toBe('100.0%');
    expect(stats.matching).toBe('3');
  });

  test('TC-14 ignore punctuation OFF: punctuation creates differences', async ({ page }) => {
    await compare(page, 'Hello, world!', 'Hello world', { ignorePunctuation: false });
    const stats = await readStats(page);
    expect(pct(stats.similarity)).toBeLessThan(100);
  });

  test('TC-15 ignore punctuation ON: text treated as equivalent, punctuation still visible', async ({ page }) => {
    await compare(page, 'Hello, world!', 'Hello world', { ignorePunctuation: true });
    const stats = await readStats(page);
    expect(stats.similarity).toBe('100.0%');
    expect(stats.accuracy).toBe('100.0%');

    // Punctuation stays visible in the rendered result even though it's excluded from scoring.
    await expect(page.locator('#resultA')).toContainText('Hello, world!');
  });

  test('TC-16 ignore case + punctuation ON: 100% match', async ({ page }) => {
    await compare(page, 'HELLO, World!', 'hello world', {
      ignoreCase: true,
      ignorePunctuation: true,
    });
    const stats = await readStats(page);
    expect(stats.similarity).toBe('100.0%');
    expect(stats.accuracy).toBe('100.0%');
  });

  test('TC-17 apostrophe punctuation behavior', async ({ page }) => {
    // "don't" tokenizes as [don]['][t]; "dont" is a single, different token.
    // Ignore punctuation removes the apostrophe token itself, but does not
    // merge "don"+"t" into "dont" -- they remain genuinely different words.
    await compare(page, "don't stop", 'dont stop', { ignorePunctuation: true });
    const stats = await readStats(page);
    expect(pct(stats.similarity)).toBeLessThan(100);
    await expect(page.locator('#resultA .token.same')).toHaveText(['stop']);
    await expect(page.locator('#resultB .token.same')).toHaveText(['stop']);
  });

  test('TC-18 hyphen punctuation: OFF creates a difference, ON matches fully', async ({ page }) => {
    await compare(page, 'well-known author', 'well known author', { ignorePunctuation: false });
    let stats = await readStats(page);
    expect(pct(stats.similarity)).toBeLessThan(100);

    await compare(page, 'well-known author', 'well known author', { ignorePunctuation: true });
    stats = await readStats(page);
    expect(stats.similarity).toBe('100.0%');
    expect(stats.accuracy).toBe('100.0%');
  });

  test('TC-46 punctuation stays visible in results when Ignore Punctuation is ON', async ({ page }) => {
    await compare(page, 'well-known author, indeed!', 'well known author indeed', {
      ignorePunctuation: true,
    });
    await expect(page.locator('#resultA')).toContainText('well-known author, indeed!');
  });

  test('TC-48 toggling ignore case after Compare recalculates automatically', async ({ page }) => {
    await compare(page, 'Hello World', 'hello world', { ignoreCase: false });
    expect((await readStats(page)).similarity).toBe('0.0%');

    // Toggle without clicking Compare again.
    await page.locator('#ignoreCase').check();
    expect((await readStats(page)).similarity).toBe('100.0%');
  });

  test('TC-49 toggling ignore punctuation after Compare recalculates automatically', async ({ page }) => {
    await compare(page, 'Hello, world!', 'Hello world', { ignorePunctuation: false });
    expect(pct((await readStats(page)).similarity)).toBeLessThan(100);

    await page.locator('#ignorePunctuation').check();
    expect((await readStats(page)).similarity).toBe('100.0%');
  });
});
