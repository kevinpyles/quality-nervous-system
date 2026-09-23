# Comparinator Drag-and-Drop Quality Report (re-verification)

- **Build under test:** `comparinator.html`, sha256 `7424092aad7e86b1cd3f25a58a943b69e756b819ebfe700c099f3c937f941bb4` (modified 2026-09-16 21:41). I checked the hash at the start and again after testing, and it did not change.
- **Date:** 2026-09-16
- **Browser:** Chromium (Playwright 1.62.1, headless, Desktop Chrome profile). **Firefox and WebKit could not be run** (see section 7).
- **Server:** the shared instance at http://127.0.0.1:4173 (I did not start or stop it).
- **Prior evidence:** `drag-n-drop-report.md` at the project root (22:14 today, same build). This pass re-verifies that report and targets the areas it left untested. It does not repeat all of its work.

### Tests run in this pass

| Run | Command | Result |
|---|---|---|
| Spec 09 before changes | `npx playwright test tests/09-file-drop.spec.js --reporter=list` | **78 passed**, 0 failed. This includes 2 `test.fail()` tests (F-1) that failed as expected. |
| New tests only | same command with `-g "re-verification"` | **8 passed**, 0 failed. This includes 1 new `test.fail()` test (F-1, Compare path) that failed as expected. |
| Spec 09 after changes | same command as the first run | **86 passed**, 0 failed |
| Full suite (all specs in `tests/`, list reporter only, run while other agents were still adding specs) | `npx playwright test --reporter=list --output=SCRATCH/dnd/pw-out` | 259 tests: **256 passed, 3 failed**. Specs 01–08 passed 70 of 70, and spec 09 passed 86 of 86. The 3 failures are all in `tests/14-security.spec.js`, which another agent owns. They are tagged `[KNOWN DEFECT SEC-F1/SEC-F2]` and are not related to file loading. |
| Baseline supplied by the orchestrator | `npm test` | 148 passed, 0 failed |

I did not run `npm test` in this pass, so `reports/dashboard.html` was not regenerated here.

## 1. Executive summary

The build is unchanged since the prior report, and its findings still hold. In Chromium, all 18 DND requirements pass in automation. **F-1 (Medium) is still present.** I also confirmed a third path for it that the first report had only seen in the code: clicking **Compare** wipes an unresolved file error, including its `aria-invalid`, on a field that still has text. There are no Critical or High defects.

This pass added 8 tests. They cover:
- drops on child elements
- Safari-style `dragleave` events
- URL and HTML drags
- whether a failed pair leaves existing results unchanged
- rejection time for multi-megabyte files
- the remaining German error texts
- whether a "Too many files" error follows the language switch while results are shown
- F-1 via Compare

The main remaining risk is still **real operating-system drags and non-Chromium browsers**. Neither could be exercised in this environment.

**Overall confidence:** High for the Chromium code paths. Medium to low for real OS drags in Safari and Firefox.

## 2. Requirements: result per DND ID

"Prior" means the evidence comes from the first report's tests, which I re-ran and which pass on this build. "New" means a test added in this pass.

