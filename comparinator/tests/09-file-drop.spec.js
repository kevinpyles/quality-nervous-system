const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { gotoApp, readStats, setOptions, compare } = require('./helpers');

/** Build an in-memory file for setInputFiles. */
function file(name, content, mimeType = 'text/plain') {
  return { name, mimeType, buffer: Buffer.from(content) };
}

/**
 * Drop files onto a panel. Playwright has no native file-drop API, so a
 * DataTransfer is built in the page and dispatched as dragenter + drop.
 */
async function dropFiles(page, panelSelector, files) {
  const dataTransfer = await page.evaluateHandle((list) => {
    const dt = new DataTransfer();
    for (const f of list) {
      const body = f.bytes ? new Uint8Array(f.bytes) : f.content;
      dt.items.add(new File([body], f.name, { type: f.type }));
    }
    return dt;
  }, files.map((f) => ({ name: f.name, content: f.content, bytes: f.bytes, type: f.type || 'text/plain' })));
  await page.dispatchEvent(panelSelector, 'dragenter', { dataTransfer });
  await page.dispatchEvent(panelSelector, 'drop', { dataTransfer });
}

test.describe('File drop and Choose file', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('Choose file loads text into Text A and updates the counter', async ({ page }) => {
    await page.locator('#fileA').setInputFiles(file('a.txt', 'hello file world'));
    await expect(page.locator('#textA')).toHaveValue('hello file world');
    await expect(page.locator('#counterA')).toHaveText('16 / 10,000');
    await expect(page.locator('#wordsAInline')).toContainText('3');
  });

  test('Choose file button is keyboard reachable and labelled per panel', async ({ page }) => {
    await expect(page.locator('#fileBtnA')).toHaveAttribute('aria-label', 'Choose file for Text A');
    await expect(page.locator('#fileBtnB')).toHaveAttribute('aria-label', 'Choose file for Text B');
    await page.locator('#textA').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#fileBtnA')).toBeFocused();
  });

  for (const ext of ['txt', 'js', 'html', 'css', 'py', 'TXT']) {
    test(`dropping a .${ext} file loads it`, async ({ page }) => {
      await dropFiles(page, '#panelB', [{ name: `sample.${ext}`, content: `content of ${ext}` }]);
      await expect(page.locator('#textB')).toHaveValue(`content of ${ext}`);
      await expect(page.locator('#errorB')).toBeHidden();
    });
  }

  for (const name of ['report.pdf', 'notes.docx', 'README']) {
    test(`unsupported file "${name}" shows a message and keeps the text`, async ({ page }) => {
      await page.locator('#textA').fill('keep me');
      await dropFiles(page, '#panelA', [{ name, content: 'nope' }]);
      await expect(page.locator('#errorA')).toBeVisible();
      await expect(page.locator('#errorA')).toContainText('is not a supported file type');
      await expect(page.locator('#errorA')).toContainText('.txt, .js, .html, .css, .py');
      await expect(page.locator('#textA')).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#textA')).toHaveValue('keep me');
    });
  }

  test('Choose file also rejects unsupported types', async ({ page }) => {
    await page.locator('#fileB').setInputFiles(file('image.png', 'x', 'image/png'));
    await expect(page.locator('#errorB')).toContainText('“image.png” is not a supported file type');
    await expect(page.locator('#textB')).toHaveValue('');
  });

  test('a file over 10,000 characters is rejected and existing text kept', async ({ page }) => {
    await page.locator('#textA').fill('original');
    await dropFiles(page, '#panelA', [{ name: 'big.txt', content: 'a'.repeat(10001) }]);
    await expect(page.locator('#errorA')).toContainText('too large');
    await expect(page.locator('#textA')).toHaveValue('original');
  });

  test('a file of exactly 10,000 characters is accepted', async ({ page }) => {
    await dropFiles(page, '#panelA', [{ name: 'max.txt', content: 'a'.repeat(10000) }]);
    await expect(page.locator('#textA')).toHaveValue('a'.repeat(10000));
    await expect(page.locator('#errorA')).toBeHidden();
  });

  test('dropping two files fills A and B and runs the comparison', async ({ page }) => {
    await dropFiles(page, '#panelB', [
      { name: 'expected.py', content: 'one two three' },
      { name: 'actual.py', content: 'one two four' },
    ]);
    await expect(page.locator('#textA')).toHaveValue('one two three');
    await expect(page.locator('#textB')).toHaveValue('one two four');
    await expect(page.locator('#summary')).toHaveClass(/show/);
    const stats = await readStats(page);
    expect(stats.wordCountA).toBe('3');
    expect(stats.matching).toBe('2');
  });

  test('two files are all-or-nothing when one is unsupported', async ({ page }) => {
    await dropFiles(page, '#panelA', [
      { name: 'good.txt', content: 'good' },
      { name: 'bad.exe', content: 'bad' },
    ]);
    await expect(page.locator('#textA')).toHaveValue('');
    await expect(page.locator('#errorB')).toContainText('“bad.exe”');
  });

  test('more than two files shows a message and loads nothing', async ({ page }) => {
    await dropFiles(page, '#panelA', [
      { name: '1.txt', content: '1' },
      { name: '2.txt', content: '2' },
      { name: '3.txt', content: '3' },
    ]);
    await expect(page.locator('#errorA')).toContainText('Too many files');
    await expect(page.locator('#textA')).toHaveValue('');
    await expect(page.locator('#textB')).toHaveValue('');
  });

  test('comparison auto-runs only once both fields have text', async ({ page }) => {
    await page.locator('#fileA').setInputFiles(file('a.txt', 'alpha beta'));
    await expect(page.locator('#textA')).toHaveValue('alpha beta');
    await expect(page.locator('#summary')).not.toHaveClass(/show/);
    await expect(page.locator('#similarity')).toHaveText('—');

    await page.locator('#fileB').setInputFiles(file('b.txt', 'alpha beta'));
    await expect(page.locator('#summary')).toHaveClass(/show/);
    expect((await readStats(page)).similarity).toBe('100.0%');
  });

  test('a successful load clears a previous file error', async ({ page }) => {
    await dropFiles(page, '#panelA', [{ name: 'x.pdf', content: 'x' }]);
    await expect(page.locator('#errorA')).toBeVisible();
    await dropFiles(page, '#panelA', [{ name: 'x.txt', content: 'x' }]);
    await expect(page.locator('#errorA')).toBeHidden();
    await expect(page.locator('#textA')).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('file error follows the language switch', async ({ page }) => {
    await dropFiles(page, '#panelA', [{ name: 'x.pdf', content: 'x' }]);
    await page.locator('#langDe').click();
    await expect(page.locator('#errorA')).toContainText('„x.pdf“ ist kein unterstützter Dateityp');
    await expect(page.locator('#fileBtnA')).toHaveText('Datei auswählen');
    await page.locator('#langEn').click();
    await expect(page.locator('#errorA')).toContainText('“x.pdf” is not a supported file type');
  });

  test('file error survives a language switch while results are shown', async ({ page }) => {
    await dropFiles(page, '#panelA', [
      { name: 'a.txt', content: 'same' },
      { name: 'b.txt', content: 'same' },
    ]);
    await expect(page.locator('#summary')).toHaveClass(/show/);
    await dropFiles(page, '#panelB', [{ name: 'bad.gif', content: 'x' }]);
    await page.locator('#langDe').click();
    await expect(page.locator('#errorB')).toContainText('„bad.gif“');
  });

  test('Reset clears file errors', async ({ page }) => {
    await dropFiles(page, '#panelA', [{ name: 'x.pdf', content: 'x' }]);
    await page.locator('#resetBtn').click();
    await expect(page.locator('#errorA')).toBeHidden();
  });

  test('drag-over shows the drop hint and it clears on drop', async ({ page }) => {
    const dataTransfer = await page.evaluateHandle(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['x'], 'x.txt', { type: 'text/plain' }));
      return dt;
    });
    await page.dispatchEvent('#panelA', 'dragover', { dataTransfer });
    await expect(page.locator('#panelA')).toHaveClass(/drag-over/);
    await expect(page.locator('#dropHintA')).toBeVisible();
    await page.dispatchEvent('#panelA', 'drop', { dataTransfer });
    await expect(page.locator('#panelA')).not.toHaveClass(/drag-over/);
    await expect(page.locator('#dropHintA')).toBeHidden();
  });

  test('an .html file with a script is loaded as inert text', async ({ page }) => {
    let dialogFired = false;
    page.on('dialog', async (dialog) => {
      dialogFired = true;
      await dialog.dismiss();
    });
    const payload = '<script>alert("x")</script><img src=x onerror=alert(1)>';
    await dropFiles(page, '#panelA', [
      { name: 'a.html', content: payload },
      { name: 'b.html', content: payload },
    ]);
    await expect(page.locator('#textA')).toHaveValue(payload);
    await expect(page.locator('#summary')).toHaveClass(/show/);
    await expect(page.locator('#resultA script, #resultA img')).toHaveCount(0);
    expect(dialogFired).toBe(false);
  });
});

