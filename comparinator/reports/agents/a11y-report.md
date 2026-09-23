# Comparinator — Accessibility Quality Report (a11y agent)

| | |
|---|---|
| **Build under test** | `comparinator.html`, sha256 `7424092aad7e86b1cd3f25a58a943b69e756b819ebfe700c099f3c937f941bb4` (105,646 bytes, modified 2026-09-16 21:41; hash re-checked at the end of the run) |
| **Date** | 2026-09-16 |
| **Target** | WCAG 2.2 Level AA where applicable, plus `a11y-requirements.md` (A11Y-001 … A11Y-034) |
| **Browser** | Chromium (Playwright 1.62, Desktop Chrome project); app served at `http://127.0.0.1:4173/comparinator.html` |
| **Scanner** | axe-core 4.13.0 from `node_modules`. **Note:** it is *extraneous* (not declared in `package.json`). The new spec skips its axe tests if the package is missing. |
| **Prior evidence** | `./a11y-report.md` (2026-09-15, older 96,956-byte build, before drag-and-drop). Used as stale context only. Everything below was re-verified on this build. |

### Tests run

| Spec | Result |
|---|---|
| `tests/12-a11y.spec.js` (**new**, this agent) | **17 passed**: 12 genuine passes + 5 `test.fail()` expected failures that document confirmed defects. 0 unexpected failures. |
| `tests/07-responsive-and-accessibility.spec.js` (owned) | **7 passed**, 0 failed. Unchanged. |
| `tests/09-file-drop.spec.js` (read-only supporting evidence, owned by the file-drop agent) | **86 passed**, 0 failed. This includes that agent's own `test.fail()` cases for finding F-1. |
| Baseline `npm test` (provided by the orchestrator, not re-run) | 148 passed, 0 failed |
| Scratch audit scripts (`SCRATCH/a11y/*.js`) | 9 axe states (0 violations each); 48 functional checks; 3-mode rendered-pixel contrast (79 text elements per mode); 4-mode focus-ring pixel measurement; forced-colors capture |

Command used: `npx playwright test <files> --reporter=list --output=SCRATCH/a11y/pw-out`. `npm test` was **not** run.

---

## Executive summary

On keyboard operation, semantics, names, state, live announcements, motion, persistence and the Accessibility Menu, the current build is solid. The new file-loading UI is well built for accessibility:
- The "Choose file for Text A/B" buttons are native buttons that sit in the Tab order right after each field.
- The buttons carry a supported-types description.
- Enter and Space open the file picker.
- Loads and errors are announced through `role="status"`.
- Errors set `aria-invalid` and are linked through `aria-describedby`.
- The drag state uses a dashed outline plus text, not colour alone.

axe-core reports **0 violations in 9 states**. However, axe could not decide 53–74 colour-contrast nodes because of the translucent "glass" panels. Measuring the rendered pixels directly found **six confirmed defects that the scanner did not report**:

| ID | Severity | Summary |
|---|---|---|
| A11Y-HIGH-1 | **High** | The default keyboard focus ring (`--gold-ring`, 30–35 % alpha) measures **≈1.4:1** (light) and **≈2.6:1** (dark) against the unfocused pixels. That is below the 3:1 needed for A11Y-018 and WCAG 1.4.11. It passes only when Keyboard navigation mode or High contrast is switched on. |
| A11Y-MED-1 | Medium | **New UI.** A long unsupported file name does not wrap. The whole error message, including the "Supported types" fix, is clipped at the panel edge at 320 px, and at 1280 px with 200 % text. |
| A11Y-MED-2 | Medium | Light theme: the empty-results text (`.empty`, opacity .72) measures **3.10:1**. The textarea placeholder (opacity .63) measures **2.63:1** in light and **3.75:1** in dark. |
| A11Y-MED-3 | Medium | Forced-colors (Windows High Contrast) mode: the switch thumb disappears, so **on and off look identical** for all six menu toggles and "Suit up". |
| A11Y-LOW-1 | Low | Muted 11–12 px legend, footer and "Highlighted Comparison" text drops to **4.16–4.34:1** where the glass-panel drop shadows darken the page. |
| A11Y-LOW-2 | Low | The Accessibility Statement does not mention file loading, drag-and-drop or its keyboard alternative. Its reporting address is still a placeholder (carried over from the prior report). |