| ID | Result | Evidence |
|---|---|---|
| DND-01 | PASS | Prior: single-file tests and the CDP trusted drag. New: "a drop on a child element (textarea, Choose file button) loads into that panel". |
| DND-02 | PASS | Prior: "dropping two files fills A and B"; CDP drop of two files on B. |
| DND-03 | PASS | Prior: "more than two files…". New: the "Too many files" error follows the language switch. |
| DND-04 | PASS | Prior: all five extensions, mixed case, `archive.tar.txt`, Unicode names. |
| DND-05 | PASS | Prior: `.pdf/.docx/.png/.exe/.md/.json`, no extension, dotfile, `notes.txt.exe`. |
| DND-06 | PASS | Prior: 9,999, 10,000 and 10,001 characters, including multibyte. New: a 20 MB `.txt` file is rejected in under 3 s. A scratch probe rejected a 200 MB file in 121 ms with the existing text kept. |
| DND-07 | PASS | Prior: four mixed and invalid pairs. New: a failed pair leaves the texts, statistics and result HTML unchanged. |
| DND-08 | PASS | Prior: only A loaded, B after A, typed text on the other side, whitespace-only file, empty file. |
| DND-09 | PASS | Prior: counter and word-count assertions. |
| DND-10 | PASS, with F-1 | Prior: a successful load clears that field's error and `aria-invalid`. F-1 affects the *other* field's error. |
| DND-11 | PASS (Chromium) | Prior: dashed outline, hint, move to a child element, leave, drop. New: the drag state comes back on the next `dragover` after a `dragleave` with a null `relatedTarget`, as Safari sends. The outline may flicker off for that one event. |
| DND-12 | PASS (simulated only) | Prior: `defaultPrevented` on the page body and outside areas. New: link and HTML drags (`text/uri-list`, `text/html`) are not intercepted. The browser not leaving the app is **not verified with a real drag**. |
| DND-13 | PASS | Prior: tab order, Enter and Space, accessible names, same file twice, `accept` attribute. |
| DND-14 | PASS | Prior: exact `#appStatus` text for every outcome. New: the German unsupported-file and read-error announcements. |
| DND-15 | PASS, with F-1 | Prior plus new: the German unsupported-type and read-error messages are exact. The "Too many files" error switches EN → DE → EN while results are shown. |
| DND-16 | PASS | Prior: Reset clears file errors and the drag state on both panels. |
| DND-17 | PASS | Prior: `<script>`, `onerror`, `javascript:`, `svg onload` and `iframe` payloads, and a malicious file name. The cross-browser probe never reached this step because the browsers would not start. |
| DND-18 | PASS | Prior: results from loaded files are identical to pasted results, with two option sets. |

## 3. Automated vs manual

- **Simulated (synthetic `DataTransfer`):** all 8 new tests and most prior tests. These are **not** proof that real OS drags work.
- **Trusted Chromium drag (CDP `Input.dispatchDragEvent`):** one prior test, re-run and passing.
- **Choose file:** `setInputFiles`. No native dialog was opened.
- **Scratch probes (Chromium):** oversized-file rejection time (1, 50 and 200 MB: 7, 37 and 121 ms), and a direct reproduction of F-1 through Compare.
- **Manual / real OS mouse drag: not performed.** This session has no interactive desktop, and no GUI automation tool is installed (`cliclick` is absent). Taking over the user's mouse while five other agents were running was also judged unsafe. The brief asks for at least the core cases to be confirmed with a real mouse drag. **That condition is still open.**

## 4. Confirmed findings

### F-1: A file error on one field is cleared whenever the comparison re-runs (Medium, still present)

- **Build:** `7424092a…`. The code is unchanged: `compare()` calls `showFieldError('a'|'b', rawX.trim() ? null : …)` without keeping file errors. Only `setLanguage()` saves and restores `fieldErrorState`.
- **Paths confirmed:**
  1. A successful auto-compare load into the other field.
  2. Toggling Ignore case or Ignore punctuation while results are shown.
  3. **New:** clicking Compare.
- **Steps to reproduce (path 3):**
  1. Type `ay text` in Text A and `bee text` in Text B.
  2. Drop `bad.gif` on Text B. `#errorB` shows "“bad.gif” is not a supported file type…" and `aria-invalid="true"` is set.
  3. Click **Compare Texts**.
  - **Actual:** `#errorB` becomes `hidden` with text `""`, `aria-invalid` is removed, and the status only says "Comparison complete. Similarity 33.3%…".
  - **Expected:** the file error stays until Text B is loaded, edited or reset. The language switch already keeps it.
- **Evidence:** three `test.fail()` tests in `tests/09-file-drop.spec.js`:
  - "a file error on B survives a successful auto-compare load into A" (prior)
  - "a file error survives toggling Ignore case while results are shown" (prior)
  - "a file error survives clicking Compare" (new)

  A scratch reproduction (`SCRATCH/dnd/f1.js`) printed `{"hidden":true,"text":"","inv":null}` after Compare.