/* ------------------------------------------------------------------------
   Gap coverage added by the drag-and-drop testing agent (see
   drag-n-drop-report.md). Drops below are simulated unless the test name
   says "trusted"; those use Chromium's Input.dispatchDragEvent with real
   files on disk, which is still not an operating-system mouse drag.
   ------------------------------------------------------------------------ */

/** Read the #appStatus live region once the delayed announcement has landed. */
async function expectStatus(page, text) {
  await expect(page.locator('#appStatus')).toContainText(text);
}

/** Dispatch a single drag event with a file or plain-text payload; returns defaultPrevented. */
async function fireDrag(page, selector, type, { kind = 'file', relatedTarget = null } = {}) {
  return page.evaluate(({ selector, type, kind, relatedTarget }) => {
    const dt = new DataTransfer();
    if (kind === 'file') dt.items.add(new File(['x'], 'x.txt', { type: 'text/plain' }));
    else dt.setData('text/plain', 'dragged words');
    const target = selector === 'body' ? document.body : document.querySelector(selector);
    const rel = relatedTarget === 'body' ? document.body : relatedTarget ? document.querySelector(relatedTarget) : null;
    const ev = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, relatedTarget: rel });
    target.dispatchEvent(ev);
    return ev.defaultPrevented;
  }, { selector, type, kind, relatedTarget });
}

