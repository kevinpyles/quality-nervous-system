# Comparinator Security Report

| Item | Value |
|---|---|
| Build under test | `comparinator.html` sha256 `7424092aad7e86b1cd3f25a58a943b69e756b819ebfe700c099f3c937f941bb4` (modified 2026-09-16 21:41; hash re-checked at the end of testing: unchanged) |
| Date | 2026-09-16 |
| Environment | Local build at `http://127.0.0.1:4173/comparinator.html` (http-server, dev only), Playwright Chromium 1.62.1 |
| Agent | Security Testing Agent |
| Requirements | `security-requirements.md` (SEC-001 to SEC-042) |

## Tests run

| Spec | Tests | Passed | Failed | Notes |
|---|---|---|---|---|
| `tests/14-security.spec.js` (new, this agent) | 34 | 31 | 3 | The 3 failures are intentional and track confirmed defects SEC-F1 and SEC-F2 (see below). |
| `tests/06-security.spec.js` (existing, owned) | 2 | 2 | 0 | TC-28 and TC-29 |
| `tests/09-file-drop.spec.js` (existing, evidence) | 86 | 86 | 0 | Includes 3 `test.fail()` known-defect markers owned by the drag-and-drop agent (F-1). Playwright counts these as passed. None of them are security-related. |
| **Combined run** | **122** | **119** | **3** | `npx playwright test tests/14-security.spec.js tests/06-security.spec.js tests/09-file-drop.spec.js --reporter=list --output=SCRATCH/security/pw-out` |

The baseline `npm test` supplied by the orchestrator had 148 passed and 0 failed. I did not run `npm test`.

Other checks:
- A Playwright probe script covered 34 payload x option runs, 14 localStorage tamper values, query-string/hash input, framing and network capture.
- A resource-exhaustion timing script covered 12 pathological inputs plus 100 repeated comparisons with a heap check.
- `npm audit` and `npm ls --all` checked dependencies.
- `curl -I` checked response headers.
- A manual source review covered every sink.

Scratch evidence is in `SCRATCH/security/`: `probe.js`, `probe-out.txt`, `probe-out-tail.txt`, `perf.js`, `perf-out.txt`, `nul.js`, `run-all.txt`, `run14.txt`, `length-bypass.png`, `xss-last.png` and `pw-out/` traces. SCRATCH is `<scratch dir>`.

---

## Executive summary

I found **no exploitable vulnerability** in this build.
- **Output encoding:** all user-controlled text reaches the DOM either through `textContent` or through `escapeHtml()`, which escapes `& < > " '` for every token.
- **XSS and HTML injection:** 16 XSS and HTML-injection payload families did not execute and did not change page structure. They were tested with both option sets, in English and German, in file names and file content, and in the query string and hash.
- **Local storage:** it holds only validated accessibility preferences, never comparison text.
- **Network:** a full workflow sends no request other than the page load itself.
- **External resources:** there are none.

I confirmed **two requirement failures**, and neither is exploitable by a remote attacker:

| ID | Severity | Requirement | Summary |
|---|---|---|---|
| SEC-F2 | **Medium** | SEC-034, SEC-003 | 10,000 punctuation characters (or combining marks) with **Ignore punctuation** on block the main thread for **5.2 to 6.4 s**. The cause is an O(n²) scan in `classifySource()`. |
| SEC-F1 | **Low** | SEC-002 | The 10,000-character limit relies only on `maxlength`. `compare()` does not validate length, so text set by script is accepted: 20,000 characters rendered and the counter showed "20,000 / 10,000" with no error. |

**Overall security confidence: High for the tutorial scope** (browser-side, Chromium, local build). Confidence is **unknown** for hosted-deployment controls (CSP, headers, HTTPS) because no hosted environment exists.

**Release recommendation:** **Acceptable for tutorial release with conditions.** No blocker exists. Fix SEC-F2 before any wider release, because a shared file can freeze the page for several seconds. Track SEC-F1 as low priority, and fix it before prefill, import or agent-generated content feeds the text fields.

---

## Attack surface reviewed

| Surface | How reached | Result |
|---|---|---|
| Text A / Text B | Typing, `fill`, `insertText`, script-set `value` | Rendered inert. Limit bypass via script (SEC-F1). |
| File drop / Choose file (content) | Simulated `DataTransfer` drop, 2-file auto-compare | Rendered inert |
| File **names** | Shown in field errors and the status region | `textContent` only, inert |
| Ignore case / Ignore punctuation | Toggled with every payload | Inert. Punctuation mode is the DoS vector (SEC-F2). |
| Language switch (EN/DE) | Re-renders results and the summary via `innerHTML` | Inert |
| Accessibility Menu + statement | `innerHTML` of static translation string | Trusted constant markup, no user data |
| localStorage `comparinator.a11y` | Read in an early `<head>` script and in `loadA11ySettings()` | Validated. Tampering is ignored. |
| Query string / hash | `?textA=<img…>&lang=<svg>#<img…>` | Not read by the app |
| Network | All requests captured during the full workflow | Only `GET /comparinator.html` |
| Framing | Loaded in an `<iframe>` | Framable (hardening note H3) |