There are **no Critical defects**. The core workflow can be completed keyboard-only, including loading a file.

## Overall accessibility confidence

**Moderate.** Machine-verifiable behaviour is strongly evidenced. Visual contrast is weaker than the prior report claimed: the prior report measured the focus ring at 3.56:1, but this build renders it at about 1.4:1. The old build is not available, so I cannot tell whether this is a regression or a prior measurement error. **No real screen reader was used**, so every assistive-technology claim rests on the Chromium accessibility tree and on DOM and live-region content. **WCAG conformance is not claimed.**

## Requirements tested

All 34 requirements (A11Y-001 … A11Y-034) and the §6 acceptance criteria were exercised.
- **A11Y-025** (screen reader compatibility) is only partially verifiable without a real screen reader.
- **A11Y-027** (target size) was measured against the 24×24 CSS px minimum of WCAG 2.5.8.

## Automated vs. manual checks

| Category | What | Result |
|---|---|---|
| Automated: axe-core (wcag2a/aa, 21a/aa, 22aa, best-practice) | 9 states: default; results + file error; drag-over; dark; high contrast + drag + error; HC + menu + statement; all options + 200 % text; German; 320 px | **0 violations**. "Incomplete" items: `color-contrast` (53–74 nodes, translucent backgrounds, resolved manually below); `aria-valid-attr-value` on `#a11yBtn` (`aria-controls` points at the hidden dialog, which exists, so not a defect); `skip-link` while the modal is open (the target is inert, as expected). |
| Programmatic manual: keyboard, focus, AX tree, state, persistence, motion, reflow, target size | 48 scripted checks (`SCRATCH/a11y/manual.js`) | 44 pass. The 4 failures were 3 × 22×22 checkbox false positives (the clickable labels are 123–314 × 44–76 px, so not a defect) and 1 × statement omits file loading (LOW-2). An earlier run also had script errors, which were fixed and re-run. |
| Rendered-pixel text contrast | 79 text elements × light / dark / HC; text hidden, real background sampled, text colour composited with alpha and opacity | Dark: 0 below threshold. HC: 0. Light: 5 below 4.5 (LOW-1), plus MED-2 measured separately. |
| Focus-ring pixel contrast | 8 controls × light / dark / keyboard-mode / HC; focused vs unfocused pixels | Light ≈1.39–1.44; dark ≈2.03–2.66; keyboard mode outline p90 ≈3.4–3.95; HC 21:1 (HIGH-1) |
| Forced colors (Chromium emulation) | Main view + menu screenshots; thumb pixel count | Switch state invisible (MED-3). Other content survives. |
| Human + real assistive technology | None | **Not performed** |

## Passed checks (evidence highlights)

- **Keyboard (A11Y-002, A11Y-017):**
  - Tab order is skip link → EN → DE → Suit up → Reset → Ignore case → Ignore punctuation → Text A → **Choose file A** → Text B → **Choose file B** → Compare → Result A → Result B → Accessibility.
  - Shift+Tab reverses this order, and there are no traps.
  - Keyboard-only workflow: type into A, press Space on Choose file B, choose a file. The file loads, the comparison runs automatically, the status says "Loaded "b.txt" into Text B. Comparison complete. Similarity 50.0 %…", and focus stays on the button.
- **Menu (A11Y-001, A11Y-004…A11Y-009, A11Y-026):**
  - The button is named "Open accessibility settings" with `aria-expanded` false→true. Space and Enter open the menu, focus moves to the dialog, and the background becomes `inert`.
  - Tab and Shift+Tab wrap inside the menu. Escape closes it and returns focus to the button.
  - All 6 toggles work with Space; each sets its checkbox state and root class and announces "X: on."
  - A+ steps up to 200 % and then disables itself, moving focus to A−. A− is disabled at 100 %.
  - Readable font switches to "Atkinson Hyperlegible", Verdana… with letter spacing, word spacing and line-height 1.7.
  - Highlight headings adds a 5 px left border, a background and an underline to all h1–h4. Heading structure is unchanged.
  - Highlight links and buttons adds a 3 px solid border to every button, **including the new Choose file buttons**.
