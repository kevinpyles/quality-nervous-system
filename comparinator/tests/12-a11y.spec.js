// Accessibility regression tests (a11y agent), build sha256 7424092a…
// Covers the drag-and-drop / Choose file UI and re-checks core a11y requirements.
//
// Tests marked test.fail() document CONFIRMED DEFECTS in the current build
// (see reports/agents/a11y-report.md). They are expected to fail today. When a
// defect is fixed, Playwright reports "expected to fail, but passed"; remove the
// test.fail() line at that point.
const { test, expect } = require('@playwright/test');
const { gotoApp, compare } = require('./helpers');

const A11Y_KEY = 'comparinator.a11y';

let AXE_PATH = null;
try {
  // axe-core is present in node_modules but not declared in package.json.
  AXE_PATH = require.resolve('axe-core/axe.min.js');
} catch {
  AXE_PATH = null;
}

function file(name, content = 'x', mimeType = 'text/plain') {
  return { name, mimeType, buffer: Buffer.from(content) };
}

async function setA11y(page, settings) {
  await page.evaluate(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [A11Y_KEY, settings]);
  await page.reload();
}

async function runAxe(page) {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    });
    return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  });
}

/** Relative luminance contrast of two [r,g,b] colours. */
function ratio(a, b) {
  const lum = ([r, g, bl]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
  };
  const l1 = lum(a); const l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Decode a PNG buffer to RGBA pixel data using the page's canvas. */
async function decode(page, png) {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return Array.from(ctx.getImageData(0, 0, img.width, img.height).data);
  }, png.toString('base64'));
}

/**
 * Worst rendered contrast of an element's text: hides all text, samples the real
 * background under the element, and composites the computed text colour
 * (including alpha and opacity) over each background pixel.
 */
async function renderedTextContrast(page, selector, { placeholder = false } = {}) {
  const loc = page.locator(selector);
  await loc.scrollIntoViewIfNeeded();
  const { color, alpha } = await loc.evaluate((el, ph) => {
    const cs = getComputedStyle(el, ph ? '::placeholder' : null);
    const m = cs.color.match(/[\d.]+/g).map(Number);
    let op = parseFloat(cs.opacity);
    for (let p = ph ? el : el.parentElement; p && !ph; p = p.parentElement) op *= parseFloat(getComputedStyle(p).opacity);
    return { color: m.slice(0, 3), alpha: (m[3] ?? 1) * op };
  }, placeholder);
  const style = await page.addStyleTag({
    content: '*{color:transparent!important;-webkit-text-fill-color:transparent!important;transition:none!important;caret-color:transparent!important}*::placeholder{color:transparent!important}',
  });
  const box = await loc.boundingBox();
  const clip = placeholder
    ? { x: box.x + 20, y: box.y + 14, width: Math.min(200, box.width - 40), height: 18 }
    : box;
  const png = await page.screenshot({ clip });
  await style.evaluate((s) => s.remove());
  const px = await decode(page, png);
  let worst = 99;
  for (let i = 0; i < px.length; i += 4) {
    const bg = [px[i], px[i + 1], px[i + 2]];
    const fg = color.map((c, k) => c * alpha + bg[k] * (1 - alpha));
    worst = Math.min(worst, ratio(fg, bg));
  }
  return worst;
}

test.describe('Accessibility (a11y agent) — automated scan', () => {
  test.skip(!AXE_PATH, 'axe-core is not installed in node_modules');

  test('axe: no WCAG 2.2 A/AA violations in the default empty state', async ({ page }) => {
    await gotoApp(page);
    expect(await runAxe(page)).toEqual([]);
  });

  test('axe: no violations with results, a file error and a drag-over panel', async ({ page }) => {
    await gotoApp(page);
    await compare(page, 'The quick brown fox.', 'The quick red fox!');
    await page.setInputFiles('#fileA', file('report.pdf'));
    await expect(page.locator('#errorA')).toBeVisible();
    await page.evaluate(() => document.getElementById('panelB').classList.add('drag-over'));
    expect(await runAxe(page)).toEqual([]);
  });

  test('axe: no violations in high contrast with the menu and statement open', async ({ page }) => {
    await gotoApp(page);
    await setA11y(page, { contrast: true });
    await page.locator('#a11yBtn').click();
    await page.locator('#a11yStatementBtn').click();
    expect(await runAxe(page)).toEqual([]);
  });

  test('axe: no violations with every presentation option on at 200% text', async ({ page }) => {
    await gotoApp(page);
    await setA11y(page, { keyboard: true, motion: true, contrast: true, font: true, headings: true, links: true, textScale: 2 });
    await compare(page, 'alpha beta', 'alpha gamma');
    await page.setInputFiles('#fileB', file('x.exe'));
    expect(await runAxe(page)).toEqual([]);
  });
});

