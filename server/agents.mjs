/* ============================================================
   QNS Sensor Agents — real Playwright checks against the
   app under test, plus controlled-proof sabotage injectors.

   Every agent receives ctx:
     { page, context, targetUrl, saveEvidence, attachNote, consoleLog }
   and returns:
     { status: 'pass'|'fail'|'degraded', finding, impact,
       recommendedAction, details: [], confidence, extra? }
   The engine normalizes this into the signal contract.

   2026-09-03: rewritten against the retargeted app under test (see
   catalog.mjs) — real selectors, real feature set. Two V13 agents
   (export-behavior, render-modes) are gone with the features they
   tested; several are new (options, counters/guardrails, reset,
   dark mode, i18n, injection safety) because the new build actually
   has them.
   ============================================================ */

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { identifyControl } from './control-identity.mjs';
import { APP_UNDER_TEST } from './catalog.mjs';
import { CONFIG } from './config.mjs';

const require = createRequire(import.meta.url);

/* ---------- controlled-proof sabotage injectors ----------
   Applied via addInitScript BEFORE the app boots. Each seeds a
   realistic defect the paired agent must catch. */
export const SABOTAGES = {
  blockCompare: () => {
    window.addEventListener('DOMContentLoaded', () => {
      const btn = document.getElementById('compareBtn');
      if (!btn) return;
      btn.addEventListener('click', (e) => { e.stopImmediatePropagation(); e.preventDefault(); }, true);
      btn.setAttribute('data-qns-seeded-defect', 'blocked-action');
    });
  },
  // This app formats every percentage via Number.prototype.toFixed(1) (see
  // fmtPercent in comparinator.html) rather than Math.round, so the skew
  // has to hook the method it actually calls.
  skewMetrics: () => {
    const real = Number.prototype.toFixed;
    Number.prototype.toFixed = function (digits) {
      return real.call(Math.max(0, this - 7), digits);
    };
    window.__qnsSeededDefect = 'metric-skew';
  },
  breakReset: () => {
    window.addEventListener('DOMContentLoaded', () => {
      const btn = document.getElementById('resetBtn');
      if (!btn) return;
      btn.addEventListener('click', (e) => { e.stopImmediatePropagation(); e.preventDefault(); }, true);
      btn.setAttribute('data-qns-seeded-defect', 'blocked-reset');
    });
  },
  swallowKeys: () => {
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      if ((e.key === 'Enter' || e.key === ' ') && t && t.id === 'compareBtn') {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);
    window.__qnsSeededDefect = 'keyboard-swallow';
  },
};

/* ---------- shared helpers ---------- */
const SEED_A = 'the quick brown fox jumps over the lazy dog';
const SEED_B = 'the quick red fox leaps over the sleepy dog';

async function boot(ctx) {
  const started = Date.now();
  await ctx.page.goto(ctx.targetUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });
  return Date.now() - started;
}

async function runCompare(page, a, b, opts = {}) {
  await page.fill('#textA', a);
  await page.fill('#textB', b);
  if (opts.ignoreCase !== undefined) await page.setChecked('#ignoreCase', opts.ignoreCase);
  if (opts.ignorePunctuation !== undefined) await page.setChecked('#ignorePunctuation', opts.ignorePunctuation);
  await page.click('#compareBtn');
}