Not present in this build: backend or API, authentication, telemetry, analytics, service worker, cookies, `postMessage` and URL parameters.

---

## Requirements tested

| Requirement | Result | Evidence |
|---|---|---|
| SEC-001 Untrusted input | Pass | All inputs above treated as data |
| SEC-002 Input length enforcement | **Fail (SEC-F1)** | UI cap passes (`fill` 10,050 → 10,000; `insertText` 12,000 → 10,000). The logic check is missing. |
| SEC-003 Malformed input | Pass with caveat | No execution, DOM corruption or errors. Caveats: SEC-F2 slowness, and U+0000 dropped from rendered output (P2). |
| SEC-004 Safe output rendering | Pass (escaped) | 8 `innerHTML` assignments reviewed. User text is always escaped (see sink table). |
| SEC-005 Safe highlighting | Pass | Only `span/del/ins/strong` with the classes `match-run token same different diff-run empty` appear. No other attributes. |
| SEC-006 No executable user content | Pass | `window.__pwned` stayed 0 and no dialogs fired |
| SEC-007 Stored/reflected XSS | Pass | No reflected source. The only stored source (a11y prefs) is validated. |
| SEC-008 DOM XSS sinks | Pass | Static review lock test plus dynamic payloads |
| SEC-009 HTML injection | Pass | `<h1>`/`<h2>` input adds no heading. Forms, iframes and styles unchanged. |
| SEC-010 Attribute injection | Pass | Payload `<span class="token same" id="compareBtn" style=…>` produced no extra id, style or class |
| SEC-011 No text in storage | Pass | local/session storage, cookies, IndexedDB, Cache Storage and service workers all checked |
| SEC-012 Validate stored values | Pass | 14 tampered values (types, style injection, `__proto__`, non-JSON, 100 KB) were ignored |
| SEC-013 Clearable local data | Pass | The app Reset leaves a11y prefs as documented; the menu's own reset restores defaults |
| SEC-014/015/016 Local processing, no transmission | Pass | Zero non-page requests; `sendBeacon` never called |
| SEC-017/018 Trusted resources, no dynamic scripts | Pass | No `script[src]`, `link`, img/iframe or `@import`/`url(//…)`; no dynamic script creation |
| SEC-019 Safe links | Pass | Only `#fragment` and `mailto:` links; no `target=_blank` |
| SEC-020/021 CSP and headers | Gap: not deployed | Local http-server sends no CSP or security headers (H1) |
| SEC-022 HTTPS | Not applicable locally | No hosted environment |
| SEC-023/024/025 Dependencies | Pass with note | `npm audit`: 1 moderate issue (`qs` via http-server, dev only). Lockfile pins versions. |
| SEC-026/027 Safe errors, fail safely | Pass | Errors show only the file name; no stack traces or paths; no page errors under hostile input |
| SEC-028/029 Logging | Pass | No `console.*` calls in source; no console output captured |
| SEC-030 No eval | Pass | No `eval`, `new Function`, string timers, `document.write` or `import()` |
| SEC-031/032 No secrets | Pass | Pattern scan clean; the only address is the placeholder `accessibility@example.com` |
| SEC-033 Logic does not execute input | Pass | Regex tokenizer plus string compare only |
| SEC-034 Resource exhaustion | **Fail (SEC-F2)** | See below |
| SEC-035 Accessibility feature security | Pass | Classes come from a fixed map; scale comes from an allowlist; the statement is a constant |
| SEC-036 Unicode safety | Pass | RLO/PDF, ZWJ/ZWSP/BOM, combining marks, Cyrillic homoglyphs, U+2028 and U+3000 are displayed, never executed. See P1 for bidi display. |
| SEC-037 to SEC-042 Backend | Not applicable | No backend |

### Dangerous sink review (`comparinator.html`)

