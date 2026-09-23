# Comparinator Accessibility Requirements

## 1. Purpose

This document defines the accessibility requirements for the Comparinator application.

Comparinator should provide an accessible experience by default and also include an Accessibility Menu that allows users to adjust the presentation and interaction of the application to better meet their needs.

The accessibility menu is an enhancement. It does not replace the requirement for the application itself to be accessible.

## 2. Accessibility Target

Comparinator should target WCAG 2.2 Level AA where applicable.

Core accessibility requirements must apply regardless of whether any Accessibility Menu option is enabled.

---

## 3. Accessibility Menu

### A11Y-001 — Accessibility Menu Access

Comparinator shall provide a persistent Accessibility button that is available from every application view.

The Accessibility button shall:

- Be keyboard accessible.
- Have a visible focus indicator.
- Have an accessible name such as `Open accessibility settings`.
- Communicate whether the Accessibility Menu is open or closed.
- Be usable with Enter and Space.

When opened, the Accessibility Menu shall:

- Receive keyboard focus.
- Support Tab and Shift+Tab navigation.
- Close when the user presses Escape.
- Return focus to the Accessibility button when closed.
- Expose the state of each option to assistive technology.

### A11Y-002 — Keyboard Navigation Mode

The Accessibility Menu shall include a Keyboard Navigation option.

When enabled, Comparinator shall provide an enhanced visible focus treatment for keyboard users.

All interactive elements must remain keyboard operable whether this setting is enabled or disabled.

Users shall be able to operate the application using:

- Tab — move to the next interactive element.
- Shift+Tab — move to the previous interactive element.
- Enter — activate applicable controls.
- Space — activate applicable controls.
- Escape — close dialogs, menus, and temporary panels where appropriate.

The following must be fully operable without a mouse:

- Text input areas.
- Compare button.
- Reset button.
- Ignore Case option.
- Ignore Punctuation option.
- Accessibility button.
- Accessibility settings.
- Any result controls.
- Any dialogs, menus, or interactive panels.

### A11Y-003 — Disable or Reduce Motion

The Accessibility Menu shall include a Disable Animations option.

When enabled:

- Decorative CSS animations shall stop.
- Nonessential CSS transitions shall be removed or substantially reduced.
- Pulsing effects shall stop.
- Flashing effects shall stop.
- Animated result effects shall become static.
- Decorative movement shall stop.

Comparinator shall also respect the browser or operating system preference:

`prefers-reduced-motion: reduce`

Essential functionality must not depend on animation.

### A11Y-004 — High Contrast Mode

The Accessibility Menu shall include a Contrast option.

When enabled, Comparinator shall switch to a high-contrast presentation.

High contrast mode shall apply to:

- Page backgrounds.
- Panels and cards.
- Body text.
- Headings.
- Input fields.
- Input borders.
- Buttons.
- Links.
- Statistics.
- Comparison results.
- Error messages.
- Focus indicators.
- Status messages.

All text and meaningful interface elements shall maintain sufficient contrast.

Comparinator shall not communicate comparison information through color alone.

For example, added and removed content should use more than green and red. Additional indicators may include:

- `+` and `-` symbols.
- Text labels.
- Icons.
- Borders.
- Patterns.
- Other non-color visual cues.

### A11Y-005 — Increase Text Size

The Accessibility Menu shall include an Increase Text option.

Each activation shall increase the application text size through defined levels.

Recommended levels:

- 100%
- 110%
- 125%
- 150%
- 200%

Increasing text size shall not:

- Clip text.
- Cause text to overlap other content.
- Hide application content.
- Make controls unusable.
- Remove information.
- Require horizontal scrolling for normal application content where avoidable.

The application layout shall reflow appropriately as text size increases.

### A11Y-006 — Decrease Text Size

The Accessibility Menu shall include a Decrease Text option.

This option shall reduce text size only when the user has previously increased it.

The minimum supported size shall be the application's default accessible text size.

The control shall not reduce text below the default 100% size.

### A11Y-007 — Readable Font

The Accessibility Menu shall include a Readable Font option.

When enabled, Comparinator shall use a highly legible sans-serif font throughout the application.

Readable Font mode should provide:

- Clear character shapes.
- Comfortable line spacing.
- Comfortable letter spacing.
- Comfortable word spacing.
- Consistent font rendering.
- No decorative or script fonts.

Readable Font mode shall not remove semantic emphasis such as headings, labels, or strong text.

### A11Y-008 — Highlight Headings

The Accessibility Menu shall include a Highlight Headings option.

When enabled, semantic headings shall receive a strong visual treatment.

This shall apply to properly defined HTML heading elements:

- `h1`
- `h2`
- `h3`
- `h4`
- `h5`
- `h6`

The visual treatment may include:

