// Security Testing Agent coverage (see reports/agents/security-report.md).
// Requirement IDs refer to security-requirements.md.
//
// Two tests in this file assert requirements that the build under test does
// NOT meet (SEC-002 logic-level length limit, SEC-034 pathological input).
// They fail on purpose until the defects are fixed; do not mark them skipped.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { gotoApp, compare } = require('./helpers');

const APP_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'comparinator.html'), 'utf8');
const A11Y_KEY = 'comparinator.a11y';

// Each payload sets window.__pwned if it ever executes.
const XSS_PAYLOADS = [
  '<script>window.__pwned=1</script>',
  '<img src=x onerror="window.__pwned=2">',
  '<svg onload="window.__pwned=3"></svg>',
  '<a href="javascript:window.__pwned=4">click</a>',
  '&lt;script&gt;window.__pwned=5&lt;/script&gt;',
  '&amp;lt;img src=x onerror=window.__pwned=6&amp;gt;',
  '<img src=x onerror=window.__pwned=7',
  '"><img src=x onerror=window.__pwned=8>',
  "'><svg/onload=window.__pwned=9>",
  '{{constructor.constructor("window.__pwned=10")()}} ${window.__pwned=11}',
  '<iframe src="javascript:parent.__pwned=12"></iframe>',
  '<<script>script>window.__pwned=13<</script>/script>',
  '<math><mi xlink:href="javascript:window.__pwned=15">x</mi></math><details open ontoggle=window.__pwned=16>',
  '<span class="token same" id="compareBtn" style="color:red">x</span></span></del></ins><ins>',
  '<style>body{display:none}</style><div style="position:fixed;inset:0">X</div>',
  '‮gnp.exe<b>‬ ​‍﻿ é́ раураl  　  ',
];

const RESULT_TAGS = new Set(['SPAN', 'DEL', 'INS', 'STRONG']);
const RESULT_CLASSES = new Set(['match-run', 'token', 'same', 'different', 'diff-run', 'empty']);

/** Snapshot of everything user text could have altered inside the result areas. */
async function inspectResults(page) {
  return page.evaluate(({ tags, classes }) => {
    const nodes = [...document.querySelectorAll('#resultA *, #resultB *, #summary *')];
    return {
      pwned: window.__pwned,
      badTags: nodes.filter((e) => !tags.includes(e.tagName)).map((e) => e.tagName),
      badAttrs: nodes.flatMap((e) => [...e.attributes].map((a) => a.name)).filter((n) => n !== 'class'),
      badClasses: nodes.flatMap((e) => [...e.classList]).filter((c) => !classes.includes(c)),
      textA: document.querySelector('#resultA').textContent === document.querySelector('#textA').value,
      textB: document.querySelector('#resultB').textContent === document.querySelector('#textB').value,
      h1: document.querySelectorAll('h1').length,
      forms: document.forms.length,
      frames: document.querySelectorAll('iframe, frame, object, embed').length,
      styles: document.querySelectorAll('style').length,
      compareBtns: document.querySelectorAll('[id="compareBtn"]').length,
    };
  }, { tags: [...RESULT_TAGS], classes: [...RESULT_CLASSES] });
}

function trackHostileSignals(page) {
  const signals = { dialogs: [], errors: [] };
  page.on('dialog', async (d) => { signals.dialogs.push(d.message()); await d.dismiss(); });
  page.on('pageerror', (e) => signals.errors.push(String(e)));
  return signals;
}

async function dropFiles(page, selector, files) {
  const dt = await page.evaluateHandle((list) => {
    const d = new DataTransfer();
    list.forEach((f) => d.items.add(new File([f.content], f.name, { type: 'text/plain' })));
    return d;
  }, files);
  await page.dispatchEvent(selector, 'dragenter', { dataTransfer: dt });
  await page.dispatchEvent(selector, 'drop', { dataTransfer: dt });
}

