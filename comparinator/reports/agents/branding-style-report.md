# Comparinator: Branding & Style Assessment

| | |
|---|---|
| **Build under test** | `comparinator.html`, sha256 `7424092aad7e86b1cd3f25a58a943b69e756b819ebfe700c099f3c937f941bb4` (modified 2026-09-16 21:41; hash re-verified after testing) |
| **Date** | 2026-09-16 |
| **Reference** | `style-guide.html` (Mark-VII UI System v1), served at http://127.0.0.1:4173/style-guide.html |
| **Agent** | Branding & Style Testing Agent |
| **Tests run** | `tests/13-branding-style.spec.js` (new, Chromium): **19 passed, 0 failed**. That is 16 normal assertions plus 3 `test.fail()` known-defect tests (BRD-01..03). Those 3 fail as expected, so Playwright counts them as passed. Stability run with `--repeat-each=3`: **57 passed, 0 failed**. |
| **Other evidence** | Scratch capture scripts (not committed): 7 viewports x 9 states, 126 screenshots, computed-style inventory, contrast calculations. The shared baseline (`npm test`: 148 passed / 0 failed) was provided by the orchestrator. I did not re-run it. |

## Executive summary

The build closely matches the Mark-VII style guide. Every shared colour token matches the guide in both light and dark mode, with one exception: the light-mode green was deliberately darkened for contrast. The app follows the guide's semantic rules. Gold marks interactive elements, red marks differences and errors only, and green marks matches only. Reactor cyan is not used anywhere, and HUD corner brackets appear only on the two main containers (hero and Accessibility drawer). Typography, radii, button styles and panel styles follow the guide.

At 7 viewports (320–1440 px), in light, dark, German, high-contrast, 200 % text and readable-font/highlight modes, there is **no horizontal overflow, no off-screen control and no overlapping buttons**.

I found **no Critical or High defects**. There are **3 Medium defects**:
- When the input footer wraps onto a second line, its text sits flush on the panel's rounded bottom edge.
- The side edges of the textarea focus ring are cut off by the panel.
- The amber near-limit character counter has too little contrast.

There are also **several Low items**: a leftover blue-grey switch track, hard-coded hover colours, a misaligned placeholder on first load, and differences between the guide and the app that the guide does not record.

**Overall visual confidence: Good (about 80 %).** This score comes from computed-style checks, geometry checks and manual review of screenshots. It is **not** a pixel-diff result, because **the repo has no approved visual-regression baselines**. I did not add any.

## Viewports and states tested

| Viewports | 1440x900, 1280x800, 1024x768 (tablet landscape), 768x1024 (tablet portrait), 390x844, 360x740, 320x568 |
|---|---|
| Themes / locales | Light, dark ("Suit up"), English, German |
| App states | Default/empty; results after a comparison; identical texts (match summary); empty-input validation error; counter warning (9,200 chars) and limit (10,000 chars); drag-over; Accessibility drawer open; after Reset |
| Interaction states | Hover (Compare, Reset, Choose file, language, Accessibility button); mouse-down (active); keyboard focus on the first 14 tab stops; checked/pressed (language, theme switch, accessibility options); disabled (text size A+ at maximum) |
| Accessibility presentations | High contrast, 200 % text size, readable font + highlight headings + highlight links, keyboard-navigation focus mode |

## Passed checks