- **Persistence and reset (A11Y-010, A11Y-011, A11Y-034):**
  - Settings survive reload, back navigation and a new tab, and are applied before first paint. The menu controls reflect the stored state.
  - Accessibility Reset restores defaults and keeps the typed text, results **and an outstanding file error**. Focus stays on Reset, and the reset is announced.
  - App Reset clears the fields, file errors, `aria-invalid` and the drag state, keeps a11y preferences, moves focus to Text A, and announces the reset.
- **Semantics, names, labels (A11Y-013…A11Y-016, A11Y-028):**
  - One each of header, main and footer; one h1; logical h1→h2→h3; statistics in `dl`/`dt`/`dd`; title "Comparinator — Text Comparison Tool"; `lang` set.
  - Every button, checkbox, textbox and link in the AX tree has a name.
  - The Choose file buttons are named "Choose file for Text A/B" (the name contains the visible label, in EN and DE) and described as "Supported: .txt, .js, .html, .css, .py. You can also drag and drop a file."
  - The hidden file inputs are removed from the Tab order and the AX tree.
- **Errors (A11Y-020):**
  - A file error shows visible text plus a "!" icon and a 4 px border.
  - It sets `aria-invalid="true"` and is included in the textarea's description ("… “notes.docx” is not a supported file type. Supported types: …").
  - The same text is announced through `#appStatus`.
- **Dynamic results (A11Y-019, A11Y-030):**
  - One concise polite status is announced per comparison, file load or failure.
  - Counters use described-by text, and only limit and near-limit changes go to a status region.
- **Colour independence (A11Y-021, A11Y-031):**
  - Differences are marked with `ins`/`del` plus "+"/"−" markers and distinct underline styles, and a text legend is provided.
  - The drag-over state is a 3 px dashed outline plus the hint "Drop a file to load it into Text A".
- **Motion (A11Y-003):** With `prefers-reduced-motion: reduce` or Disable Animations on, and the drag-over state and menu open, no element or pseudo-element has an animation or transition longer than 10 ms. The default build has 36 transitions.
- **Reflow and zoom (A11Y-023, A11Y-024):** There is no page overflow and no clipped controls at 320 px, 640 px (≈200 % zoom), 1280 px at 200 % text, 320 px at 200 % text, or German at 320 px, with results, drag state and a normal-length file error shown. The exception is MED-1.
- **Target size (A11Y-027):** All controls are at least 24×24. The Choose file button is 93×44 (157×66 at 200 %). The 22×22 checkboxes sit inside labels of at least 123×44.
- **High contrast mode:** Every measured text element passes, including the file error (14.6:1), the drop hint (15.8:1) and the Choose file button (21:1). The focus ring is 21:1.

## Confirmed findings

### A11Y-HIGH-1: Default focus indicator contrast too low (High)
- **Requirement / WCAG:** A11Y-018 ("provide sufficient contrast") and A11Y-022; WCAG 1.4.11 Non-text Contrast (focus indicator). Core requirement §2: it must hold without menu options.
- **Evidence:**
  - `button/textarea/input:focus-visible`, `[tabindex]:focus-visible` and `.check input:focus-visible` all use `outline: 3px solid var(--gold-ring)`.
  - `--gold-ring` is `rgba(169,117,10,.30)` in light mode and `rgba(255,215,106,.35)` in dark mode.
  - Pixel comparison of focused vs unfocused rendering gives a median of **1.39–1.44:1** in light mode (Language, Reset, Ignore case, Text A, Choose file, Compare, Result A) and **2.03–2.66:1** in dark mode. The Accessibility button has its own stronger treatment.
  - Test `DEFECT A11Y-HIGH-1` measures 1.43.
- **Impact:** Keyboard users in the default presentation get a faint focus ring. The workaround, turning on Keyboard navigation mode (≈3.4–3.95:1) or High contrast (21:1), requires finding the menu first.
- **Fix:** Use an opaque ring in both themes, for example `--gold-ring: #8a5f00` (light) and `#ffd76a` (dark), or a two-tone ring (`outline` plus a contrasting `box-shadow`). Then confirm at least 3:1 against both the page and the panel backgrounds. Keep the soft alpha colour only for decorative hover and drag halos.

