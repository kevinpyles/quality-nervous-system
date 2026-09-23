/* ============================================================
   QNS Contracts — normalized signal model + agent catalog
   ============================================================

   SIGNAL CONTRACT (Requirements §Signal and evidence model)
   Every agent output is normalized into this shape before the
   brain or UI touches it. A finding without build, environment,
   time, and evidence context is incomplete.

   {
     id:            'sig-…',
     runId:         'run-…',
     app:           'Comparinator',
     build:         { fingerprint, label },        // content hash of target
     environment:   'local' | 'dev' | 'qa' | …,
     cadence:       'build-smoke'|'nightly-regression'|'release-gate'|'ad-hoc',
     component:     'compare-flow' | 'metrics' | …, // affected app area
     dimension:     one of TESTING_DIMENSIONS,
     executionMode: 'automated' | 'ai-agent' | 'manual',
     executionContext: 'live' | 'controlled-proof' | 'rerun',
     severity:      'blocker' | 'warning' | 'advisory' | 'info',
     status:        'pass' | 'fail' | 'degraded' | 'unknown' | 'not-run',
     finding:       plain-language statement of what was observed,
     evidence:      [{ type: 'screenshot'|'log'|'trace'|'report'|'note', path|body, label }],
     impact:        plain-language impact on users/product/release,
     recommendedAction: plain-language next step,
     ownerType:     'system' | 'ai' | 'human',
     confidence:    0..1,
     createdAt:     ISO timestamp
   }
*/

/* 2026-09-03: retargeted from "Comparinator V13" to this richer build.
   The new app under test drops two V13 features entirely (export/report
   download, and the inline-vs-side-by-side render-mode toggle — neither
   control exists in this DOM) and adds several real ones QNS didn't
   cover before: EN/DE localization, a dark-mode theme toggle, a
   first-class Reset control, and a 7-tile metrics panel. The component
   and agent rosters below reflect what this build ACTUALLY has —
   nothing is kept around to preserve parity with the old target. */
import { CONFIG } from './config.mjs';

export const APP_UNDER_TEST = {
  id: 'comparinator-i18n',
  name: 'Comparinator',
  buildTag: 'i18n',
  description: 'Glassmorphism text-comparison app with EN/DE localization, dark mode, and a 7-stat metrics panel',
  path: CONFIG.appPath,             // see server/config.mjs
  entry: 'comparinator.html',
  url: `http://localhost:${CONFIG.targetPort}/`,
};

export const TESTING_DIMENSIONS = [
  'functional', 'localization', 'usability', 'system', 'performance',
  'reliability', 'integration', 'accessibility', 'mobile', 'security',
];

export const CADENCES = ['build-smoke', 'nightly-regression', 'release-gate', 'ad-hoc'];

export const SEVERITIES = ['blocker', 'warning', 'advisory', 'info'];

/* Components of the app under test (seed of the app-under-test graph) */
export const COMPONENTS = [
  { id: 'availability',    label: 'Target availability' },
  { id: 'compare-flow',    label: 'Compare flow' },
  { id: 'options',         label: 'Comparison options' },
  { id: 'metrics',         label: 'Metric calculation' },
  { id: 'counters',        label: 'Character counters & limits' },
  { id: 'controls-reset',  label: 'Reset control' },
  { id: 'dark-mode',       label: 'Dark mode theme' },
  { id: 'i18n',            label: 'Language localization' },
  { id: 'security',        label: 'Injection safety' },
  { id: 'keyboard',        label: 'Keyboard access' },
  { id: 'a11y',            label: 'Accessibility semantics' },
  { id: 'runtime-map',     label: 'Runtime UI structure' },
  { id: 'performance',     label: 'Performance' },
  { id: 'responsive',      label: 'Responsive layout' },
  { id: 'external-suite',  label: 'External Regression Suite' },
];

/* ============================================================
   AGENT CATALOG — sensor agents are first-class QNS actors.
   `executable` names the exported function in agents.mjs;
   `specPath` points at the check's implementation for inspection.
   ============================================================ */