- **Colour tokens:** 23 shared tokens (surfaces, text, gold, red, green, input, scrim, glows, radii) match the guide in dark mode. Light mode matches too, except `--green`/`--green-soft` (see BRD-07). The test reads the tokens from both pages at run time.
- **Semantic colour rules:** No red appears outside the diff, error, limit and legend elements (automated scan). Similarity and Accuracy use gold, Matching uses green, and Different and Missing use red. No cyan is used anywhere.
- **Typography:** Inter/system sans for the UI and monospace for textareas and results, as the guide requires. Uppercase tracked headings, eyebrow and stat labels; eyebrow weight 800, stat value weight 850.
- **Buttons:** The primary button uses the gold gradient `135deg #a9750a → #c99a2e` with dark text `#1a1410` (4.55:1, and 10.9:1 in dark mode). Secondary buttons use the strong panel fill (`--panel-strong`), a 12px radius and weight 750. All tested buttons are at least 44px tall.
- **Inputs and panels:** Hero and panels use the 26px radius, the controls bar uses 20px, borders and fills use the correct tokens, and checkboxes use `accent-color: --gold`.
- **Hover:** Buttons lift 1px on hover (translateY -1px), and the primary button also gets `brightness(1.05)` over 160ms, as the guide specifies.
- **Checked/pressed:** The selected language has a gold border and a soft gold background (`--gold-soft`). The checked switch uses the gold gradient. Checked accessibility options get a gold border and soft gold fill.
- **Disabled:** opacity .55, `cursor: not-allowed`, and no hover lift.
- **Focus:** a 3px `--gold-ring` outline with 2px offset on buttons, checkboxes, the theme switch and textareas. Keyboard-navigation mode switches to a solid 4px gold ring.
- **Error/warning:** The validation message uses an amber left bar and amber background with an "!" icon, so it does not rely on colour alone. The character limit turns the counter red and bold (800). Drag-over shows a dashed gold outline and a text hint.
- **Responsive:** No overflow or clipping at any tested viewport or mode, including long German strings. Panels sit side by side at 1024 px and wider and stack below 22rem per column. Below 820px the hero switches to a column layout. The drawer becomes full width below 560px.
- **High contrast:** A consistent black/white/yellow theme with no leftover glass effects. Diff tokens stay distinguishable through outlines and underlines.

## Findings

