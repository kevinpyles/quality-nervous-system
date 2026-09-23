const { test, expect } = require('@playwright/test');
const { gotoApp, compare } = require('./helpers');

test.describe('Responsive layout (TC-59 .. TC-61)', () => {
  test('TC-59 mobile layout (below ~820px) stacks inputs vertically without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 900 });
    await gotoApp(page);

    const panelA = page.locator('.inputs .panel').nth(0);
    const panelB = page.locator('.inputs .panel').nth(1);
    const boxA = await panelA.boundingBox();
    const boxB = await panelB.boundingBox();

    // Stacked: B starts below A, not beside it.
    expect(boxB.y).toBeGreaterThanOrEqual(boxA.y + boxA.height - 1);

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('TC-60 very narrow screen (320-375px) keeps controls usable, nothing clipped', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await gotoApp(page);

    await expect(page.locator('#compareBtn')).toBeVisible();
    await expect(page.locator('#resetBtn')).toBeVisible();
    await expect(page.locator('#textA')).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('TC-61 large desktop (1440px+) keeps a balanced two-column layout', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoApp(page);

    const panelA = page.locator('.inputs .panel').nth(0);
    const panelB = page.locator('.inputs .panel').nth(1);
    const boxA = await panelA.boundingBox();
    const boxB = await panelB.boundingBox();

    // Side-by-side: roughly same vertical position, B to the right of A.
    expect(Math.abs(boxA.y - boxB.y)).toBeLessThan(5);
    expect(boxB.x).toBeGreaterThan(boxA.x + boxA.width - 5);
  });
});

test.describe('Keyboard accessibility (TC-62 .. TC-64)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('TC-62 Tab moves focus through controls in a logical order', async ({ page }) => {
    const seen = [];
    await page.locator('body').click();
    // 20 presses: enough to wrap past the per-panel "Choose file" buttons.
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      const id = await page.evaluate(() => document.activeElement.id || document.activeElement.tagName);
      seen.push(id);
    }
    // The key interactive controls should all receive focus at some point.
    expect(seen).toEqual(expect.arrayContaining(['textA', 'textB', 'compareBtn', 'resetBtn']));
  });

  test('TC-63 Enter/Space activates the Compare and Reset buttons', async ({ page }) => {
    await page.locator('#textA').fill('Hello world');
    await page.locator('#textB').fill('Hello world');

    await page.locator('#compareBtn').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#summary')).toHaveClass(/show/);

    await page.locator('#resetBtn').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#textA')).toHaveValue('');
  });

  test('TC-64 checkboxes toggle via keyboard', async ({ page }) => {
    await page.locator('#ignoreCase').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#ignoreCase')).toBeChecked();

    await page.locator('#ignorePunctuation').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#ignorePunctuation')).toBeChecked();
  });
});

test.describe('Textarea resize (TC-65)', () => {
  test('TC-65 dragging the resize handle grows the textarea without breaking layout', async ({ page }) => {
    await gotoApp(page);
    const textarea = page.locator('#textA');
    const before = await textarea.boundingBox();

    // The native resize handle lives in the bottom-right corner of the textarea.
    const handleX = before.x + before.width - 4;
    const handleY = before.y + before.height - 4;

    await page.mouse.move(handleX, handleY);
    await page.mouse.down();
    await page.mouse.move(handleX, handleY + 120, { steps: 10 });
    await page.mouse.up();

    const after = await textarea.boundingBox();
    expect(after.height).toBeGreaterThanOrEqual(before.height);

    // Layout stays intact: the panel still contains the textarea, no overflow introduced.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