export const AGENTS = [
  {
    id: 'availability-sensor',
    name: 'Availability Sensor',
    category: 'system',
    role: 'sensor',
    description: 'Probes the app-under-test URL, confirms the page boots, the DOM is interactive, and the title/header are correct.',
    component: 'availability',
    executable: 'runAvailability',
    specPath: 'server/agents.mjs#runAvailability',
    cadences: ['build-smoke', 'nightly-regression', 'release-gate', 'ad-hoc'],
    severityOnFail: 'blocker',
    inputs: 'target URL',
    outputs: 'reachability, boot time, title check, screenshot',
  },
  {
    id: 'flow-compare',
    name: 'Compare Flow Agent',
    category: 'functional',
    role: 'checker',
    description: 'Drives the core user journey: enter two texts, run Compare, and verify both result panels render tagged tokens and the stats panel updates.',
    component: 'compare-flow',
    executable: 'runCompareFlow',
    specPath: 'server/agents.mjs#runCompareFlow',
    cadences: ['build-smoke', 'nightly-regression', 'release-gate', 'ad-hoc'],
    severityOnFail: 'blocker',
    inputs: 'seeded text pair',
    outputs: 'diff render assertion, stats visibility, screenshot',
  },
  {
    id: 'options-agent',
    name: 'Comparison Options Agent',
    category: 'functional',
    role: 'checker',
    description: 'Verifies Ignore Case and Ignore Punctuation change scoring correctly, punctuation stays visibly rendered even when ignored, and toggling either option after a compare recalculates live.',
    component: 'options',
    executable: 'runOptions',
    specPath: 'server/agents.mjs#runOptions',
    cadences: ['nightly-regression', 'release-gate', 'ad-hoc'],
    severityOnFail: 'warning',
    inputs: 'seeded text pairs + option combinations',
    outputs: 'scoring assertions per option state, live-recalculation assertion',
  },
  {
    id: 'metric-calc',
    name: 'Metric Calculation Agent',
    category: 'functional',
    role: 'checker',
    description: 'Feeds deterministic input pairs and asserts exact similarity, accuracy, matching, different, and missing/added values against the documented formulas.',
    component: 'metrics',
    executable: 'runMetricCalc',
    specPath: 'server/agents.mjs#runMetricCalc',
    cadences: ['build-smoke', 'nightly-regression', 'release-gate', 'ad-hoc'],
    severityOnFail: 'blocker',
    inputs: 'oracle table of input pairs → expected metrics',
    outputs: 'per-case metric assertions, screenshot',
  },
  {
    id: 'counters-guardrails',
    name: 'Counters & Guardrails Agent',
    category: 'reliability',
    role: 'checker',
    description: 'Verifies the live character counter, its warn/limit thresholds at 9,000 and 10,000 characters, and that a real paste beyond 10,000 characters is clamped by the native maxlength guardrail.',
    component: 'counters',
    executable: 'runCounterGuardrails',
    specPath: 'server/agents.mjs#runCounterGuardrails',
    cadences: ['nightly-regression', 'release-gate', 'ad-hoc'],
    severityOnFail: 'warning',
    inputs: '9,001-char and 10,500-char (pasted) payloads',
    outputs: 'counter text/class assertions, paste-clamp assertion, screenshot',
  },
  {
    id: 'controls-reset',
    name: 'Reset Control Agent',
    category: 'functional',
    role: 'checker',
    description: 'Runs a compare with both options and dark mode on, clicks Reset, and verifies text, stats, result panels, options, and theme all return to their initial state.',
    component: 'controls-reset',
    executable: 'runControlsReset',
    specPath: 'server/agents.mjs#runControlsReset',
    cadences: ['nightly-regression', 'release-gate', 'ad-hoc'],
    severityOnFail: 'warning',
    inputs: 'seeded compare + option state',
    outputs: 'post-reset state assertions, screenshot',
  },
  {
    id: 'dark-mode-agent',
    name: 'Dark Mode Agent',
    category: 'usability',
    role: 'checker',
    description: 'Toggles the theme switch (via its label, matching how the hidden checkbox is actually activated) and verifies the --bg theme token changes and reverts, and match/difference colors stay distinguishable in dark mode.',
    component: 'dark-mode',
    executable: 'runDarkMode',
    specPath: 'server/agents.mjs#runDarkMode',
    cadences: ['nightly-regression', 'release-gate', 'ad-hoc'],
    severityOnFail: 'advisory',
    inputs: 'theme toggle interaction',
    outputs: 'computed-style theme token assertions, contrast assertion, screenshot',
  },
  {
    id: 'i18n-agent',
    name: 'Localization Agent',
    category: 'localization',
    role: 'checker',
    description: 'Switches the app to German, verifies aria-pressed state, document language, and translated UI strings update, then confirms percent formatting switches to a comma decimal (DE locale) before restoring English.',
    component: 'i18n',
    executable: 'runI18n',
    specPath: 'server/agents.mjs#runI18n',
    cadences: ['nightly-regression', 'release-gate', 'ad-hoc'],
    severityOnFail: 'warning',
    inputs: 'language switch interaction + seeded compare',
    outputs: 'translated-string assertions, locale-formatting assertion, screenshot',
  },
  {
    id: 'security-scan',
    name: 'Injection Safety Agent',
    category: 'security',
    role: 'checker',
    description: 'Feeds script-tag and markup-like payloads into both text inputs and verifies no dialog fires, no real DOM elements are created from the payload, and the payload renders only as escaped, visible text.',
    component: 'security',
    executable: 'runSecurityScan',
    specPath: 'server/agents.mjs#runSecurityScan',
    cadences: ['nightly-regression', 'release-gate', 'ad-hoc'],
    severityOnFail: 'blocker',
    inputs: '<script>/<b>/<i> payloads',
    outputs: 'dialog-suppression assertion, DOM-injection assertion, escaped-text assertion, screenshot',
  },
  {
    id: 'keyboard-access',
    name: 'Keyboard Access Agent',
    category: 'accessibility',
    role: 'checker',
    description: 'Walks the Tab order to Compare and Reset, activates Compare with Enter and Reset with Space, and confirms both comparison-option checkboxes toggle via keyboard.',
    component: 'keyboard',
    executable: 'runKeyboardAccess',
    specPath: 'server/agents.mjs#runKeyboardAccess',
    cadences: ['nightly-regression', 'release-gate', 'ad-hoc'],
    severityOnFail: 'blocker',
    inputs: 'keyboard-only navigation script',
    outputs: 'focus-order trace, keyboard-activation assertions, screenshot',
  },
  {
    id: 'a11y-scan',
    name: 'Accessibility Scan Agent',
    category: 'accessibility',
    role: 'scanner',
    description: 'Runs an axe-core scan and reports serious and critical violations with element targets.',
    component: 'a11y',
    executable: 'runA11yScan',
    specPath: 'server/agents.mjs#runA11yScan',
    cadences: ['nightly-regression', 'release-gate', 'ad-hoc'],
    severityOnFail: 'warning',
    inputs: 'axe-core ruleset',
    outputs: 'violation report artifact',
  },
  {
    id: 'semantic-explorer',
    name: 'Semantic Explorer Agent',
    category: 'integration',
    role: 'spider',
    description: 'Browser-driven runtime spider: inventories live controls, roles, labels, and reachable states to seed the app-under-test runtime graph.',
    component: 'runtime-map',
    executable: 'runSemanticExplorer',
    specPath: 'server/agents.mjs#runSemanticExplorer',
    cadences: ['nightly-regression', 'release-gate', 'ad-hoc'],
    severityOnFail: 'advisory',
    inputs: 'live DOM',
    outputs: 'runtime control inventory (graph artifact), screenshot',
  },
  {
    id: 'perf-timing',
    name: 'Performance Timing Agent',
    category: 'performance',
    role: 'sensor',
    description: 'Measures page boot timing and the compare operation duration on a large, mostly-unique two-thousand-word payload against thresholds.',
    component: 'performance',
    executable: 'runPerfTiming',
    specPath: 'server/agents.mjs#runPerfTiming',
    cadences: ['nightly-regression', 'release-gate', 'ad-hoc'],
    severityOnFail: 'advisory',
    inputs: '~10,000-char payload of mostly-unique words, thresholds (boot < 3s, compare < 3s)',
    outputs: 'timing measurements, screenshot',
  },
  {
    id: 'responsive-layout',
    name: 'Responsive Layout Agent',
    category: 'mobile',
    role: 'checker',
    description: 'Checks three real breakpoints: inputs stack vertically without horizontal overflow at 700×900, core controls stay visible and unclipped at 320×800, and the two-column layout holds at 1440×900.',
    component: 'responsive',
    executable: 'runResponsiveLayout',
    specPath: 'server/agents.mjs#runResponsiveLayout',
    cadences: ['nightly-regression', 'release-gate', 'ad-hoc'],
    severityOnFail: 'warning',
    inputs: 'three viewport sizes (700×900, 320×800, 1440×900)',
    outputs: 'layout/overflow assertions per breakpoint, screenshot',
    viewport: { width: 1280, height: 860 },
  },
  {
    id: 'external-playwright-suite',
    name: 'External Playwright Suite',
    category: 'integration',
    role: 'suite',
    description: 'Runs the team-authored Playwright regression suite (the app under test\'s own tests/ folder) as a real subprocess against the live target and ingests its actual pass/fail results — a second, independently authored source of truth alongside QNS\'s own agents. In Build Smoke it runs a fast 5-test slice (--grep) instead of the full suite; Nightly, Release Gate, and ad-hoc always run all of it.',
    component: 'external-suite',
    executable: 'runExternalSuite',
    specPath: 'server/agents.mjs#runExternalSuite',
    cadences: ['build-smoke', 'nightly-regression', 'release-gate', 'ad-hoc'],
    severityOnFail: 'blocker',
    inputs: 'the team\'s existing spec suite in the app under test\'s tests/*.spec.js',
    outputs: 'aggregate pass/fail/flaky/skipped counts, failing test titles, results.json artifact',
  },
];