| Line | Sink | Data | Verdict |
|---|---|---|---|
| 2436, 2440 | `resultA/B.innerHTML` | `renderTokens()`: every token passes through `escapeHtml()`. Tags and classes are constants. | Safe (escaped) |
| 2447, 2454 | `summary.innerHTML` | `t()` translation strings with **numeric** arguments only | Safe (no user data) |
| 2500, 2502, 2503 | Reset placeholders | Constant translation strings | Safe |
| 2735 | `a11yStatement.innerHTML` | Constant `a11yStatementHtml` (EN/DE) | Safe (trusted markup) |
| 2156, 2475 | `textContent` | Field errors (including file names) and status announcements | Safe |
| 25, 2722 | `style.setProperty('--a11y-text-scale')` | Allowlisted number from `[1,1.1,1.25,1.5,2]` | Safe |
| 2475 | `setTimeout(fn, 60)` | Function argument, not a string | Safe |

---

## Confirmed vulnerabilities

### SEC-F2: Main-thread freeze on punctuation-dense input with Ignore punctuation (Medium)

- **Requirement:** SEC-034 (also SEC-003)
- **Area:** Comparison engine, `classifySource()` (comparinator.html, function starting at line 2289; inherit loop in the `ignorePunctuation` branch)
- **Cause:** When Ignore punctuation is on, the loop runs once for every punctuation token. For each one, it scans left and then right through the entire token list looking for a non-punctuation neighbour with a state. When there is no such neighbour, as in all-punctuation input, each scan covers all ~10,000 tokens and calls a Unicode regex on each. That makes the cost O(n²), about 10⁸ regex tests. Combining marks (`\p{M}`) are also classified as punctuation.
- **Steps to reproduce:**
  1. Enable Ignore punctuation.
  2. Paste 10,000 `!` into Text A and 10,000 `?` into Text B, or drop two such `.txt` files, which auto-compares.
  3. Click Compare.
- **Actual (measured):**

  | Input (10,000 chars per side) | Ignore punct. | Compare time |
  |---|---|---|
  | `!` x10000 vs `?` x10000 | on | 5,188 ms (probe), 6,439 ms (spec run) |
  | identical `!` x10000 | on | 5,187 ms |
  | `.` x9996 + " end" vs " diff" | on | 5,213 ms |
  | combining marks x9999 | on | 3,046 to 3,627 ms |
  | `! ` x5000 | on | 2,078 ms |
  | 5,000 emoji | on | 1,878 ms |
  | same punctuation | **off** | 19 ms |
  | 2,100-word LCS at the matrix limit / 5,000 disjoint words / 10,000-char token / 10,000 newlines | n/a | 36 / 14 / 0 / 0 ms |

  The page is unresponsive for the whole time. It recovers without a refresh, and the next comparison works. Toggling Ignore case, toggling Ignore punctuation or switching language while such results are shown triggers the full freeze again, because each of these re-runs `compare()`.
- **Expected:** The app stays responsive within the documented 10,000-character limit. The spec uses a generous bound of under 2 s; comparable inputs finish in under 40 ms.
- **Evidence:** `SCRATCH/security/perf-out.txt`. Failing tests: `14-security.spec.js` › "SEC-034 stays responsive: 10,000 punctuation characters, Ignore punctuation on [KNOWN DEFECT SEC-F2]" and "… combining marks …".
- **Impact:** Availability only. A crafted text file shared with a user causes a multi-second freeze. There is no data or integrity impact, and the effect is limited to the user's own tab.
- **Remediation:**
  - Compute inherited states in two linear passes: carry the last non-neutral, non-punctuation state left-to-right, then right-to-left for tokens still neutral. This makes the function O(n).
  - Also cache `isPunctuation`/`isWhitespace` per token, instead of re-running the regex inside the inner loops.

### SEC-F1: Length limit enforced only by `maxlength` (Low)

- **Requirement:** SEC-002 ("shall not rely only on the HTML `maxlength` attribute"; "Limits shall also be validated in application logic")
- **Area:** `compare()` and `setCounter()`. File loading does check `MAX_CHARS` (line 2551), but typed or script-set text does not.
- **Steps to reproduce:**
  1. In DevTools, or from any future prefill/import code, run `textA.value = 'word '.repeat(4000)` and dispatch `input`.
  2. Enter `word` in Text B.
  3. Click Compare.
- **Actual:** The counter shows **"20,000 / 10,000"**, no field error appears, the comparison runs and 20,000 characters are rendered. If you remove `maxlength` and use `fill`, the field accepts 20,000 characters. Evidence: `SCRATCH/security/length-bypass.png` and `probe-out.txt`.
- **Expected:** Over-limit text is rejected, or truncated with a clear message.
- **Evidence:** Failing test `14-security.spec.js` › "SEC-002 application logic rejects text over 10,000 characters that bypasses maxlength [KNOWN DEFECT SEC-F1]".
- **Impact:** Low today, because it takes the user's own DevTools or script. It becomes relevant once any programmatic source (URL prefill, API, agent content) writes to the fields. Unbounded input also bypasses the documented performance envelope: the LCS falls back to greedy above 4.5M cells, so the failure mode is slower comparisons, not a crash.
- **Remediation:** In `compare()`, when `value.length > MAX_CHARS`, show a field error (for example a new `errorTooLong` key) and skip the comparison. Also have `setCounter()` flag any count over the limit.