test.describe('File drop — edge cases (DND gap coverage)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  // DND-04 / DND-05 — tricky names
  for (const name of ['notes.txt.exe', '.txt', 'trailingdot.', 'readme.md', 'data.json', 'photo.png', 'setup.exe']) {
    test(`tricky unsupported name "${name}" is rejected and names the file`, async ({ page }) => {
      await page.locator('#textA').fill('keep me');
      await dropFiles(page, '#panelA', [{ name, content: 'nope' }]);
      await expect(page.locator('#errorA')).toContainText(`“${name}” is not a supported file type`);
      await expect(page.locator('#textA')).toHaveValue('keep me');
      await expect(page.locator('#textA')).toHaveAttribute('aria-invalid', 'true');
    });
  }

  for (const name of ['archive.tar.txt', 'my notes ünïcödé 文件.txt', 'script.JS', 'Style.CsS', 'page.HTML', 'tool.Py']) {
    test(`supported name "${name}" is accepted`, async ({ page }) => {
      await page.locator('#textA').fill('old text');
      await dropFiles(page, '#panelA', [{ name, content: 'new text' }]);
      await expect(page.locator('#textA')).toHaveValue('new text');
      await expect(page.locator('#errorA')).toBeHidden();
      await expectStatus(page, `Loaded “${name}” into Text A.`);
    });
  }

  test('unicode and spaces in a rejected file name are shown verbatim', async ({ page }) => {
    await dropFiles(page, '#panelB', [{ name: 'Bericht Übersicht 2026 ✓.pdf', content: 'x' }]);
    await expect(page.locator('#errorB')).toContainText('“Bericht Übersicht 2026 ✓.pdf”');
  });

  // Edge-case content
  test('an empty file replaces existing text and does not compare', async ({ page }) => {
    await page.locator('#textA').fill('old');
    await page.locator('#textB').fill('other side');
    await dropFiles(page, '#panelA', [{ name: 'empty.txt', content: '' }]);
    await expect(page.locator('#textA')).toHaveValue('');
    await expect(page.locator('#counterA')).toHaveText('0 / 10,000');
    await expect(page.locator('#summary')).not.toHaveClass(/show/);
    await expectStatus(page, 'Loaded “empty.txt” into Text A.');
  });

  test('a whitespace-only file loads but does not trigger the comparison', async ({ page }) => {
    await page.locator('#textB').fill('other side');
    await dropFiles(page, '#panelA', [{ name: 'ws.txt', content: '   \n\t  ' }]);
    await expect(page.locator('#textA')).toHaveValue('   \n\t  ');
    await expect(page.locator('#wordsAInline')).toContainText('0');
    await expect(page.locator('#summary')).not.toHaveClass(/show/);
  });

  test('a file of 9,999 characters is accepted', async ({ page }) => {
    await dropFiles(page, '#panelA', [{ name: 'n.txt', content: 'a'.repeat(9999) }]);
    await expect(page.locator('#counterA')).toHaveText('9,999 / 10,000');
  });

  test('the size limit counts characters, not bytes (10,000 accented characters = 20,000 bytes)', async ({ page }) => {
    await dropFiles(page, '#panelA', [{ name: 'accents.txt', content: 'é'.repeat(10000) }]);
    await expect(page.locator('#errorA')).toBeHidden();
    await expect(page.locator('#counterA')).toHaveText('10,000 / 10,000');
    await page.locator('#textA').fill('reset');
    await dropFiles(page, '#panelA', [{ name: 'accents2.txt', content: 'é'.repeat(10001) }]);
    await expect(page.locator('#errorA')).toContainText('too large');
    await expect(page.locator('#textA')).toHaveValue('reset');
  });

  test('emoji file at the limit (5,000 emoji = 10,000 UTF-16 units) is accepted and counted like the counter', async ({ page }) => {
    // The app measures length in UTF-16 code units, matching the textarea
    // counter and maxlength. See report observation O-1.
    await dropFiles(page, '#panelA', [{ name: 'emoji.txt', content: '😀'.repeat(5000) }]);
    await expect(page.locator('#errorA')).toBeHidden();
    await expect(page.locator('#counterA')).toHaveText('10,000 / 10,000');
  });

  test('a Windows (CRLF) file loads with line breaks intact', async ({ page }) => {
    await dropFiles(page, '#panelA', [{ name: 'crlf.txt', content: 'line one\r\nline two\r\n' }]);
    await expect(page.locator('#textA')).toHaveValue('line one\nline two\n');
    await expect(page.locator('#wordsAInline')).toContainText('4');
  });

  test('a very long single line loads', async ({ page }) => {
    const line = 'word '.repeat(2000).trim();
    await dropFiles(page, '#panelA', [{ name: 'long.txt', content: line }, { name: 'long2.txt', content: line }]);
    await expect(page.locator('#textA')).toHaveValue(line);
    await expect(page.locator('#similarity')).toHaveText('100.0%');
  });

  test('a .txt file with binary content loads as inert text without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await dropFiles(page, '#panelA', [{ name: 'bin.txt', bytes: [0, 255, 254, 1, 2, 0x89, 0x50, 0x4e, 0x47, 0, 13, 10] }]);
    await expect(page.locator('#errorA')).toBeHidden();
    await expect(page.locator('#textA')).not.toHaveValue('');
    expect(errors).toEqual([]);
  });

  test('a file that cannot be read shows the read error and keeps the text', async ({ page }) => {
    await page.locator('#textA').fill('keep');
    await page.evaluate(() => { File.prototype.text = () => Promise.reject(new Error('boom')); });
    await dropFiles(page, '#panelA', [{ name: 'locked.txt', content: 'x' }]);
    await expect(page.locator('#errorA')).toContainText('“locked.txt” could not be read');
    await expect(page.locator('#textA')).toHaveValue('keep');
    await expectStatus(page, 'could not be read');
  });

  // DND-02 / DND-07 — multiple files
  test('two invalid files load nothing and report the first one', async ({ page }) => {
    await page.locator('#textA').fill('a stays');
    await page.locator('#textB').fill('b stays');
    await dropFiles(page, '#panelB', [
      { name: 'one.pdf', content: 'x' },
      { name: 'two.exe', content: 'y' },
    ]);
    await expect(page.locator('#textA')).toHaveValue('a stays');
    await expect(page.locator('#textB')).toHaveValue('b stays');
    await expect(page.locator('#errorA')).toContainText('“one.pdf”');
  });

  test('two files where the second is too large load nothing', async ({ page }) => {
    await dropFiles(page, '#panelA', [
      { name: 'ok.txt', content: 'fine' },
      { name: 'huge.txt', content: 'x'.repeat(10001) },
    ]);
    await expect(page.locator('#textA')).toHaveValue('');
    await expect(page.locator('#textB')).toHaveValue('');
    await expect(page.locator('#errorB')).toContainText('“huge.txt” is too large');
  });

  test('a single file dropped on B fills only B', async ({ page }) => {
    await page.locator('#textA').fill('untouched');
    await dropFiles(page, '#panelB', [{ name: 'b.txt', content: 'bee' }]);
    await expect(page.locator('#textA')).toHaveValue('untouched');
    await expect(page.locator('#textB')).toHaveValue('bee');
  });

  // DND-08 / DND-18 — auto-compare
  test('loading into A while B has typed text compares', async ({ page }) => {
    await page.locator('#textB').fill('alpha beta');
    await dropFiles(page, '#panelA', [{ name: 'a.txt', content: 'alpha gamma' }]);
    await expect(page.locator('#summary')).toHaveClass(/show/);
    expect((await readStats(page)).matching).toBe('1');
  });

  test('loading over existing results refreshes them', async ({ page }) => {
    await compare(page, 'one two', 'one two');
    await expect(page.locator('#similarity')).toHaveText('100.0%');
    await dropFiles(page, '#panelB', [{ name: 'b.txt', content: 'three four' }]);
    await expect(page.locator('#similarity')).toHaveText('0.0%');
    await expect(page.locator('#resultB')).toContainText('three four');
  });

  test('auto-compare respects Ignore case and Ignore punctuation', async ({ page }) => {
    await setOptions(page, { ignoreCase: true, ignorePunctuation: true });
    await dropFiles(page, '#panelA', [
      { name: 'a.txt', content: 'Hello, World!' },
      { name: 'b.txt', content: 'hello world' },
    ]);
    await expect(page.locator('#similarity')).toHaveText('100.0%');
  });

  for (const opts of [{}, { ignoreCase: true, ignorePunctuation: true }]) {
    test(`file results match pasted results (${JSON.stringify(opts)})`, async ({ page }) => {
      const A = 'The quick, brown Fox jumps.\nover the lazy dog';
      const B = 'the quick brown fox jumped over a lazy dog!';
      const snapshot = () => page.evaluate(() =>
        ['similarity', 'accuracy', 'wordCountA', 'wordCountB', 'matching', 'different', 'missingAdded', 'resultA', 'resultB', 'summary']
          .map((id) => document.getElementById(id).innerHTML).join('\n'));
      await setOptions(page, opts);
      await compare(page, A, B);
      const pasted = await snapshot();
      await gotoApp(page);
      await setOptions(page, opts);
      await dropFiles(page, '#panelA', [{ name: 'a.txt', content: A }, { name: 'b.txt', content: B }]);
      await expect(page.locator('#summary')).toHaveClass(/show/);
      expect(await snapshot()).toBe(pasted);
    });
  }

  // DND-10 — errors stay on their own field
  // FINDING F-1: compare() re-validates both fields and wipes a file error on
  // the other field, so an unresolved "unsupported file" message on Text B
  // disappears when Text A is loaded. Expected: B's file error stays until B
  // itself changes. Remove test.fail() once fixed.
  test('a file error on B survives a successful auto-compare load into A', async ({ page }) => {
    test.fail(true, 'F-1: auto-compare clears the file error on the other field');
    await page.locator('#textB').fill('bee text');
    await dropFiles(page, '#panelB', [{ name: 'bad.gif', content: 'x' }]);
    await expect(page.locator('#errorB')).toBeVisible();
    await dropFiles(page, '#panelA', [{ name: 'a.txt', content: 'ay text' }]);
    await expect(page.locator('#summary')).toHaveClass(/show/);
    await expect(page.locator('#errorB')).toContainText('“bad.gif”', { timeout: 1000 });
  });

  // FINDING F-1 (second path): toggling a comparison option re-runs compare()
  // and clears the file error, although the language switch preserves it.
  test('a file error survives toggling Ignore case while results are shown', async ({ page }) => {
    test.fail(true, 'F-1: option-triggered re-compare clears the file error');
    await dropFiles(page, '#panelA', [{ name: 'a.txt', content: 'Same' }, { name: 'b.txt', content: 'same' }]);
    await expect(page.locator('#summary')).toHaveClass(/show/);
    await dropFiles(page, '#panelB', [{ name: 'bad.gif', content: 'x' }]);
    await expect(page.locator('#errorB')).toBeVisible();
    await page.locator('#ignoreCase').check();
    await expect(page.locator('#similarity')).toHaveText('100.0%');
    await expect(page.locator('#errorB')).toContainText('“bad.gif”', { timeout: 1000 });
  });

  // DND-11 / DND-12 / DND-16 — drag feedback and browser defaults
  test('dragleave into a child keeps the outline; leaving the panel clears outline and hint', async ({ page }) => {
    await fireDrag(page, '#panelA', 'dragenter');
    await expect(page.locator('#panelA')).toHaveClass(/drag-over/);
    await expect(page.locator('#dropHintA')).toBeVisible();
    await expect(page.locator('#dropHintA')).toHaveText('Drop a file to load it into Text A');
    await fireDrag(page, '#textA', 'dragleave', { relatedTarget: '#fileBtnA' });
    await expect(page.locator('#panelA')).toHaveClass(/drag-over/);
    await fireDrag(page, '#panelA', 'dragleave', { relatedTarget: 'body' });
    await expect(page.locator('#panelA')).not.toHaveClass(/drag-over/);
    await expect(page.locator('#dropHintA')).toBeHidden();
  });

  test('drag state is shown with a dashed outline and hint text on panel B', async ({ page }) => {
    await fireDrag(page, '#panelB', 'dragover');
    await expect(page.locator('#panelB')).toHaveCSS('outline-style', 'dashed');
    await expect(page.locator('#dropHintB')).toHaveText('Drop a file to load it into Text B');
    await expect(page.locator('#panelA')).not.toHaveClass(/drag-over/);
  });

  test('a file dropped outside the panels is prevented from navigating', async ({ page }) => {
    expect(await fireDrag(page, 'body', 'dragover')).toBe(true);
    expect(await fireDrag(page, 'body', 'drop')).toBe(true);
    expect(await fireDrag(page, '.compare-row', 'drop')).toBe(true);
    await expect(page).toHaveURL(/comparinator\.html$/);
  });

  test('dragging plain text keeps the browser default and shows no drop state', async ({ page }) => {
    expect(await fireDrag(page, '#panelB', 'dragenter', { kind: 'text' })).toBe(false);
    await expect(page.locator('#panelB')).not.toHaveClass(/drag-over/);
    expect(await fireDrag(page, '#textB', 'dragover', { kind: 'text' })).toBe(false);
    expect(await fireDrag(page, '#textB', 'drop', { kind: 'text' })).toBe(false);
    expect(await fireDrag(page, 'body', 'drop', { kind: 'text' })).toBe(false);
    await expect(page.locator('#errorB')).toBeHidden();
  });

  test('Reset clears the drag-over state and hint', async ({ page }) => {
    await fireDrag(page, '#panelA', 'dragover');
    await fireDrag(page, '#panelB', 'dragover');
    await expect(page.locator('.drag-over')).toHaveCount(2);
    await page.locator('#resetBtn').click();
    await expect(page.locator('.drag-over')).toHaveCount(0);
    await expect(page.locator('#dropHintA')).toBeHidden();
    await expect(page.locator('#dropHintB')).toBeHidden();
  });

  test('trusted Chromium drag with real files: hover state, drag away, drop loads', async ({ page }, testInfo) => {
    const fileA = testInfo.outputPath('trusted-a.txt');
    const fileB = testInfo.outputPath('trusted-b.txt');
    fs.writeFileSync(fileA, 'from disk alpha');
    fs.writeFileSync(fileB, 'from disk beta');
    // Drag coordinates must be inside the viewport, so make both panels fit.
    await page.setViewportSize({ width: 1280, height: 1200 });
    await page.locator('#panelA').scrollIntoViewIfNeeded();
    const cdp = await page.context().newCDPSession(page);
    const drag = (type, pt, files) =>
      cdp.send('Input.dispatchDragEvent', { type, x: pt.x, y: pt.y, data: { items: [], files, dragOperationsMask: 1 } });
    const centre = async (sel) => {
      const b = await page.locator(sel).boundingBox();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    const outside = { x: 5, y: 5 };
    const ta = await centre('#textA');

    await drag('dragEnter', outside, [fileA]);
    await drag('dragOver', ta, [fileA]);
    await expect(page.locator('#panelA')).toHaveClass(/drag-over/);
    await expect(page.locator('#dropHintA')).toBeVisible();
    await drag('dragOver', await centre('#fileBtnA'), [fileA]);
    await expect(page.locator('#panelA')).toHaveClass(/drag-over/);
    await drag('dragOver', outside, [fileA]);
    await expect(page.locator('#panelA')).not.toHaveClass(/drag-over/);
    await drag('drop', outside, [fileA]);
    await expect(page.locator('#textA')).toHaveValue('');

    const tb = await centre('#textB');
    await drag('dragEnter', tb, [fileA, fileB]);
    await drag('dragOver', tb, [fileA, fileB]);
    await drag('drop', tb, [fileA, fileB]);
    await expect(page.locator('#textA')).toHaveValue('from disk alpha');
    await expect(page.locator('#textB')).toHaveValue('from disk beta');
    await expect(page.locator('#panelB')).not.toHaveClass(/drag-over/);
    await expect(page.locator('#summary')).toHaveClass(/show/);
    await expect(page).toHaveURL(/comparinator\.html$/);
  });

  // DND-13 — Choose file
  test('Enter and Space on Choose file open the matching file picker', async ({ page }) => {
    // Stub input.click() so no native dialog is opened.
    await page.evaluate(() => {
      window.__opened = [];
      for (const id of ['fileA', 'fileB']) document.getElementById(id).click = () => window.__opened.push(id);
    });
    await page.locator('#fileBtnA').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await page.locator('#fileBtnB').focus();
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => window.__opened)).toEqual(['fileA', 'fileA', 'fileB']);
  });

  test('Tab order places each Choose file button after its text field', async ({ page }) => {
    await page.locator('#textA').focus();
    const order = [];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(() => document.activeElement.id));
    }
    expect(order).toEqual(['fileBtnA', 'textB', 'fileBtnB']);
  });

  test('choosing the same file twice in a row loads it again', async ({ page }) => {
    const f = file('same.txt', 'first version');
    await page.locator('#fileA').setInputFiles(f);
    await expect(page.locator('#textA')).toHaveValue('first version');
    await page.locator('#textA').fill('edited by hand');
    await page.locator('#fileA').setInputFiles(f);
    await expect(page.locator('#textA')).toHaveValue('first version');
  });

  test('Choose file rejects an oversized file and keeps the text', async ({ page }) => {
    await page.locator('#textB').fill('keep');
    await page.locator('#fileB').setInputFiles(file('big.py', 'x'.repeat(10001)));
    await expect(page.locator('#errorB')).toContainText('“big.py” is too large');
    await expect(page.locator('#textB')).toHaveValue('keep');
  });

  test('Choose file accepts an upper-case extension', async ({ page }) => {
    await page.locator('#fileB').setInputFiles(file('UPPER.CSS', 'body{}', 'text/css'));
    await expect(page.locator('#textB')).toHaveValue('body{}');
  });

  test('Choose file inputs restrict the picker to supported types', async ({ page }) => {
    for (const id of ['#fileA', '#fileB']) {
      await expect(page.locator(id)).toHaveAttribute('accept', '.txt,.js,.html,.css,.py');
    }
  });

  // DND-13 / DND-14 — accessibility
  test('Choose file accessible names contain the visible label', async ({ page }) => {
    for (const [lang, visible] of [['#langEn', 'Choose file'], ['#langDe', 'Datei auswählen']]) {
      await page.locator(lang).click();
      for (const [btn, field] of [['#fileBtnA', 'Text A'], ['#fileBtnB', 'Text B']]) {
        await expect(page.locator(btn)).toHaveText(visible);
        const name = await page.locator(btn).getAttribute('aria-label');
        expect(name.startsWith(visible)).toBe(true);
        expect(name).toContain(field);
      }
    }
    await expect(page.getByRole('button', { name: 'Datei auswählen für Text B' })).toBeVisible();
  });

  test('file errors are linked to their field through aria-describedby', async ({ page }) => {
    await dropFiles(page, '#panelA', [{ name: 'a.pdf', content: 'x' }]);
    await dropFiles(page, '#panelB', [{ name: 'b.pdf', content: 'x' }]);
    for (const k of ['A', 'B']) {
      const ids = (await page.locator(`#text${k}`).getAttribute('aria-describedby')).split(/\s+/);
      expect(ids).toContain(`error${k}`);
      await expect(page.locator(`#error${k}`)).toBeVisible();
    }
    await expect(page.locator('#textB')).toHaveAccessibleDescription(/“b\.pdf” is not a supported file type/);
  });

  test('the status region announces loads, auto-compare and failures', async ({ page }) => {
    await expect(page.locator('#appStatus')).toHaveAttribute('role', 'status');
    await dropFiles(page, '#panelA', [{ name: 'a.txt', content: 'one' }]);
    await expect(page.locator('#appStatus')).toHaveText('Loaded “a.txt” into Text A.');
    await dropFiles(page, '#panelB', [{ name: 'b.txt', content: 'one' }]);
    await expectStatus(page, 'Loaded “b.txt” into Text B. Comparison complete.');
    await dropFiles(page, '#panelB', [{ name: 'c.docx', content: 'x' }]);
    await expect(page.locator('#appStatus')).toHaveText('“c.docx” is not a supported file type. Supported types: .txt, .js, .html, .css, .py.');
    await dropFiles(page, '#panelA', [{ name: 'd.txt', content: 'x'.repeat(10001) }]);
    await expectStatus(page, '“d.txt” is too large.');
    await dropFiles(page, '#panelA', [{ name: '1.txt', content: '1' }, { name: '2.txt', content: '2' }, { name: '3.txt', content: '3' }]);
    await expectStatus(page, 'Too many files.');
  });

  test('two-file load announces both files', async ({ page }) => {
    await dropFiles(page, '#panelB', [{ name: 'x.js', content: 'let a' }, { name: 'y.js', content: 'let b' }]);
    await expectStatus(page, 'Loaded “x.js” into Text A. Loaded “y.js” into Text B. Comparison complete.');
  });

  // DND-15 — German
  test('German: drop hint, supported-types hint, success and failure messages', async ({ page }) => {
    await page.locator('#langDe').click();
    await fireDrag(page, '#panelB', 'dragover');
    await expect(page.locator('#dropHintB')).toHaveText('Datei hier ablegen, um sie in Text B zu laden');
    await expect(page.locator('#fileTypesA')).toContainText('Unterstützt: .txt, .js, .html, .css, .py.');
    await dropFiles(page, '#panelA', [{ name: 'a.txt', content: 'eins' }]);
    await expect(page.locator('#appStatus')).toHaveText('„a.txt“ in Text A geladen.');
    await dropFiles(page, '#panelA', [{ name: 'gross.txt', content: 'x'.repeat(10001) }]);
    await expect(page.locator('#errorA')).toHaveText('„gross.txt“ ist zu groß. Dateien dürfen höchstens 10.000 Zeichen enthalten.');
    await dropFiles(page, '#panelB', [{ name: '1.txt', content: '1' }, { name: '2.txt', content: '2' }, { name: '3.txt', content: '3' }]);
    await expect(page.locator('#errorB')).toContainText('Zu viele Dateien.');
    await expectStatus(page, 'Zu viele Dateien.');
  });

  test('German auto-compare announcement is fully German', async ({ page }) => {
    await page.locator('#langDe').click();
    await dropFiles(page, '#panelA', [{ name: 'a.txt', content: 'eins' }, { name: 'b.txt', content: 'eins' }]);
    await expectStatus(page, '„b.txt“ in Text B geladen. Vergleich abgeschlossen.');
  });

  test('too-large error switches language with the page and back', async ({ page }) => {
    await dropFiles(page, '#panelB', [{ name: 'big.txt', content: 'x'.repeat(10001) }]);
    await page.locator('#langDe').click();
    await expect(page.locator('#errorB')).toContainText('„big.txt“ ist zu groß');
    await page.locator('#langEn').click();
    await expect(page.locator('#errorB')).toContainText('“big.txt” is too large');
  });

  // DND-17 — security
  test('a .js file with javascript: URLs and handlers is rendered as plain text', async ({ page }) => {
    let dialogFired = false;
    page.on('dialog', async (d) => { dialogFired = true; await d.dismiss(); });
    const payload = '<a href="javascript:alert(1)">x</a><svg onload=alert(2)></svg><iframe src="javascript:alert(3)"></iframe>';
    await dropFiles(page, '#panelA', [
      { name: 'evil.js', content: payload },
      { name: 'evil2.html', content: `<script>alert(4)</script>${payload}` },
    ]);
    await expect(page.locator('#summary')).toHaveClass(/show/);
    await expect(page.locator('#resultA a, #resultA svg, #resultA iframe, #resultB script, #resultB img, #resultB a, #resultB svg, #resultB iframe')).toHaveCount(0);
    await expect(page.locator('#resultA')).toContainText('javascript:alert(1)');
    await expect(page.locator('#resultB')).toContainText('<script>alert(4)</script>');
    await expect(page.locator('#summary script, #summary img')).toHaveCount(0);
    expect(dialogFired).toBe(false);
  });

  test('a malicious file name is shown as text in the error message', async ({ page }) => {
    let dialogFired = false;
    page.on('dialog', async (d) => { dialogFired = true; await d.dismiss(); });
    const name = '<img src=x onerror=alert(1)>.pdf';
    await dropFiles(page, '#panelA', [{ name, content: 'x' }]);
    await expect(page.locator('#errorA')).toContainText(name);
    await expect(page.locator('#errorA img')).toHaveCount(0);
    await expect(page.locator('#appStatus img')).toHaveCount(0);
    expect(dialogFired).toBe(false);
  });
});