async function readStats(page) {
  const text = async (id) => (await page.textContent(id) || '').trim();
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

/* ============================================================ */
export async function runAvailability(ctx) {
  const details = [];
  let bootMs;
  try {
    bootMs = await boot(ctx);
    details.push(`Target responded and DOM was interactive in ${bootMs}ms`);
  } catch (err) {
    return {
      status: 'fail',
      finding: `Target unreachable at ${ctx.targetUrl}: ${err.message.split('\n')[0]}`,
      impact: 'Nothing can be tested or verified; the app under test is down or not being served.',
      recommendedAction: `Start the ${APP_UNDER_TEST.name} target server, then rerun the availability sensor.`,
      details, confidence: 0.98,
    };
  }
  const title = await ctx.page.title();
  const h1 = (await ctx.page.textContent('h1').catch(() => '')) || '';
  await ctx.saveEvidence('screenshot', 'target-boot');
  // Builds may add a subtitle ("Comparinator — Text Comparison Tool"), so the
  // title only has to lead with the app name.
  if (!title.startsWith(APP_UNDER_TEST.name) || !h1.includes(APP_UNDER_TEST.name)) {
    return {
      status: 'fail',
      finding: `Target answered but does not look like ${APP_UNDER_TEST.name} (title="${title}", h1="${h1}").`,
      impact: 'The wrong application or a broken build may be deployed at the target URL.',
      recommendedAction: 'Verify the target server is serving the intended build.',
      details, confidence: 0.9,
    };
  }
  details.push(`Title "${title}" and app header verified`);
  return {
    status: 'pass',
    finding: `${APP_UNDER_TEST.name} is reachable and boots cleanly (${bootMs}ms).`,
    impact: 'Baseline health confirmed for this build and environment.',
    recommendedAction: 'None.',
    details, confidence: 0.97,
    extra: { bootMs },
  };
}

/* ============================================================ */
export async function runCompareFlow(ctx) {
  const details = [];
  await boot(ctx);
  await runCompare(ctx.page, SEED_A, SEED_B);
  let rendered = true;
  try {
    await ctx.page.waitForSelector('#summary.show', { timeout: 3000 });
  } catch { rendered = false; }
  await ctx.saveEvidence('screenshot', 'compare-result');
  if (!rendered) {
    const btnSeeded = await ctx.page.getAttribute('#compareBtn', 'data-qns-seeded-defect');
    return {
      status: 'fail',
      finding: 'The Compare action produced no result: the summary banner never appeared within 3s of clicking Compare.'
        + (btnSeeded ? ' (Seeded defect marker present on the Compare button.)' : ''),
      impact: 'The core user journey is dead — users cannot compare texts at all. This blocks release.',
      recommendedAction: 'Inspect the Compare click handler and render path; fix and rerun the Compare Flow Agent.',
      details, confidence: 0.95,
    };
  }
  const sameA = await ctx.page.locator('#resultA .token.same').count();
  const diffA = await ctx.page.locator('#resultA .token.different').count();
  const stats = await readStats(ctx.page);
  details.push(`Result A: ${sameA} same, ${diffA} different tokens`);
  details.push(`Stats updated: similarity ${stats.similarity}, accuracy ${stats.accuracy}, matching ${stats.matching}`);
  const statsLive = stats.similarity !== '—' && stats.wordCountA !== '0';
  const tokensRendered = (sameA + diffA) > 0;
  if (!statsLive || !tokensRendered) {
    return {
      status: 'fail',
      finding: 'Compare ran but the output is incomplete (no highlighted tokens rendered, or stats did not update).',
      impact: 'Users see partial or misleading comparison results.',
      recommendedAction: 'Debug the diff render + stat update path for the seeded inputs.',
      details, confidence: 0.85,
    };
  }
  return {
    status: 'pass',
    finding: 'Core compare journey works end-to-end: input → Compare → tagged diff + live stats.',
    impact: 'The primary user flow is healthy on this build.',
    recommendedAction: 'None.',
    details, confidence: 0.95,
  };
}

/* ============================================================ */
export async function runOptions(ctx) {
  const details = [];
  const failures = [];
  await boot(ctx);

  await runCompare(ctx.page, 'Hello World', 'hello world', { ignoreCase: false, ignorePunctuation: false });
  let stats = await readStats(ctx.page);
  if (stats.similarity !== '0.0%') failures.push(`ignore-case OFF: expected similarity 0.0%, got ${stats.similarity}`);
  else details.push('✓ ignore-case OFF treats case-different words as different');

  // Toggling after a compare has run must recalculate live, without a re-click.
  await ctx.page.check('#ignoreCase');
  await ctx.page.waitForTimeout(60);
  stats = await readStats(ctx.page);
  if (stats.similarity !== '100.0%') failures.push(`ignore-case ON (live toggle): expected similarity 100.0%, got ${stats.similarity}`);
  else details.push('✓ toggling ignore-case ON after Compare recalculates live to 100.0%');

  await ctx.page.uncheck('#ignoreCase');
  await runCompare(ctx.page, 'Hello, world!', 'Hello world', { ignorePunctuation: true });
  stats = await readStats(ctx.page);
  const resultAText = await ctx.page.textContent('#resultA');
  if (stats.similarity !== '100.0%') failures.push(`ignore-punctuation ON: expected similarity 100.0%, got ${stats.similarity}`);
  else details.push('✓ ignore-punctuation ON scores the texts as equivalent');
  if (!resultAText.includes('Hello, world!')) failures.push('ignore-punctuation ON: punctuation was stripped from the rendered result, not just from scoring');
  else details.push('✓ punctuation stays visible in the rendered result even though it is excluded from scoring');

  await ctx.saveEvidence('screenshot', 'options-final-case');
  if (failures.length) {
    return {
      status: 'fail',
      finding: `Comparison options deviate from spec in ${failures.length} case(s): ${failures[0]}${failures.length > 1 ? ` (+${failures.length - 1} more)` : ''}.`,
      impact: 'Users cannot trust the Ignore Case / Ignore Punctuation controls to change scoring the way the UI claims.',
      recommendedAction: 'Audit comparableTokens()/isPunctuation() handling; fix and rerun the Comparison Options Agent.',
      details, confidence: 0.92,
    };
  }
  return {
    status: 'pass',
    finding: 'Ignore Case and Ignore Punctuation both score correctly, punctuation stays visible when ignored, and live-toggling after Compare recalculates without a re-click.',
    impact: 'Comparison options verified against specification.',
    recommendedAction: 'None.',
    details, confidence: 0.92,
  };
}

/* ============================================================ */
const METRIC_ORACLE = [
  { label: 'identical text', a: 'Hello world', b: 'Hello world', opts: {},
    expect: { similarity: '100.0%', accuracy: '100.0%', matching: '2', different: '0', missingAdded: '0' } },
  { label: 'one word changed', a: 'The cat is blue', b: 'The cat is red', opts: {},
    expect: { similarity: '60.0%', accuracy: '75.0%', different: '1', missingAdded: '0' } },
  { label: 'one word added to B', a: 'The cat sleeps', b: 'The small cat sleeps', opts: {},
    expect: { similarity: '75.0%', missingAdded: '1' } },
  { label: 'A empty, B populated', a: '', b: 'Hello world', opts: {},
    expect: { accuracy: '0.0%', missingAdded: '2' } },
];

export async function runMetricCalc(ctx) {
  const details = [];
  const failures = [];
  await boot(ctx);
  for (const test of METRIC_ORACLE) {
    await ctx.page.click('#resetBtn');
    await runCompare(ctx.page, test.a, test.b, test.opts);
    await ctx.page.waitForTimeout(80);
    const got = await readStats(ctx.page);
    const mismatches = Object.entries(test.expect)
      .filter(([k, v]) => got[k] !== v)
      .map(([k, v]) => `${k}: expected ${v}, got ${got[k]}`);
    if (mismatches.length) {
      failures.push(`"${test.label}" — ${mismatches.join('; ')}`);
      details.push(`✗ ${test.label}: ${mismatches.join('; ')}`);
    } else {
      details.push(`✓ ${test.label}: similarity ${got.similarity}, accuracy ${got.accuracy}`);
    }
  }
  await ctx.saveEvidence('screenshot', 'metric-final-case');
  if (failures.length) {
    return {
      status: 'fail',
      finding: `Metric calculation deviates from the documented formula in ${failures.length} of ${METRIC_ORACLE.length} case(s): ${failures[0]}${failures.length > 1 ? ` (+${failures.length - 1} more)` : ''}.`,
      impact: 'Similarity, accuracy, and diff counts are wrong — the product’s central output cannot be trusted.',
      recommendedAction: 'Audit the LCS-based metric calculation in compare(); fix and rerun the Metric Calculation Agent.',
      details, confidence: 0.97,
    };
  }
  return {
    status: 'pass',
    finding: `All ${METRIC_ORACLE.length} oracle cases produced exact expected similarity, accuracy, and diff counts.`,
    impact: 'Metric engine verified against specification.',
    recommendedAction: 'None.',
    details, confidence: 0.97,
  };
}

/* ============================================================ */
export async function runCounterGuardrails(ctx) {
  const details = [];
  await boot(ctx);

  await ctx.page.fill('#textA', 'a'.repeat(9001));
  await ctx.page.waitForTimeout(80);
  const counterWarn = (await ctx.page.textContent('#counterA') || '').trim();
  const classWarn = (await ctx.page.getAttribute('#counterA', 'class')) || '';
  details.push(`At 9,001 chars: counter="${counterWarn}", warn class present=${classWarn.includes('warn')}`);
  await ctx.saveEvidence('screenshot', 'guardrail-warn');

  let pasteChecked = false, pasteOk = false, pastedLength = null, counterLimit = '', classLimit = '';
  try {
    await ctx.context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await ctx.page.click('#resetBtn');
    const longText = 'b'.repeat(10500);
    await ctx.page.evaluate((t) => navigator.clipboard.writeText(t), longText);
    await ctx.page.click('#textA');
    await ctx.page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
    await ctx.page.waitForTimeout(150);
    pastedLength = (await ctx.page.inputValue('#textA')).length;
    counterLimit = (await ctx.page.textContent('#counterA') || '').trim();
    classLimit = (await ctx.page.getAttribute('#counterA', 'class')) || '';
    pasteChecked = true;
    pasteOk = pastedLength === 10000;
    details.push(`Pasted 10,500 chars → field holds ${pastedLength}, counter="${counterLimit}", limit class present=${classLimit.includes('limit')}`);
  } catch (err) {
    details.push(`Clipboard paste check unavailable in this environment: ${err.message.split('\n')[0]}`);
  }
  await ctx.saveEvidence('screenshot', 'guardrail-paste');

  const warnOk = classWarn.includes('warn') && !classWarn.includes('limit') && counterWarn === '9,001 / 10,000';
  if (!warnOk || (pasteChecked && !pasteOk)) {
    return {
      status: 'fail',
      finding: !warnOk
        ? `Counter warn state is wrong at 9,001 characters: counter="${counterWarn}", class="${classWarn}".`
        : `A paste of 10,500 characters was not clamped to the 10,000-character maxlength: field holds ${pastedLength} characters.`,
      impact: 'Users get no warning near the limit, or oversized pastes can degrade or hang the compare engine.',
      recommendedAction: 'Check the counter warn/limit thresholds and the maxlength attribute on both textareas.',
      details, confidence: 0.9,
    };
  }
  return {
    status: pasteChecked ? 'pass' : 'degraded',
    finding: pasteChecked
      ? 'Character counter warns at 9,000+ characters and the native 10,000-character maxlength clamps a real paste.'
      : 'Character counter warns correctly at 9,000+ characters; the paste-clamp check could not run in this environment (clipboard permissions unavailable).',
    impact: 'Input guardrails protect the compare engine from oversized payloads.',
    recommendedAction: pasteChecked ? 'None.' : 'Rerun in an environment where clipboard permissions can be granted to confirm the paste clamp.',
    details, confidence: pasteChecked ? 0.92 : 0.6,
  };
}

/* ============================================================ */
export async function runControlsReset(ctx) {
  const details = [];
  await boot(ctx);
  await runCompare(ctx.page, SEED_A, SEED_B, { ignoreCase: true, ignorePunctuation: true });
  await ctx.page.locator('label.theme-toggle').click(); // dark mode on
  await ctx.page.waitForTimeout(80);
  await ctx.saveEvidence('screenshot', 'reset-before');

  await ctx.page.click('#resetBtn');
  await ctx.page.waitForTimeout(80);

  const textA = await ctx.page.inputValue('#textA');
  const textB = await ctx.page.inputValue('#textB');
  const stats = await readStats(ctx.page);
  const resultAText = await ctx.page.textContent('#resultA');
  const ignoreCaseChecked = await ctx.page.isChecked('#ignoreCase');
  const ignorePunctChecked = await ctx.page.isChecked('#ignorePunctuation');
  const bodyClass = (await ctx.page.getAttribute('body', 'class')) || '';
  const summaryClass = (await ctx.page.getAttribute('#summary', 'class')) || '';
  await ctx.saveEvidence('screenshot', 'reset-after');

  details.push(`Text A/B cleared: ${textA === '' && textB === ''}`);
  details.push(`Stats reset: similarity=${stats.similarity}, accuracy=${stats.accuracy}, matching=${stats.matching}`);
  details.push(`Result placeholder restored: ${resultAText.includes('Run a comparison')}`);
  details.push(`Options cleared: ignoreCase=${ignoreCaseChecked}, ignorePunctuation=${ignorePunctChecked}`);
  details.push(`Theme restored to light: dark class present=${bodyClass.includes('dark')}`);

  const ok = textA === '' && textB === ''
    && stats.similarity === '—' && stats.matching === '0'
    && resultAText.includes('Run a comparison')
    && !ignoreCaseChecked && !ignorePunctChecked
    && !bodyClass.includes('dark')
    && !summaryClass.includes('show');

  if (!ok) {
    const btnSeeded = await ctx.page.getAttribute('#resetBtn', 'data-qns-seeded-defect');
    return {
      status: 'fail',
      finding: `Reset did not fully restore initial state (text cleared=${textA === '' && textB === ''}, stats cleared=${stats.similarity === '—'}, options cleared=${!ignoreCaseChecked && !ignorePunctChecked}, theme restored=${!bodyClass.includes('dark')}).`
        + (btnSeeded ? ' (Seeded defect marker present on the Reset button.)' : ''),
      impact: 'Users who Reset between comparisons carry over stale text, stats, options, or theme state.',
      recommendedAction: 'Inspect the reset() handler; fix and rerun the Reset Control Agent.',
      details, confidence: 0.9,
    };
  }
  return {
    status: 'pass',
    finding: 'Reset fully restores text, stats, result panels, comparison options, and theme to their initial state.',
    impact: 'Reset control verified end-to-end.',
    recommendedAction: 'None.',
    details, confidence: 0.92,
  };
}

/* ============================================================ */
export async function runDarkMode(ctx) {
  const details = [];
  await boot(ctx);
  const readBg = () => ctx.page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--bg').trim());

  const lightBg = await readBg();
  // The #darkMode checkbox is visually hidden (opacity:0) behind a custom
  // slider — click the wrapping label, which is how a real user (and
  // Playwright's actionability check) activates it.
  await ctx.page.locator('label.theme-toggle').click();
  await ctx.page.waitForTimeout(120);
  const darkOn = ((await ctx.page.getAttribute('body', 'class')) || '').includes('dark');
  const darkBg = await readBg();
  await ctx.saveEvidence('screenshot', 'dark-mode-on');

  await runCompare(ctx.page, 'The cat sleeps', 'The dog sleeps');
  const sameColor = await ctx.page.locator('#resultA .token.same').first()
    .evaluate((el) => getComputedStyle(el).color).catch(() => null);
  const diffColor = await ctx.page.locator('#resultA .token.different').first()
    .evaluate((el) => getComputedStyle(el).color).catch(() => null);

  await ctx.page.locator('label.theme-toggle').click();
  await ctx.page.waitForTimeout(120);
  const darkOff = ((await ctx.page.getAttribute('body', 'class')) || '').includes('dark');
  const restoredBg = await readBg();
  await ctx.saveEvidence('screenshot', 'dark-mode-off');

  details.push(`--bg light="${lightBg}", dark="${darkBg}", restored="${restoredBg}"`);
  details.push(`dark class on after first click=${darkOn}, off after second click=${!darkOff}`);
  details.push(`same-token color=${sameColor}, different-token color=${diffColor}`);

  const themeChanged = darkOn && darkBg !== lightBg;
  const themeRestored = !darkOff && restoredBg === lightBg;
  const colorsDistinct = !!sameColor && !!diffColor && sameColor !== diffColor;

  if (!themeChanged || !themeRestored || !colorsDistinct) {
    return {
      status: 'fail',
      finding: !themeChanged
        ? 'Clicking the theme toggle did not change the --bg theme token or the dark class.'
        : !themeRestored
          ? 'Toggling the theme back off did not restore the original light theme.'
          : 'Match and difference token colors are not distinguishable in dark mode.',
      impact: 'Users toggling dark mode get a broken or visually confusing theme.',
      recommendedAction: 'Inspect the darkMode change listener and the dark-theme CSS custom properties.',
      details, confidence: 0.85,
    };
  }
  return {
    status: 'pass',
    finding: 'Dark mode toggles the theme correctly, restores the light theme when toggled back off, and keeps match/difference highlighting distinguishable.',
    impact: 'Theme toggle verified end-to-end.',
    recommendedAction: 'None.',
    details, confidence: 0.85,
  };
}

/* ============================================================ */
export async function runI18n(ctx) {
  const details = [];
  await boot(ctx);

  const langBefore = await ctx.page.evaluate(() => document.documentElement.lang);
  const enPressedBefore = await ctx.page.getAttribute('#langEn', 'aria-pressed');
  details.push(`Initial language: ${langBefore}, English pressed=${enPressedBefore}`);

  await ctx.page.click('#langDe');
  await ctx.page.waitForTimeout(80);
  const langAfter = await ctx.page.evaluate(() => document.documentElement.lang);
  const dePressed = await ctx.page.getAttribute('#langDe', 'aria-pressed');
  const enPressed = await ctx.page.getAttribute('#langEn', 'aria-pressed');
  const compareBtnText = ((await ctx.page.textContent('#compareBtn')) || '').trim();
  await ctx.saveEvidence('screenshot', 'i18n-de');

  await runCompare(ctx.page, 'Hello world', 'Hello world');
  const simDe = ((await ctx.page.textContent('#similarity')) || '').trim();

  await ctx.page.click('#langEn');
  await ctx.page.waitForTimeout(80);
  const langRestored = await ctx.page.evaluate(() => document.documentElement.lang);
  const compareBtnRestored = ((await ctx.page.textContent('#compareBtn')) || '').trim();
  await ctx.saveEvidence('screenshot', 'i18n-restored-en');

  details.push(`After switching to German: lang="${langAfter}", aria-pressed DE=${dePressed}/EN=${enPressed}, Compare button="${compareBtnText}"`);
  details.push(`Similarity string in German locale: "${simDe}"`);
  details.push(`After switching back: lang="${langRestored}", Compare button="${compareBtnRestored}"`);

  const switchedOk = langAfter === 'de' && dePressed === 'true' && enPressed === 'false' && compareBtnText === 'Texte vergleichen';
  const localeOk = simDe === '100,0%';
  const restoredOk = langRestored === 'en' && compareBtnRestored === 'Compare Texts';

  if (!switchedOk || !localeOk || !restoredOk) {
    return {
      status: 'fail',
      finding: !switchedOk
        ? `Switching to German did not update the document language, ARIA pressed state, or translated button text (got lang="${langAfter}", button="${compareBtnText}").`
        : !localeOk
          ? `German locale should format similarity with a comma decimal (expected "100,0%"), got "${simDe}".`
          : `Switching back to English did not restore the language or UI strings (lang="${langRestored}", button="${compareBtnRestored}").`,
      impact: 'Non-English users get an inconsistent or partially-translated interface, or locale-specific number formatting is wrong.',
      recommendedAction: 'Inspect setLanguage()/fmtPercent() and the [data-i18n] translation pass; fix and rerun the Localization Agent.',
      details, confidence: 0.85,
    };
  }
  return {
    status: 'pass',
    finding: 'Switching to German updates language, ARIA pressed state, translated strings, and locale-formatted percentages; switching back to English fully restores the original UI.',
    impact: 'Localization verified end-to-end for the EN/DE language pair.',
    recommendedAction: 'None.',
    details, confidence: 0.85,
  };
}

/* ============================================================ */
export async function runSecurityScan(ctx) {
  const details = [];
  await boot(ctx);
  let dialogFired = false;
  ctx.page.on('dialog', async (dialog) => { dialogFired = true; await dialog.dismiss(); });

  const scriptPayload = '<script>alert("x")</script>';
  await runCompare(ctx.page, scriptPayload, scriptPayload);
  const scriptEls = await ctx.page.locator('#resultA script').count();
  const resultAText1 = await ctx.page.textContent('#resultA');
  const html1 = await ctx.page.locator('#resultA').innerHTML();
  await ctx.saveEvidence('screenshot', 'security-script-payload');
  const escapedOk = html1.includes('&lt;') && !/<script[\s>]/i.test(html1);
  details.push(`<script> payload: dialog fired=${dialogFired}, real <script> elements=${scriptEls}, payload visible as text=${resultAText1.includes(scriptPayload)}, HTML escaped=${escapedOk}`);

  await ctx.page.click('#resetBtn');
  await runCompare(ctx.page, '<b>Hello</b>', '<i>Hello</i>');
  const bEls = await ctx.page.locator('#resultA b').count();
  const iEls = await ctx.page.locator('#resultB i').count();
  const resultAText2 = await ctx.page.textContent('#resultA');
  const resultBText2 = await ctx.page.textContent('#resultB');
  await ctx.saveEvidence('screenshot', 'security-markup-payload');
  details.push(`markup payload: real <b>/<i> elements=${bEls + iEls}, A visible text has payload=${resultAText2.includes('<b>Hello</b>')}, B visible text has payload=${resultBText2.includes('<i>Hello</i>')}`);

  const ok = !dialogFired && scriptEls === 0 && resultAText1.includes(scriptPayload) && escapedOk
    && bEls === 0 && iEls === 0
    && resultAText2.includes('<b>Hello</b>') && resultBText2.includes('<i>Hello</i>');

  if (!ok) {
    return {
      status: 'fail',
      finding: dialogFired
        ? 'A script payload triggered a real dialog — user-supplied text is being executed, not just displayed.'
        : (scriptEls > 0 || bEls > 0 || iEls > 0)
          ? 'A script-like or markup-like payload created real DOM elements instead of rendering as escaped text.'
          : 'Payload text was altered or stripped instead of being safely escaped and displayed verbatim.',
      impact: 'User-supplied text is not being safely rendered — this is an XSS risk if it reaches production.',
      recommendedAction: 'Inspect escapeHtml()/renderTokens(); fix and rerun the Injection Safety Agent immediately — this blocks release.',
      details, confidence: 0.95,
    };
  }
  return {
    status: 'pass',
    finding: 'Script-tag and markup-like payloads never execute, never create real DOM elements, and always render as escaped, visible text.',
    impact: 'Injection safety verified for the rendered diff output.',
    recommendedAction: 'None.',
    details, confidence: 0.93,
  };
}

/* ============================================================ */
export async function runKeyboardAccess(ctx) {
  const details = [];
  await boot(ctx);
  await ctx.page.fill('#textA', SEED_A);
  await ctx.page.fill('#textB', SEED_B);
  await ctx.page.evaluate(() => document.body.focus());
  const focusTrail = [];
  let reachedCompare = false;
  for (let i = 0; i < 20; i++) {
    await ctx.page.keyboard.press('Tab');
    const id = await ctx.page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName || '?');
    focusTrail.push(id);
    if (id === 'compareBtn') { reachedCompare = true; break; }
  }
  details.push(`Focus trail to Compare: ${focusTrail.join(' → ')}`);
  if (!reachedCompare) {
    await ctx.saveEvidence('screenshot', 'keyboard-trail');
    return {
      status: 'fail',
      finding: `The Compare action is not reachable by keyboard within ${focusTrail.length} Tab stops.`,
      impact: 'Keyboard-only users cannot run a comparison at all.',
      recommendedAction: 'Fix the tab order / focusability of the Compare button.',
      details, confidence: 0.92,
    };
  }
  await ctx.page.keyboard.press('Enter');
  await ctx.page.waitForTimeout(200);
  const summaryShown = ((await ctx.page.getAttribute('#summary', 'class')) || '').includes('show');
  details.push(`After Enter on focused Compare: summary shown=${summaryShown}`);
  await ctx.saveEvidence('screenshot', 'keyboard-activation');
  if (!summaryShown) {
    await ctx.page.click('#compareBtn');
    await ctx.page.waitForTimeout(200);
    const pointerWorks = ((await ctx.page.getAttribute('#summary', 'class')) || '').includes('show');
    details.push(`Pointer click compare works: ${pointerWorks}`);
    return {
      status: 'fail',
      finding: pointerWorks
        ? 'Keyboard activation of Compare is broken (Enter on the focused button does nothing) while pointer click works — a keyboard-only regression that mouse tests would miss.'
        : 'Compare cannot be activated by keyboard or pointer.',
      impact: 'Keyboard and assistive-technology users are locked out of the core flow. This is a WCAG 2.1.1 failure.',
      recommendedAction: 'Inspect key event handling on the Compare button (look for handlers swallowing Enter/Space); fix and rerun the Keyboard Access Agent.',
      details, confidence: 0.95,
    };
  }

  await ctx.page.locator('#resetBtn').focus();
  await ctx.page.keyboard.press('Space');
  await ctx.page.waitForTimeout(150);
  const textACleared = (await ctx.page.inputValue('#textA')) === '';
  details.push(`Space on focused Reset cleared Text A: ${textACleared}`);

  await ctx.page.fill('#textA', 'placeholder so the checkbox check below is meaningful');
  await ctx.page.locator('#ignoreCase').focus();
  await ctx.page.keyboard.press('Space');
  const ignoreCaseToggled = await ctx.page.isChecked('#ignoreCase');
  details.push(`Space toggled Ignore Case checkbox: ${ignoreCaseToggled}`);
  await ctx.saveEvidence('screenshot', 'keyboard-controls');

  const ok = textACleared && ignoreCaseToggled;
  return {
    status: ok ? 'pass' : 'degraded',
    finding: ok
      ? 'Compare is keyboard-reachable and Enter-activatable; Reset and the comparison checkboxes are Space-activatable.'
      : `Compare works by keyboard, but ${!textACleared ? 'Reset' : 'the comparison checkboxes'} did not respond to Space.`,
    impact: 'Keyboard operability of the core controls verified.',
    recommendedAction: ok ? 'None.' : 'Verify Space handling on the affected control.',
    details, confidence: ok ? 0.93 : 0.65,
  };
}