---

## Potential vulnerabilities / observations requiring follow-up

| ID | Observation | Why not confirmed | Suggested follow-up |
|---|---|---|---|
| P1 | Bidi control characters (U+202E) in **file names** are shown as-is in error and status messages. A name like `report<RLO>txt.exe` displays with a spoofed extension. | The app validates the real extension, so it rejects the file. The only effect is display confusion for the user. | Wrap file names in `<bdi>` or strip bidi controls (U+202A to U+202E, U+2066 to U+2069) when displaying them. |
| P2 | U+0000 (NUL) in input is **dropped** from the rendered result because the HTML parser strips it inside `innerHTML`. Result text then differs from the input (`a\0b` → `ab`). | This is a fidelity issue, not a security issue; no markup change occurs. | Rendering with DOM nodes and `textContent` (H2) removes this. |
| P3 | `textScale` coerces loosely: `"1.5"` and `[1.5]` from storage are accepted as 1.5 (via `Number()`). | The value still ends up in the allowlist, so there is no injection. | Require `typeof === 'number'` for strict SEC-012 conformance. |

## Hardening recommendations

- **H1: CSP and headers (SEC-020/021).** The dev server sends no `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` or `frame-ancestors`. For any hosted deployment, use:
  ```
  default-src 'none'; script-src 'sha256-…'; style-src 'sha256-…' (or 'unsafe-inline' for styles); img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'
  ```
  The inline `<script>` blocks need hashes. `connect-src 'none'` would enforce SEC-015 technically. This is missing hardening, not an exploitable issue.
- **H2: Replace string-built `innerHTML` in `renderTokens()` and the summary with DOM node creation plus `textContent`.** The current escaping is correct, but SEC-004 prefers safe DOM APIs, and a single future edit that forgets `escapeHtml()` would reintroduce XSS. The review-lock test (`innerHTML sinks match the reviewed set`) will flag any new sink.
- **H3: Clickjacking.** The page can be framed; no `frame-ancestors` or `X-Frame-Options` header is sent. Impact is low because the page has no sensitive state-changing actions. Add `frame-ancestors 'none'` when hosted.
- **H4: Dependencies.**
  - `npm audit fix` resolves `qs` 6.15.3, a moderate issue: GHSA-x5fp-wj9c-mxmx and GHSA-4mjr-xmp4-gh2g. It is a transitive dependency of `http-server` → `union`, used only for the local dev server and never shipped to the browser.
  - `axe-core@4.13.0` is installed but **extraneous** (not in `package.json`). Add it to devDependencies or remove it.
  - devDependencies use caret ranges; the committed `package-lock.json` pins them, which is fine. Keep using `npm ci`.
- **H5: Test-suite convention.** `scripts/build-dashboard.js` maps Playwright `expected` status, including `test.fail()` known-defect markers, to **passed**. This means known defects marked with `test.fail()` do not appear on the dashboard. My defect tests fail on purpose, so SEC-F1 and SEC-F2 stay visible.

## Passed security checks (summary)

- 16 payload families, each run with Ignore case/punctuation off and on, in both EN and DE, produced no execution, no foreign tags, attributes or classes, and verbatim result text. The families were: `<script>`, `onerror`/`onload`/`ontoggle` handlers, SVG, MathML, `javascript:` URLs, encoded and double-encoded HTML, broken tags, nested/split tags, template expressions (`{{…}}`, `${…}`), iframe, style/CSS, attribute breakout, id/class spoofing, and bidi/zero-width/homoglyph text.
- Re-rendering on a language switch stays inert.
- Hostile file names (`<img onerror>.exe`, `<svg onload>.txt`, `"><img…>.html`) and hostile file content stay inert.
- `<h1>`/`<h2>` injection adds no headings.
- Query-string and hash payloads are ignored.
- Storage:
  - Only `comparinator.a11y` is ever written, with exactly 7 known keys.
  - Comparison text never appears in local/session storage, cookies, IndexedDB or Cache Storage.
  - There is no service worker.
  - 14 tampered values were ignored, with no prototype pollution and no page errors.