/* ============================================================
   CONTROLLED PROOF SCENARIOS — seeded defects, never mistaken
   for live verification. Each sabotages the target in-page and
   expects the paired agent to catch it.

   2026-09-03: "Export Proof" is retired with the export feature
   it targeted (this app has no export control at all) and replaced
   by "Reset Proof" against the new first-class Reset control, so
   the cockpit keeps its four traceable proof scenarios per
   Requirements.md. See Requirements.md for the updated list.
   ============================================================ */
export const PROOFS = [
  {
    id: 'proof-blocked-action',
    name: 'Blocked Action',
    agent: 'flow-compare',
    description: 'Seeds a defect that disables the Compare action after load. Proves QNS detects a blocked core flow.',
    sabotage: 'blockCompare',
    expected: 'Compare Flow Agent reports a blocker: the compare action never produces results.',
  },
  {
    id: 'proof-metric-regression',
    name: 'Metric Proof',
    agent: 'metric-calc',
    description: 'Seeds a rounding defect that skews every displayed percentage. Proves QNS catches metric regressions against the oracle.',
    sabotage: 'skewMetrics',
    expected: 'Metric Calculation Agent reports exact-value mismatches.',
  },
  {
    id: 'proof-reset-regression',
    name: 'Reset Proof',
    agent: 'controls-reset',
    description: 'Seeds a defect that disables the Reset button after load. Proves QNS detects a broken reset control.',
    sabotage: 'breakReset',
    expected: 'Reset Control Agent reports Text A/B were not cleared after clicking Reset.',
  },
  {
    id: 'proof-keyboard-regression',
    name: 'Keyboard Proof',
    agent: 'keyboard-access',
    description: 'Seeds a defect that swallows Enter/Space on the Compare button. Proves QNS catches keyboard-only regressions that mouse tests miss.',
    sabotage: 'swallowKeys',
    expected: 'Keyboard Access Agent reports keyboard activation failure while pointer click still works.',
  },
];

/* QNS system-map node inventory (Requirements §3D QNS system map) */
export const MAP_NODES = [
  { id: 'environment',  label: 'Runtime Env · local', kind: 'environment' },
  { id: 'app',          label: APP_UNDER_TEST.name,   kind: 'app-under-test' },
  { id: 'agents',       label: 'Sensor Agents',       kind: 'agent-cluster' },
  { id: 'orchestrator', label: 'QNS Orchestrator',    kind: 'core' },
  { id: 'memory',       label: 'Evidence Memory',     kind: 'evidence' },
  { id: 'human',        label: 'Human Guidance',      kind: 'human' },
  { id: 'gate',         label: 'Release Gate',        kind: 'release-gate' },
  { id: 'bugfix',       label: 'Bug / Fix Path',      kind: 'bug-fix' },
];
