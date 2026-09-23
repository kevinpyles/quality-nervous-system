# Comparinator Internationalization (I18N) Report

| Item | Value |
|---|---|
| Build under test | `comparinator.html`, sha256 `7424092aad7e86b1cd3f25a58a943b69e756b819ebfe700c099f3c937f941bb4` (modified 2026-09-16 21:41; hash re-verified after testing) |
| Date | 2026-09-16 |
| App URL | http://127.0.0.1:4173/comparinator.html (Chromium, Playwright 1.62) |
| Required locales | `en` (en-US formatting), `de` (de-DE formatting) |
| Tests run | `npx playwright test tests/11-i18n.spec.js`: **38 run, 38 passed, 0 failed**. 28 check behaviour that works today. 10 are `test.fail()` tests that pin open defects and pass while each defect exists. |
| Baseline (provided) | `npm test`: 148 passed, 0 failed (not re-run, per the rules for concurrent runs) |
| Exploratory probes | 5 Playwright scripts (`SCRATCH/i18n/probe1-5.js`) covering 45 Unicode comparison cases, EN/DE string diffs, layout at 4 widths, and RTL geometry |
| Test changes | **Added** `tests/11-i18n.spec.js` (new file). No other files were changed. |

## Executive summary

The English/German UI is well externalized and switches cleanly. The two locales have the same 110 translation keys, and no `undefined` or raw keys appear. Title, placeholders, ARIA labels, validation errors, live announcements, the Accessibility menu and results already on screen all re-render when the language changes. German numbers use `.` for thousands and `,` for decimals, and the longer German text does not overflow at 320, 375, 768 or 1280 px.

The weak area is **the comparison engine with non-ASCII text**. The tokenizer (`[\p{L}\p{N}_]+`) leaves out combining marks (`\p{M}`), and `isPunctuation()` classes every other symbol as punctuation. This causes:

- **False "Match" results** with *Ignore punctuation* (I18N-01, High).
- Text that looks identical in NFC and NFD form is reported as different (I18N-02).
- Changed emoji and currency symbols are hidden (I18N-03).

RTL text shows with an LTR base direction (I18N-04). The other findings are Low.

**Overall I18N confidence: Moderate.** Confidence is high for the UI in EN/DE, and moderate to low for comparing multilingual content.

## Languages, locales and test data

- **UI locales tested:** en, de (the only supported ones). Default locale: en. Fallback: none (see I18N-10).
- **Input scripts:**
  - Latin with accents (Café, naïve, Ångström), German (ä ö ü ß ẞ, „…“ ‚…‘ –), French « » punctuation
  - Cyrillic, Greek (including final sigma), Turkish (I/ı/İ)
  - CJK (Chinese with and without spaces, full-width punctuation), Japanese
  - Arabic (with ، ؟ and tashkeel), Hebrew (with niqqud and gershayim), mixed Hebrew + Latin + digits
  - Devanagari, Thai, astral math letters
  - Emoji (❤️ with variation selector, skin tone, ZWJ family), NBSP, U+202F, curly apostrophes
  - NFC vs NFD forms, full-width Latin, decimal and currency strings
- **Viewports:** 320, 375, 768, 1280 px, plus the DE Accessibility panel at 320 px, DE at the largest text size at 375 px, and an 80-character German compound word at 375 px.

## Passed checks

| Area | Evidence |
|---|---|
| Key parity | EN 110 keys, DE 110 keys, none missing either way. Every `data-i18n` key exists in both locales (probe1). |
| Locale switching | `lang` attribute, `aria-pressed`, title, placeholders and button text all update and switch back (I18N-T01, T02). |
| Hard-coded strings | After switching to DE, the only unchanged visible texts are brand/neutral ones (Comparinator, EN/DE, Text A/B, symbols, e-mail) (probe1, T04). |
| No raw keys / `undefined` | EN and DE, including the Accessibility menu and results (T03). |
| Dynamic re-render | Summary, stats, errors and the live status text follow the language (T05, T06, probe3: "Vergleich abgeschlossen. Ähnlichkeit 99,9% …"). |
| Number formatting | de "1.200", "5.999 / 10.000", "Maximal 10.000 Zeichen"; en "1,200", "5,999 / 10,000" (T07). |
| Decimal separator in % | en "66.7%", de "66,7%" (F01). |
| Text expansion | No page-level horizontal overflow and no clipped controls in DE at 4 widths, in the Accessibility panel, or at the largest text size. Long compound words wrap (L01 x4, L02; screenshots `de-*.png`). The FAB label is clipped on purpose (it expands on focus or hover), so that result is not a defect. |
| Unicode round-trip | 8 script groups compare as 100% equal to themselves and render back unchanged in both result panels. No HTML escaping damage (U01 x8). No page errors in 45 probe cases. |
| Word-level diffs | Cyrillic, Arabic, Hebrew and mixed LTR/RTL differences are found and highlighted on the correct token (U02–U04). |
| Ignore case | German umlauts, Cyrillic, Greek (ΟΔΟΣ/οδος), ẞ/ß and full-width Latin all match (U05, probe2). |
| Ignore punctuation | German „“ ‚‘ –, French « », CJK ，。 and Arabic ، ؟ are ignored correctly (U06). |
| Whitespace | NBSP and U+202F are treated as separators (U07). |
| Counter | Counts UTF-16 units, the same as the `maxlength` limit ("😀" = 2) (U15). |
| Dates | The app shows no dates (no `Date` use in the source), so this does not apply. |