test.describe('SEC-004..010 XSS and HTML injection through the comparison workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { window.__pwned = 0; });
    await gotoApp(page);
  });

  for (const lang of ['en', 'de']) {
    test(`payload families stay inert text in both panels and the summary (${lang})`, async ({ page }) => {
      const signals = trackHostileSignals(page);
      if (lang === 'de') await page.click('#langDe');
      const baseline = await inspectResults(page);

      for (const payload of XSS_PAYLOADS) {
        for (const opts of [{ ignoreCase: false, ignorePunctuation: false }, { ignoreCase: true, ignorePunctuation: true }]) {
          await compare(page, payload, `${payload} extra <b>x</b>`, opts);
          const r = await inspectResults(page);
          const where = `${JSON.stringify(payload)} ${JSON.stringify(opts)}`;
          expect(r.pwned, where).toBe(0);
          expect(r.badTags, where).toEqual([]);
          expect(r.badAttrs, where).toEqual([]);
          expect(r.badClasses, where).toEqual([]);
          expect(r.textA, `result A reproduces the input verbatim: ${where}`).toBe(true);
          expect(r.textB, `result B reproduces the input verbatim: ${where}`).toBe(true);
          expect({ h1: r.h1, forms: r.forms, frames: r.frames, styles: r.styles, compareBtns: r.compareBtns }, where)
            .toEqual({ h1: baseline.h1, forms: baseline.forms, frames: baseline.frames, styles: baseline.styles, compareBtns: 1 });
        }
      }
      // Language switch re-renders visible results through innerHTML again.
      await page.click(lang === 'de' ? '#langEn' : '#langDe');
      expect((await inspectResults(page)).badTags).toEqual([]);
      expect(signals.dialogs).toEqual([]);
      expect(signals.errors).toEqual([]);
    });
  }

  test('SEC-009 an injected heading does not add a heading to the page', async ({ page }) => {
    const before = await page.locator('h1, h2, h3, h4, h5, h6').count();
    await compare(page, '<h1>Injected Heading</h1>', '<h2>Injected Heading</h2>');
    await expect(page.locator('h1, h2, h3, h4, h5, h6')).toHaveCount(before);
    await expect(page.getByRole('heading', { name: 'Injected Heading' })).toHaveCount(0);
    await expect(page.locator('#resultA')).toHaveText('<h1>Injected Heading</h1>');
  });

  test('hostile file names and file content stay inert in errors, status and results', async ({ page }) => {
    const signals = trackHostileSignals(page);
    const badName = '<img src=x onerror=window.__pwned=20>.exe';
    await dropFiles(page, '#panelA', [{ name: badName, content: 'x' }]);
    await expect(page.locator('#errorA')).toContainText(badName);
    await expect(page.locator('#errorA *')).toHaveCount(0);
    await expect(page.locator('#appStatus')).toContainText(badName);
    await expect(page.locator('#appStatus *')).toHaveCount(0);

    const okName = '<svg onload=window.__pwned=21>.txt';
    await dropFiles(page, '#panelA', [
      { name: okName, content: XSS_PAYLOADS[1] },
      { name: '"><img src=x onerror=window.__pwned=22>.html', content: XSS_PAYLOADS[2] },
    ]);
    await expect(page.locator('#summary')).toHaveClass(/show/);
    await expect(page.locator('#appStatus')).toContainText(okName);
    await expect(page.locator('#appStatus *')).toHaveCount(0);
    const r = await inspectResults(page);
    expect(r.pwned).toBe(0);
    expect(r.badTags).toEqual([]);
    expect(signals.dialogs).toEqual([]);
  });

  test('query string and hash payloads are ignored', async ({ page }) => {
    const signals = trackHostileSignals(page);
    await page.goto('/comparinator.html?textA=%3Cimg%20src%3Dx%20onerror%3Dwindow.__pwned%3D30%3E&lang=%3Csvg%3E#%3Cimg%20src%3Dx%20onerror%3Dwindow.__pwned%3D31%3E');
    await expect(page.locator('#textA')).toHaveValue('');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(await page.evaluate(() => window.__pwned)).toBe(0);
    expect(signals.dialogs).toEqual([]);
  });
});

