# Functional Quality Report: Comparinator

| Field | Value |
|---|---|
| Agent | Functional Testing Agent |
| Date | 2026-09-16 |
| Build | `comparinator.html` sha256 `7424092aad7e86b1cd3f25a58a943b69e756b819ebfe700c099f3c937f941bb4` (modified 2026-09-16 21:41) |
| Environment | Chromium (Playwright Desktop Chrome), app served at http://127.0.0.1:4173/comparinator.html |
| Baseline | Full `npm test` run before this assessment: 148 passed, 0 failed |

### Tests run for this report

| Spec | Tests | Passed | Failed | Notes |
|---|---|---|---|---|
| tests/01-core-comparison.spec.js | 19 | 19 | 0 | |
| tests/02-options.spec.js | 11 | 11 | 0 | |
| tests/03-counters-wordcount.spec.js | 8 | 8 | 0 | |
| tests/04-metrics-highlighting.spec.js | 8 | 8 | 0 | |
| tests/05-controls-and-reset.spec.js | 12 | 12 | 0 | |
| tests/08-performance-large-input.spec.js | 3 | 3 | 0 | |
| **tests/10-functional-gaps.spec.js (new)** | 12 | 12 | 0 | 3 use `test.fail()` on purpose to document FD-01, FD-02 and FD-03 |
| **Total** | **73** | **73** | **0** | |

Exploratory probes (about 45 scenarios) ran as scratch scripts. Their output and screenshots are in
`<scratch dir>` (`probe*.js`, `probe*-out.txt`, `greedy-code-delete.png`, `empty-compare.png`).

---

## Executive summary

The main workflow works on this build: type or paste text, Compare, review the results, then Reset. It also gives correct results for typical prose, including text close to the 10,000-character limit. The Ignore Case and Ignore Punctuation options behave correctly in all four combinations. Changing an option after a comparison recalculates the results. Reset clears the comparison and keeps the Accessibility Menu preferences. The page raised no errors during rapid Compare/Reset or option toggling.

I found one **High** defect. When the input is token-dense, the engine switches to an approximate "greedy" fallback. Source code is a typical example, and the app explicitly accepts .js, .py, .css and .html files. In that mode, a simple deletion of 5 lines is reported as 882 "different" items, and similarity drops to 67.8% when it should be about 98.7%. The metrics and highlighting are wrong, and nothing tells the user.

I also found three **Medium** defects and two **Low** defects, and noted several requirement ambiguities (see below).

**Overall functional confidence: Moderate-High for prose; Low for token-dense input (code, short tokens) near the character limit.**

**Release recommendation: Ready with Known Risk.** The app is acceptable for prose comparison. FD-01 should be fixed, or at least disclosed in the UI, before users are encouraged to compare source files.

## Build / change tested

The build is the hash shown above. I was not given a change description, so I ran full regression across the functional areas. The recent file-drop feature belongs to spec 09 and the drag-n-drop agent. I only exercised it indirectly, as a way code files can reach the engine.

## Test areas and data covered

| Area | Data / scenarios |
|---|---|
| Text input | empty, whitespace-only, tabs/CRLF/multi-newline, pasted clipboard text (CRLF normalised to LF), emoji (UTF-16 counting), CJK, Devanagari, NFC/NFD accents, 10,000-char single word |
| Limits | fill 10,050 chars (truncated to 10,000), typing past the limit (blocked), counter warn/limit classes, a programmatic 20,000-char value (Compare still works) |
| Compare | repeated Compare, re-compare after edit, stale results after edit (no Compare), language switch with edited text |
| Options | 4-way IC/IP matrix, 11 rapid toggles, apostrophes, hyphens, decimals, underscores, `ß`, Turkish `İ` |
| Metrics | identical, disjoint, partial, reordered, empty, one side empty, near-limit prose (LCS path), token-dense code and repeated vocabulary (greedy path) |
| Word counts | multiple spaces, newlines, punctuation, Unicode, punctuation-only text |
| Highlighting | counts of `.token.same`/`.token.different` compared with the stats in every probe |
| Reset | text, counters, stats, results, summary, options, dark mode, a11y prefs (preserved), focus to Text A |
| Robustness | 20 real-click Compare/Reset cycles, 50 synchronous cycles, page reload (state cleared), pageerror listener |

## Passed checks (highlights)

- All 61 existing functional tests (01-05, 08) pass.
- The IC/IP combination matrix gives correct results (FG-01). Toggling an option after Compare gives the same result as a fresh Compare (FG-02).
- The 10,000-character limit is enforced when typing and when filling or pasting (FG-03, TC-33, TC-34). The counter shows `10,000 / 10,000` with the `limit` class.
- Whitespace-only input counts 0 words and both fields are flagged with `aria-invalid` (FG-04).
- Prose close to the limit (1,997 × 1,975 tokens) stays on the exact LCS path. A deleted paragraph is reported exactly: 0 different and 21 missing (FG-08).
- Reset keeps the Accessibility Menu preferences in the DOM and in localStorage, and moves focus to Text A (FG-06).
- Rapid Compare/Reset produced no page errors and a consistent final state (FG-07).
- A very long single word and an oversized programmatic value are handled (FG-09).
- In every probe, the highlighted-token counts matched the reported Different/Missing counts, apart from the documented inheritance of ignored punctuation.