### A11Y-MED-1: Long file names clip the file-error message (Medium, new UI)
- **Requirement / WCAG:** A11Y-020, A11Y-023, A11Y-024; WCAG 1.4.10 Reflow, 1.4.4 Resize Text.
- **Evidence:**
  - At 320 px, a 76-character file name gives `#errorA` `scrollWidth` 529 against `clientWidth` 290.
  - The text runs past the panel, which has `overflow:hidden` (and `body{overflow-x:hidden}`), so it is cut off. Both the file name and "Supported types: …" are lost visually (screenshot `SCRATCH/a11y/shots/longname-320-1-76.png`).
  - Also reproduced at 1280 px with 200 % text and a 114-character name (1460 vs 1234).
  - Short names wrap correctly.
  - Screen-reader users still receive the full text through `aria-describedby` and the status region.
  - Test `DEFECT A11Y-MED-1`.
- **Cause:** `.field-error` is `display:flex`, and its text is an anonymous flex item with `min-width:auto` and `overflow-wrap:normal`.
- **Fix:** Add `overflow-wrap:anywhere` to `.field-error`, and wrap the message in a `<span>` with `min-width:0`. Alternatively, drop flex and position the `::before` icon instead.

### A11Y-MED-2: Empty-state and placeholder text below 4.5:1 (Medium)
- **Requirement / WCAG:** A11Y-022; WCAG 1.4.3.
- **Evidence (rendered pixels):**
  - `#resultA .empty` ("Run a comparison to see highlighted results.") uses `--muted` × opacity .72 and measures **3.10:1** in light mode. It measures 4.56:1 in dark mode, which passes.
  - The `textarea::placeholder` uses `--muted` × opacity .63 and measures **2.63:1** in light and **3.75:1** in dark mode.
  - High contrast passes.
  - Test `DEFECT A11Y-MED-2` (measures 3.10 and 2.63).
- **Fix:** Remove the opacity reductions, or use a darker muted token for these two uses. Note: the placeholder is not the only label, since the visible labels exist, but its instructional text should still be readable.

### A11Y-MED-3: Toggle state invisible in forced-colors mode (Medium)
- **Requirement / WCAG:** A11Y-026 ("visual state and programmatic state shall remain synchronized"); WCAG 1.4.11.
- **Evidence:**
  - Using Chromium `forcedColors: 'active'`, the `.slider::after` thumb is painted with `background`, which forced colors removes.
  - An *on* switch (Disable animations) and an *off* switch (Keyboard navigation) render as identical empty pills (`shots/switch-active-on.png` and `switch-active-off.png`).
  - The count of light thumb pixels inside the track is 0. The same measurement passes without forced colors.
  - The page has no `@media (forced-colors: active)` rules.
  - The programmatic state is still correct, so screen-reader users are not affected.
  - Test `DEFECT A11Y-MED-3`.
- **Caveat:** This is Chromium emulation, not tested on a real Windows High Contrast theme.
- **Fix:** Inside `@media (forced-colors: active)`, give `.slider::after` `forced-color-adjust:none; background:CanvasText`, and give `input:checked + .slider` `background:Highlight` (or a border and position change that survives forced colors).

### A11Y-LOW-1: Muted small text over panel shadows (Low)
- **Requirement / WCAG:** A11Y-022; WCAG 1.4.3.
- **Evidence:**
  - `--muted` `#6f6455` passes (5.15:1) on the page ground `#f6f1e7`.
  - The glass panels' `--shadow: 0 20px 50px` darkens the ground beneath them to about `#e2dac9`. Where the text sits in that shadow, the legend items (12 px) measure **4.16–4.24:1**, the footer (11 px) **4.20–4.27:1**, and the "Highlighted Comparison" h2 (12 px bold) **4.22–4.34:1**.
  - Reproduced at 390, 1280 and 1440 px.
  - Dark and HC pass.
  - Test `DEFECT A11Y-LOW-1` (measures 4.20 and 4.20).
- **Fix:** Darken `--muted` slightly (for example `#62584a`), or move this text further from the panel shadows.

