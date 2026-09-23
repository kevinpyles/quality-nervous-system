// Internationalization (I18N) coverage for Comparinator.
// Tests wrapped in test.fail() document open defects (I18N-xx in
// reports/agents/i18n-report.md). They pass while the defect exists and will be
// flagged "unexpectedly passed" once the defect is fixed. Then remove test.fail().
const { test, expect } = require('@playwright/test');
const { gotoApp, compare, readStats, pct } = require('./helpers');

async function switchTo(page, lang) {
  await page.locator(lang === 'de' ? '#langDe' : '#langEn').click();
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

/** Visible, non-script text and localizable attributes, for EN/DE diffing. */
async function uiStrings(page) {
  return page.evaluate(() => {
    const text = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const s = n.textContent.trim();
      if (s && !n.parentElement.closest('script,style,textarea')) text.push(s);
    }
    const attrs = [];
    document.querySelectorAll('[aria-label],[title],[placeholder]').forEach((e) => {
      for (const a of ['aria-label', 'title', 'placeholder']) {
        if (e.hasAttribute(a)) attrs.push(`${e.id}@${a}=${e.getAttribute(a)}`);
      }
    });
    return { text, attrs };
  });
}

test.describe('I18N: locale switching and translation rendering (I18N-T01 .. I18N-T08)', () => {
  test.beforeEach(async ({ page }) => { await gotoApp(page); });

  test('I18N-T01 default locale is English with lang="en" and pressed EN button', async ({ page }) => {
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('#langEn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#langDe')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#compareBtn')).toHaveText('Compare Texts');
  });

  test('I18N-T02 switching to German translates UI, title, placeholders and toggles back', async ({ page }) => {
    await switchTo(page, 'de');
    await expect(page.locator('#langDe')).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveTitle(/Textvergleich/);
    await expect(page.locator('#compareBtn')).toHaveText('Texte vergleichen');
    await expect(page.locator('#textA')).toHaveAttribute('placeholder', /.+/);
    expect(await page.locator('#textA').getAttribute('placeholder')).not.toContain('Paste');
    await switchTo(page, 'en');
    await expect(page.locator('#compareBtn')).toHaveText('Compare Texts');
    await expect(page).toHaveTitle(/Text Comparison Tool/);
  });

  test('I18N-T03 no "undefined" or raw keys render in either locale, including the a11y menu', async ({ page }) => {
    for (const lang of ['en', 'de']) {
      await switchTo(page, lang);
      await compare(page, 'eins zwei', 'eins drei');
      await page.locator('#a11yBtn').click();
      const body = await page.evaluate(() => {
        const clone = document.body.cloneNode(true);
        clone.querySelectorAll('script, style').forEach((e) => e.remove());
        return clone.textContent;
      });
      expect(body).not.toContain('undefined');
      expect(body).not.toMatch(/\b(textAPlaceholder|statSimilarity|a11yTitle|emptyResultsPlaceholder)\b/);
      await page.keyboard.press('Escape');
    }
  });

  test('I18N-T04 every data-i18n element changes text between EN and DE (except brand/identical labels)', async ({ page }) => {
    const en = await page.$$eval('[data-i18n]', (els) => els.map((e) => e.textContent.trim()));
    await switchTo(page, 'de');
    const de = await page.$$eval('[data-i18n]', (els) => els.map((e) => e.textContent.trim()));
    const allowedSame = new Set(['Text A', 'Text B']);
    const unchanged = en.filter((s, i) => s === de[i] && !allowedSame.has(s));
    expect(unchanged).toEqual([]);
  });

  test('I18N-T05 visible results, summary and statistics re-render when the locale changes', async ({ page }) => {
    await compare(page, 'one two three', 'one two four');
    await expect(page.locator('#summary')).toContainText('Comparison complete');
    expect((await readStats(page)).similarity).toBe('50.0%');
    await switchTo(page, 'de');
    await expect(page.locator('#summary')).toContainText('Vergleich abgeschlossen');
    expect((await readStats(page)).similarity).toBe('50,0%');
    expect((await readStats(page)).accuracy).toBe('66,7%');
  });

  test('I18N-T06 validation messages follow the active locale', async ({ page }) => {
    await compare(page, '', 'text');
    const enMsg = (await page.locator('#errorA').textContent()).trim();
    expect(enMsg.length).toBeGreaterThan(0);
    await switchTo(page, 'de');
    await expect(page.locator('#errorA')).toBeVisible();
    expect((await page.locator('#errorA').textContent()).trim()).not.toBe(enMsg);
  });

  test('I18N-T07 German number formatting uses "." thousands separators in counters and stats', async ({ page }) => {
    await switchTo(page, 'de');
    await expect(page.locator('#maxCharsA')).toContainText('10.000');
    const words = Array.from({ length: 1200 }, () => 'wort').join(' ');
    await compare(page, words, words);
    expect((await readStats(page)).wordCountA).toBe('1.200');
    await expect(page.locator('#counterA')).toHaveText('5.999 / 10.000');
    await switchTo(page, 'en');
    expect((await readStats(page)).wordCountA).toBe('1,200');
    await expect(page.locator('#counterA')).toHaveText('5,999 / 10,000');
  });

  test('I18N-T08 [I18N-06] language-selector group label is localized', async ({ page }) => {
    test.fail(true, 'I18N-06: #langGroup aria-label "Language selector" is hard-coded English');
    const before = (await uiStrings(page)).attrs;
    await switchTo(page, 'de');
    const after = (await uiStrings(page)).attrs;
    const unchanged = after.filter((a) => before.includes(a) && !/^lang(En|De)@/.test(a));
    expect(unchanged).toEqual([]);
  });
});

