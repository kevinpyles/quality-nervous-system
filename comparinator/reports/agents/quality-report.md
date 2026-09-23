# Comparinator Quality Report

| Item | Value |
|---|---|
| Agent | Comparinator Quality Agent (running as a subagent; no other agents started) |
| Date | 2026-09-16 |
| Build | `comparinator.html` sha256 `7424092aad7e86b1cd3f25a58a943b69e756b819ebfe700c099f3c937f941bb4` (I re-checked the hash at the start of this assessment) |
| Environment | Chromium (Playwright 1.62.1), http://127.0.0.1:4173/comparinator.html |
| Inputs | Six specialist reports in `reports/agents/` (all dated 2026-09-16, all for this build), `performance-gap-data.md` (orchestrator, evidence only), final `npm test` results (`test-results/results.json`), plus my own verification probes |
| Skill used | `comparinator-text-comparison-testing` (used to spot-check the comparison engine) |

## Recommendation
**Not ready**

Three High defects are open. Two of them make the product's main output wrong without any warning to the user:

- **Q-01:** Token-dense input, such as the code files the app explicitly accepts, gets wrong similarity and wrong highlighting.
- **Q-02:** With Ignore punctuation on, different Hindi, Thai or decomposed-accent words are reported as a 100 % "Match".
- **Q-03:** The default keyboard focus ring fails requirement A11Y-018 and WCAG 1.4.11 for every keyboard user.

Several release-relevant evidence gaps are also open: no real screen reader, Chromium only, no real OS drag, no performance owner, and no visual baselines.

**Human checkpoint.** A release owner could decide to ship only as an English/German tutorial for prose comparison. In that case the recommendation could become **Ready with known risk**, but only if all of the following hold:

1. Q-03 is fixed. It is a one-token CSS change.
2. Q-01 and Q-02 are either fixed or disclosed in the UI.
3. The owner explicitly accepts the risks listed below.

That is a decision about release policy and risk tolerance, so this agent does not make it.

## What changed
- No change description was provided. The build under review adds drag-and-drop and Choose-file loading (A11Y and DnD reports). It differs from the 2026-09-15 build (96,956 bytes, now 105,646 bytes). All specialists therefore ran a full regression. This assessment treats the whole product as in scope.
- **What success means:** A user can load or type two texts in English or German, compare them, and get correct statistics and highlighting. The workflow must be accessible and secure, and must work within the 10,000-character limit.
- **Requirements that are still undefined** (functional report A-1…A-6):
  - The accuracy formula.
  - Metrics for empty input.
  - Whether results should go stale after an edit.
  - Whether Reset should clear dark mode.
  - Whether the limit counts characters or UTF-16 code units.

  I did not invent answers for these. Each one is recorded as a risk.

## What we tested
Specialist coverage (from their reports) plus my verification:

| Area | Owner / report | Tests | Specialist verdict |
|---|---|---|---|
| Functional | functional-report.md | Specs 01–05 and 08, plus new spec 10 (73 tests); ~45 exploratory probes | Ready with known risk |
| Accessibility | a11y-report.md | New spec 12 (17 tests) and spec 07; axe in 9 states; pixel contrast; focus-ring measurement; forced colors | Conditional go, fix HIGH-1 |
| I18N | i18n-report.md | New spec 11 (38 tests); 45 Unicode cases; EN/DE at 4 widths; RTL | Conditional go for en/de |
| Branding | branding-style-report.md | New spec 13 (19 tests); 126 screenshots at 7 viewports × 9 states | Release with minor fixes |
| Security | security-report.md | New spec 14 (34 tests) and spec 06; 16 payload families; storage, network and dependency checks | Acceptable for tutorial with conditions |
| Drag-and-drop | drag-n-drop-report.md | Spec 09 (86 tests, 8 new); CDP trusted drag; oversized-file probes | Release with conditions |
| Performance | **no owner**; performance-gap-data.md | Spec 08 pass/fail only | Evidence only |

**Final full suite (`npm test`, run after all agents finished).** I re-tallied `test-results/results.json` and it matches the orchestrator's figures:

- 276 tests: 273 passed, 3 failed, 0 skipped, 0 flaky.
- 24 of the passes are `test.fail()` known-defect markers: spec 09 has 3, spec 10 has 3, spec 11 has 10, spec 12 has 5, spec 13 has 3.
- All 3 failures are in spec 14. They are the deliberate defect tests for SEC-F1 (×1) and SEC-F2 (×2), and SEC-F2 blocked the main thread for 5,581 ms and 3,308 ms.
- **The pass count is not a quality signal.** 27 tests exist to document known defects.

**My own verification** (scratch probes `verify.js` and `x1.js`, Chromium, this build):

| Scenario | Expected | Observed | Status |
|---|---|---|---|
| V1: identical prose | 100 % / 100 %, 0 diffs | 100.0 % / 100.0 %, 4 matching, 0 diffs | Pass |
| V2: ~9,779 chars of code, B = A minus 5 lines (FD-01) | ~45 missing, 0 different, similarity near 99 % | **790 different**, 45 missing, **69.3 %** similarity | Defect reproduced |
| V3: both empty (FD-02) | Undefined (A-2) | 100.0 % similarity, 0.0 % accuracy, "Match: The texts are equivalent…" | Contradiction reproduced |
| V4: `कि` vs `की`, Ignore punctuation on (I18N-01) | Different | 100.0 % / Match | Defect reproduced |
| V5: 10,000 `!` vs 10,000 `?`, Ignore punctuation on (SEC-F2) | Responsive | Compare click blocked for **5,263 ms** | Defect reproduced |
| V6: Compare → Reset → DE; then DE → Compare → Reset → EN, and DE → EN again | Placeholder follows the language | Stays in the language active at Reset. The placeholder has no `data-i18n` attribute | Defect reproduced (I18N-X1) |
| V7: `--gold-ring` token | Opaque enough for 3:1 | `rgba(169,117,10,.30)` | Consistent with A11Y-HIGH-1 |

## What we discovered

### Consolidated defect table
Defects that share a root cause are merged. The IDs in the "Source" column point back to the specialist reports.

