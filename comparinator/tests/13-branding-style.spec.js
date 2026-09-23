// @ts-check
// Branding & visual-style checks: comparinator.html vs style-guide.html (Mark-VII UI System).
// These are computed-style / geometry assertions, NOT pixel baselines (none are approved yet).
// Tests wrapped in test.fail() document known, reported defects (BRD-xxx in
// reports/agents/branding-style-report.md). They pass while the defect exists and will
// report "unexpectedly passed" once fixed, and then the test.fail() wrapper should be removed.
const { test, expect } = require('@playwright/test');
const { gotoApp, compare, toggleDarkMode } = require('./helpers');

const SAMPLE_A = 'The quick brown fox jumps over the lazy dog. Supercalifragilisticexpialidocious word.';
const SAMPLE_B = 'The quick red fox leaped over the lazy dog! Extra words appended here.';

// Tokens shared by the guide and the app. Accepted, documented deviations:
//  --green / --green-soft (light): app darkens #1f8a4c -> #15703b; guide value is 4.2:1 on panels (fails AA text).
const SHARED_TOKENS = ['--bg', '--bg-2', '--text', '--muted', '--panel', '--panel-strong', '--border', '--line',
  '--gold', '--gold-2', '--gold-soft', '--gold-ring', '--red', '--red-soft', '--green', '--green-soft',
  '--input', '--scrim', '--glow-gold', '--glow-red', '--radius-xl', '--radius-lg', '--radius-md'];
const ACCEPTED_DEVIATIONS = { light: ['--green', '--green-soft'], dark: [] };

const norm = (v) => v.replace(/\s+/g, '').toLowerCase();

async function readTokens(page, names) {
  return page.evaluate((list) => {
    const cs = getComputedStyle(document.body);
    return Object.fromEntries(list.map((n) => [n, cs.getPropertyValue(n).trim()]));
  }, names);
}

for (const theme of ['light', 'dark']) {
  test(`brand tokens match the style guide (${theme})`, async ({ page }) => {
    await page.goto('/style-guide.html');
    if (theme === 'dark') await page.evaluate(() => document.body.classList.add('dark'));
    const guide = await readTokens(page, SHARED_TOKENS);
    await gotoApp(page);
    if (theme === 'dark') await toggleDarkMode(page);
    const app = await readTokens(page, SHARED_TOKENS);
    const mismatches = SHARED_TOKENS
      .filter((t) => !ACCEPTED_DEVIATIONS[theme].includes(t))
      .filter((t) => norm(guide[t]) !== norm(app[t]))
      .map((t) => `${t}: guide=${guide[t]} app=${app[t]}`);
    expect(mismatches).toEqual([]);
  });
}

test('typography: sans UI stack, monospace for inputs/results, uppercase headings', async ({ page }) => {
  await gotoApp(page);
  await compare(page, SAMPLE_A, SAMPLE_B);
  const t = await page.evaluate(() => {
    const cs = (s) => getComputedStyle(document.querySelector(s));
    return {
      body: cs('body').fontFamily,
      textarea: cs('#textA').fontFamily,
      result: cs('#resultA').fontFamily,
      h1Transform: cs('h1').textTransform,
      eyebrowTransform: cs('.eyebrow').textTransform,
      eyebrowWeight: cs('.eyebrow').fontWeight,
      statLabelTransform: cs('.stat-label').textTransform,
      statValueWeight: Number(cs('.stat-value').fontWeight),
      buttonFont: cs('#compareBtn').fontFamily,
    };
  });
  expect(t.body).toMatch(/^Inter, ui-sans-serif/);
  expect(t.buttonFont).toBe(t.body);
  expect(t.textarea).toMatch(/^ui-monospace/);
  expect(t.result).toMatch(/^ui-monospace/);
  expect(t.h1Transform).toBe('uppercase');
  expect(t.eyebrowTransform).toBe('uppercase');
  expect(t.eyebrowWeight).toBe('800');
  expect(t.statLabelTransform).toBe('uppercase');
  expect(t.statValueWeight).toBeGreaterThanOrEqual(800);
});