test.describe('Accessibility (a11y agent) — file loading UI', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('keyboard-only: Space on Choose file loads B, auto-compares, announces, keeps focus', async ({ page }) => {
    await page.locator('#textA').focus();
    await page.keyboard.type('the cat sat');
    await page.keyboard.press('Tab');
    await expect(page.locator('#fileBtnA')).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.locator('#fileBtnB')).toBeFocused();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Space')]);
    await chooser.setFiles(file('b.txt', 'the dog sat'));
    await expect(page.locator('#similarity')).not.toHaveText('—');
    await expect(page.locator('#appStatus')).toContainText('Loaded “b.txt” into Text B.');
    await expect(page.locator('#appStatus')).toContainText('Comparison complete');
    await expect(page.locator('#fileBtnB')).toBeFocused();
  });

  test('Choose file buttons have distinct names that start with the visible label, plus a type hint', async ({ page }) => {
    for (const k of ['A', 'B']) {
      const btn = page.locator(`#fileBtn${k}`);
      await expect(btn).toHaveAccessibleName(`Choose file for Text ${k}`);
      await expect(btn).toHaveAccessibleDescription(/Supported: \.txt, \.js, \.html, \.css, \.py/);
    }
    await page.locator('#langDe').click();
    const de = await page.locator('#fileBtnA').evaluate((b) => [b.textContent.trim(), b.getAttribute('aria-label') || b.textContent.trim()]);
    expect(de[1].toLowerCase().startsWith(de[0].toLowerCase())).toBe(true);
  });

  test('file error is visible, non-colour, programmatically linked and announced', async ({ page }) => {
    await page.setInputFiles('#fileA', file('notes.docx'));
    const err = page.locator('#errorA');
    await expect(err).toBeVisible();
    await expect(err).toContainText('is not a supported file type');
    await expect(err).toContainText('Supported types');
    await expect(page.locator('#textA')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#textA')).toHaveAccessibleDescription(/not a supported file type/);
    await expect(page.locator('#appStatus')).toHaveText(/notes\.docx.*not a supported file type/);
    const icon = await err.evaluate((e) => getComputedStyle(e, '::before').content);
    expect(icon).toContain('!');
  });

  test('drag-over state uses a dashed outline and a text hint, not colour alone', async ({ page }) => {
    await page.evaluate(() => document.getElementById('panelA').classList.add('drag-over'));
    const outline = await page.locator('#panelA').evaluate((p) => getComputedStyle(p).outlineStyle);
    expect(outline).toBe('dashed');
    await expect(page.locator('#dropHintA')).toBeVisible();
    await expect(page.locator('#dropHintA')).toHaveText('Drop a file to load it into Text A');
  });

  test('drag-over state and menu stay static with prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => document.getElementById('panelA').classList.add('drag-over'));
    await page.locator('#a11yBtn').click();
    const moving = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('*')) {
        for (const pe of [null, '::before', '::after']) {
          const cs = getComputedStyle(el, pe);
          const t = Math.max(...cs.transitionDuration.split(',').map(parseFloat));
          const a = cs.animationName === 'none' ? 0 : Math.max(...cs.animationDuration.split(',').map(parseFloat));
          if (t > 0.01 || a > 0.01) out.push(el.id || el.className || el.tagName);
        }
      }
      return out;
    });
    expect(moving).toEqual([]);
  });

  test('Accessibility reset keeps typed text, results and a file error', async ({ page }) => {
    await setA11y(page, { contrast: true, textScale: 1.5 });
    await compare(page, 'one two', 'one three');
    await page.setInputFiles('#fileB', file('x.exe'));
    await page.locator('#a11yBtn').click();
    await page.locator('#a11yReset').press('Enter');
    await expect(page.locator('html')).not.toHaveClass(/a11y-contrast/);
    await expect(page.locator('#a11yLevelValue')).toHaveText('100%');
    await expect(page.locator('#a11yReset')).toBeFocused();
    await expect(page.locator('#textA')).toHaveValue('one two');
    await expect(page.locator('#similarity')).not.toHaveText('—');
    await expect(page.locator('#errorB')).toBeVisible();
  });

  for (const [label, vp, scale] of [['320px', { width: 320, height: 800 }, 1], ['320px at 200% text', { width: 320, height: 800 }, 2]]) {
    test(`reflow ${label}: file error and drop hint fit without horizontal scrolling`, async ({ page }) => {
      await page.setViewportSize(vp);
      await setA11y(page, { textScale: scale });
      await page.setInputFiles('#fileA', file('quarterly-report.docx'));
      await page.evaluate(() => document.getElementById('panelA').classList.add('drag-over'));
      const m = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        err: document.getElementById('errorA').scrollWidth <= document.getElementById('errorA').clientWidth + 1,
        hint: document.getElementById('dropHintA').scrollWidth <= document.getElementById('dropHintA').clientWidth + 1,
        btn: document.getElementById('fileBtnA').getBoundingClientRect().height >= 24,
      }));
      expect(m).toEqual({ doc: true, err: true, hint: true, btn: true });
    });
  }
});

