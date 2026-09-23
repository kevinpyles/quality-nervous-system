# Comparinator — Accessibility Quality Report

**Build:** `comparinator.html` (96,956 bytes, 2026-09-13)
**Target:** WCAG 2.2 Level AA where applicable
**Date:** 2026-09-15
**Produced by:** `a11y-agent.md`, run as a prompt
**Method:** axe-core (WCAG 2.2 AA tags) + Playwright/Chromium, accessibility-tree inspection,
programmatic keyboard simulation, independent contrast compositing, viewport/zoom emulation

---

## Executive summary

The build meets all 34 requirements in `a11y-requirements.md`. **No Critical, High or Medium
defects were found.** Two Low observations are recorded below, neither blocking. Four
scanner/heuristic warnings were investigated and dismissed as non-defects, with evidence.

The most important result: the application passes its core accessibility requirements **with the
Accessibility Menu never opened**. This was tested explicitly, because both `a11y-requirements.md`
(§3: "The accessibility menu is an enhancement. It does not replace the requirement for the
application itself to be accessible.") and this agent's Boundaries warn against treating an overlay
as the accessibility story.

## Overall accessibility confidence

**Moderate-to-high, with one material caveat.** Everything machine-verifiable passes. But no real
screen reader was used — all assistive-technology claims rest on accessibility-tree and DOM
inspection. Per this agent's own boundary ("do not claim full WCAG conformance based only on
automated testing"), **conformance is not asserted.**

## Requirements tested

All 34 (A11Y-001 … A11Y-034).

One is only partially verifiable: **A11Y-025 (Screen Reader Compatibility)** — structure, labels,
states and status messages are correctly exposed to the accessibility API, but "usable with common
screen readers" was not confirmed against an actual screen reader.

## Automated vs. manual checks

| Category | Checks | Result |
|---|---|---|
| Automated (axe-core, WCAG 2.2 AA tags) | 4 presentation states | **0 violations**, 25 rule-passes in default state |
| Programmatic manual (keyboard, focus, state, zoom, motion) | 76 discrete assertions | **0 failures** |
| Contrast (independent alpha-compositing) | 29 elements × 3 modes = 87 measurements | **0 below threshold** |
| Human manual (real assistive technology) | 0 | **not performed** |

The four axe states: default light with results · dark mode · high contrast with the menu open ·
all presentation options enabled simultaneously.

## Passed checks — highlights

**Semantic structure (A11Y-013, A11Y-014)**
1 `<header>`, 1 `<main>`, 1 `<footer>`, 4 `<section>`, 3 `<fieldset>`/`<legend>` pairs; zero
`div`/`span` elements pressed into service as controls. 10 headings, exactly one `h1`, no skipped
levels. Statistics are a real `<dl>` (7 `dt` / 7 `dd`).

**Names and labels (A11Y-015, A11Y-016)**
Every interactive element resolves to an accessible name. No input relies on placeholder text as
its only label. Icon-only controls (accessibility button, close, A+/A−) carry `aria-label`.

**Keyboard (A11Y-002, A11Y-017)**
14 distinct tab stops, full cycle observed, no keyboard trap. The complete compare workflow was
finished keyboard-only with the menu never opened: both comparison options set via Space, both
texts typed, Compare activated with Enter, similarity 100.0%, result announced. The menu opens on
Enter *and* Space, traps focus while modal, closes on Escape, and returns focus to its button.

**Dynamic results (A11Y-019, A11Y-032, A11Y-033)**
`role="status"` fires one concise announcement per comparison rather than seven separately-live
statistic tiles. Result panels are labelled regions in correct DOM order and are keyboard
reachable.

**Colour independence (A11Y-021, A11Y-031)**
Differences carry `<del>`/`<ins>` semantics, a visible `−`/`+` badge, and wavy / double / dotted
underline patterns — three non-colour channels beyond the red/green.

**Errors (A11Y-020)**
An empty field produces visible text plus icon plus border, sets `aria-invalid="true"`, is wired to
the field via `aria-describedby`, and the message explains how to correct the problem.

**Character counters (A11Y-030)**
Current/maximum exposed as described-by text (silent while typing); threshold announcements fire
once on crossing 90% and once at the limit.

**Zoom and reflow (A11Y-023, A11Y-024)**
No horizontal overflow at 200% zoom (640px), 400% zoom (320px), or 200% zoom combined with 200%
text scaling. Nothing hidden, nothing clipped, no two-dimensional scrolling.

**Focus visibility (A11Y-018)**
3px indicator measured at **3.56:1** against the page ground (WCAG 1.4.11 requires 3.0).

**Motion (A11Y-003)**
OS-level `prefers-reduced-motion: reduce` collapses all transition and animation durations to
0.000001s with the menu untouched.

**Menu behaviour (A11Y-001, A11Y-004 … A11Y-012, A11Y-034)**
All six toggles apply and persist. Text sizing steps 100 → 110 → 125 → 150 → 200% and clamps at
both ends. Preferences survive reload. Reset restores defaults without touching input data;
application Reset clears data without touching preferences and parks focus on Text A.

## Confirmed findings

### LOW-1 — `h1` glyphs paint outside their content box (latent overlap risk)

`h1 { line-height: .96 }` makes the line box shorter than the glyphs, so painted text extends
roughly 5px above and 3px below the element box. `overflow: visible` means nothing is clipped
today, and clearance was measured at four sizes.

| Configuration | Painted glyphs | Eyebrow ends | Subtitle starts | Clearance |
|---|---|---|---|---|
| 640px @ 100% | 61 – 102 | 56 | 110.6 | 5.0 / 8.6 |
| 320px @ 100% | 61 – 100 | 56 | 108.7 | 5.0 / 8.7 |
| 320px @ 200% text | 133 – 172 | 128 | 180.7 | 5.0 / 8.7 |
| **1440px @ 200% text** | **91 – 178** | **90** | **181.1** | **1.0 / 3.1** |

*Maps to:* A11Y-005 ("shall not cause text to overlap other content"), A11Y-023.
*Severity:* **Low** — no overlap occurs at any tested size. This is a latent regression risk if the
type scale or hero spacing changes.
*Recommended fix:* raise `h1` line-height to ≥ 1 and compensate with negative margin, or add ~4px
top padding to the `.brand` block.

### LOW-2 — Accessibility statement's reporting channel is a placeholder

The statement's reporting mechanism is `mailto:accessibility@example.com`. A11Y-012 asks for "a
mechanism **or placeholder**", so this satisfies the requirement as written, but it is not a working
channel.

*Maps to:* A11Y-012.
*Severity:* **Low.**
*Recommended fix:* substitute a monitored address or form before any public release.

## Validated non-defects

This agent's Boundaries require that warnings be validated before being called defects. Four were
investigated and rejected:

1. **axe: 61 `color-contrast` incomplete.** axe cannot composite through the translucent glass
   panels and `backdrop-filter`. Measured independently by alpha-compositing the ancestor chain:
   all 29 sampled elements pass AA in light, dark and high-contrast.
2. **axe: 1 `aria-valid-attr-value` incomplete.** `aria-controls` on the accessibility button
   references a panel that is currently `hidden`. Expected for a closed dialog.
3. **Focus-order heuristic flagged `resultB → a11yBtn` as a backward jump.** That element is the
   `position: fixed` accessibility button, whose document-relative Y coordinate is not meaningful.
   Visually it sits at the bottom-right of the viewport; the order is correct.
4. **Contrast harness reported the primary button at 1.02:1.** The compositor cannot read
   `background-image` gradients. Computed directly against the darkest gold stop of the gradient:
   **4.55:1**, passes AA.

## Areas not tested

- **Real screen readers** — no VoiceOver, NVDA or JAWS. This is the largest gap.
- **Browsers other than Chromium** — no Firefox, Safari, or mobile browsers and their AT.
- **Windows High Contrast Mode / `forced-colors`** — the app ships its own high-contrast mode; the
  OS-level one is untested.
- **True browser zoom** — emulated by viewport width, equivalent for reflow but not identical for
  fixed-position behaviour.
- **Users with disabilities** — conformance checking only, no usability testing.
- **Large-input screen-reader performance** — listed as a known limitation in the app's own
  statement; unverified.
- Voice control, text-to-speech, speech input — explicitly out of scope per requirements §8.

## Remaining risk

Concentrated in one place: **the gap between accessibility-tree correctness and actual
screen-reader behaviour.** Live-region politeness, `<ins>`/`<del>` announcement (which varies
considerably by screen reader and verbosity setting), and the `aria-modal` + `inert` combination
all inspect correctly but can behave differently in practice.

The diff-marking scheme in particular relies on CSS `::before` generated content for its visible
`+`/`−` symbols, and announcement of generated content is inconsistent across screen-reader and
browser pairings. Redundancy exists — `<del>`/`<ins>` semantics, the underline patterns, and an
sr-only difference key referenced by both result panels — so a failure of any one channel is not a
loss of information. But this has not been confirmed in a real screen reader.

Secondary risk: single-browser coverage.

## Release recommendation

**Ship for the tutorial build.** All 34 requirements are met, all 14 acceptance criteria in
requirements §6 are satisfied, there are zero automated violations, and no Critical, High or Medium
findings.

**Before claiming WCAG 2.2 Level AA conformance publicly**, complete two things:

1. One manual pass with VoiceOver/Safari and one with NVDA/Firefox, focused on the diff result
   panels and the menu dialog.
2. Replace the placeholder reporting address (LOW-2).

LOW-1 is worth fixing opportunistically, and should be re-checked if the hero type scale changes.