/* ============================================================ */
export async function runA11yScan(ctx) {
  const details = [];
  await boot(ctx);
  const axeSource = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
  await ctx.page.evaluate(axeSource);
  const results = await ctx.page.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ['violations'] });
    return r.violations.map((v) => ({
      id: v.id, impact: v.impact, help: v.help,
      nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
    }));
  });
  await ctx.attachNote('report', 'axe-violations.json', JSON.stringify(results, null, 2));
  const severe = results.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  const minor = results.filter((v) => v.impact !== 'critical' && v.impact !== 'serious');
  details.push(`axe-core: ${results.length} violation rule(s) — ${severe.length} serious/critical, ${minor.length} moderate/minor`);
  for (const v of results.slice(0, 6)) details.push(`${v.impact}: ${v.id} — ${v.help} (${v.nodes[0] || ''})`);
  if (severe.length) {
    return {
      status: 'fail',
      finding: `axe-core found ${severe.length} serious/critical accessibility violation rule(s): ${severe.map((v) => v.id).join(', ')}.`,
      impact: 'Users of assistive technology hit serious barriers.',
      recommendedAction: 'Fix the listed violations, starting with critical impact; rerun the Accessibility Scan Agent.',
      details, confidence: 0.9,
    };
  }
  return {
    status: minor.length ? 'degraded' : 'pass',
    finding: minor.length
      ? `No serious/critical violations; ${minor.length} moderate/minor rule(s) flagged (${minor.map((v) => v.id).join(', ')}).`
      : 'axe-core scan clean: no violations detected.',
    impact: 'Semantic accessibility baseline verified.',
    recommendedAction: minor.length ? 'Consider addressing the moderate/minor findings.' : 'None.',
    details, confidence: 0.88,
  };
}