| ID | Severity | Area | Summary | Source report(s) |
|---|---|---|---|---|
| Q-01 | **High** | Functional / Compare engine | Above ~2,120 tokens per side the diff falls back to a greedy search with a 24-token window. Any edit block longer than 24 tokens then misaligns everything after it. The result is false differences and wrong similarity and accuracy, and the UI does not say the results are approximate. Code files, which the app accepts, hit this easily. | functional FD-01; perf-gap; verified V2 |
| Q-02 | **High** | I18N / Functional | The tokenizer and `isPunctuation()` leave out `\p{M}` (combining marks), so marks count as punctuation. With Ignore punctuation on, this gives false 100 % "Match" results for Hindi, Thai and NFD accents. It also splits Hebrew, Arabic and Indic words and inflates their counts. | i18n I18N-01 = functional FD-03; verified V4 |
| Q-03 | **High** | Accessibility | The default focus ring measures ≈1.4:1 in light mode and ≈2.6:1 in dark mode, below the 3:1 required by A11Y-018 and WCAG 1.4.11. It passes only with Keyboard navigation mode or High contrast turned on. | a11y A11Y-HIGH-1; branding (noted as faint); verified V7 |
| Q-04 | Medium | Security (availability) / Performance | `classifySource()` runs in O(n²) with Ignore punctuation on. At 10,000 punctuation characters or combining marks, the main thread freezes for 3.0–6.4 s. The freeze repeats on every option toggle or language switch. Q-02's classification of marks makes this worse. | security SEC-F2; perf-gap; verified V5 |
| Q-05 | Medium | Functional | Empty or whitespace-only input shows 100 % similarity, 0 % accuracy and a "Match" summary, next to "Text is empty" errors. | functional FD-02; verified V3 |
| Q-06 | Medium | Functional / State | Results go stale after an edit and show no indicator. A language switch silently recomputes them from the new text. | functional FD-04 |
| Q-07 | Medium | Drag-and-drop / Accessibility | An unresolved file error, including its `aria-invalid`, is silently cleared by auto-compare, an option toggle or Compare. | dnd F-1; a11y cross-ref |
| Q-08 | Medium | I18N | No Unicode normalization. Visually identical NFC and NFD text scores 0 %. | i18n I18N-02 = functional FD-06 (normalization part) |
| Q-09 | Medium | I18N | Symbols and emoji count as punctuation. With Ignore punctuation on, `🍕`/`🍔` and `€`/`$` report as a Match, and ZWJ emoji are split per code point. This is the same function as Q-02, but a different character class. | i18n I18N-03 |
| Q-10 | Medium | I18N | RTL text is displayed with an LTR base direction because no `dir="auto"` is set. | i18n I18N-04 |
| Q-11 | Medium | Accessibility | A long file name clips the whole file-error message at 320 px, and at 1280 px with 200 % text. | a11y A11Y-MED-1 |
| Q-12 | Medium | Accessibility | Light theme: the empty-results text measures 3.10:1 and the placeholder 2.63:1 (3.75:1 in dark). Both are below 4.5:1. | a11y A11Y-MED-2 |
| Q-13 | Medium | Accessibility | In forced-colors mode, the switch thumb disappears, so on and off look the same. | a11y A11Y-MED-3 |
| Q-14 | Medium | Accessibility / Branding | The amber near-limit counter (`.counter.warn`) measures 3.41:1 at 12 px in light mode. **The a11y report does not cover it.** | branding BRD-04 |
| Q-15 | Medium | Branding / Accessibility | The textarea focus ring is cut off on the left and right by `.panel{overflow:hidden}`, even in keyboard mode. | branding BRD-02 |
| Q-16 | Medium | Branding | When the input footer wraps, its text sits 0 px from the rounded panel edge. | branding BRD-01 |
| Q-17 | Low | Security | The length limit is enforced only by `maxlength`. Text set by script (20,000 chars) is compared without an error. | security SEC-F1 |
| Q-18 | Low | Functional / I18N | "Words" statistics count tokens, and word count and comparison use different segmentation. Examples: `Hello, world!` shows 2 words but 4 matching. Unspaced CJK text is compared as a single token. | functional FD-05; i18n I18N-07 |
| Q-19 | Low | I18N | Ignore case is not full or locale-aware case folding: ß/SS, Turkish İ and non-final σ fail. It uses the browser locale, not the UI locale. | i18n I18N-05 = functional FD-06 (case part) |
| Q-20 | Low | I18N | **I18N-X1:** After Reset, the empty-results placeholder stays in the language that was active at Reset. Later language switches never update it (EN→Reset→DE stays English; DE→Compare→Reset→EN stays German). | branding cross-finding; orchestrator verification; verified V6 |
| Q-21 | Low | I18N | The hard-coded English `aria-label="Language selector"`, and the EN/DE buttons have no `lang` attribute. | i18n I18N-06 |
| Q-22 | Low | I18N | German summary sentence is assembled from fragments, which causes a case-agreement error ("mit 1 hinzugefügtes Element"). | i18n I18N-09 |
| Q-23 | Low | I18N | Percentages are formatted by hand ("66,7%" instead of the de-DE "66,7 %"). | i18n I18N-08 |
| Q-24 | Low | I18N | `t()` has no fallback for missing keys. The chosen language is not saved and the browser language is not detected. Duplicate and dead keys exist. | i18n I18N-10 |
| Q-25 | Low | Accessibility | Small muted text measures 4.16–4.34:1 where it sits over panel shadows. | a11y A11Y-LOW-1 |
| Q-26 | Low | Accessibility | The Accessibility Statement does not mention file loading, and its reporting address is a placeholder. | a11y A11Y-LOW-2 |
| Q-27 | Low | Branding | On first load, the results placeholder is offset by whitespace from the source markup. | branding BRD-03 |
| Q-28 | Low | Branding | The off-switch track colour is blue-grey, not the warm colour the guide specifies. | branding BRD-05 |
| Q-29 | Low | Branding | Hover colours are hard-coded instead of using tokens. | branding BRD-06 |
| Q-30 | Low | Branding | The HUD corner brackets in the drawer overlap scrolled content. | branding BRD-08 |
| Q-31 | Low | Branding (obs.) | The floating Accessibility button covers stat tiles and results on tablet and mobile while scrolling. | branding BRD-09 |
| Q-32 | Low | Branding (docs) | The app and style guide differ in ways the guide does not record (green, gold-text, type sizes, disabled opacity and others). | branding BRD-07 |
| Q-33 | Low | Drag-and-drop | CRLF files are checked against the limit before line endings are normalised. A binary `.txt` file loads as replacement characters. The dashed drag outline is weak in high-contrast mode. | dnd O-2, O-3, O-4 |
| Q-34 | Low | Security (obs.) | Bidi controls in file names are displayed as-is and can spoof the extension. U+0000 is dropped from rendered output. `textScale` from storage is coerced loosely. | security P1–P3 |

