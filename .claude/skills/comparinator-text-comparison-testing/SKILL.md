---
name: comparinator-text-comparison-testing
description: Validate Comparinator's text-difference behavior, comparison options, statistics, highlighting, limits, and evidence. Use when testing a Comparinator feature or regression involving text comparison accuracy. Do not use this skill to make release decisions or own the complete product-quality assessment.
---

# Comparinator Text Comparison Testing

Test whether Comparinator compares two text inputs correctly and explains the result accurately.

## Required context

Before testing, identify:

- The feature or change under test.
- The documented definitions of similarity and accuracy.
- The expected behavior for ignored case and punctuation.
- The available interface, automation tools, and evidence location.

If a calculation or option is not defined, do not invent its behavior. Record the ambiguity as a product risk and test only what can be established.

## Build the test set

Choose the smallest set that covers the affected behavior. Include these cases when relevant:

- Identical text.
- Completely different text.
- One empty input and two empty inputs.
- Case-only differences, with ignore case both off and on.
- Punctuation-only differences, with ignore punctuation both off and on.
- Inserted, removed, replaced, and reordered words.
- Repeated words, whitespace, line breaks, Unicode, emoji, and non-English text.
- Inputs at and immediately around the 10,000-character limit.

For each case, define the expected normalized inputs, differences, word counts, highlights, and statistics before execution. Use the product's documented formulas as the oracle.

## Execute

1. Enter both texts and verify each character counter.
2. Set the comparison options required by the case.
3. Run the comparison.
4. Verify the visible differences and red/green highlighting.
5. Verify word counts, similarity, accuracy, and rounding.
6. Change an option and confirm the result is recalculated correctly.
7. Reset and confirm inputs, options, statistics, highlights, and prior results are cleared.
8. Capture enough evidence to reproduce every unexpected result.

Use automation for repeatable checks when available, but visually inspect highlighting and the user-facing explanation.

## Evaluate discoveries

Classify each result as:

- **Pass:** Observed behavior matches the documented expectation.
- **Defect:** Observed behavior contradicts a defined expectation.
- **Risk:** Behavior may be harmful, misleading, inaccessible, or incomplete even when no explicit requirement is violated.
- **Unknown:** The expected behavior cannot be determined from available requirements.

Do not convert an unknown into a pass.

## Return evidence

Produce a concise testing artifact containing:

```markdown
# Text Comparison Test Evidence

## Scope
- Change tested:
- Options tested:
- Environment:

## Results
| Scenario | Expected | Observed | Status | Evidence |
| --- | --- | --- | --- | --- |

## Discoveries
- Defects:
- Risks:
- Unknowns:

## Coverage gaps
- Not tested:
- Reason:

## Recommended next test
- Action:
- Why:
```

Return evidence and recommendations to the calling agent. Do not declare Comparinator release-ready; that decision belongs to the responsible quality agent or human owner.
