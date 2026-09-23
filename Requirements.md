# QNS Requirements

_Last updated: 2026-06-16_

## Purpose

Quality Nervous System (QNS) is an always-on testing and quality intelligence framework. It should sense software quality signals, interpret their meaning, preserve evidence, and turn them into release guidance, risk posture, verification plans, and action requests.

QNS should behave less like a passive dashboard and more like a living quality nervous system: continuously monitoring, testing, pulsing, learning from history, and escalating issues when action is needed.

## Primary product outcomes

QNS must help a team answer:

- What happened?
- When did it happen?
- What tests or agents ran?
- What build, environment, and app were tested?
- What evidence supports the finding?
- Why does it matter?
- Is this a blocker, warning, advisory, or info signal?
- What should happen next?
- Who or what should act?
- Has the issue been verified after action was taken?

## Test run history

QNS must make test execution history visible and auditable.

Users must be able to see:

- which tests, suites, or agents were run
- when each run started and completed
- who or what triggered the run: human, AI, CI, scheduler, or release workflow
- the cadence: build smoke, nightly regression, release gate, or ad hoc
- the app under test
- the build, commit, branch, artifact, or version tested
- the environment tested: local, dev, QA, staging, production, preview, or custom
- the run scope: all tests, testing dimension, component subset, single agent, or rerun of failures
- the run status: queued, running, completed, failed, cancelled, or stale
- pass, fail, degraded, unknown, and not-run outcomes
- duration and basic timing metadata
- linked evidence: logs, screenshots, traces, metrics, test output, human notes, and agent summaries
- whether the run produced findings, action requests, release posture changes, bug-ticket drafts, or agent fix requests
- whether a newer run supersedes the recommendation

QNS must preserve enough run history to answer:

- Did this pass in build smoke but fail in nightly regression?
- Did the same build behave differently across environments?
- Is this failure new for this build or inherited from a previous build?
- Is an environment unhealthy, or is the build itself bad?
- Which recommendations are stale because a newer build has already been tested?
- Which checks are safe to rerun automatically after a fix?

## Test orchestration

QNS must be able to start, schedule, monitor, and rerun tests.

Supported launch paths:

- manual UI trigger
- AI-requested trigger
- build-triggered or CI-triggered run
- scheduled run
- release-gate trigger

Supported scopes:

- all tests for an app under test
- a cadence suite, such as build smoke or nightly regression
- a testing dimension, such as accessibility or mobile
- a component-specific subset
- a single test or agent
- a rerun of previously failed tests

## Testing dimensions

QNS must treat these as first-class testing categories:

- Functional
- Localization and internationalization
- Usability
- System
- Performance, stress, and load
- Reliability
- Integration
- Accessibility
- Mobile

Each testing dimension may include manual, automated, and AI-agent execution modes.

## Signal and evidence model

QNS must normalize testing output into common signals before presenting or acting on them.

Each signal should include:

- run ID
- app under test
- build and environment context
- cadence
- component or affected area
- testing type
- execution mode
- severity
- status
- finding
- evidence
- impact
- recommended action
- owner type
- confidence
- creation time

A finding without build, environment, time, and evidence context is incomplete.

## QNS brain responsibilities

The QNS brain must:

1. Request or schedule test runs when needed.
2. Collect testing and evidence signals.
3. Normalize signals into a common structure.
4. Connect signals to app-under-test components.
5. Cluster related findings.
6. Compare findings against history and known patterns.
7. Estimate severity, confidence, and impact.
8. Decide whether QNS can act, recommend, or must escalate to a human.
9. Create action requests or release posture recommendations.
10. Track verification after action is taken.

The release posture shown in the cockpit is app-wide, not the verdict of the latest run. Each component's most recent completed check decides whether it has an open issue. Any open blocker means NO-GO, and any open warning means CONDITIONAL. A failing check keeps the app NO-GO until a newer run of that component passes, or a human accepts the risk or dismisses it. A narrower run that passes, or a run of other components, never clears it. When every open issue came from a controlled proof, the posture is labeled as a controlled proof.

## Decision ownership

QNS must clearly separate telemetry, recommendations, final decisions, and pending human decisions.

AI or system-owned decisions are appropriate when:

- the evidence is deterministic
- the risk is low or policy-defined
- the action is reversible or informational
- confidence is high