- **Impact:** after an unresolved failed load, the visible and programmatic invalid state disappears. The user may believe the file loaded. Note that an explicit Compare clearing a stale message could be argued to be intended, so product should confirm path 3. Paths 1 and 2 are clearly inconsistent with how the language switch behaves.
- **Recommended fix:** in `compare()`, replace a field's error only with the empty-field error, or clear it only when it *is* an empty-field error. Keep `errorUnsupportedType`, `errorFileTooLarge`, `errorFileRead` and `errorTooManyFiles` until that field is loaded, edited (`input` event) or reset. When it is fixed, remove the three `test.fail()` lines.

### Observations carried over from the prior report (Low; build unchanged, not re-tested visually)

- **O-1:** The limit counts UTF-16 code units, so 5,000 emoji count as 10,000 characters.
- **O-2:** The length of a CRLF file is checked before line endings are normalised, so such files are rejected earlier than users expect.
- **O-3:** A binary file with a `.txt` extension is accepted and loads as inert replacement characters.
- **O-4:** The dashed outline is weak in high-contrast mode, but the text hint is still shown.

**Update to prior risk note:** the prior report flagged the cost of reading a large file with `file.text()` before the size check. In Chromium this is negligible: a 200 MB file was rejected in 121 ms. I now rate it as not a practical risk on desktop, but it was not measured on mobile.

## 5. Passed checks in this pass

- The build hash matches the orchestrator's value, and the prior report's scope applies to this build.
- All 78 prior spec 09 tests pass again. Both prior F-1 tests still fail as expected.
- A drop on the textarea or on the Choose file button bubbles to the correct panel and leaves no drag state behind.
- A Safari-style `dragleave` with a null `relatedTarget` does not leave the panel stuck. The next `dragover` restores the outline and the hint.
- Link and HTML drags from other tabs or apps are not intercepted: none of the 4 events on the panel, textarea or page body had `defaultPrevented` set, and no drop state appeared.
- A failed two-file drop leaves all statistics and `#resultA` HTML byte-for-byte unchanged.
- The German unsupported-type and read-error messages and their announcements are exact. The "Too many files" error follows EN → DE → EN while results are shown, and `aria-invalid` is kept.
- Regression: specs 01–08 passed 70 of 70.

## 6. Test changes

I made these changes in **`tests/09-file-drop.spec.js` only**. I appended a new block, `describe('File drop — re-verification additions')`, with **8 tests**:

1. a drop on a child element (textarea, Choose file button) loads into that panel
2. drag state recovers on the next dragover after a dragleave with no relatedTarget
3. a link or HTML drag (no files) is not intercepted and shows no drop state
4. a failed two-file drop leaves existing text and results unchanged
5. a 20 MB file with a supported extension is rejected promptly
6. German: unsupported-type and read errors are shown and announced in German
7. a "Too many files" error switches language while results are shown
8. a file error survives clicking Compare. This is marked `test.fail()` and documents F-1 path 3.

No existing test was modified. `tests/helpers.js` and `comparinator.html` were not touched.

## 7. Areas not tested

- **Real OS mouse drag from Finder or Explorer:** not performed (see section 3). This is still the main outstanding item. Run the manual steps in section 8 of the root `drag-n-drop-report.md`: core drags, flicker, drag away, drops outside the panels, plain-text drag, rejections, and screen readers.
- **Firefox and Safari/WebKit:** not tested. The installed Playwright browser builds (`firefox-1497`, `webkit-2227`) are older than Playwright 1.62.1 expects. Both started but failed on page creation with protocol errors (`Browser.setDefaultViewport` and `Page.overrideSetting: PushAPIEnabled`). I did not install new browsers, because that changes the shared environment. Recommended: `npx playwright install firefox webkit`, then run spec 09 with those projects, or test the builds manually.
- **Screen readers:** VoiceOver and NVDA were not used. Only the `role="status"` text is verified.
- **Real 200% browser zoom and touch/mobile drag:** not tested. The prior report covered an emulated zoom and a 400px width.
- **Visual re-check:** not repeated. The build is unchanged, so the prior screenshots (light, dark, high contrast, 400px) still apply.
- **Folder drops:** a dropped directory cannot be simulated with a synthetic `DataTransfer`. From the code, a folder with no extension is rejected as an unsupported type, and a folder named like `x.js` should fail in `file.text()` and show the read error. This is unverified.