## Defects

### FD-01 (High): The greedy fallback reports wrong metrics and highlighting for token-dense input
- **Where:** `lcsOperations()` switches to `greedyOperations()` when `(n+1)*(m+1) > 4,500,000`, which means more than about 2,120 comparable tokens per side. The greedy search only looks 24 tokens ahead (`WINDOW = 24`), so any inserted or deleted block longer than 24 tokens misaligns everything after it.
- **Repro:** Put about 8,600 characters of code (`x0[i] = y[j0] + 0;` × ~500 lines, 4,788 tokens) in A. Put the same code minus 5 lines in B. Click Compare.
- **Expected:** Matching 4,728, Different 0, Missing 60, Similarity about 98.7%.
- **Actual:** Matching 3,846, **Different 882**, Missing 60, **Similarity 67.8%**, Accuracy 80.3%. Evidence: `probe3-out.txt`, `greedy-code-delete.png`. Repeated-vocabulary prose shows the same problem: deleting the first 30 of 2,500 words gives 20 false replacements (`probe-out.txt`).
- **Impact:** The results are silently wrong, and the UI gives no sign that the results are approximate. The app invites .js/.py/.css/.html files, which are token-dense.
- **Fix:** Use a linear-space diff (Myers/Hirschberg) instead of the greedy fallback, or anchor on unique tokens (patience diff). At minimum, show a notice when the results are approximate. Test: FG-10 (`test.fail`).

### FD-02 (Medium): Empty or whitespace-only comparison reports contradictory results
- **Repro:** Leave both fields empty (or enter only whitespace, or only punctuation with Ignore punctuation on). Click Compare.
- **Actual:** Similarity **100.0%**, Accuracy **0.0%**, and the summary says "**Match:** The texts are equivalent…", while both fields show "Text is empty" errors. The screen-reader announcement repeats the contradiction. Evidence: `empty-compare.png`, `probe2-out.txt`.
- **Why:** `similarity` returns 100 when `unionSize === 0`, but `accuracy` uses `max(...,1)` as its denominator and returns 0.
- **Fix:** Pick one defined result for empty input, for example "—" for both metrics with no "Match" summary, or block Compare. This needs a product decision. Test: FG-11 (`test.fail`).

### FD-03 (Medium): Combining marks are tokenised as punctuation, which causes false matches and split words
- **Where:** `tokenize()` and `isPunctuation()` use `\p{L}\p{N}`, which leaves out `\p{M}`.
- **Repro:** Turn on Ignore punctuation and compare `कि` with `का`. The result is **100% similarity / Match**, but the words differ. NFD `café` matches `cafe` (the accent is dropped). NFD `résumé` is split into separate tokens. With the option off, `नमस्ते` counts as Word Count 1 but Matching 4.
- **Impact:** Wrong results for Hindi and other Indic scripts, Thai, and decomposed Latin text. This should also go to the I18N agent.
- **Fix:** Add `\p{M}` to the word class and the punctuation test (`[\p{L}\p{M}\p{N}_]`). Test: FG-12 (`test.fail`).

### FD-04 (Medium): Results go stale after an edit, and a language switch silently recomputes them
- **Repro:** Compare `Hello world` with `Hello world` (100%). Change Text B to `Totally different` and do not click Compare. The results still show 100% for the old text, with no stale indicator. Then switch to DE: the results are recalculated from the new text without the user clicking Compare (0,0%). Evidence: `probe-out.txt`.
- **Impact:** Screenshots or decisions can be based on results that no longer match the visible input. It is also inconsistent that a language switch recalculates while an edit does not.
- **Note:** No requirement defines this behaviour (ambiguity A-3). Recommend a "results out of date" indicator, or clearing the results on input. No automated test was added until the expected behaviour is decided.

### FD-05 (Low): "Words" labels count tokens, not words
- `Hello, world!` gives Word Count 2 but **Matching Words 4**. `don't stop` compared with `dont stop` reports 1 different and 2 missing "words". `!!!` compared with `???` gives Word Count 1 and **Different Words 3**. The stat labels say "Words", but the engine counts tokens, and punctuation marks count as tokens. The results are hard to explain.
- **Fix:** Rename the labels to "items", or count at word level. This needs a product decision.

### FD-06 (Low): Ignore case does not handle Unicode case folding, and text is not normalised
- `STRASSE` compared with `straße` does not match with Ignore case on. `İstanbul` compared with `istanbul` does not match either. NFC `café` compared with NFD `café` scores 0% similarity even though the two look identical. Route to the I18N agent. Recommend `normalize('NFC')` and, if wanted, full case folding.

## Requirement ambiguities (not invented)