/* ============================================================ */
export async function runSemanticExplorer(ctx) {
  const details = [];
  await boot(ctx);
  const inventory = await ctx.page.evaluate((identifyControlSrc) => {
    // identifyControl is defined in server/control-identity.mjs; it can't be
    // imported inside a page.evaluate callback, so its source is interpolated
    // in — this keeps the identity rule defined exactly once, shared with the
    // coverage instrumentation in engine.mjs that records touched controls.
    // eslint-disable-next-line no-new-func
    const identifyControl = new Function(`return (${identifyControlSrc});`)();
    const controls = [];
    const push = (el) => {
      const id = identifyControl(el);
      if (id) controls.push({ ...id, disabled: el.disabled || false });
    };
    document.querySelectorAll('button').forEach(push);
    document.querySelectorAll('textarea').forEach(push);
    document.querySelectorAll('input[type="checkbox"]').forEach(push);
    document.querySelectorAll('[role="tablist"]').forEach(push);
    document.querySelectorAll('a[href]').forEach(push);
    const regions = [...document.querySelectorAll('[aria-label]')].map((el) => ({
      tag: el.tagName.toLowerCase(), label: el.getAttribute('aria-label'),
    }));
    const liveRegions = [...document.querySelectorAll('[aria-live]')].length;
    return { controls, regions, liveRegions, title: document.title };
  }, identifyControl.toString());
  const graph = {
    app: APP_UNDER_TEST.name,
    page: '/',
    capturedAt: new Date().toISOString(),
    controls: inventory.controls,
    regions: inventory.regions,
    liveRegions: inventory.liveRegions,
  };
  await ctx.attachNote('report', 'runtime-graph.json', JSON.stringify(graph, null, 2));
  await ctx.saveEvidence('screenshot', 'explorer-state');
  details.push(`Discovered ${inventory.controls.length} interactive controls, ${inventory.regions.length} labelled regions, ${inventory.liveRegions} live regions`);
  details.push(`Controls: ${inventory.controls.map((c) => c.id || `${c.role}:${c.label || c.tag}`).join(', ')}`);
  const enough = inventory.controls.length >= 8;
  return {
    status: enough ? 'pass' : 'degraded',
    finding: enough
      ? `Runtime spider mapped ${inventory.controls.length} live controls across the page — runtime UI graph captured.`
      : `Runtime spider found only ${inventory.controls.length} controls (expected ≥8) — the UI may have lost surface area.`,
    impact: 'The app-under-test runtime graph is current for this build; findings can be tied to real controls.',
    recommendedAction: enough ? 'None.' : 'Diff the control inventory against the previous build.',
    details, confidence: 0.85,
    extra: { runtimeGraph: graph },
  };
}

