const { test, expect } = require('@playwright/test');
const { gotoApp, compare } = require('./helpers');

/*
 * Coverage for the accessibility features added after the I18N build
 * (A11Y-001 .. A11Y-030 in a11y-requirements.md): the Accessibility menu,
 * its saved preferences, field validation messages, screen-reader status
 * regions, the skip link and the page's heading/landmark structure.
 */

const A11Y_KEY = 'comparinator.a11y';

/** The menu switches are visually hidden inputs; clicking the label is how a user toggles them. */
function optionLabel(page, id) {
  return page.locator('label.a11y-option').filter({ has: page.locator(`#${id}`) });
}

async function openMenu(page) {
  await page.locator('#a11yBtn').click();
  await expect(page.locator('#a11yPanel')).toBeVisible();
}

async function storedSettings(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}'), A11Y_KEY);
}

async function htmlHasClass(page, cls) {
  return page.evaluate((c) => document.documentElement.classList.contains(c), cls);
}

const TOGGLES = [
  {
    id: 'optKeyboard', key: 'keyboard', cls: 'a11y-kbd', label: 'Keyboard navigation',
    // Stronger 4px focus outline on keyboard focus.
    effect: async (page) => {
      await page.locator('#a11yClose').click();
      await page.locator('#textA').click();
      await page.keyboard.press('Tab');
      return page.evaluate(() => getComputedStyle(document.activeElement).outlineWidth === '4px');
    },
  },
  {
    id: 'optMotion', key: 'motion', cls: 'a11y-no-motion', label: 'Disable animations',
    effect: (page) => page.locator('#compareBtn').evaluate((el) =>
      getComputedStyle(el).transitionDuration.split(',').every((d) => parseFloat(d) <= 0.001)),
  },
  {
    id: 'optContrast', key: 'contrast', cls: 'a11y-contrast', label: 'High contrast',
    effect: (page) => page.evaluate(() => {
      const s = getComputedStyle(document.body);
      return s.backgroundColor === 'rgb(0, 0, 0)' && s.color === 'rgb(255, 255, 255)';
    }),
  },
  {
    id: 'optFont', key: 'font', cls: 'a11y-font', label: 'Readable font',
    effect: (page) => page.evaluate(() => getComputedStyle(document.body).fontFamily.includes('Atkinson Hyperlegible')),
  },
  {
    id: 'optHeadings', key: 'headings', cls: 'a11y-headings', label: 'Highlight headings',
    effect: (page) => page.locator('h1').evaluate((el) => getComputedStyle(el).borderLeftWidth === '5px'),
  },
  {
    id: 'optLinks', key: 'links', cls: 'a11y-links', label: 'Highlight links and buttons',
    effect: (page) => page.locator('.skip-link').evaluate((el) => getComputedStyle(el).textDecorationLine.includes('underline')),
  },
];

test.describe('Accessibility menu: open, close and focus (A11Y-001)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('the Accessibility button opens a labelled modal dialog and moves focus into it', async ({ page }) => {
    const btn = page.locator('#a11yBtn');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(btn).toHaveAttribute('aria-label', 'Open accessibility settings');
    await expect(page.locator('#a11yPanel')).toBeHidden();

    await openMenu(page);
    const dialog = page.getByRole('dialog', { name: 'Accessibility' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#a11yPanel')).toBeFocused();
    await expect(page.locator('#a11yScrim')).toBeVisible();
  });

  test('the page behind the open menu is inert', async ({ page }) => {
    await openMenu(page);
    expect(await page.locator('.app').evaluate((el) => el.inert)).toBe(true);
    await page.locator('#a11yClose').click();
    expect(await page.locator('.app').evaluate((el) => el.inert)).toBe(false);
  });

  for (const [how, close] of [
    ['Escape', (page) => page.keyboard.press('Escape')],
    ['the Close button', (page) => page.locator('#a11yClose').click()],
    ['clicking the scrim', (page) => page.locator('#a11yScrim').click({ position: { x: 10, y: 10 } })],
  ]) {
    test(`${how} closes the menu and returns focus to the Accessibility button`, async ({ page }) => {
      await openMenu(page);
      await close(page);
      await expect(page.locator('#a11yPanel')).toBeHidden();
      await expect(page.locator('#a11yScrim')).toBeHidden();
      await expect(page.locator('#a11yBtn')).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('#a11yBtn')).toBeFocused();
    });
  }

  test('Tab and Shift+Tab stay trapped inside the open menu', async ({ page }) => {
    await openMenu(page);
    await page.locator('#a11yStatementBtn').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#a11yClose')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#a11yStatementBtn')).toBeFocused();

    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement.closest('#a11yPanel'))).toBe(true);
    }
  });
});

