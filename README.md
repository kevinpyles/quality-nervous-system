# QNS — Quality Nervous System

An always-on **testing and quality intelligence cockpit**: QNS senses quality signals from a real app under test, interprets them at an AI brain, preserves evidence, and turns them into release posture, action requests, bug drafts, and governed fix requests — visualized as a living 3D nervous system.

This repo is self-contained: QNS itself, the app it tests (**Comparinator**, in `comparinator/`) and the parts of the QNS Design System the cockpit uses (`design-system/`). Requirements live in [Requirements.md](Requirements.md) — that document is the source of truth.

## Run it

You need **Node.js 20+** and **git**. macOS and Linux are tested; on Windows, WSL is the safe choice.

```bash
git clone https://github.com/kevinpyles/quality-nervous-system.git
cd quality-nervous-system
npm install          # QNS's dependencies
npm run setup        # the app's dependencies + the Chromium browsers Playwright needs
npm start            # → http://localhost:5177/
```

`npm start` boots the QNS service **and** supervises the app under test (Comparinator, served at `http://localhost:4173/`). Stop/start the target from the cockpit's Run Controls to watch availability change for real. Everything you run is stored locally in `data/` (never committed).

**Try it:** press **Nightly** in Run Controls for the full picture (about 3 minutes), or one of the **controlled proof** buttons to watch QNS catch a deliberately injected defect.

### Claude chat (optional)

The **Ask Claude** button in the header — and the AI agent icon on any red or amber node — opens a chat with Claude about QNS, a run or a specific issue. It runs [Claude Code](https://claude.com/claude-code) on your machine with **your own** Claude login, so install it and run `claude` once to sign in. Everything else in QNS works without it.

Claude can read the code, evidence and test results, and run the test suite, but it cannot edit anything on its own: code changes come back as a diff with an **Apply change** button. Apply backs the file up first (Undo restores it) and reruns the failed checks. The chat only answers requests from your own machine.

### Configuration

Defaults suit the repo layout. To point QNS at another copy of the app or design system, or change ports, copy `qns.config.example.json` to `qns.config.json` (gitignored) and edit it — or set the matching environment variable:

| Setting | Env var | Default |
| --- | --- | --- |
| `appPath` | `QNS_APP_PATH` | `comparinator` |
| `designSystemDir` | `QNS_DESIGN_SYSTEM_DIR` | `design-system` |
| `host` | `QNS_HOST` | `127.0.0.1` (this machine only; `::` = every network interface) |
| `port` | `QNS_PORT` | `5177` |
| `targetPort` | `QNS_TARGET_PORT` | `4173` |

Relative paths resolve against the repo root. **Note:** the cockpit has no login — anyone who can reach it can start runs and accept risk — so keep `host` at `127.0.0.1` unless you're on a network you trust.

## What is real

- **Real engine.** Every run launches headless Chromium via Playwright and drives the actual Comparinator UI. Nothing in the run history is simulated.
- **15 sensor agents** across the testing dimensions: availability, compare flow, comparison options, metric oracle, counters & guardrails, reset control, dark mode, localization (EN/DE), injection safety, keyboard access, axe-core scan, semantic runtime spider, performance timing, responsive layout, and the team's own external Playwright regression suite.
- **External suite integration.** The External Playwright Suite agent (`runExternalSuite` in `server/agents.mjs`) shells out to the team's independently authored suite in `comparinator/tests/` (320 tests across 15 spec files) as a real subprocess, reuses QNS's already-running target so no second server spins up, and ingests its actual JSON reporter output — a second, independent source of truth on top of QNS's own agents. It runs in Build Smoke, Nightly, and Release Gate, and shows up on the Living Map exactly like every other component. Build Smoke runs a fast 5-test `--grep` slice instead of the full suite (a passing slice never clears a failure the full suite found); Nightly and Release Gate always run the full suite. Release Gate and Nightly both run QNS's complete 15-agent roster — Build Smoke is the only deliberately-narrow cadence (3 agents + the 5-test slice).
- **4 controlled proof scenarios** (Blocked Action, Metric Proof, Reset Proof, Keyboard Proof) seed real defects into the page via init-script sabotage and prove QNS catches them. Proof runs are always labeled `controlled proof` — they never masquerade as live verification.
- **The brain** (`server/brain.mjs`) normalizes every agent result into the signal contract, clusters findings by component, compares against run history (new vs. inherited vs. flaky), estimates severity/confidence/risk, decides posture (GO / CONDITIONAL / NO-GO — app-wide: any component whose latest check fails keeps the app NO-GO until a rerun passes), escalates blockers and warnings to humans, and generates action requests, bug-ticket drafts, and governed Cody fix-request drafts (draft-only executor in v1).
- **Verification tracking.** Rerunning a failed check from an action request marks it `verified-fixed` when the newer run passes; newer builds supersede stale recommendations.

## The cockpit

- **Living system map** — the design system's own canvas map engine (`ui/js/map2d.js`, ported from the QNS Design System reference) is the fixed central anchor: app under test, sensor agents, and runtime env feed the orchestrator core, which drives evidence memory, human guidance, the release gate, and the bug/fix path. Live SSE events route real pulses along the nerves; posture recolors the release gate only (never a global wash). Click or arrow-key to select nodes, scroll to zoom, drag to pan, `F` / Fit map resets. The layout re-flows around the rails as they resize. `prefers-reduced-motion` gets the frozen long-exposure render.
- **9 movable panels** (release posture, active failure, run controls, selected node, agents, selected agent, run history, run details, status strip): drag between rails, reorder, collapse, resize rails; layout persists locally; Reset layout restores the default.
- **Ask Claude**: failing components turn red (amber for warnings) with an AI agent icon that opens a chat about that issue; the header's Ask Claude button opens a general chat.
- **NO-GO guided investigation**: posture change → briefing (what ran, when, build, env) → failed check in plain language → evidence → risk/impact/recommendation/verification plan → actions (bug draft, fix request, rerun, accept risk, dismiss).

## Layout

| Path | What |
| --- | --- |
| `server/server.mjs` | HTTP service: cockpit host, API, SSE stream, target supervisor |
| `server/engine.mjs` | Run orchestration: queue → Playwright execution → evidence → brain |
| `server/agents.mjs` | The 15 sensor agents + 4 sabotage injectors |
| `server/brain.mjs` | Normalize · cluster · history compare · decide · drafts · supersession |
| `server/catalog.mjs` | Contracts: signal model, agent catalog, proofs, map nodes |
| `server/store.mjs` | Evidence memory: JSON persistence + `data/evidence/<run>/` |
| `server/issues.mjs` | Open issues per component + the app-wide release posture |
| `server/chat.mjs` | Claude chat: Claude Code sessions, proposals, Apply/Undo, rerun |
| `server/config.mjs` | Paths and ports (env vars → `qns.config.json` → defaults) |
| `ui/` | Zero-build cockpit (design-system tokens, canvas map) |
| `.claude/` | Claude Code subagents + skill for testing Comparinator (a11y, i18n, security, …) |
| `comparinator/` | The app under test: `comparinator.html`, its Playwright suite (`tests/`), requirements and agent reports |
| `design-system/` | The QNS Design System tokens, component CSS and icons the cockpit loads |
| `scripts/setup.mjs` | `npm run setup` |
| `data/` | Run history, decisions, artifacts, evidence, chats (created at runtime, gitignored) |