/* ============================================================ */
export async function runPerfTiming(ctx) {
  const details = [];
  const bootMs = await boot(ctx);
  const bigA = Array.from({ length: 2000 }, (_, i) => `alpha${i}`).join(' ').slice(0, 10000);
  const bigB = Array.from({ length: 2000 }, (_, i) => `zulu${i}`).join(' ').slice(0, 10000);
  await ctx.page.fill('#textA', bigA);
  await ctx.page.fill('#textB', bigB);
  const compareMs = await ctx.page.evaluate(async () => {
    const t0 = performance.now();
    document.getElementById('compareBtn').click();
    return performance.now() - t0; // click handler is synchronous in this app
  });
  const stats = await readStats(ctx.page);
  details.push(`Boot (DOM interactive): ${bootMs}ms (threshold 3000ms)`);
  details.push(`Compare of two ~10,000-char, mostly-unique texts: ${Math.round(compareMs)}ms (threshold 3000ms) → similarity ${stats.similarity}`);
  await ctx.saveEvidence('screenshot', 'perf-large-compare');
  const bootOk = bootMs < 3000;
  const compareOk = compareMs < 3000;
  if (!bootOk || !compareOk) {
    return {
      status: 'degraded',
      finding: `Performance threshold exceeded: boot ${bootMs}ms${bootOk ? '' : ' (over 3s)'}, large compare ${Math.round(compareMs)}ms${compareOk ? '' : ' (over 3s)'}.`,
      impact: 'Large comparisons feel sluggish; users on slower machines will feel it sooner.',
      recommendedAction: 'Profile the LCS diff on large, mostly-unique token counts; consider the existing greedy fallback threshold.',
      details, confidence: 0.8,
      extra: { bootMs, compareMs: Math.round(compareMs) },
    };
  }
  return {
    status: 'pass',
    finding: `Timing healthy: boot ${bootMs}ms, large compare ${Math.round(compareMs)}ms — both inside thresholds.`,
    impact: 'Performance envelope verified for heavy input.',
    recommendedAction: 'None.',
    details, confidence: 0.85,
    extra: { bootMs, compareMs: Math.round(compareMs) },
  };
}