Human approval is required or expected for:

- release-blocking decisions unless policy explicitly allows automation
- accepted risk
- dismissal of serious findings
- ambiguous usability or product judgment
- decisions with business impact

## Action requests

Testing signals should become action requests when something needs attention.

Action requests should include:

- title
- severity
- affected app, component, and testing dimensions
- finding
- evidence summary
- impact
- recommended action
- verification plan
- source signals
- confidence
- owner type
- state
- available actions

Possible actions include:

- create bug ticket
- assign human
- assign coding or testing agent
- rerun tests
- accept risk
- dismiss

## Bug tickets and agent fix requests

QNS should be able to package serious findings into bug-ticket drafts with:

- expected behavior
- actual behavior
- reproduction steps
- evidence links
- impact
- suggested owner
- fix prompt
- verification plan

QNS should also support governed agent fix requests that can assign Cody or another agent to investigate, edit code, rerun relevant tests, and report completion only when verification criteria are met.

## UI requirements

The QNS UI must make the quality story clear without forcing the user to interpret raw telemetry.

The UI should clearly show:

- test run requests
- run history and timing
- raw and normalized signals
- QNS brain synthesis
- recommendations
- final decisions
- pending human decisions
- action requests
- bug-ticket drafts
- agent fix requests
- accepted risk and dismissed findings

The first screen should quickly answer:

- What happened?
- Why does it matter?
- What should we do next?

### QNS system map as core cockpit

> **Requirement update (2026-07-09, user review):** the cockpit map must use the QNS Design System's own canvas map engine (2D) rather than a separate 3D re-implementation. Visual fidelity to the design system outweighs 3D rotation; a look-alike rebuilt in another renderer is a design regression. Pan, zoom, click/keyboard selection, Fit Map, live signal routing, and reduced-motion stills are retained; orbit/rotate is dropped.

The QNS visualization is the core product experience. It is not optional decoration, a legacy demo artifact, or a supporting chart.

The cockpit must preserve and strengthen the central 3D system map even when simplifying other UI regions.

The 3D map must:

- remain the dominant visual anchor of the cockpit
- represent QNS as a living nervous system, not a static dashboard graph
- show QNS-specific nodes, including the app under test, sensor agents, QNS orchestrator, evidence memory, release gate, bug/fix path, and runtime environment
- route quality signals through the map so test runs, agent activity, findings, evidence, decisions, and actions feel connected
- use saturated cyber-neural colors, depth, contrast, particles, filaments, and luminous signal paths consistent with the original QNS design reference
- support user interaction: pan, rotate, zoom, click/select nodes, and keyboard-accessible traversal where feasible
- include a `Fit Map` or equivalent command that zooms out to show the whole graph
- preserve a high-impact default view; overview/fit mode should not permanently shrink or weaken the map
- avoid global state coloring that washes all nodes into one color; subsystem color identity must remain visible
- remain usable when surrounding panels are resized, moved, hidden, or reordered

### NO-GO and failure guidance

When QNS reaches `NO-GO`, `CONDITIONAL`, or another non-clear release posture, the UI must immediately explain the decision without requiring the user to hunt through nested panels.

For any selected run with a finding or action request, the first cockpit view should show:

- what test, proof scenario, cadence, or agent run was executed
- when it ran and what target/build/environment it covered
- which agent or check failed
- the failed check details in plain language
- evidence path or evidence summary
- risk score and severity
- impact on users, product, release, or verification confidence
- recommended fix or next action
- verification plan
- available actions such as log bug draft, create governed fix request, rerun, accept risk, or dismiss

The NO-GO experience should feel like a guided investigation path:

1. release posture changes
2. active failure briefing explains why
3. failed agent/check is highlighted
4. evidence is available
5. recommendation and verification plan are visible
6. action can be drafted or assigned

### Agent visibility and inspectability

Agents are first-class QNS actors and must not be hidden inside raw run details.

The UI must provide:

- a visible agent roster sourced from the live QNS agent catalog
- clickable agents
- selected-agent detail
- per-agent run status when a run is selected
- per-agent risk score
- agent category, role, description, executable, and spec path when available
- input and output contract summaries
- links or references to related run executions, checks, findings, and evidence

The active cockpit should support at least two agent-oriented panels:

- an **Agents** panel showing the live/clickable catalog
- a **Selected Agent** panel showing details for the selected agent and its latest selected-run execution

Agent panels should remain movable/collapsible but should not disappear from the product requirements.

### Claude chat from the map

- Every component with an open blocker or warning turns red (blocker) or amber (warning) on the living map and shows an AI agent badge. Controlled-proof issues are shown the same way but labeled PROOF (dashed ring and badge); they clear when a later live run of that component passes.
- Clicking a badge opens an elegant, non-modal chat pop-up with Claude about that issue (one thread per finding). It can be dismissed with × or Esc and reopened from the badge while the issue is still open; the thread is kept.
- The header has an "Ask Claude" button (next to Fit map) for a general conversation at any time, plus a conversations list.
- Claude runs as Claude Code headless on this machine (`claude -p`, the user's own login), starting in the app-under-test folder with read access to QNS evidence. Chat is served only to loopback clients.
- Governance: chat turns are read-only (edit tools disabled by the CLI). Code changes arrive as diff proposals and are applied only after the user clicks Apply; QNS backs up the touched files (Undo restores them) and reruns the failed checks, reporting the verdict in the thread.

### Adjustable cockpit layout

QNS must support a user-adjustable cockpit layout so the UI can adapt to different investigation modes without repeatedly hard-coding panel positions.

Requirements:

- panels should be represented by a layout registry rather than one fixed arrangement
- users should be able to reorder panels within a rail or zone
- users should be able to move panels between supported zones, such as left rail and right rail
- panels should be collapsible/expandable
- left and right rails should be resizable
- layout preferences should persist locally
- a reset command should restore a known-good default layout
- the 3D QNS map should remain the fixed central anchor, not merely another movable panel
- layout controls must not obscure the main quality story

Initial panel set:

- Release Posture / Decision Summary
- Active Failure
- Run Controls
- Selected Node
- Agents
- Selected Agent
- Test Run History
- Run Details
- Status Strip

Future layout work may add presets such as:

- Map First
- Investigation
- Agent Focus
- Run History
- Compact

## Visual requirements

The first QNS experience should follow the Living System Pulse direction:

- integrated command-center canvas
- central living QNS brain
- left-to-right signal flow
- visible source signals on the left
- risk and action outputs on the right
- compact metrics near the core
- lower supporting panels
- persistent system heartbeat

The visual system should support the signal-to-decision story, not behave like a generic dashboard.

The original QNS visual reference is a requirements source, not only inspiration. QNS should preserve:

- black-glass cockpit depth
- high contrast
- saturated cyan, violet, magenta, amber, orange, red, green, and blue signal colors
- a vibrant living 3D/neural center
- luminous braided signal streams
- visible particle density and depth
- clear source-to-core-to-action flow
- compact technical instrument panels rather than generic SaaS cards

Color drift away from the original reference should be treated as a product/design regression.

## Current prototype target

The active prototype currently focuses on Comparinator as the app under test.

2026-09-23: retargeted to the Drag-n-Drop build (same app as the Agent-Orchestration
build: accessibility menu, file drop/choose, EN/DE). In the shared repo it lives in
`comparinator/`; the path is a setting (`server/config.mjs`, `qns.config.json`).
Its Playwright suite has 320 tests across 15 spec files.

2026-09-03: retargeted from the earlier "Comparinator V13" build to a richer
build at `Comparinator-Claude-5-I18N` (see `server/catalog.mjs` `APP_UNDER_TEST`).
The new build has no export/report feature and no inline-vs-side-by-side
render-mode toggle — both are gone from QNS coverage because neither control
exists in the app anymore, not because coverage regressed. In exchange it adds
real, previously-untested surface: comparison options as a first-class
control, a first-class Reset control, a dark-mode theme toggle, and EN/DE
localization.

Current QNS coverage includes:

- baseline compare flow
- comparison options (ignore case / ignore punctuation)
- metric calculation
- character counters and input guardrails
- reset control
- dark mode theme toggle
- localization (EN/DE)
- injection safety (script/markup payloads)
- keyboard access
- accessibility scan (axe-core)
- semantic browser exploration
- performance timing
- responsive layout (three breakpoints)
- the team's own external Playwright regression suite (see below)
- controlled defect proof scenarios
- evidence-backed action requests
- release posture synthesis

## App-under-test graphing

QNS must be able to graph the system under test so test evidence can be tied to actual application structure.

The graph should eventually include:

- static project structure: files, components, functions, routes, schemas, docs, and dependencies
- runtime UI structure: pages, links, buttons, forms, dialogs, controls, keyboard paths, and reachable states
- testing coverage: which agents, tests, runs, and evidence map to each app area
- decision artifacts: findings, action requests, bug drafts, fix request drafts, accepted risks, and release posture

QNS should evaluate Graphify as a static project graph source. Graphify can map a project folder into `graph.html`, `GRAPH_REPORT.md`, and `graph.json`; QNS can ingest `graph.json` to seed app-under-test inventory and architecture awareness.

Graphify should not be treated as the whole app spider by itself. QNS also needs a browser-driven runtime spider, likely Playwright-based, to discover live routes, controls, roles, forms, dialogs, and flows.

Initial graphing requirements:

- define a normalized `app-under-test graph` contract
- generate or import a static graph from the app source
- generate a runtime UI graph from browser exploration
- map test runs and findings to graph nodes
- preserve graph artifacts with build/environment context
- show graph coverage/status in the QNS cockpit

## Active Comparinator cockpit requirements

The active prototype currently uses Comparinator as the app under test. This mode must remain explicit and not masquerade as production-wide QNS coverage.

The active cockpit must show:

- QNS service health
- Comparinator target availability
- live check controls
- controlled proof controls for blocked action, metric regression, reset regression, and keyboard regression
- run history with cadence filtering
- selected run detail
- agent roster and selected-agent detail
- active failure guidance for NO-GO/blocked runs
- evidence and discovered runtime controls
- bug draft creation
- governed Cody/agent fix-request draft creation

Current controlled proof scenarios must be traceable in UI and requirements:

- Blocked Action
- Metric Proof
- Reset Proof (replaces the retired Export Proof — the current app under test has no export feature to sabotage)
- Keyboard Proof

For proof scenarios, QNS must clearly distinguish:

- controlled proof / seeded defect behavior
- live product verification
- reruns
- release-gate, nightly, build-smoke, and ad-hoc cadence

### External Playwright suite integration

2026-09-03: Kevin's team maintains its own Playwright regression suite against
the app under test (`Comparinator-Claude-5-I18N/tests/*.spec.js`, 70 tests
across 8 spec files, run with `@playwright/test`). QNS must run this suite —
not just QNS's own bespoke agents — as part of release verification
(2026-09-23: the suite now lives in `comparinator/tests/` with 320 tests across 15 spec files):

- the suite runs as a real subprocess (`server/agents.mjs#runExternalSuite`),
  reusing QNS's already-running target server rather than starting a second one
- it must run in the build-smoke, nightly-regression, and release-gate
  cadences (agent id `external-playwright-suite`, component `external-suite`)
- 2026-09-03 (later): build-smoke runs a fast 5-test slice of the suite
  (via `--grep` against exact test titles, one per critical area — core
  diff, metrics, controls, security) instead of the full 70; nightly-
  regression and release-gate always run all 70. Release-gate was also
  widened to run QNS's full 15-agent roster (previously a 9-agent subset),
  so release-gate and nightly-regression now cover identical ground —
  release-gate is the full battery, nightly-regression is the same full
  battery on a schedule, and build-smoke is the only deliberately-narrow
  cadence (3 QNS agents + the 5-test suite slice).
- its real pass/fail/flaky/skipped counts and failing test titles are ingested
  from the suite's own JSON reporter output — never summarized or guessed
- it must appear on the Living Map with the same visual treatment as every
  other component (severity-sized, live-status-colored, selectable) — not a
  separate or secondary indicator

## Documentation requirements

Requirements should live in this document first. Supporting design, architecture, implementation, and build notes may elaborate, but they should not contain important product requirements that are absent here.

When a new requirement is discovered during cockpit implementation or user review, update this file so future work does not depend on chat memory.

## Current gaps

Known requirements still needing stronger implementation:

- complete app-under-test graph generation and coverage status in the cockpit
- separation between local live-product mode and future CI/multi-environment real-data mode
- smaller frontend components after the product flow stabilizes
- production-grade adjustable layout behavior beyond the first local persisted version
- stronger full-screen/default/fit behavior for the 3D map across desktop and mobile