- Underline.
- Outline.
- Background treatment.
- Border treatment.
- Other clearly distinguishable styling.

This feature shall not alter the semantic heading structure.

### A11Y-009 — Highlight Links and Buttons

The Accessibility Menu shall include a Highlight Links and Buttons option.

When enabled:

- Links shall become visually distinct using more than color alone.
- Buttons shall receive an enhanced visual treatment.
- Interactive elements shall remain distinguishable in normal, hover, focus, active, and disabled states.

Possible treatments include:

- Underlines.
- Stronger borders.
- Outlines.
- Background emphasis.

### A11Y-010 — Reset Accessibility Settings

The Accessibility Menu shall include a Reset Accessibility Settings option.

The Reset option shall restore all user-adjustable accessibility settings to their defaults, including:

- Contrast.
- Text size.
- Font.
- Heading highlighting.
- Link highlighting.
- Button highlighting.
- Animation preferences.
- Enhanced keyboard-focus mode.

Resetting accessibility settings shall not reset Comparinator input data or comparison results.

### A11Y-011 — Persist Accessibility Preferences

Comparinator shall persist user-selected accessibility preferences across:

- Page refreshes.
- Browser navigation.
- Future visits from the same browser where local storage remains available.

For the tutorial implementation, accessibility preferences may be stored using browser localStorage.

Accessibility preferences shall not require the user to create an account.

### A11Y-012 — Accessibility Statement

The Accessibility Menu shall provide access to an Accessibility Statement.

The statement should include:

- Comparinator's accessibility goal.
- Supported accessibility features.
- Target accessibility standard.
- Known accessibility limitations.
- A mechanism or placeholder for reporting accessibility issues.

The statement should identify WCAG 2.2 Level AA as the intended target where applicable.

---

## 4. Core Application Accessibility Requirements

These requirements apply to Comparinator at all times and are not dependent on the Accessibility Menu.

### A11Y-013 — Semantic HTML

Comparinator shall use semantic HTML elements where appropriate.

Examples include:

- `header`
- `main`
- `nav`
- `section`
- `footer`
- `button`
- `label`
- `fieldset`
- `legend`
- Semantic heading elements

Interactive elements shall not be implemented using non-interactive elements when a native HTML control is available.

### A11Y-014 — Heading Structure

Comparinator shall use a logical heading hierarchy.

The application shall contain one primary page heading.

Heading levels shall represent the structure of the page and shall not be selected only for visual appearance.

### A11Y-015 — Form Labels

All form controls shall have programmatically associated labels.

This includes:

- Text A input.
- Text B input.
- Ignore Case.
- Ignore Punctuation.
- Any accessibility setting controls.

Placeholder text shall not be used as the only label for an input.

### A11Y-016 — Accessible Names

All interactive elements shall have an accessible name.

Icon-only buttons shall provide an accessible name using visible text or an appropriate accessibility attribute.

Accessible names shall clearly describe the control's purpose.

### A11Y-017 — Keyboard Accessibility

Every interactive feature of Comparinator shall be usable with a keyboard.

No functionality shall require a mouse, touchscreen gesture, or hover-only interaction.

Keyboard focus order shall follow the logical visual and functional order of the application.

### A11Y-018 — Visible Focus

Keyboard focus shall always be visually apparent.

Focus indicators shall:

- Be easy to see.
- Provide sufficient contrast.
- Not be removed without an equivalent replacement.
- Appear on every focusable interactive element.

### A11Y-019 — Comparison Result Announcements

When a comparison is completed or results change dynamically, assistive technology users shall be informed that new results are available.

Important status changes should be exposed through an appropriate live region or equivalent accessible mechanism.

Announcements should be concise and should not repeatedly interrupt the user.

### A11Y-020 — Error Identification

Validation and application errors shall:

- Be presented visually.
- Be programmatically associated with the relevant control where applicable.
- Explain what went wrong.
- Explain how the user can correct the problem where appropriate.

Errors shall not be identified using color alone.

### A11Y-021 — Color Independence

No Comparinator feature shall communicate meaning through color alone.

This requirement specifically applies to:

- Added text.
- Removed text.
- Matching text.
- Errors.
- Warnings.
- Success states.
- Charts or statistics if added later.

Visual states shall include an additional indicator such as text, shape, icon, pattern, or symbol.

### A11Y-022 — Contrast

Normal text, large text, interactive controls, focus indicators, and meaningful visual elements shall meet appropriate WCAG 2.2 Level AA contrast requirements.

Disabled controls may follow applicable WCAG exceptions.

### A11Y-023 — Text Resizing and Zoom

Comparinator shall remain usable when users resize text or zoom the browser.

At 200% text scaling or equivalent browser zoom:

- Text shall remain readable.
- Controls shall remain operable.
- Content shall not overlap.
- Essential information shall not be lost.
- The page shall reflow where practical.

### A11Y-024 — Responsive Reflow

Comparinator shall support narrow viewport layouts without requiring two-dimensional scrolling for ordinary text content where avoidable.

Primary functionality shall remain usable on smaller screens and at increased zoom levels.

### A11Y-025 — Screen Reader Compatibility

Comparinator shall expose meaningful structure, labels, states, and status updates to assistive technologies.

The application should be usable with common screen readers and browser accessibility APIs.

ARIA shall be used only where native HTML semantics are insufficient.

### A11Y-026 — Control State Communication

Controls that represent a state shall expose that state programmatically.

Examples include:

- Toggle buttons.
- Checkboxes.
- Accessibility settings.
- Expanded or collapsed panels.
- Selected comparison options.

Visual state and programmatic state shall remain synchronized.

### A11Y-027 — Touch Target Size

Interactive controls shall provide sufficiently large activation areas for touch and pointer users.

Controls should target the WCAG 2.2 minimum target-size guidance where applicable.

Closely spaced controls shall provide sufficient separation to reduce accidental activation.

### A11Y-028 — Page Title

The browser page shall have a meaningful and descriptive title.

Recommended format:

`Comparinator — Text Comparison Tool`

Additional views may modify the title when useful.

### A11Y-029 — Images and Icons

Meaningful images shall provide appropriate alternative text.

Decorative images shall be ignored by assistive technologies.

Icons used as interactive controls shall have an accessible name.

Icons shall not be the sole method of communicating critical information when their meaning may be ambiguous.

### A11Y-030 — Character Counters

The character counters for Text A and Text B shall be accessible to assistive technology.

The counters should communicate:

- Current character count.
- Maximum character count.
- When the user approaches the maximum.
- When the maximum has been reached.

Announcements should avoid excessive screen-reader interruption while the user types.

---

## 5. Comparinator-Specific Result Requirements

### A11Y-031 — Difference Highlighting

Text comparison results shall remain understandable without relying on red and green highlighting.

Added, removed, matching, or changed content shall include accessible differentiation.

Examples:

- Added text: `+ Added`
- Removed text: `- Removed`
- Matching text: `Match`
- Changed text: `Changed`

Equivalent programmatic labels may be provided for assistive technology.

### A11Y-032 — Comparison Statistics

Comparison statistics shall be presented as readable text and not only visually.

This includes:

- Similarity percentage.
- Accuracy percentage.
- Word count A.
- Word count B.
- Any future comparison statistics.

Labels shall remain programmatically associated with their values.

### A11Y-033 — Result Reading Order

Comparison results shall have a logical reading order for keyboard and screen-reader users.

Visual side-by-side presentation shall not create an illogical programmatic reading order.

### A11Y-034 — Reset Behavior

When the user activates Reset:

- Input fields shall be cleared.
- Comparison results shall be cleared.
- Comparison statistics shall be reset.
- Relevant status messages shall be cleared.

Accessibility preferences shall remain unchanged.

Keyboard focus should move to a predictable location, preferably the first input field or another clearly defined location.

---

## 6. Acceptance Criteria

The accessibility implementation shall be considered complete when:

1. All Accessibility Menu options can be operated with a keyboard.
2. Accessibility settings visually and programmatically reflect their current state.
3. Accessibility preferences persist across refreshes.
4. Comparinator remains usable with the Accessibility Menu disabled.
5. Comparinator remains usable at 200% text scaling or browser zoom.
6. Comparison results do not depend on color alone.
7. Dynamic comparison results are available to assistive technology.
8. Form controls have accessible names and labels.
9. Focus order is logical and visible.
10. Reduced-motion preferences are respected.
11. Accessibility settings can be reset independently of application data.
12. The application provides an Accessibility Statement.
13. Automated accessibility checks report no known critical violations that can reasonably be addressed within the scope of the tutorial.
14. Manual keyboard testing confirms that the main Comparinator workflow can be completed without a mouse.

---

## 7. Accessibility Menu Options

The Accessibility Menu should contain the following controls:

- Keyboard Navigation
- Disable Animations
- Contrast
- Increase Text
- Decrease Text
- Readable Font
- Highlight Headings
- Highlight Links and Buttons
- Reset Accessibility Settings
- Accessibility Statement

---

## 8. Out of Scope for Initial Tutorial Implementation

The following may be considered future enhancements but are not required for the initial tutorial implementation:

- User accounts with synchronized accessibility preferences.
- Voice control.
- Text-to-speech controls.
- Speech-to-text input.
- Multiple high-contrast themes.
- Color-blindness simulation modes.
- Full accessibility conformance certification.
- Automated remediation overlays.
- Accessibility personalization stored on a server.