/* ============================================================ */
export async function runResponsiveLayout(ctx) {
  const details = [];
  const original = ctx.page.viewportSize();
  await boot(ctx);

  await ctx.page.setViewportSize({ width: 700, height: 900 });
  await ctx.page.waitForTimeout(80);
  const boxA1 = await ctx.page.locator('.inputs .panel').nth(0).boundingBox();
  const boxB1 = await ctx.page.locator('.inputs .panel').nth(1).boundingBox();
  const stacked = !!boxA1 && !!boxB1 && boxB1.y >= boxA1.y + boxA1.height - 1;
  const overflow700 = await ctx.page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  const noOverflow700 = overflow700.scrollWidth <= overflow700.clientWidth + 1;
  details.push(`700×900: inputs stacked=${stacked}, no horizontal overflow=${noOverflow700}`);
  await ctx.saveEvidence('screenshot', 'responsive-700');

  await ctx.page.setViewportSize({ width: 320, height: 800 });
  await ctx.page.waitForTimeout(80);
  const compareVisible = await ctx.page.isVisible('#compareBtn');
  const resetVisible = await ctx.page.isVisible('#resetBtn');
  const textAVisible = await ctx.page.isVisible('#textA');
  const overflow320 = await ctx.page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  const noOverflow320 = overflow320.scrollWidth <= overflow320.clientWidth + 1;
  details.push(`320×800: Compare/Reset/Text A visible=${compareVisible}/${resetVisible}/${textAVisible}, no horizontal overflow=${noOverflow320}`);
  await ctx.saveEvidence('screenshot', 'responsive-320');

  await ctx.page.setViewportSize({ width: 1440, height: 900 });
  await ctx.page.waitForTimeout(80);
  const boxA3 = await ctx.page.locator('.inputs .panel').nth(0).boundingBox();
  const boxB3 = await ctx.page.locator('.inputs .panel').nth(1).boundingBox();
  const sideBySide = !!boxA3 && !!boxB3 && Math.abs(boxA3.y - boxB3.y) < 5 && boxB3.x > boxA3.x + boxA3.width - 5;
  details.push(`1440×900: two-column layout=${sideBySide}`);
  await ctx.saveEvidence('screenshot', 'responsive-1440');

  if (original) await ctx.page.setViewportSize(original);

  const ok = stacked && noOverflow700 && compareVisible && resetVisible && textAVisible && noOverflow320 && sideBySide;
  if (!ok) {
    return {
      status: 'fail',
      finding: (!stacked || !noOverflow700)
        ? 'Mobile layout (700×900) does not stack inputs cleanly or overflows horizontally.'
        : (!compareVisible || !resetVisible || !textAVisible || !noOverflow320)
          ? 'Narrow layout (320×800) clips or hides core controls, or overflows horizontally.'
          : 'Desktop layout (1440×900) does not hold a balanced two-column arrangement.',
      impact: 'Users at that viewport size get a broken or unusable layout.',
      recommendedAction: 'Check the responsive breakpoints in the stylesheet; fix and rerun the Responsive Layout Agent.',
      details, confidence: 0.88,
    };
  }
  return {
    status: 'pass',
    finding: 'Layout holds correctly at mobile (700×900), narrow (320×800), and desktop (1440×900) breakpoints with no horizontal overflow.',
    impact: 'Responsive layout verified across the real breakpoints.',
    recommendedAction: 'None.',
    details, confidence: 0.88,
  };
}

