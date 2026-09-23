const { test, expect } = require('@playwright/test');
const { gotoApp, compare } = require('./helpers');

test.describe('HTML/script safety in rendered output (TC-28, TC-29)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('TC-28 script-like text is rendered inert, never executed', async ({ page }) => {
    let dialogFired = false;
    page.on('dialog', async (dialog) => {
      dialogFired = true;
      await dialog.dismiss();
    });

    const payload = '<script>alert("x")</script>';
    await compare(page, payload, payload);

    expect(dialogFired).toBe(false);

    // The tags must appear as escaped text, not as real DOM elements.
    await expect(page.locator('#resultA script')).toHaveCount(0);
    await expect(page.locator('#resultA')).toContainText('<script>alert("x")</script>');

    // Each token is escaped and rendered in its own <span>, so the tag
    // characters show up as separate escaped entities, never as a real tag.
    const html = await page.locator('#resultA').innerHTML();
    expect(html).toContain('&lt;');
    expect(html).toContain('&gt;');
    expect(html).not.toMatch(/<script[\s>]/i);
  });

  test('TC-29 differing HTML-like markup is safely displayed and diffed', async ({ page }) => {
    await compare(page, '<b>Hello</b>', '<i>Hello</i>');

    // Must not create real <b>/<i> elements from user input.
    await expect(page.locator('#resultA b')).toHaveCount(0);
    await expect(page.locator('#resultA i')).toHaveCount(0);
    await expect(page.locator('#resultB b')).toHaveCount(0);
    await expect(page.locator('#resultB i')).toHaveCount(0);

    await expect(page.locator('#resultA')).toContainText('<b>Hello</b>');
    await expect(page.locator('#resultB')).toContainText('<i>Hello</i>');

    // Everything matches except the differing tag letters ("b" vs "i");
    // "Hello" and the angle brackets/slash are shared, so they're green.
    await expect(page.locator('#resultA .token.same')).toContainText(['Hello']);
    await expect(page.locator('#resultB .token.same')).toContainText(['Hello']);
    await expect(page.locator('#resultA .token.different')).toHaveText(['b', 'b']);
    await expect(page.locator('#resultB .token.different')).toHaveText(['i', 'i']);
  });
});