The following are hardening items and not defects: H1 (CSP and security headers), H2 (DOM APIs instead of `innerHTML`), H3 (the page can be framed), and H4 (`npm audit` reports `qs` as moderate, dev-only; `axe-core` is installed but not declared).

### Other discoveries
- **Test reporting risk.** `scripts/build-dashboard.js` maps Playwright's `expected` status to "passed" (line 34), so all 24 `test.fail()` known-defect tests show as green on `reports/dashboard.html`. Only SEC-F1 and SEC-F2 are visible as failures. Anyone who reads the dashboard alone will underestimate the open defects (security H5).
- **Cross-finding gaps between specialists.**
  - The a11y agent did not assess Q-14 (amber counter contrast) or Q-15 (clipped textarea focus ring). Both are WCAG-relevant.
  - Q-20 (I18N-X1) is not in the i18n report and has no automated test.
- **Unowned root-cause cluster.** Q-02, Q-04, Q-09 and Q-18 all come from the same tokenizer and classifier code (`tokenize()`, `isPunctuation()`, `classifySource()`). One engine fix will change the behaviour covered by specs 10, 11 and 14 together, so regression risk is concentrated there.
- **Requirement ambiguities are still open:** A-1 (accuracy formula), A-2 (empty input), A-3 (stale results), A-4 (Reset scope), A-6 (UTF-16 counting). Because A-1 is open, "correct accuracy" currently means only "consistent with the code".
- **Stale artifact.** The root-level `./a11y-report.md` (2026-09-15) is for an older build and must not be used as evidence. The root `./drag-n-drop-report.md` (22:14 today, same build) is superseded by `reports/agents/drag-n-drop-report.md`.

## What we did not test
- **Real screen readers** (VoiceOver, NVDA, JAWS, TalkBack). All assistive-technology claims rest on the Chromium accessibility tree and on live-region DOM text. This was not done in English or in German.
- **Firefox, WebKit/Safari and mobile browsers.** All evidence is Chromium only. The installed Firefox and WebKit builds do not match Playwright 1.62.1.
- **Real OS drag-and-drop from Finder or Explorer**, including checking that the browser does not leave the app on an outside drop. The drag-and-drop brief requires this, and it was not done.
- **Performance, which has no owner.** No measurements exist for compare time or render time, memory, input latency, repeated-run degradation, or rapid Compare/Reset timing. Spec 08 checks only that a comparison finishes within 30 s. The only real timing data comes from security (SEC-F2) and one 100-run heap check.
- **Visual regression.** No approved pixel baselines exist.
- **Real Windows High Contrast, real browser zoom, touch devices, voice control, switch access and magnifiers.**
- **Hosted deployment** (CSP, headers, HTTPS), because no hosted environment exists.
- **Folder drops, non-UTF-8 files, IME composition, and undo/redo** in the textareas.
- **A native-speaker review of the German text.**
- **My own work:** I did not re-run `npm test` or any spec. I did not re-test Medium or Low findings beyond V1–V7.