/* ============================================================
   External Playwright suite — not a QNS browser check like the
   agents above. This one shells out to the team's own, already-
   authored Playwright suite (the app under test's tests/ folder)
   and ingests its real JSON reporter output. `ctx.page` is left
   untouched; the engine still opens one (cheap, unused) since
   every agent shares the same execution path. ---------------- */
// run the suite's own Playwright CLI through node, which works the same on macOS, Linux and Windows
const EXTERNAL_SUITE_CLI = path.join(APP_UNDER_TEST.path, 'node_modules', '@playwright', 'test', 'cli.js');
const EXTERNAL_SUITE_RESULTS = path.join(APP_UNDER_TEST.path, 'test-results', 'results.json');
// The full suite takes ~2.5 min on the Drag-n-Drop build (320 tests); leave headroom.
const EXTERNAL_SUITE_TIMEOUT_MS = 300_000;

/* Build Smoke gets a fast 5-test slice of the full suite instead of the
   full run — one representative test per critical area (core diff, metrics,
   controls, security), matched by exact title text so the --grep regex can't
   accidentally also match a describe-block title like "TC-01 .. TC-10". */
const SMOKE_SUITE_TITLES = [
  'TC-01 identical text is a full match',
  'TC-03 one word changed produces a single replacement',
  'TC-41 matching word count',
  'TC-47 Compare button populates results and stats',
  'TC-28 script-like text is rendered inert, never executed',
];