test.describe('SEC-004/008/030 static review of dangerous sinks', () => {
  test('no eval, Function, document.write, insertAdjacentHTML, outerHTML or string timers', () => {
    expect(APP_SOURCE).not.toMatch(/\beval\s*\(/);
    expect(APP_SOURCE).not.toMatch(/new\s+Function\s*\(/);
    expect(APP_SOURCE).not.toMatch(/document\.write(ln)?\s*\(/);
    expect(APP_SOURCE).not.toMatch(/insertAdjacentHTML|outerHTML/);
    expect(APP_SOURCE).not.toMatch(/set(Timeout|Interval)\s*\(\s*['"`]/);
    expect(APP_SOURCE).not.toMatch(/createElement\(\s*['"]script/);
    expect(APP_SOURCE).not.toMatch(/\bimport\s*\(/);
  });

  test('innerHTML sinks match the reviewed set (review lock)', () => {
    // Reviewed 2026-09-16 (8 sinks): result panels (escapeHtml per token), summary
    // (numbers + translations only), reset placeholders and the static
    // accessibility statement. A new sink needs a fresh security review.
    const sinks = (APP_SOURCE.match(/\.innerHTML\s*=/g) || []).length;
    expect(sinks).toBe(8);
    expect(APP_SOURCE).toMatch(/replaceAll\('&', '&amp;'\)\s*\.replaceAll\('<', '&lt;'\)\s*\.replaceAll\('>', '&gt;'\)\s*\.replaceAll\('"', '&quot;'\)\s*\.replaceAll\("'", '&#039;'\)/);
  });

  test('SEC-031 no obvious secrets in client source', () => {
    expect(APP_SOURCE).not.toMatch(/(api[_-]?key|secret|passw(or)?d|bearer|authorization)\s*[:=]/i);
    expect(APP_SOURCE).not.toMatch(/\b(sk|pk|ghp|xox[bp])[-_][A-Za-z0-9]{16,}/);
  });
});

test.describe('SEC-011/012/035 local storage', () => {
  const TAMPERED = [
    ['wrong types', '{"contrast":"true","font":1,"links":"yes","textScale":"abc"}'],
    ['style injection attempt', '{"textScale":"1; background:url(javascript:alert(1))","headings":"<img src=x onerror=alert(1)>"}'],
    ['out of range scale', '{"textScale":99}'],
    ['negative scale', '{"textScale":-1}'],
    ['prototype pollution', '{"__proto__":{"contrast":true,"polluted":1},"constructor":{"prototype":{"polluted":2}}}'],
    ['not JSON', 'not json'],
    ['null', 'null'],
    ['array', '[1,2]'],
    ['string', '"str"'],
    ['huge value', 'x'.repeat(100000)],
  ];

  for (const [name, value] of TAMPERED) {
    test(`tampered preference (${name}) is ignored safely`, async ({ page }) => {
      const signals = trackHostileSignals(page);
      await page.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [A11Y_KEY, value]);
      await gotoApp(page);
      const state = await page.evaluate(() => ({
        classes: document.documentElement.className.trim(),
        scale: document.documentElement.style.getPropertyValue('--a11y-text-scale'),
        level: document.querySelector('#a11yLevelValue').textContent,
        polluted: ({}).polluted, contrast: ({}).contrast,
      }));
      expect(state).toEqual({ classes: '', scale: '1', level: '100%', polluted: undefined, contrast: undefined });
      await compare(page, 'still works', 'still works');
      await expect(page.locator('#similarity')).toHaveText('100.0%');
      expect(signals.errors).toEqual([]);
      expect(signals.dialogs).toEqual([]);
    });
  }

  test('only validated preference values are applied', async ({ page }) => {
    await page.addInitScript((k) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, '{"contrast":true,"font":"true","textScale":1.5}'); sessionStorage.setItem('seeded', '1'); } }, A11Y_KEY);
    await gotoApp(page);
    const classes = await page.evaluate(() => [...document.documentElement.classList]);
    expect(classes).toEqual(['a11y-contrast']);
    await expect(page.locator('#a11yLevelValue')).toHaveText('150%');
  });

  test('comparison text is never persisted to browser storage', async ({ page }) => {
    await gotoApp(page);
    await compare(page, 'CONFIDENTIAL-ALPHA customer 4111', 'CONFIDENTIAL-BETA customer 4111');
    await page.click('#a11yBtn');
    await page.click('#optTextInc');
    await page.locator('#optContrast').check({ force: true });
    await page.keyboard.press('Escape');
    await page.click('#langDe');
    const stored = await page.evaluate(async () => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
      cookie: document.cookie,
      idb: indexedDB.databases ? (await indexedDB.databases()).length : 0,
      caches: 'caches' in window ? (await caches.keys()).length : 0,
      sw: navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0,
    }));
    expect(Object.keys(stored.local)).toEqual([A11Y_KEY]);
    expect(Object.keys(JSON.parse(stored.local[A11Y_KEY])).sort())
      .toEqual(['contrast', 'font', 'headings', 'keyboard', 'links', 'motion', 'textScale']);
    expect(JSON.stringify(stored)).not.toContain('CONFIDENTIAL');
    expect(stored).toMatchObject({ session: {}, cookie: '', idb: 0, caches: 0, sw: 0 });
  });
});

test.describe('SEC-014..019 data privacy and external resources', () => {
  test('a full hostile workflow makes no network request besides the page itself', async ({ page }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.addInitScript(() => {
      window.__beacons = 0;
      const orig = navigator.sendBeacon?.bind(navigator);
      navigator.sendBeacon = (...a) => { window.__beacons++; return orig ? orig(...a) : false; };
    });
    await gotoApp(page);
    await compare(page, '<img src="http://127.0.0.2/leak.png"> secret one', '<link rel=stylesheet href="http://127.0.0.2/x.css"> secret two', { ignoreCase: true, ignorePunctuation: true });
    await dropFiles(page, '#panelA', [{ name: 'a.txt', content: 'file secret <img src=//127.0.0.2/y>' }, { name: 'b.txt', content: 'file secret' }]);
    await expect(page.locator('#summary')).toHaveClass(/show/);
    await page.click('#langDe');
    await page.click('#a11yBtn');
    await page.click('#a11yStatementBtn');
    await page.keyboard.press('Escape');
    await page.click('#resetBtn');
    await page.waitForTimeout(300);
    expect([...new Set(requests)]).toEqual([new URL('/comparinator.html', page.url()).href]);
    expect(await page.evaluate(() => window.__beacons)).toBe(0);
  });

  test('the page loads no external scripts, styles, fonts, images or frames', async ({ page }) => {
    await gotoApp(page);
    const refs = await page.evaluate(() => ({
      scripts: [...document.scripts].filter((s) => s.src).length,
      links: document.querySelectorAll('link[href]').length,
      media: document.querySelectorAll('img, iframe, object, embed, video, audio, source').length,
      resources: performance.getEntriesByType('resource').map((e) => e.name),
    }));
    expect(refs).toEqual({ scripts: 0, links: 0, media: 0, resources: [] });
    expect(APP_SOURCE).not.toMatch(/@import|url\(\s*['"]?(https?:)?\/\//i);
    expect(APP_SOURCE).not.toMatch(/<(script|link|img|iframe)[^>]+(src|href)=["']?(https?:)?\/\//i);
  });

  for (const lang of ['en', 'de']) {
    test(`SEC-019/035 trusted accessibility statement markup is limited and links are safe (${lang})`, async ({ page }) => {
      await gotoApp(page);
      if (lang === 'de') await page.click('#langDe');
      const info = await page.evaluate(() => {
        const s = document.querySelector('#a11yStatement');
        const all = [...document.querySelectorAll('a[href]')];
        return {
          tags: [...new Set([...s.querySelectorAll('*')].map((e) => e.tagName))],
          handlers: [...document.querySelectorAll('*')].flatMap((e) => [...e.attributes]).filter((a) => /^on/i.test(a.name)).map((a) => a.name),
          hrefs: all.map((a) => a.getAttribute('href')),
          blankWithoutRel: all.filter((a) => a.target === '_blank' && !/noopener/.test(a.rel)).length,
        };
      });
      for (const tag of info.tags) expect(['P', 'A', 'H3', 'H4', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'SPAN', 'BR']).toContain(tag);
      expect(info.handlers).toEqual([]);
      for (const href of info.hrefs) expect(href).toMatch(/^(#[\w-]+|mailto:[^\s]+)$/);
      expect(info.blankWithoutRel).toBe(0);
    });
  }
});

test.describe('SEC-002 / SEC-034 limits and resource exhaustion', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('the UI caps typed and pasted text at 10,000 characters', async ({ page }) => {
    await page.fill('#textA', 'a'.repeat(10050));
    await page.locator('#textB').focus();
    await page.keyboard.insertText('b'.repeat(12000));
    expect(await page.evaluate(() => [document.querySelector('#textA').value.length, document.querySelector('#textB').value.length]))
      .toEqual([10000, 10000]);
  });

  test('SEC-002 application logic rejects text over 10,000 characters that bypasses maxlength [KNOWN DEFECT SEC-F1]', async ({ page }) => {
    // A value set by script (future prefill/import/agent content, or a user who
    // strips maxlength) is not validated by compare(): the counter reads
    // "20,000 / 10,000", no error is shown and the comparison runs.
    await page.evaluate(() => {
      const a = document.querySelector('#textA');
      a.value = 'word '.repeat(4000);
      a.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.fill('#textB', 'word');
    await page.click('#compareBtn');
    const outcome = await page.evaluate(() => ({
      errorShown: !document.querySelector('#errorA').hidden,
      renderedChars: document.querySelector('#resultA').textContent.length,
    }));
    expect(outcome.errorShown || outcome.renderedChars <= 10000,
      'over-limit text must be rejected or truncated with a message').toBe(true);
  });

  const FAST_CASES = [
    ['10,000 punctuation characters, Ignore punctuation off', '!'.repeat(10000), '?'.repeat(10000), false],
    ['5,000 one-letter words with no overlap', 'a '.repeat(5000), 'b '.repeat(5000), false],
    ['2,100 words at the LCS matrix limit', Array.from({ length: 2100 }, (_, i) => `w${i % 97}`).join(' '), Array.from({ length: 2100 }, (_, i) => `w${i % 89}`).join(' '), false],
    ['one 10,000-character token', 'x'.repeat(10000), `${'x'.repeat(9999)}y`, true],
    ['10,000 newlines', '\n'.repeat(10000), `${'\n'.repeat(9999)}a`, true],
  ];
  const SLOW_CASES = [
    ['10,000 punctuation characters, Ignore punctuation on', '!'.repeat(10000), '?'.repeat(10000), true],
    ['10,000 combining marks, Ignore punctuation on', `e${'́'.repeat(9999)}`, `e${'̀'.repeat(9999)}`, true],
  ];

  async function timedCompare(page, a, b, ignorePunctuation) {
    return page.evaluate(([a, b, ip]) => {
      document.querySelector('#textA').value = a;
      document.querySelector('#textB').value = b;
      document.querySelector('#ignorePunctuation').checked = ip;
      const start = performance.now();
      document.querySelector('#compareBtn').click();
      return performance.now() - start;
    }, [a, b, ignorePunctuation]);
  }

  for (const [name, a, b, ip] of FAST_CASES) {
    test(`SEC-034 stays responsive: ${name}`, async ({ page }) => {
      const ms = await timedCompare(page, a, b, ip);
      expect(ms).toBeLessThan(2000);
      await compare(page, 'recovered', 'recovered');
      await expect(page.locator('#similarity')).toHaveText('100.0%');
    });
  }

  for (const [name, a, b, ip] of SLOW_CASES) {
    test(`SEC-034 stays responsive: ${name} [KNOWN DEFECT SEC-F2]`, async ({ page }) => {
      // classifySource() rescans the whole token list for every ignored
      // punctuation token when no neighbour has a state: O(n^2) on the main thread.
      test.setTimeout(60_000);
      const ms = await timedCompare(page, a, b, ip);
      expect(ms, `main thread blocked for ${Math.round(ms)} ms`).toBeLessThan(2000);
    });
  }

  test('100 repeated comparisons do not leak DOM nodes or error', async ({ page }) => {
    const signals = trackHostileSignals(page);
    await page.fill('#textA', 'lorem ipsum <b>dolor</b> '.repeat(300));
    await page.fill('#textB', 'lorem ipsom <i>dolor</i> '.repeat(300));
    await page.click('#compareBtn');
    const before = await page.evaluate(() => document.getElementsByTagName('*').length);
    await page.evaluate(() => { for (let i = 0; i < 100; i++) document.querySelector('#compareBtn').click(); });
    const after = await page.evaluate(() => document.getElementsByTagName('*').length);
    expect(after).toBe(before);
    expect(signals.errors).toEqual([]);
  });
});
