// Shared helpers for Comparinator Playwright tests.

/** Navigate to the app fresh. */
async function gotoApp(page) {
  await page.goto('/comparinator.html');
}

/** Set the Ignore case / Ignore punctuation checkboxes to an exact desired state. */
async function setOptions(page, { ignoreCase = false, ignorePunctuation = false } = {}) {
  const ic = page.locator('#ignoreCase');
  const ip = page.locator('#ignorePunctuation');
  if ((await ic.isChecked()) !== ignoreCase) await ic.setChecked(ignoreCase);
  if ((await ip.isChecked()) !== ignorePunctuation) await ip.setChecked(ignorePunctuation);
}

/** Fill Text A / Text B, optionally set options, then click Compare. */
async function compare(page, a, b, opts) {
  await page.locator('#textA').fill(a);
  await page.locator('#textB').fill(b);
  if (opts) await setOptions(page, opts);
  await page.locator('#compareBtn').click();
}

/** Read the stats panel into a plain object for easy assertions. */
async function readStats(page) {
  const text = async (id) => (await page.locator(id).textContent()).trim();
  return {
    similarity: await text('#similarity'),
    accuracy: await text('#accuracy'),
    wordCountA: await text('#wordCountA'),
    wordCountB: await text('#wordCountB'),
    matching: await text('#matching'),
    different: await text('#different'),
    missingAdded: await text('#missingAdded'),
  };
}

/** Parse a "NN.N%" stat string into a number. */
function pct(value) {
  return parseFloat(value.replace('%', ''));
}

/**
 * Toggle dark mode. The #darkMode checkbox is visually hidden (opacity: 0)
 * behind a custom `.slider` switch, so a direct `.check()`/`.click()` on the
 * input gets blocked by Playwright's actionability check ("element is not
 * visible" / intercepted by the slider). Clicking the wrapping <label> is
 * how a real user activates it, and it forwards the click to the input.
 */
async function toggleDarkMode(page) {
  await page.locator('label.theme-toggle').click();
}

module.exports = { gotoApp, setOptions, compare, readStats, pct, toggleDarkMode };
