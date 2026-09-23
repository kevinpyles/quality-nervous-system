# Performance: gap data (unowned area)

- **Owner:** none. No performance agent exists yet. The main orchestration session wrote this assessment from existing evidence. No specialist tested performance.
- **Build:** `comparinator.html` sha256 `7424092aad7e86b1cd3f25a58a943b69e756b819ebfe700c099f3c937f941bb4`
- **Date:** 2026-09-16
- **Evidence:** `tests/08-performance-large-input.spec.js` (TC-66 to TC-68) passed in the baseline `npm test` run (148/148). End-to-end test durations were 746 ms, 744 ms and 886 ms in headless Chromium, including page load. These tests check that a comparison finishes within 30 s. They do not measure time spent comparing or rendering, memory use, or input latency.

## Gap analysis data

| Area | Risk (1-10) | Confidence | Known issue | Evidence | Notes |
|---|---|---|---|---|---|
| 10,000-Character Input | 8 | Partial | None | TC-66 to TC-68 pass at about 10,000 characters (identical, unrelated and token-dense input) | Only pass/fail checks. No timing threshold is asserted. |
| Comparison Processing Time | 7 | Weak | Known issue | Whole-test durations under 0.9 s only. SEC-F2 found a multi-second worst case. The functional agent found FD-01: dense input falls back to approximate matching. | No timing budget in the requirements |
| Rendering Performance | 6 | Gap | None | None | No paint or layout measurements |
| Difference Highlight Rendering | 6 | Weak | None | TC-67 renders about 4,000 changed tokens without hanging | No DOM-size or render-time measurement |
| Large Result Rendering | 5 | Weak | None | TC-67 and TC-68 produce results for large inputs | The result panel's size and scrolling were not measured |
| Browser Responsiveness | 7 | Partial | Significant risk | TC-67 asserts that Compare is still enabled. The security agent measured a 3.6–6.4 s main-thread freeze (SEC-F2, `tests/14-security.spec.js`). | With Ignore punctuation on, 10,000 punctuation characters or combining marks trigger an O(n²) loop in `classifySource()`. |
| Repeated Comparisons | 5 | Gap | None | None | No repeated-run or degradation test |
| Rapid Compare/Reset Actions | 5 | Gap | None | None | No stress test of rapid clicks |
| Memory Usage | 4 | Gap | None | None | No heap measurements, and no leak check across runs |
| Scalability Assumptions | 3 | Unknown | None | 10,000-character limit enforced (functional tests) | The input cap limits growth. No performance targets are documented. |