test('buttons: gold primary, neutral secondary, 12px radius, 44px targets', async ({ page }) => {
  await gotoApp(page);
  const b = await page.evaluate(() => {
    const pick = (s) => { const c = getComputedStyle(document.querySelector(s)); const r = document.querySelector(s).getBoundingClientRect(); return { bgImg: c.backgroundImage, bg: c.backgroundColor, color: c.color, radius: c.borderRadius, h: r.height, weight: c.fontWeight }; };
    return { primary: pick('#compareBtn'), reset: pick('#resetBtn'), file: pick('#fileBtnA'), close: pick('#a11yBtn') };
  });
  expect(b.primary.bgImg).toBe('linear-gradient(135deg, rgb(169, 117, 10), rgb(201, 154, 46))');
  expect(b.primary.color).toBe('rgb(26, 20, 16)');
  expect(b.reset.bg).toBe('rgba(255, 255, 255, 0.84)');
  expect(b.reset.radius).toBe('12px');
  expect(b.file.radius).toBe('12px');
  for (const k of ['primary', 'reset', 'file', 'close']) expect(b[k].h, k).toBeGreaterThanOrEqual(44);
  expect(b.reset.weight).toBe('750');
});

test('inputs and panels: token radii, borders and fills', async ({ page }) => {
  await gotoApp(page);
  const s = await page.evaluate(() => {
    const c = (sel) => getComputedStyle(document.querySelector(sel));
    return {
      hero: c('header.hero').borderRadius, panel: c('#panelA').borderRadius, controls: c('.controls').borderRadius,
      panelBorder: c('#panelA').borderTopColor, textareaBg: c('#textA').backgroundColor, resultBg: c('#resultA').backgroundColor,
      checkAccent: c('#ignoreCase').accentColor,
    };
  });
  expect(s.hero).toBe('26px');
  expect(s.panel).toBe('26px');
  expect(s.controls).toBe('20px');
  expect(s.panelBorder).toBe('rgba(140, 105, 40, 0.24)');
  expect(s.textareaBg).toBe('rgba(255, 255, 255, 0.55)');
  expect(s.resultBg).toBe('rgba(255, 255, 255, 0.4)');
  expect(s.checkAccent).toBe('rgb(169, 117, 10)');
});

test('semantic colours: gold metrics, green = match, red = difference only', async ({ page }) => {
  await gotoApp(page);
  await compare(page, SAMPLE_A, SAMPLE_B);
  const s = await page.evaluate(() => {
    const col = (sel) => getComputedStyle(document.querySelector(sel)).color;
    const RED = getComputedStyle(document.body).getPropertyValue('--red').trim();
    // Probe the token's rgb() form.
    const probe = document.createElement('span'); probe.style.color = RED; document.body.appendChild(probe);
    const redRgb = getComputedStyle(probe).color; probe.remove();
    const allowed = '.different, .diff-run, .stat.diff, .stat.missing, .counter.limit, .removed-mark, .added-mark, .dot.red';
    const offenders = [...document.querySelectorAll('body *')]
      .filter((el) => !el.closest('[hidden]') && getComputedStyle(el).color === redRgb && !el.closest(allowed))
      .map((el) => el.id || el.className);
    return { sim: col('#similarity'), acc: col('#accuracy'), match: col('#matching'), diff: col('#different'),
      missing: col('#missingAdded'), same: col('#resultA .token.same'), different: col('#resultA .token.different'), offenders };
  });
  expect(s.sim).toBe('rgb(169, 117, 10)');
  expect(s.acc).toBe('rgb(169, 117, 10)');
  expect(s.match).toBe('rgb(21, 112, 59)');
  expect(s.same).toBe('rgb(21, 112, 59)');
  expect(s.diff).toBe('rgb(176, 35, 31)');
  expect(s.missing).toBe('rgb(176, 35, 31)');
  expect(s.different).toBe('rgb(176, 35, 31)');
  expect(s.offenders).toEqual([]);
});