## Current risks and unknowns
1. **Silent wrong results (Q-01, Q-02, Q-09).** This is the largest risk to the product's core promise. How much input falls into the greedy fallback is unknown: FD-01 was found by a targeted probe, not by an independent oracle.
2. **Accessibility conformance is unverified.** Q-03 is a confirmed failure of a requirement. Screen-reader behaviour has not been checked by a human.
3. **Cross-browser behaviour is unknown.** Tokenizer regex, `toLocaleLowerCase`, bidi handling, `maxlength` and drag events can all differ between browsers.
4. **Availability.** Q-04 lets a shared file freeze the tab for several seconds. Performance has no owner and no budget.
5. **Specification gaps (A-1…A-6).** Several behaviours cannot be called correct or incorrect until product decides.
6. **Reporting.** The dashboard hides 24 known defects as passes.
7. **Undetected visual regressions**, because no baselines exist.

## Evidence
- Specialist reports (all dated 2026-09-16, build `7424092a…`):
  - `reports/agents/functional-report.md`
  - `reports/agents/a11y-report.md`
  - `reports/agents/i18n-report.md`
  - `reports/agents/branding-style-report.md` (plus `reports/agents/branding-evidence/`)
  - `reports/agents/security-report.md`
  - `reports/agents/drag-n-drop-report.md`
  - `reports/agents/performance-gap-data.md`
- Suite results: `test-results/results.json` (start 2026-09-17T04:56:09Z UTC, 276 tests, 273 expected, 3 unexpected). Dashboard: `reports/dashboard.html`.
- Known-defect specs: `tests/10-functional-gaps.spec.js`, `tests/11-i18n.spec.js`, `tests/12-a11y.spec.js`, `tests/13-branding-style.spec.js`, `tests/09-file-drop.spec.js` (all use `test.fail()`), and `tests/14-security.spec.js` (tests that fail on purpose).
- My probes and output are in the scratch folder `<scratch dir>`:
  - `verify.js`, `verify-out.txt`
  - `x1.js`, `x1-out.txt`
- Specialist scratch evidence is in the sibling folders `functional/`, `a11y/`, `i18n/`, `security/`, `dnd/` and `branding/` in the same scratchpad. It is not committed.
- **Changes made by this agent:** I wrote this report only. I did not modify any test, helper or application file.

## What should happen next
1. **Human decision (release owner):**
   - Decide the release scope: English/German prose tutorial only, or code and multilingual comparison too.
   - Decide whether any of Q-01, Q-02 or Q-04 may ship as accepted risk.
   - Resolve A-1 (accuracy formula), A-2 (empty-input result) and A-3 (stale-result behaviour).
2. **Fix before release:**
   - Q-03 (focus ring).
   - Q-01 (a linear-space diff, or at least an "approximate results" notice).
   - Q-02 (add `\p{M}` to the tokenizer).
   - Recommended in the same pass: Q-04 (make `classifySource()` linear) and Q-09 (treat only `\p{P}` as punctuation). These touch the same code.
3. **Most important next testing action:**
   - Build an independent-oracle differential test for the comparison engine. Compare Comparinator's matching, different and missing counts with a reference Myers/LCS diff on generated inputs up to 10,000 characters: prose, code, repeated vocabulary, and multilingual text with combining marks and emoji, with all 4 option combinations.
   - Why this matters: this is the only way to measure how often results are silently wrong today, and to prove that the engine fix is correct rather than just different.
4. **Specialists to re-run after the fixes.** No report is stale for the current build, so none needs to run again today.
   - **functional-agent and i18n-agent:** after the engine and tokenizer fix, because Q-01, Q-02, Q-09 and Q-18 share code. The i18n agent should also add a test for Q-20 (I18N-X1).
   - **security-agent:** to retest SEC-F2 timing after the `classifySource()` fix.
   - **a11y-agent and branding-style-agent:** after the CSS fixes for the focus ring and contrast (Q-03, Q-12, Q-14, Q-15). The a11y agent should also assess Q-14 and Q-15, which its report does not cover.
   - **drag-n-drop-agent:** after running `npx playwright install firefox webkit` and with a human available for the real OS drag checklist. Its F-1 fix (Q-07) also needs a retest.
5. **Close the evidence gaps:**
   - Run a human screen-reader pass (VoiceOver and NVDA, EN and DE).
   - Run the Firefox and WebKit projects.
   - Assign a performance owner with a timing budget.
   - Approve visual baselines.
6. **Fix the tooling:** make the dashboard show `test.fail()` known defects separately from real passes, and declare `axe-core` in `devDependencies`.