test.describe('Accessibility menu: presentation options (A11Y-002 .. A11Y-009, A11Y-026)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await openMenu(page);
  });

  for (const opt of TOGGLES) {
    test(`${opt.label}: turning it on applies it, announces it, saves it, and turning it off undoes it`, async ({ page }) => {
      const input = page.locator(`#${opt.id}`);
      await expect(input).not.toBeChecked();
      expect(await htmlHasClass(page, opt.cls)).toBe(false);

      await optionLabel(page, opt.id).click();
      await expect(input).toBeChecked();
      expect(await htmlHasClass(page, opt.cls)).toBe(true);
      await expect(page.locator('#a11yStatus')).toHaveText(`${opt.label}: on.`);
      expect((await storedSettings(page))[opt.key]).toBe(true);

      await optionLabel(page, opt.id).click();
      await expect(input).not.toBeChecked();
      expect(await htmlHasClass(page, opt.cls)).toBe(false);
      await expect(page.locator('#a11yStatus')).toHaveText(`${opt.label}: off.`);
      expect((await storedSettings(page))[opt.key]).toBe(false);
    });

    test(`${opt.label}: has a visible effect on the page`, async ({ page }) => {
      await optionLabel(page, opt.id).click();
      // Colours and focus styles ease in over ~0.3s, so poll for the settled state.
      await expect.poll(() => opt.effect(page)).toBe(true);
    });
  }

  test('switches are reachable and operable with the keyboard (Space)', async ({ page }) => {
    await page.locator('#optContrast').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#optContrast')).toBeChecked();
    expect(await htmlHasClass(page, 'a11y-contrast')).toBe(true);
  });
});