test('decorative rules: reactor cyan unused, HUD corners only on primary containers', async ({ page }) => {
  await gotoApp(page);
  await compare(page, SAMPLE_A, SAMPLE_B);
  const r = await page.evaluate(() => {
    const cyan = [...document.querySelectorAll('*')].filter((el) => {
      const c = getComputedStyle(el);
      return [c.color, c.backgroundColor, c.borderTopColor, c.boxShadow].some((v) => v.includes('55, 199, 224'));
    }).length;
    const hosts = [...new Set([...document.querySelectorAll('.hud-corner')].map((h) => h.parentElement.id || h.parentElement.className))];
    const nested = [...document.querySelectorAll('.hud-corner')].filter((h) => h.parentElement.parentElement.closest(':has(> .hud-corner)')).length;
    return { cyan, hosts, nested };
  });
  expect(r.cyan).toBe(0);
  expect(r.hosts.sort()).toEqual(['a11yPanel', 'hero glass'].sort());
  expect(r.nested).toBe(0);
});

test('hover, active/checked and disabled states follow the guide', async ({ page }) => {
  await gotoApp(page);
  await page.hover('#resetBtn');
  await expect.poll(async () => page.$eval('#resetBtn', (e) => getComputedStyle(e).transform)).toBe('matrix(1, 0, 0, 1, 0, -1)');
  await page.hover('#compareBtn');
  await expect.poll(async () => page.$eval('#compareBtn', (e) => getComputedStyle(e).filter)).toBe('brightness(1.05)');
  // checked / pressed = gold
  expect(await page.$eval('#langEn', (e) => getComputedStyle(e).borderTopColor)).toBe('rgb(169, 117, 10)');
  await toggleDarkMode(page);
  await expect.poll(async () => page.$eval('.theme-toggle .slider', (e) => getComputedStyle(e).backgroundImage))
    .toContain('linear-gradient(135deg, rgb(242, 193, 78), rgb(255, 215, 106))');
  // disabled
  await page.click('#a11yBtn');
  while (!(await page.locator('#optTextInc').isDisabled())) await page.click('#optTextInc');
  await page.hover('#optTextInc', { force: true });
  const d = await page.$eval('#optTextInc', (e) => { const c = getComputedStyle(e); return { o: c.opacity, cur: c.cursor, tf: c.transform }; });
  expect(Number(d.o)).toBeLessThan(0.7);
  expect(d.cur).toBe('not-allowed');
  expect(d.tf).toBe('none');
});

test('focus-visible: gold ring on keyboard focus', async ({ page }) => {
  await gotoApp(page);
  const seen = {};
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => {
      let el = document.activeElement;
      if (el.matches('.switch input')) el = el.nextElementSibling;
      const c = getComputedStyle(el);
      return { id: document.activeElement.id, o: `${c.outlineStyle} ${c.outlineWidth} ${c.outlineColor}` };
    });
    seen[f.id] = f.o;
  }
  for (const id of ['langEn', 'resetBtn', 'ignoreCase', 'textA', 'fileBtnA']) {
    expect(seen[id], id).toBe('solid 3px rgba(169, 117, 10, 0.3)');
  }
});

test('error and warning states use the amber/red tokens', async ({ page }) => {
  await gotoApp(page);
  await page.click('#compareBtn');
  await expect(page.locator('#errorA')).toBeVisible();
  const e = await page.$eval('#errorA', (el) => { const c = getComputedStyle(el); return { bl: c.borderLeftColor, bw: c.borderLeftWidth, bg: c.backgroundColor }; });
  expect(e).toEqual({ bl: 'rgb(187, 122, 21)', bw: '4px', bg: 'rgba(187, 122, 21, 0.14)' });
  await page.fill('#textA', 'x'.repeat(10000));
  await expect(page.locator('#counterA')).toHaveClass(/limit/);
  expect(await page.$eval('#counterA', (el) => getComputedStyle(el).color)).toBe('rgb(176, 35, 31)');
});