- **A-1 Accuracy formula:** The UI says only that Accuracy "measures how faithfully Text B reproduces" Text A. The code uses `matches / max(|A|,|B|)`. No product-owned formula exists to check against, so tests 04 and 10 only confirm that the code is self-consistent.
- **A-2 Empty input:** No requirement defines the metrics when either side is empty (see FD-02).
- **A-3 Stale state:** No requirement defines what happens to results when the input changes after Compare (see FD-04).
- **A-4 Reset scope:** Reset clears dark mode and both comparison options (TC-54/55 treat this as intended). It is unclear whether dark mode counts as a preference that should survive Reset. Accessibility Menu preferences are preserved.
- **A-5 Refresh:** A reload clears all text and results. No persistence requirement exists.
- **A-6 Character counting:** The limit and the counter count UTF-16 code units, so 5,000 emoji fill the 10,000 limit. This matches the browser's `maxlength`, but no requirement says whether the limit counts characters or code units.

## Areas not tested
- Browsers other than Chromium (Firefox, WebKit, mobile).
- File-drop loading as a whole (spec 09, owned by the drag-n-drop agent). Accessibility, security, visual and German-locale checks belong to other agents.
- Real paste via OS context menus, IME composition input, and undo/redo in the textareas.
- Memory use and timings beyond the pass/fail thresholds in spec 08.

## Remaining risk
- The greedy fallback (FD-01) is the largest correctness risk. Any document with more than about 2,120 tokens per side and an edit block longer than 24 tokens gets unreliable metrics.
- There is no authoritative metric specification, so "correct" means "consistent with the code" (A-1, A-2).
- Only Chromium was tested.

## Release recommendation
**Ready with Known Risk.** Fix FD-01 (or show an "approximate results" notice) and settle A-1, A-2 and A-3 before advertising code-file comparison.

---

## Gap analysis data

| Area | Risk (1-10) | Confidence (Strong/Partial/Weak/Gap/Unknown) | Known issue (None/Known issue/Significant risk/Blocker) | Evidence | Notes |
|---|---|---|---|---|---|
| Compare Engine | 10 | Partial | Significant risk | 01 (19/19), 04 (8/8), FG-08 pass, FG-10 xfail, probe3 | LCS path is correct. Greedy fallback (>~2,120 tokens/side) gives wrong alignment (FD-01) |
| Text Input | 7 | Strong | Known issue | 01 TC-22..27, FG-04, FG-05, probes (paste, CRLF, emoji, CJK, NFD) | Combining marks tokenised as punctuation (FD-03) |
| Character Limits | 6 | Strong | None | 03 TC-30..34, FG-03, probe (fill 10,050, typing, emoji) | Limit counts UTF-16 units (A-6) |
| Compare Action | 9 | Partial | Known issue | 05 TC-47/69/70, FG-07, probe stale-state | Stale results after edit; language switch recomputes silently (FD-04) |
| Ignore Case | 7 | Strong | Known issue | 02 TC-11..13/48, FG-01, FG-02 | No Unicode case folding (ß, İ) (FD-06) |
| Ignore Punctuation | 7 | Strong | Known issue | 02 TC-14..18/46/49, FG-01, FG-12 xfail | Erases combining vowel signs, false 100% match (FD-03) |
| Combined Options | 6 | Strong | None | 02 TC-16, FG-01 (all 4 combos), FG-02 | |
| Similarity Calculation | 9 | Partial | Significant risk | 04 TC-38, 01 TC-01/02/07, FG-11 xfail, probes | Wrong under greedy path (FD-01). 100% for empty input (FD-02) |
| Accuracy Calculation | 8 | Partial | Known issue | 04 TC-39/40, 01 TC-09/10, FG-11 xfail | Formula not specified by product (A-1). 0% vs 100% similarity on empty (FD-02) |
| Word Count A | 5 | Strong | Known issue | 03 TC-35/37, FG-04, FG-05, probes | Count is correct, but "Matching Words" counts tokens, not words (FD-05) |
| Word Count B | 5 | Strong | Known issue | 03 TC-36/37, FG-04, probes | Same label/token inconsistency as A (FD-05) |
| Difference Highlighting | 8 | Partial | Significant risk | 04 TC-44/45, 01 TC-03..06, probe token counts | Matches stats on LCS path. Highlights false differences under greedy path (FD-01) |
| Results & Output | 7 | Partial | Known issue | 01 TC-08..10, 05 TC-47, probes (summary text) | "Match" summary on empty input (FD-02). Token vs word labels (FD-05) |
| Reset | 6 | Strong | None | 05 TC-50..55, FG-06, FG-07 | Preserves a11y prefs. Dark-mode reset scope ambiguous (A-4) |
| Application State | 6 | Partial | Known issue | FG-02, FG-07, probes (reload, stale, language switch) | Stale-state behaviour undefined (FD-04, A-3). Reload clears state (A-5) |
| Error Handling | 6 | Partial | Known issue | 01 TC-08..10, FG-04, FG-11 xfail, pageerror listener (0 errors) | Empty-field errors shown, but metrics contradict them (FD-02) |
| Boundary Conditions | 8 | Partial | Significant risk | 08 (3/3), FG-03, FG-08, FG-09, FG-10 xfail | Near-limit prose OK. Token-dense near-limit input is wrong (FD-01). Chromium only |