- The network captured one request for the whole hostile workflow, and `sendBeacon` was unused.
- There are no external scripts, styles, fonts, images or frames, and no Resource Timing entries.
- Static source review found no `eval`, `Function`, `document.write`, `insertAdjacentHTML`, `outerHTML`, string timers, dynamic scripts, `import()` or secrets.
- 100 repeated comparisons: DOM node count stable; heap 10.0 MB → 10.0 MB after GC; no errors.

## Changes made by this agent

- **Added** `tests/14-security.spec.js` with 34 tests. They cover XSS/HTML injection (EN and DE), hostile files, query/hash input, a static sink review lock, a secrets scan, localStorage tampering (10 values) and validation, storage privacy, network privacy, external resources, statement markup and link safety (EN and DE), the UI length cap, SEC-F1, 7 resource-exhaustion cases (2 of them SEC-F2) and a repeated-compare leak check.
- No application code, helpers or existing specs were modified.

## Areas not tested / remaining risk

- **Browsers:** only Chromium. Firefox and WebKit parsing and `maxlength` behaviour were not verified.
- **Hosted deployment:** CSP, security headers, HTTPS/HSTS and mixed content could not be tested (SEC-020 to SEC-022).
- **Real OS drag-and-drop and file pickers:** only simulated and CDP drops were used; the drag-and-drop agent covers these.
- **Screen-reader output of bidi text:** not tested.
- **Memory under sustained worst-case input:** only a 100-iteration check on moderate input.
- **Future features:** backend/API (SEC-037 to SEC-042), telemetry and agent-generated content do not exist yet and will need review when added.
- **Remaining risk:**
  - Low for injection and privacy.
  - Moderate for availability (SEC-F2) until it is fixed.
  - A future regression in `escapeHtml()` usage is the main latent XSS risk; H2 and the review-lock test mitigate it.

---

## Gap analysis data

| Area | Risk (1-10) | Confidence (Strong/Partial/Weak/Gap/Unknown) | Known issue (None/Known issue/Significant risk/Blocker) | Evidence | Notes |
|---|---|---|---|---|---|
| Input Validation | 6 | Partial | Known issue | 14-security: UI cap test passes; SEC-F1 test fails; 09 file size-limit tests pass; probe-out.txt | SEC-F1 (Low): no logic-level length check; file loads are validated. Owner: Security agent. Next: add length check in `compare()`. |
| Output Encoding | 8 | Strong | None | Sink review (8 `innerHTML`, all escaped or constant); 14-security payload tests EN/DE; 06 TC-28/29 | `escapeHtml` covers `& < > " '`; H2 suggests DOM APIs; review-lock test guards new sinks. |
| Script Injection | 9 | Strong | None | Static scan: no eval/Function/string timers/dynamic scripts; `__pwned` canary stayed 0 in all runs | Chromium only. |
| Cross-Site Scripting (XSS) | 9 | Strong | None | 16 payload families x 2 option sets x 2 languages; hostile file names and content; query/hash test; tampered storage | No reflected source; the only stored source (a11y prefs) is validated. Chromium only. |
| Malicious Text Input | 6 | Partial | Known issue | perf-out.txt; SEC-F2 tests fail (5.2 to 6.4 s); Unicode/bidi/NUL probes | SEC-F2 (Medium): O(n²) freeze with Ignore punctuation. P1 bidi file-name display; P2 NUL dropped. Next: make `classifySource` linear. |
| HTML Injection | 7 | Strong | None | SEC-009 heading test; form/iframe/style counts unchanged; attribute/id/class breakout payload | No structure change observed. |
| Local Storage Safety | 5 | Strong | None | 10 tamper tests plus validation test; storage privacy test (only `comparinator.a11y`, 7 keys, no text) | P3: loose `Number()` coercion of `textScale`, harmless. |
| Data Privacy | 7 | Strong | None | Network capture shows only the page GET; `sendBeacon` unused; no cookies, IndexedDB, caches or service worker; no console logging | Local build, Chromium only. |
| External Resources | 5 | Strong | None | No `script[src]`/`link`/media; Resource Timing empty; only `#` and `mailto:` links | Nothing third-party is loaded. |
| Dependency Risk | 3 | Partial | Known issue | `npm audit`: 1 moderate (`qs` via http-server, dev only); `npm ls`: `axe-core` extraneous | Not shipped to the browser. Next: `npm audit fix`; declare or remove `axe-core`. |
| Client-Side Data Exposure | 5 | Partial | None | No storage or network exposure; no secrets in source; framing test shows the page can be framed; no security headers on the dev server | Hosted CSP/headers/HTTPS untested (no deployment). H1/H3 hardening. |