/* ------------------------------------------------------------------------
   Re-verification pass (reports/agents/drag-n-drop-report.md). Covers items
   the first pass listed as untested or only seen in code. All drops here are
   simulated DataTransfer events, not operating-system drags.
   ------------------------------------------------------------------------ */
test.describe('File drop — re-verification additions', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  // DND-01: a real drop targets the element under the pointer (textarea,
  // hint, button) and must bubble to the right panel.
  test('a drop on a child element (textarea, Choose file button) loads into that panel', async ({ page }) => {
    await dropFiles(page, '#textA', [{ name: 'a.txt', content: 'into a' }]);
    await expect(page.locator('#textA')).toHaveValue('into a');
    await dropFiles(page, '#fileBtnB', [{ name: 'b.txt', content: 'into b' }]);
    await expect(page.locator('#textB')).toHaveValue('into b');
    await expect(page.locator('#textA')).toHaveValue('into a');
    await expect(page.locator('.drag-over')).toHaveCount(0);
  });

  // DND-11: Safari has historically sent dragleave with relatedTarget = null
  // while still inside the element. The outline may drop for one event but the
  // next dragover (fired continuously while hovering) must restore it.
  test('drag state recovers on the next dragover after a dragleave with no relatedTarget', async ({ page }) => {
    await fireDrag(page, '#panelB', 'dragenter');
    await fireDrag(page, '#textB', 'dragenter');
    await fireDrag(page, '#panelB', 'dragleave');
    await fireDrag(page, '#textB', 'dragover');
    await expect(page.locator('#panelB')).toHaveClass(/drag-over/);
    await expect(page.locator('#dropHintB')).toBeVisible();
  });

  // DND-12: URL / HTML drags from other tabs or apps are not files and keep
  // the browser default.
  test('a link or HTML drag (no files) is not intercepted and shows no drop state', async ({ page }) => {
    const prevented = await page.evaluate(() => {
      const out = [];
      for (const [el, type] of [[panelA, 'dragenter'], [textA, 'dragover'], [textA, 'drop'], [document.body, 'drop']]) {
        const dt = new DataTransfer();
        dt.setData('text/uri-list', 'https://example.com/a.txt');
        dt.setData('text/html', '<a href="https://example.com/a.txt">a.txt</a>');
        const ev = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
        el.dispatchEvent(ev);
        out.push(ev.defaultPrevented);
      }
      return out;
    });
    expect(prevented).toEqual([false, false, false, false]);
    await expect(page.locator('#panelA')).not.toHaveClass(/drag-over/);
    await expect(page.locator('#errorA')).toBeHidden();
  });

  // DND-07: a failed pair must also leave existing results untouched.
  test('a failed two-file drop leaves existing text and results unchanged', async ({ page }) => {
    await compare(page, 'alpha beta', 'alpha gamma');
    const before = await readStats(page);
    const resultA = await page.locator('#resultA').innerHTML();
    await dropFiles(page, '#panelA', [{ name: 'x.txt', content: 'zzz' }, { name: 'y.docx', content: 'zzz' }]);
    await expect(page.locator('#errorB')).toContainText('“y.docx”');
    await expect(page.locator('#textA')).toHaveValue('alpha beta');
    await expect(page.locator('#textB')).toHaveValue('alpha gamma');
    expect(await readStats(page)).toEqual(before);
    expect(await page.locator('#resultA').innerHTML()).toBe(resultA);
  });

  // DND-06: a multi-megabyte file is rejected promptly and does not hang the page.
  test('a 20 MB file with a supported extension is rejected promptly', async ({ page }) => {
    await page.locator('#textA').fill('keep');
    const ms = await page.evaluate(async () => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(20 * 1024 * 1024).fill(97)], 'huge.txt'));
      const t0 = performance.now();
      panelA.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      while (errorA.hidden) await new Promise((r) => setTimeout(r, 5));
      return performance.now() - t0;
    });
    expect(ms).toBeLessThan(3000);
    await expect(page.locator('#errorA')).toContainText('“huge.txt” is too large');
    await expect(page.locator('#textA')).toHaveValue('keep');
  });

  // DND-15: remaining German error texts and announcements.
  test('German: unsupported-type and read errors are shown and announced in German', async ({ page }) => {
    await page.locator('#langDe').click();
    await page.locator('#textA').fill('behalten');
    await dropFiles(page, '#panelA', [{ name: 'Bericht.pdf', content: 'x' }]);
    await expect(page.locator('#errorA')).toHaveText('„Bericht.pdf“ ist kein unterstützter Dateityp. Unterstützte Typen: .txt, .js, .html, .css, .py.');
    await expectStatus(page, '„Bericht.pdf“ ist kein unterstützter Dateityp.');
    await page.evaluate(() => { File.prototype.text = () => Promise.reject(new Error('boom')); });
    await dropFiles(page, '#panelB', [{ name: 'kaputt.txt', content: 'x' }]);
    await expect(page.locator('#errorB')).toHaveText('„kaputt.txt“ konnte nicht gelesen werden. Versuchen Sie es erneut oder wählen Sie eine andere Datei.');
    await expectStatus(page, '„kaputt.txt“ konnte nicht gelesen werden.');
    await expect(page.locator('#textA')).toHaveValue('behalten');
  });

  test('a "Too many files" error switches language while results are shown', async ({ page }) => {
    await compare(page, 'one two', 'one three');
    await expect(page.locator('#summary')).toHaveClass(/show/);
    await dropFiles(page, '#panelA', [1, 2, 3].map((i) => ({ name: `${i}.txt`, content: String(i) })));
    await expect(page.locator('#errorA')).toContainText('Too many files.');
    await page.locator('#langDe').click();
    await expect(page.locator('#errorA')).toContainText('Zu viele Dateien.');
    await expect(page.locator('#textA')).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#langEn').click();
    await expect(page.locator('#errorA')).toContainText('Too many files.');
  });

  // FINDING F-1 (third path, previously seen only in code): clicking Compare
  // wipes an unresolved file error on a non-empty field.
  test('a file error survives clicking Compare', async ({ page }) => {
    test.fail(true, 'F-1: Compare re-validation clears the file error');
    await page.locator('#textA').fill('ay text');
    await page.locator('#textB').fill('bee text');
    await dropFiles(page, '#panelB', [{ name: 'bad.gif', content: 'x' }]);
    await expect(page.locator('#errorB')).toBeVisible();
    await page.locator('#compareBtn').click();
    await expect(page.locator('#summary')).toHaveClass(/show/);
    await expect(page.locator('#errorB')).toContainText('“bad.gif”', { timeout: 1000 });
  });
});
