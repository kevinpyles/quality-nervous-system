# Comparinator Test Report

| | |
|---|---|
| **Build** | `comparinator.html` · 105,646 bytes · sha256 `7424092aad7e86b1cd3f25a58a943b69e756b819ebfe700c099f3c937f941bb4` (checked unchanged before and after testing) |
| **Date** | 2026-09-16 |
| **Environment** | macOS · Playwright 1.62.1 · Chromium (Desktop Chrome profile) · `http-server` on `127.0.0.1:4173` |
| **Run by** | Main orchestration session, 6 specialist agents (in parallel), and `comparinator-quality-agent` |
| **Recommendation** | **Not ready.** See [quality-report.md](agents/quality-report.md) |
| **Gap analysis** | [gap-analysis.html](gap-analysis.html) (Quality Coverage Treemap) |

## 1. Summary

The full Playwright suite has **276 tests. 273 passed and 3 failed.**

Test counts do not show product quality here:

- **24 of the 273 passes are known-defect tests** marked `test.fail()`. They pass because the defect they document is still there.
- **All 3 failures are deliberate.** The security agent wrote them to track SEC-F1 and SEC-F2, and they fail on purpose.
- **27 tests in total track open defects.** `reports/dashboard.html` shows 98.9% passing and hides the 24 known-defect tests among the passes.

The agents and the quality lead found **34 unique defects: 3 High, 13 Medium and 18 Low.** None are Critical. No exploitable security vulnerability was found.

| Run | Tests | Passed | Failed | Notes |
|---|---:|---:|---:|---|
| Baseline `npm test`, before the agents ran | 148 | 148 | 0 | Specs 01–09. 2 of the passes were `test.fail()` tests for F-1. |
| Final `npm test`, after the agents ran | 276 | 273 | 3 | 128 tests added. 24 of the passes are `test.fail()` tests. |

## 2. Results per spec (final run)

"Known-defect" counts the passing tests that are marked `test.fail()`.

| Spec | Owner | Total | Passed | Known-defect | Failed |
|---|---|---:|---:|---:|---:|
| 01-core-comparison | functional | 19 | 19 | 0 | 0 |
| 02-options | functional | 11 | 11 | 0 | 0 |
| 03-counters-wordcount | functional | 8 | 8 | 0 | 0 |
| 04-metrics-highlighting | functional | 8 | 8 | 0 | 0 |
| 05-controls-and-reset | functional | 12 | 12 | 0 | 0 |
| 06-security | security | 2 | 2 | 0 | 0 |
| 07-responsive-and-accessibility | a11y | 7 | 7 | 0 | 0 |
| 08-performance-large-input | *no owner* | 3 | 3 | 0 | 0 |
| 09-file-drop | drag-n-drop (+8 new) | 86 | 86 | 3 | 0 |
| **10-functional-gaps** *(new)* | functional | 12 | 12 | 3 | 0 |
| **11-i18n** *(new)* | i18n | 38 | 38 | 10 | 0 |
| **12-a11y** *(new)* | a11y | 17 | 17 | 5 | 0 |
| **13-branding-style** *(new)* | branding-style | 19 | 19 | 3 | 0 |
| **14-security** *(new)* | security | 34 | 31 | 0 | **3** |
| **Total** | | **276** | **273** | **24** | **3** |

The 3 failures:

- `14-security › SEC-002 … bypasses maxlength [KNOWN DEFECT SEC-F1]`
- `14-security › SEC-034 stays responsive: 10,000 punctuation characters [KNOWN DEFECT SEC-F2]`
- `14-security › SEC-034 stays responsive: 10,000 combining marks [KNOWN DEFECT SEC-F2]`

## 3. Results per agent

| Agent | Tests added | Verdict | Defects (H / M / L) | Report |
|---|---:|---|---|---|
| functional-agent | 12 | Ready with known risk | 1 / 3 / 2 | [functional-report.md](agents/functional-report.md) |
| a11y-agent | 17 | Fix the focus ring before release | 1 / 3 / 2 | [a11y-report.md](agents/a11y-report.md) |
| i18n-agent | 38 | Conditional go for en/de only | 1 / 3 / 6 | [i18n-report.md](agents/i18n-report.md) |
| branding-style-agent | 19 | Release, fix the Medium defects in the next patch | 0 / 3 / 6 | [branding-style-report.md](agents/branding-style-report.md) |
| security-agent | 34 | OK for the tutorial; fix SEC-F2 before wider use | 0 / 1 / 1 (+ hardening notes) | [security-report.md](agents/security-report.md) |
| drag-n-drop-agent | 8 | Release with conditions (all 18 DND requirements pass) | 0 / 1 / 4 | [drag-n-drop-report.md](agents/drag-n-drop-report.md) |
| *(performance: no owner)* | – | Orchestrator assessment based on evidence only | – | [performance-gap-data.md](agents/performance-gap-data.md) |
| **comparinator-quality-agent** | – | **Not ready** | 3 / 13 / 18 after merging duplicates | [quality-report.md](agents/quality-report.md) |