## 8. Remaining risk

- **Medium:** real OS drag behaviour, especially Safari flicker and outside drops that could make the browser leave the app. It is covered only by simulated and CDP events, and a control page showed that automation cannot detect this.
- **Medium:** F-1 on three paths.
- **Medium:** Firefox and WebKit have no automated or manual coverage in this pass.
- **Low:** O-1 to O-4.

## 9. Release recommendation

**Release with conditions**, unchanged from the prior report. There are no Critical or High defects, and Chromium automation passes for all 18 requirements. The conditions are:
1. Fix F-1, or accept it as a known issue. Product should decide whether the Compare path is intended.
2. Complete a real mouse drag check in at least Chrome and Safari: single file, two files, outside drop, drag away.
3. Run spec 09, or a manual pass, in Firefox and Safari after installing matching Playwright browsers.

## Gap analysis data

| Area | Risk (1-10) | Confidence (Strong/Partial/Weak/Gap/Unknown) | Known issue (None/Known issue/Significant risk/Blocker) | Evidence | Notes |
|---|---|---|---|---|---|
| File Validation (type) | 7 | Strong | None | Spec 09: 5 extensions × case variants; 13 tricky names; unsupported list; Choose file path | Chromium only; the logic is browser-independent |
| Size Limit | 6 | Strong | Known issue | 9,999/10,000/10,001 characters; multibyte; emoji; 20 MB test; 200 MB probe (121 ms) | O-1 (UTF-16 units) and O-2 (CRLF measured before normalisation) are Low |
| Multi-file Drop | 7 | Strong | None | Two files on A or B; three files; four invalid or mixed pairs; failed pair leaves results unchanged; CDP two-file drop | All-or-nothing confirmed |
| Auto-Compare | 5 | Strong | None | Only A, B after A, typed text on the other side, blank files, existing results, options, paste parity | DND-18 results match exactly |
| Drag Feedback | 5 | Partial | None | Simulated plus CDP: dashed outline, hint, child move, leave, drop, Reset; Safari-style null `relatedTarget` recovery | Not seen in real Safari or Firefox; O-4 outline is weak in high contrast |
| Choose File (picker) | 6 | Strong | None | `setInputFiles`: same rules, same file twice, `accept` attribute, oversized, upper case | Native picker never opened; no `multiple` attribute (by design) |
| Keyboard Access | 7 | Strong | None | Tab order, Enter and Space open the picker (stubbed), accessible names contain the visible label (EN/DE) | Screen readers not exercised |
| Error Messaging & Persistence | 6 | Strong | Known issue | `aria-invalid`/`aria-describedby`; exact status texts; three F-1 `test.fail()` tests; scratch reproduction | F-1 Medium: file error wiped by auto-compare, option toggle or Compare |
| German Text | 4 | Strong | None | Hint, types, button, load, auto-compare, too large, too many, unsupported, read error; switching language with and without results | Only affected indirectly by F-1 |
| File Content Safety | 9 | Strong | None | `<script>`, `onerror`, `javascript:`, `svg onload`, `iframe` payloads, malicious file name: no elements injected, no dialogs | Chromium only; the rendering path is `escapeHtml` |
| Outside Drop / Browser Leaving the App | 9 | Weak | Significant risk | `defaultPrevented` asserted for synthetic and CDP drops; link and HTML drags not intercepted | Automation cannot detect whether the browser leaves the app (a control page did not leave either); needs a real drag |
| Real OS Drag | 8 | Gap | Significant risk | None this pass; prior CDP trusted drag only | No desktop or GUI tool available; manual check required |
| Cross-browser (Firefox/Safari) | 7 | Gap | Significant risk | Launch attempts failed: installed browsers are protocol-incompatible with Playwright 1.62.1 | Install matching browsers or test manually |