### A11Y-LOW-2: Accessibility Statement not updated for file loading (Low)
- **Requirement:** A11Y-012 ("supported accessibility features", "known limitations").
- **Evidence:**
  - The statement text (EN) has no mention of file loading, drag-and-drop, or the keyboard-accessible Choose file alternative.
  - The reporting address is still the placeholder `accessibility@example.com`. The requirement allows a placeholder.
- **Fix:** Add a bullet, for example: "Files can be loaded with the keyboard-accessible Choose file button; drag-and-drop is optional." Replace the address before release.

### Cross-reference (not an a11y-agent finding)
The file-drop agent's **F-1** (in `09-file-drop.spec.js`): Compare, auto-compare or an option toggle clears an unresolved file error on a non-empty field. When that happens, `aria-invalid` and the described-by error are removed silently. This agrees with A11Y-020, which says errors should remain until corrected. I confirmed the code path (`compare()` calls `showFieldError(..., null)` for non-empty fields) but did not re-test it.

### Investigated and dismissed
- axe `aria-valid-attr-value` on `#a11yBtn`: `aria-controls` points to the hidden `#a11yPanel`, which exists. This is a benign scanner uncertainty.
- axe `skip-link` incomplete while the modal is open: the skip-link target is inert by design.
- Checkboxes 22×22: the clickable labels are 123–314 × 44–76 px, so they meet 2.5.8.
- Large statistic values (`#similarity`, gold, bold 21–30 px) at 3.69–3.81:1 are large text, where the minimum is 3:1, so they pass.
- The drop hint is `aria-hidden`. That is appropriate: it only appears during a pointer drag, and the Choose file button's description carries the same information for assistive-technology users.

## Changes to tests

- **Added** `tests/12-a11y.spec.js` (17 tests):
  - 4 axe scans (skipped if axe-core is absent).
  - 8 file-UI and regression checks: keyboard file load plus announcement and focus; button names and description (EN/DE); file-error semantics; non-colour drag state; reduced motion with drag and menu; a11y reset keeping data and file error; reflow at 320 px and 320 px/200 %.
  - 5 `test.fail()` defect tests (HIGH-1, MED-1, MED-2, MED-3, LOW-1). Each was verified to fail on its intended assertion, not on a script error, by running a copy with `test.fail` removed. When a defect is fixed, Playwright reports "expected to fail, but passed"; remove that `test.fail()` line then.
- No existing spec, helper or application file was modified.
- **Suggestion:** declare `axe-core` in `devDependencies`.

## Areas not tested

- Real screen readers (VoiceOver, NVDA, JAWS, TalkBack) and speech output or verbosity of the live regions.
- Firefox, WebKit/Safari and mobile browsers. Chromium only.
- Real Windows High Contrast themes (emulation only), and real OS-level browser zoom. Zoom was approximated with viewport width and the in-app text scale.
- Voice control, switch access and screen magnifiers.
- A real OS drag-and-drop by a mouse user with assistive technology. Drag was simulated; the file-drop agent covers a trusted Chromium drag.
- A full visual review of every German string at every text size (only 320 px German was checked).

## Remaining risk

- Screen-reader experience is unverified by a human.
- The focus-ring contrast issue affects every keyboard user in the default theme.
- The glass/translucent design defeats axe's contrast rule, so future colour changes need pixel-based checks. The new spec includes reusable helpers for this.
- Forced-colors support is absent throughout the CSS.

## Release recommendation

**Conditional go / fix before release: HIGH-1.** The default focus ring must reach at least 3:1. That is a one-token CSS change.
- MED-1, MED-2 and MED-3 should be fixed in the same pass. They are small CSS changes and all have workarounds: screen-reader text for MED-1, the high-contrast option for MED-2, and programmatic state for MED-3.
- LOW-1 and LOW-2 can follow.
- No Critical issue blocks the core workflow, and the new file-loading feature is keyboard- and screen-reader-operable.
- A human screen-reader pass is still recommended before claiming WCAG 2.2 AA.

## Gap analysis data