test.describe('Accessibility menu: text size (A11Y-005)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await openMenu(page);
  });

  test('A+ steps through 110%, 125%, 150% and 200% and scales the page text', async ({ page }) => {
    const rootPx = () => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    const base = await rootPx();
    await expect(page.locator('#a11yLevelValue')).toHaveText('100%');
    await expect(page.locator('#optTextDec')).toBeDisabled();

    for (const [level, scale] of [['110%', 1.1], ['125%', 1.25], ['150%', 1.5], ['200%', 2]]) {
      await page.locator('#optTextInc').click();
      await expect(page.locator('#a11yLevelValue')).toHaveText(level);
      await expect(page.locator('#a11yStatus')).toHaveText(`Text size ${level}.`);
      expect(await rootPx()).toBeCloseTo(base * scale, 0);
      expect((await storedSettings(page)).textScale).toBe(scale);
    }
  });

  test('at 200% A+ disables itself and focus moves to A−', async ({ page }) => {
    for (let i = 0; i < 4; i++) await page.locator('#optTextInc').click();
    await expect(page.locator('#optTextInc')).toBeDisabled();
    await expect(page.locator('#optTextDec')).toBeFocused();
  });

  test('A− returns to 100%, then disables itself and focus moves to A+', async ({ page }) => {
    await page.locator('#optTextInc').click();
    await page.locator('#optTextInc').click();
    await page.locator('#optTextDec').click();
    await expect(page.locator('#a11yLevelValue')).toHaveText('110%');
    await page.locator('#optTextDec').click();
    await expect(page.locator('#a11yLevelValue')).toHaveText('100%');
    await expect(page.locator('#optTextDec')).toBeDisabled();
    await expect(page.locator('#optTextInc')).toBeFocused();
  });

  test('text-size buttons have accessible names', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Increase text size' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Decrease text size' })).toBeVisible();
  });

  test('at 200% text the page reflows without horizontal scrolling', async ({ page }) => {
    for (let i = 0; i < 4; i++) await page.locator('#optTextInc').click();
    await page.locator('#a11yClose').click();
    await compare(page, 'The quick brown fox jumps over the lazy dog.', 'The quick brown cat jumps over the lazy dog.');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('Accessibility menu: reset, statement and persistence (A11Y-010 .. A11Y-012)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('Reset accessibility settings restores defaults but keeps text and results', async ({ page }) => {
    await compare(page, 'alpha beta gamma', 'alpha beta delta');
    await expect(page.locator('#summary')).toHaveClass(/show/);

    await openMenu(page);
    await optionLabel(page, 'optContrast').click();
    await optionLabel(page, 'optFont').click();
    await page.locator('#optTextInc').click();

    await page.locator('#a11yReset').click();
    await expect(page.locator('#a11yStatus')).toHaveText(
      'Accessibility settings restored to defaults. Your text and results were not changed.');
    await expect(page.locator('#optContrast')).not.toBeChecked();
    await expect(page.locator('#optFont')).not.toBeChecked();
    await expect(page.locator('#a11yLevelValue')).toHaveText('100%');
    expect(await htmlHasClass(page, 'a11y-contrast')).toBe(false);
    expect(await storedSettings(page)).toMatchObject({ contrast: false, font: false, textScale: 1 });

    await expect(page.locator('#textA')).toHaveValue('alpha beta gamma');
    await expect(page.locator('#textB')).toHaveValue('alpha beta delta');
    await expect(page.locator('#summary')).toHaveClass(/show/);
  });

  test('the page Reset button clears text but keeps accessibility settings', async ({ page }) => {
    await openMenu(page);
    await optionLabel(page, 'optContrast').click();
    await page.locator('#a11yClose').click();

    await compare(page, 'one two', 'one three');
    await page.locator('#resetBtn').click();
    await expect(page.locator('#textA')).toHaveValue('');
    await expect(page.locator('#appStatus')).toContainText('Accessibility settings were kept.');
    expect(await htmlHasClass(page, 'a11y-contrast')).toBe(true);
    expect((await storedSettings(page)).contrast).toBe(true);
  });

  test('the accessibility statement is an in-menu disclosure', async ({ page }) => {
    await openMenu(page);
    const btn = page.locator('#a11yStatementBtn');
    const statement = page.locator('#a11yStatement');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(statement).toBeHidden();

    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await expect(statement).toBeVisible();
    await expect(statement.locator('h3')).toHaveText('Accessibility statement');
    await expect(statement).toContainText('WCAG 2.2 Level AA');
    await expect(page.getByRole('dialog')).toHaveCount(1);

    await btn.click();
    await expect(statement).toBeHidden();
  });

  test('settings survive a page reload', async ({ page }) => {
    await openMenu(page);
    await optionLabel(page, 'optFont').click();
    await optionLabel(page, 'optHeadings').click();
    await page.locator('#optTextInc').click();
    await page.locator('#optTextInc').click();
    await page.locator('#optTextInc').click();

    await page.reload();
    expect(await htmlHasClass(page, 'a11y-font')).toBe(true);
    expect(await htmlHasClass(page, 'a11y-headings')).toBe(true);
    expect(await htmlHasClass(page, 'a11y-contrast')).toBe(false);
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--a11y-text-scale'))).toBe('1.5');

    await openMenu(page);
    await expect(page.locator('#optFont')).toBeChecked();
    await expect(page.locator('#optHeadings')).toBeChecked();
    await expect(page.locator('#a11yLevelValue')).toHaveText('150%');
  });

  test('saved settings are applied before first paint', async ({ page }) => {
    await page.addInitScript((key) => {
      localStorage.setItem(key, JSON.stringify({ contrast: true, textScale: 1.25 }));
    }, A11Y_KEY);
    // Read the state as soon as the DOM is parsed, before the app script's own pass matters.
    await page.addInitScript(() => {
      document.addEventListener('readystatechange', () => {
        if (document.readyState === 'interactive' && !window.__firstState) {
          window.__firstState = {
            contrast: document.documentElement.classList.contains('a11y-contrast'),
            scale: document.documentElement.style.getPropertyValue('--a11y-text-scale'),
          };
        }
      });
    });
    await gotoApp(page);
    expect(await page.evaluate(() => window.__firstState)).toEqual({ contrast: true, scale: '1.25' });
  });

  test('tampered stored values are ignored and valid ones still apply', async ({ page }) => {
    await page.addInitScript((key) => {
      localStorage.setItem(key, JSON.stringify({ contrast: 'yes', font: true, textScale: 3, links: 1 }));
    }, A11Y_KEY);
    await gotoApp(page);
    expect(await htmlHasClass(page, 'a11y-contrast')).toBe(false);
    expect(await htmlHasClass(page, 'a11y-links')).toBe(false);
    expect(await htmlHasClass(page, 'a11y-font')).toBe(true);
    await openMenu(page);
    await expect(page.locator('#a11yLevelValue')).toHaveText('100%');
  });

  test('corrupt stored JSON does not break the page', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript((key) => localStorage.setItem(key, '{not json'), A11Y_KEY);
    await gotoApp(page);
    await openMenu(page);
    await expect(page.locator('#a11yLevelValue')).toHaveText('100%');
    expect(errors).toEqual([]);
  });
});