test.describe('I18N: text expansion layout (I18N-L01 .. I18N-L02)', () => {
  for (const width of [320, 375, 768, 1280]) {
    test(`I18N-L01 German UI has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoApp(page);
      await switchTo(page, 'de');
      await compare(page, 'eins zwei drei', 'eins zwei vier');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const clipped = await page.evaluate(() => [...document.querySelectorAll('button, label, h2, h3, dt, .role, .counter')]
        .filter((e) => e.getBoundingClientRect().width && !e.closest('.sr-only, .a11y-fab'))
        .filter((e) => { const cs = getComputedStyle(e); return cs.overflow !== 'visible' && e.scrollWidth > e.clientWidth + 1; })
        .map((e) => e.id || e.className));
      expect(clipped).toEqual([]);
    });
  }

  test('I18N-L02 long German compound words wrap inside result panels at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await gotoApp(page);
    await switchTo(page, 'de');
    const w = 'Donaudampfschifffahrtselektrizitätenhauptbetriebswerkbauunterbeamtengesellschaft';
    await compare(page, `${w} ${w}`, `${w}x`);
    const dims = await page.evaluate(() => [resultA.scrollWidth - resultA.clientWidth, document.documentElement.scrollWidth - window.innerWidth]);
    expect(dims[0]).toBeLessThanOrEqual(0);
    expect(dims[1]).toBeLessThanOrEqual(0);
  });
});

test.describe('I18N: Unicode input and multilingual comparison (I18N-U01 .. I18N-U15)', () => {
  test.beforeEach(async ({ page }) => { await gotoApp(page); });

  const identical = [
    ['accented Latin', 'Café naïve façade Ångström'],
    ['German umlauts', 'Größenmaßstäbe über Äpfel'],
    ['Cyrillic', 'Привет, как дела?'],
    ['CJK', '我 喜欢 苹果。日本語 テキスト'],
    ['Arabic', 'مرحبا، كيف الحال؟'],
    ['Hebrew', 'שלום, מה שלומך?'],
    ['emoji incl. ZWJ and skin tone', 'I ❤️ 🍕 👍🏽 👨‍👩‍👧'],
    ['astral and smart punctuation', '𝐀𝐁𝐂 „Zitat“ – ‚ja‘ … « oui »'],
  ];
  for (const [name, text] of identical) {
    test(`I18N-U01 identical ${name} text matches 100% and round-trips unchanged`, async ({ page }) => {
      await compare(page, text, text);
      const s = await readStats(page);
      expect(s.similarity).toBe('100.0%');
      expect(s.accuracy).toBe('100.0%');
      await expect(page.locator('#resultA')).toHaveText(text);
      await expect(page.locator('#resultB')).toHaveText(text);
    });
  }

  test('I18N-U02 Cyrillic word difference is detected and highlighted', async ({ page }) => {
    await compare(page, 'Привет мир', 'Привет миру');
    await expect(page.locator('#resultA .token.different')).toHaveText(['мир']);
    await expect(page.locator('#resultB .token.different')).toHaveText(['миру']);
  });

  test('I18N-U03 Arabic and Hebrew word differences are detected', async ({ page }) => {
    await compare(page, 'مرحبا بالعالم', 'مرحبا بالناس');
    await expect(page.locator('#resultB .token.different')).toHaveText(['بالناس']);
    await compare(page, 'שלום עולם', 'שלום חבר');
    await expect(page.locator('#resultB .token.different')).toHaveText(['חבר']);
  });

  test('I18N-U04 mixed LTR/RTL content isolates the changed number', async ({ page }) => {
    await compare(page, 'Version 2.0 של התוכנה', 'Version 2.1 של התוכנה');
    await expect(page.locator('#resultA .token.different')).toHaveText(['0']);
    await expect(page.locator('#resultB .token.different')).toHaveText(['1']);
  });

  test('I18N-U05 Ignore case folds German umlauts, Cyrillic, Greek and capital sharp s', async ({ page }) => {
    for (const [a, b] of [['ÄRGER ÜBER ÖL', 'ärger über öl'], ['ПРИВЕТ Мир', 'привет мир'], ['ΟΔΟΣ', 'οδος'], ['GROẞ', 'groß']]) {
      await compare(page, a, b, { ignoreCase: true });
      expect((await readStats(page)).similarity).toBe('100.0%');
    }
  });

  test('I18N-U06 Ignore punctuation handles German, French, CJK and Arabic punctuation', async ({ page }) => {
    for (const [a, b] of [
      ['„Hallo“ sagte er – ‚ja‘', '"Hallo" sagte er - \'ja\''],
      ['« Bonjour » !', 'Bonjour!'],
      ['你好，世界。', '你好 世界'],
      ['مرحبا، كيف الحال؟', 'مرحبا كيف الحال'],
    ]) {
      await compare(page, a, b, { ignorePunctuation: true });
      expect((await readStats(page)).similarity).toBe('100.0%');
    }
  });

  test('I18N-U07 non-breaking and narrow no-break spaces behave like spaces', async ({ page }) => {
    await compare(page, 'Hello World 10 km', 'Hello World 10 km');
    expect((await readStats(page)).similarity).toBe('100.0%');
    expect((await readStats(page)).wordCountA).toBe('4');
  });

  test('I18N-U08 [I18N-02] NFC and NFD forms of the same German word match', async ({ page }) => {
    test.fail(true, 'I18N-02: input is not Unicode-normalized before comparison');
    await compare(page, 'schön', 'schön');
    expect((await readStats(page)).similarity).toBe('100.0%');
  });

  test('I18N-U09 [I18N-01] Ignore punctuation does not erase a decomposed accent (café vs cafe)', async ({ page }) => {
    test.fail(true, 'I18N-01: \\p{M} combining marks are classed as punctuation');
    await compare(page, 'café', 'cafe', { ignorePunctuation: true });
    expect(pct((await readStats(page)).similarity)).toBeLessThan(100);
  });

  test('I18N-U10 [I18N-01] a word with Hebrew niqqud is one comparison item', async ({ page }) => {
    test.fail(true, 'I18N-01: combining marks split words into fragments');
    await compare(page, 'שָׁלוֹם', 'שָׁלוֹם');
    expect((await readStats(page)).matching).toBe('1');
  });

  test('I18N-U11 [I18N-03] Ignore punctuation still reports a changed emoji', async ({ page }) => {
    test.fail(true, 'I18N-03: emoji/symbols are classed as punctuation');
    await compare(page, 'I like 🍕', 'I like 🍔', { ignorePunctuation: true });
    expect(pct((await readStats(page)).similarity)).toBeLessThan(100);
  });

  test('I18N-U12 [I18N-03] Ignore punctuation still reports a changed currency symbol', async ({ page }) => {
    test.fail(true, 'I18N-03: currency symbols are classed as punctuation');
    await compare(page, 'Preis 5 €', 'Preis 5 $', { ignorePunctuation: true });
    expect(pct((await readStats(page)).similarity)).toBeLessThan(100);
  });

  test('I18N-U13 [I18N-05] Ignore case treats STRASSE and straße as equal (full case folding)', async ({ page }) => {
    test.fail(true, 'I18N-05: toLocaleLowerCase() is not full case folding (ß/SS, final sigma)');
    await compare(page, 'STRASSE', 'straße', { ignoreCase: true });
    expect((await readStats(page)).similarity).toBe('100.0%');
  });

  test('I18N-U14 [I18N-07] word count agrees with the tokenizer for unspaced CJK text', async ({ page }) => {
    test.fail(true, 'I18N-07: word count splits on whitespace only');
    await compare(page, '你好，世界。', '你好，世界。');
    const s = await readStats(page);
    expect(s.wordCountA).toBe(s.matching);
  });

  test('I18N-U15 character counter counts UTF-16 units consistently with maxlength', async ({ page }) => {
    await page.locator('#textA').fill('😀');
    await expect(page.locator('#counterA')).toHaveText('2 / 10,000');
  });
});

test.describe('I18N: right-to-left presentation (I18N-R01)', () => {
  test('I18N-R01 [I18N-04] RTL input and results use automatic base direction', async ({ page }) => {
    test.fail(true, 'I18N-04: textareas and result panels have no dir="auto"');
    await gotoApp(page);
    await compare(page, 'مرحبا، كيف الحال؟', 'שלום, מה שלומך?');
    const dirs = await page.evaluate(() => [textA, textB, resultA, resultB].map((e) => getComputedStyle(e).direction));
    expect(dirs).toEqual(['rtl', 'rtl', 'rtl', 'rtl']);
  });
});

test.describe('I18N: locale-sensitive formatting (I18N-F01 .. I18N-F02)', () => {
  test.beforeEach(async ({ page }) => { await gotoApp(page); });

  test('I18N-F01 percentages use "." in English and "," in German', async ({ page }) => {
    await compare(page, 'a b c', 'a b d');
    expect((await readStats(page)).accuracy).toBe('66.7%');
    await switchTo(page, 'de');
    expect((await readStats(page)).accuracy).toMatch(/^66,7\s?%$/);
  });

  test('I18N-F02 [I18N-08] German percentages follow CLDR spacing ("66,7 %")', async ({ page }) => {
    test.fail(true, 'I18N-08: fmtPercent is hand-rolled and omits the de-DE no-break space');
    await switchTo(page, 'de');
    await compare(page, 'a b c', 'a b d');
    const expected = new Intl.NumberFormat('de-DE', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(2 / 3);
    expect((await readStats(page)).accuracy).toBe(expected);
  });
});