The per-agent counts add up to more than 34 because several agents found the same root cause. For example, FD-03 and I18N-01 are the same defect, and so are FD-06 and I18N-05.

## 4. High-severity defects

| ID | Area | Defect | Evidence |
|---|---|---|---|
| **Q-01** | Functional / compare engine | Long inputs of more than about 2,120 tokens (typically code) switch to an approximate diff. Results are silently wrong. In the functional test, deleting 5 lines gave 882 false differences and 67.8% similarity instead of about 98.7%. The quality lead reproduced a similar result independently (790 false differences, 69.3%). | FD-01 · `10-functional-gaps` |
| **Q-02** | I18N / functional | Combining marks are classified as punctuation. With Ignore punctuation on, Hindi `कि` and `की` show a 100% "Match". Hebrew, Arabic and Indic words are split into fragments. | I18N-01 = FD-03 · `11-i18n`, `10-functional-gaps` |
| **Q-03** | Accessibility | The default focus ring has 1.4:1 contrast in light mode and 2.6:1 in dark mode. The requirement is 3:1 (A11Y-018 / WCAG 1.4.11). | A11Y-HIGH-1 · `12-a11y` |

The quality report lists all 13 Medium and 18 Low defects (Q-04 to Q-34). Two Medium defects matter most:

- **Q-04** (SEC-F2): the main thread freezes for 3.6–6.4 s.
- **Q-07** (F-1): a file error is silently cleared when the comparison runs again.

## 5. Verified by the orchestrator

- **Q-20.** After Reset, the empty-results placeholder stays in the language that was active at the time of the Reset. Later language switches never update it. The branding agent reported this, and I reproduced it with a scratch Playwright script in both directions (EN→DE and DE→EN). **No automated test covers it yet.**
- **Performance.** The three spec 08 tests take 744–886 ms each, measured end to end. The spec only checks that each comparison finishes within 30 s.

## 6. What was not tested

- Real screen readers (VoiceOver, NVDA, JAWS).
- Firefox, WebKit/Safari and mobile browsers. All evidence comes from Chromium.
- Real OS drag-and-drop from Finder or Explorer.
- Performance as its own area: no owner, no timing budget, no memory or render measurements.
- Visual regression: no approved screenshot baselines exist.
- Real Windows High Contrast (only emulated), touch devices, and hosted deployment (CSP and security headers).
- A native-speaker review of the German text.

## 7. Recommended next actions

1. **Independent-oracle diff testing** for Q-01 and Q-02. Compare the engine against a reference LCS/Myers diff across prose, code and multilingual input up to 10,000 characters, with all four option combinations.
2. **Fix Q-03** (focus-ring contrast), then re-run the a11y and branding agents. The a11y agent should also check Q-14 and Q-15.
3. **Fix the shared tokenizer/classifier** behind Q-02, Q-04, Q-09 and Q-18, then re-run the functional, i18n and security agents.
4. **Make the dashboard honest.** `scripts/build-dashboard.js` counts `test.fail()` tests as passed. Show them as a separate "known defect" count.
5. **Assign a performance owner** and agree timing budgets.
6. **Install matching Firefox and WebKit builds** (`npx playwright install firefox webkit`). Arrange a manual check of screen readers and real OS drags.

## 8. Changes made during this run

- **New specs:** `tests/10-functional-gaps.spec.js`, `11-i18n.spec.js`, `12-a11y.spec.js`, `13-branding-style.spec.js` and `14-security.spec.js`.
- **Extended spec:** `tests/09-file-drop.spec.js` has 8 new tests.
- **Reports:**
  - `reports/agents/*`: 7 reports, `gap-summary.json` and `branding-evidence/`.
  - `reports/test-report.md`: this file.
  - `reports/gap-analysis.html`.
- **Scripts:**
  - `scripts/build-gap-analysis.js` and `scripts/gap-analysis-template.html` generate the treemap from the agent reports.
  - `package.json` has two new scripts: `npm run gap-analysis` and `npm run gap-analysis:open`.
- **Dashboard:** `reports/dashboard.html` and `history.json` were updated by `npm test`.
- **Unchanged:** `comparinator.html`, `tests/helpers.js` and specs 01–08.