test.describe('Accessibility (a11y agent) — confirmed defects', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('DEFECT A11Y-HIGH-1: default focus ring has at least 3:1 contrast against the unfocused pixels', async ({ page }) => {
    test.fail(true, 'Known defect: --gold-ring is 30% alpha; ring measures ~1.4:1 (light), ~2.6:1 (dark)');
    const btn = page.locator('#fileBtnA');
    await btn.scrollIntoViewIfNeeded();
    const b = await btn.boundingBox();
    const clip = { x: b.x - 10, y: b.y - 10, width: b.width + 20, height: b.height + 20 };
    await page.addStyleTag({ content: '*{transition:none!important}' });
    const before = await decode(page, await page.screenshot({ clip }));
    await page.locator('#textA').focus();
    await page.keyboard.press('Tab');
    await expect(btn).toBeFocused();
    const after = await decode(page, await page.screenshot({ clip }));
    const ratios = [];
    for (let i = 0; i < before.length; i += 4) {
      const d = Math.abs(before[i] - after[i]) + Math.abs(before[i + 1] - after[i + 1]) + Math.abs(before[i + 2] - after[i + 2]);
      if (d >= 6) ratios.push(ratio(before.slice(i, i + 3), after.slice(i, i + 3)));
    }
    ratios.sort((x, y) => x - y);
    expect(ratios.length).toBeGreaterThan(100);
    expect(ratios[Math.floor(ratios.length / 2)]).toBeGreaterThanOrEqual(3);
  });

  test('DEFECT A11Y-MED-1: a long unsupported file name wraps inside the error at 320px', async ({ page }) => {
    test.fail(true, 'Known defect: .field-error text does not wrap; message is clipped by the panel');
    await page.setViewportSize({ width: 320, height: 800 });
    await page.setInputFiles('#fileA', file('a_really_long_unbroken_filename_without_any_spaces_2026_final_v2.docx'));
    const fits = await page.locator('#errorA').evaluate((e) => e.scrollWidth <= e.clientWidth + 1);
    expect(fits).toBe(true);
  });

  test('DEFECT A11Y-MED-2: empty-result text and placeholders meet 4.5:1 in the light theme', async ({ page }) => {
    test.fail(true, 'Known defect: .empty (opacity .72) ~3.1:1, textarea placeholder (opacity .63) ~2.6:1');
    await page.locator('#textA').blur();
    expect.soft(await renderedTextContrast(page, '#resultA .empty')).toBeGreaterThanOrEqual(4.5);
    expect.soft(await renderedTextContrast(page, '#textA', { placeholder: true })).toBeGreaterThanOrEqual(4.5);
  });

  test('DEFECT A11Y-LOW-1: legend and footer text meet 4.5:1 over the panel shadows', async ({ page }) => {
    test.fail(true, 'Known defect: muted 11-12px text drops to ~4.2:1 where glass panel shadows darken the page');
    await compare(page, 'The quick brown fox.', 'The quick red fox!');
    await page.locator('#compareBtn').blur();
    expect.soft(await renderedTextContrast(page, '.legend-item:nth-child(2) span[data-i18n]')).toBeGreaterThanOrEqual(4.5);
    expect.soft(await renderedTextContrast(page, 'footer')).toBeGreaterThanOrEqual(4.5);
  });

  test('DEFECT A11Y-MED-3: switch on/off state stays visible in forced-colors mode', async ({ page }) => {
    test.fail(true, 'Known defect: the .slider thumb is a background colour, which forced colors removes; on and off look identical');
    await page.emulateMedia({ forcedColors: 'active', colorScheme: 'dark' });
    await setA11y(page, { motion: true });
    await page.locator('#a11yBtn').click();
    await page.evaluate(() => document.activeElement.blur());
    // Count light pixels inside the track (inset past the 1-2px border); a visible thumb adds many.
    const thumbPixels = async (sel) => {
      const px = await decode(page, await page.locator(sel).screenshot());
      const box = await page.locator(sel).boundingBox();
      const w = Math.round(box.width); const h = Math.round(box.height);
      let n = 0;
      for (let y = 5; y < h - 5; y++) {
        for (let x = 8; x < w - 8; x++) {
          const i = (y * w + x) * 4;
          if (px[i] + px[i + 1] + px[i + 2] > 300) n++;
        }
      }
      return n;
    };
    expect.soft(await thumbPixels('#optMotion + .slider')).toBeGreaterThan(20);
    expect.soft(await thumbPixels('#optKeyboard + .slider')).toBeGreaterThan(20);
  });
});