| ID | Severity | Area | Expected | Actual | Evidence | Recommended fix |
|---|---|---|---|---|---|---|
| BRD-01 | **Medium** | Layout / Inputs | Footer text keeps its padding from the panel's rounded bottom edge. | `.input-footer` has `padding: 0 18px`. When it wraps, "Maximum 10,000 characters" sits **0px** from the bottom border, and the 26px corner radius cuts into the text. Happens at 320px (default), 390px at 200 % text, and 768px in high contrast. | `branding-evidence/footer-768-contrast.png`, `footer-390-text200.png`; test BRD-01 | Add vertical padding (e.g. `padding: 6px 18px`) or `row-gap` to `.input-footer`. |
| BRD-02 | **Medium** | Focus states | The 3px gold focus ring is visible on all four sides (guide: "Focus glow"). | The textarea spans the full panel width, and `.panel { overflow: hidden }` cuts off the ring's left and right sides. Only the top and bottom edges show, even in keyboard-navigation mode. | `focus-textA-page.png`; test BRD-02 | Use `outline-offset: -3px` for panel textareas, or an inset `box-shadow` ring. |
| BRD-04 | **Medium** | Error/warning states | Status text is readable (at least 4.5:1 for 12px text). | `.counter.warn` uses `--amber #bb7a15` on the panel: **3.41:1** at 12px. Dark mode (11.2:1) is fine. | Contrast calculation in this report | Add a darker amber text token for light mode (like `--gold-text`). Also flagged for the accessibility agent. |
| BRD-03 | Low | Empty state | The placeholder starts at the 20px content padding. | On first load, `white-space: pre-wrap` keeps the source line break and indentation before `<span class="empty">`. The placeholder renders one line down and about 101px in. After Reset it is correct. | `state-empty-initial.png`; test BRD-03 | Remove the whitespace inside `#resultA`/`#resultB` in the markup. |
| BRD-05 | Low | Brand colour | Off switch track uses warm `rgba(140,120,90,.30)` (guide). | `rgba(120,135,160,.30)` is a cool blue-grey left over from the pre-reskin blue theme. It shows on all 7 switches. | `desktop-1440-a11y-panel` / `mobile-390-a11y-panel.png` | Use the guide value. |
| BRD-06 | Low | Hover / tokens | Hover colours come from gold tokens ("gold is the brand"). | Button and language-button hover borders use a hard-coded `rgba(212,175,55,.45)` / `.35`. It looks similar but ignores the theme and is not a token. | CSS lines 214, 277; computed hover styles | Use `--gold-ring` / `--gold`. |
| BRD-07 | Low | Guide/app drift (not recorded in the guide) | The app matches the guide, or the guide records the exception. | Light `--green #15703b` vs guide `#1f8a4c`. **The change is justified:** the guide value is only 4.20:1 on panels, the app value 5.90:1. The new `--gold-text #8a5f08` for the eyebrow is also justified (the guide's gold is 3.85:1 at 11px). Other differences: eyebrow 12px/.13em vs 11px/.16em; h1 `clamp(34–58px)`/-.02em vs `clamp(32–52px)`/-.03em; disabled opacity .55 vs .45; switch 46x26 vs 42x24; stat tile radius 18px (guide shows 16px, and neither is a token); the stats grid uses auto-fit, which gives 4+3 at 768px and one column at 320px, while the guide shows 4 columns and 2 columns at 900px or less. | Token test (exceptions list), computed styles | Record these as accepted exceptions in `style-guide.html` or align the app with the guide. The guide should adopt the higher-contrast green and gold-text values. |
| BRD-08 | Low | Accessibility drawer HUD | Corner brackets frame the container without covering content. | The brackets stay fixed while the drawer body scrolls under them. On short viewports the bottom brackets sit on top of the "Accessibility statement" button. The CSS comment says HUD corners are "reserved for the hero panel only". The guide still allows them on main containers. | `mobile-390-a11y-panel.png` | Put the brackets behind the content (z-index) or inset the body. Update the CSS comment. |
| BRD-09 | Low (observation) | Floating button | — | The fixed Accessibility button covers part of the stat tiles and result text at tablet and mobile widths while scrolling. The overlay is by design (it collapses to its icon), and nothing becomes unusable. The exact overlap at real scroll positions was not measured. | `tablet-768-light-default.png` | Consider extra bottom/right padding around the results area. |

**Suggestions (my opinion, not defects):** On mobile, the centred legend items wrap into uneven lines, and left-aligning them may look cleaner. The default gold focus ring (30 % alpha, about 1.4:1 against the light background) matches the guide exactly but looks faint. The guide could use a stronger ring, like the one in keyboard-navigation mode.

**Outside my area (passed to the i18n agent):** After **Reset**, the result placeholder is re-rendered without `data-i18n`. Switching to Deutsch then leaves the English "Run a comparison to see highlighted results." on screen (confirmed with a script).

## Screenshots / evidence

- Committed evidence (9 PNGs, 1.4 MB): `reports/agents/branding-evidence/`
- Full scratch set (126 screenshots, `capture-report.json`, scripts): `SCRATCH/branding/` (not committed)
- **No visual-regression baselines exist in the repo, and none were added.** The checks are computed-style, token, geometry and contrast assertions plus manual screenshot review. They are not pixel diffs.

## Tests added

`tests/13-branding-style.spec.js` (new; no existing files changed) contains 19 tests:
- tokens vs. guide (light, dark)
- typography
- buttons
- inputs/panels
- semantic colour scan
- reactor/HUD usage rules
- hover/checked/disabled states
- focus ring
- error/limit styling
- no-overflow checks at 5 viewports (light + dark + German)
- panel stacking
- `test.fail()` tests for BRD-01, BRD-02 and BRD-03

Once those defects are fixed, those tests will report "unexpectedly passed". Remove the `test.fail()` wrapper at that point.

## Areas not tested

- Pixel-level visual regression (no approved baselines)
- Firefox and WebKit (the config runs Chromium only)
- Real touch devices
- Browser zoom, as opposed to the in-app text scale
- Windows/Linux font rendering (Inter is not bundled, so the page falls back to system fonts)
- Timing of the 200ms results fade-in described in the guide (not observed or measured)
- Theme-switch transition timing
- Print styles
- The file-picker dialog
- Very long single-line inputs beyond the sample

## Remaining risk

- No pixel baselines exist, so small regressions in spacing or shadows would go unnoticed. The tests check token values and layout geometry only.
- Inter is not bundled, so typography varies by operating system.
- The guide and the app differ in places the guide does not record (BRD-07). Future changes may be judged against the wrong source.

## Release recommendation

**Release with minor fixes recommended.** No blocking visual defects. Fix BRD-01, BRD-02 and BRD-04 in the next patch, and bring the style guide up to date with the app's changes.

## Gap analysis data

| Area | Risk (1-10) | Confidence (Strong/Partial/Weak/Gap/Unknown) | Known issue (None/Known issue/Significant risk/Blocker) | Evidence | Notes |
|---|---|---|---|---|---|
| Approved Colors | 3 | Strong | Known issue | 13-branding-style: token tests (light+dark), semantic-colour scan, cyan scan; contrast calculations | Tokens match the guide. Accepted green deviation. BRD-05 blue-grey switch track, BRD-06 hard-coded hover colour |
| Typography | 3 | Strong | Known issue | Typography test; computed-style inventory; screenshots at 7 widths | Font stacks and hierarchy correct. Eyebrow and h1 size/tracking differ from the guide (BRD-07). Inter not bundled |
| Spacing | 4 | Partial | Known issue | Geometry script; footer clearance measurements; BRD-01 test | Wrapped footer has 0px bottom clearance (BRD-01). No pixel baseline |
| Layout | 4 | Strong | Known issue | Overflow/off-screen/overlap checks, 7 viewports x 9 states; stacking test | No overflow. BRD-01 and BRD-03 misalignments |
| Component Consistency | 3 | Strong | Known issue | Radius/border/fill inventory; buttons, inputs/panels tests | Consistent radii and fills. Stat tile radius 18px is not a token (BRD-07) |
| Buttons | 2 | Strong | None | Buttons test; hover/disabled tests; screenshots | Gold primary, neutral secondary, 12px radius, 44px or taller |
| Inputs | 4 | Strong | Known issue | Inputs/panels test; focus screenshots; BRD-02 test | Textarea focus ring cut off at the sides (BRD-02); footer clearance (BRD-01) |
| Cards / Panels | 3 | Strong | Known issue | Panel radius/border checks; HUD usage test; drawer screenshots | Drawer HUD brackets cover scrolled content (BRD-08) |
| Icons | 3 | Partial | None | Screenshots (a11y glyph, "!" error icon, legend marks, flags) | Visual review only. Flag emoji render differently across OSes. No icon-specific automation |
| Hover States | 3 | Strong | Known issue | Hover computed styles for 5 controls; hover test | 1px lift and brightness match the guide. Hard-coded border colour (BRD-06) |
| Focus States | 5 | Strong | Known issue | Focus-walk capture (14 stops); focus test; 2x focus screenshots | Textarea ring cut off (BRD-02). Default ring faint (~1.4:1) but matches the guide |
| Active States | 3 | Partial | None | Checked/pressed styles (language, switch, a11y options); mouse-down capture | No explicit `:active` style (the guide defines none). Pressed state is the hover state |
| Disabled States | 2 | Strong | None | Disabled test (A+ at maximum); screenshot | opacity .55 vs guide .45 (BRD-07) |
| Error States | 4 | Strong | Known issue | Error/limit test; empty-input and limit screenshots | Amber warning counter 3.41:1 (BRD-04) |
| Responsive Layout | 3 | Strong | Known issue | 5-viewport overflow tests (light/dark/German); 7-viewport scratch sweep including 200 % text and high contrast | No overflow. BRD-01 appears at narrow widths and scaled text |
| Desktop Presentation | 2 | Strong | None | 1440/1280 screenshots light and dark; overflow tests | Clean. Matches the guide's look |
| Tablet Presentation | 3 | Strong | Known issue | 1024/768 screenshots; overflow tests | 4+3 stat grid leaves a gap (BRD-07); BRD-01 in high contrast |
| Mobile Presentation | 4 | Strong | Known issue | 390/360/320 screenshots; overflow tests; drawer screenshot | BRD-01, BRD-08, floating button covers content (BRD-09); single-column stat tiles |
| Visual Regression | 7 | Gap | Significant risk | None: no approved baselines in the repo | Only computed-style and geometry checks. Pixel regressions would go undetected |
