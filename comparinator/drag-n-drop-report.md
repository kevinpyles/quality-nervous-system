# Comparinator Drag-and-Drop Quality Report

- **Build under test:** `comparinator.html` (local, served on http://127.0.0.1:4173 by http-server)
- **Date:** 2026-09-16
- **Browser:** Chromium (Playwright headless, Desktop Chrome profile). No other browsers tested.
- **Agent brief:** `drag-n-drop-agent.md` (DND-01 to DND-18)

## 1. Executive summary

The drag-and-drop and Choose file feature works in every automated check. All 18 requirements pass. One confirmed **Medium** defect (F-1) is a gap in DND-10 and DND-15, which the requirements do not directly cover. If Text B shows a file error, the error disappears whenever the comparison runs again for another reason: Text A is loaded and auto-compare runs, an option is toggled, or Compare is clicked. The language switch was written to keep file errors, so these other paths are inconsistent with it. I also recorded four **Low** observations that need a product decision or a small visual fix.

| Suite run | Result |
|---|---|
| Baseline `npm test` (before) | **94 passed**, 0 failed, 0 skipped |
| Final `npm test` (after) | **148 passed**, 0 failed, 0 skipped. `reports/dashboard.html` also shows 148 passed (100%), 7 runs recorded. |
| New tests added | **54** in `tests/09-file-drop.spec.js`. Two of them are expected failures marked with `test.fail()` that document F-1. |

**Overall confidence:** high for the Chromium code paths (validation, all-or-nothing loads, auto-compare, accessibility, German, security). Confidence in real operating-system mouse drags is **medium**, because none could be performed from this environment (see section 8).

## 2. Requirements: result per DND ID

In the Evidence column, "sim" means a simulated `DataTransfer` drop, "CDP" means a trusted Chromium drag through `Input.dispatchDragEvent` with real files on disk, and "input" means `setInputFiles`.

| ID | Result | Evidence (tests in `09-file-drop.spec.js` unless noted) |
|---|---|---|
| DND-01 | PASS | "dropping a .ext file loads it"; "a single file dropped on B fills only B"; "supported name … is accepted" (replaces "old text"); "an empty file replaces existing text"; CDP test |
| DND-02 | PASS | "dropping two files fills A and B" (dropped on B); CDP test (two real files dropped on B fill A then B) |
| DND-03 | PASS | "more than two files shows a message and loads nothing"; status and German tests |
| DND-04 | PASS | `.txt/.js/.html/.css/.py/.TXT`; `script.JS`, `Style.CsS`, `page.HTML`, `tool.Py`, `archive.tar.txt`, Unicode name; "Choose file accepts an upper-case extension" |
| DND-05 | PASS | `.pdf`, `.docx`, `.png`, `.exe`, `.md`, `.json`, `README`, `notes.txt.exe`, `.txt` (dotfile), `trailingdot.`: each is rejected, the message names the file and lists the supported types, and the text is unchanged |
| DND-06 | PASS | 9,999, 10,000 and 10,001 characters; 10,000 `é` (20,000 bytes) accepted and 10,001 rejected; Choose file over the limit. See observations O-1 and O-2. |
| DND-07 | PASS | valid + unsupported; unsupported + valid (probe); valid + oversized; two invalid files. Nothing loads in any case. |
| DND-08 | PASS | only A loaded: no compare; B after A: compare; A loaded while B has typed text: compare; whitespace-only file: no compare; empty file: no compare |
| DND-09 | PASS | counter and word-count assertions (single, 9,999, CRLF, emoji, whitespace) |
| DND-10 | PASS (see F-1) | "a successful load clears a previous file error" (including `aria-invalid`). F-1 covers errors on the *other* field being wiped. |
| DND-11 | PASS | outline style is `dashed`; hint text is present; dragleave into a child keeps the state; leaving the panel clears outline and hint; drop clears them; CDP test (hover, move to child, drag away) |
| DND-12 | PASS (simulated) | `dragover`/`drop` with files on `body` and `.compare-row` are `defaultPrevented`; plain-text drag is not prevented and shows no drop state. **Real navigation could not be verified**, because automated drops never navigate, even on a control page with no handlers (section 6). |
| DND-13 | PASS | Tab order is `textA → fileBtnA → textB → fileBtnB`; Enter and Space open the matching picker (`input.click` stubbed, so no native dialog appears); names are "Choose file for Text A/B" and include the visible label in EN and DE; same rules through the input; same file twice reloads; `accept` attribute is set |
| DND-14 | PASS | `#appStatus` (`role="status"`) text is checked exactly for single load, two-file load, load + compare, unsupported, too large, too many and read failure |
| DND-15 | PASS (see F-1) | German drop hint, supported-types hint, button, name, load announcement, auto-compare announcement, too-large and too-many errors; the error switches language with and without results |
| DND-16 | PASS | "Reset clears file errors"; "Reset clears the drag-over state and hint" (both panels) |
| DND-17 | PASS | `.html` with `<script>`/`onerror`; `.js`/`.html` with `javascript:` links, `<svg onload>`, `<iframe>`: no elements are injected into results or summary, the text is shown verbatim and no dialog appears; a malicious *file name* in the error is shown as text |
| DND-18 | PASS | "file results match pasted results": the innerHTML of every stat, both result panes and the summary is identical, both with default options and with Ignore case + Ignore punctuation |

## 3. Automated vs manual

- **Automated, simulated (synthetic `DataTransfer` or `DragEvent` dispatched in the page):** most of the checks above. These are **not proof** that operating-system drags work.
- **Automated, trusted Chromium drag (CDP `Input.dispatchDragEvent` with real files written to disk):** one new test plus an exploratory probe. It exercises Chromium's own event ordering. The events were `isTrusted=true`, `relatedTarget` was populated on dragleave, and `dataTransfer.files` held real disk files. It is closer to reality than the synthetic drops, but it is still **not** an OS mouse drag.
- **Automated, Choose file:** `setInputFiles`. The native picker was never opened.
- **Visual checks:** headless screenshots that I inspected (section 6).
- **Manual:** none performed. Real mouse, file-manager, screen-reader and Firefox/Safari testing is still outstanding (section 8).

## 4. Confirmed findings

### F-1: A file error on one field is silently cleared when the comparison re-runs (Medium)

- **Requirement area:** DND-10 and DND-15 (stale or missing error state). The Severity guide rates a missing message as Medium.
- **What happens:** `compare()` re-validates both fields with `showFieldError('a'|'b', rawX.trim() ? null : …)`. This replaces any file error on a field that still has text. `setLanguage()` explicitly saves and restores `fieldErrorState` around `compare()`, but the other callers of `compare()` do not.
- **Steps to reproduce (path 1):**
  1. Type `bee text` in Text B.
  2. Drop `bad.gif` on Text B. The error "“bad.gif” is not a supported file type…" appears and `aria-invalid="true"` is set.
  3. Drop `a.txt` (content `ay text`) on Text A.
  4. **Actual:** the comparison runs and Text B's error and `aria-invalid` disappear, although the failed load on B was never resolved. **Expected:** B's error stays until B itself is changed or reloaded. DND-10 says a load clears the error "on that field".
- **Path 2:** load two matching files, drop `bad.gif` on B, then tick Ignore case. The error disappears.
- **Path 3 (seen in code, not separately tested):** clicking Compare has the same effect.
- **Evidence:** tests "a file error on B survives a successful auto-compare load into A" and "a file error survives toggling Ignore case while results are shown", both marked `test.fail()`. I confirmed that without `test.fail()` both fail at the final assertion: `#errorB` is `hidden` with text `""`.
- **Impact:** the failure was announced once, but the visible message and the invalid state are lost, so a user may believe B holds the file they tried to load.
- **Recommended fix:** in `compare()`, only replace a field's error when it is an empty-field error, or when the field is empty. For example, keep `fieldErrorState[key]` if its key starts with `errorFile`/`errorUnsupported`/`errorTooMany` and the field is non-blank. Alternatively, reuse the save/restore pattern from `setLanguage()`. Clear a file error only when that field is loaded, edited (`input` event) or reset. When fixed, remove the two `test.fail()` lines.

## 5. Observations (Low, need a product decision or a minor fix)

- **O-1: "Characters" means UTF-16 code units.** `text.length` is used, so 5,000 emoji (5,000 user-perceived characters) count as 10,000 and are accepted, while 5,001 emoji are rejected as "too large". This is consistent with the on-screen counter and the textarea `maxlength`, and bytes are not counted (10,000 `é` = 20,000 bytes is accepted), so DND-06 passes as written. If "characters" should mean code points, the counter, `maxlength` and file check all need to change together. The current behaviour is documented by the test "emoji file at the limit…".
- **O-2: The CRLF length is measured before normalisation.** A Windows file with 10,011 raw characters (910 CRLF lines) is rejected, but after the textarea normalises CRLF to LF it would be 9,101 characters and fit. CRLF files near the limit are rejected earlier than users expect. Suggested fix: normalise `\r\n` to `\n` before the length check.
- **O-3: Binary content with a supported extension is accepted.** A `.txt` file containing NUL/0xFF bytes loads as replacement characters with no warning. It is inert and nothing crashes (test "a .txt file with binary content…"). The requirements do not say whether to reject it. Consider rejecting content with NUL bytes and showing a "not a text file" message.
- **O-4: The high-contrast drag outline is weak.** In high-contrast mode the 3px yellow (`#ffe066`) dashed outline sits over the 2px white panel border (`outline-offset: -3px`), and the ring `box-shadow` is `none`. The dashes are yellow-on-white and hard to see at 1x. The hint text still appears, so the state is not conveyed by colour alone. Suggested fix: under `html.a11y-contrast`, use a positive `outline-offset` or a thicker, black-backed dash.
- **Not a defect, noted for completeness:**
  - The Choose file input has no `multiple` attribute, so two files can only be loaded together by dropping.
  - A leading-dot name such as `.txt` is treated as having no extension and rejected, which I consider correct.
  - At 400px width the fixed Accessibility button overlaps the "Maximum 10,000 characters" footer text in panel B. This predates the feature and does not cover the Choose file button.

## 6. Passed checks and evidence (visual and exploratory)

Screenshots were taken with headless Playwright. Each shows panel A in the drag-over state and panel B with an unsupported-file error. Files are in the session scratchpad `shots/` directory, not in the project.

| View | Result |
|---|---|
| Light (1280px) | Dashed gold outline, hint bar "Drop a file to load it into Text A" and error with icon are all legible |
| Dark (`label.theme-toggle`) | Dashed yellow outline, readable hint bar and error |
| High contrast (Accessibility Menu `contrast`, set through `localStorage['comparinator.a11y']`) | Hint and error legible; outline weak (O-4) |
| Readable font + link highlighting | OK; Choose file buttons get the highlighted border |
| German | Hint, button, error, "0 Wörter" and "Maximal 10.000 Zeichen" all translated; nothing truncated |
| 400px width (light and dark) | No horizontal scroll (`scrollWidth` 400 = `innerWidth` 400); error wraps cleanly; footer fits |
| About 200% zoom (640px viewport at DPR 2) | Hint and footer fit; the fixed Accessibility button overlays the right edge of the footer text (pre-existing) |
| App text size 200% | Hint, button and footer scale without overlap |

Exploratory probe (Chromium CDP, trusted events):
- Hover over the textarea shows the outline and hint, and moving onto a child keeps them.
- Dragging away clears them.
- A drop on the page corner or on the statistics area leaves the URL unchanged and loads nothing.
- Two real disk files dropped on B fill A and B, and the comparison runs (similarity 60.0%).

**Limitation found while testing:** a negative control, a CDP drop on a plain page with no handlers, also did not navigate (it stayed on `about:blank`). Automated drops therefore cannot prove that the app prevents navigation. DND-12 is covered by `defaultPrevented` assertions and still needs a manual check.

## 7. Test gaps found and new tests added

Before this pass there were 22 drop tests. The gaps were: tricky names, multibyte and CRLF content, empty and binary files, read errors, two invalid files, valid + oversized, auto-compare with options, typed text or existing results, paste parity, keyboard activation, tab order, aria-describedby, announcement text, German hint and announcements, dragleave to a child, plain-text drags, outside-drop prevention, and Reset clearing the drag state.

A new `describe` block, "File drop — edge cases (DND gap coverage)", adds **54 tests**. The `dropFiles` helper now also accepts `bytes` for binary content. No existing test was changed in behaviour.

- **Tricky names:** 7 rejected (`notes.txt.exe`, `.txt`, `trailingdot.`, `readme.md`, `data.json`, `photo.png`, `setup.exe`) and 6 accepted (`archive.tar.txt`, a Unicode name with spaces, `script.JS`, `Style.CsS`, `page.HTML`, `tool.Py`). A rejected Unicode name is shown verbatim.
- **Content:**
  - empty file
  - whitespace-only file
  - 9,999 characters
  - 10,000/10,001 accented characters (the limit counts characters, not bytes)
  - 5,000 emoji
  - CRLF
  - a very long single line
  - binary `.txt`
  - read failure (`File.prototype.text` rejected)
- **Multiple files:**
  - two invalid files
  - valid + oversized
  - a single file on B fills only B
- **Auto-compare:**
  - loading while the other side has typed text
  - loading over existing results
  - options respected
  - paste parity with 2 option sets
- **F-1:** 2 tests marked `test.fail()`.
- **Drag feedback:**
  - dragleave to a child and away
  - dashed style on B
  - outside drop prevented
  - plain-text drag not intercepted
  - Reset clears the drag state
  - trusted CDP drag with real files
- **Keyboard and Choose file:**
  - Enter and Space open the picker
  - tab order
  - same file twice
  - oversized file through the input
  - upper-case extension through the input
  - `accept` attribute
- **Accessibility:**
  - accessible name contains the visible label (EN/DE)
  - aria-describedby and accessible description
  - announcement texts
  - two-file announcement
- **German:**
  - hint, types hint, load, too large and too many
  - German auto-compare announcement
  - too-large error switches language both ways
- **Security:**
  - `javascript:`, `svg onload` and `iframe` payloads
  - malicious file name in the error

## 8. Areas not tested / manual follow-up

Real OS mouse drag-and-drop could not be performed from this environment. Use sample files you create yourself: `a.txt` ("one two three"), `b.txt` ("one two four"), `c.txt`, `bad.pdf`, `big.txt` (10,001 characters) and `notes.txt.exe`.

1. **Core real drag (Chrome, Firefox, Safari on macOS; also Windows Explorer if possible):**
   1. Drag `a.txt` from Finder onto Text A. Expect the dashed outline and hint while hovering, then the text loaded and "Loaded “a.txt” into Text A.".
   2. Drag `b.txt` onto Text B. The comparison should run.
   3. Select `a.txt` and `b.txt` together and drop them on Text B. Expect A = a.txt and B = b.txt.
2. **Flicker:** drag a file slowly across a panel's header, textarea, hint bar and footer button. The outline must not flicker. This matters most in Safari, where dragleave `relatedTarget` has historically been `null`, and the code relies on it.
3. **Drag away:** drag a file over a panel and then back out to the desktop, or press Esc. Outline and hint must clear.
4. **Outside drop (DND-12):** type text in both fields, then drop `a.txt` onto the header, the statistics area and the page margin. The app must stay on screen with the text intact and must not open the file in the tab.
5. **Plain-text drag:** select a word in Text B and drag it into Text A. It must be inserted normally, with no outline or error.
6. **Rejections with real files:** drop `bad.pdf`, `notes.txt.exe`, `big.txt` and three files at once. Check each message, that the text is unchanged, and the Windows file names with CRLF content.
7. **Screen readers:** use VoiceOver (Safari) and NVDA (Firefox/Chrome). Tab to "Choose file for Text A", press Space (the native picker opens), load a file and confirm the load announcement. Then load an invalid file and confirm the error is announced and read as the field's description.
8. **Browser zoom:** use real 200% browser zoom rather than an emulated viewport.
9. **Other risks not covered:** touch devices and mobile browsers (drag-and-drop from Files apps), very large binary files (for example 100 MB renamed to `.txt`, because the whole file is read before the length check), and drags from other apps or browser tabs (URL or HTML drag data).

## 9. Remaining risk

- **Medium:** real OS drag behaviour in Safari and Firefox (flicker and outside-drop navigation) is unverified.
- **Medium:** F-1 can hide an unresolved file error.
- **Low:**
  - O-1 to O-4
  - Large-file read cost: `file.text()` reads the whole file before the size check. Checking `file.size > MAX_CHARS * 4` first would avoid reading multi-megabyte files.

## 10. Release recommendation

**Release with conditions.** No Critical or High defects were found, and every DND requirement passes in Chromium automation, including a trusted Chromium drag with real files. Before release:
1. Fix F-1, or accept it as a known issue.
2. Complete manual steps 1–5 of section 8 in at least Chrome and Safari, to confirm real mouse drags and that outside drops do not navigate.

O-1 to O-4 can be scheduled as follow-up work.