| Area | Risk (1-10) | Confidence (Strong/Partial/Weak/Gap/Unknown) | Known issue (None/Known issue/Significant risk/Blocker) | Evidence | Notes |
|---|---|---|---|---|---|
| Keyboard Navigation | 3 | Strong | None | manual.js tab/shift-tab order; keyboard-only workflow incl. Space on Choose file; 07 TC-62..64; 12-a11y keyboard test | File buttons are in logical order; no traps |
| Focus Management | 3 | Strong | None | Menu opens to dialog, wraps, Escape returns to button, background inert; A+/A− boundary moves focus; Reset focuses Text A; file load keeps focus | Chromium only |
| Visible Focus | 7 | Strong | Significant risk | focusring.js pixel ratios: light ≈1.4:1, dark ≈2.6:1; kbd mode ≈3.4–3.95; HC 21:1; 12-a11y HIGH-1 (expected-fail) | A11Y-HIGH-1: `--gold-ring` 30–35 % alpha; indicator present on every control but too faint |
| Screen Reader Support | 6 | Weak | None | Chromium AX tree (names, descriptions, invalid state, roles); live-region text content | No real screen reader available; announcements not heard; none found in AX-level checks |
| Semantic HTML | 2 | Strong | None | Landmarks, single h1, logical headings, dl stats, fieldset/legend, native buttons; axe 0 violations ×9 states | |
| Accessible Names | 2 | Strong | None | AX tree: all buttons/checkboxes/textboxes/links named; "Choose file for Text A/B" contains the visible label (EN/DE); 12-a11y name test | |
| Form Labels | 2 | Strong | None | Text A/B `label for`; checkboxes wrapped in labels; menu switches labelled; placeholder not the only label | Placeholder contrast tracked under Contrast |
| Dynamic Result Announcements | 4 | Partial | Known issue | `#appStatus` content after compare, file load, file error, reset; counter status; 12-a11y keyboard/file-error tests | DOM-verified only; cross-ref F-1: file error removed silently on re-compare |
| Contrast | 6 | Strong | Known issue | Rendered-pixel contrast, 79 elements × 3 modes; MED-2 (3.10 / 2.63 / 3.75), LOW-1 (4.16–4.34); dark and HC pass; axe could not assess 53–74 nodes | axe unreliable on glass UI; use pixel helpers in 12-a11y |
| Color Independence | 3 | Strong | Known issue | ins/del + "+/−" + underline styles; file error icon + border + text; drag state dashed outline + text; forced-colors capture | MED-3: switch on/off state lost in forced colors |
| Text Resizing | 4 | Strong | Known issue | 1280 and 320 at 200 % text: no overflow or clipping; controls ≥24 px; long file name clipped at 1280@200 % | A11Y-MED-1 |
| Reflow | 5 | Strong | Known issue | 320 / 640 / DE 320 px: no page overflow; long file-name error clipped at 320 px (screenshot + 12-a11y MED-1) | Short names fine; `body`/panel overflow hidden masks the overflow from scanners |
| Reduced Motion | 2 | Strong | None | prefers-reduced-motion and Disable Animations: 0 animations/transitions >10 ms with drag-over + menu open; 12-a11y motion test | Default build has 36 transitions |
| Readable Font | 2 | Partial | None | Computed font stack (Atkinson Hyperlegible → Verdana), letter/word spacing, line-height 1.7; screenshot | Visual legibility judged on screenshots only; the font may fall back to Verdana |
| Highlight Headings | 2 | Strong | None | h1–h4: 5 px left border + background + underline; heading structure unchanged; screenshot | |
| Highlight Links and Buttons | 2 | Strong | None | 3 px solid borders on all buttons incl. Choose file; links underlined; disabled buttons dashed; screenshot | Hover and active states checked in CSS only |
| Accessibility Menu | 3 | Strong | Known issue | Open/close, Enter/Space/Escape, aria-expanded, inert, 6 toggles + text size, announcements; axe HC + menu 0 violations | MED-3 forced-colors toggle state |
| Accessibility Preference Persistence | 2 | Strong | None | Reload, back navigation, new tab; pre-paint application; menu reflects stored state | Storage-blocked path read in code only |
| Accessibility Reset | 2 | Strong | None | Defaults restored, input/results/file error kept, focus stays, announced; app Reset keeps preferences; 12-a11y reset test | |
| Accessibility Statement | 3 | Strong | Known issue | Disclosure with aria-expanded; WCAG 2.2 AA, features, limitations, reporting | LOW-2: no mention of file loading; placeholder address |