const VIEWPORTS = [[1440, 900], [1024, 768], [768, 1024], [390, 844], [320, 568]];
for (const [w, h] of VIEWPORTS) {
  test(`responsive ${w}x${h}: no horizontal overflow or off-screen controls (light+dark, EN+DE)`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await gotoApp(page);
    for (const step of ['light', 'dark', 'de']) {
      if (step === 'dark') await toggleDarkMode(page);
      if (step === 'de') await page.click('#langDe');
      await compare(page, SAMPLE_A, SAMPLE_B);
      const r = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const off = [...document.querySelectorAll('button, label, textarea, h1, .stat, .panel')]
          .filter((el) => el.offsetParent && !el.closest('[hidden]'))
          .filter((el) => { const b = el.getBoundingClientRect(); return b.right > vw + 0.5 || b.left < -0.5; })
          .map((el) => el.id || el.className);
        return { overflow: document.documentElement.scrollWidth - vw, off };
      });
      expect(r.overflow, step).toBeLessThanOrEqual(0);
      expect(r.off, step).toEqual([]);
    }
  });
}

test('responsive stacking: side-by-side panels on desktop, stacked on mobile', async ({ page }) => {
  const layout = async () => page.evaluate(() => {
    const a = document.getElementById('panelA').getBoundingClientRect();
    const b = document.getElementById('panelB').getBoundingClientRect();
    return { sameRow: Math.abs(a.top - b.top) < 1, stacked: b.top >= a.bottom };
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoApp(page);
  expect((await layout()).sameRow).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await layout()).stacked).toBe(true);
  const heroDir = await page.$eval('header.hero', (e) => getComputedStyle(e).flexDirection);
  expect(heroDir).toBe('column');
});

// ---------------- Known defects (documented, expected to fail until fixed) ----------------

test('BRD-01: wrapped input footer keeps clearance above the panel edge', async ({ page }) => {
  test.fail(true, 'BRD-01: wrapped "Maximum 10,000 characters" row sits flush on the rounded panel border');
  await page.setViewportSize({ width: 320, height: 568 });
  await gotoApp(page);
  const gap = await page.evaluate(() => {
    const p = document.getElementById('panelA');
    const t = document.getElementById('maxCharsA').getBoundingClientRect();
    return p.getBoundingClientRect().bottom - parseFloat(getComputedStyle(p).borderBottomWidth) - t.bottom;
  });
  expect(gap).toBeGreaterThanOrEqual(6);
});

test('BRD-02: textarea focus ring is not clipped by the panel', async ({ page }) => {
  test.fail(true, 'BRD-02: .panel overflow:hidden clips the textarea outline on the left/right sides');
  await gotoApp(page);
  await page.focus('#textA');
  const r = await page.evaluate(() => {
    const t = document.getElementById('textA');
    const c = getComputedStyle(t);
    const reach = parseFloat(c.outlineWidth) + parseFloat(c.outlineOffset);
    const tr = t.getBoundingClientRect();
    const pr = document.getElementById('panelA').getBoundingClientRect();
    return { leftRoom: tr.left - pr.left, reach };
  });
  expect(r.leftRoom).toBeGreaterThanOrEqual(r.reach);
});

test('BRD-03: initial empty-state placeholder aligns with the result padding', async ({ page }) => {
  test.fail(true, 'BRD-03: pre-wrap preserves source indentation before the initial .empty span');
  await gotoApp(page);
  const offset = await page.evaluate(() => {
    const body = document.getElementById('resultA');
    const range = document.createRange();
    range.selectNodeContents(body.querySelector('.empty'));
    return range.getClientRects()[0].left - body.getBoundingClientRect().left;
  });
  expect(offset).toBeLessThanOrEqual(21);
});