## Findings

### I18N-01 (High): combining marks are treated as punctuation, so words break apart and false matches occur
- **Where:** `tokenize()` uses `/\s+|[\p{L}\p{N}_]+|[^\p{L}\p{N}_\s]/gu`, and `isPunctuation()` uses `/^[^\p{L}\p{N}\s]+$/u`. Neither pattern includes `\p{M}`.
- **Evidence (probe2/probe3, U09, U10, and the other agent's FG-12):**
  - With Ignore punctuation, Hindi `कि` vs `की` gives **100% / "Match"**.
  - With Ignore punctuation, NFD `café` vs `cafe` gives **100%**, and NFD `é` vs `è` gives **100%**.
  - Hebrew `שָׁלוֹם` breaks into `ש|ָ|ׁ|לו|ֹ|ם`: identical text reports 6 "matching words" for 1 word, and a copy without niqqud reports 5 missing/added.
  - Arabic tashkeel breaks up the same way.
  - Identical `नमस्ते दुनिया` reports 10 matches against a word count of 2.
- **Expected:** a base letter plus its marks is one word, and marks are never ignored as punctuation.
- **Actual:** marks become separate "punctuation" tokens. The statistics are inflated, and meaningful differences are silently dropped.
- **Fix:** use `[\p{L}\p{M}\p{N}_]+` in `tokenize()`, and leave `\p{M}` out of `isPunctuation()`. Also covered by FD-03 in `10-functional-gaps.spec.js`.

### I18N-02 (Medium): no Unicode normalization
- **Evidence (U08, probe2/probe3):**
  - NFC `schön` vs NFD `schön` gives 0.0%.
  - `Café` (NFC) vs `Café` (NFD) gives 0%, with the combining accent shown as a separate added item.
- **Expected:** text that looks identical compares as equal. NFD text is common in text copied from macOS files and PDFs.
- **Fix:** `text.normalize('NFC')` before tokenizing. Rendering can still use the raw text if exact echo is needed.

### I18N-03 (Medium): emoji, currency and other symbols count as "punctuation"
- **Evidence (U11, U12, probe2/probe3):**
  - With Ignore punctuation, `I like 🍕` vs `I like 🍔` gives **100% Match**, and `Preis 5 €` vs `Preis 5 $` gives **100% Match**.
  - ZWJ emoji sequences are split per code point: 👨‍👩‍👧 vs 👨‍👩‍👦 gives 5 "matching items". ❤️ counts as 2 items.
  - Also with Ignore punctuation, `3,14` vs `3.14` match. Treating decimal separators as punctuation is arguably by design, but it hides a locale-meaningful difference.
- **Expected:** only `\p{P}` is ignored. Symbols (`\p{S}`) and emoji are content, and each should count as one grapheme.
- **Fix:** `isPunctuation = /^\p{P}+$/u`. Tokenize emoji using `Intl.Segmenter` (granularity `grapheme` or `word`).

### I18N-04 (Medium): RTL text shows with an LTR base direction
- **Evidence (R01, probe3/probe5, `rtl-*.png`):**
  - `<html>` has no `dir` attribute. The textareas and `#resultA/B` have no `dir` attribute, and their computed `direction` is `ltr`.
  - For `שלום, מה שלומך?` in `#resultB`, the final "?" is drawn to the **right** of the first word (x=812 vs 777). That is the visual start of the Hebrew sentence.
  - With `dir="auto"` set temporarily in the probe, the "?" moves to the left end (x=1084 vs 1185) and the line is right-aligned.
- **Expected:** RTL paragraphs get an RTL base direction and are right-aligned.
- **Note:** RTL is not a supported UI locale, but RTL *input* is accepted. Mixed LTR/RTL token diffs are correct (U04).
- **Fix:** add `dir="auto"` to both textareas and both result containers, or use `unicode-bidi: plaintext`.

### I18N-05 (Low): Ignore case is not full case folding and does not use the UI locale
- **Evidence (U13, probe2):**
  - `STRASSE` vs `straße` gives 0%.
  - `ΟΔΟΣ` vs `οδός` does not match (accent difference, which is expected), but ΟΔΟΣ vs οδοσ (non-final σ) also does not match.
  - Turkish `KIŞ` vs `kış` and `İSTANBUL` vs `istanbul` give 0%. `toLocaleLowerCase()` is called without a locale, so it follows the browser locale, not `currentLang`.
- **Fix:** fold both sides with `toLocaleUpperCase(LOCALE_MAP[currentLang])` followed by `toLocaleLowerCase(...)`, or compare with `Intl.Collator(locale, {sensitivity:'accent'})`. Whether ß should match SS needs to be decided as a product requirement (compare Masse and Maße).

### I18N-06 (Low): hard-coded English accessible name
- **Evidence (T08, probe1):** `#langGroup aria-label="Language selector"` stays English in DE. The language buttons `aria-label="English"` / `"Deutsch"` are correctly native-language names (endonyms), but have no `lang="en"` / `lang="de"` attribute, so screen readers pronounce them with the page language.
- **Fix:** add a translation key for the group label, and add `lang` attributes to the two buttons.

### I18N-07 (Low): word count does not match comparison tokens for some scripts
- **Evidence (U14, probe2):**
  - `你好，世界。` shows Word Count 1, but 2 matching items.
  - `« Bonjour » !` shows Word Count 4, because the `« » !` marks are counted as words.
  - Unspaced CJK text is compared as one token, so any change marks the whole sentence as different (`我喜欢苹果` vs `我喜欢香蕉` gives 0%).
- **Fix:** count words with the same tokenizer, or with `Intl.Segmenter(locale,{granularity:'word'})` (`isWordLike`). The Segmenter also improves CJK and Thai diffs.

### I18N-08 (Low): German percentage format is hand-rolled
- **Evidence (F02):** `fmtPercent()` produces `66,7%`. `Intl.NumberFormat('de-DE',{style:'percent'})` produces `66,7 %` (with a no-break space), which follows the CLDR and DIN 5008 conventions. The same hand-rolled pattern would break for any new locale.
- **Fix:** use `Intl.NumberFormat(LOCALE_MAP[currentLang], {style:'percent', minimumFractionDigits:1, maximumFractionDigits:1})`.

### I18N-09 (Low, technical): the summary sentence is assembled from fragments
- **Evidence (probe3):** DE shows "Vergleich abgeschlossen: 1.200 übereinstimmende Elemente, **mit 1 hinzugefügtes Element** in Text B." `withWord` ("mit") is joined to a noun phrase that `addedItems` / `missingItems` return in the nominative case. German "mit" needs the dative ("hinzugefügten Element"), which fragment joining cannot produce.
- **Note:** this is a technical defect caused by string concatenation. A native-speaker review is recommended for the wording itself; this report does not judge translation quality.
- **Fix:** use whole-sentence templates per locale, with plural handling via `Intl.PluralRules`.

### I18N-10 (Low): fallback, persistence and resource hygiene
- **Evidence (source review, probe1):**
  - `t()` has no fallback: `translations[currentLang][key]` returns `undefined`, which would render as the text "undefined" for any missing key. This is latent today, because the keys are at parity.
  - The chosen language is not saved (only accessibility settings use `localStorage`), and `navigator.language` is not checked, so German users start in English on every load.
  - `resultLegendInline` and `legendSame` are each defined twice per locale. The later definition wins silently. `legendDifferent` and the old "Green = match" strings are dead entries.
- **Fix:**
  - Fall back to `translations.en[key] ?? key` and log a warning in development.
  - Save the language choice, and detect the initial language from `navigator.languages`.
  - Remove the duplicate keys, and add a key-parity check to CI.

## Locales not tested
- No UI locale other than en and de exists, so fr, es, ja, ar, he and others could not be tested as UI languages. Their scripts were tested as input only.
- en-GB, de-AT and de-CH formatting are not selectable. de-CH would use `’` as the thousands separator.
- Only Chromium was used. Firefox and WebKit may differ in bidi, `toLocaleLowerCase` and font fallback.
- No screen-reader run in DE (owned by the a11y agent).
- Uploading files in non-UTF-8 encodings (Latin-1, UTF-16 BOM) was not tested (partly owned by the file-drop agent).

## Remaining global-readiness risk
The UI framework is adequate for two LTR locales. Adding a third locale today would require:
- a fallback for missing keys
- `Intl`-based percentage formatting
- whole-sentence templates for the summary
- RTL layout work (no `dir` handling, CSS is not written in logical properties)

The comparison engine is the larger risk. Any user comparing Indic, Thai, Hebrew-with-niqqud, Arabic-with-tashkeel, NFD, emoji or unspaced CJK text can get inflated statistics or false "Match" verdicts. **The app is not globally ready.**

## Release recommendation
**Conditional go for en/de.** Both UI locales are complete and render correctly. Before any claim of multilingual comparison support:
- fix I18N-01 (High), which produces false equivalence with Ignore punctuation
- fix I18N-02 and I18N-03

Add I18N-04 before any RTL market is targeted. All Low findings can wait for a later release. The `test.fail()` tests in `tests/11-i18n.spec.js` will flag each fix.

Evidence files in the scratch folder (`SCRATCH/i18n/`): `probe1.js`–`probe5.js`, `de-320.png`, `de-375.png`, `de-768.png`, `de-1280.png`, `de-a11y-320.png`, `de-maxtext-375.png`, `de-longword-375.png`, `rtl-textarea.png`, `rtl-resultA.png`, `rtl-pure-textarea.png`, `rtl-pure-resultB.png`.

## Gap analysis data

| Area | Risk (1-10) | Confidence (Strong/Partial/Weak/Gap/Unknown) | Known issue (None/Known issue/Significant risk/Blocker) | Evidence | Notes |
|---|---|---|---|---|---|
| Multiple Languages | 3 | Strong | None | I18N-T01, T02, T04, T05; probe1 | en and de fully switchable; only two locales exist |
| Translation Rendering | 3 | Strong | Known issue | T03–T06; probe1; I18N-09 | No `undefined`/raw keys; German summary is built from fragments, giving a case-agreement error (Low) |
| Missing Translation Handling | 5 | Partial | Known issue | probe1 key parity 110/110; source review of `t()` (I18N-10) | No fallback: a missing key would render "undefined"; latent only; duplicate/dead keys |
| Text Expansion | 2 | Strong | None | L01 at 320/375/768/1280, L02; `de-*.png` | No overflow/clipping in DE incl. a11y panel and max text size |
| Unicode Support | 7 | Partial | Significant risk | U01 x8, U08–U12, probe2 (45 cases) | Round-trip is safe; no NFC normalization; `\p{M}` and `\p{S}` misclassified (I18N-01/02/03) |
| Accented Characters | 6 | Partial | Known issue | U01, U08, U09; probe2 | Precomposed accents fine; decomposed (NFD) accents break words or are ignored with Ignore punctuation |
| CJK Characters | 5 | Partial | Known issue | U01, U06, U14; probe2 | Renders and compares when spaced; unspaced text is one token; word count mismatch (I18N-07) |
| Cyrillic | 2 | Strong | None | U01, U02, U05 | Diffs and case folding correct |
| Arabic | 6 | Partial | Known issue | U01, U03, U06; probe2 tashkeel | Plain Arabic OK; tashkeel breaks words; LTR base direction (I18N-01/04) |
| Hebrew | 6 | Partial | Known issue | U01, U03, U10; probe2/probe5 | Plain Hebrew OK; niqqud breaks words; gershayim splits acronyms; "?" placed on the wrong side |
| Emoji | 6 | Partial | Known issue | U01, U11; probe2 ZWJ | Round-trip OK; Ignore punctuation hides emoji changes; ZWJ/VS sequences split (I18N-03) |
| Right-to-Left Layout | 5 | Weak | Known issue | R01; probe3/probe5; `rtl-*.png` | No RTL UI locale (not required); RTL input shown LTR-based, no `dir="auto"` (I18N-04) |
| Mixed LTR/RTL Content | 4 | Partial | Known issue | U04; `rtl-resultA.png` | Token diffs correct and readable; paragraph base direction is not detected |
| Locale-Sensitive Case Handling | 4 | Partial | Known issue | U05, U13; probe2 | Umlauts/ẞ/Cyrillic/Greek OK; ß/SS, final sigma and Turkish I fail; ignores UI locale (I18N-05) |
| Locale-Sensitive Punctuation | 5 | Partial | Known issue | U06, U12; probe2 | DE/FR/CJK/Arabic punctuation handled; currency and decimal separators treated as ignorable punctuation (I18N-03) |
| Number Formatting | 2 | Strong | None | T07; probe3 | `toLocaleString` en-US/de-DE for counters, stats, messages |
| Percentage Formatting | 3 | Partial | Known issue | F01, F02 | Decimal comma correct; hand-rolled, omits the de-DE no-break space before % (I18N-08) |
| Date Formatting | 1 | Strong | None | Source review: no `Date`/date output | Not applicable: the app shows no dates |
| Locale Fallback Behavior | 5 | Weak | Known issue | Source review (I18N-10); T01 | Hard-coded default en; no browser-locale detection, no persistence, no per-key fallback |