test.describe('Accessibility menu in German', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await page.locator('#langDe').click();
  });

  test('button, dialog, options and announcements are translated', async ({ page }) => {
    const btn = page.locator('#a11yBtn');
    await expect(btn).toContainText('Barrierefreiheit');
    await expect(btn).toHaveAttribute('aria-label', 'Einstellungen zur Barrierefreiheit öffnen');

    await btn.click();
    await expect(page.getByRole('dialog', { name: 'Barrierefreiheit' })).toBeVisible();
    await expect(page.locator('#a11yClose')).toHaveAttribute('aria-label', 'Einstellungen zur Barrierefreiheit schließen');
    await expect(page.locator('#optTextInc')).toHaveAttribute('aria-label', 'Text vergrößern');

    await optionLabel(page, 'optContrast').click();
    await expect(page.locator('#a11yStatus')).toHaveText('Hoher Kontrast: ein.');
    await page.locator('#optTextInc').click();
    await expect(page.locator('#a11yStatus')).toHaveText('Textgröße 110%.');
  });

  test('the accessibility statement is shown in German', async ({ page }) => {
    await page.locator('#a11yBtn').click();
    await page.locator('#a11yStatementBtn').click();
    const heading = page.locator('#a11yStatement h3');
    await expect(heading).toBeVisible();
    await expect(heading).not.toHaveText('Accessibility statement');
    await expect(page.locator('#a11yStatement')).not.toContainText('Supported features');
  });
});

test.describe('Field validation messages (A11Y-020)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('comparing with Text A empty shows a linked error on Text A only', async ({ page }) => {
    await compare(page, '', 'some text');
    const errorA = page.locator('#errorA');
    await expect(errorA).toBeVisible();
    await expect(errorA).toHaveText('Text A is empty. Type or paste the expected text, then choose Compare Texts.');
    await expect(page.locator('#textA')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#textA')).toHaveAttribute('aria-describedby', /\berrorA\b/);
    await expect(page.locator('#errorB')).toBeHidden();
    await expect(page.locator('#textB')).not.toHaveAttribute('aria-invalid', /.*/);
  });

  test('whitespace-only Text B counts as empty and is announced', async ({ page }) => {
    await compare(page, 'some text', '   \n  ');
    await expect(page.locator('#errorB')).toHaveText(/^Text B is empty\./);
    await expect(page.locator('#appStatus')).toContainText('Text B is empty.');
  });

  test('the error clears once the field has text and Compare runs again', async ({ page }) => {
    await compare(page, '', 'some text');
    await expect(page.locator('#errorA')).toBeVisible();
    await compare(page, 'some text', 'some text');
    await expect(page.locator('#errorA')).toBeHidden();
    await expect(page.locator('#textA')).not.toHaveAttribute('aria-invalid', /.*/);
  });

  test('the error follows the language switch', async ({ page }) => {
    await compare(page, '', 'some text');
    await page.locator('#langDe').click();
    await expect(page.locator('#errorA')).toBeVisible();
    await expect(page.locator('#errorA')).not.toContainText('Text A is empty');
    await page.locator('#langEn').click();
    await expect(page.locator('#errorA')).toContainText('Text A is empty');
  });
});