function spawnExternalSuite({ smoke = false } = {}) {
  const args = ['test'];
  if (smoke) args.push('--grep', SMOKE_SUITE_TITLES.join('|'));
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, [EXTERNAL_SUITE_CLI, ...args], {
      cwd: APP_UNDER_TEST.path,
      // unset CI so the suite's webServer reuses QNS's already-running target, on whatever port it's on
      env: { ...process.env, CI: '', QNS_TARGET_PORT: String(CONFIG.targetPort) },
    });
    let stdout = '', stderr = '', settled = false;
    const timer = setTimeout(() => { if (!settled) proc.kill('SIGKILL'); }, EXTERNAL_SUITE_TIMEOUT_MS);
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    const finish = (result) => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
    proc.on('close', (code) => finish({ code, stdout, stderr }));
    proc.on('error', (err) => finish({ code: -1, stdout, stderr: String(err) }));
  });
}

/* walk the JSON reporter's suite tree for the specific failing specs —
   report.stats already has the aggregate counts we need for the verdict */
function collectExternalFailures(suite, out = []) {
  for (const sub of suite.suites || []) collectExternalFailures(sub, out);
  for (const spec of suite.specs || []) {
    const t = spec.tests?.[0];
    if (t && t.status !== 'expected') out.push({ file: suite.file, title: spec.title, status: t.status });
  }
  return out;
}

export async function runExternalSuite(ctx) {
  const details = [];
  const smoke = ctx.cadence === 'build-smoke';
  const suiteLabel = smoke ? `Build Smoke subset (${SMOKE_SUITE_TITLES.length} tests)` : 'full suite';

  // fail fast with a clear message rather than burning minutes running the whole suite
  // tests against a target that isn't even up
  try {
    const res = await fetch(ctx.targetUrl, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    return {
      status: 'fail',
      finding: `Target unreachable at ${ctx.targetUrl}: the external suite was not run.`,
      impact: 'The team\'s independently authored regression suite provides no signal for this build.',
      recommendedAction: `Start the ${APP_UNDER_TEST.name} target server, then rerun the External Playwright Suite.`,
      details: [err.message.split('\n')[0]], confidence: 0.9,
    };
  }

  const { code, stderr } = await spawnExternalSuite({ smoke });
  let report;
  try {
    report = JSON.parse(await readFile(EXTERNAL_SUITE_RESULTS, 'utf8'));
  } catch (err) {
    return {
      status: 'fail',
      finding: `The external Playwright suite did not produce a readable results file (process exit code ${code}): ${err.message.split('\n')[0]}`,
      impact: 'The team\'s independently authored regression suite could not run — its coverage is unverified for this build.',
      recommendedAction: `Run "npx playwright test" manually in ${APP_UNDER_TEST.path} to see the raw failure.`,
      details: [stderr.split('\n').slice(0, 5).join(' | ')].filter(Boolean), confidence: 0.7,
    };
  }

  const stats = report.stats || {};
  const total = (stats.expected || 0) + (stats.unexpected || 0) + (stats.skipped || 0);
  details.push(`${stats.expected || 0} passed, ${stats.unexpected || 0} failed, ${stats.flaky || 0} flaky, ${stats.skipped || 0} skipped of ${total} (${Math.round(stats.duration || 0)}ms)`);

  const failures = [];
  for (const suite of report.suites || []) collectExternalFailures(suite, failures);
  for (const f of failures.slice(0, 8)) details.push(`✗ ${f.file} › ${f.title} (${f.status})`);

  await ctx.attachNote('report', 'external-suite-stats.json', JSON.stringify(stats, null, 2));

  if (failures.length) {
    return {
      status: 'fail',
      finding: `The team's Playwright regression suite (${suiteLabel}) reports ${stats.unexpected} failing test(s) of ${total}: ${failures[0].file} › ${failures[0].title}${failures.length > 1 ? ` (+${failures.length - 1} more)` : ''}.`,
      impact: 'An independently authored, broader regression suite found a real defect — possibly one QNS\'s own agents don\'t individually cover.',
      recommendedAction: `Run "npx playwright test --grep '${failures[0].title.replace(/'/g, '')}'" in ${APP_UNDER_TEST.path} to reproduce, or open its HTML report for full traces.`,
      details, confidence: 0.9,
    };
  }
  return {
    status: 'pass',
    finding: `The team's Playwright regression suite (${suiteLabel}) passed all ${stats.expected} tests${smoke ? '' : ` across ${(report.suites || []).length} spec files`}.`,
    impact: smoke ? 'Fast smoke-level regression coverage confirmed for this build.' : 'Independent regression coverage confirmed for this build.',
    recommendedAction: 'None.',
    details, confidence: 0.9,
    // a subset pass is real evidence but not full coverage — issues.mjs
    // won't let it clear a failure the full suite found
    extra: { subset: smoke },
  };
}

export const AGENT_IMPLS = {
  runAvailability, runCompareFlow, runOptions, runMetricCalc, runCounterGuardrails,
  runControlsReset, runDarkMode, runI18n, runSecurityScan, runKeyboardAccess,
  runA11yScan, runSemanticExplorer, runPerfTiming, runResponsiveLayout, runExternalSuite,
};
