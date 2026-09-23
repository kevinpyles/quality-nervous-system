// Functional gap coverage added by the Functional Testing Agent (2026-09-16).
// Tests wrapped in test.fail() document open defects (FD-xx in
// reports/agents/functional-report.md). They pass while the defect exists and
// will flag "unexpectedly passed" once it is fixed; then remove test.fail().
const { test, expect } = require('@playwright/test');
const { gotoApp, compare, readStats, setOptions, pct } = require('./helpers');

const tokenCount = (s) => (s.match(/[\p{L}\p{N}_]+|[^\p{L}\p{N}_\s]/gu) || []).length;

test.describe('Functional gaps (FG-01 .. FG-12)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('FG-01 all four Ignore Case / Ignore Punctuation combinations', async ({ page }) => {
    const a = 'Hello, World!';
    const b = 'hello world';
    const expected = [
      // [ignoreCase, ignorePunctuation, similarity, matching]
      [false, false, '0.0%', '0'],
      [true, false, '50.0%', '2'],
      [false, true, '0.0%', '0'],
      [true, true, '100.0%', '2'],
    ];
    for (const [ic, ip, sim, matching] of expected) {
      await compare(page, a, b, { ignoreCase: ic, ignorePunctuation: ip });
      const stats = await readStats(page);
      expect(stats.similarity, `IC=${ic} IP=${ip}`).toBe(sim);
      expect(stats.matching, `IC=${ic} IP=${ip}`).toBe(matching);
    }
  });

  test('FG-02 toggling an option many times ends in the same result as a fresh compare', async ({ page }) => {
    await compare(page, 'Hello, World', 'hello world');
    for (let i = 0; i < 11; i++) await page.locator('#ignoreCase').click();
    await expect(page.locator('#ignoreCase')).toBeChecked();
    const toggled = await readStats(page);
    await page.locator('#compareBtn').click();
    expect(await readStats(page)).toEqual(toggled);
    expect(toggled.matching).toBe('2');
  });

  test('FG-03 typing past 10,000 characters is blocked and the counter shows the limit', async ({ page }) => {
    await page.locator('#textA').fill('y'.repeat(10000));
    await page.locator('#textA').press('End');
    await page.keyboard.type('zz');
    expect(await page.locator('#textA').evaluate((el) => el.value.length)).toBe(10000);
    await expect(page.locator('#counterA')).toHaveText('10,000 / 10,000');
    await expect(page.locator('#counterA')).toHaveClass(/limit/);
  });

  test('FG-04 whitespace-only input counts 0 words and flags both fields', async ({ page }) => {
    await compare(page, '   \n\t ', '  ');
    const stats = await readStats(page);
    expect(stats.wordCountA).toBe('0');
    expect(stats.wordCountB).toBe('0');
    await expect(page.locator('#textA')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#textB')).toHaveAttribute('aria-invalid', 'true');
  });

  test('FG-05 newline-heavy and multiline text compares by words, not layout', async ({ page }) => {
    await compare(page, 'alpha\n\n\n\nbeta\r\ngamma', 'alpha beta gamma');
    const stats = await readStats(page);
    expect(stats.similarity).toBe('100.0%');
    expect(stats.wordCountA).toBe('3');
  });

  test('FG-06 Reset keeps Accessibility Menu preferences', async ({ page }) => {
    await page.locator('#a11yBtn').click();
    await page.locator('#optContrast').check({ force: true });
    await page.locator('#optTextInc').click();
    await page.locator('#a11yClose').click();
    await compare(page, 'a', 'b');
    await page.locator('#resetBtn').click();
    await expect(page.locator('html')).toHaveClass(/a11y-contrast/);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('comparinator.a11y')));
    expect(stored.contrast).toBe(true);
    expect(stored.textScale).toBe(1.1);
    await expect(page.locator('#textA')).toBeFocused();
  });

  test('FG-07 rapid Compare/Reset sequences leave a consistent state with no page errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.locator('#textA').fill('alpha beta');
    await page.locator('#textB').fill('alpha gamma');
    for (let i = 0; i < 20; i++) {
      await page.locator('#compareBtn').click();
      await page.locator('#resetBtn').click();
    }
    const stats = await readStats(page);
    expect(stats.similarity).toBe('—');
    await expect(page.locator('#textA')).toHaveValue('');
    await expect(page.locator('#summary')).not.toHaveClass(/show/);

    await page.locator('#textA').fill('alpha beta');
    await page.locator('#textB').fill('alpha gamma');
    await page.locator('#compareBtn').click();
    expect((await readStats(page)).matching).toBe('1');
    expect(errors).toEqual([]);
  });

  test('FG-08 near-limit prose with a deleted paragraph is aligned exactly (LCS path)', async ({ page }) => {
    const sentences = Array.from({ length: 400 }, (_, s) =>
      Array.from({ length: 6 }, (_, w) => `w${s}x${w}`).join(' ') + '.');
    let a = '';
    let k = 0;
    while ((a + ' ' + sentences[k]).length < 9800) { a += (a ? ' ' : '') + sentences[k]; k++; }
    const kept = sentences.slice(0, k);
    const mid = Math.floor(k / 2);
    const b = [...kept.slice(0, mid), ...kept.slice(mid + 3)].join(' ');
    expect((tokenCount(a) + 1) * (tokenCount(b) + 1)).toBeLessThan(4_500_000);

    await compare(page, a, b);
    const stats = await readStats(page);
    expect(stats.different).toBe('0');
    expect(stats.missingAdded).toBe('21'); // 3 sentences x (6 words + 1 full stop)
  });

  test('FG-09 very long single word and oversized programmatic input do not break Compare', async ({ page }) => {
    await compare(page, 'x'.repeat(10000), 'x'.repeat(9999) + 'y');
    expect((await readStats(page)).different).toBe('1');
    await page.evaluate(() => { document.getElementById('textA').value = 'q'.repeat(20000); });
    await page.locator('#compareBtn').click();
    expect((await readStats(page)).wordCountA).toBe('1');
  });

  // ---- Documented defects -------------------------------------------------

  test('FG-10 [FD-01] token-dense input (source code) still aligns a simple deletion exactly', async ({ page }) => {
    test.fail(true, 'FD-01: greedy fallback (>4.5M LCS cells) reports false replacements');
    const lines = Array.from({ length: 400 }, (_, i) => `x${i % 37}[i] = y[j${i % 11}] + ${i};`);
    const aLines = lines.join('\n').slice(0, 9990).split('\n');
    aLines.pop();
    const a = aLines.join('\n');
    const b = [...aLines.slice(0, 100), ...aLines.slice(105)].join('\n');
    await compare(page, a, b);
    const stats = await readStats(page);
    expect(stats.different).toBe('0');
    expect(stats.matching).toBe(tokenCount(b).toLocaleString('en-US'));
  });

  test('FG-11 [FD-02] two empty inputs do not report 100% similarity with 0% accuracy and "Match"', async ({ page }) => {
    test.fail(true, 'FD-02: empty/whitespace compare yields contradictory metrics and a "Match" summary');
    await compare(page, '', '');
    const stats = await readStats(page);
    // Identical non-empty texts give equal similarity and accuracy; empty ones should not contradict.
    expect(pct(stats.similarity)).toBe(pct(stats.accuracy));
    await expect(page.locator('#summary')).not.toContainText('Match');
  });

  test('FG-12 [FD-03] Ignore punctuation does not erase combining vowel signs', async ({ page }) => {
    test.fail(true, 'FD-03: \\p{M} marks are tokenised as punctuation');
    await setOptions(page, { ignorePunctuation: true });
    await compare(page, 'कि', 'का'); // "ki" vs "kaa": different syllables
    expect(pct((await readStats(page)).similarity)).toBeLessThan(100);
  });
});