test.describe('Screen-reader status messages (A11Y-019, A11Y-030)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('Compare announces one summary with the headline numbers', async ({ page }) => {
    await compare(page, 'the cat sat', 'the dog sat');
    const status = page.locator('#appStatus');
    await expect(status).toHaveAttribute('role', 'status');
    await expect(status).toContainText('Comparison complete.');
    await expect(status).toContainText(/Similarity [\d.]+%, accuracy [\d.]+%\./);
    await expect(status).toContainText('2 matching, 1 different, 0 missing or added.');
  });

  test('pressing Compare twice announces again', async ({ page }) => {
    await compare(page, 'a b', 'a c');
    await expect(page.locator('#appStatus')).toContainText('Comparison complete.');
    await page.locator('#compareBtn').click();
    await expect(page.locator('#appStatus')).toHaveText('');
    await expect(page.locator('#appStatus')).toContainText('Comparison complete.');
  });

  test('each field describes its character count for screen readers', async ({ page }) => {
    await page.locator('#textA').fill('hello');
    await expect(page.locator('#counterASr')).toHaveText('5 of 10,000 characters used');
    await expect(page.locator('#textA')).toHaveAttribute('aria-describedby', /\bcounterASr\b/);
    await page.locator('#textB').fill('hi');
    await expect(page.locator('#counterBSr')).toHaveText('2 of 10,000 characters used');
  });

  test('the counter status speaks only when crossing the 90% and 100% thresholds', async ({ page }) => {
    const status = page.locator('#counterStatus');
    await page.locator('#textA').fill('x'.repeat(8999));
    await expect(status).toHaveText('');

    await page.locator('#textA').fill('x'.repeat(9000));
    await expect(status).toHaveText(/approaching the character limit\. 1,000 characters remaining\./);

    // Still in the warning band: the message is not repeated with a new number.
    await page.locator('#textA').fill('x'.repeat(9500));
    await expect(status).toHaveText(/1,000 characters remaining/);

    await page.locator('#textA').fill('x'.repeat(10000));
    await expect(status).toHaveText(/maximum of 10,000 characters reached/);

    await page.locator('#textA').fill('short');
    await expect(status).toHaveText('');
  });
});

test.describe('Skip link, landmarks and headings (A11Y-017, A11Y-018)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('the first Tab reveals a "Skip to main content" link that jumps to main', async ({ page }) => {
    await page.keyboard.press('Tab');
    const skip = page.locator('.skip-link');
    await expect(skip).toBeFocused();
    await expect(skip).toHaveText('Skip to main content');
    // The link slides in from above (top transition), so wait for it to land on screen.
    await expect.poll(async () => (await skip.boundingBox()).y).toBeGreaterThanOrEqual(0);

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
  });

  test('the page has one h1, one main landmark and labelled sections', async ({ page }) => {
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
    for (const name of ['Comparison options', 'Texts to compare', 'Comparison statistics', 'Highlighted Comparison']) {
      await expect(page.getByRole('heading', { level: 2, name })).toHaveCount(1);
      await expect(page.getByRole('region', { name })).toHaveCount(1);
    }
  });

  test('result panels are described by a text key that explains the markings', async ({ page }) => {
    const key = page.locator('#diffKey');
    await expect(key).toContainText('minus sign');
    await expect(key).toContainText('plus sign');
    const described = await page.locator('[aria-describedby="diffKey"]').count();
    expect(described).toBe(2);
  });
});
